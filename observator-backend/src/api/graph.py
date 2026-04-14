"""Graph API — network graphs for skills, occupations, and supply chains."""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from src.dependencies import get_db
from src.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/graph", tags=["graph"])


def _normalize_sizes(items: list[dict], field: str = "raw_size") -> list[dict]:
    """Normalize a raw_size field to 0–1 range (min-max) and store in 'size'."""
    if not items:
        return items
    values = [item.get(field, 0) or 0 for item in items]
    mn, mx = min(values), max(values)
    span = mx - mn if mx != mn else 1
    for item in items:
        raw = item.pop(field, 0) or 0
        item["size"] = round((raw - mn) / span, 4)
    return items


def _graph_meta(all_nodes: int, shown_nodes: int, all_edges: int, shown_edges: int) -> dict:
    return {
        "total_nodes": all_nodes,
        "shown_nodes": shown_nodes,
        "total_edges": all_edges,
        "shown_edges": shown_edges,
    }


# ---------------------------------------------------------------------------
# 1. Skill co-occurrence network
# ---------------------------------------------------------------------------

@router.get("/skill-network")
async def skill_network(
    limit: int = Query(60, ge=5, le=10000),
    occ_limit: int = Query(1030, ge=3, le=2000, description="Number of occupations (default=all with demand)"),
    skills_per_occ: int = Query(3, ge=0, le=50, description="Max skills per occupation (0=all)"),
    search: Optional[str] = Query(None, description="Search skills or occupations"),
    isco_group: Optional[str] = Query(None, description="Filter by ISCO major group"),
    region: Optional[str] = Query(None, description="Filter by region/emirate code"),
    occupation_ids: Optional[str] = Query(None, description="Comma-separated occupation IDs"),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Skills Gap Map — occupation-centric network with ONLY specific, meaningful skills.

    DATA SOURCE: ESCO taxonomy (fact_occupation_skills) with strict specificity filter.
    Only skills essential for <=15 occupations are shown — this guarantees every
    connection is genuinely specific (e.g. "accounting manager" → "supervise accounting
    operations", NOT generic garbage like "mathematics" → "meat distribution").

    SUPPLY STATUS: fact_course_skills (real university course catalogs).

    FILTERS: ISCO group, region, occupation selection, search.
    """
    MAX_SPECIFICITY = 15  # Skills appearing in >15 occupations are too generic

    # ── Build occupation filters ──
    extra_where = []
    occ_params: dict = {"occ_lim": occ_limit}

    if isco_group:
        extra_where.append("o.isco_major_group = :isco")
        occ_params["isco"] = isco_group

    if region:
        extra_where.append("d.region_code = :region")
        occ_params["region"] = region

    if occupation_ids:
        try:
            ids = [int(x.strip()) for x in occupation_ids.split(",") if x.strip()]
            if ids:
                extra_where.append("o.occupation_id = ANY(:sel_ids)")
                occ_params["sel_ids"] = ids
        except ValueError:
            pass

    if search:
        extra_where.append("(LOWER(o.title_en) LIKE :occ_search)")
        occ_params["occ_search"] = f"%{search.lower()}%"

    where_clause = (" AND " + " AND ".join(extra_where)) if extra_where else ""

    # ── Step 1: ALL occupations with demand ──
    occ_rows = (await db.execute(text(f"""
        SELECT o.occupation_id, o.title_en, o.isco_major_group,
               SUM(d.demand_count) AS demand_jobs
        FROM dim_occupation o
        JOIN fact_demand_vacancies_agg d ON d.occupation_id = o.occupation_id
        WHERE d.occupation_id IS NOT NULL {where_clause}
        GROUP BY o.occupation_id, o.title_en, o.isco_major_group
        HAVING SUM(d.demand_count) >= 1
        ORDER BY SUM(d.demand_count) DESC
        LIMIT :occ_lim
    """), occ_params)).fetchall()

    if not occ_rows:
        return {"nodes": [], "edges": [], "meta": _graph_meta(0, 0, 0, 0)}

    occ_ids = [r[0] for r in occ_rows]

    # ── Step 2: Get specific essential skills per occupation ──
    # Ranked by specificity (fewest occupations first = most meaningful).
    # Only skills appearing in <=15 occupations are included.
    skill_search_filter = "AND LOWER(s.label_en) LIKE :skill_search" if search else ""
    skill_search_param = {"skill_search": f"%{search.lower()}%"} if search else {}

    skill_rows = (await db.execute(text(f"""
        WITH specificity AS (
            SELECT skill_id, COUNT(DISTINCT occupation_id) AS occ_count
            FROM fact_occupation_skills
            WHERE relation_type = 'essential'
            GROUP BY skill_id
            HAVING COUNT(DISTINCT occupation_id) <= :max_spec
        ),
        ranked AS (
            SELECT fos.occupation_id, fos.skill_id,
                   s.label_en, s.skill_type,
                   sp.occ_count,
                   COALESCE(cs.course_count, 0) AS supply_courses,
                   ROW_NUMBER() OVER (
                       PARTITION BY fos.occupation_id
                       ORDER BY sp.occ_count ASC, s.label_en
                   ) AS rn
            FROM fact_occupation_skills fos
            JOIN dim_skill s ON s.skill_id = fos.skill_id
            JOIN specificity sp ON sp.skill_id = fos.skill_id
            LEFT JOIN (
                SELECT skill_id, COUNT(DISTINCT course_id) AS course_count
                FROM fact_course_skills GROUP BY skill_id
            ) cs ON cs.skill_id = s.skill_id
            WHERE fos.occupation_id = ANY(:occ_ids)
              AND fos.relation_type = 'essential'
              {skill_search_filter}
        )
        SELECT occupation_id, skill_id, label_en, skill_type,
               occ_count, supply_courses, rn
        FROM ranked
        WHERE (:spo = 0 OR rn <= :spo)
        ORDER BY occupation_id, rn
    """), {
        "occ_ids": occ_ids,
        "max_spec": MAX_SPECIFICITY,
        "spo": skills_per_occ,
        **skill_search_param,
    })).fetchall()

    # ── Step 3: Build nodes & edges ──
    nodes = []
    edges_out = []
    seen_skill_ids: dict[int, dict] = {}  # dedup skills across occupations
    occ_demand_map = {r[0]: int(r[3]) for r in occ_rows}
    max_demand = max(occ_demand_map.values()) if occ_demand_map else 1

    # Occupation nodes
    for r in occ_rows:
        nodes.append({
            "id": f"occ-{r[0]}",
            "label": r[1] or f"Occupation {r[0]}",
            "type": "occupation",
            "size": round(0.3 + 0.7 * int(r[3]) / max_demand, 3),
            "color_group": "occupation",
            "metadata": {
                "demand_jobs": int(r[3]),
                "isco_group": r[2],
            },
        })

    # Skill nodes + edges
    for r in skill_rows:
        occ_id, skill_id = r[0], r[1]
        label, skill_type = r[2], r[3]
        occ_count, supply = int(r[4]), int(r[5])

        gap_status = "matched" if supply > 0 else "gap"

        if skill_id not in seen_skill_ids:
            seen_skill_ids[skill_id] = {
                "id": f"skill-{skill_id}",
                "label": label or f"Skill {skill_id}",
                "type": "skill",
                "raw_size": occ_count,
                "color_group": gap_status,
                "metadata": {
                    "skill_type": skill_type,
                    "supply_courses": supply,
                    "gap_status": gap_status,
                    "specificity": f"{occ_count} occupations",
                },
            }

        # Edge: occupation → skill
        edges_out.append({
            "source": f"occ-{occ_id}",
            "target": f"skill-{skill_id}",
            "weight": round(1.0 / max(occ_count, 1), 3),
            "label": "essential",
            "type": "requires",
        })

    # Normalize skill node sizes (smaller occ_count = MORE specific = LARGER node)
    skill_node_list = list(seen_skill_ids.values())
    if skill_node_list:
        max_spec = max(n["raw_size"] for n in skill_node_list)
        min_spec = min(n["raw_size"] for n in skill_node_list)
        rng = max_spec - min_spec or 1
        for n in skill_node_list:
            # Invert: most specific (low occ_count) = biggest
            n["size"] = round(0.2 + 0.8 * (max_spec - n.pop("raw_size")) / rng, 3)
            nodes.append(n)

    # ── Available filter options for frontend ──
    isco_groups = sorted({r[2] for r in occ_rows if r[2]})

    return {
        "nodes": nodes,
        "edges": edges_out,
        "meta": {
            **_graph_meta(
                len(occ_rows) + len(seen_skill_ids), len(nodes),
                len(edges_out), len(edges_out),
            ),
            "legend": {
                "gap": "Skill Gap — demanded but NOT taught",
                "matched": "Covered — demanded AND taught in universities",
                "occupation": "Occupation (sized by demand)",
            },
            "filters": {
                "isco_groups": isco_groups,
                "regions": ["AUH", "DXB", "SHJ", "AJM", "RAK", "FUJ", "UAQ"],
            },
            "data_source": "ESCO Taxonomy (essential skills only, specificity ≤15 occupations) + UAE university course catalogs",
        },
    }


# ---------------------------------------------------------------------------
# 1b. Occupation list & search — for graph filter
# ---------------------------------------------------------------------------

@router.get("/occupations")
async def list_occupations(
    q: Optional[str] = Query(None, description="Search query (optional)"),
    isco_group: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=5000),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Full occupation list with demand & ISCO metadata.
    Supports optional search and ISCO group filter.
    Returns ALL occupations (up to limit) sorted by demand.
    """
    filters = []
    params: dict = {"lim": limit}
    if q and len(q) >= 2:
        filters.append("LOWER(o.title_en) LIKE :q")
        params["q"] = f"%{q.lower()}%"
    if isco_group:
        filters.append("o.isco_major_group = :isco")
        params["isco"] = isco_group

    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    rows = (await db.execute(text(f"""
        SELECT o.occupation_id, o.title_en, o.isco_major_group,
               COALESCE(d.demand, 0) AS demand,
               COALESCE(sk.skill_count, 0) AS skill_count
        FROM dim_occupation o
        LEFT JOIN (
            SELECT occupation_id, SUM(demand_count) AS demand
            FROM fact_demand_vacancies_agg GROUP BY occupation_id
        ) d ON d.occupation_id = o.occupation_id
        LEFT JOIN (
            SELECT occupation_id, COUNT(DISTINCT skill_id) AS skill_count
            FROM fact_occupation_skills
            WHERE relation_type = 'essential' AND source = 'ESCO'
            GROUP BY occupation_id
        ) sk ON sk.occupation_id = o.occupation_id
        {where}
        ORDER BY demand DESC, o.title_en
        LIMIT :lim
    """), params)).fetchall()

    return {
        "total": len(rows),
        "occupations": [
            {
                "id": r[0],
                "title": r[1],
                "isco_group": r[2] or "?",
                "demand": int(r[3]),
                "skill_count": int(r[4]),
            }
            for r in rows
        ],
    }


@router.get("/occupation-search")
async def occupation_search(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(30, ge=1, le=100),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Quick search for occupation autocomplete."""
    rows = (await db.execute(text("""
        SELECT o.occupation_id, o.title_en, o.isco_major_group,
               COALESCE(SUM(d.demand_count), 0) AS demand
        FROM dim_occupation o
        LEFT JOIN fact_demand_vacancies_agg d ON d.occupation_id = o.occupation_id
        WHERE LOWER(o.title_en) LIKE :q
        GROUP BY o.occupation_id, o.title_en, o.isco_major_group
        ORDER BY demand DESC, o.title_en
        LIMIT :lim
    """), {"q": f"%{q.lower()}%", "lim": limit})).fetchall()

    return [
        {"id": r[0], "title": r[1], "isco_group": r[2], "demand": int(r[3])}
        for r in rows
    ]


# ---------------------------------------------------------------------------
# 2. Occupation star graph
# ---------------------------------------------------------------------------

@router.get("/occupation-skills/{occupation_id}")
async def occupation_skills_graph(
    occupation_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Star graph: center node = occupation, satellite nodes = its skills.
    Each skill carries demand_count (from fact_demand_vacancies_agg) and
    supply_count (number of courses that teach it).
    """
    # Occupation center
    occ_row = (await db.execute(text("""
        SELECT o.occupation_id, o.title_en, o.code_isco, o.isco_major_group,
               COALESCE(SUM(d.demand_count), 0) AS total_demand
        FROM dim_occupation o
        LEFT JOIN fact_demand_vacancies_agg d ON d.occupation_id = o.occupation_id
        WHERE o.occupation_id = :occ_id
        GROUP BY o.occupation_id, o.title_en, o.code_isco, o.isco_major_group
    """), {"occ_id": occupation_id})).fetchone()

    if not occ_row:
        return {"nodes": [], "edges": [], "meta": _graph_meta(0, 0, 0, 0)}

    # Skills for this occupation with demand + supply signals
    skill_rows = (await db.execute(text("""
        SELECT
            s.skill_id,
            s.label_en,
            s.skill_type,
            s.taxonomy,
            fos.relation_type,
            COALESCE(demand.demand_count, 0)  AS demand_count,
            COALESCE(supply.supply_count, 0)  AS supply_count
        FROM fact_occupation_skills fos
        JOIN dim_skill s ON s.skill_id = fos.skill_id
        -- demand: vacancies for skills via this occupation
        LEFT JOIN (
            SELECT fos2.skill_id,
                   SUM(d.demand_count) AS demand_count
            FROM fact_occupation_skills fos2
            JOIN fact_demand_vacancies_agg d ON d.occupation_id = fos2.occupation_id
            WHERE fos2.occupation_id = :occ_id
            GROUP BY fos2.skill_id
        ) demand ON demand.skill_id = s.skill_id
        -- supply: number of courses teaching each skill
        LEFT JOIN (
            SELECT skill_id, COUNT(DISTINCT course_id) AS supply_count
            FROM fact_course_skills
            GROUP BY skill_id
        ) supply ON supply.skill_id = s.skill_id
        WHERE fos.occupation_id = :occ_id
        ORDER BY demand_count DESC, supply_count DESC
    """), {"occ_id": occupation_id})).fetchall()

    # Center node
    center_node = {
        "id": f"occ-{occ_row[0]}",
        "label": occ_row[1] or f"Occupation {occ_row[0]}",
        "type": "occupation",
        "size": 1.0,
        "color_group": "occupation",
        "metadata": {
            "isco_code": occ_row[2],
            "isco_major_group": occ_row[3],
            "total_demand": int(occ_row[4]),
        },
    }

    # Skill satellite nodes
    raw_skill_nodes = [
        {
            "id": f"skill-{r[0]}",
            "label": r[1] or f"Skill {r[0]}",
            "type": "skill",
            "color_group": r[2] or "unknown",
            "metadata": {
                "taxonomy": r[3],
                "relation_type": r[4],
                "demand": int(r[5]),
                "courses": int(r[6]),
            },
            "raw_size": int(r[5]) + int(r[6]),
        }
        for r in skill_rows
    ]
    skill_nodes = _normalize_sizes(raw_skill_nodes)

    nodes = [center_node] + skill_nodes

    # Edges: center → each skill
    edges = [
        {
            "source": f"occ-{occupation_id}",
            "target": f"skill-{r[0]}",
            "weight": round(
                (int(r[5]) + int(r[6])) / max(1, max((int(sr[5]) + int(sr[6])) for sr in skill_rows)),
                4,
            ) if skill_rows else 0.5,
            "label": r[4] or "requires",
            "type": "requires",
        }
        for r in skill_rows
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": _graph_meta(len(nodes), len(nodes), len(edges), len(edges)),
    }


# ---------------------------------------------------------------------------
# 3. Career transitions graph
# ---------------------------------------------------------------------------

@router.get("/career-transitions/{occupation_id}")
async def career_transitions(
    occupation_id: int,
    limit: int = Query(10, ge=3, le=30),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Find related occupations via shared skill overlap.
    Uses fact_onet_related_occupations if it exists; otherwise falls back to
    a self-join on fact_occupation_skills.
    """
    # Check if the ONET related-occupations table exists
    table_exists = (await db.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'fact_onet_related_occupations'
        )
    """))).scalar()

    # Origin occupation
    origin_row = (await db.execute(text("""
        SELECT occupation_id, title_en, code_isco, isco_major_group
        FROM dim_occupation WHERE occupation_id = :occ_id
    """), {"occ_id": occupation_id})).fetchone()

    if not origin_row:
        return {"nodes": [], "edges": [], "meta": _graph_meta(0, 0, 0, 0)}

    related_rows = []
    if table_exists:
        related_rows = (await db.execute(text("""
            SELECT o.occupation_id, o.title_en, o.code_isco, o.isco_major_group,
                   r.relatedness_index AS overlap,
                   r.relatedness_tier
            FROM fact_onet_related_occupations r
            JOIN dim_occupation o ON o.occupation_id = r.related_occupation_id
            WHERE r.occupation_id = :occ_id AND r.related_occupation_id IS NOT NULL
            ORDER BY r.relatedness_index DESC
            LIMIT :lim
        """), {"occ_id": occupation_id, "lim": limit})).fetchall()
        edge_type = "onet-related"
        overlap_col = 4
    if not related_rows:
        # Skill-overlap fallback
        related_rows = (await db.execute(text("""
            WITH base_skills AS (
                SELECT skill_id FROM fact_occupation_skills WHERE occupation_id = :occ_id
            ),
            skill_counts AS (
                SELECT fos.occupation_id,
                       COUNT(DISTINCT fos.skill_id) AS overlap
                FROM fact_occupation_skills fos
                JOIN base_skills bs ON bs.skill_id = fos.skill_id
                WHERE fos.occupation_id != :occ_id
                GROUP BY fos.occupation_id
                ORDER BY overlap DESC
                LIMIT :lim
            )
            SELECT o.occupation_id, o.title_en, o.code_isco, o.isco_major_group,
                   sc.overlap,
                   'skill-overlap' AS transition_type
            FROM skill_counts sc
            JOIN dim_occupation o ON o.occupation_id = sc.occupation_id
            ORDER BY sc.overlap DESC
        """), {"occ_id": occupation_id, "lim": limit})).fetchall()
        edge_type = "skill-overlap"
        overlap_col = 4

    # Demand context for origin + related occupations
    all_occ_ids = [occupation_id] + [r[0] for r in related_rows]
    demand_rows = (await db.execute(text("""
        SELECT occupation_id, SUM(demand_count) AS total_demand
        FROM fact_demand_vacancies_agg
        WHERE occupation_id = ANY(:ids)
        GROUP BY occupation_id
    """), {"ids": all_occ_ids})).fetchall()
    demand_map = {r[0]: int(r[1]) for r in demand_rows}

    max_overlap = max((r[overlap_col] for r in related_rows), default=1) or 1

    # Center node
    center_node = {
        "id": f"occ-{origin_row[0]}",
        "label": origin_row[1] or f"Occupation {origin_row[0]}",
        "type": "occupation",
        "size": 1.0,
        "color_group": "origin",
        "metadata": {
            "isco_code": origin_row[2],
            "isco_major_group": origin_row[3],
            "demand": demand_map.get(origin_row[0], 0),
        },
    }

    # Related occupation nodes
    raw_related = [
        {
            "id": f"occ-{r[0]}",
            "label": r[1] or f"Occupation {r[0]}",
            "type": "occupation",
            "color_group": "related",
            "metadata": {
                "isco_code": r[2],
                "isco_major_group": r[3],
                "overlap": int(r[overlap_col]),
                "transition_type": r[5] if len(r) > 5 else edge_type,
                "demand": demand_map.get(r[0], 0),
            },
            "raw_size": int(r[overlap_col]),
        }
        for r in related_rows
    ]
    related_nodes = _normalize_sizes(raw_related)

    nodes = [center_node] + related_nodes

    edges = [
        {
            "source": f"occ-{occupation_id}",
            "target": f"occ-{r[0]}",
            "weight": round(int(r[overlap_col]) / max_overlap, 4),
            "label": f"{int(r[overlap_col])} shared skills",
            "type": edge_type,
        }
        for r in related_rows
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": _graph_meta(len(nodes), len(nodes), len(edges), len(edges)),
    }


# ---------------------------------------------------------------------------
# 4. Supply chain: institution → courses → skills
# ---------------------------------------------------------------------------

@router.get("/supply-chain")
async def supply_chain(
    institution_id: Optional[int] = Query(None),
    region: Optional[str] = Query(None),
    limit: int = Query(30, ge=5, le=100),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Chain graph: institution nodes → course nodes → skill nodes.
    Filtered by institution_id and/or region (emirate).
    """
    inst_filter = "AND di.institution_id = :inst_id" if institution_id else ""
    region_filter = "AND di.emirate ILIKE :region" if region else ""

    # Top courses by skill count, with institution metadata
    course_sql = text(f"""
        SELECT
            dc.course_id,
            dc.course_name,
            di.institution_id,
            di.name_en        AS institution_name,
            di.emirate,
            di.institution_type,
            COUNT(fcs.skill_id) AS skill_count
        FROM dim_course dc
        JOIN dim_institution di ON di.institution_id = dc.institution_id
        JOIN fact_course_skills fcs ON fcs.course_id = dc.course_id::text
        WHERE 1=1
            {inst_filter}
            {region_filter}
        GROUP BY dc.course_id, dc.course_name,
                 di.institution_id, di.name_en, di.emirate, di.institution_type
        ORDER BY skill_count DESC
        LIMIT :lim
    """)

    course_params: dict = {"lim": limit}
    if institution_id:
        course_params["inst_id"] = institution_id
    if region:
        course_params["region"] = f"%{region}%"

    course_rows = (await db.execute(course_sql, course_params)).fetchall()

    if not course_rows:
        return {"nodes": [], "edges": [], "meta": _graph_meta(0, 0, 0, 0)}

    course_ids = [str(r[0]) for r in course_rows]  # cast to str — fact_course_skills.course_id is varchar

    # Skills for those courses
    skill_sql = text("""
        SELECT
            fcs.course_id,
            s.skill_id,
            s.label_en,
            s.skill_type,
            s.taxonomy,
            fcs.weight,
            fcs.confidence,
            COUNT(fcs2.course_id) AS global_course_count
        FROM fact_course_skills fcs
        JOIN dim_skill s ON s.skill_id = fcs.skill_id
        -- global course count for sizing
        LEFT JOIN fact_course_skills fcs2 ON fcs2.skill_id = s.skill_id
        WHERE fcs.course_id = ANY(:ids)
        GROUP BY fcs.course_id, s.skill_id, s.label_en, s.skill_type, s.taxonomy,
                 fcs.weight, fcs.confidence
        ORDER BY fcs.weight DESC NULLS LAST
    """)
    skill_rows = (await db.execute(skill_sql, {"ids": course_ids})).fetchall()

    # Build institution nodes (deduplicated)
    inst_seen: dict[int, dict] = {}
    for r in course_rows:
        iid = r[2]
        if iid not in inst_seen:
            inst_seen[iid] = {
                "id": f"inst-{iid}",
                "label": r[3] or f"Institution {iid}",
                "type": "institution",
                "size": 0.0,  # will be updated below
                "color_group": r[5] or "institution",
                "metadata": {"emirate": r[4], "institution_type": r[5]},
                "raw_size": 0,
            }
        inst_seen[iid]["raw_size"] += 1  # count courses

    # Normalize institution sizes
    inst_nodes_raw = list(inst_seen.values())
    inst_nodes = _normalize_sizes(inst_nodes_raw)

    # Build course nodes
    course_nodes_raw = [
        {
            "id": f"course-{r[0]}",
            "label": r[1] or f"Course {r[0]}",
            "type": "course",
            "color_group": "course",
            "metadata": {
                "institution_id": r[2],
                "emirate": r[4],
                "skill_count": int(r[6]),
            },
            "raw_size": int(r[6]),
        }
        for r in course_rows
    ]
    course_nodes = _normalize_sizes(course_nodes_raw)

    # Build skill nodes (deduplicated across courses)
    skill_seen: dict[int, dict] = {}
    for r in skill_rows:
        sid = r[1]
        if sid not in skill_seen:
            skill_seen[sid] = {
                "id": f"skill-{sid}",
                "label": r[2] or f"Skill {sid}",
                "type": "skill",
                "color_group": r[3] or "unknown",
                "metadata": {"taxonomy": r[4], "global_courses": int(r[7])},
                "raw_size": int(r[7]),
            }

    skill_nodes_raw = list(skill_seen.values())
    skill_nodes = _normalize_sizes(skill_nodes_raw)

    nodes = inst_nodes + course_nodes + skill_nodes

    # Edges: institution → course
    inst_course_edges = [
        {
            "source": f"inst-{r[2]}",
            "target": f"course-{r[0]}",
            "weight": round(int(r[6]) / max(1, max(int(cr[6]) for cr in course_rows)), 4),
            "label": f"{int(r[6])} skills",
            "type": "offers",
        }
        for r in course_rows
    ]

    # Edges: course → skill
    max_weight = max((float(r[5]) for r in skill_rows if r[5] is not None), default=1.0) or 1.0
    course_skill_edges = [
        {
            "source": f"course-{r[0]}",
            "target": f"skill-{r[1]}",
            "weight": round(float(r[5]) / max_weight if r[5] is not None else 0.5, 4),
            "label": f"confidence {round(float(r[6]), 2) if r[6] else '?'}",
            "type": "teaches",
        }
        for r in skill_rows
    ]

    edges = inst_course_edges + course_skill_edges

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": _graph_meta(len(nodes), len(nodes), len(edges), len(edges)),
    }
