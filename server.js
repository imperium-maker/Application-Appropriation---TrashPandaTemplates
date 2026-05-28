import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ── Compaction logic (ported from Netlify generate.mjs) ──────────────────────

const ANALYSIS_SECTION_LIMITS = {
  Resume: 3000,
  'Job Description': 2600,
  'Key Highlights': 1200,
  'Career Context': 1000,
  'Constraints / Extras': 900,
  '--- LIVE MARKET RESEARCH (web-grounded - use to inform your analysis) ---': 1800,
  '--- LIVE MARKET RESEARCH (web-grounded — use to inform your analysis) ---': 1800,
};

function truncateText(value, maxChars) {
  const text = String(value || '').trim();
  if (!maxChars || text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.65);
  const tail = maxChars - head;
  return `${text.slice(0, head).trim()}\n\n[...trimmed for analysis request; full original text remains preserved in browser state and ZIP audit export...]\n\n${text.slice(-tail).trim()}`;
}

function splitPromptSections(prompt) {
  const text = String(prompt || '');
  const labels = [
    'Applicant Name',
    'Target Role',
    'Role Policy',
    'Resume',
    'Resume Edits',
    'Key Highlights',
    'Career Context',
    'Job Description',
    'Constraints / Extras',
    '--- LIVE MARKET RESEARCH (web-grounded - use to inform your analysis) ---',
    '--- LIVE MARKET RESEARCH (web-grounded — use to inform your analysis) ---',
  ];
  const escaped = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const markerRe = new RegExp(`(^|\\n\\n)(${escaped.join('|')}):?\\n`, 'g');
  const matches = [...text.matchAll(markerRe)];
  if (!matches.length) return null;
  return matches.map((match, index) => {
    const label = match[2];
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return { label, value: text.slice(start, end).trim() };
  });
}

function summarizeResume(text) {
  const source = String(text || '').trim();
  const lines = source.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const important = lines.filter(line =>
    /cert|rating|license|medical|flight|hour|pic|sic|type|atp|faa|part\s?91|part\s?135|captain|pilot|present|experience|education|degree|clearance|passport|relocat|available|training|safety|leadership|managed|reduced|increased|saved|implemented|operated|international|pacific|gulfstream|g[- ]?200|g[- ]?650|ce[- ]?525/i.test(line)
  );
  const selected = important.length ? important : lines;
  return truncateText(selected.slice(0, 80).join('\n'), ANALYSIS_SECTION_LIMITS.Resume);
}

function summarizeJobDescription(text) {
  const source = String(text || '').trim();
  const lines = source.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const important = lines.filter(line =>
    /require|qualification|must|preferred|responsib|dut|experience|certificate|license|medical|degree|travel|international|safety|crm|leadership|customer|client|salary|compensation|location|remote|hybrid|onsite|captain|pilot|gulfstream|part\s?91|part\s?135|worldwide/i.test(line)
  );
  const selected = important.length ? important : lines;
  return truncateText(selected.slice(0, 90).join('\n'), ANALYSIS_SECTION_LIMITS['Job Description']);
}

function compactAnalysisPrompt(prompt) {
  const sections = splitPromptSections(prompt);
  if (!sections) return truncateText(prompt, 9000);
  const compacted = sections.map(({ label, value }) => {
    let nextValue = value;
    if (label === 'Resume') nextValue = summarizeResume(value);
    else if (label === 'Job Description') nextValue = summarizeJobDescription(value);
    else if (ANALYSIS_SECTION_LIMITS[label]) nextValue = truncateText(value, ANALYSIS_SECTION_LIMITS[label]);
    return `${label}:\n${nextValue || '[None supplied]'}`;
  });
  compacted.push('Analysis compaction note:\nThis first-pass analysis request uses a bounded, high-signal extract to avoid timeouts. Do not treat omitted text as absent; ask targeted follow-up questions or mark Needs Verification if a claim is not present in this analysis packet. The full original resume and job description remain preserved for user review and export audit.');
  return compacted.join('\n\n');
}

function preparePayloadForAction(payload = {}, action = 'generate') {
  const next = { ...payload };
  if (action === 'analysis' && typeof next.prompt === 'string') {
    next.prompt = compactAnalysisPrompt(next.prompt);
    next.maxOutputTokens = Math.min(Number(next.maxOutputTokens || 8192), 4096);
    next.temperature = next.temperature == null ? 0.18 : next.temperature;
  }
  return next;
}

// ── Model normalization ───────────────────────────────────────────────────────

function normalizeModel(model) {
  const requested = String(model || '').trim();
  const deprecatedOrUnavailable = new Set([
    'gemini-2.0-flash',
    'models/gemini-2.0-flash',
    'gemini-1.5-flash',
    'models/gemini-1.5-flash',
  ]);
  if (!requested || deprecatedOrUnavailable.has(requested)) return DEFAULT_MODEL;
  return requested.replace(/^models\//, '');
}

// ── Gemini payload builder ────────────────────────────────────────────────────

function getCandidateText(raw) {
  try {
    const parts = raw?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) return parts.map(p => p.text || '').join('');
  } catch (_) {}
  return '';
}

function buildGeminiPayload(payload) {
  const userPrompt = payload.prompt || payload.userPrompt || '';
  const systemPrompt = payload.systemPrompt || '';
  const result = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: payload.temperature ?? 0.7,
      maxOutputTokens: payload.maxOutputTokens ?? 8192,
    },
  };
  if (systemPrompt) {
    result.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  if (payload.responseMimeType) {
    result.generationConfig.responseMimeType = payload.responseMimeType;
  }
  if (payload.useGoogleSearch) {
    result.tools = [{ google_search: {} }];
  }
  return result;
}

// ── Gemini HTTP call ──────────────────────────────────────────────────────────

async function callGemini(model, geminiPayload) {
  const resolvedModel = normalizeModel(model);
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(resolvedModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const { default: https } = await import('https');
  const body = JSON.stringify(geminiPayload);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 300000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch (_) {
          return resolve({ ok: false, status: res.statusCode, error: data || 'Invalid response', model: resolvedModel });
        }
        if (res.statusCode !== 200) {
          return resolve({ ok: false, status: res.statusCode, error: json?.error?.message || `HTTP ${res.statusCode}`, raw: json, model: resolvedModel });
        }
        resolve({ ok: true, status: res.statusCode, raw: json, model: resolvedModel });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini request timed out')); });
    req.write(body);
    req.end();
  });
}

// ── API request handler ───────────────────────────────────────────────────────

async function handleApiRequest(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body);
      const requestedModel = parsed?.model || parsed?.payload?.model || DEFAULT_MODEL;
      const model = normalizeModel(requestedModel);
      const action = parsed?.action || 'generate';
      const rawPayload = parsed?.payload || parsed || {};
      const payload = preparePayloadForAction(rawPayload, action);
      const geminiPayload = parsed?.contents ? parsed : buildGeminiPayload(payload);

      const result = await callGemini(model, geminiPayload);

      if (!result.ok) {
        res.writeHead(result.status || 500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: result.error, raw: result.raw, model: result.model, requestedModel }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        text: getCandidateText(result.raw),
        raw: result.raw,
        model: result.model,
        requestedModel,
        action,
        compactedAnalysis: action === 'analysis',
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message || 'Server error' }));
    }
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    handleApiRequest(req, res);
    return;
  }

  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
          if (err2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data2);
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Application Appropriation server running on port ${PORT}`);
});
