import { useEffect, useState } from "react";
import { flushNow, onSyncStateChange } from "./dataSource";

/**
 * Supabase modunda son yazım-kuyruğu hatasını yakalar; hata varken gösterilir.
 * "Veri kaydetme başarısızlıklarını sessizce yutma" ilkesinin arayüz yüzü:
 * admin/temsilci panelinin tepesinde net bir kalıcı uyarı olarak görünür ve
 * kullanıcı tek dokunuşla tekrar deneyebilir. Demo modda hiçbir şey göstermez.
 */
export function useSyncError(): string | null {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onSyncStateChange(setError), []);
  return error;
}

/** Son başarısız farkı anında yeniden göndermeyi dener. */
export function retrySync(): Promise<void> {
  return flushNow();
}
