"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { ivrChoiceLabel } from "@/lib/ivrChoiceLabel";
import {
  ourLineKind,
  ourLineKindBadgeClass,
  ourLineKindLabel,
} from "@/lib/ourLineKind";
import {
  resolveVoiceProvider,
  voiceProviderBadgeClass,
  voiceProviderLabel,
} from "@/lib/voiceProviderLabel";
import { playIncomingMessageSound, unlockMessageSound } from "@/lib/messageSound";
import IvrCustomerMatchRow from "@/components/Ivr/IvrCustomerMatchRow";

function mergeCustomerMatch(prev, next) {
  if (!next?.id) return prev || null;
  if (!prev?.id || prev.id !== next.id) return next;
  return {
    ...prev,
    ...next,
    lastSale: next.lastSale || prev.lastSale || null,
  };
}

function mergeCustomerList(prevList, nextList, fallback) {
  const incoming = Array.isArray(nextList) && nextList.length
    ? nextList
    : fallback?.id
      ? [fallback]
      : [];
  if (!incoming.length) return Array.isArray(prevList) ? prevList : [];
  const byId = new Map();
  for (const row of prevList || []) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of incoming) {
    if (!row?.id) continue;
    const prev = byId.get(row.id);
    byId.set(row.id, prev ? mergeCustomerMatch(prev, row) : row);
  }
  return [...byId.values()];
}

/**
 * Live inbound/callback toast for anyone who receives ivr:alert (admins + targeted agents).
 */
export default function IvrStaffAlert({ userRole = null }) {
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!userRole) return undefined;

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
          customer: mergeCustomerMatch(prev?.customer, payload.customer),
          customers: mergeCustomerList(prev?.customers, payload.customers, payload.customer),
          lastSale: payload.lastSale || prev?.lastSale || null,
          leadInSystem: Boolean(payload.leadInSystem ?? prev?.leadInSystem),
          messageMode: payload.messageMode || prev?.messageMode || null,
          voiceProvider: payload.voiceProvider || prev?.voiceProvider || null,
          title: payload.title || prev?.title || null,
          body: payload.body || prev?.body || null,
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

  if (!userRole || !alert) return null;

  const lineKind = ourLineKind(alert.to);
  const isLocalLine = lineKind === "local";
  const title =
    alert.title ||
    (alert.messageMode === "ask_admin"
      ? "Callback — lead in system"
      : alert.type === "ringing"
        ? isLocalLine
          ? "Local line — inbound"
          : "IVR — inbound"
        : isLocalLine
          ? "Incoming local call"
          : "Incoming IVR call");

  const choiceText =
    alert.choice != null && String(alert.choice).trim()
      ? ivrChoiceLabel(alert.choice, { empty: "", prefix: false })
      : null;

  return (
    <div className="fixed right-4 top-4 z-[10002] w-full max-w-sm rounded-xl border border-sky-200 bg-white p-3 shadow-xl dark:border-sky-900 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
            {alert.to ? (
              <span
                className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${ourLineKindBadgeClass(alert.to)}`}
              >
                {ourLineKindLabel(alert.to)}
              </span>
            ) : null}
            {(() => {
              const provider = resolveVoiceProvider(alert);
              const label = voiceProviderLabel(provider);
              if (!label) return null;
              return (
                <span
                  className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${voiceProviderBadgeClass(provider)}`}
                >
                  {label}
                </span>
              );
            })()}
          </div>
          {alert.body ? (
            <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">{alert.body}</p>
          ) : null}
          {(() => {
            const matches =
              Array.isArray(alert.customers) && alert.customers.length
                ? alert.customers
                : alert.customer
                  ? [alert.customer]
                  : [];
            if (!matches.length) {
              return (
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  From: <span className="font-medium">{alert.from || "Unknown"}</span>
                </p>
              );
            }
            const hideLead =
              alert.messageMode === "ask_admin" || alert.allowLeadPreview === false;
            const isAdmin = userRole === "admin";
            return matches.map((match) => (
              <IvrCustomerMatchRow
                key={match.id || match.phone || "match"}
                label={match.isOutside ? "Outside" : "Caller"}
                allowLeadPreview={!hideLead}
                showKind={isAdmin}
                customer={{
                  ...match,
                  phone: alert.from || match.phone,
                  lastSale: hideLead ? null : match.lastSale,
                }}
              />
            ));
          })()}
          {alert.to ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Called us at{" "}
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{alert.to}</span>
              {" · "}
              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                {ourLineKindLabel(alert.to)}
              </span>
            </p>
          ) : null}
          {choiceText ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Choice: {choiceText}</p>
          ) : null}
          {alert.messageMode === "ask_admin" ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              This caller is already in our system — ask an admin for further action.
            </p>
          ) : (
            <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
              Call the customer back when ready.
            </p>
          )}
          <Link
            href="/ivr-notifications"
            className="mt-2 inline-block text-xs font-medium text-sky-700 underline underline-offset-2 hover:text-sky-800 dark:text-sky-300"
          >
            Open notifications
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
