# tickward MCP

OAuth MCP server for the tickward public API.

The server is intentionally a thin edge adapter. It does not connect to the
tickward database and does not implement business logic. Tools call the
versioned REST API under `/api/v1` after the user completes the tickward account
consent flow.

## Remote Worker

The public MCP transport runs as a Cloudflare Worker and uses OAuth 2.1 with
PKCE through `workers-oauth-provider`.

MCP clients connect to the Worker URL:

```text
https://mcp.example.com/mcp
```

During connection, the Worker redirects the user to the configured tickward app.
The user signs in, approves the requested scopes, and tickward issues a scoped
MCP connection credential through a one-time grant exchange.

## Local Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
curl http://localhost:8787/healthz
curl http://localhost:8787/.well-known/oauth-protected-resource
```

For local development against a self-hosted tickward app, copy
`.dev.vars.example` to `.dev.vars` and point `TICKWARD_APP_BASE_URL` plus
`TICKWARD_API_BASE_URL` at that app.

For the deployment sequence, use
[`docs/cloudflare-deployment.md`](docs/cloudflare-deployment.md).

## Development

```bash
npm run check
```

This runs the Node version guard, Biome, TypeScript, unit tests, and a Worker
dry-run bundle.
