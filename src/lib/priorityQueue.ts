import type { QueueRecord } from '../types';

const actionRank = { 'Return to Base': 0, 'Delay Mission': 1, 'Continue Mission': 2 } as const;

export function latestRecordPerDrone(records: QueueRecord[]): QueueRecord[] {
  const latest = new Map<string, QueueRecord>();
  records.forEach((record) => {
    const existing = latest.get(record.drone_id);
    if (!existing || new Date(record.timestamp).getTime() >= new Date(existing.timestamp).getTime()) latest.set(record.drone_id, record);
  });
  return [...latest.values()];
}

export function sortPriorityQueue(records: QueueRecord[]): QueueRecord[] {
  return [...records].sort((a, b) => actionRank[a.recommended_action] - actionRank[b.recommended_action]
    || a.battery_level_pct - b.battery_level_pct
    || b.predicted_power_w - a.predicted_power_w
    || b.distance_to_base_m - a.distance_to_base_m);
}

export function calculateKpis(records: QueueRecord[]) {
  const returnCount = records.filter((record) => record.recommended_action === 'Return to Base').length;
  const delayCount = records.filter((record) => record.recommended_action === 'Delay Mission').length;
  return {
    activeDrones: records.length,
    averageBattery: records.length ? records.reduce((total, record) => total + record.battery_level_pct, 0) / records.length : 0,
    attentionRequired: returnCount + delayCount,
    returnCount,
    delayCount,
  };
}
