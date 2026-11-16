import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  ConsentGrant,
  ConsentState,
  GtmExportJson,
  GtmTag,
} from '../types/tracking';
import {
  encodeGcdParameter,
  encodeGoogleConsentString,
} from '../utils/cryptoAndPayloads';

interface ConsentDebuggerProps {
  container: GtmExportJson;
  onPatchConsent: () => void;
}

type GeoRegionId = 'eea-uk' | 'california' | 'switzerland' | 'row' | 'custom';
type ConsentStandard = 'gcs' | 'tcf';

interface GeoPreset {
  id: GeoRegionId;
  label: string;
  regulation: string;
  tcfRequired: boolean;
  defaultConsent: ConsentState;
  description: string;
}

const GEO_PRESETS: GeoPreset[] = [
  {
    id: 'eea-uk',
    label: 'EEA / UK',
    regulation: 'GDPR + ePrivacy + DMA',
    tcfRequired: true,
    defaultConsent: {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
    description:
      'Strict opt-in prior to firing. Ad tags must block or emit cookieless pings until explicit grant.',
  },
  {
    id: 'california',
    label: 'California (US-CA)',
    regulation: 'CCPA / CPRA Opt-Out',
    tcfRequired: false,
    defaultConsent: {
      ad_storage: 'granted',
      analytics_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'denied',
    },
    description:
      'Default granted on load; Do Not Sell / Share opt-out revokes ad_user_data and ad_personalization.',
  },
  {
    id: 'switzerland',
    label: 'Switzerland',
    regulation: 'Swiss FADP',
    tcfRequired: true,
    defaultConsent: {
      ad_storage: 'denied',
      analytics_storage: 'granted',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
    description:
      'Requires explicit consent for cross-site ad profiling and third-party ad_user_data sharing.',
  },
  {
    id: 'row',
    label: 'Rest of World',
    regulation: 'Standard Regional Default',
    tcfRequired: false,
    defaultConsent: {
      ad_storage: 'granted',
      analytics_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    },
    description: 'Non-restricted jurisdiction; G111 default granted unless user opts out.',
  },
  {
    id: 'custom',
    label: 'Custom Override',
    regulation: 'Manual Testing',
    tcfRequired: false,
    defaultConsent: {
      ad_storage: 'denied',
      analytics_storage: 'granted',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
    description: 'Manually test edge-case GCS or TCF v2.2 purpose combinations.',
  },
];

interface TcfPreset {
  id: string;
  label: string;
  tcString: string;
  vendor755Consented: boolean;
  purposes: Record<number, boolean>;
}

const TCF_PRESETS: TcfPreset[] = [
  {
    id: 'tcf-reject',
    label: 'Reject All (Purposes Denied)',
    tcString: 'CPzHq4APzHq4AAHABBENCZCsAP_AAH_AACiQAAAA',
    vendor755Consented: false,
    purposes: { 1: false, 3: false, 4: false, 7: false, 10: false },
  },
  {
    id: 'tcf-analytics',
    label: 'Measurement Only (P1, P7, P10)',
    tcString: 'CPzHq4APzHq4AAHABBENCZCsAP_AAH_AAKiQ4AAA',
    vendor755Consented: true,
    purposes: { 1: true, 3: false, 4: false, 7: true, 10: true },
  },
  {
    id: 'tcf-full',
    label: 'Full TCF v2.2 Consent (All Purposes)',
    tcString: 'CPzHq4APzHq4AAHABBENCZCsAP_AAH_AAKiQ7_9f',
    vendor755Consented: true,
    purposes: { 1: true, 3: true, 4: true, 7: true, 10: true },
  },
];

const TCF_PURPOSE_LABELS: Record<number, { title: string; mapsTo: string }> = {
  1: { title: 'Purpose 1: Store/access info on device', mapsTo: 'ad_storage, analytics_storage' },
  3: { title: 'Purpose 3: Create personalised ads profile', mapsTo: 'ad_personalization' },
  4: { title: 'Purpose 4: Select personalised ads', mapsTo: 'ad_personalization' },
  7: { title: 'Purpose 7: Measure advertising performance', mapsTo: 'ad_user_data' },
  10: { title: 'Purpose 10: Develop & improve services', mapsTo: 'analytics_storage' },
};

type TagEvalStatus =
  | 'Fired (Full Cookies)'
  | 'Fired (Cookieless Ping)'
  | 'Blocked (Compliant)'
  | 'Violation (Unprotected Fire)';

interface TagEvalResult {
  tag: GtmTag;
  matchedTriggers: string[];
  requiredSignals: string[];
  status: TagEvalStatus;
  reason: string;
}

function deriveConsentFromTcf(purposes: Record<number, boolean>, vendor755: boolean): ConsentState {
  const p1 = Boolean(purposes[1]);
  const p3 = Boolean(purposes[3]);
  const p4 = Boolean(purposes[4]);
  const p7 = Boolean(purposes[7]);
  const p10 = Boolean(purposes[10]);

  return {
    ad_storage: p1 && vendor755 ? 'granted' : 'denied',
    analytics_storage: p1 && p10 ? 'granted' : 'denied',
    ad_user_data: p1 && p7 && vendor755 ? 'granted' : 'denied',
    ad_personalization: p1 && p3 && p4 && vendor755 ? 'granted' : 'denied',
  };
}

function parseGcsInput(gcsStr: string): Partial<ConsentState> | null {
  const match = gcsStr.trim().toUpperCase().match(/^G1([01])([01])$/);
  if (!match) return null;
  return {
    ad_storage: match[1] === '1' ? 'granted' : 'denied',
    analytics_storage: match[2] === '1' ? 'granted' : 'denied',
  };
}

export const ConsentDebugger: React.FC<ConsentDebuggerProps> = ({
  container,
  onPatchConsent,
}) => {
  const [regionId, setRegionId] = useState<GeoRegionId>('eea-uk');
  const [standard, setStandard] = useState<ConsentStandard>('gcs');
  const [consent, setConsent] = useState<ConsentState>(GEO_PRESETS[0].defaultConsent);
  const [gcsText, setGcsText] = useState<string>('G100');
  const [gcsError, setGcsError] = useState<string | null>(null);

  const [tcfString, setTcfString] = useState<string>(TCF_PRESETS[0].tcString);
  const [tcfPurposes, setTcfPurposes] = useState<Record<number, boolean>>(
    TCF_PRESETS[0].purposes
  );
  const [vendor755Consented, setVendor755Consented] = useState<boolean>(
    TCF_PRESETS[0].vendor755Consented
  );

  const [selectedTriggerId, setSelectedTriggerId] = useState<string>('ALL');
  const [urlPassthrough, setUrlPassthrough] = useState<boolean>(true);
  const [adsDataRedaction, setAdsDataRedaction] = useState<boolean>(true);

  const cv = container.containerVersion;
  const activeRegion = GEO_PRESETS.find((r) => r.id === regionId) || GEO_PRESETS[0];

  const effectiveConsent: ConsentState = useMemo(() => {
    if (standard === 'tcf') {
      return deriveConsentFromTcf(tcfPurposes, vendor755Consented);
    }
    return consent;
  }, [standard, tcfPurposes, vendor755Consented, consent]);

  const gcsEncoded = encodeGoogleConsentString(effectiveConsent);
  const gcdEncoded = encodeGcdParameter(effectiveConsent);

  const handleSelectRegion = (id: GeoRegionId) => {
    setRegionId(id);
    const preset = GEO_PRESETS.find((r) => r.id === id);
    if (preset) {
      setConsent(preset.defaultConsent);
      setGcsText(encodeGoogleConsentString(preset.defaultConsent));
      setGcsError(null);
      if (preset.tcfRequired && id === 'eea-uk') {
        setTcfPurposes(TCF_PRESETS[0].purposes);
        setTcfString(TCF_PRESETS[0].tcString);
        setVendor755Consented(false);
      } else if (!preset.tcfRequired && id === 'row') {
        setTcfPurposes(TCF_PRESETS[2].purposes);
        setTcfString(TCF_PRESETS[2].tcString);
        setVendor755Consented(true);
      }
    }
  };

  const handleApplyGcsString = (val: string) => {
    setGcsText(val);
    const parsed = parseGcsInput(val);
    if (!parsed) {
      setGcsError('Format must be G1<ad:0|1><analytics:0|1>, e.g. G100, G101, G111');
      return;
    }
    setGcsError(null);
    setRegionId('custom');
    setConsent((prev) => ({
      ...prev,
      ...parsed,
    }));
  };

  const handleToggleConsentKey = (key: keyof ConsentState) => {
    setRegionId('custom');
    setConsent((prev) => {
      const next: ConsentState = {
        ...prev,
        [key]: prev[key] === 'granted' ? 'denied' : 'granted',
      };
      setGcsText(encodeGoogleConsentString(next));
      setGcsError(null);
      return next;
    });
  };

  const handleToggleTcfPurpose = (pid: number) => {
    setRegionId('custom');
    setTcfPurposes((prev) => ({
      ...prev,
      [pid]: !prev[pid],
    }));
  };

  const handleSelectTcfPreset = (preset: TcfPreset) => {
    setTcfString(preset.tcString);
    setTcfPurposes(preset.purposes);
    setVendor755Consented(preset.vendor755Consented);
  };

  const triggerMap = useMemo(() => {
    const map = new Map<string, string>();
    (cv.trigger || []).forEach((tr) => map.set(tr.triggerId, tr.name));
    return map;
  }, [cv.trigger]);

  // Evaluate every active GTM tag against current Trigger + Consent/TCF state
  const evaluations: TagEvalResult[] = useMemo(() => {
    const activeTags = cv.tag.filter((t) => !t.paused);
    const results: TagEvalResult[] = [];

    for (const tag of activeTags) {
      const firingIds = tag.firingTriggerId || [];
      if (selectedTriggerId !== 'ALL' && !firingIds.includes(selectedTriggerId)) {
        continue;
      }

      const matchedTriggers = firingIds.map((id) => triggerMap.get(id) || `#${id}`);
      const configuredChecks =
        tag.consentSettings?.consentType?.list?.map((c) => c.value) || [];
      const consentStatus = tag.consentSettings?.consentStatus || 'NOT_SET';

      const isGoogleTag = ['googtag', 'gaawe', 'awct', 'sp', 'gclidw'].includes(tag.type);
      const isAdTech =
        ['awct', 'sp', 'meta_pixel', 'fb_pixel', 'linkedin_insight', 'tiktok_pixel', 'html'].includes(
          tag.type
        ) || /meta|facebook|ads|linkedin|tiktok|criteo|hotjar/i.test(tag.name);

      // Determine true regulatory requirement for this tag
      const regulatorySignals: Array<keyof ConsentState> = [];
      if (isAdTech) {
        regulatorySignals.push('ad_storage', 'ad_user_data');
      } else if (['googtag', 'gaawe', 'ua'].includes(tag.type)) {
        regulatorySignals.push('analytics_storage');
      }

      const anyRegulatoryDenied = regulatorySignals.some(
        (sig) => effectiveConsent[sig] === 'denied'
      );

      let status: TagEvalStatus = 'Fired (Full Cookies)';
      let reason = 'All required consent signals granted.';

      if (tag.type === 'gclidw') {
        status = 'Fired (Full Cookies)';
        reason =
          effectiveConsent.ad_storage === 'denied' && urlPassthrough
            ? 'Conversion Linker active; url_passthrough preserves GCLID in URL parameters.'
            : 'Conversion Linker active on first-party storage.';
      } else if (consentStatus === 'NOT_SET' && regulatorySignals.length > 0) {
        if (anyRegulatoryDenied) {
          status = 'Violation (Unprotected Fire)';
          reason = `Tag has consentStatus=NOT_SET. Fires in ${activeRegion.label} despite ${regulatorySignals
            .filter((s) => effectiveConsent[s] === 'denied')
            .join(', ')}=denied.`;
        } else {
          status = 'Violation (Unprotected Fire)';
          reason =
            'Tag lacks Consent Mode v2 gating (consentStatus=NOT_SET); would leak PII if tested in EEA/UK.';
        }
      } else if (
        isAdTech &&
        (!configuredChecks.includes('ad_storage') || !configuredChecks.includes('ad_user_data'))
      ) {
        status = 'Violation (Unprotected Fire)';
        reason = `Incomplete Consent Mode v2 checks [${configuredChecks.join(', ') || 'none'}]; missing ad_user_data or ad_storage.`;
      } else if (anyRegulatoryDenied) {
        const blockedByConfig = configuredChecks.some(
          (chk) => effectiveConsent[chk as keyof ConsentState] === 'denied'
        );
        if (isGoogleTag && !blockedByConfig) {
          status = 'Fired (Cookieless Ping)';
          reason = `Consent Mode v2 Advanced: sends cookieless modeling ping (gcs=${gcsEncoded}, redaction=${adsDataRedaction ? 'on' : 'off'}).`;
        } else if (isGoogleTag && blockedByConfig && tag.type !== 'sp') {
          status = 'Fired (Cookieless Ping)';
          reason = `Google tag adjusts storage behavior via Consent Mode v2 (gcs=${gcsEncoded}); no cookies written.`;
        } else {
          status = 'Blocked (Compliant)';
          reason = `Additional Consent Check [${configuredChecks.join(', ')}] blocked execution cleanly.`;
        }
      }

      results.push({
        tag,
        matchedTriggers,
        requiredSignals: configuredChecks,
        status,
        reason,
      });
    }

    return results;
  }, [
    cv.tag,
    selectedTriggerId,
    triggerMap,
    effectiveConsent,
    activeRegion.label,
    gcsEncoded,
    urlPassthrough,
    adsDataRedaction,
  ]);

  const violationCount = evaluations.filter(
    (e) => e.status === 'Violation (Unprotected Fire)'
  ).length;
  const blockedCount = evaluations.filter(
    (e) => e.status === 'Blocked (Compliant)'
  ).length;
  const cookielessCount = evaluations.filter(
    (e) => e.status === 'Fired (Cookieless Ping)'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Consent Mode v2 &amp; TCF v2.2 Debugger
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Simulate geographical privacy defaults and test whether GTM container triggers respect GCS (<span className="font-mono">{gcsEncoded}</span>) and IAB TCF v2.2 consent strings.
          </p>
        </div>

        {violationCount > 0 && (
          <button
            type="button"
            onClick={onPatchConsent}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Wrench className="w-3.5 h-3.5" />
            Patch {violationCount} Consent {violationCount === 1 ? 'Violation' : 'Violations'}
          </button>
        )}
      </div>

      {/* Geo Region Selector Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Globe className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span>Geographical Consent Region</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {activeRegion.regulation} · {activeRegion.tcfRequired ? 'TCF v2.2 Applicable' : 'GCS / CCPA Applicable'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {GEO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectRegion(preset.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                regionId === preset.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">{activeRegion.description}</p>
      </div>

      {/* Main Split: Consent String Configuration + Tag Trigger Evaluation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: GCS / TCF v2.2 Controls */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Consent Signal Standard
            </h2>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setStandard('gcs')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                  standard === 'gcs'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                GCS / Consent v2
              </button>
              <button
                type="button"
                onClick={() => setStandard('tcf')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                  standard === 'tcf'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                IAB TCF v2.2
              </button>
            </div>
          </div>

          {standard === 'gcs' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Test GCS Consent String (e.g. G100, G101, G111)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={gcsText}
                    onChange={(e) => handleApplyGcsString(e.target.value)}
                    className="flex-1 px-3 py-1.5 font-mono text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                  />
                  {(['G100', 'G101', 'G111'] as const).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleApplyGcsString(code)}
                      className={`px-2.5 py-1.5 font-mono text-xs border rounded-md cursor-pointer ${
                        gcsEncoded === code
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
                {gcsError && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{gcsError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    'ad_storage',
                    'analytics_storage',
                    'ad_user_data',
                    'ad_personalization',
                  ] as const
                ).map((key) => {
                  const val: ConsentGrant = effectiveConsent[key];
                  const granted = val === 'granted';
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleToggleConsentKey(key)}
                      className={`flex items-center justify-between px-3 py-2 text-xs border rounded-md cursor-pointer ${
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
                        {val}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  IAB TCF v2.2 String (__tcfapi tcString)
                </label>
                <input
                  type="text"
                  value={tcfString}
                  onChange={(e) => setTcfString(e.target.value)}
                  className="w-full px-3 py-1.5 font-mono text-[11px] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TCF_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectTcfPreset(preset)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer ${
                        tcfString === preset.tcString
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Decoded TCF Purposes &rarr; Consent Mode Mapping
                </div>
                {([1, 3, 4, 7, 10] as const).map((pid) => {
                  const granted = Boolean(tcfPurposes[pid]);
                  const info = TCF_PURPOSE_LABELS[pid];
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => handleToggleTcfPurpose(pid)}
                      className={`w-full text-left px-3 py-2 rounded-md border text-xs flex items-center justify-between gap-2 cursor-pointer ${
                        granted
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
                          : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{info.title}</div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          Maps to: {info.mapsTo}
                        </div>
                      </div>
                      <span
                        className={`font-medium shrink-0 ${
                          granted ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {granted ? 'Consented' : 'Denied'}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setVendor755Consented((v) => !v)}
                  className={`w-full text-left px-3 py-2 rounded-md border text-xs flex items-center justify-between gap-2 cursor-pointer ${
                    vendor755Consented
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
                      : 'bg-red-50/50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
                  }`}
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    Google Advertising Products (GVL Vendor #755)
                  </span>
                  <span
                    className={`font-medium ${
                      vendor755Consented ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {vendor755Consented ? 'Consented' : 'Blocked'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Effective Output & Advanced Options */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between font-mono text-slate-700 dark:text-slate-300">
              <span>Resolved GCS / GCD:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                gcs={gcsEncoded} · gcd={gcdEncoded}
              </span>
            </div>

            <div className="flex flex-wrap gap-4 text-slate-700 dark:text-slate-300">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={urlPassthrough}
                  onChange={(e) => setUrlPassthrough(e.target.checked)}
                  className="accent-orange-600"
                />
                <span className="font-mono">url_passthrough</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adsDataRedaction}
                  onChange={(e) => setAdsDataRedaction(e.target.checked)}
                  className="accent-orange-600"
                />
                <span className="font-mono">ads_data_redaction</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right: GTM Trigger Compliance Evaluator */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                GTM Trigger &amp; Tag Consent Evaluation
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {evaluations.length} tags evaluated · {violationCount} violations · {blockedCount} blocked · {cookielessCount} cookieless pings
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="trigger-filter" className="text-xs text-slate-500 dark:text-slate-400">
                Simulate Trigger:
              </label>
              <select
                id="trigger-filter"
                value={selectedTriggerId}
                onChange={(e) => setSelectedTriggerId(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="ALL">All Container Triggers</option>
                {cv.trigger.map((tr) => (
                  <option key={tr.triggerId} value={tr.triggerId}>
                    {tr.name} ({tr.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Compliance Verdict Banner */}
          <div
            className={`px-5 py-3 border-b text-xs flex items-center justify-between gap-3 ${
              violationCount === 0
                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {violationCount === 0 ? (
                <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              )}
              <span>
                {violationCount === 0
                  ? `Container triggers are compliant for ${activeRegion.label} under ${standard.toUpperCase()} (${gcsEncoded}).`
                  : `${violationCount} active ${violationCount === 1 ? 'tag violates' : 'tags violate'} consent gating rules under ${activeRegion.label} (${gcsEncoded}).`}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">GTM Tag &amp; Trigger</th>
                  <th className="py-2.5 px-4">Consent Checks</th>
                  <th className="py-2.5 px-4">Evaluation Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {evaluations.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      No active tags are attached to this trigger.
                    </td>
                  </tr>
                ) : (
                  evaluations.map((ev) => (
                    <tr key={ev.tag.tagId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{ev.tag.name}</div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          {ev.tag.type} · Triggers: {ev.matchedTriggers.join(', ')}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top font-mono text-slate-700 dark:text-slate-300">
                        {ev.tag.consentSettings?.consentStatus === 'NEEDED'
                          ? ev.requiredSignals.join(', ') || 'NEEDED'
                          : ev.tag.consentSettings?.consentStatus || 'NOT_SET'}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div
                          className={`inline-flex items-center gap-1.5 font-semibold ${
                            ev.status === 'Fired (Full Cookies)' ||
                            ev.status === 'Blocked (Compliant)'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : ev.status === 'Fired (Cookieless Ping)'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {(ev.status === 'Fired (Full Cookies)' ||
                            ev.status === 'Blocked (Compliant)') && (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          )}
                          {ev.status === 'Fired (Cookieless Ping)' && (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          {ev.status === 'Violation (Unprotected Fire)' && (
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{ev.status}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          {ev.reason}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
