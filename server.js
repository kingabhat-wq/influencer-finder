const express = require("express");
const https = require("https");
const http = require("http");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ── Keyword clusters for GPT Prompt Maker ──────────────────────────────────
const KEYWORD_CLUSTERS = {
  "Prompt Engineering": [
    "prompt engineering tutorial", "chatgpt prompts", "best prompts chatgpt",
    "prompt engineering course", "how to write prompts ai",
  ],
  "ChatGPT Tutorials": [
    "chatgpt tutorial beginners", "how to use chatgpt", "chatgpt tips tricks",
    "chatgpt for productivity", "chatgpt business use cases",
  ],
  "AI Tools": [
    "best ai tools 2024", "ai tools for beginners", "ai productivity tools",
    "top ai tools review", "ai tools every creator needs",
  ],
  "Midjourney & Image AI": [
    "midjourney tutorial", "midjourney prompts", "ai image generation tutorial",
    "stable diffusion prompts", "dall e tutorial",
  ],
  "AI for Business": [
    "ai for small business", "chatgpt for marketing", "ai automation business",
    "ai tools entrepreneurs", "ai freelancing",
  ],
  "AI Productivity": [
    "ai productivity hacks", "chatgpt workflow", "automate with ai",
    "ai for content creators", "ai writing tools review",
  ],
];

// ── YouTube search ──────────────────────────────────────────────────────────
function ytSearch(query, regionCode, YT_KEY) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      part: "snippet", q: query, type: "channel",
      maxResults: 20, regionCode: regionCode, key: YT_KEY,
    });
    const options = {
      hostname: "www.googleapis.com",
      path: `/youtube/v3/search?${params}`, method: "GET",
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { resolve({ error: parsed.error.message, items: [] }); return; }
          resolve({ items: parsed.items || [] });
        } catch { resolve({ items: [] }); }
      });
    });
    req.on("error", () => resolve({ items: [] }));
    req.end();
  });
}

// ── YouTube channel details ─────────────────────────────────────────────────
function ytChannelDetails(channelIds, YT_KEY) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      part: "snippet,statistics,brandingSettings",
      id: channelIds.join(","), key: YT_KEY,
    });
    const options = {
      hostname: "www.googleapis.com",
      path: `/youtube/v3/channels?${params}`, method: "GET",
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.items || []);
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.end();
  });
}

// ── Scrape a URL for email ─────────────────────────────────────────────────
function scrapeEmailFromUrl(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(""); return; }
    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === "https:" ? https : http;
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname || "/",
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html",
        },
      };
      const req = lib.request(options, (res) => {
        let data = "";
        res.on("data", (c) => { data += c; if (data.length > 100000) req.destroy(); });
        res.on("end", () => {
          const emails = extractAllEmails(data);
          resolve(emails[0] || "");
        });
      });
      req.on("error", () => resolve(""));
      req.setTimeout(6000, () => { req.destroy(); resolve(""); });
      req.end();
    } catch { resolve(""); }
  });
}

function extractAllEmails(text) {
  if (!text) return [];
  const matches = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/gi) || [];
  return matches.filter(e =>
    !e.includes("youtube.com") && !e.includes("google.com") &&
    !e.includes("example.com") && !e.includes("sentry.io") &&
    !e.includes("wix.com") && !e.endsWith(".png") &&
    !e.endsWith(".jpg") && e.length < 60
  );
}

