import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  MessageCircle,
  MousePointerClick,
  Phone,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { formatDateTime } from "../lib/format";
import { listCompanies, listEngagementCounters } from "../lib/repo";
import { ENGAGEMENT_KINDS } from "../lib/engagement";
import type { EngagementKind } from "../lib/types";

/*
 * DİJİTAL GÖRÜNÜRLÜK — İşlem Merkezi karşılamasının altındaki özet şerit
 *
 * Veri yalnız mevcut 0018 sayaç tablosundan (`listEngagementCounters`) ve
 * firma adları için `listCompanies` üzerinden okunur. Sayaçlar firma + tür
 * başına BİRİKİMLİ toplam tutar; olay geçmişi saklanmadığı için günlük ya da
 * haftalık büyüme grafiği bu bölümde de üretilmez.
 *
 * Panel `useAdminLiveUpdates` + `emitLiveDataChanged` ile yenilenen repo
 * belleğini okur; "Yenile" düğmesi aynı okumayı isteğe bağlı olarak tekrar
 * çalıştırır (yeni bir veri yolu veya RPC eklenmez).
 */

const numberFormat = new Intl.NumberFormat("tr-TR");

interface TopRow {
  id: string;
  name: string;
  visits: number;
  total: number;
}

function emptyTotals(): Record<EngagementKind, number> {
  const totals = {} as Record<EngagementKind, number>;
  for (const kind of ENGAGEMENT_KINDS) totals[kind] = 0;
  return totals;
}

