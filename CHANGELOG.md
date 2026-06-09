# Changelog

## Unreleased

No unreleased public changes.

## 0.0.3 - 2026-06-09

### Added

- Advertise an Auth.md `agent_auth` registration block in the OAuth
  authorization server metadata, describing anonymous agent registration via
  dynamic client registration and the `/authorize` claim flow.

## 0.0.2 - 2026-06-09

### Added

- Serve an MCP Server Card at `/.well-known/mcp/server-card.json` for agent discovery.

### Fixed

- Prefer dynamic client registration in the OAuth flow.
- Accept ChatGPT client metadata during OAuth client registration.

## 0.0.1 - 2026-06-08

### Added

- Initial public AGPL-3.0 release.
- Cloudflare Worker MCP server with OAuth-based remote access.
- Deployment playbook for self-hosted Worker deployments.
