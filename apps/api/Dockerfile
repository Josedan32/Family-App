# Two stages so the built wheels land in a runtime image without the compiler
# toolchain that produced them.
FROM python:3.13-slim AS build

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy only what pip needs to resolve dependencies first, so a source-only
# change does not invalidate the dependency layer.
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip wheel --wheel-dir /wheels .


FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY --from=build /wheels /wheels
RUN pip install --no-index --find-links=/wheels family-api \
    && rm -rf /wheels

# Alembic and the seed script are not part of the installed package.
COPY alembic.ini ./
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Never run as root: a container that only serves HTTP has no reason to be able
# to rewrite its own filesystem.
RUN useradd --create-home --uid 10001 family
USER family

# The platform tells us which port to listen on; 8001 is only the local default.
ENV PORT=8001
EXPOSE 8001

ENTRYPOINT ["./docker-entrypoint.sh"]
