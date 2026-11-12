"""GOOGLE MAPS SCRAPER HTTP SERVİSİ (yerel, 127.0.0.1:8788).

Küçük FastAPI sarmalayıcı: panel POST /jobs ile iş açar, GET /jobs/{id}
ile sorgular, GET /jobs/{id}/candidates ile businesses.csv'den aday çıkarır,
POST /jobs/{id}/cancel ile süreci sonlandırır. Tarama, venv içindeki
`main.py scrape` alt süreciyle arka planda çalışır; checkpoint (SQLite)
scraper'ın kendi state DB'sindedir — panel kapansa da süreç servis
yaşadığı sürece devam eder.

KONTROLLÜ PARAMETRELER (varsayılanlar küçük başlar):
  workers 1 (en fazla 2), max-pages 3 (sayfa başına 20), grid kapalı.
  Grid açıkken hücre 1.0km ve yarıçap 5km ile sınırlanır.
  --direct kullanılır (proxy dosyası yok), --lang tr --gl tr.
"""

import csv
import json
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
MAIN = ROOT / "main.py"
DATA = ROOT / "data" / "jobs"
PYTHON = sys.executable  # venv pythonu
MAX_PAGES_LIMIT = 5

app = FastAPI(title="Firma Rehberi Google Scraper Servisi", version="v1")

locks = threading.Lock()
jobs: dict[str, dict] = {}


class SearchBody(BaseModel):
    il: str
    ilce: str
    kategori: str
    kategoriId: str = ""
    arama: str = ""
    gridMode: bool = False
    workers: int = 1
    maxPages: int = 3
    cellKm: float = 1.0
    radiusKm: float = 5.0


def _query(body: SearchBody) -> str:
    term = body.arama.strip() or body.kategori.strip()
    return f"{term} in {body.ilce.strip()}, {body.il.strip()}"


def _row_count(csv_path: Path) -> int:
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return 0
    try:
        with csv_path.open("r", encoding="utf-8", newline="") as f:
            return max(0, sum(1 for _ in f) - 1)
    except Exception:
        return 0


