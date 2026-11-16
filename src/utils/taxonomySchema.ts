import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import { FunnelStage, TaxonomyEvent } from '../types/tracking';

export type ParamDependencyCategory =
  | 'Ecommerce Core'
  | 'Revenue & Bidding'
  | 'Deduplication'
  | 'Enhanced Conversions'
  | 'Attribution & CRM';

export interface ParameterDependencySpec {
  name: string;
  dataType: string;
  category: ParamDependencyCategory;
  downstreamPlatforms: string[];
  requiredByEvents: string[];
  missingInEvents: string[];
  dependsOnParams: string[];
  documentationRule: string;
}

export interface EventSchemaNodeData extends Record<string, unknown> {
  kind: 'event';
  eventId: string;
  eventName: string;
  funnelStage: FunnelStage;
  googleAdsRole: string;
  platforms: string[];
  completenessPct: number;
  requiredCount: number;
  presentCount: number;
  missingParams: string[];
  enhancedConversions: boolean;
  capiDedupEnabled: boolean;
}

export interface ParamSchemaNodeData extends Record<string, unknown> {
  kind: 'parameter';
  paramName: string;
  dataType: string;
  category: ParamDependencyCategory;
  requiredByCount: number;
  missingCount: number;
  downstreamPlatforms: string[];
  documentationRule: string;
}

export type TaxonomySchemaFlowNode = Node<EventSchemaNodeData | ParamSchemaNodeData>;

export interface TaxonomyVisualSchema {
  generatedAt: string;
  eventCount: number;
  uniqueParamCount: number;
  missingDependencyLinks: number;
  stageOrder: FunnelStage[];
  parameters: ParameterDependencySpec[];
  nodes: TaxonomySchemaFlowNode[];
  edges: Edge[];
  mermaidDiagram: string;
  markdownDoc: string;
  svgDiagram: string;
  jsonSchema: string;
}

export interface TaxonomyJsonSchemaDocument {
  $schema: string;
  $id: string;
  title: string;
  description: string;
  type: 'object';
  oneOf: Array<{ $ref: string }>;
  $defs: {
    parameters: Record<string, Record<string, unknown>>;
    events: Record<string, Record<string, unknown>>;
  };
  'x-taxonomy-metadata': {
    generatedAt: string;
    eventCount: number;
    uniqueParameterCount: number;
    missingDependencyLinks: number;
    parameterDependencies: ParameterDependencySpec[];
  };
}

const STAGE_ORDER: FunnelStage[] = [
  'Awareness',
  'Consideration',
  'Conversion',
  'Offline CRM',
];

interface ParamMetadata {
  dataType: string;
  category: ParamDependencyCategory;
  dependsOnParams: string[];
  documentationRule: string;
  platformHints: string[];
}

