# Production Hardening

agentlx is privileged infrastructure because it can execute commands on connected Linux machines.

Use this checklist before production:

- Use HTTPS and a public `APP_ORIGIN`.
- Set `AGENTLX_TRUST_PROXY=true` when publishing behind a reverse proxy that forwards `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-Port`.
- Keep the panel behind trusted authentication and network boundaries.
- Enable MFA for all administrators.
- Prefer Docker Secrets or an external secret manager.
- Do not expose PostgreSQL to the public internet.
- Use strong unique database credentials.
- Keep `AGENTLX_SEED_ON_BOOT=false`.
- Pin Docker images to a version and digest, for example `ghcr.io/agentlx/agentlx:v1.0.14@sha256:d0eeb7980e720638fcb42b1b71efa003d2b8b97a014304cf45f597070e8f2b57`.
- Avoid `latest` in production.
- Check `/api/health` after deploy and confirm `resourceLimitEnforcement.status` and `terminalSessionLimitEnforcement.status` are `ok`.
- Review command templates before execution.
- Restrict user permissions and machine groups.
- Monitor audit logs.
- Back up PostgreSQL regularly.
- Test restore procedures.
- Keep host clocks synchronized for signed agent requests and MFA.

Report vulnerabilities privately according to `SECURITY.md`.
