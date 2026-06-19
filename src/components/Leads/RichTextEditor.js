"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { isEmptyRichText, normalizeRichHtml, sanitizeRichHtml, toRichEditorHtml } from "@/lib/richText";

const toolbarBtnClass =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

const toolbarSelectClass =
  "h-8 max-w-[120px] rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200";

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px"];

function ToolbarDivider() {
  return <span className="mx-1 w-px self-stretch bg-zinc-300 dark:bg-zinc-600" aria-hidden />;
}

function ToolbarButton({ label, title, onClick, active = false, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`${toolbarBtnClass} ${active ? "border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100" : ""} ${className}`}
    >
      {label}
    </button>
  );
}

function EditorToolbar({ editor, compact = false }) {
  if (!editor) return null;

  const currentStyle = editor.isActive("heading", { level: 2 })
    ? "h2"
    : editor.isActive("heading", { level: 3 })
      ? "h3"
      : "p";
  const currentFont = editor.getAttributes("textStyle").fontFamily || "";
  const currentSize = editor.getAttributes("textStyle").fontSize || "16px";
  const currentColor = editor.getAttributes("textStyle").color || "#171717";
  const currentHighlightColor = editor.getAttributes("highlight").color || "#fef08a";

  const formatButtons = (
    <>
      <ToolbarButton
        label="B"
        title="Bold"
        className="font-bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="I"
        title="Italic"
        className="italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="U"
        title="Underline"
        className="underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        label="S"
        title="Strikethrough"
        className="line-through"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <label
        title="Highlight color"
        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
      >
        HL
        <input
          type="color"
          value={currentHighlightColor.startsWith("#") ? currentHighlightColor : "#fef08a"}
          onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
          className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      </label>
      <ToolbarButton
        label="× HL"
        title="Remove highlight"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().unsetHighlight().run()}
      />
      <label
        title="Font color"
        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
      >
        A
        <input
          type="color"
          value={currentColor.startsWith("#") ? currentColor : "#171717"}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      </label>
    </>
  );

  if (compact) {
    return (
      <div className="border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton
            label="↶"
            title="Undo"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
          />
          <ToolbarButton
            label="↷"
            title="Redo"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
          />
          <ToolbarDivider />
          {formatButtons}
          <ToolbarDivider />
          <ToolbarButton
            label="• List"
            title="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="1. List"
            title="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-zinc-200 bg-[#f3f3f3] px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/80">
      <div className="flex flex-wrap items-center gap-1">
        <ToolbarButton
          label="↶"
          title="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
        />
        <ToolbarButton
          label="↷"
          title="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
        />

        <ToolbarDivider />

        <select
          className={toolbarSelectClass}
          title="Style"
          value={currentStyle}
          onChange={(e) => {
            const style = e.target.value;
            if (style === "p") editor.chain().focus().setParagraph().run();
            else if (style === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
            else editor.chain().focus().toggleHeading({ level: 3 }).run();
          }}
        >
          <option value="p">Normal</option>
          <option value="h2">Heading 1</option>
          <option value="h3">Heading 2</option>
        </select>

        <select
          className={`${toolbarSelectClass} max-w-[140px]`}
          title="Font"
          value={currentFont}
          onChange={(e) => {
            const family = e.target.value;
            if (!family) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(family).run();
          }}
        >
          <option value="">Font</option>
          {FONT_FAMILIES.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>

        <select
          className={`${toolbarSelectClass} max-w-[72px]`}
          title="Font size"
          value={currentSize}
          onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {parseInt(size, 10)}
            </option>
          ))}
        </select>

        <ToolbarDivider />

        {formatButtons}

        <ToolbarDivider />

        <ToolbarButton
          label="Left"
          title="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        />
        <ToolbarButton
          label="Center"
          title="Align center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        />
        <ToolbarButton
          label="Right"
          title="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        />
        <ToolbarButton
          label="Justify"
          title="Justify"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          label="• List"
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="1. List"
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Quote"
          title="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          label="Clear"
          title="Clear formatting"
          onClick={() =>
            editor
              .chain()
              .focus()
              .clearNodes()
              .unsetAllMarks()
              .unsetFontFamily()
              .unsetFontSize()
              .unsetColor()
              .unsetHighlight()
              .run()
          }
        />
      </div>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Start typing…",
  minHeightClass = "min-h-[280px]",
  autoFocus = false,
  wordLayout = true,
  compactToolbar = false,
  showToolbar = true,
  editable = true,
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyleKit,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: ({ editor }) => (editor.isEmpty ? placeholder : ""),
        emptyNodeClass: ({ editor }) => (editor.isEmpty ? "is-empty" : ""),
      }),
    ],
    content: toRichEditorHtml(value),
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: `tiptap-editor ${minHeightClass} text-sm leading-relaxed text-zinc-900 outline-none dark:text-zinc-100`,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(normalizeRichHtml(currentEditor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = toRichEditorHtml(value);
    const current = normalizeRichHtml(editor.getHTML());
    if (next !== current) {
      editor.commands.setContent(next || "", { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return (
      <div className={`overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-950 ${minHeightClass}`}>
        <div className="h-12 animate-pulse border-b border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60" />
        <div className="animate-pulse px-4 py-3 text-sm text-zinc-400">Loading editor…</div>
      </div>
    );
  }

  const editorSurface = (
    <>
      {showToolbar ? <EditorToolbar editor={editor} compact={compactToolbar} /> : null}
      {wordLayout ? (
        <div className="bg-[#e8e8e8] px-3 py-4 dark:bg-zinc-900">
          <div className="word-page mx-auto max-w-[816px] rounded-sm bg-white px-10 py-8 shadow-md dark:bg-zinc-950 dark:shadow-black/40 sm:px-14 sm:py-10">
            <EditorContent editor={editor} />
          </div>
        </div>
      ) : (
        <div className="max-h-[160px] overflow-y-auto px-3 py-2 sm:max-h-[60vh] sm:px-4 sm:py-3">
          <EditorContent editor={editor} />
        </div>
      )}
    </>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-950">
      {editorSurface}
    </div>
  );
}

export function RichHtmlContent({ html, className = "", emptyText = "—" }) {
  if (isEmptyRichText(html)) {
    return <span className={className}>{emptyText}</span>;
  }
  return (
    <div
      className={`tiptap-readonly text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
    />
  );
}
