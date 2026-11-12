// lib/ai.js — Optional AI layer for free-text messages.
//
// Provider order: GROQ_API_KEY first, then GEMINI_API_KEY.
// GROK_API_KEY is ALSO accepted as a spelling alias for GROQ_API_KEY
// (nabil spells Groq as GROK). The intended provider is Groq free tier,
// NOT xAI Grok — do NOT call any xAI/Grok API.
//
// - Groq free tier: model gpt-oss-20b,
//   endpoint https://api.groq.com/openai/v1/chat/completions
// - Gemini free tier (Google AI Studio): model gemini-2.0-flash,
//   endpoint https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
//
// Rules:
// - AI must ONLY answer from this bot's own business data (menu, prices,
//   hours, address, phone from env/config). NEVER invent prices, addresses,
//   phone numbers, or medical advice.
// - If AI is unsure, return null so the caller falls back to the keyword
//   menu / human handoff.
// - If no key is set, fall back to keyword routing with NO crash (return null).
// - NO keys in code — process.env only.
//
// Export: async answerFreeText(message, businessContext) -> string | null

async function callGroq(message, businessContext) {
  const key = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
  if (!key) return null;
  const systemPrompt =
    `You are the WhatsApp assistant for ${businessContext.restaurantName}, a restaurant. ` +
    `Answer ONLY from this business information, word for word where possible:\n` +
    `Menu:\n${businessContext.menuText}\n` +
    `Today's special: ${businessContext.todaySpecial}\n` +
    `Hours: ${businessContext.hours}\n` +
    `Address: ${businessContext.address}\n` +
    `Phone: ${businessContext.phone}\n` +
    `Website: ${businessContext.website}\n` +
    `Delivery areas: ${businessContext.deliveryZips || "ask the restaurant"}\n` +
    `Wait time: ${businessContext.waitTime}\n` +
    `Rules: Never invent a price, address, phone number, dish, or opening time. ` +
    `Never give medical, allergy, or health advice beyond saying to ask staff. ` +
    `If the question cannot be answered from the information above, reply exactly: UNSURE. ` +
    `Keep the reply short (under 60 words) and friendly.`;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-oss-20b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.2,
      max_tokens: 200,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || "").trim()
    : "";
  if (!text || text.toUpperCase().includes("UNSURE")) return null;
  return text;
}

async function callGemini(message, businessContext) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt =
    `You are the WhatsApp assistant for ${businessContext.restaurantName}, a restaurant. ` +
    `Answer ONLY from this business information:\n` +
    `Menu:\n${businessContext.menuText}\n` +
    `Today's special: ${businessContext.todaySpecial}\n` +
    `Hours: ${businessContext.hours}\n` +
    `Address: ${businessContext.address}\n` +
    `Phone: ${businessContext.phone}\n` +
    `Website: ${businessContext.website}\n` +
    `Delivery areas: ${businessContext.deliveryZips || "ask the restaurant"}\n` +
    `Wait time: ${businessContext.waitTime}\n` +
    `Rules: Never invent a price, address, phone number, dish, or opening time. ` +
    `Never give medical, allergy, or health advice beyond saying to ask staff. ` +
    `If the question cannot be answered from the information above, reply exactly: UNSURE. ` +
    `Keep the reply short (under 60 words) and friendly.\n\nCustomer message: ${message}`;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
    encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = parts ? parts.map((p) => p.text || "").join("").trim() : "";
  if (!text || text.toUpperCase().includes("UNSURE")) return null;
  return text;
}

async function answerFreeText(message, businessContext) {
  if (!message || !String(message).trim()) return null;
  const hasGroq = !!(process.env.GROQ_API_KEY || process.env.GROK_API_KEY);
  const hasGemini = !!process.env.GEMINI_API_KEY;
  if (!hasGroq && !hasGemini) return null; // no key: keyword routing only, no crash
  try {
    if (hasGroq) {
      const out = await callGroq(message, businessContext);
      if (out) return out;
      // Groq failed/unsure: try Gemini if configured, else fall through to null.
      if (hasGemini) return await callGemini(message, businessContext);
      return null;
    }
    return await callGemini(message, businessContext);
  } catch (err) {
    console.log("AI layer failed, falling back to keyword menu:", err.message);
    return null;
  }
}

module.exports = { answerFreeText };
