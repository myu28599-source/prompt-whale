/**
 * 三个 provider 共用的 OpenAI 兼容调用与错误映射。
 * 全部走 Node 内置 fetch（undici），不读 HTTP_PROXY 环境变量，避免会话级死代理干扰。
 * @module lib/providers/_shared
 */
import { buildOptimizeRequest, extractParts, sanitizeOptimization } from '../logic.js';

export class ProviderError extends Error {
  constructor(message, { status = 0, code = 'unknown' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
  }
}

/** HTTP / 网络错误 → 可读中文提示（计划 §4）。 */
export function mapHttpError(status, bodyText) {
  let detail = '';
  try {
    const parsed = JSON.parse(bodyText || '{}');
    detail = parsed?.error?.message || parsed?.message || '';
  } catch { /* 非 JSON 响应，忽略 */ }
  const suffix = detail ? `：${String(detail).slice(0, 200)}` : '';
  switch (status) {
    case 401:
    case 403:
      return `鉴权失败 (${status})：API Key 无效或无权限${suffix}`;
    case 402:
      return `额度不足 (402)：账户余额/免费额度已用尽${suffix}`;
    case 404:
      return `模型不存在 (404)：检查设置面板里的模型名与 API 地址${suffix}`;
    case 429:
      return `请求限流 (429)：稍后重试或降低调用频率${suffix}`;
    default:
      if (status >= 500) return `服务异常 (${status})：稍后重试${suffix}`;
      return `请求失败 (${status})${suffix}`;
  }
}

/** 合并外部 signal 与超时 signal。 */
function withTimeout(timeoutMs, outerSignal) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => ac.abort(outerSignal?.reason || new Error('aborted'));
  if (outerSignal) {
    if (outerSignal.aborted) onAbort();
    else outerSignal.addEventListener('abort', onAbort, { once: true });
  }
  const dispose = () => {
    clearTimeout(timer);
    outerSignal?.removeEventListener?.('abort', onAbort);
  };
  return { signal: ac.signal, dispose, timedOut: () => ac.signal.aborted && !outerSignal?.aborted };
}

/**
 * 标准 /chat/completions 调用，返回 choices[0].message.content。
 * @param {object} o
 * @param {Function} [o.fetchImpl] - 注入 fetch 便于单测
 */
export async function callChat({
  baseURL,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  timeoutMs = 60_000,
  signal,
  fetchImpl = globalThis.fetch,
  extraBody = {},
}) {
  const { signal: merged, dispose, timedOut } = withTimeout(timeoutMs, signal);
  try {
    let res;
    try {
      res = await fetchImpl(`${baseURL.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature, stream: false, ...extraBody }),
        signal: merged,
      });
    } catch (error) {
      if (timedOut()) throw new ProviderError(`请求超时（${timeoutMs}ms）：可在设置面板调大超时`, { code: 'timeout' });
      throw new ProviderError(`网络请求失败：${error?.message || error}`, { code: 'network' });
    }

    let raw = '';
    try { raw = await res.text(); } catch (error) {
      throw new ProviderError(`读取响应失败：${error?.message || error}`, { code: 'network' });
    }
    if (!res.ok) throw new ProviderError(mapHttpError(res.status, raw), { status: res.status, code: 'http' });

    let payload;
    try { payload = JSON.parse(raw); } catch {
      throw new ProviderError('响应不是合法 JSON：检查 API 地址是否指向 /v1 而不是完整路径', { code: 'parse' });
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new ProviderError('模型未返回文本内容（响应缺少 choices[0].message.content）', { code: 'empty' });
    }
    return content;
  } finally {
    dispose();
  }
}

/**
 * 用 meta 造一个 provider 实例。
 * optimize 统一返回 { optimized, recommendations, raw, model, baseURL }。
 */
export function makeProvider(meta) {
  return {
    ...meta,
    async optimize({
      text,
      tools = '',
      recs = '',
      apiKey,
      model = meta.defaultModel,
      baseURL = meta.baseURL,
      timeoutMs = 60_000,
      temperature = 0.3,
      signal,
      fetchImpl,
      extraBody = meta.extraBody || {},
      request,
    } = {}) {
      if (!apiKey) {
        throw new ProviderError(`请先在设置页填写 ${meta.label} 的 API Key（或设置环境变量 ${meta.envKey}）`, { code: 'no-key' });
      }
      // 上层按上下文策略构造好请求时直接复用；否则走完整模板（兼容旧调用）。
      const { system, userContent } = request || buildOptimizeRequest(text, tools, recs);
      const raw = await callChat({
        baseURL,
        apiKey,
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature,
        timeoutMs,
        signal,
        fetchImpl,
        extraBody,
      });
      const parts = extractParts(raw);
      const optimized = sanitizeOptimization(parts.optimized) || '';
      if (!optimized) throw new ProviderError('模型返回内容为空或无法解析', { code: 'empty' });
      return {
        optimized,
        recommendations: parts.recommendations || '',
        raw,
        model,
        baseURL,
      };
    },
  };
}