def _save(job_id: str) -> None:
    """İş meta verisini diske yazar (geçmiş listesi + yenileme kalıcılığı)."""
    with locks:
        job = jobs.get(job_id)
        if not job:
            return
        meta = {k: v for k, v in job.items() if k not in ("proc", "cmd", "csv")}
        job_dir = job["csv"].parent
    try:
        DATA.mkdir(parents=True, exist_ok=True)
        (job_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def _recover() -> None:
    """Açılışta data/jobs altındaki eski işleri geri yükler (bellek yok olur)."""
    try:
        DATA.mkdir(parents=True, exist_ok=True)
        for job_dir in sorted(DATA.iterdir()):
            if not job_dir.is_dir():
                continue
            job_id = job_dir.name
            csv_path = job_dir / "businesses.csv"
            meta_path = job_dir / "meta.json"
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    if not isinstance(meta, dict):
                        continue
                    # Yeniden başlatmada canlı kalan queued/running süreç ölüdür.
                    if meta.get("state") in ("queued", "running"):
                        meta["state"] = "failed"
                        meta["error"] = "Servis yeniden başlatıldı; iş yarım kaldı."
                    # Eski meta'da bağlam yoksa sorgudan doldur ("X in Y, Z").
                    if not meta.get("il") or not meta.get("kategori"):
                        q = (meta.get("query") or "").strip()
                        if " in " in q and "," in q:
                            try:
                                r_kat, rest = q.split(" in ", 1)
                                parts = rest.rsplit(",", 1)
                                if len(parts) == 2:
                                    meta.setdefault("kategori", r_kat.strip())
                                    meta.setdefault("ilce", parts[0].strip())
                                    meta.setdefault("il", parts[1].strip())
                            except Exception:
                                pass
                    for k in ("il", "ilce", "kategori", "kategoriId"):
                        if k not in meta:
                            meta[k] = ""
                    jobs[job_id] = {**meta, "csv": csv_path, "cmd": [], "proc": None, "jobId": job_id}
                    continue
                except Exception:
                    continue
            # Meta yok: CSV'den dürüst tahmin (satır varsa done, yoksa failed).
            if not csv_path.exists():
                continue
            query = "bilinmeyen sorgu"
            try:
                with csv_path.open("r", encoding="utf-8", newline="") as f:
                    for row in csv.DictReader(f):
                        q = (row.get("query") or "").strip()
                        if q:
                            query = q
                        break
            except Exception:
                pass
            count = _row_count(csv_path)
            # "X in Y, Z" biçiminden bağlamı kurtar (kategoriID DB'de olmayabilir).
            r_il, r_ilce, r_kat = "", "", ""
            if " in " in query and "," in query:
                try:
                    r_kat, rest = query.split(" in ", 1)
                    parts = rest.rsplit(",", 1)
                    if len(parts) == 2:
                        r_ilce, r_il = parts[0].strip(), parts[1].strip()
                except Exception:
                    pass
            jobs[job_id] = {
                "jobId": job_id,
                "state": "done" if count > 0 else "failed",
                "query": query,
                "il": r_il,
                "ilce": r_ilce,
                "kategori": r_kat,
                "kategoriId": "",
                "csv": csv_path,
                "cmd": [],
                "proc": None,
                "found": count,
                "error": None if count > 0 else "Sonuç yok (geçmiş iş).",
                "log": "",
                "started": None,
                "created": job_dir.stat().st_mtime,
            }
            try:
                (job_dir / "meta.json").write_text(
                    json.dumps({k: v for k, v in jobs[job_id].items() if k not in ("proc", "cmd", "csv")}, ensure_ascii=False),
                    encoding="utf-8",
                )
            except Exception:
                pass
    except Exception:
        pass


_recover()


def _candidates(csv_path: Path, query: str) -> list[dict]:
    out: list[dict] = []
    if not csv_path.exists():
        return out
    try:
        with csv_path.open("r", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                name = (row.get("name") or "").strip()
                if not name:
                    continue
                def fnum(k: str) -> Optional[float]:
                    try:
                        v = (row.get(k) or "").strip()
                        return float(v) if v not in ("", "0", "0.0") else None
                    except ValueError:
                        return None
                phone = (row.get("phone_intl") or "").strip() or (row.get("phone") or "").strip() or None
                out.append({
                    "name": name,
                    "source": "google-maps-scraper",
                    "phone": phone,
                    "address": (row.get("address") or "").strip() or None,
                    "website": (row.get("website") or "").strip() or None,
                    "email": (row.get("email") or "").strip() or None,
                    "rating": (row.get("rating") or "").strip() or None,
                    "reviewCount": (row.get("review_count") or "").strip() or None,
                    "hours": (row.get("hours") or "").strip() or None,
                    "latitude": fnum("lat"),
                    "longitude": fnum("lng"),
                    "placeId": (row.get("place_id") or "").strip() or None,
                    "category": (row.get("category") or "").strip() or None,
                    "query": row.get("query") or query,
                })
    except Exception:
        return out
    return out


def _run(job_id: str) -> None:
    with locks:
        job = jobs.get(job_id)
        if not job:
            return
        job["state"] = "running"
        job["started"] = time.time()
    _save(job_id)
    try:
        proc = subprocess.Popen(job["cmd"], cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        with locks:
            jobs[job_id]["proc"] = proc
        for line in proc.stdout or []:
            with locks:
                jobs[job_id]["log"] = (jobs[job_id]["log"] + line)[-3000:]
        proc.wait()
        with locks:
            cur = jobs.get(job_id)
            if not cur:
                return
            cur["found"] = _row_count(cur["csv"])
            cur["state"] = "done" if proc.returncode == 0 else "failed"
            if proc.returncode != 0 and cur["state"] != "cancelled":
                cur["state"] = "failed"
                cur["error"] = cur["log"][-500:] or f"scraper çıkışı {proc.returncode}"
    except Exception as e:  # noqa: BLE001
        with locks:
            if job_id in jobs:
                jobs[job_id]["state"] = "failed"
                jobs[job_id]["error"] = str(e)
    _save(job_id)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "version": "v1", "adapters": ["google-maps-scraper"], "scraperEnabled": True}


@app.post("/jobs", status_code=201)
def create_job(body: SearchBody) -> dict:
    if not body.il.strip() or not body.ilce.strip() or (not body.kategori.strip() and not body.arama.strip()):
        raise HTTPException(status_code=400, detail={"message": "İl, ilçe ve kategori/arama gerekli."})
    workers = min(max(body.workers, 1), 2)
    max_pages = min(max(body.maxPages, 1), MAX_PAGES_LIMIT)
    query = _query(body)
    job_id = uuid.uuid4().hex[:12]
    job_dir = DATA / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    csv_path = job_dir / "businesses.csv"
    db_path = job_dir / "state.sqlite3"
    cmd = [
        PYTHON, str(MAIN), "scrape",
        "--query", query,
        "--out", str(csv_path),
        "--db", str(db_path),
        "--workers", str(workers),
        "--max-pages", str(max_pages),
        "--direct", "--lang", "tr", "--gl", "tr",
    ]
    if body.gridMode:
        cmd += ["--all", "--cell-km", str(min(max(body.cellKm, 0.5), 5.0)), "--radius-km", str(min(max(body.radiusKm, 1.0), 10.0))]
    with locks:
        jobs[job_id] = {
            "jobId": job_id,
            "state": "queued",
            "query": query,
            "il": body.il.strip(),
            "ilce": body.ilce.strip(),
            # Arama-kelimesi akışında da iş bağlamı dolu kalır (eşleşme panelde yapılır).
            "kategori": body.kategori.strip() or body.arama.strip(),
            "kategoriId": body.kategoriId.strip(),
            "csv": csv_path,
            "cmd": cmd,
            "found": 0,
            "error": None,
            "log": "",
            "proc": None,
            "started": None,
            "created": time.time(),
        }
    _save(job_id)
    threading.Thread(target=_run, args=(job_id,), daemon=True).start()
    return {"jobId": job_id, "state": "queued"}


@app.get("/jobs")
def list_jobs() -> dict:
    with locks:
        items = []
        for job_id, job in jobs.items():
            elapsed = round(time.time() - job["started"], 1) if job.get("started") else None
            found = _row_count(job["csv"]) if job["state"] in ("queued", "running", "done") else job.get("found", 0)
            items.append({
                "jobId": job_id,
                "state": job["state"],
                "query": job.get("query", ""),
                "il": job.get("il", ""),
                "ilce": job.get("ilce", ""),
                "kategori": job.get("kategori", ""),
                "kategoriId": job.get("kategoriId", ""),
                "found": found,
                "elapsedSec": elapsed,
                "error": job.get("error"),
                "created": job.get("created"),
            })
    items.sort(key=lambda x: x.get("created") or 0, reverse=True)
    return {"jobs": items}


@app.get("/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    with locks:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail={"message": "İş bulunamadı."})
        elapsed = None
        if job.get("started"):
            elapsed = round(time.time() - job["started"], 1)
        # canlı bulunan: CSV satır sayısı
        found = _row_count(job["csv"]) if job["state"] in ("queued", "running", "done") else job.get("found", 0)
        if job["state"] in ("queued", "running"):
            job["found"] = found
        return {"jobId": job_id, "state": job["state"], "query": job["query"], "il": job.get("il", ""), "ilce": job.get("ilce", ""), "kategori": job.get("kategori", ""), "kategoriId": job.get("kategoriId", ""), "found": found, "elapsedSec": elapsed, "error": job.get("error")}


@app.get("/jobs/{job_id}/candidates")
def job_candidates(job_id: str) -> dict:
    with locks:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail={"message": "İş bulunamadı."})
        return {"jobId": job_id, "state": job["state"], "candidates": _candidates(job["csv"], job["query"])}


@app.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str) -> dict:
    with locks:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail={"message": "İş bulunamadı."})
        job["state"] = "cancelled"
        proc = job.get("proc")
    try:
        if proc is not None:
            proc.terminate()
    except Exception:
        pass
    _save(job_id)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn  # noqa: PLC0415

    uvicorn.run(app, host="127.0.0.1", port=8788)
