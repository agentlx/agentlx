# Security Policy

agentlx can execute remote commands on connected Linux machines. Treat every production deployment as privileged infrastructure.

## Reporting a Vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Report privately through GitHub Security Advisories or by contacting the project maintainers through the security contact published by the repository owner.

Include:

- affected version;
- deployment mode;
- reproduction steps;
- impact;
- logs or screenshots with secrets redacted.

## Supported Versions

Until `v1.0.0`, security fixes target the latest released `0.x` version.

## Deployment Guidance

- Use HTTPS in production.
- Use a real `APP_ORIGIN`.
- Prefer Docker Secrets or another secret manager for sensitive values.
- Restrict database network access.
- Enable MFA for administrators.
- Keep audit logs and database backups.
- Pin production deployments to a versioned image instead of `latest`.
