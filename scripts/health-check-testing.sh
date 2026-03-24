#!/bin/bash
# =============================================================================
# health-check-testing.sh — Check health of all services on EC2 testing instance
# =============================================================================
#
# USAGE:
#   ./scripts/health-check-testing.sh              # Use IP from Terraform
#   ./scripts/health-check-testing.sh 1.2.3.4      # Specify IP directly
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$PROJECT_DIR/terraform/environments/testing"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get public IP
if [ -n "${1:-}" ]; then
    PUBLIC_IP="$1"
else
    cd "$TF_DIR"
    PUBLIC_IP=$(terraform output -raw public_ip 2>/dev/null || echo "")
    cd "$PROJECT_DIR"
    if [ -z "$PUBLIC_IP" ]; then
        echo -e "${RED}ERROR: Could not read public_ip. Pass IP as argument or run terraform apply first.${NC}"
        exit 1
    fi
fi

echo "=== Observator Testing Health Check ==="
echo "  Target: http://$PUBLIC_IP"
echo ""

# ── Check Frontend (nginx) ────────────────────────────────────────────────
echo "-- Frontend (nginx) --"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$PUBLIC_IP/" --max-time 10 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "  ${GREEN}[OK]${NC} HTTP $HTTP_CODE - http://$PUBLIC_IP/"
else
    echo -e "  ${RED}[FAIL]${NC} HTTP $HTTP_CODE - http://$PUBLIC_IP/"
fi

# ── Check Nginx Health ────────────────────────────────────────────────────
echo ""
echo "-- Nginx Health Endpoint --"
NGINX_HEALTH=$(curl -s "http://$PUBLIC_IP/health" --max-time 5 2>/dev/null || echo '{"error":"unreachable"}')
echo "  Response: $NGINX_HEALTH"

# ── Check Backend API ─────────────────────────────────────────────────────
echo ""
echo "-- Backend API --"
API_HEALTH=$(curl -s "http://$PUBLIC_IP/api/health" --max-time 10 2>/dev/null || echo '{"error":"unreachable"}')
echo "  Response: $API_HEALTH"

# Parse individual service statuses
if command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
try:
    d = json.loads('$API_HEALTH')
    services = ['db', 'minio', 'qdrant', 'redis']
    for s in services:
        status = d.get(s, 'unknown')
        icon = '\033[0;32m[OK]\033[0m' if status == 'ok' else '\033[0;31m[FAIL]\033[0m'
        print(f'  {icon} {s}: {status}')
    overall = d.get('status', 'unknown')
    icon = '\033[0;32m[OK]\033[0m' if overall in ('ok', 'degraded') else '\033[0;31m[FAIL]\033[0m'
    print(f'  {icon} Overall: {overall}')
except:
    print('  Could not parse response')
" 2>/dev/null || true
fi

# ── Check via SSH (container status) ──────────────────────────────────────
echo ""
echo "-- Container Status (via SSH) --"
SSH_KEY="$TF_DIR/observator-testing.pem"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5"

if [ -f "$SSH_KEY" ]; then
    ssh $SSH_OPTS "ec2-user@$PUBLIC_IP" \
        "cd /opt/observator && docker compose -f docker-compose.prod.yml ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'" 2>/dev/null || \
        echo -e "  ${YELLOW}Could not connect via SSH${NC}"

    echo ""
    echo "-- Resource Usage --"
    ssh $SSH_OPTS "ec2-user@$PUBLIC_IP" \
        "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'" 2>/dev/null || true

    echo ""
    echo "-- Disk Usage --"
    ssh $SSH_OPTS "ec2-user@$PUBLIC_IP" "df -h / | tail -1" 2>/dev/null || true

    echo ""
    echo "-- Memory --"
    ssh $SSH_OPTS "ec2-user@$PUBLIC_IP" "free -h | head -2" 2>/dev/null || true
else
    echo -e "  ${YELLOW}SSH key not found at $SSH_KEY — skipping SSH checks${NC}"
fi

echo ""
echo "=== Health Check Complete ==="
