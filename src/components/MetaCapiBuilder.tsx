import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import {
  normalizeEmail,
  normalizePhoneE164,
  sha256Hex,
} from '../utils/cryptoAndPayloads';

const META_STANDARD_EVENTS = [
  'Purchase',
  'InitiateCheckout',
  'AddToCart',
  'ViewContent',
  'Lead',
  'CompleteRegistration',
];

type EndpointTarget = 'graph_api' | 'custom_sgtm';

export const MetaCapiBuilder: React.FC = () => {
  const [endpointTarget, setEndpointTarget] = useState<EndpointTarget>('graph_api');
  const [customEndpointUrl, setCustomEndpointUrl] = useState(
    'https://sgtm.northlineoutdoor.com/events/meta-capi'
  );
  const [pixelId, setPixelId] = useState('948102938471029');
  const [apiVersion, setApiVersion] = useState('v21.0');
  const [testEventCode, setTestEventCode] = useState('TEST48219');
  const [eventName, setEventName] = useState('Purchase');
  const [eventId, setEventId] = useState('evt_20261115_99412');
  const [eventTime, setEventTime] = useState(() => Math.floor(Date.now() / 1000));
  const [actionSource, setActionSource] = useState('website');
  const [eventSourceUrl, setEventSourceUrl] = useState(
    'https://northlineoutdoor.com/checkout/thank-you'
  );

  // Custom Data
  const [value, setValue] = useState(298.0);
  const [currency, setCurrency] = useState('USD');
  const [orderId, setOrderId] = useState('ORD-2026-98412');
  const [contentIds, setContentIds] = useState('SKU-4092, SKU-1184');

  // Raw PII & Click Identifiers
  const [rawEmail, setRawEmail] = useState('alex.morgan@company.com');
  const [rawPhone, setRawPhone] = useState('+14155550192');
  const [rawFirstName, setRawFirstName] = useState('Alex');
  const [rawLastName, setRawLastName] = useState('Morgan');
  const [fbp, setFbp] = useState('fb.1.1731682910.1928374650');
  const [fbc, setFbc] = useState('fb.1.1731682910.IwAR2x9Q8mLpZ7');
  const [clientIp, setClientIp] = useState('198.51.100.42');
  const [clientUa, setClientUa] = useState(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  );

  const [hashes, setHashes] = useState({
    em: '',
    ph: '',
    fn: '',
    ln: '',
  });

  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const normEm = normalizeEmail(rawEmail, true);
  const normPh = normalizePhoneE164(rawPhone);
  const normFn = rawFirstName.trim().toLowerCase();
  const normLn = rawLastName.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [em, ph, fn, ln] = await Promise.all([
        sha256Hex(normEm),
        sha256Hex(normPh.replace(/^\+/, '')), // Meta CAPI recommends digits-only country code + number without '+'
        sha256Hex(normFn),
        sha256Hex(normLn),
      ]);
      if (!cancelled) {
        setHashes({ em, ph, fn, ln });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normEm, normPh, normFn, normLn]);

  const fbpValid = /^fb\.\d+\.\d+\.\d+$/.test(fbp.trim());
  const fbcValid = !fbc.trim() || /^fb\.\d+\.\d+\.[A-Za-z0-9_-]+$/.test(fbc.trim());

  const capiPayload = useMemo(() => {
    const userData: Record<string, unknown> = {};
    if (hashes.em) userData.em = [hashes.em];
    if (hashes.ph) userData.ph = [hashes.ph];
    if (hashes.fn) userData.fn = [hashes.fn];
    if (hashes.ln) userData.ln = [hashes.ln];
    if (fbp.trim()) userData.fbp = fbp.trim();
    if (fbc.trim()) userData.fbc = fbc.trim();
    if (clientIp.trim()) userData.client_ip_address = clientIp.trim();
    if (clientUa.trim()) userData.client_user_agent = clientUa.trim();

    const parsedIds = contentIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: eventName,
          event_time: eventTime,
          event_id: eventId.trim(),
          action_source: actionSource,
          event_source_url: eventSourceUrl.trim(),
          user_data: userData,
          custom_data: {
            currency: currency.trim().toUpperCase(),
            value: Number(value) || 0,
            order_id: orderId.trim() || undefined,
            content_ids: parsedIds,
            content_type: 'product',
          },
        },
      ],
    };

    if (testEventCode.trim()) {
      body.test_event_code = testEventCode.trim();
    }

    return body;
  }, [
    hashes,
    fbp,
    fbc,
    clientIp,
    clientUa,
    eventName,
    eventTime,
    eventId,
    actionSource,
    eventSourceUrl,
    currency,
    value,
    orderId,
    contentIds,
    testEventCode,
  ]);

  const jsonString = useMemo(() => JSON.stringify(capiPayload, null, 2), [capiPayload]);

  const curlCommand = useMemo(() => {
    const endpoint =
      endpointTarget === 'graph_api'
        ? `https://graph.facebook.com/${apiVersion}/${pixelId.trim() || 'PIXEL_ID'}/events?access_token=<META_CAPI_ACCESS_TOKEN>`
        : customEndpointUrl.trim() || 'https://sgtm.example.com/events/meta-capi';
    const singleLine = JSON.stringify(capiPayload).replace(/'/g, `'\\''`);
    const headerLines =
      endpointTarget === 'custom_sgtm'
        ? `  -H "Content-Type: application/json" \\\n  -H "X-GTM-Server-Preview: <OPTIONAL_PREVIEW_HEADER>" \\\n`
        : `  -H "Content-Type: application/json" \\\n`;
    return `curl -i -X POST \\\n${headerLines}  -d '${singleLine}' \\\n  "${endpoint}"`;
  }, [endpointTarget, customEndpointUrl, apiVersion, pixelId, capiPayload]);

  const handleRefreshIds = () => {
    const suffix = Math.floor(10000 + Math.random() * 89999);
    setEventId(`evt_${Date.now().toString().slice(-6)}_${suffix}`);
    setEventTime(Math.floor(Date.now() / 1000));
  };

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlCommand);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  // Match quality signals
  const matchSignalsReady = [
    Boolean(hashes.em),
    Boolean(hashes.ph),
    Boolean(fbp.trim() && fbpValid),
    Boolean(fbc.trim() && fbcValid),
    Boolean(clientIp.trim() && clientUa.trim()),
  ].filter(Boolean).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: CAPI Event & User Data Builder */}
      <div className="lg:col-span-6 space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Endpoint &amp; Event Configuration
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshIds}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                New Event ID
              </button>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {endpointTarget === 'graph_api' ? `Graph API ${apiVersion}` : 'sGTM Server Endpoint'}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start shrink-0">
              <button
                type="button"
                onClick={() => setEndpointTarget('graph_api')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  endpointTarget === 'graph_api'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Meta Graph API
              </button>
              <button
                type="button"
                onClick={() => setEndpointTarget('custom_sgtm')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  endpointTarget === 'custom_sgtm'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Custom Server Endpoint
              </button>
            </div>

            {endpointTarget === 'custom_sgtm' && (
              <input
                type="url"
                value={customEndpointUrl}
                onChange={(e) => setCustomEndpointUrl(e.target.value)}
                aria-label="Custom server-side CAPI endpoint URL"
                placeholder="https://sgtm.yourdomain.com/events/meta-capi"
                className="flex-1 min-w-0 px-2.5 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Pixel / Dataset ID</label>
              <input
                type="text"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Test Event Code</label>
              <input
                type="text"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="TEST12345"
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">API Version</label>
              <select
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
              >
                <option value="v21.0">v21.0</option>
                <option value="v20.0">v20.0</option>
                <option value="v19.0">v19.0</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Standard Event Name</label>
              <select
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
              >
                {META_STANDARD_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                event_id (Browser Dedup Key)
              </label>
              <input
                type="text"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">action_source</label>
              <select
                value={actionSource}
                onChange={(e) => setActionSource(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
              >
                <option value="website">website</option>
                <option value="system_generated">system_generated</option>
                <option value="app">app</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">event_source_url</label>
              <input
                type="text"
                value={eventSourceUrl}
                onChange={(e) => setEventSourceUrl(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">value</label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 font-mono tabular-nums bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">order_id</label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">content_ids</label>
              <input
                type="text"
                value={contentIds}
                onChange={(e) => setContentIds(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
              />
            </div>
          </div>
        </div>

        {/* User Data & PII Hashing Inputs */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Customer Information Parameters (user_data)
            </h2>
            <span className="font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
              {matchSignalsReady}/5 EMQ Signals Present
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Email (hashed to em)', val: rawEmail, set: setRawEmail },
              { label: 'Phone (hashed to ph)', val: rawPhone, set: setRawPhone },
              { label: 'First Name (fn)', val: rawFirstName, set: setRawFirstName },
              { label: 'Last Name (ln)', val: rawLastName, set: setRawLastName },
              { label: '_fbp Browser ID (unhashed)', val: fbp, set: setFbp },
              { label: '_fbc Click ID (unhashed)', val: fbc, set: setFbc },
              { label: 'client_ip_address', val: clientIp, set: setClientIp },
              { label: 'client_user_agent', val: clientUa, set: setClientUa },
            ].map((field) => (
              <div key={field.label}>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  {field.label}
                </label>
                <input
                  type="text"
                  value={field.val}
                  onChange={(e) => field.set(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Hashed PII Visualizer, JSON Preview, and cURL Command */}
      <div className="lg:col-span-6 space-y-6">
        {/* Hashed PII & Cookie Visualization Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Required PII Hashes &amp; Cookie Format Check
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">SHA-256 Lowercase Hex</span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {[
              {
                key: 'em',
                label: 'Email (em)',
                value: hashes.em || '(empty)',
                valid: Boolean(hashes.em),
                note: normEm || 'Empty',
              },
              {
                key: 'ph',
                label: 'Phone (ph)',
                value: hashes.ph || '(empty)',
                valid: Boolean(hashes.ph),
                note: normPh.replace(/^\+/, '') || 'Empty',
              },
              {
                key: 'fn',
                label: 'First Name (fn)',
                value: hashes.fn || '(empty)',
                valid: Boolean(hashes.fn),
                note: normFn || 'Empty',
              },
              {
                key: 'ln',
                label: 'Last Name (ln)',
                value: hashes.ln || '(empty)',
                valid: Boolean(hashes.ln),
                note: normLn || 'Empty',
              },
              {
                key: 'fbp',
                label: 'Browser Cookie (fbp)',
                value: fbp.trim() || '(missing)',
                valid: fbpValid,
                note: fbpValid ? 'Valid fb.1.<ts>.<id> format' : 'Expected fb.1.<timestamp>.<random>',
              },
              {
                key: 'fbc',
                label: 'Click Cookie (fbc)',
                value: fbc.trim() || '(optional — no fbclid)',
                valid: fbcValid,
                note: fbcValid ? 'Valid fb.1.<ts>.<fbclid> format' : 'Expected fb.1.<timestamp>.<fbclid>',
              },
            ].map((item) => (
              <div key={item.key} className="px-5 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{item.label}</span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      item.valid
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {item.valid ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {item.note}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Generated cURL Command */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Terminal className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              Server-Side Test cURL Command
            </span>
            <button
              type="button"
              onClick={handleCopyCurl}
              className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 cursor-pointer"
            >
              {copiedCurl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCurl ? 'Copied cURL' : 'Copy cURL'}
            </button>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
            {curlCommand}
          </pre>
        </div>

        {/* Formatted JSON Payload */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Constructed CAPI JSON Body
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              {copiedJson ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedJson ? 'Copied JSON' : 'Copy JSON'}
            </button>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-72">
            {jsonString}
          </pre>
        </div>
      </div>
    </div>
  );
};
