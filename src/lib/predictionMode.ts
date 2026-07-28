import type { PredictionMode } from '../types';

export const predictionModeLabel: Record<PredictionMode, string> = {
  live: 'Live API estimate',
  precomputed: 'Precomputed model output',
  'raw-review': 'Raw telemetry review',
  demo: 'Demo data',
};
