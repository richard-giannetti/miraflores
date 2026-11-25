# Domain switch: miraflorescostatropical.com → Cloudflare

The domain is registered with **acens** (Telefónica's hosting, `servicio-online.net` nameservers),
which also hosts the WordPress site and the `info@` mailbox. Only the website moves to Cloudflare.
The domain stays registered at acens, and email stays on acens' mail servers.

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
3. **acens control panel** → the domain → DNS / nameservers → replace the three `servicio-online.net`
   nameservers with the two Cloudflare gives you. Activation usually takes minutes to a few hours.
4. Once Cloudflare says the domain is **Active**: delete the `@` and `www` A records, then
   **Workers & Pages → miraflores → Settings → Domains & Routes → Add → Custom domain**:
   add `miraflorescostatropical.com`, then `www.miraflorescostatropical.com`.
5. **Rules → Redirect Rules → Create** (template "Redirect from WWW to root"): `www.` → apex, 301,
   keep the path and query string.
6. Check (see below), then do Google Search Console and the Business Profiles.
7. Keep the acens hosting plan (it also carries email) — only cancel the WordPress part after a month,
   and make sure cancelling doesn't remove the mailbox or the domain.

## Checks after the switch

```bash
dig +short miraflorescostatropical.com NS     # Cloudflare nameservers
dig +short miraflorescostatropical.com MX     # still mx.miraflorescostatropical.com
curl -sI https://miraflorescostatropical.com/ | grep -i server          # cloudflare
curl -sI https://www.miraflorescostatropical.com/villa-los-olivos/      # 301 → apex
curl -sI https://miraflorescostatropical.com/blog/ | head -3            # old URLs → 301
```

Send a test email to and from `info@` after the nameservers change.
