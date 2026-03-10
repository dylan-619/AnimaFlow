# 🎬 AnimaFlow — AI-Powered Short Drama Production Tool

<p align="center">
  <strong>端到端 AI 短剧自动化生产工具 | End-to-End AI Short Drama Automation</strong>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#%EF%B8%8F-configuration-guide">Configuration</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D18.x-green.svg" alt="Node Version" />
  <img src="https://img.shields.io/badge/vue-3.x-brightgreen.svg" alt="Vue Version" />
  <img src="https://img.shields.io/badge/express-5.x-lightgrey.svg" alt="Express Version" />
</p>

---

> **AnimaFlow** 是一款端到端的 AI 短剧自动化生产工具，覆盖从小说原文到成片视频的全链路创作流程。通过 AI 驱动的故事线提取、大纲拆解、剧本生成、资产管理、分镜绘制、视频合成等**八大核心步骤**，实现一键式短剧批量生产。
>
> **AnimaFlow** is an end-to-end AI-powered short drama production tool that covers the entire creative pipeline from novel text to finished video. It automates storyline extraction, outline decomposition, script generation, asset management, storyboard creation, and video compositing through **8 core steps**.

---

## ✨ Features

- 🔗 **全链路自动化** — 从小说 → 故事线 → 大纲 → 剧本 → 分镜 → 配音 → 视频 → 成片，八步流水线一键跑通
- 🤖 **多 AI 能力集成** — 文本生成(DeepSeek/OpenAI)、图像生成(豆包 Seedream)、视频生成(豆包 Seedance)、语音合成(MiniMax/OpenAI TTS)
- 🎨 **智能资产管理** — AI 自动提取角色/场景/道具，支持主参考图确保角色一致性
- 🎬 **一键导出剪映草稿** — 自动打包视频+配音为剪映工程文件，解压即可在剪映中精编（字幕/特效/转场）
- 📝 **8 套专业提示词** — 内置覆盖全流程的 AI Prompt 模板，均支持自定义
- 📦 **零 GPU 依赖** — 所有 AI 推理通过云端 API 完成，本地仅需 CPU
- 💾 **灵活存储** — 本地存储 + 阿里云 OSS 可选，不配 OSS 也能正常使用
- 🔒 **JWT 认证** — 内置用户认证系统

### 八步生产流水线 / 8-Step Pipeline

```
① 小说上传 → ② 故事线提取 → ③ 大纲拆解 → ④ 资产提取/生成
                                                    ↓
⑧ 成片合成 ← ⑦ 视频生成 ← ⑥ 分镜绘制 ← ⑤ 剧本生成
```

| 步骤 | 功能 | AI 能力 | 输入 → 输出 |
|------|------|---------|-------------|
| ① 小说管理 | 上传/编辑小说章节 | — | 小说文本 → 结构化章节 |
| ② 故事线 | 提取核心故事线 | 文本 AI | 小说原文 → 故事线文档 |
| ③ 大纲 | 按集数拆解短剧大纲 | 文本 AI | 故事线 + 小说 → 分集大纲 |
| ④ 资产 | 提取角色/场景/道具 | 文本 + 图像 AI | 大纲 → 资产图片 + 描述 |
| ⑤ 剧本 | 生成分集剧本 | 文本 AI | 大纲 + 资产 → 分镜式剧本 |
| ⑥ 分镜 | 拆解分镜 + 生成图片 + 配音 | 文本 + 图像 + TTS | 剧本 + 资产 → 分镜图 + 配音 |
| ⑦ 视频 | 生成视频片段 | 视频 AI | 分镜图 + 提示词 → 视频片段 |
| ⑧ 成片 | 导出剪映草稿 | — | 视频 + 配音 → 剪映工程文件（在剪映中添加字幕/特效/BGM） |

---

## 🛠️ Tech Stack

### Backend

