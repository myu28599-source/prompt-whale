<div align="center">
  <img src="assets/whale-idle.gif" alt="小鲸鱼提示词助手 · 小鲸鱼娘" width="150">
  <br>
  <sub>🐳 点一下小鲸鱼娘，把还没发送的草稿一键润色成高质量提示词</sub>

# 小鲸鱼提示词助手 · prompt-whale

**简体中文**

  <img alt="许可证" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square">
  <img alt="Node" src="https://img.shields.io/badge/node-18%2B-4b6fff?style=flat-square">
  <img alt="测试" src="https://img.shields.io/badge/tests-58%2F58-brightgreen?style=flat-square">
  <img alt="免费" src="https://img.shields.io/badge/Agnes-免费注册即用-f59e0b?style=flat-square">
  <img alt="后端" src="https://img.shields.io/badge/providers-Agnes%7CHy4%7CDeepSeek%7C自定义-orange?style=flat-square">
  <img alt="零依赖" src="https://img.shields.io/badge/dependencies-zero-7da1de?style=flat-square">
  <img alt="无构建" src="https://img.shields.io/badge/build%20step-none-7da1de?style=flat-square">
  <br>

</div>

<div align="center">

> 把 DSH 主输入框里**尚未发送**的草稿，交给大模型润色成自包含、可直接执行的高质量提示词，
> 并顺带从官方插件市场（4700+ 插件）推荐你还没装的实用插件。
>
> **填一把 Agnes 的 API Key 就能免费用** · 58 项单元测试全过 · 真实出图对比实测提分
> · 小鲸鱼娘想放哪就放哪、想多大就多大

</div>

---

## ✨ 为什么选它

### 免费 & 零门槛上手

- **默认后端 Agnes 有免费额度**：免费注册（邮箱 / Google / GitHub，无需信用卡）→ 控制台建一把 Key → 粘进设置页 → **完事，开始用**。全程不超过两分钟，不用改环境变量、不用碰任何配置文件。
- 设置页内置**「运行润色自测」**按钮：Key 填没填对、网络通不通，点一下就知道，不用猜。
- 想换后端？混元 Hy4 / DeepSeek / **自定义**都在设置页下拉里，同样粘 Key 即切。

### 为了「效果更好、速度更快」，我们专门做了这些

不是简单把草稿丢给模型，插件在喂给模型之前做了大量工程化裁剪，**让模型每次只看到真正相关的信息**——这直接决定了优化质量、响应速度和 token 消耗：

| 专门做的事 | 带来什么 |
| --- | --- |
| **工具相关性筛选** | 按你的草稿内容给当前环境里每个工具打分（显式点名 > 类别命中 > 词面重合 > 通用兜底），从几十上百个工具里只挑 2–15 条真正相关的喂给模型。生图任务看到生图工具、写代码任务看到代码工具，模型不会在一堆无关清单里迷路 |
| **跨类别工具识别** | 工具名字不带类别字眼也能认出来：以功能描述语义为主（描述写"AI 视频生成""语音合成"就直接归类），辅以 ComfyUI / Remotion 这类框架级名字信号。你说"生成视频"，ComfyUI 和 Remotion 都会进清单 |
| **按需上下文（零额外请求）** | 是否需要附带工具 / 插件清单由**本地正则**判定，不发任何 API、不耗 token；不需要时整段跳过，一次请求省约 12K 字上下文——直接换来更快的响应 |
| **插件市场三源竞速 + 24h 缓存** | 三个索引源并行请求，首个成功者胜出、其余立即中止；结果落盘缓存 24 小时，只有首次优化需要等索引（≤9s），之后秒出 |
| **清单瘦身** | 描述超长截断、条目封顶、按模式渲染（扁平 / 分类聚合），严格守住 prompt 预算 |
| **生图模式双开关 + 风格优先级硬保证** | `自动补风格`（实测提分明显）/ `跟随原意`（绝不改你的画风）；并且**你在提示词里写了画风就一定保留**，这是代码层强制的，不靠模型自觉 |
| **输入框写入四级降级** | 官方 API → Lexical 直写 → contenteditable → textarea，逐级兜底；全部失效也保留「复制优化文本」，任何失败都**绝不弄脏你的输入框** |

