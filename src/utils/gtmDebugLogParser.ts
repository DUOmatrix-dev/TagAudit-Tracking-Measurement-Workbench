import { GtmExportJson } from '../types/tracking';

export type TagExecutionStatus = 'fired' | 'blocked' | 'failed' | 'still_running';

export interface ParsedDebugExecution {
  id: string;
  order: number;
  timestampMs: number;
  rawTimestamp: string;
  durationMs: number;
  eventIndex: number;
  dataLayerEvent: string;
  tagId?: string;
  tagName: string;
  tagType: string;
  triggerName: string;
  status: TagExecutionStatus;
  consentState?: string;
  notes?: string;
  raceFlagIds: string[];
}

export interface TagFrequencyMetric {
  tagName: string;
  shortName: string;
  tagType: string;
  totalExecutions: number;
  firedCount: number;
  blockedCount: number;
  failedCount: number;
  avgDurationMs: number;
  firstFiredMs: number | null;
  hasRaceCondition: boolean;
}

export type RacePatternType =
  | 'Consent Race'
  | 'Setup / Dependency Inversion'
  | 'Duplicate Rapid-Fire'
  | 'DOM / DataLayer Timing Race'
  | 'Blocking HTML Contention';

export interface RaceConditionFinding {
  id: string;
  severity: 'critical' | 'warning';
  pattern: RacePatternType;
  title: string;
  detail: string;
  remediation: string;
  deltaMs: number;
  involvedExecutionIds: string[];
  involvedTags: string[];
}

export interface ParsedGtmDebugReport {
  sourceFormat: 'json' | 'console_text';
  sessionDurationMs: number;
  executions: ParsedDebugExecution[];
  frequencies: TagFrequencyMetric[];
  raceConditions: RaceConditionFinding[];
  eventSequence: Array<{
    eventIndex: number;
    eventName: string;
    timestampMs: number;
    tagCount: number;
  }>;
  parseWarnings: string[];
}

export type DebugLogPresetId = 'checkout_race' | 'spa_burst' | 'clean_sequence';

function normalizeStatus(raw: unknown): TagExecutionStatus {
  const s = String(raw || 'fired').toLowerCase().trim();
  if (s.includes('block') || s.includes('consent_denied') || s.includes('suppressed')) {
    return 'blocked';
  }
  if (s.includes('fail') || s.includes('error') || s.includes('exception')) {
    return 'failed';
  }
  if (s.includes('still') || s.includes('pending') || s.includes('timeout')) {
    return 'still_running';
  }
  return 'fired';
}

function parseTimeToMs(raw: unknown): { ms: number; label: string } | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { ms: raw, label: `${Math.round(raw)}ms` };
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Format: 142ms or +142ms or 142.5ms
  const msMatch = trimmed.match(/^\+?(\d+(?:\.\d+)?)\s*ms$/i);
  if (msMatch) {
    const val = parseFloat(msMatch[1]);
    return { ms: val, label: `${Math.round(val)}ms` };
  }

  // Format: 1.42s
  const secMatch = trimmed.match(/^\+?(\d+(?:\.\d+)?)\s*s$/i);
  if (secMatch) {
    const val = parseFloat(secMatch[1]) * 1000;
    return { ms: val, label: `${Math.round(val)}ms` };
  }

  // Format: HH:MM:SS.mmm
  const clockMatch = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (clockMatch) {
    const hh = parseInt(clockMatch[1], 10);
    const mm = parseInt(clockMatch[2], 10);
    const ss = parseInt(clockMatch[3], 10);
    const ms = clockMatch[4] ? parseInt(clockMatch[4].padEnd(3, '0'), 10) : 0;
    const total = ((hh * 3600 + mm * 60 + ss) * 1000) + ms;
    return { ms: total, label: trimmed };
  }

  // ISO timestamp
  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    return { ms: parsedDate, label: trimmed };
  }

  // Plain numeric string
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const val = parseFloat(trimmed);
    return { ms: val, label: `${Math.round(val)}ms` };
  }

  return null;
}

function inferTagType(tagName: string, explicitType?: unknown): string {
  if (typeof explicitType === 'string' && explicitType.trim()) {
    return explicitType.trim();
  }
  const lower = tagName.toLowerCase();
  if (lower.includes('linker') || lower.includes('gclid')) return 'gclidw';
  if (lower.includes('google ads') || lower.includes('gads') || lower.includes('aw-')) return 'awct';
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('fbq')) return 'meta_pixel';
  if (lower.includes('ga4') && (lower.includes('config') || lower.includes('google tag'))) return 'googtag';
  if (lower.includes('ga4')) return 'gaawe';
  if (lower.includes('cmp') || lower.includes('cookiebot') || lower.includes('onetrust') || lower.includes('consent')) {
    return 'cmp';
  }
  if (lower.includes('html') || lower.includes('script') || lower.includes('hotjar') || lower.includes('clarity')) {
    return 'html';
  }
  if (lower.includes('linkedin')) return 'linkedin_insight';
  return 'tag';
}

function truncateLabel(text: string, maxLen = 28): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function isMarketingOrAnalyticsTag(exec: ParsedDebugExecution): boolean {
  const name = exec.tagName.toLowerCase();
  const type = exec.tagType.toLowerCase();
  if (type === 'cmp' || /cmp|cookiebot|onetrust|consent mode default/i.test(name)) {
    return false;
  }
  return (
    ['awct', 'sp', 'gaawe', 'googtag', 'gaawc', 'meta_pixel', 'linkedin_insight', 'tiktok_pixel', 'ua'].includes(type) ||
    /ga4|google ads|meta|facebook|linkedin|tiktok|pixel|conversion|retargeting|analytics/i.test(name)
  );
}

