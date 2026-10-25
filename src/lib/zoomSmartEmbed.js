/** Zoom Phone Smart Embed postMessage helpers. */

export const ZOOM_PHONE_ORIGIN = "https://applications.zoom.us";
export const ZOOM_PHONE_IFRAME_URL =
  "https://applications.zoom.us/integration/phone/embeddablephone/home";
export const ZOOM_PHONE_SDK_URL =
  "https://vaapplicationscontent.zoom.us/phoneSdk/static/smart-embed/js/sdk.js";
export const ZOOM_PHONE_IFRAME_ID = "zoom-embeddable-phone-iframe";

/** Embed URL with originDomain so Marketplace Approved Domains can match this app. */
export function buildZoomPhoneIframeUrl(originDomain) {
  const base = ZOOM_PHONE_IFRAME_URL;
  const origin = String(originDomain || "").trim();
  if (!origin) return base;
  const url = new URL(base);
  url.searchParams.set("originDomain", origin);
  return url.toString();
}

export function getZoomIframe() {
  if (typeof document === "undefined") return null;
  return document.querySelector(`#${ZOOM_PHONE_IFRAME_ID}`);
}

/**
 * Soft Embed has loaded on applications.zoom.us (cross-origin).
 * Same-origin readable window = still about:blank / CRM — do not postMessage yet.
 */
export function isZoomIframeReadyForPostMessage(iframe = getZoomIframe()) {
  if (!iframe?.contentWindow) return false;
  try {
    void iframe.contentWindow.location.href;
    return false;
  } catch {
    return true;
  }
}

export function postToZoom({ type, data } = {}) {
  const iframe = getZoomIframe();
  if (!iframe?.contentWindow || !type) return false;
  if (!isZoomIframeReadyForPostMessage(iframe)) return false;
  iframe.contentWindow.postMessage({ type, data: data ?? {} }, ZOOM_PHONE_ORIGIN);
  return true;
}

export function initZoomSmartEmbed(config = {}) {
  return postToZoom({
    type: "zp-init-config",
    data: {
      enableSavingLog: false,
      enableAutoLog: false,
      enableContactSearching: false,
      enableContactMatching: false,
      disableInactiveTabCallEvent: true,
      ...config,
    },
  });
}

export function zoomMakeCall(number, { callerId, autoDial = true } = {}) {
  const trimmed = String(number || "").trim();
  if (!trimmed) return false;
  const data = { number: trimmed, autoDial: Boolean(autoDial) };
  if (callerId) data.callerId = String(callerId);
  return postToZoom({ type: "zp-make-call", data });
}

export function zoomInputSms(number, message = "") {
  const trimmed = String(number || "").trim();
  if (!trimmed) return false;
  return postToZoom({
    type: "zp-input-sms",
    data: { number: trimmed, message: String(message || "") },
  });
}

/**
 * Subscribe to Zoom Smart Embed window messages.
 * @returns {() => void} unsubscribe
 */
export function subscribeZoomSmartEmbedEvents(handler) {
  if (typeof window === "undefined" || typeof handler !== "function") {
    return () => {};
  }

  function onMessage(event) {
    if (event.origin !== ZOOM_PHONE_ORIGIN) return;
    const payload = event.data;
    if (!payload?.type) return;
    handler(payload);
  }

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
