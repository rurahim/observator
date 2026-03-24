"""Observator 18-agent pipeline — orchestrates data ingestion, quality,
normalization, analysis, forecasting, and reporting as a LangGraph StateGraph.

Public API:
    from src.pipeline.executor import run_pipeline, get_pipeline_status
    from src.pipeline.graph import compile_pipeline
    from src.pipeline.base import BaseAgent, PipelineState
"""
