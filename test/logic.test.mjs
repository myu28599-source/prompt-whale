import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEM_PROMPT,
  buildOptimizeRequest,
  filterTools,
  renderToolCatalog,
  extractParts,
  parseRecommendations,
  sanitizeOptimization,
  validOptimization,
} from '../lib/logic.js';

test('SYSTEM_PROMPT 逐字包含计划 §6 的 11 条规则与分隔符约定', () => {
  assert.match(SYSTEM_PROMPT, /你是一位资深的 AI 提示词（Prompt）优化工程师/);
  assert.match(SYSTEM_PROMPT, /9\. 优化提示词写完后，另起一段，以分隔线 `---` 隔开/);
  assert.match(SYSTEM_PROMPT, /10\. 【可推荐插件清单】非空时/);
  assert.match(SYSTEM_PROMPT, /11\. 若【可推荐插件清单】为空/);
  assert.match(SYSTEM_PROMPT, /绝对禁止编造清单以外的工具/);
});

test('buildOptimizeRequest 拼出 §7 的四段上下文', () => {
  const { system, userContent } = buildOptimizeRequest('帮我生成一张图', 'image_gen: 生图', 'dsh-foo(o/r) — image — 描述');
  assert.equal(system, SYSTEM_PROMPT);
  assert.match(userContent, /【当前可用工具 \/ 技能 \/ MCP 清单】\nimage_gen: 生图/);
  assert.match(userContent, /【可推荐但未安装的插件清单】\ndsh-foo\(o\/r\) — image — 描述/);
  assert.match(userContent, /【原始提示词】\n帮我生成一张图/);
  assert.match(userContent, /【输出要求】/);
});

test('filterTools 黑名单真生效：默认空不过滤，显式正则真从清单剔除', () => {
  const entries = [
    { name: 'mcp__rea__secret', description: 'x' },
    { name: 'image_gen', description: 'a'.repeat(500) },
    { name: 'shell', description: 'run' },
  ];
  // 默认黑名单为空：不再写死 rea，不过滤任何工具（靠 maxTools 限制也只限条数，不删内容）
  const def = filterTools(entries);
  assert.equal(def.droppedCount, 0);
  assert.equal(def.kept.length, 3);

  // 显式黑名单：正则真命中并剔除，且不靠 maxTools 兜底（maxTools 设很大证明是黑名单在起作用）
  const { kept, droppedCount } = filterTools(entries, { blacklist: ['^mcp__rea__'], maxTools: 99 });
  assert.equal(droppedCount, 1);
  assert.equal(kept.length, 2);
  assert.ok(!kept.some((t) => t.name.startsWith('mcp__rea__')), '黑名单命中的工具必须被剔除');
  // 描述仍按 maxDesc 截断
  const img = kept.find((t) => t.name === 'image_gen');
  assert.ok(img.description.endsWith('…'));
  assert.equal(img.description.length, 301);
});

test('renderToolCatalog 受总长上限约束并标注省略数量', () => {
  const tools = Array.from({ length: 100 }, (_, i) => ({ name: `tool_${i}`, description: 'x'.repeat(100) }));
  const text = renderToolCatalog(tools, { maxChars: 600 });
  assert.ok(text.length <= 620);
  assert.match(text, /另有 \d+ 个工具未列出/);
});

test('extractParts：无分隔线时整段为优化正文', () => {
  assert.deepEqual(extractParts('优化后的提示词正文'), { optimized: '优化后的提示词正文', recommendations: '' });
});

test('extractParts：标准 --- 拆分出推荐小节', () => {
  const raw = [
    '请调用 image_gen 生成一张 512x512 的图，主题是小鲸鱼吃米饭，PNG 输出。',
    '',
    '---',
    '',
    '💡 推荐插件',
    '- dsh-comfy-kit（owner/repo）：本地生图节点，适合批量出图',
  ].join('\n');
  const parts = extractParts(raw);
  assert.match(parts.optimized, /^请调用 image_gen/);
  assert.doesNotMatch(parts.optimized, /推荐插件/);
  assert.match(parts.recommendations, /dsh-comfy-kit/);
});

test('extractParts：正文里也有 --- 时取最后一个（推荐在末尾）', () => {
  const raw = '第一段\n---\n第二段\n---\n💡 推荐插件\n- 插件A（o/r）：理由';
  const parts = extractParts(raw);
  assert.equal(parts.optimized, '第一段\n---\n第二段');
  assert.match(parts.recommendations, /插件A/);
});

test('parseRecommendations 解析三种常见格式', () => {
  const list = parseRecommendations([
    '💡 推荐插件',
    '- dsh-image-kit（owner/repo）：图像增强，契合本次生图任务',
    '- dsh-video (me/repo): English description',
    '- 纯文本一行',
  ].join('\n'));
  assert.equal(list.length, 3);
  assert.deepEqual(
    { name: list[0].name, ownerRepo: list[0].ownerRepo, reason: list[0].reason },
    { name: 'dsh-image-kit', ownerRepo: 'owner/repo', reason: '图像增强，契合本次生图任务' },
  );
  assert.equal(list[1].ownerRepo, 'me/repo');
  assert.equal(list[2].text, '纯文本一行');
});

test('sanitizeOptimization 剥代码围栏与前言', () => {
  assert.equal(sanitizeOptimization('```\n好的，以下是优化后的提示词：\n真正内容\n```'), '真正内容');
});

test('validOptimization 拒绝空 / 相同 / 寒暄', () => {
  assert.equal(validOptimization('', 'x'), null);
  assert.equal(validOptimization('帮我写个脚本', '帮我写个脚本'), null);
  assert.equal(validOptimization('抱歉，我无法完成', '帮我写个脚本'), null);
  assert.equal(validOptimization('请用 shell 执行 ls -la 并输出结果', '写脚本'), '请用 shell 执行 ls -la 并输出结果');
});
