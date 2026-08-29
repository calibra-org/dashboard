# Security Policy

## Supported release line

Security fixes are applied to the current `main` branch. Older phase branches and archived implementation snapshots are not supported release lines.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue, pull request, discussion, or commit message.

Use GitHub's private vulnerability reporting flow from the repository **Security** tab when it is available. If private vulnerability reporting is unavailable, contact the repository maintainers privately before publishing technical details.

Include only the information needed to reproduce and assess the issue safely:

- affected surface, route, or component;
- impact and required attacker capabilities;
- minimal reproduction steps;
- relevant request/response metadata or logs with secrets removed;
- any known mitigation or workaround.

Never include production credentials, access tokens, session cookies, private customer data, or other secrets in a report.

## Coordinated disclosure

Allow maintainers time to validate the report, prepare a fix, and coordinate rollout before public disclosure. Release notes should describe security impact without publishing active secrets or unnecessary exploit material.
