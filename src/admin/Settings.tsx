import { useState } from "react";
import { CreditCard, Database } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { ErrorBanner, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import {
  getSettings,
  listCompanies,
  listEngagementCounters,
  listEngagementNotifications,
  resetDB,
  updateSettings,
} from "../lib/repo";
import { ENGAGEMENT_KINDS, ENGAGEMENT_LABELS } from "../lib/engagement";
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
        desc="Üyelik bedeli, komisyon ve ödül tutarları. Değişiklikler denetim kaydına yazılır."
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

      <EngagementSection />

      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Entegrasyon durumu</h3>
        <div className="stats-grid mt-14 settings-integrations">
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
  const commissionMoney = Math.round((priceN * commissionN) / 100);
  const share = priceN - commissionMoney - rewardN;

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
            <span className="field__label">Satış temsilcisi komisyon oranı (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
            />
            <span className="field__hint">Örnek: 50 → 1.000 TL'lik satışta 500 TL</span>
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

/**
 * ETKİLEŞİM SAYAÇLARI VE İKİ KADEMELİ BİLDİRİM AYARLARI
 *
 * 1. kademe: her N etkileşimde bir bildirim (sabit aralık).
 * 2. kademe: başlangıç eşiğinin 2'nin kuvveti katlarında bildirim (katlanan).
 * Kademeler birbirinden bağımsız açılıp kapatılır; iki kademe aynı sayımda
 * tetiklenirse tek bildirim yazılır (bkz. lib/engagement.ts ve 0018 RPC).
 */
function EngagementSection() {
  const actor = useActor();
  const settings = getSettings();
  const [enabled, setEnabled] = useState(settings.engagementEnabled);
  const [tier1, setTier1] = useState(settings.engagementTier1Enabled);
  const [every, setEvery] = useState(settings.engagementTier1Interval);
  const [tier2, setTier2] = useState(settings.engagementTier2Enabled);
  const [startAt, setStartAt] = useState(settings.engagementTier2Start);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const everyN = Math.max(1, Math.floor(Number(every) || 1));
  const startN = Math.max(1, Math.floor(Number(startAt) || 1));
  const tier1Preview = Array.from({ length: 3 }, (_, i) => (i + 1) * everyN);
  const tier2Preview = Array.from({ length: 4 }, (_, i) => startN * 2 ** i);
  const formatNumber = (value: number) => value.toLocaleString("tr-TR");

  /** Tablo başlıklarında uzun etiketler yerine kısa adlar (mobilde 7 sütun okunsun). */
  const kindShort: Record<string, string> = {
    profil: "Profil",
    telefon: "Telefon",
    whatsapp: "WhatsApp",
    yol: "Yol tarifi",
    instagram: "Instagram",
    web: "Web",
  };

  const companies = listCompanies({ includeUnpublished: true });
  const allCounters = listEngagementCounters();
  const counterRows = companies
    .map((company) => ({
      company,
      counters: allCounters.filter((counter) => counter.companyId === company.id),
    }))
    .filter((row) => row.counters.length > 0);
  const notifications = listEngagementNotifications(12);
  const companyName = (id: string) =>
    companies.find((company) => company.id === id)?.name ?? "Silinmiş firma";

  return (
    <>
      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Ziyaret ve etkileşim bildirimleri</h3>
        <p className="text-muted small">
          Firma profillerindeki gerçek görüntülenme ve tıklamalar her firma için ayrı sayılır. Eşik
          aşıldığında tek bir bildirim oluşur; aynı sayım için ikinci bildirim üretilmez. Sayım
          yalnız yayındaki firmalarda işler.
        </p>

        {error && <ErrorBanner message={error} />}
        {saved && <div className="info-banner">Etkileşim ayarları güncellendi.</div>}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setSaved(false);
            try {
              updateSettings(
                {
                  engagementEnabled: enabled,
                  engagementTier1Enabled: tier1,
                  engagementTier1Interval: everyN,
                  engagementTier2Enabled: tier2,
                  engagementTier2Start: startN,
                },
                actor,
              );
              setSaved(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Güncelleme başarısız.");
            }
          }}
        >
          <div className="mt-14" style={{ maxWidth: 620 }}>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>
                <strong>Sistem genel durumu</strong>
                <span className="field__hint">
                  Kapalıyken sayaçlar artmaya devam eder, eşik bildirimi üretilmez.
                </span>
              </span>
            </label>
          </div>

          <div className="form-grid mt-14">
            <div>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={tier1}
                  onChange={(e) => setTier1(e.target.checked)}
                />
                <span>
                  <strong>1. kademe — sabit aralık</strong>
                  <span className="field__hint">Her N etkileşimde bir bildirim.</span>
                </span>
              </label>
              <div className="field" style={{ marginTop: 10 }}>
                <span className="field__label">Bildirim aralığı (etkileşim)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={every}
                  disabled={!tier1}
                  onChange={(e) => setEvery(Number(e.target.value))}
                  aria-label="Sabit aralık (etkileşim sayısı)"
                />
                <span className="field__hint">
                  {tier1Preview.map(formatNumber).join(" · ")} …
                </span>
              </div>
            </div>

            <div>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={tier2}
                  onChange={(e) => setTier2(e.target.checked)}
                />
                <span>
                  <strong>2. kademe — katlanan eşik</strong>
                  <span className="field__hint">Her bildirimden sonra eşik iki katına çıkar.</span>
                </span>
              </label>
              <div className="field" style={{ marginTop: 10 }}>
                <span className="field__label">Başlangıç eşiği (etkileşim)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={startAt}
                  disabled={!tier2}
                  onChange={(e) => setStartAt(Number(e.target.value))}
                  aria-label="Katlanan eşik başlangıcı"
                />
                <span className="field__hint">
                  Sonraki eşikler: {tier2Preview.map(formatNumber).join(" → ")}
                </span>
              </div>
            </div>
          </div>

          <div className="form-row">
            <button className="btn btn--primary" type="submit">
              Etkileşim ayarlarını kaydet
            </button>
            <span className="text-muted small">
              İki kademe birbirinden bağımsızdır; aynı sayımda tetiklenirlerse tek bildirim yazılır.
            </span>
          </div>
        </form>
      </div>

      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Firma etkileşim sayaçları</h3>
        <p className="text-muted small">
          Yalnız gerçek ziyaret ve tıklamalar sayılır; firma bazında ve tür bazında bağımsızdır.
        </p>
        {counterRows.length === 0 ? (
          <p className="text-muted small mt-14">Henüz sayılmış etkileşim yok.</p>
        ) : (
          <div className="table-wrap mt-14">
            <table className="table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Firma</th>
                  {ENGAGEMENT_KINDS.map((kind) => (
                    <th key={kind}>{kindShort[kind]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {counterRows.map(({ company, counters }) => (
                  <tr key={company.id}>
                    <td>
                      <strong>{company.name}</strong>
                      {!company.published && <span className="text-muted small"> · yayında değil</span>}
                    </td>
                    {ENGAGEMENT_KINDS.map((kind) => {
                      const count = counters.find((counter) => counter.kind === kind)?.count ?? 0;
                      return (
                        <td key={kind} style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatNumber(count)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>
          Son eşik bildirimleri{notifications.length > 0 ? ` (${notifications.length})` : ""}
        </h3>
        <p className="text-muted small">
          Her firma için ayrı tutulur; aynı firma + tür + sayaç değeri tek satırdır.
        </p>
        {notifications.length === 0 ? (
          <p className="text-muted small mt-14">Henüz eşik aşılmadı.</p>
        ) : (
          <div className="table-wrap mt-14">
            <table className="table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Etkileşim</th>
                  <th>Sayaç</th>
                  <th>Kademe</th>
                  <th>Tarih</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((notification) => (
                  <tr key={notification.id}>
                    <td>
                      <strong>{companyName(notification.companyId)}</strong>
                    </td>
                    <td>{ENGAGEMENT_LABELS[notification.kind]}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatNumber(notification.count)}
                    </td>
                    <td>
                      {notification.tier === 2
                        ? notification.tier1Also
                          ? "Katlanan + sabit aralık"
                          : "Katlanan eşik"
                        : "Sabit aralık"}
                    </td>
                    <td>{formatDateTime(notification.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
