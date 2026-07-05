# kunkun macOS 桌面助手 · 方案与架构

> 目标：把现在终端里的 kunkun 智能体（agent.py，DeepSeek 主脑 + MiMo 眼睛）包成一个 macOS 桌面应用——常驻菜单栏，随时用快捷键（以后还有语音）唤出一个 Spotlight 式悬浮面板，像系统级智能助手一样干活。
>
> 本方案基于 2026-07-01 的联网调研（Tauri/Electron/PyInstaller 官方文档、ChatGPT/Claude mac 版、Witsy/Cherry Studio 等开源项目，关键来源见文末），不是凭印象写的。

---

## 一、产品形态（做成什么样）

2025–2026 年桌面 AI 助手的形态已经高度收敛，ChatGPT mac 版、Claude 桌面版、Raycast AI 全是同一套：

1. **菜单栏常驻**：顶栏一个小图标，不占 Dock、不占 ⌘Tab 切换器。
2. **快捷键唤出悬浮面板**：按 `⌥ Space`（可自定义），当前屏幕中央浮出一个圆角毛玻璃输入框——**不抢当前应用的焦点**，Esc 或点空白处即消失。这是体验成败的关键单点（详见「NSPanel」一节）。
3. **对话即工作**：面板里输入自然语言，流式看到回复和工具调用过程（跑命令、读写文件、看图……都是你现有 agent.py 的能力）。
4. **上下文注入**（二期起）：一键截图给 MiMo 看、把当前选中的文字带进对话。
5. **语音唤醒**（三期）：喊「嗨困困」唤出面板，说话代替打字。

## 二、总体架构

