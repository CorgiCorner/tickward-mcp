import { readWorkerConfig } from "../config/urls.js"

export const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server"

export type AgentAuthMetadataEnv = {
  TICKWARD_APP_BASE_URL?: string
  TICKWARD_API_BASE_URL?: string
}

// Auth.md (https://workos.com/auth-md) agent registration metadata. tickward
// supports anonymous agent registration through standard OAuth dynamic client
// registration (RFC 7591): the agent registers a client without asserting a
// user identity, then a human claims the registration by completing the
// authorization code flow at /authorize.
export function buildAgentAuthMetadata(input: { issuerOrigin: string; appBaseUrl: string }) {
  const claimUri = `${input.issuerOrigin}/authorize`

  return {
    skill: `${input.appBaseUrl}/auth.md`,
    register_uri: `${input.issuerOrigin}/oauth/register`,
    identity_types_supported: ["anonymous"],
    anonymous: {
      credential_types_supported: ["oauth_client_credentials"],
      claim_uri: claimUri,
    },
    claim_uri: claimUri,
  }
}

function isAuthorizationServerMetadataPath(pathname: string) {
  return (
    pathname === AUTHORIZATION_SERVER_METADATA_PATH || pathname.startsWith(`${AUTHORIZATION_SERVER_METADATA_PATH}/`)
  )
}

/**
 * Augments OAuth authorization server metadata responses with the Auth.md
 * `agent_auth` block. The base metadata document is produced by
 * `@cloudflare/workers-oauth-provider`, which offers no extension hook, so the
 * worker post-processes the response instead. Non-matching requests and
 * non-JSON responses pass through untouched.
 */
export async function withAgentAuthMetadata(
  request: Request,
  env: AgentAuthMetadataEnv,
  response: Response,
): Promise<Response> {
  if (request.method !== "GET") return response

  const url = new URL(request.url)
  if (!isAuthorizationServerMetadataPath(url.pathname)) return response
  if (!response.ok) return response

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) return response

  let metadata: Record<string, unknown>
  try {
    metadata = (await response.clone().json()) as Record<string, unknown>
  } catch {
    return response
  }

  const config = readWorkerConfig(env)
  metadata.agent_auth = buildAgentAuthMetadata({
    issuerOrigin: url.origin,
    appBaseUrl: config.appBaseUrl,
  })

  const headers = new Headers(response.headers)
  headers.delete("content-length")

  return new Response(JSON.stringify(metadata), { status: response.status, headers })
}
