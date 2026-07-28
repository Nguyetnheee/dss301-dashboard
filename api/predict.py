"""Vercel-compatible prediction endpoint for the DSS prototype model."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import joblib
import numpy as np

FEATURES = [
    "altitude_m", "speed_mps", "acceleration_mps2", "distance_to_base_m",
    "battery_level_pct", "flight_time_s", "hover_duration_s", "camera_active",
    "ambient_temp_C", "wind_speed_mps", "wind_dir_sin", "wind_dir_cos",
    "hour_sin", "hour_cos",
]

ROOT = Path(__file__).resolve().parents[1]
LOCAL_SOURCE_ARTIFACT = ROOT.parent / "DSS301-Drone-DSS" / "outputs" / "model" / "artifacts" / "uav_power_regression_v1.joblib"
DEFAULT_ARTIFACT = ROOT / "api" / "model_artifacts" / "uav_power_regression_v1.joblib"
MODEL_PATH = Path(os.environ.get("MODEL_ARTIFACT_PATH", DEFAULT_ARTIFACT if DEFAULT_ARTIFACT.exists() else LOCAL_SOURCE_ARTIFACT))
MODEL_BUNDLE: dict[str, Any] | None = None


def load_model() -> dict[str, Any]:
    global MODEL_BUNDLE
    if MODEL_BUNDLE is None:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError("Model artifact was not found. Set MODEL_ARTIFACT_PATH on the server.")
        MODEL_BUNDLE = joblib.load(MODEL_PATH)
    return MODEL_BUNDLE


def predict_records(records: list[dict[str, Any]]) -> dict[str, Any]:
    if not records:
        raise ValueError("records must contain at least one telemetry record.")
    if len(records) > 500:
        raise ValueError("At most 500 latest telemetry records may be predicted per request.")

    rows: list[list[float]] = []
    identities: list[dict[str, str]] = []
    for index, record in enumerate(records):
        try:
            rows.append([float(record[feature]) for feature in FEATURES])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"Record {index + 1} is missing or has an invalid model feature.") from error
        identities.append({key: str(record.get(key, "")) for key in ("timestamp", "mission_id", "drone_id")})

    bundle = load_model()
    predicted = bundle["pipeline"].predict(np.asarray(rows, dtype=float))
    return {
        "model_version": bundle["model_version"],
        "model_name": bundle["model_name"],
        "test_metrics": bundle["test_metrics"],
        "rule_config": bundle["rule_config"],
        "predictions": [{**identity, "predicted_power_w": float(value)} for identity, value in zip(identities, predicted, strict=True)],
    }


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        content = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Access-Control-Allow-Origin", os.environ.get("MODEL_API_ALLOWED_ORIGIN", "*"))
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(204, {})

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/predict", "/api/predict"):
            self._send_json(404, {"error": "Not found."})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 2_000_000:
                raise ValueError("Request body must be between 1 byte and 2 MB.")
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            records = payload.get("records") if isinstance(payload, dict) else None
            if not isinstance(records, list):
                raise ValueError("Request JSON must contain a records array.")
            self._send_json(200, predict_records(records))
        except (ValueError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": str(error)})
        except FileNotFoundError as error:
            self._send_json(503, {"error": str(error)})
        except Exception:
            self._send_json(500, {"error": "The experimental model could not process this request."})

    def log_message(self, _format: str, *_args: Any) -> None:
        return


if __name__ == "__main__":
    port = int(os.environ.get("MODEL_API_PORT", "8000"))
    print(f"Experimental DSS model API listening on http://127.0.0.1:{port}/predict")
    HTTPServer(("127.0.0.1", port), handler).serve_forever()
