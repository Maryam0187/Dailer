"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CHANNEL_NAME, STORAGE_KEY, createSeedState } from "./seed";
import * as actions from "./actions";

const DemoContext = createContext(null);

function loadState() {
  if (typeof window === "undefined") return createSeedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw);
    const seed = createSeedState();
    return {
      ...seed,
      ...parsed,
      ivrNotifications: Array.isArray(parsed.ivrNotifications)
        ? parsed.ivrNotifications
        : seed.ivrNotifications,
      ivrSession: parsed.ivrSession ?? null,
      ivrAlert: parsed.ivrAlert ?? null,
      nextIvrNum: Number(parsed.nextIvrNum) || seed.nextIvrNum,
    };
  } catch {
    return createSeedState();
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.postMessage({ type: "sync", updatedAt: state.updatedAt });
      ch.close();
    }
  } catch {
    /* ignore quota */
  }
}

export function DemoProvider({ children }) {
  const [state, setState] = useState(createSeedState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage after mount (SSR-safe).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional client hydrate
    setState(loadState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    persist(state);
  }, [state, ready]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue));
        } catch {
          /* ignore */
        }
      }
    }

    let ch;
    function onMessage(ev) {
      if (ev.data?.type !== "sync") return;
      const incoming = loadState();
      setState((prev) =>
        incoming.updatedAt && incoming.updatedAt !== prev.updatedAt ? incoming : prev
      );
    }

    window.addEventListener("storage", onStorage);
    if (typeof BroadcastChannel !== "undefined") {
      ch = new BroadcastChannel(CHANNEL_NAME);
      ch.onmessage = onMessage;
    }
    return () => {
      window.removeEventListener("storage", onStorage);
      ch?.close();
    };
  }, []);

  const apply = useCallback((fn, ...args) => {
    setState((prev) => {
      const next = fn(prev, ...args);
      return next === prev ? prev : next;
    });
  }, []);

  const api = useMemo(
    () => ({
      state,
      ready,
      reset: () => setState(createSeedState()),
      startCall: (payload) => apply(actions.startCall, payload),
      advanceCallPhase: () => apply(actions.advanceCallPhase),
      toggleMute: () => apply(actions.toggleMute),
      toggleKeypad: () => apply(actions.toggleKeypad),
      sendDtmf: (key) => apply(actions.sendDtmf, key),
      toggleRecording: () => apply(actions.toggleRecording),
      upgradeToConference: () => apply(actions.upgradeToConference),
      endCall: (outcome) => apply(actions.endCall, outcome),
      redialFromLog: (callId) => apply(actions.redialFromLog, callId),
      dialLead: (leadId) => apply(actions.dialLead, leadId),
      setLeadPhase: (leadId, phase) => apply(actions.setLeadPhase, leadId, phase),
      toggleLeadProgressTag: (leadId, tag) => apply(actions.toggleLeadProgressTag, leadId, tag),
      setLeadContactTag: (leadId, tag) => apply(actions.setLeadContactTag, leadId, tag),
      setLeadPayment: (leadId, patch) => apply(actions.setLeadPayment, leadId, patch),
      updateLeadNotes: (leadId, notes) => apply(actions.updateLeadNotes, leadId, notes),
      createLead: (payload) => apply(actions.createLead, payload),
      closeSale: (leadId) => apply(actions.closeSale, leadId),
      selectConversation: (id) => apply(actions.selectConversation, id),
      sendMessage: (body) => apply(actions.sendMessage, body),
      setCurrentUser: (userId) => apply(actions.setCurrentUser, userId),
      setUserPresence: (userId, presence) => apply(actions.setUserPresence, userId, presence),
      simulateInboundIvr: (options) => apply(actions.simulateInboundIvr, options),
      advanceIvrPhase: () => apply(actions.advanceIvrPhase),
      acceptIvrCall: () => apply(actions.acceptIvrCall),
      declineIvrCall: () => apply(actions.declineIvrCall),
      dismissIvrAlert: () => apply(actions.dismissIvrAlert),
      markIvrRead: (ids) => apply(actions.markIvrRead, ids),
      markAllIvrRead: () => apply(actions.markAllIvrRead),
      setAdminOnlineForIvr: (online) => apply(actions.setAdminOnlineForIvr, online),
      helpers: {
        getUser: (id) => actions.getUser(state, id),
        getLead: (id) => actions.getLead(state, id),
        getConversationMessages: (id) => actions.getConversationMessages(state, id),
        unreadTotal: (userId) => actions.unreadTotal(state, userId),
        ivrUnreadTotal: () => actions.ivrUnreadTotal(state),
        leadStats: () => actions.leadStats(state),
      },
    }),
    [state, ready, apply]
  );

  return <DemoContext.Provider value={api}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
