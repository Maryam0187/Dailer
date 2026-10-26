"use client";

import { useEffect, useRef, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SalesBotTryClient({ botName = "Sales Assistant" }) {
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const [sessionBotName, setSessionBotName] = useState(botName);
  const stateRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    setSessionBotName(botName);
  }, [botName]);

  async function playBotReply(text) {
    const spoken = String(text || "").trim();
    if (!spoken) return;
    const res = await fetch("/api/sales-bot/speak", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    audio.src = url;
    try {
      await audio.play();
    } catch {
      /* autoplay */
    }
  }

  async function startSession() {
    setError(null);
    setPending(true);
    setLines([]);
    stateRef.current = null;
    try {
      const res = await fetch("/api/sales-bot/try", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", state: null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to start");
      stateRef.current = json.state || null;
      if (json.botName) setSessionBotName(json.botName);
      setActive(true);
      if (json.reply) {
        setLines([{ id: nextId(), role: "bot", text: json.reply }]);
        await playBotReply(json.reply);
      }
    } catch (err) {
      setError(err?.message || "Failed to start try session");
      setActive(false);
    } finally {
      setPending(false);
    }
  }

  async function sendMessage(text) {
    const spoken = String(text || "").trim();
    if (!spoken || !active || pending) return;
    setPending(true);
    setError(null);
    setDraft("");
    setLines((prev) => [...prev, { id: nextId(), role: "customer", text: spoken }]);
    try {
      const res = await fetch("/api/sales-bot/try", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          userText: spoken,
          state: stateRef.current,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to talk to the bot");
      stateRef.current = json.state || null;
      if (json.botName) setSessionBotName(json.botName);
      if (json.reply) {
        setLines((prev) => [...prev, { id: nextId(), role: "bot", text: json.reply }]);
        await playBotReply(json.reply);
      }
    } catch (err) {
      setError(err?.message || "Failed to send message");
    } finally {
      setPending(false);
    }
  }

  function stopSession() {
    setActive(false);
    stateRef.current = null;
    setLines([]);
    setDraft("");
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Try without a live call</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Practice as the customer. {sessionBotName} speaks first, like a real start-of-call pitch.
          </p>
        </div>
        <div className="flex gap-2">
          {!active ? (
            <button
              type="button"
              onClick={() => void startSession()}
              disabled={pending}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {pending ? "Starting…" : "Start"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopSession}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="mb-4 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
        {!lines.length ? (
          <p className="text-sm text-zinc-500">Click Start to hear the opening pitch.</p>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                line.role === "bot"
                  ? "bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100"
                  : "bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              }`}
            >
              <span className="mr-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                {line.role === "bot" ? sessionBotName : "You"}
              </span>
              {line.text}
            </div>
          ))
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(draft);
        }}
      >
        <input
          className={inputClass}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={active ? "Type as the customer…" : "Start a session first"}
          disabled={!active || pending}
        />
        <button
          type="submit"
          disabled={!active || pending || !draft.trim()}
          className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      </form>
    </section>
  );
}
