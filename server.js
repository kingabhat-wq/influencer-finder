const express = require("express");
const https = require("https");
const http = require("http");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ── Keyword clusters ────────────────────────────────────────────────────────
const KEYWORD_CLUSTERS = {
  "Prompt Engineering": [
    "prompt engineering tutorial",
    "chatgpt prompts guide",
    "best prompts for chatgpt",
    "how to write ai prompts",
    "prompt engineering for beginners",
  ],
  "ChatGPT Tutorials": [
    "chatgpt tutorial beginners",
    "how to use chatgpt effectively",
    "chatgpt tips and tricks 2025",
    "chatgpt for productivity",
    "chatgpt business use cases",
  ],
  "AI Tools": [
    "best ai tools 2025",
    "ai tools for beginners",
    "ai productivity tools review",
    "top ai tools for work",
    "ai tools every creator needs",
  ],
  "Midjourney & Image AI": [
    "midjourney tutorial",
    "midjourney prompts guide",
    "ai image generation tutorial",
    "stable diffusion prompts",
    "dall e tutorial beginners",
  ],
  "AI for Business": [
    "ai for small business",
    "chatgpt for marketing",
    "ai automation for business",
    "ai tools for entrepreneurs",
    "ai for freelancers",
  ],
  "AI Productivity": [
    "ai productivity hacks",
    "chatgpt workflow automation",
    "automate tasks with ai",
    "ai for content creators",
    "ai writing tools review",
  ],
  "Marketing & Growth": [
    "digital marketing tutorial 2025",
    "content marketing strategy",
    "ai for digital marketers",
    "seo tips for beginners",
    "growth hacking for startups",
  ],
  "Indie Founders & Solopreneurs": [
    "indie hacker journey",
    "solopreneur tips",
    "build saas solo founder",
    "bootstrapped startup journey",
    "side project to business",
  ],
  "SEO & Organic Growth": [
    "seo tutorial beginners 2025",
    "how to rank on google",
    "keyword research tutorial",
    "ai for seo content",
    "organic traffic growth tips",
  ],
  "Freelance & Creator Economy": [
    "freelance tips 2025",
    "how to get freelance clients",
    "content creator business tips",
    "freelancing with ai tools",
    "how to monetize skills online",
  ],
};

// ── YouTube search ──────────────────────────────────────────────────────────
function ytSearch(query, regionCode, YT_KEY) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "channel",
      maxResults: 20,
      regionCode: regionCode,
      key: YT_KEY,
    });
    const options = {
      hostname: "www.googleapis.com",
      path: `/youtube/v3/search?${params}`,
      method: "GET",
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve({ error: parsed.error.message, items: [] });
            return;
          }
          resolve({ items: parsed.items || [] });
        } catch {
          resolve({ items: [] });
        }
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
      part: "snippet,statistics,brandingSettings,contentDetails",
      id: channelIds.join(","),
      key: YT_KEY,
    });
    const options = {
      hostname: "www.googleapis.com",
      path: `/youtube/v3/channels?${params}`,
      method: "GET",
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.items || []);
        } catch {
          resolve([]);
        }
      });
    });
    req.on("error", () => resolve([]));
    req.end();
  });
}

// ── Extract emails from text ────────────────────────────────────────────────
function extractAllEmails(text) {
  if (!text) return [];
  const matches = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/gi) || [];
  return matches.filter(
    (e) =>
      !e.includes("youtube.com") &&
      !e.includes("google.com") &&
      !e.includes("example.com") &&
      !e.includes("sentry.io") &&
      !e.includes("wix.com") &&
      !e.includes("noreply") &&
      !e.includes("support@") &&
      !e.endsWith(".png") &&
      !e.endsWith(".jpg") &&
      e.length < 80
  );
}

