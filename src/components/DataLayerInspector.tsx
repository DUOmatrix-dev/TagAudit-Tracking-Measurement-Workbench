import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  XCircle,
} from 'lucide-react';

const SAMPLE_VALID_DATALAYER = JSON.stringify(
  [
    { ecommerce: null },
    {
      event: 'view_item',
      event_id: 'evt_vi_10492',
      ecommerce: {
        currency: 'USD',
        value: 149.0,
        items: [
          {
            item_id: 'SKU-4092',
            item_name: 'Alpine Shell Jacket',
            price: 149.0,
            quantity: 1,
          },
        ],
      },
    },
    { ecommerce: null },
    {
      event: 'purchase',
      event_id: 'evt_pur_98412',
      ecommerce: {
        transaction_id: 'ORD-2026-98412',
        value: 149.0,
        currency: 'USD',
        tax: 11.92,
        shipping: 0,
        items: [
          {
            item_id: 'SKU-4092',
            item_name: 'Alpine Shell Jacket',
            price: 149.0,
            quantity: 1,
          },
        ],
      },
    },
  ],
  null,
  2
);

const SAMPLE_BROKEN_DATALAYER = JSON.stringify(
  [
    {
      event: 'add_to_cart',
      ecommerce: {
        items: [{ item_name: 'Trail Boots' }],
      },
    },
    {
      event: 'begin_checkout',
      ecommerce: {
        currency: 'USD',
        value: 220,
        items: [{ item_id: 'SKU-771', item_name: 'Trail Boots', price: 220, quantity: 1 }],
      },
    },
    {
      event: 'purchase',
      ecommerce: {
        value: '220.00',
        items: [],
      },
    },
  ],
  null,
  2
);

const ECOMMERCE_EVENT_SPECS: Record<
  string,
  {
    requiredEcommerceKeys: string[];
    requiredItemKeys: string[];
    requireDedupEventId: boolean;
  }
> = {
  view_item: {
    requiredEcommerceKeys: ['currency', 'value', 'items'],
    requiredItemKeys: ['item_id', 'item_name'],
    requireDedupEventId: true,
  },
  add_to_cart: {
    requiredEcommerceKeys: ['currency', 'value', 'items'],
    requiredItemKeys: ['item_id', 'item_name', 'price', 'quantity'],
    requireDedupEventId: true,
  },
  begin_checkout: {
    requiredEcommerceKeys: ['currency', 'value', 'items'],
    requiredItemKeys: ['item_id', 'item_name', 'price', 'quantity'],
    requireDedupEventId: true,
  },
  add_shipping_info: {
    requiredEcommerceKeys: ['currency', 'value', 'items'],
    requiredItemKeys: ['item_id', 'item_name'],
    requireDedupEventId: false,
  },
  add_payment_info: {
    requiredEcommerceKeys: ['currency', 'value', 'items'],
    requiredItemKeys: ['item_id', 'item_name'],
    requireDedupEventId: false,
  },
  purchase: {
    requiredEcommerceKeys: ['transaction_id', 'value', 'currency', 'items'],
    requiredItemKeys: ['item_id', 'item_name', 'price', 'quantity'],
    requireDedupEventId: true,
  },
  generate_lead: {
    requiredEcommerceKeys: ['value', 'currency'],
    requiredItemKeys: [],
    requireDedupEventId: true,
  },
};

interface EventValidationResult {
  index: number;
  eventName: string;
  status: 'pass' | 'warning' | 'fail';
  missingKeys: string[];
  warnings: string[];
  presentKeys: string[];
  rawObject: Record<string, unknown>;
}

