import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .schemas import RoadmapRequest, UpdateRequest
from .engine import generate_roadmap, update_roadmap

load_dotenv()

app = FastAPI(title="PathForge API", version="0.2.0")

origins = [
    origin.strip()
    for origin in os.getenv(
        "PATHFORGE_CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "pathforge-api", "version": "0.2.0"}


@app.post("/api/roadmap/generate")
def roadmap_generate(request: RoadmapRequest):
    try:
        return generate_roadmap(request)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/roadmap/update")
def roadmap_update(request: UpdateRequest):
    try:
        return update_roadmap(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
