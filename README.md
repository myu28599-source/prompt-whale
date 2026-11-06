<div align="center">
  <img src="assets/whale-idle.gif" alt="鲸语提示词助手 · 小鲸鱼娘" width="150">
  <br>
  <sub>🐳 点开小鲸鱼娘，把还没发送的草稿一键润色成高质量提示词</sub>

# 鲸语提示词助手 · prompt-whale

**简体中文**

  <img alt="许可证" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square">
  <img alt="Node" src="https://img.shields.io/badge/node-18%2B-4b6fff?style=flat-square">
  <img alt="测试" src="https://img.shields.io/badge/tests-49%2F49-brightgreen?style=flat-square">
  <img alt="后端" src="https://img.shields.io/badge/providers-Agnes%7CHy4%7CDeepSeek-orange?style=flat-square">
  <img alt="零依赖" src="https://img.shields.io/badge/dependencies-zero-7da1de?style=flat-square">
  <img alt="无构建" src="https://img.shields.io/badge/build%20step-none-7da1de?style=flat-square">
  <br>

</div>

<div align="center">

> 把 DSH 主输入框里**尚未发送**的草稿，交给可选大模型润色成自包含、可直接执行的高质量提示词，并基于当前任务从官方插件市场推荐尚未安装的插件。
>
> 多后端（Agnes / 混元 Hy4 / DeepSeek）、生图模式开关、按需省 token、双模式清单、鲸鱼娘图标 base64 内联。
>
> 纯本地插件：不改内核、无构建步骤、零依赖。

</div>

---

## 它是什么

**prompt-whale（鲸语提示词助手）** 是一个 DeepSeek Harness（DSH）本地插件：把主输入框里**尚未发送**的草稿，交给可选大模型（Agnes / 混元 Hy4 / DeepSeek）润色成自包含、可直接执行的高质量提示词，并基于当前任务从官方插件市场推荐尚未安装的插件。

**它不是什么**

- **不是模型服务方**：优化结果由你选的第三方模型生成，插件只做调度与呈现，不托管、不修改、不过滤任何模型输出。
- **不是自动发送器**：优化结果留在浮层里，是否替换输入框草稿由你决定；任何失败都**绝不改动**输入框，只在浮层显示可读中文错误。
- **不是后台改写器**：默认只在你点击小鲸鱼时才优化，不监听输入、不自动改写、不写入会话日志。

---

## 亮点

- **多后端润色**——默认 Agnes，可切混元 Hy4 / DeepSeek，三端均走 OpenAI 兼容 `/chat/completions`，设置页或环境变量填 Key 即用。
- **浮层编辑 + 一键替换**——优化结果在浮层里可继续改，点「替换」覆盖输入框草稿、「取消」原样不动；任何失败都**绝不改动**输入框，只在浮层显示可读中文错误。
- **插件推荐**——从官方市场索引里减掉已安装插件，推荐尚未安装的实用插件（如生图、搜图、文档类）。
- **生图模式开关**——`自动补风格` / `跟随原意`：优化生图类提示词时，决定要不要替你补画风锚点（见 Benchmarks）。
- **按需附带上下文**——智能判断草稿是否需要工具 / 插件清单，不需要时整段跳过，省 token 省时间。
- **清单瘦身**——工具按与草稿的相关性筛选并封顶，插件描述压缩截断，严格控制进 prompt 的预算。
- **双模式清单**——扁平列表 / 分类聚合，泛需求用聚合更省 token。
- **鲸鱼娘图标 base64 内联**——即使删除 `assets/` 目录图标也不丢失。
- **可拖拽浮动按钮 + 毛玻璃外观**——可拖到屏幕任意位置、滚轮缩放，亮 / 暗主题自动跟随宿主。
- **软停用**——关掉插件后按钮和设置页一起消失，快捷键可复活。

## 你会看到什么

**输入框旁的小鲸鱼按钮**（停靠在 `conversation.input.dock`，也可拖成浮动按钮）

| 元素 | 说明 |
| --- | --- |
| 小鲸鱼娘图标 | 点开即读取当前草稿并触发优化；浮动后可拖动 / 滚轮缩放 |
| 优化结果卡片 | 显示润色后的提示词（可编辑），下方是「💡 推荐插件」卡片 |
| 生图勾选框 | 「🎨 这是生图提示词」按草稿关键词自动预判预勾选，可手动改；勾上即按「生图模式」注入风格指令 |
| 替换 / 取消 / 复制 | 替换覆盖草稿、取消原样不动、复制优化文本手动粘贴（写入通道全失效时的兜底） |

