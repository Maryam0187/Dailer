import { normalizeToE164 } from "@/server/calls/normalizePhone";

function partyPhone(party) {
  if (!party || typeof party !== "object") return null;
  const raw = party.phoneNumber || party.number || null;
  if (!raw) return null;
  return normalizeToE164(raw) || String(raw).trim().slice(0, 32) || null;
}

function partyName(party) {
  if (!party || typeof party !== "object") return null;
  const name = String(party.name || "").trim();
  return name ? name.slice(0, 255) : null;
}

function partyExtension(party) {
  if (!party || typeof party !== "object") return null;
  const ext = String(party.extensionNumber || "").trim();
  return ext ? ext.slice(0, 64) : null;
}

export function extractZoomParties(data = {}) {
  const direction = data.direction === "inbound" ? "inbound" : "outbound";
  const callerPhone = partyPhone(data.caller);
  const calleePhone = partyPhone(data.callee);
  const contactName =
    direction === "inbound" ? partyName(data.caller) : partyName(data.callee);

  if (direction === "inbound") {
    return {
      direction,
      fromNumber: callerPhone,
      toNumber: calleePhone || callerPhone || "unknown",
      contactName,
    };
  }
  return {
    direction,
    fromNumber: callerPhone,
    toNumber: calleePhone || "unknown",
    contactName,
  };
}

/** Our Zoom line (outbound = caller, inbound = callee). */
export function extractZoomOurLine(data = {}) {
  const direction = data.direction === "inbound" ? "inbound" : "outbound";
  const ours = direction === "inbound" ? data.callee : data.caller;
  return {
    zoomExtensionNumber: partyExtension(ours),
    zoomPhoneNumber: partyPhone(ours),
    zoomDisplayName: partyName(ours),
  };
}

export function mapZoomEndStatus(result) {
  const r = String(result || "").toLowerCase();
  if (r === "missed" || r.includes("no answer")) return "no-answer";
  if (r === "rejected" || r.includes("reject") || r.includes("busy")) return "busy";
  if (r.includes("cancel")) return "canceled";
  if (r.includes("voicemail")) return "completed";
  if (r === "ended" || r.includes("connected") || r.includes("answered")) return "completed";
  return "completed";
}

export function mapZoomLogResultStatus(result) {
  const r = String(result || "");
  if (/no answer/i.test(r)) return "no-answer";
  if (/busy/i.test(r)) return "busy";
  if (/cancel/i.test(r)) return "canceled";
  if (/reject/i.test(r)) return "busy";
  if (/voicemail/i.test(r)) return "completed";
  if (/call connected|answered/i.test(r)) return "completed";
  if (/missed/i.test(r)) return "no-answer";
  return "completed";
}

export function parseZoomDurationSeconds(duration) {
  if (duration == null || duration === "") return null;
  if (typeof duration === "number" && Number.isFinite(duration)) {
    return Math.max(0, Math.round(duration));
  }
  const s = String(duration).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Math.round(Number(s)));
  // HH:MM:SS or MM:SS
  const parts = s.split(":").map((p) => Number(p));
  if (parts.length >= 2 && parts.every((n) => Number.isFinite(n))) {
    if (parts.length === 3) return Math.max(0, Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]));
    if (parts.length === 2) return Math.max(0, Math.round(parts[0] * 60 + parts[1]));
  }
  return null;
}

export function parseZoomEventDate(dateTime) {
  if (dateTime == null || dateTime === "") return null;
  if (dateTime instanceof Date && !Number.isNaN(dateTime.getTime())) return dateTime;
  if (typeof dateTime === "number" && Number.isFinite(dateTime)) {
    const ms = dateTime < 1e12 ? dateTime * 1000 : dateTime;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(dateTime));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function durationSecondsBetween(startAt, endAt) {
  if (!startAt || !endAt) return null;
  const a = startAt instanceof Date ? startAt.getTime() : new Date(startAt).getTime();
  const b = endAt instanceof Date ? endAt.getTime() : new Date(endAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}
