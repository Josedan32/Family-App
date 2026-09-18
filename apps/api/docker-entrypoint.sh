#!/bin/sh
set -e

# Migrations run on every boot, before the first request is served.
#
# For a single-instance family app this is the simplest correct thing: Alembic
# takes a lock, repeat runs are no-ops, and the container cannot come up
# serving code that expects a column the database does not have. If this ever
# runs more than one instance, move it to a release step instead.
echo "Applying migrations..."
alembic upgrade head

echo "Starting API on port ${PORT}..."
exec uvicorn family_api.main:app --host 0.0.0.0 --port "${PORT}"
