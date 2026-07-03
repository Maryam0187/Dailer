import db from "@/server/db";

const MAX_NAME_LENGTH = 255;

function restoreSuffix(index) {
  return index === 0 ? " recover" : ` recover ${index}`;
}

function buildRestoreName(originalName, index) {
  const suffix = restoreSuffix(index);
  const maxBaseLength = MAX_NAME_LENGTH - suffix.length;
  const base = originalName.slice(0, Math.max(1, maxBaseLength));
  return `${base}${suffix}`;
}

async function nameTaken(userId, name) {
  const existing = await db.UserFile.findOne({
    where: { userId, name },
    attributes: ["id"],
  });
  return Boolean(existing);
}

export async function resolveRestoreFileName(userId, originalName) {
  if (!(await nameTaken(userId, originalName))) {
    return originalName;
  }

  for (let index = 0; index <= 999; index += 1) {
    const candidate = buildRestoreName(originalName, index);
    if (!(await nameTaken(userId, candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to find an available name for restored file");
}
