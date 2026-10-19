import { useSyncError, retrySync } from "../lib/syncError";

/**
 * Canlı modda yazım-kuyruğu hatası olduğunda panelin üzerinde duran kalıcı
 * uyarı. Kullanıcı verisinin sunucuya YETMEDİĞİNİ mutlaka bilir; hatalar
 * konsola defnedilmez, sessizce yutulmaz.
 */
export function SyncBanner() {
  const error = useSyncError();
  if (!error) return null;
  return (
    <div
      role="alert"
      style={{
        margin: "12px var(--panel-pad-x, 16px) 0",
        padding: "10px 14px",
        borderRadius: 10,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        color: "#9f1239",
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        fontSize: 14,
      }}
    >
      <span style={{ fontWeight: 600 }}>⚠️ Değişiklik henüz sunucuya kaydedilemedi:</span>
      <span style={{ overflowWrap: "anywhere" }}>{error}</span>
      <button
        type="button"
        className="btn btn--sm"
        onClick={() => {
          void retrySync();
        }}
        style={{ marginLeft: "auto" }}
      >
        Tekrar dene
      </button>
    </div>
  );
}
