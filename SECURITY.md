# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via this repository's
**Security → Advisories → Report a vulnerability**, rather than opening a public issue.
We'll acknowledge within a few days.

## How usagemeter handles credentials

usagemeter ships **no credentials**. On your own machine it reads your existing Claude Code
OAuth token from `~/.claude/.credentials.json` **at runtime**, and contacts only
`api.anthropic.com` (the same `/api/oauth/usage` endpoint the Claude app uses) plus its own
`localhost` backend. By default it is **read-only** on the credentials file — it never
refreshes or writes it (opt in with `USAGEMETER_ALLOW_REFRESH=1`). No token or usage data
is sent anywhere else or stored in this repository.

## Scope

This is a personal/local monitoring tool that reuses **your own** subscription credentials.
Use it only with your own account.