| Category | Tech | Note |
|----------|------|------|
| Runtime | **Node.js** + **TypeScript** | ESM modules |
| Framework | **Express 5** | Web server |
| Database | **SQLite** (better-sqlite3) + **Knex** | Lightweight embedded DB |
| AI Text | **OpenAI SDK** | Compatible with DeepSeek / OpenAI / any OpenAI-compatible API |
| AI Image | **Volcengine (Doubao Seedream)** | Image generation V3/V4 API |
| AI Video | **Volcengine (Doubao Seedance)** | Async video generation + polling |
| AI TTS | **MiniMax** / **OpenAI TTS** | Text-to-Speech with multiple voices |
| Export | **Archiver** (ZIP) | One-click export to CapCut (剪映) draft project |
| Storage | **Ali-OSS** | Alibaba Cloud Object Storage (optional) |

### Frontend

| Category | Tech | Note |
|----------|------|------|
| Framework | **Vue 3** (Composition API) | Reactive UI |
| Build | **Vite 5** | Fast dev server & bundler |
| UI Library | **Element Plus** | Enterprise-grade Vue 3 components |
| State | **Pinia** + persist plugin | Global state with localStorage persistence |
| HTTP | **Axios** | HTTP client |

---

## 🚀 Quick Start

### 环境要求 / Prerequisites

