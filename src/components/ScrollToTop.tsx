import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Rota değişiminde sayfayı en üste alır.
 *
 * - PUSH / REPLACE: yeni sayfa her zaman üstten açılır. Ana sayfada aşağı
 *   kaydırıp bir firmaya tıklanınca detay sayfası ortadan başlamaz; farklı
 *   firma detayları arasında geçerken de (pathname değiştiği için) üste döner.
 * - POP (tarayıcı geri/ileri): karışmayız; tarayıcının kendi geri yükleme
 *   davranışı korunur.
 * - Yalnızca arama parametresi değiştiğinde (ör. /firmalar?q=…) kaydırma
 *   sıfırlanmaz; filtre yazarken sayfa yerinde kalır.
 *
 * Lazy route'lar Suspense sonrasında çizildiği için ilk kareye ek olarak bir
 * sonraki karede de üstte olunduğu doğrulanır (içerik yüksekliği değişse de
 * scroll konumu 0'da kalır).
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    if (typeof window === "undefined") return;

    const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    toTop();
    const frame = window.requestAnimationFrame(toTop);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, navigationType]);

  return null;
}
