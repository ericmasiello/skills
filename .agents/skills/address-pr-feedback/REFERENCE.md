# PR/MR feedback API reference

Exact commands for fetching, replying to, and resolving review comments. The
high-level `gh pr` / `glab mr` subcommands don't expose inline review-thread
resolution — use these directly.

## GitHub (`gh`)

### Fetch inline review threads (with resolved status)

`isResolved` and thread IDs are GraphQL-only; REST does not expose them.

```bash
gh api graphql -f query='
query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviewThreads(first:100){
        nodes{
          id
          isResolved
          path
          line
          comments(first:100){
            nodes{ databaseId body author{login} createdAt }
          }
        }
      }
    }
  }
}' -f owner="$OWNER" -f repo="$REPO" -F pr="$PR_NUMBER"
```

- `id` (e.g. `PRRT_...`) — the **thread** node ID, needed only for resolving.
- `comments.nodes[].databaseId` — the numeric **comment** ID, needed for replying.
- Paginate with `reviewThreads(first:100, after:$cursor)` if a PR has >100 threads.

### Fetch top-level (non-inline) PR comments

```bash
gh api repos/$OWNER/$REPO/issues/$PR_NUMBER/comments
```

These share GitHub's issue-comment endpoint. They have **no thread/resolve
mechanism** — reply-only.

### Reply to an inline review comment

Must target the **top-level** comment's `databaseId` (not a reply's ID —
replying to a reply 404s):

```bash
gh api repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments/$COMMENT_DATABASE_ID/replies \
  -X POST -f body="..."
```

### Reply to a top-level PR comment

```bash
gh pr comment $PR_NUMBER --body "..."
# or: gh api repos/$OWNER/$REPO/issues/$PR_NUMBER/comments -X POST -f body="..."
```

### Resolve / unresolve a review thread

Takes the **thread** node ID from the fetch query above, not a comment ID:

```bash
gh api graphql -f query='
mutation($threadId:ID!){
  resolveReviewThread(input:{threadId:$threadId}){ thread{ id isResolved } }
}' -f threadId="$THREAD_ID"
```

Swap in `unresolveReviewThread` for the reverse.

### Gotchas

- A review comment's `databaseId` ≠ its `node_id` ≠ the thread's `id` — three
  different identifiers, don't mix them up.
- Replying to a reply is unsupported — `/replies` only accepts a top-level
  review comment's `databaseId`.
- Resolving a thread requires write access to the repo.
- Top-level (issue-style) PR comments can never be "resolved" — only replied to.

## GitLab (`glab`)

### Fetch all discussions

```bash
glab api "projects/:id/merge_requests/$MR_IID/discussions?per_page=100"
```

Each discussion: `id` (needed for replies/resolve), `individual_note` (`true` =
plain top-level note, not resolvable), `notes[]` with `body`, `author`,
`resolvable`, `resolved`, and `position` (present only on inline/diff notes).

### Determine resolved status

Check `notes[0].resolved`, not a discussion-level field — the aggregate
`resolved` field is unreliable across GitLab versions and absent entirely on
non-resolvable discussions.

### Reply to a discussion (inline or top-level)

```bash
glab api --method POST "projects/:id/merge_requests/$MR_IID/discussions/$DISCUSSION_ID/notes" \
  -f body="..."
```

### Post a brand-new top-level MR comment

```bash
glab mr note $MR_IID --message "..."
```

Creates a new `individual_note` discussion — not resolvable.

### Resolve / unresolve a discussion

Only works when `resolvable: true` on the discussion's notes (inline diff
discussions); has no effect on plain `individual_note` discussions:

```bash
glab api --method PUT "projects/:id/merge_requests/$MR_IID/discussions/$DISCUSSION_ID" -f resolved=true
```

Use `resolved=false` to unresolve.

### Gotchas

- `:id` is the project ID or URL-encoded path (`owner%2Frepo`); `$MR_IID` is the
  merge request's **internal** ID (the number shown in the UI), not its global
  ID.
- A plain top-level note (`individual_note: true`) can be replied to but never
  resolved — same limitation as GitHub's issue-level comments.
