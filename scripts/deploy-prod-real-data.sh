#!/bin/bash
# =============================================================================
# deploy-prod-real-data.sh — Deploy Observator with real data via S3 + SSM
# =============================================================================
#
# Deploys the complete platform to EC2 with ~600K rows of real data.
# Uses S3 for file transfer and SSM for remote execution (no SSH key needed).
#
# USAGE:
#   ./scripts/deploy-prod-real-data.sh              # Full deploy (all phases)
#   ./scripts/deploy-prod-real-data.sh --from 4     # Resume from phase 4
#   ./scripts/deploy-prod-real-data.sh --phase 6    # Run only phase 6
#
# PREREQUISITES:
#   - AWS CLI configured with 'products-account' profile
#   - .env.prod exists in project root
#   - EC2 instance running and SSM-reachable
# =============================================================================

set -euo pipefail

# ── Configuration (override via env vars or CLI args) ──────────────────────
AWS_PROFILE="${AWS_PROFILE:-products-account}"
REGION="${REGION:-us-east-1}"
INSTANCE_ID="${INSTANCE_ID:-i-03da75ccf77e64fc3}"
S3_BUCKET="${S3_BUCKET:-observator-deploy-063477643083}"
REMOTE_DIR="${REMOTE_DIR:-/opt/observator}"
PUBLIC_IP="${PUBLIC_IP:-52.3.74.70}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Parse arguments ────────────────────────────────────────────────────────
FROM_PHASE=1
ONLY_PHASE=0
for arg in "$@"; do
    case $arg in
        --from)   shift; FROM_PHASE=${1:-1}; shift ;;
        --phase)  shift; ONLY_PHASE=${1:-0}; FROM_PHASE=$ONLY_PHASE; shift ;;
        *)        ;;
    esac
done

should_run() {
    local phase=$1
    if [ "$ONLY_PHASE" -gt 0 ]; then
        [ "$phase" -eq "$ONLY_PHASE" ]
    else
        [ "$phase" -ge "$FROM_PHASE" ]
    fi
}

# ── Helper: Run SSM command and wait ───────────────────────────────────────
run_ssm() {
    local description="$1"
    local script_file="$2"
    local timeout="${3:-3600}"

    echo -e "${YELLOW}    SSM: $description${NC}"

    # Upload the script to S3
    local s3_key="deploy-scripts/$(basename "$script_file")"
    aws s3 cp "$script_file" "s3://$S3_BUCKET/$s3_key" \
        --profile "$AWS_PROFILE" --region "$REGION" --quiet

    # Run via SSM: download script from S3 and execute
    local COMMAND_ID
    COMMAND_ID=$(aws ssm send-command \
        --profile "$AWS_PROFILE" \
        --region "$REGION" \
        --instance-ids "$INSTANCE_ID" \
        --document-name "AWS-RunShellScript" \
        --timeout-seconds "$timeout" \
        --parameters "{\"commands\":[\"aws s3 cp s3://$S3_BUCKET/$s3_key /tmp/deploy_cmd.sh --region $REGION\",\"chmod +x /tmp/deploy_cmd.sh\",\"bash /tmp/deploy_cmd.sh\"]}" \
        --query "Command.CommandId" \
        --output text)

    # Poll for completion
    local elapsed=0
    while true; do
        local STATUS
        STATUS=$(aws ssm get-command-invocation \
            --profile "$AWS_PROFILE" \
            --region "$REGION" \
            --command-id "$COMMAND_ID" \
            --instance-id "$INSTANCE_ID" \
            --query "Status" \
            --output text 2>/dev/null || echo "InProgress")

        case "$STATUS" in
            Success)
                local output
                output=$(aws ssm get-command-invocation \
                    --profile "$AWS_PROFILE" --region "$REGION" \
                    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
                    --query "StandardOutputContent" --output text 2>/dev/null || true)
                # Show last 30 lines of output
                echo "$output" | tail -30
                echo -e "    ${GREEN}✓ $description (${elapsed}s)${NC}"
                return 0
                ;;
            Failed|Cancelled|TimedOut)
                echo -e "    ${RED}✗ $description (Status: $STATUS)${NC}"
                aws ssm get-command-invocation \
                    --profile "$AWS_PROFILE" --region "$REGION" \
                    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
                    --query "StandardErrorContent" --output text 2>/dev/null || true
                return 1
                ;;
        esac
        sleep 10
        elapsed=$((elapsed + 10))
        if [ $((elapsed % 60)) -eq 0 ]; then
            echo "    ... waiting (${elapsed}s elapsed)"
        fi
    done
}

