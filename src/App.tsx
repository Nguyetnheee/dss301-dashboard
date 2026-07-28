import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { CheckCircle2, Download, FileUp, RefreshCw, SlidersHorizontal, XCircle } from 'lucide-react';
import { exportCsv } from './lib/csv';
import { parseUploadFile, type CsvUploadResult } from './lib/csvUpload';
import { demoQueue } from './lib/demoData';
import { createDecisionLogEntry, hasOverrideReason } from './lib/decisionLog';
import { applyDecisionRule, prototypeRuleConfig } from './lib/decisionRules';
import { modelEvaluation, modelEvaluationNote } from './lib/modelEvaluation';
import { hasModelApi, ModelApiError, requestPredictions } from './lib/modelClient';
import { loadOutputFiles } from './lib/outputFiles';
import { predictionModeLabel } from './lib/predictionMode';
import { calculateKpis, latestRecordPerDrone, sortPriorityQueue } from './lib/priorityQueue';
import { buildPrecomputedRecords } from './lib/telemetryValidation';
import type { DecisionLogEntry, PredictionMode, QueueRecord, Recommendation, TelemetryRecord, ValidationResult } from './types';

const statusStyles: Record<Recommendation, string> = {
  'Return to Base': 'border-red-200 bg-red-50 text-red-800',
  'Delay Mission': 'border-amber-200 bg-amber-50 text-amber-800',
  'Continue Mission': 'border-green-200 bg-green-50 text-green-800',
};

