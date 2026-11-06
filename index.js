/**
 * 🐋 鲸语提示词助手 prompt-whale —— node 侧。
 *
 * 挂载机制（沿用已验证蓝本 dsh-prompt-optimizer v0.3.0，app.asar 0.2.2-rc.1 实测）：
 *   - ctx.tools.view() → visible.entries() 取当前可用工具清单（inject: ['tools']）；
 *   - ctx.inject(['webServer'], s => s.effect(() => s.webServer.register({kind:'prefix', path:'/prompt-whale'}, id)))；
 *   - 前端由 package.json 的 dsh.client 声明，client.js 挂 dock 与 settings.section。
 *
 * 本插件不做发送前拦截：用户写好草稿 → 点小鲸鱼 → 浮层展示优化版 → 替换/取消。
 * 任何失败都不动输入框，只把可读错误显示在浮层里。
 *
 * @module prompt-whale
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BLACKLIST,
  filterTools,
  renderToolCatalog,
  parseRecommendations,
  buildOptimizeRequest,
  SYSTEM_PROMPT,
  IMAGE_MODES,
  appendImageDirective,
} from './lib/logic.js';
import {
  classifyToolNeed,
  buildLeanRequest,
  LEAN_SYSTEM_PROMPT,
  FULL_CONTEXT_OVERHEAD_CHARS,
  CATALOG_POLICIES,
} from './lib/context-policy.js';
import { rankToolsByRelevance } from './lib/tool-relevance.js';
import { createProvider, isProviderName, PROVIDER_META, PROVIDER_ORDER } from './lib/providers/index.js';
import { fetchCatalog, clearCache, CATALOG_MODES } from './lib/plugin-discovery.js';

export const name = 'prompt-whale';
export const inject = ['tools'];

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const STATE_DIR = path.join(DSH_HOME, 'storages', 'prompt-whale');
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
const STATS_FILE = path.join(STATE_DIR, 'stats.json');
const CACHE_FILE = path.join(STATE_DIR, 'plugin-cache.json');
const DIAG_FILE = path.join(STATE_DIR, 'diag.json');
const HEARTBEAT_FILE = path.join(STATE_DIR, 'heartbeat.json');
const UI_FILE = path.join(STATE_DIR, 'dock-ui.json');
const DEFAULT_UI = { mode: 'dock', x: 0, y: 0, size: 20 };

/** 按钮外观：mode=dock 停靠输入框旁；float 时按 x/y 固定定位，size 为头像边长。 */
function loadUi() {
  try {
    const raw = JSON.parse(fs.readFileSync(UI_FILE, 'utf8'));
    return {
      mode: raw.mode === 'float' ? 'float' : 'dock',
      x: Number.isFinite(raw.x) ? Math.max(0, Math.round(raw.x)) : 0,
      y: Number.isFinite(raw.y) ? Math.max(0, Math.round(raw.y)) : 0,
      size: Number.isFinite(raw.size) ? Math.min(96, Math.max(16, Math.round(raw.size))) : 20,
    };
  } catch { return { ...DEFAULT_UI }; }
}

