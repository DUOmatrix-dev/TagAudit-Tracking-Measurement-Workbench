import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { MeasurementWorkspace } from '../types/tracking';

interface AttributionInsightsProps {
  workspace: MeasurementWorkspace;
  isDark: boolean;
}

type HeatmapMetric = 'share' | 'revenue';

interface PathCell {
  xIndex: number;
  yIndex: number;
  stage: string;
  channel: string;
  sharePct: number;
  revenueUsd: number;
  conversions: number;
  avgDaysToConvert: number;
}

const STAGES = [
  'First Touch',
  'Early Assist',
  'Mid Funnel',
  'Pre-Convert',
  'Last Touch',
];

const CHANNELS = [
  'Organic / Direct',
  'LinkedIn Ads',
  'Paid Social (Meta)',
  'Paid Search (Non-Brand)',
  'Paid Search (Brand)',
];

function getHeatColor(intensity: number, isDark: boolean): string {
  if (intensity >= 0.8) return '#9A3412';
  if (intensity >= 0.6) return '#EA580C';
  if (intensity >= 0.4) return '#FB923C';
  if (intensity >= 0.2) return isDark ? '#9A3412' : '#FDBA74';
  return isDark ? '#1E293B' : '#FFF7ED';
}

function getHeatTextColor(intensity: number, isDark: boolean): string {
  if (isDark) {
    return intensity >= 0.2 ? '#FFFFFF' : '#CBD5E1';
  }
  return intensity >= 0.55 ? '#FFFFFF' : '#431407';
}

