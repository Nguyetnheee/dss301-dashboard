import type { RejectedRecord, TelemetryRecord, ValidationResult } from '../types';
import { applyDecisionRule, prototypeRuleConfig } from './decisionRules';

const FEATURE_FIELDS = [
  'altitude_m', 'speed_mps', 'acceleration_mps2', 'distance_to_base_m', 'battery_level_pct',
  'flight_time_s', 'hover_duration_s', 'camera_active', 'ambient_temp_C', 'wind_speed_mps',
  'wind_dir_sin', 'wind_dir_cos', 'hour_sin', 'hour_cos',
] as const;

const ID_FIELDS = ['timestamp', 'mission_id', 'drone_id'] as const;
const PRECOMPUTED_REQUIRED_FIELDS = [
  'timestamp', 'mission_id', 'drone_id', 'battery_level_pct', 'wind_speed_mps', 'distance_to_base_m',
  'altitude_m', 'speed_mps', 'flight_time_s', 'predicted_power_w',
] as const;

const aliases: Record<string, string> = {
  droneid: 'drone_id', drone_id: 'drone_id', drone: 'drone_id',
  predictedpowerw: 'predicted_power_w', predicted_power_w: 'predicted_power_w',
  winddirdeg: 'wind_dir_deg', winddirectiondeg: 'wind_dir_deg',
};

