"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

const btnPrimary =
  "inline-flex h-10 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50";

const btnSecondary =
  "inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3.5 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

function groupNumbers(numbers) {
  const main = [];
  const byTeam = new Map();
  for (const n of numbers || []) {
    if (n.accountKind === "team" && n.managerId) {
      const key = Number(n.managerId);
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key).push(n);
    } else {
      main.push(n);
    }
  }
  return { main, byTeam };
}

function assigneeLabel(assignees) {
  if (!assignees?.length) return "Unassigned";
  return assignees.map((a) => `${a.username} (L${a.line})`).join(", ");
}

export default function NumbersClient() {
  const [numbers, setNumbers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncMessages, setSyncMessages] = useState([]);

  const [addPhone, setAddPhone] = useState("");
  const [addKind, setAddKind] = useState("main");
  const [addManagerId, setAddManagerId] = useState("");
  const [adding, setAdding] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPhone, setAssignPhone] = useState(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignLine, setAssignLine] = useState("1");
  const [assigning, setAssigning] = useState(false);

  const [settingsSource, setSettingsSource] = useState(null);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [apiKeySid, setApiKeySid] = useState("");
  const [apiKeySecret, setApiKeySecret] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumber2, setPhoneNumber2] = useState("");
  const [authTokenMasked, setAuthTokenMasked] = useState(null);
  const [apiKeySecretMasked, setApiKeySecretMasked] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [teamManagerId, setTeamManagerId] = useState("");
  const [teamAccountSid, setTeamAccountSid] = useState("");
  const [teamAuthToken, setTeamAuthToken] = useState("");
  const [teamApiKeySid, setTeamApiKeySid] = useState("");
  const [teamApiKeySecret, setTeamApiKeySecret] = useState("");
  const [teamDefaultFrom, setTeamDefaultFrom] = useState("");
  const [teamAuthMasked, setTeamAuthMasked] = useState(null);
  const [teamSecretMasked, setTeamSecretMasked] = useState(null);
  const [teamConfigured, setTeamConfigured] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamSaved, setTeamSaved] = useState(false);

  const { main, byTeam } = useMemo(() => groupNumbers(numbers), [numbers]);

  const managerOptions = useMemo(() => {
    return (users || [])
      .filter((u) => u.role === "manager" && u.isActive !== false)
      .slice()
      .sort((a, b) => String(a.username).localeCompare(String(b.username)));
  }, [users]);

  const managersWithSubaccount = useMemo(() => {
    return (teams || []).map((t) => ({
      ...t,
      username: t.managerUsername,
    }));
  }, [teams]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [numRes, usersRes, settingsRes] = await Promise.all([
        fetch("/api/admin/twilio-numbers", { credentials: "include" }),
        fetch("/api/users", { credentials: "include" }),
        fetch("/api/admin/twilio-settings", { credentials: "include" }),
      ]);
      const numJson = await numRes.json().catch(() => ({}));
      const usersJson = await usersRes.json().catch(() => ({}));
      const settingsJson = await settingsRes.json().catch(() => ({}));
      if (!numRes.ok) throw new Error(numJson?.error || "Failed to load numbers");
      if (!usersRes.ok) throw new Error(usersJson?.error || "Failed to load users");
      if (!settingsRes.ok) throw new Error(settingsJson?.error || "Failed to load Twilio settings");
      setNumbers(numJson.numbers || []);
      setTeams(numJson.teams || []);
      setUsers(usersJson.users || []);
      const s = settingsJson.settings || {};
      setSettingsSource(s.source || null);
      setAccountSid(s.accountSid || "");
      setAuthToken("");
      setApiKeySid(s.apiKeySid || "");
      setApiKeySecret("");
      setPhoneNumber(s.phoneNumber || "");
      setPhoneNumber2(s.phoneNumber2 || "");
      setAuthTokenMasked(s.authTokenMasked || null);
      setApiKeySecretMasked(s.apiKeySecretMasked || null);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSync(body) {
    setError(null);
    setSyncMessages([]);
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/twilio-numbers/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && !json.accounts?.length) {
        throw new Error(json?.error || "Sync failed");
      }
      const msgs = (json.accounts || []).map((a) => {
        const who =
          a.scope === "main"
            ? "Main"
            : `Team ${a.managerUsername || a.managerId}`;
        if (a.ok) {
          return `${who}: fetched ${a.fetched} (created ${a.created}, updated ${a.updated})`;
        }
        return `${who}: failed — ${a.error || "unknown error"}`;
      });
      setSyncMessages(msgs);
      await load();
    } catch (err) {
      setError(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function onManualAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/twilio-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phoneNumber: addPhone,
          accountKind: addKind,
          managerId: addKind === "team" ? Number(addManagerId) : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to add number");
      setAddPhone("");
      await load();
    } catch (err) {
      setError(err.message || "Failed to add number");
    } finally {
      setAdding(false);
    }
  }

  function openAssign(phoneNumber) {
    setAssignPhone(phoneNumber);
    setAssignUserId("");
    setAssignLine("1");
    setAssignOpen(true);
  }

  async function onAssign(e) {
    e.preventDefault();
    if (!assignPhone) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/twilio-numbers/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phoneNumber: assignPhone,
          userId: Number(assignUserId),
          line: Number(assignLine),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Assign failed");
      setAssignOpen(false);
      await load();
    } catch (err) {
      setError(err.message || "Assign failed");
    } finally {
      setAssigning(false);
    }
  }

  async function onUnassign(phoneNumber) {
    setError(null);
    try {
      const res = await fetch("/api/admin/twilio-numbers/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phoneNumber }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Unassign failed");
      await load();
    } catch (err) {
      setError(err.message || "Unassign failed");
    }
  }

  async function onDelete(phoneNumber) {
    if (!window.confirm(`Remove ${phoneNumber} from inventory?`)) return;
    setError(null);
    try {
      const res = await fetch("/api/admin/twilio-numbers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phoneNumber }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  }

  const assignableUsers = useMemo(() => {
    return (users || []).filter((u) => u.isActive !== false && u.role !== "admin");
  }, [users]);

  function renderTable(rows) {
    if (!rows.length) {
      return (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No numbers in this group yet.</p>
      );
    }
    return (
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Number</th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Assigned</th>
              <th className="px-3 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((n) => (
              <tr key={n.id} className="bg-white dark:bg-zinc-950">
                <td className="px-3 py-2.5 font-mono text-zinc-900 dark:text-zinc-100">
                  {n.phoneNumber}
                </td>
                <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                  {n.friendlyName || n.label || "—"}
                </td>
                <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                  {assigneeLabel(n.assignees)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnSecondary} onClick={() => openAssign(n.phoneNumber)}>
                      Assign
                    </button>
                    {n.assignees?.length ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => onUnassign(n.phoneNumber)}
                      >
                        Unassign
                      </button>
                    ) : null}
                    {!n.assignees?.length ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => onDelete(n.phoneNumber)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  async function onSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/twilio-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accountSid,
          authToken: authToken || authTokenMasked || "",
          apiKeySid,
          apiKeySecret: apiKeySecret || apiKeySecretMasked || "",
          phoneNumber,
          phoneNumber2,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save Twilio settings");
      setSettingsSaved(true);
      setAuthToken("");
      setApiKeySecret("");
      setAuthTokenMasked(json.settings?.authTokenMasked || null);
      setApiKeySecretMasked(json.settings?.apiKeySecretMasked || null);
      setSettingsSource(json.settings?.source || "db");
      setAccountSid(json.settings?.accountSid || accountSid);
      setApiKeySid(json.settings?.apiKeySid || apiKeySid);
      setPhoneNumber(json.settings?.phoneNumber || "");
      setPhoneNumber2(json.settings?.phoneNumber2 || "");
    } catch (err) {
      setError(err.message || "Failed to save Twilio settings");
    } finally {
      setSavingSettings(false);
    }
  }

  function resetTeamForm() {
    setTeamAccountSid("");
    setTeamAuthToken("");
    setTeamApiKeySid("");
    setTeamApiKeySecret("");
    setTeamDefaultFrom("");
    setTeamAuthMasked(null);
    setTeamSecretMasked(null);
    setTeamConfigured(false);
    setTeamSaved(false);
  }

  async function loadTeamAccount(managerId) {
    setTeamManagerId(String(managerId || ""));
    setTeamSaved(false);
    if (!managerId) {
      resetTeamForm();
      return;
    }
    setTeamLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/managers/${managerId}/twilio-account`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load team Twilio account");
      const acct = json.twilioAccount;
      if (!acct) {
        resetTeamForm();
        setTeamManagerId(String(managerId));
        return;
      }
      setTeamConfigured(true);
      setTeamAccountSid(acct.accountSid || "");
      setTeamAuthToken("");
      setTeamApiKeySid(acct.apiKeySid || "");
      setTeamApiKeySecret("");
      setTeamDefaultFrom(acct.defaultFromNumber || "");
      setTeamAuthMasked(acct.authTokenMasked || null);
      setTeamSecretMasked(acct.apiKeySecretMasked || null);
    } catch (err) {
      setError(err.message || "Failed to load team Twilio account");
      resetTeamForm();
      setTeamManagerId(String(managerId));
    } finally {
      setTeamLoading(false);
    }
  }

  async function onSaveTeamAccount(e) {
    e.preventDefault();
    if (!teamManagerId) return;
    setTeamSaving(true);
    setTeamSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/managers/${teamManagerId}/twilio-account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accountSid: teamAccountSid,
          authToken: teamAuthToken || teamAuthMasked || "",
          apiKeySid: teamApiKeySid,
          apiKeySecret: teamApiKeySecret || teamSecretMasked || "",
          defaultFromNumber: teamDefaultFrom || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save team Twilio account");
      setTeamSaved(true);
      setTeamConfigured(true);
      setTeamAuthToken("");
      setTeamApiKeySecret("");
      const acct = json.twilioAccount;
      setTeamAccountSid(acct?.accountSid || teamAccountSid);
      setTeamApiKeySid(acct?.apiKeySid || teamApiKeySid);
      setTeamDefaultFrom(acct?.defaultFromNumber || "");
      setTeamAuthMasked(acct?.authTokenMasked || null);
      setTeamSecretMasked(acct?.apiKeySecretMasked || null);
      await load();
    } catch (err) {
      setError(err.message || "Failed to save team Twilio account");
    } finally {
      setTeamSaving(false);
    }
  }

  async function onDeleteTeamAccount() {
    if (!teamManagerId) return;
    if (
      !window.confirm(
        "Remove this team's Twilio subaccount? Agents under this manager will fall back to the main account.",
      )
    ) {
      return;
    }
    setTeamSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/managers/${teamManagerId}/twilio-account`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to remove team Twilio account");
      resetTeamForm();
      setTeamManagerId(String(teamManagerId));
      await load();
    } catch (err) {
      setError(err.message || "Failed to remove team Twilio account");
    } finally {
      setTeamSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {settingsSaved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Main Twilio credentials saved. You can Refresh numbers now.
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Main Twilio account
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Admin-only. Used for existing teams on the main account. Leave Auth Token / API Secret
          blank to keep the current value
          {settingsSource ? ` (currently from ${settingsSource})` : ""}.
        </p>
        <form onSubmit={onSaveSettings} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="tw-sid">
              Account SID
            </label>
            <input
              id="tw-sid"
              className={inputClass}
              value={accountSid}
              onChange={(e) => setAccountSid(e.target.value)}
              placeholder="ACxxxxxxxx…"
              required
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tw-token">
              Auth Token{authTokenMasked ? ` (${authTokenMasked})` : ""}
            </label>
            <input
              id="tw-token"
              type="password"
              className={inputClass}
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder={authTokenMasked ? "Leave blank to keep" : "Auth token"}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tw-phone">
              Default Line 1 number
            </label>
            <input
              id="tw-phone"
              className={inputClass}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+15551234567"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tw-key">
              API Key SID (Voice)
            </label>
            <input
              id="tw-key"
              className={inputClass}
              value={apiKeySid}
              onChange={(e) => setApiKeySid(e.target.value)}
              placeholder="SKxxxxxxxx…"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tw-secret">
              API Key Secret{apiKeySecretMasked ? ` (${apiKeySecretMasked})` : ""}
            </label>
            <input
              id="tw-secret"
              type="password"
              className={inputClass}
              value={apiKeySecret}
              onChange={(e) => setApiKeySecret(e.target.value)}
              placeholder={apiKeySecretMasked ? "Leave blank to keep" : "API key secret"}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tw-phone2">
              Default Line 2 number
            </label>
            <input
              id="tw-phone2"
              className={inputClass}
              value={phoneNumber2}
              onChange={(e) => setPhoneNumber2(e.target.value)}
              placeholder="+15557654321"
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button type="submit" className={btnPrimary} disabled={savingSettings}>
              {savingSettings ? "Saving…" : "Save main credentials"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Team Twilio subaccount
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Admin-only. Attach a Twilio subaccount to a manager so that manager&apos;s agents dial and
          bill on that subaccount. Create the subaccount in Twilio Console first, then paste keys
          here. Managers cannot see or edit this.
        </p>

        {teamSaved ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            Team subaccount saved. Use Refresh team to pull its numbers.
          </div>
        ) : null}

        <div className="mt-4 max-w-md">
          <label className={labelClass} htmlFor="team-mgr">
            Manager
          </label>
          <select
            id="team-mgr"
            className={inputClass}
            value={teamManagerId}
            onChange={(e) => void loadTeamAccount(e.target.value)}
            disabled={teamLoading || teamSaving}
          >
            <option value="">Select manager…</option>
            {managerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.username}
                {teams.some((t) => Number(t.managerId) === Number(m.id))
                  ? " (subaccount configured)"
                  : ""}
              </option>
            ))}
          </select>
        </div>

        {teamManagerId ? (
          <form onSubmit={onSaveTeamAccount} className="mt-4 grid gap-4 sm:grid-cols-2">
            {teamLoading ? (
              <p className="sm:col-span-2 text-sm text-zinc-500">Loading…</p>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="team-sid">
                    Subaccount SID
                  </label>
                  <input
                    id="team-sid"
                    className={inputClass}
                    value={teamAccountSid}
                    onChange={(e) => setTeamAccountSid(e.target.value)}
                    placeholder="ACxxxxxxxx…"
                    required
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="team-token">
                    Auth Token{teamAuthMasked ? ` (${teamAuthMasked})` : ""}
                  </label>
                  <input
                    id="team-token"
                    type="password"
                    className={inputClass}
                    value={teamAuthToken}
                    onChange={(e) => setTeamAuthToken(e.target.value)}
                    placeholder={teamAuthMasked ? "Leave blank to keep" : "Subaccount auth token"}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="team-from">
                    Default From number
                  </label>
                  <input
                    id="team-from"
                    className={inputClass}
                    value={teamDefaultFrom}
                    onChange={(e) => setTeamDefaultFrom(e.target.value)}
                    placeholder="+15551234567"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="team-key">
                    API Key SID (Voice)
                  </label>
                  <input
                    id="team-key"
                    className={inputClass}
                    value={teamApiKeySid}
                    onChange={(e) => setTeamApiKeySid(e.target.value)}
                    placeholder="SKxxxxxxxx…"
                    required
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="team-secret">
                    API Key Secret{teamSecretMasked ? ` (${teamSecretMasked})` : ""}
                  </label>
                  <input
                    id="team-secret"
                    type="password"
                    className={inputClass}
                    value={teamApiKeySecret}
                    onChange={(e) => setTeamApiKeySecret(e.target.value)}
                    placeholder={teamSecretMasked ? "Leave blank to keep" : "API key secret"}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                  <button type="submit" className={btnPrimary} disabled={teamSaving}>
                    {teamSaving ? "Saving…" : "Save team subaccount"}
                  </button>
                  {teamConfigured ? (
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={teamSaving}
                      onClick={() => void onDeleteTeamAccount()}
                    >
                      Remove subaccount
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </form>
        ) : null}
      </section>

      {syncMessages.length ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">Last refresh</p>
          <ul className="mt-1 list-inside list-disc">
            {syncMessages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btnPrimary}
            disabled={syncing || loading}
            onClick={() => runSync({ scope: "all" })}
          >
            {syncing ? "Refreshing…" : "Refresh all from Twilio"}
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={syncing || loading}
            onClick={() => runSync({ scope: "main" })}
          >
            Refresh main
          </button>
          <button type="button" className={btnSecondary} disabled={loading} onClick={() => load()}>
            Reload list
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Add number manually</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Use when a number was bought in Twilio but did not appear after Refresh.
        </p>
        <form onSubmit={onManualAdd} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="add-phone">
              Phone (E.164)
            </label>
            <input
              id="add-phone"
              className={inputClass}
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              placeholder="+15551234567"
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="add-kind">
              Account
            </label>
            <select
              id="add-kind"
              className={inputClass}
              value={addKind}
              onChange={(e) => setAddKind(e.target.value)}
            >
              <option value="main">Main</option>
              <option value="team">Team subaccount</option>
            </select>
          </div>
          {addKind === "team" ? (
            <div>
              <label className={labelClass} htmlFor="add-mgr">
                Manager team
              </label>
              <select
                id="add-mgr"
                className={inputClass}
                value={addManagerId}
                onChange={(e) => setAddManagerId(e.target.value)}
                required
              >
                <option value="">Select manager…</option>
                {managersWithSubaccount.map((t) => (
                  <option key={t.managerId} value={t.managerId}>
                    {t.username || t.managerUsername}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex items-end">
            <button type="submit" className={btnPrimary} disabled={adding}>
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      </section>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading numbers…</p>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Main account</h2>
            </div>
            {renderTable(main)}
          </section>

          {(managersWithSubaccount.length
            ? managersWithSubaccount
            : [...byTeam.keys()].map((id) => ({
                managerId: id,
                username:
                  byTeam.get(id)?.[0]?.managerUsername || `manager#${id}`,
              }))
          ).map((team) => {
            const rows = byTeam.get(Number(team.managerId)) || [];
            return (
              <section key={team.managerId} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Team: {team.username || team.managerUsername}
                  </h2>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={syncing}
                    onClick={() =>
                      runSync({ scope: "team", managerId: Number(team.managerId) })
                    }
                  >
                    Refresh team
                  </button>
                </div>
                {renderTable(rows)}
              </section>
            );
          })}
        </>
      )}

      {assignOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Assign number</h3>
            <p className="mt-1 font-mono text-sm text-zinc-600 dark:text-zinc-400">{assignPhone}</p>
            <form onSubmit={onAssign} className="mt-4 space-y-4">
              <div>
                <label className={labelClass} htmlFor="assign-user">
                  User
                </label>
                <select
                  id="assign-user"
                  className={inputClass}
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  required
                >
                  <option value="">Select user…</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.role}
                      {u.canUseDialer2 ? ", 2 lines" : ""})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="assign-line">
                  Line
                </label>
                <select
                  id="assign-line"
                  className={inputClass}
                  value={assignLine}
                  onChange={(e) => setAssignLine(e.target.value)}
                >
                  <option value="1">Line 1</option>
                  <option value="2">Line 2</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setAssignOpen(false)}
                  disabled={assigning}
                >
                  Cancel
                </button>
                <button type="submit" className={btnPrimary} disabled={assigning}>
                  {assigning ? "Saving…" : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
