export interface CleanedSnippetResult {
  cleanedHtml: string;
  originalLineCount: number;
  cleanedLineCount: number;
  removedCommentsCount: number;
  collapsedBlankLines: number;
  normalizedArtifacts: string[];
}

export interface ExtractedContainerIdReport {
  id: string;
  valid: boolean;
  status: 'valid' | 'placeholder' | 'malformed';
  locations: Array<'script_snippet' | 'noscript_iframe' | 'preload_link' | 'inline_reference'>;
  reason: string;
  suggestedFix?: string;
}

export interface SnippetCheckItem {
  id: string;
  attribute: string;
  category: 'Preload & Performance' | 'Core GTM Bootstrap' | 'Noscript Fallback' | 'Consent & Ordering';
  status: 'pass' | 'warning' | 'missing';
  summary: string;
  remediation?: string;
  recommendedCode?: string;
}

export interface SnippetScrapeReport {
  cleaned: CleanedSnippetResult;
  containerIds: ExtractedContainerIdReport[];
  checks: SnippetCheckItem[];
  hasScriptSnippet: boolean;
  hasNoscriptIframe: boolean;
  hasPreloadMarker: boolean;
  gtmSourceUrls: string[];
  analyzedAt: string;
}

export type SnippetPresetId = 'noisy_copy_paste' | 'broken_implementation' | 'production_ready';

const PLACEHOLDER_IDS = new Set([
  'GTM-XXXX',
  'GTM-XXXXX',
  'GTM-XXXXXX',
  'GTM-XXXXXXX',
  'GTM-XXXXXXXX',
  'GTM-000000',
  'GTM-123456',
  'GTM-YOURID',
  'GTM-ABCDEF',
]);

