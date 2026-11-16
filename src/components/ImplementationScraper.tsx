import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  SnippetPresetId,
  SnippetScrapeReport,
  analyzeImplementationSnippet,
  cleanAndFormatGtmSnippet,
  getSnippetPreset,
} from '../utils/gtmSnippetScraper';

export const ImplementationScraper: React.FC = () => {
  const [rawSnippet, setRawSnippet] = useState<string>(
    () => getSnippetPreset('noisy_copy_paste').rawSnippet
  );
  const [report, setReport] = useState<SnippetScrapeReport | null>(() =>
    analyzeImplementationSnippet(getSnippetPreset('noisy_copy_paste').rawSnippet)
  );
  const [inputError, setInputError] = useState<string | null>(null);
  const [copiedCleaned, setCopiedCleaned] = useState(false);

  const handleAnalyzeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawSnippet.trim()) {
      setInputError('Paste raw HTML or a GTM snippet before running structural analysis.');
      setReport(null);
      return;
    }
    setInputError(null);
    const result = analyzeImplementationSnippet(rawSnippet);
    setReport(result);
  };

  const handleCleanInPlace = () => {
    if (!rawSnippet.trim()) {
      setInputError('Paste raw HTML or a GTM snippet to clean and format.');
      return;
    }
    setInputError(null);
    const cleaned = cleanAndFormatGtmSnippet(rawSnippet);
    setRawSnippet(cleaned.cleanedHtml);
    setReport(analyzeImplementationSnippet(cleaned.cleanedHtml));
  };

  const handleLoadPreset = (presetId: SnippetPresetId) => {
    const preset = getSnippetPreset(presetId);
    setRawSnippet(preset.rawSnippet);
    setInputError(null);
    setReport(analyzeImplementationSnippet(preset.rawSnippet));
  };

  const handleCopyCleaned = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.cleaned.cleanedHtml);
      setCopiedCleaned(true);
      window.setTimeout(() => setCopiedCleaned(false), 1800);
    } catch {
      // Ignore clipboard permission restrictions
    }
  };

  const passedChecks = report
    ? report.checks.filter((c) => c.status === 'pass').length
    : 0;
  const missingChecks = report
    ? report.checks.filter((c) => c.status === 'missing').length
    : 0;
  const validIdCount = report
    ? report.containerIds.filter((c) => c.valid).length
    : 0;
  const invalidIdCount = report
    ? report.containerIds.filter((c) => !c.valid).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header & Input Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Implementation Scraper &amp; Snippet Cleaner
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Paste raw HTML or GTM head/body snippets to strip copy-paste artifacts, verify gtm.js preload markers, and validate container ID formats.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {(
              [
                ['noisy_copy_paste', 'Noisy Copy-Paste Snippet'],
                ['broken_implementation', 'Broken ID & Missing Preload'],
                ['production_ready', 'Production-Ready Snippet'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => handleLoadPreset(id)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleAnalyzeSubmit} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="implementation-scraper-input"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Raw HTML / GTM Snippet Input
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {rawSnippet ? `${rawSnippet.split(/\r?\n/).length} lines` : '0 lines'}
              </span>
            </div>
            <textarea
              id="implementation-scraper-input"
              value={rawSnippet}
              onChange={(e) => {
                setRawSnippet(e.target.value);
                if (inputError) setInputError(null);
              }}
              rows={9}
              placeholder="Paste raw <head> HTML, GTM <script> / <noscript> snippets, or <link rel='preload'> tags here..."
              className="w-full p-3.5 font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-orange-500 leading-relaxed"
            />
          </div>

          {inputError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-md text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{inputError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                Clean &amp; Analyze Snippet
              </button>
              <button
                type="button"
                onClick={handleCleanInPlace}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                Format Input In-Place
              </button>
            </div>

            {rawSnippet && (
              <button
                type="button"
                onClick={() => {
                  setRawSnippet('');
                  setReport(null);
                  setInputError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Snippet
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Empty State */}
      {!report && !inputError && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center space-y-3">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            No snippet analyzed yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Paste your site&apos;s raw GTM implementation snippet above and submit to strip HTML comments/extra breaks, verify gtm.js preload markers, and inspect container ID formatting.
          </p>
          <button
            type="button"
            onClick={() => handleLoadPreset('noisy_copy_paste')}
            className="px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 cursor-pointer"
          >
            Load Sample Snippet
          </button>
        </div>
      )}

      {report && (
        <>
          {/* 4-Column Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Container IDs Found
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {report.containerIds.length}
                </span>
                <span
                  className={`text-xs font-medium ${
                    invalidIdCount > 0
                      ? 'text-red-600 dark:text-red-400'
                      : validIdCount > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {invalidIdCount > 0
                    ? `${invalidIdCount} invalid format`
                    : validIdCount > 0
                      ? `${validIdCount} valid GTM ID`
                      : 'None found'}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Required Attribute Checks
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {passedChecks}/{report.checks.length}
                </span>
                <span
                  className={`text-xs font-medium ${
                    missingChecks > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {missingChecks > 0 ? `${missingChecks} missing` : 'All critical present'}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                gtm.js Preload Marker
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {report.hasPreloadMarker ? 'Present' : 'Missing'}
                </span>
                <span
                  className={`text-xs font-medium ${
                    report.hasPreloadMarker
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {report.hasPreloadMarker ? 'as="script" OK' : 'Add preload hint'}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Copy-Paste Noise Cleaned
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {report.cleaned.removedCommentsCount + report.cleaned.collapsedBlankLines}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {report.cleaned.originalLineCount} → {report.cleaned.cleanedLineCount} lines
                </span>
              </div>
            </div>
          </div>

          {/* Container ID Format Validation Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  GTM Container ID Format Validation
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Validates extracted tokens against canonical GTM-[A-Z0-9]&#123;6,8&#125; container ID rules and snippet parity
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {report.containerIds.length} detected
              </span>
            </div>

            {report.containerIds.length === 0 ? (
              <div className="p-6 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>
                  No GTM container IDs (GTM-XXXXXX) were found in the pasted snippet.
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-5 w-44">Detected Token</th>
                      <th className="py-2.5 px-4 w-36">Validity</th>
                      <th className="py-2.5 px-4 w-48">Found In</th>
                      <th className="py-2.5 px-5">Format Assessment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {report.containerIds.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {item.id}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 font-medium ${
                              item.valid
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {item.valid ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            {item.valid
                              ? 'Valid Format'
                              : item.status === 'placeholder'
                                ? 'Placeholder ID'
                                : 'Malformed ID'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {item.locations.join(', ')}
                        </td>
                        <td className="py-3 px-5 text-slate-700 dark:text-slate-300">
                          <div>{item.reason}</div>
                          {item.suggestedFix && (
                            <div className="mt-0.5 font-mono text-[11px] text-orange-600 dark:text-orange-400">
                              Suggested: {item.suggestedFix}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Required Structural Checks + Cleaned Snippet Output */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Structural Checklist */}
            <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Required Attributes &amp; Structural Checks
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Evaluated after normalizing whitespace and removing HTML comment artifacts
                </p>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {report.checks.map((check) => (
                  <div key={check.id} className="p-4 sm:px-5 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            check.status === 'pass'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : check.status === 'warning'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {check.status === 'pass' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {check.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5" />}
                          {check.status === 'missing' && <XCircle className="w-3.5 h-3.5" />}
                          {check.status === 'pass'
                            ? 'Present'
                            : check.status === 'warning'
                              ? 'Warning'
                              : 'Missing'}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {check.attribute}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {check.category}
                      </span>
                    </div>

                    <p className="text-slate-600 dark:text-slate-400">{check.summary}</p>
                    {check.remediation && (
                      <p className="text-slate-700 dark:text-slate-300">
                        <span className="font-medium">Fix:</span> {check.remediation}
                      </p>
                    )}
                    {check.recommendedCode && (
                      <pre className="mt-1.5 p-2.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-md font-mono text-[11px] overflow-x-auto">
                        {check.recommendedCode}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Cleaned & Formatted Snippet Output */}
            <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Cleaned &amp; Formatted Snippet
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Normalized output used for structural scraping
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCleaned}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedCleaned ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Cleaned
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 space-y-3">
                {report.cleaned.normalizedArtifacts.length > 0 ? (
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {report.cleaned.normalizedArtifacts.map((artifact) => (
                      <li key={artifact} className="flex items-start gap-2">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold" aria-hidden="true">
                          ✓
                        </span>
                        <span>{artifact}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Snippet had no copy-paste comment noise or extra whitespace artifacts.
                  </p>
                )}

                <pre className="p-3.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-[11px] font-mono overflow-x-auto max-h-96 leading-relaxed">
                  {report.cleaned.cleanedHtml}
                </pre>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
