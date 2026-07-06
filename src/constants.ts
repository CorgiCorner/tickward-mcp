export const MCP_SERVER_NAME = "tickward"
export const MCP_SERVER_VERSION = "0.1.0"

export const DEFAULT_TICKWARD_API_BASE_URL = "https://tickward.com/api/v1"

export const OAUTH_SCOPES = [
  "projects:read",
  "projects:write",
  "timers:read",
  "timers:write",
  "spaces:read",
  "spaces:write",
  "shares:read",
  "shares:write",
  "webhooks:read",
  "webhooks:write",
] as const

export type OAuthScope = (typeof OAUTH_SCOPES)[number]

export const DEFAULT_OAUTH_SCOPES: OAuthScope[] = [
  "projects:read",
  "timers:read",
  "spaces:read",
  "shares:read",
  "webhooks:read",
]
