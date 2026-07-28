import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { CheckCircle2, Download, FileUp, RefreshCw, SlidersHorizontal, XCircle } from 'lucide-react';
import { csvRowsToObjects, exportCsv } from './lib/csv';
import { demoQueue } from './lib/demoData';
import { applyDecisionRule } from './lib/decisionRules';
import { ModelApiError, requestPredictions } from './lib/modelClient';
import { loadOutputFiles } from './lib/outputFiles';
import { predictionModeLabel } from './lib/predictionMode';
import { calculateKpis, latestRecordPerDrone, sortPriorityQueue } from './lib/priorityQueue';
import { buildPrecomputedRecords, validateTelemetryRows } from './lib/telemetryValidation';
import type { DecisionLogEntry, ImportanceItem, ModelMetrics, PredictionMode, QueueRecord, Recommendation, ValidationResult } from './types';

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

function recordDecision(record: QueueRecord, action: Recommendation, status: 'Confirmed' | 'Overridden', reason: string): DecisionLogEntry {
  return {
    timestamp: new Date().toISOString(), drone_id: record.drone_id, mission_id: record.mission_id,
    model_version: record.model_version, predicted_power_w: record.predicted_power_w,
    system_recommendation: record.recommended_action, system_reason: record.decision_reason,
    operator_action: action, override_reason: reason, decision_status: status,
  };
}

