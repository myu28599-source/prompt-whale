import test from 'node:test';
import assert from 'node:assert/strict';
import { createProvider, PROVIDER_ORDER, PROVIDER_META, ProviderError, callChat } from '../lib/providers/index.js';

const okResponse = (content) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
});

test('provider 默认端点 / 模型 / 环境变量名符合计划与 Hy4 官方口径', () => {
  assert.deepEqual(PROVIDER_ORDER, ['agnes', 'hunyuan', 'deepseek', 'custom']);
  assert.equal(PROVIDER_META.hunyuan.defaultModel, 'hy4');
  assert.equal(PROVIDER_META.hunyuan.baseURL, 'https://tokenhub.tencentmaas.com/v1');
  assert.equal(PROVIDER_META.hunyuan.envKey, 'HUNYUAN_API_KEY');
  assert.deepEqual(PROVIDER_META.hunyuan.extraBody, { thinking: { type: 'disabled' } });
  assert.equal(PROVIDER_META.agnes.defaultModel, 'agnes-2.5-flash');
  assert.equal(PROVIDER_META.deepseek.defaultModel, 'deepseek-chat');
  assert.equal(createProvider('deepseek').baseURL, 'https://api.deepseek.com/v1');
  // 国内站 Key 与国际站 Key 不通用；默认走实测可用的国内端点。
  assert.equal(PROVIDER_META.agnes.baseURL, 'https://api.agnes-ai.cn/v1');
  assert.equal(createProvider('agnes').baseURL, 'https://api.agnes-ai.cn/v1');
  assert.throws(() => createProvider('nope'), /未知 provider/);
});

test('callChat 发送标准 OpenAI 请求体并解析 content', async () => {
  const seen = {};
  const fetchImpl = async (url, options) => {
    seen.url = url;
    seen.options = options;
    return okResponse('hello');
  };
  const out = await callChat({
    baseURL: 'https://example.test/v1/', apiKey: 'sk-1', model: 'm1',
    messages: [{ role: 'user', content: 'hi' }], temperature: 0.3, fetchImpl,
  });
  assert.equal(out, 'hello');
  assert.equal(seen.url, 'https://example.test/v1/chat/completions');
  assert.equal(seen.options.headers.authorization, 'Bearer sk-1');
  const body = JSON.parse(seen.options.body);
  assert.equal(body.model, 'm1');
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0.3);
});

test('错误映射：401 / 402 / 429 / 5xx', async () => {
  const cases = [
    [401, /鉴权失败 \(401\)/],
    [402, /额度不足 \(402\)/],
    [429, /请求限流 \(429\)/],
    [503, /服务异常 \(503\)/],
  ];
  for (const [status, re] of cases) {
    const fetchImpl = async () => ({ ok: false, status, text: async () => JSON.stringify({ error: { message: 'detail' } }) });
    await assert.rejects(
      () => callChat({ baseURL: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [], fetchImpl }),
      (e) => e instanceof ProviderError && re.test(e.message) && e.status === status,
    );
  }
});

test('optimize：无 Key 直接给可读中文提示', async () => {
  await assert.rejects(
    () => createProvider('agnes').optimize({ text: 'hi', apiKey: '' }),
    (e) => e.code === 'no-key' && /设置页填写/.test(e.message),
  );
});

test('optimize：把模型输出拆成 optimized + recommendations', async () => {
  const raw = [
    '请用 image_gen 生成 512x512 PNG，主题为小鲸鱼吃米饭。',
    '---',
    '💡 推荐插件',
    '- dsh-image-kit（owner/repo）：契合生图任务',
  ].join('\n');
  const fetchImpl = async () => okResponse(raw);
  const result = await createProvider('hunyuan').optimize({
    text: '画个小鲸鱼吃饭', tools: 'image_gen: 生图', recs: '(无)',
    apiKey: 'sk-test', fetchImpl,
  });
  assert.match(result.optimized, /^请用 image_gen/);
  assert.doesNotMatch(result.optimized, /推荐插件/);
  assert.match(result.recommendations, /dsh-image-kit/);
  assert.equal(result.model, 'hy4');
});

test('Hy4 默认带 thinking:disabled，开启 hy4Think 时不带', async () => {
  let seen;
  const fetchImpl = async (url, options) => { seen = JSON.parse(options.body); return okResponse('结果内容'); };
  await createProvider('hunyuan').optimize({ text: '写个脚本', apiKey: 'k', fetchImpl });
  assert.deepEqual(seen.thinking, { type: 'disabled' });
  await createProvider('hunyuan').optimize({ text: '写个脚本', apiKey: 'k', extraBody: {}, fetchImpl });
  assert.equal(seen.thinking, undefined);
});

test('optimize：模型返回空内容时报错', async () => {
  await assert.rejects(
    () => createProvider('deepseek').optimize({ text: 'hi', apiKey: 'k', fetchImpl: async () => okResponse('   ') }),
    (e) => e.code === 'empty',
  );
});

test('createProvider 支持设置面板覆盖 model 与 baseURL', async () => {
  const provider = createProvider('agnes', {
    models: { agnes: 'agnes-custom' },
    baseURLs: { agnes: 'https://proxy.test/v1' },
  });
  assert.equal(provider.model, 'agnes-custom');
  assert.equal(provider.baseURL, 'https://proxy.test/v1');
  let seenUrl = '';
  await provider.optimize({
    text: 'x', apiKey: 'k',
    fetchImpl: async (url) => { seenUrl = url; return okResponse('结果内容'); },
  });
  assert.equal(seenUrl, 'https://proxy.test/v1/chat/completions');
});

test('custom：未配置 API 地址 / 模型名时报可读中文提示', async () => {
  assert.equal(PROVIDER_META.custom.id, 'custom');
  assert.equal(PROVIDER_META.custom.envKey, 'CUSTOM_API_KEY');
  // 什么都没配 → 先要求 API 地址
  await assert.rejects(
    () => createProvider('custom').optimize({ text: 'hi', apiKey: 'k' }),
    (e) => e.code === 'no-config' && /API 地址/.test(e.message),
  );
  // 只配了地址没配模型 → 要求模型名
  const half = createProvider('custom', { baseURLs: { custom: 'https://relay.test/v1' } });
  await assert.rejects(
    () => half.optimize({ text: 'hi', apiKey: 'k' }),
    (e) => e.code === 'no-config' && /模型名/.test(e.message),
  );
});

test('custom：配置齐全后走标准 OpenAI 兼容调用，支持设置面板覆盖', async () => {
  const seen = {};
  const fetchImpl = async (url, options) => {
    seen.url = url;
    seen.auth = options.headers.authorization;
    seen.body = JSON.parse(options.body);
    return okResponse('自定义后端返回内容');
  };
  const provider = createProvider('custom', {
    models: { custom: 'my-model-v2' },
    baseURLs: { custom: 'https://my-relay.test/v1/' },
  });
  const result = await provider.optimize({ text: 'hi', apiKey: 'sk-me', fetchImpl });
  assert.equal(seen.url, 'https://my-relay.test/v1/chat/completions');
  assert.equal(seen.auth, 'Bearer sk-me');
  assert.equal(seen.body.model, 'my-model-v2');
  assert.equal(result.model, 'my-model-v2');
  assert.ok(result.optimized);
});

test('custom：缺 Key 的报错与其他 provider 一致', async () => {
  await assert.rejects(
    () => createProvider('custom', {
      models: { custom: 'm' },
      baseURLs: { custom: 'https://x.test/v1' },
    }).optimize({ text: 'hi', apiKey: '' }),
    (e) => e.code === 'no-key' && /设置页填写/.test(e.message),
  );
});
