"use client";

import { useEffect, useMemo, useState } from "react";

export default function Footer() {
  const year = new Date().getFullYear();
  const [now, setNow] = useState(() => new Date());

  const deploymentNumber = process.env.NEXT_PUBLIC_DEPLOYMENT_NUMBER || process.env.NEXT_PUBLIC_RELEASE || "dev";
  const deployedAtLabel = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_DEPLOYED_AT || process.env.NEXT_PUBLIC_BUILD_TIME || "";
    if (!raw) return "Not set";
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? "Not set" : dt.toLocaleString();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <footer className="flex h-16 shrink-0 items-center border-t-2 border-zinc-200/90 bg-gradient-to-r from-zinc-50/80 via-white to-sky-50/40 text-base text-zinc-600 dark:border-zinc-700 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 dark:text-zinc-400">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-3 px-4">
        <p>© {year} Dialer</p>
        <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Deployment: {deploymentNumber}</span>
          <span>Date/Time: {now.toLocaleString()}</span>
          <span>Deployed At: {deployedAtLabel}</span>
        </div>
      </div>
    </footer>
  );
}
