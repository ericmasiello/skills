#!/usr/bin/env bash
# PROTOTYPE, throwaway. Every step of README.md's checklist is one subcommand.
# Each NAS command is printed before it runs; DRY=1 prints without running.
# Runs on the Mac. Agents never run the NAS subcommands; Eric does.
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  cat <<'EOF'
usage: ./proto.sh <command>

  build              make out/: ep1.mp3, ep2.mp3, cover.png, t.txt    (local)
  stack              copy stack/ to the NAS                         [SSH]
  authkey            write the Tailscale auth key to the NAS        [SSH]
  publish empty|1|2  push episode files, then feed.xml              [SSH]
  up                 pull images and start the stack                [SSH, root]
  check              HTTP checks over the tailnet from this Mac     (tailnet)
  nas-checks         UID 101 read, :ro enforced, mounts, ACLs       [SSH, root]
  logs [-f]          nginx access log                               [SSH, root]
  path [peer]        tailscale status (and ping peer) in the sidecar [SSH, root]
  down               stop the stack, delete it and its images       [SSH, root]
  clean              delete the test files and the auth key file    [SSH]
EOF
}

[[ $# -ge 1 ]] || { usage; exit 1; }
[[ -f proto.env ]] || { echo "proto: no proto.env; run: cp proto.env.example proto.env, then fill it in" >&2; exit 1; }
# shellcheck source=/dev/null
. ./proto.env
: "${NAS:?set NAS in proto.env}" "${TS_HOSTNAME:?set TS_HOSTNAME in proto.env}" "${FEED_HOST:?set FEED_HOST in proto.env}"
PODCAST_DIR="${PODCAST_DIR:-/volume1/podcast}"
STACK_DIR=/volume1/docker/podfeed-proto
SECRETS_DIR=/volume1/docker/secrets/podfeed-proto
DOCKER=/usr/local/bin/docker            # sudo's PATH on DSM lacks /usr/local/bin
ALPINE=alpine:3.24.4
IMAGES="$ALPINE nginx:1.30.8-alpine tailscale/tailscale:v1.104.7"   # keep in step with stack/compose.yaml

# DSM's sshd predates post-quantum key exchange; OpenSSH 10.1+ warns on every call.
SSH_OPTS=()
command ssh -G -o WarnWeakCrypto=no localhost >/dev/null 2>&1 && SSH_OPTS+=(-o WarnWeakCrypto=no)
ssh_() { command ssh ${SSH_OPTS[@]+"${SSH_OPTS[@]}"} "$@"; }

show() { printf '\n\033[2m$ %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31mproto: %s\033[0m\n' "$*" >&2; exit 1; }

# nas CMD: runs CMD on the NAS as Eric, no terminal, no sudo.
nas() {
  show "ssh $NAS <command below>"
  printf '%s\n' "$1" | sed 's/^/      /' >&2
  [[ -n "${DRY:-}" ]] && return 0
  ssh_ -o BatchMode=yes "$NAS" "$1"
}

# nas_root SCRIPT: runs SCRIPT as root in one ssh -t session, so sudo asks once.
nas_root() {
  show "ssh -t $NAS sudo sh -c <script below>"
  printf '%s\n' "$1" | sed 's/^/      /' >&2
  [[ -n "${DRY:-}" ]] && return 0
  local b64
  b64=$(printf '%s' "$1" | base64 | tr -d '\n')
  ssh_ -t "$NAS" "sudo -p 'Synology DSM password for %u (not your Mac password): ' sh -c \"\$(echo $b64 | base64 -d)\""
}

rfc_date() { LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000'; }
bytes() { wc -c < "$1" | tr -d ' '; }
seconds() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1" | cut -d. -f1; }

# make_episode NAME LABEL SEGMENTS: SEGMENTS x 15 s, a spoken time marker at the
# start of each, over a quiet 220 Hz tone so silence never looks like a stall.
make_episode() {
  local name=$1 label=$2 n=$3 tmp i s m sec text
  tmp=$(mktemp -d)
  : > "$tmp/list.txt"
  i=0
  while (( i < n )); do
    s=$(( i * 15 )); m=$(( s / 60 )); sec=$(( s % 60 ))
    if (( i == 0 )); then text="$label. Start."
    elif (( sec == 0 )); then text="$label. $m minutes."
    else text="$label. $m minutes $sec."
    fi
    say -o "$tmp/$i.aiff" "$text"
    ffmpeg -loglevel error -i "$tmp/$i.aiff" -af "aresample=44100,apad=whole_dur=15" -t 15 -ac 1 "$tmp/$i.wav"
    echo "file '$tmp/$i.wav'" >> "$tmp/list.txt"
    i=$(( i + 1 ))
  done
  ffmpeg -loglevel error -f concat -safe 0 -i "$tmp/list.txt" \
    -f lavfi -i "sine=frequency=220:sample_rate=44100" \
    -filter_complex "[1]volume=0.02[t];[0][t]amix=inputs=2:duration=first:normalize=0" \
    -ac 1 -c:a libmp3lame -b:a 128k -metadata title="Prototype $label" "out/$name.mp3"
  rm -rf "$tmp"
}

# render empty|1|2: writes out/feed.xml from the hand-written parts in feeds/.
render() {
  local v=$1
  [[ -s out/ep1.mp3 && -s out/ep2.mp3 ]] || die "run ./proto.sh build first"
  # pubDates are stamped at the first real publish and kept, so re-runs don't move them.
  if [[ -z "${DRY:-}" ]]; then
    [[ -s out/ep1.date ]] || rfc_date > out/ep1.date
    if [[ $v == 2 && ! -s out/ep2.date ]]; then rfc_date > out/ep2.date; fi
  fi
  {
    cat feeds/head.xml
    if [[ $v == 2 ]]; then cat feeds/ep2.xml; fi
    if [[ $v != empty ]]; then cat feeds/ep1.xml; fi
    cat feeds/tail.xml
  } | sed -e "s|__HOST__|$FEED_HOST|g" \
          -e "s|__EP1_DATE__|$(cat out/ep1.date 2>/dev/null || rfc_date)|" \
          -e "s|__EP1_BYTES__|$(bytes out/ep1.mp3)|" \
          -e "s|__EP1_SECONDS__|$(seconds out/ep1.mp3)|" \
          -e "s|__EP2_DATE__|$(cat out/ep2.date 2>/dev/null || rfc_date)|" \
          -e "s|__EP2_BYTES__|$(bytes out/ep2.mp3)|" \
          -e "s|__EP2_SECONDS__|$(seconds out/ep2.mp3)|" > out/feed.xml
  xmllint --noout out/feed.xml
  printf '  rendered out/feed.xml (%s), %s item(s)\n' "$v" "$(grep -c '<item>' out/feed.xml || true)"
}

# push LOCAL NAME: temp name in the same folder, chmod 644, rename over NAME.
push() {
  local local_file=$1 name=$2 remote
  nas "set -eu; t='$PODCAST_DIR/.$name.part'; cat > \"\$t\"; chmod 644 \"\$t\"; mv -f \"\$t\" '$PODCAST_DIR/$name'; wc -c < '$PODCAST_DIR/$name'" < "$local_file" > out/.remote-size
  [[ -n "${DRY:-}" ]] && return 0
  remote=$(tr -d ' \n' < out/.remote-size)
  [[ $remote == "$(bytes "$local_file")" ]] || die "$name: NAS has $remote bytes, local has $(bytes "$local_file")"
  printf '  \033[32m✓\033[0m %s (%s bytes)\n' "$name" "$remote"
}

cmd=$1; shift
case $cmd in
  build)
    mkdir -p out
    [[ -s out/ep1.mp3 ]] || { echo "making ep1.mp3 (20 min)…"; make_episode ep1 "Episode one" 80; }
    [[ -s out/ep2.mp3 ]] || { echo "making ep2.mp3 (3 min)…"; make_episode ep2 "Episode two" 12; }
    [[ -s out/cover.png ]] || ffmpeg -loglevel error -f lavfi -i "color=c=0x3b4a5a:s=1400x1400" -frames:v 1 out/cover.png
    printf 'ok\n' > out/t.txt
    for f in ep1.mp3 ep2.mp3; do printf '  %s: %s bytes, %s s\n' "$f" "$(bytes out/$f)" "$(seconds out/$f)"; done
    ;;

  stack)
    show "COPYFILE_DISABLE=1 tar --format ustar -C stack -cf - . | ssh $NAS 'mkdir -p $STACK_DIR && tar -C $STACK_DIR -xf - && echo PODCAST_DIR=$PODCAST_DIR > $STACK_DIR/.env'"
    [[ -n "${DRY:-}" ]] && exit 0
    COPYFILE_DISABLE=1 tar --format ustar -C stack -cf - . \
      | ssh_ -o BatchMode=yes "$NAS" "mkdir -p '$STACK_DIR' && tar -C '$STACK_DIR' -xf - && printf 'PODCAST_DIR=%s\n' '$PODCAST_DIR' > '$STACK_DIR/.env' && ls -la '$STACK_DIR'"
    ;;

  authkey)
    read -r -s -p "Tailscale auth key (input hidden): " key; echo
    [[ $key == tskey-* ]] || echo "  warning: that doesn't start with tskey-; double-check it" >&2
    printf 'TS_AUTHKEY=%s\nTS_HOSTNAME=%s\n' "$key" "$TS_HOSTNAME" \
      | nas "umask 077 && mkdir -p '$SECRETS_DIR' && chmod 700 '$SECRETS_DIR' && cat > '$SECRETS_DIR/ts.env' && ls -l '$SECRETS_DIR'"
    unset key
    ;;

  publish)
    v=${1:?usage: ./proto.sh publish empty|1|2}
    case $v in
      empty) push out/t.txt t.txt ;;
      1) push out/cover.png cover.png; push out/ep1.mp3 ep1.mp3 ;;
      2) push out/ep2.mp3 ep2.mp3 ;;
      *) die "publish empty|1|2" ;;
    esac
    render "$v"
    push out/feed.xml feed.xml
    printf '  feed.xml swapped at %s local time\n' "$(date '+%H:%M:%S')"
    ;;

  up)
    nas_root "set -e
