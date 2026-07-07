import { randomUUID } from "node:crypto"
import { normalizeApiBaseUrl } from "../config/urls.js"
import { MCP_SERVER_VERSION } from "../constants.js"

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type TickwardApiClientOptions = {
  apiBaseUrl: string
  bearerToken: string
  fetchImpl?: FetchLike
  idFactory?: () => string
  timeoutMs?: number
  userAgent?: string
}

export type McpAuthorizationExchange = {
  connection: {
    client_name: string | null
    id: string
    name: string
    scopes: string[]
  }
  object: "mcp_oauth_exchange"
  token: string
  user: {
    email?: string | null
    id: string
    role?: string | null
  }
}

export type TickwardRequestOptions = {
  body?: unknown
  headers?: HeadersInit
  idempotencyKey?: string
  idempotent?: boolean
  method?: string
  signal?: AbortSignal
}

export class TickwardApiError extends Error {
  readonly body: unknown
  readonly status: number

  constructor(message: string, options: { body: unknown; status: number }) {
    super(message)
    this.name = "TickwardApiError"
    this.body = options.body
    this.status = options.status
  }
}

export function createTickwardApiClient(options: TickwardApiClientOptions) {
  const baseUrl = normalizeApiBaseUrl(options.apiBaseUrl)
  const fetchImpl = options.fetchImpl ?? fetch
  const idFactory = options.idFactory ?? randomUUID
  const timeoutMs = options.timeoutMs ?? 10_000
  const userAgent = options.userAgent ?? `tickward-mcp/${MCP_SERVER_VERSION}`

  async function request(path: string, init: TickwardRequestOptions = {}) {
    const method = init.method ?? "GET"
    const url = new URL(path.replace(/^\/+/, ""), `${baseUrl}/`)
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${options.bearerToken}`)
    headers.set("Accept", "application/json")
    headers.set("User-Agent", userAgent)

    let body: string | undefined
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json")
      body = JSON.stringify(init.body)
    }

    if (init.idempotencyKey) {
      headers.set("Idempotency-Key", init.idempotencyKey)
    } else if (init.idempotent === true) {
      headers.set("Idempotency-Key", idFactory())
    }

    const signal = init.signal ?? AbortSignal.timeout(timeoutMs)
    const response = await fetchImpl(url, { body, headers, method, signal })
    const text = await response.text()
    const data: unknown = text ? JSON.parse(text) : null

    if (!response.ok) {
      throw new TickwardApiError(publicApiErrorMessage(data, response.status, response.headers.get("Retry-After")), {
        body: data,
        status: response.status,
      })
    }

    return data
  }

  return {
    getCapabilities: () => request("/capabilities"),
    listProjects: (params: Record<string, string | number | boolean | null | undefined> = {}) =>
      request(`/projects${query(params)}`),
    listTimers: ({ projectId }: { projectId: string }) => request(`/projects/${encodeURIComponent(projectId)}/timers`),
    request,
  }
}

export type TickwardApiClient = ReturnType<typeof createTickwardApiClient>

export async function exchangeMcpAuthorizationGrant(options: {
  apiBaseUrl: string
  fetchImpl?: FetchLike
  grant: string
  timeoutMs?: number
  userAgent?: string
}): Promise<McpAuthorizationExchange> {
  const baseUrl = normalizeApiBaseUrl(options.apiBaseUrl)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 10_000
  const userAgent = options.userAgent ?? `tickward-mcp/${MCP_SERVER_VERSION}`
  const exchangeUrl = new URL(baseUrl)
  exchangeUrl.pathname = exchangeUrl.pathname.replace(/\/api\/v1$/, "/api/mcp/oauth/exchange")
  const response = await fetchImpl(exchangeUrl.toString(), {
    body: JSON.stringify({ grant: options.grant }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new TickwardApiError(publicApiErrorMessage(data, response.status, response.headers.get("Retry-After")), {
      body: data,
      status: response.status,
    })
  }

  return data as McpAuthorizationExchange
}

export function query(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

function publicApiErrorMessage(data: unknown, status: number, retryAfterHeader?: string | null) {
  if (status === 429) return publicRateLimitErrorMessage(data, retryAfterHeader)

  const errorMessage = publicApiErrorBodyMessage(data)
  if (errorMessage) return errorMessage

  return `tickward API request failed with ${status}.`
}

function publicRateLimitErrorMessage(data: unknown, retryAfterHeader?: string | null) {
  const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader)
  const errorMessage = publicApiErrorBodyMessage(data)
  const retryMessage = retryAfterSeconds === undefined ? "Retry later." : `Retry after ${retryAfterSeconds}s.`

  return errorMessage
    ? `tickward API rate limit reached. ${errorMessage} ${retryMessage}`
    : `tickward API rate limit reached. ${retryMessage}`
}

function parseRetryAfterSeconds(value?: string | null) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const seconds = Number(trimmed)
  if (!Number.isSafeInteger(seconds)) return undefined
  return seconds
}

function publicApiErrorBodyMessage(data: unknown) {
  if (typeof data === "object" && data && "error" in data) {
    const error = (data as { error?: { message?: unknown } }).error
    if (typeof error?.message === "string" && error.message.trim()) return error.message
  }

  return undefined
}
