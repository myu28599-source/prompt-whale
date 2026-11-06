/**
 * DeepSeek 官方 API。
 * @module lib/providers/deepseek
 */
import { makeProvider } from './_shared.js';

export const meta = {
  id: 'deepseek',
  label: 'DeepSeek',
  baseURL: 'https://api.deepseek.com/v1',
  defaultModel: 'deepseek-chat',
  envKey: 'DEEPSEEK_API_KEY',
  keyHint: 'DeepSeek Platform API Key',
  docs: 'https://platform.deepseek.com/api-docs/',
};

export default makeProvider(meta);
