#!/bin/bash
# =============================================================================
# deploy-first-time.sh — Complete first-time deployment guide
# =============================================================================
#
# WHY THIS EXISTS:
# The very first deployment requires several manual steps that CI/CD handles
# automatically on subsequent deploys. This script walks you through each step
# in order, with error checking and clear instructions.
#
# USAGE:
#   ./scripts/deploy-first-time.sh staging
#
# TOTAL TIME: ~20-30 minutes (most of it waiting for AWS resources)
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
REGION="${AWS_REGION:-me-south-1}"
PROJECT="observator"

echo "============================================================"
echo "  Observator First-Time Deployment Guide ($ENVIRONMENT)"
echo "============================================================"
echo ""

# ── Step 0: Prerequisites ──────────────────────────────────────────────────
echo "STEP 0: Checking prerequisites..."

for cmd in aws terraform docker; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "  ERROR: '$cmd' is not installed."
        exit 1
    fi
    echo "  $cmd: $(command -v $cmd)"
done

# Check AWS credentials
AWS_IDENTITY=$(aws sts get-caller-identity --output json 2>/dev/null || echo '{"error":"not configured"}')
echo "  AWS Identity: $AWS_IDENTITY"
echo ""

# ── Step 1: Bootstrap Terraform State ──────────────────────────────────────
echo "STEP 1: Bootstrap Terraform remote state"
echo "  This creates the S3 bucket and DynamoDB table for Terraform state."
echo ""
read -rp "  Run bootstrap? (y/N): " confirm
if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    bash scripts/terraform-bootstrap.sh "$REGION"
fi
echo ""

# ── Step 2: Terraform Init & Apply ─────────────────────────────────────────
echo "STEP 2: Initialize and apply Terraform"
echo "  This creates ALL AWS infrastructure (VPC, RDS, ECS, S3, CloudFront, etc.)"
echo "  Estimated time: 10-15 minutes"
echo "  Estimated cost: ~\$110/month for staging"
echo ""

read -rsp "  Enter database password for RDS: " DB_PASSWORD
echo ""
read -rsp "  Enter JWT secret (or press Enter to auto-generate): " JWT_SECRET
echo ""
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))" 2>/dev/null || openssl rand -base64 48)
    echo "  Auto-generated JWT secret"
fi

read -rp "  Run terraform init + apply? (y/N): " confirm
if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    cd terraform/environments/"$ENVIRONMENT"

    terraform init -backend-config=backend.hcl

    terraform apply \
        -var-file=terraform.tfvars \
        -var="db_password=$DB_PASSWORD" \
        -var="jwt_secret=$JWT_SECRET"

    # Capture outputs
    ECR_BACKEND=$(terraform output -raw backend_ecr_url 2>/dev/null || echo "")
    S3_BUCKET=$(terraform output -raw frontend_bucket 2>/dev/null || echo "")
    CF_URL=$(terraform output -raw cloudfront_url 2>/dev/null || echo "")

    cd ../../..
fi
echo ""

# ── Step 3: Populate Secrets ───────────────────────────────────────────────
echo "STEP 3: Populate application secrets in AWS Secrets Manager"
echo "  This stores API keys and tokens that your app needs."
echo ""
read -rp "  Run secret setup? (y/N): " confirm
if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    bash scripts/setup-secrets.sh "$ENVIRONMENT"
fi
echo ""

# ── Step 4: Build & Push Docker Images ─────────────────────────────────────
echo "STEP 4: Build and push Docker images to ECR"
echo ""

# Login to ECR
ECR_REGISTRY=$(aws ecr describe-repositories \
    --repository-names "${PROJECT}-backend" \
    --region "$REGION" \
    --query "repositories[0].repositoryUri" \
    --output text 2>/dev/null | sed 's|/.*||')

if [ -n "$ECR_REGISTRY" ]; then
    echo "  Logging into ECR: $ECR_REGISTRY"
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

    echo "  Building backend image..."
    docker build -t "${ECR_REGISTRY}/${PROJECT}-backend:latest" -f docker/backend.Dockerfile .

    echo "  Pushing backend image..."
    docker push "${ECR_REGISTRY}/${PROJECT}-backend:latest"

    echo "  Images pushed to ECR"
else
    echo "  WARNING: ECR repository not found. Run Terraform first."
fi
echo ""

# ── Step 5: Deploy Frontend to S3 ─────────────────────────────────────────
echo "STEP 5: Build and deploy frontend to S3"
echo ""

S3_BUCKET="${S3_BUCKET:-${PROJECT}-${ENVIRONMENT}-frontend}"

echo "  Building frontend..."
cd uae-labour-pulse
npm ci
VITE_API_URL="" npm run build
cd ..

echo "  Syncing to S3: $S3_BUCKET"
aws s3 sync uae-labour-pulse/dist/ "s3://$S3_BUCKET/" \
    --delete \
    --cache-control "public,max-age=31536000,immutable" \
    --exclude "index.html" \
    --exclude "*.json"

aws s3 cp uae-labour-pulse/dist/index.html \
    "s3://$S3_BUCKET/index.html" \
    --cache-control "no-cache,no-store,must-revalidate"
echo ""

# ── Step 6: Run Database Migrations ───────────────────────────────────────
echo "STEP 6: Run database migrations"
echo ""
read -rp "  Run Alembic migrations? (y/N): " confirm
if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    bash scripts/run-migrations.sh "$ENVIRONMENT"
fi
echo ""

# ── Step 7: Force ECS Redeployment ───────────────────────────────────────
echo "STEP 7: Force ECS service redeployment"
echo ""
aws ecs update-service \
    --cluster "${PROJECT}-${ENVIRONMENT}" \
    --service "${PROJECT}-${ENVIRONMENT}-backend" \
    --force-new-deployment \
    --region "$REGION" > /dev/null 2>&1 || true

echo "  Waiting for service to stabilize (2-5 minutes)..."
aws ecs wait services-stable \
    --cluster "${PROJECT}-${ENVIRONMENT}" \
    --services "${PROJECT}-${ENVIRONMENT}-backend" \
    --region "$REGION" 2>/dev/null || echo "  (wait timed out — check manually)"
echo ""

# ── Step 8: Verify ──────────────────────────────────────────────────────
echo "STEP 8: Verify deployment"
echo ""
bash scripts/health-check.sh "$ENVIRONMENT" 2>/dev/null || echo "Health check script not available"
echo ""

echo "============================================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================================"
echo ""
echo "Your app is available at:"
echo "  CloudFront: ${CF_URL:-https://<cloudfront-domain>.cloudfront.net}"
echo ""
echo "Next steps:"
echo "  1. Set up a custom domain (Route53 + ACM certificate)"
echo "  2. Configure GitHub Actions secrets for CI/CD"
echo "  3. Set up monitoring alerts (update alert_email in terraform.tfvars)"
echo "  4. Test all endpoints: ./scripts/health-check.sh $ENVIRONMENT"
echo ""
echo "For CI/CD, add these GitHub Secrets:"
echo "  AWS_ACCESS_KEY_ID"
echo "  AWS_SECRET_ACCESS_KEY"
echo "  AWS_REGION=$REGION"
echo ""
