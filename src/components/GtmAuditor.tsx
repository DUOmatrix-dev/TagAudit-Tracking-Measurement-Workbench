import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Search,
  Upload,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  GtmAuditSummary,
  GtmExportJson,
  GtmTag,
} from '../types/tracking';
import { validateGtmJsonInput } from '../utils/gtmAnalyzer';
import { TriggerFiringMonitor } from './TriggerFiringMonitor';
import { ImplementationScraper } from './ImplementationScraper';
import { ContainerVersionDiff } from './ContainerVersionDiff';

interface GtmAuditorProps {
  container: GtmExportJson;
  summary: GtmAuditSummary;
  patchLog: string[];
  isDark?: boolean;
  onImportContainer: (next: GtmExportJson) => void;
  onPatchContainer: () => void;
}

type GtmSubTab =
  | 'findings'
  | 'tags'
  | 'triggers'
  | 'variables'
  | 'monitor'
  | 'scraper'
  | 'diff';

export const GtmAuditor: React.FC<GtmAuditorProps> = ({
  container,
  summary,
  patchLog,
  isDark = false,
  onImportContainer,
  onPatchContainer,
}) => {
  const [subTab, setSubTab] = useState<GtmSubTab>('findings');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [selectedTag, setSelectedTag] = useState<GtmTag | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cv = container.containerVersion;

  const triggerMap = useMemo(() => {
    const map = new Map<string, string>();
    (cv.trigger || []).forEach((tr) => map.set(tr.triggerId, tr.name));
    return map;
  }, [cv.trigger]);

  const filteredIssues = useMemo(() => {
    return summary.issues.filter((issue) => {
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        issue.title.toLowerCase().includes(q) ||
        issue.detail.toLowerCase().includes(q) ||
        issue.category.toLowerCase().includes(q)
      );
    });
  }, [summary.issues, severityFilter, searchQuery]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return cv.tag;
    const q = searchQuery.toLowerCase();
    return cv.tag.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.tagId.includes(q)
    );
  }, [cv.tag, searchQuery]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const res = validateGtmJsonInput(text);
      if (!res.valid || !res.data) {
        setImportError(res.error || 'Unable to parse GTM JSON.');
        setShowPasteModal(true);
        setPasteValue(text.slice(0, 6000));
      } else {
        setImportError(null);
        onImportContainer(res.data);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePasteSubmit = () => {
    const res = validateGtmJsonInput(pasteValue);
    if (!res.valid || !res.data) {
      setImportError(res.error || 'Invalid GTM JSON.');
      return;
    }
    setImportError(null);
    onImportContainer(res.data);
    setShowPasteModal(false);
    setPasteValue('');
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(container, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${summary.containerPublicId.toLowerCase()}-audited.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const patchableCount = summary.issues.filter((i) => i.patchable).length;

  return (
    <div className="space-y-6">
      {/* Header & Primary Container Actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            GTM Container Auditor
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-mono text-xs text-slate-800 dark:text-slate-200">{summary.containerPublicId}</span>
            <span className="mx-2 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span>{cv.name}</span>
            <span className="mx-2 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span className="tabular-nums">{summary.totalTags} tags, {summary.totalTriggers} triggers, {summary.totalVariables} variables</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload GTM JSON
          </button>
          <button
            type="button"
            onClick={() => setShowPasteModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileJson className="w-3.5 h-3.5" />
            Paste JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={onPatchContainer}
            disabled={patchableCount === 0}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              patchableCount > 0
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            {patchableCount > 0 ? `Auto-Patch (${patchableCount})` : 'Container Clean'}
          </button>
        </div>
      </div>

      {/* Patch Log Feedback */}
      {patchLog.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Automated Container Patch Applied ({patchLog.length} changes)</span>
          </div>
          <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
            {patchLog.map((item, idx) => (
              <li key={idx} className="truncate">
                · {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Workspace Filter & Sub-Navigation Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          {(
            [
              { id: 'findings', label: `Audit Findings (${summary.issues.length})` },
              { id: 'tags', label: `Tags (${cv.tag.length})` },
              { id: 'triggers', label: `Triggers (${cv.trigger.length})` },
              { id: 'variables', label: `Variables (${cv.variable.length})` },
              { id: 'monitor', label: 'Trigger Firing Monitor' },
              { id: 'scraper', label: 'Implementation Scraper' },
              { id: 'diff', label: 'Container Version Diff' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {subTab !== 'monitor' && subTab !== 'scraper' && subTab !== 'diff' && (
          <div className="flex items-center gap-2.5">
            {subTab === 'findings' && (
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['all', 'critical', 'warning'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      severityFilter === sev
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name, type, ID..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-orange-500 w-56"
              />
            </div>
          </div>
        )}
      </div>

      {/* Findings View */}
      {subTab === 'findings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 w-28">Severity</th>
                  <th className="py-3 px-4 w-44">Domain</th>
                  <th className="py-3 px-4">Finding &amp; Remediation</th>
                  <th className="py-3 px-4 w-28 text-right">Patchable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredIssues.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-500 dark:text-slate-400">
                      No audit findings match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredIssues.map((issue) => (
                    <tr key={issue.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                      <td className="py-3.5 px-4 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            issue.severity === 'critical'
                              ? 'text-red-600 dark:text-red-400'
                              : issue.severity === 'warning'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {issue.severity === 'critical' && <XCircle className="w-3.5 h-3.5" />}
                          {issue.severity === 'warning' && <AlertTriangle className="w-3.5 h-3.5" />}
                          {issue.severity === 'pass' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {issue.severity === 'critical'
                            ? 'Critical'
                            : issue.severity === 'warning'
                              ? 'Warning'
                              : 'Nominal'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 align-top text-slate-700 dark:text-slate-300 font-medium">
                        {issue.category}
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">{issue.title}</div>
                        <p className="mt-1 text-slate-600 dark:text-slate-400">{issue.detail}</p>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">
                          <span className="font-medium">Fix:</span> {issue.remediation}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 align-top text-right font-mono text-slate-600 dark:text-slate-400">
                        {issue.patchable ? 'Auto-Fix' : 'Manual'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tags Inventory Table + Tag Detail Drawer */}
      {subTab === 'tags' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div
            className={`${
              selectedTag ? 'lg:col-span-8' : 'lg:col-span-12'
            } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4 w-16">ID</th>
                    <th className="py-2.5 px-4">Tag Name</th>
                    <th className="py-2.5 px-4 w-28">Type</th>
                    <th className="py-2.5 px-4">Firing Triggers</th>
                    <th className="py-2.5 px-4 w-44">Consent Mode v2</th>
                    <th className="py-2.5 px-4 w-24 text-right">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {filteredTags.map((tag) => {
                    const consentList =
                      tag.consentSettings?.consentType?.list?.map((c) => c.value) || [];
                    const isSelected = selectedTag?.tagId === tag.tagId;
                    return (
                      <tr
                        key={tag.tagId}
                        onClick={() => setSelectedTag(tag)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-orange-50/70 dark:bg-orange-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {tag.tagId}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{tag.name}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">{tag.type}</td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                          {(tag.firingTriggerId || [])
                            .map((id) => triggerMap.get(id) || `#${id}`)
                            .join(', ') || 'None'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                          {tag.consentSettings?.consentStatus === 'NEEDED'
                            ? consentList.join(', ') || 'NEEDED'
                            : tag.consentSettings?.consentStatus || 'NOT_SET'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span
                            className={
                              tag.paused
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-emerald-700 dark:text-emerald-400 font-medium'
                            }
                          >
                            {tag.paused ? 'Paused' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selectedTag && (
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    Tag #{selectedTag.tagId} · {selectedTag.type}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {selectedTag.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Raw Tag JSON Definition
                </div>
                <pre className="p-3 bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-[11px] font-mono overflow-x-auto max-h-80">
                  {JSON.stringify(selectedTag, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Triggers Table */}
      {subTab === 'triggers' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 w-20">ID</th>
                <th className="py-2.5 px-4">Trigger Name</th>
                <th className="py-2.5 px-4 w-40">Event Type</th>
                <th className="py-2.5 px-4 w-32 text-right">Attached Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {cv.trigger.map((trig) => {
                const count = cv.tag.filter(
                  (t) =>
                    t.firingTriggerId?.includes(trig.triggerId) ||
                    t.blockingTriggerId?.includes(trig.triggerId)
                ).length;
                return (
                  <tr key={trig.triggerId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {trig.triggerId}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{trig.name}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">{trig.type}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums ${
                        count === 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {count === 0 ? '0 (Orphan)' : count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Variables Table */}
      {subTab === 'variables' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 w-20">ID</th>
                <th className="py-2.5 px-4">Variable Name</th>
                <th className="py-2.5 px-4 w-36">GTM Type Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {cv.variable.map((variable) => (
                <tr key={variable.variableId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {variable.variableId}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                    {`{{${variable.name}}}`}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">{variable.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Trigger Firing Monitor */}
      {subTab === 'monitor' && (
        <TriggerFiringMonitor container={container} isDark={isDark} />
      )}

      {/* Implementation Scraper */}
      {subTab === 'scraper' && <ImplementationScraper />}

      {/* Container Version Diff */}
      {subTab === 'diff' && <ContainerVersionDiff currentContainer={container} />}

      {/* Paste GTM JSON Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-full max-w-2xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Import GTM Container Export JSON
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowPasteModal(false);
                  setImportError(null);
                }}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Paste the contents of a Google Tag Manager Admin &rarr; Export Container <span className="font-mono">.json</span> file containing <span className="font-mono">containerVersion</span>.
            </p>
            {importError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-md text-xs text-red-700 dark:text-red-300">
                {importError}
              </div>
            )}
            <textarea
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              rows={12}
              placeholder='{"exportFormatVersion": 2, "containerVersion": { ... }}'
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPasteModal(false);
                  setImportError(null);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasteSubmit}
                className="px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 cursor-pointer"
              >
                Parse &amp; Audit Container
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
