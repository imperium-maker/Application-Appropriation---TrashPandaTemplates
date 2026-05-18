# Application Appropriation — Netlify/GitHub Build

Deploy flow:

1. GitHub repository connects to Netlify.
2. Netlify publishes from repository root.
3. Netlify function `/api/generate` proxies Gemini requests.
4. Set Netlify environment variable:
   `GEMINI_API_KEY = your fresh Gemini API key`

The browser app does not contain the Gemini API key. The API key is read server-side by `netlify/functions/generate.mjs`.

Release file naming format: `MMDDYYYY_HHMM_gpt_<filename>`.
