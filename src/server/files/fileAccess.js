import db from "@/server/db";

export function canViewAllFiles(role) {
  return role === "admin";
}

export const fileListIncludes = [
  {
    model: db.User,
    as: "owner",
    attributes: ["id", "username"],
  },
];

export async function getAccessibleFile(id, authedUser) {
  const where = { id };
  if (!canViewAllFiles(authedUser.role)) {
    where.userId = authedUser.id;
  }

  return db.UserFile.findOne({
    where,
    attributes: ["id", "name", "content", "userId", "createdAt", "updatedAt"],
    include: fileListIncludes,
  });
}