**设置页** 设置 → 鲸语提示词助手，包含以下分区：

- **Provider 与 Key**——切换 Agnes / 混元 Hy4 / DeepSeek，填写或清除各后端 Key（`storages/prompt-whale/<provider>.key`，权限 `0600`）。
- **生图模式**——`自动补风格`（默认）/ `跟随原意`，切换即自动保存。
- **插件清单呈现方式**——扁平列表 / 分类聚合。
- **工具 / 插件清单策略**——`auto`（默认）/ `always` / `never`。
- **超时 / 温度 / 黑名单 / 模型 / API 地址**——改完必须点「保存配置」才生效；面板在有未保存改动时高亮提示。
- **按钮外观**——大小滑块、坐标显示、恢复默认。
- **自测**——预填示例文本，点「运行润色自测」直接验证 Key / 模型 / 网络。
- **清缓存 / 停用插件**——清市场索引缓存；停用后立即撤掉 UI（Alt + Shift + W 复活）。

## 效果实测 · Benchmarks

我们把**同一句原始提示词**交给三个提示词优化模型（Agnes / 混元 Hy4 / DeepSeek）各自优化，再把三份优化后的提示词**喂给同一个生图工具（ComfyUI，同一工作流 + 同一 base 模型）**出图，并额外用 raw 原始提示词出一张基线图，对比「优化到底有没有提升生图质量」以及「哪个优化器更强」。

> 完整原始提示词、三份优化提示词全文、逐图观察与统计方法见 **[`docs/benchmarks/prompt-optimization-benchmark.md`](docs/benchmarks/prompt-optimization-benchmark.md)**。

原始提示词（4 张图共用基线）：

```
帮我生成一个穿女仆装的可爱少女图片
```

### 四张出图对比

| | raw 基线（未优化） | Agnes 优化 | 混元 Hy4 优化 | DeepSeek 优化 |
|---|---|---|---|---|
| **出图** | ![raw](docs/benchmarks/images/mixed_beauty_portrait_00004.png) | ![Agnes](docs/benchmarks/images/mixed_beauty_portrait_00001.png) | ![Hy4](docs/benchmarks/images/mixed_beauty_portrait_00002.png) | ![DeepSeek](docs/benchmarks/images/mixed_beauty_portrait_00003.png) |
| **画风** | 写实真人 | 二次元动漫 | 写实照片 | 写实人像 |
| **尺寸** | 896×1184 | 896×1184 | 896×1184 | 896×1184 |

### 五维质量评分（每维 1–5，总分 25）

| 维度 | raw | Agnes | 混元 Hy4 | DeepSeek |
|---|---|---|---|---|
| 1 · 主体契合（女仆可爱少女） | 4 | 5 | 4 | 4 |
| 2 · 服装细节（元素完整 / 质感） | 3 | 5 | 4 | 4 |
| 3 · 面部 / 五官（可爱 · 无崩） | 4 | 5 | 3 | 4 |
| 4 · 肢体 / 手部（无畸形） | 3 | 3 | 3 | 3 |
| 5 · 整体完成（构图 / 光影 / 统一） | 4 | 4 | 3 | 4 |
| **总分** | **18** | **22** | **17** | **19** |

### 结论

- **优化是否提分（vs raw 18）**：Agnes **+4** 明显提升 > DeepSeek **+1** 小幅 > 混元 Hy4 **−1** 反降。
- **三优化器排名（生图质量）**：**Agnes (22) > DeepSeek (19) > 混元 Hy4 (17)**，raw 基线夹在 DeepSeek 与混元 Hy4 之间。
- **根因**：混元 Hy4 在优化 prompt 里自加了「成年女性、非未成年」约束，但出图脸型偏幼态、身形纤细，**自相矛盾**拖了后腿；Agnes 主动锚定「二次元动漫 + 萌系」，与「可爱女仆」语义契合度最高。
- **对插件的启示**：这正是「生图模式」开关的来由——`自动补风格` 提分明显但可能擅自改画风，`跟随原意` 可避免把写实需求强行改成二次元。

