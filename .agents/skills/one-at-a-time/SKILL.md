---
name: one-at-a-time
description: 'Answer one question at a time from a queue: research in a background agent, reply with the question, a short answer, and "Question N of M". Invoke with /one-at-a-time; stays on until "stop one-at-a-time".'
disable-model-invocation: true
---

# one-at-a-time

The reader is working through a large body of text and asking questions as they go. Every reply holds one question and its short answer, so the reader always knows what is being discussed.

## Persistence

These rules apply to every response for the rest of the session, whatever the topic. Turn them off only when the reader says "stop one-at-a-time" or "normal mode"; confirm in one line, then return to your default style.

## The queue

Every question the reader asks becomes a queue item. Hold the queue in your task tool if the harness has one, otherwise in your own context. The reader sees it only when they ask ("show queue" lists the remaining items, one line each).

Place each new question:

- **Group**: questions in one message about the same subject merge into one item, answered together.
- **Follow-up**: a question that needs the current answer to make sense goes to the head of the queue, in the order asked.
- **Unrelated**: everything else goes to the back.

A message mixing both kinds splits: follow-ups to the head, unrelated to the back.

## Loop

Only a reader message starts a pass. A background agent finishing is not a reader message: it produces no reply.

Each reader message is one pass:

1. Place any new questions in the queue.
2. Take the head item. The reader's "next" or "continue" adds nothing to the queue and just takes the head.
3. Get its result. If a **prefetched** result for the head item is valid, use it with no wait. Otherwise dispatch a background agent to research it and wait. All reading and searching happens in background agents; the main thread stays free of it.
4. Dispatch a background agent for the new head of the queue (the item after the one you are answering) and do not wait for it. It runs while the reader reads and responds.
5. Reply in the shape below, then stop. The reader decides what comes next: follow-ups jump the queue, "next" resumes it.

Each background agent starts with fresh context. Give it the question, where the source text lives (path, URL, or the pasted excerpt), and the ask: answer in at most three sentences, cite the file, line, or URL each claim rests on.

Questions that arrive while an agent works are placed in the queue and wait for the next pass.

## Prefetch

One item ahead is always researching, so the next "next" lands instantly. A prefetched result belongs to its item, not to a queue position.

A prefetched result is **held**: a cache, never a reply. When its agent finishes, store the result and end the turn silently, with no text and no new dispatch. The item reaches the screen only when the reader's message takes it as head. The reader may take minutes or never ask; the queue stays parked until they do.

A prefetched result stays **valid** until something the reader says could change its answer: a correction to the source or premise, a narrowed or reworded question, a group merge, or an answer on screen that the item depends on. When that happens, discard the result, dispatch fresh research for the item, and wait for it; the reader accepts a block here.

A follow-up that jumps to the head does not invalidate an unrelated prefetched result. Research the follow-up (wait), then use the prefetched result for the item after it.

## Reply shape

```
**Q:** <the question in one line>

<the answer>

Question N of M
```

- **Answer**: the answer first, one to three sentences. A command, path, or snippet leads when the answer is one.
- **Footer**: `Question N of M` is the last line of every reply. N is the ordinal of the item on screen. M is every item asked so far: answered, on screen, and queued. Follow-ups and new questions raise M.
- **Nothing else**: the reply is the question, the answer, and the footer.

## More detail

"More", "expand", or "why" on the item on screen is the same item, not a new question. Resume the same background agent for the fuller answer, reply in the same shape, and keep N and M unchanged. The prefetch already running for the next item continues undisturbed.

## Unclear questions

If a question is too ambiguous to research, reply with the question, one short clarifying question in place of the answer, and the footer. The item stays at the head, and N does not move.

## Pre-send check

Before sending, confirm:

1. The reply opens with `**Q:**`.
2. The last line is the footer.
3. The answer is three sentences or fewer, unless the reader asked for more.
4. The reader can tell from this reply alone what was asked and what the answer is.
