import { describe, expect, it } from "vitest"

import { defaultHandler } from "../src/worker/default-handler.js"

const env = {} as never

describe("default handler discovery", () => {
  it("serves an MCP server card with an absolute transport endpoint", async () => {
    const res = await defaultHandler.fetch(
      new Request("https://mcp.tickward.test/.well-known/mcp/server-card.json"),
      env,
    )

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/json")
    await expect(res.json()).resolves.toMatchObject({
      serverInfo: { name: "tickward", version: "0.1.0" },
      transport: { type: "streamable-http", endpoint: "https://mcp.tickward.test/mcp" },
      capabilities: { tools: {} },
    })
  })

  it("advertises the server card from the root index", async () => {
    const res = await defaultHandler.fetch(new Request("https://mcp.tickward.test/"), env)

    await expect(res.json()).resolves.toMatchObject({
      endpoints: { serverCard: "/.well-known/mcp/server-card.json" },
    })
  })
})
