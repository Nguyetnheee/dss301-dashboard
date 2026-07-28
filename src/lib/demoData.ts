import { applyDecisionRule, demoRuleConfig } from './decisionRules';
import type { QueueRecord, TelemetryRecord } from '../types';

const records: Array<TelemetryRecord & { predicted_power_w: number }> = [
  { timestamp: '2026-07-28T09:30:00', mission_id: 'MISSION-001', drone_id: 'DRN-001', altitude_m: 80, speed_mps: 6.2, acceleration_mps2: 0.7, distance_to_base_m: 900, battery_level_pct: 12, flight_time_s: 1100, hover_duration_s: 120, camera_active: 1, ambient_temp_C: 34, wind_speed_mps: 5.8, wind_dir_sin: 0.5, wind_dir_cos: 0.866, hour_sin: 0.609, hour_cos: -0.793, predicted_power_w: 158.4 },
  { timestamp: '2026-07-28T09:32:00', mission_id: 'MISSION-002', drone_id: 'DRN-002', altitude_m: 72, speed_mps: 5.7, acceleration_mps2: 0.5, distance_to_base_m: 640, battery_level_pct: 58, flight_time_s: 760, hover_duration_s: 54, camera_active: 1, ambient_temp_C: 33, wind_speed_mps: 8.4, wind_dir_sin: 0.707, wind_dir_cos: 0.707, hour_sin: 0.609, hour_cos: -0.793, predicted_power_w: 149.8 },
  { timestamp: '2026-07-28T09:34:00', mission_id: 'MISSION-003', drone_id: 'DRN-003', altitude_m: 94, speed_mps: 6.8, acceleration_mps2: 0.9, distance_to_base_m: 1380, battery_level_pct: 27, flight_time_s: 1420, hover_duration_s: 90, camera_active: 1, ambient_temp_C: 35, wind_speed_mps: 4.1, wind_dir_sin: 0, wind_dir_cos: 1, hour_sin: 0.609, hour_cos: -0.793, predicted_power_w: 188.2 },
  { timestamp: '2026-07-28T09:36:00', mission_id: 'MISSION-004', drone_id: 'DRN-004', altitude_m: 68, speed_mps: 4.9, acceleration_mps2: 0.4, distance_to_base_m: 360, battery_level_pct: 74, flight_time_s: 520, hover_duration_s: 35, camera_active: 0, ambient_temp_C: 31, wind_speed_mps: 2.2, wind_dir_sin: -0.5, wind_dir_cos: 0.866, hour_sin: 0.609, hour_cos: -0.793, predicted_power_w: 112.1 },
];

export const demoQueue: QueueRecord[] = records.map(({ predicted_power_w, ...record }) => ({
  ...record, predicted_power_w, ...applyDecisionRule(record, predicted_power_w, demoRuleConfig), model_version: 'uav_power_regression_v1 (demo)', rule_config: demoRuleConfig,
}));
