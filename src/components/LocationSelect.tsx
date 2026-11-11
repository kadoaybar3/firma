import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, SearchX, X } from "lucide-react";
import { TR_ILLER } from "../data/trCities";
import { TR_ILCELERI } from "../data/trDistricts";
import { normalizeSearch } from "../lib/slug";
import "./LocationSelect.css";

export interface LocationValue {
  province: string;
  district: string;
}

export interface LocationSelectProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  required?: boolean;
  disabled?: boolean;
  /** Veritabanında bulunan, statik listede olmayan ek il adları. */
  extraProvinces?: string[];
  /** Seçili ile ait, statik listede olmayan eski/özel ilçe adları. */
  extraDistricts?: string[];
  labelProvince?: string;
  labelDistrict?: string;
  placeholderProvince?: string;
  placeholderDistrict?: string;
  errorProvince?: string;
  errorDistrict?: string;
  /** true ise il ve ilçe alt alta; varsayılan iki sütun. */
  stacked?: boolean;
  /** Seçili değeri tek tıkla temizleme düğmesi gösterir (filtreler için). */
  clearable?: boolean;
  /** Alanların dış kapsayıcısına eklenecek sınıf (form grid hizası için). */
  className?: string;
}

function normalizeQuery(value: string): string {
  return normalizeSearch(value.trim());
}

