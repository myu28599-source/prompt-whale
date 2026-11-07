/**
 * 工具清单相关性筛选。
 *
 * 问题：full 模式下宿主工具清单是「全量塞进去」的（59 条 / 6000 字符，宿主给什么顺序就什么顺序），
 * 但一次任务真正会用到的工具通常只有 2–5 个。清单越长，模型挑错工具的概率越高，
 * 而且每条都是要模型读完的输入 token。
 *
 * 做法：按草稿内容给工具打分，只把「相关的」喂给模型。分四档，从强到弱：
 *   1. 显式点名 —— 草稿里直接出现工具名 / mcp__ 前缀 → 必留，不受条数上限约束
 *      （红线：SYSTEM_PROMPT 第 4 条要求「工具名只能从清单里取」，
 *        用户点名的工具不在清单里，模型就不敢在产物里提它 —— 这是正确性问题）
 *   2. 类别命中 —— 草稿类别 ∩ 工具类别（图片/视频/联网/代码/文档/记忆/终端/文件/音视频/数据）
 *   3. 词面重合 —— 工具名与描述的词元和草稿的重叠
 *   4. 通用兜底 —— 文件读写、终端、搜索这类任何任务都可能用到的
 *
 * 类别判定分三档正则，避免误判：
 *   nameRe —— 只看工具名（最强信号：image_gen → image、ffmpeg → video）
 *   descRe —— 看工具描述（弱信号：描述里的普通词不算类别证据）
 *   hintRe —— 看草稿（宽松：口语也算，如「搜一下」「剪一下」）
 *
 * 兜底：一条都没命中时回退通用工具（再不行回退前若干条），
 * 绝不给模型一个空清单（空清单会让规则 4/5 退化成「不指定工具」）。
 *
 * @module lib/tool-relevance
 */

/** 真正的虚词才进停用表；有信息量的词（生成/图片/脚本…）不能滤。 */
const STOP_BIGRAMS = new Set([
  '帮我', '请帮', '一个', '一下', '这个', '那个', '我们', '你们', '他们', '需要', '可以', '应该',
  '怎么', '如何', '什么', '哪些', '为什', '所以', '因为', '但是', '如果', '然后', '以及', '并且',
  '现在', '直接', '自动', '不要', '不能', '必须', '已经', '还是', '就是', '不是', '一些', '进行',
  '通过', '关于', '对于', '给个', '给我', '我想', '我要', '你好', '谢谢', '麻烦', '之后', '之前',
  '其中', '以下', '以上', '这边', '那边', '上面', '下面', '把我', '把它', '这个', '一些',
]);

