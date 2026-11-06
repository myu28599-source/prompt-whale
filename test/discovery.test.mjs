import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SOURCES,
  CATALOG_MODES,
  parseCatalogIndex,
  subtractInstalled,
  rankByHint,
  renderCatalog,
  renderCatalogAggregated,
  normalizeKey,
  fetchCatalog,
  loadCache,
} from '../lib/plugin-discovery.js';

import {
  IMAGE_MODES,
  IMAGE_STYLE_DIRECTIVES,
  appendImageDirective,
} from '../lib/logic.js';

const SAMPLE = {
  format: 1,
  plugins: [
    {
      name: '@scope/dsh-image-kit',
      title: 'alice/dsh-image-kit',
      description: { zh: '本地生图与图像增强', en: 'Local image generation' },
      repository: { url: 'https://github.com/alice/dsh-image-kit' },
      metadata: { category: 'image' },
    },
    {
      name: 'dsh-video-tool',
      title: 'bob/dsh-video-tool',
      description: { en: 'Video helpers' },
      metadata: { category: 'video' },
    },
    {
      name: 'dsh-myu',
      title: 'me/dsh-myu',
      description: 'plain string description',
      metadata: { category: 'persona' },
    },
  ],
};

test('parseCatalogIndex 处理 format-1 的 description 对象 / 仓库 URL / 分类', () => {
  const list = parseCatalogIndex(SAMPLE);
  assert.equal(list.length, 3);
  assert.equal(list[0].description, '本地生图与图像增强');
  assert.equal(list[0].ownerRepo, 'alice/dsh-image-kit');
  assert.equal(list[0].category, 'image');
  assert.equal(list[1].description, 'Video helpers');
  assert.equal(list[2].description, 'plain string description');
  assert.deepEqual(parseCatalogIndex('{"plugins":[]}'), []);
});

test('subtractInstalled 按归一化名减掉已装插件', () => {
  const list = parseCatalogIndex(SAMPLE);
  const left = subtractInstalled(list, ['dsh-myu', 'image_gen']);
  assert.equal(left.length, 2);
  assert.ok(!left.some((p) => p.name === 'dsh-myu'));
  assert.equal(normalizeKey('@scope/dsh-image-kit'), 'imagekit');
});

test('rankByHint 把同分类排前面且不改数量', () => {
  const list = parseCatalogIndex(SAMPLE);
  const ranked = rankByHint(list, '帮我生成一张小鲸鱼吃米饭的图片');
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].category, 'image');
});

test('renderCatalog 只留「名字(ownerRepo) — 简短描述」，并限条数/字数', () => {
  const list = Array.from({ length: 200 }, (_, i) => ({
    name: `plugin-${i}`, ownerRepo: `o/r${i}`, category: 'ui', description: 'x'.repeat(200),
  }));
  const text = renderCatalog(list);
  assert.ok(text.split('\n').length <= 40);
  assert.ok(text.length <= 3510);
  // 类别被去掉、描述被二次截断
  assert.match(text, /^plugin-0\(o\/r0\) — x{110}$/m);
  assert.ok(!text.includes('— ui —'));
  // 同样预算下能装更多条（描述短了）
  const short = renderCatalog(list, { descLen: 60 });
  assert.ok(short.split('\n').length > text.split('\n').length);
});

test('renderCatalog 支持 mode=aggregated 走分类聚合渲染', () => {
  const list = [
    { name: 'a-img', ownerRepo: 'o/a', category: 'image', description: 'x'.repeat(200) },
    { name: 'b-img', ownerRepo: 'o/b', category: 'image', description: 'y'.repeat(200) },
    { name: 'c-video', ownerRepo: 'o/c', category: 'video', description: 'z'.repeat(200) },
    { name: 'd-video', ownerRepo: 'o/d', category: 'video', description: 'w'.repeat(200) },
    { name: 'e-plain', ownerRepo: 'o/e', category: '', description: 'q'.repeat(200) },
  ];
  const agg = renderCatalog(list, { mode: 'aggregated' });
  // 分类聚合：每个分类一行，含数量与样例，且截断描述（不再逐条 110 字描述）
  assert.match(agg, /【image】2 个：a-img\(o\/a\)、b-img\(o\/b\)/);
  assert.match(agg, /【video】2 个：c-video\(o\/c\)、d-video\(o\/d\)/);
  assert.match(agg, /【uncategorized】1 个：e-plain\(o\/e\)/);
  assert.ok(!agg.includes('x'.repeat(110)), '聚合模式不应出现逐条长描述');
  // 同数据扁平模式行数 = 条目数；聚合模式行数 = 分类数（更少行、更广覆盖）
  const flat = renderCatalog(list);
  assert.ok(flat.split('\n').length === 5);
  assert.ok(agg.split('\n').length === 3);
});

test('CATALOG_MODES 只有 flat / aggregated', () => {
  assert.deepEqual(CATALOG_MODES, ['flat', 'aggregated']);
});

