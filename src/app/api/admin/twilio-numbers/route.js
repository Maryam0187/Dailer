import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  addTwilioPhoneNumberManual,
  deleteTwilioPhoneNumberFromInventory,
  listTwilioPhoneNumbersInventory,
} from "@/server/twilio/twilioPhoneNumberAssign";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const numbers = await listTwilioPhoneNumbersInventory();
  const accounts = await db.ManagerTwilioAccount.findAll({
    attributes: ["managerId", "defaultFromNumber", "accountSid"],
  });
  const managerIds = accounts.map((a) => a.managerId);
  const managers =
    managerIds.length > 0
      ? await db.User.findAll({
          where: { id: managerIds },
          attributes: ["id", "username", "role"],
        })
      : [];
  const nameById = new Map(managers.map((m) => [m.id, m.username]));
  const teams = accounts.map((a) => ({
    managerId: a.managerId,
    managerUsername: nameById.get(a.managerId) || `manager#${a.managerId}`,
    accountSid: a.accountSid,
    defaultFromNumber: a.defaultFromNumber,
  }));

  return NextResponse.json({ numbers, teams });
}

/** Manual add fallback. */
export async function POST(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const result = await addTwilioPhoneNumberManual({
    phoneNumber: body?.phoneNumber,
    accountKind: body?.accountKind,
    managerId: body?.managerId,
    label: body?.label,
    friendlyName: body?.friendlyName,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }
  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const result = await deleteTwilioPhoneNumberFromInventory({
    id: body?.id,
    phoneNumber: body?.phoneNumber,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }
  return NextResponse.json(result);
}
