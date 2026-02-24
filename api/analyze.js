// api/analyze.js — Erweiterte KI-Analyse mit Groq (kostenlos)
// Wintergarten-Framework + Wettbewerb + Vorher/Nachher + Anfragen-Verlust + Headline-Rewrite + Region

const https = require("https");

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request(
      { hostname, path, method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error("Parse error: " + data.slice(0, 300))); }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function fetchHtml(targetUrl) {
  return new Promise((resolve) => {
    const mod = targetUrl.startsWith("https") ? https : require("http");
    const req = mod.get(targetUrl,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; LPScanner/1.0)", Accept: "text/html" }, timeout: 10000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchHtml(res.headers.location).then(resolve).catch(() => resolve(""));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3500);
}

function extractRegion(url, text) {
  const regions = [
    "hamburg","münchen","berlin","köln","frankfurt","stuttgart","düsseldorf",
    "leipzig","dresden","hannover","nürnberg","bremen","dortmund","essen",
    "duisburg","bochum","wuppertal","bonn","münster","karlsruhe","mannheim",
    "augsburg","wiesbaden","freiburg","aachen","erfurt","rostock","mainz",
    "kassel","osnabrück","oldenburg","heidelberg","würzburg","ulm","ingolstadt",
    "regensburg","wolfsburg","pinneberg","schleswig","holstein","nrw","bayern",
    "sachsen","hessen","niedersachsen","norddeutschland","süddeutschland",
  ];
  const combined = (url + " " + text).toLowerCase();
  for (const r of regions) {
    if (combined.includes(r)) return r.charAt(0).toUpperCase() + r.slice(1);
  }
  return null;
}

function buildPrompt(url, pageText, pagespeedData, region) {
  const perf = pagespeedData?.mobile?.scores?.performance || "–";
  const seo  = pagespeedData?.mobile?.scores?.seo         || "–";
  const lcp  = pagespeedData?.mobile?.vitals?.lcp         || "–";
  const regionHint = region ? `Erkannte Region: ${region} — beziehe diese Region aktiv in deine Analyse und Empfehlungen ein.` : "Keine Region erkannt.";

  return `Du bist ein erfahrener Landing Page & Conversion Experte, spezialisiert auf Wintergarten-, Sommergarten-, Terrassenüberdachungs- und Markisen-Betriebe in Deutschland die Google Ads schalten. Du kennst die besten Seiten der Branche und weißt genau was Top-Performer anders machen als der Durchschnitt.

Technische Daten:
- URL: ${url}
- ${regionHint}
- Mobile Performance: ${perf}/100
- SEO Score: ${seo}/100
- LCP: ${lcp}

Seiteninhalt:
"""
${pageText || "Kein Text extrahierbar."}
"""

Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Backticks, ohne Text davor oder danach:

{
  "detectedProduct": "Erkanntes Hauptprodukt (z.B. 'Wintergärten & Terrassenüberdachungen')",
  "detectedRegion": "${region || "nicht erkannt"}",

  "overallVerdict": "Freundlicher motivierender Einstiegssatz der die größte Chance benennt. Region ansprechen falls bekannt. Max. 2 Sätze.",

  "leadLossEstimate": {
    "monthlyVisitors": 400,
    "currentConversionRate": 1.2,
    "potentialConversionRate": 3.5,
    "lostLeadsPerMonth": 9,
    "reasoning": "Kurze Erklärung warum diese Zahlen realistisch sind. Branchendurchschnitt optimierter Wintergarten-Betriebe liegt bei 2.5-4% CVR."
  },

  "adsBudgetWarning": "Konkrete Einschätzung des verschwendeten Budgets. Rechne durch: z.B. X Klicks/Tag × Y€ CPC = Z€/Monat für Besucher die nicht anfragen. 2 Sätze, freundlich aber klar.",

  "teaser": [
    "Teaser-Problem 1 — konkret genug um Neugier zu wecken, aber ohne die Lösung zu verraten",
    "Teaser-Problem 2",
    "Teaser-Problem 3"
  ],

  "heroRewrite": {
    "current": "Die aktuelle Headline der Seite (falls erkennbar, sonst: 'Nicht eindeutig erkennbar')",
    "problem": "Was an der aktuellen Headline nicht funktioniert (1 klarer Satz)",
    "rewritten": "Deine deutlich bessere Headline — spezifisch, nutzenorientiert, mit Region falls bekannt. Format: Benefit + Zielgruppe + Region/Kontext",
    "subline": "Passende Subline die Vertrauen aufbaut und nächsten Schritt klar macht"
  },

  "ctaRewrite": {
    "current": "Aktueller CTA-Text",
    "problem": "Was nicht funktioniert",
    "rewritten": "Dein besserer CTA — konkret, nutzenorientiert, niedrige Hürde",
    "supportText": "Satz direkt unter dem CTA der Angst nimmt, z.B. 'Kostenlos & unverbindlich · Antwort innerhalb von 24h'"
  },

  "beforeAfter": {
    "situation": "Typische Situation: Hausbesitzer sucht Wintergarten, landet auf dieser Seite. Was denkt und fühlt er?",
    "before": "Wie es sich anfühlt OHNE optimierte Landing Page zu finden — aus echter Kundenperspektive",
    "after": "Wie es sich anfühlen würde wenn diese Seite optimal wäre — was würde der Kunde denken und tun?",
    "brandSpecific": "Was diese konkrete Seite konkret ändern könnte um diesen Moment zu erzeugen (1-2 Sätze)"
  },

  "competitorGap": {
    "whatTopPlayersDo": [
      "Was die besten Wintergarten-Betriebe Deutschlands auf ihren Seiten machen — Punkt 1 (konkret)",
      "Top-Performer Merkmal 2 (konkret)",
      "Top-Performer Merkmal 3 (konkret)"
    ],
    "whatThisSiteMisses": [
      "Was diese Seite davon nicht hat — Punkt 1",
      "Was fehlt — Punkt 2",
      "Was fehlt — Punkt 3"
    ],
    "competitiveDisadvantage": "Was passiert konkret wenn ein Interessent diese Seite UND eine gut optimierte Wettbewerber-Seite sieht? Warum verliert man diesen Kunden? 2 Sätze, freundlich aber ehrlich."
  },

  "steps": [
    {
      "step": 1, "title": "Friction & Anxiety", "emoji": "🛑",
      "score": 6, "scoreLabel": "Ausbaufähig",
      "summary": "1-2 Sätze freundliche Zusammenfassung",
      "findings": [
        { "type": "pass", "text": "Was gut funktioniert — konkret benannt" },
        { "type": "warn", "text": "Was verbesserungswürdig ist — konkret" },
        { "type": "fail", "text": "Was aktiv Conversions kostet — konkret" }
      ],
      "topAction": "Die eine wichtigste sofort umsetzbare Maßnahme — sehr konkret formuliert"
    },
    {
      "step": 2, "title": "Motivation & Relevanz", "emoji": "🚀",
      "score": 5, "scoreLabel": "Ausbaufähig",
      "summary": "...",
      "findings": [
        { "type": "fail", "text": "..." },
        { "type": "warn", "text": "..." }
      ],
      "topAction": "..."
    },
    {
      "step": 3, "title": "Wert kommunizieren", "emoji": "💎",
      "score": 4, "scoreLabel": "Kritisch",
      "summary": "...",
      "findings": [
        { "type": "fail", "text": "..." },
        { "type": "warn", "text": "..." }
      ],
      "topAction": "..."
    },
    {
      "step": 4, "title": "Einwände entkräften", "emoji": "🤔",
      "score": 3, "scoreLabel": "Kritisch",
      "summary": "...",
      "findings": [
        { "type": "fail", "text": "..." },
        { "type": "fail", "text": "..." }
      ],
      "topAction": "..."
    },
    {
      "step": 5, "title": "Incentives & Handlungsdruck", "emoji": "🎁",
      "score": 4, "scoreLabel": "Ausbaufähig",
      "summary": "...",
      "findings": [
        { "type": "fail", "text": "..." },
        { "type": "warn", "text": "..." }
      ],
      "topAction": "..."
    }
  ],

  "wintergartenSpecific": {
    "hasRegionMention": false,
    "hasPriceTransparency": false,
    "hasProcessExplained": false,
    "hasPermitInfo": false,
    "hasSocialProof": false,
    "comment": "2-3 Sätze branchenspezifischer Kommentar — was fehlt typischerweise und ist auch hier nicht vorhanden"
  },

  "quickWins": [
    "Quick Win 1: Konkret, sofort umsetzbar, hoher Impact — mit Beispiel was genau zu tun ist",
    "Quick Win 2: Konkret & umsetzbar",
    "Quick Win 3: Konkret & umsetzbar"
  ]
}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const targetUrl = req.query?.url;
  if (!targetUrl) { res.status(400).json({ error: "Parameter 'url' fehlt" }); return; }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "GROQ_API_KEY nicht gesetzt" }); return; }

  console.log("Groq-Analyse für:", targetUrl);

  try {
    const html     = await fetchHtml(targetUrl);
    const pageText = extractText(html);

    let pagespeedData = null;
    if (req.query?.pagespeed) {
      try { pagespeedData = JSON.parse(decodeURIComponent(req.query.pagespeed)); } catch (e) {}
    }

    const region  = extractRegion(targetUrl, pageText);
    const prompt  = buildPrompt(targetUrl, pageText, pagespeedData, region);

    const groqRes = await httpsPost(
      "api.groq.com",
      "/openai/v1/chat/completions",
      { Authorization: `Bearer ${apiKey}` },
      {
        model: "llama-3.3-70b-versatile",
        max_tokens: 3000,
        temperature: 0.3,
        messages: [
          { role: "system", content: "Du bist ein Landing Page Experte. Antworte ausschließlich mit validem JSON ohne Markdown-Backticks oder erklärendem Text davor oder danach." },
          { role: "user", content: prompt },
        ],
      }
    );

    if (groqRes.error) throw new Error(groqRes.error.message || "Groq API Fehler");

    const rawText = groqRes.choices?.[0]?.message?.content || "";
    let analysis;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch (e) {
      throw new Error("JSON parse error: " + rawText.slice(0, 300));
    }

    res.status(200).json({ success: true, analysis, model: "llama-3.3-70b-versatile", fetchTime: new Date().toISOString() });

  } catch (err) {
    console.error("Fehler:", err.message);
    res.status(500).json({ error: err.message });
  }
};
