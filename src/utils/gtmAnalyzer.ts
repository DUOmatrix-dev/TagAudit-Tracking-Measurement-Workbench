import {
  GtmAuditIssue,
  GtmAuditSummary,
  GtmExportJson,
  GtmTag,
} from '../types/tracking';

const AD_TAG_TYPES = new Set([
  'awct', // Google Ads Conversion Tracking
  'sp', // Google Ads Remarketing
  'gclidw', // Conversion Linker
  'meta_pixel',
  'cvt_meta',
  'fb_pixel',
  'linkedin_insight',
  'tiktok_pixel',
  'html',
]);

const ANALYTICS_TAG_TYPES = new Set(['gaawc', 'gaawe', 'googtag', 'ua']);

export function analyzeGtmContainer(container: GtmExportJson): GtmAuditSummary {
  const cv = container.containerVersion;
  const tags = cv.tag || [];
  const triggers = cv.trigger || [];
  const variables = cv.variable || [];
  const issues: GtmAuditIssue[] = [];

  const activeTags = tags.filter((t) => !t.paused);
  const pausedTags = tags.filter((t) => t.paused);

  // 1. Consent Mode v2 Coverage
  let consentCovered = 0;
  for (const tag of activeTags) {
    const status = tag.consentSettings?.consentStatus;
    const types = tag.consentSettings?.consentType?.list?.map((i) => i.value) || [];
    const needsAdConsent = AD_TAG_TYPES.has(tag.type) || /meta|facebook|ads|linkedin|tiktok/i.test(tag.name);
    const needsAnalyticsConsent = ANALYTICS_TAG_TYPES.has(tag.type) || /ga4|analytics/i.test(tag.name);

    if (status === 'NEEDED' && types.length > 0) {
      if (needsAdConsent && (!types.includes('ad_storage') || !types.includes('ad_user_data'))) {
        issues.push({
          id: `consent-v2-incomplete-${tag.tagId}`,
          severity: 'warning',
          category: 'Consent Mode v2',
          title: `Incomplete Consent Mode v2 signals on "${tag.name}"`,
          detail: `Tag checks [${types.join(', ')}] but requires ad_storage and ad_user_data under Consent Mode v2.`,
          remediation: 'Add ad_storage, ad_user_data, and ad_personalization to Additional Consent Checks.',
          affectedId: tag.tagId,
          affectedName: tag.name,
          patchable: true,
        });
      } else {
        consentCovered++;
      }
    } else if (tag.type === 'gclidw' && status === 'NOT_NEEDED') {
      consentCovered++;
    } else if (needsAdConsent || needsAnalyticsConsent) {
      issues.push({
        id: `consent-missing-${tag.tagId}`,
        severity: 'critical',
        category: 'Consent Mode v2',
        title: `Missing consent gating on "${tag.name}"`,
        detail: `Consent status is "${status || 'NOT_SET'}". Tag fires prior to CMP consent signal.`,
        remediation: 'Set consentStatus to NEEDED with required ad_storage / analytics_storage / ad_user_data checks.',
        affectedId: tag.tagId,
        affectedName: tag.name,
        patchable: true,
      });
    } else {
      consentCovered++;
    }
  }

  // 2. Legacy Universal Analytics & Paused Bloat
  const legacyUaTags = activeTags.filter((t) => t.type === 'ua');
  for (const ua of legacyUaTags) {
    issues.push({
      id: `legacy-ua-${ua.tagId}`,
      severity: 'critical',
      category: 'Legacy / Bloat',
      title: `Active legacy Universal Analytics tag "${ua.name}"`,
      detail: 'Legacy UA tags still inject analytics.js and inflate network overhead without collecting data.',
      remediation: 'Pause or remove legacy UA tags and consolidate triggers onto GA4 Event tags.',
      affectedId: ua.tagId,
      affectedName: ua.name,
      patchable: true,
    });
  }

  if (pausedTags.length >= 2) {
    issues.push({
      id: `paused-bloat-${pausedTags.length}`,
      severity: 'warning',
      category: 'Legacy / Bloat',
      title: `${pausedTags.length} paused legacy tags bloating container`,
      detail: `Paused tags (${pausedTags.map((p) => p.name).join(', ')}) remain serialized in gtm.js payload.`,
      remediation: 'Archive and purge paused tags older than 30 days to trim container JS bundle size.',
      patchable: true,
    });
  }

  // 3. Duplicate Purchase / Conversion Firing Detection
  const purchaseTags = activeTags.filter(
    (t) =>
      /purchase|checkout|order/i.test(t.name) &&
      (t.type === 'gaawe' || t.type === 'awct' || /meta|pixel/i.test(t.name))
  );
  const byPlatformTrigger = new Map<string, GtmTag[]>();
  for (const tag of purchaseTags) {
    const key = `${tag.type}:${(tag.firingTriggerId || []).slice().sort().join(',')}`;
    const list = byPlatformTrigger.get(key) || [];
    list.push(tag);
    byPlatformTrigger.set(key, list);
  }
  for (const [, group] of byPlatformTrigger.entries()) {
    if (group.length > 1) {
      issues.push({
        id: `dup-firing-${group.map((g) => g.tagId).join('-')}`,
        severity: 'critical',
        category: 'Deduplication',
        title: `Duplicate purchase tags sharing trigger (${group.map((g) => g.name).join(' + ')})`,
        detail: `Two active "${group[0].type}" tags share trigger IDs [${(group[0].firingTriggerId || []).join(', ')}], causing 2x conversion inflation.`,
        remediation: 'Consolidate into a single canonical conversion tag or enforce transaction_id deduplication.',
        affectedId: group[1].tagId,
        affectedName: group[1].name,
        patchable: true,
      });
    }
  }

  // 4. Meta Pixel / CAPI event_id deduplication parameter check
  const metaEventTags = activeTags.filter(
    (t) =>
      (/meta|facebook|capi|pixel/i.test(t.name) || t.type.includes('meta') || t.type.includes('fb')) &&
      !/init|base|config/i.test(t.name)
  );
  for (const metaTag of metaEventTags) {
    const rawParams = JSON.stringify(metaTag.parameter || []);
    if (!rawParams.includes('event_id') && !rawParams.includes('eventId')) {
      issues.push({
        id: `meta-dedup-${metaTag.tagId}`,
        severity: 'critical',
        category: 'Deduplication',
        title: `Missing event_id on "${metaTag.name}"`,
        detail: 'Browser Meta Pixel event lacks an event_id matching the Server CAPI payload, resulting in double-counted conversions.',
        remediation: 'Bind {{DLV - event_id}} to the Meta Pixel eventID parameter and forward identically to sGTM CAPI.',
        affectedId: metaTag.tagId,
        affectedName: metaTag.name,
        patchable: true,
      });
    }
  }

  // 5. Google Ads Enhanced Conversions check
  const gadsConvTags = activeTags.filter((t) => t.type === 'awct');
  for (const gadsTag of gadsConvTags) {
    const rawParams = JSON.stringify(gadsTag.parameter || []);
    const hasCssOrUserData =
      rawParams.includes('enableEnhancedConversions') ||
      rawParams.includes('userProvidedData') ||
      rawParams.includes('cssProvidedEnhancedConversionValue');
    if (!hasCssOrUserData) {
      issues.push({
        id: `ec-missing-${gadsTag.tagId}`,
        severity: 'warning',
        category: 'Enhanced Conversions',
        title: `Enhanced Conversions disabled on "${gadsTag.name}"`,
        detail: 'Google Ads conversion tag is missing userProvidedData variable, reducing match rates under cookie deprecation.',
        remediation: 'Attach {{User-Provided Data - Email & Phone}} to the conversion tag.',
        affectedId: gadsTag.tagId,
        affectedName: gadsTag.name,
        patchable: true,
      });
    }
  }

  // 6. Custom HTML performance check
  const htmlTags = activeTags.filter((t) => t.type === 'html');
  for (const htmlTag of htmlTags) {
    const triggersUsed = htmlTag.firingTriggerId || [];
    const firesAllPages = triggersUsed.some((id) => {
      const trig = triggers.find((tr) => tr.triggerId === id);
      return trig?.type === 'PAGEVIEW' || trig?.name.toLowerCase().includes('all pages');
    });
    if (firesAllPages) {
      issues.push({
        id: `perf-html-${htmlTag.tagId}`,
        severity: 'warning',
        category: 'Performance',
        title: `Unscoped Custom HTML tag "${htmlTag.name}" on All Pages`,
        detail: 'Custom HTML injects synchronous/DOM-blocking script on every pageview, risking >200ms page load budget.',
        remediation: 'Migrate to native sandboxed template or defer firing to Window Loaded / specific conversion pages.',
        affectedId: htmlTag.tagId,
        affectedName: htmlTag.name,
        patchable: false,
      });
    }
  }

  // 7. Unused Triggers & Variables check
  const referencedTriggerIds = new Set<string>();
  for (const t of tags) {
    (t.firingTriggerId || []).forEach((id) => referencedTriggerIds.add(id));
    (t.blockingTriggerId || []).forEach((id) => referencedTriggerIds.add(id));
  }
  const unusedTriggers = triggers.filter((tr) => !referencedTriggerIds.has(tr.triggerId));
  if (unusedTriggers.length > 0) {
    issues.push({
      id: `orphan-triggers-${unusedTriggers.length}`,
      severity: 'warning',
      category: 'Legacy / Bloat',
      title: `${unusedTriggers.length} orphan trigger${unusedTriggers.length > 1 ? 's' : ''} not attached to any tag`,
      detail: `Unused triggers (${unusedTriggers.map((u) => u.name).join(', ')}) add unnecessary runtime listener overhead.`,
      remediation: 'Remove orphan triggers during container hygiene pass.',
      patchable: true,
    });
  }

  // 8. Check Conversion Linker presence when Google Ads tags exist
  if (gadsConvTags.length > 0 && !activeTags.some((t) => t.type === 'gclidw')) {
    issues.push({
      id: 'missing-conversion-linker',
      severity: 'critical',
      category: 'Enhanced Conversions',
      title: 'Missing Conversion Linker (gclidw) tag',
      detail: 'Google Ads conversion tags exist without an active Conversion Linker on All Pages to persist GCLID in first-party cookies.',
      remediation: 'Deploy Conversion Linker tag firing on All Pages with cross-domain linking if applicable.',
      patchable: true,
    });
  }

  if (issues.length === 0) {
    issues.push({
      id: 'all-nominal',
      severity: 'pass',
      category: 'Consent Mode v2',
      title: 'Container passes Consent Mode v2, deduplication, and hygiene checks',
      detail: 'All active tags enforce required consent signals, clean event_id parity, and Enhanced Conversions user_data.',
      remediation: 'No remediation required. Ready for workspace publish.',
      patchable: false,
    });
  }

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const consentCoveragePct =
    activeTags.length > 0 ? Math.round((consentCovered / activeTags.length) * 100) : 100;

  // Performance overhead estimate (ms)
  const estimatedLoadOverheadMs =
    activeTags.length * 11 +
    htmlTags.length * 65 +
    legacyUaTags.length * 48 +
    pausedTags.length * 3;

  const reliabilityPct = Math.max(
    62,
    Math.min(99.9, Number((99.8 - criticalCount * 4.6 - warningCount * 1.1).toFixed(1)))
  );

  return {
    containerPublicId: cv.container?.publicId || 'GTM-UNKNOWN',
    containerName: cv.container?.name || cv.name || 'Imported Container',
    totalTags: tags.length,
    activeTags: activeTags.length,
    pausedTags: pausedTags.length,
    totalTriggers: triggers.length,
    totalVariables: variables.length,
    consentCoveredTags: consentCovered,
    consentCoveragePct,
    estimatedLoadOverheadMs,
    reliabilityPct,
    issues,
  };
}

