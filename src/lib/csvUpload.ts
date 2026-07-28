import type { TelemetryRecord, ValidationResult } from '../types';

interface WorkerResponse {
  validation?: ValidationResult;
  rawReviewRecords?: TelemetryRecord[];
  sourceRows?: Record<string, string>[];
  error?: string;
}

export interface CsvUploadResult {
  validation: ValidationResult;
  rawReviewRecords: TelemetryRecord[];
  sourceRows: Record<string, string>[];
}

export function parseUploadFile(file: File, retainAllRecords: boolean): Promise<CsvUploadResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/csvUpload.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (event.data.error || !event.data.validation) {
        reject(new Error(event.data.error ?? 'The CSV file could not be processed.'));
        return;
      }
      resolve({ validation: event.data.validation, rawReviewRecords: event.data.rawReviewRecords ?? [], sourceRows: event.data.sourceRows ?? [] });
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('The CSV worker could not be started.'));
    };
    worker.postMessage({ file, retainAllRecords });
  });
}
