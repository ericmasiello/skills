---
name: podcast
description: Turn a document into a two-host conversational podcast MP3 with neural TTS, then shorten it, swap the voices, or pull one section out as its own episode.
argument-hint: "Confluence page, URL, file path, or pasted text"
disable-model-invocation: true
---

# Podcast

Turn a source document into an episode of two hosts walking it end to end in conversation, synthesized with `edge-tts` and joined with `ffmpeg`. The episode is faithful. It renders the source and adds no claims of its own.

Work in `<tmp>/podcast-<slug>/`, under the session's temp directory. The script, segments and intermediate audio stay there and never go into a repo. Follow-ups reuse the same directory.

| Request | Steps |
|---------|-------|
| New episode (document is the default source) | 1 to 6 |
| One section as its own episode | 1 for that section only, then 2 to 6 |
| Shorten, or "a 10-minute version" | 3 to the new target length, then 4 to 6 |
| Swap the voices | 4 with other voices ([`voices.md`](voices.md)), then 5 and 6. The script stays as it is |
| Synthesis stopped partway | 4 again. It resumes |

## 1. Get the source as markdown

**Confluence page (the usual case).** Run `twg whoami` first. If it fails, `twg login` is interactive, so hand that step to the user. Then:

```bash
twg confluence page get <id-or-url> --detail full --format md --body-only --output-file <work>/source.md -o json
```

`--output-file` writes the body as clean markdown. Stdout carries a warning line and a JSON envelope, so read the file, not stdout. To get one section, add `--section "<heading>"` (repeatable). `--detail outline` lists the headings.

Other sources:

- **Another URL**: fetch it as markdown and save it to `<work>/source.md`.
- **Local markdown file**: read it in place.
- **Pasted text**: save it to `<work>/source.md` unchanged.

Done when you have the whole body, ending at the source's last section. Macros come through as placeholders such as "media". Note any diagram the text depends on, so the script can describe it from the surrounding prose.

## 2. Read the whole source

Read every line. Write down for yourself:

- **The spine**: the argument in three to five beats. The episode opens with it as "the short version".
- **Jargon**: each term a listener needs to have unpacked inline on first use.
- **Enumerations**: every table and long list, each to be narrated in groups.
- **Status**: every "draft", "examples only", "TBD" or "proposal". The hosts say each one out loud.

Done when every section of the source maps to a beat of the spine.

## 3. Write the script

Read [`script.md`](script.md) before writing. It has the module shape, the narration craft, the spoken-text rules and the length rule. Write `<work>/podcast_script.py` with `SCRIPT = [("A" | "B", text), ...]` and `CHAPTERS = [(turn_index, "Title"), ...]`.

Write every number, symbol and letter-digit code as the words a host would say: "R two", "p ninety five", "two hundred dollars". The synthesizer refuses any turn that contains a digit or `$ % & @ #`.

Done when every beat of the spine is covered (or cut to fit the target length, and the cut is said out loud), the critique close takes roughly the last tenth, and `CHAPTERS` starts at turn 0.

## 4. Synthesize

```bash
uv run <skill-dir>/synthesize.py <work>/podcast_script.py --out <work>/episode.mp3 --title "<Episode title>"
```

`uv` installs `edge-tts` from the script's inline metadata. Each turn takes a few seconds and a 30-minute episode is 150+ turns, so run long episodes in the background. Defaults are `en-US-AndrewNeural` at `-4%` for A and `en-US-AvaNeural` at `-3%` for B. Override them with `--voice-a`, `--voice-b`, `--rate-a=` and `--rate-b=` (see [`voices.md`](voices.md)).

`edge-tts` rate-limits hard, so `synthesize.py` is built to finish anyway. Keep these properties if you change it or write a replacement:

- **Sequential**: one request at a time. Parallel synthesis fails over and over.
- **Retry**: every exception, `NoAudioReceived` most of all, gets another attempt, up to 8 per turn, sleeping `3 + attempt * 3` seconds between them. A segment under 2KB counts as a failed write and is retried too.
- **Resume**: a segment already on disk and over 2KB is reused. Segment files are named by a hash of speaker, text, voice and rate. Rerunning after a failure picks up where it stopped. After a script edit, only the changed turns are synthesized again, and swapping voices synthesizes every turn again.

If it exits with "Gave up on a segment", run the same command again.

After synthesis it puts a 0.32s gap between turns, joins everything into one 128k mono MP3 at 44.1kHz, measures each segment with `ffprobe`, and embeds the chapters at their real timestamps.

Done when it prints the chapter map and `ALL DONE`.

## 5. Deliver

Copy the episode to `~/Downloads/<Title>-podcast.mp3` and open it in the user's file panel (`file.open` in OpenChamber).

Done when the file is in `~/Downloads` and open.

## 6. Report

Give the path, the duration, the size (about 1MB per minute, so a 30-minute episode is about 28MB), the turn count, the voices, and the chapter map with timestamps exactly as `synthesize.py` printed it.
