function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function touch(state) {
  return { ...state, updatedAt: Date.now() };
}

export function getUser(state, id) {
  return state.users.find((u) => u.id === id) || null;
}

export function getLead(state, id) {
  return state.leads.find((l) => l.id === id) || null;
}

export function getConversation(state, id) {
  return state.conversations.find((c) => c.id === id) || null;
}

export function getConversationMessages(state, conversationId) {
  return state.messages
    .filter((m) => m.conversationId === conversationId)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function unreadTotal(state, userId) {
  return state.conversations.reduce((sum, c) => sum + (c.unreadFor?.[userId] || 0), 0);
}

export function leadStats(state) {
  const leads = state.leads;
  return {
    total: leads.length,
    active: leads.filter((l) => l.phase === "active").length,
    closed: leads.filter((l) => l.phase === "closed").length,
    cancelled: leads.filter((l) => l.phase === "cancelled").length,
    verified: leads.filter((l) => l.progressTags.includes("verified")).length,
    saleDone: leads.filter((l) => l.progressTags.includes("sale_done")).length,
    processed: leads.filter((l) => l.progressTags.includes("processed")).length,
  };
}

/** Start a simulated outbound call. */
export function startCall(state, { phone, name }) {
  if (state.activeCall) return state;
  const digits = String(phone || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return state;

  const phoneLabel = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  const id = `c-${state.nextCallNum}`;
  const call = {
    id,
    toNumber: digits,
    phoneLabel,
    customerName: (name || "").trim() || "Customer",
    phase: "connecting",
    status: "queued",
    startedAt: null,
    muted: false,
    showKeypad: false,
    dtmf: "",
    recording: false,
    conference: false,
    participants: [{ id: state.currentUserId, name: "You (agent)", role: "agent" }],
    agentId: state.currentUserId,
  };

  return touch({
    ...state,
    activeCall: call,
    nextCallNum: state.nextCallNum + 1,
  });
}

/** Advance simulated call lifecycle: connecting → ringing → in_progress. */
export function advanceCallPhase(state) {
  const call = state.activeCall;
  if (!call) return state;
  if (call.phase === "connecting") {
    return touch({
      ...state,
      activeCall: { ...call, phase: "ringing", status: "ringing" },
    });
  }
  if (call.phase === "ringing") {
    return touch({
      ...state,
      activeCall: {
        ...call,
        phase: "in_progress",
        status: "in-progress",
        startedAt: Date.now(),
      },
    });
  }
  return state;
}

export function toggleMute(state) {
  if (!state.activeCall) return state;
  return touch({
    ...state,
    activeCall: { ...state.activeCall, muted: !state.activeCall.muted },
  });
}

export function toggleKeypad(state) {
  if (!state.activeCall) return state;
  return touch({
    ...state,
    activeCall: { ...state.activeCall, showKeypad: !state.activeCall.showKeypad },
  });
}

export function sendDtmf(state, key) {
  if (!state.activeCall || state.activeCall.phase !== "in_progress") return state;
  return touch({
    ...state,
    activeCall: {
      ...state.activeCall,
      dtmf: `${state.activeCall.dtmf || ""}${key}`.slice(-16),
    },
  });
}

export function toggleRecording(state) {
  if (!state.activeCall || state.activeCall.phase !== "in_progress") return state;
  return touch({
    ...state,
    activeCall: { ...state.activeCall, recording: !state.activeCall.recording },
  });
}

export function upgradeToConference(state) {
  if (!state.activeCall || state.activeCall.phase !== "in_progress") return state;
  if (state.activeCall.conference) return state;
  const supervisor = state.users.find((u) => u.role === "supervisor");
  const participants = [...state.activeCall.participants];
  if (supervisor && !participants.some((p) => p.id === supervisor.id)) {
    participants.push({
      id: supervisor.id,
      name: supervisor.displayName,
      role: "supervisor",
    });
  }
  return touch({
    ...state,
    activeCall: {
      ...state.activeCall,
      conference: true,
      participants,
    },
  });
}

export function endCall(state, outcome = "completed") {
  const call = state.activeCall;
  if (!call) return state;

  const endedAt = Date.now();
  const durationSeconds =
    call.phase === "in_progress" && call.startedAt
      ? Math.max(1, Math.floor((endedAt - call.startedAt) / 1000))
      : 0;

  const finalStatus =
    call.phase === "in_progress"
      ? outcome
      : outcome === "completed"
        ? "no-answer"
        : outcome;

  const log = {
    id: call.id,
    toNumber: call.toNumber,
    phoneLabel: call.phoneLabel,
    customerName: call.customerName,
    status: finalStatus,
    durationSeconds,
    agentDurationSeconds: durationSeconds + (call.phase === "in_progress" ? 6 : 18),
    customerDurationSeconds: durationSeconds,
    recording: Boolean(call.recording),
    conference: Boolean(call.conference),
    createdAt: endedAt,
    agentId: call.agentId,
  };

  return touch({
    ...state,
    activeCall: null,
    callLogs: [log, ...state.callLogs],
    metrics: {
      ...state.metrics,
      callsToday: state.metrics.callsToday + 1,
      talkMinutes: state.metrics.talkMinutes + Math.ceil(durationSeconds / 60),
    },
  });
}

export function redialFromLog(state, callId) {
  const log = state.callLogs.find((c) => c.id === callId);
  if (!log || state.activeCall) return state;
  return startCall(state, { phone: log.toNumber, name: log.customerName });
}

export function dialLead(state, leadId) {
  const lead = getLead(state, leadId);
  if (!lead || state.activeCall) return state;
  return startCall(state, { phone: lead.phone, name: lead.name });
}

export function setLeadPhase(state, leadId, phase) {
  return touch({
    ...state,
    leads: state.leads.map((l) =>
      l.id === leadId ? { ...l, phase, updatedAt: Date.now() } : l
    ),
  });
}

export function toggleLeadProgressTag(state, leadId, tag) {
  return touch({
    ...state,
    leads: state.leads.map((l) => {
      if (l.id !== leadId) return l;
      const has = l.progressTags.includes(tag);
      const progressTags = has
        ? l.progressTags.filter((t) => t !== tag)
        : [...l.progressTags, tag];
      return { ...l, progressTags, updatedAt: Date.now() };
    }),
  });
}

export function setLeadContactTag(state, leadId, tag) {
  return touch({
    ...state,
    leads: state.leads.map((l) => {
      if (l.id !== leadId) return l;
      const has = l.contactTags.includes(tag);
      return {
        ...l,
        contactTags: has ? l.contactTags.filter((t) => t !== tag) : [...l.contactTags, tag],
        updatedAt: Date.now(),
      };
    }),
  });
}

export function setLeadPayment(state, leadId, patch) {
  return touch({
    ...state,
    leads: state.leads.map((l) =>
      l.id === leadId ? { ...l, ...patch, updatedAt: Date.now() } : l
    ),
  });
}

export function updateLeadNotes(state, leadId, notes) {
  return touch({
    ...state,
    leads: state.leads.map((l) =>
      l.id === leadId ? { ...l, notes, updatedAt: Date.now() } : l
    ),
  });
}

export function createLead(state, { name, phone }) {
  const digits = String(phone || "").replace(/\D/g, "").slice(0, 10);
  if (!name?.trim() || digits.length !== 10) return state;
  const phoneLabel = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  const lead = {
    id: `l-${state.nextLeadNum}`,
    name: name.trim(),
    phone: phoneLabel,
    email: "",
    serviceType: "streams",
    phase: "active",
    progressTags: [],
    contactTags: [],
    paymentMethod: null,
    paymentChargeStatus: null,
    paymentProcessor: null,
    amount: 0,
    assigneeId: state.currentUserId,
    processorId: null,
    notes: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return touch({
    ...state,
    leads: [lead, ...state.leads],
    nextLeadNum: state.nextLeadNum + 1,
    metrics: {
      ...state.metrics,
      leadsTouched: state.metrics.leadsTouched + 1,
    },
  });
}

export function selectConversation(state, conversationId) {
  const conversations = state.conversations.map((c) => {
    if (c.id !== conversationId) return c;
    const unreadFor = { ...(c.unreadFor || {}) };
    unreadFor[state.currentUserId] = 0;
    return { ...c, unreadFor };
  });
  return touch({
    ...state,
    conversations,
    activeConversationId: conversationId,
  });
}

export function sendMessage(state, body) {
  const text = String(body || "").trim();
  if (!text || !state.activeConversationId) return state;
  const conversation = getConversation(state, state.activeConversationId);
  if (!conversation) return state;

  const message = {
    id: `m-${state.nextMessageNum}`,
    conversationId: conversation.id,
    senderId: state.currentUserId,
    body: text,
    createdAt: Date.now(),
  };

  const conversations = state.conversations.map((c) => {
    if (c.id !== conversation.id) return c;
    const unreadFor = { ...(c.unreadFor || {}) };
    for (const pid of c.participantIds) {
      if (pid !== state.currentUserId) {
        unreadFor[pid] = (unreadFor[pid] || 0) + 1;
      }
    }
    return { ...c, unreadFor };
  });

  return touch({
    ...state,
    messages: [...state.messages, message],
    conversations,
    nextMessageNum: state.nextMessageNum + 1,
  });
}

export function setCurrentUser(state, userId) {
  if (!getUser(state, userId)) return state;
  return touch({ ...state, currentUserId: userId });
}

export function setUserPresence(state, userId, presence) {
  return touch({
    ...state,
    users: state.users.map((u) => (u.id === userId ? { ...u, presence } : u)),
  });
}

export function closeSale(state, leadId) {
  const lead = getLead(state, leadId);
  if (!lead) return state;
  const progressTags = Array.from(
    new Set([...lead.progressTags, "verified", "sale_done"])
  );
  return touch({
    ...state,
    leads: state.leads.map((l) =>
      l.id === leadId
        ? {
            ...l,
            phase: "closed",
            progressTags,
            paymentChargeStatus: l.paymentMethod === "card" ? "charged" : l.paymentChargeStatus,
            updatedAt: Date.now(),
          }
        : l
    ),
    metrics: {
      ...state.metrics,
      salesClosed: state.metrics.salesClosed + (lead.phase === "closed" ? 0 : 1),
    },
  });
}

// keep uid available for future extensions
void uid;
