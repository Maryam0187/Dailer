import { literal } from "sequelize";
import db from "@/server/db";

/**
 * Adjust stored Leads.callLogsCount. Use +1 when a CallLog is created/linked to a lead.
 * Do not call on retention purge — counts are meant to survive raw CallLog deletion.
 *
 * @param {number} leadId
 * @param {number} [delta=1]
 * @param {{ transaction?: import("sequelize").Transaction }} [opts]
 */
export async function bumpLeadCallLogsCount(leadId, delta = 1, opts = {}) {
  const id = Number(leadId);
  const d = Number(delta);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(d) || d === 0) return;

  if (d > 0) {
    await db.Lead.increment("callLogsCount", {
      by: Math.floor(d),
      where: { id },
      transaction: opts.transaction,
    });
    return;
  }

  // Floor at 0 if ever decrementing (e.g. unlink).
  await db.Lead.update(
    {
      callLogsCount: literal(
        `GREATEST(0, COALESCE(callLogsCount, 0) + (${Math.floor(d)}))`,
      ),
    },
    { where: { id }, transaction: opts.transaction },
  );
}
