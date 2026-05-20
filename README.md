# Influencer Finder — AI Growth Pipeline

Find 50–200 influencer contacts automatically using ScrapeGraph + Claude AI scoring.

## What it does
1. Runs 5 targeted searches via ScrapeGraph across your niche
2. Deduplicates all profiles automatically  
3. Scores each with Claude AI (1–10 relevance)
4. Shows results in a clean dashboard
5. Exports to CSV for Google Sheets / Airtable

---

## Run locally (2 minutes)

```bash
npm install
node server.js
# Open http://localhost:3000
```

Enter your API keys in the UI — no .env file needed.

---

## Deploy to Railway (get a live link in 5 minutes)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "influencer finder"
gh repo create influencer-finder --public --push
```

### Step 2 — Deploy on Railway
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repo
4. Railway auto-detects Node.js and deploys
5. Click "Generate Domain" → you get a live URL like:
   `https://influencer-finder-production.up.railway.app`

### Step 3 — Share
Send that URL to your team. Everyone enters their own API keys in the UI.
No environment variables needed — keys are passed per-request.

---

## API Keys needed
- **ScrapeGraph**: https://scrapegraphai.com → Dashboard → API Key (free tier available)
- **Claude**: https://console.anthropic.com → API Keys ($5 free credit on signup)

---

## Cost estimate (per run finding 50 contacts)
- ScrapeGraph: ~5 searches × ~$0.01 = **$0.05**
- Claude API: ~3 scoring batches × ~$0.002 = **$0.01**
- **Total per run: ~$0.06**

Running weekly for a team = ~$3/month.

---

## Stack
- Backend: Node.js + Express (zero dependencies beyond express)
- Scraping: ScrapeGraph AI Search API
- Scoring: Claude Sonnet API
- Frontend: Vanilla HTML/CSS/JS
- Hosting: Railway (free tier)
