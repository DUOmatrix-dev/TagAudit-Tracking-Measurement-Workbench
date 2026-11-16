import React, { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  GtmAuditSummary,
  MeasurementWorkspace,
  TaxonomyEvent,
} from '../types/tracking';

interface DataFlowDiagramProps {
  workspace: MeasurementWorkspace;
  gtmSummary: GtmAuditSummary;
  taxonomy: TaxonomyEvent[];
  isDark: boolean;
  onNavigate: (tab: 'overview' | 'gtm' | 'simulator' | 'taxonomy' | 'discrepancy' | 'consent') => void;
}

type NodeHealth = 'nominal' | 'warning' | 'critical';

interface PipelineNodeData extends Record<string, unknown> {
  layer: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
  health: NodeHealth;
  detail: string;
  targetTab: 'gtm' | 'simulator' | 'taxonomy' | 'discrepancy' | 'consent';
}

const PipelineNode: React.FC<NodeProps<Node<PipelineNodeData>>> = ({
  data,
  selected,
}) => {
  const statusColor =
    data.health === 'nominal'
      ? 'text-emerald-700 dark:text-emerald-400'
      : data.health === 'warning'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  const borderStyle = selected
    ? 'border-orange-600 ring-2 ring-orange-600/20'
    : data.health === 'critical'
      ? 'border-red-300 dark:border-red-800'
      : data.health === 'warning'
        ? 'border-amber-300 dark:border-amber-800'
        : 'border-slate-200 dark:border-slate-700';

  return (
    <div
      className={`w-60 bg-white dark:bg-slate-900 border rounded-lg p-3.5 shadow-xs transition-colors ${borderStyle}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-400 dark:!bg-slate-500 !border-white dark:!border-slate-900"
      />
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate font-medium">{data.layer}</span>
        <span className={`inline-flex items-center gap-1 font-medium shrink-0 ${statusColor}`}>
          {data.health === 'nominal' && <CheckCircle2 className="w-3 h-3" />}
          {data.health === 'warning' && <AlertTriangle className="w-3 h-3" />}
          {data.health === 'critical' && <XCircle className="w-3 h-3" />}
          {data.health === 'nominal'
            ? 'Nominal'
            : data.health === 'warning'
              ? 'Warning'
              : 'Fault'}
        </span>
      </div>

      <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
        {data.title}
      </div>
      <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
        {data.subtitle}
      </div>

      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
        <span className="text-slate-500 dark:text-slate-400 truncate">{data.metricLabel}</span>
        <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 shrink-0">
          {data.metricValue}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-orange-600 !border-white dark:!border-slate-900"
      />
    </div>
  );
};

const nodeTypes = {
  pipeline: PipelineNode,
};

export const DataFlowDiagram: React.FC<DataFlowDiagramProps> = ({
  workspace,
  gtmSummary,
  taxonomy,
  isDark,
  onNavigate,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'conversions'>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const cv = workspace.gtmContainer.containerVersion;
    const tags = cv.tag.filter((t) => !t.paused);

    // Detect sGTM server endpoint in container
    const sgtmParam = tags
      .flatMap((t) => t.parameter || [])
      .find((p) => p.key === 'serverContainerUrl');
    const hasSgtm = Boolean(sgtmParam?.value);

    // Detect legacy UA or duplicate purchase tags
    const hasDuplicateIssues = gtmSummary.issues.some(
      (i) => i.category === 'Deduplication' && i.severity === 'critical'
    );
    const hasConsentCritical = gtmSummary.issues.some(
      (i) => i.category === 'Consent Mode v2' && i.severity === 'critical'
    );
    const hasConsentWarning = gtmSummary.issues.some(
      (i) => i.category === 'Consent Mode v2' && i.severity === 'warning'
    );
    const hasEcWarning = gtmSummary.issues.some(
      (i) => i.category === 'Enhanced Conversions'
    );

    const primaryDisc = workspace.discrepancies[0];
    const ga4Delta = primaryDisc
      ? ((primaryDisc.ga4Count - primaryDisc.crmTruth) / Math.max(1, primaryDisc.crmTruth)) * 100
      : 0;
    const gadsDelta = primaryDisc
      ? ((primaryDisc.googleAdsCount - primaryDisc.crmTruth) / Math.max(1, primaryDisc.crmTruth)) *
        100
      : 0;
    const metaDelta = primaryDisc
      ? ((primaryDisc.metaCapiCount - primaryDisc.crmTruth) / Math.max(1, primaryDisc.crmTruth)) *
        100
      : 0;

    const displayedEvents =
      filterMode === 'conversions'
        ? taxonomy.filter(
            (e) => e.funnelStage === 'Conversion' || e.funnelStage === 'Offline CRM'
          )
        : taxonomy;

    const totalMonthlyEvents = displayedEvents.reduce((s, e) => s + e.monthlyVolume, 0);

    const hasMetaCapi = taxonomy.some((t) => t.platforms.includes('Meta CAPI'));
    const hasLinkedIn = taxonomy.some((t) => t.platforms.includes('LinkedIn'));
    const dedupEnabled = taxonomy.every((t) => !t.platforms.includes('Meta CAPI') || t.capiDedupEnabled);

    const builtNodes: Node<PipelineNodeData>[] = [
      // Column 1: Client-Side Sources
      {
        id: 'client-datalayer',
        type: 'pipeline',
        position: { x: 20, y: 20 },
        data: {
          layer: 'Client-Side Events',
          title: 'window.dataLayer',
          subtitle: displayedEvents.map((e) => e.eventName).slice(0, 3).join(', ') || 'No events',
          metricLabel: 'Monthly Events',
          metricValue: totalMonthlyEvents.toLocaleString(),
          health: displayedEvents.every(
            (e) => e.presentParams.length === e.requiredParams.length
          )
            ? 'nominal'
            : 'critical',
          detail: `${displayedEvents.length} events mapped from ${workspace.domain}. Click to edit required schema parameters.`,
          targetTab: 'taxonomy',
        },
      },
      {
        id: 'client-gtm',
        type: 'pipeline',
        position: { x: 20, y: 165 },
        data: {
          layer: 'Client-Side Tagging',
          title: 'Web GTM Container',
          subtitle: gtmSummary.containerPublicId,
          metricLabel: 'Active Tags',
          metricValue: `${gtmSummary.activeTags} (${gtmSummary.pausedTags} paused)`,
          health:
            gtmSummary.issues.some((i) => i.severity === 'critical')
              ? 'critical'
              : gtmSummary.issues.some((i) => i.severity === 'warning')
                ? 'warning'
                : 'nominal',
          detail: `Firing reliability ${gtmSummary.reliabilityPct}% with ~${gtmSummary.estimatedLoadOverheadMs}ms load budget.`,
          targetTab: 'gtm',
        },
      },
      {
        id: 'client-pixel',
        type: 'pipeline',
        position: { x: 20, y: 310 },
        data: {
          layer: 'Browser Pixels',
          title: hasLinkedIn ? 'Meta Pixel + LinkedIn' : 'Meta Browser Pixel',
          subtitle: dedupEnabled ? 'event_id bound to DLV' : 'Missing event_id param',
          metricLabel: 'Dedup Parity',
          metricValue: dedupEnabled ? '100%' : 'Unmatched',
          health: dedupEnabled && !hasDuplicateIssues ? 'nominal' : 'critical',
          detail: dedupEnabled
            ? 'Browser pixel dispatches matching event_id for server-side deduplication.'
            : 'Browser pixel lacks shared event_id, risking 2x conversion double-counting.',
          targetTab: 'simulator',
        },
      },

      // Column 2: Consent & Server-Side Tagging
      {
        id: 'consent-gate',
        type: 'pipeline',
        position: { x: 350, y: 75 },
        data: {
          layer: 'Privacy Compliance Gate',
          title: 'Consent Mode v2 / TCF',
          subtitle: 'ad_storage · analytics_storage',
          metricLabel: 'Tag Coverage',
          metricValue: `${gtmSummary.consentCoveragePct}%`,
          health: hasConsentCritical
            ? 'critical'
            : hasConsentWarning
              ? 'warning'
              : 'nominal',
          detail: `${gtmSummary.consentCoveredTags} of ${gtmSummary.activeTags} active tags enforce Consent Mode v2 checks.`,
          targetTab: 'consent',
        },
      },
      {
        id: 'server-sgtm',
        type: 'pipeline',
        position: { x: 350, y: 245 },
        data: {
          layer: 'Server-Side Tagging',
          title: hasSgtm ? 'Server-Side GTM (sGTM)' : 'Direct Client Routing',
          subtitle: hasSgtm
            ? String(sgtmParam?.value).replace('https://', '')
            : 'No sGTM endpoint configured',
          metricLabel: 'PII Enrichment',
          metricValue: hasEcWarning ? 'Partial' : 'SHA-256 Active',
          health: hasSgtm && !hasEcWarning ? 'nominal' : 'warning',
          detail: hasSgtm
            ? 'First-party server container enriches events with hashed user_data and forwards to GA4 & CAPI.'
            : 'Tags route directly from browser without first-party sGTM proxy, increasing ITP/ad-blocker loss.',
          targetTab: 'simulator',
        },
      },

      // Column 3: Destination Endpoints
      {
        id: 'dest-ga4',
        type: 'pipeline',
        position: { x: 680, y: 20 },
        data: {
          layer: 'Analytics Endpoint',
          title: 'GA4 Measurement API',
          subtitle: '/g/collect (v2)',
          metricLabel: 'vs CRM Truth',
          metricValue: `${ga4Delta >= 0 ? '+' : ''}${ga4Delta.toFixed(1)}%`,
          health:
            Math.abs(ga4Delta) <= 3
              ? 'nominal'
              : Math.abs(ga4Delta) <= 10
                ? 'warning'
                : 'critical',
          detail: primaryDisc?.probableCause || 'GA4 event stream active.',
          targetTab: 'discrepancy',
        },
      },
      {
        id: 'dest-gads',
        type: 'pipeline',
        position: { x: 680, y: 165 },
        data: {
          layer: 'Paid Search Endpoint',
          title: 'Google Ads Conversions',
          subtitle: hasEcWarning ? 'EC Incomplete / OCI' : 'Enhanced Conversions + OCI',
          metricLabel: 'vs CRM Truth',
          metricValue: `${gadsDelta >= 0 ? '+' : ''}${gadsDelta.toFixed(1)}%`,
          health:
            Math.abs(gadsDelta) <= 3 && !hasEcWarning
              ? 'nominal'
              : Math.abs(gadsDelta) <= 12
                ? 'warning'
                : 'critical',
          detail: 'Receives GCLID conversions, SHA-256 user_data, and offline CRM imports.',
          targetTab: 'discrepancy',
        },
      },
      {
        id: 'dest-meta',
        type: 'pipeline',
        position: { x: 680, y: 310 },
        data: {
          layer: 'Paid Social Endpoint',
          title: hasMetaCapi ? 'Meta Conversions API' : 'Meta Browser Only',
          subtitle: 'graph.facebook.com/v21.0/events',
          metricLabel: 'vs CRM Truth',
          metricValue: `${metaDelta >= 0 ? '+' : ''}${metaDelta.toFixed(1)}%`,
          health:
            Math.abs(metaDelta) <= 3 && dedupEnabled
              ? 'nominal'
              : Math.abs(metaDelta) <= 10
                ? 'warning'
                : 'critical',
          detail: dedupEnabled
            ? 'Server CAPI deduplicates against browser Pixel via shared event_id.'
            : 'CAPI and Pixel events lack matching event_id, causing over-reported conversions.',
          targetTab: 'simulator',
        },
      },
    ];

    const edgeColor = (health: NodeHealth) =>
      health === 'nominal' ? '#16A34A' : health === 'warning' ? '#D97706' : '#DC2626';

    const mkEdge = (
      id: string,
      source: string,
      target: string,
      label: string,
      health: NodeHealth
    ): Edge => ({
      id,
      source,
      target,
      label,
      animated: health === 'nominal',
      style: {
        stroke: edgeColor(health),
        strokeWidth: 1.75,
        strokeDasharray: health === 'nominal' ? undefined : '5,4',
      },
      labelStyle: {
        fill: isDark ? '#CBD5E1' : '#475569',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
      },
      labelBgStyle: {
        fill: isDark ? '#0F172A' : '#FFFFFF',
        fillOpacity: 0.92,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColor(health),
        width: 14,
        height: 14,
      },
    });

    const builtEdges: Edge[] = [
      mkEdge('e-dl-gtm', 'client-datalayer', 'client-gtm', 'push()', 'nominal'),
      mkEdge(
        'e-gtm-consent',
        'client-gtm',
        'consent-gate',
        'gcs / TCF',
        hasConsentCritical ? 'critical' : hasConsentWarning ? 'warning' : 'nominal'
      ),
      mkEdge(
        'e-consent-sgtm',
        'consent-gate',
        'server-sgtm',
        hasSgtm ? '1st-party' : 'direct',
        hasSgtm ? 'nominal' : 'warning'
      ),
      mkEdge(
        'e-pixel-sgtm',
        'client-pixel',
        'server-sgtm',
        dedupEnabled ? 'event_id' : 'no dedup',
        dedupEnabled ? 'nominal' : 'critical'
      ),
      mkEdge(
        'e-sgtm-ga4',
        'server-sgtm',
        'dest-ga4',
        'MP v2',
        Math.abs(ga4Delta) <= 3 ? 'nominal' : 'critical'
      ),
      mkEdge(
        'e-sgtm-gads',
        'server-sgtm',
        'dest-gads',
        'EC + GCLID',
        Math.abs(gadsDelta) <= 3 && !hasEcWarning ? 'nominal' : 'warning'
      ),
      mkEdge(
        'e-sgtm-meta',
        'server-sgtm',
        'dest-meta',
        dedupEnabled ? 'CAPI dedup' : '2x risk',
        Math.abs(metaDelta) <= 3 && dedupEnabled ? 'nominal' : 'critical'
      ),
    ];

    return { nodes: builtNodes, edges: builtEdges };
  }, [workspace, gtmSummary, taxonomy, filterMode, isDark]);

  const activeNode = nodes.find((n) => n.id === selectedNodeId) || null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Signal Architecture &amp; Endpoint Data Flow
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Client-side dataLayer &rarr; Consent Gate &amp; Server-Side GTM &rarr; Destination Endpoints (click any node to inspect)
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Full Pipeline
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('conversions')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'conversions'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Conversions Only
          </button>
        </div>
      </div>

      <div className="h-[430px] w-full bg-slate-50/70 dark:bg-slate-950/60">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.5}
          maxZoom={1.5}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={isDark ? '#1E293B' : '#CBD5E1'} gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {activeNode && (
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="min-w-0">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeNode.data.title}
            </span>
            <span className="mx-2 text-slate-300 dark:text-slate-700">·</span>
            <span className="text-slate-600 dark:text-slate-400">{activeNode.data.detail}</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(activeNode.data.targetTab)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Module
          </button>
        </div>
      )}
    </div>
  );
};
