/**
 * 混元 Hy4（活动指定后端）。
 *
 * 2026-11-06 实测口径（腾讯云官方文档 + 假 Key 探测）：
 *   - 按量 / OpenAI 兼容：https://tokenhub.tencentmaas.com/v1/chat/completions，model 全小写 `hy4`；
 *     带无效 Key 返回 401 `401002 The API Key does not exist or signature verification failed`。
 *   - 旧域名 https://api.hunyuan.cloud.tencent.com/v1 与 https://api.hunyuan.tencent.com/v2 已 404 下线，别填。
 *   - Token Plan 订阅地址 https://tokenhub.tencentmaas.com/plan/v3 官方明确「仅限交互式编程/智能体工具」，
 *     禁止用于自动化脚本或应用后端批量调用；本插件属于后者，**必须走按量 /v1**。
 *   - Key 获取：https://console.cloud.tencent.com/tokenhub/apikey （需腾讯云账号 + 实名认证），
 *     创建后只显示一次；免费包在模型广场右上角「新用户福利免费体验」领，语言模型 100 万 Tokens / 1 年。
 * @module lib/providers/hunyuan
 */
import { makeProvider } from './_shared.js';

export const meta = {
  id: 'hunyuan',
  label: '混元 Hy4',
  baseURL: 'https://tokenhub.tencentmaas.com/v1',
  defaultModel: 'hy4',
  envKey: 'HUNYUAN_API_KEY',
  // Hy4 是推理模型，长 SYSTEM + 工具/推荐清单会生成极长 reasoning_content，
  // 非流式要等思考完才返回（实测 120s 无响应）。TokenHub 实测仅这个参数有效：
  // reasoning_effort / enable_thinking / chat_template_kwargs 均被忽略。
  extraBody: { thinking: { type: 'disabled' } },
  keyHint: '腾讯云 TokenHub API Key（console.cloud.tencent.com/tokenhub/apikey，需实名认证；创建后只显示一次）',
  docs: 'https://cloud.tencent.com/document/product/1823/130058',
};

export default makeProvider(meta);
