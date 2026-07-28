import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDecisionLogEntry, hasOverrideReason } from './decisionLog';
import { applyDecisionRule, prototypeRuleConfig } from './decisionRules';
import { modelEvaluation } from './modelEvaluation';
import { ModelApiError, requestPredictions } from './modelClient';
import { predictionModeLabel } from './predictionMode';
import { calculateKpis, latestTelemetryPerDrone, sortPriorityQueue } from './priorityQueue';
import { buildPrecomputedRecords, validateTelemetryRows } from './telemetryValidation';
import type { QueueRecord } from '../types';

const rawRecord = {
  timestamp: '2026-07-28T06:30:00', mission_id: 'MISSION-001', drone_id: 'DRN-001', altitude_m: '80',
  velocity_x: '3', velocity_y: '4', velocity_z: '12', acceleration_x: '1', acceleration_y: '2', acceleration_z: '2',
  distance_to_base_m: '900', battery_level_pct: '31', flight_time_s: '1100', hover_duration_s: '120',
  camera_active: '1', ambient_temp_C: '34', wind_speed_mps: '-5.8', wind_dir_deg: '90',
};

function validTelemetry() {
  const result = validateTelemetryRows([rawRecord]);
  expect(result.rejected).toHaveLength(0);
  return result.records[0];
}

function queueRecord(overrides: Partial<QueueRecord> = {}): QueueRecord {
  return { ...validTelemetry(), predicted_power_w: 150, recommended_action: 'Continue Mission', decision_reason: 'test', model_version: 'v1', ...overrides };
}

describe('telemetry validation and feature engineering', () => {
  it('calculates speed_mps', () => expect(validTelemetry().speed_mps).toBe(13));
  it('calculates acceleration_mps2', () => expect(validTelemetry().acceleration_mps2).toBe(3));
  it('calculates wind sin/cos encoding', () => {
    expect(validTelemetry().wind_dir_sin).toBeCloseTo(1);
    expect(validTelemetry().wind_dir_cos).toBeCloseTo(0);
  });
  it('calculates hour sin/cos encoding', () => {
    expect(validTelemetry().hour_sin).toBeCloseTo(Math.sin(2 * Math.PI * 6.5 / 24));
    expect(validTelemetry().hour_cos).toBeCloseTo(Math.cos(2 * Math.PI * 6.5 / 24));
  });
  it('converts negative wind to magnitude', () => expect(validTelemetry().wind_speed_mps).toBe(5.8));
  it('rejects records with missing required fields', () => {
    const { altitude_m: _altitude, ...missingAltitude } = rawRecord;
    const result = validateTelemetryRows([missingAltitude]);
    expect(result.records).toHaveLength(0);
    expect(result.rejected[0].missingFields).toContain('altitude_m');
  });
  it('accepts precomputed estimates and derives the recommendation locally', () => {
    const row = { timestamp: rawRecord.timestamp, mission_id: rawRecord.mission_id, drone_id: rawRecord.drone_id, altitude_m: '80', speed_mps: '13', flight_time_s: '1100', battery_level_pct: '18', wind_speed_mps: '5.8', distance_to_base_m: '900', predicted_power_w: '151.1' };
    const result = validateTelemetryRows([row]);
    expect(result.rejected).toHaveLength(0);
    expect(result.detectedPrecomputedOutput).toBe(true);
    expect(buildPrecomputedRecords([row], result.records)[0]).toMatchObject({ predicted_power_w: 151.1, recommended_action: 'Return to Base' });
  });
});

describe('verified prototype decision rules', () => {
  it('returns for critical battery', () => expect(applyDecisionRule({ ...validTelemetry(), battery_level_pct: 20 }, 100, prototypeRuleConfig).recommended_action).toBe('Return to Base'));
  it('returns for caution battery plus far distance and high experimental power', () => expect(applyDecisionRule({ ...validTelemetry(), battery_level_pct: 35, distance_to_base_m: 1337 }, 175.43872553063508, prototypeRuleConfig).recommended_action).toBe('Return to Base'));
  it('delays for high wind', () => expect(applyDecisionRule({ ...validTelemetry(), battery_level_pct: 60, wind_speed_mps: 4.913084403189413 }, 100, prototypeRuleConfig).recommended_action).toBe('Delay Mission'));
  it('continues when no prototype condition is met', () => expect(applyDecisionRule({ ...validTelemetry(), battery_level_pct: 60, wind_speed_mps: 4 }, 100, prototypeRuleConfig).recommended_action).toBe('Continue Mission'));
});