export const DataLayerInspector: React.FC = () => {
  const [rawInput, setRawInput] = useState(SAMPLE_BROKEN_DATALAYER);

  const analysis = useMemo(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawInput);
    } catch (err) {
      return {
        parseError: err instanceof Error ? err.message : 'Invalid JSON syntax',
        results: [] as EventValidationResult[],
      };
    }

    if (!Array.isArray(parsed)) {
      return {
        parseError: 'Input must be a JSON array matching window.dataLayer (e.g. [{ "event": "purchase", ... }]).',
        results: [] as EventValidationResult[],
      };
    }

    const results: EventValidationResult[] = [];
    let sawEcommerceClear = false;
    let sawPriorEcommerceEvent = false;

    parsed.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const obj = entry as Record<string, unknown>;

      if (obj.ecommerce === null && !obj.event) {
        sawEcommerceClear = true;
        return;
      }

      const eventName = typeof obj.event === 'string' ? obj.event : '';
      if (!eventName) return;

      const spec = ECOMMERCE_EVENT_SPECS[eventName];
      const missingKeys: string[] = [];
      const warnings: string[] = [];
      const presentKeys: string[] = [];

      if (!spec) {
        results.push({
          index: idx,
          eventName,
          status: 'pass',
          missingKeys: [],
          warnings: ['Custom non-ecommerce event — skipped standard GA4 ecommerce schema checks.'],
          presentKeys: Object.keys(obj),
          rawObject: obj,
        });
        return;
      }

      const ecom =
        obj.ecommerce && typeof obj.ecommerce === 'object' && !Array.isArray(obj.ecommerce)
          ? (obj.ecommerce as Record<string, unknown>)
          : null;

      if (eventName !== 'generate_lead') {
        if (sawPriorEcommerceEvent && !sawEcommerceClear) {
          warnings.push('Missing "{ ecommerce: null }" reset push prior to this ecommerce event (risk of stale item leakage).');
        }
        sawPriorEcommerceEvent = true;
        sawEcommerceClear = false;
      }

      if (!ecom && eventName !== 'generate_lead') {
        missingKeys.push('ecommerce');
        spec.requiredEcommerceKeys.forEach((k) => missingKeys.push(`ecommerce.${k}`));
      } else {
        const container = ecom || obj;
        for (const reqKey of spec.requiredEcommerceKeys) {
          const val = container[reqKey];
          const prefix = ecom ? 'ecommerce.' : '';
          if (val === undefined || val === null || val === '') {
            missingKeys.push(`${prefix}${reqKey}`);
          } else if (reqKey === 'items') {
            if (!Array.isArray(val) || val.length === 0) {
              missingKeys.push(`${prefix}items (non-empty array)`);
            } else {
              presentKeys.push(`${prefix}items[${val.length}]`);
              const firstItem = val[0] as Record<string, unknown>;
              if (firstItem && typeof firstItem === 'object') {
                for (const itemKey of spec.requiredItemKeys) {
                  if (
                    firstItem[itemKey] === undefined ||
                    firstItem[itemKey] === null ||
                    firstItem[itemKey] === ''
                  ) {
                    missingKeys.push(`items[0].${itemKey}`);
                  }
                }
              }
            }
          } else {
            presentKeys.push(`${prefix}${reqKey}`);
            if (reqKey === 'value' && typeof val !== 'number') {
              warnings.push(`${prefix}value should be a number, received ${typeof val}.`);
            }
            if (reqKey === 'currency' && (typeof val !== 'string' || !/^[A-Z]{3}$/.test(val))) {
              warnings.push(`${prefix}currency should be a 3-letter ISO-4217 string (e.g. "USD").`);
            }
          }
        }
      }

      if (spec.requireDedupEventId && !obj.event_id) {
        warnings.push('Missing root "event_id" for Meta Pixel / CAPI deduplication.');
      } else if (obj.event_id) {
        presentKeys.push('event_id');
      }

      const status: EventValidationResult['status'] =
        missingKeys.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass';

      results.push({
        index: idx,
        eventName,
        status,
        missingKeys,
        warnings,
        presentKeys,
        rawObject: obj,
      });
    });

    return { parseError: null, results };
  }, [rawInput]);

  const passCount = analysis.results.filter((r) => r.status === 'pass').length;
  const failCount = analysis.results.filter((r) => r.status === 'fail').length;
  const warnCount = analysis.results.filter((r) => r.status === 'warning').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Raw window.dataLayer Input */}
      <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Raw window.dataLayer Array
            </h2>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">JSON Array</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setRawInput(SAMPLE_BROKEN_DATALAYER)}
              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md font-medium cursor-pointer"
            >
              Load Broken Sample
            </button>
            <button
              type="button"
              onClick={() => setRawInput(SAMPLE_VALID_DATALAYER)}
              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md font-medium cursor-pointer"
            >
              Load Valid GA4 Flow
            </button>
          </div>
        </div>

        <div className="p-4">
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={20}
            spellCheck={false}
            placeholder='[{"event": "purchase", "ecommerce": {"transaction_id": "ORD-1", "value": 99, "currency": "USD", "items": [...]}}]'
            className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500 leading-relaxed"
          />
        </div>
      </div>

      {/* Right: Automated Validation Report */}
      <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              GA4 Ecommerce Schema Validation Report
            </h2>
          </div>
          {!analysis.parseError && (
            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
              {analysis.results.length} events · {passCount} pass · {warnCount} warn · {failCount} fail
            </span>
          )}
        </div>

        {analysis.parseError ? (
          <div className="p-6">
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-md text-xs text-red-800 dark:text-red-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                Unable to parse dataLayer array
              </div>
              <p className="font-mono">{analysis.parseError}</p>
            </div>
          </div>
        ) : analysis.results.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No named events found in the dataLayer array. Push objects with an <span className="font-mono">"event"</span> key to validate.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {analysis.results.map((item) => (
              <div key={`${item.index}-${item.eventName}`} className="p-5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-slate-400 dark:text-slate-500 tabular-nums">
                      #{item.index}
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.eventName}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold ${
                      item.status === 'pass'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : item.status === 'warning'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {item.status === 'pass' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {item.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5" />}
                    {item.status === 'fail' && <XCircle className="w-3.5 h-3.5" />}
                    {item.status === 'pass'
                      ? 'Schema Valid'
                      : item.status === 'warning'
                        ? 'Warnings'
                        : 'Missing Required Keys'}
                  </span>
                </div>

                {item.presentKeys.length > 0 && (
                  <div className="text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Present: </span>
                    <span className="font-mono">{item.presentKeys.join(', ')}</span>
                  </div>
                )}

                {item.missingKeys.length > 0 && (
                  <div className="p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded text-red-800 dark:text-red-300 space-y-1">
                    <div className="font-semibold">Missing Required Keys:</div>
                    <div className="font-mono flex flex-wrap gap-2">
                      {item.missingKeys.map((k) => (
                        <span
                          key={k}
                          className="bg-white dark:bg-slate-950 border border-red-200 dark:border-red-800/70 px-1.5 py-0.5 rounded"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {item.warnings.length > 0 && (
                  <ul className="space-y-1 text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded p-2.5">
                    {item.warnings.map((w, wi) => (
                      <li key={wi} className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
