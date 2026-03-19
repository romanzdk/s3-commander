"""FastAPI app for S3 Commander."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from s3_browser.api.routes import router

app = FastAPI(title="S3 Commander", version="0.1.0")
app.include_router(router)

static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
