import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  FilterX,
  History,
  XCircle,
} from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, StatCard, auditActionLabels } from "../components/ui";
import { FirmIdentity } from "../components/FirmList";
import { useActor } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatDateTime, formatTRY, isPlaceholderPaymentRef } from "../lib/format";
import {
  getCompanyById,
  listAudit,
  listPayments,
  listSales,
} from "../lib/repo";
import {
  isCardPayment,
  paymentMethodLabel,
  paymentStatusBadge,
} from "../lib/saleState";
import type { Payment } from "../lib/types";

/*
 * ÖDEME KAYITLARI — salt okunur defter
 *
 * Onay/reddet/kesinleştir eylemleri İşlem Merkezi'nde (/yonetim) yapılır;
 * burada kayıt geçmişi, filtreler ve denetim izi tutulur.
 */

export default function AdminPayments() {
  useLiveDataRevision();
  const actor = useActor();
  const paymentList = listPayments(actor).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const sales = listSales(actor);

  // Ödeme kayıtları filtreleri
  const [q, setQ] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | "kart" | "eft" | "manuel">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Payment["status"]>("all");

  const filteredPayments = paymentList.filter((payment) => {
    const sale = sales.find((row) => row.id === payment.saleId);
    const company = sale ? getCompanyById(sale.companyId) : undefined;

    if (statusFilter !== "all" && payment.status !== statusFilter) return false;

    if (methodFilter !== "all") {
      const isEft = payment.provider === "eft";
      const isManual = payment.provider === "hicbiri";
      const isCard = !isEft && !isManual;
      if (methodFilter === "eft" && !isEft) return false;
      if (methodFilter === "manuel" && !isManual) return false;
      if (methodFilter === "kart" && !isCard) return false;
    }

    if (q.trim()) {
      const haystack = `${company?.name ?? ""} ${payment.providerRef} ${payment.provider}`;
      if (
        !haystack
          .toLocaleLowerCase("tr")
          .replace(/İ/g, "i")
          .replace(/ı/g, "i")
          .includes(q.toLocaleLowerCase("tr").replace(/İ/g, "i").replace(/ı/g, "i"))
      )
        return false;
    }

    return true;
  });

  const paymentHasFilters = Boolean(q.trim() || methodFilter !== "all" || statusFilter !== "all");

  const recentPaymentAudit = listAudit(60)
    .filter((entry) => entry.action.startsWith("odeme_") || entry.action.startsWith("satis_"))
    .slice(0, 6);

  return (
    <div className="panel-content">
      <PanelHead title="Ödeme Kayıtları" />

      <div className="stats-grid mb-14">
        <StatCard
          icon={<Clock size={20} strokeWidth={1.9} />}
          label="Onay bekleyen"
          value={paymentList.filter((p) => p.status === "beklemede").length}
          tone={paymentList.some((p) => p.status === "beklemede") ? "warning" : undefined}
        />
        <StatCard
          icon={<CheckCircle2 size={20} strokeWidth={1.9} />}
          label="Onaylanan"
          value={paymentList.filter((p) => p.status === "onaylandi").length}
          tone="success"
        />
        <StatCard
          icon={<CreditCard size={20} strokeWidth={1.9} />}
          label="Kart doğrulaması bekleyen"
          value={paymentList.filter((p) => p.status === "beklemede" && isCardPayment(p)).length}
        />
        <StatCard
          icon={<XCircle size={20} strokeWidth={1.9} />}
          label="Reddedilen"
          value={paymentList.filter((p) => p.status === "hata").length}
        />
      </div>

      <div className="card card__pad mb-14" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Banknote size={16} strokeWidth={1.9} aria-hidden="true" />
        <span className="small">
          Ödeme onayı ve kesinleştirme İşlem Merkezi'nde yapılır; burada kayıtlar salt okunurdur.
        </span>
        <Link className="btn btn--sm btn--primary" to="/yonetim">
          İşlem Merkezi
        </Link>
      </div>

      <section>
        <div style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Kayıtlar</h2>

        </div>

        <div className="adm-filterbar">
          <div className="adm-filtergrid">
            <label className="adm-filter" style={{ gridColumn: "span 2" }}>
              <span>Firma veya sağlayıcı referansı</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Firma adı, sağlayıcı referansı…"
              />
            </label>
            <label className="adm-filter">
              <span>Yöntem</span>
              <select
                value={methodFilter}
                onChange={(e) =>
                  setMethodFilter(e.target.value as "all" | "kart" | "eft" | "manuel")
                }
              >
                <option value="all">Tüm yöntemler</option>
                <option value="kart">Kart</option>
                <option value="eft">EFT</option>
                <option value="manuel">Manuel</option>
              </select>
            </label>
            <label className="adm-filter">
              <span>Durum</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | Payment["status"])}
              >
                <option value="all">Tüm durumlar</option>
                <option value="beklemede">Beklemede</option>
                <option value="onaylandi">Onaylandı</option>
                <option value="hata">Reddedildi</option>
                <option value="iade">İade</option>
              </select>
            </label>
          </div>
          <div className="adm-filterbar__foot">
            <span>
              {filteredPayments.length} / {paymentList.length} kayıt gösteriliyor
            </span>
            <div className="adm-filterbar__actions">
              {paymentHasFilters && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    setQ("");
                    setMethodFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  <FilterX size={14} strokeWidth={1.9} aria-hidden="true" />
                  Filtreleri temizle
                </button>
              )}
            </div>
          </div>
        </div>

        {paymentList.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={30} strokeWidth={1.5} aria-hidden="true" />}
            title="Ödeme kaydı yok"
            description="İşlem Merkezi'nde bir satış için 'Ödeme kaydı aç' adımını kullanın."
          />
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={30} strokeWidth={1.5} aria-hidden="true" />}
            title="Eşleşen ödeme yok"
            description="Yöntem, durum veya arama filtresini değiştirin."
          />
        ) : (
          <div className="table-wrap table-wrap--cards">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Satış / firma</th>
                  <th>Tutar</th>
                  <th>Yöntem</th>
                  <th>Sağlayıcı referansı</th>
                  <th>Durum</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => {
                  const sale = sales.find((s) => s.id === p.saleId);
                  const company = sale ? getCompanyById(sale.companyId) : undefined;
                  const badge = paymentStatusBadge(p.status);

                  return (
                    <tr key={p.id}>
                      <td data-label="Satış / firma">
                        <FirmIdentity
                          name={company?.name ?? "Firma kaydı yok"}
                          href={company ? `/firma/${company.slug}` : undefined}
                          images={company?.images}
                          place={company?.district}
                          note={formatDateTime(p.createdAt)}
                        />
                      </td>
                      <td data-label="Tutar">{formatTRY(p.amount)}</td>
                      <td data-label="Yöntem" className="small">
                        {paymentMethodLabel(p)}
                      </td>
                      <td
                        data-label="Sağlayıcı referansı"
                        className="text-muted small"
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {p.providerRef}
                        {isPlaceholderPaymentRef(p.providerRef) && (
                          <div>Dahili bekleyen kayıt — sağlayıcı referansı henüz oluşmadı.</div>
                        )}
                      </td>
                      <td data-label="Durum">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td data-label="Not" className="text-muted small">
                        {p.status === "beklemede" ? (
                          isCardPayment(p) ? (
                            "Kart sağlayıcı doğrulaması bekleniyor; manuel onay verilemez."
                          ) : (
                            <Link to="/yonetim">İşlem Merkezi'nde onayla</Link>
                          )
                        ) : p.status === "onaylandi" ? (
                          `Doğrulandı: ${formatDateTime(p.updatedAt)}`
                        ) : p.status === "hata" ? (
                          "Reddedildi / başarısız — yeni kayıt açılmalı"
                        ) : (
                          "İade edildi"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="adm-panel" style={{ marginTop: 22 }}>
        <div className="adm-panel__head">
          <h2>
            <History size={16} strokeWidth={1.9} aria-hidden="true" /> Son ödeme ve satış denetim
            kayıtları
          </h2>
        </div>
        <div className="adm-panel__body">
          {recentPaymentAudit.length === 0 ? (
            <p className="text-muted small">Henüz ödeme veya satış denetim kaydı yok.</p>
          ) : (
            <div className="adm-list">
              {recentPaymentAudit.map((entry) => (
                <div className="adm-list__row" key={entry.id}>
                  <span className="adm-dot adm-dot--blue" aria-hidden="true" />
                  <span className="adm-list__main">
                    <span className="adm-list__title">{entry.summary}</span>
                    <span className="adm-list__meta">
                      {formatDateTime(entry.at)} · {entry.actorRole}
                    </span>
                  </span>
                  <Badge tone="blue">{auditActionLabels[entry.action] ?? entry.action}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
