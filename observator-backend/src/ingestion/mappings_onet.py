"""O*NET v30.2 mapping configurations — 8 files, ~250K rows."""
from src.ingestion.mapping_registry import ColumnMapping, SourceMapping, registry


def _bool_yn(value, context=None):
    """Convert Y/N to boolean."""
    if not value:
        return False
    return str(value).strip().upper() == "Y"


# ============================================================
# 1. O*NET Occupations → dim_onet_occupation (1,016 rows)
# ============================================================
ONET_OCCUPATIONS = SourceMapping(
    source_id="onet_occupations",
    file_pattern="5_taxonomy_onet/onet_occupations.csv",
    target_table="dim_onet_occupation",
    source_label="ONET",
    dedup_strategy="skip",
    unique_keys=["soc_code"],
    columns=[
        ColumnMapping("O*NET-SOC Code", "soc_code", "passthrough", required=True),
        ColumnMapping("Title", "title", "passthrough", required=True),
        ColumnMapping("Description", "description", "passthrough"),
        ColumnMapping("O*NET-SOC Code", "occupation_id", "soc_to_occupation_id"),
    ],
)

# ============================================================
# 2. O*NET Skills → fact_onet_skills (62,580 rows)
# ============================================================
ONET_SKILLS = SourceMapping(
    source_id="onet_skills",
    file_pattern="5_taxonomy_onet/onet_skills.csv",
    target_table="fact_onet_skills",
    source_label="ONET",
    batch_size=2000,
    columns=[
        ColumnMapping("O*NET-SOC Code", "soc_code", "passthrough", required=True),
        ColumnMapping("Element ID", "element_id", "passthrough"),
        ColumnMapping("Element Name", "element_name", "passthrough", required=True),
        ColumnMapping("Scale ID", "scale_id", "passthrough"),
        ColumnMapping("Scale Name", "scale_name", "passthrough"),
        ColumnMapping("Data Value", "data_value", "to_float"),
        ColumnMapping("O*NET-SOC Code", "occupation_id", "soc_to_occupation_id"),
    ],
)

# ============================================================
# 3. O*NET Knowledge → fact_onet_knowledge (59,004 rows)
# ============================================================
ONET_KNOWLEDGE = SourceMapping(
    source_id="onet_knowledge",
    file_pattern="5_taxonomy_onet/onet_knowledge.csv",
    target_table="fact_onet_knowledge",
    source_label="ONET",
    batch_size=2000,
    columns=[
        ColumnMapping("O*NET-SOC Code", "soc_code", "passthrough", required=True),
        ColumnMapping("Element ID", "element_id", "passthrough"),
        ColumnMapping("Element Name", "element_name", "passthrough", required=True),
        ColumnMapping("Scale ID", "scale_id", "passthrough"),
        ColumnMapping("Scale Name", "scale_name", "passthrough"),
        ColumnMapping("Data Value", "data_value", "to_float"),
        ColumnMapping("O*NET-SOC Code", "occupation_id", "soc_to_occupation_id"),
    ],
)

# ============================================================
# 4. O*NET Technology Skills → fact_onet_technology_skills (32,773 rows)
# ============================================================
ONET_TECHNOLOGY = SourceMapping(
    source_id="onet_technology",
    file_pattern="5_taxonomy_onet/onet_technology_skills.csv",
    target_table="fact_onet_technology_skills",
    source_label="ONET",
    batch_size=2000,
    columns=[
        ColumnMapping("O*NET-SOC Code", "soc_code", "passthrough", required=True),
        ColumnMapping("Example", "example", "passthrough"),
        ColumnMapping("Commodity Code", "commodity_code", "passthrough"),
        ColumnMapping("Commodity Title", "commodity_title", "passthrough"),
        ColumnMapping("Hot Technology", "is_hot_technology", None),  # handled by row_transform
        ColumnMapping("In Demand", "in_demand", None),
        ColumnMapping("O*NET-SOC Code", "occupation_id", "soc_to_occupation_id"),
    ],
    row_transform=lambda row: {
        **row,
        "is_hot_technology": str(row.get("is_hot_technology", "")).strip().upper() == "Y",
        "in_demand": str(row.get("in_demand", "")).strip().upper() == "Y",
    },
)

