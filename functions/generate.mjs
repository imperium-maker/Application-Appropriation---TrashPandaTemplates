const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const ANALYSIS_SECTION_LIMITS = {
  Resume: 3000,
  "Job Description": 2600,
  "Key Highlights": 1200,
  "Career Context": 1000,
  "Constraints / Extras": 900,
  "--- LIVE MARKET RESEARCH (web-grounded - use to inform your analysis) ---": 1800,
  "--- LIVE MARKET RESEARCH (web-grounded — use to inform your analysis) ---": 1800
};

function normalizeModel(model) {
  const requested = String(model || "").trim();
  const deprecatedOrUnavailable = new Set([
    "gemini-2.0-flash",
    "models/gemini-2.0-flash",
    "gemini-1.5-flash",
    "models/gemini-1.5-flash"
  ]);

  if (!requested || deprecatedOrUnavailable.has(requested)) return DEFAULT_MODEL;
  return requested.replace(/^models\//, "");
}

function truncateText(value, maxChars) {
  const text = String(value || "").trim();
  if (!maxChars || text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.65);
  const tail = maxChars - head;
  return `${text.slice(0, head).trim()}\n\n[...trimmed for Netlify analysis request; full original text remains preserved in browser state and ZIP audit export...]\n\n${text.slice(-tail).trim()}`;
}

function splitPromptSections(prompt) {
  const text = String(prompt || "");
  const labels = [
    "Applicant Name",
    "Target Role",
    "Role Policy",
    "Resume",
    "Resume Edits",
    "Key Highlights",
    "Career Context",
    "Job Description",
    "Constraints / Extras",
    "--- LIVE MARKET RESEARCH (web-grounded - use to inform your analysis) ---",
    "--- LIVE MARKET RESEARCH (web-grounded — use to inform your analysis) ---"
  ];
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const markerRe = new RegExp(`(^|\\n\\n)(${escaped.join("|")}):?\\n`, "g");
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
  const source = String(text || "").trim();
  const lines = source.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const important = lines.filter((line) => /cert|rating|license|medical|flight|hour|pic|sic|type|atp|faa|part\s?91|part\s?135|captain|pilot|present|experience|education|degree|clearance|passport|relocat|available|training|safety|leadership|managed|reduced|increased|saved|implemented|operated|international|pacific|gulfstream|g[- ]?200|g[- ]?650|ce[- ]?525/i.test(line));
  const selected = important.length ? important : lines;
  return truncateText(selected.slice(0, 80).join("\n"), ANALYSIS_SECTION_LIMITS.Resume);
}

function summarizeJobDescription(text) {
  const source = String(text || "").trim();
  const lines = source.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const important = lines.filter((line) => /require|qualification|must|preferred|responsib|dut|experience|certificate|license|medical|degree|travel|international|safety|crm|leadership|customer|client|salary|compensation|location|remote|hybrid|onsite|captain|pilot|gulfstream|part\s?91|part\s?135|worldwide/i.test(line));
  const selected = important.length ? important : lines;
  return truncateText(selected.slice(0, 90).join("\n"), ANALYSIS_SECTION_LIMITS["Job Description"]);
}

function compactAnalysisPrompt(prompt) {
  const sections = splitPromptSections(prompt);
  if (!sections) return truncateText(prompt, 9000);

  const compacted = sections.map(({ label, value }) => {
    let nextValue = value;
    if (label === "Resume") nextValue = summarizeResume(value);
    else if (label === "Job Description") nextValue = summarizeJobDescription(value);
    else if (ANALYSIS_SECTION_LIMITS[label]) nextValue = truncateText(value, ANALYSIS_SECTION_LIMITS[label]);
    return `${label}:\n${nextValue || "[None supplied]"}`;
  });

  compacted.push("Analysis compaction note:\nThis first-pass analysis request uses a bounded, high-signal extract to avoid Netlify timeouts. Do not treat omitted text as absent; ask targeted follow-up questions or mark Needs Verification if a claim is not present in this analysis packet. The full original resume and job description remain preserved for user review and export audit.");
  return compacted.join("\n\n");
}

function preparePayloadForAction(payload = {}, action = "generate") {
  const next = { ...payload };
  if (action === "analysis" && typeof next.prompt === "string") {
    next.prompt = compactAnalysisPrompt(next.prompt);
    next.maxOutputTokens = Math.min(Number(next.maxOutputTokens || 8192), 4096);
    next.temperature = next.temperature == null ? 0.18 : next.temperature;
  }
  return next;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function getCandidateText(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  return parts && parts.length
    ? parts.map((part) => part.text || "").join("\n").trim()
    : "";
}

function buildGeminiPayload(payload = {}) {
  const result = {
    contents: [{ role: "user", parts: [{ text: payload.prompt || "" }] }],
    generationConfig: {
      temperature: payload.temperature == null ? 0.35 : payload.temperature,
      maxOutputTokens: payload.maxOutputTokens || 8192
    }
  };

  if (payload.systemPrompt) {
    result.systemInstruction = {
      role: "system",
      parts: [{ text: payload.systemPrompt }]
    };
  }

  if (payload.responseMimeType) {
    result.generationConfig.responseMimeType = payload.responseMimeType;
  }

  if (payload.useGoogleSearch) {
    result.tools = [{ google_search: {} }];
  }

  return result;
}

async function callGemini(model, geminiPayload, apiKey) {
  const resolvedModel = normalizeModel(model);
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(resolvedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiPayload)
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    return { ok: false, status: response.status, error: text || "Invalid Gemini response.", model: resolvedModel };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: json?.error?.message || `Gemini request failed with HTTP ${response.status}`,
      raw: json,
      model: resolvedModel
    };
  }

  return { ok: true, status: response.status, raw: json, model: resolvedModel };
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: "GEMINI_API_KEY is not configured in Netlify environment variables." });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const requestedModel = body?.model || body?.payload?.model || DEFAULT_MODEL;
  const model = normalizeModel(requestedModel);
  const action = body?.action || "generate";
  const payload = preparePayloadForAction(body?.payload || body || {}, action);
  const geminiPayload = body?.contents ? body : buildGeminiPayload(payload);

  try {
    const result = await callGemini(model, geminiPayload, apiKey);
    if (!result.ok) {
      return jsonResponse(result.status || 500, { error: result.error, raw: result.raw, model: result.model, requestedModel });
    }

    return jsonResponse(200, {
      text: getCandidateText(result.raw),
      raw: result.raw,
      model: result.model,
      requestedModel,
      action,
      compactedAnalysis: action === "analysis"
    });
  } catch (error) {
    return jsonResponse(500, { error: error?.message || "Gemini request failed.", model, requestedModel });
  }
}
