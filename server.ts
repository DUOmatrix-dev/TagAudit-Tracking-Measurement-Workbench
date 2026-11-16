import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();
app.use(express.json());

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
