import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  Workflow,
  XCircle,
} from 'lucide-react';
import {
  GtmAuditSummary,
  MeasurementWorkspace,
  TaxonomyEvent,
} from '../types/tracking';
import { DataFlowDiagram } from './DataFlowDiagram';
import { AttributionInsights } from './AttributionInsights';
import { PlatformUpdatesPanel } from './PlatformUpdatesPanel';
import { LinkAnalyzer } from './LinkAnalyzer';

interface OverviewAuditProps {
  workspace: MeasurementWorkspace;
  gtmSummary: GtmAuditSummary;
  taxonomy: TaxonomyEvent[];
  isDark: boolean;
  onNavigate: (tab: 'overview' | 'gtm' | 'simulator' | 'taxonomy' | 'discrepancy' | 'consent') => void;
  onPatchGtm: () => void;
}

export const OverviewAudit: React.FC<OverviewAuditProps> = ({
  workspace,
  gtmSummary,
  taxonomy,
  isDark,
  onNavigate,
  onPatchGtm,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'data-flow'>('overview');
  const primaryDiscrepancy = workspace.discrepancies[0];
  const maxDeltaPct = primaryDiscrepancy
    ? Math.max(
        Math.abs(
          ((primaryDiscrepancy.ga4Count - primaryDiscrepancy.crmTruth) /
            Math.max(1, primaryDiscrepancy.crmTruth)) *
            100
        ),
        Math.abs(
          ((primaryDiscrepancy.googleAdsCount - primaryDiscrepancy.crmTruth) /
            Math.max(1, primaryDiscrepancy.crmTruth)) *
            100
        )
      )
    : 0;

  const avgDataCompleteness =
    taxonomy.length > 0
      ? Math.round(
          (taxonomy.reduce(
            (acc, ev) => acc + ev.presentParams.length / Math.max(1, ev.requiredParams.length),
            0
          ) /
            taxonomy.length) *
            100
        )
      : 100;

  const dedupCoveredCount = taxonomy.filter((t) => t.capiDedupEnabled).length;
  const dedupRatePct =
    taxonomy.length > 0 ? Math.round((dedupCoveredCount / taxonomy.length) * 100) : 100;

  const criticalIssues = gtmSummary.issues.filter((i) => i.severity === 'critical');
  const warningIssues = gtmSummary.issues.filter((i) => i.severity === 'warning');
  const patchableCount = gtmSummary.issues.filter((i) => i.patchable).length;

  return (
    <div className="space-y-6">
      {/* Workspace context strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Measurement Health Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {workspace.domain}
            <span className="mx-2 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
              {gtmSummary.containerPublicId}
            </span>
            <span className="mx-2 text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span>{workspace.stackSummary}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {patchableCount > 0 && (
            <button
              type="button"
              onClick={onPatchGtm}
              className="px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Auto-Patch {patchableCount} Container {patchableCount === 1 ? 'Issue' : 'Issues'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('simulator')}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Test Event Stream
          </button>
        </div>
      </div>

      {/* Section Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer -mb-px ${
            activeTab === 'overview'
              ? 'border-orange-600 text-orange-600 dark:text-orange-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Audit Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('data-flow')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer -mb-px ${
            activeTab === 'data-flow'
              ? 'border-orange-600 text-orange-600 dark:text-orange-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Workflow className="w-3.5 h-3.5" />
          Data Flow
        </button>
      </div>

      {activeTab === 'data-flow' ? (
        <DataFlowDiagram
          workspace={workspace}
          gtmSummary={gtmSummary}
          taxonomy={taxonomy}
          isDark={isDark}
          onNavigate={onNavigate}
        />
      ) : (
        <>
          {/* 4-Column KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Platform Discrepancy</span>
            <span>Target &lt;3.0%</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {maxDeltaPct.toFixed(1)}%
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                maxDeltaPct <= 3
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : maxDeltaPct <= 10
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {maxDeltaPct <= 3 ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5" />
              )}
              {maxDeltaPct <= 3 ? 'Within Target' : 'Exceeds Threshold'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Max variance vs CRM order truth
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Tag Firing Reliability</span>
            <span>Target 99.5%</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {gtmSummary.reliabilityPct.toFixed(1)}%
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                gtmSummary.reliabilityPct >= 99
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : gtmSummary.reliabilityPct >= 93
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {gtmSummary.reliabilityPct >= 99 ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5" />
              )}
              {gtmSummary.activeTags} active tags
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            ~{gtmSummary.estimatedLoadOverheadMs}ms estimated load budget
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Consent Mode v2 Coverage</span>
            <span>Target 100%</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {gtmSummary.consentCoveragePct}%
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                gtmSummary.consentCoveragePct === 100
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : gtmSummary.consentCoveragePct >= 75
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {gtmSummary.consentCoveragePct === 100 ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              {gtmSummary.consentCoveredTags}/{gtmSummary.activeTags} gated
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            ad_storage, analytics_storage, ad_user_data
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Parameter &amp; Dedup Parity</span>
            <span>Target 95%+</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {avgDataCompleteness}%
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                avgDataCompleteness >= 95 && dedupRatePct === 100
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {dedupRatePct}% event_id parity
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {taxonomy.length} tracked events across funnel
          </p>
        </div>
      </div>

      {/* Link & Page Tracking Analyzer */}
      <LinkAnalyzer />

      {/* Attribution Insights User Conversion Path Heatmap (Recharts) */}
      <AttributionInsights workspace={workspace} isDark={isDark} />

      {/* Grounded GTM & GA4 Documentation Updates */}
      <PlatformUpdatesPanel />

      {/* Main Two-Column Triage Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Diagnostic Findings Table */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Active Container &amp; Signal Diagnostics
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {criticalIssues.length} critical · {warningIssues.length} warnings · Audited from parsed GTM container
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('gtm')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open GTM Auditor
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {gtmSummary.issues.map((issue) => (
              <div key={issue.id} className="px-5 py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
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
                            : 'Passing'}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                      <span className="text-slate-600 dark:text-slate-400">{issue.category}</span>
                      {issue.affectedId && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            Tag #{issue.affectedId}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {issue.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {issue.detail}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-medium text-slate-900 dark:text-slate-100">Fix: </span>
                      {issue.remediation}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('gtm')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Platform Reconciliation Snapshot */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Conversion Count Parity
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                CRM backend vs ad platforms
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('discrepancy')}
              className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reconcile
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {workspace.discrepancies.map((row) => {
              const ga4Delta = ((row.ga4Count - row.crmTruth) / Math.max(1, row.crmTruth)) * 100;
              const gadsDelta =
                ((row.googleAdsCount - row.crmTruth) / Math.max(1, row.crmTruth)) * 100;
              const metaDelta =
                ((row.metaCapiCount - row.crmTruth) / Math.max(1, row.crmTruth)) * 100;

              return (
                <div key={row.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {row.eventName}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      CRM: {row.crmTruth.toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">GA4</span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {row.ga4Count.toLocaleString()}{' '}
                        <span
                          className={
                            Math.abs(ga4Delta) <= 3
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400 font-medium'
                          }
                        >
                          ({ga4Delta >= 0 ? '+' : ''}
                          {ga4Delta.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Google Ads</span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {row.googleAdsCount.toLocaleString()}{' '}
                        <span
                          className={
                            Math.abs(gadsDelta) <= 3
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400 font-medium'
                          }
                        >
                          ({gadsDelta >= 0 ? '+' : ''}
                          {gadsDelta.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Meta CAPI</span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {row.metaCapiCount.toLocaleString()}{' '}
                        <span
                          className={
                            Math.abs(metaDelta) <= 3
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400 font-medium'
                          }
                        >
                          ({metaDelta >= 0 ? '+' : ''}
                          {metaDelta.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 leading-relaxed">
                    {row.probableCause}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
