"use client";

import { useEffect } from "react";
import { isOneSignalConfigured, loginOneSignalUser } from "@/lib/oneSignalClient";

/**
 * Links the logged-in dialer user to OneSignal (external_id) and asks for
 * web push permission so offline message alerts can reach all their browsers.
 *
 * We intentionally do not call OneSignal.logout() on dialer sign-out so the
 * browser keeps receiving pushes for this user while they remain subscribed.
 * A later login() for another user on the same browser re-links the subscription.
 */
export default function OneSignalProvider({ userId = null }) {
  useEffect(() => {
    if (!isOneSignalConfigured()) return undefined;
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        if (!cancelled) await loginOneSignalUser(id);
      } catch (err) {
        console.warn("[onesignal] login failed", err?.message || err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
