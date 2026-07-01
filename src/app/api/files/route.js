import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import { canViewAllFiles, canWriteFiles, fileListIncludes } from "@/server/files/fileAccess";
import { sanitizeFileContent, trimFileName } from "@/server/files/sanitizeFileContent";
import { serializeUserFile } from "@/server/files/serializeUserFile";

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export async function GET(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (authedUser.accessMode === "limited") {
    const limitedId = authedUser.afterShiftLimitedFileId;
    if (!limitedId) {
      return NextResponse.json({
        files: [],
        viewAll: false,
        limitedAccess: true,
        pagination: {
          page: 1,
          pageSize: 1,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    const file = await db.UserFile.findByPk(limitedId, {
      attributes: ["id", "name", "content", "userId", "createdAt", "updatedAt"],
      include: fileListIncludes,
    });

    return NextResponse.json({
      files: file ? [serializeUserFile(file)] : [],
      viewAll: false,
      limitedAccess: true,
      readOnly: true,
      pagination: {
        page: 1,
        pageSize: 1,
        total: file ? 1 : 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const isAdmin = canViewAllFiles(authedUser.role);
  const where = {};

  if (isAdmin) {
    const userIdRaw = searchParams.get("userId");
    if (userIdRaw && userIdRaw !== "all") {
      const userId = Number(userIdRaw);
      if (!Number.isInteger(userId) || userId <= 0) {
        return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
      }
      const user = await db.User.findByPk(userId, { attributes: ["id"] });
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      where.userId = userId;
    }
  } else {
    where.userId = authedUser.id;
  }

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 24), 100);
  const offset = (page - 1) * pageSize;

  const { rows: files, count } = await db.UserFile.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    offset,
    limit: pageSize,
    attributes: ["id", "name", "content", "userId", "createdAt", "updatedAt"],
    include: isAdmin ? fileListIncludes : [],
    distinct: isAdmin,
  });

  return NextResponse.json({
    files: files.map(serializeUserFile),
    viewAll: isAdmin,
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
      hasNext: offset + files.length < count,
      hasPrev: page > 1,
    },
  });
}

export async function POST(req) {
  const authedUser = await getAuthedUser();
  if (!authedUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWriteFiles(authedUser)) {
    return NextResponse.json({ error: "Files are read-only with limited after-shift access." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = trimFileName(body?.name);
  if (!name) {
    return NextResponse.json({ error: "File name is required" }, { status: 400 });
  }

  const existing = await db.UserFile.findOne({
    where: { userId: authedUser.id, name },
    attributes: ["id"],
  });
  if (existing) {
    return NextResponse.json({ error: "A file with this name already exists" }, { status: 409 });
  }

  const file = await db.UserFile.create({
    name,
    content: sanitizeFileContent(body?.content),
    userId: authedUser.id,
  });

  return NextResponse.json({ ok: true, file: serializeUserFile(file) }, { status: 201 });
}
