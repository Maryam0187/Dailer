import crypto from "crypto";

const CHARGEFLOW_API_BASE = "https://api.chargeflow.io";
const CHARGEFLOW_API_VERSION = "2025-04-01";

function getApiKey() {
  return String(process.env.CHARGEFLOW_API_KEY || "").trim();
}

function getApiSecret() {
  return String(process.env.CHARGEFLOW_API_SECRET || "").trim();
}

function generateHmacSignature(method, pathWithQuery, body, secretKey) {
  const dataToSign = `${method.toUpperCase()}\n${pathWithQuery}\n${body}`;
  return crypto.createHmac("sha256", secretKey).update(dataToSign).digest("hex");
}

/**
 * Call Chargeflow Merchants API. Uses x-api-key; signs with HMAC when CHARGEFLOW_API_SECRET is set.
 * @param {string} path - Path after version, e.g. "/alerts"
 * @param {{ method?: string, query?: Record<string, string|number|undefined|null>, body?: unknown }} [options]
 */
export async function chargeflowFetch(path, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error("CHARGEFLOW_API_KEY is not configured");
    err.status = 503;
    throw err;
  }

  const method = String(options.method || "GET").toUpperCase();
  const bodyString =
    options.body === undefined || options.body === null
      ? ""
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);

  const url = new URL(`${CHARGEFLOW_API_BASE}/public/${CHARGEFLOW_API_VERSION}${path}`);
  if (options.query && typeof options.query === "object") {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  // Chargeflow HMAC signs METHOD\nPATH\nBODY where PATH is the URL pathname (no query string).
  const signPath = url.pathname;
  const headers = {
    "x-api-key": apiKey,
    Accept: "application/json",
  };

  if (bodyString) {
    headers["Content-Type"] = "application/json";
  }

  const secret = getApiSecret();
  if (secret) {
    headers["x-chargeflow-hmac-sha256"] = generateHmacSignature(
      method,
      signPath,
      bodyString,
      secret,
    );
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: bodyString || undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const nested = data?.error?.message;
    const message =
      (typeof nested === "string" && nested) ||
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.errorMessage === "string" && data.errorMessage) ||
      `Chargeflow request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.chargeflow = data;
    throw err;
  }

  return data;
}

export async function listChargeflowAlerts(query = {}) {
  return chargeflowFetch("/alerts", { method: "GET", query });
}
