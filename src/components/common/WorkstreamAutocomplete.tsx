import { useState, useRef, useEffect, useCallback } from 'react';

interface WorkstreamAutocompleteProps {
  value: string | null;
  suggestions: string[];
  onChange: (name: string) => void;
  onRemove: () => void;
  size: 'sm' | 'md';
  placeholder?: string;
}

export default function WorkstreamAutocomplete({
  value,
  suggestions,
  onChange,
  onRemove,
  size,
  placeholder = '+ workstream',
}: WorkstreamAutocompleteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSm = size === 'sm';

  // ── Filtered suggestions ──────────────────────────────────────────
  const query = inputValue.toLowerCase();
  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(query),
  );
  const exactMatch = suggestions.some(
    (s) => s.toLowerCase() === query,
  );
  const showCreate = inputValue.trim().length > 0 && !exactMatch;
  const totalOptions = filtered.length + (showCreate ? 1 : 0);

  // ── Commit / cancel helpers ───────────────────────────────────────
  const commit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        onChange(trimmed);
      }
      setIsEditing(false);
      setInputValue('');
      setHighlightIndex(-1);
    },
    [onChange],
  );

  const cancel = useCallback(() => {
    setIsEditing(false);
    setInputValue('');
    setHighlightIndex(-1);
  }, []);

  // ── Enter editing mode ────────────────────────────────────────────
  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setInputValue(value ?? '');
      setHighlightIndex(-1);
      setIsEditing(true);
    },
    [value],
  );

  // ── Auto-focus input when editing begins ──────────────────────────
  useEffect(() => {
    if (isEditing) {
      // RAF ensures the input is in the DOM before we focus
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isEditing]);

  // ── Click-outside to commit or cancel ─────────────────────────────
  useEffect(() => {
    if (!isEditing) return;

    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        // Commit current value if non-empty, otherwise cancel
        const trimmed = inputValue.trim();
        if (trimmed.length > 0) {
          commit(trimmed);
        } else {
          cancel();
        }
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isEditing, inputValue, commit, cancel]);

  // ── Clamp highlight when list changes ─────────────────────────────
  useEffect(() => {
    setHighlightIndex((prev) =>
      prev >= totalOptions ? totalOptions - 1 : prev,
    );
  }, [totalOptions]);

  // ── Keyboard navigation ───────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < totalOptions - 1 ? prev + 1 : 0,
        );
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : totalOptions - 1,
        );
        break;
      }
      case 'Enter': {
        e.preventDefault();
        e.stopPropagation();

        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          commit(filtered[highlightIndex]);
        } else if (
          showCreate &&
          highlightIndex === filtered.length
        ) {
          commit(inputValue);
        } else if (inputValue.trim().length > 0) {
          // Nothing highlighted — commit raw input
          commit(inputValue);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        cancel();
        break;
      }
    }
  }

  // ── Select a suggestion via click ─────────────────────────────────
  function handleSelect(text: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    commit(text);
  }

  // ── Size-specific styles ──────────────────────────────────────────
  const pillClass = isSm
    ? 'bg-surface-tertiary text-fg/40 text-[10px] font-mono rounded-full px-2 py-0.5'
    : 'bg-surface-tertiary text-fg/50 text-xs font-mono rounded-full px-2.5 py-1';

  const ghostClass = isSm
    ? 'text-fg/20 text-[10px] font-mono hover:text-fg/35'
    : 'text-fg/25 text-xs font-mono hover:text-fg/40';

  const inputClass = isSm
    ? 'text-[10px] font-mono px-2 py-0.5 text-fg/60'
    : 'text-xs font-mono px-2.5 py-1 text-fg/70';

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Render
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── Editing mode ──────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div
        ref={containerRef}
        className="relative inline-block"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className={`
            ${inputClass}
            w-full min-w-[7rem] max-w-[12rem]
            rounded-full bg-surface-tertiary outline-none
            placeholder:text-fg/20
            caret-fg/50
          `}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label="Workstream name"
          aria-expanded={totalOptions > 0}
          aria-haspopup="listbox"
          aria-activedescendant={
            highlightIndex >= 0
              ? `ws-option-${highlightIndex}`
              : undefined
          }
          role="combobox"
        />

        {/* ── Dropdown ──────────────────────────────────────────── */}
        {totalOptions > 0 && (
          <div
            role="listbox"
            aria-label="Workstream suggestions"
            className="
              absolute left-0 top-full mt-1 z-20
              w-48 max-h-40 overflow-y-auto
              rounded-lg border border-border-default
              bg-surface-secondary shadow-lg
            "
          >
            {filtered.map((suggestion, i) => (
              <button
                key={suggestion}
                id={`ws-option-${i}`}
                role="option"
                type="button"
                aria-selected={i === highlightIndex}
                onPointerDown={(e) => handleSelect(suggestion, e)}
                className={`
                  block w-full text-left px-3 py-1.5
                  text-xs font-mono text-fg/60
                  transition-colors cursor-pointer
                  ${i === highlightIndex ? 'bg-surface-hover text-fg/80' : 'hover:bg-surface-hover'}
                `}
              >
                {suggestion}
              </button>
            ))}

            {showCreate && (
              <button
                id={`ws-option-${filtered.length}`}
                role="option"
                type="button"
                aria-selected={highlightIndex === filtered.length}
                onPointerDown={(e) => handleSelect(inputValue, e)}
                className={`
                  block w-full text-left px-3 py-1.5
                  text-xs font-mono text-fg/40 italic
                  transition-colors cursor-pointer
                  ${highlightIndex === filtered.length ? 'bg-surface-hover text-fg/60' : 'hover:bg-surface-hover'}
                `}
              >
                Create &lsquo;{inputValue.trim()}&rsquo;
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Display mode — value pill ─────────────────────────────────────
  if (value !== null) {
    return (
      <span
        className={`
          ${pillClass}
          inline-flex items-center gap-1 select-none
          transition-colors
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="cursor-pointer hover:text-fg/60 transition-colors"
          onClick={startEditing}
          aria-label={`Edit workstream: ${value}`}
        >
          {value}
        </button>
        <button
          type="button"
          className="
            cursor-pointer ml-0.5
            opacity-50 hover:opacity-100
            transition-opacity
          "
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove workstream: ${value}`}
        >
          ✕
        </button>
      </span>
    );
  }

  // ── Display mode — ghost add button ───────────────────────────────
  return (
    <button
      type="button"
      className={`
        ${ghostClass}
        cursor-pointer select-none
        transition-colors
      `}
      onClick={startEditing}
      aria-label="Add workstream"
    >
      {placeholder}
    </button>
  );
}