export default function App() {
  const [records, setRecords] = useState<QueueRecord[]>(demoQueue);
  const [mode, setMode] = useState<PredictionMode>('demo');
  const [sourceStatus, setSourceStatus] = useState('Demo dataset loaded');
  const [validation, setValidation] = useState<ValidationResult>({ records: demoQueue, rejected: [], totalRows: demoQueue.length, detectedPrecomputedOutput: false });
  const [selectedDroneId, setSelectedDroneId] = useState(demoQueue[0].drone_id);
  const [filter, setFilter] = useState<'All' | Recommendation>('All');
  const [search, setSearch] = useState('');
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics>();
  const [importance, setImportance] = useState<ImportanceItem[]>([]);
  const [decisionLog, setDecisionLog] = useState<DecisionLogEntry[]>([]);
  const [overrideAction, setOverrideAction] = useState<Recommendation>('Continue Mission');
  const [overrideReason, setOverrideReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadOutputFiles().then(({ metrics, importance: loadedImportance, precomputedQueue, modelName, modelVersion, ruleConfig }) => {
      if (metrics) setModelMetrics(metrics);
      setImportance(loadedImportance);
      if (precomputedQueue.length) {
        const queue = ruleConfig ? precomputedQueue.map((record) => ({ ...record, rule_config: ruleConfig })) : precomputedQueue;
        setRecords(queue);
        setMode('precomputed');
        setSourceStatus('Precomputed model output loaded from bundled notebook output');
        setValidation({ records: queue, rejected: [], totalRows: queue.length, detectedPrecomputedOutput: true });
        setSelectedDroneId(queue[0].drone_id);
        if (!metrics) setModelMetrics({ model_name: modelName, model_version: modelVersion });
      }
    });
  }, []);

  const latestQueue = useMemo(() => sortPriorityQueue(latestRecordPerDrone(records)), [records]);
  const visibleQueue = useMemo(() => latestQueue.filter((record) => (filter === 'All' || record.recommended_action === filter)
    && `${record.drone_id} ${record.mission_id} ${record.decision_reason}`.toLowerCase().includes(search.toLowerCase())), [filter, latestQueue, search]);
  const selected = latestQueue.find((record) => record.drone_id === selectedDroneId) ?? latestQueue[0];
  const kpis = useMemo(() => calculateKpis(latestQueue), [latestQueue]);
  const lastProcessed = latestQueue.reduce<string | undefined>((latest, record) => (!latest || new Date(record.timestamp) > new Date(latest) ? record.timestamp : latest), undefined);
  const selectedLog = selected ? [...decisionLog].reverse().find((entry) => entry.drone_id === selected.drone_id && entry.mission_id === selected.mission_id) : undefined;

  const processCsv = async (text: string, name: string) => {
    const rows = csvRowsToObjects(text);
    const result = validateTelemetryRows(rows);
    setValidation(result);
    setError('');
    if (!result.records.length) {
      setSourceStatus(`${name}: no valid records`);
      setError('No accepted records were available after validation. Review the rejected-record report.');
      return;
    }
    setIsLoading(true);
    try {
      if (result.detectedPrecomputedOutput) {
        const precomputed = buildPrecomputedRecords(rows, result.records);
        if (!precomputed.length) throw new Error('The precomputed output did not contain valid predicted power and recommendation values.');
        setRecords(precomputed);
        setMode('precomputed');
        setSourceStatus('Precomputed model output loaded from CSV');
        setSelectedDroneId(precomputed[0].drone_id);
        return;
      }
      const response = await requestPredictions(result.records);
      const predicted = response.results.flatMap((item) => item.predictedPower === undefined ? [] : [{
        ...item.record,
        predicted_power_w: item.predictedPower,
        ...applyDecisionRule(item.record, item.predictedPower, response.ruleConfig),
        model_version: response.modelVersion,
        rule_config: response.ruleConfig,
      }]);
      const predictionFailures = response.results.flatMap((item, index) => item.predictedPower === undefined ? [{
        rowNumber: index + 2, missingFields: [], invalidFields: [`model prediction: ${item.error}`],
      }] : []);
      setValidation((current) => ({ ...current, rejected: [...current.rejected, ...predictionFailures] }));
      setRecords(predicted);
      setMode('live');
      setSourceStatus(predictionFailures.length ? `Live model response loaded with ${predictionFailures.length} rejected prediction(s)` : `Live model response loaded from ${name}`);
      setSelectedDroneId(predicted[0].drone_id);
      setModelMetrics(response.metrics ?? { model_name: response.modelName, model_version: response.modelVersion });
    } catch (requestError) {
      setSourceStatus(`${name}: valid records awaiting a model response`);
      setError(requestError instanceof ModelApiError || requestError instanceof Error ? requestError.message : 'Prediction processing failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => void processCsv(String(reader.result ?? ''), file.name);
    reader.onerror = () => setError('The CSV file could not be read.');
    reader.readAsText(file);
    event.target.value = '';
  };

  const loadBundledPrecomputed = async () => {
    setIsLoading(true);
    setError('');
    try {
      const output = await loadOutputFiles();
      if (!output.precomputedQueue.length) throw new Error('No bundled dashboard_decision_queue.csv was found. Place the notebook output under public/outputs/model/.');
      const queue = output.ruleConfig ? output.precomputedQueue.map((record) => ({ ...record, rule_config: output.ruleConfig })) : output.precomputedQueue;
      setRecords(queue);
      setMode('precomputed');
      setSourceStatus('Precomputed model output loaded from bundled notebook output');
      setValidation({ records: queue, rejected: [], totalRows: queue.length, detectedPrecomputedOutput: true });
      setSelectedDroneId(queue[0].drone_id);
      if (output.metrics) setModelMetrics(output.metrics);
      else setModelMetrics({ model_name: output.modelName, model_version: output.modelVersion });
      setImportance(output.importance);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Precomputed output could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDemo = () => {
    setRecords(demoQueue);
    setMode('demo');
    setSourceStatus('Demo dataset loaded');
    setValidation({ records: demoQueue, rejected: [], totalRows: demoQueue.length, detectedPrecomputedOutput: false });
    setSelectedDroneId(demoQueue[0].drone_id);
    setError('');
  };

  const saveDecision = (action: Recommendation, status: 'Confirmed' | 'Overridden') => {
    if (!selected) return;
    if (status === 'Overridden' && !overrideReason.trim()) {
      setError('Provide an override reason before recording an overridden decision.');
      return;
    }
    setDecisionLog((entries) => [...entries, recordDecision(selected, action, status, status === 'Overridden' ? overrideReason.trim() : '')]);
    setOverrideReason('');
    setError('');
  };

  const exportLog = () => {
    const content = exportCsv(decisionLog.map((entry) => ({
      timestamp: entry.timestamp,
      drone_id: entry.drone_id,
      mission_id: entry.mission_id,
      model_version: entry.model_version,
      predicted_power_w: entry.predicted_power_w,
      system_recommendation: entry.system_recommendation,
      system_reason: entry.system_reason,
      operator_action: entry.operator_action,
      override_reason: entry.override_reason,
      decision_status: entry.decision_status,
    })));
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'uav-decision-log.csv'; link.click();
    URL.revokeObjectURL(url);
  };

  const missingSummary = useMemo(() => {
    const allFields = validation.rejected.flatMap((item) => [...item.missingFields, ...item.invalidFields]);
    return [...new Set(allFields)].join(', ') || 'None';
  }, [validation.rejected]);
  const maximumImportance = Math.max(...importance.map((item) => Math.abs(item.importance)), 1);

  return (
    <main className="min-h-screen bg-[#EAF6FC] px-4 py-6 text-[#172033] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 border-b-2 border-[#242879] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#2E82D8]">DSS301 Group 2</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#242879]">UAV Energy Decision Support</h1>
            <p className="mt-1 text-sm text-slate-600">Decision-support prototype for in-flight inspection operations</p>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
            <div><span className="block text-slate-500">Data source</span><strong>{sourceStatus}</strong></div>
            <div><span className="block text-slate-500">Prediction mode</span><strong>{predictionModeLabel[mode]}</strong></div>
            <div><span className="block text-slate-500">Model version</span><strong>{selected?.model_version ?? 'Unavailable'}</strong></div>
            <div><span className="block text-slate-500">Last processed</span><strong>{lastProcessed ? new Date(lastProcessed).toLocaleString() : '—'}</strong></div>
          </div>
        </header>

        <section aria-label="Data controls" className="mb-6 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#2E82D8] px-3 py-2 text-sm font-bold text-white hover:bg-[#238EE8] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#242879]">
              <FileUp size={16} /> Upload telemetry CSV
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={handleUpload} />
            </label>
            <button type="button" onClick={() => void loadBundledPrecomputed()} className="inline-flex items-center gap-2 rounded-lg border border-[#2E82D8] px-3 py-2 text-sm font-bold text-[#242879] hover:bg-[#EAF6FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#242879]"><RefreshCw size={16} /> Load precomputed output</button>
            <button type="button" onClick={loadDemo} className="rounded-lg px-3 py-2 text-sm font-bold text-[#242879] underline underline-offset-4 hover:text-[#2E82D8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#242879]">Use demo data</button>
          </div>
          <p className="max-w-xl text-xs leading-5 text-slate-600">Academic decision-support prototype. Recommendations are based on proxy telemetry data and prototype rules. The Operations Engineer retains final authority.</p>
        </section>

        {mode === 'demo' && <div role="status" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Demo data — not live telemetry.</strong> Values support a traceable prototype workflow only.</div>}
        {mode === 'precomputed' && <div role="status" className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Precomputed model output — no live model request was performed.</strong></div>}
        {error && <div role="alert" className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><XCircle size={18} className="shrink-0" />{error}</div>}

        <section aria-label="Current dataset KPIs" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Active Drones', String(kpis.activeDrones), 'Unique drones in latest-record view', 'border-[#2E82D8] bg-[#2E82D8]'],
            ['Average Battery', `${displayNumber(kpis.averageBattery)}%`, 'Mean battery of displayed drones', 'border-emerald-600 bg-emerald-600'],
            ['Attention Required', String(kpis.attentionRequired), 'Return to Base plus Delay Mission', 'border-amber-500 bg-amber-500'],
            ['Return / Delay', `${kpis.returnCount} / ${kpis.delayCount}`, 'Return to Base / Delay Mission', 'border-red-600 bg-red-600'],
          ].map(([label, value, detail, color]) => <div key={label} className={`rounded-2xl border p-4 text-white shadow-sm ${color}`}><p className="text-xs font-semibold uppercase tracking-wide text-white/85">{label}</p><p className="mt-1 text-2xl font-extrabold text-white">{value}</p><p className="mt-1 text-xs text-white/90">{detail}</p></div>)}
        </section>

        <section className="mb-6 rounded-2xl border-2 border-[#242879] bg-white shadow-md" aria-labelledby="queue-heading">
          <div className="flex flex-col gap-3 border-b border-blue-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 id="queue-heading" className="text-xl font-extrabold text-[#242879]">Priority Decision Queue</h2><p className="mt-1 text-sm text-slate-600">Sorted by recommendation, then lower battery, higher predicted power, and greater distance.</p></div>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="queue-search">Search decision queue</label><input id="queue-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search drone, mission, reason" className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-[#2E82D8]" />
              <label className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 text-sm"><SlidersHorizontal size={15} /><span className="sr-only">Filter recommendation</span><select aria-label="Filter recommendation" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="bg-transparent py-2 outline-none"><option>All</option><option>Return to Base</option><option>Delay Mission</option><option>Continue Mission</option></select></label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-left text-sm">
              <thead className="bg-[#EAF6FC] text-xs uppercase tracking-wide text-[#242879]"><tr><th className="p-3">Priority</th><th className="p-3">Drone ID</th><th className="p-3">Battery</th><th className="p-3">Wind</th><th className="p-3">Distance to Base</th><th className="p-3">Predicted Power</th><th className="p-3">Recommendation</th><th className="p-3">Reason</th></tr></thead>
              <tbody>{visibleQueue.map((record, index) => <tr key={`${record.drone_id}-${record.timestamp}`} tabIndex={0} aria-label={`Select ${record.drone_id}`} onClick={() => setSelectedDroneId(record.drone_id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDroneId(record.drone_id); } }} className={`cursor-pointer border-t border-slate-100 outline-none hover:bg-blue-50 focus-visible:bg-blue-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2E82D8] ${selected?.drone_id === record.drone_id ? 'bg-blue-50' : ''}`}><td className="p-3 font-extrabold text-[#242879]">{index + 1}</td><td className="p-3 font-bold">{record.drone_id}<span className="block text-xs font-normal text-slate-500">{record.mission_id}</span></td><td className="p-3">{displayNumber(record.battery_level_pct)}%</td><td className="p-3">{displayNumber(record.wind_speed_mps)} m/s</td><td className="p-3">{displayNumber(record.distance_to_base_m, 0)} m</td><td className="p-3 font-bold">{displayNumber(record.predicted_power_w)} W</td><td className="p-3">{actionBadge(record.recommended_action)}</td><td className="max-w-sm p-3 text-xs leading-5 text-slate-700">{record.decision_reason}</td></tr>)}
                {!visibleQueue.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500">No current decision records match this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm lg:col-span-2" aria-labelledby="detail-heading">
            <div className="mb-4 flex items-center justify-between"><div><h2 id="detail-heading" className="text-lg font-extrabold text-[#242879]">Selected Drone Detail</h2><p className="text-sm text-slate-600">Observed, predicted, rule-derived, and human-confirmed information remain distinct.</p></div>{selected && actionBadge(selected.recommended_action)}</div>
            {selected ? <>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">{[
                ['Observed battery', `${displayNumber(selected.battery_level_pct)}%`], ['Observed wind', `${displayNumber(selected.wind_speed_mps)} m/s`], ['Observed distance', `${displayNumber(selected.distance_to_base_m, 0)} m`], ['Observed altitude', `${displayNumber(selected.altitude_m, 0)} m`], ['Observed speed', `${displayNumber(selected.speed_mps)} m/s`], ['Observed flight time', `${displayNumber(selected.flight_time_s, 0)} s`], ['Predicted power', `${displayNumber(selected.predicted_power_w)} W`], ['Model version', selected.model_version], ['Rule-derived action', selected.recommended_action],
              ].map(([label, value]) => <div key={label} className="rounded-lg bg-[#EAF6FC] p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 font-bold text-[#172033]">{value}</p></div>)}</div>
              <div className="mt-4 rounded-lg border-l-4 border-[#2E82D8] bg-blue-50 p-3 text-sm"><strong>Rule-derived reason:</strong> {selected.decision_reason}<p className="mt-2 text-xs text-slate-600">Prototype assumptions — not manufacturer or legal limits.</p>{selected.rule_config && <p className="mt-2 text-xs text-slate-600">Critical battery ≤ {selected.rule_config.battery_critical_pct}%; caution battery ≤ {selected.rule_config.battery_caution_pct}%; high predicted power ≥ {selected.rule_config.power_high_w_train_q80} W; wind ≥ {selected.rule_config.wind_caution_mps_train_q90} m/s; far distance ≥ {selected.rule_config.distance_far_m_train_q75} m.</p>}</div>
              <fieldset className="mt-5 rounded-lg border border-slate-200 p-4"><legend className="px-1 text-sm font-bold text-[#242879]">Human decision</legend><p className="mb-3 text-xs text-slate-600">{selectedLog ? `Recorded: ${selectedLog.decision_status} — ${selectedLog.operator_action}` : 'Pending operator review'}</p><div className="flex flex-col gap-2 md:flex-row"><button type="button" onClick={() => saveDecision(selected.recommended_action, 'Confirmed')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#242879] px-3 py-2 text-sm font-bold text-white hover:bg-[#2E82D8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#242879]"><CheckCircle2 size={16} /> Confirm recommendation</button><label className="sr-only" htmlFor="override-action">Override action</label><select id="override-action" value={overrideAction} onChange={(event) => setOverrideAction(event.target.value as Recommendation)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option>Return to Base</option><option>Delay Mission</option><option>Continue Mission</option></select><label className="sr-only" htmlFor="override-reason">Override reason</label><input id="override-reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Override reason (required)" className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline focus:outline-2 focus:outline-[#2E82D8]" /><button type="button" onClick={() => saveDecision(overrideAction, 'Overridden')} className="rounded-lg border border-[#2E82D8] px-3 py-2 text-sm font-bold text-[#242879] hover:bg-[#EAF6FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#242879]">Override recommendation</button></div><p className="mt-3 text-xs text-slate-600">Decision recorded for prototype evaluation. No flight command is sent.</p></fieldset>
            </> : <p className="py-12 text-center text-slate-500">Select a record from the priority queue.</p>}
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="quality-heading"><h2 id="quality-heading" className="text-lg font-extrabold text-[#242879]">Model Quality</h2>{modelMetrics && Number.isFinite(modelMetrics.MAE) ? <dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Model name</dt><dd className="font-bold">{modelMetrics.model_name ?? '—'}</dd></div><div className="flex justify-between gap-3"><dt title="Average absolute prediction error in watts.">MAE ⓘ</dt><dd className="font-bold">{displayNumber(modelMetrics.MAE!)} W</dd></div><div className="flex justify-between gap-3"><dt title="Prediction error measure that gives more weight to large errors.">RMSE ⓘ</dt><dd className="font-bold">{displayNumber(modelMetrics.RMSE ?? NaN)} W</dd></div><div className="flex justify-between gap-3"><dt title="Share of target variation represented on the test set.">R² ⓘ</dt><dd className="font-bold">{displayNumber(modelMetrics.R2 ?? NaN, 3)}</dd></div><div className="flex justify-between gap-3"><dt>Model version</dt><dd className="font-bold">{modelMetrics.model_version ?? selected?.model_version ?? '—'}</dd></div><p className="pt-2 text-xs text-slate-600">Evaluated on the held-out test set.</p></dl> : <p className="mt-3 text-sm text-slate-600">Model metrics are unavailable until <code>test_metrics.csv</code> is placed in the published outputs folder or supplied by the API.</p>}</section>
            <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="quality-data-heading"><h2 id="quality-data-heading" className="text-lg font-extrabold text-[#242879]">Data Quality</h2><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt>Total uploaded rows</dt><dd className="font-bold">{validation.totalRows}</dd></div><div className="flex justify-between"><dt>Valid rows</dt><dd className="font-bold">{validation.records.length}</dd></div><div className="flex justify-between"><dt>Rejected rows</dt><dd className="font-bold">{validation.rejected.length}</dd></div><div><dt className="font-medium">Missing/invalid fields</dt><dd className="mt-1 break-words text-xs text-slate-600">{missingSummary}</dd></div></dl>{validation.rejected.length > 0 && <details className="mt-3 text-xs"><summary className="cursor-pointer font-bold text-[#242879]">View rejected-row report</summary><ul className="mt-2 list-disc space-y-1 pl-4 text-slate-600">{validation.rejected.map((item) => <li key={item.rowNumber}>Row {item.rowNumber}: {[...item.missingFields, ...item.invalidFields].join(', ')}</li>)}</ul></details>}</section>
          </aside>
        </div>

        <section className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="importance-heading"><h2 id="importance-heading" className="text-lg font-extrabold text-[#242879]">Model Explanation</h2><p className="mt-1 text-sm text-slate-600">Permutation importance on model evaluation data.</p>{importance.length ? <div className="mt-4 space-y-3">{importance.map((item) => <div key={item.feature} className="grid grid-cols-[minmax(110px,180px)_1fr_72px] items-center gap-3 text-sm"><span className="break-words font-medium">{item.feature}</span><div className="h-5 overflow-hidden rounded bg-[#EAF6FC]"><div className="h-full rounded bg-[#2E82D8]" style={{ width: `${Math.max(0, Math.abs(item.importance) / maximumImportance * 100)}%` }} /></div><span className="text-right tabular-nums">{displayNumber(item.importance, 4)}</span></div>)}</div> : <p className="mt-3 text-sm text-slate-600">Feature importance is unavailable until <code>permutation_importance.csv</code> is placed in the published outputs folder.</p>}<p className="mt-3 text-xs text-slate-600">Importance indicates model reliance, not causality.</p></section>

        <section className="mt-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="log-heading"><div className="flex items-center justify-between gap-3"><div><h2 id="log-heading" className="text-lg font-extrabold text-[#242879]">Decision Log</h2><p className="text-sm text-slate-600">Human actions are local to this prototype and are not transmitted to a drone.</p></div><button type="button" disabled={!decisionLog.length} onClick={exportLog} className="inline-flex items-center gap-2 rounded-lg border border-[#2E82D8] px-3 py-2 text-sm font-bold text-[#242879] disabled:cursor-not-allowed disabled:opacity-50"><Download size={16} /> Export CSV</button></div>{decisionLog.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-[850px] w-full text-left text-xs"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="p-2">Timestamp</th><th className="p-2">Drone</th><th className="p-2">Predicted power</th><th className="p-2">System recommendation</th><th className="p-2">Operator action</th><th className="p-2">Status</th></tr></thead><tbody>{decisionLog.map((entry) => <tr key={`${entry.timestamp}-${entry.drone_id}`} className="border-b border-slate-100"><td className="p-2">{new Date(entry.timestamp).toLocaleString()}</td><td className="p-2">{entry.drone_id}</td><td className="p-2">{displayNumber(entry.predicted_power_w)} W</td><td className="p-2">{entry.system_recommendation}</td><td className="p-2">{entry.operator_action}</td><td className="p-2 font-bold">{entry.decision_status}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-slate-500">No decisions recorded yet.</p>}</section>

        {isLoading && <div role="status" className="fixed bottom-5 right-5 flex items-center gap-2 rounded-lg bg-[#242879] px-4 py-3 text-sm font-bold text-white shadow-lg"><RefreshCw className="animate-spin" size={16} /> Processing valid records…</div>}
      </div>
    </main>
  );
}