const CATEGORY_RULES = [
  {
    name: 'image',
    // 跨类框架/引擎（名字没 image 但能生图）：comfyui。其余靠 descRe 功能描述（图像生成/AI 绘画…）。
    nameRe: /(?:image|photo|picture|draw|paint|comfyui|diffusion|midjourney)/i,
    descRe: /(?:图片|生图|图像|画图|插画|海报|头像|壁纸|出图|绘图|图像生成|生成图片|AI 绘画|AI 绘图|作画|绘画)/i,
    hintRe: /(?:图片|图|生图|画|插画|海报|头像|壁纸|配图|绘图|image|photo|comfyui|画风|构图|画面|作图)/i,
  },
  {
    name: 'video',
    // 跨类框架（名字没 video 但专做视频）：comfyui（也能生视频）、remotion；格式 mp4/avi/mov/mkv/webm 也是强信号。
    // 具体视频模型/产品名不穷举，统一靠 descRe（视频生成/AI 视频/视频合成…）识别。
    // 注意 descRe 不用裸「合成」（语音/音频合成也会中招），只用「视频合成」等具体组合。
    nameRe: /(?:video|ffmpeg|srt|subtitle|clip|movie|remotion|mp4|avi|mov|mkv|webm|comfyui)/i,
    descRe: /(?:视频|剪辑|字幕|转场|渲染|画面|短片|动效|动画|视频生成|生成视频|AI 视频|视频合成|动画视频|生视频|视频制作|短视频)/i,
    hintRe: /(?:视频|剪辑|字幕|转场|短片|剪一下|剪个|做视频|生成视频|视频生成|video|ffmpeg|remotion|comfyui)/i,
  },
  {
    name: 'web',
    // 框架级：浏览器自动化 playwright/puppeteer、搜索引擎 google/bing；具体搜索 API 不穷举，靠 descRe。
    nameRe: /(?:search|web|fetch|crawl|browser|scrape|google|bing|playwright|puppeteer)/i,
    descRe: /(?:搜索|检索|联网|抓取|爬取|网页|浏览器|上网|浏览|联网搜索|网页抓取|浏览器自动化|访问网页|搜索网页|爬取网页)/i,
    hintRe: /(?:搜索|搜一下|搜下|查找|查询|检索|联网|抓取|爬取|网页|浏览器|上网|search|web|fetch|crawl)/i,
  },
  {
    name: 'code',
    // 框架/语言级：docker/kubernetes 容器编排、cargo/python/typescript/javascript 运行时；不列具体库。
    nameRe: /(?:code|git|repo|debug|refactor|test|lint|compile|patch|runner|docker|kubernetes|cargo|typescript|python|javascript)/i,
    descRe: /(?:代码|编程|重构|调试|编译|单元测试|仓库|提交|代码编写|编写代码|代码运行|程序开发|脚本编写)/i,
    hintRe: /(?:代码|编程|重构|调试|编译|单元测试|仓库|提交|写个脚本|脚本|git\b|code|refactor|debug)/i,
  },
  {
    name: 'doc',
    // 格式/排版级：latex/typst/epub/writer；具体笔记产品不穷举，靠 descRe（文档处理/写文档…）。
    nameRe: /(?:doc|word|ppt|slide|markdown|pdf|spreadsheet|excel|office|latex|typst|epub|writer)/i,
    descRe: /(?:文档|写作|报告|表格|演示|幻灯片|文档处理|生成文档|写文档|文档写作|表格处理)/i,
    hintRe: /(?:文档|写作|写份|报告|表格|演示|幻灯片|ppt|word|markdown)/i,
  },
  {
    name: 'memory',
    // 概念级：rag/vector/embedding 检索与向量；不列具体知识库产品。
    nameRe: /(?:memory|memor|note|knowledge|recall|rag|vector|embedding|memo|brain)/i,
    descRe: /(?:记忆|笔记|知识库|记忆存储|知识检索|笔记管理|向量检索)/i,
    hintRe: /(?:记忆|笔记|知识库|memory|note)/i,
  },
  {
    name: 'shell',
    // 协议/会话级：ssh/tmux；其余靠 descRe（执行命令/终端操作…）。
    nameRe: /(?:shell|terminal|bash|exec|cmd|powershell|zsh|ssh|tmux)/i,
    descRe: /(?:终端|命令行|脚本|执行命令|运行命令|终端操作|命令行操作)/i,
    hintRe: /(?:终端|命令行|脚本|命令|跑一下|执行一下|bash|shell|terminal)/i,
  },
  {
    name: 'file',
    // 概念/操作级：storage/bucket/drive 存储、download/upload/zip/archive 传输与压缩；不列具体云盘产品。
    nameRe: /(?:file|filesystem|dir|path|read|write|edit|glob|grep|notepad|storage|bucket|drive|download|upload|zip|archive)/i,
    descRe: /(?:文件|目录|路径|读写|保存到|文件操作|读写文件|目录管理|文件管理)/i,
    hintRe: /(?:文件|目录|路径|读写|保存到|存到|写入|file|directory)/i,
  },
  {
    name: 'media',
    // 具体语音/音乐服务商不穷举，统一靠 descRe（语音合成/文字转语音/音乐生成/配音生成…）。
    nameRe: /(?:audio|music|tts|voice|speech|sound|whisper)/i,
    descRe: /(?:音频|音乐|语音|配音|转写|语音合成|文字转语音|音乐生成|音频处理|语音识别|配音生成)/i,
    hintRe: /(?:音频|音乐|语音|配音|转写|录音|audio|music|tts|voice)/i,
  },
  {
    name: 'data',
    // 框架/库/功能级：pandas/numpy/spark/hadoop、parquet 格式、chart/graph/visualization 可视化；不列具体 BI 产品。
    nameRe: /(?:data|sql|csv|excel|db|database|analysis|analytics|pandas|numpy|spark|hadoop|parquet|chart|graph|visualization)/i,
    descRe: /(?:数据|分析|统计|数据库|数据分析|数据可视化|数据库查询|数据统计|数据清洗)/i,
    hintRe: /(?:数据|分析|统计|数据库|csv|excel|sql)/i,
  },
];

/** 通用工具：任何 agent 任务都可能用到，作为兜底保留少量代表。 */
const FALLBACK_TOOL_RE = /(?:^|[^a-z0-9])(read|write|edit|list|search|glob|grep|bash|shell|terminal|python|node|npm|git)(?:[^a-z0-9]|$)/i;

