import {
  getAfterShiftAccess,
  isShiftWindowEnforced,
  isWithinLoginWindow,
} from "@/server/auth/loginWindow";

export { getAfterShiftAccess, hasAfterShiftGrant } from "@/server/auth/loginWindow";

/** `full` during shift/admin/grant-full; `limited` after shift with limited grant; never `blocked` here (auth rejects earlier). */
export function resolveAccessMode(user, date = new Date()) {
  if (!user) return "blocked";
  if (!isShiftWindowEnforced()) return "full";
  if (user.role === "admin") return "full";
  if (isWithinLoginWindow(date)) return "full";
  if (getAfterShiftAccess(user) === "full") return "full";
  if (getAfterShiftAccess(user) === "limited") return "limited";
  return "blocked";
}

export function denyUnlessFullAccess(authedUser) {
  if (!authedUser) return { ok: false, status: 401, error: "Unauthorized" };
  if (authedUser.accessMode === "limited") {
    return {
      ok: false,
      status: 403,
      error: "Not available with limited after-shift access.",
    };
  }
  return { ok: true };
}
