import { useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, MapPin, Upload } from "lucide-react";
import { formatCoordinates, normalizeCoordinates } from "../lib/coordinates";
import { importGoogleMapsLink, type GoogleMapsPlace } from "../lib/googleMapsLink";

/**
 * Personel "Yeni firma" formunun Google Maps bağlantısı alanı.
 *
 * Bağlantıdan yalnız kendi içinde yazılı bilgiler okunur (yer adı, adres,
 * koordinat). Temsilci önizlemeyi görür, "Bilgileri forma aktar" ile onaylar;
 * ardından adres alanları ve harita pini bu bilgilerle dolar ve elle
 * düzeltilebilir kalır.
 */
export default function GoogleMapsImport({
  onApply,
}: {
  onApply: (info: GoogleMapsPlace) => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GoogleMapsPlace | null>(null);
  const [applied, setApplied] = useState(false);

  function reset() {
    setResult(null);
    setApplied(false);
    setError("");
  }

  async function resolve() {
    if (!link.trim() || busy) return;
    setBusy(true);
    reset();
    try {
      const outcome = await importGoogleMapsLink(link);
      if (outcome.ok) {
        setResult(outcome.info);
      } else {
        setError(outcome.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const coords = result
    ? normalizeCoordinates(result.latitude, result.longitude)
    : null;

  return (
    <div className="rep-field">
      <label htmlFor="mapsLink">Google Maps bağlantısı</label>
      <div className="rep-mapimport__inputrow">
        <input
          id="mapsLink"
          className="rep-input"
          type="url"
          inputMode="url"
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
            if (result || error || applied) reset();
          }}
          onKeyDown={(event) => {
            // Enter dış formu göndermesin; yalnızca bağlantıyı çözer.
            if (event.key === "Enter") {
              event.preventDefault();
              void resolve();
            }
          }}
          placeholder="https://maps.app.goo.gl/… veya maps.google.com/…"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="rep-btn rep-btn--soft"
          onClick={() => void resolve()}
          disabled={busy || !link.trim()}
        >
          {busy ? (
            <Loader2 size={16} strokeWidth={2.2} aria-hidden="true" className="rep-mapimport__spin" />
          ) : (
            <Link2 size={16} strokeWidth={2.1} aria-hidden="true" />
          )}
          {busy ? "Çözümleniyor…" : "Konumu getir"}
        </button>
      </div>
      <small>
        Google Haritalar'da işletmeyi açın → Paylaş → Bağlantıyı kopyala → buraya yapıştırın.
        Yalnızca bağlantıda yazılı bilgiler aktarılır; bulunamayan alanlar boş kalır.
      </small>

      {error && (
        <div className="rep-note rep-note--warn" role="alert">
          <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="rep-mapimport">
          <dl className="rep-mapimport__preview">
            {result.placeName && (
              <div className="rep-mapimport__row">
                <dt>Yer adı</dt>
                <dd>{result.placeName}</dd>
              </div>
            )}
            {result.address && (
              <div className="rep-mapimport__row">
                <dt>Adres</dt>
                <dd>{result.address}</dd>
              </div>
            )}
            {result.province && (
              <div className="rep-mapimport__row">
                <dt>İl</dt>
                <dd>{result.province}</dd>
              </div>
            )}
            {result.district && (
              <div className="rep-mapimport__row">
                <dt>İlçe</dt>
                <dd>{result.district}</dd>
              </div>
            )}
            {coords && (
              <div className="rep-mapimport__row">
                <dt>Konum</dt>
                <dd>
                  <MapPin size={13} strokeWidth={2.1} aria-hidden="true" />{" "}
                  {formatCoordinates(coords)}
                </dd>
              </div>
            )}
            {result.fromShortLink && (
              <div className="rep-mapimport__row">
                <dt>Kaynak</dt>
                <dd>Kısa bağlantı çözümlendi</dd>
              </div>
            )}
          </dl>

          <div className="rep-mapimport__actions">
            <button
              type="button"
              className="rep-btn rep-btn--primary rep-btn--sm"
              onClick={() => {
                onApply(result);
                setApplied(true);
              }}
            >
              <Upload size={15} strokeWidth={2.1} aria-hidden="true" />
              Bilgileri forma aktar
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--ghost rep-btn--sm"
              onClick={() => {
                setResult(null);
                setApplied(false);
              }}
            >
              Vazgeç
            </button>
          </div>

          {applied && (
            <p className="rep-mapimport__ok" role="status">
              <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden="true" />
              Bilgiler forma aktarıldı. Haritadaki pini ve adres alanlarını kontrol edin;
              gerekirse elle düzeltebilirsiniz.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