function detectRaceConditions(executions: ParsedDebugExecution[]): RaceConditionFinding[] {
  const findings: RaceConditionFinding[] = [];
  const sorted = [...executions].sort((a, b) => a.timestampMs - b.timestampMs || a.order - b.order);

  // 1. Consent / CMP Initialization Race
  const cmpExecutions = sorted.filter(
    (e) =>
      e.tagType === 'cmp' ||
      /cmp|cookiebot|onetrust|trustarc|consent/i.test(e.tagName) ||
      /consent_update|gtm\.init_consent/i.test(e.dataLayerEvent)
  );

  if (cmpExecutions.length > 0) {
    const firstCmpReady = cmpExecutions[0];
    const cmpReadyEndMs = firstCmpReady.timestampMs + Math.max(firstCmpReady.durationMs, 10);

    const earlyTags = sorted.filter(
      (e) =>
        e.id !== firstCmpReady.id &&
        e.status === 'fired' &&
        isMarketingOrAnalyticsTag(e) &&
        (e.timestampMs < cmpReadyEndMs ||
          /denied|pending|default/i.test(e.consentState || ''))
    );

    for (const early of earlyTags) {
      const delta = Math.round(cmpReadyEndMs - early.timestampMs);
      const id = `race-consent-${early.id}`;
      findings.push({
        id,
        severity: 'critical',
        pattern: 'Consent Race',
        title: `"${early.tagName}" fired before CMP consent resolved`,
        detail: `Tag executed at +${Math.round(early.timestampMs)}ms (${early.dataLayerEvent}) while "${firstCmpReady.tagName}" did not resolve until +${Math.round(cmpReadyEndMs)}ms (overlap Δ ${Math.abs(delta)}ms).`,
        remediation:
          'Move marketing/analytics triggers from "All Pages (gtm.js)" to a post-CMP consent_update trigger or enforce Consent Mode v2 built-in checks.',
        deltaMs: Math.abs(delta),
        involvedExecutionIds: [early.id, firstCmpReady.id],
        involvedTags: [early.tagName, firstCmpReady.tagName],
      });
    }
  } else {
    // Flag any tag fired explicitly with denied/pending consent state
    for (const exec of sorted) {
      if (exec.status === 'fired' && isMarketingOrAnalyticsTag(exec) && /denied|pending/i.test(exec.consentState || '')) {
        findings.push({
          id: `race-consent-state-${exec.id}`,
          severity: 'critical',
          pattern: 'Consent Race',
          title: `"${exec.tagName}" fired while consent state was "${exec.consentState}"`,
          detail: `Tag executed at +${Math.round(exec.timestampMs)}ms on "${exec.dataLayerEvent}" prior to granted consent signal.`,
          remediation: 'Gate tag with Consent Settings = NEEDED (ad_storage / analytics_storage) or trigger on consent_ready.',
          deltaMs: 0,
          involvedExecutionIds: [exec.id],
          involvedTags: [exec.tagName],
        });
      }
    }
  }

  // 2. Setup / Dependency Inversion (Conversion vs Linker, Meta Event vs Base Init, GA4 Event vs Config)
  const linkerExec = sorted.find(
    (e) => e.status === 'fired' && (e.tagType === 'gclidw' || /conversion linker/i.test(e.tagName))
  );
  const gadsConvExecs = sorted.filter(
    (e) =>
      e.status === 'fired' &&
      (e.tagType === 'awct' || (/google ads|gads/i.test(e.tagName) && !/linker|remarketing/i.test(e.tagName)))
  );
  if (linkerExec) {
    for (const conv of gadsConvExecs) {
      if (conv.timestampMs < linkerExec.timestampMs + linkerExec.durationMs) {
        const delta = Math.round(linkerExec.timestampMs + linkerExec.durationMs - conv.timestampMs);
        findings.push({
          id: `race-linker-${conv.id}`,
          severity: 'critical',
          pattern: 'Setup / Dependency Inversion',
          title: `Google Ads conversion "${conv.tagName}" raced ahead of Conversion Linker`,
          detail: `Conversion tag started at +${Math.round(conv.timestampMs)}ms before Conversion Linker finished persisting _gcl_aw at +${Math.round(linkerExec.timestampMs + linkerExec.durationMs)}ms.`,
          remediation: 'Fire Conversion Linker on Consent Initialization / Initialization (All Pages) with higher tag firing priority.',
          deltaMs: Math.abs(delta),
          involvedExecutionIds: [conv.id, linkerExec.id],
          involvedTags: [conv.tagName, linkerExec.tagName],
        });
      }
    }
  }

  const metaInitExec = sorted.find(
    (e) => e.status === 'fired' && /meta|facebook/i.test(e.tagName) && /init|base|config/i.test(e.tagName)
  );
  const metaEventExecs = sorted.filter(
    (e) =>
      e.status === 'fired' &&
      (/meta|facebook/i.test(e.tagName) || e.tagType === 'meta_pixel') &&
      !/init|base|config/i.test(e.tagName)
  );
  if (metaInitExec) {
    for (const metaEv of metaEventExecs) {
      const initFinish = metaInitExec.timestampMs + metaInitExec.durationMs;
      if (metaEv.timestampMs < initFinish) {
        const delta = Math.round(initFinish - metaEv.timestampMs);
        findings.push({
          id: `race-meta-init-${metaEv.id}`,
          severity: 'critical',
          pattern: 'Setup / Dependency Inversion',
          title: `"${metaEv.tagName}" fired before Meta Base Pixel initialized`,
          detail: `"${metaEv.tagName}" executed at +${Math.round(metaEv.timestampMs)}ms while "${metaInitExec.tagName}" completed at +${Math.round(initFinish)}ms (Δ ${delta}ms), risking undefined fbq() calls.`,
          remediation: `Configure Tag Sequencing on "${metaEv.tagName}" to require "${metaInitExec.tagName}" as a setup tag.`,
          deltaMs: delta,
          involvedExecutionIds: [metaEv.id, metaInitExec.id],
          involvedTags: [metaEv.tagName, metaInitExec.tagName],
        });
      }
    }
  }

  const ga4ConfigExec = sorted.find(
    (e) => e.status === 'fired' && (e.tagType === 'googtag' || e.tagType === 'gaawc' || (/ga4/i.test(e.tagName) && /config|google tag/i.test(e.tagName)))
  );
  const ga4EventExecs = sorted.filter(
    (e) => e.status === 'fired' && (e.tagType === 'gaawe' || (/ga4/i.test(e.tagName) && !/config|google tag/i.test(e.tagName)))
  );
  if (ga4ConfigExec) {
    for (const gaEv of ga4EventExecs) {
      const cfgEnd = ga4ConfigExec.timestampMs + ga4ConfigExec.durationMs;
      if (gaEv.timestampMs < cfgEnd) {
        const delta = Math.round(cfgEnd - gaEv.timestampMs);
        findings.push({
          id: `race-ga4-cfg-${gaEv.id}`,
          severity: 'warning',
          pattern: 'Setup / Dependency Inversion',
          title: `GA4 event "${gaEv.tagName}" overlapped GA4 Config / Google Tag`,
          detail: `Event tag fired at +${Math.round(gaEv.timestampMs)}ms before Google Tag finished initializing at +${Math.round(cfgEnd)}ms (Δ ${delta}ms).`,
          remediation: 'Assign Google Tag to Initialization (All Pages) or use Tag Sequencing before early ecommerce events.',
          deltaMs: delta,
          involvedExecutionIds: [gaEv.id, ga4ConfigExec.id],
          involvedTags: [gaEv.tagName, ga4ConfigExec.tagName],
        });
      }
    }
  }

  // 3. Duplicate Rapid-Fire Burst (same tag fired >=2 times within 500ms or on same eventIndex)
  const byTag = new Map<string, ParsedDebugExecution[]>();
  for (const exec of sorted) {
    if (exec.status !== 'fired') continue;
    const key = exec.tagName.toLowerCase();
    const list = byTag.get(key) || [];
    list.push(exec);
    byTag.set(key, list);
  }
  for (const [, list] of byTag.entries()) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      const delta = Math.round(curr.timestampMs - prev.timestampMs);
      if (delta <= 500 || prev.eventIndex === curr.eventIndex) {
        findings.push({
          id: `race-dup-${prev.id}-${curr.id}`,
          severity: /purchase|conversion|checkout|lead/i.test(curr.tagName) ? 'critical' : 'warning',
          pattern: 'Duplicate Rapid-Fire',
          title: `Rapid duplicate firing on "${curr.tagName}" (${delta}ms apart)`,
          detail: `Fired at +${Math.round(prev.timestampMs)}ms (${prev.triggerName}) and again at +${Math.round(curr.timestampMs)}ms (${curr.triggerName}), creating a 2x conversion/hit inflation risk.`,
          remediation: 'Set Tag Firing Options to "Once per event" or deduplicate overlapping triggers (e.g., History Change vs Page View).',
          deltaMs: delta,
          involvedExecutionIds: [prev.id, curr.id],
          involvedTags: [curr.tagName],
        });
      }
    }
  }

  // 4. DOM / DataLayer Timing Race (conversion/DOM tag firing at gtm.js before gtm.dom or purchase event)
  const domReadyEvent = sorted.find((e) => e.dataLayerEvent === 'gtm.dom' || e.dataLayerEvent === 'DOM Ready');
  for (const exec of sorted) {
    if (exec.status !== 'fired') continue;
    const firesOnContainerLoaded =
      exec.dataLayerEvent === 'gtm.js' || /all pages|container loaded|pageview/i.test(exec.triggerName);
    const isDomOrConvDependent =
      /purchase|checkout|thank|form|scroll|dom|enhanced conversion|user-provided/i.test(exec.tagName);
    if (firesOnContainerLoaded && isDomOrConvDependent) {
      const domOffset = domReadyEvent ? Math.round(domReadyEvent.timestampMs - exec.timestampMs) : 0;
      findings.push({
        id: `race-dom-${exec.id}`,
        severity: 'warning',
        pattern: 'DOM / DataLayer Timing Race',
        title: `"${exec.tagName}" triggered on gtm.js before DOM/DataLayer stabilized`,
        detail: `Executed at +${Math.round(exec.timestampMs)}ms on "${exec.dataLayerEvent}"${domReadyEvent ? ` (${domOffset}ms before gtm.dom)` : ''}; DOM selectors or async dataLayer keys may be undefined.`,
        remediation: 'Switch firing trigger to a dedicated custom dataLayer event or DOM Ready (gtm.dom) / Window Loaded.',
        deltaMs: Math.max(0, domOffset),
        involvedExecutionIds: [exec.id],
        involvedTags: [exec.tagName],
      });
    }
  }

  // 5. Slow / Blocking Custom HTML Contention (>= 120ms overlapping other fired tags)
  const slowHtmlTags = sorted.filter(
    (e) => e.status === 'fired' && (e.tagType === 'html' || /custom html/i.test(e.tagName)) && e.durationMs >= 120
  );
  for (const htmlExec of slowHtmlTags) {
    const htmlEnd = htmlExec.timestampMs + htmlExec.durationMs;
    const overlapped = sorted.filter(
      (other) =>
        other.id !== htmlExec.id &&
        other.status === 'fired' &&
        other.timestampMs >= htmlExec.timestampMs &&
        other.timestampMs < htmlEnd
    );
    if (overlapped.length > 0) {
      findings.push({
        id: `race-html-${htmlExec.id}`,
        severity: 'warning',
        pattern: 'Blocking HTML Contention',
        title: `Slow Custom HTML "${htmlExec.tagName}" (${htmlExec.durationMs}ms) overlapped ${overlapped.length} downstream tag${overlapped.length > 1 ? 's' : ''}`,
        detail: `Main-thread script ran from +${Math.round(htmlExec.timestampMs)}ms to +${Math.round(htmlEnd)}ms while ${overlapped.map((o) => `"${o.tagName}"`).slice(0, 2).join(', ')} executed.`,
        remediation: 'Refactor blocking Custom HTML into an async sandboxed template or defer firing to Window Loaded (gtm.load).',
        deltaMs: htmlExec.durationMs,
        involvedExecutionIds: [htmlExec.id, ...overlapped.map((o) => o.id)],
        involvedTags: [htmlExec.tagName, ...overlapped.map((o) => o.tagName)],
      });
    }
  }

  // Attach finding IDs back to executions
  const flagMap = new Map<string, string[]>();
  for (const finding of findings) {
    for (const execId of finding.involvedExecutionIds) {
      const existing = flagMap.get(execId) || [];
      if (!existing.includes(finding.id)) existing.push(finding.id);
      flagMap.set(execId, existing);
    }
  }
  for (const exec of executions) {
    exec.raceFlagIds = flagMap.get(exec.id) || [];
  }

  return findings;
}

