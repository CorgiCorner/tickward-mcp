import * as z from "zod/v4"

export const webhookEventTypeInput = z.enum([
  "project.created",
  "project.updated",
  "project.deleted",
  "timer.created",
  "timer.updated",
  "timer.archived",
  "timer.restored",
  "timer.deleted",
  "timer.ended",
  "share.created",
  "share.deleted",
])

const recurrenceInput = z
  .object({
    enabled: z.boolean(),
    lastDay: z.boolean().optional(),
    type: z.enum(["daily", "weekly", "monthly", "yearly"]),
  })
  .describe("Optional recurrence settings.")

export const timerInput = {
  color: z.string().optional().describe("Optional timer color."),
  description: z.string().optional().describe("Optional timer description."),
  id: z.string().optional().describe("Optional client-supplied timer id."),
  label: z.string().describe("Human-readable timer label."),
  notify: z.boolean().optional().describe("Use account-level alert settings for this timer."),
  pinned: z.boolean().optional().describe("Pin the timer in the project UI."),
  recurrence: recurrenceInput.optional(),
  space_id: z.string().nullable().optional().describe("Optional target space id."),
  target_date: z.string().describe("ISO 8601 target date-time, usually with Z or an explicit offset."),
  timezone: z.string().describe("IANA timezone, for example Europe/Warsaw."),
}

export const nestedTimerInput = {
  color: z.string().optional(),
  description: z.string().optional(),
  id: z.string().optional(),
  label: z.string(),
  notify: z.boolean().optional(),
  pinned: z.boolean().optional(),
  recurrence: recurrenceInput.optional(),
  target_date: z.string(),
  timezone: z.string(),
}

export const projectCreateInput = {
  color: z.string().optional(),
  expected_plan_hash: z.string().optional(),
  name: z.string(),
  spaces: z
    .array(
      z.object({
        color: z.string().optional(),
        id: z.string().optional(),
        name: z.string(),
        timers: z.array(z.object(nestedTimerInput)).optional(),
      }),
    )
    .optional(),
  timers: z.array(z.object(timerInput)).optional(),
}