# ============================================================
# 5. O*NET Alternate Titles → fact_onet_alternate_titles (57,543 rows)
# ============================================================
ONET_ALTERNATE_TITLES = SourceMapping(
    source_id="onet_alternate_titles",
    file_pattern="5_taxonomy_onet/onet_alternate_titles.csv",
    target_table="fact_onet_alternate_titles",
    source_label="ONET",
    batch_size=2000,
    columns=[
        ColumnMapping("O*NET-SOC Code", "soc_code", "passthrough", required=True),
        ColumnMapping("Title", "title", "passthrough"),
        ColumnMapping("Alternate Title", "alternate_title", "passthrough", required=True),
        ColumnMapping("Short Title", "short_title", "passthrough"),
        ColumnMapping("O*NET-SOC Code", "occupation_id", "soc_to_occupation_id"),
    ],
)

# ============================================================
# 6. O*NET Task Statements → fact_onet_task_statements (18,796 rows)
# ============================================================
ONET_TASKS = SourceMapping(
    source_id="onet_tasks",
    file_pattern="5_taxonomy_onet/onet_task_statements.csv",
    target_table="fact_onet_task_statements",
    source_label="ONET",
    batch_size=2000,
    columns=[
        ColumnMapping("O*NET-SOC Code", "soc_code", "passthrough", required=True),
        ColumnMapping("Task ID", "task_id", "passthrough"),
        ColumnMapping("Task", "task", "passthrough", required=True),
        ColumnMapping("Task Type", "task_type", "passthrough"),
        ColumnMapping("O*NET-SOC Code", "occupation_id", "soc_to_occupation_id"),
    ],
)

# ============================================================
# 7. O*NET Emerging Tasks → fact_onet_emerging_tasks (328 rows)
# ============================================================
ONET_EMERGING = SourceMapping(
    source_id="onet_emerging_tasks",
    file_pattern="5_taxonomy_onet/onet_emerging_tasks.csv",
    target_table="fact_onet_emerging_tasks",
    source_label="ONET",
    columns=[
        ColumnMapping("O*NET-SOC Code", "soc_code", "passthrough", required=True),
        ColumnMapping("Task", "task", "passthrough", required=True),
        ColumnMapping("Category", "category", "passthrough"),
        ColumnMapping("Date", "date", "passthrough"),
        ColumnMapping("O*NET-SOC Code", "occupation_id", "soc_to_occupation_id"),
    ],
)

# ============================================================
# 8. O*NET Related Occupations → fact_onet_related_occupations (18,460 rows)
# ============================================================
ONET_RELATED = SourceMapping(
    source_id="onet_related",
    file_pattern="5_taxonomy_onet/onet_related_occupations.csv",
    target_table="fact_onet_related_occupations",
    source_label="ONET",
    batch_size=2000,
    columns=[
        ColumnMapping("O*NET-SOC Code", "soc_code", "passthrough", required=True),
        ColumnMapping("Related O*NET-SOC Code", "related_soc_code", "passthrough", required=True),
        ColumnMapping("Related Title", "related_title", "passthrough"),
        ColumnMapping("Relatedness Tier", "relatedness_tier", "passthrough"),
        ColumnMapping("Index", "relatedness_index", "to_int"),
        ColumnMapping("O*NET-SOC Code", "occupation_id", "soc_to_occupation_id"),
    ],
)

# Register all
ONET_MAPPINGS = [
    ONET_OCCUPATIONS, ONET_SKILLS, ONET_KNOWLEDGE, ONET_TECHNOLOGY,
    ONET_ALTERNATE_TITLES, ONET_TASKS, ONET_EMERGING, ONET_RELATED,
]

for _m in ONET_MAPPINGS:
    registry.register(_m)
