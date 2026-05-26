# Release Process

agentlx uses semantic versioning.

Version format:

```text
vMAJOR.MINOR.PATCH
```

Examples:

- `v0.1.0`: first public release
- `v0.1.1`: compatible fix
- `v0.2.0`: compatible feature release
- `v1.0.0`: first stable production release

## Create a Release

1. Update `CHANGELOG.md`.
2. Ensure CI is green.
3. Create and push a tag:

```bash
git tag v1.0.11
git push origin v1.0.11
```

The release workflow publishes:

```text
ghcr.io/<owner>/agentlx:v1.0.11
ghcr.io/<owner>/agentlx:1.0.10
ghcr.io/<owner>/agentlx:1.0
ghcr.io/<owner>/agentlx:latest
```

Production users should pin a versioned tag, not `latest`.

Before publishing the first public release, complete:

```text
docs/public-release-checklist.md
```
