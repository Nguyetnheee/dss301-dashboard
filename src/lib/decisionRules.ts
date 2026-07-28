import type { QueueRecord, Recommendation, RuleConfig, TelemetryRecord } from '../types';

export const prototypeRuleConfig: RuleConfig = {
  battery_critical_pct: 20.0,
  battery_caution_pct: 35.0,
  power_high_w_train_q80: 175.43872553063508,
  wind_caution_mps_train_q90: 4.913084403189413,
  distance_far_m_train_q75: 1337.0,
  status: 'Prototype assumptions — not manufacturer or legal limits.',
};

export function applyDecisionRule(record: TelemetryRecord, predictedPower: number, config: RuleConfig): Pick<QueueRecord, 'recommended_action' | 'decision_reason'> {
  if (record.battery_level_pct <= config.battery_critical_pct) {
    return { recommended_action: 'Return to Base', decision_reason: 'Battery is at or below the prototype critical threshold.' };
  }
  if (record.battery_level_pct <= config.battery_caution_pct && record.distance_to_base_m >= config.distance_far_m_train_q75 && predictedPower >= config.power_high_w_train_q80) {
    return { recommended_action: 'Return to Base', decision_reason: 'Battery is in the caution band while distance and experimental power demand are high relative to this dataset.' };
  }
  if (record.wind_speed_mps >= config.wind_caution_mps_train_q90) {
    return { recommended_action: 'Delay Mission', decision_reason: 'Wind is in the highest training-data band under the prototype rule.' };
  }
  return { recommended_action: 'Continue Mission', decision_reason: 'No prototype Return or Delay condition was triggered; human review remains required.' };
}

export function isRecommendation(value: string): value is Recommendation {
  return value === 'Return to Base' || value === 'Delay Mission' || value === 'Continue Mission';
}
