// OpenRouter에 짧게 묻고 JSON 하나를 받는 공통 함수 (대화 질문·신문 기사에서 씀)
import { config } from './config.js';

/** { ok: true, json } | { ok: false, status: 'no_key' | 'api_error' | 'bad_json' } */
export async function askJson(system, user, { maxTokens = 700, temperature = 0.7, timeoutMs = 25000, title = 'Haru Hanjang' } = {}) {
  if (!config.openrouter.apiKey) return { ok: false, status: 'no_key' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${config.openrouter.apiKey}`, 'Content-Type': 'application/json', ...(config.publicUrl ? { 'HTTP-Referer': config.publicUrl } : {}), 'X-Title': title },
      body: JSON.stringify({ model: config.openrouter.model, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!res.ok) { console.warn(`[ai] OpenRouter HTTP ${res.status}`); return { ok: false, status: 'api_error' }; }
    const content = String((await res.json())?.choices?.[0]?.message?.content || '');
    try { return { ok: true, json: JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '') }; } catch { console.warn(`[ai] JSON이 아닌 응답: ${content.slice(0, 200)}`); return { ok: false, status: 'bad_json', raw: content.slice(0, 600) }; }
  } catch (e) {
    console.warn(`[ai] OpenRouter error: ${e.message}`);
    return { ok: false, status: 'api_error' };
  } finally { clearTimeout(timer); }
}

/** 한 줄 문자열로 정리 */
export const line = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
