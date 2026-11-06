/**
 * dsh 官方插件市场索引：竞速拉取 → 解析 → 减已装 → 按任务粗筛 → 截断 → 落盘缓存。
 *
 * 本机实测（2026-11-06）：三个源都返回同一份 3.78MB / 4704 条的 format-1 索引，
 * 但 awesome-dsh-plugin.com 秒回，jsdelivr 与 dshmarket 常要 12s+ 才超时。
 * 因此改成「三源并行竞速，首个解析成功者胜出，其余立即 abort」，
 * 效果等同计划 §5 的主/镜像兜底，且首次调用不会被慢源拖住。
 *
 * @module lib/plugin-discovery
 */
import fs from 'node:fs';
import path from 'node:path';

export const SOURCES = [
  { label: 'jsdelivr', url: 'https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json' },
  { label: 'awesome-dsh-plugin', url: 'https://awesome-dsh-plugin.com/index.json' },
  { label: 'dshmarket', url: 'https://dshmarket.com/index.json' },
];

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_FETCH_TIMEOUT_MS = 9_000;

/** 描述字段在 format-1 里是 {zh,en} 对象，不是字符串。 */
export function pickDescription(description, maxLen = 220) {
  let text = '';
  if (typeof description === 'string') text = description;
  else if (description && typeof description === 'object') text = description.zh || description.en || '';
  text = String(text).replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/** 顶层 plugins[] → 精简条目（可单测，喂本地样本即可）。 */
export function parseCatalogIndex(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const list = Array.isArray(data?.plugins) ? data.plugins : [];
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!name) continue;
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const repo = typeof p?.repository?.url === 'string' ? p.repository.url.trim() : '';
    const ownerRepo = title || (repo ? repo.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '') : '');
    out.push({
      name,
      title,
      ownerRepo,
      description: pickDescription(p.description),
      category: typeof p?.metadata?.category === 'string' ? p.metadata.category : '',
      repo,
      homepage: typeof p?.homepage === 'string' ? p.homepage : '',
    });
  }
  return out;
}

/** 归一化插件/工具标识，用于「已装」比较：去 scope、去 dsh- 前缀、去符号、小写。 */
export function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/^dsh[-_]?/, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

/** best-effort 减去已装集合（工具名 + profile dependencies）。 */
export function subtractInstalled(plugins, installed) {
  const set = new Set();
  for (const item of installed || []) {
    const key = normalizeKey(item);
    if (key) set.add(key);
  }
  if (!set.size) return Array.isArray(plugins) ? plugins : [];
  return (plugins || []).filter((p) => {
    const keys = [normalizeKey(p.name), normalizeKey(p.ownerRepo?.split('/').pop()), normalizeKey(p.title?.split('/').pop())];
    return !keys.some((k) => k && set.has(k));
  });
}

const CATEGORY_HINTS = [
  { re: /图片|生图|画图|图像|画图|插画|image|picture|draw|comfyui|stable.?diffusion/i, categories: ['image', 'media', 'multimodal', 'ui'] },
  { re: /视频|剪辑|video|ffmpeg|字幕/i, categories: ['video', 'media', 'av'] },
  { re: /搜索|检索|联网|search|web|fetch|crawl/i, categories: ['search', 'web', 'network'] },
  { re: /代码|编程|重构|调试|git|code|dev|refactor/i, categories: ['code', 'developer', 'git', 'engineering'] },
  { re: /文档|写作|报告|ppt|word|markdown|doc|writing/i, categories: ['doc', 'writing', 'office', 'document'] },
  { re: /记忆|笔记|知识库|memory|note|knowledge/i, categories: ['memory', 'knowledge', 'storage'] },
  { re: /终端|命令|shell|terminal|bash|ssh/i, categories: ['terminal', 'shell', 'system'] },
  { re: /浏览器|网页|browser|screenshot/i, categories: ['browser', 'ui', 'web'] },
  { re: /翻译|translate|i18n|locale/i, categories: ['i18n', 'translation'] },
  { re: /音乐|语音|音频|audio|music|tts|voice/i, categories: ['audio', 'voice', 'media'] },
];

