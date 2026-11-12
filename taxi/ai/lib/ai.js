// lib/ai.js — Optional AI layer for free-text messages (AI variant ONLY).
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
// - AI must ONLY answer from this bot's own business data (the 85-destination
//   fixed fare table, phone, email, site from env/config). NEVER invent fares,
//   journey times, addresses, or phone numbers. This business has NO public
//   office address — never give one.
// - Fares are one-way from Gatwick; the return journey costs the SAME fare
//   each way. Fare includes meet & greet, flight tracking, free child seats
//   and the £10 Gatwick terminal charge. No payment when booking.
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
    `You are the WhatsApp assistant for ${businessContext.businessName}, an airport transfer taxi service to and from Gatwick Airport only. ` +
    `Answer ONLY from this business information, word for word where possible:\n` +
    `Fixed fares (one way from Gatwick; return journey costs the SAME fare each way):\n${businessContext.fareText}\n` +
    `Phone/WhatsApp: ${businessContext.phone}\n` +
    `Email: ${businessContext.email}\n` +
    `Website: ${businessContext.site}\n` +
    `This business has NO public office address — never give an address.\n` +
    `Pickup: Gatwick North Terminal (Car Park 6, Level 4) or South Terminal (Car Park 3, Ground Floor). ` +
    `Fare includes meet & greet, flight tracking, free child seats and the £10 Gatwick terminal charge. ` +
    `No payment when booking — the customer pays the agreed fare. The driver waits if a flight is delayed at no extra cost.\n` +
    `Rules: Never invent a fare, journey time, address, or phone number. ` +
    `Any destination not in the fare list is exactly: quote on request, owner will confirm. ` +
    `Airport journeys only — no local town runs, no school runs, no courier.\n` +
    `To book, the customer needs: direction (Gatwick to destination, or destination to Gatwick), destination, terminal, flight number, date/time, passengers, vehicle (Saloon, Estate, MPV 6-seater, 8-seater minibus, Executive saloon). ` +
    `If the question cannot be answered from the information above, reply exactly: UNSURE. ` +
    `Keep the reply short (under 60 words) and friendly. ` +
    `You may answer in Urdu / Roman Urdu if the customer writes in Urdu / Roman Urdu.`;
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
    `You are the WhatsApp assistant for ${businessContext.businessName}, an airport transfer taxi service to and from Gatwick Airport only. ` +
    `Answer ONLY from this business information:\n` +
    `Fixed fares (one way from Gatwick; return journey costs the SAME fare each way):\n${businessContext.fareText}\n` +
    `Phone/WhatsApp: ${businessContext.phone}\n` +
    `Email: ${businessContext.email}\n` +
    `Website: ${businessContext.site}\n` +
    `This business has NO public office address — never give an address.\n` +
    `Pickup: Gatwick North Terminal (Car Park 6, Level 4) or South Terminal (Car Park 3, Ground Floor). ` +
    `Fare includes meet & greet, flight tracking, free child seats and the £10 Gatwick terminal charge. ` +
    `No payment when booking — the customer pays the agreed fare. The driver waits if a flight is delayed at no extra cost.\n` +
    `Rules: Never invent a fare, journey time, address, or phone number. ` +
    `Any destination not in the fare list is exactly: quote on request, owner will confirm. ` +
    `Airport journeys only — no local town runs, no school runs, no courier.\n` +
    `To book, the customer needs: direction (Gatwick to destination, or destination to Gatwick), destination, terminal, flight number, date/time, passengers, vehicle (Saloon, Estate, MPV 6-seater, 8-seater minibus, Executive saloon). ` +
    `If the question cannot be answered from the information above, reply exactly: UNSURE. ` +
    `Keep the reply short (under 60 words) and friendly. ` +
    `You may answer in Urdu / Roman Urdu if the customer writes in Urdu / Roman Urdu.\n\n` +
    `Customer message: ${message}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
      }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const text =
    data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0]
      ? String(data.candidates[0].content.parts[0].text || "").trim()
      : "";
  if (!text || text.toUpperCase().includes("UNSURE")) return null;
  return text;
}

async function answerFreeText(message, businessContext) {
  if (!message || !String(message).trim()) return null;
  const viaGroq = await callGroq(message, businessContext).catch(() => null);
  if (viaGroq) return viaGroq;
  const viaGemini = await callGemini(message, businessContext).catch(() => null);
  if (viaGemini) return viaGemini;
  return null;
}

module.exports = { answerFreeText };
