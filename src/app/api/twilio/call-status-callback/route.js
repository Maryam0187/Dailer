/**
 * Alias for legacy Twilio Status Callback URLs that pointed at
 * /api/twilio/call-status-callback (CRM path). Delegates to /api/twilio/status.
 */
import { POST as statusPost } from "@/app/api/twilio/status/route";

export const runtime = "nodejs";

export async function POST(req) {
  return statusPost(req);
}

export async function GET(req) {
  return statusPost(req);
}
