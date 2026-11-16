import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ConsentState,
  SimulatedNetworkRequest,
} from '../types/tracking';
import {
  buildSimulatedRequests,
  encodeGcdParameter,
  encodeGoogleConsentString,
  normalizeEmail,
  normalizePhoneE164,
  sha256Hex,
} from '../utils/cryptoAndPayloads';
import { MetaCapiBuilder } from './MetaCapiBuilder';
import { DataLayerInspector } from './DataLayerInspector';

type DebugSubTool = 'stream' | 'capi-builder' | 'datalayer-inspector';

const EVENT_TEMPLATES = [
  { eventName: 'view_item', label: 'view_item', value: 149.0 },
  { eventName: 'add_to_cart', label: 'add_to_cart', value: 149.0 },
  { eventName: 'begin_checkout', label: 'begin_checkout', value: 298.0 },
  { eventName: 'purchase', label: 'purchase', value: 298.0 },
  { eventName: 'generate_lead', label: 'generate_lead', value: 250.0 },
  { eventName: 'qualified_lead', label: 'qualified_lead (OCI)', value: 2000.0 },
];

export const EventSimulator: React.FC = () => {
  const [subTool, setSubTool] = useState<DebugSubTool>('stream');
  const [consent, setConsent] = useState<ConsentState>({
    ad_storage: 'granted',
    analytics_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
  });

  const [eventName, setEventName] = useState('purchase');
  const [eventId, setEventId] = useState('evt_20261115_99412');
  const [includeEventIdInPixel, setIncludeEventIdInPixel] = useState(true);
  const [includeEventIdInCapi, setIncludeEventIdInCapi] = useState(true);
  const [transactionId, setTransactionId] = useState('ORD-2026-98412');
  const [value, setValue] = useState(298.0);
  const [currency, setCurrency] = useState('USD');

  const [rawEmail, setRawEmail] = useState('Alex.Morgan+promo@gmail.com');
  const [rawPhone, setRawPhone] = useState('(415) 555-0192');
  const [stripGmailDots, setStripGmailDots] = useState(true);
  const [emailHash, setEmailHash] = useState('');
  const [phoneHash, setPhoneHash] = useState('');

  const [gclid, setGclid] = useState('Cj0KCQiA57G5BhDUARIsACgCYnwp8K1v');
  const [fbp, setFbp] = useState('fb.1.1731682910.1928374650');

  const [platforms, setPlatforms] = useState({
    ga4: true,
    googleAds: true,
    metaPixel: true,
    metaCapi: true,
    linkedIn: false,
  });

  const [requests, setRequests] = useState<SimulatedNetworkRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const normalizedEmail = normalizeEmail(rawEmail, stripGmailDots);
  const normalizedPhone = normalizePhoneE164(rawPhone);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [emH, phH] = await Promise.all([
        sha256Hex(normalizedEmail),
        sha256Hex(normalizedPhone),
      ]);
      if (!cancelled) {
        setEmailHash(emH);
        setPhoneHash(phH);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedEmail, normalizedPhone]);

  const gcs = encodeGoogleConsentString(consent);
  const gcd = encodeGcdParameter(consent);

  const handleFireEvent = () => {
    const hits = buildSimulatedRequests(
      {
        eventName,
        eventId,
        includeEventIdInCapi,
        includeEventIdInPixel,
        transactionId,
        value,
        currency,
        emailHash,
        phoneHash,
        gclid,
        fbp,
        fbc: `fb.1.${Date.now()}.IwAR2x9Q`,
        pageLocation: 'https://northlineoutdoor.com/checkout/thank-you',
        itemName: 'Alpine Shell Jacket',
        itemId: 'SKU-4092',
      },
      consent,
      platforms
    );
    setRequests((prev) => [...hits, ...prev].slice(0, 40));
    if (hits.length > 0) {
      setSelectedRequestId(hits[0].id);
    }
  };

  const regenerateIds = () => {
    const suffix = Math.floor(10000 + Math.random() * 89999);
    setEventId(`evt_20261115_${suffix}`);
    setTransactionId(`ORD-2026-${suffix}`);
  };

  const selectedRequest =
    requests.find((r) => r.id === selectedRequestId) || requests[0] || null;

  const dedupStatus = (() => {
    if (!platforms.metaPixel || !platforms.metaCapi) {
      return {
        ok: true,
        label: 'Single-Channel Mode',
        detail: 'Enable both Meta Pixel and Meta CAPI to test cross-channel deduplication.',
      };
    }
    if (consent.ad_storage === 'denied') {
      return {
        ok: true,
        label: 'Consent Suppressed',
        detail: 'ad_storage=denied blocks Pixel execution and suppresses PII CAPI dispatch.',
      };
    }
    if (includeEventIdInPixel && includeEventIdInCapi) {
      return {
        ok: true,
        label: 'Deduplication Verified (0 Double-Counts)',
        detail: `Browser Pixel and Server CAPI share matching event_id (${eventId}). Meta collapses into 1 conversion.`,
      };
    }
    return {
      ok: false,
      label: 'Double-Counting Risk Detected',
      detail: 'Missing event_id on either Browser Pixel or Server CAPI causes Meta to count this conversion twice (2x inflation).',
    };
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            DataLayer &amp; CAPI Signal Debugger
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Verify Consent Mode v2 gating, build Meta CAPI payloads with SHA-256 PII, and validate raw window.dataLayer ecommerce arrays.
          </p>
        </div>
        {subTool === 'stream' && (
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={regenerateIds}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              New Event ID
            </button>
            <button
              type="button"
              onClick={handleFireEvent}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              Dispatch Test Event
            </button>
          </div>
        )}
      </div>

      {/* Segmented Tool Switcher */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        {(
          [
            { id: 'stream', label: 'Live Signal Stream' },
            { id: 'capi-builder', label: 'Meta CAPI Payload Builder' },
            { id: 'datalayer-inspector', label: 'DataLayer Inspector' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTool(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTool === tab.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTool === 'capi-builder' && <MetaCapiBuilder />}

      {subTool === 'datalayer-inspector' && <DataLayerInspector />}

      {subTool === 'stream' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Consent Mode v2 & Event Payload Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Consent Mode v2 Panel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Consent Mode v2 Signals
              </h2>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                gcs={gcs} · gcd={gcd}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  'ad_storage',
                  'analytics_storage',
                  'ad_user_data',
                  'ad_personalization',
                ] as const
              ).map((key) => {
                const granted = consent[key] === 'granted';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setConsent((prev) => ({
                        ...prev,
                        [key]: prev[key] === 'granted' ? 'denied' : 'granted',
                      }))
                    }
                    className={`flex items-center justify-between px-3 py-2 text-xs border rounded-md transition-colors cursor-pointer ${
                      granted
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-slate-900 dark:text-slate-100'
                        : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className="font-mono truncate mr-2">{key}</span>
                    <span
                      className={`font-medium shrink-0 ${
                        granted ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {consent[key]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                type="button"
                onClick={() =>
                  setConsent({
                    ad_storage: 'granted',
                    analytics_storage: 'granted',
                    ad_user_data: 'granted',
                    ad_personalization: 'granted',
                  })
                }
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline cursor-pointer"
              >
                Grant All (Opt-In)
              </button>
              <button
                type="button"
                onClick={() =>
                  setConsent({
                    ad_storage: 'denied',
                    analytics_storage: 'denied',
                    ad_user_data: 'denied',
                    ad_personalization: 'denied',
                  })
                }
                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline cursor-pointer"
              >
                Deny All (EEA Reject)
              </button>
            </div>
          </div>

          {/* Event & Deduplication Parameters */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Event Payload &amp; CAPI Deduplication
            </h2>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Event Name
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.eventName}
                      type="button"
                      onClick={() => {
                        setEventName(tpl.eventName);
                        setValue(tpl.value);
                      }}
                      className={`px-2.5 py-1.5 font-mono text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        eventName === tpl.eventName
                          ? 'bg-orange-600 text-white border-orange-600'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  event_id (Dedup Key)
                </label>
                <input
                  type="text"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  transaction_id
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Value
                </label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 font-mono tabular-nums text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Meta Dedup Switches */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-medium text-slate-700 dark:text-slate-300">
                Meta Pixel + Server CAPI Deduplication Test
              </div>
              <div className="flex flex-wrap gap-4 text-slate-700 dark:text-slate-300">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeEventIdInPixel}
                    onChange={(e) => setIncludeEventIdInPixel(e.target.checked)}
                    className="accent-orange-600"
                  />
                  <span>Send event_id in Browser Pixel</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeEventIdInCapi}
                    onChange={(e) => setIncludeEventIdInCapi(e.target.checked)}
                    className="accent-orange-600"
                  />
                  <span>Send event_id in Server CAPI</span>
                </label>
              </div>
              <div
                className={`p-3 rounded-md border text-xs ${
                  dedupStatus.ok
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-slate-800 dark:text-slate-200'
                    : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {dedupStatus.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  )}
                  {dedupStatus.label}
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400">{dedupStatus.detail}</p>
              </div>
            </div>

            {/* Target Platforms */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="font-medium text-slate-700 dark:text-slate-300 mb-2">Active Endpoints</div>
              <div className="flex flex-wrap gap-3 text-slate-700 dark:text-slate-300">
                {(
                  [
                    ['ga4', 'GA4'],
                    ['googleAds', 'Google Ads'],
                    ['metaPixel', 'Meta Pixel'],
                    ['metaCapi', 'Meta CAPI'],
                    ['linkedIn', 'LinkedIn'],
                  ] as const
                ).map(([k, lbl]) => (
                  <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platforms[k]}
                      onChange={(e) =>
                        setPlatforms((prev) => ({ ...prev, [k]: e.target.checked }))
                      }
                      className="accent-orange-600"
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Enhanced Conversions SHA-256 PII Normalizer */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Enhanced Conversions SHA-256 Hasher
              </h2>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stripGmailDots}
                  onChange={(e) => setStripGmailDots(e.target.checked)}
                  className="accent-orange-600"
                />
                <span>Strip Gmail dots</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Raw Customer Email
                </label>
                <input
                  type="text"
                  value={rawEmail}
                  onChange={(e) => setRawEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                  Normalized: {normalizedEmail || '(empty)'}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Raw Phone (E.164 Normalized)
                </label>
                <input
                  type="text"
                  value={rawPhone}
                  onChange={(e) => setRawPhone(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                  E.164: {normalizedPhone || '(empty)'}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-md space-y-1.5 text-[11px] font-mono">
              <div className="truncate text-slate-700 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400">sha256(em): </span>
                {emailHash}
              </div>
              <div className="truncate text-slate-700 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400">sha256(ph): </span>
                {phoneHash}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">GCLID</label>
                <input
                  type="text"
                  value={gclid}
                  onChange={(e) => setGclid(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">_fbp Cookie</label>
                <input
                  type="text"
                  value={fbp}
                  onChange={(e) => setFbp(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Dispatched Network Hits & Payload Inspector */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Tag Assistant Network Stream
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {requests.length} captured network hits
              </p>
            </div>
            {requests.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRequests([]);
                  setSelectedRequestId(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Log
              </button>
            )}
          </div>

          {requests.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No network requests captured yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Adjust Consent Mode v2 signals or event_id toggles on the left, then dispatch a test event to inspect GA4, Google Ads, Meta Pixel, and CAPI payloads.
              </p>
              <button
                type="button"
                onClick={handleFireEvent}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Dispatch Sample Purchase Event
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                {requests.map((req) => {
                  const isSelected = selectedRequest?.id === req.id;
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => setSelectedRequestId(req.id)}
                      className={`w-full text-left px-5 py-3 flex items-center justify-between gap-4 text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50/70 dark:bg-orange-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                          {req.timestamp}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100 w-24 shrink-0">
                          {req.platform}
                        </span>
                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                          {req.eventName}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-slate-500 dark:text-slate-400 hidden sm:inline">
                          {req.gcs}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            req.status === 'Dispatched'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : req.status === 'Cookieless Ping'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {req.status === 'Dispatched' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {req.status === 'Cookieless Ping' && (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {(req.status === 'Blocked by Consent' ||
                            req.status === 'Duplicate Risk') && (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          {req.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedRequest && (
                <div className="p-5 bg-slate-50 dark:bg-slate-950/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {selectedRequest.platform} Payload ·{' '}
                      <span className="font-mono text-slate-600 dark:text-slate-400">
                        {selectedRequest.endpoint}
                      </span>
                    </div>
                    <span className="font-mono text-slate-600 dark:text-slate-400">
                      event_id: {selectedRequest.eventId}
                    </span>
                  </div>
                  <pre className="p-4 bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-xs font-mono overflow-x-auto max-h-96">
                    {JSON.stringify(selectedRequest.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
