/**
 * Agnes（默认后端，免费档）。
 *
 * 两套端点、Key 不通用（2026-11-06 用同一把 sk- Key 实测）：
 *   - https://api.agnes-ai.cn/v1        国内站，/v1/models 200 列出 9 个模型，/chat/completions 200
 *   - https://apihub.agnes-ai.com/v1    国际站，同一把 Key 返回 401 Invalid token
 *   - https://apihub.agnes-ai.cn/v1     同样 401
 * 本机用户的 Key 属于国内站，所以默认走 api.agnes-ai.cn；国际站 Key 在设置面板改回 apihub 即可。
 * @module lib/providers/agnes
 */
import { makeProvider } from './_shared.js';

export const meta = {
  id: 'agnes',
  label: 'Agnes（默认）',
  baseURL: 'https://api.agnes-ai.cn/v1',
  defaultModel: 'agnes-2.5-flash',
  envKey: 'AGNES_API_KEY',
  keyHint: 'Agnes 平台 API Key（platform.agnes-ai.com 创建）',
  docs: 'https://platform.agnes-ai.com/',
};

export default makeProvider(meta);
