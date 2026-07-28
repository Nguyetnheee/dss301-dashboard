import { csvRowsToObjects } from '../lib/csv';
import { latestTelemetryPerDrone } from '../lib/priorityQueue';
import { validateTelemetryRows } from '../lib/telemetryValidation';
import type { TelemetryRecord, ValidationResult } from '../types';

interface WorkerRequest {
  file: File;
  retainAllRecords: boolean;
}

interface WorkerResponse {
  validation: ValidationResult;
  rawReviewRecords?: TelemetryRecord[];
  sourceRows?: Record<string, string>[];
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { file, retainAllRecords } = event.data;
  try {
    const sourceRows = csvRowsToObjects(await file.text());
    const validation = validateTelemetryRows(sourceRows);
    const acceptedRows = validation.records.length;
    const rejectedRows = validation.rejected.length;

    if (!retainAllRecords && !validation.detectedPrecomputedOutput) {
      const response: WorkerResponse = {
        validation: { ...validation, records: [], acceptedRows, rejectedRows },
        rawReviewRecords: latestTelemetryPerDrone(validation.records),
      };
      self.postMessage(response);
      return;
    }

    self.postMessage({ validation: { ...validation, acceptedRows, rejectedRows }, rawReviewRecords: validation.detectedPrecomputedOutput ? undefined : latestTelemetryPerDrone(validation.records), sourceRows: validation.detectedPrecomputedOutput ? sourceRows : undefined } satisfies WorkerResponse);
  } catch {
    self.postMessage({ error: 'The CSV file could not be processed.' });
  }
};
