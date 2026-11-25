import type { CompanyHours } from "../lib/types";
import { hoursDraftError, type HoursDay, type HoursDraft } from "../lib/hours";

/**
 * Personel "Yeni firma" formunun çalışma saatleri alanı.
 *
 * Haftanın yedi günü ayrı satırda görünür; her gün Açık/Kapalı seçilir ve
 * açıkken açılış/kapanış saati girilir. Kayıt biçimi mevcut sistemle AYNIDIR:
 * `companies.hours` üç alanlıdır (weekday / saturday / sunday), bu yüzden
 * Pazartesi–Cuma satırları tek aralığı (weekday) düzenler.
 */
const ROWS: Array<{ key: keyof CompanyHours; label: string }> = [
  { key: "weekday", label: "Pazartesi" },
  { key: "weekday", label: "Salı" },
  { key: "weekday", label: "Çarşamba" },
  { key: "weekday", label: "Perşembe" },
  { key: "weekday", label: "Cuma" },
  { key: "saturday", label: "Cumartesi" },
  { key: "sunday", label: "Pazar" },
];

export default function HoursFields({
  value,
  onChange,
}: {
  value: HoursDraft;
  onChange: (next: HoursDraft) => void;
}) {
  const error = hoursDraftError(value);

  function update(key: keyof CompanyHours, patch: Partial<HoursDay>) {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  }

  return (
    <div className="rep-hours">
      {ROWS.map(({ key, label }) => {
        const day = value[key];
        const invalid =
          day.open && (!day.opens || !day.closes || day.closes <= day.opens);

        return (
          <div key={label} className={`rep-hours__row ${day.open ? "is-open" : ""}`}>
            <span className="rep-hours__day">{label}</span>

            <label className="rep-hours__toggle">
              <input
                type="checkbox"
                checked={day.open}
                onChange={(e) => update(key, { open: e.target.checked })}
                aria-label={`${label} açık`}
              />
              <span>{day.open ? "Açık" : "Kapalı"}</span>
            </label>

            {day.open && (
              <div className="rep-hours__times">
                <input
                  className="rep-input rep-hours__time"
                  type="time"
                  value={day.opens}
                  onChange={(e) => update(key, { opens: e.target.value })}
                  aria-label={`${label} açılış saati`}
                  aria-invalid={invalid || undefined}
                />
                <span className="rep-hours__dash" aria-hidden="true">
                  –
                </span>
                <input
                  className="rep-input rep-hours__time"
                  type="time"
                  value={day.closes}
                  onChange={(e) => update(key, { closes: e.target.value })}
                  aria-label={`${label} kapanış saati`}
                  aria-invalid={invalid || undefined}
                />
              </div>
            )}
          </div>
        );
      })}

      {error && (
        <p className="rep-hours__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