### 方法学 caveat（影响结论强度）

1. **单样本**：每格 n=1，属现象级观察，非统计显著；要稳需每格多跑几张取均值。
2. **风格偏袒**：5 维里的「可爱度」对二次元天然友好，Agnes 的动漫优势部分来自风格选择而非纯 prompt 质量；纯比 prompt 质量应锁定同一风格再比。
3. **生图端同源（已确认）**：4 张图出自同一 ComfyUI 工作流 + 同一 base 模型，仅 prompt 不同，对比有效，无混淆。

## 安装

> **⚠️ 本插件是本地插件，通过 DSH 的本地插件目录挂载，不发布到 npm。**
>
> DSH 不会自动应用包内的 `dsh.bundle.patch`，以下四处必须一致，且改动前需**先强杀 DSH**（运行期间会被 app 回写）。改完重启 DSH 验证 `logs/crash-*` 无新增。

**本地目录挂载（desktop profile 四文件铁律）**

| 文件 | 要加的内容 |
| --- | --- |
| `<DSH_HOME>/profiles/<profile>/package.json` | `dependencies["prompt-whale"] = "file:<DSH_LOCAL_PLUGINS>/prompt-whale"`（`<DSH_LOCAL_PLUGINS>` 即 DSH 的本地插件根目录，如 `data/local-plugins`），`dsh.profile.bundles` 追加 `"prompt-whale"` |
| `<DSH_HOME>/profiles/desktop/cordis.patch.yml` | 手写 `- insert:` → `- id: prompt-whale / name: prompt-whale / config.enabled: true`（裸 `- id:` 只是 config override，不会加载） |
| `<DSH_HOME>/profiles/desktop/pnpm-lock.yaml` | importer 的 `specifier` / `version`、`packages` 段的 `resolution: {directory: ...}`、`snapshots` 段空条目，三处都要有 |
| `<DSH_HOME>/profiles/desktop/node_modules/prompt-whale` | 插件目录的实体副本或目录 junction |

cordis id 与包名、配置命名空间必须一致，否则热开关失效。蓝本插件源码仍在 `<DSH_LOCAL_PLUGINS>/` 下，需要时可照本表重新挂回。

**软停用 / 热开关**

宿主插件面板的开关写的是 patch 里独立的 `- id: prompt-whale / disabled: true`，与 `config.enabled` 是两套字段。当前实现取二者交集：`effectiveEnabled = config.enabled && config.json.enabled && !宿主 disabled`，任一处为 false 即停用；软停用时仅保留控制面路由（`/state` `/health` `/heartbeat` `/config`），其余功能路由 404，前端心跳收到 `enabled:false` 立即撤掉 dock + 设置页，无需重启。

## 使用说明

**选择后端**：设置 → 鲸语提示词助手 → Provider 选 Agnes / 混元 Hy4 / DeepSeek，粘贴对应 Key 保存（或设环境变量 `AGNES_API_KEY` / `HUNYUAN_API_KEY` / `HY4_API_KEY` / `DEEPSEEK_API_KEY`）。Key 优先级：设置面板保存的 `storages/prompt-whale/<provider>.key` > 环境变量。

**生图模式开关**：设置页切 `自动补风格` / `跟随原意`；浮层里勾选「🎨 这是生图提示词」时生效，不勾则完全走旧逻辑，非生图任务零影响。

**按需附带上下文**：默认 `auto`——命中「插件 / 工具 / MCP、GitHub / 终端 / 联网 / 文件操作 / 索要推荐」等信号才附带工具清单与插件市场索引，否则走精简请求（不读 2.3MB 缓存、不调市场索引），省约 12K 字上下文。需要强制时切 `always`。

**双模式清单**：`扁平列表`（逐条列候选，适合精确推荐）/ `分类聚合`（先按市场分类计数再附样例，同等预算覆盖全部分类，适合泛需求）。

## 配置项

