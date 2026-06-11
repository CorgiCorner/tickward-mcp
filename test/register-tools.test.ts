import { describe, expect, it, vi } from "vitest"

import { registerTickwardTools } from "../src/mcp/register-tools.js"

function createToolHarness() {
  const tools = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>()
  const server = {
    registerPrompt: vi.fn(),
    registerResource: vi.fn(),
    registerTool: vi.fn(
      (name: string, _config: unknown, handler: (input: Record<string, unknown>) => Promise<unknown>) => {
        tools.set(name, handler)
      },
    ),
  }

  const requests: Array<{ body?: unknown; idempotent?: boolean; method?: string; path: string }> = []
  const apiClient = {
    getCapabilities: vi.fn(),
    listProjects: vi.fn(),
    listTimers: vi.fn(),
    request: vi.fn(async (path: string, init: { body?: unknown; idempotent?: boolean; method?: string } = {}) => {
      requests.push({ body: init.body, idempotent: init.idempotent, method: init.method, path })
      return { object: "ok" }
    }),
  }

  registerTickwardTools(server as never, { apiClient: apiClient as never })

  return { requests, server, tools }
}

describe("registerTickwardTools", () => {
  it("registers webhook management tools", () => {
    const { server } = createToolHarness()

    expect(server.registerTool).toHaveBeenCalledWith(
      "tickward_list_webhooks",
      expect.objectContaining({ title: "List webhooks" }),
      expect.any(Function),
    )
    expect(server.registerTool).toHaveBeenCalledWith(
      "tickward_update_webhook_events",
      expect.objectContaining({ title: "Update webhook events" }),
      expect.any(Function),
    )
    expect(server.registerTool).toHaveBeenCalledWith(
      "tickward_send_test_webhook",
      expect.objectContaining({ title: "Send test webhook" }),
      expect.any(Function),
    )
  })

  it("routes webhook tools to the public API", async () => {
    const { requests, tools } = createToolHarness()

    await tools.get("tickward_update_webhook_events")?.({
      event_types: ["timer.created", "timer.ended"],
      webhook_id: "wh_123",
    })
    await tools.get("tickward_disable_webhook")?.({ webhook_id: "wh_123" })
    await tools.get("tickward_send_test_webhook")?.({ event_type: "timer.ended", webhook_id: "wh_123" })

    expect(requests).toEqual([
      {
        body: { event_types: ["timer.created", "timer.ended"] },
        idempotent: true,
        method: "PATCH",
        path: "/webhooks/wh_123",
      },
      {
        body: { status: "disabled" },
        idempotent: true,
        method: "PATCH",
        path: "/webhooks/wh_123",
      },
      {
        body: { event_type: "timer.ended" },
        idempotent: true,
        method: "POST",
        path: "/webhooks/wh_123/test",
      },
    ])
  })
})
