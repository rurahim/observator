#!/bin/bash
# =============================================================================
# rollback.sh — Roll back to a previous deployment
# =============================================================================
#
# WHY THIS EXISTS:
# When a deployment goes wrong, you need to roll back FAST. This script:
# 1. Finds the previous ECS task definition revision
# 2. Updates the service to use that revision
# 3. Optionally restores the previous frontend from S3 versioning
#
# USAGE:
#   ./scripts/rollback.sh staging          # Roll back backend to previous revision
#   ./scripts/rollback.sh production       # Roll back backend to previous revision
#   ./scripts/rollback.sh staging --frontend  # Also roll back frontend
#
# GOTCHAS:
# - ECS keeps the last 100 task definition revisions. You can roll back to
#   any of them, not just the immediately previous one.
# - Frontend rollback uses S3 versioning. It restores the previous version
#   of index.html (which references the correct asset hashes).
# - Database migrations are NOT rolled back. If your deployment included a
#   migration, you need to manually run a down migration.
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
ROLLBACK_FRONTEND="${2:-}"
REGION="${AWS_REGION:-me-south-1}"
PROJECT="observator"
CLUSTER="${PROJECT}-${ENVIRONMENT}"
SERVICE="${PROJECT}-${ENVIRONMENT}-backend"
TASK_FAMILY="${PROJECT}-${ENVIRONMENT}-backend"

echo "=== Observator Rollback ($ENVIRONMENT) ==="
echo ""

# ── Find Current and Previous Task Definitions ─────────────────────────────
echo "Finding task definition revisions..."

CURRENT_TD=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --region "$REGION" \
    --query "services[0].taskDefinition" \
    --output text)

CURRENT_REV=$(echo "$CURRENT_TD" | grep -oP ':\K[0-9]+$')
PREVIOUS_REV=$((CURRENT_REV - 1))

echo "  Current:  $TASK_FAMILY:$CURRENT_REV"
echo "  Rollback: $TASK_FAMILY:$PREVIOUS_REV"
echo ""

# Verify previous revision exists
PREVIOUS_TD_STATUS=$(aws ecs describe-task-definition \
    --task-definition "${TASK_FAMILY}:${PREVIOUS_REV}" \
    --region "$REGION" \
    --query "taskDefinition.status" \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$PREVIOUS_TD_STATUS" != "ACTIVE" ]; then
    echo "ERROR: Previous task definition revision $PREVIOUS_REV is not active."
    echo "Available revisions:"
    aws ecs list-task-definitions \
        --family-prefix "$TASK_FAMILY" \
        --region "$REGION" \
        --query "taskDefinitionArns[-5:]" \
        --output table
    exit 1
fi

# ── Confirm Rollback ────────────────────────────────────────────────────────
read -rp "Roll back $SERVICE to revision $PREVIOUS_REV? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Rollback cancelled."
    exit 0
fi

# ── Roll Back ECS Service ──────────────────────────────────────────────────
echo ""
echo "Rolling back ECS service..."
aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --task-definition "${TASK_FAMILY}:${PREVIOUS_REV}" \
    --region "$REGION" \
    --output text > /dev/null

echo "  Service updated. Waiting for stabilization..."
aws ecs wait services-stable \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --region "$REGION"
echo "  Service is stable!"

# ── Roll Back Frontend (if requested) ──────────────────────────────────────
if [ "$ROLLBACK_FRONTEND" = "--frontend" ]; then
    echo ""
    echo "Rolling back frontend..."
    BUCKET="${PROJECT}-${ENVIRONMENT}-frontend"

    # Get the previous version of index.html
    PREV_VERSION=$(aws s3api list-object-versions \
        --bucket "$BUCKET" \
        --prefix "index.html" \
        --query "Versions[1].VersionId" \
        --output text 2>/dev/null || echo "")

    if [ -n "$PREV_VERSION" ] && [ "$PREV_VERSION" != "None" ]; then
        # Copy the previous version to become the current version
        aws s3api copy-object \
            --bucket "$BUCKET" \
            --copy-source "${BUCKET}/index.html?versionId=${PREV_VERSION}" \
            --key "index.html" \
            --cache-control "no-cache,no-store,must-revalidate" \
            --metadata-directive REPLACE > /dev/null
        echo "  Frontend rolled back to version $PREV_VERSION"

        # Invalidate CloudFront
        DISTRIBUTION_ID=$(aws cloudfront list-distributions \
            --query "DistributionList.Items[?Comment=='${PROJECT} ${ENVIRONMENT} distribution'].Id" \
            --output text 2>/dev/null || echo "")
        if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
            aws cloudfront create-invalidation \
                --distribution-id "$DISTRIBUTION_ID" \
                --paths "/index.html" "/" > /dev/null
            echo "  CloudFront cache invalidated"
        fi
    else
        echo "  WARNING: No previous frontend version found in S3"
    fi
fi

echo ""
echo "=== Rollback Complete ==="
echo ""
echo "Verify the rollback:"
echo "  ./scripts/health-check.sh $ENVIRONMENT"
