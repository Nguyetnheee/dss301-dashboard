import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDecisionRule, demoRuleConfig } from './decisionRules';
import { ModelApiError, requestPredictions } from './modelClient';
import { predictionModeLabel } from './predictionMode';
import { calculateKpis, sortPriorityQueue } from './priorityQueue';
import { validateTelemetryRows } from './telemetryValidation';
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

function queueRecord(overrides: Partial<QueueRecord>): QueueRecord {
  return { ...validTelemetry(), predicted_power_w: 150, recommended_action: 'Continue Mission', decision_reason: 'test', model_version: 'v1', ...overrides };
}

describe('telemetry validation and feature engineering', () => {
  it('calculates derived speed magnitude', () => {
    const record = validTelemetry();
    expect(record.speed_mps).toBe(13);
  });

  it('calculates derived acceleration magnitude', () => {
    const record = validTelemetry();
    expect(record.acceleration_mps2).toBe(3);
  });

  it('calculates circular wind encoding and absolute wind magnitude', () => {
    const record = validTelemetry();
    expect(record.wind_speed_mps).toBe(5.8);
    expect(record.wind_dir_sin).toBeCloseTo(1);
    expect(record.wind_dir_cos).toBeCloseTo(0);
  });

  it('rejects records with missing required fields', () => {
    const { altitude_m: _altitude, ...missingAltitude } = rawRecord;
    const result = validateTelemetryRows([missingAltitude]);
    expect(result.records).toHaveLength(0);
    expect(result.rejected[0].missingFields).toContain('altitude_m');
  });

  it('identifies and labels precomputed model outputs', () => {
    const result = validateTelemetryRows([{ ...rawRecord, predicted_power_w: '155.2', recommended_action: 'Continue Mission', decision_reason: 'No condition triggered.' }]);
    expect(result.detectedPrecomputedOutput).toBe(true);
    expect(predictionModeLabel.precomputed).toBe('Precomputed model output');
  });
});

describe('prototype decision rules', () => {
  it('returns for critical battery', () => {
    expect(applyDecisionRule({ ...validTelemetry(), battery_level_pct: 15 }, 100, demoRuleConfig).recommended_action).toBe('Return to Base');
  });

  it('returns for caution battery with far distance and high predicted power', () => {
    expect(applyDecisionRule({ ...validTelemetry(), battery_level_pct: 30, distance_to_base_m: 1000 }, 170, demoRuleConfig).recommended_action).toBe('Return to Base');
  });

  it('delays for high wind', () => {
    expect(applyDecisionRule({ ...validTelemetry(), battery_level_pct: 60, wind_speed_mps: 8 }, 100, demoRuleConfig).recommended_action).toBe('Delay Mission');
  });

  it('continues when no prototype condition is met', () => {
    expect(applyDecisionRule({ ...validTelemetry(), battery_level_pct: 60, wind_speed_mps: 4 }, 100, demoRuleConfig).recommended_action).toBe('Continue Mission');
  });
});

describe('queue and API behavior', () => {
  it('sorts return, delay, and continue records using the required tie breakers', () => {
    const sorted = sortPriorityQueue([
      queueRecord({ drone_id: 'continue', recommended_action: 'Continue Mission' }),
      queueRecord({ drone_id: 'delay', recommended_action: 'Delay Mission' }),
      queueRecord({ drone_id: 'return-high', recommended_action: 'Return to Base', battery_level_pct: 20 }),
      queueRecord({ drone_id: 'return-low', recommended_action: 'Return to Base', battery_level_pct: 10 }),
    ]);
    expect(sorted.map((record) => record.drone_id)).toEqual(['return-low', 'return-high', 'delay', 'continue']);
  });

  it('calculates traceable dashboard KPIs', () => {
    const kpis = calculateKpis([
      queueRecord({ recommended_action: 'Return to Base', battery_level_pct: 20 }),
      queueRecord({ drone_id: 'DRN-002', recommended_action: 'Delay Mission', battery_level_pct: 40 }),
      queueRecord({ drone_id: 'DRN-003', battery_level_pct: 60 }),
    ]);
    expect(kpis).toMatchObject({ activeDrones: 3, averageBattery: 40, attentionRequired: 2, returnCount: 1, delayCount: 1 });
  });

  it('surfaces model service network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(requestPredictions([validTelemetry()], 'https://model.example.test/predict')).rejects.toBeInstanceOf(ModelApiError);
  });
});

afterEach(() => vi.unstubAllGlobals());
