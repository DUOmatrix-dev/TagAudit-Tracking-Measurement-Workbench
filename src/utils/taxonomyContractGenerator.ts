import { TaxonomyEvent } from '../types/tracking';
import { generateTaxonomyJsonSchema } from './taxonomySchema';

export interface ScannedParameterType {
  paramName: string;
  tsType: string;
  jsonSchemaType: string;
  requiredInEvents: string[];
  missingInEvents: string[];
  description: string;
}

export interface TaxonomyScanResult {
  scannedAt: string;
  eventCount: number;
  uniqueParamCount: number;
  incompleteEvents: Array<{ eventName: string; missingParams: string[] }>;
  scannedParameters: ScannedParameterType[];
  typescriptCode: string;
  jsonSchemaCode: string;
}

function toPascalCase(snake: string): string {
  return snake
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function sanitizePropKey(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
}

function inferParamTypeInfo(paramName: string): {
  tsType: string;
  jsonSchemaType: string;
  description: string;
} {
  const lower = paramName.toLowerCase();
  if (lower === 'value' || lower === 'price' || lower === 'tax' || lower === 'shipping') {
    return {
      tsType: 'number',
      jsonSchemaType: 'number (minimum: 0)',
      description: 'Monetary amount for conversion and ROAS attribution',
    };
  }
  if (lower === 'quantity') {
    return {
      tsType: 'number',
      jsonSchemaType: 'integer (minimum: 1)',
      description: 'Item unit quantity',
    };
  }
  if (lower === 'currency') {
    return {
      tsType: 'string',
      jsonSchemaType: 'string (^[A-Z]{3}$)',
      description: 'ISO-4217 3-letter currency code (e.g. USD, EUR)',
    };
  }
  if (lower === 'items') {
    return {
      tsType: 'GA4EcommerceItem[]',
      jsonSchemaType: 'array<GA4EcommerceItem>',
      description: 'GA4 ecommerce product array',
    };
  }
  if (lower === 'user_data') {
    return {
      tsType: 'EnhancedConversionUserData',
      jsonSchemaType: 'object (sha256 PII fields)',
      description: 'SHA-256 normalized customer match identifiers',
    };
  }
  if (lower === 'email_sha256') {
    return {
      tsType: 'string',
      jsonSchemaType: 'string (^[a-f0-9]{64}$)',
      description: 'Hex-encoded SHA-256 normalized email hash',
    };
  }
  if (lower === 'gclid') {
    return {
      tsType: 'string',
      jsonSchemaType: 'string (^[A-Za-z0-9_-]{15,}$)',
      description: 'URL-safe base64 Google Click ID',
    };
  }
  if (lower === 'fbp' || lower === 'fbc') {
    return {
      tsType: 'string',
      jsonSchemaType: 'string (^fb\\.\\d+\\.\\d+\\..*)',
      description: 'Meta first-party browser/click identifier',
    };
  }
  if (lower === 'conversion_time') {
    return {
      tsType: 'string',
      jsonSchemaType: 'string (format: date-time)',
      description: 'Timezone-aware ISO-8601 timestamp',
    };
  }
  if (lower === 'event_id' || lower === 'transaction_id' || lower === 'lead_id') {
    return {
      tsType: 'string',
      jsonSchemaType: 'string (minLength: 1)',
      description: 'Deduplication or entity reconciliation key',
    };
  }
  return {
    tsType: 'string',
    jsonSchemaType: 'string (minLength: 1)',
    description: 'Taxonomy string parameter',
  };
}

export function scanTaxonomyAndGenerateContracts(
  events: TaxonomyEvent[],
  options?: {
    strictMode?: boolean;
    includeTestHelpers?: boolean;
    markMissingAsOptional?: boolean;
  }
): TaxonomyScanResult {
  const scannedAt = new Date().toISOString();
  const strictMode = options?.strictMode ?? true;
  const includeTestHelpers = options?.includeTestHelpers ?? true;
  const markMissingAsOptional = options?.markMissingAsOptional ?? false;

  const sortedEvents = [...events].sort((a, b) => a.eventName.localeCompare(b.eventName));

  const paramMap = new Map<string, { requiredIn: string[]; missingIn: string[] }>();
  const incompleteEvents: Array<{ eventName: string; missingParams: string[] }> = [];

  for (const ev of sortedEvents) {
    const allKeys = Array.from(new Set([...ev.requiredParams, ...ev.presentParams]));
    const missing = ev.requiredParams.filter((p) => !ev.presentParams.includes(p));
    if (missing.length > 0) {
      incompleteEvents.push({ eventName: ev.eventName, missingParams: missing });
    }
    for (const param of allKeys) {
      const entry = paramMap.get(param) || { requiredIn: [], missingIn: [] };
      if (ev.requiredParams.includes(param)) {
        entry.requiredIn.push(ev.eventName);
      }
      if (missing.includes(param)) {
        entry.missingIn.push(ev.eventName);
      }
      paramMap.set(param, entry);
    }
  }

  const scannedParameters: ScannedParameterType[] = Array.from(paramMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([paramName, usage]) => {
      const info = inferParamTypeInfo(paramName);
      return {
        paramName,
        tsType: info.tsType,
        jsonSchemaType: info.jsonSchemaType,
        requiredInEvents: usage.requiredIn,
        missingInEvents: usage.missingIn,
        description: info.description,
      };
    });

  const needsItemsType = scannedParameters.some((p) => p.tsType === 'GA4EcommerceItem[]');
  const needsUserDataType = scannedParameters.some(
    (p) => p.tsType === 'EnhancedConversionUserData'
  );

  const lines: string[] = [
    '/**',
    ` * Auto-generated DataLayer Taxonomy Contracts`,
    ` * Scanned Events: ${sortedEvents.length} | Unique Parameters: ${scannedParameters.length}`,
    ` * Generated At: ${scannedAt}`,
    ' */',
    '',
  ];

  if (needsItemsType) {
    lines.push(
      'export interface GA4EcommerceItem {',
      '  item_id: string;',
      '  item_name: string;',
      '  price?: number;',
      '  quantity?: number;',
      '  item_brand?: string;',
      '  item_category?: string;',
      '}',
      ''
    );
  }

  if (needsUserDataType) {
    lines.push(
      'export interface EnhancedConversionUserData {',
      '  sha256_email_address?: string;',
      '  sha256_phone_number?: string;',
      '  address?: {',
      '    sha256_first_name?: string;',
      '    sha256_last_name?: string;',
      '    country?: string;',
      '    postal_code?: string;',
      '  };',
      '}',
      ''
    );
  }

  const interfaceNames: string[] = [];

  for (const ev of sortedEvents) {
    const interfaceName = `${toPascalCase(ev.eventName) || 'Custom'}DataLayerEvent`;
    interfaceNames.push(interfaceName);
    const allKeys = Array.from(new Set([...ev.requiredParams, ...ev.presentParams]));
    const missingSet = new Set(ev.requiredParams.filter((p) => !ev.presentParams.includes(p)));

    lines.push(
      '/**',
      ` * Event: ${ev.eventName} (${ev.funnelStage})`,
      ` * Platforms: ${ev.platforms.join(', ')} | Ads Role: ${ev.googleAdsRole}`,
      ...(missingSet.size > 0
        ? [` * WARNING: Currently missing in live implementation: ${Array.from(missingSet).join(', ')}`]
        : []),
      ' */',
      `export interface ${interfaceName} {`,
      `  event: '${ev.eventName}';`
    );

    for (const key of allKeys) {
      const info = inferParamTypeInfo(key);
      const isRequired = ev.requiredParams.includes(key);
      const isMissing = missingSet.has(key);
      const optionalFlag = !isRequired || (markMissingAsOptional && isMissing) ? '?' : '';
      const statusNote = isMissing ? ' // MISSING in current taxonomy check' : '';
      lines.push(`  ${sanitizePropKey(key)}${optionalFlag}: ${info.tsType};${statusNote}`);
    }

    if (!strictMode) {
      lines.push('  [extraKey: string]: unknown;');
    }
    lines.push('}', '');
  }

  lines.push(
    'export type DataLayerTaxonomyEvent =',
    ...(interfaceNames.length > 0
      ? interfaceNames.map((name, idx) => `  | ${name}${idx === interfaceNames.length - 1 ? ';' : ''}`)
      : ['  never;']),
    ''
  );

  if (includeTestHelpers) {
    lines.push(
      'export const REQUIRED_PARAMS_BY_EVENT: Record<DataLayerTaxonomyEvent["event"], readonly string[]> = {',
      ...sortedEvents.map(
        (ev) =>
          `  '${ev.eventName}': [${ev.requiredParams.map((p) => `'${p}'`).join(', ')}],`
      ),
      '};',
      '',
      '/**',
      ' * Runtime validator for Playwright, Cypress, or Vitest dataLayer assertions.',
      ' */',
      'export function assertDataLayerEventContract(',
      '  payload: Record<string, unknown>',
      '): payload is DataLayerTaxonomyEvent {',
      "  const eventName = payload?.event;",
      "  if (typeof eventName !== 'string' || !(eventName in REQUIRED_PARAMS_BY_EVENT)) {",
      '    throw new Error(`Unexpected dataLayer event: ${String(eventName)}`);',
      '  }',
      '  const required = REQUIRED_PARAMS_BY_EVENT[eventName as DataLayerTaxonomyEvent["event"]];',
      '  const missing = required.filter((key) => payload[key] === undefined || payload[key] === null || payload[key] === "");',
      '  if (missing.length > 0) {',
      '    throw new Error(`Event "${eventName}" is missing required parameters: ${missing.join(", ")}`);',
      '  }',
      '  return true;',
      '}',
      ''
    );
  }

  const jsonSchemaDoc = generateTaxonomyJsonSchema(sortedEvents, {
    strictMode,
  });

  return {
    scannedAt,
    eventCount: sortedEvents.length,
    uniqueParamCount: scannedParameters.length,
    incompleteEvents,
    scannedParameters,
    typescriptCode: lines.join('\n'),
    jsonSchemaCode: JSON.stringify(jsonSchemaDoc, null, 2),
  };
}
