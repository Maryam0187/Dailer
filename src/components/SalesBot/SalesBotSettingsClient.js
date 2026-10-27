"use client";

import { useCallback, useEffect, useState } from "react";
import SalesBotTryClient from "@/components/SalesBot/SalesBotTryClient";
import SalesBotLiveCallClient from "@/components/SalesBot/SalesBotLiveCallClient";
import SalesBotCallLogsClient from "@/components/SalesBot/SalesBotCallLogsClient";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const textareaClass =
  "min-h-[6.5rem] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

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

export default function SalesBotSettingsClient({ isAdmin = false }) {
  const [profile, setProfile] = useState({ name: "Sales Assistant", instructions: "" });
  const [profileMeta, setProfileMeta] = useState({ updatedByUsername: null, updatedAt: null });
  const [examples, setExamples] = useState([]);
  const [exampleForm, setExampleForm] = useState(emptyExampleForm);
  const [editingExampleId, setEditingExampleId] = useState(null);
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingExample, setSavingExample] = useState(false);
  const [error, setError] = useState(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [exampleSaved, setExampleSaved] = useState(false);

  const loadTraining = useCallback(async () => {
    const [profileRes, examplesRes] = await Promise.all([
      fetch("/api/sales-bot/profile", { credentials: "include" }),
      fetch("/api/sales-bot/examples", { credentials: "include" }),
    ]);
    const profileJson = await profileRes.json().catch(() => ({}));
    const examplesJson = await examplesRes.json().catch(() => ({}));
    if (!profileRes.ok) throw new Error(profileJson?.error || "Failed to load prompt");
    if (!examplesRes.ok) throw new Error(examplesJson?.error || "Failed to load Q&A");
    const nextProfile = profileJson.profile || {};
    setProfile({
      name: nextProfile.name || "Sales Assistant",
      instructions: nextProfile.instructions || "",
    });
    setProfileMeta({
      updatedByUsername: nextProfile.updatedByUsername || null,
      updatedAt: nextProfile.updatedAt || null,
    });
    setExamples(Array.isArray(examplesJson.examples) ? examplesJson.examples : []);
  }, []);

  const loadChanges = useCallback(async () => {
    if (!isAdmin) {
      setChanges([]);
      return;
    }
    const res = await fetch("/api/sales-bot/changes", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Failed to load changes");
    setChanges(Array.isArray(json.changes) ? json.changes : []);
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadTraining();
        await loadChanges();
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTraining, loadChanges]);

  async function saveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    setProfileSaved(false);
    try {
      const res = await fetch("/api/sales-bot/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save prompt");
      const next = json.profile || {};
      setProfile({
        name: next.name || "Sales Assistant",
        instructions: next.instructions || "",
      });
      setProfileMeta({
        updatedByUsername: next.updatedByUsername || null,
        updatedAt: next.updatedAt || null,
      });
      setProfileSaved(true);
      await loadChanges();
    } catch (err) {
      setError(err?.message || "Failed to save prompt");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveExample(e) {
    e.preventDefault();
    setSavingExample(true);
    setError(null);
    setExampleSaved(false);
    try {
      const isEdit = Number.isInteger(editingExampleId) && editingExampleId > 0;
      const url = isEdit ? `/api/sales-bot/examples/${editingExampleId}` : "/api/sales-bot/examples";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exampleForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save Q&A");
      setExampleForm(emptyExampleForm());
      setEditingExampleId(null);
      setExampleSaved(true);
      await loadTraining();
      await loadChanges();
    } catch (err) {
      setError(err?.message || "Failed to save Q&A");
    } finally {
      setSavingExample(false);
    }
  }

  async function deleteExample(id) {
    if (!window.confirm("Delete this Q&A example?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/sales-bot/examples/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to delete");
      if (editingExampleId === id) {
        setEditingExampleId(null);
        setExampleForm(emptyExampleForm());
      }
      await loadTraining();
      await loadChanges();
    } catch (err) {
      setError(err?.message || "Failed to delete");
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading Sales Bot…</p>;
  }

  const profileEdited = lastEditedLine(profileMeta.updatedByUsername, profileMeta.updatedAt);

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <SalesBotLiveCallClient />

      <SalesBotCallLogsClient isAdmin={isAdmin} />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Prompt</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Name and instructions for the SaaS pitch. The bot speaks from the start of every live call.
        </p>
        <form className="mt-4 space-y-4" onSubmit={saveProfile}>
          <div>
            <label className={labelClass} htmlFor="sales-bot-name">
              Bot name
            </label>
            <input
              id="sales-bot-name"
              className={inputClass}
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              maxLength={64}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="sales-bot-instructions">
              Instructions / pitch
            </label>
            <textarea
              id="sales-bot-instructions"
              className={textareaClass}
              value={profile.instructions}
              onChange={(e) => setProfile((p) => ({ ...p, instructions: e.target.value }))}
              rows={8}
            />
          </div>
          {profileEdited ? (
            <p className="text-xs text-zinc-500">{profileEdited}</p>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {savingProfile ? "Saving…" : "Save prompt"}
            </button>
            {profileSaved ? <span className="text-sm text-emerald-600">Saved</span> : null}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Q&amp;A examples</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Train how the bot should answer common questions or objections.
        </p>
        <form className="mt-4 space-y-3" onSubmit={saveExample}>
          <div>
            <label className={labelClass} htmlFor="sales-bot-question">
              If the customer says
            </label>
            <input
              id="sales-bot-question"
              className={inputClass}
              value={exampleForm.question}
              onChange={(e) => setExampleForm((f) => ({ ...f, question: e.target.value }))}
              maxLength={500}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="sales-bot-answer">
              Bot should say
            </label>
            <textarea
              id="sales-bot-answer"
              className={textareaClass}
              value={exampleForm.answer}
              onChange={(e) => setExampleForm((f) => ({ ...f, answer: e.target.value }))}
              rows={3}
              maxLength={1000}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingExample}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {savingExample
                ? "Saving…"
                : editingExampleId
                  ? "Update Q&A"
                  : "Add Q&A"}
            </button>
            {editingExampleId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingExampleId(null);
                  setExampleForm(emptyExampleForm());
                }}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold dark:border-zinc-600"
              >
                Cancel edit
              </button>
            ) : null}
            {exampleSaved ? <span className="text-sm text-emerald-600">Saved</span> : null}
          </div>
        </form>

        <ul className="mt-5 space-y-3">
          {examples.map((ex) => (
            <li
              key={ex.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Q: {ex.question}</p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">A: {ex.answer}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="text-sm font-semibold text-sky-700 dark:text-sky-300"
                  onClick={() => {
                    setEditingExampleId(ex.id);
                    setExampleForm({ question: ex.question, answer: ex.answer });
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-rose-700 dark:text-rose-300"
                  onClick={() => void deleteExample(ex.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {!examples.length ? (
            <li className="text-sm text-zinc-500">No Q&amp;A examples yet.</li>
          ) : null}
        </ul>
      </section>

      <SalesBotTryClient botName={profile.name} />

      {isAdmin ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Recent changes</h2>
          <ul className="mt-3 space-y-2">
            {changes.map((c) => (
              <li key={c.id} className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold">{changeActionLabel(c.action)}</span>
                {" — "}
                {c.username || "system"} · {formatWhen(c.createdAt)}
                <div className="text-zinc-500">{c.summary}</div>
              </li>
            ))}
            {!changes.length ? <li className="text-sm text-zinc-500">No changes yet.</li> : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
