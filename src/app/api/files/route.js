import { NextResponse } from "next/server";
import db from "@/server/db";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import {
  canCopyFile,
  canCreateFiles,
  canViewAllFiles,
  fileListIncludes,
  nonAdminFileAccessWhere,
  ownFilesWhere,
  sharedFilesWhere,
} from "@/server/files/fileAccess";
import { resolveCopyFileName } from "@/server/files/resolveCopyFileName";
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
      attributes: ["id", "name", "content", "userId", "deleted", "sharedWithAll", "createdAt", "updatedAt"],
      include: fileListIncludes,
    });

    return NextResponse.json({
      files: file ? [serializeUserFile(file, { viewer: authedUser })] : [],
      viewAll: false,
      limitedAccess: true,
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
  const showDeleted = isAdmin && searchParams.get("deleted") === "true";
  const scope = searchParams.get("scope");
  const where = {};

  if (showDeleted) {
    where.deleted = true;
  }

  if (isAdmin) {
    if (scope === "shared") {
      Object.assign(where, sharedFilesWhere(authedUser.id, { isAdmin: true }));
    } else if (scope === "mine") {
      Object.assign(where, ownFilesWhere(authedUser.id));
    } else {
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
    }
  } else if (scope === "shared") {
    Object.assign(where, sharedFilesWhere(authedUser.id));
  } else {
    Object.assign(where, ownFilesWhere(authedUser.id));
  }

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 24), 100);
  const offset = (page - 1) * pageSize;

  const includeOwner = true;
  const query = {
    where,
    order: [["updatedAt", "DESC"]],
    offset,
    limit: pageSize,
    attributes: ["id", "name", "content", "userId", "deleted", "sharedWithAll", "createdAt", "updatedAt"],
    include: includeOwner ? fileListIncludes : [],
    distinct: includeOwner,
  };

  const { rows: files, count } = showDeleted
    ? await db.UserFile.unscoped().findAndCountAll(query)
    : await db.UserFile.findAndCountAll(query);

  return NextResponse.json({
    files: files.map((file) => serializeUserFile(file, { includeDeleted: showDeleted, viewer: authedUser })),
    viewAll: isAdmin,
    showDeleted,
    scope: scope === "shared" ? "shared" : scope === "mine" ? "mine" : isAdmin ? "all" : "mine",
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
  if (!canCreateFiles(authedUser)) {
    return NextResponse.json({ error: "Creating files is not available with limited after-shift access." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  if (body?.copyFrom != null) {
    const sourceId = Number(body.copyFrom);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return NextResponse.json({ error: "Invalid copyFrom file id" }, { status: 400 });
    }

    const source = await db.UserFile.findOne({
      where: {
        id: sourceId,
        deleted: false,
        ...(canViewAllFiles(authedUser.role) ? {} : nonAdminFileAccessWhere(authedUser.id)),
      },
      attributes: ["id", "name", "content", "userId", "deleted", "sharedWithAll", "createdAt", "updatedAt"],
      include: fileListIncludes,
    });

    if (!source) return NextResponse.json({ error: "File not found" }, { status: 404 });
    if (!canCopyFile(authedUser, source)) {
      return NextResponse.json({ error: "You cannot copy this file" }, { status: 403 });
    }

    const name = body?.name ? trimFileName(body.name) : await resolveCopyFileName(authedUser.id, source.name);
    if (!name) {
      return NextResponse.json({ error: "File name is required" }, { status: 400 });
    }

    const file = await db.UserFile.create({
      name,
      content: sanitizeFileContent(source.content),
      userId: authedUser.id,
    });

    return NextResponse.json({ ok: true, file: serializeUserFile(file, { viewer: authedUser }) }, { status: 201 });
  }

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

  return NextResponse.json({ ok: true, file: serializeUserFile(file, { viewer: authedUser }) }, { status: 201 });
}
