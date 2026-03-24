"""Forecast model registry — defines available forecast models and their configurations.

Each model wraps a statistical/ML time series method and provides a uniform interface.
"""
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class ForecastResult:
    """Result from a forecast model."""
    dates: list[str]  # forecast period labels (YYYY-MM)
    predicted: list[float]
    lower: list[float]  # confidence interval lower bound
    upper: list[float]  # confidence interval upper bound
    model_name: str
    model_version: str = "1.0"
    metrics: dict | None = None  # MAE, RMSE, etc.


class BaseForecastModel(ABC):
    """Base class for forecast models."""

    name: str = "base"
    version: str = "1.0"

    @abstractmethod
    def fit_predict(
        self,
        dates: list[str],
        values: list[float],
        horizon: int = 12,
        confidence: float = 0.95,
    ) -> ForecastResult:
        """Fit on historical data and predict future values.

        Args:
            dates: Historical period labels (YYYY-MM)
            values: Historical values
            horizon: Number of periods to forecast
            confidence: Confidence interval level (0-1)

        Returns:
            ForecastResult with predictions and confidence intervals
        """
        ...


class LinearTrendModel(BaseForecastModel):
    """Simple linear trend with seasonal decomposition.

    Production fallback when statsmodels/prophet not available.
    """

    name = "linear_trend"
    version = "1.0"

    def fit_predict(
        self,
        dates: list[str],
        values: list[float],
        horizon: int = 12,
        confidence: float = 0.95,
    ) -> ForecastResult:
        n = len(values)
        if n < 3:
            raise ValueError("Need at least 3 data points for forecasting")

        arr = np.array(values, dtype=float)
        x = np.arange(n)

        # Fit linear trend
        coeffs = np.polyfit(x, arr, 1)
        trend = np.polyval(coeffs, x)

        # Seasonal component (monthly pattern if enough data)
        residuals = arr - trend
        period = min(12, n // 2) if n >= 6 else 1
        seasonal = np.zeros(period)
        if period > 1:
            for i in range(period):
                mask = np.arange(i, n, period)
                if len(mask) > 0:
                    seasonal[i] = np.mean(residuals[mask])

        # Residual std for confidence intervals
        fitted = trend + np.tile(seasonal, n // period + 1)[:n]
        residual_std = np.std(arr - fitted) if n > 2 else np.std(arr) * 0.1

        # Z-score for confidence
        try:
            from scipy.stats import norm
            z = norm.ppf((1 + confidence) / 2)
        except ImportError:
            # Approximate z-score: 1.96 for 95%, 2.576 for 99%
            z = {0.90: 1.645, 0.95: 1.96, 0.99: 2.576}.get(confidence, 1.96)

        # Forecast
        future_x = np.arange(n, n + horizon)
        future_trend = np.polyval(coeffs, future_x)
        future_seasonal = np.tile(seasonal, horizon // period + 1)[:horizon]
        predicted = future_trend + future_seasonal

        # Increasing uncertainty over time
        uncertainty = np.array([residual_std * np.sqrt(1 + i / n) for i in range(horizon)])
        lower = predicted - z * uncertainty
        upper = predicted + z * uncertainty

        # Ensure non-negative
        predicted = np.maximum(predicted, 0)
        lower = np.maximum(lower, 0)

        # Generate future dates
        future_dates = _generate_future_dates(dates[-1], horizon)

        # Metrics on training data
        mae = np.mean(np.abs(arr - fitted))
        rmse = np.sqrt(np.mean((arr - fitted) ** 2))

        return ForecastResult(
            dates=future_dates,
            predicted=predicted.tolist(),
            lower=lower.tolist(),
            upper=upper.tolist(),
            model_name=self.name,
            model_version=self.version,
            metrics={"mae": round(float(mae), 2), "rmse": round(float(rmse), 2)},
        )


class ETSModel(BaseForecastModel):
    """Exponential Smoothing (ETS) via statsmodels."""

    name = "ets"
    version = "1.0"

    def fit_predict(
        self,
        dates: list[str],
        values: list[float],
        horizon: int = 12,
        confidence: float = 0.95,
    ) -> ForecastResult:
        try:
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
        except ImportError:
            logger.warning("statsmodels not installed, falling back to linear trend")
            return LinearTrendModel().fit_predict(dates, values, horizon, confidence)

        n = len(values)
        arr = np.array(values, dtype=float)

        # Determine seasonal period
        seasonal_periods = 12 if n >= 24 else (4 if n >= 8 else None)

        try:
            model = ExponentialSmoothing(
                arr,
                trend="add",
                seasonal="add" if seasonal_periods else None,
                seasonal_periods=seasonal_periods,
            ).fit(optimized=True)

            forecast = model.forecast(horizon)
            predicted = np.maximum(forecast, 0)

            # Confidence intervals from residual std
            residual_std = np.std(model.resid)
            from scipy.stats import norm
            z = norm.ppf((1 + confidence) / 2)
            uncertainty = np.array([residual_std * np.sqrt(1 + i / n) for i in range(horizon)])
            lower = np.maximum(predicted - z * uncertainty, 0)
            upper = predicted + z * uncertainty

            future_dates = _generate_future_dates(dates[-1], horizon)

            mae = np.mean(np.abs(model.resid))
            rmse = np.sqrt(np.mean(model.resid ** 2))

            return ForecastResult(
                dates=future_dates,
                predicted=predicted.tolist(),
                lower=lower.tolist(),
                upper=upper.tolist(),
                model_name=self.name,
                model_version=self.version,
                metrics={"mae": round(float(mae), 2), "rmse": round(float(rmse), 2), "aic": round(float(model.aic), 2)},
            )
        except Exception as e:
            logger.warning(f"ETS failed: {e}, falling back to linear trend")
            return LinearTrendModel().fit_predict(dates, values, horizon, confidence)


class AutoModel(BaseForecastModel):
    """Auto-select best model based on data characteristics."""

    name = "auto"
    version = "1.0"

    def fit_predict(
        self,
        dates: list[str],
        values: list[float],
        horizon: int = 12,
        confidence: float = 0.95,
    ) -> ForecastResult:
        n = len(values)

        # Try ETS first if enough data
        if n >= 12:
            try:
                result = ETSModel().fit_predict(dates, values, horizon, confidence)
                result.model_name = f"auto({result.model_name})"
                return result
            except Exception:
                pass

        # Fallback to linear trend
        result = LinearTrendModel().fit_predict(dates, values, horizon, confidence)
        result.model_name = f"auto({result.model_name})"
        return result


# --- Model registry ---

MODEL_REGISTRY: dict[str, type[BaseForecastModel]] = {
    "auto": AutoModel,
    "linear_trend": LinearTrendModel,
    "ets": ETSModel,
}


def get_model(name: str = "auto") -> BaseForecastModel:
    """Get a forecast model by name."""
    cls = MODEL_REGISTRY.get(name, AutoModel)
    return cls()


# --- Helpers ---

def _generate_future_dates(last_date: str, horizon: int) -> list[str]:
    """Generate YYYY-MM labels for future periods."""
    parts = last_date.split("-")
    year = int(parts[0])
    month = int(parts[1])

    dates = []
    for _ in range(horizon):
        month += 1
        if month > 12:
            month = 1
            year += 1
        dates.append(f"{year:04d}-{month:02d}")
    return dates
