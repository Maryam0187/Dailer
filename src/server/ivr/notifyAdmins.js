import db from "@/server/db";
import { sendResendEmail } from "@/lib/sendResendEmail";
import { emitToUser } from "@/server/socketHub";
import { buildIvrAlert, isIvrAlertEnabled } from "@/server/ivr/buildIvrAlert";

/**
 * Email (always when configured) + socket toast to every active admin.
 * @param {{ type: string, step?: string|null, from?: string, to?: string, callSid?: string, choice?: string, number?: string }} raw
 */
export async function notifyAdmins(raw) {
  if (!isIvrAlertEnabled()) {
    return { emailed: false, socketTargets: 0, skipped: true };
  }

  const payload = {
    type: String(raw?.type || "incoming"),
    step: raw?.step != null ? String(raw.step) : null,
    from: String(raw?.from || "").trim() || null,
    to: String(raw?.to || "").trim() || null,
    callSid: String(raw?.callSid || "").trim() || null,
    choice: raw?.choice != null ? String(raw.choice).trim() : null,
    number: raw?.number != null ? String(raw.number).trim() : null,
    at: new Date().toISOString(),
  };

  let socketTargets = 0;
  try {
    const admins = await db.User.findAll({
      where: { role: "admin", isActive: true },
      attributes: ["id"],
    });
    for (const admin of admins) {
      if (emitToUser(admin.id, "ivr:alert", payload)) socketTargets += 1;
    }
  } catch (err) {
    console.warn("[ivr/notifyAdmins] socket", err?.message || err);
  }

  // Ringing is dialer-only (avoid email spam); email on incoming + gather steps.
  let emailed = false;
  if (payload.type !== "ringing") {
    const email = buildIvrAlert(payload);
    if (email) {
      void sendResendEmail(email).then((result) => {
        if (!result?.ok && !result?.skipped) {
          console.warn("[ivr/notifyAdmins] email failed", result?.error);
        }
      });
      emailed = true;
    }
  }

  return { emailed, socketTargets, payload };
}