### 小鲸鱼娘：想放哪就放哪，想多大就多大

- **按住拖动**——从输入框旁拖到屏幕任意位置，悬浮窗模式
- **滚轮缩放**——在按钮上滚动鼠标滚轮，16–96px 自由调大小
- **双击复位**——一键回到默认停靠位
- **位置和大小会记住**——重启 DSH 后还在你放的地方
- 设置页里还有**大小滑块**和坐标显示，鼠标不惯也可以精确调
- 亮色 / 暗色主题自动跟随宿主；GIF 动图 base64 内联进插件本体，删掉 assets 目录鲸鱼娘也不会丢

### 其他值得一提的

- **多后端**：Agnes / 混元 Hy4 / DeepSeek，外加**自定义**档——任何 OpenAI 兼容接口都能接（OneAPI 中转、SiliconFlow、本地 Ollama / LM Studio 的 OpenAI 端点等），设置页填 API 地址 + 模型名 + Key 三项即用
- **插件推荐**：从 4700+ 条官方市场索引里减掉你已装的，按草稿内容推荐还没装的实用插件
- **软停用**：设置页一键停用，按钮和设置页立即消失，`Alt + Shift + W` 复活，不用重启
- **安全**：Key 落盘权限 `0600`、接口永不回显（只显示指纹）、HTTP 路由仅回环来源可访问、诊断信息不含草稿正文
- **零依赖、无构建步骤**：纯本地插件，不改 DSH 内核

---

## 📦 安装

**前置要求**：DeepSeek Harness（桌面端或 `dsh web` 均可）。插件零 npm 依赖、无构建步骤，装完重启 DSH 即用。

### 方式一：一条命令安装（推荐）

如果终端里能直接用 `dsh` 命令：

```sh
dsh plugin --profile desktop add "github:myu28599-source/prompt-whale"
```

桌面端用户如果 `dsh` 不在 PATH，用 DSH 自带的内置 CLI（PowerShell）：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "github:myu28599-source/prompt-whale"
```

> `desktop` 换成你实际在用的 profile 名。`dsh web` 用户把 profile 换成 `web`。

### 方式二：本地源码安装

不想走 GitHub，或者想改源码自己玩：

```sh
git clone https://github.com/myu28599-source/prompt-whale.git
dsh plugin --profile desktop add "file:<克隆出来的目录绝对路径>"
```

Windows 下 `file:` 后面写正斜杠绝对路径，例如 `file:E:/plugins/prompt-whale`。

### 重启并验证

1. **重启 DSH**（DSH 的插件清单只在启动时读取）
2. 重启后**输入框旁边出现小鲸鱼娘图标** = 安装成功
3. 打开 **设置 → 小鲸鱼提示词助手**，确认设置页正常渲染

<details>
<summary><b>重启后按钮没出现？（部分 DSH 版本需要手动补挂载，点开看）</b></summary>

部分 DSH 版本不会自动应用包内声明的 `dsh.bundle.patch`，需要手动确认两处（都在 `<DSH 数据目录>/profiles/<profile>/` 下），改完再重启 DSH：

**① profile 的 `package.json`**：`dsh.profile.bundles` 数组里要有 `"prompt-whale"`：

```json
"dsh": {
  "profile": {
    "bundles": [ "prompt-whale" ]
  }
}
```

**② `cordis.patch.yml`**：追加插入块（注意两级缩进，`insert:` 下面的行要缩进；裸 `- id:` 只改配置、不加载）：

```yaml
- insert:
    - id: prompt-whale
      name: prompt-whale
      config:
        enabled: true
