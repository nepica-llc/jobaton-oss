"""JobSpy microservice — scrapes real job listings from multiple boards."""
import os
import json
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Jobaton JobSpy Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CACHE_DIR = Path(os.getenv("CACHE_DIR", "/tmp/jobspy_cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_TTL_HOURS = int(os.getenv("CACHE_TTL_HOURS", "6"))


def get_cache_key(search_term: str, location: str, site_names: str) -> str:
    raw = f"{search_term}|{location}|{site_names}".lower().strip()
    return hashlib.md5(raw.encode()).hexdigest()


def get_cached(key: str) -> Optional[list]:
    cache_file = CACHE_DIR / f"{key}.json"
    if cache_file.exists():
        data = json.loads(cache_file.read_text())
        cached_at = datetime.fromisoformat(data["cached_at"])
        if datetime.now() - cached_at < timedelta(hours=CACHE_TTL_HOURS):
            return data["jobs"]
    return None


def set_cache(key: str, jobs: list):
    cache_file = CACHE_DIR / f"{key}.json"
    cache_file.write_text(json.dumps({
        "cached_at": datetime.now().isoformat(),
        "jobs": jobs,
    }))


@app.get("/health")
def health():
    return {"status": "ok", "service": "jobspy"}


@app.get("/search")
def search_jobs(
    search_term: str = Query(..., description="Job title or keywords"),
    location: str = Query("", description="Location filter"),
    results_wanted: int = Query(15, ge=1, le=50),
    site_name: str = Query("indeed,linkedin_com,glassdoor", description="Comma-separated site names"),
    force_refresh: bool = Query(False, description="Bypass cache"),
):
    """Search for jobs using python-jobspy. Results are cached."""
    sites = [s.strip() for s in site_name.split(",") if s.strip()]
    cache_key = get_cache_key(search_term, location, site_name)

    # Check cache first
    if not force_refresh:
        cached = get_cached(cache_key)
        if cached is not None:
            return {"jobs": cached, "cached": True, "count": len(cached)}

    # Import jobspy and scrape
    try:
        from jobspy import scrape_jobs

        jobs_df = scrape_jobs(
            site_name=sites,
            search_term=search_term,
            location=location if location else None,
            results_wanted=results_wanted,
            hours_old=72,
            country_indeed="USA",
        )

        # Convert DataFrame to list of dicts
        jobs = []
        for _, row in jobs_df.iterrows():
            job = {
                "title": str(row.get("title", "")),
                "company": str(row.get("company_name", row.get("company", ""))),
                "location": str(row.get("location", "")),
                "url": str(row.get("job_url", row.get("link", ""))),
                "salary": str(row.get("min_amount", "")) if row.get("min_amount") else "",
                "date_posted": str(row.get("date_posted", "")),
                "site": str(row.get("site", "")),
                "description": str(row.get("description", ""))[:500],
            }
            # Clean up NaN values
            job = {k: (v if v != "nan" and v != "None" else "") for k, v in job.items()}
            if job["title"] and job["company"]:
                jobs.append(job)

        # Format salary
        for job in jobs:
            if job["salary"]:
                try:
                    amt = float(job["salary"])
                    job["salary"] = f"${amt:,.0f}"
                except (ValueError, TypeError):
                    pass

        set_cache(cache_key, jobs)
        return {"jobs": jobs, "cached": False, "count": len(jobs)}

    except ImportError:
        return {"error": "python-jobspy not installed", "jobs": [], "count": 0}
    except Exception as e:
        return {"error": str(e), "jobs": [], "count": 0}


@app.delete("/cache")
def clear_cache():
    """Clear all cached search results."""
    count = 0
    for f in CACHE_DIR.glob("*.json"):
        f.unlink()
        count += 1
    return {"cleared": count}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