export function patchGtmContainer(container: GtmExportJson): {
  patched: GtmExportJson;
  changesApplied: string[];
} {
  const clone: GtmExportJson = JSON.parse(JSON.stringify(container));
  const cv = clone.containerVersion;
  const changesApplied: string[] = [];

  // 1. Remove paused legacy tags and active UA tags
  const originalTagCount = cv.tag.length;
  cv.tag = cv.tag.filter((tag) => {
    if (tag.paused) {
      changesApplied.push(`Purged paused tag "${tag.name}"`);
      return false;
    }
    if (tag.type === 'ua') {
      changesApplied.push(`Removed legacy UA tag "${tag.name}"`);
      return false;
    }
    return true;
  });

  // 2. Deduplicate duplicate purchase tags sharing identical type + firingTriggerId
  const seenKey = new Set<string>();
  cv.tag = cv.tag.filter((tag) => {
    if (/purchase|checkout|order/i.test(tag.name)) {
      const key = `${tag.type}:${(tag.firingTriggerId || []).slice().sort().join(',')}`;
      if (seenKey.has(key)) {
        changesApplied.push(`Removed duplicate purchase tag "${tag.name}"`);
        return false;
      }
      seenKey.add(key);
    }
    return true;
  });

  // 3. Ensure event_id variable exists if needed
  const hasEventIdVar = cv.variable.some((v) => v.name.includes('event_id'));
  if (!hasEventIdVar) {
    cv.variable.push({
      accountId: cv.accountId,
      containerId: cv.containerId,
      variableId: '991',
      name: 'DLV - event_id',
      type: 'v',
      parameter: [
        { type: 'INTEGER', key: 'dataLayerVersion', value: '2' },
        { type: 'BOOLEAN', key: 'setDefaultValue', value: 'false' },
        { type: 'TEMPLATE', key: 'name', value: 'event_id' },
      ],
    });
    changesApplied.push('Added variable "DLV - event_id"');
  }

  // 4. Patch consentSettings, Meta event_id, and Google Ads Enhanced Conversions
  for (const tag of cv.tag) {
    const needsAdConsent =
      AD_TAG_TYPES.has(tag.type) || /meta|facebook|ads|linkedin|tiktok/i.test(tag.name);
    const needsAnalyticsConsent =
      ANALYTICS_TAG_TYPES.has(tag.type) || /ga4|analytics/i.test(tag.name);

    if (needsAdConsent) {
      const currentList = tag.consentSettings?.consentType?.list?.map((i) => i.value) || [];
      if (
        tag.consentSettings?.consentStatus !== 'NEEDED' ||
        !currentList.includes('ad_storage') ||
        !currentList.includes('ad_user_data')
      ) {
        tag.consentSettings = {
          consentStatus: 'NEEDED',
          consentType: {
            type: 'LIST',
            list: [
              { type: 'TEMPLATE', value: 'ad_storage' },
              { type: 'TEMPLATE', value: 'ad_user_data' },
              { type: 'TEMPLATE', value: 'ad_personalization' },
            ],
          },
        };
        changesApplied.push(`Enforced Consent Mode v2 (ad_storage, ad_user_data, ad_personalization) on "${tag.name}"`);
      }
    } else if (needsAnalyticsConsent) {
      if (tag.consentSettings?.consentStatus !== 'NEEDED') {
        tag.consentSettings = {
          consentStatus: 'NEEDED',
          consentType: {
            type: 'LIST',
            list: [{ type: 'TEMPLATE', value: 'analytics_storage' }],
          },
        };
        changesApplied.push(`Enforced analytics_storage consent check on "${tag.name}"`);
      }
    }

    if (
      (/meta|facebook|capi|pixel/i.test(tag.name) || tag.type.includes('meta')) &&
      !/init|base|config/i.test(tag.name)
    ) {
      const rawParams = JSON.stringify(tag.parameter || []);
      if (!rawParams.includes('event_id') && !rawParams.includes('eventId')) {
        tag.parameter = tag.parameter || [];
        tag.parameter.push({
          type: 'TEMPLATE',
          key: 'eventId',
          value: '{{DLV - event_id}}',
        });
        changesApplied.push(`Bound {{DLV - event_id}} deduplication parameter to "${tag.name}"`);
      }
    }

    if (tag.type === 'awct') {
      const rawParams = JSON.stringify(tag.parameter || []);
      if (!rawParams.includes('enableEnhancedConversions')) {
        tag.parameter = tag.parameter || [];
        tag.parameter.push(
          { type: 'BOOLEAN', key: 'enableEnhancedConversions', value: 'true' },
          { type: 'TEMPLATE', key: 'cssProvidedEnhancedConversionValue', value: '{{User-Provided Data}}' }
        );
        changesApplied.push(`Enabled Enhanced Conversions userProvidedData on "${tag.name}"`);
      }
    }
  }

  // 5. Add Conversion Linker if Google Ads exists without it
  if (cv.tag.some((t) => t.type === 'awct') && !cv.tag.some((t) => t.type === 'gclidw')) {
    cv.tag.unshift({
      accountId: cv.accountId,
      containerId: cv.containerId,
      tagId: '992',
      name: 'Google Ads - Conversion Linker',
      type: 'gclidw',
      parameter: [{ type: 'BOOLEAN', key: 'enableLinker', value: 'true' }],
      firingTriggerId: ['2147479553'],
      consentSettings: { consentStatus: 'NOT_NEEDED' },
    });
    changesApplied.push('Added Conversion Linker (gclidw) on All Pages');
  }

  // 6. Prune orphan triggers
  const usedTrigIds = new Set<string>();
  for (const t of cv.tag) {
    (t.firingTriggerId || []).forEach((id) => usedTrigIds.add(id));
    (t.blockingTriggerId || []).forEach((id) => usedTrigIds.add(id));
  }
  cv.trigger = cv.trigger.filter((tr) => {
    if (!usedTrigIds.has(tr.triggerId)) {
      changesApplied.push(`Removed orphan trigger "${tr.name}"`);
      return false;
    }
    return true;
  });

  if (changesApplied.length === 0 && originalTagCount === cv.tag.length) {
    changesApplied.push('Container already meets all automated patch criteria.');
  }

  clone.exportTime = new Date().toISOString();
  return { patched: clone, changesApplied };
}

export function validateGtmJsonInput(raw: string): {
  valid: boolean;
  data?: GtmExportJson;
  error?: string;
} {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.containerVersion) {
      return {
        valid: false,
        error: 'JSON is missing the required root "containerVersion" object from GTM export.',
      };
    }
    if (!Array.isArray(parsed.containerVersion.tag)) {
      return {
        valid: false,
        error: 'containerVersion.tag must be an array.',
      };
    }
    return { valid: true, data: parsed as GtmExportJson };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid JSON syntax.',
    };
  }
}