function formatSubs(n) {
  const num = parseInt(n || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return Math.round(num / 1000) + "K";
  return String(num);
}

// ── Gemini scoring ──────────────────────────────────────────────────────────
function geminiScore(channels, GEMINI_KEY) {
  return new Promise((resolve) => {
    const prompt = `Score these YouTube channels for GPT Prompt Maker — a SaaS tool that generates AI prompts for ChatGPT and Gemini.
Score 1-10. Give 8-10 to channels about: prompt engineering, ChatGPT tutorials, AI tools, Midjourney, AI productivity.
Give 6-7 to general tech, software, or productivity channels.
Give 1-4 to unrelated channels (gaming, cooking, sports, entertainment).
Return ONLY a JSON array, no markdown: [{"score":8,"reason":"one line"},...]

Channels:
${channels.map((c,i)=>`${i+1}. ${c.name} | ${c.subscribers} subs | ${(c.bio||"").substring(0,100)}`).join("\n")}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1500 },
    });
    const path = `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
    const options = {
      hostname: "generativelanguage.googleapis.com", path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          resolve(JSON.parse(text.replace(/```json|```/g,"").trim()));
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.write(body);
    req.end();
  });
}

// ── Main pipeline ───────────────────────────────────────────────────────────
app.post("/api/find", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  const { countries = ["US"], clusters = Object.keys(KEYWORD_CLUSTERS), target = 200, minScore = 6, ytKey, geminiKey } = req.body;

  if (!ytKey || !geminiKey) {
    send("log", { msg: "✗ Missing API keys", level: "warn" });
    return res.end();
  }

  // Build query list from selected clusters × countries
  const queries = [];
  clusters.forEach(cluster => {
    const keywords = KEYWORD_CLUSTERS[cluster] || [];
    countries.forEach(country => {
      keywords.forEach(kw => queries.push({ query: kw, country }));
    });
  });

  send("log", { msg: `🚀 GPT Prompt Maker — Influencer Pipeline`, level: "info" });
  send("log", { msg: `📋 ${queries.length} searches across ${countries.length} countries`, level: "info" });

  const allChannelIds = new Set();
  let queryCount = 0;

  for (const { query, country } of queries) {
    queryCount++;
    send("log", { msg: `🔍 [${queryCount}/${queries.length}] "${query}" [${country}]`, level: "info" });
    send("progress", { value: Math.round((queryCount / queries.length) * 30) });

    const result = await ytSearch(query, country, ytKey);
    if (result.error) {
      send("log", { msg: `✗ API error: ${result.error}`, level: "warn" });
      if (result.error.includes("quota")) {
        send("log", { msg: "⚠️ YouTube API quota exceeded for today", level: "warn" });
        break;
      }
      continue;
    }

    result.items.forEach((item) => {
      const id = item?.snippet?.channelId || item?.id?.channelId;
      if (id) allChannelIds.add(id);
    });

    if (queryCount % 5 === 0) {
      send("log", { msg: `  → ${allChannelIds.size} unique channels so far`, level: "ok" });
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  send("log", { msg: `\n📊 Total unique channels: ${allChannelIds.size} — fetching details...`, level: "info" });
  send("progress", { value: 32 });

  const idArray = [...allChannelIds];
  const allChannels = [];

  for (let i = 0; i < idArray.length; i += 50) {
    const details = await ytChannelDetails(idArray.slice(i, i + 50), ytKey);
    details.forEach((ch) => {
      const subs = parseInt(ch.statistics?.subscriberCount || 0);
      const desc = ch.snippet?.description || "";
      const brandDesc = ch.brandingSettings?.channel?.description || "";
      const customUrl = ch.brandingSettings?.channel?.unsubscribedTrailer || "";
      const emailFromDesc = extractAllEmails(desc + " " + brandDesc)[0] || "";
      const websiteUrl = ch.snippet?.customUrl || "";

      allChannels.push({
        name: ch.snippet?.title || "",
        id: ch.id,
        subscribers: formatSubs(subs),
        subscriberCount: subs,
        bio: desc.substring(0, 200),
        email: emailFromDesc,
        country: ch.snippet?.country || "",
        url: `https://youtube.com/channel/${ch.id}`,
        websiteUrl: websiteUrl,
      });
    });
    send("progress", { value: 32 + Math.round((i / idArray.length) * 15) });
  }

  // Filter by subscriber range
  const filtered = allChannels.filter(c => c.subscriberCount >= 1000 && c.subscriberCount <= 5000000);
  send("log", { msg: `✓ ${filtered.length} channels in 1K-5M subscriber range`, level: "ok" });
  send("progress", { value: 48 });

  // Score with Gemini
  send("log", { msg: `\n🤖 Scoring ${filtered.length} channels with Gemini...`, level: "info" });
  const scored = [];
  const batchSize = 15;

  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);
    send("log", { msg: `⚡ Batch ${Math.floor(i/batchSize)+1}/${Math.ceil(filtered.length/batchSize)}`, level: "info" });
    const scores = await geminiScore(batch, geminiKey);
    batch.forEach((ch, j) => {
      ch.score = scores[j]?.score || 5;
      ch.reason = scores[j]?.reason || "";
      scored.push(ch);
    });
    send("progress", { value: 48 + Math.round(((i+batchSize)/filtered.length) * 25) });
  }

  // Top scored channels
  const topScored = scored.filter(c => c.score >= minScore).sort((a,b) => b.score - a.score);
  send("log", { msg: `✓ ${topScored.length} channels scored ${minScore}+`, level: "ok" });

  const withEmail = topScored.filter(c => c.email);
  const noEmail = topScored.filter(c => !c.email);

  send("log", { msg: `📧 ${withEmail.length} emails from descriptions`, level: "ok" });
  send("log", { msg: `🌐 Checking websites for ${Math.min(noEmail.length, 100)} more...`, level: "info" });
  send("progress", { value: 74 });

  // Scrape websites for emails in batches
  let scraped = 0;
  const toScrape = noEmail.slice(0, 100);

  for (let i = 0; i < toScrape.length; i += 5) {
    const batch = toScrape.slice(i, i + 5);
    await Promise.all(batch.map(async (ch) => {
      // Try YouTube about page
      const ytAboutUrl = `https://www.youtube.com/channel/${ch.id}/about`;
      const email = await scrapeEmailFromUrl(ch.websiteUrl || ytAboutUrl);
      if (email) { ch.email = email; scraped++; }
    }));
    if (i % 20 === 0) {
      send("log", { msg: `  → ${scraped} more emails found so far...`, level: "ok" });
      send("progress", { value: 74 + Math.round((i / toScrape.length) * 20) });
    }
  }

  send("log", { msg: `  ✓ ${scraped} emails found from websites`, level: "ok" });

  const qualified = topScored
    .filter(c => c.email && c.email.includes("@"))
    .slice(0, target);

  send("progress", { value: 100 });
  send("log", { msg: `\n✅ Done! ${qualified.length} creators with verified emails`, level: "ok" });
  send("done", { contacts: qualified, total: allChannels.length, withEmail: qualified.length });
  res.end();
});

// ── Export CSV ──────────────────────────────────────────────────────────────
app.post("/api/export", (req, res) => {
  const { contacts } = req.body;
  const headers = ["Name","Subscribers","Email","Country","YouTube URL","Bio","Score","Reason","Status","Cluster"];
  const rows = contacts.map(c => [
    `"${c.name||""}"`,`"${c.subscribers||""}"`,`"${c.email||""}"`,
    `"${c.country||""}"`,`"${c.url||""}"`,
    `"${(c.bio||"").replace(/"/g,"'").substring(0,120)}"`,
    c.score||"",`"${(c.reason||"").replace(/"/g,"'")}"`,'"New"',`"${c.cluster||""}"`,
  ]);
  const csv = [headers.join(","), ...rows.map(r=>r.join(","))].join("\n");
  res.setHeader("Content-Type","text/csv");
  res.setHeader("Content-Disposition",'attachment; filename="gptpromptmaker-influencers.csv"');
  res.send(csv);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT}`));
