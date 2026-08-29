# Security Policy

## Supported version

Security fixes are applied to the current `main` branch. Older branches, phase branches, and archived implementation snapshots are not supported release lines.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue, pull request, discussion, or commit message.

Use GitHub's private vulnerability reporting flow from the repository **Security** tab when it is available. If private vulnerability reporting is unavailable, contact the repository maintainers privately before publishing technical details.

Include enough information to reproduce and assess the issue safely:

- affected surface and route or component;
- impact and required attacker capabilities;
- minimal reproduction steps;
- relevant logs or request/response metadata with secrets removed;
- any known mitigation or workaround.

Never include production credentials, access tokens, session cookies, private customer data, or other secrets in a report.

## Coordinated disclosure

Please allow maintainers time to validate the report, prepare a fix, and coordinate rollout before public disclosure. Release notes should describe the security impact without publishing active secrets or exploit material that would unnecessarily increase risk to unpatched deployments.
