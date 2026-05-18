# Production Hardening

agentlx is privileged infrastructure because it can execute commands on connected Linux machines.

Use this checklist before production:

- Use HTTPS and a public `APP_ORIGIN`.
- Keep the panel behind trusted authentication and network boundaries.
- Enable MFA for all administrators.
- Prefer Docker Secrets or an external secret manager.
- Do not expose PostgreSQL to the public internet.
- Use strong unique database credentials.
- Keep `AGENTLX_SEED_ON_BOOT=false`.
- Pin Docker images to a version, for example `ghcr.io/agentlx/agentlx:v0.1.0`.
- Avoid `latest` in production.
- Review command templates before execution.
- Restrict user permissions and machine groups.
- Monitor audit logs.
- Back up PostgreSQL regularly.
- Test restore procedures.
- Keep host clocks synchronized for signed agent requests and MFA.

Report vulnerabilities privately according to `SECURITY.md`.
