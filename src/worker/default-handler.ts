import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider"
import { readWorkerConfig } from "../config/urls.js"
import { MCP_SERVER_NAME, MCP_SERVER_VERSION, OAUTH_SCOPES } from "../constants.js"
import {
  completeFirstPartyAuthorization,
  renderAuthorizationHandoff,
  startFirstPartyAuthorization,
} from "../oauth/authorization.js"
import { jsonResponse } from "../utils/http.js"

export type DefaultHandlerEnv = {
  OAUTH_KV: KVNamespace
  OAUTH_PROVIDER: OAuthHelpers
  TICKWARD_APP_BASE_URL?: string
  TICKWARD_API_BASE_URL?: string
}

export const defaultHandler = {
  async fetch(request: Request, env: DefaultHandlerEnv) {
    const url = new URL(request.url)
    const config = readWorkerConfig(env)

    if (url.pathname === "/" && request.method === "GET") {
      return jsonResponse({
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
        endpoints: {
          authorize: "/authorize",
          health: "/healthz",
          mcp: "/mcp",
          register: "/oauth/register",
          serverCard: "/.well-known/mcp/server-card.json",
          token: "/oauth/token",
        },
        oauth: {
          protected_resource: "/.well-known/oauth-protected-resource",
          scopes_supported: OAUTH_SCOPES,
        },
      })
    }

    if (url.pathname === "/healthz" && request.method === "GET") {
      return jsonResponse({ ok: true, service: MCP_SERVER_NAME, version: MCP_SERVER_VERSION })
    }

    // MCP Server Card (SEP-1649) for agent discovery. The OAuth authorization
    // server and protected-resource metadata are served by OAuthProvider.
    if (url.pathname === "/.well-known/mcp/server-card.json" && request.method === "GET") {
      const origin = new URL(request.url).origin
      return jsonResponse({
        serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        transport: { type: "streamable-http", endpoint: `${origin}/mcp` },
        capabilities: { tools: {} },
        authorization: {
          type: "oauth2",
          resource_metadata: `${origin}/.well-known/oauth-protected-resource`,
        },
      })
    }

    if (url.pathname === "/authorize" && request.method === "GET") {
      return startFirstPartyAuthorization({ config, helpers: env.OAUTH_PROVIDER, oauthKv: env.OAUTH_KV, request })
    }

    if (url.pathname === "/authorize/callback" && request.method === "GET") {
      return completeFirstPartyAuthorization({ config, helpers: env.OAUTH_PROVIDER, oauthKv: env.OAUTH_KV, request })
    }

    if (url.pathname.startsWith("/oauth/handoff/") && request.method === "GET") {
      return renderAuthorizationHandoff({ oauthKv: env.OAUTH_KV, request })
    }

    return jsonResponse({ error: { message: "Not found.", type: "not_found" } }, { status: 404 })
  },
}
