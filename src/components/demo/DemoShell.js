"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DialerPhoneIcon from "@/components/brand/DialerPhoneIcon";
import { useDemo } from "@/lib/demo/DemoProvider";

const links = [
  { href: "/demo", label: "Hub" },
  { href: "/demo/dialer", label: "Dialer" },
  { href: "/demo/leads", label: "Leads" },
  { href: "/demo/messages", label: "Messages" },
  { href: "/demo/team", label: "Team" },
];

export default function DemoShell({ title, subtitle, children }) {
  const pathname = usePathname();
  const { state, reset, ready, helpers } = useDemo();
  const unread = helpers.unreadTotal(state.currentUserId);
  const onCall = Boolean(state.activeCall);

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <div className="sticky top-0 z-40 border-b border-sky-200/80 bg-white/90 shadow-sm shadow-sky-500/10 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 ring-1 ring-sky-200">
              <DialerPhoneIcon className="h-5 w-5" />
            </div>
            <div>
              <Link
                href="/demo"
                className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700"
              >
                Dialer demo
              </Link>
              <p className="text-lg font-semibold leading-tight tracking-tight">
                {state.company.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onCall ? (
              <Link
                href="/demo/dialer"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                Live call
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset Northline Sales demo to a clean state?")) reset();
              }}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Reset demo
            </button>
            <Link
              href="/sign-in"
              className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
            >
              Sign in to app
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3 md:px-6">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/demo" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-sky-100 text-sky-950 ring-1 ring-sky-300"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                }`}
              >
                {link.label}
                {link.href === "/demo/messages" && unread > 0 ? (
                  <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
                    {unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        {(title || subtitle) && (
          <header className="mb-6">
            {title ? (
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
            ) : null}
            {subtitle ? <p className="mt-2 text-zinc-600">{subtitle}</p> : null}
          </header>
        )}
        {!ready ? <p className="text-zinc-600">Loading demo…</p> : children}
      </main>
    </div>
  );
}
