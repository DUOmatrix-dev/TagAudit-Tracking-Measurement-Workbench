import {
  GtmAuditSummary,
  MeasurementWorkspace,
} from '../types/tracking';

export type AuditExportFormat = 'json' | 'csv';

export interface GeneratedAuditExport {
  format: AuditExportFormat;
  filename: string;
  mimeType: string;
  content: string;
  sizeBytes: number;
  sizeLabel: string;
  includedSections: string[];
  excludedNote: string;
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map(escapeCsvCell).join(',');
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatVariancePct(observed: number, truth: number): string {
  if (truth <= 0) return '0.0%';
  const delta = ((observed - truth) / truth) * 100;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

export function buildAuditReportExport(
  workspace: MeasurementWorkspace,
  gtmSummary: GtmAuditSummary,
  format: AuditExportFormat
): GeneratedAuditExport {
  const exportedAt = new Date().toISOString();
  const safeDomain = workspace.domain.replace(/[^a-z0-9.-]/gi, '-').toLowerCase();

  if (format === 'json') {
    const fullPayload = {
      exportedAt,
      exportType: 'full_configuration',
      workspace: {
        id: workspace.id,
        label: workspace.label,
        domain: workspace.domain,
        stackSummary: workspace.stackSummary,
        defaultTrafficSettings: workspace.defaultTrafficSettings,
      },
      gtmSummary,
      gtmContainer: workspace.gtmContainer,
      taxonomy: workspace.taxonomy,
      discrepancies: workspace.discrepancies,
      ociRows: workspace.ociRows,
    };

    const content = JSON.stringify(fullPayload, null, 2);
    const sizeBytes = new Blob([content]).size;

    return {
      format: 'json',
      filename: `${safeDomain}-full-audit-config.json`,
      mimeType: 'application/json',
      content,
      sizeBytes,
      sizeLabel: formatByteSize(sizeBytes),
      includedSections: [
        'Workspace & traffic modeling defaults',
        `Full GTM container JSON (${gtmSummary.totalTags} tags, ${gtmSummary.totalTriggers} triggers, ${gtmSummary.totalVariables} variables)`,
        `GTM audit findings (${gtmSummary.issues.length} checks)`,
        `GA4 measurement taxonomy (${workspace.taxonomy.length} events)`,
        `Platform discrepancy & OCI import rows (${workspace.ociRows.length} rows)`,
      ],
      excludedNote: 'Nothing excluded — contains full container JSON and raw parameter payloads for engineering handoff.',
    };
  }

  // Summarized CSV version suitable for stakeholders without raw payload data
  const criticalCount = gtmSummary.issues.filter((i) => i.severity === 'critical').length;
  const warningCount = gtmSummary.issues.filter((i) => i.severity === 'warning').length;

  const lines: string[] = [];

  lines.push(toCsvRow(['SECTION 1: EXECUTIVE AUDIT SUMMARY']));
  lines.push(
    toCsvRow([
      'Domain',
      'Workspace',
      'Measurement Stack',
      'GTM Container ID',
      'Container Name',
      'Reliability Score (%)',
      'Consent Mode v2 Coverage (%)',
      'Active Tags',
      'Paused Tags',
      'Critical Issues',
      'Warning Issues',
      'Estimated Load Overhead (ms)',
      'Exported At (UTC)',
    ])
  );
  lines.push(
    toCsvRow([
      workspace.domain,
      workspace.label,
      workspace.stackSummary,
      gtmSummary.containerPublicId,
      gtmSummary.containerName,
      gtmSummary.reliabilityPct.toFixed(1),
      gtmSummary.consentCoveragePct,
      gtmSummary.activeTags,
      gtmSummary.pausedTags,
      criticalCount,
      warningCount,
      gtmSummary.estimatedLoadOverheadMs,
      exportedAt,
    ])
  );

  lines.push('');
  lines.push(toCsvRow(['SECTION 2: GTM AUDIT FINDINGS SUMMARY']));
  lines.push(
    toCsvRow(['Severity', 'Domain Area', 'Finding Title', 'Affected Asset', 'Recommended Action', 'Auto-Patchable'])
  );
  for (const issue of gtmSummary.issues) {
    lines.push(
      toCsvRow([
        issue.severity.toUpperCase(),
        issue.category,
        issue.title,
        issue.affectedName || 'Container-Wide',
        issue.remediation,
        issue.patchable ? 'Yes' : 'Manual Review',
      ])
    );
  }

  lines.push('');
  lines.push(toCsvRow(['SECTION 3: GA4 MEASUREMENT PLAN SUMMARY']));
  lines.push(
    toCsvRow([
      'Event Name',
      'Funnel Stage',
      'Active Platforms',
      'Google Ads Role',
      'Attribution Model',
      'Enhanced Conversions',
      'Meta CAPI Dedup',
      'Monthly Volume',
      'Param Completeness',
      'Missing Parameters',
      'Notes',
    ])
  );
  for (const ev of workspace.taxonomy) {
    const missing = ev.requiredParams.filter((p) => !ev.presentParams.includes(p));
    const completenessPct =
      ev.requiredParams.length > 0
        ? Math.round((ev.presentParams.length / ev.requiredParams.length) * 100)
        : 100;
    lines.push(
      toCsvRow([
        ev.eventName,
        ev.funnelStage,
        ev.platforms.join(' | '),
        ev.googleAdsRole,
        ev.attributionModel,
        ev.enhancedConversions ? 'Enabled' : 'Disabled',
        ev.capiDedupEnabled ? 'Enabled' : 'Disabled',
        ev.monthlyVolume,
        `${completenessPct}%`,
        missing.length > 0 ? missing.join(' | ') : 'None',
        ev.notes,
      ])
    );
  }

  lines.push('');
  lines.push(toCsvRow(['SECTION 4: PLATFORM DISCREPANCY SUMMARY']));
  lines.push(
    toCsvRow([
      'Event Name',
      'CRM Truth',
      'GA4 Count',
      'GA4 vs CRM (%)',
      'Google Ads Count',
      'Google Ads vs CRM (%)',
      'Meta CAPI Count',
      'LinkedIn Count',
      'CRM Revenue',
      'GA4 Revenue',
      'Google Ads Revenue',
      'Probable Root Cause',
    ])
  );
  for (const row of workspace.discrepancies) {
    lines.push(
      toCsvRow([
        row.eventName,
        row.crmTruth,
        row.ga4Count,
        formatVariancePct(row.ga4Count, row.crmTruth),
        row.googleAdsCount,
        formatVariancePct(row.googleAdsCount, row.crmTruth),
        row.metaCapiCount,
        row.linkedInCount,
        row.crmRevenue,
        row.ga4Revenue,
        row.googleAdsRevenue,
        row.probableCause,
      ])
    );
  }

  const content = lines.join('\r\n');
  const sizeBytes = new Blob([content]).size;

  return {
    format: 'csv',
    filename: `${safeDomain}-stakeholder-audit-summary.csv`,
    mimeType: 'text/csv;charset=utf-8',
    content,
    sizeBytes,
    sizeLabel: formatByteSize(sizeBytes),
    includedSections: [
      'Executive KPI overview (reliability, consent coverage, load overhead)',
      `GTM findings summary (${gtmSummary.issues.length} action items without raw tag JSON)`,
      `Measurement plan table (${workspace.taxonomy.length} events with coverage %)`,
      `Platform discrepancy & revenue variance table (${workspace.discrepancies.length} rows)`,
    ],
    excludedNote:
      'Raw GTM container JSON, tag parameter trees, variable definitions, and raw GCLID/OCI rows are excluded for stakeholder readability.',
  };
}
