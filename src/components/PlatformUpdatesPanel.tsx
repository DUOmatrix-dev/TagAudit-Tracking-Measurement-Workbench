import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  RefreshCw,
  Search,
} from 'lucide-react';

interface GroundedSource {
  title: string;
  uri: string;
}

interface UpdatesResult {
  topic: string;
  summary: string;
  sources: GroundedSource[];
  fetchedAt: string;
}

const TOPICS = [
  { id: 'all', label: 'All GTM & GA4' },
  { id: 'gtm', label: 'Google Tag Manager' },
  { id: 'ga4', label: 'GA4 & Measurement' },
  { id: 'consent', label: 'Consent Mode v2' },
] as const;

export const PlatformUpdatesPanel: React.FC = () => {
  const [topic, setTopic] = useState<'all' | 'gtm' | 'ga4' | 'consent'>('all');
  const [customQuery, setCustomQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UpdatesResult | null>(null);

  const handleFetchUpdates = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/platform-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          query: customQuery.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      setResult(data as UpdatesResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to retrieve platform documentation updates.'
      );
    } finally {
      setLoading(false);
    }
  };

  const lines = useMemoLines(result?.summary || '');

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Platform Documentation &amp; Spec Updates
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live Google Search grounding for latest GTM, GA4, sGTM, and Consent Mode v2 documentation changes
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          {TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTopic(t.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                topic === t.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Query Bar */}
      <form
        onSubmit={handleFetchUpdates}
        className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
      >
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Optional focus (e.g. Google tag gateway, GA4 key events, TCF v2.2)..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Searching Docs...' : 'Fetch Latest Updates'}
        </button>
      </form>

      {/* Body States: Loading / Error / Empty / Grounded Result */}
      <div className="p-5">
        {loading && (
          <div className="space-y-2.5 animate-pulse" aria-busy="true">
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-full" />
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
            <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
          </div>
        )}

        {!loading && error && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-md text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Unable to fetch grounded documentation updates</div>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && !result && (
          <div className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
            <span>
              Query live Google Search documentation for recent changes to GTM containers, GA4 event schemas, and Consent Mode v2 requirements.
            </span>
            <button
              type="button"
              onClick={() => handleFetchUpdates()}
              className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              Check Current Releases
            </button>
          </div>
        )}

        {!loading && !error && result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                Grounded Summary · Topic: <strong className="text-slate-700 dark:text-slate-300">{TOPICS.find((t) => t.id === result.topic)?.label || result.topic}</strong>
              </span>
              <span className="font-mono tabular-nums">
                Updated {new Date(result.fetchedAt).toLocaleTimeString()}
              </span>
            </div>

            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-orange-600 dark:text-orange-400 font-bold mt-0.5">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {result.sources.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Verified Search Sources ({result.sources.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {result.sources.slice(0, 6).map((src, idx) => (
                    <a
                      key={idx}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md text-slate-800 dark:text-slate-200 hover:border-orange-500 dark:hover:border-orange-500 transition-colors"
                    >
                      <span className="truncate font-medium">{src.title}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function useMemoLines(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean);
}