function saveUi(patch) {
  const raw = { ...loadUi(), ...(patch || {}) };
  const next = {
    mode: raw.mode === 'float' ? 'float' : 'dock',
    x: Math.max(0, Math.round(Number(raw.x) || 0)),
    y: Math.max(0, Math.round(Number(raw.y) || 0)),
    size: Math.min(96, Math.max(16, Math.round(Number(raw.size) || 20))),
  };
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(UI_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
const PROFILE_PKG = path.join(DSH_HOME, 'profiles', 'desktop', 'package.json');
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');

const MAX_INPUT_CHARS = 8_000;
const MAX_BODY_BYTES = 128 * 1024;
const CATALOG_TTL_MS = 5_000;
/** full 模式下喂给模型的工具清单预算（按草稿相关性筛选后）。 */
const TOOL_LIST_MAX = 15;
const TOOL_LIST_CHARS = 2_500;

const DEFAULT_CONFIG = {
  enabled: true,
  catalogPolicy: 'auto',
  catalogMode: 'flat',
  imageMode: 'auto-style',
  provider: 'agnes',
  models: {},
  baseURLs: {},
  timeoutMs: 60_000,
  temperature: 0.3,
  hy4Think: false,
  blacklist: DEFAULT_BLACKLIST,
};

const DEFAULT_STATS = { optimized: 0, failed: 0, replaced: 0, cancelled: 0, since: 0 };

/**
 * 宿主把 cordis patch 的 config.enabled 传进 apply 的第二个参数。
 * 不同插件里它可以是布尔，也可以是响应式 store（config.enabled.get()），
 * 两种都兼容；缺省视为启用。
 */
function readEnabled(config) {
  const value = config?.enabled;
  if (value === undefined || value === null) return true;
  if (typeof value === 'boolean') return value;
  if (typeof value?.get === 'function') {
    try { return value.get() !== false; } catch { return true; }
  }
  return value !== false;
}

/**
 * 宿主「插件面板」开关写的是 cordis.patch.yml 里一条独立条目
 *   - id: prompt-whale
 *     disabled: true
 * （dsh-plugin-manager 的 writePluginEnabled），不是 config.enabled。
 * 本地 file: 插件靠顶层 - insert: 挂载，宿主面板可能判为 unaddressable 而写不进去；
 * 但只要写进去了，这里就能读到，控制面立刻报「已停用」。
 */
function hostPatchDisabled() {
  try {
    const profilesDir = path.join(DSH_HOME, 'profiles');
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let text;
      try { text = fs.readFileSync(path.join(profilesDir, entry.name, 'cordis.patch.yml'), 'utf8'); }
      catch { continue; }
      // 只匹配顶层独立条目；- insert: 里的同名 config.enabled 不会被误伤。
      if (/^- id:\s*prompt-whale\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+disabled:\s*true\b/m.test(text)) return true;
    }
  } catch { /* 读不到 profile 就按未停用处理 */ }
  return false;
}

/** 三处开关取与：cordis config.enabled、插件自身 config.json.enabled、宿主 patch 的 disabled。 */
function effectiveEnabled(config) {
  return readEnabled(config) && loadConfig().enabled !== false && !hostPatchDisabled();
}

// ── 配置 / 统计 / Key ────────────────────────────────────────────────────────
let configCache = null;
let configCacheMtime = -1;

function loadConfig() {
  try {
    const st = fs.statSync(CONFIG_FILE);
    if (configCache && st.mtimeMs === configCacheMtime) return configCache;
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const next = {
      ...DEFAULT_CONFIG,
      ...raw,
      provider: isProviderName(raw.provider) ? raw.provider : DEFAULT_CONFIG.provider,
      models: raw.models && typeof raw.models === 'object' ? raw.models : {},
      baseURLs: raw.baseURLs && typeof raw.baseURLs === 'object' ? raw.baseURLs : {},
      blacklist: Array.isArray(raw.blacklist) ? raw.blacklist : DEFAULT_CONFIG.blacklist,
      timeoutMs: Number.isFinite(raw.timeoutMs) ? Math.min(120_000, Math.max(3_000, raw.timeoutMs)) : DEFAULT_CONFIG.timeoutMs,
      temperature: Number.isFinite(raw.temperature) ? Math.min(1, Math.max(0, raw.temperature)) : DEFAULT_CONFIG.temperature,
      hy4Think: typeof raw.hy4Think === 'boolean' ? raw.hy4Think : DEFAULT_CONFIG.hy4Think,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_CONFIG.enabled,
      catalogPolicy: CATALOG_POLICIES.includes(raw.catalogPolicy) ? raw.catalogPolicy : DEFAULT_CONFIG.catalogPolicy,
      catalogMode: CATALOG_MODES.includes(raw.catalogMode) ? raw.catalogMode : DEFAULT_CONFIG.catalogMode,
      imageMode: IMAGE_MODES.includes(raw.imageMode) ? raw.imageMode : DEFAULT_CONFIG.imageMode,
    };
    configCache = next;
    configCacheMtime = st.mtimeMs;
    return next;
  } catch {
    return { ...DEFAULT_CONFIG, models: {}, baseURLs: {}, blacklist: [...DEFAULT_BLACKLIST] };
  }
}

function saveConfig(patch) {
  const current = loadConfig();
  const next = { ...current, ...patch };
  if (patch.provider !== undefined && !isProviderName(patch.provider)) throw new TypeError('provider 不合法');
  if (patch.models !== undefined && (!patch.models || typeof patch.models !== 'object' || Array.isArray(patch.models))) throw new TypeError('models 必须是对象');
  if (patch.baseURLs !== undefined && (!patch.baseURLs || typeof patch.baseURLs !== 'object' || Array.isArray(patch.baseURLs))) throw new TypeError('baseURLs 必须是对象');
  if (patch.blacklist !== undefined && (!Array.isArray(patch.blacklist) || patch.blacklist.some((x) => typeof x !== 'string'))) throw new TypeError('blacklist 必须是字符串数组');
  if (patch.hy4Think !== undefined && typeof patch.hy4Think !== 'boolean') throw new TypeError('hy4Think 必须是布尔');
  if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') throw new TypeError('enabled 必须是布尔');
  if (patch.catalogPolicy !== undefined && !CATALOG_POLICIES.includes(patch.catalogPolicy)) throw new TypeError('catalogPolicy 必须是 auto / always / never');
  if (patch.catalogMode !== undefined && !CATALOG_MODES.includes(patch.catalogMode)) throw new TypeError('catalogMode 必须是 flat / aggregated');
  if (patch.imageMode !== undefined && !IMAGE_MODES.includes(patch.imageMode)) throw new TypeError('imageMode 必须是 auto-style / follow-intent');
  if (patch.timeoutMs !== undefined) {
    const v = Number(patch.timeoutMs);
    if (!Number.isFinite(v)) throw new TypeError('timeoutMs 必须是数字');
    next.timeoutMs = Math.min(120_000, Math.max(3_000, v));
  }
  if (patch.temperature !== undefined) {
    const v = Number(patch.temperature);
    if (!Number.isFinite(v)) throw new TypeError('temperature 必须是数字');
    next.temperature = Math.min(1, Math.max(0, v));
  }
  // 深度思考会生成极长 reasoning_content：切换开关时自动联动超时（显式传 timeoutMs 优先）。
  if (patch.hy4Think !== undefined && patch.timeoutMs === undefined) {
    next.timeoutMs = patch.hy4Think ? 120_000 : 60_000;
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, CONFIG_FILE);
  configCache = next;
  configCacheMtime = -1;
  return next;
}

function keyFile(provider) {
  return path.join(STATE_DIR, `${provider}.key`);
}

/** 优先级：设置面板落盘的 key > 环境变量。 */
function loadKey(provider) {
  try {
    const key = fs.readFileSync(keyFile(provider), 'utf8').trim();
    if (key) return key;
  } catch { /* 未保存则走环境变量 */ }
  const meta = PROVIDER_META[provider];
  if (!meta) return '';
  return (process.env[meta.envKey] || (provider === 'hunyuan' ? process.env.HY4_API_KEY : '') || '').trim();
}

function saveKey(provider, key) {
  if (!isProviderName(provider)) throw new TypeError('provider 不合法');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const file = keyFile(provider);
  const value = String(key || '').trim();
  if (!value) {
    try { fs.unlinkSync(file); } catch { /* 本来就没有 */ }
    return false;
  }
  fs.writeFileSync(file, value, { encoding: 'utf8', mode: 0o600 });
  return true;
}

function loadStats() {
  try { return { ...DEFAULT_STATS, ...JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) }; }
  catch { return { ...DEFAULT_STATS }; }
}

