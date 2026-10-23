import { useState } from "react";
import { CreditCard, Database } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { ErrorBanner, MoneyLabel, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatTRY } from "../lib/format";
import { getSettings, resetDB, updateSettings } from "../lib/repo";
import { isSupabaseConfigured } from "../lib/supabase";
import { isPaymentProviderConfigured } from "../lib/payments";

export default function AdminSettings() {
  const actor = useActor();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <div className="panel-content">
      <PanelHead
        title="Ayarlar"
        desc="Üyelik bedeli ve komisyon/ödül kuralları. Tutarlar kaynak koda sabitlenmez; değişiklikler denetim kaydına yazılır."
      />
      {error && <ErrorBanner message={error} />}
      {saved && <div className="info-banner">Ayarlar güncellendi.</div>}

      <SettingsForm
        key="settings"
        onSubmit={(patch) => {
          setError(null);
          setSaved(false);
          try {
            updateSettings(patch, actor);
            setSaved(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Güncelleme başarısız.");
          }
        }}
      />

      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Örnek dağılım hesabı</h3>
        <table className="table" style={{ minWidth: 420, marginTop: 10 }}>
          <tbody>
            <tr>
              <td>Yıllık üyelik bedeli</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                <MoneyLabel amount={getSettings().membershipPrice} />
              </td>
            </tr>
            <tr>
              <td>− Satış temsilcisi komisyonu</td>
              <td style={{ textAlign: "right" }}>
                <MoneyLabel amount={getSettings().repCommission} />
              </td>
            </tr>
            <tr>
              <td>− Doğrudan referans ödülü</td>
              <td style={{ textAlign: "right" }}>
                <MoneyLabel amount={getSettings().referralReward} />
              </td>
            </tr>
            <tr>
              <td>= Platform payı (gider öncesi)</td>
              <td style={{ textAlign: "right", fontWeight: 800, color: "var(--success)" }}>
                <MoneyLabel
                  amount={getSettings().membershipPrice - getSettings().repCommission - getSettings().referralReward}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Entegrasyon durumu</h3>
        <div className="stats-grid mt-14">
          <StatCard
            icon={<Database size={20} strokeWidth={1.9} />}
            label="Veritabanı (Supabase)"
            value={isSupabaseConfigured ? "Yapılandırıldı" : "Yapılandırılmadı"}
            tone={isSupabaseConfigured ? "success" : "warning"}
            hint={isSupabaseConfigured ? "Şema migration'ları hazır" : "Demo mod: veriler tarayıcıda"}
          />
          <StatCard
            icon={<CreditCard size={20} strokeWidth={1.9} />}
            label="Ödeme sağlayıcısı"
            value={isPaymentProviderConfigured ? "Etkin" : "Yapılandırılmadı"}
            tone={isPaymentProviderConfigured ? "success" : "warning"}
            hint="Gerçek ödeme akışı sağlayıcı üzerinden kurulacak"
          />
        </div>
      </div>

      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Demo verileri</h3>
        <p className="text-muted small">
          Demo moddaki örnek verileri App seed durumuna sıfırlayabilirsiniz (panel denetim kaydı
          dahil tümü yeniden başlar).
        </p>
        <button
          className="btn btn--danger"
          onClick={() => {
            if (confirm("Tüm demo veriler örneğe sıfırlanacak. Emin misiniz?")) {
              resetDB();
              location.reload();
            }
          }}
        >
          Demo verilerini sıfırla
        </button>
      </div>
    </div>
  );
}

function SettingsForm({
  onSubmit,
}: {
  onSubmit: (patch: {
    membershipPrice: number;
    repCommission: number;
    referralReward: number;
    renewalCommission: number;
  }) => void;
}) {
  const s = getSettings();
  const [price, setPrice] = useState(s.membershipPrice);
  const [commission, setCommission] = useState(s.repCommission);
  const [reward, setReward] = useState(s.referralReward);
  const [renewal, setRenewal] = useState(s.renewalCommission);

  const priceN = Number(price) || 0;
  const commissionN = Number(commission) || 0;
  const rewardN = Number(reward) || 0;
  const share = priceN - commissionN - rewardN;
  void formatTRY;

  return (
    <div className="card card__pad">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            membershipPrice: priceN,
            repCommission: commissionN,
            referralReward: rewardN,
            renewalCommission: Number(renewal) || 0,
          });
        }}
      >
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Yıllık üyelik bedeli (TL)</span>
            <input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            <span className="field__hint">Örnek: 1.000 TL</span>
          </label>
          <label className="field">
            <span className="field__label">Satış temsilcisi komisyonu (TL)</span>
            <input type="number" min={0} value={commission} onChange={(e) => setCommission(Number(e.target.value))} />
            <span className="field__hint">Örnek: 600 TL</span>
          </label>
          <label className="field">
            <span className="field__label">Doğrudan referans ödülü (TL)</span>
            <input type="number" min={0} value={reward} onChange={(e) => setReward(Number(e.target.value))} />
            <span className="field__hint">Örnek: 100 TL</span>
          </label>
          <label className="field">
            <span className="field__label">Yenileme komisyonu (TL)</span>
            <input type="number" min={0} value={renewal} onChange={(e) => setRenewal(Number(e.target.value))} />
            <span className="field__hint">Yenilemede ilk satış yapan temsilciye bağlanır</span>
          </label>
        </div>
        {share < 0 ? (
          <div className="error-banner">Platform payı negatif olamaz; komisyon + ödül ücreti aşamaz.</div>
        ) : null}
        <div className="form-row">
          <button className="btn btn--primary" type="submit" disabled={share < 0}>
            Ayarları kaydet
          </button>
          <span className="text-muted small">
            Platform payı: <strong>{formatTRY(Math.max(0, share))}</strong>
          </span>
        </div>
      </form>
    </div>
  );
}
