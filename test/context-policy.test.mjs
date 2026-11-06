import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAN_SYSTEM_PROMPT,
  buildLeanRequest,
  buildLeanUserContent,
  classifyToolNeed,
  CATALOG_POLICIES,
  FULL_CONTEXT_OVERHEAD_CHARS,
} from '../lib/context-policy.js';
import { SYSTEM_PROMPT, buildOptimizeRequest } from '../lib/logic.js';

test('策略常量合法且精简 SYSTEM 明显更短', () => {
  assert.deepEqual(CATALOG_POLICIES, ['auto', 'always', 'never']);
  assert.ok(LEAN_SYSTEM_PROMPT.length < SYSTEM_PROMPT.length);
  assert.ok(!/可推荐插件清单|💡 推荐插件」小节：/.test(LEAN_SYSTEM_PROMPT));
  assert.ok(/不要分隔线/.test(LEAN_SYSTEM_PROMPT));
});

test('精简请求不含两份清单、不含推荐要求', () => {
  const text = '帮我生成一个小鲸鱼娘吃米饭的图片';
  const { system, userContent } = buildLeanRequest(text);
  assert.ok(userContent.includes(text));
  assert.ok(!/可推荐但未安装的插件清单/.test(userContent));
  assert.ok(!/当前可用工具/.test(userContent));
  assert.ok(!/推荐插件/.test(userContent));
  assert.equal(buildLeanUserContent(text), userContent);

  const full = buildOptimizeRequest(text, '工具A: 描述', '插件B(owner/repo) — x');
  assert.ok(full.userContent.includes('当前可用工具'));
  assert.ok(full.userContent.includes('可推荐但未安装的插件清单'));
  assert.ok(full.userContent.length > userContent.length);
  assert.equal(FULL_CONTEXT_OVERHEAD_CHARS, 12000);
});

test('auto：生图 / 纯文本 / 问候一律精简', () => {
  const cases = [
    '帮我生成一个小鲸鱼娘吃米饭的图片',
    '画一张赛博朋克风格的城市夜景，雨后霓虹倒影',
    '帮我把这段话整理成一个能直接执行的任务清单',
    '写一段关于秋天的散文',
    '翻译这段文字成英文',
    'hi',
    '你好',
  ];
  for (const text of cases) {
    const r = classifyToolNeed(text, 'auto');
    assert.equal(r.need, false, `应精简：${text} → ${r.reason}`);
    assert.ok(r.reason.length > 0);
  }
});

test('auto：工具 / 插件 / GitHub / 命令 / 联网信号一律附带', () => {
  const cases = [
    '帮我查一下 GitHub 上有什么 dsh 插件能生成视频',
    '用 mcp__github__search_repositories 搜一下相关仓库',
    '推荐几个能处理 PDF 的插件',
    '写一个脚本，读取文件内容并统计行数',
    '用终端跑一下 git status 看有没有改动',
    '搜索一下今天的新闻并总结',
    '安装 dsh-free-search 插件',
    '调用 ComfyUI 的 API 生成一张图',
    '读取文件 /tmp/a.txt 并改写',
    'debug 一下这段 Python 报错',
  ];
  for (const text of cases) {
    const r = classifyToolNeed(text, 'auto');
    assert.equal(r.need, true, `应附带：${text} → ${r.reason}`);
  }
});

test('always / never 强制覆盖，非法策略回落 auto', () => {
  assert.equal(classifyToolNeed('帮我画一只猫', 'always').need, true);
  assert.equal(classifyToolNeed('查 GitHub 插件', 'never').need, false);
  assert.equal(classifyToolNeed('查 GitHub 插件', 'nonsense').need, true);
  assert.equal(classifyToolNeed('', 'auto').need, false);
  assert.equal(classifyToolNeed(undefined, 'auto').need, false);
});

test('auto：无明显信号时默认精简（省上下文）', () => {
  const r = classifyToolNeed('请按专业格式重新表述下面这段内容', 'auto');
  assert.equal(r.need, false);
  assert.equal(r.reason, '无工具信号');
});
