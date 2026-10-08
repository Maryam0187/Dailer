"use client";

import { useEffect } from "react";
import { flushClientActivity, trackCopyActivity } from "@/lib/clientActivity";

function selectedText() {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed) return "";
  return selection.toString();
}

export default function ActivityTracker() {
  useEffect(() => {
    function onCopy() {
      const text = selectedText();
      const length = text.length;
      if (length <= 0) return;
      trackCopyActivity({
        source: "selection",
        selectionLength: length,
        text,
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