describe('queue, modes, and human decision records', () => {
  it('keeps only the latest raw telemetry record for each drone before prediction', () => {
    const latest = latestTelemetryPerDrone([
      { ...validTelemetry(), timestamp: '2026-07-28T06:00:00', drone_id: 'DRN-001' },
      { ...validTelemetry(), timestamp: '2026-07-28T07:00:00', drone_id: 'DRN-001' },
      { ...validTelemetry(), timestamp: '2026-07-28T06:30:00', drone_id: 'DRN-002' },
    ]);
    expect(latest).toHaveLength(2);
    expect(latest.find((record) => record.drone_id === 'DRN-001')?.timestamp).toBe('2026-07-28T07:00:00');
  });
  it('sorts Return, Delay, Continue, then battery, distance, and power', () => {
    const sorted = sortPriorityQueue([
      queueRecord({ drone_id: 'continue', recommended_action: 'Continue Mission' }),
      queueRecord({ drone_id: 'delay', recommended_action: 'Delay Mission' }),
      queueRecord({ drone_id: 'near-high-power', recommended_action: 'Return to Base', battery_level_pct: 20, distance_to_base_m: 1000, predicted_power_w: 250 }),
      queueRecord({ drone_id: 'far-low-power', recommended_action: 'Return to Base', battery_level_pct: 20, distance_to_base_m: 1400, predicted_power_w: 180 }),
      queueRecord({ drone_id: 'low-battery', recommended_action: 'Return to Base', battery_level_pct: 10 }),
    ]);
    expect(sorted.map((record) => record.drone_id)).toEqual(['low-battery', 'far-low-power', 'near-high-power', 'delay', 'continue']);
  });
  const kpiRecords = () => [
    queueRecord({ recommended_action: 'Return to Base', battery_level_pct: 20 }),
    queueRecord({ drone_id: 'DRN-002', recommended_action: 'Delay Mission', battery_level_pct: 40 }),
    queueRecord({ drone_id: 'DRN-003', battery_level_pct: 60 }),
  ];
  it('calculates the active-drone KPI', () => {
    expect(calculateKpis(kpiRecords()).activeDrones).toBe(3);
  });
  it('calculates the average-battery KPI', () => {
    expect(calculateKpis(kpiRecords()).averageBattery).toBe(40);
  });
  it('calculates action-count KPIs', () => {
    const kpis = calculateKpis([
      queueRecord({ recommended_action: 'Return to Base', battery_level_pct: 20 }),
      queueRecord({ drone_id: 'DRN-002', recommended_action: 'Delay Mission', battery_level_pct: 40 }),
      queueRecord({ drone_id: 'DRN-003', battery_level_pct: 60 }),
    ]);
    expect(kpis).toMatchObject({ attentionRequired: 2, continueCount: 1, returnCount: 1, delayCount: 1 });
  });
  it('uses the required precomputed mode label', () => expect(predictionModeLabel.precomputed).toBe('Precomputed model output'));
  it('does not create a fake experimental estimate when a raw upload has no API URL', async () => {
    await expect(requestPredictions([validTelemetry()], '')).rejects.toBeInstanceOf(ModelApiError);
  });
  it('creates a complete confirmation decision-log entry', () => {
    const entry = createDecisionLogEntry(queueRecord(), 'Continue Mission', 'Confirmed', '', 'precomputed', '2026-07-28T10:00:00Z');
    expect(entry).toMatchObject({ decision_timestamp: '2026-07-28T10:00:00Z', record_timestamp: rawRecord.timestamp, decision_status: 'Confirmed', data_mode: 'precomputed' });
  });
  it('requires a reason for an override', () => {
    expect(hasOverrideReason('   ')).toBe(false);
    expect(() => createDecisionLogEntry(queueRecord(), 'Return to Base', 'Overridden', ' ', 'demo')).toThrow('override reason');
  });
});

describe('verified evaluation and language', () => {
  it('uses the verified held-out model metrics', () => {
    expect(modelEvaluation).toEqual([
      { model: 'Mean prediction reference', mae: 23.722916, rmse: 29.730719, r2: -0.000015 },
      { model: 'Linear Regression', mae: 23.724022, rmse: 29.733552, r2: -0.000205 },
      { model: 'Random Forest', mae: 23.771296, rmse: 29.784403, r2: -0.003629 },
    ]);
  });
  it('does not contain unsupported dashboard claims', async () => {
    const [app, readme] = await Promise.all([readFile(new URL('../App.tsx', import.meta.url), 'utf8'), readFile(new URL('../../README.md', import.meta.url), 'utf8')]);
    const unsupported = [
      ['mission', 'completion rate'], ['ai', 'confidence'], ['prediction', 'confidence'], ['risk', 'reduction'],
      ['cost', 'saving'], ['operational', 'improvement'], ['automatic', 'drone return'], ['autonomous', 'command'],
      ['high model', 'accuracy'], ['reliable', 'prediction'], ['production', 'model'],
    ].map((parts) => new RegExp(parts.join('\\s+'), 'i'));
    unsupported.forEach((pattern) => expect(`${app}\n${readme}`).not.toMatch(pattern));
  });
});

afterEach(() => vi.unstubAllGlobals());