| Requirement | Version | Installation |
|-------------|---------|--------------|
| **Node.js** | ≥ 18.x | [nodejs.org](https://nodejs.org/) |
| **剪映专业版** | Latest | [lv.ulikecam.com](https://lv.ulikecam.com/) (用于导入草稿进行最终编辑) |

### 1. 克隆项目 / Clone

```bash
git clone https://github.com/dylan-619/AnimaFlow.git
cd animaflow
```

### 2. 安装依赖 / Install Dependencies

```bash
# 后端 / Backend
cd server
npm install

# 前端 / Frontend
cd ../web
npm install
```

### 3. 启动开发环境 / Start Dev Server

```bash
# 终端 1：启动后端 / Terminal 1: Start backend
cd server
npm run dev       # → http://localhost:60000

# 终端 2：启动前端 / Terminal 2: Start frontend
cd web
npm run dev       # → Vite dev server (usually http://localhost:5173)
```

### 4. 生产部署 / Production Deploy

```bash
# 构建前端 / Build frontend
cd web
npm run build     # Output → web/dist/

# 启动后端（自动托管前端静态文件）/ Start backend (serves frontend static files)
cd ../server
npm run build
npm start         # → http://localhost:60000
```

### 5. 初始配置 / Initial Setup

1. 访问应用，使用默认账号登录 / Login with default account: **`admin`** / **`admin123`**
2. 进入 **系统设置** / Navigate to **Settings**
3. 配置 AI 模型 API Key（详见下方配置指南）/ Configure AI API Keys (see Configuration Guide below)
4. 使用 **测试连通性** 验证配置 / Use **Test Connectivity** to verify

> 💡 **环境变量 / Environment Variables (Optional)**
>
> | Variable | Default | Description |
> |----------|---------|-------------|
> | `PORT` | `60000` | Server port |
> | `NODE_ENV` | `dev` | `dev` or `production` |

---

## ⚙️ Configuration Guide

所有 API Key 和配置均通过 **Web 界面的「系统设置」页面** 管理，无需修改任何配置文件。

All API keys and configurations are managed through the **Settings page** in the web UI. No config files need to be modified.

---

### 📝 文本模型配置 / Text Model (Required)

用于故事线、大纲、剧本、分镜文本等所有文本生成任务。

| 字段 | 说明 | 示例 |
|------|------|------|
| **厂商** | 模型提供商 | `openai` |
| **Base URL** | API 端点 | `https://api.deepseek.com` |
| **API Key** | 模型密钥 | `sk-xxxx` |
| **Model** | 模型名称 | `deepseek-chat` |

**获取方式 / How to get:**
- [DeepSeek 开放平台](https://platform.deepseek.com/) — 推荐，性价比高
- [OpenAI](https://platform.openai.com/) — 或任何 OpenAI 兼容接口（如 Moonshot、通义千问等）

---

### 🖼️ 图像模型配置 / Image Model (Required)

用于角色图、场景图、道具图、分镜图生成。当前支持**火山引擎（豆包）**平台。

| 字段 | 说明 | 示例 |
|------|------|------|
| **厂商** | 固定 | `volcengine` |
| **API Key** | 火山引擎 API Key | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| **Model** | 模型端点 ID | `doubao-seedream-3-0-t2i-250115` |

**获取步骤 / How to get:**

1. 注册 [火山引擎](https://www.volcengine.com/) 账号
2. 进入 [方舟 ARK 控制台](https://console.volcengine.com/ark/)
3. 在「模型广场」中找到 **Seedream** 系列图像生成模型
4. 创建在线推理接入点（Endpoint），获取 **端点 ID**（即 Model 字段）
5. 在「API Key 管理」中创建密钥

> [!TIP]
> 推荐使用 `doubao-seedream-3-0-t2i-250115` 或更新版本。模型版本越新，生成质量越好。
> `seedream-4-5` 及以上版本要求最小分辨率 1920×1920。

> [!NOTE]
> 🐑 **薅羊毛提醒**：每个火山引擎新用户都可以领取豆包图像生成 API 的**免费体验套餐**，建议先用体验额度练手，不花一分钱就能跑通整个流程！
> 进入 [方舟 ARK 控制台](https://console.volcengine.com/ark/) → 模型广场 → 找到 Seedream 模型 → 查看是否有可领的免费额度。

---

### 🎥 视频模型配置 / Video Model (Required)

用于将分镜图生成为视频片段。当前支持**火山引擎（豆包）**平台。

| 字段 | 说明 | 示例 |
|------|------|------|
| **厂商** | 固定 | `volcengine` |
| **API Key** | 火山引擎 API Key | 同图像模型可共用 |
| **Model** | 模型端点 ID | `doubao-seedance-1-5-pro-251215` |

**获取步骤 / How to get:**

1. 在方舟 ARK 控制台的「模型广场」中找到 **Seedance** 系列视频生成模型
2. 创建在线推理接入点，获取端点 ID
3. API Key 可与图像模型共用同一个

> [!TIP]
> 视频生成每个片段约需 2-5 分钟，系统采用异步轮询机制自动等待完成。

> [!NOTE]
> 🐑 **薅羊毛提醒**：火山引擎同样提供豆包视频生成 API 的**免费体验套餐**，新用户注册后即可领取。建议先用免费额度充分体验，跑通全流程之后再决定是否付费充值。

---

### 🔊 TTS 语音合成配置 / TTS Model (Optional)

用于为分镜生成配音。不配置时跳过配音环节。

**方案一：MiniMax（推荐中文配音）**

| 字段 | 说明 | 示例 |
|------|------|------|
| **厂商** | | `minimax` |
| **API Key** | MiniMax API Key | `eyJhbG...` |
| **Model** | 模型名称 | `speech-02-hd` |

获取：[MiniMax 开放平台](https://platform.minimaxi.com/)

**方案二：OpenAI TTS**

| 字段 | 说明 | 示例 |
|------|------|------|
| **厂商** | | `openai` |
| **API Key** | OpenAI API Key | `sk-xxxx` |
| **Model** | 模型名称 | `tts-1` |

---

### ☁️ 阿里云 OSS 配置 / Alibaba Cloud OSS (Optional)

用于将生成的图片/视频上传到云端，获取公网访问 URL。**不配置 OSS 也可正常使用**，所有文件将保存在本地 `server/uploads/` 目录。

配置 OSS 的主要好处：
- 视频模型需要通过公网 URL 访问首帧图片，配置 OSS 后自动上传获取 URL
- 不配 OSS 时，系统会降级使用 Base64 传递图片（可能受大小限制）

| 字段 | 说明 | 示例 |
|------|------|------|
| **Access Key ID** | 阿里云 AK | `LTAI5t...` |
| **Access Key Secret** | 阿里云 SK | `xxxxxxxx` |
| **Bucket** | OSS Bucket 名称 | `my-animaflow-bucket` |
| **Region** | Bucket 所在地域 | `oss-cn-hangzhou` |
| **自定义域名 (可选)** | CDN/自定义域名 | `https://cdn.example.com` |

**获取步骤:**

1. 注册 [阿里云](https://www.aliyun.com/) 账号
2. 进入 [OSS 控制台](https://oss.console.aliyun.com/)
3. 创建一个 Bucket（建议选择就近地域，读写权限选「公共读」）
4. 在 [RAM 控制台](https://ram.console.aliyun.com/) 创建 AccessKey
5. 建议为 OSS 创建独立的 RAM 子账号并仅授予 `AliyunOSSFullAccess` 权限

> [!CAUTION]
> 请勿将阿里云主账号 AccessKey 用于生产环境，建议使用 RAM 子账号密钥。

---

## 🏗️ Architecture

```
animaflow/
├── server/                     # Backend (Express 5 + TypeScript)
│   ├── src/
│   │   ├── app.ts              # Entry point
│   │   ├── ai/                 # AI capabilities (text / image / video / tts)
│   │   ├── db/                 # SQLite database (Knex)
│   │   ├── middleware/         # JWT auth middleware
│   │   ├── routes/             # 13 route modules
│   │   ├── services/           # Core business logic
│   │   ├── task/               # Async task queue system
│   │   ├── types/              # TypeScript type definitions
│   │   └── utils/              # Utilities (OSS upload, helpers)
│   └── uploads/                # Local file storage
│
├── web/                        # Frontend (Vue 3 + Vite)
│   └── src/
│       ├── views/
│       │   ├── workspace/      # 8-step workspace panels
│       │   ├── project/        # Project management
│       │   ├── setting/        # System settings
│       │   └── login/          # Login page
│       ├── components/         # Shared components
│       └── stores/             # Pinia state management
│
└── docs/                       # AI Prompt templates documentation
```

---

## 💻 Hardware Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| **CPU** | 4 cores | 8+ cores |
| **RAM** | 4 GB | 8+ GB |
| **Disk** | 10 GB free | 50+ GB SSD (video files are large) |
| **Network** | Stable connection | Low latency broadband |
| **OS** | macOS / Linux / Windows | macOS / Linux |

> AI inference runs entirely on cloud APIs — no local GPU required. Main resource consumption comes from FFmpeg video processing and file I/O.

---

## 💰 Cost Estimation

Per episode (~60s, ~12-15 shots):

| Step | Calls | Unit Price | Subtotal |
|------|-------|------------|----------|
| Text AI (storyline/outline/script/storyboard) | ~5 | ¥0.02/call | ¥0.1 |
| Image AI (assets + storyboard images) | ~20 | ¥0.04/image | ¥0.8 |
| Video AI (shot videos) | ~15 | ¥0.3/clip | ¥4.5 |
| TTS (dubbing) | ~15 | ¥0.01/clip | ¥0.15 |
| **Total per episode** | | | **~¥5-15** |

> Actual cost ~¥10-30 per episode after retries. Compared to manual AI video production (~¥50-100), AnimaFlow provides **3-5x cost advantage**.

---

## 🚧 项目状态 / Project Status

> [!IMPORTANT]
> **AnimaFlow 目前处于实验阶段（Early Stage）**，核心功能已基本可用，但还有很多可以改进和完善的地方。

我们正在积极开发中，当前的重点方向包括：
- 🎯 角色一致性优化
- 🎯 更多 AI 模型/厂商适配（Midjourney、Stable Diffusion、Sora 等）
- 🎯 批量自动化流程优化
- 🎯 多语言支持
- 🎯 Docker 一键部署

---

## 🤝 Contributing / 加入我们

**AnimaFlow 是一个由社区驱动的开源项目。** 如果你对 AI 视频创作、短剧自动化生产、或者 AIGC 工具链感兴趣，我们非常欢迎你加入一起共建！

无论你是：
- 🧑‍💻 **开发者** — 贡献代码、修复 Bug、优化架构
- 🎨 **设计师** — 改进 UI/UX、设计更好的工作流
- ✍️ **内容创作者** — 分享使用经验、撰写教程
- 💡 **AI 爱好者** — 提出 Idea、反馈建议

都可以参与进来！

**如何贡献：**

1. **Fork** 本仓库
2. 创建 feature 分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 发起 **Pull Request**

也欢迎通过 [Issues](https://github.com/YOUR_USERNAME/animaflow/issues) 提交 Bug 报告、功能建议或使用反馈。

> 🌟 如果这个项目对你有帮助，请给一个 **Star** 支持一下！

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---
