# Updating agentlx

## Server Update

Before updating:

1. Back up PostgreSQL.
2. Snapshot the server if available.
3. Read the release notes.

Update the pinned image tag:

```yaml
image: ghcr.io/agentlx/agentlx:v1.0.13
```

For production, prefer the release digest:

```yaml
image: ghcr.io/agentlx/agentlx:v1.0.13@sha256:16f4231c360361a1503cc43f99046a81f5efb77f9d2af9477f202b4c22959222
```

Then run:

```bash
docker compose pull
docker compose up -d
```

The app runs the database schema bootstrap on startup.

Validate build metadata and resource limit enforcement after the container starts:

```bash
curl -fsS https://agentlx.example.com/api/health
curl -fsS https://agentlx.example.com/api/deployment-status
```

## Agent Update

Agents can be updated from the installed machine:

```bash
curl -fsSL https://agentlx.example.com/api/agent/update.sh | sudo bash
```

The updater preserves `config.json`, syncs runtime files from the server manifest, reinstalls Python dependencies when needed, and restarts the `agentlx` service if files changed.

## Rollback

Rollback is deployment-specific:

1. Stop the new app container.
2. Restore the previous Docker image tag.
3. Restore the database backup if the failed update changed data incompatibly.
4. Start the stack again.
