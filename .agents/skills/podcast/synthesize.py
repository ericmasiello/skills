# /// script
# requires-python = ">=3.10"
# dependencies = ["edge-tts"]
# ///
"""Synthesize a two-host podcast script to one MP3 with a chapter map.

    uv run synthesize.py <podcast_script.py> --out <episode.mp3>

The script module defines SCRIPT = [("A" | "B", text), ...] and, optionally,
CHAPTERS = [(turn_index, "Title"), ...]. Segments and the gap are written
next to the script, so rerunning the same command resumes a failed run.
"""

import argparse
import asyncio
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

MIN_SEGMENT_BYTES = 2000
ATTEMPTS = 8
GAP_SECONDS = 0.32
UNSPOKEN = re.compile(r"[0-9$%&@#]")


def load_script(path: Path):
    spec = importlib.util.spec_from_file_location("podcast_script", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SCRIPT, getattr(module, "CHAPTERS", [(0, "Episode")])


def check_script(script, chapters):
    problems = []
    for i, turn in enumerate(script):
        speaker, text = turn
        if speaker not in ("A", "B"):
            problems.append(f"turn {i}: speaker {speaker!r} is not 'A' or 'B'")
        for match in UNSPOKEN.finditer(text):
            start = max(match.start() - 20, 0)
            problems.append(f"turn {i}: write {match.group()!r} as spoken words: ...{text[start:match.end() + 20]}...")
    for index, title in chapters:
        if not 0 <= index < len(script):
            problems.append(f"chapter {title!r}: turn {index} is out of range")
    if problems:
        sys.exit("Fix the script before synthesizing:\n  " + "\n  ".join(problems))


def segment_path(segments: Path, speaker, text, voice, rate) -> Path:
    key = hashlib.sha1(json.dumps([speaker, text, voice, rate]).encode()).hexdigest()[:16]
    return segments / f"{key}.mp3"


def is_written(path: Path) -> bool:
    return path.exists() and path.stat().st_size > MIN_SEGMENT_BYTES


async def synthesize(jobs):
    import edge_tts

    missing = [job for job in jobs if not is_written(job[0])]
    print(f"{len(jobs) - len(missing)} of {len(jobs)} segments on disk, {len(missing)} to synthesize", flush=True)
    for done, (path, text, voice, rate) in enumerate(missing, 1):
        for attempt in range(ATTEMPTS):
            try:
                await edge_tts.Communicate(text, voice, rate=rate).save(str(path))
                if is_written(path):
                    print(f"ok {done}/{len(missing)}", flush=True)
                    break
                print(f"retry {done}: segment under {MIN_SEGMENT_BYTES} bytes", flush=True)
            except Exception as error:
                print(f"retry {done}: {type(error).__name__}", flush=True)
            await asyncio.sleep(3 + attempt * 3)
        else:
            sys.exit(f"Gave up on a segment after {ATTEMPTS} attempts. Rerun the same command to resume.")


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout)


def timestamp(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    return f"{minutes // 60}:{minutes % 60:02d}:{secs:02d}" if minutes >= 60 else f"{minutes}:{secs:02d}"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("script", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--title", help="ID3 title; defaults to the output file name")
    parser.add_argument("--voice-a", default="en-US-AndrewNeural")
    parser.add_argument("--voice-b", default="en-US-AvaNeural")
    parser.add_argument("--rate-a", default="-4%")
    parser.add_argument("--rate-b", default="-3%")
    args = parser.parse_args()

    script, chapters = load_script(args.script)
    check_script(script, chapters)

    work = args.script.resolve().parent
    segments = work / "segments"
    segments.mkdir(exist_ok=True)
    voices = {"A": (args.voice_a, args.rate_a), "B": (args.voice_b, args.rate_b)}
    jobs = []
    for speaker, text in script:
        voice, rate = voices[speaker]
        jobs.append((segment_path(segments, speaker, text, voice, rate), text, voice, rate))

    asyncio.run(synthesize(jobs))

    gap = work / "gap.mp3"
    if not gap.exists():
        ffmpeg("-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(GAP_SECONDS),
               "-c:a", "libmp3lame", "-b:a", "48k", str(gap))
    gap_seconds = duration(gap)

    starts, clock = [], 0.0
    for path, *_ in jobs:
        starts.append(clock)
        clock += duration(path) + gap_seconds
    total = clock - gap_seconds

    concat = work / "concat.txt"
    lines = []
    for i, (path, *_) in enumerate(jobs):
        lines.append(f"file '{path}'")
        if i < len(jobs) - 1:
            lines.append(f"file '{gap}'")
    concat.write_text("\n".join(lines) + "\n")

    title = args.title or args.out.stem
    meta = [";FFMETADATA1", f"title={title}"]
    bounds = sorted(chapters) + [(len(script), None)]
    for (index, name), (next_index, _) in zip(bounds, bounds[1:]):
        end = starts[next_index] if next_index < len(script) else total
        meta += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(starts[index] * 1000)}",
                 f"END={int(end * 1000)}", f"title={name}"]
    metadata = work / "chapters.txt"
    metadata.write_text("\n".join(meta) + "\n")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg("-f", "concat", "-safe", "0", "-i", str(concat), "-i", str(metadata),
           "-map", "0:a", "-map_metadata", "1", "-map_chapters", "1",
           "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", "-ac", "1", str(args.out))

    size_mb = args.out.stat().st_size / 1_000_000
    print(f"\n{args.out}\n{timestamp(total)} · {size_mb:.1f} MB · {len(script)} turns\n\nChapters:")
    for index, name in sorted(chapters):
        print(f"  {timestamp(starts[index])}  {name}")
    print("ALL DONE")


if __name__ == "__main__":
    main()
