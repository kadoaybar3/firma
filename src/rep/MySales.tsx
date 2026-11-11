import { Link } from "react-router-dom";
import { BadgeCheck, Banknote, Building2, Receipt, Wallet } from "lucide-react";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import {
  getCompanyById,
  listCommissionPayouts,
  listCommissionPayoutSummary,
  listCommissions,
  listPayments,
  listSales,
} from "../lib/repo";
import type { PaymentStatus, SaleStatus } from "../lib/types";

const SALE_STATUS: Record<SaleStatus, { label: string; tone: string }> = {
  odendi: { label: "Kesinleşti", tone: "rep-badge--green" },
  potansiyel: { label: "Onay bekliyor", tone: "rep-badge--amber" },
  iptal: { label: "İptal", tone: "rep-badge--red" },
};

const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  onaylandi: { label: "Ödeme doğrulandı", tone: "rep-badge--green" },
  beklemede: { label: "Ödeme bekliyor", tone: "rep-badge--amber" },
  hata: { label: "Ödeme başarısız", tone: "rep-badge--red" },
  iade: { label: "İade edildi", tone: "rep-badge--gray" },
};

/**
 * Satışlarım — yalnızca oturumdaki temsilcinin kayıtları.
 * Filtreleme repo katmanında `actor.repId` ile yapılır; başka temsilcinin
 * satış/ödeme/komisyon satırı bu ekrana hiç gelmez.
 */
