// api/analyze.js — v2
// Teaser-focused output: enough to create curiosity, not enough to solve it

import Groq from 'groq-sdk';
import * as cheerio from 'cheerio';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL fehlt' });

  let pageText = '';
  let pageTitle = '';
  let metaDesc = '';

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LPScanner/2.0)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await resp.text();
    const $ = cheerio.load(html);
    $('script,style,nav,footer,noscript').remove();
    pageTitle = $('title').text().trim();
    metaDesc = $('meta[name="description"]').attr('content') || '';
    pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 4000);
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

Antworte NUR mit diesem JSON-Objekt, kein Text davor oder danach:

{
  "detectedProduct": "kurze Beschreibung was die Seite verkauft, z.B. 'Wintergärten in München'",
  "detectedCompany": "Firmenname falls erkennbar, sonst null",
  "detectedRegion": "Stadt oder Region falls erkennbar, sonst null",
  
  "pageReadSentence": "Ein Satz der BEWEIST dass wir die Seite wirklich gelesen haben. Erwähne ein konkretes Detail von der Seite — ein Produkt, ein Slogan, eine Stadt, eine Aussage. KEINE generischen Aussagen. Beispiel: 'Wir haben gesehen dass ihr euch auf Terrassenüberdachungen in der Region Stuttgart spezialisiert habt und Photovoltaik-Überdachungen als Alleinstellungsmerkmal nutzt.' Muss 100% seitenspezifisch sein.",

  "criticalProblem": {
    "category": "Einer von: HEADLINE | CTA | VERTRAUEN | GESCHWINDIGKEIT | MOBILOPTIMIERUNG | REGIONALITÄT | PROZESS | PREISTRANSPARENZ",
    "teaser": "Beschreibe das kritischste Problem das du siehst — aber NUR das Problem, NICHT die Lösung. Max 1 Satz. Konkret und spezifisch zur Seite. Beispiel: 'Deine Hauptüberschrift spricht nicht die konkrete Situation an in der sich dein Kunde befindet wenn er auf deine Anzeige klickt.'",
    "severity": "hoch | mittel"
  },

  "competitorGapTeaser": {
    "missingCount": Eine Zahl zwischen 2 und 4 — wie viele der 5 wichtigsten Conversion-Merkmale fehlen,
    "hint": "Ein kurzer Hinweis WAS fehlt, aber OHNE die Lösung zu nennen. Beispiel: 'Deine Hauptwettbewerber in der Region setzen auf ein Element das du noch nicht nutzt — und das direkt beim ersten Blick Vertrauen aufbaut.'"
  },

  "leadLossEstimate": {
    "monthlyVisitorsEstimate": Geschätzte monatliche Besucher basierend auf der Seitenqualität (zwischen 200 und 2000 — variiere je nach Seitenqualität und Branchengröße),
    "currentCVR": Eine Zahl zwischen 0.8 und 3.5 — die aktuelle geschätzte Conversion Rate basierend auf den konkreten Problemen die du siehst. VARIIERE diese Zahl je nach Seitenqualität. Schlechte Seite = niedrig, gute Seite = höher,
    "potentialCVR": currentCVR + zwischen 1.5 und 3.0 je nach Optimierungspotenzial,
    "lostLeadsPerMonth": Berechne: Math.round(monthlyVisitorsEstimate * (potentialCVR - currentCVR) / 100),
    "reasoning": "1 Satz warum diese spezifische CVR — bezogen auf konkrete Probleme der Seite"
  },

  "overallGrade": "A | B | C | D — Gesamtnote für die Conversion-Tauglichkeit",
  "overallSentence": "1 ehrlicher Satz zur Gesamtsituation der Seite. Konkret, nicht generisch."
}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1200,
    });

    let raw = completion.choices[0]?.message?.content || '';
    raw = raw.replace(/```json|```/g, '').trim();

    // Extract JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Kein JSON in Antwort');

    const analysis = JSON.parse(jsonMatch[0]);

    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
