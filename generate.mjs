const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
    return { ok: false, status: response.status, error: text || "Invalid Gemini response." };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: json?.error?.message || `Gemini request failed with HTTP ${response.status}`,
      raw: json
    };
  }

  return { ok: true, status: response.status, raw: json };
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

  const model = body?.model || body?.payload?.model || "gemini-2.5-flash";
  const payload = body?.payload || body || {};
  const action = body?.action || "generate";
  const geminiPayload = body?.contents ? body : buildGeminiPayload(payload);

  try {
    const result = await callGemini(model, geminiPayload, apiKey);
    if (!result.ok) {
      return jsonResponse(result.status || 500, { error: result.error, raw: result.raw });
    }

    return jsonResponse(200, {
      text: getCandidateText(result.raw),
      raw: result.raw,
      model,
      action
    });
  } catch (error) {
    return jsonResponse(500, { error: error?.message || "Gemini request failed." });
  }
}