**核心思路：你的 agent.py 不动大脑，只换皮肤。** 前端壳只负责「唤醒 + 显示」，智能体所有逻辑仍在 Python 里。

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri v2 应用壳（前壳，约 10–20MB）                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ 菜单栏 Tray   │  │ 全局快捷键 ⌥Space │  │ kunkun:// URL │  │
│  │ (内置 API)    │  │ (global-shortcut) │  │ (deep-link)   │  │
│  └──────┬───────┘  └────────┬─────────┘  └───────┬───────┘  │
│         └───────────────────┼─────────────────────┘          │
│                             ▼                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  悬浮面板（tauri-nspanel：非激活 NSPanel，不抢焦点）      │  │
│  │  前端 UI：Vite + React/Vue（你熟的前端技术）             │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │ HTTP + SSE（流式）                 │
│                          │ 仅 127.0.0.1 + 随机端口 + token    │
└──────────────────────────┼───────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Python 后端（sidecar 子进程，壳启动时拉起、退出时杀掉）        │
│                                                              │
│  server.py（FastAPI + uvicorn）                               │
│   ├─ POST /chat        发消息，SSE 流式返回文本/工具事件        │
│   ├─ POST /interrupt   打断当前生成                            │
│   ├─ GET  /health      健康检查（壳启动后轮询它）               │
│   └─ GET  /history     会话列表/历史                           │
│          │                                                   │
│          ▼  直接 import 复用                                   │
│  agent.py（现有智能体：几乎全部保留）                           │
│   ├─ DeepSeek 主脑（工具调用循环、子智能体、四层压缩、恢复）     │
│   ├─ MiMo 眼睛（look_image 看图）                              │
│   └─ 技能 / 长期记忆 / 任务系统                                │
└─────────────────────────────────────────────────────────────┘
```

### 为什么是这套选型（调研结论）

| 决策点 | 选择 | 依据（2026-07 核实） |
|---|---|---|
| 应用壳 | **Tauri v2**（2.11.5，活跃维护） | 体积 ~10-20MB / 内存 ~40-90MB，前端技能直接复用；对比 Electron 安装包 80-180MB、常驻内存 150-450MB——对一个常驻菜单栏的工具太重。Cap、Screenpipe、EcoPaste 等生产级 app 都在用同款浮窗方案 |
| 悬浮面板 | **ahkohd/tauri-nspanel**（v2.1 分支） | Spotlight 体验的本质是 NSPanel 的 `nonactivatingPanel`：能接收键盘输入但**不激活自己**、不打断你正在用的应用。普通置顶窗口做不到这点，而且会毁掉将来的「读选中文本」功能（焦点一切换选区就没了）。有官方示例 tauri-macos-spotlight-example 可照抄 |
| 全局快捷键 | **tauri-plugin-global-shortcut**（底层 Carbon RegisterEventHotKey） | **零系统权限**，不弹任何 TCC 授权框。ChatGPT 的 ⌥Space 同款机制 |
| 前后端通信 | **localhost HTTP + SSE 流式** | 生态最成熟（Tauri 官方 sidecar 文档的典型用例），浏览器端 EventSource 直接消费 LLM token 流，curl 可调试。WebSocket 留给以后的语音双向流 |
| Python 打包 | **第一阶段不打包**：壳直接 spawn venv 里的 python | 个人自用完全不需要 PyInstaller；本机构建的 app 没有 quarantine 属性，不过 Gatekeeper，零签名成本。要分发给别人时再上 PyInstaller **onedir**（onefile 是坑王：启动慢、公证屡败、双进程杀不干净） |
| 语音唤醒（三期） | **sherpa-onnx KWS**（开源免费） | 中文唤醒词写拼音进 keywords.txt 即可自定义、无需训练、离线运行。商业备选 Picovoice Porcupine 免费层够个人用但初始化要联网。注意：「困困」两音节叠音误唤醒率会偏高，建议用**「嗨困困」**（3+ 音节是各引擎通用建议） |
| 语音转文字（三期） | **mimo-v2.5-asr** | 你已经有 MiMo 的 Key，ASR 按时长计费 ¥0.5/小时，唤醒后的语音输入直接走它，不用再接第三方 |

### 备选路线（知道就行，不推荐现在走）

- **Electron**：如果你想最大化抄现成代码（Witsy、Cherry Studio 这两个功能形态几乎一比一的开源项目都是 Electron），可以走这条，代价是体积内存大一个数量级。**后端设计两条路线完全一致**，先做后端、再定壳也行。
- **纯 Python（rumps + PyObjC）**：只适合花两三天验证交互原型，浮窗体验上限低，不作产品形态。
- **原生 Swift/SwiftUI**：体验上限最高，但你不会 Swift，学习成本数周起步，且 Python 后端照样要子进程桥接——收益不划算，留给产品验证成功后的 v2。

---

## 三、关键设计细节

### 1. agent.py 需要的改造（唯一的真改造点）

现在的 `agent_loop` 是为终端写的：用 `input()` 收话、用 `print()` 汇报。包成服务要做三件事，**大脑逻辑一行不动**：

1. **拆掉 REPL**：把「`__main__` 里的 while input() 循环」和「agent_loop 本体」解耦（现在已经基本是分离的，改动很小）。
2. **print 改事件**：给 `agent_loop` 加一个 `on_event` 回调参数，把现在所有 `print`（工具调用日志、任务清单、子智能体状态、记忆提醒）改成发结构化事件：`{"type": "text_delta" | "tool_start" | "tool_result" | "todo" | "memory" | "done", ...}`。server.py 把事件塞进队列，SSE 逐条推给前端——面板上就能实时看到它在干什么。
3. **流式输出**：主模型调用加 `stream=True`，把 token 逐个发 `text_delta` 事件（DeepSeek 的 OpenAI 兼容接口原生支持）。
4. **会话管理**：`history` 从全局变量改成 `sessions: dict[session_id, messages]`，面板每次唤出可以继续上次会话，也能开新会话。

### 2. 安全（比现在更重要）

- 后端**只绑 127.0.0.1**，用 `port=0` 让系统随机分配端口（避免固定端口被占时静默失败），启动时生成一个**随机 token**，把「端口+token」打到 stdout 首行给壳读取；每个请求校验 token。原因：localhost 端口本机所有进程都能访问，而你的智能体有 bash/写文件能力，不能裸奔。
- 现有的危险命令拦截（DENY_LIST hook）、工作目录沙箱全部保留。
- sidecar 生命周期：壳退出时 kill 后端进程组；Python 侧兜底——轮询 `os.getppid()` 变成 1（爸爸死了）就自杀，防止孤儿进程。

### 3. TCC 权限地图（什么功能要什么弹窗）

| 功能 | 权限 | 时机 |
|---|---|---|
| 全局快捷键 ⌥Space | **无需任何权限** ✅ | 一期 |
| 菜单栏 / 悬浮面板 / 对话 | 无需权限 ✅ | 一期 |
| 截图给 MiMo（`screencapture -i`） | 屏幕录制 | 二期，首次用时弹 |
| 读选中文本 | 辅助功能 | 二期/三期 |
| 语音唤醒 + 语音输入 | 麦克风（Info.plist 必须写 NSMicrophoneUsageDescription，否则崩溃） | 三期 |
| 双击 ⌥ 唤出（Claude 同款） | 输入监控（成本高） | 不急，放最后 |

**最大的坑（务必记住）**：TCC 授权绑定「bundle id + 代码签名」。开发期从终端跑，权限记在终端头上；打包成 .app 后要重新授权；**ad-hoc 签名每次重新构建都会变，会导致已授权限反复失效**。对策：涉及权限的功能尽早用真实 .app 形态测试；频繁迭代阶段可以在钥匙串自建一张代码签名证书固定签名身份。

### 4. 唤醒方式全家桶（按成本排序）

1. `⌥ Space` 全局快捷键（一期，零权限）——注意注册失败要有提示（被别的 app 占用时是静默失败）。
2. 菜单栏图标点击（一期，白送）。
3. `kunkun://ask?text=...` URL scheme（一期顺手做）——以后快捷指令、Raycast、别的脚本都能唤它。注意 deep-link 在 `tauri dev` 模式测不了，必须打包装进 /Applications 才生效。
4. 语音「嗨困困」（三期，sherpa-onnx 跑在 Python 侧，唤醒事件通知壳弹面板）。

