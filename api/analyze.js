// api/analyze.js — KI-Analyse mit Claude API
// Bewertet Landing Pages nach dem 5-Schritte Framework (Friction, Motivation, Value, Objections, Incentives)
// Speziell ausgerichtet auf Wintergarten/Sonnenschutz-Betriebe

const https = require("https");

// ── Hilfsfunktion: HTTPS POST ─────────────────────────────
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path,
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
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

// ── Seiten-HTML abrufen (für KI-Analyse) ─────────────────
function fetchHtml(targetUrl) {
  return new Promise((resolve) => {
    const mod = targetUrl.startsWith("https") ? https : require("http");
    const req = mod.get(
      targetUrl,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LPScanner/1.0)",
          Accept: "text/html",
        },
        timeout: 10000,
      },
      (res) => {
        // Redirects folgen
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

// ── HTML bereinigen (nur sichtbarer Text) ────────────────
function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000); // Claude bekommt max. 4000 Zeichen Seitentext
}

// ── Claude Analyse-Prompt ─────────────────────────────────
function buildPrompt(url, pageText, pagespeedData) {
  const perf = pagespeedData?.mobile?.scores?.performance || "–";
  const seo  = pagespeedData?.mobile?.scores?.seo         || "–";
  const lcp  = pagespeedData?.mobile?.vitals?.lcp         || "–";

  return `Du bist ein freundlicher aber ehrlicher Landing Page Experte, spezialisiert auf Wintergarten-, Sommergarten- und Terrassenüberdachungs-Betriebe in Deutschland, die Google Ads schalten.

Du analysierst Landing Pages anhand eines bewährten 5-Schritte-Frameworks:
1. Friction & Anxiety eliminieren (Was bremst oder verwirrt Besucher?)
2. Motivation aufbauen (Fühlt sich der Besucher sofort angesprochen?)
3. Wert kommunizieren (Ist klar, warum dieser Betrieb besser ist?)
4. Einwände adressieren (Werden Zweifel aktiv entkräftet?)
5. Incentives setzen (Gibt es einen Grund, JETZT zu handeln?)

Technische Daten dieser Seite:
- URL: ${url}
- Mobile Performance Score: ${perf}/100
- SEO Score: ${seo}/100
- Largest Contentful Paint: ${lcp}

Seiteninhalt (extrahierter Text):
"""
${pageText || "Kein Text extrahierbar — bitte anhand der URL einschätzen."}
"""

Erstelle eine Analyse im folgenden JSON-Format. Antworte NUR mit dem JSON-Objekt, ohne Markdown oder Erklärungen davor/danach:

{
  "overallVerdict": "Ein motivierender Einstiegssatz der die wichtigste Chance benennt (max. 2 Sätze)",
  "adsBudgetWarning": "Konkrete Einschätzung: Wie viel Budget wird durch die aktuelle Seite verschwendet? (1-2 Sätze, freundlich formuliert)",
  "teaser": [
    "Kurzer Teaser-Punkt 1 der im öffentlichen Scanner sichtbar ist (nur Problemhint, keine Lösung)",
    "Kurzer Teaser-Punkt 2",
    "Kurzer Teaser-Punkt 3"
  ],
  "steps": [
    {
      "step": 1,
      "title": "Friction & Anxiety",
      "emoji": "🛑",
      "score": 6,
      "scoreLabel": "Gut / Ausbaufähig / Kritisch",
      "summary": "Kurze freundliche Zusammenfassung (1-2 Sätze)",
      "findings": [
        { "type": "pass", "text": "Was gut funktioniert" },
        { "type": "warn", "text": "Was verbesserungswürdig ist" },
        { "type": "fail", "text": "Was Conversions kostet" }
      ],
      "topAction": "Die eine wichtigste Maßnahme für diesen Bereich (konkret & umsetzbar)"
    },
    {
      "step": 2,
      "title": "Motivation & Relevanz",
      "emoji": "🚀",
      "score": 5,
      "scoreLabel": "Gut / Ausbaufähig / Kritisch",
      "summary": "...",
      "findings": [],
      "topAction": "..."
    },
    {
      "step": 3,
      "title": "Wert kommunizieren",
      "emoji": "💎",
      "score": 4,
      "scoreLabel": "...",
      "summary": "...",
      "findings": [],
      "topAction": "..."
    },
    {
      "step": 4,
      "title": "Einwände entkräften",
      "emoji": "🤔",
      "score": 3,
      "scoreLabel": "...",
      "summary": "...",
      "findings": [],
      "topAction": "..."
    },
    {
      "step": 5,
      "title": "Incentives & Handlungsdruck",
      "emoji": "🎁",
      "score": 4,
      "scoreLabel": "...",
      "summary": "...",
      "findings": [],
      "topAction": "..."
    }
  ],
  "wintergartenSpecific": {
    "hasRegionMention": true,
    "hasPriceTransparency": false,
    "hasProcessExplained": false,
    "hasPermitInfo": false,
    "hasSocialProof": false,
    "comment": "Branchenspezifischer Kommentar: Was fehlt typischerweise bei Wintergarten-Betrieben und ist hier auch nicht vorhanden? (2-3 Sätze, freundlich)"
  },
  "heroHeadlineAssessment": "Konkrete Einschätzung der Haupt-Überschrift. Wenn erkennbar: Was genau müsste sie sagen um Wintergarten-Käufer sofort anzusprechen?",
  "ctaAssessment": "Wie ist der Call-to-Action formuliert und was wäre besser?",
  "quickWins": [
    "Quick Win 1: Sofort umsetzbar, hoher Impact (konkret!)",
    "Quick Win 2",
    "Quick Win 3"
  ]
}`;
}

// ── Vercel Handler ────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const targetUrl    = req.query?.url;
  const pagespeedRaw = req.query?.pagespeed;

  if (!targetUrl) {
    res.status(400).json({ error: "Parameter 'url' fehlt" });
    return;
  }

  // ── API Key aus Umgebungsvariable ─────────────────────
  // In Vercel: Settings → Environment Variables → ANTHROPIC_API_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY nicht gesetzt" });
    return;
  }

  console.log("KI-Analyse für:", targetUrl);

  try {
    // 1. Seiten-HTML holen
    const html     = await fetchHtml(targetUrl);
    const pageText = extractText(html);

    // 2. PageSpeed-Daten (falls mitgeschickt) parsen
    let pagespeedData = null;
    if (pagespeedRaw) {
      try { pagespeedData = JSON.parse(decodeURIComponent(pagespeedRaw)); }
      catch (e) { /* ignorieren */ }
    }

    // 3. Claude API aufrufen
    const prompt   = buildPrompt(targetUrl, pageText, pagespeedData);
    const claudeRes = await httpsPost(
      "api.anthropic.com",
      "/v1/messages",
      {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      {
        model: "claude-opus-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }
    );

    if (claudeRes.error) {
      throw new Error(claudeRes.error.message || "Claude API Fehler");
    }

    // 4. JSON aus Antwort extrahieren
    const rawText = claudeRes.content?.[0]?.text || "";
    let analysis;
    try {
      // Sicherheits-Strip: Markdown-Backticks entfernen falls vorhanden
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch (e) {
      throw new Error("KI-Antwort konnte nicht geparst werden: " + rawText.slice(0, 200));
    }

    res.status(200).json({ success: true, analysis, fetchTime: new Date().toISOString() });

  } catch (err) {
    console.error("Analyze error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
