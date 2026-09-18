"use client";

import { useCallback, useEffect, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const textareaClass =
  "min-h-[6.5rem] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";

function emptyForm() {
  return { label: "", address: "" };
}

export default function AddressBotSettingsClient() {
  const [addresses, setAddresses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/company-addresses", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load addresses");
      setAddresses(Array.isArray(json.addresses) ? json.addresses : []);
    } catch (e) {
      setError(e.message || "Failed to load addresses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ label: row.label || "", address: row.address || "" });
    setSaved(false);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
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
      setForm(emptyForm());
      await load();
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
      await load();
    } catch (err) {
      setError(err.message || "Failed to delete address");
    }
  }

  return (
    <div className="space-y-6">
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

        {error ? (
          <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
        ) : null}
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
    </div>
  );
}
