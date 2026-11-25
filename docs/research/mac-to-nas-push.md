# How the Mac pushes files to the NAS for nginx

Research for [#109](https://github.com/ericmasiello/skills/issues/109), on the podfeed map [#106](https://github.com/ericmasiello/skills/issues/106). Researched 2026-11-25 from documentation only; nothing was run on the NAS. Hostnames below are placeholders: `nas` is an `~/.ssh/config` alias for the NAS.

## Question

What is a reliable way for the Mac to push files to the Synology NAS (DSM 7) and for an `nginx:alpine` container with a read-only bind mount to serve them? Specifically: rsync on DSM, an atomic feed swap, DSM quirks (`@eaDir`, ACLs, Recycle Bin), the UID/GID and mode the files need, and how `:ro` bind mounts behave under Container Manager.

## Answer

- **Push over plain SSH, not rsync.** Stream each file to a dot-prefixed temp name in its final directory (`ssh nas '… cat > .x.part'`), `chmod 644` it, then `mv` it over the real name. Before writing, read `feed.xml` with `ssh nas cat …`. The Mac needs only `ssh`, and DSM needs only SSH and `cat`, `chmod`, `mv`. This is what skylight-mcp-nas already does to write files on this NAS ([§7](#7-what-skylight-mcp-nas-already-does)).
- **rsync works but costs more.** On DSM, rsync over SSH reportedly needs the DSM rsync service turned on and the rsync application privilege for the user ([§2](#2-rsync-on-dsm-7)). The Mac's `/usr/bin/rsync` is openrsync, not Samba rsync. Use it only if resuming interrupted 1 GB uploads matters.
- **The swap is atomic.** `mv` within one directory is `rename(2)`, which replaces the target atomically on a local Linux filesystem, Btrfs or ext4 ([§3](#3-atomic-swap)). Push the MP3 first and the feed second, as two separate operations.
- **Permissions: world-readable, no chown, no root.** nginx workers run as UID/GID 101 ([§5](#5-ownership-and-permissions)). Files the push user creates and `chmod 644`s, under `755` directories, can be read by UID 101 without root. The open question is whether UID 101 can traverse the shared folder's root, since DSM shares carry Synology ACLs.
- **Mount the directory, not single files.** Bind mounts follow inodes. A renamed-over `feed.xml` mounted on its own stays stale in the container; a mounted directory picks up the new file at once ([§6](#6-container-manager-and-read-only-bind-mounts)).
- **Root is needed only for Docker**, i.e. `sudo docker compose …`, plus maybe a one-time `chmod` on the share root. The per-episode push needs no sudo.

## Findings

### 1. SSH access to DSM 7

- DSM accepts SSH only from accounts in the local `administrators` group. Root access goes through `sudo -i` from such an account [1][2].
- Key login needs the user home service (Control Panel → User & Group → Advanced → User Home) [3]. skylight-mcp-nas's wizard already set up key login for Eric's DSM user [12].
- Synology's sshd predates post-quantum key exchange, and OpenSSH 10.1+ warns about that on every connection. skylight-mcp-nas passes `-o WarnWeakCrypto=no` when the client supports it [12]. This Mac runs OpenSSH 10.5p1, so podfeed should pass the same option or every call will print a warning on stderr.
- Non-interactive SSH sessions on DSM get a short `PATH` without `/usr/local/bin`, and sudo's `PATH` lacks it too, so skylight calls docker by absolute path [12][13]. `cat`, `mv` and `chmod` sit in the base system, so the push commands are unaffected.
- **Tailscale:** with `TS_USERSPACE=true`, the skylight sidecar forwards inbound tailnet TCP to `127.0.0.1:<port>` inside its own container [11]. It cannot carry SSH to DSM's sshd. For SSH to reach the NAS over the tailnet, the DSM host itself must run Tailscale (the Tailscale DSM package [9]). Tailscale SSH does not run on Synology; DSM's own sshd is used instead [9]. skylight-mcp-nas itself connects to the NAS over its LAN address [11][12].

### 2. rsync on DSM 7

- DSM ships an rsync binary; skylight-mcp-nas's wizard does not install one, and a community report's sshd log shows `/usr/bin/rsync --server` running as the remote end of `rsync -e ssh` [22].
- Synology's rsync help page describes a service (Control Panel → File Services → rsync → Enable rsync service) and a per-user privilege (Control Panel → Application Privileges → rsync). It says DSM users must use the encrypted (SSH) transfer [4]. The page does not say outright that plain `rsync -e ssh` needs the service. Several users report it does: with the service off, the transfer fails with `rsync error: rsync service is no running (code 43)` [20][21]. Running the remote rsync as root via `--rsync-path="sudo rsync"` fails with `user has disabled/expired` [22]. This all points to a DSM-patched rsync that checks the service and the user's privilege even under SSH. **Treat it as likely, not verified.**
- **On the Mac,** `/usr/bin/rsync` on macOS 27.2 is openrsync ("protocol version 29, rsync version 2.6.9 compatible"; checked locally with `rsync --version`). Its man page documents `--chmod` (with `D`/`F` prefixes), `--perms`, `--partial-dir`, `--delay-updates`, `--inplace`, `--temp-dir` and `--rsync-path` [7].
- Without `--inplace`, the receiving rsync builds each file as a temp copy in the destination directory and renames it into place when complete [6] (`--inplace` and `--temp-dir`). Each file pushed with rsync is therefore already swapped in atomically. `--temp-dir` on another filesystem loses this, because the file then has to be copied over the target [6][7].
- rsync sorts its transfer list. A guaranteed order (MP3 before feed) requires separate rsync calls [6] ("SORTED TRANSFER ORDER").
- Without `--perms`, new files get the source mode masked by the receiver's umask or default ACL. With `--perms --chmod=…`, the given mode is applied [6]. Without root on the receiver, files are owned by the SSH user, and `--owner` has no effect [6].

### 3. Atomic swap

- `mv` within one filesystem is equivalent to `rename()` [5]. On Linux, "if newpath already exists, it will be atomically replaced, so that there is no point at which another process attempting to access newpath will find it missing" [8]. The exception is NFS, where a failed rename may still have happened [8]. Btrfs and ext4 volumes on DSM are local filesystems.
- `rename()` fails with `EXDEV` across mounts, and `mv` then falls back to copy and delete, which is not atomic [5][8]. The temp file must sit in the same directory, or at least the same mount, as its target. Synology shares are top-level directories of one volume, so `/volume1/podcast/…` to `/volume1/podcast/…` is one filesystem.
- **What nginx sees:** `open_file_cache` defaults to `off` [16], so each request opens the file by name and gets either the whole old feed or the whole new one. A response already streaming the old file keeps its open inode. An unlinked file stays in existence until its last descriptor closes [8][24].
- **Order:** push the MP3 with its own temp-then-rename, confirm its size, then swap the feed. A fetched feed then never lists an MP3 that is missing or half-written.
- **Read-modify-write race:** atomicity guards readers, not writers. Two `podfeed add` runs at once can each read the same `feed.xml`, and the second rename drops the first episode. If that matters, a lock directory works on any POSIX system: `mkdir` fails when the directory already exists.

### 4. DSM quirks

- **Recycle Bin:** "Enable Recycle Bin" is selected by default when a shared folder is created, and deleted files go into a `#recycle` subfolder at the share's root [17][18]. Users report that deletions over SSH (`rm`) bypass it and are permanent; only SMB, AFP and File Station deletions are recycled [23]. Synology does not state this. Two consequences: `#recycle` sits inside a folder nginx serves, and a rename over `feed.xml` does not recycle the old copy. Turn the Recycle Bin off for the podcast share, or exclude `#recycle` in nginx.
- **`@eaDir`:** this is where DSM's indexing and thumbnail services keep their data (e.g. `@eaDir/SYNO@.fileindexdb` for Universal Search) [19]. Media Indexing scans only folders added under Control Panel → Indexing Service; default multimedia shares are indexed automatically, other folders only when added by hand [10]. A dedicated `podcast` share stays clean as long as nobody adds it to Media Indexing or Universal Search. Denying `@eaDir`, `#recycle` and dot-files in nginx covers any leftovers. It also hides podfeed's `.part` temp files.
- **ACLs:** new shared folders use Windows-style ACLs by default since DSM 5.0. Files and subfolders inherit their ACL entries from the share [14][15]. Users report that `ls -l` on an ACL'd path shows a trailing `+`, that `synoacltool -get` shows the real entries, and that `chmod` on a path clears its Synology ACL (`chown` does not) [25][26]. Synology does not document the `chmod` behavior. If it holds, podfeed's `chmod 644` turns each file into a plain POSIX file that any UID can read. Harmless here: the files are public over HTTPS anyway.

### 5. Ownership and permissions

- The official nginx images create user and group `nginx` with UID and GID 101 [27][28]. Since 1.17.0, all variants use these IDs "to drop the privileges for worker processes" [28]. The `user` directive sets the credentials of worker processes [16]. The stock `/etc/nginx/nginx.conf` contains `user  nginx;`; the unprivileged image's Dockerfile deletes exactly that line [29]. The master process runs as root, since the `nginx:alpine` Dockerfile sets no `USER` [27]. Workers open and serve the files, so **UID 101 needs read on each file and execute (search) on every directory from the mount root down**.
- The Docker daemon remaps no UIDs unless `userns-remap` is configured [30]. UID 101 in the container is UID 101 on the DSM host, and the kernel checks host permissions (mode bits, plus Synology ACLs where present) against it.
- A file created over SSH is owned by the SSH user [6]. The owner can `chmod` it without root. Files `0644` and directories `0755` give "other", and therefore UID 101, read and traverse rights with no `chown` and no sudo.
- **The one gap:** the bind-mount root. If nginx mounts the share root `/volume1/podcast`, the share root's permissions must let UID 101 in. The share root is created by DSM with an ACL [14], and it is unknown whether that ACL lets an arbitrary UID such as 101 traverse it. There are two ways out. (a) Mount a subfolder the push user creates and `chmod 755`s, e.g. `/volume1/podcast/public`, which needs no root. (b) Grant read on the share root to everyone, or `sudo chmod 755 /volume1/podcast` once (root). A check on the NAS settles which one is needed ([unknowns](#what-only-a-check-on-the-nas-can-settle)).
- skylight-mcp-nas runs its containers as UID 1000 and uses `sudo chown 1000:1000` plus `chmod 400` on the files they read [12]. That is necessary there because the files are secrets; podcast files are public, so world-readable needs no chown.

### 6. Container Manager and read-only bind mounts

- Container Manager is Docker Engine with Compose v2; skylight-mcp-nas drives it with `sudo docker compose up -d --build` over SSH and uses bind mounts such as `./data:/data` [12][13]. Its `skylight` service also runs with `read_only: true` and a `tmpfs` [13].
- `:ro` (or `readonly`) mounts a bind mount read-only in the container. `docker inspect` then shows `"Mode": "ro", "RW": false` [31]. This is a kernel mount flag, and nothing in Synology's documentation changes it. Docker's docs say `:ro` is ignored "with services". That means Swarm services, not Compose [31].
- **Mount directories, not single files.** A single-file bind mount is tied to the inode, not the name. After a temp-then-rename swap on the host, the container keeps the old file until it is recreated. Docker maintainers call this "a known limitation of file-mounts and is not fixable" and recommend mounting the parent directory [32][33][34]. `feed.xml` must therefore be reached through a mounted directory. The same applies to an nginx config file that gets edited with a tool that writes by rename.
- `docker compose up` recreates a container only when the service's configuration or image changed, so a changed mounted file does not trigger it [35]. For podfeed that is fine: nginx reads the files fresh on each request ([§3](#3-atomic-swap)).

### 7. What skylight-mcp-nas already does

- **Transport:** plain `ssh` from the laptop. It writes a file with `ssh -o BatchMode=yes nas "umask 077 && rm -f '<path>' && cat > '<path>'"`, the data arriving on stdin, so secrets never touch the laptop's disk or a command line [12]. It never calls rsync or scp.
- **Deploy:** a script is base64-encoded, sent in one `ssh -t` session and run with `bash` on the NAS. sudo then asks for the DSM password once, on the terminal `ssh -t` allocates. Docker is called by absolute path because sudo's `PATH` lacks `/usr/local/bin` [13].
- **Ownership:** a single sudo step chowns the files the containers read to the container UID (1000) or to root [12].
- **Code:** the code reaches the NAS with `git clone` and `git fetch`. The repo is public, and Git Server is installed from Package Center [11][12].

For podfeed, the same pattern splits in two. The nginx stack is deployed once, and occasionally redeployed, with sudo like skylight. Publishing an episode is a sudo-free `ssh … cat > …; chmod; mv`.

## Recommended push mechanism

Run from the Mac. `nas` is the SSH alias, and `$ROOT` is the folder nginx mounts (`/volume1/podcast` or a subfolder of it, [§5](#5-ownership-and-permissions)). podfeed would spawn `ssh` with the file piped to stdin. The remote paths are built from the sha256 guid, so they need no shell quoting beyond what is shown.

```sh
# 0. The SSH options podfeed should always pass (drop WarnWeakCrypto on OpenSSH < 10.1)
nas() { ssh -o BatchMode=yes -o WarnWeakCrypto=no nas "$@"; }

# 1. Pull the current feed (the only state)
nas "cat '$ROOT/feed.xml'" > /tmp/feed.xml

# 2. Push the MP3: temp name in the same directory, mode 644, then rename
nas "set -eu; d='$ROOT/episodes'; t=\"\$d/.$GUID.mp3.part\"; cat > \"\$t\"; chmod 644 \"\$t\"; mv -f \"\$t\" \"\$d/$GUID.mp3\"" < episode.mp3

# 3. Check the size landed (POSIX wc, no GNU stat needed)
nas "wc -c < '$ROOT/episodes/$GUID.mp3'"

# 4. Swap the feed the same way
nas "set -eu; t='$ROOT/.feed.xml.part'; cat > \"\$t\"; chmod 644 \"\$t\"; mv -f \"\$t\" '$ROOT/feed.xml'" < /tmp/feed.new.xml
```

Optional rsync form of step 2, if Eric enables the DSM rsync service and the user's rsync privilege [4]:

```sh
rsync -e "ssh -o WarnWeakCrypto=no" --perms --chmod=D755,F644 --partial-dir=.rsync-partial \
  episode.mp3 "nas:$ROOT/episodes/$GUID.mp3"
```

nginx config implications for the nginx-config ticket: mount the directory `:ro`, deny `^/(@eaDir|#recycle)` and any path segment starting with `.`, leave `autoindex` off, and keep `open_file_cache` off.

## Which commands need SSH or root

| Command | Runs on | SSH | Root |
| --- | --- | --- | --- |
| `ssh nas cat …/feed.xml` (pull feed) | Mac → NAS | yes | no |
| `ssh nas 'cat > .x.part; chmod 644; mv'` (push MP3 or feed) | Mac → NAS | yes | no, the push user owns its files |
| `ssh nas 'mkdir -p $ROOT/episodes && chmod 755 $ROOT/episodes'` (one-time layout) | Mac → NAS | yes | no, if the user can write `$ROOT` |
| `rsync -e ssh …` (optional alternative) | Mac → NAS | yes | no, but needs the DSM rsync service and the user's rsync privilege (DSM GUI) |
| Create the `podcast` shared folder, grant the push user Read/Write, untick Recycle Bin | DSM Control Panel | no | DSM admin (GUI) |
| `sudo chmod 755 /volume1/podcast` (only if the share root blocks UID 101) | NAS shell | yes | **yes** |
| `sudo /usr/local/bin/docker compose up -d` (start or redeploy nginx) | NAS shell | yes (`ssh -t`) | **yes** |
| `sudo /usr/local/bin/docker inspect …` / `docker exec …` (checks) | NAS shell | yes (`ssh -t`) | **yes** |

## What only a check on the NAS can settle

Each check below only reads or writes test files; none deletes or changes anything else. Eric runs them; they are not run by an agent.

1. **Is the DSM host itself on the tailnet?** Only then can `ssh` reach DSM's sshd "over Tailscale". The skylight sidecar cannot ([§1](#1-ssh-access-to-dsm-7)). Check the Tailscale admin console's Machines page for a device that is the NAS itself (not `skylight`), or the DSM Package Center for the Tailscale package. If it is absent, either install the Tailscale DSM package [9] or push over the LAN only.
2. **Can UID 101 read the share root?** After creating the share and one test file (`ssh nas 'echo ok > /volume1/podcast/t.txt && chmod 644 /volume1/podcast/t.txt'`):
   `ssh -t nas 'sudo /usr/local/bin/docker run --rm -u 101:101 -v /volume1/podcast:/srv:ro alpine:3 cat /srv/t.txt'` (root). `ok` means mounting the share root works. `Permission denied` means use a `chmod 755` subfolder, or `sudo chmod 755` the share root.
3. **What the share's ACL and mode look like:** `ssh nas 'ls -ld /volume1/podcast; synoacltool -get /volume1/podcast; id 101'` shows whether UID 101 is a DSM-internal user and which ACL entries apply.
4. **Does `chmod` clear the Synology ACL on a pushed file?** Run `ssh nas 'synoacltool -get /volume1/podcast/t.txt'` after the `chmod 644`. "It's Linux mode" means plain POSIX bits now govern [25].
5. **Is `:ro` enforced?** `ssh -t nas 'sudo /usr/local/bin/docker run --rm -v /volume1/podcast:/srv:ro alpine:3 touch /srv/x'` should fail with "Read-only file system". `docker inspect` on the nginx container should show `"RW": false`.
6. **Does rsync over SSH need the rsync service?** Only matters if rsync is wanted. Run `rsync -e ssh /tmp/t nas:/volume1/podcast/` with the service off and look for `code 43` [20].
7. **Recycle Bin and `@eaDir`:** after a few pushes, `ssh nas 'ls -la /volume1/podcast'` should show no `#recycle` or `@eaDir`. If they appear, the nginx deny rules are required, not just defensive.

## Sources

1. Synology, *Terminal* (DSM 7 help): SSH/Telnet login only for local administrators group; `sudo -i` for root. https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_terminal?version=7
2. Synology, *How can I sign in to DSM/SRM with root privilege via SSH?* https://kb.synology.com/en-us/DSM/tutorial/How_to_login_to_DSM_with_root_permission_via_SSH_Telnet
3. Synology, *How do I sign in to DSM with RSA key pairs via SSH?* (user home service requirement). https://kb.synology.com/en-us/DSM/tutorial/How_to_log_in_to_DSM_with_key_pairs_as_admin_or_root_permission_via_SSH_on_computers
4. Synology, *Rsync* (DSM 7 help): rsync service, Application Privileges → rsync, DSM users must use encrypted transfer. https://kb.synology.com/en-us/DSM/help/DSM/AdminCenter/file_rsync
5. The Open Group, *POSIX.1-2024 `mv`*: same-filesystem move performs `rename()`; `EXDEV` falls back to copy. https://pubs.opengroup.org/onlinepubs/9799919799/utilities/mv.html
6. rsync project, *rsync(1)* man page: `--inplace` (default temp-then-move), `--temp-dir`, `--delay-updates`, `--perms`, `--chmod`, `--owner`, sorted transfer order. https://download.samba.org/pub/rsync/rsync.1
7. Apple, *openrsync(1)*, macOS 27.2 local man page (`man rsync`): `--chmod` with D/F prefixes, `--temp-dir` atomicity caveat; `rsync --version` reports protocol 29.
8. Linux man-pages, *rename(2)*: atomic replacement of an existing newpath; NFS caveat; `EXDEV`. https://man7.org/linux/man-pages/man2/rename.2.html
9. Tailscale, *Access Synology NAS from anywhere*: DSM package install, Tailscale SSH not supported on Synology, DSM 7 outbound/TUN notes. https://tailscale.com/kb/1131/synology
10. Synology, *Media Indexing* (DSM help, DSM 6 and 7 versions): indexed folders are opt-in except default multimedia shares; files added via NFS/SCP aren't scanned automatically. https://kb.synology.com/en-us/DSM/help/DSM/AdminCenter/application_mediaindexservice_general and https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/application_mediaindexservice_general?version=6
11. ericmasiello/skylight-mcp-nas, `README.md` (userspace Tailscale forwards tailnet TCP to `127.0.0.1:<port>`; setup prerequisites; deploy flow). https://github.com/ericmasiello/skylight-mcp-nas/blob/main/README.md
12. ericmasiello/skylight-mcp-nas, `scripts/nas-setup.sh` (`put_remote` via `ssh … cat >`, `WarnWeakCrypto`, short non-interactive PATH, key login, sudo chown/chmod stage). https://github.com/ericmasiello/skylight-mcp-nas/blob/main/scripts/nas-setup.sh
13. ericmasiello/skylight-mcp-nas, `scripts/deploy.sh` and `compose.yaml` (one `ssh -t` session, sudo PATH lacks `/usr/local/bin`, `docker compose up -d --build`, bind mounts, `read_only` + `tmpfs`). https://github.com/ericmasiello/skylight-mcp-nas/blob/main/scripts/deploy.sh and https://github.com/ericmasiello/skylight-mcp-nas/blob/main/compose.yaml
14. Synology, *How can I manage ACL settings on my Synology NAS?*: shared folders use Windows ACL by default since DSM 5.0; inheritance. https://kb.synology.com/en-us/DSM/tutorial/How_to_manage_ACL_settings_on_your_Synology_NAS
15. Synology, *Assign Shared Folder Permissions* (DSM 7 help). https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/file_share_privilege?version=7
16. nginx, *Core functionality* (`user` directive: credentials of worker processes) and *ngx_http_core_module* (`open_file_cache` default `off`). https://nginx.org/en/docs/ngx_core_module.html#user and https://nginx.org/en/docs/http/ngx_http_core_module.html#open_file_cache
17. Synology, *Enable Recycle Bin* (DSM 7 help): on by default for new shared folders; `#recycle` subfolder. https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/file_share_recycle?version=7
18. Synology, *How do I recover files that were accidentally deleted on my Synology NAS?* (`#recycle` location). https://kb.synology.com/en-us/DSM/tutorial/How_do_I_restore_files_deleted_from_Synology_NAS
19. McLean IT, *Synology: how to fix a frozen index process* (log lines showing `@eaDir/SYNO@.fileindexdb` used by the search indexer; community, secondary). https://mcleanit.ca/blog/synology-fix-frozen-index
20. Synology Community, *rsync over ssh* (2024): `rsync service is no running (code 43)` with the service off. https://community.synology.com/enu/forum/1/post/188935
21. Unix & Linux Stack Exchange, *rsync over ssh still requires rsync service enabled on Synology nas* (2025). https://unix.stackexchange.com/questions/790135/rsync-over-ssh-still-requires-rsync-service-enabled-on-synology-nas
22. Synology Community, *rsync over ssh* (2025, DSM 7.2): `user has disabled/expired` when the remote rsync runs as root. https://community.synology.com/enu/forum/1/post/194553
23. Synology Community, *deleted file not in the recycle bin* (2024): SSH `rm` bypasses `#recycle`. https://community.synology.com/enu/forum/1/post/189931
24. Linux man-pages, *unlink(2)*: a file stays in existence while any process holds it open. https://man7.org/linux/man-pages/man2/unlink.2.html
25. Synology Community, *Bugs? On DSM 7, rsync getting messed up by unwanted ACLs* (2022): `synoacltool -get` "It's Linux mode"; `chmod` removes Synology ACLs. https://community.synology.com/enu/forum/1/post/153210
26. Synology Community, *Unusual file permissions after copying data* (2018): `+` marks Synology ACLs; `chmod` clears them, `chown` does not. https://community.synology.com/enu/forum/17/post/118724
27. nginx/docker-nginx, `mainline/alpine-slim/Dockerfile`: `addgroup -g 101 … adduser -u 101 … nginx`; no `USER`. https://github.com/nginx/docker-nginx/blob/master/mainline/alpine-slim/Dockerfile
28. Docker Hub, *nginx* official image docs ("User and group id": UID/GID 101 for worker processes since 1.17.0; `:ro` content mount example). https://hub.docker.com/_/nginx
29. nginx/docker-nginx-unprivileged, `mainline/alpine-slim/Dockerfile` (`sed -i '/user  nginx;/d' /etc/nginx/nginx.conf`). https://github.com/nginx/docker-nginx-unprivileged/blob/main/mainline/alpine-slim/Dockerfile
30. Docker, *Isolate containers with a user namespace* (`userns-remap` is opt-in daemon configuration). https://docs.docker.com/engine/security/userns-remap/
31. Docker, *Bind mounts* (`readonly`/`ro`; `docker inspect` `RW: false`; `:ro` ignored with Swarm services). https://docs.docker.com/engine/storage/bind-mounts/
32. moby/moby #6011, *bind-mounted single files don't stay in sync after inode of file changes on host*. https://github.com/moby/moby/issues/6011
33. moby/moby #15793, *File mount does not update with changes from host* ("a known limitation of file-mounts and is not fixable"). https://github.com/moby/moby/issues/15793
34. moby/moby #38955, *container hold a deleted file* (maintainer: bind-mount a directory instead of a single file). https://github.com/moby/moby/issues/38955
35. Docker, *docker compose up* reference (containers are recreated only when configuration or image changed). https://docs.docker.com/reference/cli/docker/compose/up/
