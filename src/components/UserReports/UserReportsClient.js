"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AttendanceClient from "@/components/Attendance/AttendanceClient";
import ReportsClient from "@/components/Reports/ReportsClient";
import UserReportDetail from "@/components/UserReports/UserReportDetail";

const TOP_TABS = [
  { id: "attendance", label: "Attendance" },
  { id: "metrics", label: "Call metrics", adminOnly: true },
  { id: "user", label: "User" },
];

function tabClass(active, accent) {
  const activeMap = {
    emerald:
      "border-emerald-600 text-emerald-800 dark:border-emerald-500 dark:text-emerald-200",
    violet:
      "border-violet-600 text-violet-800 dark:border-violet-500 dark:text-violet-200",
    sky: "border-sky-600 text-sky-800 dark:border-sky-500 dark:text-sky-200",
  };
  return `shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
    active
      ? activeMap[accent] || activeMap.emerald
      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
  }`;
}

export default function UserReportsClient({
  isAdmin,
  isManager = false,
  canEditAttendanceStatus = false,
  users = [],
  viewerRole,
  currentUserId,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const allowedTabs = useMemo(() => {
    return TOP_TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => t.id);
  }, [isAdmin]);

  const tabFromUrl = searchParams.get("tab");
  const userIdFromUrl = searchParams.get("userId");

  const [topTab, setTopTab] = useState(() => {
    if (tabFromUrl && allowedTabs.includes(tabFromUrl)) return tabFromUrl;
    // Managers land on per-agent reports; admins on team attendance.
    return isManager ? "user" : "attendance";
  });

  const [selectedUserId, setSelectedUserId] = useState(() => {
    const n = Number(userIdFromUrl);
    if (Number.isInteger(n) && n > 0 && users.some((u) => u.id === n)) return n;
    return users[0]?.id ?? null;
  });

  useEffect(() => {
    if (tabFromUrl && allowedTabs.includes(tabFromUrl) && tabFromUrl !== topTab) {
      setTopTab(tabFromUrl);
    }
  }, [tabFromUrl, allowedTabs, topTab]);

  useEffect(() => {
    const n = Number(userIdFromUrl);
    if (Number.isInteger(n) && n > 0 && users.some((u) => u.id === n) && n !== selectedUserId) {
      setSelectedUserId(n);
    }
  }, [userIdFromUrl, users, selectedUserId]);

  const replaceQuery = useCallback(
    (next) => {
      const qs = new URLSearchParams(searchParams.toString());
      Object.entries(next).forEach(([key, value]) => {
        if (value == null || value === "") qs.delete(key);
        else qs.set(key, String(value));
      });
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  function onSelectTopTab(id) {
    setTopTab(id);
    const patch = { tab: id };
    if (id === "user" && selectedUserId) patch.userId = selectedUserId;
    else if (id !== "user") patch.userId = null;
    replaceQuery(patch);
  }

  function onUserIdChange(id) {
    setSelectedUserId(id);
    setTopTab("user");
    replaceQuery({ tab: "user", userId: id });
  }

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const attendanceUsers = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        username: u.username,
        shiftKey: u.shiftKey === "night" ? "night" : "day",
        isOutside: Boolean(u.isOutside),
      })),
    [users],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TOP_TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTopTab(t.id)}
              className={tabClass(
                topTab === t.id,
                t.id === "metrics" ? "violet" : t.id === "user" ? "sky" : "emerald",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {topTab === "attendance" ? (
        <AttendanceClient
          isAdmin={isAdmin}
          canEditStatus={canEditAttendanceStatus}
          users={attendanceUsers}
        />
      ) : null}

      {topTab === "metrics" && isAdmin ? <ReportsClient /> : null}

      {topTab === "user" ? (
        selectedUser ? (
          <UserReportDetail
            user={selectedUser}
            users={users}
            viewerRole={viewerRole}
            currentUserId={currentUserId}
            onUserIdChange={onUserIdChange}
          />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No users available.</p>
        )
      ) : null}
    </div>
  );
}
