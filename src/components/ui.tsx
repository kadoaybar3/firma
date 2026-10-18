import type { ReactNode } from "react";
import { formatTRY } from "../lib/format";

/* Paylaşılan UI parçaları — public site ve paneller ortak kullanır. */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: string;
  tone?: "default" | "primary" | "success" | "warning";
}) {
  return (
    <div className={`stat-card stat-${tone}`}>
      {icon && <span className="stat-card__icon">{icon}</span>}
      <div>
        <div className="stat-card__value">{value}</div>
        <div className="stat-card__label">{label}</div>
        {hint && <div className="stat-card__hint">{hint}</div>}
      </div>
    </div>
  );
}

type BadgeTone = "gray" | "green" | "blue" | "orange" | "red";
const TONE_CLASS: Record<BadgeTone, string> = {
  gray: "badge-gray",
  green: "badge-green",
  blue: "badge-blue",
  orange: "badge-orange",
  red: "badge-red",
};

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return <span className={`badge ${TONE_CLASS[tone]}`}>{children}</span>;
}

export function EmptyState({
  icon = "🔍",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" role="img" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading__spinner" aria-hidden="true"></span>
      {label}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <span aria-hidden="true">⚠️</span> {message}
    </div>
  );
}

export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="info-banner" role="note">
      ⓘ {children}
    </div>
  );
}

export function MoneyLabel({ amount }: { amount: number }) {
  return <span>{formatTRY(amount)}</span>;
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {required && <em aria-hidden="true"> *</em>}
      </span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/** Denetim kaydı özeti satırı için okunur etiketler */
export const auditActionLabels: Record<string, string> = {
  firma_eklendi: "Firma eklendi",
  firma_guncellendi: "Firma güncellendi",
  firma_silindi: "Firma silindi",
  kategori_eklendi: "Kategori eklendi",
  kategori_silindi: "Kategori silindi",
  sehir_eklendi: "Şehir eklendi",
  ilce_eklendi: "İlçe eklendi",
  ilce_kaldirildi: "İlçe kaldırıldı",
  temsilci_eklendi: "Temsilci eklendi",
  temsilci_guncellendi: "Temsilci güncellendi",
  aday_eklendi: "Aday eklendi",
  aday_durum: "Aday durumu değişti",
  aday_silindi: "Aday silindi",
  ziyaret_eklendi: "Ziyaret kaydedildi",
  satis_acildi: "Satış kaydı açıldı",
  satis_kesinlesti: "Satış kesinleşti",
  satis_iptal: "Satış iptal edildi",
  odeme_kaydi_acildi: "Ödeme kaydı açıldı",
  odeme_dogrulandi: "Ödeme doğrulandı",
  komisyon_uretildi: "Komisyon üretildi",
  komisyon_odendi: "Komisyon ödendi",
  uyelik_yenilendi: "Üyelik yenilendi",
  yenileme_baslatti: "Yenileme süreci başlatıldı",
  referans_olusturuldu: "Referans kodu oluşturuldu",
  ayar_guncelle: "Ayarlar güncellendi",
};
