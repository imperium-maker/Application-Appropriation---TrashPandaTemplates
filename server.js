import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

function normalizeModel(model) {
  const m = String(model || '').trim();
  if (!m || m === 'default') return 'gemini-2.5-flash';
  if (m.startsWith('models/')) return m.replace(/^models\//, '');
  return m;
}

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

async function handleApiRequest(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body);
      const requestedModel = parsed?.model || parsed?.payload?.model || 'gemini-2.5-flash';
      const model = normalizeModel(requestedModel);
      const action = parsed?.action || 'generate';
      const payload = parsed?.payload || parsed || {};
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

const server = http.createServer((req, res) => {
  // Log all requests
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // API endpoint
  if (req.method === 'POST' && req.url === '/api/generate') {
    handleApiRequest(req, res);
    return;
  }

  // Static file serving
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  
  // Security: prevent directory traversal
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
        // Try serving index.html for SPA routing
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
