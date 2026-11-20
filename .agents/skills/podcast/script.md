# Writing the script

How to turn a source into a script that sounds like two people talking, not like a document read aloud. Every run that writes or rewrites a script reads this.

## Module shape

```python
SCRIPT = [
    ("A", "This is a walkthrough of a Confluence page that is currently a draft for review. ..."),
    ("B", "Author is Pedro Santos, reviewers Eric Masiello and Thiago Prohaska. ..."),
    # ...
    ("A", "Thanks for listening."),
]

CHAPTERS = [
    (0, "Introduction and the short version"),
    (9, "Context: the coverage uplift beta"),
    # ...
    (154, "What a reviewer should push on"),
]
```

`CHAPTERS` holds `(turn_index, title)` pairs. Start a chapter at the turn that opens each beat of the spine. Section headings in the source are usually the right cut, and the critique close always gets its own chapter.

## Two hosts

Two hosts let each turn do one job: introduce, unpack, push back, or transition. Alternate A and B, and keep turns to one to three sentences, about 27 words on average. When one host has a long run of facts, the other breaks it up by reacting, asking, or adding the next item.

- Open with what the source is, who wrote it, and its status ("a draft for review"). Then give the short version, the spine in a few turns, so the listener knows where the episode is going.
- Signpost each section as you enter it ("Section three. The evaluator. Start with the problem.").
- Unpack each piece of jargon inline the first time it appears, in a short appositive turn: "EARS being Easy Approach to Requirements Syntax. The point is a constrained sentence pattern, so the requirement can't be vague." After that, use the term on its own.

## Tables and long lists

A table doesn't survive being read aloud as a table. Narrate it as a sequence, one item per turn or two, with the jargon in each row unpacked as it comes up.

For a long enumeration, say you're splitting it: "Let's take them in groups, because reading twelve table rows aloud is not a good time for anyone." Then take groups of three or four, with a one-line reset between groups ("Then the vetoes that protect the tests themselves."). Close with a tally ("So twelve checks: five vetoes, six scored, one advisory.").

## Editorialize

The hosts react, and that reaction is what makes it a podcast rather than a summary. Flag what the source does well or subtly: "that's the subtle one", "my favourite rule", "that's a design constraint disguised as a caveat", "which is the whole philosophy in one line". Each comment is about the source's own design and is grounded in what it says. It adds no outside facts.

## Faithful

The script renders the source and makes no new claims about it.

- Say every status marker out loud where it applies: "the page flags these as examples only, to be determined", "weights and thresholds are explicitly a proposal for calibration".
- Use names, figures and terms as the source gives them.
- When the length target forces a cut, say what was cut: "The page lists twelve attributes; we'll take the four that change the design."

## Critique close

Spend roughly the last tenth of the runtime on what a reviewer should push on: open questions, hidden costs, the assumptions everything else rests on. Draw each point from the source itself (its caveats, its numbers, how its rules interact). Then give the one idea to take away, restate the spine in a sentence, repeat the status and who to send comments to, and sign off.

## Spoken text

The TTS reads exactly what you write, so write every number, symbol and code as the words a host would say. `synthesize.py` refuses a turn that contains a digit or `$ % & @ #`.

| Source | Write |
|--------|-------|
| 248 candidates | two hundred and forty eight candidates |
| 50%, 99.9% | fifty percent, ninety nine point nine percent |
| $200 | two hundred dollars |
| R2, k6, C1–C7, F01 | R two, k six, C one through C seven, F zero one |
| p95 < 200ms | p ninety five under two hundred milliseconds |
| 503, 404 | five oh three, four oh four |
| Section 2.3, WCAG 2.2 AA | section two point three, WCAG two point two double A |
| ERICRULEZ-275 | ERICRULEZ two seventy five |
| SLO, UX | S L O, U X (spaced, when the letters are spoken one by one) |
| `#wg-ee-testing` | the Slack channel WG, E, E, testing |
| `stokowski-<project>` | stokowski, dash, project name |
| a file path or code identifier | what it is ("a contract test path", "a dependency-cruiser config") |

Leave word-like and common acronyms as they are (API, CI, YAML, ADR). Spell out a symbol only when the listener needs to hear it ("dash", "slash", "colon"), and drop the rest.

## Length

The reference episode turned a source of about 2,800 words into 161 turns, about 4,300 spoken words and 31 minutes.

- Speaking rate is about 140 spoken words per minute, including the gaps between turns, or about 5 turns per minute.
- A full walkthrough runs about 1.5 spoken words per source word.
- A target length needs `minutes × 140` spoken words. A 10-minute version is about 1,400 words, or 50 turns.

A target shorter than the full walkthrough keeps the open, the spine, each section's main point and the critique close (still about the last tenth). It cuts enumerations to a headline and one example each, and it says out loud what it skipped.

## Follow-ups

- To shorten ("make it 10 minutes"), rewrite `podcast_script.py` to the new target. Edit it in place rather than starting from scratch, so the turns you keep reuse their synthesized segments.
- For one section as its own episode, the source is that section only. Open by saying what the section belongs to ("This is section four of a page on test quality, ..."), give that section's short version, and close with a critique of that section.
