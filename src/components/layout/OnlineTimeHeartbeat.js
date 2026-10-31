"use client";

import { useEffect, useRef } from "react";
import { io as ioClient } from "socket.io-client";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useLine2Call } from "@/contexts/Line2CallContext";

const IDLE_MS = 5 * 60 * 1000;

/**
 * The idle timer stays in the browser. Activity only restarts that timer.
 * The server is told once when work starts, and once when the timer runs out.
 * This component never sends a duration. An open call does not send pause.
 */
export default function OnlineTimeHeartbeat() {
  const { session } = useActiveCall();
  const { session: line2Session } = useLine2Call();
  const onCallRef = useRef(false);
  onCallRef.current = Boolean(session || line2Session);

  useEffect(() => {
    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    let lastInputAt = Date.now();
    let idlePaused = false;
    let idleTimer = null;

    function sendActivity() {
      if (!socket.connected) return;
      idlePaused = false;
      socket.emit("attendance:activity");
    }

    function sendPause() {
      if (!socket.connected || onCallRef.current || idlePaused) return;
      idlePaused = true;
      socket.emit("attendance:pause");
    }

    function scheduleIdlePause() {
      if (idleTimer != null) window.clearTimeout(idleTimer);
      const elapsed = Date.now() - lastInputAt;
      const wait = onCallRef.current ? 30 * 1000 : Math.max(0, IDLE_MS - elapsed);
      idleTimer = window.setTimeout(() => {
        idleTimer = null;
        if (onCallRef.current || Date.now() - lastInputAt < IDLE_MS) {
          scheduleIdlePause();
          return;
        }
        sendPause();
      }, wait);
    }

    function markInput() {
      const resume = idlePaused;
      lastInputAt = Date.now();
      scheduleIdlePause();
      if (!resume) return;
      idlePaused = false;
      if (!socket.connected) return;
      socket.emit("attendance:activity");
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        sendPause();
        return;
      }
      markInput();
    }

    window.addEventListener("pointerdown", markInput, { passive: true });
    window.addEventListener("keydown", markInput);
    window.addEventListener("mousemove", markInput, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendPause);

    scheduleIdlePause();
    socket.on("connect", () => {
      lastInputAt = Date.now();
      scheduleIdlePause();
      sendActivity();
    });

    return () => {
      if (idleTimer != null) window.clearTimeout(idleTimer);
      sendPause();
      window.removeEventListener("pointerdown", markInput);
      window.removeEventListener("keydown", markInput);
      window.removeEventListener("mousemove", markInput);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendPause);
      socket.disconnect();
    };
  }, []);

  return null;
}