export function normalizeColumnName(column: string): string {
  const normalized = column.trim().replace(/^\uFEFF/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return aliases[normalized] ?? normalized;
}

function numberValue(row: Record<string, string>, field: string, invalidFields: string[]): number | undefined {
  const raw = row[field];
  if (raw === undefined || raw.trim() === '') return undefined;
  const number = Number(raw);
  if (!Number.isFinite(number)) {
    invalidFields.push(field);
    return undefined;
  }
  return number;
}

function derivedMagnitude(row: Record<string, string>, target: string, components: string[], invalidFields: string[]): number | undefined {
  const direct = numberValue(row, target, invalidFields);
  if (direct !== undefined) return direct;
  const values = components.map((component) => numberValue(row, component, invalidFields));
  if (values.some((value) => value === undefined)) return undefined;
  return Math.hypot(...(values as number[]));
}

function addMissing(missingFields: string[], field: string): void {
  if (!missingFields.includes(field)) missingFields.push(field);
}

export function validateTelemetryRows(sourceRows: Record<string, string>[]): ValidationResult {
  const records: TelemetryRecord[] = [];
  const rejected: RejectedRecord[] = [];
  const normalizedRows = sourceRows.map((source) => Object.fromEntries(Object.entries(source).map(([key, value]) => [normalizeColumnName(key), value.trim()])));
  const detectedPrecomputedOutput = normalizedRows.length > 0 && normalizedRows.every((row) => 'predicted_power_w' in row);

  normalizedRows.forEach((row, rowIndex) => {
    const missingFields: string[] = [];
    const invalidFields: string[] = [];
    const isPrecomputed = 'predicted_power_w' in row;
    (isPrecomputed ? PRECOMPUTED_REQUIRED_FIELDS : ID_FIELDS).forEach((field) => {
      if (!row[field]?.trim()) addMissing(missingFields, field);
    });

    const altitude = numberValue(row, 'altitude_m', invalidFields);
    const speed = derivedMagnitude(row, 'speed_mps', ['velocity_x', 'velocity_y', 'velocity_z'], invalidFields);
    const acceleration = derivedMagnitude(row, 'acceleration_mps2', ['acceleration_x', 'acceleration_y', 'acceleration_z'], invalidFields);
    const distance = numberValue(row, 'distance_to_base_m', invalidFields);
    const battery = numberValue(row, 'battery_level_pct', invalidFields);
    const flightTime = numberValue(row, 'flight_time_s', invalidFields);
    const hoverDuration = numberValue(row, 'hover_duration_s', invalidFields);
    const camera = numberValue(row, 'camera_active', invalidFields);
    const temperature = numberValue(row, 'ambient_temp_c', invalidFields);
    const windSpeed = numberValue(row, 'wind_speed_mps', invalidFields);
    const windSin = numberValue(row, 'wind_dir_sin', invalidFields);
    const windCos = numberValue(row, 'wind_dir_cos', invalidFields);
    const hourSin = numberValue(row, 'hour_sin', invalidFields);
    const hourCos = numberValue(row, 'hour_cos', invalidFields);
    const windDirection = numberValue(row, 'wind_dir_deg', invalidFields);

    const requiredFeatures = isPrecomputed
      ? ['altitude_m', 'speed_mps', 'distance_to_base_m', 'battery_level_pct', 'flight_time_s', 'wind_speed_mps']
      : FEATURE_FIELDS;
    requiredFeatures.forEach((field) => {
      const available = ({ altitude_m: altitude, speed_mps: speed, acceleration_mps2: acceleration, distance_to_base_m: distance, battery_level_pct: battery, flight_time_s: flightTime, hover_duration_s: hoverDuration, camera_active: camera, ambient_temp_C: temperature, wind_speed_mps: windSpeed, wind_dir_sin: windSin ?? windDirection, wind_dir_cos: windCos ?? windDirection, hour_sin: hourSin ?? row.timestamp, hour_cos: hourCos ?? row.timestamp } as Record<string, unknown>)[field];
      if (available === undefined || available === '') addMissing(missingFields, field);
    });
    if (isPrecomputed) {
      const predicted = numberValue(row, 'predicted_power_w', invalidFields);
      if (predicted === undefined) addMissing(missingFields, 'predicted_power_w');
    }

    if (missingFields.length || invalidFields.length) {
      rejected.push({ rowNumber: rowIndex + 2, missingFields, invalidFields: [...new Set(invalidFields)] });
      return;
    }

    const parsedTimestamp = new Date(row.timestamp).getTime();
    if (!Number.isFinite(parsedTimestamp)) {
      rejected.push({ rowNumber: rowIndex + 2, missingFields: [], invalidFields: ['timestamp'] });
      return;
    }
    const date = new Date(row.timestamp);
    const hour = date.getHours() + date.getMinutes() / 60;
    const windRadians = (windDirection ?? 0) * Math.PI / 180;
    records.push({
      timestamp: row.timestamp, mission_id: row.mission_id, drone_id: row.drone_id,
      altitude_m: altitude ?? 0, speed_mps: speed ?? 0, acceleration_mps2: acceleration ?? 0,
      distance_to_base_m: distance ?? 0, battery_level_pct: battery ?? 0, flight_time_s: flightTime ?? 0,
      hover_duration_s: hoverDuration ?? 0, camera_active: camera ?? 0, ambient_temp_C: temperature ?? 0,
      wind_speed_mps: Math.abs(windSpeed ?? 0), wind_dir_sin: windSin ?? Math.sin(windRadians), wind_dir_cos: windCos ?? Math.cos(windRadians),
      hour_sin: hourSin ?? Math.sin(2 * Math.PI * hour / 24), hour_cos: hourCos ?? Math.cos(2 * Math.PI * hour / 24),
    });
  });

  return { records, rejected, totalRows: sourceRows.length, detectedPrecomputedOutput };
}

export function buildPrecomputedRecords(sourceRows: Record<string, string>[], telemetry: TelemetryRecord[]) {
  const normalizedRows = sourceRows.map((source) => Object.fromEntries(Object.entries(source).map(([key, value]) => [normalizeColumnName(key), value.trim()])));
  const sourceByIdentity = new Map(normalizedRows.map((row) => [`${row.timestamp}|${row.mission_id}|${row.drone_id}`, row]));
  return telemetry.flatMap((record) => {
    const source = sourceByIdentity.get(`${record.timestamp}|${record.mission_id}|${record.drone_id}`);
    if (!source || !Number.isFinite(Number(source.predicted_power_w))) return [];
    const predictedPower = Number(source.predicted_power_w);
    return [{
      ...record,
      predicted_power_w: predictedPower,
      ...applyDecisionRule(record, predictedPower, prototypeRuleConfig),
      model_version: source.model_version || 'uav_power_regression_v1',
      priority_rank: Number.isFinite(Number(source.priority_rank)) ? Number(source.priority_rank) : undefined,
      priority_level: source.priority_level || undefined,
      priority_score: Number.isFinite(Number(source.priority_score)) ? Number(source.priority_score) : undefined,
    }];
  });
}
