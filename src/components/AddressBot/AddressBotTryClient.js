"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-sky-500/80 focus:ring-2 focus:ring-sky-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:ring-sky-400/20";

const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200";
const UTTERANCE_PAUSE_MS = 700;
const MIN_UTTERANCE_CHARS = 2;

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function audioUploadName(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("mp4") || mime.includes("m4a")) return "customer.m4a";
  if (mime.includes("ogg")) return "customer.ogg";
  if (mime.includes("wav")) return "customer.wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "customer.mp3";
  return "customer.webm";
}

function audioUploadType(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("mp4") || mime.includes("m4a")) return "audio/mp4";
  if (mime.includes("ogg")) return "audio/ogg";
  if (mime.includes("wav")) return "audio/wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio/mpeg";
  return "audio/webm";
}

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSpeech(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeEcho(heard, lastBot) {
  const a = normalizeSpeech(heard);
  const b = normalizeSpeech(lastBot);
  if (!a || !b) return false;
  if (a.length >= 6 && b.includes(a)) return true;
  if (b.length >= 12 && a.includes(b)) return true;
  const aWords = a.split(" ").filter((w) => w.length > 2);
  const bWords = b.split(" ").filter((w) => w.length > 2);
  if (!aWords.length || !bWords.length) return false;
  const bSet = new Set(bWords);
  const overlap = aWords.filter((w) => bSet.has(w)).length;
  return overlap / aWords.length >= 0.75 && aWords.length >= 3;
}

function friendlyError(err, fallback) {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    const fromApi = parsed?.error?.message || parsed?.error || parsed?.message;
    if (fromApi) return String(fromApi);
  } catch {
    /* not JSON */
  }
  if (/notallowed|permission|denied/i.test(raw)) {
    return "Allow the microphone in the browser, then click Start.";
  }
  return raw;
}

