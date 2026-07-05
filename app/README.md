# kunkun app · 石虎守护灵界面原型

kunkun macOS 桌面助手的前端原型（Vite + React），对应 `docs/macOS-App-方案与架构.md` 里 Tauri 壳的前端层，视觉规范见 `docs/DESIGN.md`。

## 预览

```sh
cd "/Users/mac/Desktop/kunkun/app"
npm install        # 第一次需要
npm run dev        # 打开 http://localhost:5180
```

## 里面有什么

- **面板演示**：模拟 macOS 桌面 + 菜单栏 + ⌥Space 悬浮面板，底部工具条可切换 空状态 / 对话 / 工具调用 / 出错 四个场景（工具调用场景会自动播放「思考→看图→翻书→缝合→完成」时间轴，菜单栏图标同步变化）。
- **组件总览**：状态姿态 × 月洞窗、菜单栏 Template 六状态图标、App Icon 方向、色彩 Token、空状态文案。

## 目录

```
src/
├── assets/ip/          # 从 v2 设定图裁切的姿态资产（勿改色/勿翻转）
├── theme/tokens.css    # 设计 Token（DESIGN.md §1-2）
├── theme/app.css       # 组件样式与动效
├── data/copy.js        # 文案与姿态映射（DESIGN.md §3.2）
├── components/
│   ├── Porthole.jsx        # 月洞窗容器（IP 唯一合法容器）
│   ├── MenuBarIcon.jsx     # 菜单栏单色六状态字形
│   ├── AssistantPanel.jsx  # 悬浮面板三态
│   └── DesktopShell.jsx    # 模拟桌面舞台（Tauri 版删除此层）
└── pages/Gallery.jsx   # 组件总览页
```

## 迁入 Tauri 时

1. 保留 `src/`（删掉 `DesktopShell` 的模拟桌面与 `devbar`），面板即窗口内容。
2. 窗口用 `tauri-nspanel` 转非激活 Panel，尺寸 620×自适应，透明背景交给面板自身的毛玻璃。
3. `MenuBarIcon` 导出为 template PDF/PNG 挂到 TrayIcon。
