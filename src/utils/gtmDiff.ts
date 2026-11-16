import {
  GtmExportJson,
  GtmParameter,
  GtmTag,
  GtmTrigger,
  GtmVariable,
} from '../types/tracking';

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';
export type DiffEntityKind = 'tag' | 'trigger' | 'variable';

export interface DiffFieldChange {
  field: string;
  before: string;
  after: string;
}

export interface DiffItem<T> {
  key: string;
  kind: DiffEntityKind;
  status: DiffStatus;
  id: string;
  name: string;
  entityType: string;
  fieldChanges: DiffFieldChange[];
  beforeItem: T | null;
  afterItem: T | null;
}

export interface ContainerVersionSummary {
  publicId: string;
  containerId: string;
  versionId: string;
  name: string;
  exportTime: string;
  tagCount: number;
  triggerCount: number;
  variableCount: number;
}

export interface DiffCounts {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

export interface GtmContainerDiffResult {
  baseMeta: ContainerVersionSummary;
  targetMeta: ContainerVersionSummary;
  tagDiffs: Array<DiffItem<GtmTag>>;
  triggerDiffs: Array<DiffItem<GtmTrigger>>;
  variableDiffs: Array<DiffItem<GtmVariable>>;
  counts: {
    total: DiffCounts;
    tags: DiffCounts;
    triggers: DiffCounts;
    variables: DiffCounts;
  };
}

function summarizeVersion(container: GtmExportJson): ContainerVersionSummary {
  const cv = container.containerVersion;
  return {
    publicId: cv.container?.publicId || 'GTM-UNKNOWN',
    containerId: cv.containerId || '',
    versionId: cv.containerVersionId || '—',
    name: cv.name || cv.container?.name || 'Untitled Version',
    exportTime: container.exportTime || '—',
    tagCount: (cv.tag || []).length,
    triggerCount: (cv.trigger || []).length,
    variableCount: (cv.variable || []).length,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(', ')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${k}: ${stableStringify(obj[k])}`).join(', ')}}`;
}

function formatParamsMap(params?: GtmParameter[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!params) return map;
  for (const p of params) {
    const val =
      p.value !== undefined
        ? p.value
        : p.list
          ? stableStringify(p.list)
          : p.map
            ? stableStringify(p.map)
            : '';
    map.set(p.key, `${p.type}: ${val}`);
  }
  return map;
}

function resolveTriggerList(
  ids: string[] | undefined,
  triggerMap: Map<string, string>
): string {
  if (!ids || ids.length === 0) return '(none)';
  return ids
    .slice()
    .sort()
    .map((id) => {
      const name = triggerMap.get(id);
      return name ? `${name} (#${id})` : `#${id}`;
    })
    .join(', ');
}

function formatConsentSettings(tag: GtmTag): string {
  const status = tag.consentSettings?.consentStatus || 'NOT_SET';
  const types =
    tag.consentSettings?.consentType?.list
      ?.map((item) => item.value)
      .slice()
      .sort() || [];
  if (types.length === 0) return status;
  return `${status} [${types.join(', ')}]`;
}

function diffTagFields(
  a: GtmTag,
  b: GtmTag,
  baseTriggers: Map<string, string>,
  targetTriggers: Map<string, string>
): DiffFieldChange[] {
  const changes: DiffFieldChange[] = [];

  if (a.name !== b.name) {
    changes.push({ field: 'name', before: a.name, after: b.name });
  }
  if (a.type !== b.type) {
    changes.push({ field: 'type', before: a.type, after: b.type });
  }
  if (Boolean(a.paused) !== Boolean(b.paused)) {
    changes.push({
      field: 'paused',
      before: a.paused ? 'true (Paused)' : 'false (Active)',
      after: b.paused ? 'true (Paused)' : 'false (Active)',
    });
  }

  const firingA = resolveTriggerList(a.firingTriggerId, baseTriggers);
  const firingB = resolveTriggerList(b.firingTriggerId, targetTriggers);
  if (
    (a.firingTriggerId || []).slice().sort().join(',') !==
    (b.firingTriggerId || []).slice().sort().join(',')
  ) {
    changes.push({ field: 'firingTriggerId', before: firingA, after: firingB });
  }

  const blockA = resolveTriggerList(a.blockingTriggerId, baseTriggers);
  const blockB = resolveTriggerList(b.blockingTriggerId, targetTriggers);
  if (
    (a.blockingTriggerId || []).slice().sort().join(',') !==
    (b.blockingTriggerId || []).slice().sort().join(',')
  ) {
    changes.push({ field: 'blockingTriggerId', before: blockA, after: blockB });
  }

  if ((a.tagFiringOption || 'ONCE_PER_EVENT') !== (b.tagFiringOption || 'ONCE_PER_EVENT')) {
    changes.push({
      field: 'tagFiringOption',
      before: a.tagFiringOption || 'ONCE_PER_EVENT',
      after: b.tagFiringOption || 'ONCE_PER_EVENT',
    });
  }

  const consentA = formatConsentSettings(a);
  const consentB = formatConsentSettings(b);
  if (consentA !== consentB) {
    changes.push({ field: 'consentSettings', before: consentA, after: consentB });
  }

  const paramsA = formatParamsMap(a.parameter);
  const paramsB = formatParamsMap(b.parameter);
  const allParamKeys = Array.from(new Set([...paramsA.keys(), ...paramsB.keys()])).sort();
  for (const key of allParamKeys) {
    const valA = paramsA.get(key) ?? '(omitted)';
    const valB = paramsB.get(key) ?? '(omitted)';
    if (valA !== valB) {
      changes.push({ field: `parameter.${key}`, before: valA, after: valB });
    }
  }

  if ((a.notes || '') !== (b.notes || '')) {
    changes.push({
      field: 'notes',
      before: a.notes || '(empty)',
      after: b.notes || '(empty)',
    });
  }

  return changes;
}

function diffTriggerFields(a: GtmTrigger, b: GtmTrigger): DiffFieldChange[] {
  const changes: DiffFieldChange[] = [];
  if (a.name !== b.name) {
    changes.push({ field: 'name', before: a.name, after: b.name });
  }
  if (a.type !== b.type) {
    changes.push({ field: 'type', before: a.type, after: b.type });
  }
  const filterA = stableStringify(a.filter || []);
  const filterB = stableStringify(b.filter || []);
  if (filterA !== filterB) {
    changes.push({
      field: 'filter',
      before: filterA || '[]',
      after: filterB || '[]',
    });
  }
  const customA = stableStringify(a.customEventFilter || []);
  const customB = stableStringify(b.customEventFilter || []);
  if (customA !== customB) {
    changes.push({
      field: 'customEventFilter',
      before: customA || '[]',
      after: customB || '[]',
    });
  }
  return changes;
}

function diffVariableFields(a: GtmVariable, b: GtmVariable): DiffFieldChange[] {
  const changes: DiffFieldChange[] = [];
  if (a.name !== b.name) {
    changes.push({ field: 'name', before: a.name, after: b.name });
  }
  if (a.type !== b.type) {
    changes.push({ field: 'type', before: a.type, after: b.type });
  }
  const paramsA = formatParamsMap(a.parameter);
  const paramsB = formatParamsMap(b.parameter);
  const allKeys = Array.from(new Set([...paramsA.keys(), ...paramsB.keys()])).sort();
  for (const key of allKeys) {
    const valA = paramsA.get(key) ?? '(omitted)';
    const valB = paramsB.get(key) ?? '(omitted)';
    if (valA !== valB) {
      changes.push({ field: `parameter.${key}`, before: valA, after: valB });
    }
  }
  return changes;
}

function pairEntities<T>(
  baseList: T[],
  targetList: T[],
  sameContainer: boolean,
  getId: (item: T) => string,
  getName: (item: T) => string
): Array<{ key: string; before: T | null; after: T | null }> {
  const getMatchKey = (item: T) =>
    sameContainer ? `id:${getId(item)}` : `name:${getName(item).trim().toLowerCase()}`;

  const baseMap = new Map<string, T>();
  for (const item of baseList) {
    baseMap.set(getMatchKey(item), item);
  }
  const targetMap = new Map<string, T>();
  for (const item of targetList) {
    targetMap.set(getMatchKey(item), item);
  }

  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const item of targetList) {
    const k = getMatchKey(item);
    if (!seen.has(k)) {
      seen.add(k);
      orderedKeys.push(k);
    }
  }
  for (const item of baseList) {
    const k = getMatchKey(item);
    if (!seen.has(k)) {
      seen.add(k);
      orderedKeys.push(k);
    }
  }

  return orderedKeys.map((key) => ({
    key,
    before: baseMap.get(key) ?? null,
    after: targetMap.get(key) ?? null,
  }));
}

function countStatuses<T>(items: Array<DiffItem<T>>): DiffCounts {
  return items.reduce<DiffCounts>(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { added: 0, removed: 0, modified: 0, unchanged: 0 }
  );
}

const STATUS_SORT_ORDER: Record<DiffStatus, number> = {
  removed: 0,
  modified: 1,
  added: 2,
  unchanged: 3,
};

export function diffGtmContainers(
  base: GtmExportJson,
  target: GtmExportJson
): GtmContainerDiffResult {
  const baseCv = base.containerVersion;
  const targetCv = target.containerVersion;

  const sameContainer =
    (Boolean(baseCv.containerId) && baseCv.containerId === targetCv.containerId) ||
    (Boolean(baseCv.container?.publicId) &&
      baseCv.container?.publicId === targetCv.container?.publicId);

  const baseTriggerMap = new Map<string, string>();
  (baseCv.trigger || []).forEach((tr) => baseTriggerMap.set(tr.triggerId, tr.name));

  const targetTriggerMap = new Map<string, string>();
  (targetCv.trigger || []).forEach((tr) => targetTriggerMap.set(tr.triggerId, tr.name));

  const tagPairs = pairEntities(
    baseCv.tag || [],
    targetCv.tag || [],
    sameContainer,
    (t) => t.tagId,
    (t) => t.name
  );

  const tagDiffs: Array<DiffItem<GtmTag>> = tagPairs
    .map(({ key, before, after }) => {
      if (!before && after) {
        return {
          key: `tag-${key}`,
          kind: 'tag' as const,
          status: 'added' as const,
          id: after.tagId,
          name: after.name,
          entityType: after.type,
          fieldChanges: [
            {
              field: 'created',
              before: '(not in baseline)',
              after: `Type ${after.type} · Triggers: ${resolveTriggerList(after.firingTriggerId, targetTriggerMap)}`,
            },
          ],
          beforeItem: null,
          afterItem: after,
        };
      }
      if (before && !after) {
        return {
          key: `tag-${key}`,
          kind: 'tag' as const,
          status: 'removed' as const,
          id: before.tagId,
          name: before.name,
          entityType: before.type,
          fieldChanges: [
            {
              field: 'removed',
              before: `Type ${before.type} · Triggers: ${resolveTriggerList(before.firingTriggerId, baseTriggerMap)}`,
              after: '(removed in candidate)',
            },
          ],
          beforeItem: before,
          afterItem: null,
        };
      }
      const b = before as GtmTag;
      const a = after as GtmTag;
      const fieldChanges = diffTagFields(b, a, baseTriggerMap, targetTriggerMap);
      return {
        key: `tag-${key}`,
        kind: 'tag' as const,
        status: fieldChanges.length > 0 ? ('modified' as const) : ('unchanged' as const),
        id: a.tagId || b.tagId,
        name: a.name,
        entityType: a.type,
        fieldChanges,
        beforeItem: b,
        afterItem: a,
      };
    })
    .sort((x, y) => STATUS_SORT_ORDER[x.status] - STATUS_SORT_ORDER[y.status]);

  const triggerPairs = pairEntities(
    baseCv.trigger || [],
    targetCv.trigger || [],
    sameContainer,
    (tr) => tr.triggerId,
    (tr) => tr.name
  );

  const triggerDiffs: Array<DiffItem<GtmTrigger>> = triggerPairs
    .map(({ key, before, after }) => {
      if (!before && after) {
        return {
          key: `trigger-${key}`,
          kind: 'trigger' as const,
          status: 'added' as const,
          id: after.triggerId,
          name: after.name,
          entityType: after.type,
          fieldChanges: [
            {
              field: 'created',
              before: '(not in baseline)',
              after: `Trigger type: ${after.type}`,
            },
          ],
          beforeItem: null,
          afterItem: after,
        };
      }
      if (before && !after) {
        return {
          key: `trigger-${key}`,
          kind: 'trigger' as const,
          status: 'removed' as const,
          id: before.triggerId,
          name: before.name,
          entityType: before.type,
          fieldChanges: [
            {
              field: 'removed',
              before: `Trigger type: ${before.type}`,
              after: '(removed in candidate)',
            },
          ],
          beforeItem: before,
          afterItem: null,
        };
      }
      const b = before as GtmTrigger;
      const a = after as GtmTrigger;
      const fieldChanges = diffTriggerFields(b, a);
      return {
        key: `trigger-${key}`,
        kind: 'trigger' as const,
        status: fieldChanges.length > 0 ? ('modified' as const) : ('unchanged' as const),
        id: a.triggerId || b.triggerId,
        name: a.name,
        entityType: a.type,
        fieldChanges,
        beforeItem: b,
        afterItem: a,
      };
    })
    .sort((x, y) => STATUS_SORT_ORDER[x.status] - STATUS_SORT_ORDER[y.status]);

  const variablePairs = pairEntities(
    baseCv.variable || [],
    targetCv.variable || [],
    sameContainer,
    (v) => v.variableId,
    (v) => v.name
  );

  const variableDiffs: Array<DiffItem<GtmVariable>> = variablePairs
    .map(({ key, before, after }) => {
      if (!before && after) {
        return {
          key: `var-${key}`,
          kind: 'variable' as const,
          status: 'added' as const,
          id: after.variableId,
          name: after.name,
          entityType: after.type,
          fieldChanges: [
            {
              field: 'created',
              before: '(not in baseline)',
              after: `Variable type: ${after.type}`,
            },
          ],
          beforeItem: null,
          afterItem: after,
        };
      }
      if (before && !after) {
        return {
          key: `var-${key}`,
          kind: 'variable' as const,
          status: 'removed' as const,
          id: before.variableId,
          name: before.name,
          entityType: before.type,
          fieldChanges: [
            {
              field: 'removed',
              before: `Variable type: ${before.type}`,
              after: '(removed in candidate)',
            },
          ],
          beforeItem: before,
          afterItem: null,
        };
      }
      const b = before as GtmVariable;
      const a = after as GtmVariable;
      const fieldChanges = diffVariableFields(b, a);
      return {
        key: `var-${key}`,
        kind: 'variable' as const,
        status: fieldChanges.length > 0 ? ('modified' as const) : ('unchanged' as const),
        id: a.variableId || b.variableId,
        name: a.name,
        entityType: a.type,
        fieldChanges,
        beforeItem: b,
        afterItem: a,
      };
    })
    .sort((x, y) => STATUS_SORT_ORDER[x.status] - STATUS_SORT_ORDER[y.status]);

  const tagCounts = countStatuses(tagDiffs);
  const triggerCounts = countStatuses(triggerDiffs);
  const variableCounts = countStatuses(variableDiffs);

  return {
    baseMeta: summarizeVersion(base),
    targetMeta: summarizeVersion(target),
    tagDiffs,
    triggerDiffs,
    variableDiffs,
    counts: {
      tags: tagCounts,
      triggers: triggerCounts,
      variables: variableCounts,
      total: {
        added: tagCounts.added + triggerCounts.added + variableCounts.added,
        removed: tagCounts.removed + triggerCounts.removed + variableCounts.removed,
        modified: tagCounts.modified + triggerCounts.modified + variableCounts.modified,
        unchanged: tagCounts.unchanged + triggerCounts.unchanged + variableCounts.unchanged,
      },
    },
  };
}