cd '$STACK_DIR'
$DOCKER compose pull --quiet
$DOCKER compose up -d
sleep 8
$DOCKER compose ps
$DOCKER compose logs --tail 25 ts"
    ;;

  check)
    base="${BASE:-https://$FEED_HOST}"
    fails=0
    row() { if [[ $2 == ok ]]; then printf '  \033[32mPASS\033[0m %-40s %s\n' "$1" "$3"; else printf '  \033[31mFAIL\033[0m %-40s %s\n' "$1" "$3"; fails=$((fails+1)); fi; }
    probe() { curl -sS --max-time 60 -o /dev/null -w '%{http_code} %{content_type}' "$@" || echo "000 curl-error"; }
    echo "checking $base (the first HTTPS request can take ~20 s while Serve fetches its certificate)"
    r=$(probe "$base/feed.xml"); [[ $r == "200 application/rss+xml"* ]] && row "feed.xml 200, application/rss+xml" ok "$r" || row "feed.xml 200, application/rss+xml" bad "$r"
    items=$(curl -sS --max-time 30 "$base/feed.xml" | grep -c '<item>' || true); echo "       feed.xml lists $items item(s)"
    for p in / /.feed.xml.part /@eaDir/x /%23recycle/x; do
      r=$(probe "$base$p"); [[ $r == 404* || $r == 403* ]] && row "$p refused (no listing, no dot-paths)" ok "$r" || row "$p refused (no listing, no dot-paths)" bad "$r"
    done
    r=$(probe -I "$base/ep1.mp3")
    if [[ $r == 404* ]]; then
      echo "  skip ep1.mp3 checks: not published yet"
    else
      [[ $r == "200 audio/mpeg"* ]] && row "ep1.mp3 200, audio/mpeg" ok "$r" || row "ep1.mp3 200, audio/mpeg" bad "$r"
      hdr=$(curl -sS --max-time 30 -o /dev/null -D - -H 'Range: bytes=0-1' "$base/ep1.mp3" | tr -d '\r')
      status=$(printf '%s\n' "$hdr" | head -1 | awk '{print $2}')
      total=$(printf '%s\n' "$hdr" | awk -F/ 'tolower($0) ~ /^content-range:/ {print $2}')
      [[ $status == 206 && $total == "$(bytes out/ep1.mp3)" ]] && row "Range 0-1 → 206, total = enclosure length" ok "$status, total $total" || row "Range 0-1 → 206, total = enclosure length" bad "$status, total $total, local $(bytes out/ep1.mp3)"
      echo "       full ep1.mp3 download from this Mac:"
      curl -sS --max-time 600 -o /dev/null -w '       %{size_download} bytes in %{time_total} s (%{speed_download} bytes/s)\n' "$base/ep1.mp3"
    fi
    (( fails == 0 )) || exit 1
    ;;

  nas-checks)
    nas_root "cd '$STACK_DIR'
