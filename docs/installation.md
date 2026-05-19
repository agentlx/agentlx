# agentlx Installation

This guide describes the production-oriented Docker installation path.

## Requirements

- Docker and Docker Compose
- Public DNS name for the app
- Trusted HTTPS reverse proxy
- PostgreSQL 16, either in Compose or external

Production requires:

- `APP_ORIGIN` using HTTPS
- strong secrets
- `AGENTLX_SEED_ON_BOOT=false`
- restricted database network access

If `APP_ORIGIN` uses `http://`, the server still starts but agentlx remains locked. The web UI
shows a setup screen and links to `https://doc.agentlx.com.br`; login, agents, remote terminal, and
panel APIs remain unavailable until HTTPS is configured.

## Generate Secrets

For `.env` based deployments:

```bash
npm run secrets:generate
```

For Docker Secrets:

```bash
node scripts/generate-secrets.mjs --format files --output-dir secrets
chmod 600 secrets/*.txt
```

## Install with Docker Secrets

Create `/opt/agentlx`, copy `deploy/docker-compose.secrets.yml` to `docker-compose.yml`, and create a small `.env` next to it:

```env
APP_ORIGIN=https://agentlx.example.com
APP_TIME_ZONE=UTC
PORT=3000
POSTGRES_DB=agentlx
POSTGRES_USER=agentlx
AGENTLX_SEED_ON_BOOT=false
```

Start the stack:

```bash
docker compose up -d
```

The app container applies the database schema and starts the web server.

## First Admin

agentlx does not create an administrator automatically. After the stack is running, create the first administrator with:

```bash
read -rsp "Admin password: " AGENTLX_ADMIN_PASSWORD
printf '\n'
printf '%s' "$AGENTLX_ADMIN_PASSWORD" | docker compose exec -T app node scripts/create-admin.mjs \
  --name "Admin" \
  --email "admin@example.com" \
  --password-stdin
unset AGENTLX_ADMIN_PASSWORD
```

The same command updates the admin password and permissions if the email already exists.

## Install Linux Agents

Open the panel, go to Machines, generate an enrollment command, and run it on the target Linux machine.

The command downloads the installer from:

```text
https://agentlx.example.com/api/agent/install.sh
```

Agents receive updates from:

```text
https://agentlx.example.com/api/agent/update.sh
```
