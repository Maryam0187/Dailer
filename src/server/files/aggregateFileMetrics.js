import db from "@/server/db";

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function aggregateFileMetrics() {
  const { fn, col } = db.sequelize;

  const aggregated = await db.UserFile.findAll({
    attributes: [
      "userId",
      [fn("COUNT", col("id")), "fileCount"],
      [fn("MAX", col("updatedAt")), "lastUpdatedAt"],
    ],
    group: ["userId"],
    raw: true,
  });

  const latestFiles = await db.UserFile.findAll({
    attributes: ["userId", "name", "updatedAt"],
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"],
    ],
    raw: true,
  });

  const latestByUserId = new Map();
  for (const file of latestFiles) {
    if (!latestByUserId.has(file.userId)) {
      latestByUserId.set(file.userId, {
        lastFileName: file.name,
        lastUpdatedAt: toIso(file.updatedAt),
      });
    }
  }

  const metricsByUserId = new Map(
    aggregated.map((row) => {
      const latest = latestByUserId.get(row.userId);
      return [
        row.userId,
        {
          fileCount: Number(row.fileCount) || 0,
          lastFileName: latest?.lastFileName ?? null,
          lastUpdatedAt: latest?.lastUpdatedAt ?? toIso(row.lastUpdatedAt),
        },
      ];
    }),
  );

  const allUsers = await db.User.findAll({
    attributes: ["id", "username", "role"],
    order: [["username", "ASC"]],
    raw: true,
  });

  const users = allUsers
    .map((user) => {
      const metrics = metricsByUserId.get(user.id);
      return {
        userId: user.id,
        username: user.username,
        role: user.role,
        fileCount: metrics?.fileCount ?? 0,
        lastFileName: metrics?.lastFileName ?? null,
        lastUpdatedAt: metrics?.lastUpdatedAt ?? null,
      };
    })
    .sort((a, b) => {
      if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
      const aTime = a.lastUpdatedAt ? new Date(a.lastUpdatedAt).getTime() : 0;
      const bTime = b.lastUpdatedAt ? new Date(b.lastUpdatedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return (a.username || "").localeCompare(b.username || "");
    });

  const totals = users.reduce(
    (acc, row) => {
      acc.totalFiles += row.fileCount;
      if (row.fileCount > 0) acc.usersWithFiles += 1;
      return acc;
    },
    { totalFiles: 0, usersWithFiles: 0 },
  );

  return { users, totals };
}
