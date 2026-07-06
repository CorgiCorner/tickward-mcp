import type { AuthRequest, ClientInfo, OAuthHelpers } from "@cloudflare/workers-oauth-provider"

import { exchangeMcpAuthorizationGrant, type McpAuthorizationExchange } from "../api/client.js"
import type { WorkerConfig } from "../config/urls.js"
import { DEFAULT_OAUTH_SCOPES, OAUTH_SCOPES, type OAuthScope } from "../constants.js"
import { shortSha256 } from "../utils/crypto.js"
import { escapeHtml, htmlResponse, jsonResponse } from "../utils/http.js"

export type TickwardOAuthProps = {
  accessToken: string
  apiBaseUrl: string
  label: string
  scopes: OAuthScope[]
}

export type AuthorizeContext = {
  config: WorkerConfig
  helpers: OAuthHelpers
  oauthKv: KVNamespace
  request: Request
}

type StoredAuthorizationHandoff = {
  clientName: string | null
  createdAt: string
  expiresAt: string
  scopes: OAuthScope[]
  search: string
}

const HANDOFF_PREFIX = "mcp-oauth-handoff:"
const HANDOFF_TTL_SECONDS = 10 * 60
const TRUSTED_CIMD_CLIENT_TTL_SECONDS = 90 * 24 * 60 * 60
const OAUTH_SCOPE_SET = new Set<string>(OAUTH_SCOPES)

export async function startFirstPartyAuthorization(context: AuthorizeContext) {
  const oauthRequest = await parseAuthRequestOrError(context.helpers, context.request, context.oauthKv)
  if (oauthRequest instanceof Response) return oauthRequest

  const client = await lookupClientOrError(context.helpers, oauthRequest.clientId)
  if (client instanceof Response) return client
  if (!client) {
    return htmlResponse(renderAuthorizeError("This MCP client is not registered."), { status: 400 })
  }

  const handoff = crypto.randomUUID()
  const scopes = requestedScopes(oauthRequest)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + HANDOFF_TTL_SECONDS * 1000)
  const requestUrl = new URL(context.request.url)
  const value: StoredAuthorizationHandoff = {
    clientName: client.clientName || null,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    scopes,
    search: requestUrl.search,
  }

  await context.oauthKv.put(handoffKey(handoff), JSON.stringify(value), { expirationTtl: HANDOFF_TTL_SECONDS })

  const redirectUrl = new URL("/mcp/authorize", context.config.appBaseUrl)
  redirectUrl.searchParams.set("handoff", handoff)
  redirectUrl.searchParams.set("mcp_origin", requestUrl.origin)
  return Response.redirect(redirectUrl.toString(), 302)
}

export async function completeFirstPartyAuthorization(context: AuthorizeContext) {
  const callbackUrl = new URL(context.request.url)
  const handoff = normalizeHandoffId(callbackUrl.searchParams.get("handoff"))
  const grant = callbackUrl.searchParams.get("grant")?.trim()
  if (!handoff || !grant) {
    return htmlResponse(renderAuthorizeError("MCP authorization callback is invalid."), { status: 400 })
  }

  const stored = await readStoredHandoff(context.oauthKv, handoff)
  if (!stored) {
    return htmlResponse(renderAuthorizeError("MCP authorization request expired."), { status: 400 })
  }

  let exchange: McpAuthorizationExchange
  try {
    exchange = await exchangeMcpAuthorizationGrant({
      apiBaseUrl: context.config.apiBaseUrl,
      grant,
      userAgent: "tickward-mcp/oauth-grant-exchange",
    })
  } catch {
    return htmlResponse(renderAuthorizeError("Tickward rejected this MCP authorization grant."), { status: 401 })
  }

  const reconstructed = new Request(`${callbackUrl.origin}/authorize${stored.search}`, context.request)
  const oauthRequest = await parseAuthRequestOrError(context.helpers, reconstructed, context.oauthKv)
  if (oauthRequest instanceof Response) return oauthRequest

  const client = await lookupClientOrError(context.helpers, oauthRequest.clientId)
  if (client instanceof Response) return client
  if (!client) {
    return htmlResponse(renderAuthorizeError("This MCP client is not registered."), { status: 400 })
  }

  const requested = requestedScopes(oauthRequest)
  const grantedScopes = requested.filter((scope) => exchange.connection.scopes.includes(scope))
  if (grantedScopes.length !== requested.length) {
    return htmlResponse(renderAuthorizeError("Tickward granted different MCP scopes than requested."), { status: 401 })
  }
  const label = exchange.connection.client_name || client.clientName || "tickward MCP"
  const props = {
    accessToken: exchange.token,
    apiBaseUrl: context.config.apiBaseUrl,
    label,
    scopes: grantedScopes,
  } satisfies TickwardOAuthProps

  const { redirectTo } = await context.helpers.completeAuthorization({
    metadata: {
      clientName: client.clientName,
      connectionId: exchange.connection.id,
    },
    props,
    request: oauthRequest,
    scope: grantedScopes,
    userId: await userIdForTickwardUser(exchange.user.id),
  })

  await context.oauthKv.delete(handoffKey(handoff))
  return Response.redirect(redirectTo, 302)
}

