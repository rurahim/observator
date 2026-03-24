#!/bin/bash
# =============================================================================
# terraform-bootstrap.sh — One-time setup for Terraform remote state
# =============================================================================
#
# WHY THIS EXISTS:
# Terraform needs an S3 bucket and DynamoDB table to store its state remotely.
# This is a chicken-and-egg problem: you can't use Terraform to create the
# bucket that Terraform uses to store its state.
# So this script creates them manually using the AWS CLI.
#
# USAGE:
#   ./scripts/terraform-bootstrap.sh [region]
#   Example: ./scripts/terraform-bootstrap.sh me-south-1
#
# PREREQUISITES:
#   - AWS CLI installed and configured (`aws configure`)
#   - Sufficient IAM permissions (S3, DynamoDB, admin-level)
#
# THIS ONLY NEEDS TO RUN ONCE PER AWS ACCOUNT.
# =============================================================================

set -euo pipefail

REGION="${1:-me-south-1}"
BUCKET_NAME="observator-terraform-state"
TABLE_NAME="observator-terraform-locks"

echo "=== Terraform State Bootstrap ==="
echo "Region: $REGION"
echo "Bucket: $BUCKET_NAME"
echo "Table:  $TABLE_NAME"
echo ""

# ── Create S3 Bucket ────────────────────────────────────────────────────────
echo "Creating S3 bucket for Terraform state..."
if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
    echo "  Bucket already exists — skipping"
else
    # me-south-1 requires LocationConstraint (us-east-1 does not)
    if [ "$REGION" = "us-east-1" ]; then
        aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION"
    else
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --region "$REGION" \
            --create-bucket-configuration LocationConstraint="$REGION"
    fi
    echo "  Bucket created"
fi

# Enable versioning (allows state recovery if something goes wrong)
echo "Enabling bucket versioning..."
aws s3api put-bucket-versioning \
    --bucket "$BUCKET_NAME" \
    --versioning-configuration Status=Enabled
echo "  Versioning enabled"

# Enable server-side encryption
echo "Enabling bucket encryption..."
aws s3api put-bucket-encryption \
    --bucket "$BUCKET_NAME" \
    --server-side-encryption-configuration '{
        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]
    }'
echo "  Encryption enabled (KMS)"

# Block all public access
echo "Blocking public access..."
aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "  Public access blocked"

# ── Create DynamoDB Table for State Locking ──────────────────────────────────
echo ""
echo "Creating DynamoDB table for state locking..."
if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" &>/dev/null; then
    echo "  Table already exists — skipping"
else
    aws dynamodb create-table \
        --table-name "$TABLE_NAME" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --region "$REGION"

    echo "  Waiting for table to become active..."
    aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"
    echo "  Table created and active"
fi

echo ""
echo "=== Bootstrap Complete ==="
echo ""
echo "Next steps:"
echo "  1. cd terraform"
echo "  2. terraform init -backend-config=environments/staging/backend.hcl"
echo "  3. terraform plan -var-file=environments/staging/terraform.tfvars"
echo "  4. terraform apply -var-file=environments/staging/terraform.tfvars"
