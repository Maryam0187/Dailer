import { NextResponse } from "next/server";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import {
  parseManagerTwilioAccountBody,
  serializeManagerTwilioAccount,
} from "@/server/twilio/managerTwilioAccountApi";

export const runtime = "nodejs";

async function loadManagerUser(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return { error: NextResponse.json({ error: "Invalid manager id" }, { status: 400 }) };
  }
  const user = await db.User.findByPk(id, {
    attributes: ["id", "username", "role", "isActive"],
  });
  if (!user) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }
  if (user.role !== "manager") {
    return {
      error: NextResponse.json(
        { error: "Twilio subaccount can only be attached to a manager" },
        { status: 400 },
      ),
    };
  }
  return { user };
}

export async function GET(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const loaded = await loadManagerUser(rawId);
  if (loaded.error) return loaded.error;

  const row = await db.ManagerTwilioAccount.findOne({
    where: { managerId: loaded.user.id },
  });

  return NextResponse.json({
    manager: {
      id: loaded.user.id,
      username: loaded.user.username,
      role: loaded.user.role,
    },
    twilioAccount: serializeManagerTwilioAccount(row),
  });
}

export async function PUT(req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const loaded = await loadManagerUser(rawId);
  if (loaded.error) return loaded.error;

  const body = await req.json().catch(() => null);
  const existing = await db.ManagerTwilioAccount.findOne({
    where: { managerId: loaded.user.id },
  });

  const parsed = parseManagerTwilioAccountBody(body, existing);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let row;
  if (existing) {
    await existing.update(parsed.data);
    row = existing;
  } else {
    row = await db.ManagerTwilioAccount.create({
      managerId: loaded.user.id,
      ...parsed.data,
    });
  }

  return NextResponse.json({
    manager: {
      id: loaded.user.id,
      username: loaded.user.username,
      role: loaded.user.role,
    },
    twilioAccount: serializeManagerTwilioAccount(row),
  });
}

/** Remove team subaccount config so the manager’s team falls back to main Twilio. */
export async function DELETE(_req, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: rawId } = await params;
  const loaded = await loadManagerUser(rawId);
  if (loaded.error) return loaded.error;

  const deleted = await db.ManagerTwilioAccount.destroy({
    where: { managerId: loaded.user.id },
  });

  return NextResponse.json({
    manager: {
      id: loaded.user.id,
      username: loaded.user.username,
      role: loaded.user.role,
    },
    deleted: deleted > 0,
    twilioAccount: null,
  });
}