export const AttributionInsights: React.FC<AttributionInsightsProps> = ({
  workspace,
  isDark,
}) => {
  const [metric, setMetric] = useState<HeatmapMetric>('share');

  const matrixData: PathCell[] = useMemo(() => {
    const isB2B = workspace.id === 'b2b-leadgen';
    const isBroken = workspace.id === 'broken-migration';

    // Channel x Stage realistic attribution weights
    // Rows match CHANNELS order: 0=Organic/Direct, 1=LinkedIn, 2=Meta, 3=Search Non-Brand, 4=Search Brand
    const shareMatrix: number[][] = isB2B
      ? [
          [11, 14, 18, 21, 19], // Organic / Direct
          [34, 29, 22, 12, 8],  // LinkedIn Ads (strong top/mid assist)
          [22, 24, 19, 14, 9],  // Paid Social (Meta)
          [26, 23, 27, 29, 24], // Paid Search (Non-Brand)
          [7, 10, 14, 24, 40],  // Paid Search (Brand - high closer)
        ]
      : isBroken
        ? [
            [18, 22, 26, 31, 38], // Direct/Organic inflated by unattributed click loss
            [2, 3, 2, 1, 1],      // LinkedIn
            [39, 34, 28, 19, 15], // Paid Social (Meta over-counted)
            [29, 26, 25, 22, 17], // Paid Search (Non-Brand)
            [12, 15, 19, 27, 29], // Paid Search (Brand)
          ]
        : [
            [12, 14, 16, 19, 21], // Organic / Direct
            [4, 5, 4, 3, 2],      // LinkedIn Ads
            [38, 35, 26, 18, 14], // Paid Social (Meta - strong discovery)
            [34, 31, 33, 30, 25], // Paid Search (Non-Brand)
            [12, 15, 21, 30, 38], // Paid Search (Brand - high closer)
          ];

    const baseTotalConv = workspace.defaultTrafficSettings.monthlyConversions;
    const avgOrderValue = isB2B ? 2000 : isBroken ? 90 : 147;

    const cells: PathCell[] = [];
    for (let y = 0; y < CHANNELS.length; y++) {
      for (let x = 0; x < STAGES.length; x++) {
        const sharePct = shareMatrix[y][x];
        const conversions = Math.round((baseTotalConv * sharePct) / 100);
        const revenueUsd = conversions * avgOrderValue;
        cells.push({
          xIndex: x,
          yIndex: y,
          stage: STAGES[x],
          channel: CHANNELS[y],
          sharePct,
          revenueUsd,
          conversions,
          avgDaysToConvert: isB2B ? 18 + (4 - x) * 6 : 3 + (4 - x) * 2,
        });
      }
    }
    return cells;
  }, [workspace]);

  const maxVal = useMemo(() => {
    return Math.max(
      1,
      ...matrixData.map((d) => (metric === 'share' ? d.sharePct : d.revenueUsd))
    );
  }, [matrixData, metric]);

  const topAssistChannel = useMemo(() => {
    const firstTouches = matrixData.filter((d) => d.xIndex === 0);
    return firstTouches.sort((a, b) => b.sharePct - a.sharePct)[0];
  }, [matrixData]);

  const topCloserChannel = useMemo(() => {
    const lastTouches = matrixData.filter((d) => d.xIndex === 4);
    return lastTouches.sort((a, b) => b.sharePct - a.sharePct)[0];
  }, [matrixData]);

  // Custom Recharts Scatter shape rendering crisp rectangular heatmap tiles
  const renderHeatmapCell = (props: unknown) => {
    const { cx, cy, payload } = props as {
      cx?: number;
      cy?: number;
      payload?: PathCell;
    };
    if (cx === undefined || cy === undefined || !payload) return <g />;

    const val = metric === 'share' ? payload.sharePct : payload.revenueUsd;
    const intensity = Math.min(1, val / maxVal);
    const fill = getHeatColor(intensity, isDark);
    const textColor = getHeatTextColor(intensity, isDark);
    const cellW = 108;
    const cellH = 38;
    const displayLabel =
      metric === 'share'
        ? `${payload.sharePct}%`
        : `$${Math.round(payload.revenueUsd / 1000)}k`;

    return (
      <g>
        <rect
          x={cx - cellW / 2}
          y={cy - cellH / 2}
          width={cellW}
          height={cellH}
          rx={5}
          fill={fill}
          stroke={isDark ? '#0F172A' : '#FFFFFF'}
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fill={textColor}
          fontSize={11}
          fontWeight={600}
          fontFamily="JetBrains Mono, monospace"
        >
          {displayLabel}
        </text>
      </g>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Attribution Insights — Conversion Path Heatmap
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Simulated multi-touch conversion path distribution across funnel touchpoints (Data-Driven Attribution model)
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setMetric('share')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                metric === 'share'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Path Share %
            </button>
            <button
              type="button"
              onClick={() => setMetric('revenue')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                metric === 'revenue'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Attributed Revenue
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Recharts Heatmap Matrix */}
        <div className="lg:col-span-9 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 14, right: 20, bottom: 10, left: 115 }}>
              <XAxis
                type="number"
                dataKey="xIndex"
                domain={[-0.5, 4.5]}
                ticks={[0, 1, 2, 3, 4]}
                tickFormatter={(idx) => STAGES[idx] || ''}
                tick={{
                  fill: isDark ? '#94A3B8' : '#475569',
                  fontSize: 11,
                  fontFamily: 'Public Sans, sans-serif',
                }}
                axisLine={false}
                tickLine={false}
                orientation="top"
              />
              <YAxis
                type="number"
                dataKey="yIndex"
                domain={[-0.5, 4.5]}
                ticks={[0, 1, 2, 3, 4]}
                tickFormatter={(idx) => CHANNELS[idx] || ''}
                tick={{
                  fill: isDark ? '#E2E8F0' : '#0F172A',
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: 'Public Sans, sans-serif',
                }}
                axisLine={false}
                tickLine={false}
              />
              <ZAxis type="number" dataKey="sharePct" range={[100, 100]} />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const cell = payload[0].payload as PathCell;
                  return (
                    <div className="bg-slate-900 dark:bg-slate-950 border border-slate-700 text-white px-3.5 py-2.5 rounded-md shadow-md text-xs space-y-1">
                      <div className="font-semibold">
                        {cell.channel} · {cell.stage}
                      </div>
                      <div className="font-mono tabular-nums text-slate-200">
                        Path Share: {cell.sharePct}% ({cell.conversions.toLocaleString()} conv)
                      </div>
                      <div className="font-mono tabular-nums text-orange-300">
                        Attributed Value: ${cell.revenueUsd.toLocaleString()}
                      </div>
                      <div className="text-slate-400">
                        Median lag to convert: {cell.avgDaysToConvert} days
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter data={matrixData} shape={renderHeatmapCell} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Right Side: Legend & Key Path Takeaways */}
        <div className="lg:col-span-3 space-y-4 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 pt-4 lg:pt-0 lg:pl-5 text-xs">
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-300 mb-2">Intensity Scale</div>
            <div className="flex items-center gap-1">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((lvl) => (
                <span
                  key={lvl}
                  className="h-3 flex-1 rounded-xs border border-slate-200 dark:border-slate-700"
                  style={{ backgroundColor: getHeatColor(lvl, isDark) }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
              <span>Low (0%)</span>
              <span>High ({maxVal === 1 ? '100%' : metric === 'share' ? `${maxVal}%` : `$${Math.round(maxVal / 1000)}k`})</span>
            </div>
          </div>

          {topAssistChannel && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Top First-Touch Opener</div>
              <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                {topAssistChannel.channel}
              </div>
              <div className="font-mono tabular-nums text-orange-700 dark:text-orange-400 mt-0.5">
                {topAssistChannel.sharePct}% of initial touches
              </div>
            </div>
          )}

          {topCloserChannel && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">Top Last-Touch Closer</div>
              <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                {topCloserChannel.channel}
              </div>
              <div className="font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {topCloserChannel.sharePct}% of final conversions
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
