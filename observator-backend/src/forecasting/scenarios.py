"""What-if scenario simulator.

Applies modifiers to baseline forecasts to simulate policy interventions
(e.g., increasing training seats, immigration quotas, sector investment).
"""
import logging
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Scenario:
    """A what-if scenario with modifiers."""
    name: str
    description: str
    supply_modifier: float = 1.0   # Multiplier for supply forecast
    demand_modifier: float = 1.0   # Multiplier for demand forecast
    training_seats: int = 0        # Additional training graduates per period
    ramp_months: int = 6           # Months for modifier to reach full effect


# Predefined scenarios
SCENARIOS = {
    "baseline": Scenario(
        name="Baseline",
        description="Current trajectory with no policy changes",
    ),
    "optimistic": Scenario(
        name="Optimistic",
        description="Increased training investment + economic growth",
        supply_modifier=1.15,
        demand_modifier=1.10,
        training_seats=500,
        ramp_months=6,
    ),
    "pessimistic": Scenario(
        name="Pessimistic",
        description="Economic slowdown + reduced immigration",
        supply_modifier=0.90,
        demand_modifier=0.85,
        ramp_months=3,
    ),
    "emiratisation_push": Scenario(
        name="Emiratisation Push",
        description="Aggressive national workforce development",
        supply_modifier=1.25,
        demand_modifier=1.0,
        training_seats=1000,
        ramp_months=12,
    ),
    "ai_disruption": Scenario(
        name="AI Disruption",
        description="Rapid AI adoption reduces demand in exposed sectors",
        supply_modifier=1.0,
        demand_modifier=0.80,
        ramp_months=12,
    ),
}


def apply_scenario(
    baseline_demand: list[float],
    baseline_supply: list[float],
    scenario_name: str = "baseline",
    custom: Scenario | None = None,
) -> dict:
    """Apply a scenario to baseline forecasts.

    Args:
        baseline_demand: Baseline demand forecast values
        baseline_supply: Baseline supply forecast values
        scenario_name: Name of predefined scenario
        custom: Custom scenario (overrides scenario_name)

    Returns:
        {
            "scenario": str,
            "demand": list[float],
            "supply": list[float],
            "gap": list[float],
        }
    """
    scenario = custom or SCENARIOS.get(scenario_name, SCENARIOS["baseline"])
    n = max(len(baseline_demand), len(baseline_supply))

    demand = np.array(baseline_demand[:n], dtype=float)
    supply = np.array(baseline_supply[:n], dtype=float)

    # Apply ramp-up modifiers
    for i in range(n):
        ramp_factor = min(1.0, (i + 1) / max(scenario.ramp_months, 1))

        demand_mod = 1.0 + (scenario.demand_modifier - 1.0) * ramp_factor
        supply_mod = 1.0 + (scenario.supply_modifier - 1.0) * ramp_factor

        demand[i] *= demand_mod
        supply[i] = supply[i] * supply_mod + scenario.training_seats * ramp_factor

    demand = np.maximum(demand, 0)
    supply = np.maximum(supply, 0)
    gap = demand - supply

    return {
        "scenario": scenario.name,
        "description": scenario.description,
        "demand": np.round(demand, 1).tolist(),
        "supply": np.round(supply, 1).tolist(),
        "gap": np.round(gap, 1).tolist(),
    }


def compare_scenarios(
    baseline_demand: list[float],
    baseline_supply: list[float],
    scenario_names: list[str] | None = None,
) -> list[dict]:
    """Compare multiple scenarios against the same baseline.

    Returns list of scenario results for side-by-side comparison.
    """
    names = scenario_names or list(SCENARIOS.keys())
    results = []

    for name in names:
        if name in SCENARIOS:
            result = apply_scenario(baseline_demand, baseline_supply, name)
            results.append(result)

    return results
