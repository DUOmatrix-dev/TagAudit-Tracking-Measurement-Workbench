import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { GtmAuditSummary, MeasurementWorkspace } from '../types/tracking';
import {
  AuditExportFormat,
  buildAuditReportExport,
} from '../utils/auditExporter';

interface AuditExportModalProps {
  open: boolean;
  workspace: MeasurementWorkspace;
  gtmSummary: GtmAuditSummary;
  onClose: () => void;
}

export const AuditExportModal: React.FC<AuditExportModalProps> = ({
  open,
  workspace,
  gtmSummary,
  onClose,
}) => {
  const [format, setFormat] = useState<AuditExportFormat>('csv');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const exportArtifact = useMemo(
    () => buildAuditReportExport(workspace, gtmSummary, format),
    [workspace, gtmSummary, format]
  );

  const previewText = useMemo(() => {
    const lines = exportArtifact.content.split(/\r?\n/);
    if (lines.length <= 26) return exportArtifact.content;
    return `${lines.slice(0, 26).join('\n')}\n... (${lines.length - 26} more lines)`;
  }, [exportArtifact.content]);

  if (!open) return null;

  const handleDownload = () => {
    const blob = new Blob([exportArtifact.content], {
      type: exportArtifact.mimeType,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportArtifact.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportArtifact.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission restrictions
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 dark:bg-slate-950/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-audit-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-full max-w-3xl shadow-xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2
              id="export-audit-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Export Audit Report
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span>{workspace.domain}</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span className="font-mono">{gtmSummary.containerPublicId}</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span>Choose stakeholder summary or full engineering payload</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Toggle + Scope Breakdown */}
        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div
              role="radiogroup"
              aria-label="Audit export format"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start"
            >
              <button
                type="button"
                role="radio"
                aria-checked={format === 'csv'}
                onClick={() => {
                  setFormat('csv');
                  setCopied(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  format === 'csv'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                Summarized CSV (Stakeholders)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={format === 'json'}
                onClick={() => {
                  setFormat('json');
                  setCopied(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  format === 'json'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <FileJson className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                Full JSON Configuration
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>{exportArtifact.filename}</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span>{exportArtifact.sizeLabel}</span>
            </div>
          </div>

          {/* Scope Summary Grid (Hairline separated, zero nested cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Included in {format === 'csv' ? 'Stakeholder CSV' : 'Full JSON'} Export
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                {exportArtifact.includedSections.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold" aria-hidden="true">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Payload Scope &amp; Audience
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {exportArtifact.excludedNote}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Audience:{' '}
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {format === 'csv'
                    ? 'Marketing Leads, Analytics Stakeholders, Client Reporting (Excel / Sheets)'
                    : 'Tracking Engineers, GTM Administrators, CI/CD Container Backups'}
                </span>
              </p>
            </div>
          </div>

          {/* Output Preview */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Live Output Preview
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {format === 'csv' ? 'RFC-4180 CSV' : 'application/json'}
              </span>
            </div>
            <pre className="p-3.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed">
              {previewText}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Copied {format.toUpperCase()}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy {format.toUpperCase()}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-orange-600 rounded-lg hover:bg-slate-800 dark:hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download {format === 'csv' ? 'Stakeholder CSV' : 'Full JSON'}
          </button>
        </div>
      </div>
    </div>
  );
};