const KNOWN_PARAM_META: Record<string, ParamMetadata> = {
  transaction_id: {
    dataType: 'string',
    category: 'Deduplication',
    dependsOnParams: ['value', 'currency'],
    documentationRule: 'Unique order key required to prevent GA4 and Google Ads purchase double-counting.',
    platformHints: ['GA4', 'Google Ads', 'Meta CAPI'],
  },
  event_id: {
    dataType: 'string (UUID)',
    category: 'Deduplication',
    dependsOnParams: [],
    documentationRule: 'Shared key sent identically in Browser Pixel and Server CAPI for 1:1 deduplication.',
    platformHints: ['Meta CAPI', 'GA4'],
  },
  value: {
    dataType: 'number',
    category: 'Revenue & Bidding',
    dependsOnParams: ['currency'],
    documentationRule: 'Monetary conversion value used by Google Ads tROAS and Value-Based Bidding.',
    platformHints: ['GA4', 'Google Ads', 'Meta CAPI', 'LinkedIn'],
  },
  currency: {
    dataType: 'ISO-4217 string',
    category: 'Revenue & Bidding',
    dependsOnParams: ['value'],
    documentationRule: 'Required 3-letter currency code whenever value is present.',
    platformHints: ['GA4', 'Google Ads', 'Meta CAPI', 'LinkedIn'],
  },
  items: {
    dataType: 'GA4Item[]',
    category: 'Ecommerce Core',
    dependsOnParams: ['currency', 'value'],
    documentationRule: 'Product array containing item_id, item_name, price, and quantity.',
    platformHints: ['GA4', 'Meta CAPI'],
  },
  user_data: {
    dataType: 'UserDataObject',
    category: 'Enhanced Conversions',
    dependsOnParams: [],
    documentationRule: 'Normalized & SHA-256 hashed email/phone object for Google Enhanced Conversions & Meta CAPI.',
    platformHints: ['Google Ads', 'Meta CAPI', 'LinkedIn'],
  },
  gclid: {
    dataType: 'string (URL-safe B64)',
    category: 'Attribution & CRM',
    dependsOnParams: ['conversion_time'],
    documentationRule: 'Case-sensitive Google Click ID captured from _gcl_aw / URL for Offline Conversion Import.',
    platformHints: ['Google Ads'],
  },
  lead_id: {
    dataType: 'string',
    category: 'Attribution & CRM',
    dependsOnParams: ['gclid'],
    documentationRule: 'CRM primary key bridging web lead submission to downstream offline pipeline stages.',
    platformHints: ['Google Ads', 'GA4'],
  },
  lead_type: {
    dataType: 'string',
    category: 'Attribution & CRM',
    dependsOnParams: [],
    documentationRule: 'Categorizes inbound lead intent (e.g. demo_request, trial_signup) for value rules.',
    platformHints: ['GA4', 'Google Ads'],
  },
  conversion_time: {
    dataType: 'ISO-8601 + TZ',
    category: 'Attribution & CRM',
    dependsOnParams: ['gclid'],
    documentationRule: 'Explicit timezone-aware timestamp within 90 days of ad click for OCI API acceptance.',
    platformHints: ['Google Ads'],
  },
  email_sha256: {
    dataType: 'hex64 string',
    category: 'Enhanced Conversions',
    dependsOnParams: ['user_data'],
    documentationRule: 'Lowercased, trimmed SHA-256 email digest for Enhanced Conversions for Leads.',
    platformHints: ['Google Ads', 'Meta CAPI', 'LinkedIn'],
  },
  fbp: {
    dataType: 'string (fb.1.*)',
    category: 'Attribution & CRM',
    dependsOnParams: ['event_id'],
    documentationRule: 'First-party Meta browser identifier improving CAPI Event Match Quality (EMQ).',
    platformHints: ['Meta CAPI'],
  },
  fbc: {
    dataType: 'string (fb.1.*)',
    category: 'Attribution & CRM',
    dependsOnParams: ['fbp'],
    documentationRule: 'Meta click identifier derived from fbclid query parameter.',
    platformHints: ['Meta CAPI'],
  },
};

function inferParamMeta(paramName: string, eventsUsingIt: TaxonomyEvent[]): ParamMetadata {
  if (KNOWN_PARAM_META[paramName]) {
    return KNOWN_PARAM_META[paramName];
  }
  const lower = paramName.toLowerCase();
  if (lower.includes('email') || lower.includes('phone') || lower.includes('user')) {
    return {
      dataType: 'string / object',
      category: 'Enhanced Conversions',
      dependsOnParams: [],
      documentationRule: 'First-party customer identifier normalized and SHA-256 hashed before dispatch.',
      platformHints: ['Google Ads', 'Meta CAPI'],
    };
  }
  if (lower.includes('gclid') || lower.includes('wbraid') || lower.includes('crm')) {
    return {
      dataType: 'string',
      category: 'Attribution & CRM',
      dependsOnParams: [],
      documentationRule: 'Click/CRM attribution key persisted into backend lead records.',
      platformHints: ['Google Ads'],
    };
  }
  if (lower.includes('id')) {
    return {
      dataType: 'string',
      category: 'Deduplication',
      dependsOnParams: [],
      documentationRule: 'Identifier required for cross-platform event or entity reconciliation.',
      platformHints: Array.from(new Set(eventsUsingIt.flatMap((e) => e.platforms))),
    };
  }
  return {
    dataType: 'string',
    category: 'Ecommerce Core',
    dependsOnParams: [],
    documentationRule: `Required dataLayer key validated across ${eventsUsingIt.map((e) => e.eventName).join(', ')}.`,
    platformHints: Array.from(new Set(eventsUsingIt.flatMap((e) => e.platforms))),
  };
}

