# Changelog

All notable changes to agentlx will be documented in this file.

The project uses semantic versioning.

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
