# UAV Energy Decision Support

Academic decision-support prototype for in-flight solar-farm inspection operations. It predicts `power_consumption_watts` through an external regression service, then applies separate prototype rules to help an Operations Engineer review Continue, Delay, or Return recommendations. It never sends a flight command.

## Architecture

This repository remains a React + TypeScript + Vite single-page application, deployed to Vercel with the existing SPA rewrite. It has no Python runtime or Vercel API route. The browser sends validated feature records to `MODEL_API_URL` when configured. The prediction service must implement `POST /predict`, load `uav_power_regression_v1.joblib`, return the documented prediction response plus `rule_config`, and enable CORS for the dashboard origin.

Without that endpoint, the app can load a verified precomputed queue or use clearly labeled demo data. It does not fabricate predictions.

## Notebook output placement

Copy the notebook outputs into `public/outputs` while preserving their output-relative paths:

```text
public/outputs/data/SurveilDrone_Net23_cleaned.csv
public/outputs/data/modeling_data.csv
public/outputs/eda/eda_summary.json
public/outputs/eda/eda_numeric_associations.csv
public/outputs/model/test_metrics.csv
public/outputs/model/test_predictions.csv
public/outputs/model/permutation_importance.csv
public/outputs/model/dashboard_decision_queue.csv
public/outputs/model/artifacts/uav_power_regression_v1_metadata.json
```

Keep `uav_power_regression_v1.joblib` out of `public`: a browser cannot use it. Deploy that bundle with the Python prediction service instead. The dashboard automatically attempts to load metrics, permutation importance, metadata, and the precomputed decision queue from these public paths. The queue must include the telemetry fields used by the dashboard plus `predicted_power_w`, `recommended_action`, and `decision_reason`.

## Environment

Copy `.env.example` to `.env.local` and configure `MODEL_API_URL` for live predictions. Because this is a static browser application, the URL is public at build time. Do not add an API key to a Vite environment variable; authentication requires a server-side proxy or an appropriately protected model service.

In Vercel, add `MODEL_API_URL` to the project environment variables and redeploy. The endpoint must be HTTPS and permit cross-origin POST requests from the deployed dashboard.

## Run and verify

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
```

The test suite covers feature engineering, missing-field rejection, decision rules, queue sorting, KPIs, precomputed-mode labeling, and API failure handling.

## CSV modes

- Raw telemetry upload: validates required identifiers/features, derives speed, acceleration, wind-direction and hour encodings, requests the configured model, then applies the separate decision-rule layer.
- Precomputed output upload: detected only when the model-output fields are supplied. It is explicitly labeled “Precomputed model output — no live model request was performed.”
- Demo: stable proxy telemetry records for walkthrough only, explicitly labeled “Demo data — not live telemetry.”

Prototype rule thresholds are dataset-derived assumptions, not manufacturer or legal limits. The Operations Engineer retains final authority.
