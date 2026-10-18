import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * Uygulama çapında hata sınırı.
 *
 * İki ayrı senaryo yönetilir:
 *  1) Chunk yükleme hatası — deploy sonrası kullanıcının tarayıcısındaki eski
 *     index.html artık olmayan hash'li chunk'ı istediğinde oluşur. React.lazy
 *     reddedilen import sonucunu önbelleğe aldığı için "tekrar dene" ile aynı
 *     modül yeniden fetch edilmez; güvenilir çözüm tam sayfa yenilemesidir
 *     (taze index.html → taze chunk adları). Bu yüzden birincil eylem reload.
 *  2) Render hatası — modül zaten yüklüyse boundary state sıfırlanarak
 *     çocuklar yeniden denenir (yatay yönlendirme + ana sayfa seçenekleri).
 */

/** Bilinen tüm çevirilerde chunk/geo-modül yükleme hatasını tanır. */
export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === "ChunkLoadError") return true;
  const msg = `${e.message ?? ""}`;
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Loading chunk")
  );
}

type BoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kullanıcı akışını bozmadan tanılama için tarayıcı konsoluna yazılır
    console.error("[App hata sınırı]", error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  private goHome = () => {
    window.location.href = "/";
  };

  private reload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    const error = this.state.error;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);

    return (
      <div className="section container" style={{ padding: "48px 16px" }} role="alert">
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            {chunk ? "🔄" : "🧯"}
          </span>
          <h3>{chunk ? "Site yeni bir sürüme geçti" : "Bu bölüm yüklenemedi"}</h3>
          <p>
            {chunk
              ? "Görünümünüz eski sürüme kalmış olabilir. Sayfayı yenilemeniz yeterli."
              : "Sayfa görünümü hazırlanırken beklenmeyen bir hata oluştu. Tekrar deneyebilirsiniz."}
          </p>
          <div className="form-row" style={{ justifyContent: "center" }}>
            <button className="btn btn--primary" type="button" onClick={chunk ? this.reload : this.retry}>
              {chunk ? "Sayfayı yenile" : "Tekrar dene"}
            </button>
            <button className="btn btn--ghost" type="button" onClick={this.goHome}>
              Ana sayfaya dön
            </button>
          </div>
        </div>
      </div>
    );
  }
}
