import { csvRowsToObjects } from './csv';
import type { ImportanceItem, ModelMetrics, QueueRecord, RuleConfig } from '../types';
import { buildPrecomputedRecords, validateTelemetryRows } from './telemetryValidation';

async function fetchOutput(path: string): Promise<Record<string, string>[] | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return csvRowsToObjects(await response.text());
  } catch {
    return null;
  }
}

async function fetchJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function metricFromRow(row: Record<string, string> | undefined): ModelMetrics | undefined {
  if (!row) return undefined;
  const value = (key: string) => Number(row[key] ?? row[key.toLowerCase()]);
  return {
    model_name: row.model_name, model_version: row.model_version,
    MAE: value('MAE'), RMSE: value('RMSE'), R2: value('R2'),
  };
}

function readRuleConfig(metadata: Record<string, unknown> | null): RuleConfig | undefined {
  const config = metadata?.rule_config;
  if (!config || typeof config !== 'object') return undefined;
  const candidate = config as Record<string, unknown>;
  const required = ['battery_critical_pct', 'battery_caution_pct', 'power_high_w_train_q80', 'wind_caution_mps_train_q90', 'distance_far_m_train_q75'];
  if (!required.every((key) => Number.isFinite(candidate[key]))) return undefined;
  return candidate as unknown as RuleConfig;
}

export async function loadOutputFiles(): Promise<{ metrics?: ModelMetrics; importance: ImportanceItem[]; ruleConfig?: RuleConfig; modelName?: string; modelVersion?: string; precomputedQueue: QueueRecord[] }> {
  const [metricRows, importanceRows, queueRows, metadata] = await Promise.all([
    fetchOutput('/outputs/model/test_metrics.csv'), fetchOutput('/outputs/model/permutation_importance.csv'),
    fetchOutput('/outputs/model/dashboard_decision_queue.csv'),
    fetchJson('/outputs/model/artifacts/uav_power_regression_v1_metadata.json'),
  ]);
  const metrics = metricFromRow(metricRows?.[0]);
  const importance = (importanceRows ?? []).map((row) => ({
    feature: row.feature ?? row.Feature ?? 'Unnamed feature', importance: Number(row.importance ?? row.Importance ?? row.importance_mean),
  })).filter((item) => Number.isFinite(item.importance)).sort((a, b) => b.importance - a.importance);
  const validation = validateTelemetryRows(queueRows ?? []);
  const precomputedQueue = queueRows ? buildPrecomputedRecords(queueRows, validation.records) : [];
  return {
    metrics, importance, ruleConfig: readRuleConfig(metadata),
    modelName: typeof metadata?.model_name === 'string' ? metadata.model_name : undefined,
    modelVersion: typeof metadata?.model_version === 'string' ? metadata.model_version : undefined,
    precomputedQueue,
  };
}
