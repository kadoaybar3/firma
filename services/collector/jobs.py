"""
İş (job) katmanı — uzun süren arama isteği HTTP bağlantısı açık tutmadan yürütülür.

Akış: POST /jobs işi kuyruğa alır → istemci GET /jobs/{id} ile durum/yarılamayı
sorgular → bittiğinde GET /jobs/{id}/candidates ile adayları çeker.

Güvenceler:
  - Tekrar iş başlatma: aynı (il, ilce, kategori, source) RUNNING/QUEUED → 409.
  - Zaman aşımı: JOB_TIMEOUT_SECONDS sonunda iş iptale zorlanır → failed.
  - Hata / iptal: iş state'i failed | cancelled olur, mesaj Türkçe döner.
  - İş depolama yalnız bellektir (v1) — DB tablosu YOK (onay bekleyen tasarım).
"""

import threading
import time
import uuid
from typing import Dict, List, Optional, Set, Tuple

from adapters import (
    BaseSourceAdapter,
    SourceDisabledError,
    SourceError,
    check_cancel,
)
from contract import (
    FORBIDDEN_SOURCES,
    JOB_TIMEOUT_SECONDS,
    Candidate,
    JobProgress,
    JobStatus,
    SearchRequest,
    phone_key,
)

# İş durumları
STATE_QUEUED = "queued"
STATE_RUNNING = "running"
STATE_DONE = "done"
STATE_FAILED = "failed"
STATE_CANCELLED = "cancelled"

VISIBLE_STATES = {STATE_QUEUED, STATE_RUNNING}


class Job:
    """Bellek-içi iş kaydı — korumalı alanlar için kilit paylaşılır."""

    def __init__(self, job_id: str, req: SearchRequest, adapter_name: str) -> None:
        self.id = job_id
        self.req = req
        self.adapter_name = adapter_name
        self.state = STATE_QUEUED
        self.progress_done = 0
        self.progress_total = 0
        self.error: Optional[str] = None
        self.candidates: List[Candidate] = []
        self.cancel = threading.Event()
        self.created_at = time.time()

    def status(self) -> JobStatus:
        return JobStatus(
            jobId=self.id,
            state=self.state,
            source=self.adapter_name,
            progress=JobProgress(done=self.progress_done, total=self.progress_total),
            error=self.error,
        )


def enrich(cands: List[Candidate]) -> List[Candidate]:
    """İş içi mükerrer + eksik bilgi uyarıları (kaynağa dokunmadan etiketlenir)."""
    seen_phones: Set[str] = set()
    for c in cands:
        key = phone_key(c.phone)
        if key:
            if key in seen_phones:
                c.warnings.append("Aynı iş içinde telefonu tekrar eden aday")
            seen_phones.add(key)
        if not (c.phone and c.phone.strip()):
            c.warnings.append("Telefon yok")
        if not (c.address and c.address.strip()):
            c.warnings.append("Adres yok")
    return cands


class JobStore:
    """Thread-safe iş deposu + koşucu."""

    def __init__(self, registry: Dict[str, BaseSourceAdapter], timeout_seconds: int = JOB_TIMEOUT_SECONDS) -> None:
        self._registry = registry
        self._timeout = timeout_seconds
        self._lock = threading.Lock()
        self._jobs: Dict[str, Job] = {}
        # Yalnız son işleri tut (bellek sızıntısı yok); aday listesiyle birlikte
        self._max_jobs = 100

    # ---------- sorgu ----------
    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def find_active_key(self, key: Tuple[str, str, str, str]) -> Optional[Job]:
        with self._lock:
            for j in self._jobs.values():
                if j.state in VISIBLE_STATES and self._key(j) == key:
                    return j
        return None

    @staticmethod
    def _key(job: Job) -> Tuple[str, str, str, str]:
        return (
            job.req.il.strip().lower(),
            job.req.ilce.strip().lower(),
            job.req.kategori.strip().lower(),
            job.adapter_name,
        )

    # ---------- oluşturma ----------
    def start(self, req: SearchRequest) -> Tuple[Optional[str], Optional[str]]:
        """
        İş oluşturur. Dönüş: (job_id, None) ya da (None, hata_mesajı).
        Aynı aktif iş varsa mevcut işin kimliği hafif uyarı mesajıyla döner → 409.
        """
        adapter = self._registry.get(req.source)
        if adapter is None:
            return None, f"Bilinmeyen kaynak: {req.source}"
        if req.source in FORBIDDEN_SOURCES and not adapter.is_configured():
            hint = ""
            gates = getattr(adapter, "missing_gates", None)
            if callable(gates):
                hint = f" Eksik koşullar: {'; '.join(gates())}"
            return None, (
                "maps-scraper kaynağı üretimde yasaktır (Google ToS ihlali); "
                "yalnız izole eğitim ortamında değerlendirilebilir." + hint
            )
        if not adapter.is_configured():
            return None, f"Kaynak yapılandırılmamış: {req.source} (gerekli ortam değişkenleri eksik)"

        existing = self.find_active_key((req.il.strip().lower(), req.ilce.strip().lower(), req.kategori.strip().lower(), req.source))
        if existing:
            return existing.id, "Aynı parametrelerle çalışan bir iş zaten var."

        job = Job(uuid.uuid4().hex[:12], req, req.source)
        with self._lock:
            self._jobs[job.id] = job
            # bellek budama
            if len(self._jobs) > self._max_jobs:
                for old_id in [k for k, v in self._jobs.items() if v.state not in VISIBLE_STATES][: len(self._jobs) - self._max_jobs]:
                    self._jobs.pop(old_id, None)
        thread = threading.Thread(target=self._run, args=(job,), daemon=True, name=f"collector-job-{job.id}")
        job.state = STATE_QUEUED
        thread.start()
        return job.id, None

    # ---------- koşucu ----------
    def _run(self, job: Job) -> None:
        with self._lock:
            job.state = STATE_RUNNING
        adapter = self._registry[job.adapter_name]
        watchdog = threading.Timer(self._timeout, job.cancel.set)
        watchdog.daemon = True
        watchdog.start()
        try:
            cands = adapter.search(
                job.req,
                progress=lambda done, total: self._set_progress(job, done, total),
                cancel=job.cancel,
            )
            if job.cancel.is_set():
                self._finish(job, STATE_CANCELLED, "İş iptal edildi (ya da zaman aşımı).")
            else:
                job.candidates = enrich(cands)
                with self._lock:
                    job.progress_done = len(job.candidates)
                    job.progress_total = len(job.candidates)
                self._finish(job, STATE_DONE, None)
        except SourceDisabledError as exc:
            self._finish(job, STATE_FAILED, str(exc))
        except SourceError as exc:
            self._finish(job, STATE_FAILED, str(exc))
        except Exception as exc:  # beklenmeyen — işi çökertmesin
            self._finish(job, STATE_FAILED, f"Beklenmeyen hata: {type(exc).__name__}: {exc}")
        finally:
            watchdog.cancel()

    def _set_progress(self, job: Job, done: int, total: int) -> None:
        with self._lock:
            job.progress_done = done
            job.progress_total = total

    def _finish(self, job: Job, state: str, error: Optional[str]) -> None:
        with self._lock:
            job.state = state
            job.error = error

    # ---------- iptal ----------
    def cancel(self, job_id: str) -> bool:
        job = self.get(job_id)
        if job is None:
            return False
        job.cancel.set()
        return True