| 配置键 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | 主开关（与宿主 patch `disabled` 取交集） |
| `provider` | `agnes` / `hunyuan` / `deepseek` | `agnes` | 优化后端 |
| `catalogPolicy` | `auto` / `always` / `never` | `auto` | 是否附带工具 / 插件清单 |
| `catalogMode` | `flat` / `aggregated` | `flat` | 插件清单渲染方式 |
| `imageMode` | `auto-style` / `follow-intent` | `auto-style` | 生图模式：自动补风格 / 跟随原意 |
| `timeoutMs` | number | `60000` | 优化请求超时（Hy4 深度思考时联动到 120000） |
| `temperature` | number | `0.3` | 采样温度 |
| `hy4Think` | bool | `false` | 混元 Hy4 是否启用深度思考（开启自动顶满超时） |
| `blacklist` | string[] | `[]` | 工具名前缀黑名单（如 `^mcp__rea__`) |

**获取后端 Key**

- **Agnes**：<https://platform.agnes-ai.com> 免费注册（邮箱 / Google / GitHub，无需信用卡），控制台「API 密钥」创建，`sk-` 开头且只显示一次。国内 Key 用 `https://api.agnes-ai.cn/v1`，国际站 Key 用 `https://apihub.agnes-ai.com/v1`；默认模型 `agnes-2.5-flash`。
- **混元 Hy4**：腾讯云 TokenHub（需实名认证），模型广场领免费包 → 建 Key。按量地址 `https://tokenhub.tencentmaas.com/v1`，模型名必须全小写 `hy4`。**禁止使用订阅制 `plan/v3` 地址**（官方明确仅限交互式使用，本插件属后端自动调用，必须走按量 `/v1`）。
- **DeepSeek**：<https://platform.deepseek.com> 注册购额度，控制台建 Key，地址 `https://api.deepseek.com/v1`，模型 `deepseek-chat`。

Key 落入 `storages/prompt-whale/<provider>.key`（权限 `0600`），接口永不回显，仅显示 `hasKey` 与 `…abcd` 指纹；字段缺省表示保留已存 Key，空字符串表示清除。

## 工作原理

### 输入框读写（四级降级）

主输入框是 **Lexical `contenteditable`**，不是 `<textarea>`。宿主通过 `ctx.uiSession.provide({ hooks:['conversation','input'], props:['inputActions'] })` 给 session-scoped 组件注入 `useInput`（草稿 store，`state.draft`）与 `inputActions.setDraft(text)`。优先用官方 API，失败时逐级降级：

1. `inputActions.setDraft`（官方）
2. `el.__lexicalEditor.update()` + `require('lexical')` 的 `$getRoot/$createParagraphNode/$createTextNode`
3. `contenteditable` 建 Range 全选 → `document.execCommand('insertText', false, text)`，写后读回校验
4. `textarea` 原生 setter + `input`/`change` 事件

全失败 → 浮层保留「复制优化文本」，输入框不动。客户端首次挂载会 POST `/diag` 上报结构诊断（props 键名、是否有 `useInput` / `inputActions`、是否找到 Lexical 元素），**不含草稿正文**。

### 插件发现（三源竞速）

三个源都是同一份 3.78MB / 4704 条的 format-1 索引：

- `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`
- `https://awesome-dsh-plugin.com/index.json`
- `https://dshmarket.com/index.json`

实现成**三源并行竞速，首个解析成功者胜出，其余立即 abort**（单请求 9s 超时）。解析 `plugins[]` → `{ name, title(owner/repo), description: zh||en, category, repo }`；减已装（profile dependencies keys + 工具名归一化 best-effort 匹配）；按草稿关键词粗筛后截 ≤60 条 / ≤6000 字；缓存 `storages/prompt-whale/plugin-cache.json`（TTL 24h）。全源失败 → 清单写 `(无)`，交给模型凭自身知识推荐。

### HTTP 端点（prefix `/prompt-whale`，仅回环来源）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/state` | 配置（脱敏）+ 三个 provider meta + `hasKey` + 工具清单 + 统计 |
| GET | `/catalog` | 强制刷新工具清单 |
| GET | `/health` | 当前 provider / model / 是否有 key |
| GET | `/asset/whale-idle.gif\|png` | 小鲸鱼娘图标（现已 base64 内联，此路由仍保留兜底） |
| GET | `/diag` | 客户端结构诊断 |
| POST | `/optimize` | `{text, task?}` → `{ok, optimized, recommendations, recommendationsParsed, meta}` |
| POST | `/config` | 保存 provider / models / baseURLs / timeoutMs / temperature / blacklist / imageMode / catalogMode 等 |
| POST | `/keys` | `{provider, key}` 保存或清除（key 留空即清除） |
| POST | `/cache/clear` | 清市场索引缓存 |
| POST | `/stat` | `{action:'replaced'\|'cancelled'}` 统计 |
| POST | `/heartbeat` | 心跳兜底，前端失活时主动 teardown |

