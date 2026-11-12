// lib/ai.js — optional AI layer for free-text messages (AI variant only).
//
// Provider order: GROQ_API_KEY first, then GEMINI_API_KEY.
// GROK_API_KEY is ALSO accepted as a spelling fallback for the env var name
// (nabil spells Groq as GROK). The intended provider is the Groq FREE tier,
// NOT xAI Grok — this file NEVER calls any xAI/Grok API.
//
// If no key is set, answerFreeText() returns null and the caller falls back
// to keyword routing / the main menu. No crash, ever.
//
// Grounding rule: the AI may ONLY answer from the businessContext supplied
// by the caller (store name, products, prices, deals, policies from env).
// It must NEVER invent prices, products, addresses, phone numbers, or order
// statuses. If it is unsure, it must return null (via the prompt contract:
// reply with the single word UNKNOWN) so the caller falls back to the menu
// or human handoff. No keys in code — process.env only.

require("dotenv").config();

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "gpt-oss-20b";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function provider() {
  if (GROQ_API_KEY) return "groq";
  if (GEMINI_API_KEY) return "gemini";
  return null;
}

function systemPrompt(businessContext) {
  return (
    "You are the WhatsApp shopping assistant for this store. " +
    "Answer ONLY using the business information below. " +
    "NEVER invent prices, products, addresses, phone numbers, order statuses, " +
    "discounts, or policies that are not listed below. " +
    "If the question cannot be answered from the information below, or you are " +
    "unsure, reply with exactly the single word: UNKNOWN\n\n" +
    "BUSINESS INFORMATION:\n" +
    (businessContext || "(no business context supplied)") +
    "\n\nKeep replies short (under 600 characters), friendly, and in the " +
    "customer's language — including Urdu / Roman Urdu if they write in it. " +
    "Do not claim to be human. Do not take payments."
  );
}

async function callGroq(message, businessContext) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt(businessContext) },
        { role: "user", content: message },
      ],
      temperature: 0.2,
      max_tokens: 400,
    }),
  });
  if (!res.ok) {
    console.log(`ai: Groq request failed (${res.status})`);
    return null;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text.trim() : null;
}

async function callGemini(message, businessContext) {
  const url = `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${systemPrompt(businessContext)}\n\nCustomer message: ${message}` },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
    }),
  });
  if (!res.ok) {
    console.log(`ai: Gemini request failed (${res.status})`);
    return null;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();
  return text || null;
}

/**
 * Answer a free-text customer message using AI, grounded ONLY in
 * businessContext. Returns a string reply, or null when:
 *  - no AI key is configured, or
 *  - the provider call fails, or
 *  - the AI is unsure (replies UNKNOWN).
 * The caller must fall back to the keyword menu / human handoff on null.
 */
async function answerFreeText(message, businessContext) {
  const p = provider();
  if (!p) return null;
  if (!message || !String(message).trim()) return null;
  try {
    const reply = p === "groq"
      ? await callGroq(message, businessContext)
      : await callGemini(message, businessContext);
    if (!reply) return null;
    if (reply.trim().toUpperCase() === "UNKNOWN") return null;
    return reply;
  } catch (err) {
    console.log("ai: provider error:", err.message);
    return null;
  }
}

module.exports = { answerFreeText, provider };
