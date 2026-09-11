from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from family_api.config import get_settings
from family_api.errors import register_error_handlers
from family_api.routers import (
    auth,
    categories,
    contributions,
    dashboard,
    health,
    households,
    loans,
    me_finance,
    member_finance,
    visibility,
)

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Family Hub API", version="0.1.0")

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    register_error_handlers(app)
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(auth.me_router, prefix=API_PREFIX)
    app.include_router(households.router, prefix=API_PREFIX)
    app.include_router(categories.router, prefix=API_PREFIX)
    app.include_router(me_finance.router, prefix=API_PREFIX)
    app.include_router(loans.router, prefix=API_PREFIX)
    app.include_router(visibility.router, prefix=API_PREFIX)
    app.include_router(member_finance.router, prefix=API_PREFIX)
    app.include_router(contributions.router, prefix=API_PREFIX)
    app.include_router(contributions.contributions_router, prefix=API_PREFIX)
    app.include_router(dashboard.router, prefix=API_PREFIX)
    return app


app = create_app()
