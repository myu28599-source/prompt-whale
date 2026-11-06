/**
 * provider 工厂：createProvider(name, config) → 统一 optimize({text,tools,recs,...}) 接口。
 * @module lib/providers
 */
import hunyuan, { meta as hunyuanMeta } from './hunyuan.js';
import agnes, { meta as agnesMeta } from './agnes.js';
import deepseek, { meta as deepseekMeta } from './deepseek.js';

export const PROVIDER_ORDER = ['agnes', 'hunyuan', 'deepseek'];

export const PROVIDERS = {
  agnes,
  hunyuan,
  deepseek,
};

export const PROVIDER_META = {
  agnes: agnesMeta,
  hunyuan: hunyuanMeta,
  deepseek: deepseekMeta,
};

export function isProviderName(name) {
  return typeof name === 'string' && Object.hasOwn(PROVIDERS, name);
}

/** 返回带 baseURL / model 覆盖的 provider 视图（覆盖来自设置面板）。 */
export function createProvider(name, config = {}) {
  const base = PROVIDERS[name];
  if (!base) throw new TypeError(`未知 provider：${name}`);
  const model = config?.models?.[name] || base.defaultModel;
  const baseURL = config?.baseURLs?.[name] || base.baseURL;
  return {
    ...base,
    model,
    baseURL,
    optimize: (args) => base.optimize({ ...args, model: args?.model || model, baseURL: args?.baseURL || baseURL }),
  };
}

export { ProviderError, mapHttpError, callChat } from './_shared.js';