function finalizeReport(
  executions: ParsedDebugExecution[],
  sourceFormat: 'json' | 'console_text',
  parseWarnings: string[]
): ParsedGtmDebugReport {
  // Normalize timestamps so session starts at 0ms
  const minTs = Math.min(...executions.map((e) => e.timestampMs));
  const normalized = executions
    .map((e) => ({
      ...e,
      timestampMs: Math.max(0, Math.round(e.timestampMs - minTs)),
    }))
    .sort((a, b) => a.timestampMs - b.timestampMs || a.order - b.order)
    .map((e, idx) => ({
      ...e,
      order: idx + 1,
    }));

  const raceConditions = detectRaceConditions(normalized);

  // Build frequency summary sorted by execution count descending
  const freqMap = new Map<string, ParsedDebugExecution[]>();
  for (const exec of normalized) {
    const list = freqMap.get(exec.tagName) || [];
    list.push(exec);
    freqMap.set(exec.tagName, list);
  }

  const frequencies: TagFrequencyMetric[] = Array.from(freqMap.entries())
    .map(([tagName, list]) => {
      const fired = list.filter((x) => x.status === 'fired');
      const blocked = list.filter((x) => x.status === 'blocked');
      const failed = list.filter((x) => x.status === 'failed');
      const avgDurationMs = Math.round(
        list.reduce((acc, item) => acc + item.durationMs, 0) / Math.max(1, list.length)
      );
      return {
        tagName,
        shortName: truncateLabel(tagName, 24),
        tagType: list[0].tagType,
        totalExecutions: list.length,
        firedCount: fired.length,
        blockedCount: blocked.length,
        failedCount: failed.length,
        avgDurationMs,
        firstFiredMs: fired.length > 0 ? fired[0].timestampMs : null,
        hasRaceCondition: list.some((x) => x.raceFlagIds.length > 0),
      };
    })
    .sort((a, b) => b.totalExecutions - a.totalExecutions || a.tagName.localeCompare(b.tagName));

  // Build event sequence timeline markers
  const evMap = new Map<string, { eventIndex: number; eventName: string; timestampMs: number; tagCount: number }>();
  for (const exec of normalized) {
    const key = `${exec.eventIndex}:${exec.dataLayerEvent}`;
    const existing = evMap.get(key);
    if (!existing) {
      evMap.set(key, {
        eventIndex: exec.eventIndex,
        eventName: exec.dataLayerEvent,
        timestampMs: exec.timestampMs,
        tagCount: 1,
      });
    } else {
      existing.timestampMs = Math.min(existing.timestampMs, exec.timestampMs);
      existing.tagCount += 1;
    }
  }
  const eventSequence = Array.from(evMap.values()).sort(
    (a, b) => a.timestampMs - b.timestampMs || a.eventIndex - b.eventIndex
  );

  const sessionDurationMs = Math.max(
    100,
    ...normalized.map((e) => e.timestampMs + Math.max(10, e.durationMs))
  );

  return {
    sourceFormat,
    sessionDurationMs,
    executions: normalized,
    frequencies,
    raceConditions,
    eventSequence,
    parseWarnings,
  };
}

