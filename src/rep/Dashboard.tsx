import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";
import { useActor, useAuth } from "../lib/auth";
import { formatDate, formatDateTime, formatTRY } from "../lib/format";
import {
  getCompanyById,
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
