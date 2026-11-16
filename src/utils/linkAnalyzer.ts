export interface ParsedQueryParam {
  key: string;
  value: string;
  category: 'Click ID' | 'UTM Attribution' | 'Cross-Domain' | 'PII Risk' | 'Custom';
  status: 'valid' | 'warning' | 'critical';
  note: string;
}

export interface LivePageScanResult {
  reachable: boolean;
  requestedUrl: string;
  finalUrl: string;
  redirected: boolean;
  statusCode: number | null;
  statusText: string;
  responseTimeMs: number;
  contentType?: string;
  pageTitle?: string;
  scriptCount?: number;
  hasCanonical?: boolean;
  fetchError?: string;
  signals: {
    gtmContainers: string[];
    ga4MeasurementIds: string[];
    googleAdsIds: string[];
    metaPixelIds: string[];
    linkedInPartnerIds: string[];
    tiktokPixelIds: string[];
    hasGtagScript: boolean;
    hasCustomSgtmTransport: boolean;
    hasDataLayer: boolean;
    hasConsentModeDefault: boolean;
    hasConsentV2Signals: boolean;
    cmpVendors: string[];
  } | null;
}

export interface LinkFinding {
  id: string;
  severity: 'critical' | 'warning' | 'pass';
  area: 'Transport & Security' | 'Click ID & Attribution' | 'Privacy & PII' | 'Tagging & Consent';
  title: string;
  detail: string;
  remediation: string;
}

export interface LinkAnalysisReport {
  normalizedUrl: string;
  protocol: string;
  hostname: string;
  pathname: string;
  hash: string;
  params: ParsedQueryParam[];
  clickIdsPresent: string[];
  utmPresent: string[];
  liveScan: LivePageScanResult | null;
  findings: LinkFinding[];
  analyzedAt: string;
}

const CLICK_ID_KEYS = new Set([
  'gclid',
  'wbraid',
  'gbraid',
  'fbclid',
  'li_fat_id',
  'ttclid',
  'msclkid',
  'yclid',
  'dclid',
]);

const UTM_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PII_RE = /(?:\+?\d[\d\s\-().]{8,}\d)/;
const PII_PARAM_KEY_RE = /^(?:email|e-mail|mail|phone|tel|mobile|ssn|first_name|last_name|full_name|address)$/i;

export function normalizeInputUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste a URL or landing page link before running analysis.' };
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return { ok: false, error: 'Enter a complete domain URL (e.g. https://example.com/checkout).' };
    }
    return { ok: true, url: parsed };
  } catch {
    return { ok: false, error: 'The pasted value is not a valid URL.' };
  }
}

