import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  FileText,
  Link2,
  Plus,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { useActor, useAuth } from "../lib/auth";
import { formatDate, formatDateTime, formatTRY } from "../lib/format";
import {
  createTeam,
  getCompanyById,
  getMyTeam,
  getRepById,
  getSettings,
  listCommissionPayoutSummary,
  listLeads,
  listPayments,
  listSales,
} from "../lib/repo";
import { isDraft, isLocked, LEAD_STATUS } from "./repShared";

export default function RepDashboard() {
  const { user } = useAuth();
  const actor = useActor();
  const leads = listLeads(actor);
  const sales = listSales(actor);
  const payments = listPayments(actor);
  const commissionSummary = listCommissionPayoutSummary(actor)[0];

  const myTeam = getMyTeam(actor);
  const teamCapacity = getSettings().teamCapacity;
  const [teamName, setTeamName] = useState("");
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);

  // Referans başvuru bağlantısı: kendi personel kodumdan /basvuru?ref=…
  const myRep = actor.repId ? getRepById(actor.repId) : undefined;
  const referralUrl = myRep
    ? `${window.location.origin}/basvuru?ref=${encodeURIComponent(myRep.code)}`
    : "";
  const [copied, setCopied] = useState(false);

  async function copyReferral() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano erişimi yoksa (http vb.) kullanıcı alanı elle seçip kopyalayabilir.
    }
  }

  async function handleCreateTeam(e: FormEvent) {
    e.preventDefault();
    setTeamError(null);
    setTeamBusy(true);
    try {
      await createTeam(teamName, actor);
      setTeamName("");
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Ekip kurulamadı.");
    } finally {
      setTeamBusy(false);
    }
  }

  const drafts = leads.filter(isDraft);
  const pendingDrafts = drafts.filter((l) => !isLocked(l));
  const inReview = drafts.filter(isLocked);
  const approved = leads.filter((l) => Boolean(l.convertedToCompanyId));

  const confirmedSales = sales.filter((s) => s.status === "odendi");
  const confirmedTotal = confirmedSales.reduce((sum, s) => sum + s.amount, 0);
  const pendingCommission = commissionSummary?.outstanding ?? 0;
  const paidCommission = commissionSummary?.paid ?? 0;

  const firstName = (user?.name ?? "").trim().split(/\s+/)[0] || "Merhaba";

  type Activity = { id: string; title: string; meta: string; at: string; to: string };
  const activity: Activity[] = [
    ...leads.map((l) => ({
      id: `lead-${l.id}`,
      title: l.companyName,
      meta: l.convertedToCompanyId
        ? "Firma onaylandı"
        : isLocked(l)
          ? "Anlaşma bildirildi · incelemede"
          : `Taslak · ${LEAD_STATUS[l.status].label}`,
      at: l.updatedAt,
      to: isLocked(l) || l.convertedToCompanyId ? "/temsilci/taslaklar" : `/temsilci/taslak/${l.id}`,
    })),
    ...sales.map((s) => ({
      id: `sale-${s.id}`,
      title: getCompanyById(s.companyId)?.name ?? "Üyelik satışı",
      meta: s.status === "odendi" ? "Satış kesinleşti" : s.status === "iptal" ? "Satış iptal" : "Satış onay bekliyor",
      at: s.createdAt,
      to: "/temsilci/satislarim",
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  const lastPayment = payments[0];

  return (
    <div className="rep-stack">
      {/* Karşılama */}
      <section className="rep-hero">
        <div className="rep-hero__eyebrow">{formatDate(new Date().toISOString())}</div>
        <h1>Merhaba, {firstName}</h1>
        <p>
          Sahada yeni bir firma mı buldunuz? Bilgileri girin, taslak olarak kaydedin; firma
          yönetici onayıyla rehbere eklenir.
        </p>
        <div className="rep-hero__actions">
          <Link className="rep-btn rep-btn--white" to="/temsilci/yeni">
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            Yeni Firma Ekle
          </Link>
          <Link className="rep-btn rep-btn--ghost" to="/temsilci/taslaklar" style={{ borderColor: "rgba(255,255,255,.35)", color: "#fff" }}>
            <FileText size={17} strokeWidth={2} aria-hidden="true" />
            Taslaklarım
          </Link>
        </div>
      </section>

      {/* Satış süreci */}
      <section className="rep-card">
        <div className="rep-card__head">
          <h2>Satış süreci nasıl işler?</h2>
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: "var(--rep-ink)" }}>
          <li>
            <strong>Taslak:</strong> firma bilgilerini girip kaydedersiniz. Firma henüz rehberde
            görünmez, yalnız size bağlıdır; bilgileri anlaşma bildirilene kadar düzenleyebilirsiniz.
          </li>
          <li>
            <strong>Yönetici incelemesi/onayı:</strong> anlaşmayı bildirdiğinizde bilgiler
            kilitlenir ve yönetici firma kaydını kontrol edip onaylar.
          </li>
          <li>
            <strong>Tahsilat:</strong> ödeme yönetici tarafından ayrıca alınır; bu sürümde kartlı
            ödeme altyapısı yapılandırılmamıştır.
          </li>
          <li>
            <strong>Satışın kesinleşmesi:</strong> ödeme doğrulandığında satış kesinleşir ve firma
            rehbere eklenir.
          </li>
          <li>
            <strong>Komisyon:</strong> onaylanan satıştan komisyonunuz hesaplanır ve ödeme onayından
            sonra size ödenir.
          </li>
        </ol>
      </section>

      {/* Özet */}
      <section className="rep-stats" aria-label="Özet">
        <div className="rep-stat">
          <span className="rep-stat__icon" aria-hidden="true">
            <FileText size={18} strokeWidth={2} />
          </span>
          <span className="rep-stat__label">Bekleyen taslak</span>
          <span className="rep-stat__value">{pendingDrafts.length}</span>
          <span className="rep-stat__hint">
            {inReview.length > 0 ? `${inReview.length} anlaşma incelemede` : "Ödeme öncesi düzenlenebilir"}
          </span>
        </div>

        <div className="rep-stat">
          <span className="rep-stat__icon rep-stat__icon--green" aria-hidden="true">
            <CheckCircle2 size={18} strokeWidth={2} />
          </span>
          <span className="rep-stat__label">Onaylanan firma</span>
          <span className="rep-stat__value">{approved.length}</span>
          <span className="rep-stat__hint">Yönetici onayıyla rehbere eklendi</span>
        </div>

        <div className="rep-stat">
          <span className="rep-stat__icon rep-stat__icon--slate" aria-hidden="true">
            <Receipt size={18} strokeWidth={2} />
          </span>
          <span className="rep-stat__label">Kesinleşen satış</span>
          <span className="rep-stat__value">{confirmedSales.length}</span>
          <span className="rep-stat__hint">{formatTRY(confirmedTotal)}</span>
        </div>

        <div className="rep-stat">
          <span className="rep-stat__icon rep-stat__icon--amber" aria-hidden="true">
            <Wallet size={18} strokeWidth={2} />
          </span>
          <span className="rep-stat__label">Bekleyen komisyon</span>
          <span className="rep-stat__value">{formatTRY(pendingCommission)}</span>
          <span className="rep-stat__hint">
            {paidCommission > 0 ? `${formatTRY(paidCommission)} ödendi` : "Ödeme onayı bekliyor"}
          </span>
        </div>
      </section>

      <div className="rep-grid rep-grid--wide">
        {/* Son işlemler */}
        <section className="rep-card">
          <div className="rep-card__head">
            <h2>Son işlemler</h2>
            <Link to="/temsilci/taslaklar">Tümü</Link>
          </div>

          {activity.length === 0 ? (
            <div className="rep-empty">
              <span className="rep-empty__icon" aria-hidden="true">
                <Clock3 size={22} strokeWidth={1.8} />
              </span>
              <strong>Henüz işlem yok</strong>
              <p>İlk firma taslağınızı ekleyerek başlayın.</p>
              <Link className="rep-btn rep-btn--primary rep-btn--sm" to="/temsilci/yeni">
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                Firma ekle
              </Link>
            </div>
          ) : (
            <ul className="rep-list">
              {activity.map((item) => (
                <li key={item.id}>
                  <Link
                    className="rep-row"
                    to={item.to}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span className="rep-row__main">
                      <strong>{item.title}</strong>
                      <span>
                        {item.meta} · {formatDateTime(item.at)}
                      </span>
                    </span>
                    <span className="rep-row__side">
                      <ArrowRight size={16} strokeWidth={1.9} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Satış ve komisyon özeti */}
        <section className="rep-card">
          <div className="rep-card__head">
            <h2>Satış ve komisyon</h2>
            <Link to="/temsilci/satislarim">Detay</Link>
          </div>

          <ul className="rep-list">
            <li>
              <div className="rep-row">
                <span className="rep-row__main">
                  <strong>Toplam satış tutarı</strong>
                  <span>{sales.length} satış kaydı</span>
                </span>
                <span className="rep-row__amount">{formatTRY(sales.reduce((s, x) => s + x.amount, 0))}</span>
              </div>
            </li>
            <li>
              <div className="rep-row">
                <span className="rep-row__main">
                  <strong>Kesinleşen</strong>
                  <span>Ödemesi doğrulanan satışlar</span>
                </span>
                <span className="rep-row__amount">{formatTRY(confirmedTotal)}</span>
              </div>
            </li>
            <li>
              <div className="rep-row">
                <span className="rep-row__main">
                  <strong>Ödenmiş komisyon</strong>
                  <span>Hesabınıza geçen tutar</span>
                </span>
                <span className="rep-row__amount">{formatTRY(paidCommission)}</span>
              </div>
            </li>
            <li>
              <div className="rep-row">
                <span className="rep-row__main">
                  <strong>Son ödeme</strong>
                  <span>{lastPayment ? formatDateTime(lastPayment.updatedAt) : "Kayıt yok"}</span>
                </span>
                <span className="rep-row__side">
                  {lastPayment ? (
                    <span
                      className={`rep-badge ${
                        lastPayment.status === "onaylandi"
                          ? "rep-badge--green"
                          : lastPayment.status === "hata"
                            ? "rep-badge--red"
                            : "rep-badge--amber"
                      }`}
                    >
                      {lastPayment.status === "onaylandi"
                        ? "Doğrulandı"
                        : lastPayment.status === "hata"
                          ? "Başarısız"
                          : lastPayment.status === "iade"
                            ? "İade"
                            : "Bekliyor"}
                    </span>
                  ) : (
                    <span className="rep-badge rep-badge--gray">Yok</span>
                  )}
                </span>
              </div>
            </li>
          </ul>

          <div className="rep-note" style={{ marginTop: 12 }}>
            <Building2 size={16} strokeWidth={1.9} aria-hidden="true" />
            <span>
              Ödeme ve komisyon durumları yönetici tarafından doğrulanır. Bu ekran yalnızca
              sizin kayıtlarınızı gösterir.
            </span>
          </div>
        </section>
      </div>

      {/* Ekibim */}
      <section className="rep-card">
        <div className="rep-card__head">
          <h2>
            <Users size={17} strokeWidth={2} aria-hidden="true" /> Ekibim
          </h2>
        </div>

        {teamError && <div className="error-banner">{teamError}</div>}

        {myTeam ? (
          <>
            <div className="rep-row" style={{ paddingBottom: 6 }}>
              <span className="rep-row__main">
                <strong>{myTeam.team.name}</strong>
                <span>
                  {myTeam.members.length}/{teamCapacity} üye · lider:{" "}
                  {myTeam.members.find((m) => m.id === myTeam.team.leaderRepId)?.name ?? "—"}
                </span>
              </span>
            </div>
            <ul className="rep-list">
              {myTeam.members.map((m) => (
                <li key={m.id}>
                  <div className="rep-row">
                    <span className="rep-row__main">
                      <strong>{m.name}</strong>
                      <span>{m.code}</span>
                    </span>
                    <span className="rep-row__side">
                      {m.id === myTeam.team.leaderRepId ? (
                        <span className="rep-badge rep-badge--amber">Lider</span>
                      ) : m.id === actor.repId ? (
                        <span className="rep-badge rep-badge--green">Siz</span>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="rep-note" style={{ marginTop: 12 }}>
              <Users size={16} strokeWidth={1.9} aria-hidden="true" />
              <span>
                Ekip üyelik değişiklikleri yönetici onayıyla yapılır; kendi ekibinizi kurmak
                dışında başka bir ekibe geçiş yapamazsınız.
              </span>
            </div>
          </>
        ) : (
          <form className="rep-stack" onSubmit={handleCreateTeam}>
            <p className="text-muted small">
              Kendi ekibinizi kurabilirsiniz: lider siz olursunuz ve ekibiniz {teamCapacity}
              kişiyle sınırlıdır (lider dahil). Kurduğunuzda mevcut ekip üyeliğiniz sona erer.
            </p>
            <label className="field">
              <span className="field__label">Ekip adı</span>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Örn: Afyon Merkez Ekibi"
                maxLength={60}
                required
              />
              <span className="field__hint">2-60 karakter</span>
            </label>
            <div>
              <button
                className="rep-btn rep-btn--primary"
                type="submit"
                disabled={teamBusy || teamName.trim().length < 2}
              >
                <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                {teamBusy ? "Kuruluyor…" : "Ekip kur"}
              </button>
            </div>
          </form>
        )}

        {myRep && (
          <div className="rep-note" style={{ marginTop: 12, display: "block" }}>
            <span style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <Link2 size={16} strokeWidth={1.9} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ display: "block", width: "100%" }}>
                <strong style={{ display: "block", marginBottom: 2 }}>
                  Referans başvuru bağlantınız
                </strong>
                <span className="text-muted small" style={{ display: "block", marginBottom: 6 }}>
                  Bağlantıyı paylaştığınız kişi başvurusunu sizin ve ekibinizin adına yapar;
                  başvuru beklemede kaydedilir, onay yalnız yöneticiye aittir.
                </span>
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    readOnly
                    value={referralUrl}
                    aria-label="Referans başvuru bağlantısı"
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ flex: "1 1 220px", minWidth: 0, fontSize: 12 }}
                  />
                  <button
                    className="rep-btn rep-btn--ghost rep-btn--sm"
                    type="button"
                    onClick={() => void copyReferral()}
                  >
                    {copied ? (
                      <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                    ) : (
                      <Copy size={14} strokeWidth={2.2} aria-hidden="true" />
                    )}
                    {copied ? "Kopyalandı" : "Kopyala"}
                  </button>
                </span>
              </span>
            </span>
          </div>
        )}
      </section>

      {/* Kısa yol */}
      <section className="rep-card">
        <div className="rep-card__head">
          <h2>Hızlı işlem</h2>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link className="rep-btn rep-btn--primary" to="/temsilci/yeni">
            <Plus size={17} strokeWidth={2.2} aria-hidden="true" />
            Yeni firma taslağı
          </Link>
          <Link className="rep-btn rep-btn--ghost" to="/temsilci/taslaklar">
            <FileText size={16} strokeWidth={2} aria-hidden="true" />
            Taslakları yönet
          </Link>
        </div>
      </section>
    </div>
  );
}
