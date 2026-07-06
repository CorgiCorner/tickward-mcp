import { readFileSync, writeFileSync } from "node:fs"

const configPath = new URL("../wrangler.jsonc", import.meta.url)
const kvNamespaceId = process.env.CLOUDFLARE_OAUTH_KV_NAMESPACE_ID?.trim()

if (!kvNamespaceId) {
  throw new Error("Missing CLOUDFLARE_OAUTH_KV_NAMESPACE_ID")
}

if (!/^[0-9a-f]{32}$/i.test(kvNamespaceId)) {
  throw new Error("CLOUDFLARE_OAUTH_KV_NAMESPACE_ID must be a 32-character hex id")
}

const source = readFileSync(configPath, "utf8")
const updated = source.replace(/("binding":\s*"OAUTH_KV"\s*,\s*"id":\s*")[0-9a-f]{32}(")/i, `$1${kvNamespaceId}$2`)

if (updated === source) {
  throw new Error("Missing OAUTH_KV namespace binding in wrangler.jsonc")
}

writeFileSync(configPath, updated)
