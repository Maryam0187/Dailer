"use client";

import Link from "next/link";
import { ivrChoiceLabel } from "@/lib/ivrChoiceLabel";
import { useDemo } from "@/lib/demo/DemoProvider";

/**
 * Fixed toast mirroring production IvrStaffAlert — admin-only while an IVR alert is live.
 */
export default function DemoIvrAlert() {
  const { state, dismissIvrAlert, helpers } = useDemo();
  const me = helpers.getUser(state.currentUserId);
  const alert = state.ivrAlert;

  if (me?.role !== "admin" || !alert) return null;

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

  return (
    <div className="fixed right-4 top-4 z-[10002] w-full max-w-sm rounded-xl border border-sky-200 bg-white p-3 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          {alert.customer ? (
            <p className="mt-1 text-xs text-zinc-600">
              Caller:{" "}
              <span className="font-medium text-sky-800">
                {alert.customer.fullName}
                {alert.from ? ` (${alert.from})` : ""}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-600">
              From: <span className="font-medium">{alert.from || "Unknown"}</span>
            </p>
          )}
          {choiceText ? (
            <p className="mt-1 text-xs text-zinc-600">Choice: {choiceText}</p>
          ) : null}
          {alert.type === "incoming" ? (
            <p className="mt-2 text-xs text-sky-700">
              Caller is in IVR — stay ready to answer when it rings.
            </p>
          ) : null}
          {alert.type === "ringing" ? (
            <p className="mt-2 text-xs text-sky-700">
              Answer the call on the IVR page to connect.
            </p>
          ) : null}
          <Link
            href="/demo/ivr"
            className="mt-2 inline-block text-xs font-medium text-sky-700 underline underline-offset-2 hover:text-sky-800"
          >
            Open IVR demo
          </Link>
        </div>
        <button
          type="button"
          onClick={dismissIvrAlert}
          className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
