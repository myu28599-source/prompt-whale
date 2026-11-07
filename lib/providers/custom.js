/**
 * 自定义 OpenAI 兼容后端：用户在设置页自行填 API 地址 + 模型名 + Key。
 * 任何兼容 /v1/chat/completions 的服务（OpenAI、SiliconFlow、OneAPI 中转、
 * 本地 Ollama/LM Studio 的 OpenAI 端点等）都能接。
 * @module lib/providers/custom
 */
import { makeProvider, ProviderError } from './_shared.js';

export const meta = {
  id: 'custom',
  label: '自定义',
  baseURL: '',        // 必须由设置面板覆盖（config.baseURLs.custom）
  defaultModel: '',   // 必须由设置面板覆盖（config.models.custom）
  envKey: 'CUSTOM_API_KEY',
  keyHint: '该服务的 OpenAI 兼容 API Key',
  docs: '',
};

const base = makeProvider(meta);

export default {
  ...base,
  async optimize(args = {}) {
    // model / baseURL 已由 createProvider 用设置面板配置解析过，这里兜底校验。
    const model = args.model || base.defaultModel;
    const baseURL = args.baseURL || base.baseURL;
    if (!baseURL) {
      throw new ProviderError('请先在设置页填写自定义后端的 API 地址（OpenAI 兼容，通常以 /v1 结尾）', { code: 'no-config' });
    }
    if (!model) {
      throw new ProviderError('请先在设置页填写自定义后端的模型名', { code: 'no-config' });
    }
    return base.optimize(args);
  },
};
