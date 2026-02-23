# ◈ PULSE · Market Intelligence

Real-time market signals, 6-factor scoring, credibility-weighted news. Installable on iPhone and Android as a PWA.

---

## Run locally (2 minutes)

```bash
cd pulse-pwa
npm install
npm run dev
```

Browser opens at `http://localhost:5173` → go to **Setup tab** → paste your API keys → done.

**Free API keys:**
- Finnhub: https://finnhub.io (required)
- Alpha Vantage: https://alphavantage.co (optional)

Keys save to your browser — no .env file needed.

---

## Deploy to GitHub Pages (access from anywhere + install on phone)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "PULSE v1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pulse-pwa.git
git push -u origin main
```

### 2. Add API keys as GitHub Secrets

Repo on GitHub → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `VITE_FINNHUB_KEY` | your Finnhub key |
| `VITE_AV_KEY` | your Alpha Vantage key |

### 3. Enable GitHub Pages

Repo → **Settings → Pages → Source → GitHub Actions**

### 4. Done — auto deploys on every push

Live URL: `https://YOUR_USERNAME.github.io/pulse-pwa/`

First deploy takes ~2 minutes after pushing.

### 5. Install on phone

**Android:** Chrome → ⋮ menu → Add to Home Screen

**iPhone:** Safari → Share → Add to Home Screen

---

## If your repo name is not `pulse-pwa`

Edit line 2 of `vite.config.js`:
```js
const base = process.env.GITHUB_ACTIONS ? '/YOUR-REPO-NAME/' : '/'
```