# ── Helper: Create temp script ─────────────────────────────────────────────
make_script() {
    local name="$1"
    local body="$2"
    local file="/tmp/observator_deploy_${name}.sh"
    echo "#!/bin/bash" > "$file"
    echo "set -euo pipefail" >> "$file"
    echo "$body" >> "$file"
    echo "$file"
}

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Observator Production Deploy — Real Data, Zero Mock${NC}"
echo -e "${BLUE}  Target: EC2 $INSTANCE_ID ($PUBLIC_IP)${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1: Package code into tar.gz
# ══════════════════════════════════════════════════════════════════════════════
if should_run 1; then
    echo -e "${YELLOW}>>> Phase 1: Packaging code...${NC}"

    cd "$PROJECT_DIR"

    # Code archive (excludes data, .git, node_modules, etc.)
    tar czf /tmp/observator-code.tar.gz \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='__pycache__' \
        --exclude='.venv' \
        --exclude='*.pyc' \
        --exclude='.pytest_cache' \
        --exclude='terraform' \
        --exclude='_master_tables' \
        --exclude='_analysis_results.json' \
        --exclude='.env' \
        --exclude='.env.prod' \
        --exclude='*.pem' \
        --exclude='.mypy_cache' \
        --exclude='coverage' \
        --exclude='dist' \
        --exclude='checkpoints.db' \
        --exclude='observator_claude_docs' \
        --exclude='data_analysis_report.html' \
        --exclude='.claude' \
        .

    CODE_SIZE=$(du -h /tmp/observator-code.tar.gz | cut -f1)
    echo -e "  ${GREEN}Code archive: $CODE_SIZE${NC}"

    # Data archive (_master_tables + _analysis_results.json)
    echo "  Packaging data files (this may take a minute)..."
    tar czf /tmp/observator-data.tar.gz \
        _master_tables/ \
        _analysis_results.json

    DATA_SIZE=$(du -h /tmp/observator-data.tar.gz | cut -f1)
    echo -e "  ${GREEN}Data archive: $DATA_SIZE${NC}"
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: Upload to S3
# ══════════════════════════════════════════════════════════════════════════════
if should_run 2; then
    echo -e "${YELLOW}>>> Phase 2: Uploading to S3...${NC}"

    aws s3 cp /tmp/observator-code.tar.gz "s3://$S3_BUCKET/deploy-real/code.tar.gz" \
        --profile "$AWS_PROFILE" --region "$REGION"
    echo -e "  ${GREEN}Code uploaded${NC}"

    aws s3 cp /tmp/observator-data.tar.gz "s3://$S3_BUCKET/deploy-real/data.tar.gz" \
        --profile "$AWS_PROFILE" --region "$REGION"
    echo -e "  ${GREEN}Data uploaded${NC}"

    aws s3 cp "$PROJECT_DIR/.env.prod" "s3://$S3_BUCKET/deploy-real/env.prod" \
        --profile "$AWS_PROFILE" --region "$REGION"
    echo -e "  ${GREEN}.env.prod uploaded${NC}"
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3: Download + extract on EC2
# ══════════════════════════════════════════════════════════════════════════════
if should_run 3; then
    echo -e "${YELLOW}>>> Phase 3: Downloading and extracting on EC2...${NC}"

    SCRIPT=$(make_script "phase3" "
echo 'Creating directories...'
mkdir -p $REMOTE_DIR
cd $REMOTE_DIR

echo 'Downloading code archive from S3...'
aws s3 cp s3://$S3_BUCKET/deploy-real/code.tar.gz /tmp/code.tar.gz --region $REGION
echo 'Extracting code...'
tar xzf /tmp/code.tar.gz -C $REMOTE_DIR/
rm /tmp/code.tar.gz

echo 'Downloading data archive from S3...'
aws s3 cp s3://$S3_BUCKET/deploy-real/data.tar.gz /tmp/data.tar.gz --region $REGION
echo 'Extracting data...'
tar xzf /tmp/data.tar.gz -C $REMOTE_DIR/
rm /tmp/data.tar.gz

echo 'Downloading .env.prod...'
aws s3 cp s3://$S3_BUCKET/deploy-real/env.prod $REMOTE_DIR/.env.prod --region $REGION

echo 'Setting permissions...'
chown -R ec2-user:ec2-user $REMOTE_DIR

echo 'Files on disk:'
ls -la $REMOTE_DIR/
echo '---'
ls -la $REMOTE_DIR/_master_tables/ | head -20
echo '---'
du -sh $REMOTE_DIR/_master_tables/
echo 'Phase 3 complete'
")
    run_ssm "Download and extract files" "$SCRIPT" 600
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4: Docker build + start
# ══════════════════════════════════════════════════════════════════════════════
if should_run 4; then
    echo -e "${YELLOW}>>> Phase 4: Building and starting Docker containers...${NC}"
    echo -e "  ${BLUE}(First build takes 5-10 min on t3.medium)${NC}"

    SCRIPT=$(make_script "phase4" "
cd $REMOTE_DIR

# Stop existing containers if running
docker compose -f docker-compose.prod.yml down 2>/dev/null || true

# Build all images
echo 'Building Docker images...'
docker compose -f docker-compose.prod.yml build --parallel 2>&1 | tail -20

# Start all services
echo 'Starting services...'
docker compose -f docker-compose.prod.yml up -d

# Wait for healthy
echo 'Waiting for services to be healthy...'
sleep 15

# Check status
docker compose -f docker-compose.prod.yml ps

# Wait for API health
for i in \$(seq 1 30); do
    HEALTH=\$(curl -s http://localhost/api/health 2>/dev/null || echo '{\"status\":\"starting\"}')
    echo \"Health check \$i: \$HEALTH\"
    if echo \"\$HEALTH\" | grep -q '\"ok\"'; then
        echo 'API is healthy!'
        break
    fi
    sleep 10
done

echo 'Phase 4 complete'
")
    run_ssm "Docker build and start" "$SCRIPT" 900
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5: Initialize database (tables + constraints + Alembic stamp)
# ══════════════════════════════════════════════════════════════════════════════
if should_run 5; then
    echo -e "${YELLOW}>>> Phase 5: Initializing database (init_db.py)...${NC}"

    SCRIPT=$(make_script "phase5" "
cd $REMOTE_DIR
docker compose -f docker-compose.prod.yml exec -T -w /app api python scripts/init_db.py 2>&1 | tail -40
echo 'Phase 5 complete'
")
    run_ssm "Initialize database" "$SCRIPT" 120
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 6: Seed core data (Phase A-I from seed_master_tables.py)
# ══════════════════════════════════════════════════════════════════════════════
if should_run 6; then
    echo -e "${YELLOW}>>> Phase 6: Seeding core data (~3 min)...${NC}"

    SCRIPT=$(make_script "phase6" "
cd $REMOTE_DIR
docker compose -f docker-compose.prod.yml exec -T api python scripts/seed_master_tables.py 2>&1 | tail -50
echo 'Phase 6 complete'
")
    run_ssm "Seed core data (dims, ESCO, LinkedIn, FCSC, Bayanat)" "$SCRIPT" 600
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 7: Load O*NET data (250K rows)
# ══════════════════════════════════════════════════════════════════════════════
if should_run 7; then
    echo -e "${YELLOW}>>> Phase 7: Loading O*NET data...${NC}"

    SCRIPT=$(make_script "phase7" "
cd $REMOTE_DIR
docker compose -f docker-compose.prod.yml exec -T api python -c \"
import asyncio
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.config import settings

try:
    from src.ingestion.mappings_onet import ONET_MAPPINGS
    from src.ingestion.generic_loader import GenericLoader

    BASE = Path('/app/_master_tables')

    async def load():
        engine = create_async_engine(settings.DATABASE_URL, pool_size=5)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        total = 0
        for mapping in ONET_MAPPINGS:
            try:
                async with factory() as db:
                    loader = GenericLoader(db)
                    await loader.build_context()
                    r = await loader.load(mapping, BASE / mapping.file_pattern)
                    total += r.rows_loaded
                    print(f'{mapping.target_table}: {r.rows_loaded}')
            except Exception as ex:
                print(f'Error loading {mapping.source_id}: {ex}')
        print(f'Total O*NET: {total}')
        await engine.dispose()

    asyncio.run(load())
except ImportError as e:
    print(f'O*NET mappings not available: {e}')
    print('Skipping O*NET loading')
\" 2>&1
echo 'Phase 7 complete'
")
    run_ssm "Load O*NET data" "$SCRIPT" 600
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 8: Load Bayanat education + population + classify jobs
# ══════════════════════════════════════════════════════════════════════════════
if should_run 8; then
    echo -e "${YELLOW}>>> Phase 8: Loading Bayanat + classifying jobs...${NC}"

    SCRIPT=$(make_script "phase8" "
cd $REMOTE_DIR

# Load Bayanat education/population/employment
echo '--- Loading Bayanat data ---'
docker compose -f docker-compose.prod.yml exec -T api python scripts/load_bayanat_all.py 2>&1 | tail -30 || echo 'Bayanat loading had errors (continuing)'

# Classify unclassified jobs (38% → 80%)
echo '--- Classifying jobs ---'
docker compose -f docker-compose.prod.yml exec -T api python scripts/classify_jobs.py 2>&1 | tail -30 || echo 'Job classification had errors (continuing)'

echo 'Phase 8 complete'
")
    run_ssm "Bayanat data + job classification" "$SCRIPT" 900
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 9: Create new materialized views
# ══════════════════════════════════════════════════════════════════════════════
if should_run 9; then
    echo -e "${YELLOW}>>> Phase 9: Creating materialized views...${NC}"

    SCRIPT=$(make_script "phase9" "
cd $REMOTE_DIR
docker compose -f docker-compose.prod.yml exec -T api python -c \"
from sqlalchemy import create_engine, text
from src.config import settings

e = create_engine(settings.DATABASE_URL_SYNC, isolation_level='AUTOCOMMIT')
with e.connect() as c:
    views = [
        '''CREATE MATERIALIZED VIEW IF NOT EXISTS vw_skills_taxonomy AS
        SELECT o.occupation_id, o.title_en, o.code_isco, o.isco_major_group,
               s.label_en AS skill_name, s.skill_type,
               os.relation_type, os.source AS skill_source,
               ons.data_value AS onet_importance, ons.scale_id AS onet_scale,
               ont.example AS technology_name, ont.is_hot_technology
        FROM dim_occupation o
        LEFT JOIN fact_occupation_skills os ON o.occupation_id = os.occupation_id
        LEFT JOIN dim_skill s ON os.skill_id = s.skill_id
        LEFT JOIN fact_onet_skills ons ON ons.occupation_id = o.occupation_id
            AND ons.scale_id = 'IM' AND ons.element_name = s.label_en
        LEFT JOIN fact_onet_technology_skills ont ON ont.occupation_id = o.occupation_id
        WHERE s.label_en IS NOT NULL OR ont.example IS NOT NULL''',

        '''CREATE MATERIALIZED VIEW IF NOT EXISTS vw_education_pipeline AS
        SELECT t.year, t.month_label, r.emirate, r.region_code,
               e.category, e.level, e.gender, e.nationality, e.sector, e.discipline,
               SUM(e.count) AS total_count
        FROM fact_education_stats e
        LEFT JOIN dim_time t ON e.time_id = t.time_id
        LEFT JOIN dim_region r ON e.region_code = r.region_code
        GROUP BY t.year, t.month_label, r.emirate, r.region_code,
                 e.category, e.level, e.gender, e.nationality, e.sector, e.discipline''',

        '''CREATE MATERIALIZED VIEW IF NOT EXISTS vw_population_demographics AS
        SELECT t.year, r.emirate, r.region_code, p.citizenship, p.age_group, p.gender, p.category,
               SUM(p.population_count) AS population
        FROM fact_population_stats p
        LEFT JOIN dim_time t ON p.time_id = t.time_id
        LEFT JOIN dim_region r ON p.region_code = r.region_code
        GROUP BY t.year, r.emirate, r.region_code, p.citizenship, p.age_group, p.gender, p.category''',

        '''CREATE MATERIALIZED VIEW IF NOT EXISTS vw_occupation_transitions AS
        SELECT o1.occupation_id AS from_occupation_id, o1.title_en AS from_occupation, o1.code_isco AS from_isco,
               o2.occupation_id AS to_occupation_id, o2.title_en AS to_occupation, o2.code_isco AS to_isco,
               r.relatedness_tier, r.relatedness_index
        FROM fact_onet_related_occupations r
        JOIN dim_onet_occupation don1 ON r.soc_code = don1.soc_code
        LEFT JOIN dim_occupation o1 ON don1.occupation_id = o1.occupation_id
        JOIN dim_onet_occupation don2 ON r.related_soc_code = don2.soc_code
        LEFT JOIN dim_occupation o2 ON don2.occupation_id = o2.occupation_id
        WHERE o1.occupation_id IS NOT NULL OR o2.occupation_id IS NOT NULL''',
    ]
    for sql in views:
        try:
            c.execute(text(sql))
            print(f'OK: {sql.split(chr(10))[0][:60]}...')
        except Exception as ex:
            print(f'Skip: {str(ex)[:80]}')

e.dispose()
print('New views created')
\" 2>&1
echo 'Phase 9 complete'
")
    run_ssm "Create 4 new materialized views" "$SCRIPT" 300
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 10: Generate forecasts + normalize AI scores + cleanup
# ══════════════════════════════════════════════════════════════════════════════
if should_run 10; then
    echo -e "${YELLOW}>>> Phase 10: Forecasts + AI normalization + data cleanup...${NC}"

    SCRIPT=$(make_script "phase10" "
cd $REMOTE_DIR

# Normalize AI scores
echo '--- Normalizing AI scores ---'
docker compose -f docker-compose.prod.yml exec -T api python -c \"
from sqlalchemy import create_engine, text
from src.config import settings
e = create_engine(settings.DATABASE_URL_SYNC)
with e.begin() as c:
    r = c.execute(text('''UPDATE fact_ai_exposure_occupation
        SET exposure_0_100 = ROUND(
            ((exposure_z - (SELECT MIN(exposure_z) FROM fact_ai_exposure_occupation WHERE exposure_z IS NOT NULL))
            / NULLIF((SELECT MAX(exposure_z) - MIN(exposure_z) FROM fact_ai_exposure_occupation WHERE exposure_z IS NOT NULL), 0)
            * 100)::numeric, 1)
        WHERE exposure_z IS NOT NULL AND exposure_0_100 IS NULL'''))
    print(f'AI scores normalized: {r.rowcount} rows')

    r = c.execute(text('DELETE FROM fact_education_stats WHERE time_id IS NULL'))
    print(f'Education orphans removed: {r.rowcount}')
    r = c.execute(text('DELETE FROM fact_population_stats WHERE time_id IS NULL'))
    print(f'Population orphans removed: {r.rowcount}')
    r = c.execute(text(\\\"DELETE FROM fact_supply_talent_agg WHERE source = 'MOHRE'\\\"))
    print(f'MOHRE duplicates removed: {r.rowcount}')
e.dispose()
print('Data cleanup done')
\" 2>&1

# Generate forecasts
echo '--- Generating forecasts ---'
docker compose -f docker-compose.prod.yml exec -T api python -c \"
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text, create_engine
from src.config import settings

async def gen():
    engine = create_async_engine(settings.DATABASE_URL, pool_size=5)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        from src.forecasting.runner import run_forecast
    except ImportError:
        print('Forecasting module not available, skipping')
        await engine.dispose()
        return

    # Get top 20 occupations with enough data
    async with factory() as db:
        rows = (await db.execute(text('''
            SELECT o.occupation_id, o.title_en FROM fact_demand_vacancies_agg f
            JOIN dim_occupation o ON f.occupation_id = o.occupation_id
            JOIN dim_time t ON f.time_id = t.time_id
            WHERE f.occupation_id IS NOT NULL
            GROUP BY o.occupation_id, o.title_en
            HAVING COUNT(DISTINCT t.month_label) >= 3
            ORDER BY SUM(f.demand_count) DESC LIMIT 20
        '''))).fetchall()

    total = 0
    for occ_id, title in rows:
        for region in ['DXB', 'AUH', None]:
            try:
                async with factory() as db:
                    r = await run_forecast(db=db, occupation_id=occ_id, region_code=region, horizon=12)
                    total += r.get('stored_count', 0)
            except:
                pass

    for region in ['DXB', 'AUH', 'SHJ', None]:
        try:
            async with factory() as db:
                r = await run_forecast(db=db, occupation_id=None, region_code=region, horizon=12)
                total += r.get('stored_count', 0)
        except:
            pass

    print(f'Forecasts generated: {total} points')
    await engine.dispose()

asyncio.run(gen())
\" 2>&1

echo 'Phase 10 complete'
")
    run_ssm "Forecasts + AI normalization + cleanup" "$SCRIPT" 600
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 11: Refresh ALL materialized views
# ══════════════════════════════════════════════════════════════════════════════
if should_run 11; then
    echo -e "${YELLOW}>>> Phase 11: Refreshing all materialized views...${NC}"

    SCRIPT=$(make_script "phase11" "
cd $REMOTE_DIR
docker compose -f docker-compose.prod.yml exec -T api python -c \"
from sqlalchemy import create_engine, text
from src.config import settings
e = create_engine(settings.DATABASE_URL_SYNC, isolation_level='AUTOCOMMIT')
with e.connect() as c:
    for vw in ['vw_supply_talent', 'vw_demand_jobs', 'vw_ai_impact', 'vw_gap_cube',
               'vw_forecast_demand', 'vw_supply_education',
               'vw_skills_taxonomy', 'vw_education_pipeline',
               'vw_population_demographics', 'vw_occupation_transitions']:
        try:
            c.execute(text(f'REFRESH MATERIALIZED VIEW {vw}'))
            cnt = c.execute(text(f'SELECT COUNT(*) FROM {vw}')).scalar()
            print(f'Refreshed {vw}: {cnt:,} rows')
        except Exception as ex:
            print(f'Skip {vw}: {str(ex)[:60]}')
e.dispose()
print('All views refreshed')
\" 2>&1

# Invalidate Redis cache
docker compose -f docker-compose.prod.yml exec -T redis redis-cli FLUSHALL 2>/dev/null || true
echo 'Redis cache cleared'

echo 'Phase 11 complete'
")
    run_ssm "Refresh all materialized views" "$SCRIPT" 300
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 12: Health check + verification
# ══════════════════════════════════════════════════════════════════════════════
if should_run 12; then
    echo -e "${YELLOW}>>> Phase 12: Health check and verification...${NC}"

    # Remote verification (DB counts)
    SCRIPT=$(make_script "phase12" "
cd $REMOTE_DIR
docker compose -f docker-compose.prod.yml exec -T api python -c \"
from sqlalchemy import create_engine, text
from src.config import settings
e = create_engine(settings.DATABASE_URL_SYNC)
with e.connect() as c:
    tables = [
        'dim_occupation', 'dim_skill', 'dim_sector', 'dim_region',
        'crosswalk_soc_isco',
        'fact_demand_vacancies_agg', 'fact_supply_talent_agg',
        'fact_ai_exposure_occupation', 'fact_occupation_skills',
    ]
    print('=== TABLE COUNTS ===')
    for t in tables:
        try:
            cnt = c.execute(text(f'SELECT COUNT(*) FROM {t}')).scalar()
            print(f'  {t}: {cnt:,}')
        except:
            print(f'  {t}: NOT FOUND')

    # New tables
    for t in ['dim_onet_occupation', 'fact_onet_skills', 'fact_onet_technology_skills',
              'fact_education_stats', 'fact_population_stats', 'fact_forecast']:
        try:
            cnt = c.execute(text(f'SELECT COUNT(*) FROM {t}')).scalar()
            print(f'  {t}: {cnt:,}')
        except:
            print(f'  {t}: NOT FOUND')

    print()
    print('=== VIEW COUNTS ===')
    for vw in ['vw_supply_talent', 'vw_demand_jobs', 'vw_ai_impact', 'vw_gap_cube',
               'vw_forecast_demand', 'vw_skills_taxonomy', 'vw_education_pipeline',
               'vw_population_demographics', 'vw_occupation_transitions']:
        try:
            cnt = c.execute(text(f'SELECT COUNT(*) FROM {vw}')).scalar()
            print(f'  {vw}: {cnt:,}')
        except:
            print(f'  {vw}: NOT FOUND')

    print()
    # Job classification rate
    try:
        total = c.execute(text('SELECT COUNT(*) FROM fact_demand_vacancies_agg')).scalar()
        classified = c.execute(text('SELECT COUNT(*) FROM fact_demand_vacancies_agg WHERE occupation_id IS NOT NULL')).scalar()
        pct = (classified / total * 100) if total > 0 else 0
        print(f'Job classification: {classified:,}/{total:,} ({pct:.1f}%)')
    except:
        print('Job classification: unable to check')

    # Total rows
    try:
        total = 0
        for t in ['fact_demand_vacancies_agg', 'fact_supply_talent_agg', 'fact_occupation_skills',
                   'fact_ai_exposure_occupation', 'fact_forecast',
                   'dim_occupation', 'dim_skill', 'crosswalk_soc_isco']:
            try:
                total += c.execute(text(f'SELECT COUNT(*) FROM {t}')).scalar()
            except:
                pass
        for t in ['fact_onet_skills', 'fact_onet_knowledge', 'fact_onet_technology_skills',
                   'fact_onet_alternate_titles', 'fact_onet_task_statements',
                   'fact_onet_related_occupations', 'fact_education_stats', 'fact_population_stats']:
            try:
                total += c.execute(text(f'SELECT COUNT(*) FROM {t}')).scalar()
            except:
                pass
        print(f'Total DB rows: ~{total:,}')
    except:
        pass
e.dispose()
\" 2>&1

# Container status
echo ''
echo '=== CONTAINER STATUS ==='
docker compose -f docker-compose.prod.yml ps
echo ''
echo '=== RESOURCE USAGE ==='
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null || true

echo 'Phase 12 complete'
")
    run_ssm "Verification and health check" "$SCRIPT" 120

    echo ""
    echo -e "${YELLOW}--- Local health checks ---${NC}"

    # Local curl checks
    echo -n "  Health endpoint: "
    curl -s "http://$PUBLIC_IP/api/health" 2>/dev/null || echo "FAILED"
    echo ""

    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# DONE
# ══════════════════════════════════════════════════════════════════════════════
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo "  App URL:     http://$PUBLIC_IP"
echo "  Health:      http://$PUBLIC_IP/api/health"
echo "  Admin:       admin@observator.ae / admin123"
echo ""
echo "  SSM shell:   aws ssm start-session --target $INSTANCE_ID --profile $AWS_PROFILE --region $REGION"
echo "  View logs:   (in SSM) cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml logs -f api"
echo ""
echo "  Resume from phase N:  ./scripts/deploy-prod-real-data.sh --from N"
echo "  Run single phase:     ./scripts/deploy-prod-real-data.sh --phase N"
echo ""
