import { WorkerEntrypoint } from "cloudflare:workers"
import { type OAuthHelpers, OAuthProvider } from "@cloudflare/workers-oauth-provider"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { McpAgent } from "agents/mcp"

import { createTickwardApiClient } from "./api/client.js"
import { MCP_SERVER_NAME, MCP_SERVER_VERSION, OAUTH_SCOPES } from "./constants.js"
import { registerTickwardTools } from "./mcp/register-tools.js"
import { parseOAuthProps, type TickwardOAuthProps } from "./oauth/authorization.js"
import { defaultHandler } from "./worker/default-handler.js"

type Env = {
  OAUTH_KV: KVNamespace
  OAUTH_PROVIDER: OAuthHelpers
  TICKWARD_APP_BASE_URL?: string
  TICKWARD_API_BASE_URL?: string
  TICKWARD_MCP: DurableObjectNamespace<TickwardMcpAgent>
}

export class TickwardMcpAgent extends McpAgent<Env, Record<string, never>, TickwardOAuthProps> {
  server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION })

  async init() {
    const props = parseOAuthProps(this.props)
    const apiClient = createTickwardApiClient({
      apiBaseUrl: props.apiBaseUrl,
      bearerToken: props.accessToken,
      fetchImpl: fetch,
      userAgent: `tickward-mcp/${MCP_SERVER_VERSION} worker`,
    })

    registerTickwardTools(this.server, { apiClient })
  }
}

class McpApiHandler extends WorkerEntrypoint<Env, TickwardOAuthProps> {
  override async fetch(request: Request) {
    const handler = TickwardMcpAgent.serve("/mcp", {
      binding: "TICKWARD_MCP",
      corsOptions: {
        headers: "Authorization, Content-Type, Mcp-Session-Id",
        methods: "GET, POST, DELETE, OPTIONS",
        origin: "*",
      },
      transport: "streamable-http",
    })

    return handler.fetch(request, this.env, this.ctx)
  }
}

export default new OAuthProvider<Env>({
  accessTokenTTL: 3600,
  allowPlainPKCE: false,
  apiHandler: McpApiHandler,
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientIdMetadataDocumentEnabled: false,
  clientRegistrationEndpoint: "/oauth/register",
  defaultHandler,
  refreshTokenTTL: 2_592_000,
  resourceMatchOriginOnly: true,
  scopesSupported: [...OAUTH_SCOPES],
  tokenEndpoint: "/oauth/token",
})
