"use client";

import { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useLine2Call } from "@/contexts/Line2CallContext";
import { useZoomSmartEmbed } from "@/contexts/ZoomSmartEmbedContext";

const IDLE_MS = 5 * 60 * 1000;
const LAST_INPUT_KEY = "dialer.attendance.lastInput";
const PAUSED_KEY = "dialer.attendance.paused";
const ON_CALL_KEY = "dialer.attendance.onCall";
const INPUT_WRITE_MS = 1000;
const ON_CALL_FRESH_MS = 2 * 60 * 1000;

function readSharedInput() {
  try {
    const raw = Number(localStorage.getItem(LAST_INPUT_KEY));
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

function writeSharedInput(now) {
  try {
    localStorage.setItem(LAST_INPUT_KEY, String(now));
  } catch {
    /* private mode / blocked storage */
  }
}

function isSharedPaused() {
  try {
    return localStorage.getItem(PAUSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setSharedPaused(paused) {
  try {
    if (paused) localStorage.setItem(PAUSED_KEY, "1");
    else localStorage.removeItem(PAUSED_KEY);
  } catch {
    /* private mode / blocked storage */
  }
}

function publishOnCall() {
  try {
    localStorage.setItem(ON_CALL_KEY, String(Date.now()));
  } catch {
    /* private mode / blocked storage */
  }
}

function clearPublishedOnCall() {
  try {
    localStorage.removeItem(ON_CALL_KEY);
  } catch {
    /* private mode / blocked storage */
  }
}

function isAnyTabOnCall() {
  try {
    const raw = Number(localStorage.getItem(ON_CALL_KEY));
    return Number.isFinite(raw) && Date.now() - raw < ON_CALL_FRESH_MS;
  } catch {
    return false;
  }
}

/**
 * The idle timer stays in the browser. Activity only restarts that timer.
 * Every dialer tab shares the last-input time, so a background tab cannot
 * pause the clock while another tab is in use. A Zoom call keeps the segment
 * open until Zoom reports the call ended. The server is told once when work
 * starts, and once when every tab has been idle for 5 minutes.
 */
export default function OnlineTimeHeartbeat() {
  const { session } = useActiveCall();
  const { session: line2Session } = useLine2Call();
  const { lastEvent } = useZoomSmartEmbed();
  const [zoomOnCall, setZoomOnCall] = useState(false);
  const onCallRef = useRef(false);
  const wasOnCallRef = useRef(false);
  const ensureSegmentOpenRef = useRef(() => {});

  useEffect(() => {
    const type = lastEvent?.type;
    if (type === "zp-call-ringing-event" || type === "zp-call-connected-event") {
      setZoomOnCall(true);
    } else if (type === "zp-call-ended-event" || type === "zp-call-log-completed-event") {
      setZoomOnCall(false);
    }
  }, [lastEvent]);

  onCallRef.current = Boolean(session || line2Session || zoomOnCall);

  useEffect(() => {
    const active = onCallRef.current;
    if (active) publishOnCall();
    else if (wasOnCallRef.current) clearPublishedOnCall();
    wasOnCallRef.current = active;
  });

  useEffect(() => {
    if (!zoomOnCall) return;
    ensureSegmentOpenRef.current();
  }, [zoomOnCall]);

  useEffect(() => {
    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    let lastInputAt = Date.now();
    let idleTimer = null;

    function latestInput() {
      return Math.max(lastInputAt, readSharedInput());
    }

    function callIsOpen() {
      return onCallRef.current || isAnyTabOnCall();
    }

    function sendActivity() {
      if (!socket.connected) return;
      setSharedPaused(false);
      socket.emit("attendance:activity");
    }

    function sendPause() {
      if (!socket.connected || callIsOpen() || isSharedPaused()) return;
      if (Date.now() - latestInput() < IDLE_MS) {
        scheduleIdlePause();
        return;
      }
      setSharedPaused(true);
      socket.emit("attendance:pause");
    }

    function scheduleIdlePause() {
      if (idleTimer != null) window.clearTimeout(idleTimer);
      if (onCallRef.current) publishOnCall();
      const elapsed = Date.now() - latestInput();
      const wait = callIsOpen() ? 30 * 1000 : Math.max(0, IDLE_MS - elapsed);
      idleTimer = window.setTimeout(() => {
        idleTimer = null;
        if (callIsOpen() || Date.now() - latestInput() < IDLE_MS) {
          scheduleIdlePause();
          return;
        }
        sendPause();
      }, wait);
    }

    function markInput() {
      const now = Date.now();
      lastInputAt = now;
      if (now - readSharedInput() >= INPUT_WRITE_MS) writeSharedInput(now);
      scheduleIdlePause();
      if (!isSharedPaused()) return;
      sendActivity();
    }

    function onStorage(event) {
      if (event.key !== LAST_INPUT_KEY && event.key !== PAUSED_KEY && event.key !== ON_CALL_KEY) {
        return;
      }
      scheduleIdlePause();
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      markInput();
    }

    ensureSegmentOpenRef.current = () => {
      sendActivity();
    };

    window.addEventListener("pointerdown", markInput, { passive: true });
    window.addEventListener("keydown", markInput);
    window.addEventListener("mousemove", markInput, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);

    scheduleIdlePause();
    socket.on("connect", () => {
      const now = Date.now();
      lastInputAt = now;
      writeSharedInput(now);
      scheduleIdlePause();
      sendActivity();
    });

    return () => {
      if (idleTimer != null) window.clearTimeout(idleTimer);
      ensureSegmentOpenRef.current = () => {};
      window.removeEventListener("pointerdown", markInput);
      window.removeEventListener("keydown", markInput);
      window.removeEventListener("mousemove", markInput);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      socket.disconnect();
    };
  }, []);

  return null;
}
