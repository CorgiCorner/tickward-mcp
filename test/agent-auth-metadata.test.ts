import { describe, expect, it } from "vitest"

import { buildAgentAuthMetadata, withAgentAuthMetadata } from "../src/worker/agent-auth-metadata.js"

const env = {
  TICKWARD_APP_BASE_URL: "https://tickward.test",
  TICKWARD_API_BASE_URL: "https://tickward.test/api/v1",
}

function metadataRequest(path = "/.well-known/oauth-authorization-server") {
  return new Request(`https://mcp.tickward.test${path}`)
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  })
}

describe("buildAgentAuthMetadata", () => {
  it("describes anonymous registration against the real OAuth endpoints", () => {
    expect(
      buildAgentAuthMetadata({ issuerOrigin: "https://mcp.tickward.test", appBaseUrl: "https://tickward.test" }),
    ).toEqual({
      skill: "https://tickward.test/auth.md",
      register_uri: "https://mcp.tickward.test/oauth/register",
      identity_types_supported: ["anonymous"],
      anonymous: {
        credential_types_supported: ["oauth_client_credentials"],
        claim_uri: "https://mcp.tickward.test/authorize",
      },
      claim_uri: "https://mcp.tickward.test/authorize",
    })
  })
})

describe("withAgentAuthMetadata", () => {
  it("adds agent_auth to authorization server metadata responses", async () => {
    const upstream = jsonResponse({ issuer: "https://mcp.tickward.test" })

    const response = await withAgentAuthMetadata(metadataRequest(), env, upstream)
    const body = (await response.json()) as Record<string, unknown>

    expect(body.issuer).toBe("https://mcp.tickward.test")
    expect(body.agent_auth).toMatchObject({
      skill: "https://tickward.test/auth.md",
      register_uri: "https://mcp.tickward.test/oauth/register",
      identity_types_supported: ["anonymous"],
      anonymous: {
        credential_types_supported: ["oauth_client_credentials"],
        claim_uri: "https://mcp.tickward.test/authorize",
      },
    })
  })

  it("handles RFC 8414 path-suffixed metadata documents", async () => {
    const upstream = jsonResponse({ issuer: "https://mcp.tickward.test" })

    const response = await withAgentAuthMetadata(
      metadataRequest("/.well-known/oauth-authorization-server/mcp"),
      env,
      upstream,
    )
    const body = (await response.json()) as Record<string, unknown>

    expect(body.agent_auth).toBeDefined()
  })

  it("passes through other paths untouched", async () => {
    const upstream = jsonResponse({ resource: "https://mcp.tickward.test" })

    const response = await withAgentAuthMetadata(
      metadataRequest("/.well-known/oauth-protected-resource"),
      env,
      upstream,
    )

    expect(response).toBe(upstream)
  })

  it("passes through error responses untouched", async () => {
    const upstream = jsonResponse({ error: "not_found" }, { status: 404 })

    const response = await withAgentAuthMetadata(metadataRequest(), env, upstream)

    expect(response).toBe(upstream)
  })

  it("passes through non-JSON responses untouched", async () => {
    const upstream = new Response("<html></html>", { headers: { "content-type": "text/html" } })

    const response = await withAgentAuthMetadata(metadataRequest(), env, upstream)

    expect(response).toBe(upstream)
  })
})
