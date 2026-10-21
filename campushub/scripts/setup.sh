#!/bin/bash
# CampusHub step 00: one command from an empty folder to a running lab.
#   1. secrets in .env / .env.test (random, git-ignored, never overwritten)
#   2. PDFs in files/
#   3. docker compose up, wait until healthy
#   4. Keycloak realm, roles, users (admin API)
#   5. link Keycloak user ids and real PDF sizes into Postgres
#   6. MinIO bucket + PDFs
# Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."

rand() { openssl rand -hex "${1:-24}"; }

if [ ! -f .env ]; then
  cat > .env <<EOF
POSTGRES_PASSWORD=$(rand)
CAMPUS_APP_PASSWORD=$(rand)
KEYCLOAK_ADMIN_PASSWORD=$(rand)
MINIO_ROOT_USER=campus-$(rand 6)
MINIO_ROOT_PASSWORD=$(rand)
EOF
  chmod 600 .env
  echo "created .env"
fi
if [ ! -f .env.test ]; then
  {
    echo "# Lab users' passwords (log in at http://localhost:8090/realms/campus/account)"
    for u in SARA BILAL MALLORY TOM LINA; do echo "${u}_PASSWORD=$(rand 9)"; done
  } > .env.test
  chmod 600 .env.test
  echo "created .env.test"
fi
set -a; source .env; source .env.test; set +a

node scripts/make-pdfs.mjs

docker compose up -d --wait
echo "lab is healthy"

SUBS=$(node scripts/keycloak-setup.mjs)
echo "keycloak realm 'campus' ready"

# Link Keycloak ids and the real file sizes into Postgres (as the superuser: setup only, never the app)
SQL=$(python3 - "$SUBS" <<'PY'
import json, sys
subs = json.loads(sys.argv[1]); sizes = json.load(open("files/sizes.json"))
out = [f"UPDATE users SET kc_sub = '{sid}' WHERE id = '{u}';" for u, sid in subs.items()]
out += [f"UPDATE submissions SET size_bytes = {n} WHERE object_key = '{k}';" for k, n in sizes.items() if k.startswith("submissions/")]
print("\n".join(out))
PY
)
echo "$SQL" | docker compose exec -T postgres psql -q -v ON_ERROR_STOP=1 -U postgres -d campus
echo "postgres linked to keycloak users"

node scripts/minio-setup.mjs

cat <<EOF

CampusHub lab is ready:
  Keycloak     http://localhost:8090   (admin password: KEYCLOAK_ADMIN_PASSWORD in .env)
  MinIO        http://localhost:9011   (MINIO_ROOT_USER / MINIO_ROOT_PASSWORD in .env)
  Mailpit      http://localhost:8026
  Postgres     127.0.0.1:5434, database campus
  Redis        127.0.0.1:6382
Next: npm test
EOF
