# TrashPanda Templates — Application Appropriation

AI-powered job application package generator. Produces tailored resumes, cover letters, keyword addendums, and strategy advice from a user's resume and a target job description.

**Live site:** https://trashpandatech.com

---

## Deployment Stack

```
GitHub (main branch)
    ↓  auto-deploy on every push
Render (Web Service — Node.js)
    ↓  serves app + proxies AI API calls
TrashPandatech.com (custom domain via Namecheap DNS)
```

**DNS records (Namecheap → Render):**
- A Record: `@` → `216.24.57.1`
- CNAME Record: `www` → `trashpanda-templates.onrender.com`

---

## How to Deploy an Update

1. Make changes to any source file in this repo
2. Commit and push to `main`:

```bash
git add .
git commit -m "Description of change"
git push origin main
```

3. Render automatically detects the push, builds, and deploys within 2–3 minutes
4. Changes are live at https://trashpandatech.com

No manual deploy trigger needed. No Netlify. No separate build step.

---

## Project Structure

```
├── index.html          # App UI (single-page application)
├── index_script.js     # All client-side logic: wizard flow, AI calls, document generation, export
├── server.js           # Node.js backend: API proxy, analysis compaction, Gemini call handler
├── package.json        # Node.js dependencies (express, node-fetch, cors)
└── README.md           # This file
```

---

## Environment Variables (set in Render dashboard)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key — set in Render service environment settings |
| `PORT` | Set automatically by Render |

---

## Key Technical Notes

- **Model:** `gemini-2.5-flash` (via server-side proxy — API key never exposed to browser)
- **Analysis compaction:** `server.js` trims resume and job description to high-signal extracts before the analysis call to reduce latency
- **Thinking budget:** `thinkingBudget: 0` disables Gemini extended thinking for faster generation
- **HTML normalization:** `normalizeHTML()` in `index_script.js` strips nested `<html>/<head>/<body>` wrappers from Gemini output before display and export
- **Hallucination guards:** Prompt-level and post-processing guards prevent invented safety claims, certifications, or credentials
- **Deterministic date:** Cover letter date is set at page load from `new Date()` — never from model output

---

## Last Validated

**2026-05-28** — Karl Massey / Jet Aviation end-to-end test: PASS (0 violations)