P='$PODCAST_DIR'
ACL=/usr/syno/bin/synoacltool
echo '== share root: mode and Synology ACL'
ls -ld \"\$P\"; \$ACL -get \"\$P\" || true
echo '== t.txt after the push chmod 644'
ls -l \"\$P/t.txt\"; \$ACL -get \"\$P/t.txt\" || true
echo '== UID 101 on the DSM host'
id 101 || true
echo '== A. UID 101 reads through the share root (expect: ok, PASS)'
if $DOCKER run --rm -u 101:101 -v \"\$P:/srv:ro\" $ALPINE cat /srv/t.txt; then echo PASS; else echo 'FAIL: mount a chmod 755 subfolder instead (README, fallback)'; fi
echo '== B. :ro enforced, fresh container as root (expect: Read-only file system, PASS)'
if $DOCKER run --rm -v \"\$P:/srv:ro\" $ALPINE touch /srv/ro-test; then echo 'FAIL: write succeeded'; rm -f \"\$P/ro-test\"; else echo PASS; fi
echo '== C. :ro enforced in the running nginx container (expect: Read-only file system, PASS)'
if $DOCKER compose exec -T nginx touch /srv/podcast/ro-test; then echo 'FAIL: write succeeded'; rm -f \"\$P/ro-test\"; else echo PASS; fi
echo '== D. nginx mounts as Docker sees them (expect RW=false for both)'
$DOCKER inspect --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} RW={{.RW}}{{println}}{{end}}' \"\$($DOCKER compose ps -q nginx)\"
echo '== E. nginx process users (workers should be nginx, UID 101)'
$DOCKER compose exec -T nginx ps -o user,pid,args
echo '== F. share contents (any #recycle or @eaDir?)'
ls -la \"\$P\""
    ;;

  logs)
    follow=""; [[ ${1:-} == -f ]] && follow="-f"
    # Access lines only: they start with an ISO date; error-log lines use slashes.
    nas_root "cd '$STACK_DIR' && $DOCKER compose logs --no-log-prefix $follow nginx 2>&1 | awk '/^[0-9][0-9][0-9][0-9]-/ { print; fflush() }'"
    ;;

  path)
    peer=${1:-}
    script="cd '$STACK_DIR' && $DOCKER compose exec -T ts tailscale status"
    [[ -n $peer ]] && script="$script && $DOCKER compose exec -T ts tailscale ping -c 5 '$peer'"
    nas_root "$script"
    ;;

  down)
    nas_root "cd '$STACK_DIR' && $DOCKER compose down
cd / && rm -rf '$STACK_DIR'
$DOCKER image rm $IMAGES || true"
    ;;

  clean)
    nas "rm -f '$PODCAST_DIR/feed.xml' '$PODCAST_DIR/ep1.mp3' '$PODCAST_DIR/ep2.mp3' '$PODCAST_DIR/cover.png' '$PODCAST_DIR/t.txt' && rm -rf '$SECRETS_DIR' && ls -la '$PODCAST_DIR'"
    ;;

  *) usage; exit 1 ;;
esac
