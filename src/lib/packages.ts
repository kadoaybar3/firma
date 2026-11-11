import type { Settings } from "./types";

export type PackageKey = "normal" | "featured";

export interface MembershipPackage {
  key: PackageKey;
  label: string;
  amount: number;
}

/** İki paket de ayar fiyatına bağlıdır; temsilci fiyat giremez/değiştiremez. */
export function membershipPackages(settings: Settings): MembershipPackage[] {
  return [
    { key: "normal", label: "Normal Paket", amount: settings.membershipPrice },
    { key: "featured", label: "Öne Çıkan Paket", amount: settings.membershipPrice * 2 },
  ];
}

export function packageAmount(settings: Settings, key: PackageKey): number {
  const hit = membershipPackages(settings).find((p) => p.key === key);
  if (!hit) throw new Error("Geçersiz paket seçimi.");
  return hit.amount;
}

export function isValidPackageAmount(amount: number, settings: Settings): boolean {
  return membershipPackages(settings).some((p) => p.amount === amount);
}
