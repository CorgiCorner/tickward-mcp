# Cloudflare Worker Deployment Playbook

This playbook deploys the remote tickward MCP Worker to Cloudflare. The Worker
is the MCP/OAuth edge adapter only; tickward data still lives behind the
versioned tickward REST API.

## 1. Prerequisites

- Node.js 22.
- A Cloudflare account with Workers enabled.
- A Cloudflare zone for the MCP hostname, for example `mcp.tickward.com`.
- A reachable tickward app/API domain, for example `https://tickward.com` or
  `https://tickward.com/api/v1`.
- Local source in this folder.

Check local tooling first:

```bash
npm ci
npx wrangler --version
npx wrangler whoami
npm run check
```

Use `npx wrangler login` only if `whoami` says you are not authenticated.

## 2. Create production KV

OAuth clients, grants, and tokens are stored by `workers-oauth-provider` in
Workers KV. Create one namespace per deployment environment:

```bash
npx wrangler kv namespace create OAUTH_KV
```

Use the returned namespace id as a local or CI secret. The committed
`wrangler.jsonc` intentionally keeps a placeholder value so public releases do
not expose deployment-specific Cloudflare identifiers:

```jsonc
"kv_namespaces": [
  {
    "binding": "OAUTH_KV",
    "id": "00000000000000000000000000000000"
  }
]
```

For production deploys, provide the real id through
`CLOUDFLARE_OAUTH_KV_NAMESPACE_ID` and run:

```bash
npm run worker:prepare-production-config
```

Keep local Miniflare data local. Do not reuse production KV for ordinary local
development.

## 3. Configure the Worker hostname

For a dedicated MCP hostname, prefer a Worker Custom Domain. Add a route entry
to `wrangler.jsonc`:

```jsonc
"routes": [
  {
    "pattern": "mcp.example.com",
    "custom_domain": true
  }
]
```

Use your real hostname. The OAuth metadata uses the request origin, so no
separate public-base-url environment variable is required.

## 4. Configure the target tickward API domain

Set the tickward API target in `wrangler.jsonc`:

```jsonc
"vars": {
  "TICKWARD_API_BASE_URL": "https://tickward.com/api/v1"
}
```

Self-hosted deployments can point the MCP Worker at their own tickward domain:

```jsonc
"vars": {
  "TICKWARD_APP_BASE_URL": "https://timers.example.com",
  "TICKWARD_API_BASE_URL": "https://timers.example.com"
}
```

`TICKWARD_API_BASE_URL` accepts either the app origin or the full versioned API
base URL. The Worker normalizes both to `/api/v1`. `TICKWARD_APP_BASE_URL`
controls where the Worker sends users for first-party MCP consent.

This value is not a secret. Do not put tickward API keys in Worker vars or
secrets. Remote MCP authorization should use the tickward account consent flow,
not pasted API keys.

## 5. Durable Object migration

Keep the Durable Object binding and migration in `wrangler.jsonc`:

```jsonc
"durable_objects": {
  "bindings": [
    {
      "name": "TICKWARD_MCP",
      "class_name": "TickwardMcpAgent"
    }
  ]
},
"migrations": [
  {
    "tag": "v1",
    "new_sqlite_classes": ["TickwardMcpAgent"]
  }
]
```

Do not rename or remove Durable Object classes without adding a new migration
entry.

## 6. Deploy

Validate the bundle before the first deploy:

```bash
npm run check
npx wrangler deploy --dry-run
```

Deploy:

```bash
npx wrangler deploy
```

After deployment, watch logs during the first smoke:

```bash
npx wrangler tail tickward-mcp
```

## 7. GitHub Actions deployment

The repository includes `.github/workflows/deploy.yml`, which runs the same
check sequence and deploys the Worker on pushes to `main` or manual
`workflow_dispatch` runs.

Set these GitHub Actions secrets before relying on automatic deploys:

```bash
CLOUDFLARE_ACCOUNT_ID=<cloudflare_account_id>
CLOUDFLARE_API_TOKEN=<cloudflare_api_token>
CLOUDFLARE_OAUTH_KV_NAMESPACE_ID=<production_oauth_kv_namespace_id>
```

Create the token from Cloudflare's Account API tokens page using the
`Edit Cloudflare Workers` permission template, scoped to the production
Cloudflare account and the `tickward.com` zone.

## 8. Smoke test

Replace `https://mcp.example.com` with the deployed custom domain:

```bash
MCP_ORIGIN=https://mcp.example.com

curl -i "$MCP_ORIGIN/healthz"
curl -i "$MCP_ORIGIN/.well-known/oauth-protected-resource"
curl -i "$MCP_ORIGIN/.well-known/oauth-authorization-server"
curl -i "$MCP_ORIGIN/mcp"
```

Expected:

- `/healthz` returns `200`.
- Both well-known OAuth metadata endpoints return `200`.
- `/mcp` without a bearer token returns `401` with `WWW-Authenticate`.

Then run a real MCP client flow:

1. Connect to `$MCP_ORIGIN/mcp`.
2. Let the client complete OAuth authorization.
3. Sign in to tickward and approve the requested MCP scopes.
4. Call read tools first: `tickward_list_projects`, then `tickward_list_timers`.
5. Test mutation tools only against a temporary project.

## 9. Expose the endpoint in tickward

Set this in the tickward app deployment:

```bash
TICKWARD_MCP_REMOTE_URL=https://mcp.example.com/mcp
```

Redeploy tickward. The Settings page will show the remote MCP endpoint when this
variable is configured.

## 10. Rollback

If a deploy is bad:

```bash
npx wrangler rollback tickward-mcp
```

If rollback is not available for the target state, redeploy the previous known
good commit. Do not delete the KV namespace or Durable Object migration while
active clients may still have OAuth grants.

## 11. Release checklist

- `npm run check`
- `npx wrangler deploy --dry-run`
- `npx wrangler deploy`
- `/healthz` smoke
- OAuth metadata smoke
- unauthenticated `/mcp` returns `401`
- authenticated MCP read smoke
- temporary-project create/update/delete smoke
- `TICKWARD_MCP_REMOTE_URL` set in the tickward app
