# Changelog

## 0.0.3 - 2026-07-16

### Added

- Added public issue, pull request, contribution, security, and conduct guidance together with public-safe CI.

### Changed

- Changed the local environment example to publish variable names without endpoint values.
- Pinned the development Node and npm runtime versions for contributors.

### Fixed

- Surfaced Tickward API rate limit errors to MCP clients with a retry hint.
- Hardened Worker runtime dependencies and OAuth authorization handling.

## 0.0.2 - 2026-07-06

### Added

- Configure the production MCP custom domain route.

### Security

- Keep Cloudflare account and KV namespace identifiers out of tracked files.

## 0.0.1 - 2026-06-11

### Added

- Initial public AGPL-3.0 release.
- Cloudflare Worker MCP server with OAuth-based remote access.
- Serve an MCP Server Card at `/.well-known/mcp/server-card.json` for agent discovery.
- Advertise an Auth.md `agent_auth` registration block in the OAuth
  authorization server metadata, describing anonymous agent registration via
  dynamic client registration and the `/authorize` claim flow.

### Fixed

- Prefer dynamic client registration in the OAuth flow.
- Accept ChatGPT client metadata during OAuth client registration.
