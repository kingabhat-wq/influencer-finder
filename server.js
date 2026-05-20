const express = require("express");
const https = require("https");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ── YouTube search for channels ─────────────────────────────────────────────
function ytSearch(query, YT_KEY) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "channel",
      maxResults: 20,
      regionCode: "US",
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
          if (parsed.error) { resolve({ error: parsed.error.message, items: [] }); return; }
          resolve({ items: parsed.items || [] });
        } catch { resolve({ items: [] }); }
      });
    });
    req.on("error", () => resolve({ items: [] }));
    req.end();
  });
}

// ── Get channel details (subscribers, email, description) ───────────────────
function ytChannelDetails(channelIds, YT_KEY) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      part: "snippet,statistics,brandingSettings",
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
          if (parsed.error) { resolve([]); return; }
          resolve(parsed.items || []);
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.end();
  });
}

// ── Extract email from description ─────────────────────────────────────────
function extractEmail(text) {
  if (!text) return "";
  const match = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  return match ? match[0] : "";
}

// ── Format subscriber count ─────────────────────────────────────────────────
function formatSubs(n) {
  const num = parseInt(n || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return Math.round(num / 1000) + "K";
  return String(num);
}

// ── Gemini scoring ──────────────────────────────────────────────────────────
function geminiScore(channels, niche, GEMINI_KEY) {
  return new Promise((resolve) => {
    const prompt = `You are a growth marketer scoring YouTube creators for a ${niche} startup.
Score each profile generously 1-10. Be liberal — give 6+ to any tech, AI, gadget, startup, software, or productivity channel. Reserve low scores (1-4) only for completely unrelated content like cooking or sports. Most tech channels should score 6-8.
Return ONLY a valid JSON array in same order, no markdown:
[{"score": 8, "reason": "one line"}, ...]

Channels:
${channels.map((c, i) => `${i + 1}. ${c.name} | ${c.subscribers} subs | Topics: ${c.bio?.substring(0, 120)}`).join("\n")}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
    });

    const path = `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          const clean = text.replace(/```json|```/g, "").trim();
          resolve(JSON.parse(clean));
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
  const { niche = "AI + Hardware", target = 50, minScore = 4, ytKey, geminiKey } = req.body;

  if (!ytKey || !geminiKey) {
    send("log", { msg: "✗ Missing API keys", level: "warn" });
    return res.end();
  }

  const queries = [
    `${niche} review tech`,
    `${niche} tutorial beginner`,
    `AI gadgets hardware unboxing`,
    `tech startup founder YouTube`,
    `${niche} channel 2024`,
    `AI tools software review`,
    `consumer tech gadgets`,
    `startup technology channel`,
  ];

  send("log", { msg: `🚀 Searching YouTube for ${niche} creators...`, level: "info" });

  const allChannelIds = new Set();
  const channelMap = {};

  for (let i = 0; i < queries.length; i++) {
    send("log", { msg: `🔍 [${i + 1}/${queries.length}] "${queries[i]}"`, level: "info" });
    send("progress", { value: Math.round((i / queries.length) * 35) });

    const result = await ytSearch(queries[i], ytKey);

    if (result.error) {
      send("log", { msg: `✗ YouTube API error: ${result.error}`, level: "warn" });
      send("done", { contacts: [], total: 0 });
      return res.end();
    }

    let added = 0;
    result.items.forEach((item) => {
      const id = item?.snippet?.channelId || item?.id?.channelId;
      if (id && !allChannelIds.has(id)) {
        allChannelIds.add(id);
        channelMap[id] = { name: item.snippet?.channelTitle, id };
        added++;
      }
    });

    send("log", { msg: `  ✓ ${result.items.length} found, ${added} new (total: ${allChannelIds.size})`, level: "ok" });
    await new Promise((r) => setTimeout(r, 300));
  }

  send("log", { msg: `\n📊 Fetching details for ${allChannelIds.size} channels...`, level: "info" });
  send("progress", { value: 40 });

  // Fetch channel details in batches of 50 (YouTube API limit)
  const idArray = [...allChannelIds];
  const allChannels = [];
  for (let i = 0; i < idArray.length; i += 50) {
    const batch = idArray.slice(i, i + 50);
    const details = await ytChannelDetails(batch, ytKey);
    details.forEach((ch) => {
      const subs = parseInt(ch.statistics?.subscriberCount || 0);
      const desc = ch.snippet?.description || "";
      const email = extractEmail(desc) ||
        extractEmail(ch.brandingSettings?.channel?.description || "");

      allChannels.push({
        name: ch.snippet?.title || "",
        id: ch.id,
        subscribers: formatSubs(subs),
        subscriberCount: subs,
        bio: desc.substring(0, 200),
        email: email,
        niche: niche,
        url: `https://youtube.com/channel/${ch.id}`,
        country: ch.snippet?.country || "",
      });
    });
    send("log", { msg: `  ✓ Got details for batch ${Math.floor(i / 50) + 1}`, level: "ok" });
  }

  // Filter by subscriber range
  const filtered = allChannels.filter((c) => c.subscriberCount >= 1000 && c.subscriberCount <= 2000000);
  send("log", { msg: `✓ ${filtered.length} channels in 1K-2M subscriber range`, level: "ok" });
  send("progress", { value: 55 });

  if (filtered.length === 0) {
    send("log", { msg: "⚠️ No channels found in range. Check your YouTube API key.", level: "warn" });
    send("done", { contacts: [], total: 0 });
    return res.end();
  }

  send("log", { msg: `\n🤖 Scoring ${filtered.length} channels with Gemini...`, level: "info" });

  const scored = [];
  const batchSize = 15;
  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);
    const bNum = Math.floor(i / batchSize) + 1;
    const bTotal = Math.ceil(filtered.length / batchSize);
    send("log", { msg: `⚡ Scoring batch ${bNum}/${bTotal}...`, level: "info" });
    const scores = await geminiScore(batch, niche, geminiKey);
    batch.forEach((ch, j) => {
      ch.score = scores[j]?.score || 5;
      ch.reason = scores[j]?.reason || "";
      scored.push(ch);
    });
    send("progress", { value: 55 + Math.round(((i + batchSize) / filtered.length) * 40) });
  }

  const qualified = scored
    .filter((c) => c.score >= minScore && c.email && c.email.includes("@"))
    .sort((a, b) => b.score - a.score)
    .slice(0, target);

  send("progress", { value: 100 });
  const withEmail = qualified.filter((c) => c.email).length;
  send("log", { msg: `\n✅ Done! ${qualified.length} creators with verified emails (from ${all.length} total scraped)`, level: "ok" });
  send("done", { contacts: qualified, total: allChannels.length });
  res.end();
});

// ── CSV export ──────────────────────────────────────────────────────────────
app.post("/api/export", (req, res) => {
  const { contacts } = req.body;
  const headers = ["Name", "Subscribers", "Email", "Niche", "YouTube URL", "Bio", "Score", "Reason", "Status"];
  const rows = contacts.map((c) => [
    `"${c.name || ""}"`,
    `"${c.subscribers || ""}"`,
    `"${c.email || ""}"`,
    `"${c.niche || ""}"`,
    `"${c.url || ""}"`,
    `"${(c.bio || "").replace(/"/g, "'").substring(0, 120)}"`,
    c.score || "",
    `"${(c.reason || "").replace(/"/g, "'")}"`,
    '"New"',
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="youtube-influencers.csv"');
  res.send(csv);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT}`));
