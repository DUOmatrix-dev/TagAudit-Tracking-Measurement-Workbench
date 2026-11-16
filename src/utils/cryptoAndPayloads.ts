import {
  ConsentState,
  SimulatedNetworkRequest,
  TaxonomyEvent,
} from '../types/tracking';

export function normalizeEmail(raw: string, stripGmailDots = true): string {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned.includes('@')) return cleaned;
  const [localPart, domainPart] = cleaned.split('@');
  if (
    stripGmailDots &&
    (domainPart === 'gmail.com' || domainPart === 'googlemail.com')
  ) {
    const withoutPlus = localPart.split('+')[0];
    return `${withoutPlus.replace(/\./g, '')}@${domainPart}`;
  }
  return `${localPart}@${domainPart}`;
}

export function normalizePhoneE164(raw: string, defaultCountryCode = '+1'): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (hasPlus) {
    return `+${digits}`;
  }
  if (digits.length === 10 && defaultCountryCode === '+1') {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `${defaultCountryCode}${digits}`;
}

export async function sha256Hex(value: string): Promise<string> {
  if (!value) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function encodeGoogleConsentString(consent: ConsentState): string {
  // Google Consent Mode v2 gcs parameter format: G1<ad_storage><analytics_storage>
  const ad = consent.ad_storage === 'granted' ? '1' : '0';
  const analytics = consent.analytics_storage === 'granted' ? '1' : '0';
  return `G1${ad}${analytics}`;
}

export function encodeGcdParameter(consent: ConsentState): string {
  // Represents Consent Mode v2 gcd signal state for all 4 core parameters
  const mapCode = (val: 'granted' | 'denied') => (val === 'granted' ? 'p' : 'm');
  return `13${mapCode(consent.ad_storage)}3${mapCode(consent.analytics_storage)}3${mapCode(consent.ad_user_data)}3${mapCode(consent.ad_personalization)}5`;
}

export interface EventSimInput {
  eventName: string;
  eventId: string;
  includeEventIdInCapi: boolean;
  includeEventIdInPixel: boolean;
  transactionId: string;
  value: number;
  currency: string;
  emailHash: string;
  phoneHash: string;
  gclid: string;
  fbp: string;
  fbc: string;
  pageLocation: string;
  itemName: string;
  itemId: string;
}

export function buildSimulatedRequests(
  input: EventSimInput,
  consent: ConsentState,
  enabledPlatforms: {
    ga4: boolean;
    googleAds: boolean;
    metaPixel: boolean;
    metaCapi: boolean;
    linkedIn: boolean;
  }
): SimulatedNetworkRequest[] {
  const now = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const gcs = encodeGoogleConsentString(consent);
  const gcd = encodeGcdParameter(consent);
  const requests: SimulatedNetworkRequest[] = [];

  const isConversion = ['purchase', 'generate_lead', 'qualified_lead', 'begin_checkout'].includes(
    input.eventName
  );

  if (enabledPlatforms.ga4) {
    const isCookieless = consent.analytics_storage === 'denied';
    requests.push({
      id: `req-ga4-${Date.now()}-1`,
      timestamp: now,
      platform: 'GA4',
      endpoint: 'https://www.google-analytics.com/g/collect',
      eventName: input.eventName,
      eventId: input.eventId,
      status: isCookieless ? 'Cookieless Ping' : 'Dispatched',
      gcs,
      payload: {
        v: '2',
        tid: 'G-NL8840K2PX',
        en: input.eventName,
        gcs,
        gcd,
        npa: consent.ad_personalization === 'denied' ? 1 : 0,
        dl: input.pageLocation,
        'ep.transaction_id': input.transactionId || undefined,
        'epn.value': input.value,
        cu: input.currency,
        _p: isCookieless ? 'cookieless_ping_modeled' : '189240112',
      },
    });
  }

  if (enabledPlatforms.googleAds && isConversion) {
    const isCookieless = consent.ad_storage === 'denied';
    const userDataAvailable = consent.ad_user_data === 'granted';
    requests.push({
      id: `req-gads-${Date.now()}-2`,
      timestamp: now,
      platform: 'Google Ads',
      endpoint: 'https://www.googleadservices.com/pagead/conversion/1094827104/',
      eventName: input.eventName,
      eventId: input.eventId,
      status: isCookieless ? 'Cookieless Ping' : 'Dispatched',
      gcs,
      payload: {
        label: input.eventName === 'purchase' ? 'AbC_x9Purchase' : 'LdZ_k2Lead',
        value: input.value,
        currency_code: input.currency,
        transaction_id: input.transactionId,
        gclid: consent.ad_storage === 'granted' ? input.gclid : '(redacted_by_consent)',
        gcs,
        gcd,
        em_sha256: userDataAvailable ? input.emailHash : '(suppressed_ad_user_data_denied)',
        pn_sha256: userDataAvailable ? input.phoneHash : '(suppressed_ad_user_data_denied)',
      },
    });
  }

  const pixelCanFire = consent.ad_storage === 'granted';
  const capiCanSendUserData =
    consent.ad_storage === 'granted' && consent.ad_user_data === 'granted';

  const dedupMismatch =
    enabledPlatforms.metaPixel &&
    enabledPlatforms.metaCapi &&
    pixelCanFire &&
    (!input.includeEventIdInPixel || !input.includeEventIdInCapi);

  if (enabledPlatforms.metaPixel) {
    requests.push({
      id: `req-mpixel-${Date.now()}-3`,
      timestamp: now,
      platform: 'Meta Pixel',
      endpoint: 'https://www.facebook.com/tr/',
      eventName: mapToMetaStandardEvent(input.eventName),
      eventId: input.includeEventIdInPixel ? input.eventId : '(MISSING)',
      status: !pixelCanFire
        ? 'Blocked by Consent'
        : dedupMismatch
          ? 'Duplicate Risk'
          : 'Dispatched',
      gcs,
      payload: pixelCanFire
        ? {
            id: '948102938471029',
            ev: mapToMetaStandardEvent(input.eventName),
            eid: input.includeEventIdInPixel ? input.eventId : undefined,
            cd: {
              value: input.value,
              currency: input.currency,
              order_id: input.transactionId,
              content_ids: [input.itemId],
            },
            ud: consent.ad_user_data === 'granted' ? { em: input.emailHash } : undefined,
          }
        : {
            blocked: true,
            reason: 'ad_storage=denied prevents third-party pixel execution',
          },
    });
  }

  if (enabledPlatforms.metaCapi) {
    requests.push({
      id: `req-mcapi-${Date.now()}-4`,
      timestamp: now,
      platform: 'Meta CAPI',
      endpoint: 'https://graph.facebook.com/v21.0/948102938471029/events',
      eventName: mapToMetaStandardEvent(input.eventName),
      eventId: input.includeEventIdInCapi ? input.eventId : '(MISSING)',
      status: !capiCanSendUserData
        ? 'Blocked by Consent'
        : dedupMismatch
          ? 'Duplicate Risk'
          : 'Dispatched',
      gcs,
      payload: capiCanSendUserData
        ? {
            data: [
              {
                event_name: mapToMetaStandardEvent(input.eventName),
                event_time: Math.floor(Date.now() / 1000),
                event_id: input.includeEventIdInCapi ? input.eventId : undefined,
                action_source: 'website',
                event_source_url: input.pageLocation,
                user_data: {
                  em: [input.emailHash],
                  ph: [input.phoneHash],
                  fbp: input.fbp,
                  fbc: input.fbc || undefined,
                },
                custom_data: {
                  currency: input.currency,
                  value: input.value,
                  order_id: input.transactionId,
                  content_ids: [input.itemId],
                },
              },
            ],
          }
        : {
            suppressed: true,
            reason: 'ad_user_data or ad_storage denied — server CAPI dispatch halted',
          },
    });
  }

  if (enabledPlatforms.linkedIn && isConversion) {
    requests.push({
      id: `req-li-${Date.now()}-5`,
      timestamp: now,
      platform: 'LinkedIn',
      endpoint: 'https://px.ads.linkedin.com/collect',
      eventName: input.eventName,
      eventId: input.eventId,
      status: consent.ad_storage === 'denied' ? 'Blocked by Consent' : 'Dispatched',
      gcs,
      payload:
        consent.ad_storage === 'granted'
          ? {
              pid: '5810294',
              conversionId: '18492012',
              event_id: input.eventId,
              value: input.value,
              currency: input.currency,
              sha256_email: consent.ad_user_data === 'granted' ? input.emailHash : undefined,
            }
          : {
              blocked: true,
              reason: 'ad_storage=denied blocks LinkedIn Insight Tag',
            },
    });
  }

  return requests;
}

export function mapToMetaStandardEvent(ga4Event: string): string {
  switch (ga4Event) {
    case 'view_item':
      return 'ViewContent';
    case 'add_to_cart':
      return 'AddToCart';
    case 'begin_checkout':
      return 'InitiateCheckout';
    case 'purchase':
      return 'Purchase';
    case 'generate_lead':
      return 'Lead';
    case 'qualified_lead':
      return 'CompleteRegistration';
    default:
      return ga4Event;
  }
}

export function generateDataLayerSnippet(event: TaxonomyEvent): string {
  const payload: Record<string, unknown> = {
    event: event.eventName,
  };

  if (event.capiDedupEnabled || event.requiredParams.includes('event_id')) {
    payload.event_id = `evt_${event.eventName}_\${Date.now()}`;
  }

  const ecommerceEvents = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'];
  if (ecommerceEvents.includes(event.eventName)) {
    const ecom: Record<string, unknown> = {
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
    };
    if (event.eventName === 'purchase') {
      ecom.transaction_id = 'ORD-2026-98412';
      ecom.tax = 12.1;
      ecom.shipping = 0.0;
    }
    payload.ecommerce = ecom;
  } else {
    if (event.requiredParams.includes('value')) payload.value = 250.0;
    if (event.requiredParams.includes('currency')) payload.currency = 'USD';
    if (event.requiredParams.includes('lead_type')) payload.lead_type = 'demo_request';
  }

  if (event.enhancedConversions) {
    payload.user_data = {
      email: 'alex.morgan@company.com',
      phone_number: '+14155550192',
    };
  }

  return `window.dataLayer = window.dataLayer || [];\nwindow.dataLayer.push({ ecommerce: null });\nwindow.dataLayer.push(${JSON.stringify(payload, null, 2)});`;
}
