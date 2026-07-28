import type { DecisionLogEntry, PredictionMode, QueueRecord, Recommendation } from '../types';

export function hasOverrideReason(reason: string): boolean {
  return reason.trim().length > 0;
}

export function createDecisionLogEntry(record: QueueRecord, action: Recommendation, status: 'Confirmed' | 'Overridden', overrideReason: string, dataMode: PredictionMode, decisionTimestamp = new Date().toISOString()): DecisionLogEntry {
  if (status === 'Overridden' && !hasOverrideReason(overrideReason)) throw new Error('An override reason is required.');
  return {
    decision_timestamp: decisionTimestamp,
    record_timestamp: record.timestamp,
    drone_id: record.drone_id,
    mission_id: record.mission_id,
    model_version: record.model_version,
    predicted_power_w: record.predicted_power_w,
    system_recommendation: record.recommended_action,
    system_reason: record.decision_reason,
    operator_action: action,
    override_reason: status === 'Overridden' ? overrideReason.trim() : '',
    decision_status: status,
    data_mode: dataMode,
  };
}
