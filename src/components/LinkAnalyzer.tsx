import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  LinkAnalysisReport,
  LivePageScanResult,
  inspectUrlStructure,
  normalizeInputUrl,
} from '../utils/linkAnalyzer';

const SAMPLE_LINKS = [
  {
    label: 'Paid Search Landing URL',
    url: 'https://www.google.com/search?utm_source=google&utm_medium=cpc&utm_campaign=q4_brand&gclid=Cj0KCQiA57G5BhDUARIsACgCYnwp8K1v9xYz',
  },
  {
    label: 'Broken GCLID + PII Leak',
    url: 'http://shop.northlineoutdoor.com/checkout?utm_source=Meta Ads&gclid=Cj0KCQ+iA5/7G=&email=alex.morgan@gmail.com',
  },
  {
    label: 'GTM Docs Live Scan',
    url: 'https://tagmanager.google.com/',
  },
];

export const LinkAnalyzer: React.FC = () => {
  const [urlInput, setUrlInput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [report, setReport] = useState<LinkAnalysisReport | null>(null);

  const runAnalysis = async (rawTarget: string) => {
    const normalized = normalizeInputUrl(rawTarget);
    if (!normalized.ok) {
      setInputError(normalized.error);
      return;
    }

    setInputError(null);
    setIsAnalyzing(true);

    let liveScan: LivePageScanResult | null = null;
    try {
      const response = await fetch('/api/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized.url.toString() }),
      });

      if (response.ok) {
        liveScan = (await response.json()) as LivePageScanResult;
      } else {
        const errBody = await response.json().catch(() => ({}));
        liveScan = {
          reachable: false,
          requestedUrl: normalized.url.toString(),
          finalUrl: normalized.url.toString(),
          redirected: false,
          statusCode: response.status,
          statusText: response.statusText,
          responseTimeMs: 0,
          fetchError:
            typeof errBody?.error === 'string'
              ? errBody.error
              : `HTTP ${response.status} during live page scan.`,
          signals: null,
        };
      }
    } catch (err) {
      liveScan = {
        reachable: false,
        requestedUrl: normalized.url.toString(),
        finalUrl: normalized.url.toString(),
        redirected: false,
        statusCode: null,
        statusText: '',
        responseTimeMs: 0,
        fetchError:
          err instanceof Error
            ? err.message
            : 'Network error while reaching URL analyzer endpoint.',
        signals: null,
      };
    }

    const analyzed = inspectUrlStructure(normalized.url, liveScan);
    setReport(analyzed);
    setIsAnalyzing(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runAnalysis(urlInput);
  };

  const criticalCount = report
    ? report.findings.filter((f) => f.severity === 'critical').length
    : 0;
  const warningCount = report
    ? report.findings.filter((f) => f.severity === 'warning').length
    : 0;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      {/* Header & Link Paste Input */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Link &amp; Page Tracking Analyzer
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Paste any landing page or campaign URL to audit click IDs, UTM attribution, PII query leaks, and live GTM/Pixel tags.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {SAMPLE_LINKS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => {
                  setUrlInput(sample.url);
                  void runAnalysis(sample.url);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Link2 className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (inputError) setInputError(null);
              }}
              aria-label="Paste destination URL to analyze"
              placeholder="Paste a link here to analyze (e.g. https://example.com/checkout?utm_source=google&utm_medium=cpc&gclid=...)"
              className="w-full pl-10 pr-4 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
            />
          </div>
          <button
            type="submit"
            disabled={isAnalyzing}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing Link...
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                Analyze Link
              </>
            )}
          </button>
        </form>

        {inputError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-md text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{inputError}</span>
          </div>
        )}
      </div>

      {/* Empty State Before First Paste */}
      {!report && !isAnalyzing && (
        <div className="px-5 py-6 bg-slate-50/70 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Ready to inspect: Click ID encoding (GCLID/FBCLID), UTM consistency, redirect preservation, GTM/GA4/Meta containers, and Consent Mode v2 signals.
          </span>
          <span className="font-mono text-[11px] shrink-0">
            Paste URL above or choose a sample link
          </span>
        </div>
      )}

      {/* Analysis Output */}
      {report && (
        <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
          {/* Summary Bar */}
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate max-w-md">
                {report.hostname}
                {report.pathname}
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {report.protocol}
              </span>
              {report.liveScan?.reachable && (
                <>
                  <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    HTTP {report.liveScan.statusCode} ({report.liveScan.responseTimeMs}ms)
                  </span>
                </>
              )}
              {report.liveScan && !report.liveScan.reachable && (
                <>
                  <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                    URL-Only Audit (Live DOM Blocked)
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
              <span className={criticalCount > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-600 dark:text-slate-400'}>
                {criticalCount} critical
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span className={warningCount > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-slate-600 dark:text-slate-400'}>
                {warningCount} warnings
              </span>
              <a
                href={report.normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-sans font-medium ml-1"
              >
                Open URL
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Live HTML Tagging & Consent Signals */}
          {report.liveScan?.reachable && report.liveScan.signals && (
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              <div className="space-y-1.5">
                <div className="text-slate-500 dark:text-slate-400 font-medium">
                  Detected Containers &amp; Pixels
                </div>
                <div className="font-mono text-slate-900 dark:text-slate-100 space-y-1">
                  <div>
                    GTM:{' '}
                    {report.liveScan.signals.gtmContainers.length > 0
                      ? report.liveScan.signals.gtmContainers.join(', ')
                      : 'None found'}
                  </div>
                  <div>
                    GA4 / Ads:{' '}
                    {[
                      ...report.liveScan.signals.ga4MeasurementIds,
                      ...report.liveScan.signals.googleAdsIds,
                    ].join(', ') || (report.liveScan.signals.hasGtagScript ? 'gtag.js present' : 'None found')}
                  </div>
                  <div>
                    Meta / Paid Social:{' '}
                    {[
                      ...report.liveScan.signals.metaPixelIds.map((id) => `Meta(${id})`),
                      ...report.liveScan.signals.linkedInPartnerIds.map((id) => `LI(${id})`),
                      ...report.liveScan.signals.tiktokPixelIds.map((id) => `TT(${id})`),
                    ].join(', ') || 'None found'}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-slate-500 dark:text-slate-400 font-medium">
                  Consent Mode v2 &amp; CMP
                </div>
                <div className="space-y-1 text-slate-800 dark:text-slate-200">
                  <div>
                    Consent Default:{' '}
                    <span className="font-mono">
                      {report.liveScan.signals.hasConsentModeDefault ? 'Declared' : 'Not detected'}
                    </span>
                  </div>
                  <div>
                    v2 Signals (ad_user_data / ad_personalization):{' '}
                    <span className="font-mono">
                      {report.liveScan.signals.hasConsentV2Signals ? 'Present' : 'Not detected'}
                    </span>
                  </div>
                  <div>
                    CMP Vendors:{' '}
                    <span className="font-mono">
                      {report.liveScan.signals.cmpVendors.join(', ') || 'None detected'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-slate-500 dark:text-slate-400 font-medium">
                  Page &amp; Transport Metadata
                </div>
                <div className="space-y-1 text-slate-800 dark:text-slate-200">
                  <div className="truncate">
                    Title: <span className="font-medium">{report.liveScan.pageTitle || '(no title)'}</span>
                  </div>
                  <div>
                    dataLayer / sGTM:{' '}
                    <span className="font-mono">
                      {report.liveScan.signals.hasDataLayer ? 'dataLayer present' : 'No dataLayer'} ·{' '}
                      {report.liveScan.signals.hasCustomSgtmTransport ? 'sGTM transport' : 'Client-side'}
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {report.liveScan.scriptCount ?? 0} script tags ·{' '}
                    {report.liveScan.redirected ? 'Redirected' : 'Direct 200'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Query Parameter Breakdown Table */}
          <div className="overflow-x-auto">
            <div className="px-5 py-3 flex items-center justify-between text-xs border-b border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Query Parameter &amp; Attribution Inspection ({report.params.length})
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {report.clickIdsPresent.length} click IDs · {report.utmPresent.length} UTMs
              </span>
            </div>

            {report.params.length === 0 ? (
              <div className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                No query parameters present on this URL.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-5 w-36">Parameter</th>
                    <th className="py-2.5 px-4 w-36">Category</th>
                    <th className="py-2.5 px-4">Value</th>
                    <th className="py-2.5 px-5">Audit Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {report.params.map((p, idx) => (
                    <tr key={`${p.key}-${idx}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-5 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {p.key}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                        {p.category}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300 break-all max-w-xs">
                        {p.value || '(empty)'}
                      </td>
                      <td className="py-2.5 px-5">
                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            p.status === 'critical'
                              ? 'text-red-600 dark:text-red-400 font-medium'
                              : p.status === 'warning'
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {p.status === 'critical' && <ShieldAlert className="w-3.5 h-3.5 shrink-0" />}
                          {p.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                          {p.status === 'valid' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                          <span>{p.note}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Link Audit Findings */}
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {report.findings.map((finding) => (
              <div key={finding.id} className="px-5 py-3.5 flex flex-col gap-1 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      finding.severity === 'critical'
                        ? 'text-red-600 dark:text-red-400'
                        : finding.severity === 'warning'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {finding.severity === 'critical' && <XCircle className="w-3.5 h-3.5" />}
                    {finding.severity === 'warning' && <AlertTriangle className="w-3.5 h-3.5" />}
                    {finding.severity === 'pass' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {finding.severity === 'critical'
                      ? 'Critical'
                      : finding.severity === 'warning'
                        ? 'Warning'
                        : 'Nominal'}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                  <span className="text-slate-600 dark:text-slate-400">{finding.area}</span>
                </div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {finding.title}
                </div>
                <p className="text-slate-600 dark:text-slate-400">{finding.detail}</p>
                {finding.severity !== 'pass' && (
                  <p className="text-slate-700 dark:text-slate-300">
                    <span className="font-medium">Fix:</span> {finding.remediation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
