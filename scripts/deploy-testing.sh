#!/bin/bash
# =============================================================================
# deploy-testing.sh — Deploy Observator to EC2 testing instance
# =============================================================================
#
# WHY THIS EXISTS:
# After Terraform creates the EC2 instance, this script handles the actual
# application deployment: copying files, building images, running containers,
# and running database migrations.
#
# USAGE:
#   ./scripts/deploy-testing.sh
#   ./scripts/deploy-testing.sh --skip-build   # Skip Docker build (redeploy only)
#   ./scripts/deploy-testing.sh --migrate-only  # Only run migrations
#
# PREREQUISITES:
# 1. Terraform has been applied: cd terraform/environments/testing && terraform apply
# 2. .env.prod exists in the project root with real secrets
# 3. SSH key exists at terraform/environments/testing/observator-testing.pem
#
# WHAT'S HAPPENING:
# 1. Read SSH key path and public IP from Terraform outputs
# 2. Rsync project files to the EC2 instance
# 3. Build Docker images on the EC2 instance
# 4. Start all containers with docker compose
# 5. Run Alembic database migrations
# 6. Verify health of all services
#
# GOTCHAS:
# - First deployment takes 5-10 minutes (Docker image builds are slow on t3.medium)
# - Subsequent deploys take 1-3 minutes (Docker layer caching helps)
# - The .env.prod file is copied to the server — make sure it has real values
# - If rsync fails, ensure your SSH key has correct permissions (chmod 400)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$PROJECT_DIR/terraform/environments/testing"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SKIP_BUILD=false
MIGRATE_ONLY=false
for arg in "$@"; do
    case $arg in
        --skip-build)   SKIP_BUILD=true ;;
        --migrate-only) MIGRATE_ONLY=true ;;
        *)              echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  Observator Testing Deployment${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ── Step 1: Get Terraform outputs ──────────────────────────────────────────
echo -e "${YELLOW}>>> Step 1: Reading Terraform outputs...${NC}"

if [ ! -f "$TF_DIR/terraform.tfstate" ] && [ ! -d "$TF_DIR/.terraform" ]; then
    echo -e "${RED}ERROR: Terraform state not found. Run Terraform first:${NC}"
    echo "  cd terraform/environments/testing"
    echo "  terraform init"
    echo "  terraform apply"
    exit 1
fi

cd "$TF_DIR"
PUBLIC_IP=$(terraform output -raw public_ip 2>/dev/null || echo "")
SSH_KEY=$(terraform output -raw ssh_key_path 2>/dev/null || echo "")

if [ -z "$PUBLIC_IP" ]; then
    echo -e "${RED}ERROR: Could not read public_ip from Terraform outputs.${NC}"
    echo "  Did you run 'terraform apply' successfully?"
    exit 1
fi

# Resolve the SSH key path
if [[ "$SSH_KEY" == ./* ]] || [[ "$SSH_KEY" == ../* ]]; then
    SSH_KEY="$TF_DIR/$SSH_KEY"
fi
# Handle Terraform path format
SSH_KEY_FILE="$TF_DIR/observator-testing.pem"
if [ -f "$SSH_KEY_FILE" ]; then
    SSH_KEY="$SSH_KEY_FILE"
fi

echo "  Public IP:  $PUBLIC_IP"
echo "  SSH Key:    $SSH_KEY"
echo ""

cd "$PROJECT_DIR"

# Verify SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}ERROR: SSH key not found at $SSH_KEY${NC}"
    exit 1
fi

# SSH options (disable host key checking for testing)
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"
SSH_USER="ec2-user"
SSH_HOST="$SSH_USER@$PUBLIC_IP"
REMOTE_DIR="/opt/observator"

# ── Step 2: Wait for instance to be ready ──────────────────────────────────
echo -e "${YELLOW}>>> Step 2: Waiting for instance to be ready...${NC}"
MAX_RETRIES=30
for i in $(seq 1 $MAX_RETRIES); do
    if ssh $SSH_OPTS "$SSH_HOST" "echo 'SSH ready'" 2>/dev/null; then
        echo -e "  ${GREEN}SSH connection successful${NC}"
        break
    fi
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo -e "${RED}ERROR: Could not connect via SSH after $MAX_RETRIES attempts${NC}"
        exit 1
    fi
    echo "  Attempt $i/$MAX_RETRIES - waiting 10s..."
    sleep 10
done

# Wait for Docker to be available (userdata script may still be running)
echo "  Waiting for Docker..."
for i in $(seq 1 20); do
    if ssh $SSH_OPTS "$SSH_HOST" "docker --version" 2>/dev/null; then
        echo -e "  ${GREEN}Docker is ready${NC}"
        break
    fi
    if [ "$i" -eq 20 ]; then
        echo -e "${RED}ERROR: Docker not available. Check /var/log/userdata.log on the instance${NC}"
        exit 1
    fi
    echo "  Attempt $i/20 - Docker not ready yet, waiting 15s..."
    sleep 15
done
echo ""

if $MIGRATE_ONLY; then
    echo -e "${YELLOW}>>> Running migrations only...${NC}"
    ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml exec api alembic upgrade head"
    echo -e "${GREEN}Migrations complete!${NC}"
    exit 0
fi

# ── Step 3: Check .env.prod exists ─────────────────────────────────────────
echo -e "${YELLOW}>>> Step 3: Checking .env.prod...${NC}"
if [ ! -f "$PROJECT_DIR/.env.prod" ]; then
    echo -e "${RED}ERROR: .env.prod not found in project root${NC}"
    echo "  Create it from template:"
    echo "    cp .env.prod.example .env.prod"
    echo "    # Then edit .env.prod with real values"
    exit 1
fi
echo -e "  ${GREEN}.env.prod found${NC}"
echo ""

# ── Step 4: Sync project files to EC2 ─────────────────────────────────────
echo -e "${YELLOW}>>> Step 4: Syncing project files to EC2...${NC}"
echo "  This may take 1-3 minutes on first deploy..."

# Create remote directory structure
ssh $SSH_OPTS "$SSH_HOST" "mkdir -p $REMOTE_DIR/{docker,observator-backend,uae-labour-pulse}"

# Rsync the necessary files (exclude unnecessary stuff)
rsync -avz --progress \
    -e "ssh $SSH_OPTS" \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='__pycache__' \
    --exclude='.venv' \
    --exclude='*.pyc' \
    --exclude='.pytest_cache' \
    --exclude='terraform' \
    --exclude='dist' \
    --exclude='.env' \
    --exclude='.env.prod' \
    --exclude='*.pem' \
    --exclude='.next' \
    --exclude='coverage' \
    --exclude='.mypy_cache' \
    "$PROJECT_DIR/" "$SSH_HOST:$REMOTE_DIR/"

# Copy .env.prod separately (it was excluded above for safety)
echo "  Copying .env.prod..."
scp $SSH_OPTS "$PROJECT_DIR/.env.prod" "$SSH_HOST:$REMOTE_DIR/.env.prod"

echo -e "  ${GREEN}Files synced${NC}"
echo ""

# ── Step 5: Build and start containers ─────────────────────────────────────
if $SKIP_BUILD; then
    echo -e "${YELLOW}>>> Step 5: Restarting containers (skip-build mode)...${NC}"
    ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d"
else
    echo -e "${YELLOW}>>> Step 5: Building and starting containers...${NC}"
    echo "  First build takes 5-10 minutes. Subsequent builds are faster (Docker cache)."
    ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml build --parallel && docker compose -f docker-compose.prod.yml up -d"
fi

echo -e "  ${GREEN}Containers started${NC}"
echo ""

# ── Step 6: Wait for services to be healthy ────────────────────────────────
echo -e "${YELLOW}>>> Step 6: Waiting for services to be healthy...${NC}"
sleep 10

# Wait for the API to be healthy
MAX_HEALTH_RETRIES=30
for i in $(seq 1 $MAX_HEALTH_RETRIES); do
    HEALTH=$(ssh $SSH_OPTS "$SSH_HOST" "curl -s http://localhost/api/health 2>/dev/null" || echo '{"status":"starting"}')
    STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "starting")

    if [ "$STATUS" = "ok" ] || [ "$STATUS" = "degraded" ]; then
        echo -e "  ${GREEN}API health: $STATUS${NC}"
        echo "  Response: $HEALTH"
        break
    fi
    if [ "$i" -eq "$MAX_HEALTH_RETRIES" ]; then
        echo -e "${YELLOW}WARNING: API health check did not pass after ${MAX_HEALTH_RETRIES} attempts${NC}"
        echo "  Last response: $HEALTH"
        echo "  Check logs: ssh $SSH_OPTS $SSH_HOST 'cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml logs api'"
    fi
    echo "  Attempt $i/$MAX_HEALTH_RETRIES - status: $STATUS, waiting 10s..."
    sleep 10
done
echo ""

# ── Step 7: Run database migrations ───────────────────────────────────────
echo -e "${YELLOW}>>> Step 7: Running database migrations...${NC}"
ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml exec -T api alembic upgrade head" || {
    echo -e "${YELLOW}WARNING: Migrations may have failed. Check manually.${NC}"
    echo "  SSH in: ssh $SSH_OPTS $SSH_HOST"
    echo "  Then: cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml exec api alembic upgrade head"
}
echo ""

# ── Step 8: Show container status ──────────────────────────────────────────
echo -e "${YELLOW}>>> Step 8: Container status...${NC}"
ssh $SSH_OPTS "$SSH_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml ps"
echo ""

# ── Step 9: Show resource usage ────────────────────────────────────────────
echo -e "${YELLOW}>>> Step 9: Resource usage...${NC}"
ssh $SSH_OPTS "$SSH_HOST" "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}'" || true
echo ""

# ── Done ──────────────────────────────────────────────────────────────────
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  App URL:     http://$PUBLIC_IP"
echo "  Health:      http://$PUBLIC_IP/api/health"
echo ""
echo "  SSH access:  ssh $SSH_OPTS $SSH_HOST"
echo "  View logs:   ssh $SSH_OPTS $SSH_HOST 'cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml logs -f'"
echo "  Redeploy:    ./scripts/deploy-testing.sh"
echo "  Quick build: ./scripts/deploy-testing.sh --skip-build"
echo ""
