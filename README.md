# 🐋 鲸语提示词助手 prompt-whale

把 dsh 主输入框里**尚未发送**的草稿，交给可选大模型润色成自包含、可直接执行的高质量提示词，浮层里可编辑后「替换」或「取消」；同时基于当前任务，从 dsh 官方插件市场索引里推荐**尚未安装**的插件。

默认后端 Agnes（免费档），设置面板可切 **混元 Hy4** / **DeepSeek**。三个后端都是 OpenAI 兼容 `/chat/completions`。

---

## 1. 用户流程

1. 在 dsh 主输入框写好草稿，先别发送。
2. 点输入框旁的小鲸鱼娘「润色」按钮（`conversation.input.dock`，order 25）。
3. 插件读取草稿 + `ctx.tools.view()` 的当前工具清单 + 市场索引里减掉已装插件后的候选清单，一起发给所选后端。
4. 浮层卡片显示优化后的提示词（可编辑），下方是「💡 推荐插件」卡片。
5. **替换** → 覆盖输入框草稿；**取消** → 输入框原样不动；写入通道全失效时保留「复制优化文本」手动粘贴。

任何失败都不会动输入框，只在浮层里显示可读中文错误。

---

## 2. 目录结构

```
data/local-plugins/prompt-whale/
├── index.js                     node 侧：工具清单 / HTTP 控制面 / 配置与 Key 落盘
├── client.js                    前端：dock 按钮 + OptimizerCard 浮层 + SettingsPanel
├── cordis.patch.yml             包内 bundle 声明
├── package.json
├── assets/
│   ├── whale-idle.gif           小鲸鱼娘精致版 idle（工作区素材原样拷贝）
│   └── whale-idle.png           GIF 首帧，96px 宽，静态回退
├── lib/
│   ├── logic.js                 SYSTEM(§6 逐字) / USER(§7) / 工具渲染 / extractParts / 清洗
│   ├── plugin-discovery.js      市场索引竞速 / 解析 / 减已装 / 粗筛 / 截断 / 24h 缓存
│   └── providers/
│       ├── _shared.js           OpenAI 兼容调用 + 错误映射 + makeProvider
│       ├── index.js             createProvider 工厂
│       ├── agnes.js  hunyuan.js  deepseek.js
└── test/                        24 个 node --test 单测（全通过）
```

---

## 3. 挂载（本机 desktop profile 四文件铁律）

DSH **不会自动应用包内 `dsh.bundle.patch`**，四处必须一致，改之前先强杀 DSH（运行期间会被 app 回写）：

| 文件 | 要加的内容 |
| --- | --- |
| `data/profiles/<profile>/package.json` | `dependencies["prompt-whale"] = "file:<DSH_LOCAL_PLUGINS>/prompt-whale"`（`<DSH_LOCAL_PLUGINS>` 即 DSH 的本地插件根目录，例如 `data/local-plugins`），`dsh.profile.bundles` 追加 `"prompt-whale"` |
| `data/profiles/desktop/cordis.patch.yml` | 手写 `- insert:` → `- id: prompt-whale / name: prompt-whale / config.enabled: true`（裸 `- id:` 只是 config override，不会加载） |
| `data/profiles/desktop/pnpm-lock.yaml` | importer 的 `specifier` / `version`、`packages` 段的 `resolution: {directory: ...}`、`snapshots` 段空条目，三处都要有（照 `dsh-prompt-optimizer` 的写法） |
| `data/profiles/desktop/node_modules/prompt-whale` | 插件目录的实体副本或目录 junction |

cordis id 与包名、配置命名空间必须一致，否则热开关失效。改完重启 DSH，确认 `logs/crash-*` 无新增。

**本机实测的宿主行为（2026-11-06，结论已修正）**：DSH 的插件管理器会按「当前启用的插件」重写 profile。20:39–20:40 的一次操作把 `dsh-prompt-optimizer` **整套替换**成了 `prompt-whale` —— `package.json` 的 dependencies 与 bundles、`pnpm-lock.yaml` 的三处、`cordis.patch.yml` 的 `- insert:` 四处全部换名，不是简单的「bundles 末尾覆写」。`dsh-hot-installer` 日志里的 `dsh reconciles profile bundles natively` 只是说明宿主会协调 bundles，不是这次替换的根因。蓝本插件源码仍在 `data/local-plugins/dsh-prompt-optimizer/`，需要时可照本表重新挂回。

---

## 4. 后端 provider

| id | label | baseURL | 默认 model | 环境变量 |
| --- | --- | --- | --- | --- |
| `agnes`（默认） | Agnes | `https://api.agnes-ai.cn/v1`（国内 Key，实测可用）；国际站 Key 用 `https://apihub.agnes-ai.com/v1` | `agnes-2.5-flash` | `AGNES_API_KEY` |
| `hunyuan` | 混元 Hy4 | `https://tokenhub.tencentmaas.com/v1` | `hy4` | `HUNYUAN_API_KEY` / `HY4_API_KEY` |
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | `DEEPSEEK_API_KEY` |

