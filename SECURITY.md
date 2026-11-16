# Security policy

Katei holds private household data: names, birthdays, money streams and
appointments. Security reports are taken seriously and handled privately.

## Supported versions

Katei ships as a rolling release. Only the latest image
(`ghcr.io/jigle/katei:latest`, built from `main`) receives fixes. Please make
sure you can reproduce an issue on it before reporting.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a security
problem.**

Report it privately through GitHub:
[**Report a vulnerability**](https://github.com/JIGLE/Katei/security/advisories/new).

Please include:

- what is affected (an endpoint, a screen, the container setup),
- steps to reproduce or a proof of concept,
- the impact you expect (for example, reading another household member's data
  or a shared gift list beyond what the link grants).

You can expect an acknowledgement within 7 days and a status update at least
every 14 days until the issue is resolved. Once a fix is released, the advisory
is published and you are credited unless you prefer otherwise.

## Scope

In scope: the Katei application, its API, the Docker image and the scripts in
this repository.

Out of scope: the security of the host you deploy on (TrueNAS, a reverse proxy,
Cloudflare Tunnel), third-party services you configure (such as an ntfy server),
and findings that require an already-compromised host or admin account.

## Deployment hardening

- Set a strong `POSTGRES_PASSWORD` and a long random `JWT_SECRET`.
- Expose Katei only over HTTPS, through a reverse proxy or tunnel.
- Keep the image up to date; dependency updates are automated with Dependabot.
- Store off-box copies of backups (Settings → Backups) somewhere private.
