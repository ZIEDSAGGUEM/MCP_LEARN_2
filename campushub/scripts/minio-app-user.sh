#!/bin/bash
# Least privilege for files: the app gets its own MinIO user, never the admin (root) keys.
#   read:   syllabi/* and submissions/*
#   write:  submissions/* only (uploads, step 05)
#   never:  delete, list other buckets, change policies
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
mc() { docker compose exec -T minio mc "$@"; }
mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
cat <<'JSON' | docker compose exec -T minio sh -c 'cat > /tmp/campus-app-policy.json'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": ["arn:aws:s3:::campus/syllabi/*", "arn:aws:s3:::campus/submissions/*"] },
    { "Effect": "Allow", "Action": ["s3:PutObject"], "Resource": ["arn:aws:s3:::campus/submissions/*"] }
  ]
}
JSON
mc admin policy create local campus-app /tmp/campus-app-policy.json >/dev/null
mc admin user add local "$MINIO_APP_ACCESS_KEY" "$MINIO_APP_SECRET_KEY" >/dev/null
mc admin policy attach local campus-app --user "$MINIO_APP_ACCESS_KEY" >/dev/null 2>&1 || true   # already attached: fine
echo "minio app user ready (read syllabi + submissions, write submissions only)"
