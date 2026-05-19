# Changelog

All notable changes to agentlx will be documented in this file.

The project uses semantic versioning.

## 0.1.1 - 2026-05-18

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
