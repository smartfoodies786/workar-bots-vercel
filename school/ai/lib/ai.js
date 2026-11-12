// lib/ai.js — free-text AI layer for the school bot.
//
// Provider order: GROQ_API_KEY first, then GEMINI_API_KEY.
// GROK_API_KEY is ALSO accepted as a spelling fallback for the env var
// name (nabil spells Groq as GROK). The intended provider is Groq's
// free tier — NOT xAI Grok. This file NEVER calls any xAI/Grok API.
//
// Groq free tier:  model gpt-oss-20b
//                   endpoint https://api.groq.com/openai/v1/chat/completions
// Gemini free tier: model gemini-2.0-flash
//                   endpoint https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
//
// Rules:
// - AI answers ONLY from this bot's own school data (school name, classes,
//   fees, hours, contact from env/config). It must NEVER invent fees,
//   results, attendance records, addresses, or phone numbers.
// - If unsure, return null so the caller falls back to the keyword menu /
//   human handoff (principal).
// - No keys in code — process.env only. No key = keyword routing, no crash.

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "";
}

function geminiKey() {
  return process.env.GEMINI_API_KEY || "";
}

function buildSystemPrompt(businessContext) {
  const c = businessContext || {};
  const classes = Array.isArray(c.classes) ? c.classes.join(", ") : "KG, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B";
  const fees = c.fees
    ? Object.entries(c.fees).map(([k, v]) => `${k}: ${v}`).join("; ")
    : "KG 500, 1A 600, 1B 600, 2A 700, 2B 700, 3A 800, 3B 800, 4A 900, 4B 900, 5A 1000, 5B 1000";
  return [
    `You are the WhatsApp helper for ${c.schoolName || "Bright Future Academy"}, a school.`,
    `School facts you may use — use ONLY these, never invent others:`,
    `- School: ${c.schoolName || "Bright Future Academy"}`,
    `- Address: ${c.address || "123 Education Street, Dubai, UAE"}`,
    `- Phone: ${c.phone || "+971 4 123 4567"}`,
    `- Email: ${c.email || "info@brightfuture.ae"}`,
    `- Website: ${c.website || "https://brightfuture.ae"}`,
    `- Principal: ${c.principalName || "Mr. Ahmed Al-Rashid"}`,
    `- Currency: ${c.currency || "AED"}`,
    `- Classes: ${classes}`,
    `- Monthly fees (${c.currency || "AED"}): ${fees}`,
    `- Fee due day: ${c.feeDay || 5}th of every month`,
    `- Hours: 8am - 3pm, Mon - Fri`,
    `Rules:`,
    `1. Answer ONLY from the facts above and the parent's own message.`,
    `2. NEVER invent fees, test results, attendance records, addresses, phone numbers, dates, or events.`,
    `3. NEVER claim a payment was received, verified, or collected — fee payment confirmation is only ever sent by the principal with !feepaid.`,
    `4. If the question asks for a specific child's attendance, result, fee record, or homework, or you are unsure of the answer, reply with exactly: UNSURE`,
    `5. Keep the reply short (under 60 words), friendly, in the parent's language (English or Arabic).`,
    `6. If the parent needs a person, tell them to type ? followed by their question and the principal will reply, or call the school phone above.`,
  ].join("\n");
}

async function callGroq(message, businessContext) {
  const key = groqKey();
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-oss-20b",
        messages: [
          { role: "system", content: buildSystemPrompt(businessContext) },
          { role: "user", content: message },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text || text === "UNSURE" || text.toLowerCase().includes("unsure")) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(message, businessContext) {
  const key = geminiKey();
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
      encodeURIComponent(key);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildSystemPrompt(businessContext) + "\n\nParent message: " + message },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
    if (!text || text === "UNSURE" || text.toLowerCase().includes("unsure")) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Returns a string reply, or null when the caller should fall back to the
// keyword menu / human handoff. Never throws.
async function answerFreeText(message, businessContext) {
  if (!message || !String(message).trim()) return null;
  if (groqKey()) {
    const viaGroq = await callGroq(message, businessContext);
    if (viaGroq) return viaGroq;
    // Groq key set but call failed/unsure: try Gemini as a fallback if set.
    if (geminiKey()) return callGemini(message, businessContext);
    return null;
  }
  if (geminiKey()) return callGemini(message, businessContext);
  return null; // No key: keyword routing only, no crash.
}

module.exports = { answerFreeText };
