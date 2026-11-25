# Verifying the public Funnel path from a tailnet Mac

Research for [#110](https://github.com/ericmasiello/skills/issues/110), part of the podcast-feed map [#106](https://github.com/ericmasiello/skills/issues/106). Researched 2026-11-25.

**Question:** how can `podfeed add`, running on a Mac that is on the tailnet, prove that the feed and the MP3 can be reached through the *public* Funnel path, when MagicDNS on that Mac resolves `<node>.<tailnet>.ts.net` to the NAS's tailnet IP and skips Funnel?

## Answer

Resolve the hostname through **public DNS**, not the system resolver. Then connect to **each** public address it returns, keeping the real hostname for TLS SNI, certificate verification and the `Host` header. In curl that is `--resolve`. In Node it is a custom `lookup` on `https.request` (or on an undici `Agent`). Pair it with a `dns.Resolver` pointed at public servers.

A tailnet device can use the public ingress. The relay sees an ordinary internet client, and the Funnel node does not check where the client came from. So no external service is needed. Run the feed and byte-range checks against every ingress address and report each one, because single ingress relays are known to fail while others work.

## 1. Why the obvious check proves nothing

- On a tailnet device, MagicDNS answers for the tailnet's own `*.ts.net` names with the device's Tailscale IP ([MagicDNS](https://tailscale.com/docs/features/magicdns); skylight-mcp-nas README, "Why 443 stays open to your devices"). A plain `curl https://<node>.<tailnet>.ts.net/...` or `fetch()` from the Mac goes over WireGuard straight to the NAS, which serves 443 to tailnet peers too ([Funnel KB](https://tailscale.com/kb/1223/funnel): a Funnel port is "available within the tailnet and to the public").
- Node's `dns.lookup()`, which `fetch`, `http` and `https` use by default, calls `getaddrinfo(3)` and resolves names "the same way as the `ping` command". On this Mac that means MagicDNS ([Node dns, Implementation considerations](https://nodejs.org/api/dns.html#implementation-considerations)).
- This mistake has happened in practice. One reporter believed Funnel worked "for two phases of our deployment" because every in-tailnet test returned in under 100 ms. Their first real public request timed out ([tailscale#19290](https://github.com/tailscale/tailscale/issues/19290), "Why the in-tailnet test was not a real verification"). Funnel's own status output also said "Funnel on" while the public path was dead ([#19290](https://github.com/tailscale/tailscale/issues/19290), [#21114](https://github.com/tailscale/tailscale/issues/21114)). So `tailscale funnel status` on the NAS is no substitute either.

## 2. How the public path works

1. **Public DNS.** When Funnel is enabled, Tailscale creates public DNS records for `node.tailnet.ts.net` that point at Tailscale-run Funnel ingress servers, not at your device ([Introducing Funnel](https://tailscale.com/blog/introducing-tailscale-funnel); [Funnel KB, "Resolving the Funnel URL"](https://tailscale.com/kb/1223/funnel)). The ingress chosen is the one closest to the Funnel node ([Funnel beta post, "DNS"](https://tailscale.com/blog/tailscale-funnel-beta)). New records "can take up to 10 minutes" to appear ([Funnel KB, "DNS propagation"](https://tailscale.com/kb/1223/funnel)).
   - Observed shape (local `dig`, 2026-11-25, against a third-party Funnel host named in a public Tailscale issue): two `A` and two `AAAA` records, TTL 300, no CNAME. `ts.net` is served by four DNSimple nameservers (`ns1.dnsimple.com`, `ns2.dnsimple-edge.net`, `ns3.dnsimple.com`, `ns4.dnsimple-edge.org`), and its SOA negative TTL is 300 s. A name without Funnel returns NXDOMAIN.
2. **Ingress relay.** The relay accepts the TCP connection (TLS is required), reads the SNI name from the ClientHello, and proxies the *still-encrypted* stream to your node over Tailscale. It does not terminate TLS ([Introducing Funnel](https://tailscale.com/blog/introducing-tailscale-funnel); [Funnel KB, "Establishing an encrypted proxy"](https://tailscale.com/kb/1223/funnel)). **Without SNI the relay has nothing to route on**, so connecting "by IP" without a server name cannot work.
3. **Hand-off to the node.** The relay sends a peerAPI request to `/v0/ingress` on your node. The request carries the original client `ip:port` in `Tailscale-Ingress-Src` and the target `host:port` in `Tailscale-Ingress-Target` ([serve.go `handleServeIngress`](https://github.com/tailscale/tailscale/blob/445df50dcf76b6172dc4688c2097c47878f41641/ipn/ipnlocal/serve.go#L1671-L1740)). The node checks two things: that the sender holds the ingress capability ([peerapi.go `canIngress`](https://github.com/tailscale/tailscale/blob/445df50dcf76b6172dc4688c2097c47878f41641/ipn/ipnlocal/peerapi.go#L631-L636)), and that Funnel is configured for that target ([serve.go `HandleIngressTCPConn`](https://github.com/tailscale/tailscale/blob/445df50dcf76b6172dc4688c2097c47878f41641/ipn/ipnlocal/serve.go#L468-L527)). **It never checks the client's source address.**
4. **TLS and proxy.** `tailscaled` on the node terminates TLS with the node's Let's Encrypt certificate and reverse-proxies to the local service (nginx). On a Funnel request it sets `X-Forwarded-For` to the public client IP and adds `Tailscale-Funnel-Request: ?1`. A tailnet request gets the peer's `100.x` address and, for untagged nodes, `Tailscale-User-*` identity headers instead ([serve.go `addProxyForwardedHeaders` / `addTailscaleIdentityHeaders`](https://github.com/tailscale/tailscale/blob/445df50dcf76b6172dc4688c2097c47878f41641/ipn/ipnlocal/serve.go#L1150-L1191)). The Serve docs confirm that "Funnel traffic … does not include identity headers" ([Serve, "Identity headers"](https://tailscale.com/docs/features/tailscale-serve)); the `Tailscale-Funnel-Request` header itself appears only in the source.

## 3. Can a tailnet device go through the public ingress?

**Yes.** The evidence:

- **Source.** Nothing on the node side looks at who the public client is (step 3 above). The relay only sees a TCP connection from the Mac's public (NAT) address. The Mac does not route the ingress IPs over Tailscale: they are public addresses, not tailnet routes. If the Mac uses an exit node, the connection leaves through the exit node and still arrives at the ingress from the internet.
- **Local experiment** (2026-11-25, this Mac, which is on a tailnet with MagicDNS on). `route -n get <ingress IP>` showed the route leaving through `en0` to the LAN gateway, not `utun`. `curl -I --resolve <host>:443:<ingress IP>` to a third-party Funnel host from a public Tailscale issue returned `307` with the certificate verified (`ssl_verify_result=0`). Both of that host's IPv4 ingress addresses answered. A second third-party host failed the TLS handshake (`SSL_ERROR_SYSCALL`) on both of its ingress IPs. That is the stalled-relay failure in section 6, not a refusal of tailnet clients.
- **Third-party reports of the same setup** (secondary sources, but direct observations):
  - A Mac on the same LAN as the Funnel node, pinning public ingress addresses, got `HTTP 200` ([tailscale#22486](https://github.com/tailscale/tailscale/issues/22486), table row "Public Funnel from a Mac on the same LAN").
  - A home-server guide checks Funnel from the author's tailnet Mac with `dig @1.1.1.1` plus `curl --resolve` and shows `SSL certificate verify ok` and `HTTP/2 302` ([mutschler.dev, section 9.3](https://mutschler.dev/linux/wyse-ubuntu-nextcloud-aio/)). The same guide reports that a check run *from the Funnel node itself* failed. That case does not apply here, because the Mac and the NAS are different nodes.
  - The debugging write-ups in [#19290](https://github.com/tailscale/tailscale/issues/19290), [#21502](https://github.com/tailscale/tailscale/issues/21502), [#21746](https://github.com/tailscale/tailscale/issues/21746) and [#22576](https://github.com/tailscale/tailscale/issues/22576) all use `curl --resolve <host>:443:<ingress IP>` as the standard public-path test.
- **Caveat:** the ingress relay is closed source. "The relay does not filter clients by source" is inferred from its documented behaviour and from observations, not read from code. Section 8 lists the remaining edge case.

## 4. The technique

### 4.1 Resolve through public DNS

Use public DNS, never `getaddrinfo` or `dns.lookup()`:

- `dns.Resolver` with `setServers([...])` sends real DNS queries to the servers you name. It does not use the OS resolver, so it bypasses MagicDNS ([Node dns, `Resolver`](https://nodejs.org/api/dns.html#class-dnsresolver); [Implementation considerations](https://nodejs.org/api/dns.html#implementation-considerations)). Ask for both `A` (`resolve4`) and `AAAA` (`resolve6`).
- Use at least two public resolvers, for example `1.1.1.1` and `8.8.8.8`. One resolver has been seen caching a bogus NXDOMAIN for the `A` record for its 300 s negative TTL while the authoritative servers answered correctly ([tailscale#20892](https://github.com/tailscale/tailscale/issues/20892)).
- **Diagnostic step:** if the public resolvers say NXDOMAIN, ask an authoritative `ts.net` server (`ns1.dnsimple.com`) directly. That tells "record really missing" (a Tailscale-side problem, see [#21502](https://github.com/tailscale/tailscale/issues/21502) and [#21114](https://github.com/tailscale/tailscale/issues/21114)) apart from "a resolver cached a negative answer".
- **If UDP/53 to public resolvers is blocked** (some networks only allow their own resolver, see [tailscale#16558](https://github.com/tailscale/tailscale/issues/16558)), fall back to DNS-over-HTTPS JSON: `GET https://cloudflare-dns.com/dns-query?name=<host>&type=A` with `accept: application/dns-json` ([Cloudflare DoH JSON](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)). Verified locally; it returns `{"Status":0,"Answer":[…]}`.
- **Guard:** reject any answer in `100.64.0.0/10` or `fd7a:115c:a1e0::/48`. Those are Tailscale address ranges ([Tailscale IP addresses](https://tailscale.com/docs/concepts/tailscale-ip-addresses); IPv6 prefix shown in [`tailscale funnel` docs](https://tailscale.com/docs/reference/tailscale-cli/funnel)), and getting one back means the query went through MagicDNS by mistake.

### 4.2 Pin the address, keep the name

**curl**, for manual checks and for docs to give Eric:

```sh
host=<node>.<tailnet>.ts.net
ip=$(dig @1.1.1.1 +short "$host" A | head -1)
curl -sS -o /dev/null -w '%{http_code} %{remote_ip} verify=%{ssl_verify_result}\n' \
  --resolve "$host:443:$ip" "https://$host/p/<secret>/feed.xml"
curl -sS -D - -o /dev/null -r 0-1 --resolve "$host:443:$ip" \
  "https://$host/p/<secret>/episodes/<file>.mp3"
```

`--resolve host:port:addr` makes curl use the given address for that host and port pair, "a sort of /etc/hosts alternative". IPv6 addresses go in `[brackets]` ([curl `--resolve`](https://curl.se/docs/manpage.html#--resolve)). `--connect-to HOST1:PORT1:HOST2:PORT2` also works and "does NOT affect the hostname/port number that is used for TLS/SSL (e.g. SNI, certificate verification)" ([curl `--connect-to`](https://curl.se/docs/manpage.html#--connect-to)).

**Node, built-in `node:https`** (recommended for the CLI: no dependency, and the socket exposes `remoteAddress`):

```ts
import https from "node:https";
import net from "node:net";
import { Resolver } from "node:dns/promises";

const resolver = new Resolver({ timeout: 3000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const pinnedLookup = (ip: string): net.LookupFunction => (_host, opts, cb) => {
  const family = net.isIP(ip);
  // Node's default autoSelectFamily calls lookup with { all: true }
  if (opts.all) cb(null, [{ address: ip, family }]);
  else cb(null, ip, family);
};

function get(host: string, path: string, ip: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: Buffer; remote?: string }>(
    (resolve, reject) => {
      const req = https.request(
        { host, path, headers, lookup: pinnedLookup(ip), agent: false, timeout: 15_000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks), remote: res.socket.remoteAddress }),
          );
        },
      );
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    },
  );
}
```

Why each piece matters:

- **Keep `host` as the hostname and override `lookup`.** `https.request` and `net.connect` take a `lookup` function that replaces `dns.lookup()` ([Node http `request` options](https://nodejs.org/api/http.html#httprequesturl-options-callback); [Node net `socket.connect`](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener)). SNI and certificate checks then use the hostname, as normal. If you pass the IP as `host`, Node sends **no SNI** ("unless the target server is specified using an IP address, in which case the default is `''`", [Node https `Agent`](https://nodejs.org/api/https.html#new-agentoptions)), and the relay cannot route the connection.
- **Handle `opts.all`.** By default Node turns on `autoSelectFamily`, which calls `lookup` with `all: true` and expects an array back ([Node net, `autoSelectFamily`](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener)). Verified locally on Node 24.22: the pinned lookup was called with `all: true`, and a lookup that ignores it fails with `ERR_INVALID_IP_ADDRESS`.
- **`agent: false`** so each pinned request gets a fresh socket instead of reusing a kept-alive connection to another ingress IP.
- Verified locally on Node 24.22 against a neutral public host: `servername` was the hostname, `authorized: true`, `remoteAddress` was the pinned IP, and a `Range: bytes=0-1` request returned `206` with `Content-Range: bytes 0-1/<total>`.

**Node, undici alternative.** `new Agent({ connect: { lookup } })`. undici passes every `tls.connect()` option through its connector ([undici Client `connect`](https://github.com/nodejs/undici/blob/1e0bea9fb57720118866fe4b6ce3fb9263596add/docs/docs/api/Client.md#L85-L89), with a "Custom DNS lookup" example at [L203-L214](https://github.com/nodejs/undici/blob/1e0bea9fb57720118866fe4b6ce3fb9263596add/docs/docs/api/Client.md#L203-L214)). It takes `servername` from the URL host ([connect.js L77-L104](https://github.com/nodejs/undici/blob/1e0bea9fb57720118866fe4b6ce3fb9263596add/lib/core/connect.js#L77-L104)). Global `fetch` accepts `{ dispatcher }` from the npm `undici` package ([Node globals, "Custom dispatcher"](https://nodejs.org/api/globals.html#custom-dispatcher)). The downsides are an extra dependency and no access to the remote address.

### 4.3 Optional: proof the request came through Funnel

The remote-address guard already proves the Mac did not use the tailnet. For proof from the server side, nginx can echo the header `tailscaled` adds only on Funnel requests, for example `add_header X-Podfeed-Via $http_tailscale_funnel_request always;`. The CLI then expects `?1`. This only works if Funnel is set up in proxy mode (`tailscaled` terminates TLS and proxies to nginx). It does not work for TCP pass-through, where nginx terminates TLS. The header is undocumented (source only, §2 step 4), so treat it as a nice-to-have.

## 5. What to check, per ingress address

| Check | Request | Pass when |
|---|---|---|
| Name resolves publicly | `resolve4` / `resolve6` via public resolvers | ≥1 address, none in Tailscale ranges |
| TLS | any request below | handshake completes and the certificate verifies for the hostname (Node's default; never set `rejectUnauthorized: false`) |
| Feed | `GET <feed URL>` | `200`, `Content-Type` starts with `application/rss+xml`, body parses with the XML library, the new item's `guid` is present, and its `<enclosure url>` equals the MP3 URL being checked |
| MP3 ranges | `GET <mp3 URL>` with `Range: bytes=0-1` | `206` ([RFC 9110 §15.3.7](https://www.rfc-editor.org/rfc/rfc9110#section-15.3.7)), `Content-Type: audio/mpeg`, `Content-Range: bytes 0-1/<total>` ([§14.4](https://www.rfc-editor.org/rfc/rfc9110#section-14.4)) with `<total>` = the enclosure `length` = the local file's byte size, and a 2-byte body |
| Path is public | socket `remoteAddress` | equals the pinned public IP (and optionally `X-Podfeed-Via: ?1`) |

Notes:

- A `200` with the full body instead of `206` means ranges are broken (the `Range` header was ignored, see [RFC 9110 §14.2](https://www.rfc-editor.org/rfc/rfc9110#section-14.2)), so seeking in Pocket Casts would fail. Abort the download and report it.
- `Content-Range` total is a better check than `HEAD` `Content-Length`: it checks the range path that players actually use, and it moves only 2 bytes. That matters because Funnel has "non-configurable bandwidth limits" ([Funnel KB, limitations](https://tailscale.com/kb/1223/funnel)), and public-path throughput as low as 20–40 KB/s has been reported ([tailscale#22486](https://github.com/tailscale/tailscale/issues/22486)).
- Test **every** returned address, IPv4 and IPv6. Pocket Casts may get any of them. Report per address: all pass = ok; some fail = warn; none pass = fail. If the Mac has no IPv6 route (`ENETUNREACH` / `EHOSTUNREACH`), mark the IPv6 addresses as skipped, not failed.
- Use short timeouts: about 5 s to connect and 15 s per request. Stalled relays accept TCP and then hang (section 6).

## 6. Failure modes and what they mean

| Symptom | Likely cause | Source |
|---|---|---|
| Public resolvers return NXDOMAIN; authoritative `ns1.dnsimple.com` does too | Public record missing: Funnel not enabled, under 10 min since enabling, or a Tailscale-side registration loss (one fix: toggle Funnel off and on) | [Funnel KB](https://tailscale.com/kb/1223/funnel); [#21502](https://github.com/tailscale/tailscale/issues/21502); [#21746](https://github.com/tailscale/tailscale/issues/21746); [#21114](https://github.com/tailscale/tailscale/issues/21114) |
| One resolver returns NXDOMAIN, others and the authoritative server return addresses | Cached bogus negative answer (300 s TTL); retry with another resolver | [#20892](https://github.com/tailscale/tailscale/issues/20892) |
| Resolver answer is `100.x` / `fd7a:115c:a1e0::` | Query went through MagicDNS (wrong resolver); a bug in the CLI | [MagicDNS](https://tailscale.com/docs/features/magicdns) |
| DNS query to 1.1.1.1/8.8.8.8 times out | Network blocks third-party DNS; use the DoH fallback | [#16558](https://github.com/tailscale/tailscale/issues/16558) |
| TCP connects, then the TLS handshake stalls or hits EOF on all addresses | Ingress cannot reach the node: lost ingress registration after a control reconnect, or packet-filter drops of ingress peers. Restarting `tailscaled` / toggling Funnel on the NAS has fixed it | [#19290](https://github.com/tailscale/tailscale/issues/19290); [#21114](https://github.com/tailscale/tailscale/issues/21114); [#21671](https://github.com/tailscale/tailscale/issues/21671) |
| Same, but only some addresses | A single relay is unhealthy (seen for ~6 min after a new record, and as multi-second handshakes on one region); warn rather than fail | [#21502 comment](https://github.com/tailscale/tailscale/issues/21502); [#22576](https://github.com/tailscale/tailscale/issues/22576) |
| TLS verifies, HTTP 502 | Funnel works, but the backend (nginx) is down or the proxy target is wrong | Funnel proxy behaviour, [serve.go](https://github.com/tailscale/tailscale/blob/445df50dcf76b6172dc4688c2097c47878f41641/ipn/ipnlocal/serve.go) |
| `404` on the feed | Wrong secret path, or the feed was not renamed into place | — |
| `200` instead of `206` on the range request | Range support broken between the client and nginx | [RFC 9110 §14.2](https://www.rfc-editor.org/rfc/rfc9110#section-14.2) |
| `Content-Range` total ≠ enclosure `length` | Partial or stale upload, or the wrong file at that URL | — |
| Works pinned, but the phone can't load it | Not a Funnel problem: phone-side DNS, or Pocket Casts caching | — |

## 7. External fetch service as a fallback

It is not needed, because section 3 shows the Mac can use the ingress directly, and it has a real cost. The feed and MP3 URLs contain the **secret path segment**, so giving them to a third-party "fetch this URL" service leaks the secret. If a fallback is ever wanted, for example when the Mac's network blocks the ingress, it should only probe a path that carries no secret. One example is `https://<host>/`, where nginx answers 404. That proves Funnel → NAS → nginx works, but not the feed itself. Manual proof is a phone with Wi-Fi off, which the map's phase 1 exit test already requires.

## 8. Unknowns

- **Relay-side filtering is unverified in code.** The ingress relay is not open source. Observations show tailnet and same-LAN clients are accepted ([#22486](https://github.com/tailscale/tailscale/issues/22486), the mutschler.dev guide, the local experiment), but Tailscale does not promise this anywhere I found.
- **The Funnel node probing itself** through the ingress failed in one report (mutschler.dev). That does not apply while the check runs on the Mac. It would apply if the check ever moved onto the NAS (for example a cron watchdog like the one in [#21114](https://github.com/tailscale/tailscale/issues/21114)). Untested.
- **`Tailscale-Funnel-Request`** is a source-level detail, not a documented contract. It could change.
- **Whether the NAS Funnel uses proxy mode or TCP pass-through** is decided by the hosting ticket. It decides whether §4.3 is available.

## Sources

- Tailscale docs: [Funnel](https://tailscale.com/kb/1223/funnel), [MagicDNS](https://tailscale.com/docs/features/magicdns), [Serve](https://tailscale.com/docs/features/tailscale-serve), [Tailscale IP addresses](https://tailscale.com/docs/concepts/tailscale-ip-addresses), [`tailscale funnel` CLI](https://tailscale.com/docs/reference/tailscale-cli/funnel)
- Tailscale blog: [Introducing Tailscale Funnel](https://tailscale.com/blog/introducing-tailscale-funnel) (2022-11-17), [Funnel now available in beta](https://tailscale.com/blog/tailscale-funnel-beta) (2023-03-30)
- Tailscale source at [`445df50`](https://github.com/tailscale/tailscale/tree/445df50dcf76b6172dc4688c2097c47878f41641): `ipn/ipnlocal/serve.go`, `ipn/ipnlocal/peerapi.go`
- Tailscale issues: [#16558](https://github.com/tailscale/tailscale/issues/16558) (`ts.net` split DNS, Tailscale staff answer), [#19290](https://github.com/tailscale/tailscale/issues/19290), [#20892](https://github.com/tailscale/tailscale/issues/20892), [#21114](https://github.com/tailscale/tailscale/issues/21114), [#21502](https://github.com/tailscale/tailscale/issues/21502), [#21671](https://github.com/tailscale/tailscale/issues/21671), [#21746](https://github.com/tailscale/tailscale/issues/21746), [#22486](https://github.com/tailscale/tailscale/issues/22486), [#22576](https://github.com/tailscale/tailscale/issues/22576)
- Node.js docs: [dns](https://nodejs.org/api/dns.html), [net](https://nodejs.org/api/net.html), [http](https://nodejs.org/api/http.html), [https](https://nodejs.org/api/https.html), [globals `fetch`](https://nodejs.org/api/globals.html#custom-dispatcher)
- undici at [`1e0bea9`](https://github.com/nodejs/undici/tree/1e0bea9fb57720118866fe4b6ce3fb9263596add): `docs/docs/api/Client.md`, `lib/core/connect.js`
- curl: [`--resolve`](https://curl.se/docs/manpage.html#--resolve), [`--connect-to`](https://curl.se/docs/manpage.html#--connect-to)
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) §14.2 Range, §14.4 Content-Range, §15.3.7 206 Partial Content
- [Cloudflare DoH JSON API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)
- Secondary: [mutschler.dev home-server guide, §9.3](https://mutschler.dev/linux/wyse-ubuntu-nextcloud-aio/)
- Local experiments, 2026-11-25: `dig` against `1.1.1.1` and `ns1.dnsimple.com`; `route -n get`; `curl --resolve` to third-party Funnel hosts named in public Tailscale issues (names withheld); a Node 24.22 pinned-lookup script against a neutral public host.
