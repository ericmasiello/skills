# Can Tailscale Funnel host a public podcast feed?

Research for [#107](https://github.com/ericmasiello/skills/issues/107) on the podfeed map ([#106](https://github.com/ericmasiello/skills/issues/106)). Read on 2026-11-25. The baseline is `ericmasiello/skylight-mcp-nas`: a `tailscale/tailscale:v1.104.4` sidecar with `TS_USERSPACE=true`, `TS_STATE_DIR=/var/lib/tailscale` bind-mounted to `./ts-state`, a `TS_SERVE_CONFIG` file with `AllowFunnel` on `${TS_CERT_DOMAIN}:443`, the app containers in the sidecar's network namespace (`network_mode: service:ts`), and a `funnel` nodeAttr on a tag ([compose.yaml][sk-compose], [ts-config/serve.json][sk-serve], [README: Tailnet policy][sk-readme]).

Hostnames below are placeholders: `<node>.<tailnet>.ts.net`.

## Answer

Yes, with one known unknown. Funnel passes `Range` and `206 Partial Content` through unchanged, keeps and renews its own certificate in the persisted state directory, and the baseline sidecar pattern carries over as-is. The open risk is throughput. Tailscale caps Funnel bandwidth and publishes no figure. Streaming a podcast MP3 needs a small fraction of any plausible cap. A 200 MB download should take minutes, not seconds. Only a measurement from this NAS settles it. Keep Cloudflare Tunnel as the fallback, but note that Cloudflare's CDN terms restrict serving audio files on the free plan unless caching is turned off for them.

## 1. Bandwidth and throughput

- **The documented limit:** "Traffic sent over a Funnel is subject to non-configurable bandwidth limits" ([Funnel: Requirements and limitations][ts-funnel]). Tailscale's docs give no number, no per-connection or monthly figure, and no plan that raises it (same page). Funnel is also still labeled beta (same page).
- **Path:** every public byte goes client → Funnel relay server (public DNS for the name resolves to the relay, not the NAS) → TCP proxy over Tailscale to the node ([Funnel: How Funnel works][ts-funnel]). The relays appear as peers in `tailscale status --json` (same page), so whether the relay-to-NAS leg is direct or DERP-relayed can be checked on the NAS.
- **Userspace mode costs speed:** "Userspace networking works everywhere but has lower performance"; kernel mode needs `/dev/net/tun` and extra capabilities ([Docker parameters: TS_USERSPACE][ts-docker-params]). On a low-power NAS this is CPU-bound, and it applies to every byte of every download.
- **One third-party measurement (not primary, treat as indicative only):** LocalCan measured a median of 7 Mbps downloading a 100 MB file through Funnel on a 66.8 Mbps uplink, via a Frankfurt relay, and says it couldn't tell whether the cap or DERP set the speed ([LocalCan blog][localcan]). LocalCan sells a competing tunnel.
- **What podcast use needs (arithmetic, not a source):** a 128 kbit/s MP3 streams at 0.128 Mbit/s, about 1/55 of 7 Mbit/s. A 200 MB file is 1,600 Mbit, so about 4 minutes at 7 Mbit/s and about 13 minutes at 2 Mbit/s. Streaming with seeking works at any plausible cap. Downloads are slow-but-fine for one listener on one phone.

## 2. Byte-range requests (seeking)

- **The relay can't touch HTTP:** the Funnel relay "cannot decrypt data sent over this proxy". TLS terminates in `tailscaled` on the node ([Funnel: How Funnel works][ts-funnel]). Headers reach the node byte-for-byte.
- **The node passes `Range` both ways:** in serve config `Proxy` mode, `tailscaled` forwards with Go's `httputil.ReverseProxy` ([serve.go `reverseProxy.ServeHTTP`, v1.104.4][ts-serve-proxy]). It rewrites only the URL, `Host`, `X-Forwarded-*` and the `Tailscale-*` identity headers, and sets `Tailscale-Funnel-Request: ?1` on Funnel traffic ([serve.go `addProxyForwardedHeaders` / `addTailscaleIdentityHeaders`][ts-serve-headers]). `ReverseProxy` strips only hop-by-hop headers (`Connection`, `Keep-Alive`, `Proxy-*`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`) ([Go `hopHeaders`][go-hop]). `Range`, `If-Range`, `Content-Range`, `Accept-Ranges`, `Content-Length` and the `206` status pass through untouched, so nginx's own range handling is what the client sees.
- **Proxy target restriction:** "only `http://127.0.0.1` is currently supported for proxies" ([`tailscale funnel` command: Reverse proxy][ts-funnel-cli]). So nginx must share the `ts` container's network namespace, as the baseline's apps do. That works on DSM.
- **Alternative, not recommended:** serve config `Path` mode makes `tailscaled` serve files itself with `http.ServeContent`/`http.FileServer`, which also handles ranges, but renders directory listings ([serve.go `serveFileOrDirectory`][ts-serve-file]; [`tailscale funnel` command: File server][ts-funnel-cli]). It drops nginx but loses control over MIME types and listing, which the brief requires. Keep nginx.

## 3. TLS certificates on a DSM 7 sidecar

- **Prerequisites:** MagicDNS on, HTTPS certificates enabled for the tailnet, a `funnel` nodeAttr, Tailscale ≥ 1.38.3 ([Funnel: Requirements and limitations][ts-funnel]). The baseline already has all four.
- **Issuance:** Let's Encrypt via a DNS-01 TXT record Tailscale creates under `*.ts.net`. The private key and ACME account key are generated and stay on the node ([Enabling HTTPS: Provision TLS certificates][ts-https]).
- **Where it's stored:** certs go in `<TailscaleVarRoot>/certs` ([acme/certstore.go `certDir`][ts-certdir]). `TailscaleVarRoot` is `--statedir` ([tailscaled.go][ts-varroot]), and containerboot passes `--statedir=$TS_STATE_DIR` ([containerboot/tailscaled.go][ts-cb-statedir]). In the baseline that's `./ts-state` on the NAS volume, so certs survive container restarts, NAS reboots and `docker compose up --build` redeploys. The DSM 6 special case in `certDir` only applies to the native Synology package, not the container (same source).
- **Renewal is automatic** when the cert is used by Serve/Funnel rather than by `tailscale cert` files ([Enabling HTTPS][ts-https]). In v1.104.4 a background loop runs hourly while any HTTPS entry is in the serve config ([acme/refresh.go][ts-refresh]). Renewal time comes from Let's Encrypt's ARI window, falling back to two thirds of the cert's lifetime ([acme/cert.go][ts-renew]).
- **Serve config persistence:** containerboot reads `TS_SERVE_CONFIG` at start, substitutes `${TS_CERT_DOMAIN}`, applies it, and watches the directory for edits ([containerboot/serve.go][ts-cb-serve]). Mount it as a directory, not a single file ([Docker parameters: TS_SERVE_CONFIG][ts-docker-params]). The baseline does.
- **Rate-limit hazard:** repeated new certs can hit Let's Encrypt limits and lock you out for about 34 hours ([Funnel][ts-funnel]; [Enabling HTTPS][ts-https]). Wiping `ts-state/` both re-registers the node and forces a new cert, so never delete it as a fix.
- **Public ledger:** every issued cert's FQDN, machine name included, goes into Certificate Transparency logs ([Enabling HTTPS: Machine names in the public ledger][ts-https]). The URL path is never in a cert, so the secret path segment stays out. The machine name is public: pick a dull one.
- **New name, short delay:** public DNS for a new Funnel name can take up to 10 minutes ([Funnel: DNS propagation][ts-funnel]).

## 4. Ports and acceptable use

- **Ports:** 443, 8443 and 10000 only, TLS only, and only names under the tailnet's `ts.net` domain ([Funnel: Requirements and limitations][ts-funnel]). Use 443 so feed and enclosure URLs carry no port.
- **One port, one mode:** a port can't be Serve and Funnel at once. The last command wins ([Funnel][ts-funnel]).
- **Acceptable use:** Tailscale's AUP has no media, file-size or bandwidth clause. The relevant lines ban illegal or infringing content and "creating an undue burden on the Tailscale Solution" ([Tailscale AUP, updated 2025-06-30][ts-aup]). A private feed with a handful of personal episodes is far from either. Tailscale retains discretion to suspend (same page).

## 5. Fitting it to the baseline

- **Own node, own tag:** a separate compose project with its own `ts` sidecar (e.g. hostname `podcast`, `tag:podcast`), and nginx in its namespace on `127.0.0.1:<port>`. The baseline README explains why the Funnel attr must target the tag: tagged nodes leave `autogroup:member` ([README: Tailnet policy][sk-readme]). Add `tag:podcast` to the `nodeAttrs` funnel target.
- **Lock the tailnet side:** with `TS_USERSPACE=true`, inbound tailnet TCP reaches `127.0.0.1:<port>`, so any tailnet device could hit nginx's port directly unless grants limit it ([README: Tailnet policy, "Why tags"][sk-readme]). Grant members `tcp:443` only, as the baseline does for `skylight`.
- **Verification caveat (from the map):** on tailnet devices MagicDNS resolves `*.ts.net` to the tailnet IP, so a `podfeed` verify step run from the Mac goes over the tailnet, not through Funnel ([README: "Why 443 stays open"][sk-readme]). It proves nginx and the cert, not public reachability. A public check needs a vantage point off the tailnet.

## 6. Cloudflare Tunnel fallback: what it takes

- **Account and domain:** a Cloudflare account, plus a domain onboarded to Cloudflare before you can publish an application ([Create a tunnel (dashboard): 2a][cf-tunnel]). The standard setup is full DNS: point the domain's nameservers at Cloudflare at the registrar ([Onboard a domain][cf-add-site]). Partial (CNAME) setup exists as an alternative (same page). Cloudflare Registrar can sell a domain at cost (same page).
- **Container:** the `cloudflare/cloudflared` image on Docker Hub ([Downloads: Docker][cf-downloads]). Create a remotely-managed tunnel in the dashboard, run the install command it prints (a token), then add a published-application route mapping `<sub>.<domain>` to a service URL such as `http://nginx:80` ([Create a tunnel (dashboard)][cf-tunnel]). Outbound only. It needs egress to Cloudflare on port 7844 (same page). Versions over a year old lose support ([Downloads: Deprecated releases][cf-downloads]).
- **Quick Tunnels don't fit:** `trycloudflare.com` needs no account, but its hostname changes every run and it has no uptime guarantee ([Quick Tunnels][cf-quick]). A feed URL must be stable.
- **Ranges:** Cloudflare forwards `Range` when caching is bypassed, passes a `206` through without re-encoding it, and can serve ranges from cache ([Range request behavior][cf-range]).
- **The catch, audio and the CDN terms:** MP3 is on Cloudflare's default cached-extension list ([Default cache behavior][cf-cache]). On Free/Pro/Business, Cloudflare "reserves the right to disable or limit" the CDN for customers who serve "video or a disproportionate percentage of pictures, audio files, or other large files" without its paid services ([Service-Specific Terms: CDN, updated 2026-09-28][cf-terms]). A feed site that is nearly all MP3 bytes fits the "disproportionate" description. Whether a cache-bypass rule for `*.mp3` takes it outside that clause isn't stated. The terms speak of using the CDN, and tunnel traffic still crosses it.
- **Trust trade:** Cloudflare terminates TLS at its edge as a reverse proxy ([Onboard a domain][cf-add-site]), so it can read the secret path. Funnel's relay can't ([Funnel][ts-funnel]).

## Recommendation

1. Use Funnel, copying the baseline: a separate stack, `ts` sidecar plus `nginx:alpine` in its namespace, `TS_SERVE_CONFIG` proxying `/` to `http://127.0.0.1:<port>` with `AllowFunnel` on `${TS_CERT_DOMAIN}:443`, `ts-state/` persisted, and a new tag with the funnel attr and a 443-only grant.
2. Make the Phase 1 checkpoint measure it: from a phone on cellular (Tailscale off), stream with seeking and time a full download of a ~200 MB test MP3. Also `curl -r` a range from off the tailnet and check for `206` and a correct `Content-Range`.
3. Go to Cloudflare only if that test is unacceptable. Budget a domain, and add a cache-bypass rule for MP3s while accepting the CDN-terms ambiguity.

## Risks and unknowns

- **Funnel's cap is unpublished and can change.** Only a measurement from this NAS answers it, and Tailscale may change it at any time.
- **Funnel is beta,** with no SLA stated in its docs ([Funnel][ts-funnel]).
- **Direct vs DERP between the relay and the NAS** is unknown until checked with `tailscale status --json` in the sidecar. DERP would lower throughput further.
- **Does Pocket Casts fetch the MP3 server-side** (e.g. to probe length or duration), or only the phone? If its servers fetch enclosures, they also go through the cap. Not established here.
- **Cloudflare's audio clause** is a reading of the published terms, not a ruling. Cloudflare decides case by case.

[sk-compose]: https://github.com/ericmasiello/skylight-mcp-nas/blob/main/compose.yaml
[sk-serve]: https://github.com/ericmasiello/skylight-mcp-nas/blob/main/ts-config/serve.json
[sk-readme]: https://github.com/ericmasiello/skylight-mcp-nas/blob/main/README.md#tailnet-policy
[ts-funnel]: https://tailscale.com/kb/1223/funnel
[ts-funnel-cli]: https://tailscale.com/kb/1311/tailscale-funnel
[ts-https]: https://tailscale.com/kb/1153/enabling-https
[ts-docker-params]: https://tailscale.com/docs/features/containers/docker/docker-params
[ts-aup]: https://tailscale.com/tailscale-aup
[ts-serve-proxy]: https://github.com/tailscale/tailscale/blob/v1.104.4/ipn/ipnlocal/serve.go#L985-L1031
[ts-serve-headers]: https://github.com/tailscale/tailscale/blob/v1.104.4/ipn/ipnlocal/serve.go#L1144-L1168
[ts-serve-file]: https://github.com/tailscale/tailscale/blob/v1.104.4/ipn/ipnlocal/serve.go#L1291-L1334
[ts-certdir]: https://github.com/tailscale/tailscale/blob/v1.104.4/feature/acme/certstore.go#L64-L80
[ts-varroot]: https://github.com/tailscale/tailscale/blob/v1.104.4/cmd/tailscaled/tailscaled.go#L432-L447
[ts-cb-statedir]: https://github.com/tailscale/tailscale/blob/v1.104.4/cmd/containerboot/tailscaled.go#L79
[ts-cb-serve]: https://github.com/tailscale/tailscale/blob/v1.104.4/cmd/containerboot/serve.go#L29-L35
[ts-refresh]: https://github.com/tailscale/tailscale/blob/v1.104.4/feature/acme/refresh.go#L17-L59
[ts-renew]: https://github.com/tailscale/tailscale/blob/v1.104.4/feature/acme/cert.go#L171-L250
[go-hop]: https://github.com/golang/go/blob/master/src/net/http/httputil/reverseproxy.go#L387-L397
[localcan]: https://www.localcan.com/blog/tailscale-funnel-alternative
[cf-tunnel]: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
[cf-add-site]: https://developers.cloudflare.com/fundamentals/manage-domains/add-site/
[cf-downloads]: https://developers.cloudflare.com/tunnel/downloads/
[cf-quick]: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
[cf-range]: https://developers.cloudflare.com/cache/reference/range-requests/
[cf-cache]: https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
[cf-terms]: https://www.cloudflare.com/service-specific-terms-application-services/