function tryParseJsonLog(raw: string): ParsedGtmDebugReport | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const warnings: string[] = [];
  const executions: ParsedDebugExecution[] = [];

  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>).logs)
      ? ((parsed as Record<string, unknown>).logs as unknown[])
      : Array.isArray((parsed as Record<string, unknown>).tags)
        ? ((parsed as Record<string, unknown>).tags as unknown[])
        : Array.isArray((parsed as Record<string, unknown>).executions)
          ? ((parsed as Record<string, unknown>).executions as unknown[])
          : Array.isArray((parsed as Record<string, unknown>).events)
            ? ((parsed as Record<string, unknown>).events as unknown[])
            : [];

  if (rows.length === 0) return null;

  let rollingTimeMs = 0;
  let eventCounter = 0;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    // Nested event -> tagsFired shape (Tag Assistant export style)
    const nestedTags = Array.isArray(obj.tagsFired)
      ? obj.tagsFired
      : Array.isArray(obj.tags)
        ? obj.tags
        : null;

    if (nestedTags) {
      eventCounter += 1;
      const evName = String(obj.event || obj.eventName || obj.dataLayerEvent || `event_${eventCounter}`);
      const evTime = parseTimeToMs(obj.timestamp ?? obj.timeMs ?? obj.offsetMs);
      const baseMs = evTime ? evTime.ms : rollingTimeMs;
      rollingTimeMs = Math.max(rollingTimeMs, baseMs + 25);

      for (let j = 0; j < nestedTags.length; j++) {
        const t = nestedTags[j] as Record<string, unknown>;
        const tagName = String(t.tagName || t.name || `Tag #${j + 1}`);
        const tagTime = parseTimeToMs(t.timestamp ?? t.timeMs ?? t.startMs);
        const startMs = tagTime ? tagTime.ms : baseMs + j * 14;
        const duration = Number(t.durationMs ?? t.executionTimeMs ?? 28);
        executions.push({
          id: `exec-${executions.length + 1}`,
          order: executions.length + 1,
          timestampMs: startMs,
          rawTimestamp: tagTime?.label || `${Math.round(startMs)}ms`,
          durationMs: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 25,
          eventIndex: Number(obj.eventIndex ?? eventCounter),
          dataLayerEvent: evName,
          tagId: t.tagId ? String(t.tagId) : undefined,
          tagName,
          tagType: inferTagType(tagName, t.tagType || t.type),
          triggerName: String(t.triggerName || t.trigger || evName),
          status: normalizeStatus(t.status || t.firingStatus),
          consentState: t.consentState ? String(t.consentState) : undefined,
          notes: t.notes ? String(t.notes) : undefined,
          raceFlagIds: [],
        });
      }
      continue;
    }

    // Flat execution record
    const tagName = String(obj.tagName || obj.tag || obj.name || '').trim();
    if (!tagName) {
      warnings.push(`Skipped JSON entry #${i + 1}: missing tagName.`);
      continue;
    }
    const parsedTime = parseTimeToMs(obj.timestamp ?? obj.timeMs ?? obj.startMs ?? obj.offsetMs);
    const ts = parsedTime ? parsedTime.ms : rollingTimeMs;
    rollingTimeMs = Math.max(rollingTimeMs, ts + 18);

    const evName = String(obj.dataLayerEvent || obj.event || obj.eventName || 'gtm.js');
    const evIdx = Number(obj.eventIndex ?? (evName === 'gtm.js' ? 1 : i + 1));
    const duration = Number(obj.durationMs ?? obj.duration ?? obj.executionTimeMs ?? 24);

    executions.push({
      id: `exec-${executions.length + 1}`,
      order: Number(obj.firingOrder ?? obj.order ?? executions.length + 1),
      timestampMs: ts,
      rawTimestamp: parsedTime?.label || `${Math.round(ts)}ms`,
      durationMs: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 24,
      eventIndex: Number.isFinite(evIdx) ? evIdx : 1,
      dataLayerEvent: evName,
      tagId: obj.tagId ? String(obj.tagId) : undefined,
      tagName,
      tagType: inferTagType(tagName, obj.tagType || obj.type),
      triggerName: String(obj.triggerName || obj.trigger || evName),
      status: normalizeStatus(obj.status || obj.firingStatus),
      consentState: obj.consentState ? String(obj.consentState) : undefined,
      notes: obj.notes ? String(obj.notes) : undefined,
      raceFlagIds: [],
    });
  }

  if (executions.length === 0) return null;
  return finalizeReport(executions, 'json', warnings);
}

