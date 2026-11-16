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
  ArrowRight,
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

type NodeHealth = 'nominal' | 'warning' | 'critical' | 'inactive';

interface PipelineNodeData extends Record<string, unknown> {
  step: string;
  layer: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
  health: NodeHealth;
  detail: string;
  payloadPreview: string;
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
        : data.health === 'critical'
          ? 'text-red-600 dark:text-red-400'
          : 'text-slate-400 dark:text-slate-500';

  const borderStyle = selected
    ? 'border-orange-600 ring-2 ring-orange-600/20'
    : data.health === 'critical'
      ? 'border-red-300 dark:border-red-800'
      : data.health === 'warning'
        ? 'border-amber-300 dark:border-amber-800'
        : data.health === 'inactive'
          ? 'border-slate-200 dark:border-slate-800 opacity-65'
          : 'border-slate-200 dark:border-slate-700';

  return (
    <div
      className={`w-60 bg-white dark:bg-slate-900 border rounded-lg p-3.5 transition-colors ${borderStyle}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-400 dark:!bg-slate-500 !border-white dark:!border-slate-900"
      />
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate font-medium">
          <span className="font-mono text-slate-400 dark:text-slate-500 mr-1">{data.step}</span>
          {data.layer}
        </span>
        <span className={`inline-flex items-center gap-1 font-medium shrink-0 ${statusColor}`}>
          {data.health === 'nominal' && <CheckCircle2 className="w-3 h-3" />}
          {data.health === 'warning' && <AlertTriangle className="w-3 h-3" />}
          {data.health === 'critical' && <XCircle className="w-3 h-3" />}
          {data.health === 'nominal'
            ? 'Nominal'
            : data.health === 'warning'
              ? 'Warning'
              : data.health === 'critical'
                ? 'Fault'
                : 'Unmapped'}
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

function buildStagePayloads(
  event: TaxonomyEvent,
  gtmSummary: GtmAuditSummary,
  sgtmEndpoint: string | undefined,
  hasMetaCapi: boolean,
  hasGa4: boolean,
  hasGads: boolean
) {
  const missingParams = event.requiredParams.filter((p) => !event.presentParams.includes(p));
  const sampleEventId = `evt_${event.eventName}_9f42a8c1`;

  const browserPayload = JSON.stringify(
    {
      event: event.eventName,
      event_id: sampleEventId,
      ...(event.presentParams.includes('transaction_id') ? { transaction_id: 'ORD-88412' } : {}),
      ...(event.presentParams.includes('value') ? { value: 184.5 } : {}),
      ...(event.presentParams.includes('currency') ? { currency: 'USD' } : {}),
      ...(event.presentParams.includes('items') ? { items: [{ item_id: 'SKU-402', price: 184.5 }] } : {}),
      ...(missingParams.length > 0 ? { _missing_required: missingParams } : {}),
    },
    null,
    2
  );

  const pixelPayload = JSON.stringify(
    {
      channel: 'Meta Browser Pixel (fbq)',
      event_name: event.eventName === 'purchase' ? 'Purchase' : event.eventName === 'generate_lead' ? 'Lead' : event.eventName,
      eventID: event.capiDedupEnabled ? sampleEventId : 'OMITTED (dedup broken)',
      _fbp: 'fb.1.1731740112.904128391',
      status: hasMetaCapi ? (event.capiDedupEnabled ? 'Deduplicated with CAPI' : 'Double-count risk') : 'Not mapped for this event',
    },
    null,
    2
  );

  const gtmPayload = JSON.stringify(
    {
      container: gtmSummary.containerPublicId,
      trigger_event: event.eventName,
      active_tags: gtmSummary.activeTags,
      reliability_pct: gtmSummary.reliabilityPct,
      load_overhead_ms: gtmSummary.estimatedLoadOverheadMs,
      event_id_variable: event.capiDedupEnabled ? '{{DLV - event_id}}' : 'undefined',
    },
    null,
    2
  );

  const consentPayload = JSON.stringify(
    {
      consent_mode: 'v2',
      gcs: gtmSummary.consentCoveragePct === 100 ? 'G111' : 'G101 (partial gating)',
      signals: {
        ad_storage: 'granted',
        analytics_storage: 'granted',
        ad_user_data: event.enhancedConversions ? 'granted' : 'denied',
        ad_personalization: 'granted',
      },
      covered_tags: `${gtmSummary.consentCoveredTags}/${gtmSummary.activeTags}`,
    },
    null,
    2
  );

  const sgtmPayload = JSON.stringify(
    {
      endpoint: sgtmEndpoint || 'Direct browser dispatch (no sGTM proxy)',
      client_claimed: 'GA4 Web Client -> sGTM',
      event_name: event.eventName,
      event_id: sampleEventId,
      user_data_sha256: event.enhancedConversions
        ? { em: '4b227777d4dd1fc61c6f884f48641d02...', ph: 'e3b0c44298fc1c149afbf4c8996fb924...' }
        : 'Not enriched',
      forwarded_destinations: [
        ...(hasGa4 ? ['GA4 Measurement API'] : []),
        ...(hasMetaCapi ? ['Meta Conversions API'] : []),
        ...(hasGads ? ['Google Ads Conversions'] : []),
      ],
    },
    null,
    2
  );

  const ga4Payload = JSON.stringify(
    {
      endpoint: `${sgtmEndpoint ? sgtmEndpoint : 'https://www.google-analytics.com'}/g/collect?v=2`,
      en: event.eventName,
      mapped: hasGa4,
      ep_event_id: sampleEventId,
      ...(event.presentParams.includes('transaction_id') ? { 'ep.transaction_id': 'ORD-88412' } : {}),
      ...(event.presentParams.includes('value') ? { 'epn.value': 184.5, cu: 'USD' } : {}),
    },
    null,
    2
  );

  const metaCapiPayload = JSON.stringify(
    {
      endpoint: 'https://graph.facebook.com/v21.0/{pixel_id}/events',
      mapped: hasMetaCapi,
      data: [
        {
          event_name: event.eventName === 'purchase' ? 'Purchase' : event.eventName === 'generate_lead' ? 'Lead' : event.eventName,
          action_source: 'website',
          event_id: event.capiDedupEnabled ? sampleEventId : 'MISSING',
          user_data: {
            em: event.enhancedConversions ? ['4b227777d4dd1fc6...'] : [],
            fbp: 'fb.1.1731740112.904128391',
            fbc: 'fb.1.1731740112.IwAR3x...',
          },
          custom_data: {
            currency: 'USD',
            value: 184.5,
          },
        },
      ],
    },
    null,
    2
  );

  const gadsPayload = JSON.stringify(
    {
      conversion_role: event.googleAdsRole,
      attribution_model: event.attributionModel,
      mapped: hasGads,
      gclid: 'Cj0KCQiA... (validated)',
      enhanced_conversions: event.enhancedConversions ? 'sha256_email_and_phone' : 'disabled',
      conversion_value: 184.5,
      currency_code: 'USD',
    },
    null,
    2
  );

  return {
    browserPayload,
    pixelPayload,
    gtmPayload,
    consentPayload,
    sgtmPayload,
    ga4Payload,
    metaCapiPayload,
    gadsPayload,
  };
}

export const DataFlowDiagram: React.FC<DataFlowDiagramProps> = ({
  workspace,
  gtmSummary,
  taxonomy,
  isDark,
  onNavigate,
}) => {
  const orderedEvents = useMemo(() => {
    const priority = (e: TaxonomyEvent) =>
      e.funnelStage === 'Conversion' ? 0 : e.funnelStage === 'Offline CRM' ? 1 : 2;
    return [...taxonomy].sort((a, b) => priority(a) - priority(b));
  }, [taxonomy]);

  const [selectedEventId, setSelectedEventId] = useState<string>(
    () => orderedEvents[0]?.id ?? ''
  );
  const [viewMode, setViewMode] = useState<'conversion-path' | 'all-destinations'>('conversion-path');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('server-sgtm');

  const selectedEvent = useMemo(
    () =>
      orderedEvents.find((e) => e.id === selectedEventId) ??
      orderedEvents[0] ?? {
        id: 'fallback',
        eventName: 'purchase',
        funnelStage: 'Conversion' as const,
        platforms: ['GA4', 'Google Ads', 'Meta CAPI'] as TaxonomyEvent['platforms'],
        googleAdsRole: 'Primary' as const,
        attributionModel: 'Data-Driven' as const,
        enhancedConversions: true,
        capiDedupEnabled: true,
        requiredParams: ['transaction_id', 'value', 'currency'],
        presentParams: ['transaction_id', 'value', 'currency'],
        monthlyVolume: 0,
        notes: '',
      },
    [orderedEvents, selectedEventId]
  );

  const { nodes, edges } = useMemo(() => {
    const cv = workspace.gtmContainer.containerVersion;
    const tags = cv.tag.filter((t) => !t.paused);

    const sgtmParam = tags
      .flatMap((t) => t.parameter || [])
      .find((p) => p.key === 'serverContainerUrl');
    const sgtmUrl = sgtmParam?.value ? String(sgtmParam.value) : undefined;
    const hasSgtm = Boolean(sgtmUrl);

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

    const matchingDiscrepancy =
      workspace.discrepancies.find((d) => d.eventName === selectedEvent.eventName) ||
      workspace.discrepancies[0];

    const ga4Delta = matchingDiscrepancy
      ? ((matchingDiscrepancy.ga4Count - matchingDiscrepancy.crmTruth) /
          Math.max(1, matchingDiscrepancy.crmTruth)) *
        100
      : 0;
    const gadsDelta = matchingDiscrepancy
      ? ((matchingDiscrepancy.googleAdsCount - matchingDiscrepancy.crmTruth) /
          Math.max(1, matchingDiscrepancy.crmTruth)) *
        100
      : 0;
    const metaDelta = matchingDiscrepancy
      ? ((matchingDiscrepancy.metaCapiCount - matchingDiscrepancy.crmTruth) /
          Math.max(1, matchingDiscrepancy.crmTruth)) *
        100
      : 0;

    const missingParams = selectedEvent.requiredParams.filter(
      (p) => !selectedEvent.presentParams.includes(p)
    );
    const eventParamComplete = missingParams.length === 0;

    const hasGa4 = selectedEvent.platforms.includes('GA4');
    const hasMetaCapi = selectedEvent.platforms.includes('Meta CAPI');
    const hasGads = selectedEvent.platforms.includes('Google Ads');
    const hasLinkedIn = selectedEvent.platforms.includes('LinkedIn');
    const dedupOk = !hasMetaCapi || (selectedEvent.capiDedupEnabled && !hasDuplicateIssues);

    const payloads = buildStagePayloads(
      selectedEvent,
      gtmSummary,
      sgtmUrl,
      hasMetaCapi,
      hasGa4,
      hasGads
    );

    const showNode = (mapped: boolean) => viewMode === 'all-destinations' || mapped;

    const builtNodes: Node<PipelineNodeData>[] = [
      // Stage 1: Browser
      {
        id: 'browser-datalayer',
        type: 'pipeline',
        position: { x: 20, y: 40 },
        data: {
          step: '01',
          layer: 'Browser Event',
          title: 'window.dataLayer',
          subtitle: `event: "${selectedEvent.eventName}"`,
          metricLabel: 'Schema Params',
          metricValue: `${selectedEvent.presentParams.length}/${selectedEvent.requiredParams.length} present`,
          health: eventParamComplete ? 'nominal' : 'critical',
          detail: eventParamComplete
            ? `${selectedEvent.eventName} dispatches all ${selectedEvent.requiredParams.length} required parameters (${selectedEvent.monthlyVolume.toLocaleString()} monthly events).`
            : `Missing required parameters on ${selectedEvent.eventName}: ${missingParams.join(', ')}.`,
          payloadPreview: payloads.browserPayload,
          targetTab: 'taxonomy',
        },
      },
      ...(showNode(hasMetaCapi || hasLinkedIn)
        ? [
            {
              id: 'browser-pixel',
              type: 'pipeline' as const,
              position: { x: 20, y: 245 },
              data: {
                step: '01b',
                layer: 'Browser Beacon',
                title: hasLinkedIn ? 'Meta Pixel + LinkedIn' : 'Meta Browser Pixel',
                subtitle: selectedEvent.capiDedupEnabled
                  ? 'eventID bound for dedup'
                  : 'Missing event_id binding',
                metricLabel: 'Dedup Parity',
                metricValue: !hasMetaCapi
                  ? 'Not mapped'
                  : dedupOk
                    ? '100% Matched'
                    : 'Unmatched',
                health: !hasMetaCapi
                  ? ('inactive' as const)
                  : dedupOk
                    ? ('nominal' as const)
                    : ('critical' as const),
                detail: !hasMetaCapi
                  ? `${selectedEvent.eventName} does not target Meta CAPI in the current measurement plan.`
                  : dedupOk
                    ? 'Browser pixel attaches the exact same event_id forwarded to sGTM for Meta CAPI deduplication.'
                    : 'Browser pixel lacks shared event_id, causing duplicate conversion reporting in Meta Ads Manager.',
                payloadPreview: payloads.pixelPayload,
                targetTab: 'simulator' as const,
              },
            },
          ]
        : []),

      // Stage 2: Web GTM & Consent Gate
      {
        id: 'web-gtm',
        type: 'pipeline',
        position: { x: 320, y: 40 },
        data: {
          step: '02',
          layer: 'Web Tagging',
          title: 'Web GTM Container',
          subtitle: gtmSummary.containerPublicId,
          metricLabel: 'Tag Reliability',
          metricValue: `${gtmSummary.reliabilityPct.toFixed(1)}%`,
          health: gtmSummary.issues.some((i) => i.severity === 'critical')
            ? 'critical'
            : gtmSummary.issues.some((i) => i.severity === 'warning')
              ? 'warning'
              : 'nominal',
          detail: `${gtmSummary.activeTags} active tags (${gtmSummary.pausedTags} paused) with ~${gtmSummary.estimatedLoadOverheadMs}ms load budget.`,
          payloadPreview: payloads.gtmPayload,
          targetTab: 'gtm',
        },
      },
      {
        id: 'consent-gate',
        type: 'pipeline',
        position: { x: 320, y: 245 },
        data: {
          step: '02b',
          layer: 'Privacy Gate',
          title: 'Consent Mode v2',
          subtitle: 'ad_storage · analytics_storage',
          metricLabel: 'Tag Coverage',
          metricValue: `${gtmSummary.consentCoveragePct}%`,
          health: hasConsentCritical
            ? 'critical'
            : hasConsentWarning
              ? 'warning'
              : 'nominal',
          detail: `${gtmSummary.consentCoveredTags} of ${gtmSummary.activeTags} active tags enforce Consent Mode v2 signals before dispatch.`,
          payloadPreview: payloads.consentPayload,
          targetTab: 'consent',
        },
      },

      // Stage 3: Server-Side Container
      {
        id: 'server-sgtm',
        type: 'pipeline',
        position: { x: 625, y: 142 },
        data: {
          step: '03',
          layer: 'Server Container',
          title: hasSgtm ? 'Server-Side GTM (sGTM)' : 'Direct Browser Routing',
          subtitle: sgtmUrl ? sgtmUrl.replace('https://', '') : 'No sGTM serverContainerUrl',
          metricLabel: 'PII / Dedup',
          metricValue:
            selectedEvent.enhancedConversions && !hasEcWarning
              ? 'SHA-256 Active'
              : 'Partial / Raw',
          health: hasSgtm && !hasEcWarning && selectedEvent.enhancedConversions ? 'nominal' : 'warning',
          detail: hasSgtm
            ? `First-party sGTM container claims ${selectedEvent.eventName}, hashes PII (SHA-256), preserves event_id, and fans out to ad endpoints.`
            : 'No first-party sGTM endpoint configured. Signals route directly from browser, increasing ITP & ad-blocker loss.',
          payloadPreview: payloads.sgtmPayload,
          targetTab: 'simulator',
        },
      },

      // Stage 4: Destinations
      ...(showNode(hasGa4)
        ? [
            {
              id: 'dest-ga4',
              type: 'pipeline' as const,
              position: { x: 930, y: 20 },
              data: {
                step: '04',
                layer: 'Analytics Destination',
                title: 'GA4 Measurement API',
                subtitle: '/g/collect (v2)',
                metricLabel: 'vs CRM Truth',
                metricValue: hasGa4 ? `${ga4Delta >= 0 ? '+' : ''}${ga4Delta.toFixed(1)}%` : 'Unmapped',
                health: !hasGa4
                  ? ('inactive' as const)
                  : Math.abs(ga4Delta) <= 3
                    ? ('nominal' as const)
                    : Math.abs(ga4Delta) <= 10
                      ? ('warning' as const)
                      : ('critical' as const),
                detail: hasGa4
                  ? matchingDiscrepancy?.probableCause || 'GA4 receives server-enriched Measurement Protocol v2 events.'
                  : `${selectedEvent.eventName} is not routed to GA4 in the taxonomy.`,
                payloadPreview: payloads.ga4Payload,
                targetTab: 'discrepancy' as const,
              },
            },
          ]
        : []),
      ...(showNode(hasMetaCapi)
        ? [
            {
              id: 'dest-meta',
              type: 'pipeline' as const,
              position: { x: 930, y: 160 },
              data: {
                step: '04',
                layer: 'Social CAPI Destination',
                title: 'Meta Conversions API',
                subtitle: 'graph.facebook.com/v21.0/events',
                metricLabel: 'vs CRM Truth',
                metricValue: hasMetaCapi ? `${metaDelta >= 0 ? '+' : ''}${metaDelta.toFixed(1)}%` : 'Unmapped',
                health: !hasMetaCapi
                  ? ('inactive' as const)
                  : Math.abs(metaDelta) <= 3 && dedupOk
                    ? ('nominal' as const)
                    : Math.abs(metaDelta) <= 10 && dedupOk
                      ? ('warning' as const)
                      : ('critical' as const),
                detail: !hasMetaCapi
                  ? `${selectedEvent.eventName} is not mapped to Meta Conversions API.`
                  : dedupOk
                    ? 'Meta CAPI receives server payload and deduplicates against Browser Pixel via shared event_id.'
                    : 'Meta CAPI lacks synchronized event_id with Browser Pixel, creating 2x conversion inflation.',
                payloadPreview: payloads.metaCapiPayload,
                targetTab: 'simulator' as const,
              },
            },
          ]
        : []),
      ...(showNode(hasGads)
        ? [
            {
              id: 'dest-gads',
              type: 'pipeline' as const,
              position: { x: 930, y: 300 },
              data: {
                step: '04',
                layer: 'Paid Search Destination',
                title: 'Google Ads Conversions',
                subtitle: hasEcWarning ? 'EC Incomplete / OCI' : 'Enhanced Conversions + OCI',
                metricLabel: 'vs CRM Truth',
                metricValue: hasGads ? `${gadsDelta >= 0 ? '+' : ''}${gadsDelta.toFixed(1)}%` : 'Unmapped',
                health: !hasGads
                  ? ('inactive' as const)
                  : Math.abs(gadsDelta) <= 3 && !hasEcWarning && selectedEvent.enhancedConversions
                    ? ('nominal' as const)
                    : Math.abs(gadsDelta) <= 12
                      ? ('warning' as const)
                      : ('critical' as const),
                detail: hasGads
                  ? `Tracked as ${selectedEvent.googleAdsRole} (${selectedEvent.attributionModel}) with GCLID + offline CRM reconciliation.`
                  : `${selectedEvent.eventName} is not configured as a Google Ads conversion action.`,
                payloadPreview: payloads.gadsPayload,
                targetTab: 'discrepancy' as const,
              },
            },
          ]
        : []),
    ];

    const edgeColor = (health: NodeHealth) =>
      health === 'nominal'
        ? '#16A34A'
        : health === 'warning'
          ? '#D97706'
          : health === 'critical'
            ? '#DC2626'
            : '#94A3B8';

    const mkEdge = (
      id: string,
      source: string,
      target: string,
      label: string,
      health: NodeHealth,
      dashed = false
    ): Edge => ({
      id,
      source,
      target,
      label,
      animated: health === 'nominal' && !dashed,
      style: {
        stroke: edgeColor(health),
        strokeWidth: health === 'inactive' ? 1.25 : 1.75,
        strokeDasharray: dashed || health !== 'nominal' ? '5,4' : undefined,
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
      mkEdge(
        'e-browser-gtm',
        'browser-datalayer',
        'web-gtm',
        'dataLayer.push',
        eventParamComplete ? 'nominal' : 'critical'
      ),
      mkEdge(
        'e-gtm-consent',
        'web-gtm',
        'consent-gate',
        'Consent check',
        hasConsentCritical ? 'critical' : hasConsentWarning ? 'warning' : 'nominal'
      ),
      mkEdge(
        'e-consent-sgtm',
        'consent-gate',
        'server-sgtm',
        hasSgtm ? '1st-party hit' : 'Direct fallback',
        hasSgtm ? 'nominal' : 'warning'
      ),
    ];

    if (showNode(hasMetaCapi || hasLinkedIn)) {
      builtEdges.push(
        mkEdge(
          'e-browser-pixel',
          'browser-datalayer',
          'browser-pixel',
          "fbq('track')",
          hasMetaCapi ? 'nominal' : 'inactive',
          true
        )
      );
    }

    if (showNode(hasGa4)) {
      builtEdges.push(
        mkEdge(
          'e-sgtm-ga4',
          'server-sgtm',
          'dest-ga4',
          'MP v2 /g/collect',
          !hasGa4 ? 'inactive' : Math.abs(ga4Delta) <= 3 ? 'nominal' : 'critical'
        )
      );
    }

    if (showNode(hasMetaCapi)) {
      builtEdges.push(
        mkEdge(
          'e-sgtm-meta',
          'server-sgtm',
          'dest-meta',
          dedupOk ? 'CAPI + SHA-256' : 'No dedup',
          !hasMetaCapi ? 'inactive' : Math.abs(metaDelta) <= 3 && dedupOk ? 'nominal' : 'critical'
        )
      );
      if (showNode(hasMetaCapi || hasLinkedIn)) {
        builtEdges.push(
          mkEdge(
            'e-pixel-meta',
            'browser-pixel',
            'dest-meta',
            dedupOk ? 'event_id dedup' : '2x overcount',
            !hasMetaCapi ? 'inactive' : dedupOk ? 'nominal' : 'critical',
            true
          )
        );
      }
    }

    if (showNode(hasGads)) {
      builtEdges.push(
        mkEdge(
          'e-sgtm-gads',
          'server-sgtm',
          'dest-gads',
          'EC + GCLID',
          !hasGads
            ? 'inactive'
            : Math.abs(gadsDelta) <= 3 && !hasEcWarning && selectedEvent.enhancedConversions
              ? 'nominal'
              : 'warning'
        )
      );
    }

    return { nodes: builtNodes, edges: builtEdges };
  }, [workspace, gtmSummary, selectedEvent, viewMode, isDark]);

  const activeNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        {/* Controls Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Conversion Event Data Flow
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
              <span>Browser dataLayer</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <span>Web GTM &amp; Consent Gate</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <span>Server-Side GTM</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <span>GA4, Meta CAPI &amp; Google Ads</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-medium whitespace-nowrap">Conversion Event:</span>
              <select
                value={selectedEvent.id}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-600/30"
              >
                {orderedEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.eventName} ({ev.funnelStage})
                  </option>
                ))}
              </select>
            </label>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('conversion-path')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'conversion-path'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Active Path
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all-destinations')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'all-destinations'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All Destinations
              </button>
            </div>
          </div>
        </div>

        {/* Status Legend Strip */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Nominal Dispatch
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Partial / Warning
            </span>
            <span className="inline-flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              Critical Fault / Dedup Mismatch
            </span>
          </div>
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {selectedEvent.monthlyVolume.toLocaleString()} monthly events · Click any node to inspect payload
          </span>
        </div>

        {/* React Flow Canvas */}
        <div className="h-[490px] w-full bg-slate-50/70 dark:bg-slate-950/60">
          <ReactFlow
            key={`${selectedEvent.id}-${viewMode}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.14 }}
            minZoom={0.45}
            maxZoom={1.5}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={isDark ? '#1E293B' : '#CBD5E1'} gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Selected Hop Inspection & Payload Preview */}
        {activeNode && (
          <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">
                    Stage {activeNode.data.step}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeNode.data.layer}</span>
                </div>
                <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {activeNode.data.title}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activeNode.data.detail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(activeNode.data.targetTab)}
                className="px-3.5 py-2 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
              >
                Open Module
              </button>
            </div>

            <div className="bg-slate-950 text-slate-100 border border-slate-800 rounded-md p-3.5 overflow-x-auto">
              <div className="text-[11px] font-mono text-slate-400 mb-2">
                Stage Payload Snapshot — {selectedEvent.eventName} @ {activeNode.data.title}
              </div>
              <pre className="text-xs font-mono leading-relaxed text-emerald-300">
                {activeNode.data.payloadPreview}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
