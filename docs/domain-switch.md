# Domain switch: miraflorescostatropical.com → Cloudflare

**Done on 2026-11-25.** The website is served by the `miraflores` Worker; DNS is on Cloudflare
(`curt` / `raina.ns.cloudflare.com`).

The domain is registered through **Hostalia** (panel.hostalia.com, registrar acens), which also hosts
the old WordPress site and the `info@` mailbox. The domain is *included* in the Hostalia
"Hosting Standard" plan: cancelling that plan would lose the domain and the email, so don't.
Only the website moved; email stays on Hostalia's mail servers.

## DNS before the switch (checked 2026-11-25)

| Name | Type | Value | Cloudflare proxy |
| --- | --- | --- | --- |
| `@` | MX 10 | `mx.miraflorescostatropical.com` | — |
| `@` | TXT | `v=spf1 redirect=spf.dominioabsoluto.net` | — |
| `mx` | A | `217.116.0.227` | DNS only |
| `smtp` | A | `217.116.0.228` | DNS only |
| `imap` | A | `217.116.0.237` | DNS only |
| `pop3` | A | `217.116.0.237` | DNS only |
| `webmail` | A | `217.116.0.155` | DNS only |
| `ftp` | A | `82.194.68.15` (old WordPress host) | DNS only |
| `@`, `www` | A | `82.194.68.15` (old WordPress host) | replaced by the Worker |

No DNSSEC, no CAA, no DKIM record found. Registration expires 2027-11-10.

## Steps

1. **Cloudflare → Add a domain** → `miraflorescostatropical.com`, Free plan, "Quick scan for DNS records".
2. **Check the imported records** against the table above. Add any that are missing, and set every
   mail record (`mx`, `smtp`, `imap`, `pop3`, `webmail`) and `ftp` to **DNS only** (grey cloud).
   Mail breaks if they're proxied.
3. **Hostalia panel** → Dominios y SSL → the domain → Servidores DNS → Cambiar DNS → replace the three
   `servicio-online.net` nameservers with the two Cloudflare gives you. The .com registry updated in ~2 minutes.
4. Delete the `@` and `www` A records, then
   **Workers & Pages → miraflores → Settings → Domains & Routes → Add → Custom domain**:
   add `miraflorescostatropical.com`, then `www.miraflorescostatropical.com`.
5. **Rules → Redirect Rules → Create** (template "Redirect from WWW to root"): `www.` → apex, 301,
   keep the path and query string (pattern `https://www.miraflorescostatropical.com/*` →
   `https://miraflorescostatropical.com/${1}`). Also turn on **SSL/TLS → Edge Certificates → Always Use HTTPS**.
6. Check (see below), then do Google Search Console and the Business Profiles.
7. Keep the Hostalia plan: it carries the domain and the email. Its WordPress files can simply be left alone.

## Checks after the switch

```bash
dig +short miraflorescostatropical.com NS     # Cloudflare nameservers
dig +short miraflorescostatropical.com MX     # still mx.miraflorescostatropical.com
curl -sI https://miraflorescostatropical.com/ | grep -i server          # cloudflare
curl -sI https://www.miraflorescostatropical.com/villa-los-olivos/      # 301 → apex
curl -sI https://miraflorescostatropical.com/blog/ | head -3            # old URLs → 301
```

Send a test email to and from `info@` after the nameservers change.
