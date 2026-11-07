/**
 * prompt-whale 纯逻辑层：SYSTEM / USER 模板、工具清单、输出拆分与清洗。
 * 不依赖 dsh 运行时，可直接 node --test 单测。
 *
 * SYSTEM_PROMPT 与 USER 模板按开发计划 §6 / §7 逐字落地。
 * @module lib/logic
 */

export const DEFAULT_BLACKLIST = ['^mcp__rea__'];

/**
 * 生图模式（imageMode）：控制「用于 AI 生图的提示词」要不要由优化器补画风。
 * - auto-style（默认）：用户没指定画风时，优化器主动补全最契合主体的画风锚点（如二次元动漫 / 写实 / 水彩等）。
 *   对应本插件此前默认行为（Agnes 实测会补「二次元动漫 + 萌系」），向后兼容。
 * - follow-intent：严格跟随用户原意，绝不替用户加任何画风 / 风格词，只在语义层面澄清补全。
 *   适合用户要写实、但优化器默认爱补二次元导致跑偏的场景。
 */
export const IMAGE_MODES = ['auto-style', 'follow-intent'];

/** 两种模式对应的 system 指令片段（追加到优化请求里，仅在 task==='image' 时生效）。 */
export const IMAGE_STYLE_DIRECTIVES = {
  'auto-style': [
    '【生图专项】这是用于 AI 生图（如 ComfyUI / Midjourney / Stable Diffusion）的提示词。',
    '若用户未在原始提示词里明确指定画风，请主动补全最契合主体气质的画风锚点（例如二次元动漫、写实摄影、水彩、3D 渲染等）与质量词（高精度、细节丰富、8k、光影自然）；',
    '若用户已指定画风则保留不覆盖。其余仍按你的通用优化规则执行。',
  ].join('\n'),
  'follow-intent': [
    '【生图专项】这是用于 AI 生图的提示词，但请严格跟随用户原意：',
    '不得自行添加任何画风 / 风格描述（如「二次元」「写实」「动漫」「油画」等），除非用户在原始提示词里已明确指定；',
    '只在主体、服装、构图、光影、质感等语义层面做澄清与补全，保持画风中立，绝不替用户做任何风格决策。',
  ].join('\n'),
  // 用户已在原始提示词里明确指定画风时强制使用：用户意图优先级高于设置页的 auto-style / follow-intent。
  'respect-user-style': [
    '【生图专项】这是用于 AI 生图的提示词。',
    '检测确认：用户在原始提示词里已明确指定了画风 / 风格（如二次元、写实、水彩、3D 等），请严格保留用户指定的画风，',
    '不得更改、不得叠加其它画风、也不得为了「更协调 / 更精致」而擅自替换或混合；',
    '只能在用户指定画风之内，对主体、服装、构图、光影、质感等做澄清与补全——画风决策权完全归用户。',
  ].join('\n'),
};

/**
 * 画风 / 风格关键词表：用于在代码层判断「用户原始提示词是否已明确指定画风」。
 * 只收明确的画风修饰词，不收「画 / 图 / 图片 / 生成」这类中性动词名词，避免把「帮我画张图」误判为已指定风格。
 * @type {string[]}
 */
export const STYLE_KEYWORDS = [
  // 二次元 / 卡通
  '二次元', '动漫', '日系', '日漫', '萌系', '卡通', '美式', '美漫', '迪士尼', '皮克斯', 'pixar', 'cartoon', 'anime', '漫画',
  // 写实
  '写实', '照片', '摄影', '实拍', '真人', '真实感', 'photoreal', 'realistic', 'photorealistic',
  // 绘画媒介
  '水彩', '油画', '国画', '水墨', '素描', '速写', '铅笔', '粉笔', '蜡笔', '插画', '厚涂', '手绘', '涂鸦', '简笔', '线稿', '钢笔画', '赛璐珞', 'cel shading',
  'watercolor', 'oil painting', 'sketch',
  // 3D / 渲染
  '3d', '三维', '建模', '渲染', 'cgi', 'blender', 'octane',
  // 像素 / 复古
  '像素', 'pixel', 'pixel art', '8bit', '16bit', '复古',
  // 风格流派
  '赛博朋克', 'cyberpunk', '蒸汽波', 'vaporwave', '波普', 'pop art', '浮世绘', '低多边形', 'low poly',
  // 极简 / 国风
  '极简', 'minimal', '古风', '国风', '中式',
  // 影像 / 色调
  '胶片', 'film', 'cinematic', '电影感', '黑白', '单色', 'monochrome',
  // 复合词（明确指定「X 风」）
  '动漫风', '二次元风', '写实风', '油画风', '油画风格', '水彩风', '像素风', '赛博朋克风', '漫画风', '插画风', '手绘风',
];

