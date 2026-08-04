"use client";

import { useDemo } from "@/lib/demo/DemoProvider";

const ROLE_LABELS = {
  agent: "Agent",
  supervisor: "Supervisor",
  manager: "Manager",
  processor: "Processor",
  admin: "Admin",
};

const PRESENCE = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  offline: "bg-zinc-400",
};

export default function DemoTeamView() {
  const { state, setCurrentUser, setUserPresence, helpers } = useDemo();
  const me = helpers.getUser(state.currentUserId);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-sm sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
          Demo identity
        </p>
        <p className="mt-2 text-lg text-zinc-800">
          You are browsing as{" "}
          <span className="font-semibold text-zinc-950">{me?.displayName}</span> (
          {ROLE_LABELS[me?.role] || me?.role}). Switch roles to see how messages and presence feel
          for different seats.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {state.users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setCurrentUser(u.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                u.id === state.currentUserId
                  ? "bg-amber-500 text-white"
                  : "border border-amber-200 bg-white text-amber-950 hover:bg-amber-50"
              }`}
            >
              {u.displayName}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Calls today", value: state.metrics.callsToday },
          { label: "Talk minutes", value: state.metrics.talkMinutes },
          { label: "Leads touched", value: state.metrics.leadsTouched },
          { label: "Sales closed", value: state.metrics.salesClosed },
          {
            label: "Online now",
            value: state.users.filter((u) => u.presence === "online").length,
          },
          { label: "Team size", value: state.users.length },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {card.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Team presence</h2>
          <p className="text-sm text-zinc-500">
            Roles, shifts, and live status — the same people who show up in calls and chat.
          </p>
        </div>
        <ul className="divide-y divide-zinc-100">
          {state.users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${PRESENCE[u.presence] || PRESENCE.offline}`}
                />
                <div>
                  <p className="font-semibold text-zinc-950">
                    {u.displayName}
                    {u.id === state.currentUserId ? (
                      <span className="ml-2 text-xs font-semibold text-sky-700">(you)</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-zinc-500">
                    @{u.username} · {ROLE_LABELS[u.role] || u.role} · {u.shift} shift
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {["online", "away", "offline"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setUserPresence(u.id, p)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                      u.presence === p
                        ? "bg-zinc-900 text-white"
                        : "border border-zinc-200 bg-zinc-50 text-zinc-600"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
