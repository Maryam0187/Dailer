"use client";

import { useEffect, useState } from "react";
import { useActiveCall } from "@/contexts/ActiveCallContext";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const DTMF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function ActiveCallPanel({ session, endCall, recentJoinedAgent }) {
  const { voiceConnected, muted: sdkMuted, toggleMute, sendDtmf, sdkError } = useTwilioVoice();
  const [isMinimized, setIsMinimized] = useState(false);
  const [uiMuted, setUiMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState(null);
  const [showAddAgentDialog, setShowAddAgentDialog] = useState(false);
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [addAgentLoading, setAddAgentLoading] = useState(false);
  const [addAgentError, setAddAgentError] = useState(null);
  const [addAgentStatus, setAddAgentStatus] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dtmfInput, setDtmfInput] = useState("");
  const [dtmfStatus, setDtmfStatus] = useState(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("idle");
  const [recordingMessage, setRecordingMessage] = useState(null);
  const [emptyParticipantHits, setEmptyParticipantHits] = useState(0);
  const isMuted = voiceConnected ? sdkMuted : uiMuted;

  useEffect(() => {
    if (session.phase !== "in_progress") return undefined;
    const start = session.startedAt;
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.phase, session.startedAt]);

  const displayCallStatus = session.phase === "connecting" ? "queued" : "in-progress";
  const elapsed = session.phase === "in_progress" ? elapsedSec : 0;

  const customerName = session.customerName?.trim() || "Customer";
  const title = customerName;
  const subtitle = session.phoneLabel || session.toNumber;

  useEffect(() => {
    const hasRealCallId = Number.isInteger(Number(session?.callId)) && Number(session?.callId) > 0;
    if (!session?.conferenceName || !hasRealCallId) {
      setParticipants([]);
      setParticipantsLoading(false);
      setParticipantsError(null);
      return undefined;
    }

    let cancelled = false;
    async function loadParticipants(showLoading = false) {
      if (showLoading) setParticipantsLoading(true);
      setParticipantsError(null);
      try {
        const qs = new URLSearchParams({
          callId: String(Number(session.callId)),
          conferenceName: String(session.conferenceName),
        });
        const res = await fetch(`/api/calls/participants?${qs.toString()}`, { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (res.status === 404) {
          if (!cancelled) endCall();
          return;
        }
        if (!res.ok) throw new Error(json?.error || "Failed to load participants");
        const nextParticipants = Array.isArray(json?.participants) ? json.participants : [];
        if (!cancelled) {
          const joinedName = String(recentJoinedAgent || "").trim();
          const normalizedJoined = joinedName.toLowerCase();
          const hasJoinedAgentInApi =
            joinedName &&
            nextParticipants.some(
              (p) =>
                String(p?.type || "").toLowerCase() === "agent" &&
                String(p?.label || "").toLowerCase().trim() === normalizedJoined,
            );
          setParticipants(
            hasJoinedAgentInApi || !joinedName
              ? nextParticipants
              : [
                  ...nextParticipants,
                  {
                    callSid: `joined:${normalizedJoined}`,
                    label: joinedName,
                    type: "agent",
                    status: "joined",
                  },
                ],
          );
          if (session?.phase === "in_progress") {
            if (!nextParticipants.length) {
              setEmptyParticipantHits((n) => {
                const next = n + 1;
                if (next >= 2) {
                  window.setTimeout(() => endCall(), 0);
                }
                return next;
              });
            } else {
              setEmptyParticipantHits(0);
            }
          } else {
            setEmptyParticipantHits(0);
          }
        }
      } catch (e) {
        if (!cancelled) setParticipantsError(e?.message || "Failed to load participants");
      } finally {
        if (!cancelled) setParticipantsLoading(false);
      }
    }

    loadParticipants(true);
    const id = window.setInterval(() => loadParticipants(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [session?.callId, session?.conferenceName, session?.phase, endCall, recentJoinedAgent]);

  useEffect(() => {
    const joinedName = String(recentJoinedAgent || "").trim();
    if (!joinedName) return;
    const normalized = joinedName.toLowerCase();
    setParticipants((prev) => {
      const exists = prev.some(
        (p) =>
          String(p?.type || "").toLowerCase() === "agent" &&
          String(p?.label || "").toLowerCase().trim() === normalized,
      );
      if (exists) return prev;
      return [
        ...prev,
        {
          callSid: `joined:${normalized}`,
          label: joinedName,
          type: "agent",
          status: "joined",
        },
      ];
    });
  }, [recentJoinedAgent]);

  async function openAddAgentDialog() {
    setShowAddAgentDialog(true);
    setAddAgentError(null);
    setSelectedAgentId("");
    setAgentsLoading(true);
    try {
      const res = await fetch("/api/users", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load users");
      setAgents((json?.users || []).filter((u) => u.role === "agent" && u.isActive !== false));
    } catch (e) {
      setAddAgentError(e?.message || "Failed to load agents");
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }

  async function addAgentToConference() {
    if (!selectedAgentId) {
      setAddAgentError("Please select an agent.");
      return;
    }

    setAddAgentLoading(true);
    setAddAgentError(null);
    setAddAgentStatus(null);
    try {
      const res = await fetch("/api/calls/add-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          callId: session.callId,
          conferenceName: session.conferenceName,
          agentUserId: Number(selectedAgentId),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to invite agent");
      const invitedName = json?.invitedAgent?.username || "agent";
      const statusMessage = `Inviting ${invitedName} to join...`;
      setAddAgentStatus(statusMessage);
      if (Array.isArray(json?.participants) && json.participants.length > 0) {
        setParticipants(json.participants);
      }
      setShowAddAgentDialog(false);
    } catch (e) {
      setAddAgentError(e?.message || "Failed to invite agent");
    } finally {
      setAddAgentLoading(false);
    }
  }

  function onDtmfKey(key) {
    if (!voiceConnected) return;
    const ok = sendDtmf(key);
    setDtmfStatus(ok ? `Sent tone: ${key}` : "Unable to send tone.");
    if (ok) {
      window.setTimeout(() => setDtmfStatus(null), 1200);
    }
  }

  function submitDtmfInput() {
    const clean = dtmfInput.replace(/[^0-9*#wW]/g, "");
    if (!clean) {
      setDtmfStatus("Enter digits to send.");
      return;
    }
    const ok = sendDtmf(clean);
    setDtmfStatus(ok ? `Sent: ${clean}` : "Unable to send digits.");
    if (ok) setDtmfInput("");
  }

  async function startRecording() {
    if (!session?.callId || !session?.conferenceName) {
      setRecordingMessage("Recording unavailable for this session.");
      return;
    }
    setRecordingLoading(true);
    setRecordingMessage(null);
    try {
      const res = await fetch("/api/calls/recording/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          callId: Number(session.callId),
          conferenceName: session.conferenceName,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to start recording");
      setRecordingStatus("in-progress");
      setRecordingMessage("Recording started.");
    } catch (e) {
      setRecordingMessage(e?.message || "Failed to start recording");
    } finally {
      setRecordingLoading(false);
    }
  }

  async function stopRecording() {
    if (!session?.callId) {
      setRecordingMessage("Recording unavailable for this session.");
      return;
    }
    setRecordingLoading(true);
    setRecordingMessage(null);
    try {
      const res = await fetch("/api/calls/recording/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ callId: Number(session.callId) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to stop recording");
      setRecordingStatus("stopped");
      setRecordingMessage("Recording stopped. It will be downloadable from call logs.");
    } catch (e) {
      setRecordingMessage(e?.message || "Failed to stop recording");
    } finally {
      setRecordingLoading(false);
    }
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] transition-all duration-300 ${
        isMinimized ? "w-72" : "w-[26rem] max-h-[calc(100vh-2rem)]"
      }`}
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border-2 border-sky-200 bg-white shadow-2xl shadow-sky-500/10 backdrop-blur-sm dark:border-sky-800 dark:bg-zinc-900 dark:shadow-sky-950/20">
        <div className="flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 p-3 text-white">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex-shrink-0">
              {displayCallStatus === "in-progress" ? (
                <div className="h-3 w-3 animate-pulse rounded-full bg-green-400" />
              ) : (
                <div className="h-3 w-3 animate-pulse rounded-full bg-gray-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{title}</div>
              <div className="flex flex-wrap items-center gap-2">
                {subtitle ? (
                  <div className="truncate text-xs text-blue-100">{subtitle}</div>
                ) : null}
                <div
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    displayCallStatus === "in-progress"
                      ? "bg-green-500/30 text-green-100"
                      : "bg-gray-500/30 text-gray-100"
                  }`}
                >
                  {displayCallStatus === "in-progress" ? "In progress" : "Queued"}
                </div>
                {displayCallStatus === "in-progress" ? <div className="text-xs font-bold text-white">{formatTimer(elapsed)}</div> : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="ml-2 rounded p-1 transition-colors hover:bg-blue-700"
            aria-label={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>

        {!isMinimized && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {session.phase === "connecting" && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/40">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent dark:border-blue-400" />
                <div>
                  <div className="font-semibold text-blue-700 dark:text-blue-300">Connecting…</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">Call logged — stay on this screen</div>
                </div>
              </div>
            )}

            {session.phase === "in_progress" && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/40">
                <div className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
                <div className="text-sm font-semibold text-green-700 dark:text-green-300">
                  Call connected
                </div>
              </div>
            )}

            {sdkError ? (
              <p
                className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                role="status"
              >
                Voice SDK: {sdkError}
              </p>
            ) : null}

            <div className="mt-2 space-y-3">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 dark:border-cyan-900/50 dark:bg-cyan-950/30">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                    Agent Collaboration
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-cyan-700/90 dark:text-cyan-300/90">
                    Invite internal agents to join this live call.
                  </p>
                  <button
                    type="button"
                    onClick={openAddAgentDialog}
                    className="h-9 rounded-lg bg-cyan-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-700"
                  >
                    Add Agent
                  </button>
                </div>
                <p className="mt-2 text-xs font-medium text-cyan-800 dark:text-cyan-200">
                  Customer: {customerName}
                </p>

                <div className="mt-3 rounded-lg border border-cyan-200/80 bg-white/80 p-2.5 dark:border-cyan-900/50 dark:bg-zinc-900/40">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                      Participants
                    </p>
                    {participantsLoading ? (
                      <span className="text-[11px] text-cyan-700/80 dark:text-cyan-300/80">Refreshing...</span>
                    ) : null}
                  </div>
                  {participantsError ? (
                    <p className="text-xs font-medium text-red-700 dark:text-red-300">{participantsError}</p>
                  ) : participants.length ? (
                    <ul className="space-y-1">
                      {participants.map((p) => (
                        <li
                          key={p.callSid || `${p.label}-${p.type}`}
                          className="flex items-center justify-between rounded-md bg-cyan-50 px-2 py-1 text-xs dark:bg-cyan-950/30"
                        >
                          <span className="truncate text-cyan-900 dark:text-cyan-100">{p.label}</span>
                          <span className="ml-2 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-200">
                            {p.type}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-cyan-700/80 dark:text-cyan-300/80">No participants joined yet.</p>
                  )}
                </div>

                {addAgentStatus ? (
                  <p className="mt-2 text-xs font-medium text-cyan-700 dark:text-cyan-300">{addAgentStatus}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                    Recording
                  </p>
                  <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    {recordingStatus === "in-progress" ? "REC" : "IDLE"}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={recordingLoading || recordingStatus === "in-progress"}
                    className="h-9 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    onClick={stopRecording}
                    disabled={recordingLoading || recordingStatus !== "in-progress"}
                    className="h-9 rounded-lg border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-zinc-800"
                  >
                    Stop
                  </button>
                </div>
                {recordingMessage ? (
                  <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">{recordingMessage}</p>
                ) : (
                  <p className="mt-2 text-xs text-rose-700/80 dark:text-rose-300/80">
                    Download recording from Call Logs after stop/completion.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowKeypad((v) => !v)}
                disabled={!voiceConnected}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
              >
                {showKeypad ? "Hide Keypad" : "Show Keypad"}
              </button>

              {showKeypad ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
                  <div className="grid grid-cols-3 gap-2">
                    {DTMF_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onDtmfKey(key)}
                        disabled={!voiceConnected}
                        className="h-10 rounded-lg border border-sky-200 bg-white text-sm font-semibold text-sky-900 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-sky-800 dark:bg-zinc-900 dark:text-sky-100 dark:hover:bg-sky-900/40 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={dtmfInput}
                      onChange={(e) => setDtmfInput(e.target.value.replace(/[^0-9*#wW]/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitDtmfInput();
                        }
                      }}
                      placeholder="Enter digits then press Enter"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-300/50 dark:border-sky-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/30"
                    />
                    <button
                      type="button"
                      onClick={submitDtmfInput}
                      disabled={!voiceConnected || !dtmfInput.trim()}
                      className="h-9 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
                    >
                      Send
                    </button>
                  </div>
                  {dtmfStatus ? (
                    <p className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-300">{dtmfStatus}</p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  if (voiceConnected) toggleMute();
                  else setUiMuted((m) => !m);
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isMuted
                    ? "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={endCall}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-medium text-white shadow-lg transition-colors hover:bg-red-700"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
                  />
                </svg>
                Hang up
              </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddAgentDialog ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-sm rounded-xl border border-sky-200 bg-white p-4 shadow-xl dark:border-sky-800 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add Agent to Call</h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Select an agent user to join this conference.
            </p>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                disabled={agentsLoading || addAgentLoading}
                className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-300/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/30"
              >
                <option value="">{agentsLoading ? "Loading agents..." : "Select an agent"}</option>
                {agents.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>

            {addAgentError ? (
              <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{addAgentError}</p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddAgentDialog(false)}
                disabled={addAgentLoading}
                className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addAgentToConference}
                disabled={addAgentLoading || agentsLoading || !selectedAgentId}
                className="h-9 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
              >
                {addAgentLoading ? "Adding..." : "Add Agent"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function GlobalWebCallInterface() {
  const { session, endCall, beginSession } = useActiveCall();
  const {
    incomingInvite,
    inviteNotification,
    agentJoinedNotification,
    ensureRegistered,
    acceptIncomingInvite,
    rejectIncomingInvite,
    dismissInviteNotification,
    dismissAgentJoinedNotification,
  } = useTwilioVoice();
  const isDev = process.env.NODE_ENV === "development";
  const [inviteActionMsg, setInviteActionMsg] = useState(null);
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [pendingJoinCallId, setPendingJoinCallId] = useState(null);

  useEffect(() => {
    if (!joiningInvite || !session) return;
    setJoiningInvite(false);
    setInviteActionMsg(null);
    dismissInviteNotification();
  }, [joiningInvite, session, dismissInviteNotification]);

  useEffect(() => {
    if (!session || !pendingJoinCallId) return;
    const activeCallId = Number(session.callId);
    const pendingCallId = Number(pendingJoinCallId);
    if (Number.isInteger(activeCallId) && activeCallId > 0 && activeCallId !== pendingCallId) return;
    fetch("/api/calls/agent-joined", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ callId: pendingCallId }),
    }).catch(() => {});
    setPendingJoinCallId(null);
  }, [session, pendingJoinCallId]);

  useEffect(() => {
    if (!session || !agentJoinedNotification) return;
    const toastCallId = Number(agentJoinedNotification.callId);
    const activeCallId = Number(session.callId);
    if (Number.isInteger(toastCallId) && Number.isInteger(activeCallId) && toastCallId !== activeCallId) {
      dismissAgentJoinedNotification();
    }
  }, [session, agentJoinedNotification, dismissAgentJoinedNotification]);

  async function prepareJoinFromNotification() {
    if (!inviteNotification) return false;
    try {
      const inviteCallId = Number(inviteNotification.callId);
      const inviteConferenceName = String(inviteNotification.conferenceName || "").trim();
      if (Number.isInteger(inviteCallId) && inviteCallId > 0 && inviteConferenceName) {
        const qs = new URLSearchParams({
          callId: String(inviteCallId),
          conferenceName: inviteConferenceName,
        });
        const res = await fetch(`/api/calls/participants?${qs.toString()}`, { credentials: "include" });
        if (res.status === 404) {
          setInviteActionMsg("This call has already ended.");
          return false;
        }
      }

      await ensureRegistered();
      beginSession({
        callId: Number.isInteger(inviteCallId)
          ? inviteCallId
          : null,
        callOwnedByMe: false,
        conferenceName: inviteConferenceName || null,
        customerName: inviteNotification.customer || "Customer",
        phoneLabel: inviteNotification.customer || "",
        toNumber: inviteNotification.customer || "",
      });
      setInviteActionMsg("Waiting for incoming call...");
      return true;
    } catch (e) {
      setInviteActionMsg(e?.message || "Unable to prepare device for join.");
      return false;
    }
  }

  async function acceptIncomingInviteWithLoading() {
    const cid = Number(incomingInvite?.callId || inviteNotification?.callId);
    if (Number.isInteger(cid) && cid > 0) setPendingJoinCallId(cid);
    setJoiningInvite(true);
    setInviteActionMsg("Joining call...");
    const accepted = acceptIncomingInvite();
    if (!accepted) {
      const prepared = await prepareJoinFromNotification();
      if (!prepared) setJoiningInvite(false);
    }
  }

  const ownerJoinToast =
    session &&
    agentJoinedNotification &&
    Number(agentJoinedNotification.callId) === Number(session.callId) ? (
      <div className="fixed right-4 top-4 z-[10001] w-full max-w-sm rounded-xl border border-emerald-200 bg-white p-3 shadow-xl dark:border-emerald-900 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Agent Joined</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              {agentJoinedNotification.joinedAgent} joined this call.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissAgentJoinedNotification}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    ) : null;
  const recentJoinedAgentForSession =
    session &&
    agentJoinedNotification &&
    Number(agentJoinedNotification.callId) === Number(session.callId)
      ? agentJoinedNotification.joinedAgent
      : null;
  const incomingParticipants =
    Array.isArray(incomingInvite?.participants) && incomingInvite.participants.length
      ? incomingInvite.participants
      : Array.isArray(inviteNotification?.participants)
        ? inviteNotification.participants
        : [];
  const hasIncomingInvite = Boolean(incomingInvite);
  const inviteFromLabel = hasIncomingInvite
    ? incomingInvite?.from || "Unknown"
    : inviteNotification?.fromAgent || "Unknown";
  const inviteCustomerLabel = hasIncomingInvite
    ? incomingInvite?.customerName?.trim() || "Customer"
    : inviteNotification?.customer || "Customer";
  const inviteToast = incomingInvite || inviteNotification ? (
    <div className="fixed bottom-4 right-4 z-[10000] w-full max-w-md rounded-xl border border-sky-200 bg-white p-4 shadow-xl dark:border-sky-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Incoming Agent Invite</h3>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
        You were invited to join an active conference call.
      </p>
      <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
        User: {inviteFromLabel}
      </p>
      <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
        Customer: {inviteCustomerLabel}
      </p>
      {incomingParticipants.length ? (
        <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          <p className="font-semibold">Current participants:</p>
          <p className="mt-1">{incomingParticipants.map((p) => p.label).join(", ")}</p>
        </div>
      ) : null}
      {inviteActionMsg ? (
        <p className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-300">{inviteActionMsg}</p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={hasIncomingInvite ? rejectIncomingInvite : dismissInviteNotification}
          disabled={joiningInvite}
          className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {hasIncomingInvite ? "Decline" : "Dismiss"}
        </button>
        <button
          type="button"
          onClick={hasIncomingInvite ? acceptIncomingInviteWithLoading : joinFromNotification}
          disabled={joiningInvite}
          className="h-9 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {joiningInvite ? "Joining..." : "Join Call"}
        </button>
      </div>
    </div>
  ) : null;

  async function joinFromNotification() {
    setInviteActionMsg(null);
    if (!inviteNotification) return;
    const callId = Number(inviteNotification.callId);
    if (Number.isInteger(callId) && callId > 0) setPendingJoinCallId(callId);
    setJoiningInvite(true);
    setInviteActionMsg("Joining call...");
    if (incomingInvite) {
      await acceptIncomingInviteWithLoading();
      return;
    }
    const prepared = await prepareJoinFromNotification();
    if (!prepared) setJoiningInvite(false);
  }

  if (session) {
    return (
      <>
        {ownerJoinToast}
        <ActiveCallPanel
          key={session.callId || "active-call"}
          session={session}
          endCall={endCall}
          recentJoinedAgent={recentJoinedAgentForSession}
        />
        {inviteToast}
      </>
    );
  }

  if (!isDev && !incomingInvite && !inviteNotification) return null;

  if (inviteToast) return inviteToast;

  const devPreviewSession = {
    callId: "dev-preview-call",
    conferenceName: "dev-preview-conference",
    customerName: "UI Preview Customer",
    phoneLabel: "(555) 010-1234",
    toNumber: "+15550101234",
    phase: "in_progress",
    startedAt: Date.now() - 90 * 1000,
  };

  return (
    <>
      {ownerJoinToast}
      <div className="fixed bottom-4 left-4 z-[9999] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-md dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        Dev preview mode: showing GlobalWebCallInterface without active call.
      </div>
      <ActiveCallPanel
        key={devPreviewSession.callId}
        session={devPreviewSession}
        endCall={() => {}}
      />
    </>
  );
}