/**
 * 代码层判断：用户原始提示词是否已明确指定画风 / 风格。
 * 命中关键词表即视为已指定（用户意图优先）。
 * @param {string} text - 用户原始提示词（优化前）
 * @returns {boolean}
 */
export function detectStyleInPrompt(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return STYLE_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

/**
 * 把生图风格指令追加进优化请求（追加到 system 末尾，避免覆盖既有规则）。
 *
 * 优先级（硬保证，不靠模型自觉）：
 *   1. 若用户原始提示词已明确指定画风（detectStyleInPrompt 命中），无论设置页选 auto-style 还是
 *      follow-intent，都强制走 `respect-user-style`——用户意图永远优先于设置页的风格选择；
 *   2. 否则按设置页 imageMode 决定：auto-style 主动补画风 / follow-intent 保持画风中立。
 *
 * mode 非法（或 request 为空）时原样返回，便于在调用处无条件调用。
 * @param {{system?:string, userContent?:string}} request
 * @param {string} mode - 来自 config.imageMode（'auto-style' | 'follow-intent'）
 * @param {string} [text] - 用户原始提示词（优化前），用于检测是否已指定画风
 * @param {boolean} [userStyleOverride] - 已算好的检测结果，避免重复计算（可选）
 * @returns {{system:string, userContent?:string}}
 */
export function appendImageDirective(request, mode, text, userStyleOverride) {
  if (!request || !IMAGE_MODES.includes(mode)) return request;
  const userStyle = typeof userStyleOverride === 'boolean'
    ? userStyleOverride
    : detectStyleInPrompt(text);
  const key = userStyle ? 'respect-user-style' : mode;
  const directive = IMAGE_STYLE_DIRECTIVES[key];
  if (!directive) return request;
  return {
    ...request,
    system: `${request.system || ''}\n\n${directive}`,
  };
}

/** 计划 §6，逐字。 */
export const SYSTEM_PROMPT = [
  '你是一位资深的 AI 提示词（Prompt）优化工程师。用户会给你一段写在 AI 对话工具（DeepSeek Harness，简称 dsh）里的原始提示词，以及两份上下文：【工具清单】（当前环境已装可用）和【可推荐插件清单】（dsh 生态里真实存在、但用户尚未安装的插件）。',
  '',
  '你的任务：把这段口语化、缺结构、缺参数、意图可能模糊的原始提示词，改写成清晰、专业、自包含、可直接交给 AI 执行的高质量提示词；并基于任务匹配度，从【可推荐插件清单】里挑出真正能帮上忙、且用户还没装的插件推荐给他。',
  '',
  '硬性输出规则：',
  '1. 直接输出优化后的提示词正文，第一句就进入正题；',
  '2. 不要寒暄、不要解释、不要说「以下是优化后的提示词」、不要 Markdown 标题、不要代码围栏、不要复述原始需求；',
  '3. 严格保留用户原本的语言、核心意图、约束条件与数据，不擅自改变、扩大或缩小任务目标；',
  '4. 只有当【工具清单】里有与需求相关的真实工具时，才在提示词中明确指定工具名称、关键参数、执行步骤、期望输出与失败兜底；工具名只能从清单里取，绝对禁止编造清单以外的工具；',
  '5. 工具清单为空或与需求无关时，只做结构化改写，不要硬塞工具名；',
  '6. 优化后的提示词应自包含：即使脱离本对话上下文，AI 也能据此独立完成用户要的事；',
  '7. 若原始提示词已经足够清晰专业，在保持结构化的前提下最小改动，不要为了改而改；',
  '8. 输出语言与用户原始提示词保持一致（用户用中文就用中文，用英文就用英文）；',
  '9. 优化提示词写完后，另起一段，以分隔线 `---` 隔开，再输出「💡 推荐插件」小节：从【可推荐插件清单】中挑选与本次任务真正相关的未安装插件，每条一行，格式为 `- 插件名（owner/repo）：<它能做什么，与本次任务的契合点>`；清单为空或没有真正相关的插件则不输出该小节，也不要编造插件；',
  '10. 【可推荐插件清单】非空时，推荐只能来自该清单，禁止推荐清单之外、或已经在【工具清单】里装了的插件；',
  '11. 若【可推荐插件清单】为空（网络不可达等），你可以用自身对 dsh 生态的了解自由推荐你确信真实存在的插件；但当你不确定某个插件是否真实存在时，只描述「所需的能力类别」而绝不编造具体插件名。',
].join('\n');

/** 计划 §7 的用户消息模板。 */
export function buildUserContent({ text, toolCatalog, recCatalog }) {
  return [
    '【当前可用工具 / 技能 / MCP 清单】',
    toolCatalog || '(无可用工具)',
    '',
    '【可推荐但未安装的插件清单】',
    recCatalog || '(无)',
    '',
    '【原始提示词】',
    text,
    '',
    '【输出要求】',
    '只输出优化后的提示词正文，不要任何前后缀、标题、代码围栏或解释。',
    '优化写完后另起一段，以分隔线 `---` 隔开，再输出「💡 推荐插件」小节（规则见 system）。',
  ].join('\n');
}

/** 兼容蓝本签名：buildOptimizeRequest(text, toolCatalog, recCatalog) → {system, userContent}。 */
export function buildOptimizeRequest(text, toolCatalog, recCatalog) {
  return {
    system: SYSTEM_PROMPT,
    userContent: buildUserContent({ text, toolCatalog, recCatalog }),
  };
}

/**
 * 从工具清单条目里过滤黑名单、截断超长描述、限制条数。
 * @param entries - [{name, description}]
 * @returns { kept, droppedCount }
 */
export function filterTools(entries, { blacklist = DEFAULT_BLACKLIST, maxDesc = 300, maxTools = 80 } = {}) {
  const patterns = [];
  for (const source of blacklist || []) {
    try { patterns.push(new RegExp(source, 'i')); } catch { /* 坏正则忽略 */ }
  }
  const kept = [];
  let droppedCount = 0;
  for (const entry of entries || []) {
    if (!entry || typeof entry.name !== 'string' || !entry.name) continue;
    if (patterns.some((re) => re.test(entry.name))) { droppedCount++; continue; }
    if (kept.length >= maxTools) { droppedCount++; continue; }
    const description = typeof entry.description === 'string' ? entry.description.trim() : '';
    kept.push({
      name: entry.name,
      description: description.length > maxDesc ? `${description.slice(0, maxDesc)}…` : description,
    });
  }
  return { kept, droppedCount };
}

/** 工具清单 → 每行 `工具名: 描述`，带条数与总长上限。 */
export function renderToolCatalog(tools, { maxTools = 80, maxChars = 6000 } = {}) {
  const all = Array.isArray(tools) ? tools : [];
  const lines = [];
  let used = 0;
  for (const tool of all) {
    if (lines.length >= maxTools || used >= maxChars) break;
    if (!tool || typeof tool.name !== 'string') continue;
    const line = tool.description ? `${tool.name}: ${tool.description}` : tool.name;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  const omitted = all.length - lines.length;
  if (omitted > 0) lines.push(`…（另有 ${omitted} 个工具未列出）`);
  return lines.join('\n');
}

/** 清洗模型输出：剥代码围栏、前言、标题行、包裹引号，折叠空行，限长。 */
export function sanitizeOptimization(input, { maxChars = 8000 } = {}) {
  let text = typeof input === 'string' ? input.trim() : '';
  if (!text) return null;
  const fenced = /^```[^\S\n]*[\w+-]*[^\S\n]*\n([\s\S]*?)\n```[^\S\n]*$/.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  } else {
    text = text
      .replace(/^```[^\S\n]*[\w+-]*[^\S\n]*\n/, '')
      .replace(/\n```[^\S\n]*$/, '')
      .trim();
  }
  const lead = /^(?:好的[，,]?\s*|没问题[，,]?\s*|以下是.{0,40}?[：:]\s*|优化后(?:的)?(?:指令|提示词|版本)?[：:]\s*|#{1,6}\s*(?:优化后|优化结果|指令)[^\n]*\n+|>\s*)/;
  for (let i = 0; i < 4; i++) {
    const next = text.replace(lead, '').trim();
    if (next === text) break;
    text = next;
  }
  const pairs = [['"', '"'], ["'", "'"], ['`', '`'], ['「', '」'], ['“', '”']];
  for (const [l, r] of pairs) {
    if (text.length > 2 && text.startsWith(l) && text.endsWith(r)) {
      text = text.slice(l.length, -r.length).trim();
      break;
    }
  }
  text = text.replace(/\n{3,}/g, '\n\n');
  if (text.length > maxChars) text = text.slice(0, maxChars).trimEnd();
  return text || null;
}

/** 校验优化输出，返回清洗后可用文本或 null。 */
export function validOptimization(input, original, { maxChars = 8000, minChars = 4 } = {}) {
  const text = sanitizeOptimization(input, { maxChars });
  if (!text || text.length < minChars) return null;
  const base = sanitizeOptimization(original, { maxChars }) || '';
  const norm = (s) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
  if (norm(text) === norm(base)) return null;
  if (/^(?:抱歉|对不起|我(?:无法|不能)|作为(?:一个)?\s*AI|as an ai)/i.test(text)) return null;
  return text;
}

/**
 * 按独占一行的 `---` 把模型输出拆成【优化正文】和【推荐小节】。
 * 优先取最后一个分隔线（推荐小节在末尾），但要求其后确实像推荐内容；
 * 否则退回第一个分隔线。没有分隔线时整段都是优化正文。
 * @returns {{ optimized: string, recommendations: string }}
 */
export function extractParts(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return { optimized: '', recommendations: '' };
  const lines = raw.split(/\r?\n/);
  const dividers = [];
  lines.forEach((line, i) => {
    if (/^\s*-{3,}\s*$/.test(line) || /^\s*\*{3,}\s*$/.test(line)) dividers.push(i);
  });
  if (!dividers.length) return { optimized: raw, recommendations: '' };

  const looksLikeRecs = (arr) => {
    const joined = arr.join('\n');
    return /推荐插件|^\s*[-*•]\s+/m.test(joined) || /💡/.test(joined);
  };
  let cut = null;
  for (let i = dividers.length - 1; i >= 0; i--) {
    const tail = lines.slice(dividers[i] + 1);
    if (looksLikeRecs(tail)) { cut = dividers[i]; break; }
  }
  if (cut === null) cut = dividers[0];

  const optimized = lines.slice(0, cut).join('\n').trim();
  const recommendations = lines.slice(cut + 1).join('\n').trim();
  return { optimized, recommendations };
}

/**
 * 把「💡 推荐插件」小节解析成结构化条目，供前端渲染卡片。
 * 兼容 `- 插件名（owner/repo）：说明` / `- name (owner/repo): desc` / 纯文本行。
 */
export function parseRecommendations(section) {
  if (!section || typeof section !== 'string') return [];
  const out = [];
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(?:💡\s*)?推荐插件/.test(line)) continue; // 小节标题
    if (!/^[-*•]/.test(line)) {
      if (out.length === 0 && !/^[-*•]/.test(line)) {
        out.push({ name: line, ownerRepo: '', reason: '', text: line });
      }
      continue;
    }
    const body = line.replace(/^[-*•]\s*/, '').trim();
    const m = /^(.+?)\s*[（(]([^）)]+)[）)]\s*[：:]\s*([\s\S]+)$/u.exec(body);
    if (m) {
      out.push({
        name: m[1].trim(),
        ownerRepo: m[2].trim(),
        reason: m[3].trim(),
        text: body,
      });
    } else {
      const m2 = /^(.+?)\s*[：:]\s*([\s\S]+)$/u.exec(body);
      out.push({
        name: m2 ? m2[1].trim() : body,
        ownerRepo: '',
        reason: m2 ? m2[2].trim() : '',
        text: body,
      });
    }
  }
  return out;
}
