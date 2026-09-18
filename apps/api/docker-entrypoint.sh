#!/bin/sh
set -e

# Migrations run on every boot, before the first request is served.
#
# For a single-instance family app this is the simplest correct thing: Alembic
# takes a lock, repeat runs are no-ops, and the container cannot come up
# serving code that expects a column the database does not have. If this ever
# runs more than one instance, move it to a release step instead.
#
# The previous version keeps serving requests while this one migrates, so a
# migration can lose a lock race with a live request (lock timeout, or
# Postgres picking it as a deadlock victim). Each migration is its own
# transaction, so a retry resumes where the last attempt stopped.
echo "Applying migrations..."
attempt=1
until alembic upgrade head; do
  if [ "$attempt" -ge 5 ]; then
    echo "Migrations failed after $attempt attempts." >&2
    exit 1
  fi
  echo "Migration attempt $attempt failed; retrying in $((attempt * 5))s..." >&2
  sleep $((attempt * 5))
  attempt=$((attempt + 1))
done

echo "Starting API on port ${PORT}..."
exec uvicorn family_api.main:app --host 0.0.0.0 --port "${PORT}"
