import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAddressBotTrainer } from "@/server/auth/requireAddressBotTrainer";
import {
  getOrCreateAddressBotProfile,
  parseAddressBotProfileBody,
  profileUserInclude,
  recordAddressBotTrainingChange,
  serializeAddressBotProfile,
} from "@/server/calls/addressBotTraining";

export const runtime = "nodejs";

export async function GET() {
  const { errorResponse } = await requireAddressBotTrainer();
  if (errorResponse) return errorResponse;

  const row = await getOrCreateAddressBotProfile();
  const withUser = await db.AddressBotProfile.findByPk(row.id, { include: [profileUserInclude] });
  return NextResponse.json({ profile: serializeAddressBotProfile(withUser || row) });
}

export async function PATCH(req) {
  const { authedUser, errorResponse } = await requireAddressBotTrainer();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => null);
  const { data, errors } = parseAddressBotProfileBody(body);
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  const row = await getOrCreateAddressBotProfile();
  await row.update({ ...data, updatedBy: authedUser.id });

  const parts = [];
  if (data.name !== undefined) parts.push(`name: ${data.name}`);
  if (data.instructions !== undefined) parts.push(data.instructions || "(cleared instructions)");
  await recordAddressBotTrainingChange({
    userId: authedUser.id,
    action: "update_prompt",
    summary: parts.join(" — "),
  });

  const withUser = await db.AddressBotProfile.findByPk(row.id, { include: [profileUserInclude] });
  return NextResponse.json({ profile: serializeAddressBotProfile(withUser || row) });
}
