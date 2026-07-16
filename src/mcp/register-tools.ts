import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as z from "zod/v4"

import type { TickwardApiClient } from "../api/client.js"
import { projectCreateInput, timerInput, webhookEventTypeInput } from "./schemas.js"

export type RegisterTickwardToolsOptions = {
  apiClient: TickwardApiClient
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: toStructuredContent(data),
  }
}

function toStructuredContent(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>
  return { value: data }
}

export function registerTickwardTools(server: McpServer, options: RegisterTickwardToolsOptions) {
  const { apiClient } = options

  server.registerTool(
    "tickward_get_capabilities",
    {
      description: "Use this first to learn which tickward API workflows and limits are available.",
      inputSchema: {},
      title: "Get tickward API capabilities",
    },
    async () => jsonResult(await apiClient.getCapabilities()),
  )

  server.registerTool(
    "tickward_list_projects",
    {
      description: "Use this to resolve which countdown project the user means before creating timers.",
      inputSchema: {
        after: z.string().optional(),
        before: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      title: "List tickward projects",
    },
    async (input) => jsonResult(await apiClient.listProjects(input)),
  )

  server.registerTool(
    "tickward_list_timers",
    {
      description: "Use this to inspect countdowns, reminders, renewals, deadlines, and subscription timers.",
      inputSchema: {
        project_id: z.string(),
      },
      title: "List project timers",
    },
    async ({ project_id }) => jsonResult(await apiClient.listTimers({ projectId: project_id })),
  )

  server.registerTool(
    "tickward_create_timer",
    {
      description:
        "Use this when the user wants to create a countdown, reminder, renewal timer, deadline, subscription timer, or event timer.",
      inputSchema: {
        ...timerInput,
        idempotency_key: z.string().optional(),
        project_id: z.string(),
      },
      title: "Create a timer",
    },
    async ({ idempotency_key, project_id, ...body }) =>
      jsonResult(
        await apiClient.request(`/projects/${encodeURIComponent(project_id)}/timers`, {
          body,
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "POST",
        }),
      ),
  )

  server.registerTool(
    "tickward_update_timer",
    {
      description: "Use this when the user wants to rename, reschedule, archive, restore, or change a timer.",
      inputSchema: {
        ...timerInput,
        archived_at: z.string().nullable().optional(),
        idempotency_key: z.string().optional(),
        project_id: z.string(),
        timer_id: z.string(),
      },
      title: "Update a timer",
    },
    async ({ idempotency_key, project_id, timer_id, ...body }) =>
      jsonResult(
        await apiClient.request(`/projects/${encodeURIComponent(project_id)}/timers/${encodeURIComponent(timer_id)}`, {
          body,
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "PATCH",
        }),
      ),
  )

  server.registerTool(
    "tickward_preview_project_create",
    {
      description: "Use this before creating a project with spaces or timers. It returns a plan_hash to apply.",
      inputSchema: projectCreateInput,
      title: "Preview project creation",
    },
    async (body) => jsonResult(await apiClient.request("/projects/preview", { body, method: "POST" })),
  )

  server.registerTool(
    "tickward_create_project",
    {
      description: "Create a tickward project. For spaces or timers, preview first and pass expected_plan_hash.",
      inputSchema: {
        ...projectCreateInput,
        idempotency_key: z.string().optional(),
      },
      title: "Create a project",
    },
    async ({ idempotency_key, ...body }) =>
      jsonResult(
        await apiClient.request("/projects", {
          body,
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "POST",
        }),
      ),
  )

  server.registerTool(
    "tickward_preview_delete_project",
    {
      description: "Use this before deleting a project. Show the preview to the user before applying.",
      inputSchema: {
        project_id: z.string(),
      },
      title: "Preview project delete",
    },
    async ({ project_id }) =>
      jsonResult(
        await apiClient.request(`/projects/${encodeURIComponent(project_id)}?dry_run=true`, { method: "DELETE" }),
      ),
  )

  server.registerTool(
    "tickward_delete_project",
    {
      description: "Delete a project after explicit user confirmation and a dry-run preview.",
      inputSchema: {
        idempotency_key: z.string().optional(),
        project_id: z.string(),
      },
      title: "Delete project",
    },
    async ({ idempotency_key, project_id }) =>
      jsonResult(
        await apiClient.request(`/projects/${encodeURIComponent(project_id)}`, {
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "DELETE",
        }),
      ),
  )

  server.registerTool(
    "tickward_list_webhooks",
    {
      description: "Use this to inspect webhook endpoints and event subscriptions for the signed-in account.",
      inputSchema: {},
      title: "List webhooks",
    },
    async () => jsonResult(await apiClient.request("/webhooks")),
  )

  server.registerTool(
    "tickward_create_webhook",
    {
      description: "Create a webhook endpoint for event-driven automation. Use HTTPS URLs for production receivers.",
      inputSchema: {
        event_types: z.array(webhookEventTypeInput).min(1).optional(),
        idempotency_key: z.string().optional(),
        name: z.string(),
        url: z.string().url(),
      },
      title: "Create webhook",
    },
    async ({ event_types, idempotency_key, name, url }) =>
      jsonResult(
        await apiClient.request("/webhooks", {
          body: { event_types, name, url },
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "POST",
        }),
      ),
  )

  server.registerTool(
    "tickward_update_webhook_events",
    {
      description: "Update which tickward event types an existing webhook endpoint receives.",
      inputSchema: {
        event_types: z.array(webhookEventTypeInput).min(1),
        idempotency_key: z.string().optional(),
        webhook_id: z.string(),
      },
      title: "Update webhook events",
    },
    async ({ event_types, idempotency_key, webhook_id }) =>
      jsonResult(
        await apiClient.request(`/webhooks/${encodeURIComponent(webhook_id)}`, {
          body: { event_types },
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "PATCH",
        }),
      ),
  )

  server.registerTool(
    "tickward_disable_webhook",
    {
      description: "Pause webhook deliveries while keeping the endpoint and delivery history.",
      inputSchema: {
        idempotency_key: z.string().optional(),
        webhook_id: z.string(),
      },
      title: "Disable webhook",
    },
    async ({ idempotency_key, webhook_id }) =>
      jsonResult(
        await apiClient.request(`/webhooks/${encodeURIComponent(webhook_id)}`, {
          body: { status: "disabled" },
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "PATCH",
        }),
      ),
  )

  server.registerTool(
    "tickward_reenable_webhook",
    {
      description: "Resume webhook deliveries for a disabled endpoint.",
      inputSchema: {
        idempotency_key: z.string().optional(),
        webhook_id: z.string(),
      },
      title: "Enable webhook",
    },
    async ({ idempotency_key, webhook_id }) =>
      jsonResult(
        await apiClient.request(`/webhooks/${encodeURIComponent(webhook_id)}`, {
          body: { status: "active" },
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "PATCH",
        }),
      ),
  )

  server.registerTool(
    "tickward_remove_webhook",
    {
      description: "Remove a webhook endpoint and its delivery history after explicit user confirmation.",
      inputSchema: {
        idempotency_key: z.string().optional(),
        webhook_id: z.string(),
      },
      title: "Remove webhook",
    },
    async ({ idempotency_key, webhook_id }) =>
      jsonResult(
        await apiClient.request(`/webhooks/${encodeURIComponent(webhook_id)}`, {
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "DELETE",
        }),
      ),
  )

  server.registerTool(
    "tickward_send_test_webhook",
    {
      description: "Send a sample webhook delivery to verify a receiver endpoint.",
      inputSchema: {
        event_type: webhookEventTypeInput.optional(),
        idempotency_key: z.string().optional(),
        webhook_id: z.string(),
      },
      title: "Send test webhook",
    },
    async ({ event_type, idempotency_key, webhook_id }) =>
      jsonResult(
        await apiClient.request(`/webhooks/${encodeURIComponent(webhook_id)}/test`, {
          body: event_type ? { event_type } : {},
          idempotencyKey: idempotency_key,
          idempotent: !idempotency_key,
          method: "POST",
        }),
      ),
  )

  server.registerTool(
    "tickward_list_webhook_deliveries",
    {
      description: "Inspect recent webhook delivery attempts for debugging integrations.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        webhook_id: z.string(),
      },
      title: "List webhook deliveries",
    },
    async ({ limit, webhook_id }) =>
      jsonResult(
        await apiClient.request(
          `/webhooks/${encodeURIComponent(webhook_id)}/deliveries${limit ? `?limit=${limit}` : ""}`,
        ),
      ),
  )

  server.registerResource(
    "tickward_capabilities",
    "tickward://capabilities",
    {
      description: "Current tickward API capabilities and limits.",
      mimeType: "application/json",
      title: "tickward capabilities",
    },
    async () => ({
      contents: [
        {
          mimeType: "application/json",
          text: JSON.stringify(await apiClient.getCapabilities(), null, 2),
          uri: "tickward://capabilities",
        },
      ],
    }),
  )

  server.registerResource(
    "tickward_projects",
    "tickward://projects",
    {
      description: "Projects visible to the configured tickward authorization.",
      mimeType: "application/json",
      title: "tickward projects",
    },
    async () => ({
      contents: [
        {
          mimeType: "application/json",
          text: JSON.stringify(await apiClient.listProjects(), null, 2),
          uri: "tickward://projects",
        },
      ],
    }),
  )

  server.registerPrompt(
    "tickward_safe_delete_project",
    {
      description: "Safely delete a tickward project with preview and confirmation.",
    },
    async () => ({
      messages: [
        {
          content: {
            text: "Safely delete a tickward project. Resolve the project, call the delete preview, show the summary, ask for explicit confirmation, then apply the delete with an Idempotency-Key.",
            type: "text" as const,
          },
          role: "user" as const,
        },
      ],
    }),
  )

  return server
}
