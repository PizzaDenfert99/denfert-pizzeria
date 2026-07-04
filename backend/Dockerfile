# Pizza Denfert — backend Dockerfile
#
# Small production image running the FastAPI backend on port 8001.
# The image is stateless — MongoDB, Nginx, TLS, and secrets are provided by
# docker-compose.yml on the host VPS.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install curl for the HEALTHCHECK. build-essential is needed on some ARM64
# hosts (e.g. Hetzner CAX) to compile bcrypt / pywebpush wheels.
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps in a separate layer so code changes don't invalidate
# the wheel cache.
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Copy application code. tests/ are intentionally excluded via .dockerignore.
COPY server.py /app/server.py

# Non-root runtime user (safer for VPS hosting).
RUN adduser --system --group --no-create-home app && chown -R app:app /app
USER app

EXPOSE 8001

# Container-level health probe. Compose + Nginx also probe this externally.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD curl -fsS http://127.0.0.1:8001/api/healthz || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers", "--forwarded-allow-ips=*"]
