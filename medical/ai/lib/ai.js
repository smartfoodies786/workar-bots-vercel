// lib/ai.js — Optional AI layer for free-text messages.
// Provider order: GROQ_API_KEY first (GROK_API_KEY accepted ONLY as a
// spelling alias for the Groq key), then GEMINI_API_KEY.
// The intended provider is Groq free tier, NOT xAI Grok — no xAI/Grok
// API is ever called.
// If no key is set, returns null (caller falls back to keyword routing).
// AI must ONLY answer from this bot's own business data and must NEVER
// invent prices, doctors, addresses, phone numbers, or medical advice
// or diagnoses. If unsure, the model is told to reply UNSURE and we
// return null so the caller falls back to the keyword menu / human handoff.
// NO keys in code — process.env only.

async function answerFreeText(message, businessContext) {
  if (!message || !message.trim()) return null;

  const groqKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "";
  const geminiKey = process.env.GEMINI_API_KEY || "";

  const ctx = businessContext || {};
  const contextText = [
    `Clinic: ${ctx.clinicName || "HealthFirst Medical Clinic"}`,
    `Address: ${ctx.address || ""}`,
    `Phone: ${ctx.phone || ""}`,
    `Hours: ${ctx.hours || ""}`,
    `Doctors: ${(ctx.doctors || []).map((d) => `${d.name} (${d.specialty})`).join("; ")}`,
    `Appointment types and fees: ${(ctx.apptTypes || []).map((t) => `${t.name} ${t.fee}`).join("; ")}`,
    `Insurance accepted: ${ctx.insuranceList || ""}`,
    `Website: ${ctx.website || ""}`,
  ].join("\n");

  const systemPrompt =
    "You are the WhatsApp assistant for a medical clinic. " +
    "Answer ONLY using the business information given below. " +
    "Never invent prices, doctors, addresses, phone numbers, hours, or services. " +
    "Never give medical advice, a diagnosis, or treatment recommendations. " +
    "If the question asks for medical advice, a diagnosis, or anything not covered " +
    "by the business information, reply with exactly the single word UNSURE. " +
    "If you are not certain of the answer from the business information, reply " +
    "with exactly the single word UNSURE. " +
    "Keep the reply short (under 60 words) and friendly.\n\n" +
    "Business information:\n" + contextText;

  // --- Groq free tier (gpt-oss-20b) ---
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
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
      const text = (data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : "") || "";
      const trimmed = text.trim();
      if (!trimmed || trimmed.toUpperCase() === "UNSURE") return null;
      return trimmed;
    } catch (e) {
      console.log("[ai] groq error:", e.message);
      return null;
    }
  }

  // --- Gemini free tier (gemini-2.0-flash) ---
  if (geminiKey) {
    try {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        encodeURIComponent(geminiKey);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt + "\n\nUser message: " + message },
              ],
            },
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text =
        (data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0]
          ? data.candidates[0].content.parts[0].text : "") || "";
      const trimmed = text.trim();
      if (!trimmed || trimmed.toUpperCase() === "UNSURE") return null;
      return trimmed;
    } catch (e) {
      console.log("[ai] gemini error:", e.message);
      return null;
    }
  }

  // No AI key set — keyword routing only, no crash.
  return null;
}

module.exports = { answerFreeText };
