import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileCode2,
  FileJson,
  RefreshCw,
} from 'lucide-react';
import { TaxonomyEvent } from '../types/tracking';
import { scanTaxonomyAndGenerateContracts } from '../utils/taxonomyContractGenerator';

interface TaxonomyContractGeneratorProps {
  events: TaxonomyEvent[];
}

export const TaxonomyContractGenerator: React.FC<TaxonomyContractGeneratorProps> = ({
  events,
}) => {
  const [outputFormat, setOutputFormat] = useState<'typescript' | 'json-schema'>('typescript');
  const [strictMode, setStrictMode] = useState(true);
  const [includeTestHelpers, setIncludeTestHelpers] = useState(true);
  const [markMissingAsOptional, setMarkMissingAsOptional] = useState(false);
  const [scanNonce, setScanNonce] = useState(0);
  const [copied, setCopied] = useState(false);

  const scanResult = useMemo(
    () =>
      scanTaxonomyAndGenerateContracts(events, {
        strictMode,
        includeTestHelpers,
        markMissingAsOptional,
      }),
    [events, strictMode, includeTestHelpers, markMissingAsOptional, scanNonce]
  );

  const activeCode =
    outputFormat === 'typescript' ? scanResult.typescriptCode : scanResult.jsonSchemaCode;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const filename =
      outputFormat === 'typescript'
        ? 'datalayer-taxonomy.contract.ts'
        : 'datalayer-taxonomy.schema.json';
    const mime =
      outputFormat === 'typescript'
        ? 'text/typescript;charset=utf-8'
        : 'application/schema+json;charset=utf-8';
    const blob = new Blob([activeCode], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Scanner Header & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Automated DataLayer Contract &amp; Test Schema Scanner
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Scans the active DataLayer taxonomy to infer strict parameter types and output ready-to-use TypeScript interfaces or Draft 2020-12 JSON Schema for Playwright, Cypress, and Vitest assertions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setScanNonce((n) => n + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-scan Taxonomy
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Code'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {outputFormat === 'typescript' ? 'Download .ts' : 'Download .schema.json'}
            </button>
          </div>
        </div>

        {/* Scan Diagnostics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Events Scanned</span>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {scanResult.eventCount}
            </div>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Unique Parameters Typed</span>
            <div className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {scanResult.uniqueParamCount}
            </div>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Missing Required Params</span>
            <div
              className={`mt-0.5 text-lg font-semibold font-mono tabular-nums inline-flex items-center gap-1.5 ${
                scanResult.incompleteEvents.length > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {scanResult.incompleteEvents.length > 0 ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {scanResult.incompleteEvents.length} events
            </div>
          </div>
        </div>

        {/* Generator Format & Testing Options */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setOutputFormat('typescript')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                outputFormat === 'typescript'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              TypeScript Interfaces (.ts)
            </button>
            <button
              type="button"
              onClick={() => setOutputFormat('json-schema')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                outputFormat === 'json-schema'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <FileJson className="w-3.5 h-3.5" />
              JSON Schema (2020-12)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 dark:text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={strictMode}
                onChange={(e) => setStrictMode(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 text-orange-600 focus:ring-orange-500"
              />
              <span>Strict Unknown Keys</span>
            </label>
            {outputFormat === 'typescript' && (
              <>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTestHelpers}
                    onChange={(e) => setIncludeTestHelpers(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-orange-600 focus:ring-orange-500"
                  />
                  <span>Include Test Assertions</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markMissingAsOptional}
                    onChange={(e) => setMarkMissingAsOptional(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-orange-600 focus:ring-orange-500"
                  />
                  <span>Mark Missing Params Optional</span>
                </label>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Split: Generated Code + Scanned Parameter Type Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {outputFormat === 'typescript'
                ? 'datalayer-taxonomy.contract.ts'
                : 'datalayer-taxonomy.schema.json'}
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {activeCode.split('\n').length} lines
            </span>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto max-h-[540px] leading-relaxed">
            {activeCode}
          </pre>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Scanned Parameter Type Registry
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Inferred TypeScript &amp; JSON Schema constraints from taxonomy keys
            </p>
          </div>
          <div className="overflow-x-auto max-h-[540px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3.5">Key</th>
                  <th className="py-2.5 px-3.5">Type / Constraint</th>
                  <th className="py-2.5 px-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {scanResult.scannedParameters.map((param) => (
                  <tr
                    key={param.paramName}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-2.5 px-3.5 align-top">
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {param.paramName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {param.requiredInEvents.length} events
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 align-top">
                      <div className="font-mono text-orange-600 dark:text-orange-400">
                        {outputFormat === 'typescript' ? param.tsType : param.jsonSchemaType}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {param.description}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5 align-top text-right font-mono whitespace-nowrap">
                      {param.missingInEvents.length > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          {param.missingInEvents.length} missing
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          Verified
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
