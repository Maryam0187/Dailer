"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const MAX_RECORD_MS = 30000;

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AddressBotTryClient({ botName = "Address Assistant" }) {
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [started, setStarted] = useState(false);
  const [pending, setPending] = useState(false);
  const [talking, setTalking] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [typed, setTyped] = useState("");
  const [showType, setShowType] = useState(false);
  const [lines, setLines] = useState([]);
  const [sessionBotName, setSessionBotName] = useState(botName || "Address Assistant");
  const [micBlocked, setMicBlocked] = useState(false);

  const stateRef = useRef(null);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const talkingRef = useRef(false);
  const wantTalkRef = useRef(false);
  const recordTimerRef = useRef(null);
  const blobUrlRef = useRef("");
  const logRef = useRef(null);
  const finishingRef = useRef(false);

  useEffect(() => {
    setSessionBotName(botName || "Address Assistant");
  }, [botName]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/company-addresses", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load addresses");
        if (cancelled) return;
        const rows = Array.isArray(json.addresses) ? json.addresses : [];
        setAddresses(rows);
        setAddressId((prev) => {
          if (prev && rows.some((row) => String(row.id) === String(prev))) return prev;
          return rows[0]?.id ? String(rows[0].id) : "";
        });
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "Failed to load addresses");
      } finally {
        if (!cancelled) setLoadingAddresses(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = "";
    }
    setBotSpeaking(false);
  }, []);

  const stopMic = useCallback(() => {
    if (recordTimerRef.current) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    talkingRef.current = false;
    wantTalkRef.current = false;
    setTalking(false);
  }, []);

  useEffect(() => {
    return () => {
      stopAudio();
      stopMic();
    };
  }, [stopAudio, stopMic]);

  async function playBotReply(text) {
    const spoken = String(text || "").trim();
    if (!spoken) return;
    stopAudio();
    const res = await fetch("/api/address-bot/speak", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error || "Failed to play the bot voice");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    audio.src = url;
    setBotSpeaking(true);
    try {
      await audio.play();
      await new Promise((resolve) => {
        const done = () => {
          audio.removeEventListener("ended", done);
          audio.removeEventListener("error", done);
          resolve();
        };
        audio.addEventListener("ended", done);
        audio.addEventListener("error", done);
      });
    } finally {
      setBotSpeaking(false);
    }
  }

  async function postTry(payload) {
    const selectedId = Number(payload.addressId || addressId);
    if (payload.audio) {
      const form = new FormData();
      form.append("action", "message");
      form.append("addressId", String(selectedId));
      form.append("state", JSON.stringify(stateRef.current || {}));
      form.append("audio", payload.audio, payload.audio.name || "customer.webm");
      return fetch("/api/address-bot/try", {
        method: "POST",
        credentials: "include",
        body: form,
      });
    }
    return fetch("/api/address-bot/try", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: payload.action,
        addressId: selectedId,
        userText: payload.userText || "",
        state: stateRef.current,
      }),
    });
  }

  async function handleResult(res, { includeCustomer } = {}) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Failed to talk to the bot");
    stateRef.current = json.state || null;
    if (json.botName) setSessionBotName(json.botName);
    setLines((prev) => {
      const next = [...prev];
      if (includeCustomer && json.customerText) {
        next.push({ id: nextId(), role: "customer", text: json.customerText });
      }
      if (json.reply) next.push({ id: nextId(), role: "bot", text: json.reply });
      return next;
    });
    if (json.reply) await playBotReply(json.reply);
    return json;
  }

  async function onStart() {
    if (pending || !addressId) return;
    setPending(true);
    setError(null);
    stopAudio();
    stateRef.current = null;
    setLines([]);
    try {
      const res = await postTry({ action: "start", addressId });
      await handleResult(res);
      setStarted(true);
    } catch (e) {
      setStarted(false);
      setError(e.message || "Failed to start");
    } finally {
      setPending(false);
    }
  }

  function onReset() {
    stopAudio();
    stopMic();
    stateRef.current = null;
    setStarted(false);
    setLines([]);
    setTyped("");
    setError(null);
  }

  async function sendTyped(e) {
    e?.preventDefault?.();
    const text = typed.trim();
    if (!text || pending || botSpeaking || !started) return;
    setPending(true);
    setError(null);
    setTyped("");
    try {
      const res = await postTry({ action: "message", userText: text, addressId });
      await handleResult(res, { includeCustomer: true });
    } catch (err) {
      setError(err.message || "Failed to send");
    } finally {
      setPending(false);
    }
  }

  async function finishRecording() {
    if (finishingRef.current) return;
    const recorder = recorderRef.current;
    if (!recorder) return;
    finishingRef.current = true;
    try {
      await new Promise((resolve) => {
        recorder.addEventListener("stop", resolve, { once: true });
        try {
          if (recorder.state !== "inactive") recorder.stop();
          else resolve();
        } catch {
          resolve();
        }
      });
      const chunks = chunksRef.current;
      chunksRef.current = [];
      recorderRef.current = null;
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
      }
      if (recordTimerRef.current) {
        clearTimeout(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      talkingRef.current = false;
      wantTalkRef.current = false;
      setTalking(false);

      if (!chunks.length) {
        setError("No audio captured. Hold Talk and speak.");
        return;
      }
      const mime = recorder.mimeType || pickRecorderMime() || "audio/webm";
      const blob = new Blob(chunks, { type: mime });
      if (blob.size < 400) {
        setError("That was too short. Hold Talk and speak as the customer.");
        return;
      }
      const file = new File([blob], mime.includes("mp4") ? "customer.m4a" : "customer.webm", {
        type: mime,
      });
      setPending(true);
      setError(null);
      try {
        const res = await postTry({ audio: file, addressId });
        await handleResult(res, { includeCustomer: true });
      } catch (err) {
        setError(err.message || "Failed to hear that");
      } finally {
        setPending(false);
      }
    } finally {
      finishingRef.current = false;
    }
  }

  async function startTalk(event) {
    if (event?.pointerType === "mouse" && event.button !== 0) return;
    event?.preventDefault?.();
    if (!started || pending || botSpeaking || talkingRef.current) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicBlocked(true);
      setShowType(true);
      setError("This browser cannot use the microphone. Type as the customer instead.");
      return;
    }
    wantTalkRef.current = true;
    talkingRef.current = true;
    setTalking(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!wantTalkRef.current) {
        for (const track of stream.getTracks()) track.stop();
        talkingRef.current = false;
        setTalking(false);
        return;
      }
      streamRef.current = stream;
      setMicBlocked(false);
      const mime = pickRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start(250);
      recordTimerRef.current = setTimeout(() => {
        void finishRecording();
      }, MAX_RECORD_MS);
      event?.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (err) {
      wantTalkRef.current = false;
      talkingRef.current = false;
      setTalking(false);
      setMicBlocked(true);
      setShowType(true);
      setError(err?.message || "Microphone permission is needed to talk as the customer.");
    }
  }

  function endTalk(event) {
    event?.preventDefault?.();
    wantTalkRef.current = false;
    if (recorderRef.current) {
      void finishRecording();
      return;
    }
    if (talkingRef.current && !streamRef.current) {
      talkingRef.current = false;
      setTalking(false);
    }
  }

  const busy = pending || botSpeaking;
  const canTalk = started && !busy && !talking;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <audio ref={audioRef} className="hidden" />
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Train by talking</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        You are the customer. Speak into the mic. {sessionBotName} talks back. Save the prompt and
        Q&amp;A above first — Start reloads the latest saved training. No live call.
      </p>

      {loadError ? (
        <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{loadError}</p>
      ) : null}

      <div className="mt-4">
        <label className={labelClass} htmlFor="address-bot-try-address">
          Address
        </label>
        <select
          id="address-bot-try-address"
          className={inputClass}
          value={addressId}
          disabled={started || loadingAddresses}
          onChange={(e) => setAddressId(e.target.value)}
        >
          {loadingAddresses ? <option value="">Loading addresses…</option> : null}
          {!loadingAddresses && addresses.length === 0 ? (
            <option value="">No addresses yet</option>
          ) : null}
          {addresses.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        {!loadingAddresses && addresses.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            An admin needs to add a company address before you can train by talking.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!started ? (
          <button
            type="button"
            onClick={onStart}
            disabled={pending || !addressId}
            className="h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? "Starting…" : "Start"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={!canTalk && !talking}
              onPointerDown={startTalk}
              onPointerUp={endTalk}
              onPointerCancel={endTalk}
              onContextMenu={(e) => e.preventDefault()}
              className={`h-11 min-w-[9rem] select-none rounded-lg px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70 ${
                talking ? "bg-rose-600 hover:bg-rose-600" : "bg-sky-600 hover:bg-sky-700"
              }`}
            >
              {talking ? "Listening…" : "Hold to talk"}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={talking}
              className="h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Reset
            </button>
          </>
        )}
      </div>

      {started ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {botSpeaking
            ? `${sessionBotName} is speaking…`
            : pending
              ? "Working…"
              : talking
                ? "Release when you finish."
                : "Hold Talk and speak as the customer."}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
      ) : null}

      <div
        ref={logRef}
        className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950"
      >
        {lines.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Start a conversation to hear the bot greet you.
          </p>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                line.role === "customer"
                  ? "ml-auto bg-sky-600 text-white"
                  : "bg-white text-zinc-800 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {line.role === "customer" ? "Customer" : sessionBotName}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{line.text}</p>
            </div>
          ))
        )}
      </div>

      {started ? (
        <div className="mt-4">
          {showType ? (
            <form onSubmit={sendTyped} className="space-y-2">
              <label className={labelClass} htmlFor="address-bot-try-type">
                Type what the customer would say
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="address-bot-try-type"
                  className={`${inputClass} min-w-[12rem] flex-1`}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="yes"
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !typed.trim()}
                  className="h-11 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Send
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowType(true)}
              className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
            >
              {micBlocked ? "Type as the customer instead" : "Can't use a mic? Type instead"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
