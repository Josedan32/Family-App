"""Domain errors and their RFC 9457 problem+json rendering.

Services raise these; they know nothing about HTTP status codes beyond the
class attribute. Routers never construct them.

`type` is a stable machine-readable slug that clients branch on. `title` is
Spanish user-facing copy that will change.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

PROBLEM_JSON = "application/problem+json"


class DomainError(Exception):
    type_slug: str = "internal_error"
    status: int = 500
    title: str = "Ocurrió un error"


class NotVisibleError(DomainError):
    """Uniform visibility denial.

    Deliberately identical for "not visible", "does not exist" and "other
    household" — the difference between them is itself information
    (docs/visibility-rules.md §4.4).
    """

    type_slug = "not_visible"
    status = 403
    title = "No tienes acceso a esta información"


class ForbiddenRoleError(DomainError):
    type_slug = "forbidden_role"
    status = 403
    title = "Tu rol no permite esta acción"


class NotFoundError(DomainError):
    type_slug = "not_found"
    status = 404
    title = "No se encontró el recurso"


class AlreadyInHouseholdError(DomainError):
    type_slug = "already_in_household"
    status = 409
    title = "Ya perteneces a un hogar"


class LastAdminError(DomainError):
    type_slug = "last_admin"
    status = 409
    title = "El hogar debe tener al menos un administrador"


class DerivedRecordError(DomainError):
    type_slug = "derived_record"
    status = 409
    title = "Este movimiento se gestiona desde su origen"


class InviteNotFoundError(DomainError):
    type_slug = "invite_not_found"
    status = 400
    title = "El código no existe"


class InviteExpiredError(DomainError):
    type_slug = "invite_expired"
    status = 400
    title = "El código expiró"


class InviteExhaustedError(DomainError):
    type_slug = "invite_exhausted"
    status = 400
    title = "El código ya fue utilizado"


class InviteRevokedError(DomainError):
    type_slug = "invite_revoked"
    status = 400
    title = "El código fue revocado"


class InvalidCredentialsError(DomainError):
    type_slug = "invalid_credentials"
    status = 401
    title = "Correo o contraseña incorrectos"


class IncorrectPasswordError(DomainError):
    type_slug = "incorrect_password"
    status = 400
    title = "La contraseña actual no es correcta"


class TokenExpiredError(DomainError):
    type_slug = "token_expired"
    status = 401
    title = "Tu sesión expiró"


class TokenReusedError(DomainError):
    type_slug = "token_reused"
    status = 401
    title = "Tu sesión fue cerrada por seguridad"


class RateLimitedError(DomainError):
    type_slug = "rate_limited"
    status = 429
    title = "Demasiados intentos, espera un momento"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            media_type=PROBLEM_JSON,
            content={
                "type": exc.type_slug,
                "title": exc.title,
                "status": exc.status,
                "detail": None,
                "instance": request.url.path,
            },
        )
