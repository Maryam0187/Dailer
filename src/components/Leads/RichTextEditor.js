"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableView } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyleKit } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  isEmptyRichText,
  isThemeDefaultTextColor,
  normalizeRichHtml,
  sanitizeRichHtml,
  toRichEditorHtml,
} from "@/lib/richText";

/** Don't persist light/dark theme default colors into HTML (they become invisible on the other theme). */
const ThemeAwareColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => {
              const styleAttr = element.getAttribute("style");
              if (!styleAttr) return null;
              const match = styleAttr.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
              const value = (match?.[1] || element.style.color || "").trim().replace(/['"]+/g, "");
              if (!value || isThemeDefaultTextColor(value)) return null;
              return value;
            },
            renderHTML: (attributes) => {
              if (!attributes.color || isThemeDefaultTextColor(attributes.color)) return {};
              return { style: `color: ${attributes.color}` };
            },
          },
        },
      },
    ];
  },
});

function clearThemeDefaultColorMarks(editor) {
  const { state } = editor;
  const { tr, doc, schema } = state;
  const textStyle = schema.marks.textStyle;
  if (!textStyle) return;

  let changed = false;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type === textStyle && m.attrs.color);
    if (!mark || !isThemeDefaultTextColor(mark.attrs.color)) return;

    changed = true;
    tr.removeMark(pos, pos + node.nodeSize, textStyle);
    const nextAttrs = { ...mark.attrs, color: null };
    const keep = Object.entries(nextAttrs).some(([, v]) => v != null && v !== "");
    if (keep) {
      tr.addMark(pos, pos + node.nodeSize, textStyle.create(nextAttrs));
    }
  });

  if (changed) editor.view.dispatch(tr);
}

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

function applyTableStripedAttr(tableElement, node) {
  if (!tableElement || !node) return;
  tableElement.setAttribute("data-striped", node.attrs.striped === false ? "false" : "true");
}

class StripedTableView extends TableView {
  constructor(node, cellMinWidth, view, HTMLAttributes = {}) {
    super(node, cellMinWidth, view, HTMLAttributes);
    applyTableStripedAttr(this.table, node);
  }

  update(node) {
    const updated = super.update(node);
    if (updated) {
      applyTableStripedAttr(this.table, node);
    }
    return updated;
  }
}

const RichTextTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      striped: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-striped") !== "false",
        renderHTML: (attributes) => ({
          "data-striped": attributes.striped === false ? "false" : "true",
        }),
      },
    };
  },
});

function isTableStriped(editor) {
  return editor.getAttributes("table").striped !== false;
}

function toggleTableStripes(editor) {
  editor.chain().focus().updateAttributes("table", { striped: !isTableStriped(editor) }).run();
}

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

function TableToolbarButtons({ editor, compact = false }) {
  const inTable = editor.isActive("table");

  if (compact) {
    return (
      <>
        <ToolbarDivider />
        <ToolbarButton
          label="Tbl"
          title="Insert table"
          disabled={inTable}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
        {inTable ? (
          <>
            <ToolbarButton label="+R" title="Add row" onClick={() => editor.chain().focus().addRowAfter().run()} />
            <ToolbarButton label="+C" title="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()} />
            <ToolbarButton
              label="Str"
              title="Toggle row stripes"
              active={isTableStriped(editor)}
              onClick={() => toggleTableStripes(editor)}
            />
            <ToolbarButton label="×T" title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()} />
          </>
        ) : null}
      </>
    );
  }

  return (
    <>
      <ToolbarDivider />
      <ToolbarButton
        label="Table"
        title="Insert table"
        disabled={inTable}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />
      {inTable ? (
        <>
          <ToolbarButton label="+ Row" title="Add row after" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolbarButton
            label="+ Col"
            title="Add column after"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          />
          <ToolbarButton
            label="− Row"
            title="Delete row"
            onClick={() => editor.chain().focus().deleteRow().run()}
          />
          <ToolbarButton
            label="− Col"
            title="Delete column"
            onClick={() => editor.chain().focus().deleteColumn().run()}
          />
          <ToolbarButton
            label="Header"
            title="Toggle header row"
            active={editor.isActive("tableHeader")}
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          />
          <ToolbarButton
            label="Stripes"
            title="Toggle row stripes"
            active={isTableStriped(editor)}
            onClick={() => toggleTableStripes(editor)}
          />
          <ToolbarButton
            label="Del table"
            title="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
          />
        </>
      ) : null}
    </>
  );
}

function EditorToolbar({ editor, compact = false }) {
  const [, setToolbarTick] = useState(0);

  useEffect(() => {
    if (!editor) return undefined;
    const refresh = () => setToolbarTick((tick) => tick + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);

  if (!editor) return null;

  const currentStyle = editor.isActive("heading", { level: 2 })
    ? "h2"
    : editor.isActive("heading", { level: 3 })
      ? "h3"
      : "p";
  const currentFont = editor.getAttributes("textStyle").fontFamily || "";
  const currentSize = editor.getAttributes("textStyle").fontSize || "16px";
  const currentColor = editor.getAttributes("textStyle").color || "";
  const currentHighlightColor = editor.getAttributes("highlight").color || "#fef08a";
  const colorPickerValue = currentColor.startsWith("#") && !isThemeDefaultTextColor(currentColor)
    ? currentColor
    : "#171717";

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
          value={colorPickerValue}
          onChange={(e) => {
            const next = e.target.value;
            if (isThemeDefaultTextColor(next)) {
              editor.chain().focus().unsetColor().run();
              return;
            }
            editor.chain().focus().setColor(next).run();
          }}
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
          <TableToolbarButtons editor={editor} compact />
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

        <TableToolbarButtons editor={editor} />

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
  stickyToolbar = false,
  embedded = false,
}) {
  const { theme } = useTheme();

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      RichTextTable.configure({
        resizable: true,
        View: StripedTableView,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyleKit.configure({ color: false }),
      ThemeAwareColor,
      TextAlign.configure({
        types: ["heading", "paragraph", "tableCell", "tableHeader"],
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
        class: `tiptap-editor ${minHeightClass} text-sm leading-relaxed outline-none`,
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
    clearThemeDefaultColorMarks(editor);
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    clearThemeDefaultColorMarks(editor);
  }, [editor, theme]);

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
      {showToolbar ? (
        <div
          className={
            stickyToolbar
              ? "sticky top-0 z-10 shrink-0 border-b border-zinc-200 bg-[#f3f3f3] dark:border-zinc-700 dark:bg-zinc-900/95"
              : undefined
          }
        >
          <EditorToolbar editor={editor} compact={compactToolbar} />
        </div>
      ) : null}
      {wordLayout ? (
        <div className="bg-zinc-100 px-3 py-4 dark:bg-zinc-900">
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
    <div
      className={
        embedded
          ? "bg-transparent"
          : `rounded-xl border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-950 ${
              stickyToolbar ? "" : "overflow-hidden"
            }`
      }
    >
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
      className={`tiptap-readonly text-sm leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
    />
  );
}