export default function AddressBotTryClient({ botName = "Address Assistant" }) {
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [started, setStarted] = useState(false);
  const [pending, setPending] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState("");
  const [showType, setShowType] = useState(false);
  const [lines, setLines] = useState([]);
  const [sessionBotName, setSessionBotName] = useState(botName || "Address Assistant");
  const [micBlocked, setMicBlocked] = useState(false);
  const [heardPreview, setHeardPreview] = useState("");

  const stateRef = useRef(null);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobUrlRef = useRef("");
  const logRef = useRef(null);
  const listeningRef = useRef(false);
  const botSpeakingRef = useRef(false);
  const lastBotTextRef = useRef("");
  const turnGenRef = useRef(0);
  const debounceRef = useRef(null);
  const pendingUtteranceRef = useRef("");
  const addressIdRef = useRef("");
  const audioCtxRef = useRef(null);
  const vadRafRef = useRef(0);
  const vadSpeechRef = useRef(false);
  const vadSilenceAtRef = useRef(0);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    setSessionBotName(botName || "Address Assistant");
  }, [botName]);

  useEffect(() => {
    addressIdRef.current = addressId;
  }, [addressId]);

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
  }, [lines, heardPreview]);

  const interruptBot = useCallback(() => {
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
    botSpeakingRef.current = false;
    setBotSpeaking(false);
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const stopVad = useCallback(() => {
    if (vadRafRef.current) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = 0;
    }
    vadSpeechRef.current = false;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, []);

  const releaseMic = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  }, []);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setHeardPreview("");
    pendingUtteranceRef.current = "";
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    stopRecognition();
    stopVad();
  }, [stopRecognition, stopVad]);

  useEffect(() => {
    return () => {
      interruptBot();
      stopListening();
      releaseMic();
    };
  }, [interruptBot, releaseMic, stopListening]);

  async function ensureMic() {
    const existing = streamRef.current;
    if (existing?.getAudioTracks().some((track) => track.readyState === "live")) {
      return existing;
    }
    if (existing) {
      for (const track of existing.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser cannot use the microphone.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;
    setMicBlocked(false);
    return stream;
  }

  async function playBotReply(text, gen) {
    const spoken = String(text || "").trim();
    if (!spoken) return;
    if (turnGenRef.current !== gen) return;
    lastBotTextRef.current = spoken;
    const res = await fetch("/api/address-bot/speak", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken }),
    });
    if (turnGenRef.current !== gen) return;
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error || "Failed to play the bot voice");
    }
    const blob = await res.blob();
    if (turnGenRef.current !== gen) return;
    const url = URL.createObjectURL(blob);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = url;
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    audio.src = url;
    botSpeakingRef.current = true;
    setBotSpeaking(true);
    try {
      await new Promise((resolve, reject) => {
        const done = () => {
          audio.removeEventListener("ended", done);
          audio.removeEventListener("error", onError);
          audio.removeEventListener("pause", done);
          resolve();
        };
        const onError = () => {
          audio.removeEventListener("ended", done);
          audio.removeEventListener("error", onError);
          audio.removeEventListener("pause", done);
          reject(new Error("Bot audio failed"));
        };
        audio.addEventListener("ended", done);
        audio.addEventListener("error", onError);
        audio.addEventListener("pause", done);
        const playResult = audio.play();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(onError);
        }
      });
    } catch {
      /* autoplay / interrupt */
    } finally {
      if (turnGenRef.current === gen) {
        botSpeakingRef.current = false;
        setBotSpeaking(false);
      }
    }
  }

  async function postTry(payload) {
    const selectedId = Number(payload.addressId || addressIdRef.current);
    if (payload.audio) {
      const form = new FormData();
      form.append("action", "message");
      form.append("addressId", String(selectedId));
      form.append("state", JSON.stringify(stateRef.current || {}));
      form.append("audio", payload.audio, payload.filename || "customer.webm");
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

  async function submitCustomerText(userText) {
    const spoken = String(userText || "").replace(/\s+/g, " ").trim();
    if (!spoken || spoken.length < MIN_UTTERANCE_CHARS) return;
    if (looksLikeEcho(spoken, lastBotTextRef.current)) return;
    if (!listeningRef.current) return;
    if (submitInFlightRef.current) interruptBot();

    interruptBot();
    const gen = ++turnGenRef.current;
    submitInFlightRef.current = true;
    setPending(true);
    setError(null);
    setHeardPreview("");
    pendingUtteranceRef.current = "";
    setLines((prev) => [...prev, { id: nextId(), role: "customer", text: spoken }]);

    try {
      const res = await postTry({ action: "message", userText: spoken });
      if (turnGenRef.current !== gen) return;
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to talk to the bot");
      stateRef.current = json.state || null;
      if (json.botName) setSessionBotName(json.botName);
      if (json.reply) {
        setLines((prev) => [...prev, { id: nextId(), role: "bot", text: json.reply }]);
        await playBotReply(json.reply, gen);
      }
    } catch (err) {
      if (turnGenRef.current === gen) {
        setError(friendlyError(err, "Failed to hear that"));
      }
    } finally {
      if (turnGenRef.current === gen) {
        submitInFlightRef.current = false;
        setPending(false);
      }
    }
  }

  function queueUtterance(text, { bargeIn = false } = {}) {
    const spoken = String(text || "").replace(/\s+/g, " ").trim();
    if (!spoken) return;
    if (looksLikeEcho(spoken, lastBotTextRef.current)) {
      setHeardPreview("");
      return;
    }
    if (bargeIn && botSpeakingRef.current) interruptBot();
    pendingUtteranceRef.current = spoken;
    setHeardPreview(spoken);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const ready = pendingUtteranceRef.current;
      pendingUtteranceRef.current = "";
      debounceRef.current = null;
      void submitCustomerText(ready);
    }, UTTERANCE_PAUSE_MS);
  }

  function startBrowserListening() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return false;
    stopRecognition();
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      if (!listeningRef.current) return;
      let finals = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = String(event.results[i]?.[0]?.transcript || "").trim();
        if (!piece) continue;
        if (event.results[i].isFinal) finals += `${piece} `;
        else interim += `${piece} `;
      }
      const live = `${pendingUtteranceRef.current} ${finals} ${interim}`.replace(/\s+/g, " ").trim();
      if (live) setHeardPreview(live);
      if (interim && !looksLikeEcho(interim, lastBotTextRef.current) && botSpeakingRef.current) {
        interruptBot();
      }
      if (finals.trim()) {
        const next = `${pendingUtteranceRef.current} ${finals}`.replace(/\s+/g, " ").trim();
        queueUtterance(next, { bargeIn: true });
      }
    };
    recognition.onerror = (event) => {
      if (event?.error === "not-allowed") {
        setMicBlocked(true);
        setShowType(true);
        setError("Allow the microphone in the browser, then click Start.");
      }
    };
    recognition.onend = () => {
      if (!listeningRef.current || recognitionRef.current !== recognition) return;
      try {
        recognition.start();
      } catch {
        setTimeout(() => {
          if (!listeningRef.current || recognitionRef.current !== recognition) return;
          try {
            recognition.start();
          } catch {
            /* ignore */
          }
        }, 250);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      return true;
    } catch {
      recognitionRef.current = null;
      return false;
    }
  }

  async function submitRecordedBlob(recorder) {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (!chunks.length) return;
    const rawType = recorder?.mimeType || pickRecorderMime() || "audio/webm";
    const type = audioUploadType(rawType);
    const filename = audioUploadName(type);
    const blob = new Blob(chunks, { type });
    if (blob.size < 800) return;

    const gen = ++turnGenRef.current;
    interruptBot();
    submitInFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await postTry({ audio: blob, filename });
      if (turnGenRef.current !== gen) return;
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to talk to the bot");
      stateRef.current = json.state || null;
      if (json.botName) setSessionBotName(json.botName);
      if (json.customerText) {
        setLines((prev) => [...prev, { id: nextId(), role: "customer", text: json.customerText }]);
      }
      if (json.reply) {
        setLines((prev) => [...prev, { id: nextId(), role: "bot", text: json.reply }]);
        await playBotReply(json.reply, gen);
      }
    } catch (err) {
      if (turnGenRef.current === gen) setError(friendlyError(err, "Failed to hear that"));
    } finally {
      if (turnGenRef.current === gen) {
        submitInFlightRef.current = false;
        setPending(false);
      }
    }
  }

  function startVadListening(stream) {
    if (typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") return false;
    stopVad();
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    chunksRef.current = [];

    const mime = pickRecorderMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;

    const rms = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const n = (samples[i] - 128) / 128;
        sum += n * n;
      }
      return Math.sqrt(sum / samples.length);
    };

    const tick = () => {
      if (!listeningRef.current) return;
      const level = rms();
      const threshold = botSpeakingRef.current ? 0.09 : 0.045;
      const now = Date.now();
      if (level >= threshold) {
        if (!vadSpeechRef.current) {
          vadSpeechRef.current = true;
          interruptBot();
          chunksRef.current = [];
          if (recorder.state === "inactive") {
            try {
              recorder.start(200);
            } catch {
              /* ignore */
            }
          }
        }
        vadSilenceAtRef.current = now;
      } else if (vadSpeechRef.current && now - vadSilenceAtRef.current > 800) {
        vadSpeechRef.current = false;
        if (recorder.state !== "inactive") {
          const current = recorder;
          current.addEventListener(
            "stop",
            () => {
              void submitRecordedBlob(current);
              if (listeningRef.current && recorderRef.current === current) {
                chunksRef.current = [];
              }
            },
            { once: true },
          );
          try {
            if (typeof current.requestData === "function") current.requestData();
            current.stop();
          } catch {
            vadSpeechRef.current = false;
          }
        }
      }
      vadRafRef.current = requestAnimationFrame(tick);
    };

    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    vadRafRef.current = requestAnimationFrame(tick);
    return true;
  }

  async function beginHandsFreeListen() {
    const stream = await ensureMic();
    listeningRef.current = true;
    setListening(true);
    const speechOk = startBrowserListening();
    if (!speechOk) startVadListening(stream);
  }

  async function onStart() {
    if (pending || !addressId) return;
    setPending(true);
    setError(null);
    interruptBot();
    stopListening();
    stateRef.current = null;
    lastBotTextRef.current = "";
    turnGenRef.current = 0;
    setLines([]);
    setHeardPreview("");
    try {
      await beginHandsFreeListen();
      const res = await postTry({ action: "start", addressId });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to start");
      stateRef.current = json.state || null;
      if (json.botName) setSessionBotName(json.botName);
      setStarted(true);
      if (json.reply) {
        setLines([{ id: nextId(), role: "bot", text: json.reply }]);
        const gen = turnGenRef.current;
        await playBotReply(json.reply, gen);
      }
    } catch (e) {
      stopListening();
      releaseMic();
      setStarted(false);
      if (/notallowed|permission|denied|microphone/i.test(String(e?.message || e))) {
        setMicBlocked(true);
        setShowType(true);
      }
      setError(friendlyError(e, "Failed to start"));
    } finally {
      setPending(false);
    }
  }

  function onReset() {
    interruptBot();
    stopListening();
    releaseMic();
    stateRef.current = null;
    lastBotTextRef.current = "";
    submitInFlightRef.current = false;
    setStarted(false);
    setPending(false);
    setLines([]);
    setTyped("");
    setHeardPreview("");
    setError(null);
  }

  async function sendTyped(e) {
    e?.preventDefault?.();
    const text = typed.trim();
    if (!text || !started) return;
    setTyped("");
    await submitCustomerText(text);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <audio ref={audioRef} className="hidden" />
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Train by talking</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Click Start once. You are the customer — just speak. {sessionBotName} talks back, and you
        can interrupt it. No extra buttons.
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
          <button
            type="button"
            onClick={onReset}
            className="h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Reset
          </button>
        )}
      </div>

      {started ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {heardPreview
            ? `Hearing: ${heardPreview}`
            : botSpeaking
              ? `${sessionBotName} is speaking — you can talk over it.`
              : pending
                ? "Working…"
                : listening
                  ? "Listening. Speak as the customer anytime."
                  : "Starting microphone…"}
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
            Click Start, then talk as the customer. The bot answers out loud.
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

      {started && (micBlocked || showType) ? (
        <form onSubmit={sendTyped} className="mt-4 space-y-2">
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
            />
            <button
              type="submit"
              disabled={!typed.trim()}
              className="h-11 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Send
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