/** 按草稿里的信号把同分类插件排到前面；无信号保持索引原顺序。 */
export function rankByHint(plugins, text = '') {
  const hit = CATEGORY_HINTS.find((x) => x.re.test(text || ''));
  if (!hit) return plugins || [];
  const wanted = new Set(hit.categories);
  const scored = (plugins || []).map((p, i) => ({ p, i, score: wanted.has(String(p.category || '').toLowerCase()) ? 1 : 0 }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((x) => x.p);
}

/**
 * 渲染成喂给模型的清单文本。
 * 每行只保留「名字（owner/repo）— 简短描述」：
 *   - ownerRepo 保留：它是可操作性信息，模型的推荐输出格式要填 owner/repo，用户靠它定位仓库；
 *   - category 去掉：市场分类对「这插件干什么」几乎没有增量，却白占位置；
 *   - description 二次截断：市场文案是完整简介（营销腔占一半），前 110 字符足够判断用途。
 *
 * mode 控制行格式：
 *   - 'flat'（默认）：逐条列表，最多约 40 条；
 *   - 'aggregated'：按市场分类聚合摘要（见 renderCatalogAggregated）。
 */
export function renderCatalog(plugins, { mode = 'flat', maxItems = 40, maxChars = 3500, descLen = 110 } = {}) {
  if (mode === 'aggregated') return renderCatalogAggregated(plugins, { maxChars });
  const lines = [];
  let used = 0;
  for (const p of plugins || []) {
    if (lines.length >= maxItems || used >= maxChars) break;
    const desc = String(p.description || '').slice(0, descLen);
    const line = `${p.name}(${p.ownerRepo || '未知仓库'}) — ${desc || '无描述'}`;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

/** 清单模式：flat=逐条扁平列表（默认）；aggregated=按分类聚合摘要。 */
export const CATALOG_MODES = ['flat', 'aggregated'];

/**
 * 分类聚合渲染：把插件按市场分类聚合成「分类摘要 + 少量样例」。
 *
 * 与扁平列表的区别：扁平列表在 3500 字预算内最多列约 40 个具体插件；
 * 聚合模式先按分类计数，每个分类给一行
 *   【image】128 个：name1(owner1)、name2(owner2)、name3(owner3) 等 128 个
 * 同等字数能覆盖全部分类（约 20 类、4704 个插件），让模型知道「有哪些种类」，
 * 适合「帮我找能做 X 的插件」这类泛需求，且更省 token。
 * 注意：缓存里存的是原始 plugins（未渲染），切换模式后下一次 /optimize 直接按新模式重渲，无需清缓存。
 *
 * @param {Array} plugins
 * @param {{maxCategories?:number, maxChars?:number, samplesPerCat?:number}} [opts]
 */
export function renderCatalogAggregated(plugins, { maxCategories = 24, maxChars = 3500, samplesPerCat = 3 } = {}) {
  const groups = new Map();
  for (const p of plugins || []) {
    const cat = String(p?.category || '').trim() || 'uncategorized';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(p);
  }
  // 分类多的排前面，让模型先看到体量最大的几个种类。
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const lines = [];
  let used = 0;
  for (const [cat, items] of sorted) {
    if (lines.length >= maxCategories) break;
    const samples = items.slice(0, samplesPerCat).map((p) => `${p.name}${p.ownerRepo ? `(${p.ownerRepo})` : ''}`);
    const more = items.length > samples.length ? ` 等 ${items.length} 个` : '';
    const line = `【${cat}】${items.length} 个：${samples.join('、')}${more}`;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

export function loadCache(cacheFile, ttlMs = CACHE_TTL_MS) {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (!raw || !Array.isArray(raw.plugins) || !raw.plugins.length) return null;
    if (Date.now() - Number(raw.at || 0) > ttlMs) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveCache(cacheFile, plugins, source) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const tmp = `${cacheFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), source, count: plugins.length, plugins }), 'utf8');
    fs.renameSync(tmp, cacheFile);
    return true;
  } catch {
    return false;
  }
}

export function clearCache(cacheFile) {
  try { fs.unlinkSync(cacheFile); return true; } catch { return false; }
}

/**
 * 竞速拉取索引（任一源成功即返回，其余 abort）。
 * @returns {Promise<{available:boolean, plugins:Array, catalogText:string, source:string, count:number, cached:boolean, error?:string}>}
 */
export async function fetchCatalog({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  cacheFile,
  force = false,
  installed = [],
  hint = '',
  ttlMs = CACHE_TTL_MS,
  catalogMode = 'flat',
} = {}) {
  if (!force && cacheFile) {
    const cached = loadCache(cacheFile, ttlMs);
    if (cached) {
      const remaining = subtractInstalled(cached.plugins, installed);
      const ranked = rankByHint(remaining, hint);
      return {
        available: true,
        plugins: ranked,
        catalogText: renderCatalog(ranked, { mode: catalogMode }),
        source: cached.source || 'cache',
        count: ranked.length,
        cached: true,
      };
    }
  }

  const controllers = SOURCES.map(() => new AbortController());
  const timers = [];
  const tasks = SOURCES.map(async ({ url, label }, i) => {
    const timer = setTimeout(() => controllers[i].abort(new Error('timeout')), timeoutMs);
    timers.push(timer);
    try {
      const res = await fetchImpl(url, { signal: controllers[i].signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const plugins = parseCatalogIndex(text);
      if (!plugins.length) throw new Error('索引里没有 plugins[]');
      return { plugins, source: label };
    } finally {
      clearTimeout(timer);
    }
  });

  let winner;
  try {
    winner = await Promise.any(tasks);
  } catch (error) {
    for (const c of controllers) { try { c.abort(); } catch { /* ignore */ } }
    for (const t of timers) clearTimeout(t);
    const reasons = (error?.errors || []).map((e) => e?.message || String(e)).slice(0, 3).join(' / ');
    return {
      available: false,
      plugins: [],
      catalogText: '(无)',
      source: 'none',
      count: 0,
      cached: false,
      error: reasons || '全部数据源不可达',
    };
  }
  for (const c of controllers) { try { c.abort(); } catch { /* ignore */ } }
  for (const t of timers) clearTimeout(t);

  if (cacheFile) saveCache(cacheFile, winner.plugins, winner.source);
  const remaining = subtractInstalled(winner.plugins, installed);
  const ranked = rankByHint(remaining, hint);
  return {
    available: true,
    plugins: ranked,
    catalogText: renderCatalog(ranked, { mode: catalogMode }),
    source: winner.source,
    count: ranked.length,
    cached: false,
  };
}