---

## 四、分期路线图

### 一期 · MVP「能唤出、能对话」 ✅ 2026-07-02 已完成

- [x] `server.py`：FastAPI 包住 agent.py（/chat SSE、/health、/interrupt），token 鉴权 + KUNKUN_READY 握手行 + 孤儿自杀
- [x] agent.py v6.0：EVENT_SINK 事件层（emit_event）+ stream=True（_stream_call）+ should_stop 可打断；终端模式零回归
- [x] Tauri 壳跑通：tauri-nspanel **v2.1 分支新 API**（tauri_panel! 宏），⌃⌥Space / ⌥Space 唤出、失焦自动隐藏
  - ⚠️ 实测发现 ⌥Space 已被本机另一个 AI 助手抢注（Carbon 热键先到先得），所以加了备用 ⌃⌥Space
- [x] 面板 UI：ChatLive 真对话（流式打字 + 思考态 + 工具过程卡片 + 出错卡 + 打断按钮 + 新会话）
- [x] Tray 菜单栏模板图标（石虎字形 PIL 生成，icon_as_template）+ ActivationPolicy::Accessory 隐 Dock
- [x] 壳管理后端：Rust spawn python3 server.py → 读 stdout 握手（随机端口+随机 token）→ RunEvent::Exit 时 kill
- [x] 加料：**桌宠透明窗**（透明/无边框/置顶/右下角/所有空间可见，focusable=false 不抢焦点），
      面板↔桌宠事件总线（Tauri event / BroadcastChannel 双实现），石虎姿态随工具调用实时联动

**一期验收**：✅ 真机通过——App 编译一次通过并常驻；壳自动拉起后端（127.0.0.1 随机端口）；
⌃⌥Space 在任意应用上浮出非激活面板；浏览器同构模式下真实对话 + glob 工具调用全链路流式验证通过。

**一期补强（2026-07-02 当天迭代）**：
- [x] 修复「点桌宠弹出的面板打不了字」：面板显示后没拿到键盘焦点 → toggle 里 `win.set_focus()`；
      日志 `[kunkun] 面板已获得键盘焦点` 反复验证生效（⌥Space 路径本就 OK）