function tryParseConsoleText(raw: string): ParsedGtmDebugReport | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const executions: ParsedDebugExecution[] = [];
  const warnings: string[] = [];

  let currentEvent = 'gtm.js';
  let currentEventIdx = 1;
  let lastTs = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip obvious console noise headers
    if (/^(\/\/|#\s*gtm|---)/i.test(line)) continue;

    // Detect standalone dataLayer event marker lines: e.g. `Event #3: purchase (+210ms)`
    const eventOnlyMatch = line.match(
      /^(?:\[([^\]]+)\]\s*)?(?:Event(?:\s*#?(\d+))?|dataLayer\.push)\s*[:\-]?\s*["']?([a-zA-Z0-9_.-]+)["']?(?:\s*\(\+?(\d+)\s*ms\))?$/i
    );
    if (eventOnlyMatch && !/tag|fired|blocked|failed/i.test(line)) {
      currentEventIdx = eventOnlyMatch[2] ? parseInt(eventOnlyMatch[2], 10) : currentEventIdx + 1;
      currentEvent = eventOnlyMatch[3];
      const t = parseTimeToMs(eventOnlyMatch[1] || (eventOnlyMatch[4] ? `${eventOnlyMatch[4]}ms` : null));
      if (t) lastTs = t.ms;
      continue;
    }

    // Key=value pipe format: `142ms | event=purchase | tag="Google Ads - Purchase" | status=FIRED | trigger="..." | duration=42ms | consent=granted`
    if (line.includes('|') && /(?:tag|name)\s*=/i.test(line)) {
      const parts = line.split('|').map((p) => p.trim());
      const firstTime = parseTimeToMs(parts[0]);
      const kv = new Map<string, string>();
      for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq > 0) {
          const k = part.slice(0, eq).trim().toLowerCase();
          const v = part.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          kv.set(k, v);
        }
      }
      const tagName = kv.get('tag') || kv.get('tagname') || kv.get('name');
      if (!tagName) continue;

      const timeParsed = firstTime || parseTimeToMs(kv.get('time') || kv.get('ts') || kv.get('offset'));
      const ts = timeParsed ? timeParsed.ms : lastTs + 15;
      lastTs = Math.max(lastTs, ts);

      const evName = kv.get('event') || currentEvent;
      if (evName !== currentEvent) {
        currentEvent = evName;
        currentEventIdx += 1;
      }
      const durParsed = parseTimeToMs(kv.get('duration') || kv.get('dur') || '24ms');

      executions.push({
        id: `exec-${executions.length + 1}`,
        order: executions.length + 1,
        timestampMs: ts,
        rawTimestamp: timeParsed?.label || `${Math.round(ts)}ms`,
        durationMs: durParsed ? Math.max(4, Math.round(durParsed.ms)) : 24,
        eventIndex: kv.get('eventindex') ? parseInt(kv.get('eventindex')!, 10) : currentEventIdx,
        dataLayerEvent: evName,
        tagId: kv.get('tagid') || kv.get('id'),
        tagName,
        tagType: inferTagType(tagName, kv.get('type') || kv.get('tagtype')),
        triggerName: kv.get('trigger') || kv.get('triggername') || evName,
        status: normalizeStatus(kv.get('status') || 'fired'),
        consentState: kv.get('consent') || kv.get('gcs'),
        raceFlagIds: [],
      });
      continue;
    }

    // General Tag Assistant / DevTools console line:
    // e.g. `[00:00:00.142] gtm.js | TAG FIRED: Meta Pixel - Purchase (48ms) | trigger: All Pages`
    // or `[142ms] Event "purchase" -> Tag Fired: "GA4 - Purchase" (duration: 32ms)`
    const generalMatch = line.match(
      /^(?:\[([^\]]+)\]|(\+?\d+(?:\.\d+)?\s*ms))?\s*(?:([^|\->]+?)\s*(?:\||->)\s*)?(?:Tag\s+)?(FIRED|BLOCKED|FAILED|STILL_RUNNING|Tag Fired|Tag Blocked|Tag Failed)\s*[:\-]?\s*["']?([^("|]+?)["']?(?:\s*\((?:duration:\s*)?(\d+)\s*ms\))?(?:\s*\|\s*trigger\s*[:=]\s*["']?([^|\n"]+)["']?)?(?:\s*\|\s*consent\s*[:=]\s*["']?([^|\n"]+)["']?)?$/i
    );
    if (generalMatch) {
      const timeParsed = parseTimeToMs(generalMatch[1] || generalMatch[2]);
      const ts = timeParsed ? timeParsed.ms : lastTs + 18;
      lastTs = Math.max(lastTs, ts);

      const evCandidate = (generalMatch[3] || '').replace(/^event\s*[:#]?\s*\d*\s*/i, '').replace(/^["']|["']$/g, '').trim();
      if (evCandidate && evCandidate !== currentEvent) {
        currentEvent = evCandidate;
        currentEventIdx += 1;
      }

      const tagName = generalMatch[5].trim();
      const durationMs = generalMatch[6] ? parseInt(generalMatch[6], 10) : 26;
      const triggerName = (generalMatch[7] || currentEvent).trim();
      const consentState = generalMatch[8]?.trim();

      executions.push({
        id: `exec-${executions.length + 1}`,
        order: executions.length + 1,
        timestampMs: ts,
        rawTimestamp: timeParsed?.label || `${Math.round(ts)}ms`,
        durationMs,
        eventIndex: currentEventIdx,
        dataLayerEvent: currentEvent,
        tagName,
        tagType: inferTagType(tagName),
        triggerName,
        status: normalizeStatus(generalMatch[4]),
        consentState,
        raceFlagIds: [],
      });
      continue;
    }

    warnings.push(`Line ${i + 1} did not match a recognized GTM debug log format.`);
  }

  if (executions.length === 0) return null;
  return finalizeReport(executions, 'console_text', warnings);
}