请求体上限 128KB；草稿上限 8000 字；斜杠指令直接跳过。

### 生图模式机制

`optimizeOnce` 接收 `task` 参数；仅当 `task === 'image'` 且 `imageMode === 'auto-style'` 时把风格指令追加进 system prompt（`follow-intent` 只追加「不擅自改画风」约束）。非生图任务不传 `task`，指令完全不注入。浮层「🎨 这是生图提示词」按草稿关键词（生成…图片 / 画风 / 构图 等）自动预判预勾选，勾上 / 取消会触发一次重新优化。`meta` 新增 `task` / `imageMode` / `imageDirectiveApplied`，浮层可显示「生图专项」标记。

### 实现结构

```
prompt-whale/
├── index.js                    node 侧：工具清单 / HTTP 控制面 / 配置与 Key 落盘
├── client.js                   前端：dock 按钮 + OptimizerCard 浮层 + SettingsPanel
├── cordis.patch.yml           包内 bundle 声明
├── package.json
├── assets/
│   ├── whale-idle.gif          小鲸鱼娘 idle（已 base64 内联进 client.js）
│   └── whale-idle.png         GIF 首帧，96px 宽，静态回退
├── lib/
│   ├── logic.js               SYSTEM / USER 模板、工具渲染、extractParts、生图模式指令
│   ├── context-policy.js      按需附带上下文判定（零 API 调用 / 零 token）
│   ├── tool-relevance.js      工具按相关性筛选、封顶
│   ├── plugin-discovery.js     市场索引竞速 / 解析 / 减已装 / 粗筛 / 截断 / 24h 缓存 / 双模式渲染
│   └── providers/
│       ├── _shared.js         OpenAI 兼容调用 + 错误映射 + makeProvider
│       ├── index.js           createProvider 工厂
│       ├── agnes.js  hunyuan.js  deepseek.js
└── test/                      node --test 单测（49 个，全通过）
```

几个值得了解的架构决定：

**纯本地正则判定上下文，零额外请求。** 是否需要工具 / 插件清单（`classifyToolNeed`）完全由本地正则完成，不发任何 API，因此「为了省 token 又多花一次 API」的情况不存在；判定本身也不消耗 token。

**生图指令只在生图任务注入。** `appendImageDirective()` 仅在 `task === 'image'` 时追加，非生图草稿的 system prompt 与旧版完全一致，零回归。

**清单渲染与缓存解耦。** 缓存存原始 `plugins`，`fetchCatalog` 每次按传入的 `catalogMode` 实时重渲，切换扁平 / 聚合后立即生效，无需清缓存。

**HTTP 路由优先于内核，带信任围栏。** 插件路由前缀高于内核 `/api`，因此内置与内核一致的回环来源检查，避免越权。

## 验收情况

在 DSH 桌面端（desktop profile）真实环境中实测：