- [x] 桌宠可拖拽：本体「移动>5px 拖窗口 / 原地=点击唤面板」（startDragging），照顾按钮区不误触
- [x] 桌宠视线全局跟随：窗口小、鼠标常在窗外 → 轮询全局 `cursorPosition()` + 窗口位置算方向喂眼睛
- [x] 面板可拖拽：顶部把手手动 `setPosition` 跟随（不走系统 startDragging，避开非激活面板失焦自动隐藏）
- [x] 桌宠窗口 320×390 → **470×440**：原来状态卡（左伸 212px）/气泡超出窗口被裁 → 放大留空间；石虎贴右下
- [x] 桌宠定位改由 Rust setup 用逻辑坐标一次到位（前端 JS 定位时序不稳会把窗口挪出屏）；带定位成败日志
- [x] **图片直接拖进面板看图**：Tauri 用 `getCurrentWebview().onDragDropEvent` 拿真实磁盘路径（浏览器拿不到路径 →
      兜底 FileReader 读成 data URL）；发送时把「路径/data URL」拼进消息，主脑看到自动调 look_image。
      配套：`run_look_image` 新增支持 `data:` 前缀直传 MiMo（已单元测真调 MiMo 通过：红图→"整体是红色的"）；
      面板加拖拽高亮 + 附件缩略图卡片 + 用户气泡图片标记

**一期安全加固（2026-07-02，分发前审计后修复，详见 docs/安全审计报告-分发前.md）**：
- [x] 危险命令人工确认闸口（14 类危险操作弹窗批准，替代无效黑名单）——终端 + App 双实现，端到端验证
- [x] 密钥分层加载（用户级私有目录/环境变量优先，不再依赖仓库 .env；分发让用户填自己的 Key）
- [x] 敏感文件硬拦截（.env/.ssh/id_rsa 等无论如何不给 AI 读）+ look_image 魔数校验 + URL 挡内网 SSRF
- [x] 全通道防注入（工具结果套 <不可信数据> 边界 + system prompt 最高优先级声明）——实测识破社工攻击
- [x] server 加固：token 改 0600 文件握手（不进 stdout）、只认 header、/health 收敛为 {ok:true}、CORS 生产只认 Tauri
- [x] .gitignore + 目录 0700 + .env.example

**一期单实例锁（2026-07-02，修「出现两只桌宠」）**：
- 根因：反复重启 tauri dev 时旧 App 变孤儿（PPID=1 未随父退出），同时开了两个桌宠窗口。
- [x] 接入 `tauri-plugin-single-instance`（用 v2 分支而非 2.4.2——2.4.2 缺 6/29 合并的 macOS 修复：
      阻塞式 socket 占死 async 线程 + 上个实例崩溃后新实例接管，这两个对 tray+nspanel 场景正好需要）。
      必须第一个注册（官方要求）。第二次启动 kunkun → 回调在已有实例触发 → 只把已有桌宠 show+focus →
      第二个进程自杀，杜绝两只桌宠。
- ⚠️ 踩坑并已修：single-instance 回调**不在主线程**，回调里最初直接调 `toggle`（触发 nspanel 面板转换 =
      跨线程碰 AppKit）把已有实例也搞崩了。改为 `app.run_on_main_thread()` 调度回主线程 + 只做安全的
      show/focus（不碰 nspanel 转换）。真机验证：连启 3 个实例，后两个自杀、第一个安然无恙、全程只 1 只桌宠。

**一期剩余待办**：
- [ ] `tauri build` 出正式 .app（现在跑的是 `npm run tauri dev` 开发形态）
- [ ] 面板拖动后位置记忆（现在下次 ⌥Space 仍回居中位）
- [ ] 桌宠窗口透明区点击穿透（现无穿透，桌宠左上透明区会拦截该处桌面点击；EcoPaste 式轮询切换 setIgnoreCursorEvents）
- [ ] 菜单栏图标随状态变化（现为静态模板图标）

### 二期 · 「有眼睛、有记性」