export default function DigitalVisibility() {
  const [, setTick] = useState(0);

  const counters = listEngagementCounters();
  const companies = listCompanies({ includeUnpublished: true });

  const totals = emptyTotals();
  const perCompany = new Map<string, { visits: number; total: number }>();
  for (const counter of counters) {
    totals[counter.kind] += counter.count;
    let entry = perCompany.get(counter.companyId);
    if (!entry) {
      entry = { visits: 0, total: 0 };
      perCompany.set(counter.companyId, entry);
    }
    entry.total += counter.count;
    if (counter.kind === "profil") entry.visits += counter.count;
  }

  const nameById = new Map(companies.map((company) => [company.id, company.name]));

  const top: TopRow[] = [];
  for (const [companyId, entry] of perCompany) {
    if (entry.visits <= 0) continue;
    top.push({
      id: companyId,
      name: nameById.get(companyId) ?? "Firma kaydı yok",
      visits: entry.visits,
      total: entry.total,
    });
  }
  top.sort((a, b) => b.visits - a.visits || b.total - a.total || a.name.localeCompare(b.name, "tr"));
  const leaders = top.slice(0, 5);
  const peak = leaders[0]?.visits ?? 0;

  const visitTotal = totals.profil;
  const interactionTotal = counters.reduce((sum, counter) => sum + counter.count, 0);
  const lastUpdated = counters.reduce<string | null>(
    (latest, counter) => (!latest || counter.updatedAt > latest ? counter.updatedAt : latest),
    null,
  );
  const share = (value: number) =>
    interactionTotal > 0 ? Math.round((value / interactionTotal) * 100) : 0;

  return (
    <section className="dv" aria-labelledby="dv-title">
      <header className="dv__head">
        <div className="dv__intro">
          <p className="dv__eyebrow">
            <TrendingUp size={13} strokeWidth={2.2} aria-hidden="true" />
            Dijital Görünürlük
          </p>
          <h2 id="dv-title" className="dv__title">
            Firmalarınız ne kadar görünüyor?
          </h2>
          <p className="dv__lead">
            Profil görüntülenmeleri ve iletişim tıklamaları; yayındaki firmalardan gelen gerçek
            sayımlar.
          </p>
        </div>
        <div className="dv__head-actions">
          <button
            type="button"
            className="dv__refresh"
            onClick={() => setTick((tick) => tick + 1)}
            title="Sayaçları yeniden oku"
          >
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            Yenile
          </button>
          <Link className="dv__all" to="/yonetim/etkilesimler">
            Tümünü Gör
            <ArrowRight size={14} strokeWidth={2.1} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="dv__body">
        {/* ---------- Sol: iki ana figür + telefon/WhatsApp ---------- */}
        <div className="dv__figures">
          <div className="dv__figure-row">
            <div className="dv__figure">
              <span className="dv__figure-icon">
                <Eye size={17} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="dv__figure-body">
                <span className="dv__figure-label">Toplam profil ziyareti</span>
                <span className="dv__figure-value">{numberFormat.format(visitTotal)}</span>
                <span className="dv__figure-sub">
                  {top.length > 0
                    ? `${numberFormat.format(top.length)} firmada ziyaret sayımı var`
                    : "Henüz ziyaret sayımı yok"}
                </span>
              </span>
            </div>

            <div className="dv__figure dv__figure--accent">
              <span className="dv__figure-icon">
                <MousePointerClick size={17} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="dv__figure-body">
                <span className="dv__figure-label">Toplam etkileşim</span>
                <span className="dv__figure-value">{numberFormat.format(interactionTotal)}</span>
                <span className="dv__figure-sub">Ziyaret ve tüm iletişim tıklamaları</span>
              </span>
            </div>
          </div>

          <div className="dv__contacts" aria-label="Telefon ve WhatsApp etkileşimleri">
            <div className="dv__contact">
              <span className="dv__contact-icon dv__contact-icon--phone">
                <Phone size={14} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="dv__contact-text">
                <span className="dv__contact-label">Telefon</span>
                <span className="dv__contact-value">{numberFormat.format(totals.telefon)}</span>
              </span>
              <span className="dv__contact-share" aria-label={`Etkileşimlerin yüzde ${share(totals.telefon)}`}>
                %{share(totals.telefon)}
              </span>
            </div>
            <div className="dv__contact">
              <span className="dv__contact-icon dv__contact-icon--whatsapp">
                <MessageCircle size={14} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="dv__contact-text">
                <span className="dv__contact-label">WhatsApp</span>
                <span className="dv__contact-value">{numberFormat.format(totals.whatsapp)}</span>
              </span>
              <span
                className="dv__contact-share"
                aria-label={`Etkileşimlerin yüzde ${share(totals.whatsapp)}`}
              >
                %{share(totals.whatsapp)}
              </span>
            </div>
          </div>
        </div>

        {/* ---------- Sağ: en çok ziyaret edilen ilk 5 ---------- */}
        <div className="dv__top">
          <h3 className="dv__top-title">
            En çok ziyaret edilen
            <span>İlk 5 firma</span>
          </h3>

          {leaders.length === 0 ? (
            <div className="dv__empty">
              <Eye size={22} strokeWidth={1.5} aria-hidden="true" />
              <p>
                <strong>Henüz sayılmış ziyaret yok.</strong> Yayındaki firma profilleri
                görüntülendikçe burada ilk beş firma ve ziyaret çubukları oluşur.
              </p>
            </div>
          ) : (
            <ol className="dv__list">
              {leaders.map((row, index) => {
                const width = peak > 0 ? Math.max(6, Math.round((row.visits / peak) * 100)) : 0;
                return (
                  <li key={row.id} className="dv__row">
                    <span className="dv__rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="dv__row-body">
                      <span className="dv__row-line">
                        <Link className="dv__row-name" to="/yonetim/etkilesimler">
                          {row.name}
                        </Link>
                        <span className="dv__row-count">
                          {numberFormat.format(row.visits)}
                          <em>ziyaret</em>
                        </span>
                      </span>
                      <span className="dv__track" aria-hidden="true">
                        <span className="dv__fill" style={{ width: `${width}%` }} />
                      </span>
                      <span className="dv__row-meta">
                        {numberFormat.format(row.total)} etkileşim
                        {index === 0 ? " · en yüksek" : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <p className="dv__note">
        Sayaçlar firma ve tür başına birikimli toplamdır; olay geçmişi tutulmadığı için günlük ya da
        haftalık büyüme grafiği gösterilmez.
        {lastUpdated ? <> Son güncelleme: {formatDateTime(lastUpdated)}.</> : null}
      </p>
    </section>
  );
}
