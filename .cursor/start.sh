#!/usr/bin/env bash
# Per-boot reconciliation: ensure the Redis daemon the API + worker depend on is up.
set -euo pipefail

if ! redis-cli ping >/dev/null 2>&1; then
  redis-server --daemonize yes --save "" --appendonly no
fi

# Wait for Redis to accept connections before the terminals launch.
for _ in $(seq 1 15); do
  if redis-cli ping >/dev/null 2>&1; then
    echo "Redis is ready."
    exit 0
  fi
  sleep 1
done

echo "Redis did not become ready in time." >&2
exit 1