**混元 Hy4 口径已查证**（腾讯云官方「快速入门」文档 + 本机假 Key 探测，2026-11-06）：按量调用地址 `https://tokenhub.tencentmaas.com/v1/chat/completions`，`model` 必须全小写 `hy4`（填错 404）；带无效 Key 返回 401 `401002 The API Key does not exist or signature verification failed`。旧域名 `api.hunyuan.cloud.tencent.com/v1` 与 `api.hunyuan.tencent.com/v2` 实测 404 已下线，计划里那个旧地址别填。

**API Key 获取步骤**（需要你本人完成，因为要腾讯云账号 + 实名认证）：

1. 注册腾讯云并完成**实名认证**（硬要求）→ 打开 <https://console.cloud.tencent.com/tokenhub/>，按提示开通 TokenHub。
2. 领免费包：模型广场 <https://console.cloud.tencent.com/tokenhub/models> → 右上角「**新用户福利免费体验**」→ 勾选 Hy4 → 立即领取。语言模型 100 万 Tokens / 有效期 1 年，活动至 2026-12-31；也可从「启用管理」领，或首次调用自动领取。只领近期要用的，过期作废。
3. 建 Key：<https://console.cloud.tencent.com/tokenhub/apikey> → 选地域 → 「创建 API Key」→ 填名称、额度限制、可访问范围（全选或限定 Hy4）→ 确定。**创建后只显示一次，立刻复制**；丢了只能删掉重建。
4. 若没领免费包，还要在模型广场对 Hy4 开启「免费体验」与「启用后付费」，否则会报额度/402。
5. 填进插件：设置页「鲸语提示词助手」→ provider 选「混元 Hy4」→ 粘贴 Key → 保存（或设环境变量 `HUNYUAN_API_KEY` / `HY4_API_KEY`）。baseURL 与 model 已按官方值预置，不用改。
6. 自测：`POST /prompt-whale/optimize`，或直接用下面的 curl。

> **Token Plan 别用在插件上**：订阅地址 `https://tokenhub.tencentmaas.com/plan/v3`（限时 2.5 折更便宜）官方明确「仅限 AI 编程工具/智能体工具交互式使用，禁止用于自动化脚本或应用后端的非交互式批量调用」。本插件是后端自动调用，必须走按量 `/v1`。第三方文章里出现的 `https://api.lkeap.cloud.tencent.com/plan/v3` 与官方文档不一致，以控制台显示为准。

```bash
# 自测 Key 是否有效（把变量换成你的 Key；不要写进日志或记忆）
curl -sS -X POST 'https://tokenhub.tencentmaas.com/v1/chat/completions' \
  -H "Authorization: Bearer $HUNYUAN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"hy4","messages":[{"role":"user","content":"只回复两个字：收到"}]}'
```

排错：401 `401002` = Key 不存在/签名失败（复制漏字符或地域不对）；404 = model 名不是全小写 `hy4` 或用了已下线旧域名；402/额度 = 没领免费包或没开后付费；429 = 限流。

- 统一请求体：`{ model, messages:[{role:'system',...},{role:'user',...}], temperature:0.3, stream:false }`。
- Key 优先级：设置面板保存的 `storages/prompt-whale/<provider>.key`（`mode 0600`）> 环境变量。
- 错误映射：401/403 鉴权失败、402 额度、404 模型不存在、429 限流、5xx 服务异常、超时 / 网络 / 空输出，全部给中文可读提示。

> **Agnes 实测（2026-11-06，含真实 Key 完整调用）**：两套端点、**Key 不通用** —— 同一把 `sk-` Key 在 `https://apihub.agnes-ai.com/v1/models` 与 `https://apihub.agnes-ai.cn/v1/models` 都返回 401 `Invalid token (AgnesAI_error)`，而在 `https://api.agnes-ai.cn/v1/models` 返回 200，列出 9 个模型：`agnes-2.5-flash`、`agnes-2.5-pro`、`agnes-2.5-pro-alpha/beta`、`agnes-3.0-flash`、`agnes-image-2.1/2.5-flash`、`agnes-video-2.5(-flash)`。`POST https://api.agnes-ai.cn/v1/chat/completions` 用 `agnes-2.5-flash` 返回 200 正常生成；插件端到端 `/optimize` 也跑通（15.3s，优化文本 + 推荐解析正常）。无 Token 时 `apihub` 返回 401 `Token not provided`，鉴权格式是 `Authorization: Bearer sk-...`。本机 `dsh-our-free-model/src/providers/registry.json` 里是兼容旧 ID `agnes-2.0-flash`。Key 在 https://platform.agnes-ai.com 免费注册（邮箱 / Google / GitHub，无需信用卡），控制台「API 密钥」创建，`sk-` 开头且只显示一次；约 20 次/分钟限流。Hy4 端点已用假 Key 探测（401 `401002`），旧域名实测 404；没有真实 Hy4 Key，未打过完整生成调用。

