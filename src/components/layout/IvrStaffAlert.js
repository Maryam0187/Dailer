"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { ivrAssociateLabel, ivrChoiceLabel } from "@/lib/ivrChoiceLabel";
import { playIncomingMessageSound, unlockMessageSound } from "@/lib/messageSound";

function customerLabel(customer) {
  if (!customer?.id) return null;
  const name = customer.fullName || "Customer";
  return customer.phone ? `${name} · ${customer.phone}` : name;
}

/**
 * Live IVR panel for admins — merges events by callSid.
 */
export default function IvrStaffAlert({ userRole = null }) {
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (userRole !== "admin") return undefined;

    function unlock() {
      void unlockMessageSound();
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const socket = ioClient({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("ivr:alert", (payload) => {
      if (!payload || typeof payload !== "object") return;
      const callSid = String(payload.callSid || "").trim() || `tmp-${Date.now()}`;
      setAlert((prev) => {
        const same = prev && prev.callSid === callSid;
        const next = {
          callSid,
          type: payload.type || "incoming",
          step: payload.step || null,
          from: payload.from || prev?.from || null,
          to: payload.to || prev?.to || null,
          choice: payload.choice != null && payload.choice !== "" ? payload.choice : prev?.choice || null,
          associate:
            payload.associate != null && payload.associate !== ""
              ? payload.associate
              : prev?.associate || null,
          number: payload.number != null && payload.number !== "" ? payload.number : prev?.number || null,
          customer: payload.customer || prev?.customer || null,
          associateCustomer: payload.associateCustomer || prev?.associateCustomer || null,
          at: payload.at || new Date().toISOString(),
        };
        if (!same || payload.type === "incoming" || payload.type === "gather" || payload.type === "ringing") {
          playIncomingMessageSound();
        }
        return next;
      });
    });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      socket.disconnect();
    };
  }, [userRole]);

  if (userRole !== "admin" || !alert) return null;

  const title =
    alert.type === "ringing"
      ? "IVR — ringing you"
      : alert.type === "gather"
        ? "IVR — gather update"
        : "Incoming IVR call";

  const choiceText =
    alert.choice != null && String(alert.choice).trim()
      ? ivrChoiceLabel(alert.choice, { empty: "", prefix: false })
      : null;
  const associateText = ivrAssociateLabel(alert.associate, { empty: null });
  const callerCustomer = customerLabel(alert.customer);
  const assocCustomer = customerLabel(alert.associateCustomer);

  return (
    <div className="fixed right-4 top-4 z-[10002] w-full max-w-sm rounded-xl border border-sky-200 bg-white p-3 shadow-xl dark:border-sky-900 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            From: <span className="font-medium">{alert.from || "Unknown"}</span>
          </p>
          {callerCustomer ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Customer:{" "}
              <Link
                href="/customers"
                className="font-medium text-sky-700 underline underline-offset-2 dark:text-sky-300"
              >
                {callerCustomer}
              </Link>
            </p>
          ) : null}
          {choiceText ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Choice: {choiceText}</p>
          ) : null}
          {associateText ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{associateText}</p>
          ) : null}
          {alert.number ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Number: <span className="font-medium">{alert.number}</span>
            </p>
          ) : null}
          {assocCustomer ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Associate match:{" "}
              <Link
                href="/customers"
                className="font-medium text-sky-700 underline underline-offset-2 dark:text-sky-300"
              >
                {assocCustomer}
              </Link>
            </p>
          ) : null}
          {alert.type === "incoming" ? (
            <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
              Caller is in IVR — stay ready to answer when it rings.
            </p>
          ) : null}
          {alert.type === "ringing" ? (
            <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
              Answer the incoming call to connect.
            </p>
          ) : null}
          <Link
            href="/ivr-notifications"
            className="mt-2 inline-block text-xs font-medium text-sky-700 underline underline-offset-2 hover:text-sky-800 dark:text-sky-300"
          >
            Open IVR notifications
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setAlert(null)}
          className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
