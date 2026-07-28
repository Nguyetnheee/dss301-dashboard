import type { ModelMetrics, RuleConfig, TelemetryRecord } from '../types';

interface PredictionResponse {
  model_version?: string;
  model_name?: string;
  test_metrics?: ModelMetrics;
  rule_config?: RuleConfig;
  predictions?: Array<{ timestamp?: string; mission_id?: string; drone_id?: string; predicted_power_w?: number; error?: string }>;
}

export class ModelApiError extends Error {}

const modelApiUrl = (import.meta.env as ImportMetaEnv & { MODEL_API_URL?: string }).MODEL_API_URL;

export function hasModelApi(): boolean {
  return Boolean(modelApiUrl);
}

function isRuleConfig(value: unknown): value is RuleConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return ['battery_critical_pct', 'battery_caution_pct', 'power_high_w_train_q80', 'wind_caution_mps_train_q90', 'distance_far_m_train_q75']
    .every((key) => Number.isFinite(config[key]));
}

export async function requestPredictions(records: TelemetryRecord[], apiUrl = modelApiUrl) {
  if (!apiUrl) throw new ModelApiError('MODEL_API_URL is not configured. Load precomputed model output or configure a prediction service.');
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }),
    });
  } catch {
    throw new ModelApiError('The model service could not be reached. Check the endpoint and its CORS configuration.');
  }
  if (!response.ok) throw new ModelApiError(`The model service returned HTTP ${response.status}.`);
  let payload: PredictionResponse;
  try {
    payload = await response.json() as PredictionResponse;
  } catch {
    throw new ModelApiError('The model service returned invalid JSON.');
  }
  if (!Array.isArray(payload.predictions)) throw new ModelApiError('The model response is missing its predictions array.');
  if (!isRuleConfig(payload.rule_config)) throw new ModelApiError('The model response is missing a valid rule_config; prototype recommendations cannot be evaluated safely.');

  const predictionsByIdentity = new Map(payload.predictions.map((prediction) => [
    `${prediction.timestamp ?? ''}|${prediction.mission_id ?? ''}|${prediction.drone_id ?? ''}`,
    prediction,
  ]));
  const results = records.map((record, index) => {
    const identity = `${record.timestamp}|${record.mission_id}|${record.drone_id}`;
    const prediction = predictionsByIdentity.get(identity) ?? (payload.predictions?.length === records.length ? payload.predictions[index] : undefined);
    if (!prediction || !Number.isFinite(prediction.predicted_power_w)) {
      return { record, error: prediction?.error ?? 'No valid prediction was returned for this record.' };
    }
    return { record, predictedPower: prediction.predicted_power_w as number };
  });
  if (!results.some((result) => result.predictedPower !== undefined)) {
    throw new ModelApiError('The model response did not contain any valid predictions.');
  }

  return {
    modelVersion: payload.model_version ?? 'Unknown model version', modelName: payload.model_name ?? 'Unknown model',
    metrics: payload.test_metrics, ruleConfig: payload.rule_config,
    results,
  };
}
