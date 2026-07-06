# Changelog

## 0.0.2 - 2026-07-06

### Added

- Add GitHub Actions deployment for the MCP Worker.
- Configure the production MCP custom domain route.

### Security

- Keep Cloudflare account and KV namespace identifiers out of tracked files.

## 0.0.1 - 2026-06-11

### Added

- Initial public AGPL-3.0 release.
- Cloudflare Worker MCP server with OAuth-based remote access.
- Deployment playbook for self-hosted Worker deployments.
- Serve an MCP Server Card at `/.well-known/mcp/server-card.json` for agent discovery.
- Advertise an Auth.md `agent_auth` registration block in the OAuth
  authorization server metadata, describing anonymous agent registration via
  dynamic client registration and the `/authorize` claim flow.

### Fixed

- Prefer dynamic client registration in the OAuth flow.
- Accept ChatGPT client metadata during OAuth client registration.
