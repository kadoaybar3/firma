import { useEffect } from "react";
import type { ReactNode } from "react";

/** SEO yardımcı: sayfa başlığını ve meta açıklamasını güncelleyen kanca */
export function useSEO(title: string, description?: string) {
  useEffect(() => {
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    if (description) meta?.setAttribute("content", description);
    return () => {
      meta?.removeAttribute("content");
    };
  }, [title, description]);
}

export function SEO({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  useSEO(title, description);
  return <>{children}</>;
}
