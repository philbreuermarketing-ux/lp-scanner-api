// api/analyze.js — KI-Analyse mit Groq API (kostenlos, kein Kreditkarte nötig)
// Bewertet Landing Pages nach dem 5-Schritte Framework
// Speziell für Wintergarten/Sonnenschutz-Betriebe

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

function buildPrompt(url, pageText, pagespeedData) {
  const perf = pagespeedData?.mobile?.scores?.performance || "–";
  const seo  = pagespeedData?.mobile?.scores?.seo         || "–";
  const lcp  = pagespeedData?.mobile?.vitals?.lcp         || "–";

  return `Du bist ein freundlicher Landing Page Experte spezialisiert auf Wintergarten- und Terrassenüberdachungs-Betriebe in Deutschland die Google Ads schalten.

Technische Daten:
- URL: ${url}
- Mobile Performance: ${perf}/100
- SEO: ${seo}/100
- LCP: ${lcp}

Seiteninhalt:
"""
${pageText || "Kein Text extrahierbar."}
"""

Analysiere nach diesem 5-Schritte-Framework und antworte NUR mit validem JSON ohne Markdown-Backticks:

{
  "overallVerdict": "Motivierender Einstiegssatz mit der wichtigsten Chance (max. 2 Sätze)",
  "adsBudgetWarning": "Wie viel Ads-Budget wird verschwendet? (1-2 Sätze, freundlich)",
  "teaser": [
    "Problem-Hinweis 1 ohne Lösung",
    "Problem-Hinweis 2",
    "Problem-Hinweis 3"
  ],
  "steps": [
    {
      "step": 1, "title": "Friction & Anxiety", "emoji": "🛑", "score": 6, "scoreLabel": "Ausbaufähig",
      "summary": "1-2 Sätze freundliche Zusammenfassung",
      "findings": [
        { "type": "pass", "text": "Was gut ist" },
        { "type": "warn", "text": "Was verbesserungswürdig ist" },
        { "type": "fail", "text": "Was Conversions kostet" }
      ],
      "topAction": "Konkrete sofort umsetzbare Maßnahme"
    },
    {
      "step": 2, "title": "Motivation & Relevanz", "emoji": "🚀", "score": 5, "scoreLabel": "Ausbaufähig",
      "summary": "...",
      "findings": [{ "type": "fail", "text": "..." }, { "type": "warn", "text": "..." }],
      "topAction": "..."
    },
    {
      "step": 3, "title": "Wert kommunizieren", "emoji": "💎", "score": 4, "scoreLabel": "Kritisch",
      "summary": "...",
      "findings": [{ "type": "fail", "text": "..." }, { "type": "warn", "text": "..." }],
      "topAction": "..."
    },
    {
      "step": 4, "title": "Einwände entkräften", "emoji": "🤔", "score": 3, "scoreLabel": "Kritisch",
      "summary": "...",
      "findings": [{ "type": "fail", "text": "..." }],
      "topAction": "..."
    },
    {
      "step": 5, "title": "Incentives & Handlungsdruck", "emoji": "🎁", "score": 4, "scoreLabel": "Ausbaufähig",
      "summary": "...",
      "findings": [{ "type": "fail", "text": "..." }],
      "topAction": "..."
    }
  ],
  "wintergartenSpecific": {
    "hasRegionMention": false,
    "hasPriceTransparency": false,
    "hasProcessExplained": false,
    "hasPermitInfo": false,
    "hasSocialProof": false,
    "comment": "Branchenspezifischer Kommentar (2-3 Sätze freundlich)"
  },
  "heroHeadlineAssessment": "Einschätzung der Headline + konkreter Verbesserungsvorschlag",
  "ctaAssessment": "Einschätzung des CTA + was besser wäre",
  "quickWins": [
    "Quick Win 1: Konkret & sofort umsetzbar",
    "Quick Win 2",
    "Quick Win 3"
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
  if (!apiKey) { res.status(500).json({ error: "GROQ_API_KEY nicht gesetzt in Vercel Environment Variables" }); return; }

  console.log("Groq-Analyse für:", targetUrl);

  try {
    const html     = await fetchHtml(targetUrl);
    const pageText = extractText(html);

    let pagespeedData = null;
    if (req.query?.pagespeed) {
      try { pagespeedData = JSON.parse(decodeURIComponent(req.query.pagespeed)); } catch (e) {}
    }

    const prompt  = buildPrompt(targetUrl, pageText, pagespeedData);
    const groqRes = await httpsPost(
      "api.groq.com",
      "/openai/v1/chat/completions",
      { Authorization: `Bearer ${apiKey}` },
      {
        model: "llama-3.3-70b-versatile",
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          { role: "system", content: "Du bist ein Landing Page Experte. Antworte ausschließlich mit validem JSON, niemals mit Markdown-Backticks oder erklärendem Text." },
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
      throw new Error("JSON konnte nicht geparst werden: " + rawText.slice(0, 200));
    }

    res.status(200).json({ success: true, analysis, model: "llama-3.3-70b-versatile", fetchTime: new Date().toISOString() });

  } catch (err) {
    console.error("Fehler:", err.message);
    res.status(500).json({ error: err.message });
  }
};
