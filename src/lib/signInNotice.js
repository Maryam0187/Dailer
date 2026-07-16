export const SIGN_IN_NOTICE_STORAGE = "dialer_sign_in_notice";

export function stashSignInNotice(reason) {
  if (typeof window === "undefined" || !reason) return;
  sessionStorage.setItem(SIGN_IN_NOTICE_STORAGE, reason);
}

export function consumeSignInNotice() {
  if (typeof window === "undefined") return null;

  const fromStorage = sessionStorage.getItem(SIGN_IN_NOTICE_STORAGE);
  if (fromStorage) {
    sessionStorage.removeItem(SIGN_IN_NOTICE_STORAGE);
    return fromStorage;
  }

  const match = document.cookie.match(/(?:^|; )sign_in_notice=([^;]*)/);
  if (!match) return null;
  document.cookie = "sign_in_notice=; Max-Age=0; path=/";
  return decodeURIComponent(match[1]);
}

/** Only show a banner for non-shift logout reasons; shift blocks login via form error. */
export function signInNoticeMessage(reason) {
  if (reason === "replaced") {
    return "Your session ended because you signed in on another device.";
  }
  if (reason === "session_day_ended") {
    return "Your previous session ended. Please sign in again to start today's session.";
  }
  if (reason === "session_ended") {
    return "Your session ended. Please sign in again.";
  }
  if (reason === "user_on_leave") {
    return "You are on approved leave today and cannot sign in to the dialer.";
  }
  return null;
}

/** Migrate legacy ?reason= query URLs to a clean /sign-in path. */
export function stripSignInReasonFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("reason")) return;
  const reason = url.searchParams.get("reason");
  if (reason && reason !== "shift_ended") stashSignInNotice(reason);
  url.searchParams.delete("reason");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
}
