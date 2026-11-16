import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  OciImportRow,
  PlatformDiscrepancyRow,
} from '../types/tracking';

interface DiscrepancyModelerProps {
  discrepancies: PlatformDiscrepancyRow[];
  ociRows: OciImportRow[];
  defaultTrafficSettings: {
    monthlyConversions: number;
    eeaSharePct: number;
    rejectionRatePct: number;
    modelingRecoveryPct: number;
  };
  onAddOciRow: (row: OciImportRow) => void;
  onUpdateOciRow: (row: OciImportRow) => void;
}

interface GclidSegment {
  text: string;
  flag: 'ok' | 'error';
  reason?: string;
}

interface GclidFormatAnalysis {
  formatValid: boolean;
  issues: string[];
  encodingFlags: string[];
  suggestedGclid: string | null;
  remediationNote: string | null;
  segments: GclidSegment[];
}

function buildGclidSegments(raw: string): GclidSegment[] {
  const segments: GclidSegment[] = [];
  let i = 0;

  while (i < raw.length) {
    // Check percent encoding e.g. %2B, %2F, %3D
    if (raw[i] === '%' && /^[0-9A-Fa-f]{2}/.test(raw.slice(i + 1, i + 3))) {
      const token = raw.slice(i, i + 3);
      segments.push({
        text: token,
        flag: 'error',
        reason: 'Percent-encoded sequence',
      });
      i += 3;
      continue;
    }

    // Check HTML entity or JSON-escaped slash
    const entityMatch = raw.slice(i).match(/^(&amp;|&#x2B;|&#43;|\\\/)/i);
    if (entityMatch) {
      segments.push({
        text: entityMatch[1],
        flag: 'error',
        reason: 'HTML/JSON escaped token',
      });
      i += entityMatch[1].length;
      continue;
    }

    const ch = raw[i];
    if (ch === '+' || ch === '/') {
      segments.push({
        text: ch,
        flag: 'error',
        reason: `Standard Base64 "${ch}" (must be URL-safe "${ch === '+' ? '-' : '_'}")`,
      });
    } else if (ch === '=') {
      segments.push({
        text: ch,
        flag: 'error',
        reason: 'Base64 padding "=" not valid in URL-safe GCLID',
      });
    } else if (/\s/.test(ch)) {
      segments.push({
        text: ch === ' ' ? '·' : ch,
        flag: 'error',
        reason: 'Whitespace character',
      });
    } else if (!/[A-Za-z0-9_-]/.test(ch)) {
      segments.push({
        text: ch,
        flag: 'error',
        reason: `Unsupported character "${ch}"`,
      });
    } else {
      const last = segments[segments.length - 1];
      if (last && last.flag === 'ok') {
        last.text += ch;
      } else {
        segments.push({ text: ch, flag: 'ok' });
      }
    }
    i += 1;
  }

  return segments;
}

function analyzeGclidFormat(rawGclid: string): GclidFormatAnalysis {
  const issues: string[] = [];
  const encodingFlags: string[] = [];
  let candidate = rawGclid;
  let repaired = false;

  if (!rawGclid.trim()) {
    return {
      formatValid: false,
      issues: ['GCLID value is empty.'],
      encodingFlags: ['Empty Value'],
      suggestedGclid: null,
      remediationNote: 'Paste or capture a raw GCLID string from ?gclid= or _gcl_aw cookie.',
      segments: [],
    };
  }

  // 1. Leading/trailing whitespace or quotes
  const trimmed = candidate.replace(/^[\s"']+|[\s"']+$/g, '');
  if (trimmed !== candidate) {
    issues.push('Contains leading/trailing whitespace or quotes.');
    encodingFlags.push('Whitespace / Quotes');
    candidate = trimmed;
    repaired = true;
  }

  // 2. URL or query parameter wrapper (e.g. https://.../?gclid=XYZ or gclid=XYZ)
  const urlMatch = candidate.match(/(?:[?&]|^)gclid=([^&#\s]+)/i);
  if (urlMatch && urlMatch[1]) {
    issues.push('Contains full URL or "gclid=" query parameter wrapper instead of raw click ID.');
    encodingFlags.push('URL Wrapper');
    candidate = urlMatch[1];
    repaired = true;
  }

  // 3. HTML entity / JSON-escaped slash artifacts
  if (/(&amp;|&#x2B;|&#43;|\\\/)/i.test(candidate)) {
    issues.push('Contains HTML-encoded or JSON-escaped characters (e.g. &#x2B;, \\/).');
    encodingFlags.push('Escaped Entities');
    candidate = candidate
      .replace(/&#x2B;|&#43;/gi, '+')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&');
    repaired = true;
  }

  // 4. Percent-encoded characters (%2B, %2F, %3D, etc.)
  if (/%[0-9A-Fa-f]{2}/.test(candidate)) {
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded !== candidate) {
        issues.push('Contains percent-encoded characters (e.g. %2B, %2F, %3D).');
        encodingFlags.push('Percent-Encoded');
        candidate = decoded;
        repaired = true;
      }
    } catch {
      issues.push('Malformed percent-encoding sequence detected.');
      encodingFlags.push('Malformed % Encoding');
    }
  }

  // 5. Base64 URL-safe character mismatches (+, /, =)
  if (/[+/]/.test(candidate)) {
    issues.push('Base64 URL-safe mismatch: contains "+" or "/" instead of "-" or "_".');
    encodingFlags.push('Base64 + / Mismatch');
    candidate = candidate.replace(/\+/g, '-').replace(/\//g, '_');
    repaired = true;
  }

  if (/=/.test(candidate)) {
    issues.push('Contains Base64 padding character ("="), which is stripped in Google URL-safe GCLIDs.');
    encodingFlags.push('Base64 "=" Padding');
    candidate = candidate.replace(/=+/g, '');
    repaired = true;
  }

  // 6. Internal whitespace
  if (/\s/.test(candidate)) {
    issues.push('Contains internal whitespace or line-break characters.');
    encodingFlags.push('Internal Whitespace');
    candidate = candidate.replace(/\s+/g, '');
    repaired = true;
  }

  // 7. Case-sensitivity check (GCLIDs are strictly mixed-case Base64)
  const isAllLower =
    candidate.length >= 18 && candidate === candidate.toLowerCase() && /[a-z]/.test(candidate);
  const isAllUpper =
    candidate.length >= 18 && candidate === candidate.toUpperCase() && /[A-Z]/.test(candidate);
  if (isAllLower || isAllUpper) {
    issues.push(
      'GCLID case-sensitivity corrupted (all lowercase/uppercase). Google Ads GCLIDs are strictly case-sensitive.'
    );
    encodingFlags.push('Case Corruption');
  }

  // 8. Length & character set validation
  if (candidate.length < 20 || candidate.length > 120) {
    issues.push(
      `Length (${candidate.length} chars) is outside valid GCLID bounds (20–120 chars).`
    );
    encodingFlags.push('Invalid Length');
  }

  if (!/^[A-Za-z0-9_-]+$/.test(candidate)) {
    issues.push('Contains unsupported characters outside URL-safe Base64 [A-Za-z0-9_-].');
    encodingFlags.push('Illegal Character');
  }

  const candidateIsClean =
    !isAllLower &&
    !isAllUpper &&
    candidate.length >= 20 &&
    candidate.length <= 120 &&
    /^[A-Za-z0-9_-]+$/.test(candidate);

  const formatValid = issues.length === 0 && candidateIsClean;

  let remediationNote: string | null = null;
  if (!formatValid) {
    if (repaired && candidateIsClean) {
      remediationNote =
        'Normalize to URL-safe Base64: replace "+" with "-", "/" with "_", strip "=" padding, and remove URL/whitespace wrappers.';
    } else if (isAllLower || isAllUpper) {
      remediationNote =
        'Cannot deterministically restore original mixed-case GCLID. Update CRM/GTM capture to preserve original query casing.';
    } else {
      remediationNote =
        'Verify Conversion Linker (_gcl_aw cookie) and capture raw ?gclid= parameter verbatim without truncation.';
    }
  }

  return {
    formatValid,
    issues,
    encodingFlags,
    suggestedGclid: !formatValid && repaired && candidateIsClean ? candidate : null,
    remediationNote,
    segments: buildGclidSegments(rawGclid),
  };
}

interface OciValidationResult {
  valid: boolean;
  errors: string[];
  daysSinceClick: number | null;
  gclidAnalysis: GclidFormatAnalysis;
}

function validateOciRow(row: OciImportRow): OciValidationResult {
  const gclidAnalysis = analyzeGclidFormat(row.gclid);
  const errors: string[] = [...gclidAnalysis.issues];

  // Require timezone offset in conversionTime e.g. 2026-11-12 11:04:22-08:00
  const hasTz = /([+-]\d{2}:\d{2}|Z)$/.test(row.conversionTime.trim());
  const parsedConv = Date.parse(row.conversionTime.replace(' ', 'T'));
  if (isNaN(parsedConv)) {
    errors.push('Invalid conversion_time timestamp.');
  } else if (!hasTz) {
    errors.push('Missing explicit timezone offset (e.g. -08:00) on conversion_time.');
  }

  let daysSinceClick: number | null = null;
  if (row.clickTimestamp && !isNaN(parsedConv)) {
    const parsedClick = Date.parse(row.clickTimestamp.replace(' ', 'T'));
    if (!isNaN(parsedClick)) {
      daysSinceClick = Math.round((parsedConv - parsedClick) / (1000 * 60 * 60 * 24));
      if (daysSinceClick < 0) {
        errors.push('Conversion timestamp precedes GCLID click timestamp.');
      } else if (daysSinceClick > 90) {
        errors.push(`Click-to-conversion window (${daysSinceClick}d) exceeds 90-day GCLID limit.`);
      }
    }
  }

  if (!/^[A-Z]{3}$/.test(row.currencyCode.trim())) {
    errors.push('Currency code must be a 3-letter ISO-4217 code (e.g. USD, GBP).');
  }

  const valNum = Number(row.conversionValue);
  if (isNaN(valNum) || valNum < 0) {
    errors.push('Conversion value must be a non-negative number.');
  }

  return {
    valid: errors.length === 0,
    errors,
    daysSinceClick,
    gclidAnalysis,
  };
}

export const DiscrepancyModeler: React.FC<DiscrepancyModelerProps> = ({
  discrepancies,
  ociRows,
  defaultTrafficSettings,
  onAddOciRow,
  onUpdateOciRow,
}) => {
  const [monthlyConv, setMonthlyConv] = useState(defaultTrafficSettings.monthlyConversions);
  const [eeaShare, setEeaShare] = useState(defaultTrafficSettings.eeaSharePct);
  const [rejectionRate, setRejectionRate] = useState(defaultTrafficSettings.rejectionRatePct);
  const [modelingRecovery, setModelingRecovery] = useState(
    defaultTrafficSettings.modelingRecoveryPct
  );

  // New OCI test row inputs
  const [newGclid, setNewGclid] = useState('Cj0KCQiA8v2L9pXqZ_validTestGclid99');
  const [newConvTime, setNewConvTime] = useState('2026-11-15 10:30:00-08:00');
  const [newClickTime, setNewClickTime] = useState('2026-11-05 14:15:00-08:00');
  const [newVal, setNewVal] = useState('450.00');
  const [newCurr, setNewCurr] = useState('USD');

  const liveStagedValidation = useMemo(
    () =>
      validateOciRow({
        id: 'staged-preview',
        gclid: newGclid,
        conversionName: 'Custom OCI Test Event',
        conversionTime: newConvTime.trim(),
        conversionValue: newVal.trim(),
        currencyCode: newCurr.trim(),
        clickTimestamp: newClickTime.trim(),
      }),
    [newGclid, newConvTime, newClickTime, newVal, newCurr]
  );

  const modelingStats = useMemo(() => {
    const rowShare = 100 - eeaShare;
    const rowObserved = Math.round((monthlyConv * rowShare) / 100);
    const eeaTotal = monthlyConv - rowObserved;
    const eeaConsented = Math.round((eeaTotal * (100 - rejectionRate)) / 100);
    const eeaRejected = eeaTotal - eeaConsented;
    const observedTotal = rowObserved + eeaConsented;
    const modeledRecovered = Math.round((eeaRejected * modelingRecovery) / 100);
    const unrecoveredLoss = eeaRejected - modeledRecovered;
    const reportedTotal = observedTotal + modeledRecovered;
    const effectiveAccuracyPct = ((reportedTotal / Math.max(1, monthlyConv)) * 100).toFixed(1);

    return {
      observedTotal,
      modeledRecovered,
      unrecoveredLoss,
      reportedTotal,
      effectiveAccuracyPct,
    };
  }, [monthlyConv, eeaShare, rejectionRate, modelingRecovery]);

  const handleTestOciAdd = (e: React.FormEvent) => {
    e.preventDefault();
    onAddOciRow({
      id: `oci-custom-${Date.now()}`,
      gclid: newGclid,
      conversionName: 'Custom OCI Test Event',
      conversionTime: newConvTime.trim(),
      conversionValue: newVal.trim(),
      currencyCode: newCurr.trim(),
      clickTimestamp: newClickTime.trim(),
    });
  };

  const pct = (val: number, total: number) =>
    total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Cross-Platform Discrepancy &amp; Attribution Modeler
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Reconcile platform conversion counts against CRM truth (&lt;3.0% threshold), model Consent Mode v2 recovery, and validate Offline Conversion Import (OCI) payloads.
        </p>
      </div>

      {/* Platform Discrepancy Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Platform vs. CRM Truth Reconciliation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Variances exceeding ±3.0% indicate tag duplication, consent gaps, or attribution window mismatch
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Conversion Event</th>
                <th className="py-3 px-4 text-right">CRM Truth</th>
                <th className="py-3 px-4 text-right">GA4 (Delta)</th>
                <th className="py-3 px-4 text-right">Google Ads (Delta)</th>
                <th className="py-3 px-4 text-right">Meta CAPI (Delta)</th>
                <th className="py-3 px-4">Root Cause Diagnosis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {discrepancies.map((row) => {
                const ga4Delta = ((row.ga4Count - row.crmTruth) / Math.max(1, row.crmTruth)) * 100;
                const gadsDelta =
                  ((row.googleAdsCount - row.crmTruth) / Math.max(1, row.crmTruth)) * 100;
                const metaDelta =
                  ((row.metaCapiCount - row.crmTruth) / Math.max(1, row.crmTruth)) * 100;

                const renderCell = (count: number, delta: number) => {
                  if (count === 0) {
                    return <span className="text-slate-400 dark:text-slate-500 font-mono">N/A</span>;
                  }
                  const abs = Math.abs(delta);
                  return (
                    <span className="font-mono tabular-nums">
                      <span className="text-slate-900 dark:text-slate-100">{count.toLocaleString()}</span>{' '}
                      <span
                        className={
                          abs <= 3
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : abs <= 10
                              ? 'text-amber-700 dark:text-amber-400 font-medium'
                              : 'text-red-600 dark:text-red-400 font-semibold'
                        }
                      >
                        ({delta >= 0 ? '+' : ''}
                        {delta.toFixed(1)}%)
                      </span>
                    </span>
                  );
                };

                return (
                  <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {row.eventName}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {row.crmTruth.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">{renderCell(row.ga4Count, ga4Delta)}</td>
                    <td className="py-3.5 px-4 text-right">
                      {renderCell(row.googleAdsCount, gadsDelta)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {renderCell(row.metaCapiCount, metaDelta)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 max-w-md">{row.probableCause}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two-Column Interactive Modeling & OCI Validator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Consent Mode v2 Impact Modeler */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Consent Mode v2 Impact Modeler
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Estimate conversion loss from CMP consent rejection and behavioral modeling recovery
            </p>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Monthly True Conversions</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {monthlyConv.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min={200}
                max={10000}
                step={50}
                value={monthlyConv}
                onChange={(e) => setMonthlyConv(Number(e.target.value))}
                className="w-full accent-orange-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-700 dark:text-slate-300 font-medium">EEA / UK Opt-In Regulated Traffic</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{eeaShare}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={eeaShare}
                onChange={(e) => setEeaShare(Number(e.target.value))}
                className="w-full accent-orange-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-700 dark:text-slate-300 font-medium">CMP Banner Rejection Rate</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{rejectionRate}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={80}
                value={rejectionRate}
                onChange={(e) => setRejectionRate(Number(e.target.value))}
                className="w-full accent-orange-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Consent Mode v2 Modeling Recovery
                </span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{modelingRecovery}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={75}
                value={modelingRecovery}
                onChange={(e) => setModelingRecovery(Number(e.target.value))}
                className="w-full accent-orange-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Stacked SVG Composition Bar */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Effective Capture Rate</span>
              <span className="text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {modelingStats.effectiveAccuracyPct}%
              </span>
            </div>

            <svg
              viewBox="0 0 400 28"
              className="w-full h-7 rounded-md overflow-hidden"
              role="img"
              aria-label="Consent Mode conversion breakdown"
            >
              <rect
                x="0"
                y="0"
                width={(modelingStats.observedTotal / Math.max(1, monthlyConv)) * 400}
                height="28"
                className="fill-slate-900 dark:fill-slate-200"
              />
              <rect
                x={(modelingStats.observedTotal / Math.max(1, monthlyConv)) * 400}
                y="0"
                width={(modelingStats.modeledRecovered / Math.max(1, monthlyConv)) * 400}
                height="28"
                className="fill-orange-600"
              />
              <rect
                x={
                  ((modelingStats.observedTotal + modelingStats.modeledRecovered) /
                    Math.max(1, monthlyConv)) *
                  400
                }
                y="0"
                width={(modelingStats.unrecoveredLoss / Math.max(1, monthlyConv)) * 400}
                height="28"
                className="fill-slate-200 dark:fill-slate-700"
              />
            </svg>

            <div className="grid grid-cols-3 gap-2 text-xs pt-1">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Observed</div>
                <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {modelingStats.observedTotal.toLocaleString()} ({pct(modelingStats.observedTotal, monthlyConv)}%)
                </div>
              </div>
              <div>
                <div className="text-orange-700 dark:text-orange-400">Modeled</div>
                <div className="font-mono font-semibold tabular-nums text-orange-700 dark:text-orange-400">
                  {modelingStats.modeledRecovered.toLocaleString()} ({pct(modelingStats.modeledRecovered, monthlyConv)}%)
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Unrecovered</div>
                <div className="font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {modelingStats.unrecoveredLoss.toLocaleString()} ({pct(modelingStats.unrecoveredLoss, monthlyConv)}%)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Offline Conversion Import (OCI) GCLID Validator */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Offline Conversion Import (OCI) GCLID Validator
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Detects malformed GCLID strings, suggests corrective formatting, and validates ISO-8601 timezone &amp; 90-day click windows
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
              {ociRows.filter((r) => !analyzeGclidFormat(r.gclid).formatValid).length} malformed GCLIDs
            </span>
          </div>

          {/* Real-Time Pre-Import GCLID Staging & Validation */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <form
              onSubmit={handleTestOciAdd}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
            >
              <div className="sm:col-span-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-slate-600 dark:text-slate-400 font-medium">
                    Pre-Import GCLID
                  </label>
                  <span
                    className={`text-[11px] font-medium ${
                      liveStagedValidation.gclidAnalysis.formatValid
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {liveStagedValidation.gclidAnalysis.formatValid
                      ? 'URL-Safe OK'
                      : `${liveStagedValidation.gclidAnalysis.encodingFlags[0] || 'Encoding Error'}`}
                  </span>
                </div>
                <input
                  type="text"
                  value={newGclid}
                  onChange={(e) => setNewGclid(e.target.value)}
                  placeholder="Paste raw GCLID before import..."
                  className={`w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border rounded-md focus:outline-none ${
                    liveStagedValidation.gclidAnalysis.formatValid
                      ? 'border-emerald-300 dark:border-emerald-800 focus:border-emerald-500'
                      : 'border-red-400 dark:border-red-700 focus:border-red-500'
                  }`}
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Conversion Time
                </label>
                <input
                  type="text"
                  value={newConvTime}
                  onChange={(e) => setNewConvTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Click Time
                </label>
                <input
                  type="text"
                  value={newClickTime}
                  onChange={(e) => setNewClickTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Curr
                </label>
                <input
                  type="text"
                  value={newCurr}
                  onChange={(e) => setNewCurr(e.target.value.toUpperCase())}
                  className="w-full px-2 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-1.5">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Import Row
                </button>
              </div>
            </form>

            {/* Real-Time Pre-Import Encoding Diagnostics Panel */}
            {!liveStagedValidation.valid && (
              <div className="p-3 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-md space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Real-Time Pre-Import Flag ({liveStagedValidation.errors.length}{' '}
                      {liveStagedValidation.errors.length === 1 ? 'issue' : 'issues'})
                    </span>
                  </div>
                  {liveStagedValidation.gclidAnalysis.encodingFlags.length > 0 && (
                    <span className="font-mono text-[11px] text-amber-700 dark:text-amber-400">
                      {liveStagedValidation.gclidAnalysis.encodingFlags.join(' · ')}
                    </span>
                  )}
                </div>

                {/* Character-Level Token Highlight Preview */}
                {liveStagedValidation.gclidAnalysis.segments.some((s) => s.flag === 'error') && (
                  <div className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] break-all">
                    <span className="text-slate-500 dark:text-slate-400 mr-2 select-none">
                      Offending tokens:
                    </span>
                    {liveStagedValidation.gclidAnalysis.segments.map((seg, idx) =>
                      seg.flag === 'error' ? (
                        <mark
                          key={idx}
                          title={seg.reason}
                          className="bg-red-200 dark:bg-red-900/80 text-red-900 dark:text-red-100 px-0.5 rounded font-bold underline decoration-red-600"
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={idx} className="text-slate-800 dark:text-slate-200">
                          {seg.text}
                        </span>
                      )
                    )}
                  </div>
                )}

                <ul className="space-y-0.5 text-[11px] text-red-600 dark:text-red-400">
                  {liveStagedValidation.errors.map((err, idx) => (
                    <li key={idx}>· {err}</li>
                  ))}
                </ul>

                {liveStagedValidation.gclidAnalysis.suggestedGclid ? (
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0 text-[11px]">
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        Normalized URL-Safe Output:{' '}
                      </span>
                      <code className="font-mono text-slate-900 dark:text-slate-100 break-all">
                        {liveStagedValidation.gclidAnalysis.suggestedGclid}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNewGclid(liveStagedValidation.gclidAnalysis.suggestedGclid!)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-orange-600 rounded hover:bg-orange-700 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Wrench className="w-3 h-3" />
                      Fix Before Import
                    </button>
                  </div>
                ) : (
                  liveStagedValidation.gclidAnalysis.remediationNote && (
                    <div className="pt-1 text-[11px] text-amber-800 dark:text-amber-300">
                      <span className="font-medium">Remediation: </span>
                      {liveStagedValidation.gclidAnalysis.remediationNote}
                    </div>
                  )
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Test encoding errors:</span>
              <button
                type="button"
                onClick={() => setNewGclid('Cj0KCQiA+8v2L9pXqZ/padTest== ')}
                className="px-2 py-0.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Base64 +/= &amp; Space
              </button>
              <button
                type="button"
                onClick={() => setNewGclid('Cj0KCQiA%2B8v2L9pXqZ%2FpctTest%3D%3D')}
                className="px-2 py-0.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Percent-Encoded (%2B/%2F)
              </button>
              <button
                type="button"
                onClick={() =>
                  setNewGclid('https://site.com/checkout?gclid=Cj0KCQiA8v2L9pXqZ_url01')
                }
                className="px-2 py-0.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                URL-Wrapped
              </button>
              <button
                type="button"
                onClick={() => setNewGclid('cj0kcqia8v2l9pxqz_lowercased01')}
                className="px-2 py-0.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Lowercased GCLID
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {ociRows.map((row) => {
              const res = validateOciRow(row);
              const { gclidAnalysis } = res;
              return (
                <div
                  key={row.id}
                  className={`p-4 text-xs space-y-2 ${
                    !gclidAnalysis.formatValid ? 'bg-red-50/30 dark:bg-red-950/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      {res.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                      )}
                      <span
                        className={`font-mono font-medium truncate ${
                          !gclidAnalysis.formatValid
                            ? 'bg-red-100/80 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 px-1.5 py-0.5 rounded'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                        title={row.gclid}
                      >
                        {row.gclid}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums shrink-0 text-slate-700 dark:text-slate-300">
                      <span>
                        {row.conversionValue} {row.currencyCode}
                      </span>
                      {res.daysSinceClick !== null && (
                        <span className="text-slate-500 dark:text-slate-400">{res.daysSinceClick}d lag</span>
                      )}
                      <span
                        className={`font-sans font-medium ${
                          res.valid ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {res.valid ? 'Ready for API Import' : 'Rejected'}
                      </span>
                    </div>
                  </div>

                  <div className="text-slate-500 dark:text-slate-400 font-mono pl-6">
                    {row.conversionName} · conv_time: {row.conversionTime}
                  </div>

                  {!gclidAnalysis.formatValid && (
                    <div className="ml-6 p-3 bg-white dark:bg-slate-950/80 border border-amber-200 dark:border-amber-900/60 rounded-md space-y-2">
                      {gclidAnalysis.suggestedGclid ? (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-amber-800 dark:text-amber-300">
                              Suggested Corrective Format:{' '}
                            </span>
                            <code className="font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 px-1.5 py-0.5 rounded break-all">
                              {gclidAnalysis.suggestedGclid}
                            </code>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateOciRow({
                                ...row,
                                gclid: gclidAnalysis.suggestedGclid!,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-orange-600 rounded hover:bg-orange-700 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <Wrench className="w-3 h-3" />
                            Apply Format Fix
                          </button>
                        </div>
                      ) : (
                        <div className="text-amber-800 dark:text-amber-300">
                          <span className="font-medium">Remediation: </span>
                          {gclidAnalysis.remediationNote}
                        </div>
                      )}
                    </div>
                  )}

                  {!res.valid && (
                    <ul className="pl-6 space-y-0.5 text-red-600 dark:text-red-400">
                      {res.errors.map((err, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
