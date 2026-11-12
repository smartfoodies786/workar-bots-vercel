// lib/ai.js — AI layer for free-text messages.
// Provider order: GROQ_API_KEY first, then GEMINI_API_KEY.
// GROK_API_KEY is ALSO accepted as a spelling fallback for the env var name
// (nabil spells Groq as GROK). The intended provider is Groq free tier,
// NOT xAI Grok — this file NEVER calls any xAI/Grok API.
// If no key is set, return null so the caller falls back to keyword routing.
// AI must ONLY answer from this bot's own business data (agency, agent,
// listings link, phone, website from env/config) and must NEVER invent
// listing prices, addresses, interest rates, or property details.
// If AI is unsure, it must return null (caller falls back to menu / human).
// NO keys in code — process.env only.

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "";
}

function systemPrompt(ctx) {
  return [
    "You are the WhatsApp assistant for a real estate agency. Answer ONLY from the business data below.",
    `Agency: ${ctx.agencyName || ""}`,
    `Agent: ${ctx.agentName || ""}`,
    `Phone: ${ctx.phone || ""}`,
    `Email: ${ctx.email || ""}`,
    `Website: ${ctx.website || ""}`,
    `Listings: ${ctx.listingsUrl || ""}`,
    `Address: ${ctx.address || ""}`,
    "RULES:",
    "- NEVER invent listing prices, addresses, interest rates, or property details.",
    "- NEVER invent a specific home, price, or availability. If the user asks about a specific property, price, or rate you do not have in the business data above, say you do not know and direct them to the agent / listings link.",
    "- Keep replies short (under 80 words), friendly, WhatsApp-style.",
    "- If you are unsure about anything, reply exactly: UNSURE",
    "- Do not claim to be human. Do not offer anything the agency does not offer.",
  ].join("\n");
}

async function callGroq(message, ctx) {
  const key = groqKey();
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-oss-20b",
        messages: [
          { role: "system", content: systemPrompt(ctx) },
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "").trim();
    if (!text || text === "UNSURE" || /unsure|don't know|do not know/i.test(text) && text.length < 40) {
      // Short "don't know" replies are treated as unsure -> caller falls back.
      // But a longer helpful reply that happens to contain "don't know" + a handoff is kept.
      if (text === "UNSURE" || text.length < 120) return null;
    }
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(message, ctx) {
  const key = process.env.GEMINI_API_KEY || "";
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt(ctx)}\n\nUser message: ${message}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = (parts || []).map((p) => p.text || "").join("").trim();
    if (!text || text === "UNSURE" || text.length < 120 && /unsure|don't know|do not know/i.test(text)) return null;
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Exported: returns a string reply, or null if AI is unavailable / unsure.
async function answerFreeText(message, businessContext) {
  if (!message || !String(message).trim()) return null;
  const ctx = businessContext || {};
  if (groqKey()) {
    const out = await callGroq(message, ctx);
    if (out) return out;
    // Groq key set but call failed/unsure: do NOT silently try Gemini with
    // a different key unless Gemini is also set — fall through to Gemini
    // only if its key exists, otherwise return null.
    if (process.env.GEMINI_API_KEY) return callGemini(message, ctx);
    return null;
  }
  if (process.env.GEMINI_API_KEY) return callGemini(message, ctx);
  return null;
}

module.exports = { answerFreeText };
