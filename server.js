const express = require("express");
const https = require("https");

const app = express();
app.use(express.json());
app.use(express.static("public"));

function sgSearch(query, SGAI_KEY) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      user_prompt: query,
      num_results: 10,
      country_search: "us",
      prompt: "Extract influencer profiles: full name, Twitter/X handle (with @), estimated follower count, bio description, niche category (ai/hardware/tech/startup/creator), and contact email if visible.",
      output_schema: {
        type: "object",
        properties: {
          influencers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                handle: { type: "string" },
                followers: { type: "string" },
                bio: { type: "string" },
                niche: { type: "string" },
                email: { type: "string" },
              },
            },
          },
        },
      },
    });

    const options = {
      hostname: "api.scrapegraphai.com",
      path: "/v1/search",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        SGAI_APIKEY: SGAI_KEY,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const list = parsed?.result?.influencers || parsed?.influencers || parsed?.result || [];
          resolve(Array.isArray(list) ? list : []);
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.write(body);
    req.end();
  });
}

function geminiScore(influencers, niche, GEMINI_KEY) {
  return new Promise((resolve) => {
    const prompt = `You are a growth marketer scoring influencers for a ${niche} startup.
Score each profile 1-10 for relevance. Consider: bio keywords, follower range (5K-500K ideal), niche fit.
Return ONLY a valid JSON array in the same order, no markdown, no explanation:
[{"score": 8, "reason": "one line reason"}, ...]

Profiles:
${influencers.map((inf, i) => `${i + 1}. ${inf.name} | ${inf.handle} | ${inf.followers} | Bio: ${inf.bio}`).join("\n")}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
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

app.post("/api/find", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  const { niche = "AI + Hardware", target = 50, minScore = 6, sgKey, geminiKey } = req.body;

  if (!sgKey || !geminiKey) {
    send("log", { msg: "✗ Missing API keys", level: "warn" });
    return res.end();
  }

  const queries = [
    `top ${niche} influencers Twitter X followers bio`,
    `${niche} startup founders creators Twitter large following`,
    `${niche} YouTube tech reviewers contact email business`,
    `${niche} newsletter writers thought leaders Twitter`,
    `US tech influencers ${niche} early adopters contact`,
  ];

  send("log", { msg: `🚀 Pipeline started — target: ${target} contacts`, level: "info" });

  const all = [];
  const seen = new Set();

  for (let i = 0; i < queries.length; i++) {
    send("log", { msg: `🔍 [${i + 1}/${queries.length}] ${queries[i].substring(0, 55)}...`, level: "info" });
    send("progress", { value: Math.round((i / queries.length) * 45) });

    const results = await sgSearch(queries[i], sgKey);
    let added = 0;
    results.forEach((inf) => {
      const key = (inf.handle || inf.name || "").toLowerCase().trim();
      if (key && !seen.has(key) && inf.name) { seen.add(key); all.push(inf); added++; }
    });

    send("log", { msg: `  ✓ ${results.length} found, ${added} new (total: ${all.length})`, level: "ok" });
    if (i < queries.length - 1) await new Promise((r) => setTimeout(r, 1500));
  }

  send("log", { msg: `\n🤖 Scoring ${all.length} profiles with Gemini...`, level: "info" });
  send("progress", { value: 50 });

  const scored = [];
  const batchSize = 15;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    const bNum = Math.floor(i / batchSize) + 1;
    const bTotal = Math.ceil(all.length / batchSize);
    send("log", { msg: `⚡ Scoring batch ${bNum}/${bTotal}...`, level: "info" });
    const scores = await geminiScore(batch, niche, geminiKey);
    batch.forEach((inf, j) => {
      inf.score = scores[j]?.score || 5;
      inf.reason = scores[j]?.reason || "";
      scored.push(inf);
    });
    send("progress", { value: 50 + Math.round(((i + batchSize) / all.length) * 45) });
  }

  const qualified = scored
    .filter((i) => i.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, target);

  send("progress", { value: 100 });
  send("log", { msg: `\n✅ Done! ${qualified.length} qualified contacts out of ${all.length} scraped`, level: "ok" });
  send("done", { contacts: qualified, total: all.length });
  res.end();
});

app.post("/api/export", (req, res) => {
  const { contacts } = req.body;
  const headers = ["Name", "Handle", "Followers", "Niche", "Bio", "Email", "Score", "Reason", "Status"];
  const rows = contacts.map((c) => [
    `"${c.name || ""}"`, `"${c.handle || ""}"`, `"${c.followers || ""}"`, `"${c.niche || ""}"`,
    `"${(c.bio || "").replace(/"/g, "'").substring(0, 120)}"`, `"${c.email || ""}"`,
    c.score || "", `"${(c.reason || "").replace(/"/g, "'")}"`, '"New"',
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="influencers.csv"');
  res.send(csv);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT}`));
