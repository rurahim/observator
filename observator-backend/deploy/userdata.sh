#!/bin/bash
set -euo pipefail

# Log everything
exec > /var/log/observator-setup.log 2>&1

echo "=== Starting Observator Backend Setup ==="

# Update system
apt-get update -y
apt-get install -y docker.io docker-compose-v2 git awscli

# Start Docker
systemctl enable docker
systemctl start docker

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# Clone the repo
cd /home/ubuntu
sudo -u ubuntu git clone https://github.com/MuhammadAbdullah95/observator-backend.git app
cd app

# Create production .env (will be populated via SSM or manually)
cat > .env << 'ENVEOF'
DATABASE_URL=postgresql+asyncpg://observator:observator@postgres:5432/observator
DATABASE_URL_SYNC=postgresql://observator:observator@postgres:5432/observator
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=observator
MINIO_SECURE=false
QDRANT_HOST=qdrant
QDRANT_PORT=6333
QDRANT_COLLECTION=evidence
REDIS_URL=redis://redis:6379/0
JWT_SECRET=__JWT_SECRET__
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24
OPENAI_API_KEY=__OPENAI_API_KEY__
OPENAI_MODEL=gpt-5.4
LANGFUSE_SECRET_KEY=__LANGFUSE_SECRET_KEY__
LANGFUSE_PUBLIC_KEY=__LANGFUSE_PUBLIC_KEY__
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_ENABLED=true
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=false
MIN_COHORT_SIZE=10
MAX_QUERY_LIMIT=1000
ENVEOF

# Create production docker-compose override (no volume mounts, no reload)
cat > docker-compose.prod.yml << 'COMPEOF'
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file: .env
    environment:
      - DATABASE_URL=postgresql+asyncpg://observator:observator@postgres:5432/observator
      - DATABASE_URL_SYNC=postgresql://observator:observator@postgres:5432/observator
      - MINIO_ENDPOINT=minio:9000
      - QDRANT_HOST=qdrant
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_started
      qdrant:
        condition: service_started
      redis:
        condition: service_started
    deploy:
      resources:
        limits:
          memory: 1G
    restart: always

  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: observator
      POSTGRES_USER: observator
      POSTGRES_PASSWORD: observator
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U observator"]
      interval: 5s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M
    restart: always

  minio:
    image: minio/minio:latest
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    deploy:
      resources:
        limits:
          memory: 256M
    restart: always

  qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - qdrant_data:/qdrant/storage
    deploy:
      resources:
        limits:
          memory: 256M
    restart: always

  redis:
    image: redis:7-alpine
    deploy:
      resources:
        limits:
          memory: 64M
    restart: always

volumes:
  pg_data:
  minio_data:
  qdrant_data:
COMPEOF

chown -R ubuntu:ubuntu /home/ubuntu/app

echo "=== Setup Complete — Run: cd /home/ubuntu/app && docker compose -f docker-compose.prod.yml up -d ==="