/** 词元化：英文/数字按词，中文按 2-gram。 */
export function tokenize(text) {
  const raw = String(text || '').toLowerCase();
  const words = raw.match(/[a-z0-9_]{2,}/g) || [];
  const runs = raw.match(/[一-龥]+/g) || [];
  const grams = [];
  for (const run of runs) {
    if (run.length === 1) { grams.push(run); continue; }
    for (let i = 0; i < run.length - 1; i += 1) {
      const g = run.slice(i, i + 2);
      if (!STOP_BIGRAMS.has(g)) grams.push(g);
    }
  }
  return words.concat(grams);
}

/** 草稿命中的类别（宽松口径）。 */
export function hintCategories(text) {
  const raw = String(text || '');
  const out = new Set();
  for (const rule of CATEGORY_RULES) if (rule.hintRe.test(raw)) out.add(rule.name);
  return out;
}

/** 工具所属类别：name 命中算强证据，desc 命中算弱证据。 */
export function toolCategories(tool) {
  const name = new Set();
  const desc = new Set();
  const n = String(tool?.name || '');
  const d = String(tool?.description || '');
  for (const rule of CATEGORY_RULES) {
    if (rule.nameRe.test(n)) name.add(rule.name);
    if (rule.descRe.test(d)) desc.add(rule.name);
  }
  return { name, desc };
}

/**
 * 常见英文词：出现在工具名里**不足以**证明用户点名了它。
 * 反例：草稿写「在 GitHub 建 issue」曾让所有含 issue/create 的工具都被判「点名」，
 * 一口气必留 28 条 —— 点名必须是「原名」或「动作名」这种具体标识。
 */
const COMMON_WORDS = new Set([
  'read', 'write', 'edit', 'list', 'create', 'update', 'delete', 'remove', 'search', 'fetch',
  'open', 'close', 'start', 'stop', 'run', 'exec', 'execute', 'call', 'send', 'get', 'set', 'add',
  'insert', 'append', 'copy', 'move', 'rename', 'check', 'scan', 'sync', 'watch', 'build', 'deploy',
  'publish', 'install', 'uninstall', 'generate', 'render', 'convert', 'parse', 'format', 'print',
  'draw', 'image', 'video', 'audio', 'text', 'json', 'yaml', 'data', 'name', 'type', 'path', 'dir',
  'file', 'files', 'folder', 'line', 'log', 'debug', 'test', 'step', 'plan', 'todo', 'note', 'notes',
  'user', 'role', 'group', 'tool', 'tools', 'plugin', 'config', 'setting', 'settings', 'session',
  'memory', 'chat', 'message', 'prompt', 'model', 'token', 'api', 'key', 'value', 'size', 'count',
  'time', 'date', 'issue', 'issues', 'pull', 'merge', 'branch', 'commit', 'push', 'status', 'view',
  'show', 'dump', 'load', 'save', 'page', 'item', 'task', 'tree', 'node', 'diff', 'code', 'repo',
  'server', 'client', 'agent', 'result', 'output', 'input', 'source', 'target', 'current', 'new',
  'old', 'info', 'detail', 'details', 'summary', 'preview', 'apply', 'make', 'change', 'modify',
  'handle', 'process', 'manage', 'control', 'project', 'workspace', 'global', 'local', 'main',
  'default', 'custom', 'general', 'advanced', 'basic', 'simple', 'editor', 'contents', 'content',
]);

/**
 * 草稿是否显式点名了这个工具。
 * 判定顺序（从强到弱）：
 *   1. 工具原名出现在草稿里（如 `mcp__github__create_issue`）
 *   2. 空格化短语出现在草稿里（如 `github create issue`）
 *   3. 动作段完整形式出现在草稿里（如 `create_issue`）
 *   4. 动作段里有「独特片段」（≥5 字符且不是常见词）出现在草稿里
 * 只有描述意图（"在 GitHub 建个 issue"）不算点名 —— 那属于相关性打分的事。
 */
export function explicitMention(tool, text) {
  const hay = String(text || '').toLowerCase();
  if (!hay) return false;
  const rawName = String(tool?.name || '').toLowerCase();
  if (!rawName) return false;
  if (hay.includes(rawName)) return true;

  const core = rawName.replace(/^mcp__/, '').replace(/^__/, '');
  const phrase = core.replace(/[._\-/]+/g, ' ').trim();
  if (phrase.length >= 6 && hay.includes(phrase)) return true;

  const segs = core.split('__');
  const action = segs.length > 1 ? segs.slice(1).join('__') : core;
  if (action.length >= 5 && hay.includes(action)) return true;

  const parts = action.split(/[._\-/]+/).filter((p) => p.length >= 5 && !COMMON_WORDS.has(p));
  return parts.some((p) => hay.includes(p));
}