test('renderCatalogAggregated 超预算即停、分类多者在前、样例数受控', () => {
  const list = Array.from({ length: 100 }, (_, i) => ({
    name: `p${i}`, ownerRepo: `o/p${i}`, category: i < 60 ? 'big' : 'small', description: 'd',
  }));
  const out = renderCatalogAggregated(list, { maxChars: 200, samplesPerCat: 2, maxCategories: 5 });
  const lines = out.split('\n').filter(Boolean);
  assert.ok(lines[0].startsWith('【big】'), '分类体量大的排第一');
  assert.ok(lines.length <= 5, '分类数受 maxCategories 约束');
  assert.ok(out.length <= 200, '总字符受 maxChars 约束');
  assert.ok((out.match(/、/g) || []).length <= 2 * lines.length, '每类样例数受 samplesPerCat 约束');
});

test('fetchCatalog 透传 catalogMode 到渲染结果', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-mode-'));
  const cacheFile = path.join(dir, 'plugin-cache.json');
  const fetchImpl = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(SAMPLE) });
  const flat = await fetchCatalog({ fetchImpl, cacheFile, installed: [], hint: '', catalogMode: 'flat' });
  const agg = await fetchCatalog({ fetchImpl: async () => { throw new Error('no fetch'); }, cacheFile, catalogMode: 'aggregated' });
  // 缓存命中路径也要按传入的 mode 重渲
  assert.ok(flat.catalogText.includes('—'), 'flat 模式仍是「名字 — 描述」行');
  assert.ok(agg.catalogText.includes('【'), 'aggregated 模式出现分类摘要行');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fetchCatalog 三源竞速：慢源失败、快源胜出并写缓存', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-disc-'));
  const cacheFile = path.join(dir, 'plugin-cache.json');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('jsdelivr')) throw new Error('jsdelivr timeout');
    if (url.includes('awesome-dsh-plugin')) {
      return { ok: true, status: 200, text: async () => JSON.stringify(SAMPLE) };
    }
    await new Promise((r) => setTimeout(r, 30));
    return { ok: true, status: 200, text: async () => JSON.stringify(SAMPLE) };
  };
  const out = await fetchCatalog({ fetchImpl, cacheFile, installed: [], hint: '' });
  assert.equal(out.available, true);
  assert.equal(out.source, 'awesome-dsh-plugin');
  assert.equal(out.count, 3);
  assert.equal(out.cached, false);
  assert.ok(loadCache(cacheFile));
  assert.ok(calls.length >= 2);

  const cached = await fetchCatalog({ fetchImpl: async () => { throw new Error('should not fetch'); }, cacheFile });
  assert.equal(cached.cached, true);
  assert.equal(cached.count, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fetchCatalog 全部源不可达 → available:false / catalogText=(无)', async () => {
  const out = await fetchCatalog({
    fetchImpl: async () => { throw new Error('offline'); },
    cacheFile: null,
    timeoutMs: 100,
  });
  assert.equal(out.available, false);
  assert.equal(out.catalogText, '(无)');
  assert.match(out.error, /offline/);
});

test('真实索引样本（若归档存在）：4704 条且字段可解析', () => {
  const sample = './.archive/catalog-sample.json'; // 可选大样本（相对路径，不在仓库内）
  if (!fs.existsSync(sample)) return; // 可选大样本
  const list = parseCatalogIndex(fs.readFileSync(sample, 'utf8'));
  assert.ok(list.length > 4000);
  assert.ok(list.every((p) => typeof p.name === 'string' && p.name));
  assert.ok(list.some((p) => p.category === 'image' || p.category === 'ui'));
  assert.equal(SOURCES.length, 3);
});

test('IMAGE_MODES 只有 auto-style / follow-intent', () => {
  assert.deepEqual(IMAGE_MODES, ['auto-style', 'follow-intent']);
});

test('appendImageDirective：auto-style 与 follow-intent 追加不同指令', () => {
  const base = { system: 'S', userContent: 'U' };
  const auto = appendImageDirective(base, 'auto-style');
  const follow = appendImageDirective(base, 'follow-intent');
  assert.equal(auto.userContent, 'U', 'userContent 原样保留');
  assert.ok(auto.system.startsWith('S\n\n'), 'auto 在 system 末尾追加');
  assert.ok(auto.system.includes('主动补全'), 'auto 含「主动补全」措辞');
  assert.ok(follow.system.includes('严格跟随用户原意'), 'follow 含「严格跟随用户原意」');
  assert.ok(!follow.system.includes('主动补全'), 'follow 不含 auto 的措辞');
  assert.notEqual(auto.system, follow.system, '两种模式指令不同');
});

test('appendImageDirective：非法 mode / 空 request 原样返回', () => {
  const base = { system: 'S', userContent: 'U' };
  assert.equal(appendImageDirective(base, 'bogus'), base, '非法 mode 返回同一引用');
  assert.equal(appendImageDirective(null, 'auto-style'), null, '空 request 返回 null');
  assert.equal(appendImageDirective(base, undefined), base, 'undefined mode 返回同一引用');
});

test('生图模式两种指令都显式带「生图专项」标记且都保留通用规则', () => {
  for (const mode of IMAGE_MODES) {
    const out = appendImageDirective({ system: '通用规则', userContent: 'x' }, mode);
    assert.ok(out.system.includes('通用规则'), `${mode} 保留既有 system 规则`);
    assert.ok(out.system.includes('【生图专项】'), `${mode} 带生图专项标记`);
  }
});

