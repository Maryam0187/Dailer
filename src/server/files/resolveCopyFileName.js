import db from "@/server/db";

const MAX_NAME_LENGTH = 255;

function copySuffix(index) {
  return index === 0 ? " copy" : ` copy ${index}`;
}

function buildCopyName(originalName, index) {
  const suffix = copySuffix(index);
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

export async function resolveCopyFileName(userId, originalName) {
  const firstCandidate = buildCopyName(originalName, 0);
  if (!(await nameTaken(userId, firstCandidate))) {
    return firstCandidate;
  }

  for (let index = 1; index <= 999; index += 1) {
    const candidate = buildCopyName(originalName, index);
    if (!(await nameTaken(userId, candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to find an available name for copied file");
}
