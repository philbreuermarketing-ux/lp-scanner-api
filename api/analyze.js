// api/analyze.js — v2 (no cheerio dependency)

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function parseHtml(html) {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim() : '';

  // Extract meta description
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)
    || html.match(/<meta[^>]*content=["']([^"']*)[^>]*name=["']description["']/i);
  const metaDesc = metaMatch ? metaMatch[1].trim() : '';

  // Strip tags and extract body text
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#[0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  return { pageTitle, metaDesc, text };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL fehlt' });

  let pageTitle = '';
  let metaDesc = '';
  let pageText = '';

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
      signal: AbortSignal.timeout(9000),
    });
    const html = await resp.text();
    const parsed = parseHtml(html);
    pageTitle = parsed.pageTitle;
    metaDesc = parsed.metaDesc;
    pageText = parsed.text;
  } catch (e) {
    pageText = `[Seite konnte nicht gelesen werden: ${e.message}]`;
  }

  const prompt = `Du bist ein Conversion-Rate-Experte spezialisiert auf Wintergarten- und Terrassenüberdachungs-Betriebe in Deutschland die Google Ads schalten.

Analysiere diese Landing Page:
URL: ${url}
Titel: ${pageTitle}
Meta-Description: ${metaDesc}
Seiteninhalt (Auszug): ${pageText}

WICHTIG: Lies den Seiteninhalt GENAU. Erkenne konkret:
- Was wird angeboten? (Wintergarten, Terrassenüberdachung, Markise, etc.)
- In welcher Region/Stadt ist der Betrieb?
- Wie heißt das Unternehmen?
- Welche Hauptaussage macht die Seite?

Antworte NUR mit einem validen JSON-Objekt. Kein Text davor oder danach. Keine Kommentare im JSON.

{
  "detectedProduct": "kurze Beschreibung was die Seite verkauft, z.B. Wintergärten in München",
  "detectedCompany": "Firmenname falls erkennbar, sonst null",
  "detectedRegion": "Stadt oder Region falls erkennbar, sonst null",

  "pageReadSentence": "Ein Satz der BEWEIST dass wir die Seite wirklich gelesen haben. Erwähne ein konkretes Detail — ein Produkt, ein Slogan, eine Stadt, eine konkrete Aussage von der Seite. Keine generischen Aussagen. Muss 100% seitenspezifisch sein.",

  "criticalProblem": {
    "category": "HEADLINE oder CTA oder VERTRAUEN oder GESCHWINDIGKEIT oder MOBILOPTIMIERUNG oder REGIONALITÄT oder PROZESS oder PREISTRANSPARENZ",
    "teaser": "Das kritischste Problem in 1 Satz — NUR das Problem beschreiben, NICHT die Lösung. Konkret und spezifisch zur Seite.",
    "severity": "hoch oder mittel"
  },

  "competitorGapTeaser": {
    "missingCount": 3,
    "hint": "Ein kurzer Hinweis was fehlt, ohne die Lösung zu nennen."
  },

  "leadLossEstimate": {
    "monthlyVisitorsEstimate": 400,
    "currentCVR": 1.4,
    "potentialCVR": 3.2,
    "lostLeadsPerMonth": 7,
    "reasoning": "1 Satz warum diese CVR — bezogen auf konkrete Probleme der Seite"
  },

  "overallGrade": "B",
  "overallSentence": "1 ehrlicher Satz zur Gesamtsituation. Konkret, nicht generisch."
}

Passe alle Zahlen und Texte individuell an die analysierte Seite an. Die Beispielwerte oben sind nur Platzhalter.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.35,
      max_tokens: 1000,
    });

    let raw = completion.choices[0]?.message?.content || '';
    raw = raw.replace(/```json|```/g, '').trim();

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Kein JSON in Antwort');

    const analysis = JSON.parse(jsonMatch[0]);

    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
