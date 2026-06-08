import { DEFAULT_TICKWARD_API_BASE_URL } from "../constants.js"

export type WorkerConfig = {
  apiBaseUrl: string
  appBaseUrl: string
}

export function normalizeApiBaseUrl(value = DEFAULT_TICKWARD_API_BASE_URL) {
  const url = new URL(value)
  url.pathname = url.pathname.replace(/\/+$/, "")
  if (!url.pathname.endsWith("/api/v1")) {
    url.pathname = `${url.pathname}/api/v1`.replace(/\/+/g, "/")
  }
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

export function normalizeAppBaseUrl(value: string) {
  const url = new URL(value)
  url.pathname = url.pathname.replace(/\/+$/, "")
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

export function appBaseUrlFromApiBaseUrl(apiBaseUrl: string) {
  const url = new URL(normalizeApiBaseUrl(apiBaseUrl))
  url.pathname = url.pathname.replace(/\/api\/v1$/, "").replace(/\/+$/, "")
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

export function readWorkerConfig(env: { TICKWARD_API_BASE_URL?: string; TICKWARD_APP_BASE_URL?: string }) {
  const apiBaseUrl = normalizeApiBaseUrl(env.TICKWARD_API_BASE_URL || DEFAULT_TICKWARD_API_BASE_URL)
  return {
    apiBaseUrl,
    appBaseUrl: normalizeAppBaseUrl(env.TICKWARD_APP_BASE_URL || appBaseUrlFromApiBaseUrl(apiBaseUrl)),
  } satisfies WorkerConfig
}
