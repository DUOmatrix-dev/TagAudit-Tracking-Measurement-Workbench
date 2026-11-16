import React, { useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileJson,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  AttributionModel,
  ConversionRole,
  FunnelStage,
  TaxonomyEvent,
} from '../types/tracking';
import { generateDataLayerSnippet } from '../utils/cryptoAndPayloads';
import { generateTaxonomyJsonSchema } from '../utils/taxonomySchema';
import { TaxonomySchemaView } from './TaxonomySchemaView';
import { TaxonomyContractGenerator } from './TaxonomyContractGenerator';

interface TaxonomyPlannerProps {
  events: TaxonomyEvent[];
  isDark?: boolean;
  onChangeEvents: (next: TaxonomyEvent[]) => void;
}

const ALL_PLATFORMS: Array<'GA4' | 'Google Ads' | 'Meta CAPI' | 'LinkedIn'> = [
  'GA4',
  'Google Ads',
  'Meta CAPI',
  'LinkedIn',
];

export const TaxonomyPlanner: React.FC<TaxonomyPlannerProps> = ({
  events,
  isDark = false,
  onChangeEvents,
}) => {
  const [viewMode, setViewMode] = useState<'matrix' | 'schema' | 'contract'>('matrix');
  const [stageFilter, setStageFilter] = useState<'All' | FunnelStage>('All');
  const [selectedId, setSelectedId] = useState<string>(events[0]?.id || '');
  const [copied, setCopied] = useState(false);

  const [newName, setNewName] = useState('');
  const [newStage, setNewStage] = useState<FunnelStage>('Conversion');
  const [showAddForm, setShowAddForm] = useState(false);

  const filteredEvents = useMemo(() => {
    if (stageFilter === 'All') return events;
    return events.filter((e) => e.funnelStage === stageFilter);
  }, [events, stageFilter]);

  const selectedEvent =
    events.find((e) => e.id === selectedId) || filteredEvents[0] || null;

  const avgCompleteness =
    events.length > 0
      ? Math.round(
          (events.reduce(
            (sum, ev) => sum + ev.presentParams.length / Math.max(1, ev.requiredParams.length),
            0
          ) /
            events.length) *
            100
        )
      : 100;

  const handleToggleRole = (id: string) => {
    const order: ConversionRole[] = ['Primary', 'Secondary', 'Analytics Only'];
    onChangeEvents(
      events.map((ev) => {
        if (ev.id !== id) return ev;
        const nextRole = order[(order.indexOf(ev.googleAdsRole) + 1) % order.length];
        return { ...ev, googleAdsRole: nextRole };
      })
    );
  };

  const handleToggleAttribution = (id: string) => {
    onChangeEvents(
      events.map((ev) => {
        if (ev.id !== id) return ev;
        const nextModel: AttributionModel =
          ev.attributionModel === 'Data-Driven' ? 'Last Click' : 'Data-Driven';
        return { ...ev, attributionModel: nextModel };
      })
    );
  };

  const handleToggleFlag = (
    id: string,
    field: 'enhancedConversions' | 'capiDedupEnabled'
  ) => {
    onChangeEvents(
      events.map((ev) => (ev.id === id ? { ...ev, [field]: !ev[field] } : ev))
    );
  };

  const handleToggleParam = (eventId: string, param: string) => {
    onChangeEvents(
      events.map((ev) => {
        if (ev.id !== eventId) return ev;
        const exists = ev.presentParams.includes(param);
        const nextPresent = exists
          ? ev.presentParams.filter((p) => p !== param)
          : [...ev.presentParams, param];
        return { ...ev, presentParams: nextPresent };
      })
    );
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized = newName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!sanitized) return;
    const req =
      newStage === 'Conversion'
        ? ['transaction_id', 'value', 'currency', 'event_id', 'user_data']
        : ['value', 'currency', 'event_id'];
    const created: TaxonomyEvent = {
      id: `tx-${Date.now()}`,
      eventName: sanitized,
      funnelStage: newStage,
      platforms: ['GA4', 'Google Ads', 'Meta CAPI'],
      googleAdsRole: newStage === 'Conversion' ? 'Primary' : 'Secondary',
      attributionModel: 'Data-Driven',
      enhancedConversions: newStage === 'Conversion',
      capiDedupEnabled: true,
      requiredParams: req,
      presentParams: [...req],
      monthlyVolume: 1200,
      notes: 'Custom added event specification.',
    };
    onChangeEvents([...events, created]);
    setSelectedId(created.id);
    setNewName('');
    setShowAddForm(false);
  };

  const handleDeleteEvent = (id: string) => {
    const remaining = events.filter((e) => e.id !== id);
    onChangeEvents(remaining);
    if (selectedId === id) {
      setSelectedId(remaining[0]?.id || '');
    }
  };

  const handleCopySnippet = () => {
    if (!selectedEvent) return;
    navigator.clipboard.writeText(generateDataLayerSnippet(selectedEvent));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleExportCsv = () => {
    const headers = [
      'event_name',
      'funnel_stage',
      'platforms',
      'google_ads_role',
      'attribution_model',
      'enhanced_conversions',
      'capi_dedup',
      'required_params',
      'present_params',
      'monthly_volume',
    ];
    const rows = events.map((ev) => [
      ev.eventName,
      ev.funnelStage,
      ev.platforms.join('|'),
      ev.googleAdsRole,
      ev.attributionModel,
      String(ev.enhancedConversions),
      String(ev.capiDedupEnabled),
      ev.requiredParams.join('|'),
      ev.presentParams.join('|'),
      String(ev.monthlyVolume),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'measurement-taxonomy-plan.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJsonSchema = () => {
    const schemaDoc = generateTaxonomyJsonSchema(events);
    const blob = new Blob([JSON.stringify(schemaDoc, null, 2)], {
      type: 'application/schema+json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ga4-taxonomy.schema.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Measurement Plan &amp; Event Taxonomy
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Define Google Ads primary/secondary bidding hierarchy, data-driven attribution, parameter completeness ({avgCompleteness}%), and developer dataLayer specs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadJsonSchema}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileJson className="w-3.5 h-3.5" />
            Download JSON Schema
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Event
          </button>
        </div>
      </div>

      {/* Add Event Inline Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddEvent}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-52">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              GA4 Event Name (snake_case)
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. trial_started or book_demo"
              className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="w-44">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Funnel Stage
            </label>
            <select
              value={newStage}
              onChange={(e) => setNewStage(e.target.value as FunnelStage)}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
            >
              <option value="Awareness">Awareness</option>
              <option value="Consideration">Consideration</option>
              <option value="Conversion">Conversion</option>
              <option value="Offline CRM">Offline CRM</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 cursor-pointer"
            >
              Create Event
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* View Mode Switcher & Stage Segmented Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'matrix'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Taxonomy Matrix
          </button>
          <button
            type="button"
            onClick={() => setViewMode('schema')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'schema'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Visual Schema &amp; Dependencies
          </button>
          <button
            type="button"
            onClick={() => setViewMode('contract')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'contract'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            TS / JSON Test Schema
          </button>
        </div>

        {viewMode === 'matrix' && (
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start overflow-x-auto max-w-full">
            {(['All', 'Awareness', 'Consideration', 'Conversion', 'Offline CRM'] as const).map(
              (stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStageFilter(stage)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    stageFilter === stage
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {stage}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {viewMode === 'schema' ? (
        <TaxonomySchemaView events={events} isDark={isDark} />
      ) : viewMode === 'contract' ? (
        <TaxonomyContractGenerator events={events} />
      ) : (
        /* Main Split: Taxonomy Matrix + DataLayer Code Preview */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Event &amp; Stage</th>
                  <th className="py-3 px-4">Ads Role</th>
                  <th className="py-3 px-4">Attribution</th>
                  <th className="py-3 px-4">EC / CAPI</th>
                  <th className="py-3 px-4 text-right">Completeness</th>
                  <th className="py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredEvents.map((ev) => {
                  const pct = Math.round(
                    (ev.presentParams.length / Math.max(1, ev.requiredParams.length)) * 100
                  );
                  const isSelected = selectedEvent?.id === ev.id;
                  return (
                    <tr
                      key={ev.id}
                      onClick={() => setSelectedId(ev.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-orange-50/70 dark:bg-orange-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {ev.eventName}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                          {ev.funnelStage} · {ev.platforms.join(', ')}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleRole(ev.id);
                          }}
                          className={`font-medium underline-offset-2 hover:underline cursor-pointer ${
                            ev.googleAdsRole === 'Primary'
                              ? 'text-orange-700 dark:text-orange-400'
                              : ev.googleAdsRole === 'Secondary'
                                ? 'text-slate-700 dark:text-slate-300'
                                : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {ev.googleAdsRole}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleAttribution(ev.id);
                          }}
                          className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:underline cursor-pointer"
                        >
                          {ev.attributionModel}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFlag(ev.id, 'enhancedConversions');
                            }}
                            className={`cursor-pointer ${
                              ev.enhancedConversions
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            EC:{ev.enhancedConversions ? 'ON' : 'OFF'}
                          </button>
                          <span className="text-slate-300 dark:text-slate-700">/</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFlag(ev.id, 'capiDedupEnabled');
                            }}
                            className={`cursor-pointer ${
                              ev.capiDedupEnabled
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            Dedup:{ev.capiDedupEnabled ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`font-medium ${
                            pct >= 95
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : pct >= 70
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {pct}% ({ev.presentParams.length}/{ev.requiredParams.length})
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          aria-label={`Delete ${ev.eventName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvent(ev.id);
                          }}
                          className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Parameter Checklist & Generated DataLayer Push */}
        {selectedEvent && (
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Selected Specification</div>
                <h2 className="text-base font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {selectedEvent.eventName}
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {selectedEvent.monthlyVolume.toLocaleString()}/mo
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {selectedEvent.notes}
            </p>

            {/* Platform Target Toggles */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Destination Platforms</div>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORMS.map((plat) => {
                  const active = selectedEvent.platforms.includes(plat);
                  return (
                    <button
                      key={plat}
                      type="button"
                      onClick={() =>
                        onChangeEvents(
                          events.map((ev) => {
                            if (ev.id !== selectedEvent.id) return ev;
                            const nextPlats = active
                              ? ev.platforms.filter((p) => p !== plat)
                              : [...ev.platforms, plat];
                            return { ...ev, platforms: nextPlats };
                          })
                        )
                      }
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                          : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {plat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Required Parameter Verification */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Required Parameters (click to simulate present/missing)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {selectedEvent.requiredParams.map((param) => {
                  const present = selectedEvent.presentParams.includes(param);
                  return (
                    <button
                      key={param}
                      type="button"
                      onClick={() => handleToggleParam(selectedEvent.id, param)}
                      className={`flex items-center justify-between px-2.5 py-1.5 text-xs font-mono rounded border cursor-pointer ${
                        present
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                          : 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300'
                      }`}
                    >
                      <span className="truncate">{param}</span>
                      <span>{present ? 'OK' : 'MISS'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Developer DataLayer Snippet */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Code2 className="w-3.5 h-3.5" />
                  Developer dataLayer.push()
                </span>
                <button
                  type="button"
                  onClick={handleCopySnippet}
                  className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-[11px] font-mono overflow-x-auto max-h-64">
                {generateDataLayerSnippet(selectedEvent)}
              </pre>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
};
