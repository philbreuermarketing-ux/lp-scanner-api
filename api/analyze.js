import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function extractText(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{0,300})/i)
    || html.match(/<meta[^>]*content=["']([^"']{0,300})[^>]*name=["']description["']/i);
  const meta = metaMatch ? metaMatch[1].trim() : '';

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim().slice(0, 4000);

  return { title, meta, text };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, error: 'URL fehlt' });

  let title = '', meta = '', text = '';
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scanner/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    ({ title, meta, text } = extractText(html));
  } catch (e) {
    text = '[Seite nicht erreichbar]';
  }

  const prompt = `Du bist ein Conversion-Experte für Wintergarten- und Terrassenüberdachungs-Betriebe in Deutschland.

Analysiere diese Landing Page:
URL: ${url}
Titel: ${title}
Meta: ${meta}
Inhalt: ${text}

Lies den Inhalt GENAU. Erkenne Firma, Produkt, Region, konkrete Schwächen.

Antworte NUR mit validem JSON, kein Text davor oder danach:

{
  "detectedProduct": "was verkauft wird, z.B. Wintergärten München",
  "detectedCompany": "Firmenname oder null",
  "detectedRegion": "Stadt/Region oder null",
  "pageReadSentence": "1 Satz der BEWEIST dass du die Seite gelesen hast — nenne ein konkretes Detail (Produkt, Stadt, Slogan). Niemals generisch.",
  "overallScore": 45,
  "criticalProblem": {
    "category": "HEADLINE oder CTA oder VERTRAUEN oder REGIONALITÄT oder PROZESS oder MOBILOPTIMIERUNG",
    "teaser": "Das wichtigste Problem in 1 Satz — nur das Problem, nicht die Lösung. Seitenspezifisch.",
    "severity": "hoch oder mittel"
  },
  "competitorGapTeaser": {
    "missingCount": 3,
    "hint": "Was Top-Wettbewerber haben, diese Seite nicht — ohne Lösung. 1 Satz."
  },
  "leadLossEstimate": {
    "lostLeadsPerMonth": 8,
    "reasoning": "1 Satz warum — bezogen auf konkrete Schwäche der Seite"
  }
}

Passe ALLE Werte individuell an diese spezifische Seite an.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    });

    let raw = completion.choices[0]?.message?.content || '';
    raw = raw.replace(/```json|```/g, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Kein JSON');

    return res.status(200).json({ success: true, analysis: JSON.parse(match[0]) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