/** 清单里一行的长度（与 renderToolCatalog 的格式一致）。 */
function lineLength(tool) {
  const desc = typeof tool?.description === 'string' ? tool.description : '';
  return `${tool?.name || ''}${desc ? `: ${desc}` : ''}`.length + 1;
}

/**
 * 按草稿相关性筛选工具清单。
 *
 * @param {Array<{name:string, description?:string}>} tools 候选工具（已过滤黑名单）
 * @param {string} text 原始草稿
 * @param {{maxTools?:number, maxChars?:number, fallbackLimit?:number}} opts
 * @returns {{kept:Array, items:Array, total:number, dropped:number, explicit:number,
 *            generic:number, chars:number, fallback:boolean, reason:string}}
 */
export function rankToolsByRelevance(tools, text, { maxTools = 15, maxChars = 2500, fallbackLimit = 5 } = {}) {
  const list = Array.isArray(tools) ? tools : [];
  if (!list.length) {
    return { kept: [], items: [], total: 0, dropped: 0, explicit: 0, generic: 0, chars: 0, fallback: false, reason: '没有可用工具' };
  }
  const draftTokens = new Set(tokenize(text));
  const wanted = hintCategories(text);

  const scored = list.map((tool, index) => {
    const hay = `${tool?.name || ''} ${typeof tool?.description === 'string' ? tool.description : ''}`;
    const explicit = explicitMention(tool, text);
    const cats = toolCategories(tool);
    const catHit = [...cats.name].filter((c) => wanted.has(c));
    const catSoft = [...cats.desc].filter((c) => wanted.has(c) && !cats.name.has(c));
    const overlap = tokenize(hay).filter((t) => draftTokens.has(t)).length;
    const generic = FALLBACK_TOOL_RE.test(String(tool?.name || ''));
    let score = 0;
    const reasons = [];
    if (explicit) { score += 100; reasons.push('点名'); }
    if (catHit.length) { score += 30 * catHit.length; reasons.push(`类别:${catHit.join('/')}`); }
    if (catSoft.length) { score += 12 * catSoft.length; reasons.push(`弱类别:${catSoft.join('/')}`); }
    if (overlap >= 2) { score += Math.min(overlap, 6) * 4; reasons.push(`重合${overlap}`); }
    if (generic) { score += 4; reasons.push('通用'); }
    return { tool, index, score, explicit, generic, reasons };
  });

  // 显式点名优先，且不受 maxTools / maxChars 约束（正确性优先）
  const explicitItems = scored.filter((x) => x.explicit);
  const relevant = scored
    .filter((x) => !x.explicit && !x.generic && x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  // 通用工具单独成组并封顶，避免 read/write/search/bash 这一族吃掉整个预算
  const generics = scored
    .filter((x) => !x.explicit && x.generic)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const kept = [...explicitItems];
  let used = kept.reduce((sum, x) => sum + lineLength(x.tool), 0);
  for (const item of relevant) {
    if (kept.length >= maxTools) break;
    const len = lineLength(item.tool);
    if (used + len > maxChars) continue; // 超长的跳过，继续看下一条短的
    kept.push(item);
    used += len;
  }
  for (const item of generics.slice(0, fallbackLimit)) {
    if (kept.length >= maxTools) break;
    const len = lineLength(item.tool);
    if (used + len > maxChars) continue;
    kept.push(item);
    used += len;
  }

  let fallback = false;
  let reason = '按相关性筛选';
  if (kept.length === 0) {
    fallback = true;
    reason = '无相关性信号，回退通用工具';
    for (const item of scored.filter((x) => x.generic).slice(0, fallbackLimit)) {
      kept.push(item);
      used += lineLength(item.tool);
    }
    if (kept.length === 0) {
      reason = '无相关性信号，回退前若干条';
      for (const item of scored.slice(0, maxTools)) {
        kept.push(item);
        used += lineLength(item.tool);
      }
    }
  }

  const genericCount = kept.filter((x) => x.generic).length;
  return {
    kept: kept.map((x) => x.tool),
    items: kept.map((x) => ({ name: x.tool?.name, score: x.score, reasons: x.reasons, explicit: x.explicit })),
    total: list.length,
    dropped: list.length - kept.length,
    explicit: explicitItems.length,
    generic: genericCount,
    chars: used,
    fallback,
    reason: genericCount ? `${reason}（含通用兜底 ${genericCount} 条）` : reason,
  };
}
