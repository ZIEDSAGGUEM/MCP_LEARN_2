#!/bin/bash
# Two roles with separate jobs (same idea as InsureBot step 06):
#   campus_owner: owns the tables, can't log in
#   campus_app:   what the MCP pods will connect as; reads and writes rows, can't change the schema,
#                 can't delete, can't bypass row-level security (added in step 02)
# Never connect the app as "postgres": a superuser ignores row-level security completely.
set -euo pipefail
: "${CAMPUS_APP_PASSWORD:?CAMPUS_APP_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-campus}" \
  -v app_password="$CAMPUS_APP_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'campus_owner') THEN
    CREATE ROLE campus_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'campus_app') THEN
    CREATE ROLE campus_app LOGIN;
  END IF;
END
$$;
ALTER ROLE campus_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
GRANT CONNECT ON DATABASE campus TO campus_app;
SQL