function bumpStats(patch) {
  const next = { ...loadStats() };
  for (const [k, v] of Object.entries(patch)) if (typeof v === 'number') next[k] = (next[k] || 0) + v;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const tmp = `${STATS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, STATS_FILE);
  } catch { /* 统计失败不阻塞 */ }
  return next;
}

/** 已装插件标识：profile 的 dependencies keys（best-effort，配合工具清单一起做减法）。 */
function installedPlugins() {
  const set = new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(PROFILE_PKG, 'utf8'));
    for (const dep of Object.keys(pkg?.dependencies || {})) set.add(dep);
  } catch { /* 读不到就只靠工具名 */ }
  return [...set];
}

function isSafeOrigin(origin, host) {
  if (!origin) return true; // 同源 <img> / fetch 通常不带 Origin
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.host === host) return true;
    return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(u.hostname) || u.hostname === '[::1]' || u.hostname.endsWith('.localhost');
  } catch { return false; }
}

export function apply(ctx, config = {}) {
  const log = ctx.logger || console;
  const startedAt = Date.now();
  // 关闭插件时连控制面都不注册：client 心跳会因此失败并自行撤掉 UI。
  if (!readEnabled(config)) {
    log.info?.(`[${name}] config.enabled=false，跳过全部注册`);
    return;
  }

  // ── 工具清单（5s 缓存）────────────────────────────────────────────────────
  let catalogCache = null;
  let catalogAt = 0;
  let catalogKey = '';
  function buildCatalog({ force = false } = {}) {
    const cfg = loadConfig();
    const key = JSON.stringify(cfg.blacklist);
    if (!force && catalogCache && Date.now() - catalogAt < CATALOG_TTL_MS && key === catalogKey) return catalogCache;
    let entries = [];
    try {
      const view = ctx.tools.view();
      entries = [...view.visible.entries()].map(([toolName, definition]) => ({
        name: toolName,
        description: typeof definition?.description === 'string' ? definition.description : '',
      }));
    } catch (error) {
      log.warn?.(`[${name}] 读取工具清单失败：${error?.message || error}`);
    }
    const { kept, droppedCount } = filterTools(entries, { blacklist: cfg.blacklist });
    catalogCache = { catalog: renderToolCatalog(kept), total: entries.length, kept: kept.length, dropped: droppedCount, names: entries.map((e) => e.name), entries: kept };
    catalogAt = Date.now();
    catalogKey = key;
    return catalogCache;
  }

  // ── 优化主流程 ────────────────────────────────────────────────────────────
  async function optimizeOnce(rawText, { task } = {}) {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) return { ok: false, error: '输入框里还没有内容，先写点什么再点小鲸鱼' };
    if (text.length > MAX_INPUT_CHARS) return { ok: false, error: `草稿超过 ${MAX_INPUT_CHARS} 字，先精简一下` };
    if (text.startsWith('/')) return { ok: false, error: '斜杠指令不做润色，直接发送即可' };

    const cfg = loadConfig();
    const provider = createProvider(cfg.provider, cfg);
    const apiKey = loadKey(cfg.provider);
    if (!apiKey) {
      return {
        ok: false,
        error: `请先在设置页填写 ${provider.label} 的 API Key（也可设置环境变量 ${provider.envKey}）`,
        code: 'no-key',
      };
    }

    // 生图模式：task==='image' 时按 config.imageMode 给优化器追加风格指令。
    const isImage = task === 'image';
    const imageMode = isImage ? cfg.imageMode : undefined;

    const t0 = Date.now();
    // 纯本地判断（零 API 调用、零 token）：不需要工具的草稿连清单都不读。
    const decision = classifyToolNeed(text, cfg.catalogPolicy);
    const lean = !decision.need;
    let built = { catalog: '', kept: 0, names: [], entries: [], total: 0 };
    let discovery = { available: false, catalogText: '(无)', source: 'none', count: 0, cached: false };
    let discoveryMs = 0;
    let toolsText = '';
    let toolRelevance = null;
    if (!lean) {
      built = buildCatalog();
      const installed = [...installedPlugins(), ...built.names];
      try {
        discovery = await fetchCatalog({ cacheFile: CACHE_FILE, installed, hint: text, catalogMode: cfg.catalogMode });
      } catch (error) {
        discovery = { available: false, catalogText: '(无)', source: 'none', count: 0, cached: false, error: error?.message || String(error) };
      }
      discoveryMs = Date.now() - t0;
      // 按草稿相关性筛选工具清单：只把这次真用得上的喂给模型（点名必留 + 相关优先 + 通用封顶）
      toolRelevance = rankToolsByRelevance(built.entries, text, { maxTools: TOOL_LIST_MAX, maxChars: TOOL_LIST_CHARS });
      toolsText = renderToolCatalog(toolRelevance.kept, { maxTools: toolRelevance.kept.length, maxChars: TOOL_LIST_CHARS });
    }
    const recs = discovery.available ? discovery.catalogText : '(无)';
    const baseRequest = lean ? buildLeanRequest(text) : buildOptimizeRequest(text, toolsText, recs);
    // 生图任务：把风格指令追加进 system（非生图任务原样透传，零影响）。
    const request = isImage ? appendImageDirective(baseRequest, imageMode) : baseRequest;
    const promptChars = request.system.length + request.userContent.length;
    const systemSaved = SYSTEM_PROMPT.length - LEAN_SYSTEM_PROMPT.length;

    try {
      const result = await provider.optimize({
        text,
        tools: built.catalog,
        recs,
        apiKey,
        timeoutMs: cfg.timeoutMs,
        temperature: cfg.temperature,
        model: cfg.models[cfg.provider] || provider.defaultModel,
        baseURL: cfg.baseURLs[cfg.provider] || provider.baseURL,
        request,
        // hy4Think=true 时传空对象覆盖 meta.extraBody，让 Hy4 恢复深度思考。
        extraBody: cfg.provider === 'hunyuan' && cfg.hy4Think ? {} : undefined,
      });
      bumpStats({ optimized: 1 });
      return {
        ok: true,
        optimized: result.optimized,
        recommendations: result.recommendations,
        recommendationsParsed: parseRecommendations(result.recommendations),
        meta: {
          provider: cfg.provider,
          providerLabel: provider.label,
          model: result.model,
          contextMode: lean ? 'lean' : 'full',
          contextReason: decision.reason,
          catalogPolicy: decision.policy,
          catalogMode: cfg.catalogMode,
          catalogStyle: cfg.catalogMode === 'aggregated' ? '分类聚合' : '扁平列表',
          task: isImage ? 'image' : 'general',
          imageMode: isImage ? imageMode : 'n/a',
          imageDirectiveApplied: isImage,
          promptChars,
          contextSavedChars: lean ? FULL_CONTEXT_OVERHEAD_CHARS + systemSaved : 0,
          skippedDiscovery: lean,
          toolsCount: toolRelevance?.kept.length ?? 0,
          toolsKept: toolRelevance?.kept.length ?? 0,
          toolsTotal: built.total ?? 0,
          toolsDropped: toolRelevance?.dropped ?? 0,
          toolsExplicit: toolRelevance?.explicit ?? 0,
          toolsGeneric: toolRelevance?.generic ?? 0,
          toolsReason: toolRelevance?.reason || '',
          recsAvailable: discovery.available,
          recsCount: discovery.count || 0,
          recsShown: discovery.available ? discovery.catalogText.split('\n').filter(Boolean).length : 0,
          recsSource: discovery.source,
          recsCached: !!discovery.cached,
          discoveryMs,
          totalMs: Date.now() - t0,
        },
      };
    } catch (error) {
      bumpStats({ failed: 1 });
      log.warn?.(`[${name}] 优化失败：${error?.message || error}`);
      return { ok: false, error: error?.message || String(error), code: error?.code || 'unknown' };
    }
  }

  // ── HTTP 控制面 ───────────────────────────────────────────────────────────
  async function readBody(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        try { req.destroy(); } catch { /* ignore */ }
        throw new Error(`请求体超过 ${Math.round(MAX_BODY_BYTES / 1024)}KB 上限`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  function sendJson(res, code, payload) {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
  }

  function serveAsset(res, filename) {
    const allow = { 'whale-idle.gif': 'image/gif', 'whale-idle.png': 'image/png' };
    const type = allow[filename];
    if (!type) return sendJson(res, 404, { ok: false, error: 'asset not found' });
    try {
      const buf = fs.readFileSync(path.join(ASSETS_DIR, filename));
      res.statusCode = 200;
      res.setHeader('content-type', type);
      res.setHeader('cache-control', 'public, max-age=86400');
      res.end(buf);
    } catch (error) {
      sendJson(res, 404, { ok: false, error: `asset 读取失败：${error?.message || error}` });
    }
  }

  ctx.inject(['webServer'], (scoped) => {
    scoped.effect(() => {
      const disposeRoute = scoped.webServer.register({
        kind: 'prefix',
        path: '/prompt-whale',
        handler: async (req, res) => {
          const json = (code, payload) => sendJson(res, code, payload);
          try {
            const host = req.headers.host || 'localhost';
            if (!isSafeOrigin(req.headers.origin, host)) return json(403, { ok: false, error: 'forbidden origin' });
            const url = new URL(req.url || '/', `http://${host}`);
            const { pathname } = url;

            // 软停用：保留控制面（前端心跳据此撤 UI / 恢复），功能路由一律 404。
            const on = effectiveEnabled(config);
            const controlPlane = pathname === '/prompt-whale/state'
              || pathname === '/prompt-whale/health'
              || pathname === '/prompt-whale/heartbeat'
              || pathname === '/prompt-whale/config';
            if (!on && !controlPlane && !pathname.startsWith('/prompt-whale/asset/')) {
              return json(404, { ok: false, error: '插件已停用', enabled: false });
            }

            if (req.method === 'GET' && pathname.startsWith('/prompt-whale/asset/')) {
              return serveAsset(res, pathname.slice('/prompt-whale/asset/'.length));
            }

            if (req.method === 'GET' && pathname === '/prompt-whale/state') {
              const cfg = loadConfig();
              return json(200, {
                ok: true,
                enabled: on,
                ui: loadUi(),
                config: cfg,
                providers: PROVIDER_ORDER.map((id) => {
                  const meta = PROVIDER_META[id];
                  return {
                    ...meta,
                    model: cfg.models[id] || meta.defaultModel,
                    baseURL: cfg.baseURLs[id] || meta.baseURL,
                    hasKey: !!loadKey(id),
                  };
                }),
                catalog: buildCatalog(),
                stats: { ...loadStats(), since: startedAt },
                cachePresent: fs.existsSync(CACHE_FILE),
              });
            }

            if (req.method === 'GET' && pathname === '/prompt-whale/catalog') {
              return json(200, { ok: true, ...buildCatalog({ force: true }) });
            }

            if (req.method === 'GET' && pathname === '/prompt-whale/health') {
              const cfg = loadConfig();
              return json(200, {
                ok: true,
                name,
                provider: cfg.provider,
                model: cfg.models[cfg.provider] || PROVIDER_META[cfg.provider].defaultModel,
                hasKey: !!loadKey(cfg.provider),
                uptimeMs: Date.now() - startedAt,
                enabled: on,
              });
            }

            if (req.method === 'POST' && pathname === '/prompt-whale/config') {
              const body = JSON.parse((await readBody(req)) || '{}');
              const patch = {};
              for (const key of ['enabled', 'catalogPolicy', 'catalogMode', 'imageMode', 'provider', 'models', 'baseURLs', 'timeoutMs', 'temperature', 'blacklist', 'hy4Think']) {
                if (body[key] !== undefined) patch[key] = body[key];
              }
              return json(200, { ok: true, config: saveConfig(patch) });
            }

            if (req.method === 'POST' && pathname === '/prompt-whale/keys') {
              const body = JSON.parse((await readBody(req)) || '{}');
              const provider = String(body.provider || '');
              if (!isProviderName(provider)) return json(400, { ok: false, error: 'provider 不合法' });
              const saved = saveKey(provider, body.key);
              return json(200, { ok: true, provider, hasKey: saved });
            }

            if (req.method === 'POST' && pathname === '/prompt-whale/cache/clear') {
              return json(200, { ok: true, cleared: clearCache(CACHE_FILE) });
            }

            if (req.method === 'POST' && pathname === '/prompt-whale/stat') {
              const body = JSON.parse((await readBody(req)) || '{}');
              const action = String(body.action || '');
              if (action === 'replaced' || action === 'cancelled') bumpStats({ [action]: 1 });
              return json(200, { ok: true, stats: loadStats() });
            }

            if (req.method === 'POST' && pathname === '/prompt-whale/diag') {
              const body = JSON.parse((await readBody(req)) || '{}');
              try {
                fs.mkdirSync(STATE_DIR, { recursive: true });
                fs.writeFileSync(DIAG_FILE, JSON.stringify({ at: Date.now(), ...body }, null, 2), 'utf8');
              } catch { /* 诊断落盘失败不影响功能 */ }
              return json(200, { ok: true });
            }

            if (req.method === 'GET' && pathname === '/prompt-whale/diag') {
              try { return json(200, { ok: true, diag: JSON.parse(fs.readFileSync(DIAG_FILE, 'utf8')) }); }
              catch { return json(200, { ok: false, error: '尚无诊断数据' }); }
            }

            if (req.method === 'POST' && pathname === '/prompt-whale/heartbeat') {
              const body = JSON.parse((await readBody(req)) || '{}');
              const snapshot = {
                at: Date.now(),
                seq: Number(body.seq) || 0,
                mounted: body.mounted !== false,
                enabled: on,
              };
              try {
                fs.mkdirSync(STATE_DIR, { recursive: true });
                fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
              } catch { /* 落盘失败不影响响应 */ }
              return json(200, { ok: true, enabled: snapshot.enabled, at: snapshot.at });
            }

            if (req.method === 'GET' && pathname === '/prompt-whale/heartbeat') {
              try { return json(200, { ok: true, heartbeat: JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8')) }); }
              catch { return json(200, { ok: false, error: '尚无心跳数据' }); }
            }

            if (req.method === 'GET' && pathname === '/prompt-whale/ui') {
              return json(200, { ok: true, prefs: loadUi() });
            }
            if (req.method === 'POST' && pathname === '/prompt-whale/ui') {
              const body = JSON.parse((await readBody(req)) || '{}');
              return json(200, { ok: true, prefs: saveUi(body) });
            }

            if (req.method === 'POST' && pathname === '/prompt-whale/optimize') {
              const body = JSON.parse((await readBody(req)) || '{}');
              return json(200, await optimizeOnce(body.text, { task: body.task }));
            }

            return json(404, { ok: false, error: 'not found' });
          } catch (error) {
            return json(500, { ok: false, error: String(error?.message || error) });
          }
        },
      }, name);
      return disposeRoute;
    });
  });

  log.info?.(`[${name}] 已加载（enabled=${effectiveEnabled(config)}；后端：${loadConfig().provider}；控制面：/prompt-whale/state）`);
}
