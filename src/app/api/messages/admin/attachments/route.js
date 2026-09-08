import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { listAttachmentsForAdmin } from "@/server/messages/messageAttachments";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;

export async function GET(req) {
  const { authedUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const pageRaw = Number(url.searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSizeRaw = Number(url.searchParams.get("pageSize"));
  const pageSize =
    Number.isInteger(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : DEFAULT_PAGE_SIZE;

  const result = await listAttachmentsForAdmin(authedUser, { page, pageSize });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    attachments: result.attachments,
    pagination: result.pagination,
  });
}
