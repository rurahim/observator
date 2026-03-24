#!/bin/bash
# =============================================================================
# setup-secrets.sh — Populate AWS Secrets Manager with application secrets
# =============================================================================
#
# WHY THIS EXISTS:
# After Terraform creates the Secrets Manager secret (with placeholder values),
# you need to populate it with real secrets. This script prompts you for each
# value and updates the secret safely.
#
# USAGE:
#   ./scripts/setup-secrets.sh staging
#   ./scripts/setup-secrets.sh production
#
# PREREQUISITES:
#   - AWS CLI configured with appropriate permissions
#   - The Terraform stack has been applied (secret exists in AWS)
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
SECRET_NAME="observator/${ENVIRONMENT}/app-secrets"
REGION="${AWS_REGION:-me-south-1}"

echo "=== Observator Secrets Setup ==="
echo "Environment: $ENVIRONMENT"
echo "Secret:      $SECRET_NAME"
echo "Region:      $REGION"
echo ""
echo "You will be prompted for each secret value."
echo "Press Enter to keep the existing value (if any)."
echo ""

# Read current secret values (if they exist)
CURRENT=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --region "$REGION" \
    --query SecretString \
    --output text 2>/dev/null || echo '{}')

# Helper to read a value with a default
read_secret() {
    local key="$1"
    local description="$2"
    local current_val
    current_val=$(echo "$CURRENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$key',''))" 2>/dev/null || echo "")

    if [ -n "$current_val" ] && [ "$current_val" != "CHANGE_ME_BEFORE_DEPLOY" ]; then
        local masked="${current_val:0:6}...${current_val: -4}"
        read -rp "  $description [$masked]: " value
        echo "${value:-$current_val}"
    else
        read -rp "  $description: " value
        echo "$value"
    fi
}

echo "── JWT ──────────────────────────────────────────────────"
JWT_SECRET=$(read_secret "JWT_SECRET" "JWT Secret (64+ char random string)")
if [ -z "$JWT_SECRET" ]; then
    echo "  Generating random JWT secret..."
    JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))")
    echo "  Generated: ${JWT_SECRET:0:10}..."
fi

echo ""
echo "── OpenAI ────────────────────────────────────────────────"
OPENAI_API_KEY=$(read_secret "OPENAI_API_KEY" "OpenAI API Key (sk-proj-...)")
OPENAI_MODEL=$(read_secret "OPENAI_MODEL" "OpenAI Model")
OPENAI_MODEL="${OPENAI_MODEL:-gpt-5.4}"

echo ""
echo "── Langfuse ──────────────────────────────────────────────"
LANGFUSE_SECRET_KEY=$(read_secret "LANGFUSE_SECRET_KEY" "Langfuse Secret Key (sk-lf-...)")
LANGFUSE_PUBLIC_KEY=$(read_secret "LANGFUSE_PUBLIC_KEY" "Langfuse Public Key (pk-lf-...)")

echo ""
echo "── MinIO ─────────────────────────────────────────────────"
MINIO_ACCESS_KEY=$(read_secret "MINIO_ACCESS_KEY" "MinIO Access Key")
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY=$(read_secret "MINIO_SECRET_KEY" "MinIO Secret Key")

echo ""
echo "Updating secret in AWS Secrets Manager..."

SECRET_JSON=$(cat <<EOF
{
    "JWT_SECRET": "$JWT_SECRET",
    "OPENAI_API_KEY": "$OPENAI_API_KEY",
    "OPENAI_MODEL": "$OPENAI_MODEL",
    "LANGFUSE_SECRET_KEY": "$LANGFUSE_SECRET_KEY",
    "LANGFUSE_PUBLIC_KEY": "$LANGFUSE_PUBLIC_KEY",
    "MINIO_ACCESS_KEY": "$MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY": "$MINIO_SECRET_KEY"
}
EOF
)

aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_JSON" \
    --region "$REGION"

echo ""
echo "=== Secrets Updated Successfully ==="
echo "The ECS service will pick up new secrets on next deployment."
echo "To force a redeployment now, run:"
echo "  aws ecs update-service --cluster observator-${ENVIRONMENT} --service observator-${ENVIRONMENT}-backend --force-new-deployment"
