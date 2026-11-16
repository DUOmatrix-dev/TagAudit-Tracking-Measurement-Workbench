import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileJson,
  GitCompareArrows,
  MinusCircle,
  PlusCircle,
  Search,
  Upload,
} from 'lucide-react';
import { GtmExportJson } from '../types/tracking';
import { patchGtmContainer, validateGtmJsonInput } from '../utils/gtmAnalyzer';
import {
  DiffEntityKind,
  DiffItem,
  diffGtmContainers,
  DiffStatus,
} from '../utils/gtmDiff';

interface ContainerVersionDiffProps {
  currentContainer: GtmExportJson;
}

interface SlotImportPanelProps {
  label: string;
  roleHint: string;
  container: GtmExportJson | null;
  onLoad: (next: GtmExportJson) => void;
  onClear: () => void;
  onUseCurrent: () => void;
}

const SlotImportPanel: React.FC<SlotImportPanelProps> = ({
  label,
  roleHint,
  container,
  onLoad,
  onClear,
  onUseCurrent,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = validateGtmJsonInput(String(reader.result || ''));
      if (!res.valid || !res.data) {
        setError(res.error || 'Unable to parse GTM container JSON.');
      } else {
        setError(null);
        setShowPaste(false);
        onLoad(res.data);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyPaste = () => {
    const res = validateGtmJsonInput(pasteText);
    if (!res.valid || !res.data) {
      setError(res.error || 'Invalid GTM JSON export.');
      return;
    }
    setError(null);
    setShowPaste(false);
    setPasteText('');
    onLoad(res.data);
  };

  const cv = container?.containerVersion;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            {label}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {roleHint}
          </div>
        </div>
        {container && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer whitespace-nowrap shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {container && cv ? (
        <div className="py-2.5 px-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-md space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
              {cv.container?.publicId || 'GTM-UNKNOWN'} · v{cv.containerVersionId || '—'}
            </span>
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 shrink-0">
              Loaded
            </span>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
            {cv.name || cv.container?.name || 'Untitled Version'}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {(cv.tag || []).length} tags · {(cv.trigger || []).length} triggers ·{' '}
            {(cv.variable || []).length} variables
          </div>
        </div>
      ) : (
        <div className="py-3 px-3 bg-slate-50/70 dark:bg-slate-950/40 border border-dashed border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-500 dark:text-slate-400">
          No container export loaded in this slot yet.
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-md text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload JSON
        </button>
        <button
          type="button"
          onClick={() => {
            setShowPaste((prev) => !prev);
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
        >
          <FileJson className="w-3.5 h-3.5" />
          {showPaste ? 'Hide Paste Box' : 'Paste JSON'}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowPaste(false);
            onUseCurrent();
          }}
          className="px-3 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer whitespace-nowrap shrink-0"
        >
          Use Active Container
        </button>
      </div>

      {showPaste && (
        <div className="space-y-2 pt-1">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder='{"exportFormatVersion": 2, "containerVersion": { ... }}'
            className="w-full p-2.5 font-mono text-[11px] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowPaste(false);
                setError(null);
              }}
              className="px-3 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyPaste}
              className="px-3 py-1 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 cursor-pointer"
            >
              Load Export JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function statusLabel(status: DiffStatus) {
  switch (status) {
    case 'added':
      return {
        text: 'Added',
        className: 'text-emerald-700 dark:text-emerald-400',
        Icon: PlusCircle,
      };
    case 'removed':
      return {
        text: 'Removed',
        className: 'text-red-600 dark:text-red-400',
        Icon: MinusCircle,
      };
    case 'modified':
      return {
        text: 'Modified',
        className: 'text-amber-700 dark:text-amber-400',
        Icon: AlertTriangle,
      };
    case 'unchanged':
      return {
        text: 'Unchanged',
        className: 'text-slate-500 dark:text-slate-400',
        Icon: CheckCircle2,
      };
  }
}

function kindLabel(kind: DiffEntityKind): string {
  return kind === 'tag' ? 'Tag' : kind === 'trigger' ? 'Trigger' : 'Variable';
}

export const ContainerVersionDiff: React.FC<ContainerVersionDiffProps> = ({
  currentContainer,
}) => {
  const [baseContainer, setBaseContainer] = useState<GtmExportJson | null>(currentContainer);
  const [targetContainer, setTargetContainer] = useState<GtmExportJson | null>(() => {
    const { patched } = patchGtmContainer(currentContainer);
    return {
      ...patched,
      containerVersion: {
        ...patched.containerVersion,
        containerVersionId: `${patched.containerVersion.containerVersionId || '1'}-patched`,
        name: `${patched.containerVersion.name} (Auto-Patched Candidate)`,
      },
    };
  });

  const [entityFilter, setEntityFilter] = useState<'all' | DiffEntityKind>('all');
  const [statusFilter, setStatusFilter] = useState<'changes' | 'all' | DiffStatus>('changes');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const diffResult = useMemo(() => {
    if (!baseContainer || !targetContainer) return null;
    return diffGtmContainers(baseContainer, targetContainer);
  }, [baseContainer, targetContainer]);

  const allDiffItems = useMemo(() => {
    if (!diffResult) return [];
    const combined: Array<DiffItem<unknown>> = [
      ...diffResult.tagDiffs,
      ...diffResult.triggerDiffs,
      ...diffResult.variableDiffs,
    ];
    return combined.filter((item) => {
      if (entityFilter !== 'all' && item.kind !== entityFilter) return false;
      if (statusFilter === 'changes' && item.status === 'unchanged') return false;
      if (
        statusFilter !== 'changes' &&
        statusFilter !== 'all' &&
        item.status !== statusFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMeta =
          item.name.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.entityType.toLowerCase().includes(q);
        const matchesField = item.fieldChanges.some(
          (fc) =>
            fc.field.toLowerCase().includes(q) ||
            fc.before.toLowerCase().includes(q) ||
            fc.after.toLowerCase().includes(q)
        );
        if (!matchesMeta && !matchesField) return false;
      }
      return true;
    });
  }, [diffResult, entityFilter, statusFilter, searchQuery]);

  const handleSwap = () => {
    const prevBase = baseContainer;
    setBaseContainer(targetContainer);
    setTargetContainer(prevBase);
  };

  const handleCompareWithAutoPatched = () => {
    const base = baseContainer || currentContainer;
    setBaseContainer(base);
    const { patched } = patchGtmContainer(base);
    setTargetContainer({
      ...patched,
      containerVersion: {
        ...patched.containerVersion,
        containerVersionId: `${patched.containerVersion.containerVersionId || '1'}-patched`,
        name: `${patched.containerVersion.name} (Auto-Patched Candidate)`,
      },
    });
  };

  const handleExportDiff = () => {
    if (!diffResult) return;
    const blob = new Blob([JSON.stringify(diffResult, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gtm-diff-${diffResult.baseMeta.publicId.toLowerCase()}-v${diffResult.baseMeta.versionId}-vs-v${diffResult.targetMeta.versionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Container Version Diff
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Import two GTM JSON exports (baseline vs candidate) to audit added, removed, and modified tags, triggers, and variables before publishing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCompareWithAutoPatched}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            Preview Baseline vs Auto-Patched
          </button>
          <button
            type="button"
            onClick={handleSwap}
            disabled={!baseContainer && !targetContainer}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Swap Versions
          </button>
          <button
            type="button"
            onClick={handleExportDiff}
            disabled={!diffResult}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export Diff JSON
          </button>
        </div>
      </div>

      {/* Dual Container Importers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SlotImportPanel
          label="Version A — Baseline Export"
          roleHint="Production or prior GTM container export JSON"
          container={baseContainer}
          onLoad={setBaseContainer}
          onClear={() => setBaseContainer(null)}
          onUseCurrent={() => setBaseContainer(currentContainer)}
        />
        <SlotImportPanel
          label="Version B — Candidate Export"
          roleHint="Updated workspace or staging GTM container export JSON"
          container={targetContainer}
          onLoad={setTargetContainer}
          onClear={() => setTargetContainer(null)}
          onUseCurrent={() => setTargetContainer(currentContainer)}
        />
      </div>

      {!diffResult ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center space-y-2">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Load two GTM container JSON exports to compute differences
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload or paste GTM exports in both Version A and Version B above, or click Preview Baseline vs Auto-Patched.
          </p>
        </div>
      ) : (
        <>
          {/* 4-Column Diff Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Added Entities</div>
              <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                +{diffResult.counts.total.added}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {diffResult.counts.tags.added} tags · {diffResult.counts.triggers.added} triggers ·{' '}
                {diffResult.counts.variables.added} vars
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Removed Entities</div>
              <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-red-600 dark:text-red-400">
                -{diffResult.counts.total.removed}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {diffResult.counts.tags.removed} tags · {diffResult.counts.triggers.removed} triggers ·{' '}
                {diffResult.counts.variables.removed} vars
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Modified Entities</div>
              <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-amber-700 dark:text-amber-400">
                ~{diffResult.counts.total.modified}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {diffResult.counts.tags.modified} tags · {diffResult.counts.triggers.modified} triggers ·{' '}
                {diffResult.counts.variables.modified} vars
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Unchanged Entities</div>
              <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {diffResult.counts.total.unchanged}
              </div>
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {diffResult.counts.tags.unchanged} tags · {diffResult.counts.triggers.unchanged} triggers ·{' '}
                {diffResult.counts.variables.unchanged} vars
              </div>
            </div>
          </div>

          {/* Filter Toolbar + Diff Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(
                    [
                      { id: 'all', label: 'All Entities' },
                      { id: 'tag', label: `Tags (${diffResult.tagDiffs.length})` },
                      { id: 'trigger', label: `Triggers (${diffResult.triggerDiffs.length})` },
                      { id: 'variable', label: `Variables (${diffResult.variableDiffs.length})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEntityFilter(tab.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        entityFilter === tab.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(
                    [
                      { id: 'changes', label: 'Changes Only' },
                      { id: 'all', label: 'All States' },
                      { id: 'added', label: 'Added' },
                      { id: 'removed', label: 'Removed' },
                      { id: 'modified', label: 'Modified' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStatusFilter(st.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        statusFilter === st.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter diff by name, field, ID..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-orange-500 w-60"
                />
              </div>
            </div>

            {allDiffItems.length === 0 ? (
              <div className="py-12 px-5 text-center text-xs text-slate-500 dark:text-slate-400">
                No entity differences match the current filters.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {allDiffItems.map((item) => {
                  const meta = statusLabel(item.status);
                  const StatusIcon = meta.Icon;
                  const isExpanded = Boolean(expandedKeys[item.key]);

                  return (
                    <div key={item.key} className="bg-white dark:bg-slate-900">
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.key)}
                        className="w-full px-5 py-3.5 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${meta.className}`}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {meta.text}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0">
                              {kindLabel(item.kind)}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {item.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0 pl-6 sm:pl-0">
                            <span>#{item.id}</span>
                            <span aria-hidden="true">·</span>
                            <span>{item.entityType}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {item.fieldChanges.length === 0
                                ? 'No property delta'
                                : `${item.fieldChanges.length} ${
                                    item.fieldChanges.length === 1 ? 'change' : 'changes'
                                  }`}
                            </span>
                          </div>
                        </div>

                        {item.fieldChanges.length > 0 && (
                          <div className="mt-2.5 pl-6 space-y-1.5">
                            {item.fieldChanges.map((fc, idx) => (
                              <div
                                key={idx}
                                className="grid grid-cols-1 md:grid-cols-12 gap-2 text-[11px] font-mono bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5"
                              >
                                <span className="md:col-span-3 font-semibold text-slate-700 dark:text-slate-300 truncate">
                                  {fc.field}
                                </span>
                                <span className="md:col-span-4 text-red-600 dark:text-red-400 break-all">
                                  - {fc.before}
                                </span>
                                <span className="md:col-span-5 text-emerald-700 dark:text-emerald-400 break-all">
                                  + {fc.after}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-5 pb-4 pt-1 pl-11 grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                              Version A (Baseline) JSON
                            </div>
                            <pre className="p-3 bg-slate-950 text-slate-200 border border-slate-800 rounded-md text-[11px] font-mono overflow-x-auto max-h-64">
                              {item.beforeItem
                                ? JSON.stringify(item.beforeItem, null, 2)
                                : '// Not present in Baseline export'}
                            </pre>
                          </div>
                          <div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                              Version B (Candidate) JSON
                            </div>
                            <pre className="p-3 bg-slate-950 text-slate-200 border border-slate-800 rounded-md text-[11px] font-mono overflow-x-auto max-h-64">
                              {item.afterItem
                                ? JSON.stringify(item.afterItem, null, 2)
                                : '// Removed in Candidate export'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
