/**
 * 上下文策略：零成本判断草稿是否真的需要「工具清单 + 可推荐插件清单」。
 *
 * 动机（2026-11-06 用户提出）：纯文本改写、生图提示词、问答这类草稿根本
 * 不需要调用工具，但旧流程每轮都会
 *   1) 读 2.3MB 插件市场缓存并解析 4704 条 → 渲染 ≤6000 字推荐清单；
 *   2) 读宿主工具清单 → 渲染 ≤6000 字工具清单；
 *   3) 把两份清单塞进 user message，system 里还有 11 条工具/推荐规则；
 *   4) 要求模型额外输出「💡 推荐插件」小节。
 * 缓存命中虽然不发网络，但上下文字符数、模型推理时间与输出长度都是实打实的开销。
 *
 * 这里用**纯本地正则**判断，零 API 调用、零 token。判断不需要时走精简请求：
 * 不读工具清单、不读市场索引、system 换成 LEAN_SYSTEM_PROMPT、不要求推荐小节。
 * 用户可在设置页切 auto / always / never 覆盖判断结果。
 *
 * @module lib/context-policy
 */

/** 精简模式 SYSTEM：只做结构化改写，删掉全部工具/插件相关规则与推荐要求。 */
export const LEAN_SYSTEM_PROMPT = [
  '你是一位资深的 AI 提示词（Prompt）优化工程师。用户会给你一段写在 AI 对话工具里的原始提示词。',
  '',
  '你的任务：把这段口语化、缺结构、缺参数、意图可能模糊的原始提示词，改写成清晰、专业、自包含、可直接交给 AI 执行的高质量提示词。',
  '',
  '硬性输出规则：',
  '1. 直接输出优化后的提示词正文，第一句就进入正题；',
  '2. 不要寒暄、不要解释、不要说「以下是优化后的提示词」、不要 Markdown 标题、不要代码围栏、不要复述原始需求；',
  '3. 严格保留用户原本的语言、核心意图、约束条件与数据，不擅自改变、扩大或缩小任务目标；',
  '4. 本次不提供工具清单，也不要在提示词里指定任何工具名、插件名或仓库名；',
  '5. 优化后的提示词应自包含：即使脱离本对话上下文，AI 也能据此独立完成用户要的事；',
  '6. 若原始提示词已经足够清晰专业，在保持结构化的前提下最小改动，不要为了改而改；',
  '7. 输出语言与用户原始提示词保持一致；',
  '8. 只输出优化后的提示词正文，不要分隔线、不要「💡 推荐插件」小节、不要任何前后缀。',
].join('\n');

export function buildLeanUserContent(text) {
  return [
    '【原始提示词】',
    text,
    '',
    '【输出要求】',
    '只输出优化后的提示词正文，不要任何前后缀、标题、代码围栏、分隔线或解释。',
  ].join('\n');
}

export function buildLeanRequest(text) {
  return { system: LEAN_SYSTEM_PROMPT, userContent: buildLeanUserContent(text) };
}

/** 两份清单各自 ≤6000 字，用于估算精简模式省下的上下文字符数。 */
export const FULL_CONTEXT_OVERHEAD_CHARS = 12_000;

export const CATALOG_POLICIES = ['auto', 'always', 'never'];

/** 明确需要工具/插件/仓库/命令/联网的信号。中文词不能用 \b 边界，单独列出。 */
const TOOL_SIGNALS = [
  { label: '插件/工具/MCP', re: /(?:\bmcp\b|\bplugin\b|\bplugins\b|\btool\b|\btools\b|\bskill\b|\bextension\b|插件|工具|技能|扩展)/i },
  { label: '仓库/包管理', re: /(?:\bgithub\b|\bgitlab\b|\bgit\b|\brepo\b|\brepository\b|\bnpm\b|\bpnpm\b|\byarn\b|仓库|代码库|包管理)/i },
  { label: '命令/终端/脚本', re: /(?:\bterminal\b|\bshell\b|\bbash\b|\bpowershell\b|\bcmd\b|\bscript\b|\bdeploy\b|终端|命令行|脚本|编译|构建|部署)/i },
  { label: '联网/检索/安装', re: /(?:搜索|检索|联网|查一下|查资料|抓取|爬取|下载|上传|安装|\binstall\b|\bfetch\b|\bcrawl\b)/i },
  { label: '文件/代码操作', re: /(?:读取文件|写入文件|修改文件|保存文件|打开文件|遍历目录|重构|调试|\bdebug\b|\brefactor\b|报错|异常|单元测试)/i },
  { label: '调用接口/执行', re: /(?:调用\s*(?:工具|接口|api|函数)|执行(?:命令|脚本)|运行(?:脚本|命令)|api\s*(?:接口|调用)|http\s*请求)/i },
  { label: 'API/集成', re: /(?:\bapi\b.{0,16}(?:调用|请求|生成|接口|密钥|token)|调用.{0,16}\bapi\b)/i },
  { label: '索要插件推荐', re: /(?:推荐|有哪些|有什么|找一|找个|哪些).{0,10}(?:插件|工具|扩展|plugin|tool)/i },
];

/** 只用于给「不需要」一个可读理由；auto 下没有工具信号一律精简。 */
const PLAIN_SIGNALS = [
  { label: '生图/视频描述', re: /(?:生成|画|出|做|制作|来一|给我一|帮我写|写).{0,14}(?:图片|图|插画|海报|头像|壁纸|照片|画面|视频|短视频|动画)/i },
  { label: '画面要素', re: /(?:画风|画面|构图|镜头|光线|色调|风格|像素|高清|分辨率|特写|质感|背景|角色|服饰)/ },
  { label: '文本创作/改写', re: /(?:写|润色|改写|翻译|总结|概括|归纳|整理|解释|说明|分析|回答|告诉我|什么是|如何理解|举例|对比|评价|续写|扩写|缩写|起个|取名|文案|邮件|作文|诗|故事|对话|清单|大纲|提纲)/ },
  { label: '纯问候', re: /^(?:hi|hello|你好|在吗|谢谢|好的|收到)\s*[!！。.]?$/i },
];

/**
 * 判断草稿是否需要附带两份清单。
 * auto：命中任一工具信号 → 附带；否则（含纯创作、生图、无信号）→ 精简。
 * 宁可少带，也不为一句生图描述白烧上万字符；需要强制时切 always。
 *
 * @param {string} text 原始草稿
 * @param {'auto'|'always'|'never'} policy
 * @returns {{need:boolean, policy:string, reason:string}}
 */
export function classifyToolNeed(text, policy = 'auto') {
  const t = String(text || '').trim();
  const eff = CATALOG_POLICIES.includes(policy) ? policy : 'auto';
  if (eff === 'always') return { need: true, policy: eff, reason: '策略：总是附带' };
  if (eff === 'never') return { need: false, policy: eff, reason: '策略：从不附带' };
  if (!t) return { need: false, policy: eff, reason: '空文本' };
  const hit = TOOL_SIGNALS.find((x) => x.re.test(t));
  if (hit) return { need: true, policy: eff, reason: `命中「${hit.label}」` };
  const plain = PLAIN_SIGNALS.find((x) => x.re.test(t));
  return { need: false, policy: eff, reason: plain ? `纯内容：${plain.label}` : '无工具信号' };
}
