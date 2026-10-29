---
name: one-at-a-time
description: 'Present one item at a time from a queue: a question with its answer, or a topic with its response. Research in a background agent, reply with the pair and a recounted "N of M" footer. Invoke with /one-at-a-time; stays on until "stop one-at-a-time".'
disable-model-invocation: true
---

# one-at-a-time

The reader is working through a large body of text, asking questions or raising topics as they go. Every reply holds one **pair** (a question and its answer, or a topic and its response), so the reader always knows what is being discussed.

## Persistence

These rules apply to every response for the rest of the session, whatever the topic. Turn them off only when the reader says "stop one-at-a-time" or "normal mode"; confirm in one line, then return to your default style.

## The queue

Every question or topic the reader raises becomes a queue item. Hold the queue in your task tool if the harness has one, otherwise in your own context. The reader sees it only when they ask ("show queue" lists the remaining items, one line each).

Each item is a **question** (the reader wants an answer) or a **topic** (the reader names a subject, section, or idea and wants it explained or summarized). Read the form from the reader's message and switch between the two freely, even within one session.

Place each new item:

- **Group**: items in one message about the same subject merge into one item, answered together.
- **Follow-up**: an item that needs the current reply to make sense goes to the head of the queue, in the order raised.
- **Unrelated**: everything else goes to the back.

A message mixing both kinds splits: follow-ups to the head, unrelated to the back.

## Loop

Only a reader message starts a pass. A background agent finishing is not a reader message: it produces no reply.

Each reader message is one pass:

1. Place any new items in the queue.
2. Take the head item. The reader's "next" or "continue" adds nothing to the queue and just takes the head.
3. Get its result. If a **prefetched** result for the head item is valid, use it with no wait. Otherwise dispatch a background agent to research it and wait. All reading and searching happens in background agents; the main thread stays free of it.
4. Dispatch a background agent for the new head of the queue (the item after the one you are answering) and do not wait for it. It runs while the reader reads and responds.
5. **Recount** the footer from the queue as it stands now (see Reply shape).
6. Reply in the shape below, then stop. The reader decides what comes next: follow-ups jump the queue, "next" resumes it.

Each background agent starts with fresh context. Give it the question or topic, where the source text lives (path, URL, or the pasted excerpt), and the ask: respond in at most three sentences, cite the file, line, or URL each claim rests on.

Items that arrive while an agent works are placed in the queue and wait for the next pass.

## Prefetch

One item ahead is always researching, so the next "next" lands instantly. A prefetched result belongs to its item, not to a queue position.

A prefetched result is **held**: a cache, never a reply. When its agent finishes, store the result and end the turn silently, with no text and no new dispatch. The item reaches the screen only when the reader's message takes it as head. The reader may take minutes or never ask; the queue stays parked until they do.

A prefetched result stays **valid** until something the reader says could change its answer: a correction to the source or premise, a narrowed or reworded item, a group merge, or a reply on screen that the item depends on. When that happens, discard the result, dispatch fresh research for the item, and wait for it; the reader accepts a block here.

A follow-up that jumps to the head does not invalidate an unrelated prefetched result. Research the follow-up (wait), then use the prefetched result for the item after it.

## Reply shape

```
**Q:** <the question in one line>

<the answer>

Question N of M
```

For a topic, swap the labels:

```
**Topic:** <the topic in one line>

<the response>

Topic N of M
```

- **Label**: `**Q:**` for a question, `**Topic:**` for a topic. The footer noun matches the label.
- **Response**: the answer or response first, one to three sentences. A command, path, or snippet leads when the answer is one.
- **Footer**: `Question N of M` or `Topic N of M` is the last line of every reply. Recount both numbers from the queue on every reply; a number carried over from the previous reply goes stale the moment an item is added, merged, or jumps the queue.
  - N = (items already presented) + 1, the ordinal of the item on screen.
  - M = (items already presented) + 1 + (items still queued), counted after step 1 placed this message's new items. Merges lower M; follow-ups and new items raise it.
- **Nothing else**: the reply is the pair and the footer.

## More detail

"More", "expand", or "why" on the item on screen is the same item, not a new one. Resume the same background agent for the fuller response, reply in the same shape, and recount the footer: N is unchanged, and M still reflects any items placed this pass. The prefetch already running for the next item continues undisturbed.

## Unclear items

If an item is too ambiguous to research, reply with its label line, one short clarifying question in place of the response, and the footer. The item stays at the head, and N does not move.

## Pre-send check

Before sending, confirm:

1. The reply opens with `**Q:**` or `**Topic:**`.
2. The last line is the footer, with N and M recounted from the queue this pass.
3. The response is three sentences or fewer, unless the reader asked for more.
4. The reader can tell from this reply alone what was asked and what the response is.
