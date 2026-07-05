# PukyPuky 参考方向 · Claude Code 设计方案

> 独立方案：本方案与“石虎 IP 方案”分开。  
> 参考来源：ArtStation 页面 `PukyPuky`，该页面描述为作者对 Monster Hunter 中 Pukei-Pukei 的可爱化版本。  
> 使用边界：如果没有原作者与原版权方授权，不要直接复制 PukyPuky / Pukei-Pukei 的具体形象、名称、标志性结构或商业识别。本方案只提炼“可爱鸟蜥小怪兽、灵活观察者、桌面陪伴助手”的方向，生成 kunkun 自己的独立角色。

---

## 给 Claude Code 的直接任务说明

```text
你现在要为 kunkun macOS 桌面智能助手做一套全新的 IP 化界面设计方案。

这是一套独立于石虎方案的新方向。不要使用石虎形象，也不要沿用之前的石虎视觉系统。

请先读取产品方案：
/Users/mac/Desktop/kunkun/docs/macOS-App-方案与架构.md

参考风格来源：
https://www.artstation.com/artwork/B3Ev1l

注意版权边界：
该 ArtStation 页面是 PukyPuky，描述里提到它是作者对 Monster Hunter 中 Pukei-Pukei 的可爱化版本。不要直接复制 PukyPuky 或 Pukei-Pukei 的具体造型，不要使用其名称，不要做 1:1 复刻。请把它作为“可爱鸟蜥/变色龙小怪兽、好奇、机灵、会观察”的风格参考，重新设计一个 kunkun 自有 IP。

新 IP 方向：
为 kunkun 设计一个“桌面观察小怪兽”角色。它是一个轻盈、可爱、机灵、带一点奇幻感的 macOS AI 助手伙伴，擅长看图、搜索、整理线索、捕捉灵感。它应该像一个住在菜单栏里的小生物，被用户按下快捷键时探头出现。

核心关键词：
- 可爱小怪兽
- 鸟蜥 / 变色龙 / 小龙感
- 好奇、机灵、爱观察
- 轻盈、软萌、动画角色感
- 适合 App icon、菜单栏、表情包、悬浮面板
- 现代 macOS 工具感

视觉方向：
角色可以参考“鸟类 + 蜥蜴 + 小龙 + 变色龙”的混合生物方向，但必须是原创形象。
不要做成真实动物，不要做成恐怖怪物，要做成可爱卡通 IP。

角色建议：
- 大眼睛，表情灵动，有明显“观察世界”的感觉
- 小短手、小短腿，动作轻快
- 头部有柔软羽冠或小鳍状装饰，但不要复制参考图的具体结构
- 背部可以有柔软小翼膜或叶片状小披风，用来表达轻盈和跳跃
- 尾巴可以作为状态反馈元素：待命时卷起，思考时轻摆，完成时翘起
- 可以有一条小舌头/小触须/小光标尾，但不要做成参考 IP 的标志性长舌复刻
- 色彩偏清新：薄荷绿、青蓝、奶油白、浅紫或柔和黄作为点缀
- 质感是软胶玩具、毛绒动画、3D 卡通，不要写实鳞片，不要粗糙爬行动物质感

产品定位：
kunkun 是一个 macOS 桌面 AI 助手，常驻菜单栏，通过快捷键唤出 Spotlight 式悬浮面板。
这个小怪兽 IP 要服务产品，而不是只做一张插画。

请设计以下内容：

1. IP 角色设定
   - 角色名称，不能叫 PukyPuky，也不能叫 Pukei-Pukei
   - 一句话定位
   - 角色故事
   - 性格
   - 能力
   - 口头禅
   - 视觉关键词

2. 产品内状态系统
   需要覆盖：
   - 待命：小怪兽趴在菜单栏附近，眼睛半睁
   - 唤出：从悬浮面板边缘探头
   - 正在看图：眼睛变亮，拿小放大镜或镜片
   - 正在搜索文件：尾巴像雷达一样摆动
   - 思考中：抱着小光球或线索碎片
   - 工具调用中：小爪拖拽文件碎片
   - 完成任务：开心跳起，尾巴翘起
   - 出错：歪头困惑，但不要丧气过度

3. macOS 悬浮面板设计
   - Spotlight 式输入框
   - 毛玻璃背景
   - 输入区
   - 流式回答区
   - 工具调用状态区
   - 空状态欢迎页
   - 角色在界面中的出现方式

4. App icon 方向
   - 用角色头部或眼睛作为主图形
   - 简洁、圆润、适合 macOS icon
   - 不要复杂背景
   - 不要文字

5. 菜单栏图标方向
   - 简化为眼睛、小脑袋、尾巴或小爪
   - 需要有不同状态：待命、思考、看图、完成、错误

6. 表情包和动效
   至少给出 12 个表情/动作：
   - 我看到啦
   - 等我找找
   - 有线索了
   - 正在思考
   - 抓住灵感
   - 完成
   - 出错了
   - 别急
   - 这个我会
   - 让我看看
   - 保存一下
   - 休眠中

设计风格要求：
- 可爱，但不幼稚
- 机灵，但不吵闹
- 像真实桌面工具，不像游戏海报
- 轻盈、干净、现代
- 不要厚重传统文化风
- 不要暗黑、赛博、怪诞、恐怖
- 不要网页 landing page
- 不要照搬第三方 IP 形象

色彩建议：
- 主色：薄荷绿 / 青绿色
- 辅助：奶油白 / 浅米白
- 科技点缀：浅紫 / 柔和蓝
- 状态强调：暖黄色小光点
- 文字：深灰 / 墨黑

请输出：
1. 一份独立 DESIGN.md，写清楚这个新 IP 方向、视觉规范、组件规范、状态系统、动效建议。
2. 如果项目已有前端目录，请基于现有技术栈实现一个高保真可运行界面原型。
3. 如果还没有前端目录，请在 /Users/mac/Desktop/kunkun/app 下创建一个适合 Tauri 的前端原型结构。
4. 至少实现以下界面：
   - 悬浮助手面板
   - 空状态欢迎界面
   - 对话状态
   - 工具调用状态
   - 菜单栏状态展示页或组件预览页
   - IP 角色规范展示页
5. 不要直接使用 ArtStation 图片作为界面资产。可以用占位插图或重新绘制的原创角色草图风格。
6. 最后运行项目或给出可打开的本地预览方式，并说明产物路径。

验收标准：
- 第一眼能看出这是一个“可爱小怪兽陪伴的 macOS AI 助手”
- 角色气质接近参考图的可爱、机灵、轻盈，但不是复制它
- UI 是真实桌面工具界面，不是海报或网页宣传页
- 状态反馈清楚，用户能看出助手在待命、观察、搜索、思考、完成或出错
- 视觉系统可以继续扩展到 App icon、菜单栏图标、表情包、官网和产品宣传图
```

