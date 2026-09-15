#!/usr/bin/env bash
# Idempotent repository bootstrap for OpenReels Cloud Agents.
# Prepares JS dependencies, the Remotion render browser, and the built web SPA.
set -euo pipefail

cd "$(dirname "$0")/.."

# Pin pnpm for reproducibility. The repo declares no `packageManager` field, and
# `corepack enable` would otherwise resolve to whatever pnpm major is cached
# (pnpm >=12 stops reading `pnpm.onlyBuiltDependencies` from package.json and
# fails native builds). Running a fixed version per-command keeps builds working
# without adding a `packageManager` field (which would conflict with CI's
# pnpm/action-setup `version: latest`).
PNPM="corepack pnpm@10.33.3"

# Redis is the BullMQ backing store for the API + worker. ffmpeg/ffprobe and the
# Chrome shared libraries Remotion needs are already present in the base image.
if ! command -v redis-server >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq --no-install-recommends redis-server
fi

# Install root + web dependencies. The docs site (Next.js) deploys separately and
# is excluded to keep setup lean, mirroring the production Dockerfile.
$PNPM install --frozen-lockfile --filter=!docs

# Chrome Headless Shell used by Remotion to render the final MP4.
npx remotion browser ensure

# Build the web SPA; the API server serves it from web/dist.
$PNPM --filter web build

# Provide a .env so `pnpm start` (tsx --env-file=.env) works out of the box.
# API keys are bring-your-own-key and injected as environment secrets.
[ -f .env ] || cp .env.example .env
