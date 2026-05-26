# Public Release Checklist

Use this checklist before publishing a public AgentLX release.

## 1. Repository

- Create or rename the public GitHub repository to `agentlx`.
- Prefer the `agentlx` GitHub organization if the project will live under a dedicated brand.
- Confirm repository visibility is public.
- Confirm Issues are enabled.
- Confirm Actions are enabled.
- Confirm Security Advisories are enabled.
- Confirm Packages are available for the repository or organization.

Expected image path for the dedicated organization:

```text
ghcr.io/agentlx/agentlx:v1.0.13
```

If the repository lives under a different owner, update every image reference in:

- `README.md`
- `docs/*.md`
- `deploy/docker-compose.env.yml`
- `deploy/docker-compose.secrets.yml`

## 2. CI and GHCR

- Push the default branch and wait for CI to pass.
- Confirm CI runs:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run db:init`
  - `npm run build`
  - `docker build -t agentlx:test .`
- Push the release tag only after the clean install test passes.
- After the release workflow publishes the image, open the GHCR package settings and make the package public.

The release workflow publishes:

```text
ghcr.io/<owner>/agentlx:v1.0.13
ghcr.io/<owner>/agentlx:1.0.13
ghcr.io/<owner>/agentlx:1.0
ghcr.io/<owner>/agentlx:latest
```

Production documentation should keep using the pinned `v1.0.13` tag.

## 3. Clean VM Install Test

Run this from a fresh Linux VM before tagging.

1. Install Docker and Docker Compose.
2. Create the deployment directory:

```bash
sudo mkdir -p /opt/agentlx
sudo chown "$USER:$USER" /opt/agentlx
cd /opt/agentlx
```

3. Copy `deploy/docker-compose.secrets.yml` to `docker-compose.yml`.
4. Create the `.env` file:

```env
APP_ORIGIN=https://agentlx.example.com
AGENTLX_TRUST_PROXY=true
APP_TIME_ZONE=UTC
PORT=3000
POSTGRES_DB=agentlx
POSTGRES_USER=agentlx
AGENTLX_SEED_ON_BOOT=false
```

5. Generate secrets:

```bash
node scripts/generate-secrets.mjs --format files --output-dir secrets
chmod 600 secrets/*.txt
```

6. Start the stack:

```bash
docker compose up -d
docker compose logs -f app
```

7. Validate the panel:
   - Open the HTTPS URL.
   - Create the first admin with `scripts/create-admin.mjs`.
   - Sign in with that admin.
   - Enable MFA for the admin.
   - Confirm dashboard and logs load.

8. Validate an agent:
   - Generate an enrollment command in Machines.
   - Run it on a clean Linux machine.
   - Confirm heartbeat and inventory appear.
   - Open the realtime terminal.
   - Run a remote command.
   - Run an agent update with `/api/agent/update.sh`.

9. Validate restart behavior:
   - Run `docker compose restart`.
   - Confirm the panel, WebSocket terminal, and agent heartbeat recover.

## 4. Release

After the VM test is green:

```bash
git tag v1.0.13
git push origin v1.0.13
```

Create GitHub release notes with:

- What is included.
- Installation link.
- Known risks.
- Stability status.
- Upgrade/rollback notes.

## 5. Initial Public Roadmap Issues

Create these starter issues:

- Expand installation docs from the clean VM test.
- Add backend integration tests.
- Add Linux agent tests.
- Create documentation site.
- Improve external PostgreSQL installation docs.
- Add reverse proxy examples.
- Add automated release smoke test.
