import { useEffect, useState } from "react";

/**
 * Verilen medya sorgusunu canlı olarak izler.
 *
 * Açılır seçim standartı: mobil (≤760px) açılır seçimler işletim sisteminin
 * doğal native `<select>` menüsüyle açılır; masaüstünde özel panel korunur.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Açılır seçimlerin native açılması gerektiği mobil eşik (proje standardı). */
export const MOBILE_SELECT_QUERY = "(max-width: 760px)";