export function inspectUrlStructure(
  parsedUrl: URL,
  liveScan: LivePageScanResult | null
): LinkAnalysisReport {
  const params: ParsedQueryParam[] = [];
  const clickIdsPresent: string[] = [];
  const utmPresent: string[] = [];
  const findings: LinkFinding[] = [];

  if (parsedUrl.protocol !== 'https:') {
    findings.push({
      id: 'url-not-https',
      severity: 'critical',
      area: 'Transport & Security',
      title: 'Destination URL uses insecure http:// protocol',
      detail: 'Unencrypted HTTP landing pages block SameSite=None cookies, Meta CAPI event_source_url verification, and modern browser referrer headers.',
      remediation: 'Enforce HTTPS with a 301 redirect and update final URLs in Google Ads and Meta Ads.',
    });
  } else {
    findings.push({
      id: 'url-https-ok',
      severity: 'pass',
      area: 'Transport & Security',
      title: 'HTTPS transport verified on target URL',
      detail: 'Encrypted origin supports first-party cookie persistence and Enhanced Conversions hashing.',
      remediation: 'No action required.',
    });
  }

  for (const [key, value] of parsedUrl.searchParams.entries()) {
    const lowerKey = key.toLowerCase();

    // Check PII leakage first
    if (EMAIL_RE.test(value) || PII_PARAM_KEY_RE.test(lowerKey) || (lowerKey.includes('phone') && PHONE_PII_RE.test(value))) {
      params.push({
        key,
        value,
        category: 'PII Risk',
        status: 'critical',
        note: 'Unencrypted PII detected in query string — violates GA4 & Google Ads terms.',
      });
      findings.push({
        id: `pii-leak-${key}`,
        severity: 'critical',
        area: 'Privacy & PII',
        title: `PII detected in URL query parameter "${key}"`,
        detail: `Plaintext "${key}=${value}" will be captured into GA4 page_location and ad server logs unless redacted.`,
        remediation: `Strip "${key}" from redirect URLs and pass SHA-256 hashed user_data via dataLayer or sGTM instead.`,
      });
      continue;
    }

    if (CLICK_ID_KEYS.has(lowerKey)) {
      clickIdsPresent.push(lowerKey);
      if (lowerKey === 'gclid') {
        const hasBase64Mismatch = /[+/=\s]/.test(value);
        const tooShort = value.trim().length < 15;
        if (hasBase64Mismatch || tooShort) {
          params.push({
            key,
            value,
            category: 'Click ID',
            status: 'critical',
            note: hasBase64Mismatch
              ? 'Contains non-URL-safe characters (+, /, =, or whitespace).'
              : 'GCLID shorter than expected Google Click ID length.',
          });
          findings.push({
            id: 'gclid-malformed',
            severity: 'critical',
            area: 'Click ID & Attribution',
            title: 'Malformed GCLID parameter on landing URL',
            detail: `gclid="${value}" failed Base64url/length validation, risking _gcl_aw cookie drop and Offline Conversion Import rejection.`,
            remediation: 'Preserve exact auto-tagged gclid without URL-encoding corruption or case folding.',
          });
        } else {
          params.push({
            key,
            value,
            category: 'Click ID',
            status: 'valid',
            note: 'URL-safe Base64url token ready for Conversion Linker (_gcl_aw).',
          });
        }
      } else {
        params.push({
          key,
          value,
          category: 'Click ID',
          status: value.trim() ? 'valid' : 'warning',
          note: value.trim()
            ? `${lowerKey.toUpperCase()} click identifier present.`
            : 'Empty click identifier value.',
        });
      }
      continue;
    }

    if (UTM_KEYS.has(lowerKey)) {
      utmPresent.push(lowerKey);
      const hasIssues = /[A-Z]/.test(value) || /\s/.test(value);
      params.push({
        key,
        value,
        category: 'UTM Attribution',
        status: hasIssues ? 'warning' : 'valid',
        note: hasIssues
          ? 'Contains uppercase letters or spaces; may fragment GA4 channel grouping.'
          : 'Clean lowercase attribution parameter.',
      });
      if (hasIssues) {
        findings.push({
          id: `utm-case-${key}`,
          severity: 'warning',
          area: 'Click ID & Attribution',
          title: `Inconsistent casing or whitespace in "${key}"`,
          detail: `Value "${value}" may split sessions across multiple rows in GA4 Traffic Acquisition.`,
          remediation: `Normalize "${key}" to lowercase kebab/snake_case in ad UTM templates.`,
        });
      }
      continue;
    }

    if (lowerKey === '_gl') {
      params.push({
        key,
        value,
        category: 'Cross-Domain',
        status: 'valid',
        note: 'Google cross-domain linker parameter (_gl) detected.',
      });
      continue;
    }

    params.push({
      key,
      value,
      category: 'Custom',
      status: 'valid',
      note: 'Custom query parameter.',
    });
  }

  if (utmPresent.length > 0 && (!utmPresent.includes('utm_source') || !utmPresent.includes('utm_medium'))) {
    findings.push({
      id: 'incomplete-utm-pair',
      severity: 'warning',
      area: 'Click ID & Attribution',
      title: 'Incomplete UTM pair (missing utm_source or utm_medium)',
      detail: `Detected [${utmPresent.join(', ')}] without both utm_source and utm_medium.`,
      remediation: 'Always include both utm_source and utm_medium so GA4 Default Channel Groups classify traffic accurately.',
    });
  }

  if (clickIdsPresent.length === 0 && utmPresent.length === 0) {
    findings.push({
      id: 'no-tracking-params',
      severity: 'warning',
      area: 'Click ID & Attribution',
      title: 'No click IDs or UTM attribution parameters in URL',
      detail: 'URL has no gclid, fbclid, wbraid, or utm_* parameters. Paid clicks without these rely solely on referrer.',
      remediation: 'Append auto-tagging (gclid/fbclid) or standardized UTM tracking templates for paid campaigns.',
    });
  }

  // Live HTML scan findings when reachable
  if (liveScan?.reachable && liveScan.signals) {
    const s = liveScan.signals;
    if (liveScan.redirected && liveScan.finalUrl !== liveScan.requestedUrl) {
      const reqHadClickId = clickIdsPresent.length > 0;
      const finalUrlObj = new URL(liveScan.finalUrl);
      const finalHasClickId = Array.from(finalUrlObj.searchParams.keys()).some((k) =>
        CLICK_ID_KEYS.has(k.toLowerCase())
      );
      if (reqHadClickId && !finalHasClickId) {
        findings.push({
          id: 'redirect-stripped-clickid',
          severity: 'critical',
          area: 'Click ID & Attribution',
          title: 'HTTP redirect stripped click ID parameters',
          detail: `Requested URL redirected to "${liveScan.finalUrl}" and dropped tracking query parameters during redirect.`,
          remediation: 'Update server/CDN redirect rules to preserve query string parameters (QSA).',
        });
      }
    }

    if (s.gtmContainers.length === 0 && !s.hasGtagScript && s.metaPixelIds.length === 0) {
      findings.push({
        id: 'no-tags-found',
        severity: 'warning',
        area: 'Tagging & Consent',
        title: 'No client-side GTM, gtag.js, or Pixel containers detected in initial HTML',
        detail: 'Initial HTTP HTML response did not contain GTM-*, G-*, AW-*, or Meta Pixel snippets (may be loaded via SPA hydration or blocked).',
        remediation: 'Verify GTM snippet placement in <head> or confirm tag injection via Tag Assistant preview.',
      });
    } else {
      findings.push({
        id: 'tags-detected',
        severity: 'pass',
        area: 'Tagging & Consent',
        title: 'Active measurement scripts detected in page HTML',
        detail: [
          s.gtmContainers.length ? `GTM: ${s.gtmContainers.join(', ')}` : '',
          s.ga4MeasurementIds.length ? `GA4: ${s.ga4MeasurementIds.join(', ')}` : '',
          s.googleAdsIds.length ? `Google Ads: ${s.googleAdsIds.join(', ')}` : '',
          s.metaPixelIds.length ? `Meta Pixel: ${s.metaPixelIds.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'gtag.js / tracking script detected',
        remediation: 'Cross-check container IDs against your TagAudit workspace.',
      });
    }

    if (s.gtmContainers.length > 0 && !s.hasConsentModeDefault && s.cmpVendors.length === 0) {
      findings.push({
        id: 'missing-consent-default',
        severity: 'critical',
        area: 'Tagging & Consent',
        title: 'No Consent Mode default state or CMP script detected before GTM',
        detail: 'HTML includes GTM container without an inline gtag("consent", "default", ...) declaration or recognized CMP banner.',
        remediation: 'Deploy Consent Mode v2 default denied settings above the GTM container snippet for EEA/UK compliance.',
      });
    } else if (s.hasConsentModeDefault && !s.hasConsentV2Signals) {
      findings.push({
        id: 'consent-v1-only',
        severity: 'warning',
        area: 'Tagging & Consent',
        title: 'Consent Mode v2 signals (ad_user_data / ad_personalization) not found in inline HTML',
        detail: 'Consent default detected, but Consent Mode v2 parameters were not matched in the static HTML.',
        remediation: 'Confirm CMP template emits ad_user_data and ad_personalization prior to Conversion/Remarketing tags.',
      });
    }
  } else if (liveScan && !liveScan.reachable) {
    findings.push({
      id: 'live-scan-blocked',
      severity: 'warning',
      area: 'Transport & Security',
      title: 'Live HTML fetch could not inspect remote DOM',
      detail: `${liveScan.fetchError || 'Target host blocked automated inspection.'} URL query parameter, click ID, and PII checks above remain fully evaluated.`,
      remediation: 'Test sites behind bot protection using GTM Preview / Tag Assistant directly in your browser.',
    });
  }

  return {
    normalizedUrl: parsedUrl.toString(),
    protocol: parsedUrl.protocol.replace(':', '').toUpperCase(),
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname || '/',
    hash: parsedUrl.hash,
    params,
    clickIdsPresent: Array.from(new Set(clickIdsPresent)),
    utmPresent: Array.from(new Set(utmPresent)),
    liveScan,
    findings,
    analyzedAt: new Date().toISOString(),
  };
}
