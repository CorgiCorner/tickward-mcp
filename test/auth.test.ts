import { describe, expect, it } from "vitest"

import {
  parseOAuthProps,
  renderAuthorizationHandoff,
  startFirstPartyAuthorization,
  userIdForTickwardUser,
} from "../src/oauth/authorization.js"

describe("OAuth props", () => {
  it("accepts stored tickward OAuth props", () => {
    expect(
      parseOAuthProps({
        accessToken: "mcp_access_secret",
        apiBaseUrl: "https://tickward.test/api/v1",
        label: "Claude",
        scopes: ["projects:read", "timers:write", "unknown"],
      }),
    ).toEqual({
      accessToken: "mcp_access_secret",
      apiBaseUrl: "https://tickward.test/api/v1",
      label: "Claude",
      scopes: ["projects:read", "timers:write"],
    })
  })

  it("rejects missing secrets", () => {
    expect(() => parseOAuthProps({ apiBaseUrl: "https://tickward.test/api/v1" })).toThrow(/access token/)
  })

  it("keeps OAuth user ids free of colon separators used by auth codes", () => {
    return expect(userIdForTickwardUser("user:abc123")).resolves.toMatch(/^tickward-user-[a-f0-9]{24}$/)
  })

  it("starts first-party authorization with a tickward app handoff", async () => {
    const values = new Map<string, string>()
    const oauthKv = {
      get: (key: string) => Promise.resolve(values.get(key) ?? null),
      put: (key: string, value: string) => {
        values.set(key, value)
        return Promise.resolve()
      },
    } as unknown as KVNamespace
    const helpers = {
      lookupClient: () => Promise.resolve({ clientId: "client_123", clientName: "Claude Code" }),
      parseAuthRequest: () => Promise.resolve({ clientId: "client_123", scope: ["projects:read"] }),
    } as never

    const res = await startFirstPartyAuthorization({
      config: { apiBaseUrl: "https://tickward.test/api/v1", appBaseUrl: "https://tickward.test" },
      helpers,
      oauthKv,
      request: new Request(
        "https://mcp.tickward.test/authorize?client_id=client_123&scope=projects%3Aread&redirect_uri=https%3A%2F%2Fclient.test",
      ),
    })

    expect(res.status).toBe(302)
    const location = new URL(res.headers.get("location") ?? "")
    expect(location.origin).toBe("https://tickward.test")
    expect(location.pathname).toBe("/mcp/authorize")
    expect(location.searchParams.get("mcp_origin")).toBe("https://mcp.tickward.test")

    const handoff = location.searchParams.get("handoff")
    expect(handoff).toEqual(expect.any(String))
    const handoffRes = await renderAuthorizationHandoff({
      oauthKv,
      request: new Request(`https://mcp.tickward.test/oauth/handoff/${handoff}`),
    })
    await expect(handoffRes.json()).resolves.toMatchObject({
      client_name: "Claude Code",
      handoff,
      object: "mcp_authorization_handoff",
      scopes: ["projects:read"],
    })
  })
})