### 顺带：把 Agnes 配成 DSH 主对话模型（设置 → 模型 → 自定义模型 API）

| 字段 | 填什么 |
| --- | --- |
| Provider ID | `agnes`（小写字母开头，唯一标识，用于派生凭据名） |
| 显示名称 | `Agnes AI` |
| API 地址 | `https://api.agnes-ai.cn/v1`（国内 Key，实测 200）；国际站 Key 才用 `https://apihub.agnes-ai.com/v1`。只到 `/v1`，**不要**带 `/chat/completions` |
| API 协议 | `OpenAI Chat Completions` |
| API 密钥 | `sk-...`（platform.agnes-ai.com 创建） |
| 模型列表 | 下方被截断的部分：必须至少加一行，模型 ID `agnes-2.5-flash`，名称 `Agnes 2.5 Flash`（选填）。也可加 `agnes-2.5-pro` / `agnes-3.0-flash`。不加模型行，「创建」按钮不亮 |
| **模型行高级项「最大输出 token 数」** | **必须填 ≤65536**（建议 `8192`）。不填会用 pi-ai 的默认值 131072（128K），Agnes 直接返回 400 `max_tokens 不能超过 65536`，主对话连 `hi` 都发不出去。等价写法：在 `cordis.patch.yml` 的 `llm-pi-ai.config.providers.agnes.models[0]` 加 `maxTokens: 8192`，重启 DSH |

这只是给 DSH 主对话加 provider，**与「鲸语提示词助手」插件是两条独立配置**：插件走自己的设置面板（`settings.section` 的「鲸语提示词助手」分区）或环境变量 `AGNES_API_KEY`，不会自动读这里填的 Key。

---

## 5. 输入框读写（计划 §9 的风险点已解掉）

从 `app.asar`（0.2.2-rc.1）实测到的宿主真实结构：

- 主输入框是 **Lexical `contenteditable`**，不是 `<textarea>`；计划里假设的 `nativeInputValueSetter` 在这里不适用。
- 宿主 `ctx.uiSession.provide({ hooks:['conversation','input'], props:['inputActions'] })` 给 session-scoped slot 组件注入 `useInput`（草稿 store，`state.draft`）与 `inputActions.setDraft(text)`。
- 因此 **优先用官方 API**：`props.useInput(s => s.draft)` 读、`props.inputActions.setDraft(text)` 写。

四级降级（写）：

1. `inputActions.setDraft`（官方）
2. `el.__lexicalEditor.update()` + `require('lexical')` 的 `$getRoot/$createParagraphNode/$createTextNode`
3. `contenteditable` 建 Range 全选 → `document.execCommand('insertText', false, text)`，写后读回校验
4. `textarea` 原生 setter + `input`/`change` 事件

全失败 → 浮层保留「复制优化文本」，输入框不动。

客户端首次挂载会 POST `/prompt-whale/diag` 上报**结构**诊断（props 键名、是否有 `useInput` / `inputActions`、是否找到 Lexical 元素），**不含草稿正文**。排错时 `GET /prompt-whale/diag` 可直接看。

---

## 6. 插件发现（对计划 §5 的一处实测改进）

三个源都是同一份 3.78MB / 4704 条的 format-1 索引：

- `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`
- `https://awesome-dsh-plugin.com/index.json`
- `https://dshmarket.com/index.json`

本机实测 jsdelivr / dshmarket 常要 12s 才超时，`awesome-dsh-plugin.com` 秒回。所以实现成**三源并行竞速，首个解析成功者胜出，其余立即 abort**（单请求 9s 超时），效果等同「主 → 镜像兜底」且首次不会被慢源拖住。

- 解析：顶层 `plugins[]` → `{ name, title(owner/repo), description: zh||en（注意是对象不是字符串）, category: metadata.category, repo: repository.url }`。
- 减已装：`profile/desktop/package.json` 的 dependencies keys + 工具名，归一化后做 best-effort 匹配。
- 粗筛：按草稿关键词（图片/视频/搜索/代码/文档/记忆/终端/浏览器/翻译/音频）把同 category 排前面，再截 ≤60 条 / ≤6000 字。
- 缓存：`storages/prompt-whale/plugin-cache.json`，TTL 24h；命中直接返回，可在设置面板清缓存。
- 全源失败 → 清单写 `(无)`，交给 SYSTEM 规则 #11（模型凭自身知识推荐，不确定时只说能力类别）。真正的防编造约束在 SYSTEM #10/#11。

---

