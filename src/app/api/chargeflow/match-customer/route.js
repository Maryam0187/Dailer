import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { matchChargesFromAlertFields } from "@/server/customers/matchChargeFromAlert";

export const runtime = "nodejs";

/**
 * GET /api/chargeflow/match-customer
 * 1) Primary: cardLast4 + amount
 * 2) Fallback (previous soft): amount + transactionDate (±1 day), last4 matched or unknown;
 *    plus authCode / arn / processorTransactionId
 */
export async function GET(request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const fields = {
    authCode: searchParams.get("authCode") || searchParams.get("auth_code") || "",
    arn: searchParams.get("arn") || "",
    processorTransactionId:
      searchParams.get("processorTransactionId") ||
      searchParams.get("transaction") ||
      "",
    cardLast4: searchParams.get("cardLast4") || searchParams.get("last4") || "",
    amount: searchParams.get("amount") || "",
    transactionDate:
      searchParams.get("transactionDate") ||
      searchParams.get("created_at") ||
      "",
  };

  try {
    const result = await matchChargesFromAlertFields(fields);
    if (result.reason === "no_match_fields") {
      return NextResponse.json(
        {
          error: "Provide cardLast4 + amount, or amount + date / auth / ARN / txn id",
          fields: result.fields,
          matches: [],
        },
        { status: 400 },
      );
    }

    const best = result.matches[0] || null;
    return NextResponse.json({
      fields: result.fields,
      matchMode: result.matchMode || null,
      match: best,
      matches: result.matches,
      count: result.matches.length,
    });
  } catch (err) {
    console.error("[chargeflow/match-customer]", err?.message || err);
    return NextResponse.json({ error: "Failed to match customer" }, { status: 500 });
  }
}
