"use client";

import { useEffect, useState } from "react";
import RichTextEditor, { RichHtmlContent } from "@/components/Leads/RichTextEditor";
import { isEmptyRichText, normalizeRichHtml, plainTextFromHtml, toRichEditorHtml } from "@/lib/richText";

const previewBoxClass =
  "min-h-[100px] rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm shadow-sm dark:border-zinc-600 dark:bg-zinc-950";

const textareaClass =
  "min-h-[100px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-base text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/25 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

export default function RichTextField({
  label,
  labelClass,
  value,
  onChange,
  disabled = false,
  placeholder = "Start typing…",
  expandLabel = "Full editor",
  actions = null,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    if (modalOpen) setDraft(toRichEditorHtml(value || ""));
  }, [value, modalOpen]);

  function openModal() {
    if (disabled) return;
    setDraft(toRichEditorHtml(value || ""));
    setModalOpen(true);
  }

  function saveModal() {
    onChange(normalizeRichHtml(draft));
    setModalOpen(false);
  }

  return (
    <>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className={labelClass}>{label}</span>
          <div className="flex items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={openModal}
              disabled={disabled}
              className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-zinc-800"
            >
              {expandLabel}
            </button>
          </div>
        </div>
        {disabled ? (
          <div className={`${previewBoxClass} w-full whitespace-pre-wrap text-left`}>
            {isEmptyRichText(value) ? (
              <span className="text-zinc-400 dark:text-zinc-500">{placeholder}</span>
            ) : /[<>]/.test(String(value)) ? (
              <RichHtmlContent html={value} />
            ) : (
              value
            )}
          </div>
        ) : (
          <textarea
            value={plainTextFromHtml(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={textareaClass}
          />
        )}
      </div>

      {modalOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-zinc-950/50 backdrop-blur-[2px]"
            aria-label="Close editor"
            onClick={() => setModalOpen(false)}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="rich-text-modal-title"
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
                <h3 id="rich-text-modal-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {label}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <RichTextEditor
                  value={draft}
                  onChange={setDraft}
                  placeholder={placeholder}
                  minHeightClass="min-h-[360px]"
                  wordLayout
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveModal}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
