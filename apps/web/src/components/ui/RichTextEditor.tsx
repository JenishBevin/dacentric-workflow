import React, { useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon } from "lucide-react";
import clsx from "clsx";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Minimal rich-text editor for the task Description field (Section 16:
 * bold/italic/underline/bulleted list/numbered list/hyperlinks). Built on
 * contentEditable + document.execCommand rather than pulling in a full
 * editor framework, consistent with the "working code, lighter polish"
 * scope agreed for this build. Output is sanitized server-side
 * (sanitize-html) before storage, so this only needs to produce reasonable
 * semantic HTML.
 */
export const RichTextEditor: React.FC<Props> = ({ value, onChange, placeholder, disabled }) => {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef(value);

  useEffect(() => {
    if (ref.current && value !== lastValue.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || "";
      lastValue.current = value;
    }
  }, [value]);

  function exec(command: string, arg?: string) {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  }

  function handleInput() {
    const html = ref.current?.innerHTML ?? "";
    lastValue.current = html;
    onChange(html);
  }

  function insertLink() {
    const url = window.prompt("Link URL");
    if (url) exec("createLink", url);
  }

  return (
    <div className={clsx("rounded-lg border border-slate-300 bg-white", disabled && "opacity-60")}>
      <div className="flex items-center gap-0.5 border-b border-slate-200 p-1">
        <ToolbarButton icon={Bold} label="Bold" onClick={() => exec("bold")} disabled={disabled} />
        <ToolbarButton icon={Italic} label="Italic" onClick={() => exec("italic")} disabled={disabled} />
        <ToolbarButton icon={Underline} label="Underline" onClick={() => exec("underline")} disabled={disabled} />
        <ToolbarButton icon={List} label="Bulleted list" onClick={() => exec("insertUnorderedList")} disabled={disabled} />
        <ToolbarButton icon={ListOrdered} label="Numbered list" onClick={() => exec("insertOrderedList")} disabled={disabled} />
        <ToolbarButton icon={LinkIcon} label="Insert link" onClick={insertLink} disabled={disabled} />
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
        className="prose prose-sm min-h-[100px] max-w-none px-3 py-2 text-sm text-slate-800 focus-visible:focus-ring [&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
};

const ToolbarButton: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; disabled?: boolean }> = ({
  icon: Icon,
  label,
  onClick,
  disabled,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
  >
    <Icon className="h-3.5 w-3.5" />
  </button>
);