## 7. HTTP 端点（prefix `/prompt-whale`，仅回环来源）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/state` | 配置（脱敏）+ 三个 provider meta + `hasKey` + 工具清单 + 统计 |
| GET | `/catalog` | 强制刷新工具清单 |
| GET | `/health` | 当前 provider / model / 是否有 key |
| GET | `/asset/whale-idle.gif\|png` | 小鲸鱼娘图标 |
| GET | `/diag` | 客户端结构诊断 |
| POST | `/optimize` | `{text}` → `{ok, optimized, recommendations, recommendationsParsed, meta}` |
| POST | `/config` | 保存 provider / models / baseURLs / timeoutMs / temperature / blacklist |
| POST | `/keys` | `{provider, key}` 保存或清除（key 留空即清除） |
| POST | `/cache/clear` | 清市场索引缓存 |
| POST | `/stat` | `{action:'replaced'\|'cancelled'}` 统计 |
| POST | `/diag` | 客户端上报结构诊断 |

请求体上限 128KB；草稿上限 8000 字；斜杠指令直接跳过。

---

## 8. 验收（计划 §10 对应）

1. DSH 重启后输入框旁出现小鲸鱼娘按钮，设置页出现配置面板，无新增 crash。
2. 输入「帮我生成一个小鲸鱼吃米饭的图片」→ 点按钮 → 浮层显示优化版（含图像类工具上下文）→ 点「替换」→ 输入框变成优化文本，可正常发送。
3. 同上点「取消」→ 输入框原文不变。
4. 未配 Key 点按钮 → 提示「请先在设置页填写…API Key」；配错 Key → 「鉴权失败 (401)」。
5. 设置页保存 Key 后重启仍在。
6. 切到混元 Hy4 / DeepSeek，功能一致可用。

### 已完成实测（2026-11-06 20:20，desktop profile 重启后）

