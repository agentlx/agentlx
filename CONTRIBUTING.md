# Contributing to agentlx

Thanks for helping improve agentlx.

## Development Setup

Requirements:

- Node.js 24+
- npm
- PostgreSQL 16+

Common commands:

```bash
npm ci
npm run db:init
npm run dev
```

Use `npm install` or `npm uninstall` only when intentionally changing dependencies.
Commit the resulting `package.json` and `package-lock.json` together.

Quality checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Pull Requests

- Keep changes focused.
- Include documentation updates for user-facing behavior.
- Add tests or verification notes when changing backend, agent, schema, or security-sensitive behavior.
- Do not commit real `.env` files, secrets, logs, database dumps, or generated runtime credentials.

## Security Work

Do not disclose vulnerabilities in public issues. Follow `SECURITY.md`.
