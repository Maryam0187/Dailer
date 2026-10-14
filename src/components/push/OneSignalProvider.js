"use client";

import { useEffect } from "react";
import { loadOneSignalConfig, loginOneSignalUser } from "@/lib/oneSignalClient";

/**
 * No custom banner — OneSignal only:
 * - Slidedown soft prompt on login
 * - Subscription Bell (bottom-right) to Allow / manage
 * - Native browser permission after Allow
 */
export default function OneSignalProvider({ userId = null, username = null }) {
  useEffect(() => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0 || !username) return undefined;

    let cancelled = false;

    void (async () => {
      const config = await loadOneSignalConfig();
      if (cancelled || !config?.appId) return;
      await loginOneSignalUser(id, username);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, username]);

  return null;
}
