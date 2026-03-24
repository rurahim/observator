#!/bin/bash
# =============================================================================
# quick-deploy.sh — One-command deployment for testing environment
# =============================================================================
#
# WHY THIS EXISTS:
# Combines Terraform provisioning + application deployment into a single
# command. Run this once to go from zero to a working Observator instance.
#
# USAGE:
#   ./scripts/quick-deploy.sh
#
# WHAT IT DOES:
# 1. Checks prerequisites (terraform, aws, rsync, ssh)
# 2. Runs terraform init + apply (creates EC2 + networking)
# 3. Waits for the instance to finish its UserData bootstrap
# 4. Deploys the application via deploy-testing.sh
# 5. Prints the access URL
#
# TOTAL TIME: ~15-20 minutes (first deploy)
#   - Terraform: ~2-3 minutes
#   - Instance boot + UserData: ~3-5 minutes
#   - File sync + Docker build: ~5-10 minutes
#   - Migrations + health check: ~2 minutes
#
# PREREQUISITES:
# 1. AWS CLI configured: aws configure
# 2. Terraform installed: https://developer.hashicorp.com/terraform/install
# 3. .env.prod file exists with real values (see .env.prod.example)
# 4. me-south-1 region enabled in your AWS account
#
# COST: ~$33/month (t3.medium + 30GB gp3 EBS + Elastic IP)
#
# PRO TIP:
# After the first deploy, use deploy-testing.sh directly for updates.
# It's faster because it skips the Terraform step.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$PROJECT_DIR/terraform/environments/testing"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  Observator Quick Deploy — Testing Environment${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo "  This will create an EC2 instance and deploy the full Observator"
echo "  platform. Estimated time: 15-20 minutes. Cost: ~\$33/month."
echo ""

# ── Step 0: Prerequisites ──────────────────────────────────────────────────
echo -e "${YELLOW}>>> Checking prerequisites...${NC}"

MISSING=false
for cmd in terraform aws ssh rsync curl; do
    if command -v "$cmd" &>/dev/null; then
        echo -e "  ${GREEN}[OK]${NC} $cmd"
    else
        echo -e "  ${RED}[MISSING]${NC} $cmd"
        MISSING=true
    fi
done

# Check AWS credentials
if aws sts get-caller-identity &>/dev/null; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    echo -e "  ${GREEN}[OK]${NC} AWS account: $AWS_ACCOUNT"
else
    echo -e "  ${RED}[MISSING]${NC} AWS credentials not configured. Run: aws configure"
    MISSING=true
fi

# Check .env.prod
if [ -f "$PROJECT_DIR/.env.prod" ]; then
    echo -e "  ${GREEN}[OK]${NC} .env.prod exists"
else
    echo -e "  ${RED}[MISSING]${NC} .env.prod not found"
    echo ""
    echo "  Create it from the template:"
    echo "    cp .env.prod.example .env.prod"
    echo "    # Edit .env.prod with real API keys and passwords"
    MISSING=true
fi

if $MISSING; then
    echo ""
    echo -e "${RED}Fix the missing prerequisites above and try again.${NC}"
    exit 1
fi
echo ""

# ── Step 1: Terraform Init ────────────────────────────────────────────────
echo -e "${YELLOW}>>> Step 1: Initializing Terraform...${NC}"
cd "$TF_DIR"

if [ ! -d ".terraform" ]; then
    terraform init
else
    echo "  Terraform already initialized"
fi
echo ""

# ── Step 2: Show what will be created ──────────────────────────────────────
echo -e "${YELLOW}>>> Step 2: Planning infrastructure changes...${NC}"
terraform plan -var-file=terraform.tfvars -out=tfplan

echo ""
echo -e "${YELLOW}  This will create:${NC}"
echo "    - 1x t3.medium EC2 instance (2 vCPU, 4GB RAM)"
echo "    - 30GB gp3 EBS volume"
echo "    - Elastic IP (stable public address)"
echo "    - Security group (HTTP + SSH)"
echo "    - IAM role + instance profile"
echo "    - SSH key pair"
echo ""
echo -e "  ${YELLOW}Estimated monthly cost: ~\$33${NC}"
echo ""

read -rp "  Proceed with deployment? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "  Aborted."
    rm -f tfplan
    exit 0
fi

# ── Step 3: Apply Terraform ────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}>>> Step 3: Creating infrastructure...${NC}"
terraform apply tfplan
rm -f tfplan

# Read outputs
PUBLIC_IP=$(terraform output -raw public_ip)
APP_URL=$(terraform output -raw app_url)
SSH_CMD=$(terraform output -raw ssh_command)

echo ""
echo -e "  ${GREEN}Infrastructure created!${NC}"
echo "  Public IP: $PUBLIC_IP"
echo ""

cd "$PROJECT_DIR"

# ── Step 4: Wait for UserData to complete ──────────────────────────────────
echo -e "${YELLOW}>>> Step 4: Waiting for instance bootstrap (UserData)...${NC}"
echo "  The instance is installing Docker and configuring itself."
echo "  This takes 2-4 minutes..."
echo ""

# Wait for SSH to become available
MAX_RETRIES=30
SSH_KEY="$TF_DIR/observator-testing.pem"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"

for i in $(seq 1 $MAX_RETRIES); do
    if ssh $SSH_OPTS "ec2-user@$PUBLIC_IP" "test -f /var/log/userdata.log && tail -1 /var/log/userdata.log" 2>/dev/null | grep -q "completed"; then
        echo -e "  ${GREEN}UserData bootstrap completed!${NC}"
        break
    fi
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo -e "${YELLOW}WARNING: Could not confirm UserData completion. Proceeding anyway...${NC}"
        break
    fi
    echo "  Waiting... ($i/$MAX_RETRIES)"
    sleep 10
done
echo ""

# ── Step 5: Deploy application ────────────────────────────────────────────
echo -e "${YELLOW}>>> Step 5: Deploying application...${NC}"
echo ""
bash "$SCRIPT_DIR/deploy-testing.sh"

# ── Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  QUICK DEPLOY COMPLETE${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  App URL:    $APP_URL"
echo "  Health:     $APP_URL/api/health"
echo "  SSH:        $SSH_CMD"
echo ""
echo "  To update the app later:"
echo "    ./scripts/deploy-testing.sh"
echo ""
echo "  To destroy everything:"
echo "    cd terraform/environments/testing && terraform destroy"
echo ""
echo "  Monthly cost: ~\$33"
echo ""
