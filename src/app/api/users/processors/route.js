import { NextResponse } from "next/server";
import { Op, Sequelize } from "sequelize";
import db from "@/server/db";
import { getAuthedUserRequiringFullAccess } from "@/server/auth/afterShiftAccess";
import { derivePresence } from "@/server/auth/presence";

function progressTagMissingLiteral(tag) {
  return Sequelize.literal(
    `NOT JSON_CONTAINS(\`leadProgressTags\`, ${db.sequelize.escape(JSON.stringify(tag))})`,
  );
}

export async function GET() {
  const { errorResponse } = await getAuthedUserRequiringFullAccess();
  if (errorResponse) return errorResponse;

  const now = Date.now();
  const processors = await db.User.findAll({
    where: { role: "processor", isActive: true },
    attributes: ["id", "username", "activeSessionId", "activeSessionLastSeenAt"],
    order: [["username", "ASC"]],
  });

  const processorIds = processors.map((u) => u.id);
  const pendingByProcessorId = new Map();

  if (processorIds.length > 0) {
    const pendingRows = await db.Lead.findAll({
      attributes: [
        "processorUserId",
        [db.sequelize.fn("COUNT", db.sequelize.col("Lead.id")), "pendingCount"],
      ],
      where: {
        leadProcessedRequired: true,
        leadPhase: "active",
        processorUserId: { [Op.in]: processorIds },
        [Op.and]: [progressTagMissingLiteral("processed")],
      },
      group: ["processorUserId"],
      raw: true,
    });

    for (const row of pendingRows) {
      const id = Number(row.processorUserId);
      if (Number.isInteger(id) && id > 0) {
        pendingByProcessorId.set(id, Number(row.pendingCount) || 0);
      }
    }
  }

  return NextResponse.json({
    processors: processors.map((u) => {
      const presence = derivePresence(
        {
          id: u.id,
          activeSessionId: u.activeSessionId,
          activeSessionLastSeenAt: u.activeSessionLastSeenAt,
        },
        now,
      );
      return {
        id: u.id,
        username: u.username,
        presence: presence.status,
        lastActiveAt: presence.lastActiveAt,
        pendingProcessingCount: pendingByProcessorId.get(u.id) ?? 0,
      };
    }),
  });
}