```

改之前先完全退出 DSH（运行中会被回写），改完重启。

</details>

### 卸载

```sh
dsh plugin --profile desktop remove prompt-whale
```

重启 DSH 生效；设置页数据在 `<DSH 数据目录>/storages/prompt-whale/`，不想要可一并删除。

---

## 🚀 快速开始（2 分钟）

1. **拿一把免费的 Agnes Key**：注册 [platform.agnes-ai.com](https://platform.agnes-ai.com)（邮箱 / Google / GitHub，无需信用卡）→ 控制台「API 密钥」→ 创建，`sk-` 开头。
2. **粘进插件**：DSH 设置 → 小鲸鱼提示词助手 → Provider 保持默认 `Agnes` → 粘贴 Key → 保存。
3. **点「运行润色自测」**：显示成功就说明全链路通了。
4. **回主界面开用**：在输入框随便写句草稿（别发送）→ 点小鲸鱼娘 → 浮层里看到润色后的提示词 → 点「替换」覆盖草稿，或者「复制」手动粘贴。

浮层里的其他按钮：「🎨 这是生图提示词」勾选框会按草稿内容自动预判；下方「💡 推荐插件」卡片基于你这次的任务推荐还没装的插件。

---

## 🧪 效果实测 · Benchmarks

我们做了真实出图对比：**同一句原始提示词**交给三个优化后端（Agnes / 混元 Hy4 / DeepSeek）各自优化，再把优化结果喂给**同一个 ComfyUI 工作流 + 同一 base 模型**出图，与 raw 原始提示词基线对照。

> 完整提示词全文、逐图观察与统计方法见 [`docs/benchmarks/prompt-optimization-benchmark.md`](docs/benchmarks/prompt-optimization-benchmark.md)。

原始提示词（4 张图共用）：

```
帮我生成一个穿女仆装的可爱少女图片
```

| | raw 基线（未优化） | Agnes 优化 | 混元 Hy4 优化 | DeepSeek 优化 |
|---|---|---|---|---|
| **出图** | ![raw](docs/benchmarks/images/mixed_beauty_portrait_00004.png) | ![Agnes](docs/benchmarks/images/mixed_beauty_portrait_00001.png) | ![Hy4](docs/benchmarks/images/mixed_beauty_portrait_00002.png) | ![DeepSeek](docs/benchmarks/images/mixed_beauty_portrait_00003.png) |
| **画风** | 写实真人 | 二次元动漫 | 写实照片 | 写实人像 |

五维质量评分（每维 1–5）：

| 维度 | raw | Agnes | 混元 Hy4 | DeepSeek |
|---|---|---|---|---|
| 主体契合 | 4 | 5 | 4 | 4 |
| 服装细节 | 3 | 5 | 4 | 4 |
| 面部 / 五官 | 4 | 5 | 3 | 4 |
| 肢体 / 手部 | 3 | 3 | 3 | 3 |
| 整体完成 | 4 | 4 | 3 | 4 |
| **总分** | **18** | **22** | **17** | **19 |

**结论**：优化确实能提分——Agnes **+4**（主动锚定风格、细节补全最到位）> DeepSeek **+1** > 混元 Hy4 **−1**（自身约束自相矛盾拖了后腿）。这正是「生图模式」双开关的来由：`自动补风格` 提分明显，`跟随原意` 保证不擅改你的画风。

<details>
<summary><b>方法学说明（点开看）</b></summary>

- 每格 n=1，属现象级观察，非统计显著；要稳需每格多跑取均值。
- 评分维度里的风格偏好对二次元天然友好，Agnes 的优势部分来自风格选择。
- 4 张图出自同一 ComfyUI 工作流 + 同一 base 模型，仅 prompt 不同，生图端无混淆变量。

</details>

除了出图对比，插件本身在真实 DSH 环境跑过完整验收：**58 项单元测试全过**（`node --test`，不出网）、21 项离线控制面 smoke 通过、真实环境端到端优化 3.78s 返回、市场索引三源竞速 1.7s 拉到 4704 条、DSH 强杀重启无 crash。

---

## ⚙️ 配置项

设置 → 小鲸鱼提示词助手，全部可视化配置，改完点「保存配置」即生效：

| 配置 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| Provider | `agnes` / `hunyuan` / `deepseek` / `custom` | `agnes` | 优化后端；`custom` 档在设置页填 API 地址 + 模型名 + Key（任意 OpenAI 兼容服务） |
| 生图模式 | `自动补风格` / `跟随原意` | 自动补风格 | 勾选「🎨 生图提示词」时是否补画风锚点 |
| 清单策略 | `auto` / `always` / `never` | `auto` | 是否附带工具 / 插件清单（auto = 按草稿内容智能判断） |
| 清单模式 | `扁平列表` / `分类聚合` | 扁平列表 | 插件推荐清单的呈现方式 |
| 按钮外观 | 16–96px + 位置 | 停靠 + 20px | 滑块精调，拖拽 / 滚轮 / 双击复位见上文 |
| 超时 / 温度 | number | 60s / 0.3 | Hy4 深度思考时超时自动顶到 120s |
| 工具黑名单 | 每行一个正则 | 空 | 命中的工具会**真实从清单里剔除**，不只是 UI 摆设 |

> 混元 Hy4 / DeepSeek / 自定义的 Key 与接入地址同样在设置页填写即可，各后端一行的说明设置页里有内置提示。

---

## 🧩 工作原理（一段话版）

点击小鲸鱼 → 读取输入框草稿（本地，不落盘）→ 本地正则判断要不要带工具 / 插件上下文 → 按相关性筛选出最相关的少数工具 → 组装 system prompt 请求你选的后端 → 结果回浮层，可编辑、可替换、可取消。插件发现走三源竞速 + 24h 缓存；输入框写入有四级降级；HTTP 路由仅回环来源可访问。想看细节直接读源码，单文件结构、注释齐全：

```
prompt-whale/
├── index.js                 node 侧：HTTP 控制面 / 配置与 Key 落盘 / 清单构建
├── client.js                前端：鲸鱼娘按钮 + 优化浮层 + 设置页
├── lib/
│   ├── logic.js             提示词模板、生图模式指令、清单渲染
│   ├── context-policy.js    按需上下文判定（本地正则，零 API）
│   ├── tool-relevance.js    工具相关性打分与筛选
│   ├── plugin-discovery.js  市场索引竞速 / 缓存 / 减已装
│   └── providers/           Agnes / Hy4 / DeepSeek 适配
└── test/                    58 个单测
```

## 🔧 排错

| 现象 | 处理 |
| --- | --- |
| 重启后按钮没出现 | 看上方安装章节的「手动补挂载」折叠块，检查 `bundles` 与 `cordis.patch.yml` |
| 优化报 401 / 402 / 429 | Key 无效 / 额度不足 / 限流；设置页「运行润色自测」会显示错误原文 |
| 优化很慢 | 首次要拉市场索引（≤9s），之后走 24h 缓存；换后端对比可在设置页一键切 |
| 替换不生效 | `GET /prompt-whale/diag` 看写入通道诊断；最坏用浮层「复制」手动粘贴 |
| 图标裂了 | 插件已把鲸鱼图 base64 内联，正常不会裂；仍异常时重启 DSH |

## 🔒 安全与隐私

- 草稿只在点击优化时发给**你自己选的**后端，插件不监听输入、不自动改写、不写会话日志。
- Key 落盘权限 `0600`，接口永不回显（只显示 `…abcd` 指纹），错误回包一律脱敏。
- 插件 HTTP 路由带信任围栏：仅回环 / 同源可访问，跨站请求一律拒绝。
- 结构诊断只上报键名与布尔值，**不含草稿正文**；所有状态都只落在本机。

## ⚠️ 免责声明

- 本插件是本地客户端，不是模型服务方；优化结果由你选择的第三方模型生成，插件不托管、不修改、不过滤模型输出，请自行核实后使用。
- 本插件与上述任何模型提供方无隶属或背书关系；使用各后端即表示你同意对应上游的服务条款。

## 📄 许可证

MIT，见 [LICENSE](LICENSE)。
