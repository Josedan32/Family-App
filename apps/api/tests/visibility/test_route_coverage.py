"""Every finance read route must declare a visibility policy.

docs/visibility-rules.md §4.3. Adding a read endpoint without a policy fails
CI rather than leaking quietly.
"""

from collections.abc import Iterator

from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, _EffectiveRouteContext, _IncludedRouter

from family_api.main import create_app

# Routes that legitimately need no per-member policy. Every entry is a
# deliberate, reviewable decision — not an omission.
EXEMPT_PREFIXES = (
    "/api/v1/health",
    "/api/v1/auth",          # identity, not finance
    "/api/v1/me",            # your own data; you always see yourself (VR-03)
    "/api/v1/households",    # membership and roles carry no financial figures
    "/api/v1/categories",    # household-wide labels, no amounts
    "/api/v1/dashboard",     # household aggregates; resolves per member inline
    "/api/v1/loans",         # FR-M2-16: both parties always see their own loans
    "/api/v1/contribution-periods",  # FR-M4-07: always household-visible
    "/api/v1/household-expenses",  # FR-M4-15: shared money, always household-visible
    "/docs",
    "/openapi.json",
    "/redoc",
)


def _effective_routes() -> Iterator[_EffectiveRouteContext]:
    """Flatten the app's routing tree into effective route contexts.

    FastAPI wraps `include_router`-mounted routers lazily in `_IncludedRouter`
    rather than exposing flat `APIRoute` instances on `app.routes` directly —
    this walks that structure to recover the real, path-resolved routes.
    """
    app = create_app()
    for route in app.routes:
        if isinstance(route, _IncludedRouter):
            yield from route.effective_route_contexts()


def _declares_policy(dependant: Dependant) -> bool:
    if getattr(dependant.call, "__visibility_policy__", None) is not None:
        return True
    return any(_declares_policy(sub) for sub in dependant.dependencies)


def test_every_member_scoped_read_route_declares_a_visibility_policy() -> None:
    offenders: list[str] = []

    for context in _effective_routes():
        if "GET" not in context.methods:
            continue
        if context.path.startswith(EXEMPT_PREFIXES):
            continue
        if not isinstance(context.original_route, APIRoute):
            continue
        if not _declares_policy(context.original_route.dependant):
            offenders.append(f"{sorted(context.methods)} {context.path}")

    assert not offenders, (
        "These read routes have no visibility policy. Add "
        "Depends(visibility_for(<module>)) or add the path to EXEMPT_PREFIXES "
        "with a comment explaining why:\n  " + "\n  ".join(offenders)
    )


def test_the_marker_is_actually_detected() -> None:
    """A coverage test that cannot fail is worse than no coverage test."""
    from family_api.services.visibility import visibility_for

    assert getattr(visibility_for("income"), "__visibility_policy__", None) == "income"


def test_member_finance_routes_are_not_accidentally_exempt() -> None:
    """Guards against someone 'fixing' a failure by widening EXEMPT_PREFIXES."""
    assert not any(p.startswith("/api/v1/members") for p in EXEMPT_PREFIXES)

    member_routes = [
        context for context in _effective_routes()
        if context.path.startswith("/api/v1/members") and "GET" in context.methods
    ]
    assert len(member_routes) == 4
    assert all(
        isinstance(context.original_route, APIRoute)
        and _declares_policy(context.original_route.dependant)
        for context in member_routes
    )