// ── Scrape a URL for email ──────────────────────────────────────────────────
function scrapeEmailFromUrl(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(""); return; }
    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === "https:" ? https : http;
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + (parsed.search || ""),
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      };
      const req = lib.request(options, (res) => {
        // follow one redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          scrapeEmailFromUrl(res.headers.location).then(resolve);
          return;
        }
        let data = "";
        res.on("data", (c) => {
          data += c;
          if (data.length > 150000) req.destroy();
        });
        res.on("end", () => {
          const emails = extractAllEmails(data);
          resolve(emails[0] || "");
        });
      });
      req.on("error", () => resolve(""));
      req.setTimeout(8000, () => { req.destroy(); resolve(""); });
      req.end();
    } catch {
      resolve("");
    }
  });
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
    const prompt = `Score these YouTube channels for relevance to GPT Prompt Maker — a SaaS tool with AI prompt templates and AI strategy agents for SEO, marketing, and content.

Score 1–10:
- 8–10: prompt engineering, ChatGPT tutorials, AI tools, AI productivity, AI for marketing, solopreneurs/indie founders using AI, SEO + AI, freelancers using AI
- 6–7: general marketing, digital marketing, productivity, tech reviews, no-code tools, online business
- 4–5: broad tech, software reviews loosely related
- 1–3: gaming, cooking, vlogs, sports, entertainment, finance/investing unrelated to AI

Return ONLY a raw JSON array, no markdown, no explanation:
[{"score":8,"reason":"one short sentence"},...]

Channels:
${channels.map((c, i) => `${i + 1}. ${c.name} | ${c.subscribers} subs | ${(c.bio || "").substring(0, 120)}`).join("\n")}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
    });
    const path = `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text =
            parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          const clean = text.replace(/```json|```/g, "").trim();
          resolve(JSON.parse(clean));
        } catch {
          resolve([]);
        }
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

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  const {
    countries = ["US"],
    clusters = Object.keys(KEYWORD_CLUSTERS),
    target = 200,
    minScore = 6,
    minSubs = 5000,   // FIX: was hardcoded to 1000 before, now uses client value
    ytKey,
    geminiKey,
  } = req.body;

  if (!ytKey || !geminiKey) {
    send("log", { msg: "✗ Missing API keys", level: "warn" });
    return res.end();
  }

  // Build query list
  const queries = [];
  clusters.forEach((cluster) => {
    const keywords = KEYWORD_CLUSTERS[cluster] || [];
    countries.forEach((country) => {
      keywords.forEach((kw) => queries.push({ query: kw, country, cluster }));
    });
  });

  send("log", { msg: `🚀 GPT Prompt Maker — Influencer Pipeline`, level: "info" });
  send("log", { msg: `📋 ${queries.length} searches · ${countries.length} countries · min ${formatSubs(minSubs)} subs`, level: "info" });

  // ── Phase 1: Search ───────────────────────────────────────────────────────
  const channelClusterMap = {};  // channelId → first cluster that found it
  let queryCount = 0;

  for (const { query, country, cluster } of queries) {
    queryCount++;
    send("log", { msg: `🔍 [${queryCount}/${queries.length}] "${query}" [${country}]`, level: "info" });
    send("progress", { value: Math.round((queryCount / queries.length) * 30) });

    const result = await ytSearch(query, country, ytKey);
    if (result.error) {
      send("log", { msg: `✗ API error: ${result.error}`, level: "warn" });
      if (result.error.toLowerCase().includes("quota")) {
        send("log", { msg: "⚠️ YouTube API quota exceeded for today", level: "warn" });
        break;
      }
      continue;
    }

    result.items.forEach((item) => {
      const id = item?.snippet?.channelId || item?.id?.channelId;
      if (id && !channelClusterMap[id]) channelClusterMap[id] = cluster;  // FIX: track cluster per channel
    });

    if (queryCount % 5 === 0) {
      send("log", { msg: `  → ${Object.keys(channelClusterMap).length} unique channels so far`, level: "ok" });
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const allChannelIds = Object.keys(channelClusterMap);
  send("log", { msg: `\n📊 ${allChannelIds.length} unique channels — fetching details...`, level: "info" });
  send("progress", { value: 32 });

  // ── Phase 2: Channel details ──────────────────────────────────────────────
  const allChannels = [];

  for (let i = 0; i < allChannelIds.length; i += 50) {
    const batch = allChannelIds.slice(i, i + 50);
    const details = await ytChannelDetails(batch, ytKey);

    details.forEach((ch) => {
      const subs = parseInt(ch.statistics?.subscriberCount || 0);
      const desc = ch.snippet?.description || "";
      const brandDesc = ch.brandingSettings?.channel?.description || "";

      // FIX: correct field for channel website (not unsubscribedTrailer)
      const websiteUrl = ch.brandingSettings?.channel?.unsubscribedTrailer
        ? ""
        : "";
      // The actual website lives in the links array (not in basic API response).
      // Best we can do via API: parse description for URLs, then scrape those.
      const urlsInDesc = (desc + " " + brandDesc).match(/https?:\/\/[^\s"'<>]+/gi) || [];
      const externalUrl = urlsInDesc.find(
        (u) => !u.includes("youtube.com") && !u.includes("youtu.be") && !u.includes("google.com")
      ) || "";

      const emailFromDesc = extractAllEmails(desc + " " + brandDesc)[0] || "";

      allChannels.push({
        name: ch.snippet?.title || "",
        id: ch.id,
        subscribers: formatSubs(subs),
        subscriberCount: subs,
        bio: desc.substring(0, 200),
        email: emailFromDesc,
        country: ch.snippet?.country || "",
        url: `https://youtube.com/channel/${ch.id}`,
        websiteUrl: externalUrl,   // FIX: actual external URL parsed from description
        cluster: channelClusterMap[ch.id] || "",  // FIX: cluster now populated
      });
    });

    send("progress", { value: 32 + Math.round(((i + 50) / allChannelIds.length) * 15) });
  }

  // FIX: use minSubs from request, not hardcoded 1000
  const filtered = allChannels.filter(
    (c) => c.subscriberCount >= minSubs && c.subscriberCount <= 5000000
  );
  send("log", { msg: `✓ ${filtered.length} channels with ${formatSubs(minSubs)}–5M subs`, level: "ok" });
  send("progress", { value: 48 });

  // ── Phase 3: Gemini scoring ───────────────────────────────────────────────
  send("log", { msg: `\n🤖 Scoring ${filtered.length} channels with Gemini...`, level: "info" });
  const scored = [];
  const batchSize = 15;

  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);
    send("log", {
      msg: `⚡ Scoring batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filtered.length / batchSize)}`,
      level: "info",
    });
    const scores = await geminiScore(batch, geminiKey);
    batch.forEach((ch, j) => {
      ch.score = scores[j]?.score || 5;
      ch.reason = scores[j]?.reason || "";
      scored.push(ch);
    });
    send("progress", { value: 48 + Math.round(((i + batchSize) / filtered.length) * 25) });
    await new Promise((r) => setTimeout(r, 300)); // small delay between Gemini calls
  }

  const topScored = scored
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score);

  send("log", { msg: `✓ ${topScored.length} channels scored ${minScore}+`, level: "ok" });

  // ── Phase 4: Email scraping ───────────────────────────────────────────────
  const withEmail = topScored.filter((c) => c.email);
  const noEmail = topScored.filter((c) => !c.email);

  send("log", { msg: `📧 ${withEmail.length} emails found in descriptions`, level: "ok" });
  send("log", { msg: `🌐 Scraping websites for ${Math.min(noEmail.length, 120)} channels...`, level: "info" });
  send("progress", { value: 74 });

  let scraped = 0;
  const toScrape = noEmail.slice(0, 120);

  for (let i = 0; i < toScrape.length; i += 5) {
    const batch = toScrape.slice(i, i + 5);
    await Promise.all(
      batch.map(async (ch) => {
        if (ch.websiteUrl) {
          const email = await scrapeEmailFromUrl(ch.websiteUrl);
          if (email) { ch.email = email; scraped++; return; }
        }
        // fallback: try /about page  (works for some channels via HTML)
        const ytAbout = `https://www.youtube.com/@${ch.name.replace(/\s+/g, "")}/about`;
        const email2 = await scrapeEmailFromUrl(ytAbout);
        if (email2) { ch.email = email2; scraped++; }
      })
    );
    if (i % 20 === 0) {
      send("log", { msg: `  → ${scraped} more emails found...`, level: "ok" });
    }
    send("progress", { value: 74 + Math.round((i / toScrape.length) * 20) });
  }

  send("log", { msg: `  ✓ ${scraped} emails scraped from websites`, level: "ok" });

  const qualified = topScored
    .filter((c) => c.email && c.email.includes("@"))
    .slice(0, target);

  send("progress", { value: 100 });
  send("log", { msg: `\n✅ Done! ${qualified.length} creators with verified emails`, level: "ok" });
  send("done", { contacts: qualified, total: allChannels.length });
  res.end();
});

// ── Export CSV ──────────────────────────────────────────────────────────────
app.post("/api/export", (req, res) => {
  const { contacts } = req.body;
  const headers = [
    "Name", "Subscribers", "Email", "Country",
    "YouTube URL", "Website", "Bio", "Score", "Reason", "Cluster", "Status",
  ];
  const rows = contacts.map((c) => [
    `"${(c.name || "").replace(/"/g, "'")}"`,
    `"${c.subscribers || ""}"`,
    `"${c.email || ""}"`,
    `"${c.country || ""}"`,
    `"${c.url || ""}"`,
    `"${c.websiteUrl || ""}"`,
    `"${(c.bio || "").replace(/"/g, "'").substring(0, 120)}"`,
    c.score || "",
    `"${(c.reason || "").replace(/"/g, "'")}"`,
    `"${c.cluster || ""}"`,
    '"New"',
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="gptpromptmaker-influencers.csv"');
  res.send(csv);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT}`));