export default function RepMySales() {
  const actor = useActor();
  const sales = listSales(actor);
  const payments = listPayments(actor);
  const commissions = listCommissions(actor);
  const payouts = listCommissionPayouts(actor);
  const commissionSummary = listCommissionPayoutSummary(actor)[0];

  const confirmed = sales.filter((s) => s.status === "odendi");
  const confirmedTotal = confirmed.reduce((sum, s) => sum + s.amount, 0);
  const pendingCommission = commissionSummary?.outstanding ?? 0;
  const paidCommission = commissionSummary?.paid ?? 0;

  return (
    <div className="rep-stack">
      <div className="rep-pagehead">
        <h1>Satışlarım</h1>
        <p>
          Yalnızca kendi satış, komisyon ve temsilci ödeme kayıtlarınız görüntülenir. Komisyon
          ödemeleri yönetici tarafından kaydedilir.
        </p>
      </div>

      <section className="rep-stats" aria-label="Satış özeti">
        <div className="rep-stat">
          <span className="rep-stat__icon" aria-hidden="true">
            <Receipt size={18} strokeWidth={2} />
          </span>
          <span className="rep-stat__label">Satış kaydı</span>
          <span className="rep-stat__value">{sales.length}</span>
          <span className="rep-stat__hint">{confirmed.length} kesinleşti</span>
        </div>

        <div className="rep-stat">
          <span className="rep-stat__icon rep-stat__icon--green" aria-hidden="true">
            <BadgeCheck size={18} strokeWidth={2} />
          </span>
          <span className="rep-stat__label">Kesinleşen tutar</span>
          <span className="rep-stat__value">{formatTRY(confirmedTotal)}</span>
          <span className="rep-stat__hint">Ödemesi doğrulanan satışlar</span>
        </div>

        <div className="rep-stat">
          <span className="rep-stat__icon rep-stat__icon--amber" aria-hidden="true">
            <Banknote size={18} strokeWidth={2} />
          </span>
          <span className="rep-stat__label">Kalan komisyon</span>
          <span className="rep-stat__value">{formatTRY(pendingCommission)}</span>
          <span className="rep-stat__hint">Henüz ödenmemiş tutar</span>
        </div>

        <div className="rep-stat">
          <span className="rep-stat__icon rep-stat__icon--slate" aria-hidden="true">
            <Wallet size={18} strokeWidth={2} />
          </span>
          <span className="rep-stat__label">Ödenmiş kazanç</span>
          <span className="rep-stat__value">{formatTRY(paidCommission)}</span>
          <span className="rep-stat__hint">Hesabınıza geçen komisyon</span>
        </div>
      </section>

      <section className="rep-card">
        <div className="rep-card__head"><h2>Ödeme geçmişi</h2></div>
        {payouts.length === 0 ? (
          <p className="text-muted small">Henüz ödeme kaydı yok.</p>
        ) : (
          <ul className="rep-list">
            {payouts.map((payout) => (
              <li key={payout.id}>
                <div className="rep-row">
                  <span className="rep-row__main">
                    <strong>{formatDateTime(payout.paidAt)}</strong>
                    <span>{payout.referenceNo ? `Banka referans no: ${payout.referenceNo}` : "Banka referans no girilmedi"}</span>
                  </span>
                  <span className="rep-row__amount">{formatTRY(payout.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sales.length === 0 ? (
        <section className="rep-card">
          <div className="rep-empty">
            <span className="rep-empty__icon" aria-hidden="true">
              <Building2 size={24} strokeWidth={1.8} />
            </span>
            <strong>Henüz satış kaydınız yok</strong>
            <p>
              Yeni firma taslağı oluşturup ödeme/onay sürecini tamamladığınızda satış kaydı
              burada görünür.
            </p>
            <Link className="rep-btn rep-btn--primary rep-btn--sm" to="/temsilci/yeni">
              Yeni firma ekle
            </Link>
          </div>
        </section>
      ) : (
        <div className="rep-grid">
          {sales.map((sale) => {
            const company = getCompanyById(sale.companyId);
            const payment = payments.find((p) => p.saleId === sale.id);
            const commission = commissions.find(({ com }) => com.saleId === sale.id);
            const saleStatus = SALE_STATUS[sale.status];

            return (
              <article key={sale.id} className="rep-card rep-draft">
                <div className="rep-draft__top">
                  <div className="rep-draft__title">
                    <strong title={company?.name ?? "Firma"}>
                      {company?.name ?? "Firma kaydı"}
                    </strong>
                    <span>{formatDateTime(sale.createdAt)}</span>
                  </div>
                  <span className={`rep-badge ${saleStatus.tone}`}>{saleStatus.label}</span>
                </div>

                <div className="rep-draft__meta">
                  {company?.district && <span>{company.district}</span>}
                  <span>Satış tutarı: {formatTRY(sale.amount)}</span>
                </div>

                <ul className="rep-list">
                  <li>
                    <div className="rep-row">
                      <span className="rep-row__main">
                        <strong>Ödeme durumu</strong>
                        <span>{payment ? formatDateTime(payment.updatedAt) : "Kayıt yok"}</span>
                      </span>
                      <span className="rep-row__side">
                        {payment ? (
                          <span className={`rep-badge ${PAYMENT_STATUS[payment.status].tone}`}>
                            {PAYMENT_STATUS[payment.status].label}
                          </span>
                        ) : (
                          <span className="rep-badge rep-badge--gray">Ödeme yok</span>
                        )}
                      </span>
                    </div>
                  </li>
                  <li>
                    <div className="rep-row">
                      <span className="rep-row__main">
                        <strong>Yönetici onayı</strong>
                        <span>Satışın kesinleşme durumu</span>
                      </span>
                      <span className="rep-row__side">
                        <span className={`rep-badge ${saleStatus.tone}`}>{saleStatus.label}</span>
                      </span>
                    </div>
                  </li>
                  <li>
                    <div className="rep-row">
                      <span className="rep-row__main">
                        <strong>Komisyon</strong>
                        <span>
                          {commission
                            ? "Komisyon kaydı oluşturuldu"
                            : "Ödeme onayı sonrası oluşur"}
                        </span>
                      </span>
                      <span className="rep-row__amount">
                        {commission ? formatTRY(commission.com.amount) : "—"}
                      </span>
                    </div>
                  </li>
                </ul>
              </article>
            );
          })}
        </div>
      )}

      <div className="rep-note">
        <Building2 size={16} strokeWidth={1.9} aria-hidden="true" />
        <span>
          Başka temsilcilerin satışları, komisyonları ve ödeme kayıtları bu ekranda hiçbir
          koşulda gösterilmez.
        </span>
      </div>
    </div>
  );
}
