"""Pipeline agent registry — imports all 18 agent classes for easy discovery."""
from src.pipeline.agents.file_ingestion import FileIngestionAgent
from src.pipeline.agents.pii_scrubber import PIIScrubberAgent
from src.pipeline.agents.data_quality import DataQualityAgent
from src.pipeline.agents.occupation_normalizer import OccupationNormalizerAgent
from src.pipeline.agents.skill_normalizer import SkillNormalizerAgent
from src.pipeline.agents.job_description_parser import JobDescriptionParserAgent
from src.pipeline.agents.cv_parser import CVParserAgent
from src.pipeline.agents.db_loader import DBLoaderAgent
from src.pipeline.agents.skill_gap_calculator import SkillGapCalculatorAgent
from src.pipeline.agents.trend_forecast import TrendForecastAgent
from src.pipeline.agents.ai_impact_modelling import AIImpactModellingAgent
from src.pipeline.agents.report_generator import ReportGeneratorAgent
from src.pipeline.agents.alert import AlertAgent
from src.pipeline.agents.api_connector import APIConnectorAgent
from src.pipeline.agents.web_scraper import WebScraperAgent
from src.pipeline.agents.pdf_parser import PDFParserAgent
from src.pipeline.agents.course_skill_mapper import CourseSkillMapperAgent
from src.pipeline.agents.policy_recommendation import PolicyRecommendationAgent

__all__ = [
    "FileIngestionAgent",
    "PIIScrubberAgent",
    "DataQualityAgent",
    "OccupationNormalizerAgent",
    "SkillNormalizerAgent",
    "JobDescriptionParserAgent",
    "CVParserAgent",
    "DBLoaderAgent",
    "SkillGapCalculatorAgent",
    "TrendForecastAgent",
    "AIImpactModellingAgent",
    "ReportGeneratorAgent",
    "AlertAgent",
    "APIConnectorAgent",
    "WebScraperAgent",
    "PDFParserAgent",
    "CourseSkillMapperAgent",
    "PolicyRecommendationAgent",
]

# Ordered default pipeline sequence.  The orchestrator may reorder or skip
# agents based on PipelineRunRequest.skip_agents and source_type.
#
# Data acquisition agents come first (api_connector, web_scraper, pdf_parser),
# then ingestion (file_ingestion, pii_scrubber, data_quality), then AI
# enrichment (occupation_normalizer, skill_normalizer, job_description_parser,
# cv_parser, course_skill_mapper), then warehouse loading (db_loader),
# then analytics (skill_gap_calculator, ai_impact_modelling, trend_forecast),
# and finally output (report_generator, policy_recommendation, alert).
DEFAULT_AGENT_ORDER: list[str] = [
    "api_connector",
    "web_scraper",
    "pdf_parser",
    "file_ingestion",
    "pii_scrubber",
    "data_quality",
    "occupation_normalizer",
    "skill_normalizer",
    "job_description_parser",
    "cv_parser",
    "course_skill_mapper",
    "db_loader",
    "skill_gap_calculator",
    "ai_impact_modelling",
    "trend_forecast",
    "report_generator",
    "policy_recommendation",
    "alert",
]

# All 18 agents keyed by their node name in the pipeline graph.
AGENT_CLASSES: dict[str, type] = {
    "file_ingestion": FileIngestionAgent,
    "pii_scrubber": PIIScrubberAgent,
    "data_quality": DataQualityAgent,
    "occupation_normalizer": OccupationNormalizerAgent,
    "skill_normalizer": SkillNormalizerAgent,
    "job_description_parser": JobDescriptionParserAgent,
    "cv_parser": CVParserAgent,
    "db_loader": DBLoaderAgent,
    "skill_gap_calculator": SkillGapCalculatorAgent,
    "trend_forecast": TrendForecastAgent,
    "ai_impact_modelling": AIImpactModellingAgent,
    "report_generator": ReportGeneratorAgent,
    "alert": AlertAgent,
    "api_connector": APIConnectorAgent,
    "web_scraper": WebScraperAgent,
    "pdf_parser": PDFParserAgent,
    "course_skill_mapper": CourseSkillMapperAgent,
    "policy_recommendation": PolicyRecommendationAgent,
}
