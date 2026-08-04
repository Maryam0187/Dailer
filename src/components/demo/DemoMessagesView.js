"use client";

import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/lib/demo/DemoProvider";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function DemoMessagesView() {
  const { state, selectConversation, sendMessage, helpers } = useDemo();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);
  const activeId = state.activeConversationId;
  const messages = helpers.getConversationMessages(activeId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  function onSend(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft("");
  }

  return (
    <div className="grid min-h-[560px] overflow-hidden rounded-3xl border border-violet-200/80 bg-white shadow-sm lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-violet-100 bg-violet-50/40 lg:border-b-0 lg:border-r">
        <div className="border-b border-violet-100 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
            Inbox
          </p>
          <p className="text-sm text-zinc-600">You are {helpers.getUser(state.currentUserId)?.displayName}</p>
        </div>
        <ul className="p-2">
          {state.conversations.map((c) => {
            const unread = c.unreadFor?.[state.currentUserId] || 0;
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                    active
                      ? "bg-violet-100 text-violet-950"
                      : "text-zinc-700 hover:bg-white"
                  }`}
                >
                  <span>{c.title}</span>
                  {unread > 0 ? (
                    <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
                      {unread}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="flex min-h-[420px] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.map((m) => {
            const mine = m.senderId === state.currentUserId;
            const sender = helpers.getUser(m.senderId);
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    mine
                      ? "bg-violet-600 text-white"
                      : "bg-zinc-100 text-zinc-900"
                  }`}
                >
                  {!mine ? (
                    <p className="mb-1 text-[11px] font-semibold opacity-70">
                      {sender?.displayName || "Teammate"}
                    </p>
                  ) : null}
                  <p className="leading-relaxed">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-violet-100" : "text-zinc-500"}`}>
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={onSend}
          className="flex gap-2 border-t border-zinc-200 bg-zinc-50/80 p-3 sm:p-4"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the team…"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          />
          <button
            type="submit"
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
