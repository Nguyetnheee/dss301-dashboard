import type { PredictionMode } from '../types';

export const predictionModeLabel: Record<PredictionMode, string> = {
  live: 'Live API prediction',
  precomputed: 'Precomputed model output',
  demo: 'Demo data',
};
