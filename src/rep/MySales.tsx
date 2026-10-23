import { Receipt, Wallet, BadgeCheck, Banknote } from "lucide-react";
import { Link } from "react-router-dom";
import { PanelHead } from "../admin/AdminLayout";
import { Badge, EmptyState, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { getCompanyById, listCommissions, listPayments, listSales } from "../lib/repo";
import { formatDateTime, formatTRY } from "../lib/format";
import type { SaleStatus } from "../lib/types";

const SALE_STATUS: Record<SaleStatus, { label: string; tone: "green" | "orange" | "red" }> = {
  odendi: { label: "Kesinleşti", tone: "green" },
  potansiyel: { label: "Beklemede", tone: "orange" },
  iptal: { label: "İptal", tone: "red" },
};

/**
 * Çalışan — Satışlarım. Yalnızca kendi satışları (repo actor.repId ile filtreler);
 * yönetici finansal ayarları bu ekranda yer almaz.
 */
export default function RepMySales() {
  const actor = useActor();
  const sales = listSales(actor);
  const payments = listPayments(actor);
  const commissions = listCommissions(actor);

  const confirmed = sales.filter((s) => s.status === "odendi");
  const pendingCommission = commissions
    .filter((c) => c.com.status !== "odendi")
    .reduce((sum, c) => sum + c.com.amount, 0);
  const paidCommission = commissions
    .filter((c) => c.com.status === "odendi")
    .reduce((sum, c) => sum + c.com.amount, 0);

  return (
    <div className="panel-content">
      <PanelHead
        title="Satışlarım"
        desc="Yalnızca kendi satış ve komisyon kayıtlarınız. Ödeme ve komisyon durumu yönetici tarafından güncellenir."
        action={
          <Link className="btn btn--primary" to="/temsilci/uyelik">
            <Wallet size={16} strokeWidth={2} aria-hidden="true" />
            Yeni üyelik satışı
          </Link>
        }
      />

      <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 14 }}>
        <StatCard icon={<Receipt size={20} strokeWidth={1.9} />} label="Açtığım satış" value={sales.length} hint={`${confirmed.length} kesinleşti`} />
        <StatCard icon={<BadgeCheck size={20} strokeWidth={1.9} />} label="Kesinleşen satış" value={confirmed.length} tone="success" hint={formatTRY(confirmed.reduce((s, x) => s + x.amount, 0))} />
        <StatCard icon={<Banknote size={20} strokeWidth={1.9} />} label="Bekleyen komisyon" value={formatTRY(pendingCommission)} tone="warning" hint="Ödeme onayı bekliyor" />
        <StatCard icon={<Wallet size={20} strokeWidth={1.9} />} label="Ödenmiş kazanç" value={formatTRY(paidCommission)} tone="primary" hint="Hesaba geçen komisyon" />
      </div>

      {sales.length === 0 ? (
        <div style={{ marginTop: 18 }}>
          <EmptyState
            icon={<Receipt size={30} strokeWidth={1.5} aria-hidden="true" />}
            title="Henüz satış kaydınız yok"
            description="Üyelik Satışı ekranından firma seçip ilk satış kaydınızı açabilirsiniz."
          />
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Firma</th>
                <th>Tarih</th>
                <th>Tutar</th>
                <th>Satış</th>
                <th>Ödeme</th>
                <th>Komisyon</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const company = getCompanyById(sale.companyId);
                const payment = payments.find((p) => p.saleId === sale.id);
                const commission = commissions.find((c) => c.com.saleId === sale.id);
                const st = SALE_STATUS[sale.status];
                return (
                  <tr key={sale.id}>
                    <td>
                      <strong>{company?.name ?? "—"}</strong>
                      <div className="text-muted small">{company?.district ?? ""}</div>
                    </td>
                    <td className="small text-muted">{formatDateTime(sale.createdAt)}</td>
                    <td><strong>{formatTRY(sale.amount)}</strong></td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td>
                      <Badge tone={payment?.status === "onaylandi" ? "green" : "orange"}>
                        {payment?.status === "onaylandi"
                          ? "Doğrulandı"
                          : payment
                            ? "Doğrulama bekliyor"
                            : "Ödeme kaydı yok"}
                      </Badge>
                    </td>
                    <td className="small">
                      {commission ? (
                        <>
                          <strong>{formatTRY(commission.com.amount)}</strong>
                          <div className="text-muted">{commission.com.status === "odendi" ? "Ödendi" : "Bekliyor"}</div>
                        </>
                      ) : (
                        <span className="text-muted">Ödeme onayı sonrası oluşur</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
