"""
Koleksiyon servisi — React panelinden bağımsız Python veri toplama katmanı.

ÇALIŞTIRMA (yerel):
    pip3 install -r services/collector/requirements.txt
    python3 services/collector/main.py          # http://127.0.0.1:8787

YETKİLENDİRME:
    - COLLECTOR_API_KEY tanımlıysa TÜM istekler `x-collector-key` başlığı ister
      (hmac.compare_digest ile sabit-zamanlı karşılaştırma).
    - Anahtar TANIMLI DEĞİLSE yalnız geri döngü (127.0.0.1/::1) istekleri kabul
      edilir — yerel geliştirme kolaylığı; üretilerde mutlaka anahtar tanımlayın.
    - Anahtar ASLA istemci koduna gömülmez: tarayıcı → Netlify proxy
      (/api/collector/*) → bu servis; anahtar Netlify ortam değişkenindedir.
"""

import hmac
import os
import sys
from typing import Optional, Tuple

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from adapters import SourceDisabledError, SourceError, default_registry  # noqa: E402
from contract import HealthReport, SearchRequest  # noqa: E402
from jobs import JobStore  # noqa: E402

LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}

app = FastAPI(
    title="Firma Rehberi Koleksiyon Servisi",
    version="v1",
    description=(
        "İş-tabanlı işletme adayı toplama: POST /jobs ile iş başlat, "
        "GET /jobs/{id} ile takip et, adayları GET /jobs/{id}/candidates ile al."
    ),
)

registry = default_registry()
store = JobStore(registry)


def authorize(request: Request) -> Optional[JSONResponse]:
    """Anahtar tanımlıysa zorunlu; tanımsızsa yalnız geri döngüye izin ver."""
    api_key = os.environ.get("COLLECTOR_API_KEY")
    if not api_key:
        host = (request.client.host if request.client else "") or ""
        if host in LOOPBACK_HOSTS:
            return None
        return JSONResponse(
            status_code=401,
            content={"detail": "Servis anahtarı yapılandırılmamış; yalnız yerel istekler kabul edilir."},
        )
    provided = request.headers.get("x-collector-key", "")
    if not provided or not hmac.compare_digest(provided, api_key):
        return JSONResponse(status_code=401, content={"detail": "Yetkisiz istek — x-collector-key gerekli."})
    return None


@app.middleware("http")
async def auth_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    if request.url.path == "/health":
        return await call_next(request)
    denied = authorize(request)
    if denied is not None:
        return denied
    return await call_next(request)


@app.get("/health", response_model=HealthReport)
def health() -> HealthReport:
    """Kaynakların gerçek durumu — yapılandırma eksikse dürüstçe raporlanır."""
    available = []
    for name, adapter in registry.items():
        # csv her zaman yapılandımsız ama kullanılabilir; fake test kaynağıdır
        if name in {"fake", "csv"} or adapter.is_configured():
            available.append(name)
    scraper = registry.get("maps-scraper")
    return HealthReport(adapters=sorted(available), scraperEnabled=bool(scraper and scraper.is_configured()))


@app.post("/jobs", status_code=201)
def create_job(req: SearchRequest):
    job_id, error = store.start(req)
    if error and job_id:
        # Zaten çalışan işin kimliği döndü → 409 + mevcut iş referansı
        return JSONResponse(status_code=409, content={"jobId": job_id, "message": error})
    if error:
        raise HTTPException(status_code=400, detail={"message": error})
    return {"jobId": job_id, "state": "queued"}


@app.get("/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"message": "İş bulunamadı."})
    status = job.status()
    return status.model_dump(exclude_none=True)


@app.get("/jobs/{job_id}/candidates")
def job_candidates(job_id: str) -> dict:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"message": "İş bulunamadı."})
    return {
        "jobId": job.id,
        "state": job.state,
        "candidates": [c.model_dump(exclude_none=True) for c in job.candidates],
    }


@app.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str) -> dict:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"message": "İş bulunamadı."})
    store.cancel(job_id)
    return {"ok": True}


@app.exception_handler(SourceError)
def source_error_handler(_request: Request, exc: SourceError) -> JSONResponse:  # pragma: no cover
    return JSONResponse(status_code=400, content={"detail": {"message": str(exc)}})


@app.exception_handler(SourceDisabledError)
def source_disabled_handler(_request: Request, exc: SourceDisabledError) -> JSONResponse:  # pragma: no cover
    return JSONResponse(status_code=403, content={"detail": {"message": str(exc)}})


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("COLLECTOR_PORT", "8787"))
    has_key = bool(os.environ.get("COLLECTOR_API_KEY"))
    print(f"[*] Koleksiyon servisi http://127.0.0.1:{port} üzerinde başlıyor.")
    if not has_key:
        print("[!] COLLECTOR_API_KEY tanımlı değil — yalnız yerel (127.0.0.1) istekler kabul edilir.")
    print("[*] Kaynaklar:", ", ".join(sorted(registry.keys())))
    uvicorn.run(app, host="127.0.0.1", port=port)
