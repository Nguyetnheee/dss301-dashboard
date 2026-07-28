# UAV Energy Decision Support

Academic decision-support prototype for in-flight inspection decisions. It organizes observed telemetry, displays an experimental power estimate when one is available, applies prototype decision rules, and records the Operations Engineer's decision. It never sends a flight command.

Academic decision-support prototype. Recommendations are based on proxy telemetry data and prototype rules. The Operations Engineer retains final authority.

## Architecture

This remains a React + TypeScript + Vite single-page application with Tailwind CSS and the existing Vercel SPA rewrite. The reusable DSS logic is in `src/lib`: telemetry validation and feature engineering, the prototype rules, priority sorting/KPIs, model client, and decision-log construction. `api/predict.py` is a Python endpoint that loads the verified model bundle outside the public frontend directory.

The browser calls `MODEL_API_URL`, which defaults locally to `http://127.0.0.1:8000/predict`. For a raw upload, only the latest valid record for each drone is sent to the model endpoint; this is the dashboard's current latest-record view and prevents a 140,000-row CSV from becoming a large model request. The dashboard applies its local verified prototype rules; the model output is never the final Continue / Return / Delay decision. Do not publish `uav_power_regression_v1.joblib` in `public`.

## Data modes

- **Precomputed decision queue (recommended demo mode):** Upload `dashboard_decision_queue.csv`. It is labeled “Precomputed model output — no live model request was performed.”
- **Raw telemetry:** The app validates the raw fields and derives speed, acceleration, wind direction, and hour encodings. With `MODEL_API_URL`, it requests experimental estimates and builds the priority queue. Without it, the app remains usable in raw telemetry review and does not invent predictions.
- **Demo data:** Clearly marked proxy records for a traceable walkthrough, not live telemetry.

Expected precomputed columns include `priority_rank`, `priority_level`, `priority_score`, `drone_id`, `timestamp`, `mission_id`, `battery_level_pct`, `wind_speed_mps`, `distance_to_base_m`, `altitude_m`, `speed_mps`, `flight_time_s`, and `predicted_power_w`. If `recommended_action` and `decision_reason` are also present, the dashboard ignores them and derives the current recommendation and reason from the verified local prototype rules.

## Notebook outputs

Optional generated files can be served from `public/outputs/model/`:

```text
public/outputs/model/dashboard_decision_queue.csv
public/outputs/model/test_metrics.csv
public/outputs/model/permutation_importance.csv
public/outputs/model/artifacts/uav_power_regression_v1_metadata.json
```

`uav_power_regression_v1.joblib` must remain outside the frontend public directory.

## Environment and deployment

For local use, start the API using Python with the dependencies in `requirements.txt`, then start Vite in a second terminal:

```bash
python -m pip install -r requirements.txt
python api/predict.py
npm run dev
```

`.env.local` is preconfigured with `MODEL_API_URL=http://127.0.0.1:8000/predict`; restart Vite after changing it. `MODEL_API_KEY` is intentionally not read by browser code.

For Vercel, `api/predict.py` is deployed as `/api/predict` and the model artifact is kept under `api/model_artifacts/`, never `public/`. Set `MODEL_API_URL=/api/predict` in the Vercel project environment, then redeploy. The existing SPA rewrite remains unchanged.

## Run and verify

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
```