function actionBadge(action: Recommendation) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[action]}`}>{action}</span>;
}

function displayNumber(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export default function App() {
  const [records, setRecords] = useState<QueueRecord[]>(demoQueue);
  const [rawReviewRecords, setRawReviewRecords] = useState<TelemetryRecord[]>([]);
  const [mode, setMode] = useState<PredictionMode>('demo');
  const [sourceStatus, setSourceStatus] = useState('Demo data loaded');
  const [validation, setValidation] = useState<ValidationResult>({ records: demoQueue, rejected: [], totalRows: demoQueue.length, detectedPrecomputedOutput: false });
  const [selectedDroneId, setSelectedDroneId] = useState(demoQueue[0].drone_id);
  const [filter, setFilter] = useState<'All' | Recommendation>('All');
  const [search, setSearch] = useState('');
  const [decisionLog, setDecisionLog] = useState<DecisionLogEntry[]>([]);
  const [overrideAction, setOverrideAction] = useState<Recommendation>('Continue Mission');
  const [overrideReason, setOverrideReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadOutputFiles().then(({ precomputedQueue }) => {
      if (!precomputedQueue.length) return;
      const queue = precomputedQueue.map((record) => ({ ...record, rule_config: prototypeRuleConfig }));
      setRecords(queue);
      setRawReviewRecords([]);
      setMode('precomputed');
      setSourceStatus('Bundled precomputed model output');
      setValidation({ records: queue, rejected: [], totalRows: queue.length, detectedPrecomputedOutput: true });
      setSelectedDroneId(queue[0].drone_id);
    });
  }, []);

  const latestQueue = useMemo(() => sortPriorityQueue(latestRecordPerDrone(records)), [records]);
  const visibleQueue = useMemo(() => latestQueue.filter((record) => (filter === 'All' || record.recommended_action === filter)
    && `${record.drone_id} ${record.mission_id} ${record.decision_reason}`.toLowerCase().includes(search.toLowerCase())), [filter, latestQueue, search]);
  const selected = latestQueue.find((record) => record.drone_id === selectedDroneId) ?? latestQueue[0];
  const kpis = useMemo(() => calculateKpis(latestQueue), [latestQueue]);
  const processedRecords = mode === 'raw-review' ? rawReviewRecords : latestQueue;
  const lastProcessed = processedRecords.reduce<string | undefined>((latest, record) => (!latest || new Date(record.timestamp) > new Date(latest) ? record.timestamp : latest), undefined);
  const selectedLog = selected ? [...decisionLog].reverse().find((entry) => entry.drone_id === selected.drone_id && entry.mission_id === selected.mission_id && entry.record_timestamp === selected.timestamp) : undefined;

  const processCsv = async ({ validation: result, rawReviewRecords, sourceRows }: CsvUploadResult, name: string) => {
    setValidation(result);
    setError('');
    const acceptedRows = result.acceptedRows ?? result.records.length;
    if (!acceptedRows) {
      setRecords([]);
      setRawReviewRecords([]);
      setSourceStatus(`${name}: no accepted records`);
      setError('No accepted records were available after validation. Review the rejected-record report.');
      return;
    }

    try {
      if (result.detectedPrecomputedOutput) {
        const precomputed = buildPrecomputedRecords(sourceRows, result.records).map((record) => ({ ...record, rule_config: prototypeRuleConfig }));
        if (!precomputed.length) throw new Error('The precomputed decision queue did not contain valid experimental estimates and recommendations.');
        setRecords(precomputed);
        setRawReviewRecords([]);
        setMode('precomputed');
        setSourceStatus('Uploaded precomputed model output');
        setSelectedDroneId(precomputed[0].drone_id);
        return;
      }

      if (!hasModelApi()) {
        setRecords([]);
        setRawReviewRecords(rawReviewRecords);
        setMode('raw-review');
        setSourceStatus('Raw telemetry review — no model API configured');
        setError('Raw telemetry was validated, but no live model prediction was requested because MODEL_API_URL is not configured. Upload dashboard_decision_queue.csv for the recommended demo mode.');
        return;
      }

      const response = await requestPredictions(rawReviewRecords);
      const predicted = response.results.flatMap((item) => item.predictedPower === undefined ? [] : [{
        ...item.record,
        predicted_power_w: item.predictedPower,
        ...applyDecisionRule(item.record, item.predictedPower, prototypeRuleConfig),
        model_version: response.modelVersion,
        rule_config: prototypeRuleConfig,
      }]);
      const predictionFailures = response.results.filter((item) => item.predictedPower === undefined).length;
      setValidation((current) => ({ ...current, records: predicted }));
      setRecords(predicted);
      setRawReviewRecords([]);
      setMode('live');
      setSourceStatus(predictionFailures ? `Live API estimate with ${predictionFailures} unavailable response(s)` : `Live API estimate from ${name}`);
      if (predicted.length) setSelectedDroneId(predicted[0].drone_id);
      if (!predicted.length) setError('The live model response contained no usable experimental estimates.');
    } catch (requestError) {
      setRecords([]);
      setRawReviewRecords(rawReviewRecords);
      setMode('raw-review');
      setSourceStatus(`${name}: raw telemetry review`);
      setError(requestError instanceof ModelApiError || requestError instanceof Error ? requestError.message : 'Prediction processing failed.');
    } finally { /* Loading state is managed from the file-upload boundary. */ }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setIsLoading(true);
    setError('');
    try {
      await processCsv(await parseUploadFile(file, false), file.name);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The CSV file could not be processed.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadBundledPrecomputed = async () => {
    setIsLoading(true);
    setError('');
    try {
      const output = await loadOutputFiles();
      if (!output.precomputedQueue.length) throw new Error('No bundled dashboard_decision_queue.csv was found. Place the notebook output under public/outputs/model/.');
      const queue = output.precomputedQueue.map((record) => ({ ...record, rule_config: prototypeRuleConfig }));
      setRecords(queue);
      setRawReviewRecords([]);
      setMode('precomputed');
      setSourceStatus('Bundled precomputed model output');
      setValidation({ records: queue, rejected: [], totalRows: queue.length, detectedPrecomputedOutput: true });
      setSelectedDroneId(queue[0].drone_id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Precomputed output could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDemo = () => {
    setRecords(demoQueue);
    setRawReviewRecords([]);
    setMode('demo');
    setSourceStatus('Demo data loaded');
    setValidation({ records: demoQueue, rejected: [], totalRows: demoQueue.length, detectedPrecomputedOutput: false });
    setSelectedDroneId(demoQueue[0].drone_id);
    setError('');
  };

  const saveDecision = (action: Recommendation, status: 'Confirmed' | 'Overridden') => {
    if (!selected) return;
    if (status === 'Overridden' && !hasOverrideReason(overrideReason)) {
      setError('Provide an override reason before recording an overridden decision.');
      return;
    }
    setDecisionLog((entries) => [...entries, createDecisionLogEntry(selected, action, status, overrideReason, mode)]);
    setOverrideReason('');
    setError('');
  };

  const exportLog = () => {
    const content = exportCsv(decisionLog);
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'uav-decision-log.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const missingSummary = useMemo(() => [...new Set(validation.rejected.flatMap((item) => item.missingFields))].join(', ') || 'None', [validation.rejected]);
  const invalidSummary = useMemo(() => [...new Set(validation.rejected.flatMap((item) => item.invalidFields))].join(', ') || 'None', [validation.rejected]);
  const acceptedRecordCount = validation.acceptedRows ?? validation.records.length;
  const rejectedRecordCount = validation.rejectedRows ?? validation.rejected.length;

  return (
    <main className="min-h-screen bg-[#EAF6FC] px-4 py-6 text-[#172033] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 border-b-2 border-[#242879] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#2E82D8]">DSS301 Group 2</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#242879]">UAV Energy Decision Support</h1>
            <p className="mt-1 text-sm text-slate-600">Academic prototype for in-flight inspection decisions</p>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
            <div><span className="block text-slate-500">Data source mode</span><strong>{predictionModeLabel[mode]}</strong><span className="block text-slate-500">{sourceStatus}</span></div>
            <div><span className="block text-slate-500">Last processed</span><strong>{lastProcessed ? new Date(lastProcessed).toLocaleString() : '—'}</strong></div>
            <div><span className="block text-slate-500">Model version</span><strong>{selected?.model_version ?? 'uav_power_regression_v1'}</strong></div>
            <div><span className="block text-slate-500">Accepted / rejected</span><strong>{acceptedRecordCount} / {rejectedRecordCount}</strong></div>
            <div><span className="block text-slate-500">Model status</span><strong>Experimental model — limited predictive performance</strong></div>
          </div>
        </header>

        <section aria-label="Data controls" className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#2E82D8] px-3 py-2 text-sm font-bold text-white hover:bg-[#238EE8] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#242879]">
              <FileUp size={16} /> Upload CSV
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={handleUpload} />
            </label>
            <button type="button" onClick={() => void loadBundledPrecomputed()} className="inline-flex items-center gap-2 rounded-lg border border-[#2E82D8] px-3 py-2 text-sm font-bold text-[#242879] hover:bg-[#EAF6FC]"><RefreshCw size={16} /> Load precomputed output</button>
            <button type="button" onClick={loadDemo} className="rounded-lg px-3 py-2 text-sm font-bold text-[#242879] underline underline-offset-4 hover:text-[#2E82D8]">Use demo data</button>
          </div>
          <p className="max-w-xl text-xs leading-5 text-slate-600">Academic decision-support prototype. Recommendations are based on proxy telemetry data and prototype rules. The Operations Engineer retains final authority.</p>
        </section>

        <section aria-label="Decision-support pipeline" className="mb-6 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-[#242879]">Decision-support pipeline</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700"><span><strong>Observed</strong> telemetry</span><span>→</span><span><strong>Prepared</strong> validation and feature engineering</span><span>→</span><span><strong>Experimental estimate</strong></span><span>→</span><span><strong>Rule-derived</strong> prototype rules</span><span>→</span><span><strong>Recommended</strong> priority queue and explanation</span><span>→</span><span><strong>Human-confirmed</strong> confirmation or override</span></div>
        </section>

        {mode === 'precomputed' && <div role="status" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Precomputed model output — no live model request was performed.</strong></div>}
        {mode === 'raw-review' && <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Raw telemetry review.</strong> No experimental power estimate, rule-derived recommendation, or priority queue has been created.</div>}
        {mode === 'demo' && <div role="status" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Demo data — not live telemetry.</strong></div>}
        {error && <div role="alert" className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><XCircle size={18} className="shrink-0" />{error}</div>}

        <section aria-label="Current queue KPIs" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Active Drones', String(kpis.activeDrones), 'Unique drone_id count in current latest-record view', 'border-[#2E82D8] bg-[#2E82D8]'],
            ['Average Battery', `${displayNumber(kpis.averageBattery)}%`, 'Mean battery of current displayed drones', 'border-emerald-600 bg-emerald-600'],
            ['Attention Required', String(kpis.attentionRequired), 'Return to Base plus Delay Mission', 'border-amber-500 bg-amber-500'],
            ['Action Summary', `Continue ${kpis.continueCount} · Return ${kpis.returnCount} · Delay ${kpis.delayCount}`, 'Current latest-record view', 'border-[#242879] bg-[#242879]'],
          ].map(([label, value, detail, color]) => <div key={label} className={`rounded-2xl border p-4 text-white shadow-sm ${color}`}><p className="text-xs font-semibold uppercase tracking-wide text-white/85">{label}</p><p className="mt-1 text-xl font-extrabold text-white">{value}</p><p className="mt-1 text-xs text-white/90">{detail}</p></div>)}
        </section>

        <section className="mb-6 rounded-2xl border-2 border-[#242879] bg-white shadow-md" aria-labelledby="queue-heading">
          <div className="flex flex-col gap-3 border-b border-blue-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 id="queue-heading" className="text-xl font-extrabold text-[#242879]">Priority Decision Queue</h2><p className="mt-1 text-sm text-slate-600">Sorted by Return, Delay, and Continue; then lower battery, greater distance, and higher experimental power estimate.</p></div>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="queue-search">Search decision queue</label><input id="queue-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search drone, mission, reason" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <label className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 text-sm"><SlidersHorizontal size={15} /><span className="sr-only">Filter recommendation</span><select aria-label="Filter recommendation" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="bg-transparent py-2 outline-none"><option>All</option><option>Return to Base</option><option>Delay Mission</option><option>Continue Mission</option></select></label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-left text-sm">
              <thead className="bg-[#EAF6FC] text-xs uppercase tracking-wide text-[#242879]"><tr><th className="p-3">Priority</th><th className="p-3">Drone ID</th><th className="p-3">Battery</th><th className="p-3">Wind</th><th className="p-3">Distance</th><th className="p-3">Experimental Power Estimate</th><th className="p-3">Recommendation</th><th className="p-3">Reason</th></tr></thead>
              <tbody>{visibleQueue.map((record, index) => <tr key={`${record.drone_id}-${record.timestamp}`} tabIndex={0} onClick={() => setSelectedDroneId(record.drone_id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDroneId(record.drone_id); } }} className={`cursor-pointer border-t border-slate-100 outline-none hover:bg-blue-50 focus-visible:bg-blue-100 ${selected?.drone_id === record.drone_id ? 'bg-blue-50' : ''}`}><td className="p-3 font-extrabold text-[#242879]">{index + 1}</td><td className="p-3 font-bold">{record.drone_id}<span className="block text-xs font-normal text-slate-500">{record.mission_id}</span></td><td className="p-3">{displayNumber(record.battery_level_pct)}%</td><td className="p-3">{displayNumber(record.wind_speed_mps)} m/s</td><td className="p-3">{displayNumber(record.distance_to_base_m, 0)} m</td><td className="p-3 font-bold">{displayNumber(record.predicted_power_w)} W</td><td className="p-3">{actionBadge(record.recommended_action)}</td><td className="max-w-sm p-3 text-xs leading-5 text-slate-700">{record.decision_reason}</td></tr>)}
                {!visibleQueue.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500">No priority decisions are available in the current view.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {mode === 'raw-review' && <section className="mb-6 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm" aria-labelledby="raw-heading"><h2 id="raw-heading" className="text-lg font-extrabold text-[#242879]">Raw Telemetry Review</h2><p className="mt-1 text-sm text-slate-600">Observed telemetry is available for review. Configure MODEL_API_URL or upload dashboard_decision_queue.csv to create experimental estimates and prototype recommendations.</p><div className="mt-4 overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-[#EAF6FC] text-xs uppercase text-[#242879]"><tr><th className="p-3">Drone</th><th className="p-3">Timestamp</th><th className="p-3">Battery</th><th className="p-3">Wind</th><th className="p-3">Distance</th><th className="p-3">Altitude</th><th className="p-3">Speed</th></tr></thead><tbody>{rawReviewRecords.map((record) => <tr key={`${record.drone_id}-${record.timestamp}`} className="border-t border-slate-100"><td className="p-3 font-bold">{record.drone_id}<span className="block text-xs font-normal text-slate-500">{record.mission_id}</span></td><td className="p-3">{new Date(record.timestamp).toLocaleString()}</td><td className="p-3">{displayNumber(record.battery_level_pct)}%</td><td className="p-3">{displayNumber(record.wind_speed_mps)} m/s</td><td className="p-3">{displayNumber(record.distance_to_base_m, 0)} m</td><td className="p-3">{displayNumber(record.altitude_m, 0)} m</td><td className="p-3">{displayNumber(record.speed_mps)} m/s</td></tr>)}</tbody></table></div></section>}

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm lg:col-span-2" aria-labelledby="detail-heading">
            <div className="mb-4 flex items-center justify-between"><div><h2 id="detail-heading" className="text-lg font-extrabold text-[#242879]">Selected Drone Panel</h2><p className="text-sm text-slate-600">Observed, experimental estimate, rule-derived, and human-confirmed information remain distinct.</p></div>{selected && actionBadge(selected.recommended_action)}</div>
            {selected ? <>
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-lg bg-[#EAF6FC] p-4"><h3 className="text-sm font-extrabold text-[#242879]">Observed</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{[['Battery', `${displayNumber(selected.battery_level_pct)}%`], ['Wind', `${displayNumber(selected.wind_speed_mps)} m/s`], ['Distance to base', `${displayNumber(selected.distance_to_base_m, 0)} m`], ['Altitude', `${displayNumber(selected.altitude_m, 0)} m`], ['Speed', `${displayNumber(selected.speed_mps)} m/s`], ['Flight time', `${displayNumber(selected.flight_time_s, 0)} s`], ['Timestamp', new Date(selected.timestamp).toLocaleString()], ['Mission ID', selected.mission_id]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl></section>
                <section className="rounded-lg border border-blue-100 p-4"><h3 className="text-sm font-extrabold text-[#242879]">Experimental estimate</h3><dl className="mt-3 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Predicted power</dt><dd className="font-bold">{displayNumber(selected.predicted_power_w)} W</dd></div><div><dt className="text-xs text-slate-500">Model name</dt><dd className="font-bold">Linear Regression</dd></div><div><dt className="text-xs text-slate-500">Model version</dt><dd className="font-bold">{selected.model_version}</dd></div><div><dt className="text-xs text-slate-500">Model status</dt><dd className="font-bold">Limited predictive performance</dd></div></dl></section>
              </div>
              <section className="mt-4 rounded-lg border-l-4 border-[#2E82D8] bg-blue-50 p-4"><h3 className="text-sm font-extrabold text-[#242879]">Rule-derived</h3><p className="mt-2 text-sm"><strong>Recommendation:</strong> {selected.recommended_action}</p><p className="mt-2 text-sm"><strong>Reason:</strong> {selected.decision_reason}</p><p className="mt-3 text-xs text-slate-600">Critical battery ≤ {prototypeRuleConfig.battery_critical_pct}%; caution battery ≤ {prototypeRuleConfig.battery_caution_pct}%; experimental power ≥ {prototypeRuleConfig.power_high_w_train_q80.toFixed(2)} W; wind ≥ {prototypeRuleConfig.wind_caution_mps_train_q90.toFixed(2)} m/s; far distance ≥ {prototypeRuleConfig.distance_far_m_train_q75} m.</p><p className="mt-2 text-xs text-slate-600">Prototype assumptions — not manufacturer or legal limits.</p></section>
              <fieldset className="mt-5 rounded-lg border border-slate-200 p-4"><legend className="px-1 text-sm font-bold text-[#242879]">Human decision</legend><p className="mb-3 text-xs text-slate-600">Decision status: <strong>{selectedLog?.decision_status ?? 'Pending'}</strong></p><div className="flex flex-col gap-2 md:flex-row"><button type="button" onClick={() => saveDecision(selected.recommended_action, 'Confirmed')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#242879] px-3 py-2 text-sm font-bold text-white hover:bg-[#2E82D8]"><CheckCircle2 size={16} /> Confirm Recommendation</button><select aria-label="Override action" value={overrideAction} onChange={(event) => setOverrideAction(event.target.value as Recommendation)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option>Return to Base</option><option>Delay Mission</option><option>Continue Mission</option></select><input aria-label="Override reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Override reason (required)" className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" onClick={() => saveDecision(overrideAction, 'Overridden')} className="rounded-lg border border-[#2E82D8] px-3 py-2 text-sm font-bold text-[#242879] hover:bg-[#EAF6FC]">Override Recommendation</button></div>{selectedLog && <p className="mt-3 text-sm font-medium text-[#242879]">Decision recorded for prototype evaluation.</p>}<p className="mt-2 text-xs text-slate-600">No flight action is transmitted.</p></fieldset>
            </> : <p className="py-12 text-center text-slate-500">Select a priority decision to review observed telemetry, the experimental estimate, and the prototype rule.</p>}
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="evaluation-heading"><h2 id="evaluation-heading" className="text-lg font-extrabold text-[#242879]">Model Evaluation</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2">Model</th><th title="Average absolute prediction error in watts.">MAE ⓘ</th><th title="Error measure that gives more weight to large prediction errors.">RMSE ⓘ</th><th title="Whether the model explains variation better than predicting the mean.">R² ⓘ</th></tr></thead><tbody>{modelEvaluation.map(({ model, mae, rmse, r2 }) => <tr key={model} className="border-t border-slate-100"><td className="py-2 font-bold">{model}</td><td>{mae.toFixed(2)} W</td><td>{rmse.toFixed(2)} W</td><td>{model === 'Mean prediction reference' ? '≈ 0' : r2.toFixed(4)}</td></tr>)}</tbody></table></div><p className="mt-3 text-sm font-medium text-[#172033]">{modelEvaluationNote}</p><p className="mt-2 text-xs text-slate-600">Evaluated on 21,141 held-out test records from 1,350 missions.</p></section>
            <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="quality-heading"><h2 id="quality-heading" className="text-lg font-extrabold text-[#242879]">Data Quality</h2><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt>Uploaded rows</dt><dd className="font-bold">{validation.totalRows}</dd></div><div className="flex justify-between"><dt>Accepted rows</dt><dd className="font-bold">{acceptedRecordCount}</dd></div><div className="flex justify-between"><dt>Rejected rows</dt><dd className="font-bold">{rejectedRecordCount}</dd></div><div><dt className="font-medium">Missing-column summary</dt><dd className="mt-1 break-words text-xs text-slate-600">{missingSummary}</dd></div><div><dt className="font-medium">Invalid-value summary</dt><dd className="mt-1 break-words text-xs text-slate-600">{invalidSummary}</dd></div></dl></section>
          </aside>
        </div>

        <section className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="eda-heading"><h2 id="eda-heading" className="text-lg font-extrabold text-[#242879]">Data Association Note</h2><p className="mt-2 text-sm text-slate-600">The available features showed only very weak statistical associations with UAV power consumption.</p><p className="mt-2 text-xs text-slate-600">Association does not establish causation.</p></section>

        <section className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="log-heading"><div className="flex items-center justify-between gap-3"><div><h2 id="log-heading" className="text-lg font-extrabold text-[#242879]">Decision Log</h2><p className="text-sm text-slate-600">Human decisions are recorded for prototype evaluation and are not transmitted to a drone.</p></div><button type="button" disabled={!decisionLog.length} onClick={exportLog} className="inline-flex items-center gap-2 rounded-lg border border-[#2E82D8] px-3 py-2 text-sm font-bold text-[#242879] disabled:cursor-not-allowed disabled:opacity-50"><Download size={16} /> Export CSV</button></div>{decisionLog.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-[850px] w-full text-left text-xs"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="p-2">Decision timestamp</th><th className="p-2">Drone</th><th className="p-2">Recommendation</th><th className="p-2">Operator action</th><th className="p-2">Status</th><th className="p-2">Data mode</th></tr></thead><tbody>{decisionLog.map((entry) => <tr key={`${entry.decision_timestamp}-${entry.drone_id}`} className="border-b border-slate-100"><td className="p-2">{new Date(entry.decision_timestamp).toLocaleString()}</td><td className="p-2">{entry.drone_id}</td><td className="p-2">{entry.system_recommendation}</td><td className="p-2">{entry.operator_action}</td><td className="p-2 font-bold">{entry.decision_status}</td><td className="p-2">{predictionModeLabel[entry.data_mode]}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-slate-500">No decisions recorded yet.</p>}</section>

        {isLoading && <div role="status" className="fixed bottom-5 right-5 flex items-center gap-2 rounded-lg bg-[#242879] px-4 py-3 text-sm font-bold text-white shadow-lg"><RefreshCw className="animate-spin" size={16} /> Processing accepted records…</div>}
      </div>
    </main>
  );
}
