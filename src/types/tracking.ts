export type ConsentGrant = 'granted' | 'denied';

export interface ConsentState {
  ad_storage: ConsentGrant;
  analytics_storage: ConsentGrant;
  ad_user_data: ConsentGrant;
  ad_personalization: ConsentGrant;
}

export interface GtmParameter {
  type: string;
  key: string;
  value?: string;
  list?: Array<{ type: string; map?: GtmParameter[] }>;
  map?: GtmParameter[];
}

export interface GtmConsentSettings {
  consentStatus: 'NEEDED' | 'NOT_NEEDED' | 'NOT_SET';
  consentType?: {
    type: string;
    list: Array<{ type: string; value: string }>;
  };
}

export interface GtmTag {
  accountId: string;
  containerId: string;
  tagId: string;
  name: string;
  type: string;
  parameter?: GtmParameter[];
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  tagFiringOption?: string;
  paused?: boolean;
  consentSettings?: GtmConsentSettings;
  notes?: string;
}

export interface GtmTrigger {
  accountId: string;
  containerId: string;
  triggerId: string;
  name: string;
  type: string;
  customEventFilter?: Array<{
    type: string;
    parameter: GtmParameter[];
  }>;
  filter?: Array<{
    type: string;
    parameter: GtmParameter[];
  }>;
}

export interface GtmVariable {
  accountId: string;
  containerId: string;
  variableId: string;
  name: string;
  type: string;
  parameter?: GtmParameter[];
}

export interface GtmExportJson {
  exportFormatVersion: number;
  exportTime: string;
  containerVersion: {
    path?: string;
    accountId: string;
    containerId: string;
    containerVersionId: string;
    name: string;
    container: {
      name: string;
      publicId: string;
      usageContext: string[];
    };
    tag: GtmTag[];
    trigger: GtmTrigger[];
    variable: GtmVariable[];
  };
}

export type AuditSeverity = 'critical' | 'warning' | 'pass';

export interface GtmAuditIssue {
  id: string;
  severity: AuditSeverity;
  category: 'Consent Mode v2' | 'Deduplication' | 'Legacy / Bloat' | 'Enhanced Conversions' | 'Performance';
  title: string;
  detail: string;
  remediation: string;
  affectedId?: string;
  affectedName?: string;
  patchable: boolean;
}

export interface GtmAuditSummary {
  containerPublicId: string;
  containerName: string;
  totalTags: number;
  activeTags: number;
  pausedTags: number;
  totalTriggers: number;
  totalVariables: number;
  consentCoveredTags: number;
  consentCoveragePct: number;
  estimatedLoadOverheadMs: number;
  reliabilityPct: number;
  issues: GtmAuditIssue[];
}

export type FunnelStage = 'Awareness' | 'Consideration' | 'Conversion' | 'Offline CRM';
export type AttributionModel = 'Data-Driven' | 'Last Click';
export type ConversionRole = 'Primary' | 'Secondary' | 'Analytics Only';

export interface TaxonomyEvent {
  id: string;
  eventName: string;
  funnelStage: FunnelStage;
  platforms: Array<'GA4' | 'Google Ads' | 'Meta CAPI' | 'LinkedIn'>;
  googleAdsRole: ConversionRole;
  attributionModel: AttributionModel;
  enhancedConversions: boolean;
  capiDedupEnabled: boolean;
  requiredParams: string[];
  presentParams: string[];
  monthlyVolume: number;
  notes: string;
}

export interface PlatformDiscrepancyRow {
  id: string;
  eventName: string;
  crmTruth: number;
  ga4Count: number;
  googleAdsCount: number;
  metaCapiCount: number;
  linkedInCount: number;
  crmRevenue: number;
  ga4Revenue: number;
  googleAdsRevenue: number;
  probableCause: string;
}

export interface OciImportRow {
  id: string;
  gclid: string;
  conversionName: string;
  conversionTime: string;
  conversionValue: string;
  currencyCode: string;
  clickTimestamp?: string;
}

export interface MeasurementWorkspace {
  id: string;
  label: string;
  domain: string;
  stackSummary: string;
  gtmContainer: GtmExportJson;
  taxonomy: TaxonomyEvent[];
  discrepancies: PlatformDiscrepancyRow[];
  ociRows: OciImportRow[];
  defaultTrafficSettings: {
    monthlyConversions: number;
    eeaSharePct: number;
    rejectionRatePct: number;
    modelingRecoveryPct: number;
  };
}

export interface SimulatedNetworkRequest {
  id: string;
  timestamp: string;
  platform: 'GA4' | 'Google Ads' | 'Meta Pixel' | 'Meta CAPI' | 'LinkedIn';
  endpoint: string;
  eventName: string;
  eventId: string;
  status: 'Dispatched' | 'Cookieless Ping' | 'Blocked by Consent' | 'Duplicate Risk';
  gcs: string;
  payload: Record<string, unknown>;
}
