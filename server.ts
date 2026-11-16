import 'dotenv/config';
import express from 'express';
import path from 'path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();
app.use(express.json());

function isPrivateOrBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
    if (lower.startsWith('::ffff:')) {
      return isPrivateOrBlockedIp(lower.slice(7));
    }
    return false;
  }
  return true;
}

async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new Error('Local or internal hostnames cannot be scanned.');
  }
  if (net.isIP(host)) {
    if (isPrivateOrBlockedIp(host)) {
      throw new Error('Private or loopback IP addresses are blocked.');
    }
    return parsed;
  }
  const resolved = await dns.lookup(host, { all: true });
  if (!resolved.length || resolved.some((entry) => isPrivateOrBlockedIp(entry.address))) {
    throw new Error('Target hostname resolved to a restricted network address.');
  }
  return parsed;
}

function uniqueMatches(html: string, regex: RegExp): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) found.add(match[1].trim());
  }
  return Array.from(found);
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.post('/api/analyze-url', async (req, res) => {
  const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!rawUrl) {
    res.status(400).json({ error: 'Please paste a valid http(s) URL to analyze.' });
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = await assertSafeExternalUrl(rawUrl);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Invalid or disallowed URL.',
    });
    return;
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TagAuditScanner/1.0; +https://tagaudit.local)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const elapsedMs = Date.now() - startedAt;
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    const html = rawText.slice(0, 1_500_000);

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 140) : '';

    const gtmContainers = uniqueMatches(
      html,
      /\b(GTM-[A-Z0-9]{4,10})\b/g
    );
    const ga4MeasurementIds = uniqueMatches(
      html,
      /\b(G-[A-Z0-9]{6,14})\b/g
    );
    const googleAdsIds = uniqueMatches(
      html,
      /\b(AW-[0-9]{6,14})\b/g
    );
    const metaPixelIds = Array.from(
      new Set([
        ...uniqueMatches(html, /fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]/g),
        ...uniqueMatches(html, /facebook\.com\/tr\?id=(\d{8,20})/g),
      ])
    );
    const linkedInPartnerIds = uniqueMatches(
      html,
      /_linkedin_partner_id\s*=\s*['"](\d{4,12})['"]/g
    );
    const tiktokPixelIds = uniqueMatches(
      html,
      /ttq\.load\(\s*['"]([A-Z0-9]{10,30})['"]/gi
    );

    const hasGtagScript = /googletagmanager\.com\/gtag\/js/i.test(html);
    const hasCustomSgtmTransport =
      /transport_url\s*[:=]/i.test(html) ||
      /server_container_url/i.test(html) ||
      /<script[^>]+src=["']https?:\/\/(?!www\.googletagmanager\.com)[^"']*\/gtm\.js\?id=GTM-/i.test(
        html
      );
    const hasDataLayer = /\bdataLayer\b/.test(html);
    const hasConsentModeDefault =
      /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/i.test(html) ||
      /consent\s*,\s*['"]default['"]/i.test(html);
    const hasConsentV2Signals =
      /ad_user_data/i.test(html) && /ad_personalization/i.test(html);

    const cmpVendors: string[] = [];
    if (/cookiebot\.com/i.test(html)) cmpVendors.push('Cookiebot');
    if (/cookielaw\.org|onetrust/i.test(html)) cmpVendors.push('OneTrust');
    if (/cookieyes\.com/i.test(html)) cmpVendors.push('CookieYes');
    if (/didomi\.io/i.test(html)) cmpVendors.push('Didomi');
    if (/usercentrics\.eu/i.test(html)) cmpVendors.push('Usercentrics');
    if (/osano\.com/i.test(html)) cmpVendors.push('Osano');

    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
    const scriptCount = (html.match(/<script\b/gi) || []).length;

    res.json({
      reachable: true,
      requestedUrl: targetUrl.toString(),
      finalUrl: response.url || targetUrl.toString(),
      redirected: Boolean(response.redirected),
      statusCode: response.status,
      statusText: response.statusText,
      responseTimeMs: elapsedMs,
      contentType,
      pageTitle,
      scriptCount,
      hasCanonical,
      signals: {
        gtmContainers,
        ga4MeasurementIds,
        googleAdsIds,
        metaPixelIds,
        linkedInPartnerIds,
        tiktokPixelIds,
        hasGtagScript,
        hasCustomSgtmTransport,
        hasDataLayer,
        hasConsentModeDefault,
        hasConsentV2Signals,
        cmpVendors,
      },
    });
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    res.json({
      reachable: false,
      requestedUrl: targetUrl.toString(),
      finalUrl: targetUrl.toString(),
      redirected: false,
      statusCode: null,
      statusText: '',
      responseTimeMs: elapsedMs,
      fetchError:
        err instanceof Error
          ? err.message
          : 'Remote host timed out or refused HTTP inspection.',
      signals: null,
    });
  }
});

app.post('/api/platform-updates', async (req, res) => {
  try {
    const topic = typeof req.body?.topic === 'string' ? req.body.topic : 'all';
    const customQuery =
      typeof req.body?.query === 'string' ? req.body.query.trim() : '';

    const topicPromptMap: Record<string, string> = {
      all: 'latest official Google Tag Manager (Web and Server-Side GTM), Google Analytics 4 (GA4), Consent Mode v2, and Google Ads Enhanced Conversions documentation updates and release notes',
      gtm: 'latest official Google Tag Manager release notes, server-side GTM (sGTM) updates, Google tag gateway, and container template changes',
      ga4: 'latest official Google Analytics 4 (GA4) release notes, Measurement Protocol v2 updates, ecommerce schema changes, and key events documentation',
      consent: 'latest official Google Consent Mode v2, IAB TCF v2.2 integration with GTM, and EEA/UK privacy measurement documentation updates',
    };

    const focusPhrase = topicPromptMap[topic] || topicPromptMap.all;
    const prompt = customQuery
      ? `Search for the ${focusPhrase}, specifically focusing on: "${customQuery}". Summarize the key actionable engineering takeaways for a tracking and measurement specialist in 4 to 6 concise bullet points, noting implementation impacts on GTM, GA4, or Consent Mode.`
      : `Search for the ${focusPhrase}. Summarize the most recent and important documentation updates and release notes for a tracking and measurement specialist in 4 to 6 concise bullet points, highlighting concrete changes to GTM tags, GA4 events, server-side tagging, or consent configuration.`;

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a precision technical documentation researcher for Google Tag Manager, GA4, Consent Mode v2, and paid media measurement. Ground every claim strictly in the Google Search results. Return clean plain text bullet lines starting with "- " without markdown headers or decorative emojis.',
        tools: [{ googleSearch: {} }],
      },
    });

    const text = (response.text ?? '').trim();
    const rawChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

    const seenUris = new Set<string>();
    const sources: Array<{ title: string; uri: string }> = [];

    for (const chunk of rawChunks) {
      const web = chunk.web;
      if (web?.uri && !seenUris.has(web.uri)) {
        seenUris.add(web.uri);
        sources.push({
          title: web.title || web.uri,
          uri: web.uri,
        });
      }
    }

    res.json({
      topic,
      summary: text,
      sources,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    let status = 500;
    let message =
      error instanceof Error
        ? error.message
        : 'Failed to fetch platform documentation updates.';

    try {
      const parsed = JSON.parse(message);
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
      if (typeof parsed?.error?.code === 'number') {
        status = parsed.error.code;
      }
    } catch {
      // keep raw message string
    }

    res.status(status).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TagAudit server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
