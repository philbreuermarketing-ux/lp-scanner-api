// api/scan.js — Vercel Serverless Function
// Wird automatisch erreichbar unter: https://dein-projekt.vercel.app/api/scan?url=...

const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Parse error: " + data.slice(0, 200))); }
      });
    }).on("error", reject);
  });
}

async function fetchPageSpeed(targetUrl, strategy = "mobile") {
  const apiUrl =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(targetUrl)}` +
    `&strategy=${strategy}` +
    `&category=performance&category=seo&category=best-practices&category=accessibility&key=AIzaSyAgUSr_iH7pCADEVGtktcAtY_BHc7vEH4g`;

  const data = await httpsGet(apiUrl);
  if (data.error) throw new Error(data.error.message || "PageSpeed API Fehler");

  const cats   = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};

  const perf   = Math.round((cats.performance?.score        || 0) * 100);
  const seo    = Math.round((cats.seo?.score                || 0) * 100);
  const access = Math.round((cats.accessibility?.score      || 0) * 100);
  const best   = Math.round((cats["best-practices"]?.score  || 0) * 100);

  const rawLcp = audits["largest-contentful-paint"]?.numericValue || 0;
  const rawCls = audits["cumulative-layout-shift"]?.numericValue  || 0;
  const rawFid = audits["total-blocking-time"]?.numericValue      || 0;

  const oppIds = [
    "render-blocking-resources","uses-optimized-images","uses-webp-images",
    "unused-javascript","unused-css-rules","uses-text-compression",
  ];
  const opportunities = oppIds
    .map(id => audits[id])
    .filter(a => a && a.score !== null && a.score < 1)
    .map(a => ({ title: a.title, savings: a.displayValue || "", score: a.score }))
    .slice(0, 5);

  return {
    strategy,
    scores: { performance: perf, seo, accessibility: access, bestPractices: best },
    vitals: {
      lcp: audits["largest-contentful-paint"]?.displayValue || "–",
      cls: audits["cumulative-layout-shift"]?.displayValue  || "–",
      fid: audits["total-blocking-time"]?.displayValue      || "–",
      fcp: audits["first-contentful-paint"]?.displayValue   || "–",
      si:  audits["speed-index"]?.displayValue              || "–",
      tti: audits["interactive"]?.displayValue              || "–",
    },
    rawVitals: { lcpMs: rawLcp, clsVal: rawCls, fidMs: rawFid },
    mobile: {
      viewport:     audits["viewport"]?.score      === 1,
      tapTargets:   audits["tap-targets"]?.score   === 1,
      fontSize:     audits["font-size"]?.score     === 1,
      contentWidth: audits["content-width"]?.score === 1,
    },
    seo: {
      hasTitle:    audits["document-title"]?.score  === 1,
      hasMetaDesc: audits["meta-description"]?.score === 1,
      crawlable:   audits["is-crawlable"]?.score    === 1,
    },
    conversion: {
      imageAlts:   audits["image-alt"]?.score === 1,
      linksDescr:  audits["link-name"]?.score === 1,
    },
    opportunities,
  };
}

function estimateQualityScore(mobile) {
  let score = 5;
  const perf = mobile.scores.performance;
  if (perf >= 90) score += 2;
  else if (perf >= 70) score += 1;
  else if (perf < 50) score -= 2;
  if (mobile.mobile.viewport && mobile.mobile.tapTargets) score += 1;
  if (mobile.scores.seo >= 90) score += 1;
  if (mobile.rawVitals.lcpMs < 2500) score += 1;
  else if (mobile.rawVitals.lcpMs > 4000) score -= 1;
  return Math.max(1, Math.min(10, score));
}

function calcOverallScore(mobile, desktop) {
  const perfAvg   = (mobile.scores.performance + desktop.scores.performance) / 2;
  const mobileChk = [mobile.mobile.viewport, mobile.mobile.tapTargets, mobile.mobile.fontSize].filter(Boolean).length;
  const mobileScr = mobileChk * 10 + 60;
  return Math.round(perfAvg * 0.45 + mobile.scores.seo * 0.25 + mobileScr * 0.3);
}

// ── Vercel Handler ────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS — erlaubt Anfragen von deiner WordPress-Domain
  // Trage hier deine echte Domain ein, z.B. "https://deine-domain.de"
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const targetUrl = req.query?.url;
  if (!targetUrl) {
    res.status(400).json({ error: "Parameter 'url' fehlt" });
    return;
  }

  console.log("Scanning:", targetUrl);

  try {
    const [mobile, desktop] = await Promise.all([
      fetchPageSpeed(targetUrl, "mobile"),
      fetchPageSpeed(targetUrl, "desktop"),
    ]);

    res.status(200).json({
      url:           targetUrl,
      overallScore:  calcOverallScore(mobile, desktop),
      qualityScore:  estimateQualityScore(mobile),
      mobile,
      desktop,
      fetchTime:     new Date().toISOString(),
    });
  } catch (err) {
    console.error("Scan error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
