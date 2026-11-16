import React, { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  NodeProps,
  Position,
  ReactFlow,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  GitBranch,
  XCircle,
} from 'lucide-react';
import { TaxonomyEvent } from '../types/tracking';
import {
  EventSchemaNodeData,
  generateTaxonomyVisualSchema,
  ParamDependencyCategory,
  ParamSchemaNodeData,
} from '../utils/taxonomySchema';

interface TaxonomySchemaViewProps {
  events: TaxonomyEvent[];
  isDark: boolean;
}

const SchemaEventNode: React.FC<NodeProps<Node<EventSchemaNodeData>>> = ({
  data,
  selected,
}) => {
  const hasMissing = data.missingParams.length > 0;
  return (
    <div
      className={`w-64 bg-white dark:bg-slate-900 border rounded-lg p-3 shadow-xs transition-colors ${
        selected
          ? 'border-orange-600 ring-2 ring-orange-600/20'
          : hasMissing
            ? 'border-red-300 dark:border-red-800'
            : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <Handle
        id="funnel-top"
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-slate-400 dark:!bg-slate-500 !border-white dark:!border-slate-900"
      />
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate font-medium">{data.funnelStage}</span>
        <span
          className={`inline-flex items-center gap-1 font-medium shrink-0 ${
            hasMissing
              ? 'text-red-600 dark:text-red-400'
              : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {hasMissing ? (
            <XCircle className="w-3 h-3" />
          ) : (
            <CheckCircle2 className="w-3 h-3" />
          )}
          <span className="tabular-nums">{data.completenessPct}%</span>
        </span>
      </div>
      <div className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
        {data.eventName}
      </div>
      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
        {data.googleAdsRole} · {data.platforms.join(', ')}
      </div>
      <Handle
        id="param-right"
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-orange-600 !border-white dark:!border-slate-900"
      />
      <Handle
        id="funnel-bottom"
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-slate-400 dark:!bg-slate-500 !border-white dark:!border-slate-900"
      />
    </div>
  );
};

const SchemaParamNode: React.FC<NodeProps<Node<ParamSchemaNodeData>>> = ({
  data,
  selected,
}) => {
  const hasMissing = data.missingCount > 0;
  return (
    <div
      className={`w-72 bg-white dark:bg-slate-900 border rounded-lg p-3 shadow-xs transition-colors ${
        selected
          ? 'border-orange-600 ring-2 ring-orange-600/20'
          : hasMissing
            ? 'border-red-300 dark:border-red-800'
            : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <Handle
        id="param-left"
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-400 dark:!bg-slate-500 !border-white dark:!border-slate-900"
      />
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-500 dark:text-slate-400 truncate">{data.category}</span>
        <span className="font-mono text-orange-600 dark:text-orange-400 shrink-0">
          {data.dataType}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
          {data.paramName}
        </span>
        {hasMissing ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            {data.missingCount} missing
          </span>
        ) : (
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
            {data.requiredByCount} events
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
        Feeds: {data.downstreamPlatforms.join(', ') || 'GA4'}
      </div>
      <Handle
        id="pdep-right"
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-orange-600 !border-white dark:!border-slate-900"
      />
    </div>
  );
};

const nodeTypes = {
  schemaEvent: SchemaEventNode,
  schemaParam: SchemaParamNode,
};

const CATEGORIES: Array<'All' | ParamDependencyCategory> = [
  'All',
  'Ecommerce Core',
  'Revenue & Bidding',
  'Deduplication',
  'Enhanced Conversions',
  'Attribution & CRM',
];

export const TaxonomySchemaView: React.FC<TaxonomySchemaViewProps> = ({
  events,
  isDark,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'All' | ParamDependencyCategory>('All');
  const [docTab, setDocTab] = useState<'matrix' | 'mermaid' | 'markdown'>('matrix');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'mermaid' | 'markdown' | null>(null);

  const schema = useMemo(
    () => generateTaxonomyVisualSchema(events, { isDark }),
    [events, isDark]
  );

  const { filteredNodes, filteredEdges } = useMemo(() => {
    if (categoryFilter === 'All') {
      return { filteredNodes: schema.nodes, filteredEdges: schema.edges };
    }
    const matchingParamIds = new Set(
      schema.parameters
        .filter((p) => p.category === categoryFilter)
        .map((p) => `param-${p.name}`)
    );

    const connectedEventIds = new Set<string>();
    const keptEdges = schema.edges.filter((edge) => {
      if (edge.id.startsWith('dep-') && matchingParamIds.has(edge.target)) {
        connectedEventIds.add(edge.source);
        return true;
      }
      if (
        edge.id.startsWith('pdep-') &&
        matchingParamIds.has(edge.source) &&
        matchingParamIds.has(edge.target)
      ) {
        return true;
      }
      return false;
    });

    const keptNodes = schema.nodes.filter(
      (n) => matchingParamIds.has(n.id) || connectedEventIds.has(n.id)
    );
    return { filteredNodes: keptNodes, filteredEdges: keptEdges };
  }, [schema, categoryFilter]);

  const selectedNode =
    schema.nodes.find((n) => n.id === selectedNodeId) || null;

  const handleCopyDoc = (kind: 'mermaid' | 'markdown') => {
    const content = kind === 'mermaid' ? schema.mermaidDiagram : schema.markdownDoc;
    navigator.clipboard.writeText(content);
    setCopiedType(kind);
    setTimeout(() => setCopiedType(null), 1800);
  };

  const handleDownloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Visual Dependency Graph Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                GA4 Event Taxonomy &amp; Parameter Dependency Schema
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {schema.eventCount} events mapped to {schema.uniqueParamCount} parameter dependencies ·{' '}
              <span
                className={
                  schema.missingDependencyLinks > 0
                    ? 'text-red-600 dark:text-red-400 font-medium'
                    : 'text-emerald-700 dark:text-emerald-400 font-medium'
                }
              >
                {schema.missingDependencyLinks} missing links
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                handleDownloadFile(
                  schema.svgDiagram,
                  'ga4-taxonomy-schema.svg',
                  'image/svg+xml;charset=utf-8'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download SVG Schema
            </button>
            <button
              type="button"
              onClick={() =>
                handleDownloadFile(
                  schema.markdownDoc,
                  'ga4-taxonomy-documentation.md',
                  'text/markdown;charset=utf-8'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              Export Markdown Spec
            </button>
          </div>
        </div>

        {/* Dependency Category Filter Strip */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              Solid Green: Satisfied
            </span>
            <span className="text-red-600 dark:text-red-400 font-medium">
              Dashed Red: Missing Param
            </span>
            <span className="text-orange-600 dark:text-orange-400 font-medium">
              Orange: Co-Dependency
            </span>
          </div>
        </div>

        {/* React Flow Interactive Canvas */}
        <div className="h-[480px] w-full bg-slate-50/60 dark:bg-slate-950/60">
          {events.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
              Add events to the taxonomy to generate the visual dependency schema.
            </div>
          ) : (
            <ReactFlow
              nodes={filteredNodes}
              edges={filteredEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.14 }}
              minZoom={0.4}
              maxZoom={1.5}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              proOptions={{ hideAttribution: true }}
            >
              <Background color={isDark ? '#1E293B' : '#CBD5E1'} gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>

        {/* Selected Node Dependency Detail Bar */}
        {selectedNode && (
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
            {selectedNode.data.kind === 'event' ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {selectedNode.data.eventName}
                  </span>
                  <span className="mx-2 text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Stage: {selectedNode.data.funnelStage} · {selectedNode.data.presentCount}/
                    {selectedNode.data.requiredCount} parameters satisfied
                  </span>
                </div>
                {selectedNode.data.missingParams.length > 0 && (
                  <span className="font-mono text-red-600 dark:text-red-400">
                    Missing: {selectedNode.data.missingParams.join(', ')}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {selectedNode.data.paramName}
                  </span>
                  <span className="mx-2 text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-600 dark:text-slate-400">
                    {selectedNode.data.documentationRule}
                  </span>
                </div>
                <span className="font-mono text-slate-500 dark:text-slate-400">
                  Platforms: {selectedNode.data.downstreamPlatforms.join(', ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Documentation Spec & Export Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
            {(
              [
                { id: 'matrix', label: `Parameter Dependency Matrix (${schema.parameters.length})` },
                { id: 'mermaid', label: 'Mermaid Diagram' },
                { id: 'markdown', label: 'Markdown Tech Spec' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDocTab(t.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  docTab === t.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {docTab !== 'matrix' && (
            <button
              type="button"
              onClick={() => handleCopyDoc(docTab)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer self-start sm:self-auto"
            >
              {copiedType === docTab ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copiedType === docTab
                ? 'Copied to Clipboard'
                : docTab === 'mermaid'
                  ? 'Copy Mermaid'
                  : 'Copy Markdown'}
            </button>
          )}
        </div>

        {docTab === 'matrix' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Parameter Key</th>
                  <th className="py-2.5 px-4">Type &amp; Domain</th>
                  <th className="py-2.5 px-4">Co-Dependencies</th>
                  <th className="py-2.5 px-4">Required By Events</th>
                  <th className="py-2.5 px-4">Documentation Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {schema.parameters.map((param) => (
                  <tr
                    key={param.name}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-3 px-4 align-top font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {param.name}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-mono text-orange-600 dark:text-orange-400">
                        {param.dataType}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {param.category}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top font-mono text-slate-600 dark:text-slate-400">
                      {param.dependsOnParams.length > 0
                        ? param.dependsOnParams.join(', ')
                        : '—'}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-mono text-slate-800 dark:text-slate-200">
                        {param.requiredByEvents.join(', ')}
                      </div>
                      {param.missingInEvents.length > 0 && (
                        <div className="font-mono text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                          Missing in: {param.missingInEvents.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top text-slate-600 dark:text-slate-400 max-w-md">
                      {param.documentationRule}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {docTab === 'mermaid' && (
          <div className="p-4">
            <pre className="p-4 bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-xs font-mono overflow-x-auto max-h-96">
              {schema.mermaidDiagram}
            </pre>
          </div>
        )}

        {docTab === 'markdown' && (
          <div className="p-4">
            <pre className="p-4 bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-xs font-mono overflow-x-auto max-h-96">
              {schema.markdownDoc}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
