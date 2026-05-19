# Docker Secrets

agentlx supports secrets through the common `*_FILE` pattern.

If both a direct variable and a file variable are present, the direct variable wins:

```text
AGENTLX_PENDING_TOKEN_SECRET
AGENTLX_PENDING_TOKEN_SECRET_FILE
```

Supported sensitive file variables include:

- `POSTGRES_PASSWORD_FILE`
- `DATABASE_URL_FILE`
- `AGENTLX_PENDING_TOKEN_SECRET_FILE`
- `AGENTLX_MFA_ENCRYPTION_SECRET_FILE`
- `AGENTLX_MFA_ENCRYPTION_SECRET_PREVIOUS_FILE`

The Docker Secrets example lives at:

```text
deploy/docker-compose.secrets.yml
```

Generate secret files:

```bash
node scripts/generate-secrets.mjs --format files --output-dir secrets
chmod 600 secrets/*.txt
```

Keep `secrets/` out of version control.
