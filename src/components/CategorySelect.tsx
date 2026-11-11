import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { normalizeSearch } from "../lib/slug";
import "./LocationSelect.css";
import "./CategorySelect.css";

export interface CategoryOption {
  id: string;
  name: string;
  icon?: string;
}

export interface CategorySelectProps {
  categories: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  /** Boş değer için gösterilecek seçenek ("Tüm kategoriler" gibi). */
  allLabel?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Aramalı kategori seçimi. Kategori sayısı arttıkça uzun listeyi kaydırmak
 * yerine yazarak süzmeyi sağlar; sıra çağıranın verdiği sıradır.
 */
export default function CategorySelect({
  categories,
  value,
  onChange,
  allLabel,
  placeholder = "Kategori seçin…",
  ariaLabel = "Kategori",
  disabled,
  className,
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const selected = categories.find((category) => category.id === value);
  const filtered = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    if (!needle) return categories;
    return categories.filter((category) => normalizeSearch(category.name).includes(needle));
  }, [categories, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const triggerLabel = selected
    ? `${selected.icon ? `${selected.icon} ` : ""}${selected.name}`
    : (allLabel ?? placeholder);

  return (
    <div ref={rootRef} className={`loc-select cat-select ${className ?? ""}`.trim()}>
      <div className="loc-field">
        <div className="loc-select__row">
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            id={`${id}-trigger`}
            className={`loc-btn ${open ? "open" : ""}`}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (disabled) return;
              setOpen((current) => !current);
              setQuery("");
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setOpen((current) => !current);
                setQuery("");
              }
            }}
          >
            <span className="loc-btn__text">{triggerLabel}</span>
            <span className="loc-btn__icons">
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </span>
          </div>

          {open && (
            <div className="loc-dropdown" role="listbox" aria-label={ariaLabel}>
              <div className="loc-dropdown__search">
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Kategori ara…"
                  aria-label="Kategori ara"
                />
              </div>
              <div className="loc-dropdown__list">
                {allLabel && !query.trim() && (
                  <button
                    type="button"
                    className={`loc-dropdown__item ${value === "" ? "is-active" : ""}`}
                    role="option"
                    aria-selected={value === ""}
                    onClick={() => select("")}
                  >
                    {allLabel}
                  </button>
                )}
                {filtered.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`loc-dropdown__item ${category.id === value ? "is-active" : ""}`}
                    role="option"
                    aria-selected={category.id === value}
                    onClick={() => select(category.id)}
                  >
                    {category.icon ? `${category.icon} ` : ""}
                    {category.name}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="loc-dropdown__empty">Kategori bulunamadı</div>
                )}
              </div>
              <div className="loc-dropdown__count">{filtered.length} kategori</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
