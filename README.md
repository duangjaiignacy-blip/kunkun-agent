# kunkun

kunkun 是一个带 macOS 桌宠界面的本地 AI 智能体。它由 Python 后端、React/Tauri 桌面壳和 Rocky 石虎 IP 组成，可以对话、读取文件、执行受控工具、处理图片，并在需要高风险操作时请求确认。

## 功能

- DeepSeek 作为主脑：对话、代码、文件操作、任务拆解和工具调用。
- 小米 MiMo 作为可选眼睛：读取图片、截图和设计稿。
- macOS 桌面应用：Rocky 桌宠、工作台面板、拖图输入、设置抽屉和会话恢复。
- 工具安全边界：敏感信息脱敏、危险操作确认、会话事件持久化和队列控制。
- 测试覆盖：包含安全脱敏、会话事件、读写保护等回归测试。

## 项目结构

```text
.
├── agent.py                 # 智能体核心逻辑
├── server.py                # 本地 HTTP/SSE 后端
├── persist.py               # 本地会话与事件持久化
├── tests/                   # Python 回归测试
├── app/                     # Tauri + React 桌面应用
│   ├── src/                 # 前端组件、主题和 Rocky 资产
│   └── src-tauri/           # macOS 壳与后端拉起逻辑
├── docs/                    # 架构、设计和安全文档
└── skills/                  # 本地技能示例
```

## 配置

复制环境变量模板：

```sh
cp .env.example .env
```

然后在 `.env` 里填入自己的 API Key：

```sh
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
MODEL_ID=deepseek-v4-pro

MIMO_API_KEY=your_mimo_api_key
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_MODEL_ID=mimo-v2.5
```

`.env` 包含私密信息，已经在 `.gitignore` 中排除，不能提交到公开仓库。

## 命令行运行

```sh
python3 -m pip install openai python-dotenv "httpx[socks]" socksio fastapi uvicorn
python3 agent.py
```

## 桌面应用开发

```sh
cd app
npm install
npm run dev
```

打包 macOS 应用：

```sh
cd app
npm run tauri build -- --bundles app
```

构建产物位于：

```text
app/src-tauri/target/release/bundle/macos/kunkun.app
```

## 测试

```sh
python3 -m unittest tests/test_regressions.py
cd app && npm run build
cd app/src-tauri && cargo check --locked
```

## 安全说明

- 不要提交 `.env`、`.memory/`、`.tasks/`、`.transcripts/` 或任何个人数据目录。
- 本地服务只绑定 `127.0.0.1`，通过随机 token 做前后端鉴权。
- 涉及命令执行、文件写入和高风险操作时，前端会要求用户确认。
- 公开发布前建议重新生成所有曾经在本地或聊天中出现过的 API Key。

## License

MIT
