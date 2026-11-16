import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Play,
  Search,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GtmExportJson } from '../types/tracking';
import {
  DebugLogPresetId,
  ParsedDebugExecution,
  getSampleDebugLogPreset,
  parseGtmDebugConsoleLog,
} from '../utils/gtmDebugLogParser';

interface TriggerFiringMonitorProps {
  container: GtmExportJson;
  isDark?: boolean;
}

type ExecutionStatusFilter = 'all' | 'fired' | 'blocked' | 'race_flagged';

export const TriggerFiringMonitor: React.FC<TriggerFiringMonitorProps> = ({
  container,
  isDark = false,
}) => {
  const initialPreset = useMemo(
    () => getSampleDebugLogPreset('checkout_race', container),
    // Initialize once per mount with checkout race scenario so engineers immediately see race detection
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [rawLogInput, setRawLogInput] = useState<string>(initialPreset.rawLog);
  const [activeLogLabel, setActiveLogLabel] = useState<string>(initialPreset.label);
  const [showPasteEditor, setShowPasteEditor] = useState<boolean>(false);
  const [pasteDraft, setPasteDraft] = useState<string>(initialPreset.rawLog);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedResult = useMemo(() => parseGtmDebugConsoleLog(rawLogInput), [rawLogInput]);

  const report = parsedResult.ok ? parsedResult.report : null;

  const filteredExecutions = useMemo(() => {
    if (!report) return [];
    const q = searchQuery.trim().toLowerCase();
    return report.executions.filter((exec) => {
      if (statusFilter === 'fired' && exec.status !== 'fired') return false;
      if (statusFilter === 'blocked' && exec.status !== 'blocked' && exec.status !== 'failed') {
        return false;
      }
      if (statusFilter === 'race_flagged' && exec.raceFlagIds.length === 0) return false;
      if (!q) return true;
      return (
        exec.tagName.toLowerCase().includes(q) ||
        exec.triggerName.toLowerCase().includes(q) ||
        exec.dataLayerEvent.toLowerCase().includes(q) ||
        exec.tagType.toLowerCase().includes(q)
      );
    });
  }, [report, statusFilter, searchQuery]);

  const selectedExecution: ParsedDebugExecution | null = useMemo(() => {
    if (!report || report.executions.length === 0) return null;
    if (selectedExecutionId) {
      const found = report.executions.find((e) => e.id === selectedExecutionId);
      if (found) return found;
    }
    const firstRace = report.executions.find((e) => e.raceFlagIds.length > 0);
    return firstRace || report.executions[0];
  }, [report, selectedExecutionId]);

  const selectedRaceDetails = useMemo(() => {
    if (!report || !selectedExecution) return [];
    return report.raceConditions.filter((rc) =>
      selectedExecution.raceFlagIds.includes(rc.id)
    );
  }, [report, selectedExecution]);

  const handleLoadPreset = (presetId: DebugLogPresetId) => {
    const preset = getSampleDebugLogPreset(presetId, container);
    setRawLogInput(preset.rawLog);
    setPasteDraft(preset.rawLog);
    setActiveLogLabel(preset.label);
    setUploadError(null);
    setSelectedExecutionId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const check = parseGtmDebugConsoleLog(text);
      if (!check.ok) {
        setUploadError(check.error);
        setPasteDraft(text.slice(0, 8000));
        setShowPasteEditor(true);
      } else {
        setUploadError(null);
        setRawLogInput(text);
        setPasteDraft(text);
        setActiveLogLabel(file.name);
        setSelectedExecutionId(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyPaste = () => {
    const check = parseGtmDebugConsoleLog(pasteDraft);
    if (!check.ok) {
      setUploadError(check.error);
      return;
    }
    setUploadError(null);
    setRawLogInput(pasteDraft);
    setActiveLogLabel('Pasted Console Capture');
    setShowPasteEditor(false);
    setSelectedExecutionId(null);
  };

  const criticalRaces = report
    ? report.raceConditions.filter((r) => r.severity === 'critical').length
    : 0;
  const warningRaces = report
    ? report.raceConditions.filter((r) => r.severity === 'warning').length
    : 0;

  const chartAxisStroke = isDark ? '#94A3B8' : '#64748B';
  const chartGridStroke = isDark ? '#1E293B' : '#E2E8F0';
  const tooltipBg = isDark ? '#0F172A' : '#FFFFFF';
  const tooltipBorder = isDark ? '#334155' : '#E2E8F0';
  const tooltipText = isDark ? '#F1F5F9' : '#0F172A';

  return (
    <div className="space-y-6">
      {/* Ingestion Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Trigger Firing Monitor &amp; Race Condition Analyzer
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              <span>Active trace: </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{activeLogLabel}</span>
              {report && (
                <>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {report.sourceFormat === 'json' ? 'JSON Trace' : 'Console Log'}
                  </span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{report.sessionDurationMs}ms window</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.log,.txt,application/json,text/plain"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-orange-600 rounded-lg hover:bg-slate-800 dark:hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Debug Log
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPasteEditor((prev) => !prev);
                setUploadError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              {showPasteEditor ? 'Hide Console Editor' : 'Paste Console Log'}
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('checkout_race')}
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Checkout Race Log
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('spa_burst')}
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              SPA Burst Log
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('clean_sequence')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3 h-3 text-orange-600 dark:text-orange-400" />
              Simulate Container Trace
            </button>
          </div>
        </div>

        {/* Optional Paste / Edit Raw Log Drawer */}
        {showPasteEditor && (
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <label
                htmlFor="gtm-debug-log-textarea"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Paste Tag Assistant JSON array or Chrome DevTools console output
              </label>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Formats: JSON events/tags or &quot;142ms | event=purchase | tag=&quot;...&quot; | status=FIRED&quot;
              </span>
            </div>
            {uploadError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-md text-xs text-red-700 dark:text-red-300">
                {uploadError}
              </div>
            )}
            <textarea
              id="gtm-debug-log-textarea"
              value={pasteDraft}
              onChange={(e) => setPasteDraft(e.target.value)}
              rows={8}
              placeholder='[{"dataLayerEvent":"gtm.js","timestamp":"12ms","durationMs":28,"tagName":"GA4 - Config","status":"fired"}]'
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPasteEditor(false);
                  setUploadError(null);
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyPaste}
                className="px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors cursor-pointer"
              >
                Analyze Console Log
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Parse Error Empty State */}
      {!parsedResult.ok && (
        <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-lg p-8 text-center space-y-3">
          <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Unable to Parse Debug Log
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            {parsedResult.error}
          </p>
          <div>
            <button
              type="button"
              onClick={() => handleLoadPreset('checkout_race')}
              className="px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 cursor-pointer"
            >
              Load Sample Checkout Race Log
            </button>
          </div>
        </div>
      )}

      {report && (
        <>
          {/* 4-Column Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Total Tag Executions
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {report.executions.length}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {report.executions.filter((e) => e.status === 'fired').length} fired ·{' '}
                  {report.executions.filter((e) => e.status === 'blocked').length} blocked
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Unique Tags Observed
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {report.frequencies.length}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  Max {Math.max(...report.frequencies.map((f) => f.totalExecutions), 0)}x / tag
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                DataLayer Events Captured
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {report.eventSequence.length}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {report.sessionDurationMs}ms span
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Race Conditions Flagged
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {report.raceConditions.length}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium ${
                    criticalRaces > 0
                      ? 'text-red-600 dark:text-red-400'
                      : warningRaces > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {criticalRaces > 0 ? (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      {criticalRaces} critical
                    </>
                  ) : warningRaces > 0 ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {warningRaces} warning
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Clean sequence
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Visualizations Row: Frequency Bar Chart + Chronological Firing Order Waterfall */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Firing Frequency Chart */}
            <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Tag Firing Frequency
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Executions per tag grouped by fired vs blocked/failed state
                  </p>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  n={report.executions.length}
                </span>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={report.frequencies}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartGridStroke}
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: chartAxisStroke }}
                      stroke={chartAxisStroke}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={150}
                      tick={{ fontSize: 11, fill: chartAxisStroke }}
                      stroke={chartAxisStroke}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: tooltipBg,
                        borderColor: tooltipBorder,
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: tooltipText,
                      }}
                      formatter={(value, name) => [
                        `${value}x`,
                        name === 'firedCount'
                          ? 'Fired'
                          : name === 'blockedCount'
                            ? 'Blocked'
                            : 'Failed',
                      ]}
                      labelFormatter={(_label, payload) => {
                        const row = payload?.[0]?.payload;
                        return row
                          ? `${row.tagName} (avg ${row.avgDurationMs}ms)`
                          : String(_label);
                      }}
                    />
                    <Bar
                      dataKey="firedCount"
                      stackId="a"
                      fill="#EA580C"
                      radius={[0, 0, 0, 0]}
                      name="firedCount"
                    />
                    <Bar
                      dataKey="blockedCount"
                      stackId="a"
                      fill="#DC2626"
                      radius={[0, 4, 4, 0]}
                      name="blockedCount"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Orange = Fired · Red = Consent Blocked</span>
                <span className="font-mono tabular-nums">
                  Repeat tags &ge;2x flagged for dedup check
                </span>
              </div>
            </div>

            {/* Chronological Execution Waterfall */}
            <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Chronological Firing Order &amp; Timing Waterfall
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Click any execution bar to inspect page-load trigger order and race overlaps
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>0ms</span>
                  <span>→</span>
                  <span>{Math.round(report.sessionDurationMs / 2)}ms</span>
                  <span>→</span>
                  <span>{report.sessionDurationMs}ms</span>
                </div>
              </div>

              {/* Page-Load Lifecycle Milestones */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-400 pb-1">
                {report.eventSequence.map((ev, idx) => (
                  <span key={`${ev.eventIndex}-${ev.eventName}`} className="inline-flex items-center gap-1.5">
                    {idx > 0 && <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">→</span>}
                    <span className="text-slate-900 dark:text-slate-200 font-medium">{ev.eventName}</span>
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      (+{ev.timestampMs}ms, {ev.tagCount} {ev.tagCount === 1 ? 'tag' : 'tags'})
                    </span>
                  </span>
                ))}
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800 max-h-80 overflow-y-auto">
                {report.executions.map((exec) => {
                  const leftPct = Math.min(
                    94,
                    (exec.timestampMs / Math.max(1, report.sessionDurationMs)) * 100
                  );
                  const widthPct = Math.max(
                    3.5,
                    Math.min(
                      100 - leftPct,
                      (exec.durationMs / Math.max(1, report.sessionDurationMs)) * 100
                    )
                  );
                  const hasRace = exec.raceFlagIds.length > 0;
                  const isSelected = selectedExecution?.id === exec.id;

                  return (
                    <button
                      key={exec.id}
                      type="button"
                      onClick={() => setSelectedExecutionId(exec.id)}
                      className={`w-full text-left py-2.5 px-3 grid grid-cols-12 gap-3 items-center transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50/75 dark:bg-orange-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="col-span-5 sm:col-span-4 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                            #{exec.order}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {exec.tagName}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {exec.dataLayerEvent} · +{exec.timestampMs}ms
                        </div>
                      </div>

                      <div className="col-span-5 sm:col-span-6">
                        <div className="relative h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                          <div
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                            }}
                            className={`absolute top-1 bottom-1 rounded-xs ${
                              exec.status === 'blocked' || exec.status === 'failed'
                                ? 'bg-slate-500 dark:bg-slate-400'
                                : hasRace
                                  ? 'bg-red-600 dark:bg-red-500'
                                  : 'bg-orange-600 dark:bg-orange-500'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="col-span-2 text-right">
                        <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {exec.durationMs}ms
                        </div>
                        <div
                          className={`text-[10px] font-medium ${
                            exec.status === 'blocked'
                              ? 'text-amber-700 dark:text-amber-400'
                              : hasRace
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {exec.status === 'blocked'
                            ? 'Blocked'
                            : hasRace
                              ? 'Race Flag'
                              : 'Nominal'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Execution Inspector */}
              {selectedExecution && (
                <div className="pt-2 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      <span className="font-mono text-orange-600 dark:text-orange-400 mr-1.5">
                        #{selectedExecution.order}
                      </span>
                      {selectedExecution.tagName}
                    </div>
                    <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      Trigger: {selectedExecution.triggerName} · Consent:{' '}
                      {selectedExecution.consentState || 'unspecified'}
                    </div>
                  </div>
                  {selectedRaceDetails.length > 0 ? (
                    <div className="p-3 bg-red-50/70 dark:bg-red-950/25 border border-red-200 dark:border-red-900/60 rounded-md text-xs space-y-1">
                      {selectedRaceDetails.map((rc) => (
                        <div key={rc.id}>
                          <span className="font-semibold text-red-700 dark:text-red-400">
                            {rc.pattern}:
                          </span>{' '}
                          <span className="text-slate-700 dark:text-slate-300">{rc.detail}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      No sequence race conflicts detected for execution #{selectedExecution.order}.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Detected Race Conditions Panel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Race Condition Diagnostics ({report.raceConditions.length})
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Automated checks for CMP consent races, setup tag inversions, duplicate bursts, and DOM timing contention
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                {report.eventSequence.map((ev) => ev.eventName).join(' → ')}
              </span>
            </div>

            {report.raceConditions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  No timing race conditions detected in this trace.
                </p>
                <p>
                  CMP initialization, Conversion Linker, base pixels, and conversion events fired in proper dependency order.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {report.raceConditions.map((rc) => (
                  <div
                    key={rc.id}
                    className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <div className="space-y-1.5 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            rc.severity === 'critical'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {rc.severity === 'critical' ? (
                            <XCircle className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {rc.severity === 'critical' ? 'Critical' : 'Warning'}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {rc.pattern}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          Δ {rc.deltaMs}ms
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {rc.title}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{rc.detail}</p>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        <span className="font-medium">Fix:</span> {rc.remediation}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {rc.involvedExecutionIds[0] && (
                        <button
                          type="button"
                          onClick={() => setSelectedExecutionId(rc.involvedExecutionIds[0])}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                        >
                          Highlight in Waterfall
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filterable Chronological Firing Sequence Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Execution Order Log ({filteredExecutions.length})
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'fired', label: 'Fired' },
                      { id: 'blocked', label: 'Blocked' },
                      { id: 'race_flagged', label: 'Race Flagged' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setStatusFilter(item.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        statusFilter === item.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter tag, event, trigger..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-orange-500 w-52"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4 w-16">Order</th>
                    <th className="py-2.5 px-4 w-24">Offset</th>
                    <th className="py-2.5 px-4 w-36">DataLayer Event</th>
                    <th className="py-2.5 px-4">Tag Name</th>
                    <th className="py-2.5 px-4">Firing Trigger</th>
                    <th className="py-2.5 px-4 w-24 text-right">Duration</th>
                    <th className="py-2.5 px-4 w-32 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {filteredExecutions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-slate-500 dark:text-slate-400"
                      >
                        No tag executions match the active filter.
                      </td>
                    </tr>
                  ) : (
                    filteredExecutions.map((exec) => {
                      const hasRace = exec.raceFlagIds.length > 0;
                      const isSelected = selectedExecution?.id === exec.id;
                      return (
                        <tr
                          key={exec.id}
                          onClick={() => setSelectedExecutionId(exec.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-orange-50/70 dark:bg-orange-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            #{exec.order}
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            +{exec.timestampMs}ms
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                            {exec.dataLayerEvent}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                            {exec.tagName}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                            {exec.triggerName}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {exec.durationMs}ms
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium">
                            {exec.status === 'blocked' ? (
                              <span className="text-amber-700 dark:text-amber-400">Blocked</span>
                            ) : exec.status === 'failed' ? (
                              <span className="text-red-600 dark:text-red-400">Failed</span>
                            ) : hasRace ? (
                              <span className="text-red-600 dark:text-red-400">Race Flag</span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400">Fired</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