export async function renderAuthorizationHandoff(context: { oauthKv: KVNamespace; request: Request }) {
  const url = new URL(context.request.url)
  const handoff = normalizeHandoffId(url.pathname.split("/").pop())
  if (!handoff) return jsonResponse({ error: { message: "Not found.", type: "not_found" } }, { status: 404 })

  const stored = await readStoredHandoff(context.oauthKv, handoff)
  if (!stored) return jsonResponse({ error: { message: "Not found.", type: "not_found" } }, { status: 404 })

  return jsonResponse({
    client_name: stored.clientName,
    expires_at: stored.expiresAt,
    handoff,
    object: "mcp_authorization_handoff",
    scopes: stored.scopes,
  })
}

export function parseOAuthProps(value: unknown): TickwardOAuthProps {
  if (!value || typeof value !== "object") throw new Error("Missing OAuth props.")
  const props = value as Partial<TickwardOAuthProps>
  if (typeof props.accessToken !== "string") throw new Error("Missing OAuth access token.")
  if (typeof props.apiBaseUrl !== "string") throw new Error("Missing OAuth API base URL.")
  const scopes = Array.isArray(props.scopes) ? props.scopes.filter(isOAuthScope) : DEFAULT_OAUTH_SCOPES

  return {
    accessToken: props.accessToken,
    apiBaseUrl: props.apiBaseUrl,
    label: typeof props.label === "string" ? props.label : "tickward MCP",
    scopes,
  }
}

export async function userIdForTickwardUser(userId: string) {
  return `tickward-user-${await shortSha256(userId)}`
}

function requestedScopes(request: AuthRequest): OAuthScope[] {
  const scopes = request.scope.filter(isOAuthScope)
  return scopes.length > 0 ? scopes : DEFAULT_OAUTH_SCOPES
}

function isOAuthScope(value: unknown): value is OAuthScope {
  return typeof value === "string" && OAUTH_SCOPE_SET.has(value)
}

async function parseAuthRequestOrError(helpers: OAuthHelpers, request: Request, oauthKv: KVNamespace) {
  let error: unknown
  try {
    return await helpers.parseAuthRequest(request)
  } catch (caught) {
    error = caught
  }

  if (isInvalidClientError(error) && (await registerTrustedCimdClient(oauthKv, request))) {
    try {
      return await helpers.parseAuthRequest(request)
    } catch (caught) {
      error = caught
    }
  }

  return htmlResponse(renderAuthorizeError(authRequestErrorMessage(error)), { status: 400 })
}

async function lookupClientOrError(helpers: OAuthHelpers, clientId: string) {
  try {
    return await helpers.lookupClient(clientId)
  } catch (error) {
    return htmlResponse(renderAuthorizeError(authRequestErrorMessage(error)), { status: 400 })
  }
}

function authRequestErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (/Invalid client/i.test(message)) {
    return "This MCP client is not registered. Use Dynamic Client Registration in your MCP client settings."
  }
  if (/redirect URI/i.test(message)) return "This MCP client sent an invalid redirect URI."
  if (/PKCE|code challenge/i.test(message)) return "This MCP client sent an invalid PKCE challenge."
  return "This MCP authorization request is invalid."
}

function isInvalidClientError(error: unknown) {
  return error instanceof Error && /Invalid client/i.test(error.message)
}

async function registerTrustedCimdClient(oauthKv: KVNamespace, request: Request) {
  const client = trustedChatGptCimdClient(request)
  if (!client) return false

  await oauthKv.put(`client:${client.clientId}`, JSON.stringify(client), {
    expirationTtl: TRUSTED_CIMD_CLIENT_TTL_SECONDS,
  })
  return true
}

function trustedChatGptCimdClient(request: Request): ClientInfo | null {
  const requestUrl = new URL(request.url)
  const clientId = requestUrl.searchParams.get("client_id")?.trim()
  const redirectUri = requestUrl.searchParams.get("redirect_uri")?.trim()
  if (!clientId || !redirectUri) return null
  if (requestUrl.searchParams.get("response_type") !== "code") return null
  if (requestUrl.searchParams.get("code_challenge_method") !== "S256") return null
  if (!requestUrl.searchParams.get("code_challenge")) return null

  const clientIdUrl = safeUrl(clientId)
  if (clientIdUrl?.origin !== "https://chatgpt.com") return null
  if (clientIdUrl.username || clientIdUrl.password || clientIdUrl.port) return null
  if (clientIdUrl.hash) return null

  const match = /^\/oauth\/([A-Za-z0-9_-]{6,128})\/client\.json$/.exec(clientIdUrl.pathname)
  if (!match) return null

  for (const key of clientIdUrl.searchParams.keys()) {
    if (key !== "token_endpoint_auth_method") return null
  }
  const tokenEndpointAuthMethods = clientIdUrl.searchParams.getAll("token_endpoint_auth_method")
  if (tokenEndpointAuthMethods.length > 1) return null
  if (tokenEndpointAuthMethods[0] && tokenEndpointAuthMethods[0] !== "none") return null

  const redirectUrl = safeUrl(redirectUri)
  if (redirectUrl?.origin !== "https://chatgpt.com") return null
  if (redirectUrl.username || redirectUrl.password || redirectUrl.port) return null
  if (redirectUrl.search || redirectUrl.hash) return null
  if (redirectUrl.pathname !== `/connector/oauth/${match[1]}`) return null

  return {
    clientId,
    clientName: "ChatGPT",
    clientUri: "https://chatgpt.com",
    grantTypes: ["authorization_code"],
    redirectUris: [redirectUri],
    registrationDate: Math.floor(Date.now() / 1000),
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "none",
  }
}

function safeUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function normalizeHandoffId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null
}

function handoffKey(handoff: string) {
  return `${HANDOFF_PREFIX}${handoff}`
}

async function readStoredHandoff(oauthKv: KVNamespace, handoff: string): Promise<StoredAuthorizationHandoff | null> {
  const text = await oauthKv.get(handoffKey(handoff))
  if (!text) return null

  try {
    const value = JSON.parse(text) as Partial<StoredAuthorizationHandoff>
    const scopes = Array.isArray(value.scopes) ? value.scopes.filter(isOAuthScope) : []
    if (typeof value.search !== "string" || !value.search.startsWith("?")) return null
    if (typeof value.expiresAt !== "string" || new Date(value.expiresAt).getTime() <= Date.now()) return null
    return {
      clientName: typeof value.clientName === "string" ? value.clientName : null,
      createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
      expiresAt: value.expiresAt,
      scopes: scopes.length > 0 ? scopes : DEFAULT_OAUTH_SCOPES,
      search: value.search,
    }
  } catch {
    return null
  }
}

function renderAuthorizeError(message: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>tickward MCP authorization failed</title>
  </head>
  <body>
    <main>
      <h1>Authorization failed</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`
}
