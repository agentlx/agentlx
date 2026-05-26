# Changelog

All notable changes to agentlx will be documented in this file.

The project uses semantic versioning.

## 1.0.12 - 2026-05-26

### Added

- Expose build provenance metadata in health and deployment status responses.
- Add resource-limit enforcement integrity checks to the health response.
- Add official build metadata to the Docker image runtime environment.
- Document digest-pinned image deployment for production installs.

## 1.0.11 - 2026-05-26

### Changed

- Move machine, group and template scale limits behind the Enterprise provider contract.
- Limit AgentLX Community to 10 registered machines, 10 templates and 10 machine groups.
- Enforce machine limits both when generating pending enrollments and when an agent registers a new machine.
- Add database-level enforcement for the official Community resource limits.

## 1.0.10 - 2026-05-25

### Changed

- Publish the Community image references as `ghcr.io/agentlx/agentlx:v1.0.10`.
- Move recurring job execution to the Enterprise provider so the public Community image no longer ships the recurring-job implementation.
- Update installation, update and release documentation to point to the current pinned Community image tag.

## 1.0.9 - 2026-05-20

### Changed

- Reduce agent heartbeat payloads by omitting service inventory when the inventory cache has not refreshed.
- Reduce database work on agent authentication by moving expired nonce cleanup out of the per-request hot path.
- Reduce dashboard and template catalog query cost by using lighter machine queries where service aggregation is not needed.
- Reduce terminal WebSocket CPU spikes by increasing the default output batching window and throttling tmux process detection.
- Run retention cleanup in smaller batches to reduce database lock and IO spikes.

### Fixed

- Add an explicit AgentLX `User-Agent` to Python agent HTTP and WebSocket requests to avoid proxy/WAF blocks during registration.

## 1.0.8 - 2026-05-20

### Fixed

- Restore client-side hydration on the login page by allowing the inline scripts required by the TanStack Start SSR runtime in the Content Security Policy.
- Fix the login form remaining disabled after typing credentials in Docker/production builds.

## 1.0.7 - 2026-05-20

### Fixed

- Fix PostgreSQL migration failure when converting `agents.auth_token_issued_at` from `TEXT` to `TIMESTAMPTZ` during database initialization.

## 1.0.6 - 2026-05-19

### Added

- Add versioned database migrations, startup migration tracking, and periodic cleanup for sessions, nonces, enrollment tokens, old inventories, and retained execution output.
- Add login brute-force protection with IP/e-mail rate limiting, progressive temporary lockout, and separate blocked-attempt audit events.
- Add audit integrity verification through chained hashes, HMAC anchors, and the `npm run audit:verify` helper.
- Add cursor-based pagination for machines, execution logs, and audit logs.

### Changed

- Harden HTTP body handling with pre-parse payload limits for JSON, agent result payloads, terminal control requests, uploads, and the Node adapter.
- Harden Linux agent secret storage and systemd service isolation with restricted config permissions and systemd sandboxing directives.
- Harden Docker and production defaults by disabling demo seed on boot, avoiding unsafe default database passwords, keeping Postgres unexposed by default, and supporting validated database SSL CA configuration.
- Store profile photos as binary data and stream HTTP responses instead of buffering full response bodies in the server adapter.

### Fixed

- Fix user creation to insert all expected MFA, profile photo, account status, session version, and timestamp fields.
- Prevent external API and terminal routes from leaking internal `error.message` details.
- Make terminal WebSocket handlers resilient to invalid payloads and add explicit privileged-command confirmations and audit trail events.

## 1.0.5 - 2026-05-19

### Added

- Add `AGENTLX_TRUST_PROXY=true` support for reverse proxy deployments, using `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-Port`, and `X-Forwarded-Ssl` to detect the public origin.
- Expand `/api/deployment-status` with `trustedProxy`, `detectedOrigin`, and forwarded header diagnostics.

### Changed

- Improve deployment lock diagnostics when the perceived request origin does not match `APP_ORIGIN`.
- Document trust proxy configuration in examples, Docker Compose files, installation docs, and hardening checklist.

## 1.0.4 - 2026-05-19

### Fixed

- Block direct HTTP access even when `APP_ORIGIN` is configured with HTTPS, preventing the login page from rendering through an insecure origin.
- Validate the current request origin against `APP_ORIGIN` in the deployment lock and report request-specific lock reasons through `/api/deployment-status`.
- Fix mojibake in machine sync and agent error messages shown to users and audit logs.

## 1.0.3 - 2026-05-19

### Changed

- Center the HTTP deployment lock screen and remove the secondary active-locks panel.

## 0.1.2 - 2026-05-18

### Fixed

- Redirect unauthenticated private routes to `/login` before loading protected data.
- Require explicit first-admin creation through `scripts/create-admin.mjs`.
- Start with a visible locked setup screen when `APP_ORIGIN` is not HTTPS.
- Avoid passing optional bootstrap variables from the Docker Secrets compose example.
- Treat empty optional environment variables as unset during server configuration validation.

## 0.1.0 - 2026-05-18

### Added

- Initial open source release preparation.
- Docker Secrets support through `*_FILE` environment variables.
- Secret generation helper.
- Production Docker Compose examples.
- GitHub CI and release workflow scaffolding.
