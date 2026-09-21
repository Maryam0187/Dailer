"use client";

import { useCallback, useEffect, useState } from "react";
import AddressBotTryClient from "@/components/AddressBot/AddressBotTryClient";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const textareaClass =
  "min-h-[6.5rem] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function emptyAddressForm() {
  return { label: "", address: "" };
}

function emptyExampleForm() {
  return { question: "", answer: "" };
}

function formatWhen(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function lastEditedLine(username, updatedAt) {
  const when = formatWhen(updatedAt);
  if (!username && !when) return null;
  if (username && when) return `Last edited by ${username} at ${when}`;
  if (username) return `Last edited by ${username}`;
  return `Last edited ${when}`;
}

function changeActionLabel(action) {
  switch (action) {
    case "update_prompt":
      return "Updated prompt";
    case "add_example":
      return "Added Q&A";
    case "update_example":
      return "Edited Q&A";
    case "delete_example":
      return "Deleted Q&A";
    default:
      return action || "Changed";
  }
}

export default function AddressBotSettingsClient({ isAdmin = false }) {
  const [profile, setProfile] = useState({ name: "Address Assistant", instructions: "" });
  const [profileMeta, setProfileMeta] = useState({ updatedByUsername: null, updatedAt: null });
  const [examples, setExamples] = useState([]);
  const [exampleForm, setExampleForm] = useState(emptyExampleForm);
  const [editingExampleId, setEditingExampleId] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [form, setForm] = useState(emptyAddressForm);
  const [editingId, setEditingId] = useState(null);
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingExample, setSavingExample] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [exampleSaved, setExampleSaved] = useState(false);

  const loadTraining = useCallback(async () => {
    const [profileRes, examplesRes] = await Promise.all([
      fetch("/api/address-bot/profile", { credentials: "include" }),
      fetch("/api/address-bot/examples", { credentials: "include" }),
    ]);
    const profileJson = await profileRes.json().catch(() => ({}));
    const examplesJson = await examplesRes.json().catch(() => ({}));
    if (!profileRes.ok) throw new Error(profileJson?.error || "Failed to load prompt");
    if (!examplesRes.ok) throw new Error(examplesJson?.error || "Failed to load Q&A");
    const nextProfile = profileJson.profile || {};
    setProfile({
      name: nextProfile.name || "Address Assistant",
      instructions: nextProfile.instructions || "",
    });
    setProfileMeta({
      updatedByUsername: nextProfile.updatedByUsername || null,
      updatedAt: nextProfile.updatedAt || null,
    });
    setExamples(Array.isArray(examplesJson.examples) ? examplesJson.examples : []);
  }, []);

  const loadAddresses = useCallback(async () => {
    if (!isAdmin) {
      setAddresses([]);
      return;
    }
    const res = await fetch("/api/company-addresses", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Failed to load addresses");
    setAddresses(Array.isArray(json.addresses) ? json.addresses : []);
  }, [isAdmin]);

  const loadChanges = useCallback(async () => {
    if (!isAdmin) {
      setChanges([]);
      return;
    }
    const res = await fetch("/api/address-bot/changes", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Failed to load change history");
    setChanges(Array.isArray(json.changes) ? json.changes : []);
  }, [isAdmin]);

  const load = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadTraining(), loadAddresses(), loadChanges()]);
    } catch (e) {
      setError(e.message || "Failed to load Address Assistant");
    } finally {
      setLoading(false);
    }
  }, [loadTraining, loadAddresses, loadChanges]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    setProfileSaved(false);
    try {
      const res = await fetch("/api/address-bot/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save prompt");
      const nextProfile = json.profile || profile;
      setProfile({
        name: nextProfile.name || "Address Assistant",
        instructions: nextProfile.instructions || "",
      });
      setProfileMeta({
        updatedByUsername: nextProfile.updatedByUsername || null,
        updatedAt: nextProfile.updatedAt || null,
      });
      setProfileSaved(true);
      await loadChanges();
    } catch (err) {
      setError(err.message || "Failed to save prompt");
    } finally {
      setSavingProfile(false);
    }
  }

  function startEditExample(row) {
    setEditingExampleId(row.id);
    setExampleForm({ question: row.question || "", answer: row.answer || "" });
    setExampleSaved(false);
    setError(null);
  }

  function cancelEditExample() {
    setEditingExampleId(null);
    setExampleForm(emptyExampleForm());
  }

  async function onSaveExample(e) {
    e.preventDefault();
    setSavingExample(true);
    setError(null);
    setExampleSaved(false);
    try {
      const url = editingExampleId
        ? `/api/address-bot/examples/${editingExampleId}`
        : "/api/address-bot/examples";
      const method = editingExampleId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exampleForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save Q&A");
      setExampleSaved(true);
      setEditingExampleId(null);
      setExampleForm(emptyExampleForm());
      await loadTraining();
      await loadChanges();
    } catch (err) {
      setError(err.message || "Failed to save Q&A");
    } finally {
      setSavingExample(false);
    }
  }

  async function onDeleteExample(id) {
    if (!window.confirm("Delete this question and answer?")) return;
    setError(null);
    setExampleSaved(false);
    try {
      const res = await fetch(`/api/address-bot/examples/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to delete Q&A");
      if (editingExampleId === id) cancelEditExample();
      await loadTraining();
      await loadChanges();
    } catch (err) {
      setError(err.message || "Failed to delete Q&A");
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ label: row.label || "", address: row.address || "" });
    setSaved(false);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyAddressForm());
    setError(null);
  }

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const url = editingId ? `/api/company-addresses/${editingId}` : "/api/company-addresses";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save address");
      setSaved(true);
      setEditingId(null);
      setForm(emptyAddressForm());
      await loadAddresses();
    } catch (err) {
      setError(err.message || "Failed to save address");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Delete this address?")) return;
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/company-addresses/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to delete address");
      if (editingId === id) cancelEdit();
      await loadAddresses();
    } catch (err) {
      setError(err.message || "Failed to delete address");
    }
  }

  const profileEdited = lastEditedLine(profileMeta.updatedByUsername, profileMeta.updatedAt);

  return (
    <div className="space-y-6">
      {error ? (
        <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
      ) : null}

      <form
        onSubmit={onSaveProfile}
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Tell the agent</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          This is the shared Address Assistant. What you save here is used on every live call when an
          agent clicks Start. Leave instructions empty to keep the built-in speaking style.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass} htmlFor="address-bot-name">
              Name
            </label>
            <input
              id="address-bot-name"
              className={inputClass}
              value={profile.name}
              onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Address Assistant"
              maxLength={64}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="address-bot-instructions">
              Prompt
            </label>
            <textarea
              id="address-bot-instructions"
              className={`${textareaClass} min-h-[10rem]`}
              value={profile.instructions}
              onChange={(e) => setProfile((prev) => ({ ...prev, instructions: e.target.value }))}
              placeholder="You are the address assistant. Ask them to grab a pen and paper. Wait if they are on hold. Spell street names. Read numbers digit by digit."
              maxLength={8000}
            />
          </div>
        </div>

        {profileEdited ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{profileEdited}</p>
        ) : null}
        {profileSaved ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">Prompt saved.</p>
        ) : null}

        <div className="mt-4">
          <button
            type="submit"
            disabled={savingProfile || loading}
            className="h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {savingProfile ? "Saving…" : "Save prompt"}
          </button>
        </div>
      </form>

      <form
        onSubmit={onSaveExample}
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          {editingExampleId ? "Edit question and answer" : "Question and answer"}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Extra examples the bot should follow when the customer says something similar.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass} htmlFor="address-bot-question">
              If the customer says
            </label>
            <input
              id="address-bot-question"
              className={inputClass}
              value={exampleForm.question}
              onChange={(e) => setExampleForm((prev) => ({ ...prev, question: e.target.value }))}
              placeholder="Can you say that slower?"
              maxLength={500}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="address-bot-answer">
              The bot should say
            </label>
            <textarea
              id="address-bot-answer"
              className={textareaClass}
              value={exampleForm.answer}
              onChange={(e) => setExampleForm((prev) => ({ ...prev, answer: e.target.value }))}
              placeholder="Of course. I'll repeat the address slowly."
              maxLength={1000}
              required
            />
          </div>
        </div>

        {exampleSaved ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">Q&A saved.</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={savingExample}
            className="h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {savingExample ? "Saving…" : editingExampleId ? "Update Q&A" : "Add Q&A"}
          </button>
          {editingExampleId ? (
            <button
              type="button"
              onClick={cancelEditExample}
              disabled={savingExample}
              className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
        ) : examples.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">No Q&A examples yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {examples.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
              >
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  If they say: {row.question}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Bot says: {row.answer}</p>
                {lastEditedLine(row.updatedByUsername, row.updatedAt) ? (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {lastEditedLine(row.updatedByUsername, row.updatedAt)}
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEditExample(row)}
                    className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteExample(row.id)}
                    className="h-9 rounded-lg border border-rose-200 px-3 text-sm font-medium text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/40"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </form>

      <AddressBotTryClient botName={profile.name} />

      {isAdmin ? (
        <form
          onSubmit={onSave}
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {editingId ? "Edit address" : "Add address"}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            The label appears as a button on the live call. The address is what the bot speaks to the
            customer.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass} htmlFor="address-bot-label">
                Button label
              </label>
              <input
                id="address-bot-label"
                className={inputClass}
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Office"
                maxLength={64}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="address-bot-address">
                Spoken address
              </label>
              <textarea
                id="address-bot-address"
                className={textareaClass}
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="123 Main Street, Dallas, Texas, 75001"
                maxLength={1000}
                required
              />
            </div>
          </div>

          {saved ? (
            <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">Saved.</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving…" : editingId ? "Update address" : "Add address"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {isAdmin ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Saved addresses</h2>
          {loading ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
          ) : addresses.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              No addresses yet. Add one above so agents can play it on a live call.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {addresses.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-950 dark:text-zinc-50">{row.label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                        {row.address}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(row.id)}
                        className="h-9 rounded-lg border border-rose-200 px-3 text-sm font-medium text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Change history</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Who changed the shared prompt or Q&A. Trainers cannot hide this list.
          </p>
          {loading ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
          ) : changes.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No prompt or Q&A changes yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {changes.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
                >
                  <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {row.username || "Unknown user"} — {changeActionLabel(row.action)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatWhen(row.createdAt)}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                    {row.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
