// lib/ai.js — AI layer (AI variant ONLY; keyword variant has no such file).
//
// Provider order: GROQ_API_KEY first, then GEMINI_API_KEY.
// GROK_API_KEY is ALSO accepted as a spelling fallback for the env var name
// (nabil spells Groq as GROK). The intended provider is Groq's free tier,
// NOT xAI Grok — this file NEVER calls any xAI/Grok API.
//
// If no key is set, answerFreeText returns null and the caller falls back to
// the keyword menu / human handoff. No crash, ever.
//
// Guardrails:
// - AI answers ONLY from the businessContext supplied by the caller
//   (gym name, plans, prices, hours, trainers, address, phone).
// - It must NEVER invent prices, addresses, phone numbers, or medical /
//   fitness advice beyond general info.
// - If unsure, it must return null (caller falls back to the menu).
// - NO keys in code — process.env only. Uses global fetch (Node 18+), so
//   package.json needs no extra AI dependency.

async function callGroq(message, businessContext) {
  const key = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
  if (!key) return null;
  const system =
    `You are the WhatsApp assistant for ${businessContext.gymName}, a gym. ` +
    `Answer ONLY from these facts:\n${businessContext.facts}\n` +
    `Rules: never invent prices, addresses, phone numbers, class times, or trainer names. ` +
    `Never give medical advice or a personalised medical/fitness diagnosis; general fitness info only, ` +
    `and suggest asking a trainer or doctor for anything medical. ` +
    `Keep replies short (under 80 words), friendly, WhatsApp style. ` +
    `If the question cannot be answered from the facts above, reply exactly: UNSURE`;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-oss-20b",
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });
  if (!res.ok) {
    console.log("ai: Groq request failed:", res.status);
    return null;
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || "").trim()
    : "";
  if (!text || text === "UNSURE") return null;
  return text;
}

async function callGemini(message, businessContext) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt =
    `You are the WhatsApp assistant for ${businessContext.gymName}, a gym. ` +
    `Answer ONLY from these facts:\n${businessContext.facts}\n` +
    `Rules: never invent prices, addresses, phone numbers, class times, or trainer names. ` +
    `Never give medical advice or a personalised medical/fitness diagnosis; general fitness info only, ` +
    `and suggest asking a trainer or doctor for anything medical. ` +
    `Keep replies short (under 80 words), friendly, WhatsApp style. ` +
    `If the question cannot be answered from the facts above, reply exactly: UNSURE\n\n` +
    `Customer message: ${message}`;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
    encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
    }),
  });
  if (!res.ok) {
    console.log("ai: Gemini request failed:", res.status);
    return null;
  }
  const data = await res.json();
  const text =
    data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0]
      ? String(data.candidates[0].content.parts[0].text || "").trim()
      : "";
  if (!text || text === "UNSURE") return null;
  return text;
}

// Returns a reply string, or null when the caller should fall back to the
// keyword menu / human handoff.
async function answerFreeText(message, businessContext) {
  if (!message || !String(message).trim()) return null;
  const ctx = businessContext || { gymName: "FitLife Gym", facts: "" };
  try {
    if (process.env.GROQ_API_KEY || process.env.GROK_API_KEY) {
      const out = await callGroq(String(message), ctx);
      if (out) return out;
      if (process.env.GEMINI_API_KEY) {
        return await callGemini(String(message), ctx);
      }
      return null;
    }
    if (process.env.GEMINI_API_KEY) {
      return await callGemini(String(message), ctx);
    }
    return null; // No AI key: keyword routing only.
  } catch (e) {
    console.log("ai: answerFreeText error:", e.message);
    return null;
  }
}

module.exports = { answerFreeText };