function escapeMermaidId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildJsonSchemaParamDef(
  paramName: string,
  meta: ParamMetadata
): Record<string, unknown> {
  if (paramName === 'value') {
    return {
      type: 'number',
      minimum: 0,
      description: meta.documentationRule,
    };
  }
  if (paramName === 'currency') {
    return {
      type: 'string',
      pattern: '^[A-Z]{3}$',
      description: meta.documentationRule,
    };
  }
  if (paramName === 'items') {
    return {
      type: 'array',
      minItems: 1,
      description: meta.documentationRule,
      items: {
        type: 'object',
        required: ['item_id', 'item_name'],
        properties: {
          item_id: { type: 'string', minLength: 1 },
          item_name: { type: 'string', minLength: 1 },
          price: { type: 'number', minimum: 0 },
          quantity: { type: 'integer', minimum: 1 },
        },
      },
    };
  }
  if (paramName === 'user_data') {
    return {
      type: 'object',
      description: meta.documentationRule,
      properties: {
        sha256_email_address: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        sha256_phone_number: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    };
  }
  if (paramName === 'email_sha256') {
    return {
      type: 'string',
      pattern: '^[a-f0-9]{64}$',
      description: meta.documentationRule,
    };
  }
  if (paramName === 'gclid') {
    return {
      type: 'string',
      pattern: '^[A-Za-z0-9_-]{15,}$',
      description: meta.documentationRule,
    };
  }
  if (paramName === 'conversion_time') {
    return {
      type: 'string',
      format: 'date-time',
      description: meta.documentationRule,
    };
  }
  if (paramName === 'fbp' || paramName === 'fbc') {
    return {
      type: 'string',
      pattern: '^fb\\.\\d+\\.\\d+\\.[A-Za-z0-9_-]+$',
      description: meta.documentationRule,
    };
  }
  return {
    type: 'string',
    minLength: 1,
    description: meta.documentationRule,
  };
}

export function generateTaxonomyJsonSchema(
  events: TaxonomyEvent[],
  options?: { title?: string; strictMode?: boolean }
): TaxonomyJsonSchemaDocument {
  const generatedAt = new Date().toISOString();
  const strictMode = Boolean(options?.strictMode);
  const sortedEvents = [...events].sort((a, b) => {
    const stageDiff = STAGE_ORDER.indexOf(a.funnelStage) - STAGE_ORDER.indexOf(b.funnelStage);
    if (stageDiff !== 0) return stageDiff;
    return a.eventName.localeCompare(b.eventName);
  });

  const paramToEvents = new Map<string, TaxonomyEvent[]>();
  for (const ev of sortedEvents) {
    for (const param of ev.requiredParams) {
      const list = paramToEvents.get(param) || [];
      list.push(ev);
      paramToEvents.set(param, list);
    }
  }

  const parameterDefs: Record<string, Record<string, unknown>> = {};
  const parameterDependencies: ParameterDependencySpec[] = [];

  for (const [paramName, evList] of Array.from(paramToEvents.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const meta = inferParamMeta(paramName, evList);
    const activePlatforms = Array.from(new Set(evList.flatMap((e) => e.platforms)));
    const downstreamPlatforms = meta.platformHints.filter((p) =>
      activePlatforms.includes(p as TaxonomyEvent['platforms'][number])
    );

    parameterDefs[paramName] = buildJsonSchemaParamDef(paramName, meta);
    parameterDependencies.push({
      name: paramName,
      dataType: meta.dataType,
      category: meta.category,
      downstreamPlatforms:
        downstreamPlatforms.length > 0 ? downstreamPlatforms : activePlatforms,
      requiredByEvents: evList.map((e) => e.eventName),
      missingInEvents: evList
        .filter((e) => !e.presentParams.includes(paramName))
        .map((e) => e.eventName),
      dependsOnParams: meta.dependsOnParams.filter((dep) => paramToEvents.has(dep)),
      documentationRule: meta.documentationRule,
    });
  }

  let missingDependencyLinks = 0;
  const eventDefs: Record<string, Record<string, unknown>> = {};

  for (const ev of sortedEvents) {
    const missingParams = ev.requiredParams.filter((p) => !ev.presentParams.includes(p));
    missingDependencyLinks += missingParams.length;

    const eventProps: Record<string, unknown> = {
      event: { const: ev.eventName },
    };
    const dependentRequired: Record<string, string[]> = {};

    for (const paramName of ev.requiredParams) {
      eventProps[paramName] = { $ref: `#/$defs/parameters/${paramName}` };
      const paramMeta = KNOWN_PARAM_META[paramName];
      if (paramMeta && paramMeta.dependsOnParams.length > 0) {
        const depsInEvent = paramMeta.dependsOnParams.filter(
          (d) => ev.requiredParams.includes(d) || paramToEvents.has(d)
        );
        if (depsInEvent.length > 0) {
          dependentRequired[paramName] = depsInEvent;
        }
      }
    }

    const def: Record<string, unknown> = {
      type: 'object',
      description: ev.notes,
      additionalProperties: !strictMode,
      required: ['event', ...ev.requiredParams],
      properties: eventProps,
      'x-measurement-spec': {
        funnelStage: ev.funnelStage,
        platforms: ev.platforms,
        googleAdsRole: ev.googleAdsRole,
        attributionModel: ev.attributionModel,
        enhancedConversions: ev.enhancedConversions,
        capiDedupEnabled: ev.capiDedupEnabled,
        presentParams: ev.presentParams,
        missingParams,
        monthlyVolume: ev.monthlyVolume,
      },
    };

    if (Object.keys(dependentRequired).length > 0) {
      def.dependentRequired = dependentRequired;
    }

    eventDefs[ev.eventName] = def;
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://tagaudit.schema/ga4-event-taxonomy.schema.json',
    title: options?.title || 'GA4 Event Taxonomy & Parameter Dependency Schema',
    description: `Draft 2020-12 JSON Schema for ${sortedEvents.length} GA4 events and ${parameterDependencies.length} required parameter dependencies.`,
    type: 'object',
    oneOf: sortedEvents.map((ev) => ({ $ref: `#/$defs/events/${ev.eventName}` })),
    $defs: {
      parameters: parameterDefs,
      events: eventDefs,
    },
    'x-taxonomy-metadata': {
      generatedAt,
      eventCount: sortedEvents.length,
      uniqueParameterCount: parameterDependencies.length,
      missingDependencyLinks,
      parameterDependencies,
    },
  };
}

export function generateTaxonomyVisualSchema(
  events: TaxonomyEvent[],
  options?: { isDark?: boolean }
): TaxonomyVisualSchema {
  const isDark = Boolean(options?.isDark);
  const generatedAt = new Date().toISOString();

  // 1. Sort events chronologically along the funnel stage progression
  const sortedEvents = [...events].sort((a, b) => {
    const stageDiff = STAGE_ORDER.indexOf(a.funnelStage) - STAGE_ORDER.indexOf(b.funnelStage);
    if (stageDiff !== 0) return stageDiff;
    return a.eventName.localeCompare(b.eventName);
  });

  // 2. Build unique parameter dependency specifications
  const paramToEvents = new Map<string, TaxonomyEvent[]>();
  for (const ev of sortedEvents) {
    for (const param of ev.requiredParams) {
      const list = paramToEvents.get(param) || [];
      list.push(ev);
      paramToEvents.set(param, list);
    }
  }

  const parameters: ParameterDependencySpec[] = Array.from(paramToEvents.entries())
    .map(([name, evList]) => {
      const meta = inferParamMeta(name, evList);
      const requiredByEvents = evList.map((e) => e.eventName);
      const missingInEvents = evList
        .filter((e) => !e.presentParams.includes(name))
        .map((e) => e.eventName);
      const allActivePlatforms = new Set(evList.flatMap((e) => e.platforms));
      const downstreamPlatforms = meta.platformHints.filter((p) =>
        allActivePlatforms.has(p as TaxonomyEvent['platforms'][number])
      );

      return {
        name,
        dataType: meta.dataType,
        category: meta.category,
        downstreamPlatforms:
          downstreamPlatforms.length > 0
            ? downstreamPlatforms
            : Array.from(allActivePlatforms),
        requiredByEvents,
        missingInEvents,
        dependsOnParams: meta.dependsOnParams.filter((dep) => paramToEvents.has(dep)),
        documentationRule: meta.documentationRule,
      };
    })
    .sort((a, b) => {
      if (b.missingInEvents.length !== a.missingInEvents.length) {
        return b.missingInEvents.length - a.missingInEvents.length;
      }
      if (b.requiredByEvents.length !== a.requiredByEvents.length) {
        return b.requiredByEvents.length - a.requiredByEvents.length;
      }
      return a.name.localeCompare(b.name);
    });

  // 3. Build React Flow Visual Schema Nodes & Edges
  const nodes: TaxonomySchemaFlowNode[] = [];
  const edges: Edge[] = [];

  const eventRowSpacing = 128;
  const paramRowSpacing = 108;

  sortedEvents.forEach((ev, idx) => {
    const missingParams = ev.requiredParams.filter((p) => !ev.presentParams.includes(p));
    const completenessPct = Math.round(
      (ev.presentParams.length / Math.max(1, ev.requiredParams.length)) * 100
    );

    nodes.push({
      id: `ev-${ev.id}`,
      type: 'schemaEvent',
      position: { x: 24, y: 24 + idx * eventRowSpacing },
      data: {
        kind: 'event',
        eventId: ev.id,
        eventName: ev.eventName,
        funnelStage: ev.funnelStage,
        googleAdsRole: ev.googleAdsRole,
        platforms: ev.platforms,
        completenessPct,
        requiredCount: ev.requiredParams.length,
        presentCount: ev.presentParams.length,
        missingParams,
        enhancedConversions: ev.enhancedConversions,
        capiDedupEnabled: ev.capiDedupEnabled,
      },
    });

    // Funnel progression edge to next event in funnel
    if (idx > 0) {
      const prevEv = sortedEvents[idx - 1];
      edges.push({
        id: `flow-${prevEv.id}-${ev.id}`,
        source: `ev-${prevEv.id}`,
        target: `ev-${ev.id}`,
        sourceHandle: 'funnel-bottom',
        targetHandle: 'funnel-top',
        type: 'smoothstep',
        style: {
          stroke: isDark ? '#475569' : '#94A3B8',
          strokeWidth: 1.5,
          strokeDasharray: '4,4',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isDark ? '#475569' : '#94A3B8',
          width: 12,
          height: 12,
        },
      });
    }
  });

  parameters.forEach((param, idx) => {
    nodes.push({
      id: `param-${param.name}`,
      type: 'schemaParam',
      position: { x: 430, y: 24 + idx * paramRowSpacing },
      data: {
        kind: 'parameter',
        paramName: param.name,
        dataType: param.dataType,
        category: param.category,
        requiredByCount: param.requiredByEvents.length,
        missingCount: param.missingInEvents.length,
        downstreamPlatforms: param.downstreamPlatforms,
        documentationRule: param.documentationRule,
      },
    });
  });

  // Event -> Parameter Dependency Edges
  let missingDependencyLinks = 0;
  for (const ev of sortedEvents) {
    for (const paramName of ev.requiredParams) {
      const isPresent = ev.presentParams.includes(paramName);
      if (!isPresent) missingDependencyLinks++;

      const stroke = isPresent ? '#16A34A' : '#DC2626';
      edges.push({
        id: `dep-${ev.id}-${paramName}`,
        source: `ev-${ev.id}`,
        target: `param-${paramName}`,
        sourceHandle: 'param-right',
        targetHandle: 'param-left',
        label: isPresent ? undefined : 'MISSING',
        animated: !isPresent,
        style: {
          stroke,
          strokeWidth: isPresent ? 1.5 : 2,
          strokeDasharray: isPresent ? undefined : '5,3',
          opacity: isPresent ? 0.72 : 1,
        },
        labelStyle: {
          fill: '#DC2626',
          fontSize: 9,
          fontWeight: 600,
          fontFamily: 'JetBrains Mono, monospace',
        },
        labelBgStyle: {
          fill: isDark ? '#0F172A' : '#FFFFFF',
          fillOpacity: 0.9,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 12,
          height: 12,
        },
      });
    }
  }

  // Inter-parameter dependency edges (e.g. value <-> currency, gclid -> conversion_time)
  for (const param of parameters) {
    for (const dep of param.dependsOnParams) {
      if (param.name < dep || !parameters.find((p) => p.name === dep)?.dependsOnParams.includes(param.name)) {
        edges.push({
          id: `pdep-${param.name}-${dep}`,
          source: `param-${param.name}`,
          target: `param-${dep}`,
          sourceHandle: 'pdep-right',
          targetHandle: 'pdep-right',
          label: 'requires',
          style: {
            stroke: '#EA580C',
            strokeWidth: 1.25,
            strokeDasharray: '3,3',
          },
          labelStyle: {
            fill: isDark ? '#FDBA74' : '#C2410C',
            fontSize: 9,
            fontFamily: 'JetBrains Mono, monospace',
          },
          labelBgStyle: {
            fill: isDark ? '#0F172A' : '#FFFFFF',
            fillOpacity: 0.9,
          },
        });
      }
    }
  }

  // 4. Generate Mermaid Documentation Diagram
  const mermaidLines: string[] = ['flowchart LR'];
  for (const stage of STAGE_ORDER) {
    const stageEvents = sortedEvents.filter((e) => e.funnelStage === stage);
    if (stageEvents.length === 0) continue;
    mermaidLines.push(`  subgraph ${escapeMermaidId(stage)}["Stage: ${stage}"]`);
    for (const ev of stageEvents) {
      mermaidLines.push(
        `    EV_${escapeMermaidId(ev.eventName)}["${ev.eventName} (${ev.googleAdsRole})"]`
      );
    }
    mermaidLines.push('  end');
  }

  mermaidLines.push('  subgraph PARAMS["Required Parameter Dependencies"]');
  for (const param of parameters) {
    mermaidLines.push(
      `    P_${escapeMermaidId(param.name)}("${param.name} : ${param.dataType}")`
    );
  }
  mermaidLines.push('  end');

  for (let i = 1; i < sortedEvents.length; i++) {
    mermaidLines.push(
      `  EV_${escapeMermaidId(sortedEvents[i - 1].eventName)} -.-> EV_${escapeMermaidId(sortedEvents[i].eventName)}`
    );
  }

  for (const ev of sortedEvents) {
    for (const paramName of ev.requiredParams) {
      const ok = ev.presentParams.includes(paramName);
      mermaidLines.push(
        `  EV_${escapeMermaidId(ev.eventName)} ${ok ? '-->' : '-. MISSING .->'} P_${escapeMermaidId(paramName)}`
      );
    }
  }

  for (const param of parameters) {
    for (const dep of param.dependsOnParams) {
      mermaidLines.push(
        `  P_${escapeMermaidId(param.name)} -. requires .-> P_${escapeMermaidId(dep)}`
      );
    }
  }

  const mermaidDiagram = mermaidLines.join('\n');

  // 5. Generate Markdown Technical Documentation Table
  const mdLines: string[] = [
    '# GA4 Event Taxonomy & Parameter Dependency Schema',
    '',
    `Generated: ${generatedAt} · Events: ${sortedEvents.length} · Unique Parameters: ${parameters.length} · Missing Links: ${missingDependencyLinks}`,
    '',
    '## 1. Event Funnel & Platform Matrix',
    '',
    '| Stage | Event Name | Google Ads Role | Attribution | EC / CAPI Dedup | Completeness | Missing Parameters |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const ev of sortedEvents) {
    const missing = ev.requiredParams.filter((p) => !ev.presentParams.includes(p));
    const pct = Math.round(
      (ev.presentParams.length / Math.max(1, ev.requiredParams.length)) * 100
    );
    mdLines.push(
      `| ${ev.funnelStage} | \`${ev.eventName}\` | ${ev.googleAdsRole} | ${ev.attributionModel} | EC:${ev.enhancedConversions ? 'ON' : 'OFF'} / Dedup:${ev.capiDedupEnabled ? 'ON' : 'OFF'} | ${pct}% (${ev.presentParams.length}/${ev.requiredParams.length}) | ${missing.length > 0 ? missing.map((m) => `\`${m}\``).join(', ') : 'None'} |`
    );
  }

  mdLines.push(
    '',
    '## 2. Parameter Dependency Specification',
    '',
    '| Parameter | Type | Category | Co-Dependencies | Required By Events | Missing In | Rule |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  );

  for (const param of parameters) {
    mdLines.push(
      `| \`${param.name}\` | \`${param.dataType}\` | ${param.category} | ${param.dependsOnParams.length ? param.dependsOnParams.map((d) => `\`${d}\``).join(', ') : 'None'} | ${param.requiredByEvents.map((e) => `\`${e}\``).join(', ')} | ${param.missingInEvents.length ? param.missingInEvents.map((e) => `\`${e}\``).join(', ') : 'None'} | ${param.documentationRule} |`
    );
  }

  const markdownDoc = mdLines.join('\n');

  // 6. Generate Standalone Exportable SVG Visual Schema
  const svgHeight = Math.max(
    360,
    Math.max(sortedEvents.length * 96, parameters.length * 76) + 110
  );
  const svgWidth = 920;
  const svgBg = isDark ? '#020617' : '#FFFFFF';
  const svgCardBg = isDark ? '#0F172A' : '#F8FAFC';
  const svgBorder = isDark ? '#1E293B' : '#CBD5E1';
  const svgTitleColor = isDark ? '#F1F5F9' : '#0F172A';
  const svgMutedColor = isDark ? '#94A3B8' : '#475569';

  const eventCoords = new Map<string, { x: number; y: number }>();
  const paramCoords = new Map<string, { x: number; y: number }>();

  const svgParts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
    `<rect width="${svgWidth}" height="${svgHeight}" fill="${svgBg}" />`,
    `<text x="28" y="34" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="700" fill="${svgTitleColor}">GA4 Event Taxonomy &amp; Parameter Dependency Schema</text>`,
    `<text x="28" y="54" font-family="ui-monospace, monospace" font-size="11" fill="${svgMutedColor}">Events: ${sortedEvents.length} · Parameters: ${parameters.length} · Missing Links: ${missingDependencyLinks}</text>`,
  ];

  sortedEvents.forEach((ev, idx) => {
    const x = 28;
    const y = 78 + idx * 92;
    eventCoords.set(ev.id, { x: x + 280, y: y + 36 });
  });

  parameters.forEach((p, idx) => {
    const x = 540;
    const y = 78 + idx * 72;
    paramCoords.set(p.name, { x, y: y + 28 });
  });

  // Draw SVG dependency edges behind boxes
  for (const ev of sortedEvents) {
    const start = eventCoords.get(ev.id);
    if (!start) continue;
    for (const paramName of ev.requiredParams) {
      const end = paramCoords.get(paramName);
      if (!end) continue;
      const present = ev.presentParams.includes(paramName);
      const color = present ? '#16A34A' : '#DC2626';
      const dash = present ? '' : ' stroke-dasharray="5,3"';
      const midX = (start.x + end.x) / 2;
      svgParts.push(
        `<path d="M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}" fill="none" stroke="${color}" stroke-width="${present ? 1.4 : 2}"${dash} opacity="${present ? 0.65 : 1}" />`
      );
    }
  }

  // Draw SVG Event Cards
  sortedEvents.forEach((ev, idx) => {
    const x = 28;
    const y = 78 + idx * 92;
    const missing = ev.requiredParams.filter((p) => !ev.presentParams.includes(p));
    const strokeColor = missing.length > 0 ? '#DC2626' : svgBorder;
    svgParts.push(
      `<rect x="${x}" y="${y}" width="280" height="72" rx="8" fill="${svgCardBg}" stroke="${strokeColor}" stroke-width="1.25" />`,
      `<text x="${x + 14}" y="${y + 24}" font-family="ui-monospace, monospace" font-size="13" font-weight="700" fill="${svgTitleColor}">${escapeXml(ev.eventName)}</text>`,
      `<text x="${x + 14}" y="${y + 42}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="${svgMutedColor}">${escapeXml(ev.funnelStage)} · ${escapeXml(ev.googleAdsRole)}</text>`,
      `<text x="${x + 14}" y="${y + 58}" font-family="ui-monospace, monospace" font-size="10" fill="${missing.length > 0 ? '#DC2626' : '#16A34A'}">${ev.presentParams.length}/${ev.requiredParams.length} params${missing.length > 0 ? ` (missing: ${escapeXml(missing.join(', '))})` : ' complete'}</text>`
    );
  });

  // Draw SVG Parameter Cards
  parameters.forEach((param, idx) => {
    const x = 540;
    const y = 78 + idx * 72;
    const hasMissing = param.missingInEvents.length > 0;
    const strokeColor = hasMissing ? '#DC2626' : svgBorder;
    svgParts.push(
      `<rect x="${x}" y="${y}" width="340" height="56" rx="8" fill="${svgCardBg}" stroke="${strokeColor}" stroke-width="1.25" />`,
      `<text x="${x + 14}" y="${y + 22}" font-family="ui-monospace, monospace" font-size="12" font-weight="700" fill="${svgTitleColor}">${escapeXml(param.name)}</text>`,
      `<text x="${x + 326}" y="${y + 22}" text-anchor="end" font-family="ui-monospace, monospace" font-size="10" fill="#EA580C">${escapeXml(param.dataType)}</text>`,
      `<text x="${x + 14}" y="${y + 40}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10.5" fill="${svgMutedColor}">${escapeXml(param.category)} · Used by ${param.requiredByEvents.length} events</text>`
    );
  });

  svgParts.push('</svg>');
  const svgDiagram = svgParts.join('\n');
  const jsonSchema = JSON.stringify(generateTaxonomyJsonSchema(sortedEvents), null, 2);

  return {
    generatedAt,
    eventCount: sortedEvents.length,
    uniqueParamCount: parameters.length,
    missingDependencyLinks,
    stageOrder: STAGE_ORDER,
    parameters,
    nodes,
    edges,
    mermaidDiagram,
    markdownDoc,
    svgDiagram,
    jsonSchema,
  };
}