---

## 这套方案和石虎方案的区别

| 项目 | 石虎方案 | PukyPuky 参考方向 |
|---|---|---|
| 文化来源 | 天一阁石虎、金银彩绣 | 奇幻小怪兽、鸟蜥/变色龙气质 |
| 情绪气质 | 守护、治愈、稳重、文化感 | 好奇、机灵、轻盈、活泼 |
| 产品人格 | 桌面守护灵 | 桌面观察小怪兽 |
| 视觉主体 | 圆润卡通石虎 | 原创鸟蜥/小龙/变色龙混合小怪兽 |
| 适合场景 | 品牌文化、文创、长期陪伴 | 年轻化传播、动效、表情包、轻工具 |
| 风险 | 自有文化转译风险较低 | 必须避免复制第三方 IP |

---

## 推荐角色方向

### 名称方向

不要使用 PukyPuky / Pukei-Pukei。可选：

- **Mimochi**
- **Kiki**
- **Pikao**
- **Lumi**
- **Kunku**
- **Mogu**

更贴合 kunkun 的建议名：

**Kiki**

理由：短、轻、好记，有机灵小生物的感觉，也适合做语音和表情包。

### 一句话定位

**Kiki 是住在 Mac 菜单栏里的观察小怪兽，帮你看见线索、抓住灵感、整理混乱。**

### 角色故事

Kiki 原本生活在屏幕边缘的光斑里，喜欢收集用户不小心漏掉的线索：一张截图、一段文字、一个文件名、一个突然冒出来的想法。  
当用户按下快捷键，它就会从悬浮面板边缘探头出来，用亮亮的眼睛观察屏幕，用小爪子拖拽信息碎片，用尾巴把线索串起来。  
它不替用户做决定，但会帮用户把混乱变清楚。

### 产品角色语气

- “我看到啦。”
- “这条线索有点意思。”
- “等我找找。”
- “抓住这个灵感。”
- “我把它们串起来了。”
- “完成，尾巴都翘起来了。”

---

## 出图提示词

如果后续要生成这个独立 IP 角色，可用下面提示词：

```text
Create an original cute cartoon mascot for a macOS desktop AI assistant, inspired by the general idea of a curious bird-lizard/chameleon-like fantasy creature, but not copying any existing IP. The character is a tiny friendly observation monster living in the menu bar. It has a round soft body, large expressive eyes, tiny paws, a flexible curled tail used as a status indicator, soft feather-like crest, small wing-like side fins, and a playful curious smile. Style: adorable 3D soft vinyl toy, clean modern mascot, lightweight, friendly, suitable for app icon and UI states. Color palette: mint green, cream white, soft cyan, small lavender and warm yellow accents. Show a character design sheet with hero pose, front/side/back views, and five product-state poses: standby, observing with magnifier, searching files, thinking with glowing clue orb, task complete jumping. Clean macOS-inspired off-white background with subtle translucent floating input panel shapes. No text, no watermark, no logos, no copied copyrighted character traits.
```
