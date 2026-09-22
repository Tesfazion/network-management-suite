/**
 * Optional LLM upgrade for the chat assistant.
 *
 * Calls any OpenAI-compatible /chat/completions endpoint using the built-in
 * fetch. Configured entirely from the environment (BOT_API_URL/KEY/MODEL).
 * Not configured => local assistant only (default).
 */

const config = require('../config');

function isConfigured() {
  return Boolean(config.ai && config.ai.url && config.ai.key);
}

async function completeChat(system, messages) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
  try {
    const isAzure = /azure/.test(config.ai.url);
    const headers = { 'Content-Type': 'application/json' };
    headers[isAzure ? 'api-key' : 'Authorization'] = isAzure ? config.ai.key : `Bearer ${config.ai.key}`;

    const res = await fetch(config.ai.url, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: config.ai.model,
        temperature: config.ai.temperature,
        max_tokens: config.ai.maxTokens,
        messages: [
          { role: 'system', content: String(system) },
          ...messages.map((m) => ({
            role: m && m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m && m.content || '').slice(0, config.ai.maxHistory * 200),
          })),
        ],
      }),
    });

    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const text = await res.text();
        if (text) detail += ` — ${text.slice(0, 200)}`;
      } catch { /* keep status line */ }
      throw new Error(`AI request failed (${detail})`);
    }

    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('AI returned an empty response');
    return String(text).trim();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`AI request timed out after ${config.ai.timeoutMs} ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, completeChat };