- [ ] 📷 截图按钮/快捷键：`screencapture -i` 框选 → 存临时文件 → 自动走 look_image 给 MiMo（和你现有多模态能力天然衔接）
- [ ] 图片拖拽/粘贴进面板
- [ ] 会话历史侧栏（长期记忆/任务系统在面板可视化）
- [ ] 开机自启（tauri-plugin-autostart）+ kunkun:// URL scheme
- [ ] 后端崩溃自动拉起（壳内 watchdog，指数退避）

### 三期 · 「叫得应」

- [ ] 语音唤醒：sherpa-onnx KWS（wenetspeech 中文模型 3.3M），唤醒词「嗨困困」，跑在 Python 侧
- [ ] 语音输入：唤醒后录音 → mimo-v2.5-asr 转文字 → 进对话
- [ ] （选做）读选中文本：AX API → 菜单动作 → 模拟 ⌘C 三级降级（抄 Easydict/SelectedTextKit 的策略）

### 四期 · 分发（只有要给别人用才做）

- [ ] PyInstaller 6.x **onedir** 打包后端，按 sidecar 命名规范（带 `-aarch64-apple-darwin` 后缀）
- [ ] Apple Developer 账号（$99/年）→ Developer ID 签名 + notarytool 公证
- （提醒：macOS 15 起「右键打开」绕过 Gatekeeper 的路已被封死，给非技术朋友分发未公证 app 会很痛苦）

---

## 五、项目结构（一期目标形态）

```
kunkun/
├── agent.py                 # 现有智能体（小改造：事件化+流式+会话）
├── server.py                # 新增：FastAPI 服务层
├── .env                     # 现有配置（新增 KUNKUN_TOKEN 由启动时生成，不入库）
├── skills/  .memory/  .tasks/   # 现有目录全部不动
├── docs/
│   └── macOS-App-方案与架构.md  # 本文档
└── app/                     # 新增：Tauri 应用壳
    ├── src/                 # 前端（Vite + React/Vue）
    ├── src-tauri/
    │   ├── src/main.rs      # Rust 胶水：tray + 快捷键 + nspanel + sidecar（照抄示例，量很小）
    │   ├── tauri.conf.json
    │   └── capabilities/
    └── package.json
```

## 六、参考清单（抄作业地图）

| 用途 | 项目 | 说明 |
|---|---|---|
| 浮窗+快捷键骨架 | [ahkohd/tauri-macos-spotlight-example](https://github.com/ahkohd/tauri-macos-spotlight-example)（v2 分支） | 一期直接照抄的起点 |
| 非激活面板插件 | [ahkohd/tauri-nspanel](https://github.com/ahkohd/tauri-nspanel)（v2.1 分支，git 依赖要锁 rev） | 407★，2026-06 仍活跃 |
| Python sidecar 模板 | [dieharders/example-tauri-v2-python-server-sidecar](https://github.com/dieharders/example-tauri-v2-python-server-sidecar) | Tauri v2 + FastAPI 完整示例 |
| 功能形态参考 | [Kochava-Studios/witsy](https://github.com/Kochava-Studios/witsy)（~2k★） | 和我们要做的东西几乎一比一（Electron） |
| 中文系旗舰参考 | [CherryHQ/cherry-studio](https://github.com/CherryHQ/cherry-studio)（48k★） | 只看「快捷助手」「划词助手」模块 |
| 大规模先例 | [khoj-ai/khoj](https://github.com/khoj-ai/khoj)(35k★) | 「壳 + 本地 Python FastAPI」结构可规模化的证明 |
| 划词取词策略 | [tisfeng/SelectedTextKit](https://github.com/tisfeng/SelectedTextKit) / [pot-desktop](https://github.com/pot-app/pot-desktop) | 三级降级取词（三期用） |
| 唤醒词引擎 | [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | 中文自定义唤醒词，免费离线（三期用） |
| 官方文档 | [Tauri sidecar](https://v2.tauri.app/develop/sidecar/) / [global-shortcut](https://v2.tauri.app/plugin/global-shortcut/) | |

---

*调研与撰写：kunkun 项目 · 2026-07-01。所有版本号（Tauri 2.11.5、PyInstaller 6.21.x、Electron 43 等）与仓库活跃度均为当日经 crates.io / PyPI / npm / GitHub API 实测。*
