---
description: Studio Validate Code
model: cimpress-ai-gateway/@Anthropic/eu.anthropic.claude-haiku-4-5-20251001-v1:0
---
Run the following script:

```bash
pnpm lint &
pid1=$!
pnpm typecheck &
pid2=$!
pnpm test &
pid3=$!

failed=0
wait $pid1 || failed=1
wait $pid2 || failed=1
wait $pid3 || failed=1
exit $failed
```
