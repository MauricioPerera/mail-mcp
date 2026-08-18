# mail-mcp

[![CI](https://github.com/MauricioPerera/mail-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/MauricioPerera/mail-mcp/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/github/package-json/engines/MauricioPerera/mail-mcp?filename=package.json&label=node)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Self-hosted, provider-agnostic mail service. Point it at any mailbox's IMAP/SMTP
credentials and it exposes:

- **REST API** mirroring the common mailbox operations: list folders, list/get/search
  messages, send, flag, move, delete, quota (best-effort).
- **Webhooks** (`message.received`) via a persistent IMAP IDLE watcher — fires an
  HTTP POST (with a per-webhook bearer secret) whenever new mail arrives, retried
  with exponential backoff (up to 6 attempts) if the receiving endpoint fails.
- **MCP server** (Streamable HTTP, `POST /mcp`) exposing the same operations as tools,
  so any MCP-compatible agent can use it directly.

Multi-mailbox from the start: add as many accounts as you want to `config/accounts.json`.

Request bodies on the REST API are validated with Zod (`lib/schemas.js`) — invalid
payloads get a `422 ERR_VALIDATION_FAILED` with field-level errors instead of reaching
the mail layer. Webhook subscriptions persist in SQLite (`config/webhooks.sqlite`,
via `better-sqlite3`) instead of a flat JSON file. Messages larger than
`MAIL_MCP_MAX_MESSAGE_SIZE` (default 25MB) are returned with `bodyTruncated: true`
and no parsed body/attachments, to avoid loading huge messages into memory.

## Setup

```bash
npm install
cp .env.example .env   # fill in MAIL_MCP_API_TOKEN and one MAILMCP_PASS_<ID> per account
```

Copy `config/accounts.json.example` to `config/accounts.json` (gitignored — no
passwords in this file either, those live only in `.env`):

```json
[
  {
    "id": "example",
    "user": "user@example.com",
    "imap": { "host": "imap.example.com", "port": 993, "secure": true },
    "smtp": { "host": "smtp.example.com", "port": 465, "secure": true }
  }
]
```

The password for account `id: "example"` is read from `MAILMCP_PASS_EXAMPLE`.

```bash
node index.js
```

Runs on `127.0.0.1:4900` by default (see `MAIL_MCP_PORT`). Put it behind a
reverse proxy with TLS if you need to reach it from outside the host.

## systemd

An example unit is in `deploy/mail-mcp.service` — copy it to
`/etc/systemd/system/`, adjust paths, and it loads secrets from `/root/mail-mcp/.env`
via `EnvironmentFile`.

## Auth

Every REST and MCP request requires `Authorization: Bearer <MAIL_MCP_API_TOKEN>`.