| 项目 | 方式 | 结果 |
| --- | --- | --- |
| 单测 | `node --test test/*.mjs` | 49/49 通过；`--check` 覆盖全部 js |
| 离线控制面 smoke | 本地 HTTP 套件 | 21/21 通过（state / config / keys / optimize 无 Key / 静态资源 / diag / stat / 404） |
| DSH 重启 | 强杀后重启 | 5 进程、主窗口标题正常、无新增 `crash-*` |
| 配置 hash | 重启前后比对 | `cordis.patch.yml` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` 全程未变 |
| dock 组件 | 真实 DSH 内 POST `/diag` | `hasUseInput=true`、`hasInputActions=true`（含 `setDraft`）、`hasLexicalEditor=true` → 官方写入路径成立 |
| HTTP 端点 | 回环请求 | `/health` 200、`asset/whale-idle.gif` 200；真实工具清单 59 条 |
| 端到端优化 | 切 DeepSeek（继承环境变量 Key）→ POST `/optimize` | 3.78s 返回，优化后提示词结构完整，推荐解析出 2 个真实插件 |
| 市场索引 | 三源竞速 | 1.7s 拉到 3.78MB / 4704 条，减已装后渲染截 ≤60 条；缓存落盘 2.3MB |
| 软停用两态 | `enabled` true/false 切换 | 关闭态连插件路由都不存在，client bundle 不注入，dock 与设置页一起消失；离线 smoke 26/26 通过 |

GUI 像素级目视（按钮真的不在了、设置页真的没这一栏）仍建议你在界面上看一眼；命令行已验证路由、client bundle 生命周期与 slot 注册链路。

## 已知边界

- **生图 Token 不可比**：图像生成 API 不返回 token 用量，因此生图类优化只比质量（评分）+ 现象级观察，不比 token。
- **单样本结论**：Benchmarks 每格 n=1，属现象级观察；要统计显著需每格多跑取均值。
- **风格偏袒**：「可爱度」维度对二次元天然友好，Agnes 的动漫优势部分来自风格选择而非纯 prompt 质量。
- **混元 Hy4 是推理模型**：对「11 条 SYSTEM + 59 工具 + ≤60 插件清单」（约 20KB）会先生成极长 `reasoning_content`，非流式下常超时；已默认带 `thinking:{"type":"disabled"}`，开启深度思考需接受 ~120s 等待。
- **首次优化较慢**：首次要拉 3.78MB 索引（≤9s），之后走 24h 缓存；`meta.discoveryMs` 会显示耗时。
- **DSH 重启才加载新代码**：改插件源码后必须重启 DSH（或宿主热重载）才生效，运行副本在 `node_modules/prompt-whale`。

## 排错

- **按钮不出现**：查 `cordis.patch.yml` 的 `- insert:` 是否写成两级缩进（裸 `- id:` 不加载）、四个文件是否一致、DSH 是否重启。
- **`web boot` 崩 / app 退出**：`client.js` 的 factory 里必须同时有 `const module={exports:{}}` 和 `const exports=module.exports`。
- **图标裂了**：`/prompt-whale/asset/whale-idle.gif` 是否 200；`onError` 自动切 PNG 首帧；`client.js` 已将鲸鱼图以 base64 内联，删 `assets/` 也不丢。
- **写入不生效**：`GET /prompt-whale/diag` 看 `hasInputActions` / `hasLexicalEditor`，按输入框读写四级降级定位；最坏走「复制优化文本」。
- **优化很慢 / 超时**：首次拉索引 ≤9s，之后走缓存；Hy4 深度思考会到 ~120s。确认已点「保存配置」再调超时，或临时切 Agnes / DeepSeek 对比。
- **provider 报错**：`/health` 看当前 model 与 `hasKey`，设置面板自测按钮直接显示错误原文。401=鉴权失败、402=额度、404=模型不存在、429=限流、5xx=服务异常。

## 开发

```bash
node --test test/*.mjs        # 需 Node.js 18+，49 个单测全通过，不出网
node --check index.js client.js lib/*.js lib/providers/*.js   # 语法检查
```

改完源码后记得同步 `profiles/desktop/node_modules/prompt-whale`（若是实体副本）；用目录 junction 则改一处即可。不推送 GitHub 时先只留本地。

## 安全与隐私

- 所有状态写入 `<DSH_HOME>/prompt-whale/`（配置、Key、缓存、统计），仅落在本机，不上传任何位置。
- 后端 Key 写入 `storages/prompt-whale/<provider>.key`（权限 `0600`），接口永不回显，仅显示 `hasKey` 与 `…abcd` 指纹；测试与发现模型两次探测也把回包中的 Key 一律脱敏。
- 插件 HTTP 路由带请求信任围栏：仅回环来源 / 同源可访问，跨站或异源请求一律拒绝（fail closed）。
- 客户端结构诊断（`/diag`）只上报 props 键名与是否找到 Lexical 元素，**不含草稿正文**。

## 免责声明

- **本插件是本地客户端，不是模型服务方。** 所有优化结果由你所选的第三方模型（Agnes / 腾讯云 TokenHub / DeepSeek）生成并传输；插件不托管、不修改、不过滤任何模型输出。
- **模型可能产出错误或有偏颇内容，请自行核实后使用。**
- **本插件与上述任何模型提供方无隶属或背书关系**，厂商名称仅在说明来源时引用。
- 使用各后端即表示你同意对应上游的服务条款与用量政策；因违反上游政策导致的限流、封禁或其它后果由使用者自行承担。

## 许可证

MIT，见 [LICENSE](LICENSE)。
