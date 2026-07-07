import { describe, expect, it } from "vitest"

import {
  createTickwardApiClient,
  exchangeMcpAuthorizationGrant,
  query,
  type TickwardApiError,
} from "../src/api/client.js"
import { normalizeApiBaseUrl, readWorkerConfig } from "../src/config/urls.js"

describe("config", () => {
  it("normalizes tickward origins to the v1 API base", () => {
    expect(normalizeApiBaseUrl("https://tickward.com")).toBe("https://tickward.com/api/v1")
    expect(normalizeApiBaseUrl("https://tickward.com/api/v1/")).toBe("https://tickward.com/api/v1")
    expect(normalizeApiBaseUrl("https://example.com/custom")).toBe("https://example.com/custom/api/v1")
  })

  it("reads worker app and API base URLs", () => {
    expect(
      readWorkerConfig({
        TICKWARD_API_BASE_URL: "https://tickward.test/api/v1",
        TICKWARD_APP_BASE_URL: "https://tickward.test/",
      }),
    ).toEqual({
      apiBaseUrl: "https://tickward.test/api/v1",
      appBaseUrl: "https://tickward.test",
    })
  })
})

describe("api client", () => {
  it("builds query strings without empty values", () => {
    expect(query({ after: "", before: undefined, limit: 20 })).toBe("?limit=20")
  })

  it("sends bearer auth and generated idempotency keys", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = []
    const client = createTickwardApiClient({
      apiBaseUrl: "https://tickward.test",
      bearerToken: "mcp_access_secret",
      fetchImpl: async (url, init) => {
        calls.push({ init: init ?? {}, url: url.toString() })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      },
      idFactory: () => "idem_12345678",
    })

    const res = await client.request("/projects", { body: { name: "Main" }, idempotent: true, method: "POST" })

    expect(res).toEqual({ ok: true })
    expect(calls[0]?.url).toBe("https://tickward.test/api/v1/projects")
    expect(new Headers(calls[0]?.init.headers).get("Authorization")).toBe("Bearer mcp_access_secret")
    expect(new Headers(calls[0]?.init.headers).get("Idempotency-Key")).toBe("idem_12345678")
    expect(calls[0]?.init.body).toBe(JSON.stringify({ name: "Main" }))
  })

  it("throws structured API errors", async () => {
    const client = createTickwardApiClient({
      apiBaseUrl: "https://tickward.test",
      bearerToken: "mcp_access_secret",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "No access.", type: "forbidden" } }), { status: 403 }),
    })

    await expect(client.listProjects()).rejects.toMatchObject({
      body: { error: { message: "No access.", type: "forbidden" } },
      message: "No access.",
      name: "TickwardApiError",
      status: 403,
    } satisfies Partial<TickwardApiError>)
  })

  it("surfaces rate limit errors with Retry-After seconds", async () => {
    const client = createTickwardApiClient({
      apiBaseUrl: "https://tickward.test",
      bearerToken: "mcp_access_secret",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "Too many requests.", type: "rate_limited" } }), {
          headers: { "Retry-After": "42" },
          status: 429,
        }),
    })

    await expect(client.listProjects()).rejects.toMatchObject({
      body: { error: { message: "Too many requests.", type: "rate_limited" } },
      message: "Tickward API rate limit reached. Too many requests. Retry after 42s.",
      name: "TickwardApiError",
      status: 429,
    } satisfies Partial<TickwardApiError>)
  })

  it("surfaces rate limit errors without Retry-After seconds", async () => {
    const client = createTickwardApiClient({
      apiBaseUrl: "https://tickward.test",
      bearerToken: "mcp_access_secret",
      fetchImpl: async () => new Response(null, { status: 429 }),
    })

    await expect(client.listProjects()).rejects.toMatchObject({
      body: null,
      message: "Tickward API rate limit reached. Retry later.",
      name: "TickwardApiError",
      status: 429,
    } satisfies Partial<TickwardApiError>)
  })

  it("keeps non-rate-limit fallback errors unchanged", async () => {
    const client = createTickwardApiClient({
      apiBaseUrl: "https://tickward.test",
      bearerToken: "mcp_access_secret",
      fetchImpl: async () => new Response(null, { status: 500 }),
    })

    await expect(client.listProjects()).rejects.toMatchObject({
      body: null,
      message: "tickward API request failed with 500.",
      name: "TickwardApiError",
      status: 500,
    } satisfies Partial<TickwardApiError>)
  })

  it("exchanges MCP authorization grants through the app API", async () => {
    const calls: Array<{ body: unknown; url: string }> = []

    const result = await exchangeMcpAuthorizationGrant({
      apiBaseUrl: "https://tickward.test/api/v1",
      grant: "mcpg_secret",
      fetchImpl: async (url, init) => {
        calls.push({ body: init?.body, url: url.toString() })
        return new Response(
          JSON.stringify({
            connection: { id: "connection_123", name: "Claude Code", scopes: ["projects:read"] },
            object: "mcp_oauth_exchange",
            token: "mcp_access_secret",
            user: { id: "user_123" },
          }),
          { status: 200 },
        )
      },
    })

    expect(result.token).toBe("mcp_access_secret")
    expect(calls).toEqual([
      {
        body: JSON.stringify({ grant: "mcpg_secret" }),
        url: "https://tickward.test/api/mcp/oauth/exchange",
      },
    ])
  })
})
