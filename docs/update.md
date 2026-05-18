# Updating agentlx

## Server Update

Before updating:

1. Back up PostgreSQL.
2. Snapshot the server if available.
3. Read the release notes.

Update the pinned image tag:

```yaml
image: ghcr.io/agentlx/agentlx:v0.1.1
```

Then run:

```bash
docker compose pull
docker compose up -d
```

The app runs the database schema bootstrap on startup.

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