function uniqueByName(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const name = raw.trim();
    if (!name) continue;
    const key = normalizeSearch(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** İl listesi: 81 il + veritabanındaki ek/özel adlar + mevcut seçim, aramayla süzülür. */
export function provinceOptions(
  extraProvinces: string[] = [],
  current = "",
  query = "",
): string[] {
  const all = uniqueByName([...TR_ILLER, ...extraProvinces, current]);
  const needle = normalizeQuery(query);
  if (!needle) return all;
  return all.filter((name) => normalizeSearch(name).includes(needle));
}

/**
 * İlçe listesi yalnızca seçili ile aittir (istek 5). Veritabanındaki eski/özel
 * ilçeler kaybolmasın diye `extraDistricts` listeye eklenir.
 */
export function districtOptions(
  province: string,
  extraDistricts: string[] = [],
  current = "",
  query = "",
): string[] {
  if (!province) return [];
  const all = uniqueByName([...(TR_ILCELERI[province] ?? []), ...extraDistricts, current]);
  const needle = normalizeQuery(query);
  if (!needle) return all;
  return all.filter((name) => normalizeSearch(name).includes(needle));
}

/**
 * İl değişimi kuralı: farklı bir il seçildiğinde önceki ilçe her zaman temizlenir.
 * Aynı il yeniden seçilirse mevcut ilçe korunur (formun boşuna sıfırlanmaması için).
 */
export function nextLocationOnProvinceChange(
  province: string,
  current: LocationValue,
): LocationValue {
  return {
    province,
    district: province === current.province ? current.district : "",
  };
}

/**
 * Türkiye il/ilçe seçimi — aramalı, birbirine bağlı, mobil uyumlu.
 * Veri kaynağı: uygulama içi statik 81 il / 973 ilçe listesi. Ağ çağrısı yok.
 * İl değiştiğinde ilçe her zaman temizlenir.
 */
export default function LocationSelect({
  value,
  onChange,
  required,
  disabled,
  extraProvinces = [],
  extraDistricts = [],
  labelProvince = "İl",
  labelDistrict = "İlçe",
  placeholderProvince = "İl ara…",
  placeholderDistrict = "İlçe ara…",
  errorProvince,
  errorDistrict,
  stacked = false,
  clearable = false,
  className,
}: LocationSelectProps) {
  const [open, setOpen] = useState<"province" | "district" | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const provinces = useMemo(
    () => provinceOptions(extraProvinces, value.province, query),
    [extraProvinces, query, value.province],
  );

  const districts = useMemo(
    () => districtOptions(value.province, extraDistricts, value.district, query),
    [extraDistricts, query, value.district, value.province],
  );

  // Dışarı tıklama ve Esc ile kapanma.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openDropdown(which: "province" | "district") {
    if (disabled || (which === "district" && !value.province)) return;
    setOpen(which);
    setQuery("");
  }

  /** İl seçimi: ilçe her zaman temizlenir (istek 6). */
  function selectProvince(province: string) {
    onChange(nextLocationOnProvinceChange(province, value));
    setOpen(null);
    setQuery("");
  }

  function selectDistrict(district: string) {
    onChange({ province: value.province, district });
    setOpen(null);
    setQuery("");
  }

  function clearProvince(event: React.MouseEvent) {
    event.stopPropagation();
    clearProvinceValue();
  }

  function clearProvinceValue() {
    onChange({ province: "", district: "" });
    setOpen(null);
    setQuery("");
  }

  function clearDistrict(event: React.MouseEvent) {
    event.stopPropagation();
    clearDistrictValue();
  }

  function clearDistrictValue() {
    onChange({ province: value.province, district: "" });
    setOpen(null);
    setQuery("");
  }

  return (
    <div
      ref={rootRef}
      className={`loc-select ${stacked ? "loc-select--stacked" : ""} ${className ?? ""}`.trim()}
    >
      <div className="loc-field">
        <span className="loc-select__label" id={`${id}-province-label`}>
          {labelProvince}
          {required && <span aria-hidden="true"> *</span>}
        </span>
        <div className="loc-select__row">
          <button
            type="button"
            className={`loc-btn ${open === "province" ? "open" : ""}`}
            aria-expanded={open === "province"}
            aria-haspopup="listbox"
            aria-labelledby={`${id}-province-label ${id}-province-value`}
            disabled={disabled}
            onClick={() => (open === "province" ? setOpen(null) : openDropdown("province"))}
          >
            <span className="loc-btn__text" id={`${id}-province-value`}>
              {value.province || "— seçiniz —"}
            </span>
            <span className="loc-btn__icons">
              {clearable && value.province && (
                <span
                  className="loc-btn__clear"
                  role="button"
                  tabIndex={0}
                  aria-label={`${labelProvince} seçimini temizle`}
                  onClick={clearProvince}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      clearProvinceValue();
                    }
                  }}
                >
                  <X size={13} strokeWidth={2.4} aria-hidden="true" />
                </span>
              )}
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>

          {open === "province" && (
            <div className="loc-dropdown" role="listbox" aria-labelledby={`${id}-province-label`}>
              <div className="loc-dropdown__search">
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={placeholderProvince}
                  aria-label={`${labelProvince} ara`}
                />
                {query.trim() && (
                  <button
                    type="button"
                    className="loc-dropdown__clear"
                    aria-label="Aramayı temizle"
                    onClick={() => setQuery("")}
                  >
                    <SearchX size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="loc-dropdown__list">
                {provinces.length === 0 && (
                  <div className="loc-dropdown__empty">Sonuç bulunamadı</div>
                )}
                {provinces.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`loc-dropdown__item ${
                      name === value.province ? "is-active" : ""
                    }`}
                    role="option"
                    aria-selected={name === value.province}
                    onClick={() => selectProvince(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="loc-dropdown__count">
                {query.trim() ? `${provinces.length} sonuç` : `${provinces.length} il`}
              </div>
            </div>
          )}
        </div>
        {errorProvince && (
          <span className="loc-field__error" role="alert">
            {errorProvince}
          </span>
        )}
      </div>

      <div className="loc-field">
        <span className="loc-select__label" id={`${id}-district-label`}>
          {labelDistrict}
          {required && <span aria-hidden="true"> *</span>}
        </span>
        <div className="loc-select__row">
          <button
            type="button"
            className={`loc-btn ${open === "district" ? "open" : ""}`}
            aria-expanded={open === "district"}
            aria-haspopup="listbox"
            aria-labelledby={`${id}-district-label ${id}-district-value`}
            disabled={disabled || !value.province}
            onClick={() => (open === "district" ? setOpen(null) : openDropdown("district"))}
          >
            <span className="loc-btn__text" id={`${id}-district-value`}>
              {value.district || "— seçiniz —"}
            </span>
            <span className="loc-btn__icons">
              {clearable && value.district && (
                <span
                  className="loc-btn__clear"
                  role="button"
                  tabIndex={0}
                  aria-label={`${labelDistrict} seçimini temizle`}
                  onClick={clearDistrict}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      clearDistrictValue();
                    }
                  }}
                >
                  <X size={13} strokeWidth={2.4} aria-hidden="true" />
                </span>
              )}
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>

          {open === "district" && (
            <div className="loc-dropdown" role="listbox" aria-labelledby={`${id}-district-label`}>
              <div className="loc-dropdown__search">
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={placeholderDistrict}
                  aria-label={`${labelDistrict} ara`}
                />
                {query.trim() && (
                  <button
                    type="button"
                    className="loc-dropdown__clear"
                    aria-label="Aramayı temizle"
                    onClick={() => setQuery("")}
                  >
                    <SearchX size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="loc-dropdown__list">
                {!value.province && <div className="loc-dropdown__empty">Önce il seçin</div>}
                {value.province && districts.length === 0 && (
                  <div className="loc-dropdown__empty">Sonuç bulunamadı</div>
                )}
                {districts.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`loc-dropdown__item ${
                      name === value.district ? "is-active" : ""
                    }`}
                    role="option"
                    aria-selected={name === value.district}
                    onClick={() => selectDistrict(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="loc-dropdown__count">
                {value.province ? `${districts.length} ilçe` : "—"}
              </div>
            </div>
          )}
        </div>
        {errorDistrict && (
          <span className="loc-field__error" role="alert">
            {errorDistrict}
          </span>
        )}
        {!value.province && !errorDistrict && (
          <span className="loc-field__hint">Önce il seçin.</span>
        )}
      </div>
    </div>
  );
}
