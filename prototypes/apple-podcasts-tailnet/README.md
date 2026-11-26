# PROTOTYPE: Apple Podcasts on a tailnet-only feed

Throwaway. Never merged. It answers one question on the podfeed map: [Does Apple Podcasts play a tailnet-only feed from the NAS?](https://github.com/ericmasiello/skills/issues/122) It is not the real `podfeed-nas` stack.

The smallest stack that answers it: a `tailscale/tailscale` sidecar running **Serve** (not Funnel) on 443, and `nginx:alpine` in its network namespace, serving the `podcast` share read-only. A hand-written feed with `<itunes:block>Yes</itunes:block>`, a 20-minute episode (19 MB, a voice reads the time every 15 seconds so seeking is easy to check), and a 3-minute second episode to add mid-test.

| Path | What it is |
| --- | --- |
| `stack/compose.yaml` | The two containers. nginx mounts `PODCAST_DIR` (default `/volume1/podcast`) at `:ro`. |
| `stack/ts-config/serve.json` | Serve on 443, proxying to nginx on `127.0.0.1:8080`. No `AllowFunnel`. |
| `stack/nginx/default.conf` | Byte ranges, `audio/mpeg` and `application/rss+xml`, no listing, 404 for dot-paths, `@eaDir`, `#recycle`. The access log records the device's tailnet IP, the Tailscale user and the user agent. |
| `feeds/*.xml` | The hand-written feed, in parts. `publish` joins them and fills in the host, sizes, durations and dates. |
| `proto.sh` | One subcommand per step below. It prints every NAS command before running it. `DRY=1 ./proto.sh <cmd>` prints without running. |
| `proto.env.example` | Copy to `proto.env` (gitignored). Holds the NAS SSH target and the machine and feed names, no secret. |

Marks: **[local]** runs only on the Mac. **[SSH]** connects to the NAS as your DSM user, no sudo. **[SSH, root]** asks for your DSM password for `sudo` once. **[GUI]** is a click in DSM or the Tailscale admin console. **[iPhone]** is on the phone.

## 0. Before you start (one-time)

1. **[GUI, DSM admin]** If the `podcast` shared folder doesn't exist yet: Control Panel → Shared Folder → Create, name `podcast` on Volume 1, **untick** "Enable Recycle Bin", give your account Read/Write. Don't add it to Indexing Service. The real stack uses this share too.
2. **[GUI, Tailscale admin]** Access controls, add a throwaway tag and one grant (merge into the existing `tagOwners` and `grants`):

   ```json
   "tagOwners": { "tag:podfeed-proto": ["autogroup:admin"] },
   "grants": [
     { "src": ["autogroup:member"], "dst": ["tag:podfeed-proto"], "ip": ["tcp:443"] }
   ]
   ```

   MagicDNS and HTTPS certificates are already on (skylight uses them).
3. **[GUI, Tailscale admin]** Settings → Keys → Generate auth key: Reusable **off**, Ephemeral **off**, Tags `tag:podfeed-proto`. Keep the page open; `authkey` asks for it next.
4. **[local]** `cp proto.env.example proto.env` and fill in `NAS`, `TS_HOSTNAME` (dull: it lands in public certificate logs) and `FEED_HOST`.

## 1. Stand it up

| # | Command | Mark | What it does |
| --- | --- | --- | --- |
| 1 | `./proto.sh build` | local | Makes `out/`: `ep1.mp3` (20 min), `ep2.mp3` (3 min), a placeholder `cover.png` and `t.txt`. About 90 s, using `say` and `ffmpeg`. |
| 2 | `./proto.sh stack` | SSH | Copies `stack/` to `/volume1/docker/podfeed-proto` and writes its `.env` (just `PODCAST_DIR`). |
| 3 | `./proto.sh authkey` | SSH | Hidden prompt for the auth key. Writes `TS_AUTHKEY` and `TS_HOSTNAME` to `/volume1/docker/secrets/podfeed-proto/ts.env` (folder 700, file 600) over SSH stdin. Nothing touches the Mac's disk. |
| 4 | `./proto.sh publish empty` | SSH | Pushes `t.txt` and a feed with **no items** into the share, each as `.name.part`, `chmod 644`, then `mv` over the real name. |
| 5 | `./proto.sh up` | **SSH, root** | `sudo docker compose pull` and `up -d`, then shows `ps` and the sidecar's log. Check the machine appears in the admin console with `tag:podfeed-proto`. |
| 6 | `./proto.sh check` | local, tailnet | From this Mac over the tailnet: `feed.xml` is 200 `application/rss+xml`; `/`, dot-paths, `@eaDir`, `#recycle` are refused. The first request can take ~20 s while Serve gets its certificate. Re-run after step 8 for the MP3 checks (`audio/mpeg`, `Range: bytes=0-1` → 206 with the right total) and a timed download from the Mac. |
| 7 | `./proto.sh nas-checks` | **SSH, root** | The NAS permission checks below. |

**NAS checks** (`nas-checks` prints PASS or FAIL for each):

- **A.** UID 101 reads through the share root: `docker run --rm -u 101:101 -v /volume1/podcast:/srv:ro alpine cat /srv/t.txt` prints `ok`.
- **B.** `:ro` is enforced: `touch` in a fresh container, as root, fails with "Read-only file system".
- **C.** The same `touch` inside the running nginx container fails.
- **D.** `docker inspect` shows `RW=false` on both nginx mounts.
- **E.** nginx workers run as `nginx` (UID 101).
- Also printed: the share root's mode and Synology ACL (`synoacltool -get`), whether the push's `chmod 644` left `t.txt` in "Linux mode", and whether `#recycle` or `@eaDir` appeared.

**If A fails:** the stack mounts a `chmod 755` subfolder instead.
`ssh <NAS> 'mkdir -p /volume1/podcast/public && chmod 755 /volume1/podcast/public'` **[SSH]**, set `PODCAST_DIR=/volume1/podcast/public` in `proto.env`, then re-run `stack`, `publish empty`, `up` and `nas-checks`.

## 2. On the iPhone: Wi-Fi off, Tailscale on

Keep a second terminal on `./proto.sh logs -f` **[SSH, root]** the whole time. Each line shows the time, status, request, `Range`, `rt=` (seconds nginx spent on the response), `client=` (the device's tailnet IP), `user=` and `ua=`.

1. **Follow.** [iPhone] Podcasts → Library → ⋯ → Follow a Show by URL → `https://<FEED_HOST>/feed.xml`. Note whether it subscribes to the **empty** feed or errors, and the exact message.
   Then `./proto.sh publish 1` **[SSH]**. In Podcasts, pull to refresh the show (or follow again if the empty follow failed). Does episode 1 appear?
2. **Download.** [iPhone] Download episode 1 and time it with a stopwatch. While it runs, `./proto.sh path <iphone-tailnet-name>` **[SSH, root]**: the iPhone's line in `tailscale status` says `direct <ip:port>` or `relay "<region>"`, and `tailscale ping` says `via <ip:port>` or `via DERP(<region>)`. Note which, and the `rt=` and `bytes=` of the MP3 lines in the log (Apple may fetch in several ranges).
3. **Seek.** [iPhone] Play it. Skip forward and back, and drag the scrubber to around 12:00. The voice should read the time you landed near.
4. **New episode.** `./proto.sh publish 2` **[SSH]** prints the swap time. First leave the app alone and watch the log for a `GET /feed.xml` from the phone: does episode 2 show up on its own, and after how long? (Give it up to an hour, or longer if you're patient. The log's feed fetches also show how often the app polls.) Then pull to refresh and note how long that takes.
5. **Offline.** [iPhone] Turn Tailscale off. Pull to refresh: it should fail, since the feed is tailnet-only. The downloaded episode should still play.
6. **Who fetched.** `./proto.sh logs` **[SSH, root]**. List the user agents and `client=` IPs that fetched `feed.xml`, `cover.png` and the MP3s. Was it only the phone (and this Mac's `check`)?
   **Limit:** the log only sees tailnet devices. If Apple's servers tried the hand-added URL, they couldn't reach it, so they never reach nginx and leave no line. A log with only the phone shows Apple's servers didn't fetch through the tailnet. It can't show they never tried.

## 3. Report back

Copy this, fill it in, and **redact** device names, IPs, the tailnet and the machine name. The answer goes in a public issue.

```text
NAS checks:  A ___  B ___  C ___  D ___  E ___  (share root mode/ACL: ___; t.txt Linux mode: ___; #recycle/@eaDir: ___)
check (Mac): pass/fail ___; Mac download of ep1: ___ s
1 Follow:    empty feed ___; with ep1 ___
2 Download:  ___ s for 19 MB; direct / DERP (region ___); MP3 requests in log: ___
3 Seek:      ___
4 New ep:    on its own ___ (after ___ min, or not within ___); pull-to-refresh ___ s; app polled feed.xml every ___
5 Offline:   feed fails ___; episode plays ___
6 Log:       user agents ___; anything besides the phone and the Mac ___
Notes:       ___
```

## 4. Teardown

| # | Command | Mark | What it does |
| --- | --- | --- | --- |
| 1 | [iPhone] Show → ⋯ → Unfollow; remove the download | iPhone | |
| 2 | `./proto.sh down` | **SSH, root** | `docker compose down`, deletes `/volume1/docker/podfeed-proto` (including `ts-state`), removes the three pinned images (skips any still in use). |
| 3 | `./proto.sh clean` | SSH | Deletes `feed.xml`, `ep1.mp3`, `ep2.mp3`, `cover.png`, `t.txt` from the share and the `secrets/podfeed-proto` folder. SSH `rm` bypasses the Recycle Bin. The `podcast` share itself stays for the real stack. |
| 4 | Tailscale admin console | GUI | Machines: remove the prototype machine. Access controls: remove `tag:podfeed-proto` and its grant. Keys: revoke the auth key if it's still listed. |
| 5 | `rm -rf out proto.env` | local | The generated media and your local settings. |
| 6 | If you made `/volume1/podcast/public` for the fallback, `ssh <NAS> 'rm -rf /volume1/podcast/public'` | SSH | |

The machine name stays in public Certificate Transparency logs; that's why it's dull.
