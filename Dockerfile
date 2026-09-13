# ==========================================
# Stage 1: Build Frontend Assets
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Python Backend & Production Image
# ==========================================
FROM python:3.11-slim AS runner

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend app
COPY backend/app ./app

# Copy built frontend assets
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Default storage directory for persistent SQLite & state
VOLUME ["/app/data"]
ENV DATA_DIR=/app/data
ENV PORT=6064
ENV HOST=0.0.0.0

EXPOSE 6064

CMD ["python", "-m", "app.main"]
