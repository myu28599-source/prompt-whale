import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankToolsByRelevance,
  tokenize,
  hintCategories,
  toolCategories,
  explicitMention,
} from '../lib/tool-relevance.js';

const TOOLS = [
  { name: 'mcp__github__create_issue', description: '在 GitHub 上创建 issue' },
  { name: 'image_gen', description: '生成图片，调用 ComfyUI 本地出图' },
  { name: 'ffmpeg', description: '视频剪辑与转码' },
  { name: 'web_search', description: '联网搜索网页并抓取正文' },
  { name: 'str_replace_editor', description: '在文件里做字符串替换' },
  { name: 'read_file', description: '读取文件内容' },
  { name: 'bash', description: '在终端执行命令' },
  { name: 'memory_store', description: '保存项目记忆到知识库' },
];

test('tokenize 英文按词、中文按 2-gram，只滤虚词', () => {
  const t = tokenize('帮我生成一张图片 help me');
  assert.ok(t.includes('help'));
  assert.ok(t.includes('生成'), '「生成」是有信息量的词，不能当停用词');
  assert.ok(t.includes('图片'));
  assert.ok(!t.includes('帮我'));
});

test('类别判定：工具名是强证据，描述是弱证据', () => {
  const strong = toolCategories({ name: 'image_gen', description: '随便写点什么' });
  assert.ok(strong.name.has('image'));
  assert.ok(!strong.desc.has('image'), '描述没提图片就不该判 image');
  const weak = toolCategories({ name: 'memory_store', description: '保存项目记忆到知识库' });
  assert.ok(weak.name.has('memory'));
  assert.ok(!weak.desc.has('file'), '描述里的「保存」不构成 file 类别证据');
});

test('hintCategories 认口语表达', () => {
  assert.ok(hintCategories('帮我生成一张图片').has('image'));
  assert.ok(hintCategories('搜一下资料').has('web'));
  assert.ok(hintCategories('剪一下视频').has('video'));
  assert.equal(hintCategories('你好').size, 0);
});

test('explicitMention 只认「具体标识」，不把描述意图当点名', () => {
  // 原样点名
  assert.equal(explicitMention({ name: 'mcp__github__create_issue' }, '用 mcp__github__create_issue 建 issue'), true);
  // 动作名完整出现
  assert.equal(explicitMention({ name: 'mcp__github__create_issue' }, '用 create_issue 建 issue'), true);
  // 只是描述意图：不算点名（否则一次「在 GitHub 建 issue」会必留二十多条）
  assert.equal(explicitMention({ name: 'mcp__github__create_issue' }, '在 GitHub 建个 issue'), false);
  assert.equal(explicitMention({ name: 'mcp__github__list_issues' }, '列出 issue 列表'), false);
  // 独特片段才算
  assert.equal(explicitMention({ name: 'ffmpeg' }, '用 ffmpeg 转码'), true);
  assert.equal(explicitMention({ name: 'read_file' }, '读一下文件'), false);
  assert.equal(explicitMention({ name: 'read_file' }, ''), false);
});

test('相关性：类别命中的保留，无关类别丢弃', () => {
  const r = rankToolsByRelevance(TOOLS, '帮我生成一张图片并保存到文件夹', { maxTools: 15, maxChars: 4000 });
  const names = r.kept.map((t) => t.name);
  assert.ok(names.includes('image_gen'), `应保留 image_gen：${names}`);
  assert.ok(names.includes('read_file'), `文件类应保留：${names}`);
  assert.ok(!names.includes('ffmpeg'), `应丢弃 ffmpeg：${names}`);
  assert.ok(!names.includes('memory_store'), `应丢弃 memory_store：${names}`);
  assert.equal(r.total, TOOLS.length);
  assert.equal(r.dropped, TOOLS.length - r.kept.length);
});

test('显式点名必留，且不受 maxTools 约束', () => {
  const r = rankToolsByRelevance(TOOLS, '用 mcp__github__create_issue 建 issue，用 web_search 查资料', { maxTools: 1, maxChars: 4000 });
  const names = r.kept.map((t) => t.name);
  assert.ok(names.includes('mcp__github__create_issue'));
  assert.ok(names.includes('web_search'));
  assert.ok(r.explicit >= 2);
});

test('描述意图不会引发大面积必留', () => {
  const r = rankToolsByRelevance(TOOLS, '在 GitHub 建个 issue，并把结果存到文件', { maxTools: 15, maxChars: 4000 });
  assert.ok(r.explicit <= 1, `描述意图不该大面积点名：${r.explicit}`);
  assert.ok(r.kept.length <= 15 + r.explicit);
});

test('条目数与字符数受上限约束', () => {
  const wide = rankToolsByRelevance(TOOLS, '图片 视频 搜索 文件 终端 记忆 文档 代码 数据', { maxTools: 4, maxChars: 4000 });
  assert.ok(wide.kept.length <= 4, `条数应受限：${wide.kept.length}`);
  const tight = rankToolsByRelevance(TOOLS, '图片 视频 搜索 文件 终端 记忆 文档 代码 数据', { maxTools: 50, maxChars: 120 });
  assert.ok(tight.chars <= 120 + 200, `字符预算应受限：${tight.chars}`);
});

test('无相关性信号时靠通用兜底，不给空清单', () => {
  const r = rankToolsByRelevance(TOOLS, '你好', { maxTools: 15, maxChars: 4000 });
  assert.ok(r.kept.length > 0, '不能是空清单');
  assert.ok(r.generic >= 1, '应有通用工具兜底');
  assert.match(r.reason, /相关性|回退/);
});

test('空输入安全', () => {
  const r = rankToolsByRelevance([], '任何文本');
  assert.deepEqual(r.kept, []);
  assert.equal(r.total, 0);
  assert.equal(r.fallback, false);
});
