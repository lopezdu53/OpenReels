FROM node:22-bookworm-slim

# Install system dependencies: ffmpeg (includes ffprobe) and Chrome Headless Shell shared libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    espeak-ng \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libcups2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable pnpm via corepack (pin so EasyPanel does not pick a breaking latest)
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

# Install dependencies (pnpm workspace — root + web only, docs deploys separately).
# docs/package.json must exist or --filter=!docs fails on some pnpm versions.
# Skip onnxruntime-node rebuild: its postinstall downloads CUDA GPU libs and
# breaks slim images; the published CPU binaries are enough for Kokoro.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
COPY docs/package.json ./docs/
RUN pnpm install --ignore-scripts --frozen-lockfile --filter=!docs \
 && pnpm rebuild esbuild sharp msgpackr-extract protobufjs

# Install Chrome Headless Shell for Remotion rendering
RUN npx remotion browser ensure

# Copy full source
COPY . .

# Build frontend
RUN cd web && npx vite build

# Create directories
RUN mkdir -p /output /app/jobs /app/data
ENV DATA_DIR=/app/data
ENV JOBS_DIR=/app/jobs

# Default: CLI mode (backwards compatible)
ENTRYPOINT ["npx", "tsx", "src/index.ts", "--yes", "-o", "/output"]
