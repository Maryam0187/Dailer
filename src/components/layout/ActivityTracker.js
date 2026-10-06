"use client";

import { useEffect } from "react";
import { flushClientActivity, trackCopyActivity } from "@/lib/clientActivity";

function selectionLength() {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) return 0;
  return selection.toString().length;
}

export default function ActivityTracker() {
  useEffect(() => {
    function onCopy() {
      const length = selectionLength();
      if (length <= 0) return;
      trackCopyActivity({
        source: "selection",
        selectionLength: length,
      });
    }

    function onPageHide() {
      flushClientActivity(true);
    }

    document.addEventListener("copy", onCopy);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("copy", onCopy);
      window.removeEventListener("pagehide", onPageHide);
      flushClientActivity(true);
    };
  }, []);

  return null;
}