export function cleanAndFormatGtmSnippet(rawInput: string): CleanedSnippetResult {
  const originalLineCount = rawInput ? rawInput.split(/\r\n|\r|\n/).length : 0;
  const normalizedArtifacts: string[] = [];

  let working = rawInput.replace(/\r\n|\r/g, '\n');

  // 1. Strip zero-width spaces / BOM and normalize non-breaking spaces
  const zeroWidthMatches = working.match(/[\u200B-\u200D\uFEFF]/g);
  const nbspMatches = working.match(/\u00A0/g);
  if (zeroWidthMatches || nbspMatches) {
    working = working.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ');
    normalizedArtifacts.push(
      `Removed ${(zeroWidthMatches?.length || 0) + (nbspMatches?.length || 0)} invisible Unicode/NBSP characters`
    );
  }

  // 2. Normalize smart/curly quotes introduced by Slack, Docs, Notion, or Word
  const smartQuotes = working.match(/[“”‘’]/g);
  if (smartQuotes) {
    working = working.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    normalizedArtifacts.push(`Converted ${smartQuotes.length} smart quotes to ASCII quotes`);
  }

  // 3. Remove HTML comment noise (e.g. <!-- Google Tag Manager -->, <!-- End Google Tag Manager -->, CMS notes)
  let removedCommentsCount = 0;
  working = working.replace(/<!--[\s\S]*?-->/g, () => {
    removedCommentsCount += 1;
    return '';
  });
  if (removedCommentsCount > 0) {
    normalizedArtifacts.push(
      `Stripped ${removedCommentsCount} HTML comment block${removedCommentsCount > 1 ? 's' : ''}`
    );
  }

  // 4. Rejoin broken URLs or tag attributes split across copy-paste line wraps
  let rejoinedWraps = 0;
  working = working.replace(
    /(https?:\/\/[^\s"'<>]+)\n\s*([A-Za-z0-9_/?&=.-]+)/g,
    (_m, left, right) => {
      rejoinedWraps += 1;
      return `${left}${right}`;
    }
  );
  // Join dangling equals sign before attribute value across line break (e.g., `src=\n  "..."`)
  working = working.replace(/([a-zA-Z0-9_-]+)=\s*\n\s*(["'])/g, (_m, attr, quote) => {
    rejoinedWraps += 1;
    return `${attr}=${quote}`;
  });
  if (rejoinedWraps > 0) {
    normalizedArtifacts.push(
      `Rejoined ${rejoinedWraps} broken URL/attribute line wrap${rejoinedWraps > 1 ? 's' : ''}`
    );
  }

  // 5. Trim trailing spaces per line and collapse excessive blank lines
  const lines = working.split('\n').map((l) => l.replace(/[ \t]+$/g, ''));
  const compactLines: string[] = [];
  let blankStreak = 0;
  let collapsedBlankLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blankStreak += 1;
      if (compactLines.length > 0 && blankStreak === 1) {
        compactLines.push('');
      } else if (compactLines.length > 0) {
        collapsedBlankLines += 1;
      }
      continue;
    }
    blankStreak = 0;
    compactLines.push(line);
  }

  while (compactLines.length > 0 && compactLines[compactLines.length - 1] === '') {
    compactLines.pop();
    collapsedBlankLines += 1;
  }

  if (collapsedBlankLines > 0) {
    normalizedArtifacts.push(
      `Collapsed ${collapsedBlankLines} excessive blank line${collapsedBlankLines > 1 ? 's' : ''}`
    );
  }

  // 6. Clean structural indentation for HTML wrapper tags (<head>, <script>, <noscript>, <link>, <iframe>)
  let indentLevel = 0;
  const formattedLines = compactLines.map((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return '';

    const isClosingTag = /^<\/(head|body|html|script|noscript|iframe)\b/i.test(trimmed);
    if (isClosingTag) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const formatted = `${'  '.repeat(indentLevel)}${trimmed}`;

    const isOpeningContainer =
      /^<(head|body|html|script|noscript)\b[^>]*>$/i.test(trimmed) &&
      !/<\/(head|body|html|script|noscript)>/i.test(trimmed);
    if (isOpeningContainer) {
      indentLevel = Math.min(4, indentLevel + 1);
    }

    return formatted;
  });

  const cleanedHtml = formattedLines.join('\n');
  const cleanedLineCount = cleanedHtml ? formattedLines.length : 0;

  return {
    cleanedHtml,
    originalLineCount,
    cleanedLineCount,
    removedCommentsCount,
    collapsedBlankLines,
    normalizedArtifacts,
  };
}

function validateContainerIdFormat(rawId: string): {
  valid: boolean;
  status: 'valid' | 'placeholder' | 'malformed';
  reason: string;
  suggestedFix?: string;
} {
  const trimmed = rawId.trim();
  const upper = trimmed.toUpperCase();

  if (PLACEHOLDER_IDS.has(upper) || /^GTM-X+$/i.test(trimmed)) {
    return {
      valid: false,
      status: 'placeholder',
      reason: 'Unconfigured placeholder token instead of a live GTM container ID.',
      suggestedFix: 'Replace with your workspace public ID (e.g., GTM-K9X4M2P).',
    };
  }

  if (/^GTM-[A-Z0-9]{6,8}$/.test(trimmed)) {
    return {
      valid: true,
      status: 'valid',
      reason: 'Matches canonical GTM-[A-Z0-9]{6,8} public container ID format.',
    };
  }

  if (/^gtm-[a-z0-9]{6,8}$/i.test(trimmed)) {
    return {
      valid: false,
      status: 'malformed',
      reason: 'Lowercase or mixed-case container ID; GTM container IDs are strictly uppercase.',
      suggestedFix: upper,
    };
  }

  if (/^GTM_[A-Z0-9]+$/i.test(trimmed)) {
    return {
      valid: false,
      status: 'malformed',
      reason: 'Uses underscore separator instead of hyphen.',
      suggestedFix: upper.replace('_', '-'),
    };
  }

  return {
    valid: false,
    status: 'malformed',
    reason: 'Does not match standard GTM-XXXXXX (6–8 uppercase alphanumeric characters after GTM-).',
    suggestedFix: /^GTM-[A-Z0-9]{1,5}$/i.test(trimmed)
      ? 'Verify full 6–8 character container ID from GTM Admin.'
      : upper.replace(/[^A-Z0-9-]/g, ''),
  };
}

export function analyzeImplementationSnippet(rawInput: string): SnippetScrapeReport {
  const cleaned = cleanAndFormatGtmSnippet(rawInput);
  const html = cleaned.cleanedHtml;

  // 1. Collect all GTM IDs & their locations
  const idMap = new Map<
    string,
    Set<'script_snippet' | 'noscript_iframe' | 'preload_link' | 'inline_reference'>
  >();

  const registerId = (
    id: string,
    loc: 'script_snippet' | 'noscript_iframe' | 'preload_link' | 'inline_reference'
  ) => {
    const key = id.trim();
    if (!key) return;
    const set = idMap.get(key) || new Set();
    set.add(loc);
    idMap.set(key, set);
  };

  // Look inside standard GTM IIFE snippet calls: (window,document,'script','dataLayer','GTM-...')
  const iifeRegex = /\(\s*window\s*,\s*document\s*,\s*['"]script['"]\s*,\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = iifeRegex.exec(html)) !== null) {
    registerId(m[1], 'script_snippet');
  }

  // Look inside gtm.js?id=... URLs (script tags or preload links)
  const gtmJsUrlRegex = /<([a-z]+)\b[^>]*\b(?:src|href)=["']([^"']*gtm\.js\?[^"']*)["'][^>]*>/gi;
  const gtmSourceUrls: string[] = [];
  while ((m = gtmJsUrlRegex.exec(html)) !== null) {
    const tagName = m[1].toLowerCase();
    const urlStr = m[2];
    gtmSourceUrls.push(urlStr);
    const idParam = urlStr.match(/[?&]id=([^&"'\s]+)/i);
    if (idParam) {
      registerId(idParam[1], tagName === 'link' ? 'preload_link' : 'script_snippet');
    }
  }

  // Look inside ns.html?id=... iframes
  const nsHtmlRegex = /ns\.html\?[^"'\s]*\bid=([^&"'\s]+)/gi;
  while ((m = nsHtmlRegex.exec(html)) !== null) {
    registerId(m[1], 'noscript_iframe');
  }

  // Catch any standalone GTM-... or gtm_... references
  const anyGtmTokenRegex = /\b(gtm[-_][a-z0-9]{2,12})\b/gi;
  while ((m = anyGtmTokenRegex.exec(html)) !== null) {
    if (!idMap.has(m[1])) {
      registerId(m[1], 'inline_reference');
    }
  }

  const containerIds: ExtractedContainerIdReport[] = Array.from(idMap.entries()).map(
    ([id, locSet]) => {
      const check = validateContainerIdFormat(id);
      return {
        id,
        valid: check.valid,
        status: check.status,
        locations: Array.from(locSet),
        reason: check.reason,
        suggestedFix: check.suggestedFix,
      };
    }
  );

  // 2. Structural & Attribute Checks
  const checks: SnippetCheckItem[] = [];

  const hasIifeSnippet = iifeRegex.test(html) || /gtm\.js\?id=/i.test(html);
  // Reset lastIndex after .test()
  iifeRegex.lastIndex = 0;

  const hasScriptTagWithGtm =
    /<script\b[^>]*>[\s\S]*?gtm\.js[\s\S]*?<\/script>/i.test(html) ||
    /<script\b[^>]*\bsrc=["'][^"']*gtm\.js[^"']*["']/i.test(html);

  const hasNoscriptIframe =
    /<noscript\b[^>]*>[\s\S]*?<iframe\b[^>]*ns\.html\?id=[\s\S]*?<\/noscript>/i.test(html);

  // Check A: gtm.js preload / preconnect marker
  const preloadLinkMatch = html.match(/<link\b[^>]*rel=["']preload["'][^>]*gtm\.js[^>]*>/i) ||
    html.match(/<link\b[^>]*gtm\.js[^>]*rel=["']preload["'][^>]*>/i);
  const hasAsScriptOnPreload = preloadLinkMatch ? /\bas=["']script["']/i.test(preloadLinkMatch[0]) : false;
  const hasPreconnectHint = /<link\b[^>]*rel=["']preconnect["'][^>]*googletagmanager\.com[^>]*>/i.test(html);

  if (preloadLinkMatch && hasAsScriptOnPreload) {
    checks.push({
      id: 'gtm-preload',
      attribute: 'gtm.js Preload Marker (<link rel="preload">)',
      category: 'Preload & Performance',
      status: 'pass',
      summary: 'Found <link rel="preload" as="script"> marker for gtm.js to prioritize container fetch.',
    });
  } else if (preloadLinkMatch && !hasAsScriptOnPreload) {
    checks.push({
      id: 'gtm-preload-as',
      attribute: 'gtm.js Preload Marker (missing as="script")',
      category: 'Preload & Performance',
      status: 'warning',
      summary: 'Preload <link> for gtm.js is missing the required as="script" attribute, causing duplicate browser downloads.',
      remediation: 'Add as="script" to your gtm.js preload tag.',
      recommendedCode: `<link rel="preload" href="https://www.googletagmanager.com/gtm.js?id=${containerIds[0]?.id || 'GTM-XXXXXXX'}" as="script">`,
    });
  } else if (hasPreconnectHint) {
    checks.push({
      id: 'gtm-preconnect-only',
      attribute: 'gtm.js Preload Marker',
      category: 'Preload & Performance',
      status: 'warning',
      summary: 'Found preconnect to googletagmanager.com, but no explicit <link rel="preload" as="script"> marker for gtm.js.',
      remediation: 'Add a gtm.js preload link in <head> right after Consent Mode defaults to reduce tag startup latency.',
      recommendedCode: `<link rel="preload" href="https://www.googletagmanager.com/gtm.js?id=${containerIds[0]?.id || 'GTM-XXXXXXX'}" as="script">`,
    });
  } else {
    checks.push({
      id: 'gtm-preload-missing',
      attribute: 'gtm.js Preload Marker (<link rel="preload">)',
      category: 'Preload & Performance',
      status: 'missing',
      summary: 'No <link rel="preload" href="...gtm.js" as="script"> or preconnect hint found.',
      remediation: 'Add a preload marker in <head> so the browser fetches gtm.js early without blocking rendering.',
      recommendedCode: `<link rel="preload" href="https://www.googletagmanager.com/gtm.js?id=${containerIds[0]?.id || 'GTM-XXXXXXX'}" as="script">`,
    });
  }

  // Check B: Non-blocking async attribute
  const hasAsyncFlag =
    /\.async\s*=\s*!0\b/.test(html) ||
    /\.async\s*=\s*true\b/i.test(html) ||
    /<script\b[^>]*\basync\b[^>]*gtm\.js/i.test(html) ||
    /<script\b[^>]*gtm\.js[^>]*\basync\b/i.test(html);

  checks.push(
    hasAsyncFlag
      ? {
          id: 'gtm-async',
          attribute: 'Non-Blocking async Flag (j.async=true)',
          category: 'Core GTM Bootstrap',
          status: 'pass',
          summary: 'GTM script loads asynchronously without blocking HTML parsing.',
        }
      : {
          id: 'gtm-async-missing',
          attribute: 'Non-Blocking async Flag (j.async=true)',
          category: 'Core GTM Bootstrap',
          status: 'missing',
          summary: 'Missing j.async=true (or async script attribute) on gtm.js loader.',
          remediation: 'Ensure j.async=true is set on the injected <script> element.',
        }
  );

  // Check C: gtm.start + event:'gtm.js' bootstrap push
  const hasGtmStartPush =
    /gtm\.start\s*:/i.test(html) && /event\s*:\s*['"]gtm\.js['"]/i.test(html);

  checks.push(
    hasGtmStartPush
      ? {
          id: 'gtm-start',
          attribute: "gtm.start & event: 'gtm.js' Bootstrap",
          category: 'Core GTM Bootstrap',
          status: 'pass',
          summary: "Standard dataLayer.push({'gtm.start': ..., event: 'gtm.js'}) initialization verified.",
        }
      : {
          id: 'gtm-start-missing',
          attribute: "gtm.start & event: 'gtm.js' Bootstrap",
          category: 'Core GTM Bootstrap',
          status: 'missing',
          summary: "Missing gtm.start timestamp or event: 'gtm.js' bootstrap push; All Pages triggers will not fire.",
          remediation: "Include w[l].push({'gtm.start': new Date().getTime(), event: 'gtm.js'}) before injecting gtm.js.",
        }
  );

  // Check D: <noscript> iframe fallback and hidden attributes
  if (hasNoscriptIframe) {
    const iframeMatch = html.match(/<iframe\b[^>]*ns\.html\?id=[^>]*>/i);
    const iframeAttrs = iframeMatch ? iframeMatch[0] : '';
    const hasZeroSize = /height=["']0["']/i.test(iframeAttrs) && /width=["']0["']/i.test(iframeAttrs);
    const hasHiddenStyle = /display\s*:\s*none/i.test(iframeAttrs);

    if (hasZeroSize && hasHiddenStyle) {
      checks.push({
        id: 'noscript-ok',
        attribute: '<noscript> ns.html Iframe Fallback',
        category: 'Noscript Fallback',
        status: 'pass',
        summary: 'Noscript fallback iframe found with height="0", width="0", and display:none attributes.',
      });
    } else {
      checks.push({
        id: 'noscript-attrs',
        attribute: '<noscript> ns.html Iframe Hidden Attributes',
        category: 'Noscript Fallback',
        status: 'warning',
        summary: 'Noscript iframe exists, but is missing height="0", width="0", or style="display:none;visibility:hidden".',
        remediation: 'Add height="0" width="0" style="display:none;visibility:hidden" to prevent layout shift when JS is disabled.',
      });
    }
  } else {
    checks.push({
      id: 'noscript-missing',
      attribute: '<noscript> ns.html Iframe Fallback',
      category: 'Noscript Fallback',
      status: 'missing',
      summary: 'No <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=..."></iframe></noscript> snippet detected.',
      remediation: 'Place the <noscript> iframe snippet immediately after the opening <body> tag.',
      recommendedCode: `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${containerIds[0]?.id || 'GTM-XXXXXXX'}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`,
    });
  }

  // Check E: Consent Mode v2 default ordering relative to GTM snippet
  const gtmPos = html.search(/gtm\.js|googletagmanager\.com/i);
  const consentPos = html.search(/gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/i);
  const hasV2Keys = /ad_user_data/i.test(html) && /ad_personalization/i.test(html);

  if (consentPos >= 0 && gtmPos >= 0 && consentPos < gtmPos && hasV2Keys) {
    checks.push({
      id: 'consent-order-ok',
      attribute: 'Consent Mode v2 Pre-GTM Ordering',
      category: 'Consent & Ordering',
      status: 'pass',
      summary: 'Consent Mode v2 defaults (ad_user_data, ad_personalization) execute prior to GTM container load.',
    });
  } else if (consentPos >= 0 && gtmPos >= 0 && consentPos > gtmPos) {
    checks.push({
      id: 'consent-race-order',
      attribute: 'Consent Mode v2 Pre-GTM Ordering',
      category: 'Consent & Ordering',
      status: 'missing',
      summary: 'Consent default declaration appears AFTER the GTM snippet, creating a race condition on initial pageview.',
      remediation: 'Move gtag("consent", "default", {...}) strictly above the GTM <script> snippet in <head>.',
    });
  } else if (consentPos >= 0 && !hasV2Keys) {
    checks.push({
      id: 'consent-v2-keys',
      attribute: 'Consent Mode v2 Parameters',
      category: 'Consent & Ordering',
      status: 'warning',
      summary: 'Consent default found, but missing ad_user_data and ad_personalization keys required for Consent Mode v2.',
      remediation: "Include 'ad_user_data': 'denied' and 'ad_personalization': 'denied' in your default consent block.",
    });
  } else {
    checks.push({
      id: 'consent-missing',
      attribute: 'Consent Mode v2 Default Block',
      category: 'Consent & Ordering',
      status: 'warning',
      summary: 'No inline gtag("consent", "default", ...) declaration found above GTM.',
      remediation: 'Add Consent Mode v2 default denied settings before GTM if serving EEA/UK traffic.',
    });
  }

  // Check F: Head vs Noscript ID mismatch or Duplicate GTM snippet
  const scriptIds = containerIds.filter((c) => c.locations.includes('script_snippet')).map((c) => c.id);
  const noscriptIds = containerIds.filter((c) => c.locations.includes('noscript_iframe')).map((c) => c.id);
  if (scriptIds.length > 0 && noscriptIds.length > 0 && !scriptIds.some((id) => noscriptIds.includes(id))) {
    checks.push({
      id: 'id-parity-mismatch',
      attribute: 'Head vs. Noscript Container ID Parity',
      category: 'Core GTM Bootstrap',
      status: 'missing',
      summary: `Script snippet references ${scriptIds.join(', ')} while <noscript> references ${noscriptIds.join(', ')}.`,
      remediation: 'Align both <script> and <noscript> snippets to the exact same canonical GTM container ID.',
    });
  }

  const scriptSnippetMatches = html.match(/gtm\.js\?id=/gi) || [];
  if (scriptSnippetMatches.length > 1) {
    checks.push({
      id: 'duplicate-gtm-loader',
      attribute: 'Duplicate GTM Loader Guard',
      category: 'Core GTM Bootstrap',
      status: 'warning',
      summary: `Detected ${scriptSnippetMatches.length} gtm.js script loaders in the snippet, risking duplicate container execution.`,
      remediation: 'Ensure each GTM container snippet is embedded only once in the document <head>.',
    });
  }

  return {
    cleaned,
    containerIds,
    checks,
    hasScriptSnippet: hasIifeSnippet || hasScriptTagWithGtm,
    hasNoscriptIframe,
    hasPreloadMarker: Boolean(preloadLinkMatch && hasAsScriptOnPreload),
    gtmSourceUrls,
    analyzedAt: new Date().toISOString(),
  };
}

export function getSnippetPreset(presetId: SnippetPresetId): {
  label: string;
  rawSnippet: string;
} {
  if (presetId === 'noisy_copy_paste') {
    return {
      label: 'Noisy Copy-Paste Snippet',
      rawSnippet: `<!-- Google Tag Manager -->
<!-- Pasted from Confluence CMS Setup Guide - DO NOT EDIT -->


<script>
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer',“GTM-K9X4M2P”);
</script>



<!-- End Google Tag Manager -->

<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-K9X4M2P"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`,
    };
  }

  if (presetId === 'broken_implementation') {
    return {
      label: 'Broken ID & Missing Preload',
      rawSnippet: `<head>
  <link rel="preload" href="https://www.googletagmanager.com/gtm.js?id=gtm-abc12">
  <script>
    (function(w,d,s,l,i){w[l]=w[l]||[];var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s);j.src='https://www.googletagmanager.com/gtm.js?id='+i;
    f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-XXXXXX');
  </script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', { 'ad_storage': 'denied', 'analytics_storage': 'denied' });
  </script>
</head>
<body>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-99Z1A2B"></iframe></noscript>
</body>`,
    };
  }

  return {
    label: 'Production-Ready Snippet',
    rawSnippet: `<head>
  <link rel="preconnect" href="https://www.googletagmanager.com">
  <link rel="preload" href="https://www.googletagmanager.com/gtm.js?id=GTM-K9X4M2P" as="script">
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {
      'ad_storage': 'denied',
      'analytics_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied',
      'wait_for_update': 500
    });
  </script>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-K9X4M2P');</script>
</head>
<body>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-K9X4M2P" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
</body>`,
  };
}
