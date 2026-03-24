#!/bin/bash
# =============================================================================
# health-check.sh — Check health of all Observator services
# =============================================================================
#
# USAGE:
#   ./scripts/health-check.sh staging
#   ./scripts/health-check.sh production
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
REGION="${AWS_REGION:-me-south-1}"
PROJECT="observator"

echo "=== Observator Health Check ($ENVIRONMENT) ==="
echo ""

# ── Get ALB URL ──────────────────────────────────────────────────────────────
ALB_URL=$(aws elbv2 describe-load-balancers \
    --names "${PROJECT}-${ENVIRONMENT}-alb" \
    --region "$REGION" \
    --query "LoadBalancers[0].DNSName" \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$ALB_URL" = "NOT_FOUND" ] || [ "$ALB_URL" = "None" ]; then
    echo "ERROR: ALB not found. Is the infrastructure deployed?"
    exit 1
fi

echo "ALB: http://$ALB_URL"
echo ""

# ── Check Backend Health ────────────────────────────────────────────────────
echo "── Backend API ──────────────────────────────────────────"
RESPONSE=$(curl -s --max-time 10 "http://$ALB_URL/api/health" 2>/dev/null || echo '{"error":"unreachable"}')
echo "  Response: $RESPONSE"

if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status') in ('ok','degraded') else 1)" 2>/dev/null; then
    echo "  Status: OK"
else
    echo "  Status: FAILED"
fi

echo ""

# ── Check ECS Services ─────────────────────────────────────────────────────
echo "── ECS Services ─────────────────────────────────────────"
for SERVICE in backend qdrant minio; do
    SERVICE_NAME="${PROJECT}-${ENVIRONMENT}-${SERVICE}"
    STATUS=$(aws ecs describe-services \
        --cluster "${PROJECT}-${ENVIRONMENT}" \
        --services "$SERVICE_NAME" \
        --region "$REGION" \
        --query "services[0].{desired:desiredCount,running:runningCount,status:status}" \
        --output json 2>/dev/null || echo '{"error":"not found"}')
    echo "  $SERVICE: $STATUS"
done

echo ""

# ── Check RDS ───────────────────────────────────────────────────────────────
echo "── RDS Database ───────────────────────────────────────────"
RDS_STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier "${PROJECT}-${ENVIRONMENT}-db" \
    --region "$REGION" \
    --query "DBInstances[0].DBInstanceStatus" \
    --output text 2>/dev/null || echo "NOT_FOUND")
echo "  Status: $RDS_STATUS"

echo ""

# ── Check Redis ─────────────────────────────────────────────────────────────
echo "── ElastiCache Redis ─────────────────────────────────────"
REDIS_STATUS=$(aws elasticache describe-cache-clusters \
    --cache-cluster-id "${PROJECT}-${ENVIRONMENT}-redis" \
    --region "$REGION" \
    --query "CacheClusters[0].CacheClusterStatus" \
    --output text 2>/dev/null || echo "NOT_FOUND")
echo "  Status: $REDIS_STATUS"

echo ""

# ── Check CloudFront ────────────────────────────────────────────────────────
echo "── CloudFront ────────────────────────────────────────────"
CF_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='${PROJECT} ${ENVIRONMENT} distribution'].DomainName" \
    --output text 2>/dev/null || echo "NOT_FOUND")
echo "  Domain: $CF_DOMAIN"
if [ "$CF_DOMAIN" != "NOT_FOUND" ] && [ "$CF_DOMAIN" != "None" ]; then
    CF_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$CF_DOMAIN" --max-time 10 2>/dev/null || echo "000")
    echo "  HTTP Status: $CF_CODE"
fi

echo ""
echo "=== Health Check Complete ==="
