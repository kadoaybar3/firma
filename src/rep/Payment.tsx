import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../components/ui";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileQuestion,
  Info,
  Loader2,
  Lock,
  PencilLine,
  ShieldCheck,
} from "lucide-react";
import { useActor } from "../lib/auth";
import { formatTRY } from "../lib/format";
import { membershipPackages, type PackageKey } from "../lib/packages";
import { getCategoryById, getCityById, getSettings, listLeads, updateLead, updateLeadStatus } from "../lib/repo";
import { isPaymentProviderConfigured } from "../lib/payments";
import { isLocked, LeadStatusBadge } from "./repShared";

/**
 * Taslak → ödeme adımı.
 *
 * Dürüstlük ilkesi: gerçek ödeme sağlayıcısı bağlı değilse "ödeme başarılı"
 * taklidi YAPILMAZ. Kartla ödeme düğmesi kapalıdır ve nedeni açıkça yazılır.
 * Anlaşma bildirimi ödeme alınmadan yapılabilir; bu durumda kayıt kilitlenir
 * ve yönetici incelemesine düşer.
 */
export default function RepPayment() {
  const { id = "" } = useParams();
  const actor = useActor();
  const settings = getSettings();
  const lead = listLeads(actor).find((l) => l.id === id);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reported, setReported] = useState(false);
  // Zorunlu seçim: varsayılan yok, otomatik ilerleme yok.
  const [packageKey, setPackageKey] = useState<PackageKey | null>(lead?.packageKey ?? null);

  if (!lead) {
    return (
      <div className="rep-card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="rep-empty">
          <span className="rep-empty__icon" aria-hidden="true">
            <FileQuestion size={24} strokeWidth={1.8} />
          </span>
          <strong>Taslak bulunamadı</strong>
          <p>Bu kayıt size ait değil veya kaldırılmış olabilir.</p>
          <Link className="rep-btn rep-btn--primary rep-btn--sm" to="/temsilci/taslaklar">
            Taslaklara dön
          </Link>
        </div>
      </div>
    );
  }

  const locked = isLocked(lead);
  const category = lead.categoryId ? getCategoryById(lead.categoryId)?.name : undefined;
  const city = lead.cityId ? getCityById(lead.cityId)?.name : undefined;
  const place = [city, lead.district].filter(Boolean).join(", ");
  const packages = membershipPackages(settings);
  const selectedPackage = packages.find((p) => p.key === packageKey) ?? null;

  function choose(key: PackageKey) {
    setError("");
    try {
      updateLead(lead!.id, { packageKey: key }, actor);
      setPackageKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paket kaydedilemedi.");
    }
  }

  async function reportAgreement() {
    setBusy(true);
    setError("");
    try {
      updateLeadStatus(lead!.id, "anlaşma", undefined, actor);
      setReported(true);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anlaşma bildirilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rep-stack" style={{ maxWidth: 760, margin: "0 auto" }}>
      <div>
        <Link className="rep-backlink" to="/temsilci/taslaklar">
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          Taslaklar
        </Link>
        <div className="rep-pagehead">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>Ödeme</h1>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p>Yıllık üyelik paketi ile firmanızı rehbere ekleyin.</p>
        </div>
      </div>

      {/* Taslak özeti */}
      <section className="rep-card">
        <div className="rep-card__head">
          <h2>{lead.companyName}</h2>
          {!locked && (
            <Link to={`/temsilci/taslak/${lead.id}`}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <PencilLine size={14} strokeWidth={2} aria-hidden="true" />
                Düzenle
              </span>
            </Link>
          )}
        </div>
        <div className="rep-draft__meta">
          {category && <span>{category}</span>}
          {place && <span>{place}</span>}
          {lead.phone && <span>{lead.phone}</span>}
        </div>
      </section>

      {(reported || locked) && (
        <div className="rep-note rep-note--warn">
          <Lock size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            Anlaşma bildirildi. Firma bilgileri kilitlendi ve yönetici incelemesine alındı.
            Yönetici ödeme ve yayın sürecini tamamlayacak.
          </span>
        </div>
      )}

      {/* Paket seçimi (zorunlu) */}
      <section className="rep-card">
        <div className="rep-card__head">
          <h2>Paket seçin (zorunlu)</h2>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--rep-muted)", lineHeight: 1.5 }}>
          Fiyat yalnızca paket seçimiyle belirlenir; tutar giremez veya değiştirilemez.
          Devam etmek için bir paket seçmelisiniz.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 12 }} role="radiogroup" aria-label="Paket seçimi">
          {packages.map((p) => {
            const picked = packageKey === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={picked}
                className={`rep-package ${picked ? "is-picked" : ""}`}
                onClick={() => choose(p.key)}
                disabled={locked}
                style={{ textAlign: "left", cursor: locked ? "not-allowed" : "pointer" }}
              >
                <div className="rep-package__head">
                  <span className="rep-package__icon" aria-hidden="true">
                    <BadgeCheck size={20} strokeWidth={1.9} />
                  </span>
                  <div>
                    <strong style={{ fontSize: 15 }}>{p.label}</strong>
                    <div style={{ fontSize: 12.5, color: "var(--rep-muted)" }}>12 ay rehberde yayın</div>
                  </div>
                </div>
                <div className="rep-package__price">{formatTRY(p.amount)}</div>
                <dl className="rep-package__rows">
                  <div>
                    <dt>Paket</dt>
                    <dd>{p.label}</dd>
                  </div>
                  <div>
                    <dt>Süre</dt>
                    <dd>12 ay</dd>
                  </div>
                  <div>
                    <dt>Toplam</dt>
                    <dd>{formatTRY(p.amount)}</dd>
                  </div>
                </dl>
                {picked && <Badge tone="green">Seçildi</Badge>}
              </button>
            );
          })}
        </div>

        <div className="rep-note" style={{ marginTop: 14 }}>
          <Info size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>
            Ödeme işleminiz sonrasında firma bilgilerinizin doğru düzenlenebilmesi için gerekli
            bilgileri eksiksiz paylaşmayı unutmayın.
          </span>
        </div>
      </section>

      {/* Ödeme altyapısı durumu */}
      {!isPaymentProviderConfigured ? (
        <section className="rep-card rep-stack">
          <div className="rep-note rep-note--warn">
            <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>Kartlı ödeme altyapısı henüz yapılandırılmadı.</strong> Bu nedenle bu
              ekranda gerçek ödeme alınmaz ve sahte bir “ödeme başarılı” durumu gösterilmez.
            </span>
          </div>

          <button type="button" className="rep-btn rep-btn--primary rep-btn--block" disabled={!selectedPackage}>
            <CreditCard size={17} strokeWidth={2} aria-hidden="true" />
            Kartla öde (altyapı yok){!selectedPackage ? " — önce paket seçin" : ""}
          </button>

          <div className="rep-note">
            <ShieldCheck size={16} strokeWidth={1.9} aria-hidden="true" />
            <span>
              Kart bilgileri hiçbir koşulda bu uygulamada saklanmaz. Gerçek ödeme ancak sağlayıcı
              entegrasyonu ve sunucu tarafı doğrulama ile alınabilir.
            </span>
          </div>
        </section>
      ) : (
        <section className="rep-card">
          <button type="button" className="rep-btn rep-btn--primary rep-btn--block" disabled={!selectedPackage}>
            <CreditCard size={17} strokeWidth={2} aria-hidden="true" />
            {selectedPackage ? `Kartla öde · ${formatTRY(selectedPackage.amount)}` : "Kartla öde — önce paket seçin"}
          </button>
        </section>
      )}

      {/* Ödemesiz anlaşma bildirimi */}
      {!locked && !reported && (
        <section className="rep-card rep-stack">
          <div className="rep-card__head">
            <h2>Ödeme alınamıyorsa</h2>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--rep-muted)", lineHeight: 1.5 }}>
            Anlaşmayı yöneticiye bildirebilirsiniz. Bu işlem herhangi bir ödeme tahsil etmez;
            yönetici sizinle iletişime geçip ödemeyi ayrıca tamamlar. Bildirimden sonra firma
            bilgileri kilitlenir.
          </p>

          {!confirmOpen ? (
            <button
              type="button"
              className="rep-btn rep-btn--ghost rep-btn--block"
              disabled={!selectedPackage}
              onClick={() => setConfirmOpen(true)}
            >
              <CalendarClock size={17} strokeWidth={2} aria-hidden="true" />
              Anlaşmayı bildir (ödemesiz){!selectedPackage ? " — önce paket seçin" : ""}
            </button>
          ) : (
            <div className="rep-stack">
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 9,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  style={{ marginTop: 2, width: 18, height: 18 }}
                />
                <span>
                  Bu adımda ödeme alınmadığını, ödemenin yönetici tarafından ayrıca tahsil
                  edileceğini anladım.
                </span>
              </label>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  type="button"
                  className="rep-btn rep-btn--primary"
                  disabled={!confirmed || busy}
                  onClick={() => void reportAgreement()}
                >
                  {busy ? (
                    <>
                      <Loader2 size={16} strokeWidth={2.2} aria-hidden="true" />
                      Bildiriliyor…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
                      Anlaşmayı yöneticiye bildir
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="rep-btn rep-btn--ghost"
                  onClick={() => {
                    setConfirmOpen(false);
                    setConfirmed(false);
                  }}
                  disabled={busy}
                >
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="rep-note rep-note--danger" role="alert">
          <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <Link className="rep-btn rep-btn--ghost" to="/temsilci/taslaklar">
        Taslaklara dön
      </Link>
    </div>
  );
}
