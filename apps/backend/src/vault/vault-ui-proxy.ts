import type { Request, RequestHandler } from "express";

const allowedMethods = new Set(["DELETE", "GET", "HEAD", "LIST", "PATCH", "POST", "PUT"]);
const responseHeaderAllowlist = new Set([
  "cache-control",
  "content-security-policy",
  "content-type",
  "etag",
  "last-modified",
  "location",
  "referrer-policy",
  "www-authenticate",
  "x-content-type-options",
  "x-frame-options"
]);

type VaultUiProxyConfig = {
  vaultAddr?: string;
  vaultMode: "mock" | "real";
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createVaultUiProxy(config: VaultUiProxyConfig): RequestHandler {
  const fetchImpl = config.fetchImpl ?? fetch;
  return async (req, res, next) => {
    try {
      if (config.vaultMode !== "real" || !config.vaultAddr) {
        res.status(503).json({ error: "Vault UI is available only when the real Vault runtime is connected" });
        return;
      }
      const vaultAddr = config.vaultAddr;
      const method = req.method.toUpperCase();
      if (!allowedMethods.has(method)) {
        res.setHeader("Allow", [...allowedMethods].join(", "));
        res.status(405).json({ error: "Method is not supported by the Vault UI gateway" });
        return;
      }

      const target = buildVaultUiTarget(vaultAddr, normalizeProxyUrl(req.originalUrl));
      const upstream = await fetchImpl(target, {
        method,
        headers: vaultUiRequestHeaders(req.headers),
        body: serializeVaultUiRequestBody({
          method,
          contentType: req.header("content-type"),
          body: req.body,
          hasBody: requestHasBody(req)
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(config.timeoutMs ?? 30_000)
      });

      if (!upstream.ok) {
        console.warn("Vault UI gateway upstream request failed", {
          method,
          path: target.pathname,
          status: upstream.status
        });
      }

      res.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        const normalizedName = name.toLowerCase();
        if (responseHeaderAllowlist.has(normalizedName) || normalizedName.startsWith("x-vault-")) {
          res.setHeader(name, normalizedName === "location" ? rewriteVaultLocation(value, vaultAddr) : value);
        }
      });
      if (method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
        res.end();
        return;
      }
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      next(error);
    }
  };
}

export function buildVaultUiTarget(vaultAddr: string, requestUrl: string): URL {
  const requested = new URL(requestUrl, "http://portal.local");
  if (requested.origin !== "http://portal.local" || !isVaultUiPath(requested.pathname)) {
    throw new Error("Vault UI gateway path is not allowed");
  }
  const target = new URL(vaultAddr);
  target.pathname = requested.pathname;
  target.search = requested.search;
  target.hash = "";
  return target;
}

export function vaultUiRequestHeaders(
  source: Record<string, string | string[] | undefined>
): Headers {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(source)) {
    const normalizedName = name.toLowerCase();
    if (
      normalizedName !== "accept" &&
      normalizedName !== "accept-language" &&
      normalizedName !== "content-type" &&
      !normalizedName.startsWith("x-vault-")
    ) {
      continue;
    }
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    if (value) headers.set(normalizedName, value);
  }
  return headers;
}

export function serializeVaultUiRequestBody(input: {
  method: string;
  contentType?: string;
  body: unknown;
  hasBody: boolean;
}): BodyInit | undefined {
  if (["GET", "HEAD", "LIST"].includes(input.method.toUpperCase()) || !input.hasBody) return undefined;
  const contentType = input.contentType?.toLowerCase() ?? "";
  if (contentType.includes("json")) return JSON.stringify(input.body ?? {});
  if (typeof input.body === "string") return input.body;
  if (input.body === undefined || input.body === null) return undefined;
  throw new Error("Vault UI gateway accepts JSON request bodies only");
}

function requestHasBody(req: Request): boolean {
  const contentLength = req.header("content-length");
  if (contentLength !== undefined) return Number(contentLength) > 0;
  return Boolean(req.header("transfer-encoding"));
}

function normalizeProxyUrl(originalUrl: string): string {
  return originalUrl.startsWith("/api/ui/") || originalUrl === "/api/ui" || originalUrl.startsWith("/api/v1/") || originalUrl === "/api/v1"
    ? originalUrl.slice(4)
    : originalUrl;
}

function isVaultUiPath(pathname: string): boolean {
  return pathname === "/ui" || pathname.startsWith("/ui/") || pathname === "/v1" || pathname.startsWith("/v1/");
}

function rewriteVaultLocation(value: string, vaultAddr: string): string {
  try {
    const vaultOrigin = new URL(vaultAddr).origin;
    const location = new URL(value, vaultOrigin);
    return location.origin === vaultOrigin ? `${location.pathname}${location.search}${location.hash}` : value;
  } catch {
    return value;
  }
}
