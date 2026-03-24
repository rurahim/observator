#!/bin/bash
# =============================================================================
# run-migrations.sh — Run Alembic migrations against the RDS database
# =============================================================================
#
# WHY THIS EXISTS:
# Database migrations (adding tables, columns, indexes) need to run against
# the production RDS instance. Since RDS is in a private subnet (no internet
# access), we run migrations as a one-off ECS task that has network access
# to RDS.
#
# USAGE:
#   ./scripts/run-migrations.sh staging
#   ./scripts/run-migrations.sh production
#
# WHAT IT DOES:
# 1. Creates a one-off ECS task using the backend image
# 2. Overrides the CMD to run `alembic upgrade head`
# 3. Waits for the task to complete
# 4. Shows the task logs
#
# GOTCHAS:
# - This runs as a Fargate task, so it costs ~$0.01 for a 2-minute migration.
# - If the migration fails, check CloudWatch logs at:
#   /ecs/observator-{env}/backend
# - ALWAYS run migrations BEFORE deploying new backend code that depends on
#   the schema changes. The CI/CD pipeline does NOT run migrations automatically
#   (this is intentional — migrations should be reviewed and run manually).
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
REGION="${AWS_REGION:-me-south-1}"
PROJECT="observator"
CLUSTER="${PROJECT}-${ENVIRONMENT}"
TASK_FAMILY="${PROJECT}-${ENVIRONMENT}-backend"

echo "=== Running Alembic Migrations ($ENVIRONMENT) ==="
echo ""

# Get the latest task definition ARN
TASK_DEF=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "${PROJECT}-${ENVIRONMENT}-backend" \
    --region "$REGION" \
    --query "services[0].taskDefinition" \
    --output text)

echo "Using task definition: $TASK_DEF"

# Get network configuration from the existing service
SUBNETS=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "${PROJECT}-${ENVIRONMENT}-backend" \
    --region "$REGION" \
    --query "services[0].networkConfiguration.awsvpcConfiguration.subnets" \
    --output json)

SECURITY_GROUPS=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "${PROJECT}-${ENVIRONMENT}-backend" \
    --region "$REGION" \
    --query "services[0].networkConfiguration.awsvpcConfiguration.securityGroups" \
    --output json)

echo "Subnets: $SUBNETS"
echo "Security Groups: $SECURITY_GROUPS"
echo ""

# Run the migration as a one-off task
echo "Starting migration task..."
TASK_ARN=$(aws ecs run-task \
    --cluster "$CLUSTER" \
    --task-definition "$TASK_DEF" \
    --launch-type FARGATE \
    --platform-version "1.4.0" \
    --network-configuration "{
        \"awsvpcConfiguration\": {
            \"subnets\": $SUBNETS,
            \"securityGroups\": $SECURITY_GROUPS,
            \"assignPublicIp\": \"DISABLED\"
        }
    }" \
    --overrides '{
        "containerOverrides": [{
            "name": "backend",
            "command": ["alembic", "upgrade", "head"]
        }]
    }' \
    --region "$REGION" \
    --query "tasks[0].taskArn" \
    --output text)

TASK_ID=$(echo "$TASK_ARN" | rev | cut -d'/' -f1 | rev)
echo "Task started: $TASK_ID"
echo ""

# Wait for the task to complete
echo "Waiting for migration to complete..."
aws ecs wait tasks-stopped \
    --cluster "$CLUSTER" \
    --tasks "$TASK_ARN" \
    --region "$REGION"

# Check exit code
EXIT_CODE=$(aws ecs describe-tasks \
    --cluster "$CLUSTER" \
    --tasks "$TASK_ARN" \
    --region "$REGION" \
    --query "tasks[0].containers[0].exitCode" \
    --output text)

echo ""
if [ "$EXIT_CODE" = "0" ]; then
    echo "=== Migration Completed Successfully ==="
else
    echo "=== Migration FAILED (exit code: $EXIT_CODE) ==="
    echo ""
    echo "Check logs at:"
    echo "  aws logs get-log-events \\"
    echo "    --log-group-name /ecs/${PROJECT}-${ENVIRONMENT}/backend \\"
    echo "    --log-stream-name backend/${PROJECT}-${ENVIRONMENT}-backend/${TASK_ID} \\"
    echo "    --region $REGION"
    exit 1
fi
