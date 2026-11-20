# Voices

`synthesize.py` defaults to the pair used for the reference episode. Choose two voices that are clearly different, usually one male and one female, so the listener can tell the hosts apart without names.

| Host | Voice | Rate |
|------|-------|------|
| A (default) | `en-US-AndrewNeural` | `-4%` |
| B (default) | `en-US-AvaNeural` | `-3%` |
| Alternate | `en-US-BrianNeural`, `en-US-EmmaNeural` | `-3%` |
| Alternate (British) | `en-GB-RyanNeural`, `en-GB-SoniaNeural` | `-3%` |

The voice list tags both defaults and the US alternates `Conversation`. Pick other voices with that tag too. A rate of `-3%` to `-4%` worked on the reference episode.

Write a rate with `=`, as in `--rate-a=-3%`. Without the `=`, argparse reads the leading `-` as a new flag.

To swap the hosts:

```bash
uv run <skill-dir>/synthesize.py <work>/podcast_script.py --out <work>/episode.mp3 \
  --voice-a en-US-AvaNeural --rate-a=-3% --voice-b en-US-AndrewNeural --rate-b=-4%
```

Each segment is keyed on its voice, so every turn is synthesized again.

To see every voice: `uvx edge-tts --list-voices`.