export function parseGtmDebugConsoleLog(
  raw: string
): { ok: true; report: ParsedGtmDebugReport } | { ok: false; error: string } {
  if (!raw.trim()) {
    return { ok: false, error: 'Debug log input is empty. Upload a GTM debug JSON/log file or paste console lines.' };
  }

  const fromJson = tryParseJsonLog(raw);
  if (fromJson) {
    return { ok: true, report: fromJson };
  }

  const fromText = tryParseConsoleText(raw);
  if (fromText) {
    return { ok: true, report: fromText };
  }

  return {
    ok: false,
    error:
      'Could not extract tag executions. Supported formats include JSON event/tag arrays or DevTools console lines like: [142ms] gtm.js | TAG FIRED: GA4 - Config (28ms) | trigger: All Pages',
  };
}

export function getSampleDebugLogPreset(
  presetId: DebugLogPresetId,
  container?: GtmExportJson
): { label: string; description: string; rawLog: string } {
  if (presetId === 'checkout_race') {
    const sample = [
      {
        eventIndex: 1,
        dataLayerEvent: 'gtm.js',
        timestamp: '12ms',
        durationMs: 28,
        tagId: '101',
        tagName: 'GA4 - Purchase Event (Legacy Trigger)',
        tagType: 'gaawe',
        triggerName: 'All Pages (gtm.js)',
        status: 'fired',
        consentState: 'default_pending',
      },
      {
        eventIndex: 1,
        dataLayerEvent: 'gtm.js',
        timestamp: '22ms',
        durationMs: 36,
        tagId: '104',
        tagName: 'Meta Pixel - Purchase',
        tagType: 'meta_pixel',
        triggerName: 'Order Confirmation URL',
        status: 'fired',
        consentState: 'default_pending',
      },
      {
        eventIndex: 2,
        dataLayerEvent: 'gtm.init_consent',
        timestamp: '44ms',
        durationMs: 42,
        tagId: '100',
        tagName: 'Cookiebot CMP - Consent Init',
        tagType: 'cmp',
        triggerName: 'Consent Initialization - All Pages',
        status: 'fired',
        consentState: 'updating',
      },
      {
        eventIndex: 3,
        dataLayerEvent: 'gtm.js',
        timestamp: '56ms',
        durationMs: 148,
        tagId: '109',
        tagName: 'Custom HTML - Legacy Checkout Scraper',
        tagType: 'html',
        triggerName: 'All Pages (gtm.js)',
        status: 'fired',
        consentState: 'granted',
      },
      {
        eventIndex: 3,
        dataLayerEvent: 'gtm.js',
        timestamp: '72ms',
        durationMs: 34,
        tagId: '102',
        tagName: 'Meta Pixel - Base Init',
        tagType: 'meta_pixel',
        triggerName: 'All Pages (gtm.js)',
        status: 'fired',
        consentState: 'granted',
      },
      {
        eventIndex: 4,
        dataLayerEvent: 'purchase',
        timestamp: '132ms',
        durationMs: 38,
        tagId: '106',
        tagName: 'Google Ads - Purchase Conversion',
        tagType: 'awct',
        triggerName: 'Custom Event - purchase',
        status: 'fired',
        consentState: 'granted',
      },
      {
        eventIndex: 4,
        dataLayerEvent: 'purchase',
        timestamp: '164ms',
        durationMs: 26,
        tagId: '105',
        tagName: 'Google Ads - Conversion Linker',
        tagType: 'gclidw',
        triggerName: 'DOM Ready (gtm.dom)',
        status: 'fired',
        consentState: 'granted',
      },
      {
        eventIndex: 5,
        dataLayerEvent: 'gtm.dom',
        timestamp: '218ms',
        durationMs: 22,
        tagId: '106',
        tagName: 'Google Ads - Purchase Conversion',
        tagType: 'awct',
        triggerName: 'Thank You DOM Ready',
        status: 'fired',
        consentState: 'granted',
      },
      {
        eventIndex: 5,
        dataLayerEvent: 'gtm.dom',
        timestamp: '245ms',
        durationMs: 19,
        tagId: '108',
        tagName: 'LinkedIn Insight Tag - Purchase',
        tagType: 'linkedin_insight',
        triggerName: 'Custom Event - purchase',
        status: 'blocked',
        consentState: 'ad_personalization:denied',
      },
    ];
    return {
      label: 'Checkout Race Log',
      description: 'Simulates CMP consent race, Meta Base Init inversion, slow Custom HTML contention, and duplicate purchase firing.',
      rawLog: JSON.stringify(sample, null, 2),
    };
  }

  if (presetId === 'spa_burst') {
    const lines = [
      '# GTM Tag Assistant Console Capture - SPA Checkout Transition',
      '0ms | event=gtm.init_consent | tag="OneTrust CMP Banner" | type=cmp | status=FIRED | trigger="Consent Initialization" | duration=26ms | consent=granted',
      '34ms | event=gtm.js | tag="Google Tag - GA4 Config" | type=googtag | status=FIRED | trigger="Initialization - All Pages" | duration=42ms | consent=granted',
      '52ms | event=gtm.js | tag="GA4 - view_item" | type=gaawe | status=FIRED | trigger="All Pages" | duration=24ms | consent=granted',
      '110ms | event=gtm.historyChange | tag="GA4 - Page View (SPA)" | type=gaawe | status=FIRED | trigger="History Change" | duration=21ms | consent=granted',
      '195ms | event=gtm.historyChange | tag="GA4 - Page View (SPA)" | type=gaawe | status=FIRED | trigger="History Change v2" | duration=19ms | consent=granted',
      '260ms | event=add_to_cart | tag="Meta Pixel - AddToCart" | type=meta_pixel | status=FIRED | trigger="Custom - add_to_cart" | duration=34ms | consent=granted',
      '274ms | event=add_to_cart | tag="Meta Pixel - Base Init" | type=meta_pixel | status=FIRED | trigger="Window Loaded" | duration=38ms | consent=granted',
      '330ms | event=begin_checkout | tag="TikTok Pixel - InitiateCheckout" | type=tiktok_pixel | status=BLOCKED | trigger="Custom - begin_checkout" | duration=12ms | consent=ad_storage:denied',
      '395ms | event=purchase | tag="Google Ads - Purchase" | type=awct | status=FIRED | trigger="Custom - purchase" | duration=31ms | consent=granted',
      '480ms | event=purchase | tag="Google Ads - Purchase" | type=awct | status=FIRED | trigger="Thank You Route Match" | duration=29ms | consent=granted',
    ].join('\n');
    return {
      label: 'SPA History Burst',
      description: 'DevTools text console capture showing History Change double-firing and Meta Pixel setup inversion.',
      rawLog: lines,
    };
  }

  // Build deterministic trace from active GTM container when available
  const tags = (container?.containerVersion.tag || []).filter((t) => !t.paused);
  const triggers = new Map(
    (container?.containerVersion.trigger || []).map((tr) => [tr.triggerId, tr])
  );

  if (tags.length > 0) {
    // Order cleanly: CMP/Consent -> Linker/Config -> Base Init -> Events -> Conversions
    const scoreTag = (name: string, type: string): number => {
      const lower = name.toLowerCase();
      if (type === 'cmp' || /consent|cmp|cookiebot|onetrust/i.test(lower)) return 0;
      if (type === 'gclidw' || /linker/i.test(lower)) return 1;
      if (type === 'googtag' || type === 'gaawc' || /init|base|config/i.test(lower)) return 2;
      if (/purchase|conversion|checkout/i.test(lower)) return 4;
      return 3;
    };

    const ordered = [...tags].sort(
      (a, b) => scoreTag(a.name, a.type) - scoreTag(b.name, b.type)
    );

    let cursorMs = 10;
    const generated = ordered.map((tag, idx) => {
      const trigId = tag.firingTriggerId?.[0];
      const trig = trigId ? triggers.get(trigId) : undefined;
      const trigName = trig?.name || 'All Pages';
      const eventName =
        scoreTag(tag.name, tag.type) <= 1
          ? 'gtm.init_consent'
          : /purchase/i.test(tag.name)
            ? 'purchase'
            : /lead/i.test(tag.name)
              ? 'generate_lead'
              : trig?.type === 'DOM_READY'
                ? 'gtm.dom'
                : 'gtm.js';
      const dur = tag.type === 'html' ? 58 : 24 + (idx % 4) * 6;
      const row = {
        eventIndex: Math.min(4, Math.floor(idx / 2) + 1),
        dataLayerEvent: eventName,
        timestamp: `${cursorMs}ms`,
        durationMs: dur,
        tagId: tag.tagId,
        tagName: tag.name,
        tagType: tag.type,
        triggerName: trigName,
        status: 'fired',
        consentState:
          tag.consentSettings?.consentStatus === 'NEEDED' ? 'granted' : 'not_required',
      };
      cursorMs += dur + 18;
      return row;
    });

    return {
      label: 'Active Container Trace',
      description: 'Clean firing sequence simulated from your active GTM container tags and triggers.',
      rawLog: JSON.stringify(generated, null, 2),
    };
  }

  return {
    label: 'Clean Sequence Log',
    description: 'Properly sequenced CMP, Conversion Linker, Base Pixel, and Purchase conversion trace.',
    rawLog: JSON.stringify(
      [
        { eventIndex: 1, dataLayerEvent: 'gtm.init_consent', timestamp: '8ms', durationMs: 24, tagName: 'CMP - Consent Init', tagType: 'cmp', triggerName: 'Consent Initialization', status: 'fired', consentState: 'granted' },
        { eventIndex: 2, dataLayerEvent: 'gtm.init', timestamp: '38ms', durationMs: 22, tagName: 'Google Ads - Conversion Linker', tagType: 'gclidw', triggerName: 'Initialization - All Pages', status: 'fired', consentState: 'granted' },
        { eventIndex: 3, dataLayerEvent: 'gtm.js', timestamp: '66ms', durationMs: 32, tagName: 'Google Tag - GA4 Config', tagType: 'googtag', triggerName: 'All Pages', status: 'fired', consentState: 'granted' },
        { eventIndex: 3, dataLayerEvent: 'gtm.js', timestamp: '104ms', durationMs: 28, tagName: 'Meta Pixel - Base Init', tagType: 'meta_pixel', triggerName: 'All Pages', status: 'fired', consentState: 'granted' },
        { eventIndex: 4, dataLayerEvent: 'purchase', timestamp: '185ms', durationMs: 36, tagName: 'Google Ads - Purchase Conversion', tagType: 'awct', triggerName: 'Custom - purchase', status: 'fired', consentState: 'granted' },
        { eventIndex: 4, dataLayerEvent: 'purchase', timestamp: '228ms', durationMs: 30, tagName: 'Meta Pixel - Purchase', tagType: 'meta_pixel', triggerName: 'Custom - purchase', status: 'fired', consentState: 'granted' },
      ],
      null,
      2
    ),
  };
}
