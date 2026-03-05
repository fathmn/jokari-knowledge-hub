from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api import api_router
from app.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings = get_settings()
    print(f"Starting Jokari Knowledge Hub API (debug={settings.debug})")
    yield
    # Shutdown
    print("Shutting down Jokari Knowledge Hub API")


app = FastAPI(
    title="Jokari Knowledge Hub",
    description="Interne Wissensmanagement-Plattform für Jokari",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
settings = get_settings()
cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api")


@app.get("/")
async def root():
    return {
        "name": "Jokari Knowledge Hub",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