| 项 | 结果 |
| --- | --- |
| 单测 | `node --test` 49/49 通过；`--check` 覆盖全部 js |
| 离线控制面 smoke | 21/21 通过（state / config / keys / optimize 无 Key / 静态资源 / diag / stat / 404） |
| DSH 重启 | 5 进程、主窗口标题 `DeepSeek Harness`、最近 20 分钟无新增 `crash-*` |
| 配置 hash | `cordis.patch.yml` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` 全程未变；`package.json` 的 bundles 末尾被 DSH 原生 reconcile 覆写（见 §3，已验证不破坏其它插件） |
| dock 组件 | 客户端已挂载并 POST `/diag`：`hasUseInput=true`、`hasInputActions=true`（含 `setDraft`）、`hookDraftType=string`、`composerFound=true`、`hasLexicalEditor=true` → **官方写入路径在真实 DSH 内成立** |
| HTTP 端点 | `<port>/prompt-whale/health` 200、`asset/whale-idle.gif` 200 / 127385B；真实工具清单 59 条（端口每次随机） |
| 端到端优化 | 切到 DeepSeek（本机 `DEEPSEEK_API_KEY` 被 DSH 继承，`hasKey=true`，零配置可用）→ `POST /optimize`「帮我生成一个小鲸鱼吃米饭的图片」→ 3.78s 返回，优化后提示词结构完整，推荐小节解析出 2 个真实插件 `dsh-preview-media` / `dock-images` |
| 市场索引 | 三源竞速 1.7s 拉到 3.78MB / 4704 条，胜出源 `dshmarket`，减已装后 4691 条候选，渲染时截 ≤60 条；缓存落盘 2.3MB |

`meta.recsCount` 是「减已装后的候选总数」，不是实际喂给模型的条数；实际清单始终 ≤60 条 / ≤6000 字。

**仍需你点一次确认的**：设置页面板目视、浮层「替换 / 取消」在 GUI 里的点击效果（后端链路已验证，GUI 交互无法从命令行代点）。Agnes / 混元 Hy4 需要你自己的 Key；填进设置页即可切换，Hy4 演示时用 `hy4` + TokenHub 地址。

---

## 9. 排错

- **按钮不出现**：查 `cordis.patch.yml` 的 `- insert:` 是否写成两级缩进（裸 `- id:` 不加载）、四个文件是否一致、DSH 是否重启。
- **`web boot` 崩 / app 退出**：`client.js` 的 factory 里必须同时有 `const module={exports:{}}` 和 `const exports=module.exports`。
- **图标裂了**：`/prompt-whale/asset/whale-idle.gif` 是否 200；`onError` 会自动切到 PNG 首帧；另外 `client.js` 已将鲸鱼图以 base64 内联，即便删除 `assets/` 目录图标也不会丢失。
- **写入不生效**：`GET /prompt-whale/diag` 看 `hasInputActions` / `hasLexicalEditor`，按第 5 节四级降级定位；最坏走「复制优化文本」。
- **优化很慢**：首次要拉 3.78MB 索引（≤9s），之后走 24h 缓存；`meta.discoveryMs` 会显示耗时。
- **provider 报错**：`/health` 看当前 model 与 `hasKey`，设置面板自测按钮会直接把错误原文显示出来。

---

## 10. 本地开发

```bash
node --test test/*.mjs  # 需 Node.js 18+
```

改完源码后记得同步 `data/profiles/desktop/node_modules/prompt-whale`（若是实体副本）；用目录 junction 则改一处即可。不推送 GitHub，先只留本地（计划 §12）。

---

## 11. 关闭插件 → 小鲸鱼图标和设置页一起消失

**结论：能，已实现并做过开/关两态实测。**

### 怎么关

在 `data/profiles/desktop/cordis.patch.yml` 里把本插件的 `config.enabled` 改成 `false`（插件面板里的开关等价于写这个字段）：

```yaml
- insert:
    - id: prompt-whale
      name: prompt-whale
      config:
        enabled: false
```

改完重启 DSH（或等宿主热重载）。改回 `true` 即恢复，不需要重新装包。

### 机制

`app.asar` 里查到的宿主链路：

- `dsh-plugin-package-inventory-deepseek` 的写法是 `apply(ctx, config) { if (config.enabled === false) return; }` —— **cordis 把 patch 的 `config.enabled` 作为 `apply` 的第二个参数传入**；另一些插件里它是响应式值 `config.enabled.get()`。
- `dsh-client-modules` 按 cordis 的 `internal/plugin` 生命周期增量增删浏览器端 client bundle，所以插件被关掉时前端模块一起撤。
- `ctx.effect(() => teardown)` 的 disposer 会在模块卸载时被调用，注销两个座位。

本插件在此基础上加了四层保险，不依赖宿主某一种具体行为：

| 层 | 实现 |
| --- | --- |
| node 侧 | `apply(ctx, config)` 用 `readEnabled()` 读 `config.enabled`（兼容布尔 / `.get()`），为 false 时**连 HTTP 路由都不注册** |
| client 侧 | `apply(ctx, config)` 为 false 时先 `teardown()` 再直接 return，不注册 `conversation.input.dock` 与 `settings.section` |
| disposer | 同时保存 `ctx.slots.inject(...)` 与内部 `ctx.slots.register(...)` 的销毁器，`teardown()` 全部调用（旧版只存了 inject 的那个） |
| 心跳兜底 | 每 3s POST `/prompt-whale/heartbeat`；后端报 `enabled=false` 或连续 2 次请求失败（≤6s）→ 前端主动 `teardown()` |

新增端点：`POST /prompt-whale/heartbeat`（写 `storages/prompt-whale/heartbeat.json`，返回 `{ok, enabled, at}`）、`GET /prompt-whale/heartbeat`；`GET /state` 也返回 `enabled`。心跳文件是判断「client 是否还活着」最直接的依据。

### 两态实测（2026-11-06 20:53–20:55）

| 检查项 | `enabled: false` | `enabled: true` |
| --- | --- | --- |
| `/prompt-whale/health` | 404 | 200 |
| `/prompt-whale/state` | 404 | 200（`enabled:true`） |
| `/prompt-whale/asset/whale-idle.gif` | 404 | 200 / 127385B |
| `heartbeat.json` | 不生成（client 未运行） | 生成，`seq=12`、`mounted:true` |
| `diag.json`（dock 组件上报） | 不更新 | 更新 |
| 新增 `crash-*` | 0 | 0 |

`heartbeat.json` 在启用态持续递增 `seq`，证明浏览器端模块确实加载并执行了 `apply`；关闭态连插件路由都不存在，client bundle 不会被注入，dock 按钮与设置页自然一起消失。离线 smoke 26/26 通过（含 `config.enabled=false` 布尔与响应式两种跳过注册）、单测 49/49 通过。

> GUI 像素级目视（按钮真的不在了、设置页真的没这一栏）仍需要你在界面上看一眼；命令行能验证的是路由、client bundle 生命周期与 slot 注册链路，不能代你点开设置页。

---

## 12. 按钮外观：自由摆放与缩放

小鲸鱼娘按钮默认仍停靠在输入框旁（`conversation.input.dock`），不打扰原有布局。想当挂件看的话：

- **按住按钮拖动** → 脱离 dock，变成 `position: fixed` 的浮动按钮，可放到屏幕任意位置（自动夹在视口内）
- **浮动后拖右下角的小方块** → 调整头像大小（16–96px，文字大小跟着变）
- **双击按钮** → 复位为「停靠 + 20px」
- 设置页「按钮外观」卡片里有大小滑块、当前模式/坐标显示、恢复默认按钮；改了即时同步到按钮
- 位置与尺寸落盘 `storages/prompt-whale/dock-ui.json`，通过 `GET/POST /prompt-whale/ui` 读写，重启后保留

拖拽用 pointer events（触屏也能用），移动超过 4px 才算拖动，不会误触发润色；浮动按钮用 `createPortal` 挂到 `document.body`，避开 dock 容器的 overflow/transform。

设置页侧栏图标也不再是默认齿轮：注册了 `settings.section.icon`，按宿主契约 **id 必须等于 `settings.section` 的 id**（未匹配的 id 永远不渲染），渲染小鲸鱼娘头像（宿主传入 `size=16`）。

---

## 13. 超时与自测默认值

- **默认超时 60000ms**（原 30000ms）。混元 Hy4 要吃下 11 条 SYSTEM 规则 + 59 个工具 + 最多 60 条推荐清单，推理时间明显长于单句请求：本机实测单句 curl 到 TokenHub 只要 2.5s，而插件完整请求在 30s 时超时。Agnes 同样请求约 15s。上限可在设置面板调到 120000ms。
- **设置面板的输入是本地草稿**：改完超时 / temperature / 黑名单 / 模型 / API 地址后，必须点「**保存配置**」才会写到后端。曾经出现过「面板填 40000、报错却是 30000ms」——就是没保存。现在面板会在有未保存改动时把按钮标成「保存配置 ●」并显示红字提示；自测遇到超时也会追加这条提示。
- **默认自测文本**：「帮我生成一个小鲸鱼娘吃米饭的图片」（计划 §10 的验收句，带「娘」字），打开设置页即预填，点「运行润色自测」直接验证 Key / 模型 / 网络。
- 超时错误的完整文案：`请求超时（<当前生效值>ms）：可在设置面板调大超时`。若确认已保存仍超时，可在设置面板调到 90000–120000，或临时切到 Agnes / DeepSeek 对比。

### Hy4 超时的真正根因与根治（2026-11-06 实测）

Hy4 是**推理模型**，对这套「11 条 SYSTEM 规则 + 59 个工具 + 最多 60 条推荐清单」（约 20KB / user 12000 字）会先生成极长的 `reasoning_content`：

| 实验 | 结果 |
| --- | --- |
| 单句 curl（`只回复两个字：收到`） | 2.5s 返回 200 |
| 完整请求体 + `stream:false` | **120s 0 字节**，服务端一直不回 |
| 完整请求体 + `stream:true` | 首字节 1.27s，但 45s 收到 145KB 全是 reasoning_content，正文还没开始 |
| 完整请求体 + `max_tokens:1500` | 28s 返回，`finish_reason:length`、`content:""`（1500 tokens 全被思考吃光） |
| 完整请求体 + `thinking:{"type":"disabled"}` | **8.6s 返回，content 535 字，reasoningLen=0，finish_reason:stop** |

所以单纯调大超时没用（试过 60000 仍超时，直接 curl 120s 也不回）。TokenHub 实测四个候选参数里**只有 `thinking:{"type":"disabled"}` 有效**：`reasoning_effort:low`、`enable_thinking:false`、`chat_template_kwargs` 都被服务端忽略、仍返回 reasoning_content。

实现：`lib/providers/hunyuan.js` 的 `extraBody` 默认带 `thinking:{"type":"disabled"}`，`callChat` 把它合并进请求体；设置面板有「启用深度思考」复选框（`config.hy4Think`），勾上就不带该参数、让 Hy4 完整推理。**勾上会自动把超时顶到 120000ms 并立即保存，取消自动恢复 60000ms**——不用再手动改数值、也不用再点「保存配置」；后端 `/config` 同样做了联动，显式传 `timeoutMs` 时以显式值为准。即便 120s 也可能等不到非流式响应，日常润色建议保持关闭（约 8s 出结果）。

---

## 14. 关闭插件 / 玻璃胶囊 / 去掉蓝色手柄

**关闭插件后图标和设置页一起消失**（之前只认 `cordis.patch.yml` 的 `config.enabled`，而 DSH 插件面板写的是另一套字段，所以关不掉）：

- 宿主插件面板的开关来自 `dsh-plugin-manager` 的 `writePluginEnabled`，写的是 patch 里独立条目 `- id: prompt-whale / disabled: true`，**不是** `config.enabled`。本地 `file:` 插件靠顶层 `- insert:` 挂载，`listPlugins()` 会把它判为 `unaddressable`（要求父树是 `include` 且候选条目唯一），宿主开关因此可能直接写不进去。
- 现在后端 `effectiveEnabled = cordis config.enabled && config.json.enabled && !宿主 patch disabled`，三处任一为 false 都算停用。
- 软停用时**保留控制面路由** `/state` `/health` `/heartbeat` `/config`（都带 `enabled`），其余功能路由 404。前端心跳收到 `enabled:false` 立即撤掉 dock + settings + 侧栏图标，收到 `true` 自动重挂，不用重启。
- 设置页新增「停用插件」按钮（立即撤 UI）；UI 全撤后按 **Alt + Shift + W** 复活。若 cordis 层真的卸载了模块（宿主开关生效），控制面也没了，只能从宿主面板重新启用或改 patch。
- `POST /config {"enabled": false|true}` 可直接用；`GET /state` / `/heartbeat` 能查当前状态。

**外观**：胶囊改成苹果式透明毛玻璃 —— `color-mix(in srgb, var(--dsw-alias-bg-layer-1) 42%, transparent)` + `backdrop-filter: blur(20px) saturate(180%)` + 半透明白边和内高光，亮/暗主题自动跟随宿主变量；不支持 `color-mix` 时回退中性半透明底色。右下角蓝色缩放方块**已移除**，缩放改为浮动后在按钮上**滚鼠标滚轮**（16–96px，320ms 合并落盘）或设置页滑块，双击仍复位。

---

## 15. 按需附带工具清单（省 token / 省时间）

**问题**：旧流程每轮润色都读宿主工具清单（≤6000 字）+ 插件市场索引缓存（2.3MB / 4704 条，渲染 ≤6000 字），system 里还有 11 条工具/推荐规则，并要求模型输出「💡 推荐插件」小节。缓存命中虽不发网络，但上下文字符数、推理时间与输出长度都是实打实的开销；一句生图提示词根本不需要这些。

**先澄清**：插件并没有真的调 GitHub API，它拉的是 dsh 插件市场索引（三源竞速：jsdelivr / awesome-dsh-plugin.com / dshmarket.com，内容含仓库地址），并把宿主工具清单（其中含 `mcp__github__*`）一起塞进请求。用户说的「去 GitHub 搜」指的是这一整套上下文准备。

**做法（`/lib/context-policy.js`，纯本地正则，零 API 调用 / 零 token）**：

- `classifyToolNeed(text, policy)` 命中「插件/工具/MCP、GitHub/仓库、终端/脚本、联网/检索、文件/代码操作、调用接口、索要推荐」→ 走完整请求；否则（生图描述、文本改写、问答、问候、无信号）→ 走精简请求。
- 精简请求：不调 `buildCatalog()`、不调 `fetchCatalog()`、不读 2.3MB 缓存；system 换成 `LEAN_SYSTEM_PROMPT`（删掉全部工具/推荐规则与推荐小节要求），user 只含原始草稿。
- 三档策略（设置页「工具 / 插件清单策略」、`POST /config {"catalogPolicy": ...}`）：`auto`（默认）/ `always` / `never`；非法值回落 auto 并被 `/config` 拒绝。
- `/optimize` 的 `meta` 新增 `contextMode`（lean/full）、`contextReason`、`catalogPolicy`、`promptChars`、`contextSavedChars`（估算）、`skippedDiscovery`；浮层底部会显示「精简上下文（跳过工具/插件检索，省约 12K 字）」。

**取舍**：auto 采取「宁可少带」—— 无明显信号就不附带，需要强制时切 `always`。判断本身不发任何请求，所以不存在「为了省 token 又多花一次 API」。`request` 参数由后端统一构造，provider 层只负责发送，便于精确统计 prompt 字符数。

---

## 16. 清单瘦身：工具按相关性筛选，插件压缩描述

full 模式原来是把宿主工具清单（59 条 / 6000 字符，全量、宿主给什么顺序就什么顺序）和插件候选清单（≤60 条 / 6000 字符，但实际 6000 ÷ 每条约 270 字符 → **只装得下 22 条**）一起塞进去。两处都做了瘦身。

**工具清单：按草稿相关性筛选**（`lib/tool-relevance.js`）

- 四档打分：显式点名 > 类别命中（**工具名是强证据、描述是弱证据**）> 词面重合（≥2 个词元才算，单次重合是噪声）> 通用兜底（read/write/search/bash 之类）
- **点名的判定很严**：只有原名（`mcp__github__create_issue`）、动作名（`create_issue`）或动作里的独特片段（≥5 字符且不是常见词）出现在草稿里才算点名。写成「在 GitHub 建个 issue」只是描述意图、**不算点名**——早期版本按「任意 ≥4 字符片段」匹配，一次这种草稿会必留 28 条工具（issue / create / file 这类常见词误触发），实测后收紧
- 类别判定分三档正则：`nameRe`（只看工具名，如 `image_gen`→image、`ffmpeg`→video）、`descRe`（描述里的术语，权重低）、`hintRe`（草稿口语，如「搜一下」「剪一下」）。避免用同一套正则判描述，把「保存」当成 file 类证据
- **显式点名必留，不受条数与字符上限约束** —— `SYSTEM_PROMPT` 第 4 条要求「工具名只能从清单里取」，用户点名的工具不在清单里，模型就不会在产物里提它，这是正确性问题而不是省字问题
- 通用工具单独成组并封顶（默认 5 条），避免 read/write/search/bash 这一族吃掉整个预算
- 一条都没命中时回退通用工具（再不行回退前若干条），**绝不给模型空清单**（空清单会让规则 4/5 退化成「不指定工具」）
- 预算：≤15 条 / ≤2500 字符（原 59 条 / 6000 字符）

**插件清单：压描述、去类别**（`lib/plugin-discovery.js` 的 `renderCatalog`）

- 行格式改为 `名字(owner/repo) — 简短描述`，去掉市场分类（`category` 对「这插件干什么」几乎无增量）
- 描述二次截断到 110 字符（市场文案是完整简介，营销腔占一半，前两句足够判断用途）
- `ownerRepo` 保留 —— 它是可操作性信息：模型推荐格式要填 `owner/repo`，用户靠它定位仓库
- 预算：≤40 条 / ≤3500 字符；同样预算下能装的条目从 22 条升到约 27 条（描述短的插件占位少）

**可观测**：`/optimize` 的 meta 新增 `toolsKept` / `toolsTotal` / `toolsDropped` / `toolsExplicit` / `toolsGeneric` / `toolsReason` / `recsShown`（真正进 prompt 的条数；注意 `recsCount` 是候选总数 4697，两者别混）。浮层底部显示成「工具 14/59（点名 2）· 插件 27 条 · 上下文 7K 字」。

---

## 17. 插件清单呈现方式：扁平列表 vs 分类聚合（可选模式）

§15 的 `catalogPolicy` 管「这轮查不查市场索引」，本节的 `catalogMode` 管「查到之后清单长什么样」。两者正交：即使 auto 判定要查，清单也按当前 `catalogMode` 渲染。

**两种模式（`lib/plugin-discovery.js` 的 `renderCatalog`，`mode` 参数；`fetchCatalog` 透传 `catalogMode`）**：

- **扁平列表 `flat`（默认）**：逐条列出候选插件，每行 `名字(owner/repo) — 简短描述`，预算内约 40 条 / 3500 字。适合「想看具体有哪些插件、要精确推荐」的草稿。
- **分类聚合 `aggregated`**：先按市场分类计数，每个分类给一行摘要再附少量样例：
  ```
  【image】128 个：dsh-image-kit(alice/dsh-image-kit)、comfy-helper(bob/comfy) 等 128 个
  【video】63 个：dsh-video-tool(bob/dsh-video-tool) 等 63 个
  ...
  ```
  同等 3500 字预算能覆盖**全部分类**（约 20 类、4704 个插件），模型先知道「有哪些种类」，更省 token，适合「帮我找能做 X 的插件」这类泛需求。

**关键实现点**：

- 缓存里存的是原始 `plugins`（未渲染），`fetchCatalog` 每次按传入的 `catalogMode` 实时重渲。所以**切换模式后下一次润色立即生效，无需清缓存**。
- `renderCatalogAggregated(plugins, { maxCategories=24, maxChars=3500, samplesPerCat=3 })`：分类按体量降序、超预算即停、每类样例数受控，避免某大类吃光预算。
- 设置页「插件清单呈现方式」下拉切换即自动保存（`POST /config {"catalogMode":"aggregated"}`）；`/optimize` 的 `meta` 新增 `catalogMode` / `catalogStyle`（扁平列表 / 分类聚合），浮层底部对应显示「插件 N 条」或「分类 N 组」。
- 非法值（非 `flat`/`aggregated`）被 `/config` 拒绝并回落默认。

---

## 18. 生图模式：自动补风格 / 跟随原意（可选开关）

适配「生图类提示词」的优化偏好。设置页「生图模式」下拉（默认 `auto-style`），浮层里勾选「🎨 这是生图提示词」时生效；**不勾则完全走旧逻辑，非生图任务零影响**。

两种模式（`lib/logic.js` 的 `IMAGE_MODES` / `IMAGE_STYLE_DIRECTIVES` / `appendImageDirective()`）：

- **自动补风格 `auto-style`（默认）**：用户没指定画风时，优化器主动补「二次元动漫 / 写实 / 水彩 / 3D」等最契合锚点 + 质量词。实测 Agnes 默认爱补「二次元动漫 + 萌系」，对可爱女仆类提示词提分明显。
- **跟随原意 `follow-intent`**：严格跟随原意，**绝不替你加任何画风词**，只在主体 / 服装 / 构图 / 光影 / 质感层面澄清补全。想要写实、或原提示词已自带画风时切这个，避免被优化器擅自改风格。

**机制**：

- `optimizeOnce` 接收 `task` 参数；仅当 `task === 'image'` 且 `imageMode === 'auto-style'` 时把风格指令追加进 system prompt；`follow-intent` 只追加「不擅自改画风」约束。非生图任务不传 `task`，指令完全不注入。
- 浮层「🎨 这是生图提示词」按草稿关键词（生成…图片 / 画风 / 构图 等）**自动预判**预勾选，可手动改；勾上 / 取消会**自动重新优化**一次。
- `meta` 新增 `task` / `imageMode` / `imageDirectiveApplied`，浮层可显示「生图专项」标记。
- 设置项 `imageMode` 已接入 `DEFAULT_CONFIG` / `loadConfig` 校验 / `saveConfig` 校验 / `/config` 白名单；非法值被 `/config` 拒绝。

**实测启示**：对比测试结论——优化不一定都提分，关键看优化器有没有塞进模型吃不动的约束；`follow-intent` 模式可避免「自动补风格」把写实需求擅自改成二次元（对比测试报告独立于本仓库）。
