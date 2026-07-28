export type Recommendation = 'Return to Base' | 'Delay Mission' | 'Continue Mission';
export type PredictionMode = 'live' | 'precomputed' | 'raw-review' | 'demo';

export interface RuleConfig {
  battery_critical_pct: number;
  battery_caution_pct: number;
  power_high_w_train_q80: number;
  wind_caution_mps_train_q90: number;
  distance_far_m_train_q75: number;
  status?: string;
}

export interface TelemetryRecord {
  timestamp: string;
  mission_id: string;
  drone_id: string;
  altitude_m: number;
  speed_mps: number;
  acceleration_mps2: number;
  distance_to_base_m: number;
  battery_level_pct: number;
  flight_time_s: number;
  hover_duration_s: number;
  camera_active: number;
  ambient_temp_C: number;
  wind_speed_mps: number;
  wind_dir_sin: number;
  wind_dir_cos: number;
  hour_sin: number;
  hour_cos: number;
}

export interface QueueRecord extends TelemetryRecord {
  predicted_power_w: number;
  recommended_action: Recommendation;
  decision_reason: string;
  model_version: string;
  priority_rank?: number;
  priority_level?: string;
  priority_score?: number;
  rule_config?: RuleConfig;
}

export interface RejectedRecord {
  rowNumber: number;
  missingFields: string[];
  invalidFields: string[];
}

export interface ValidationResult {
  records: TelemetryRecord[];
  rejected: RejectedRecord[];
  totalRows: number;
  detectedPrecomputedOutput: boolean;
  acceptedRows?: number;
  rejectedRows?: number;
}

export interface ModelMetrics {
  model_name?: string;
  model_version?: string;
  MAE?: number;
  RMSE?: number;
  R2?: number;
}

export interface ImportanceItem {
  feature: string;
  importance: number;
}

export interface DecisionLogEntry {
  decision_timestamp: string;
  record_timestamp: string;
  drone_id: string;
  mission_id: string;
  model_version: string;
  predicted_power_w: number;
  system_recommendation: Recommendation;
  system_reason: string;
  operator_action: Recommendation;
  override_reason: string;
  decision_status: 'Confirmed' | 'Overridden' | 'Pending';
  data_mode: PredictionMode;
}
