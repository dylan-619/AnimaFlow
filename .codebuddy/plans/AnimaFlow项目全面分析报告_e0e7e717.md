---
name: AnimaFlow项目全面分析报告
overview: 对 AnimaFlow AI 短剧自动化生产工具进行全面的流程和技术实现分析,识别当前使用豆包图生视频存在的问题,并提出针对性的优化方案,使其能够达到可落地商用并在抖音、小红书等平台使用的标准。
todos:
  - id: analyze-architecture
    content: 分析项目整体架构和八步流程设计
    status: completed
  - id: analyze-prompts
    content: 评估 AI Prompt 工程质量,识别优化空间
    status: completed
  - id: analyze-character
    content: 分析角色一致性实现机制及问题
    status: completed
  - id: analyze-video
    content: 诊断视频生成质量问题及根因
    status: completed
  - id: analyze-platform
    content: 评估平台适配性和成片质量要求
    status: completed
  - id: generate-report
    content: 使用 [skill:docx] 生成完整分析报告文档
    status: completed
    dependencies:
      - analyze-architecture
      - analyze-prompts
      - analyze-character
      - analyze-video
      - analyze-platform
---

## 用户需求

用户希望对 AnimaFlow 项目进行全面分析,当前项目整体流程已跑通,但存在以下问题:

1. 调用豆包 Seedance 生成的动画效果不理想
2. 当前使用图生视频方式,以分镜图片作为首帧图进行视频生成

用户目标:达到可落地使用水平,能够直接通过短篇小说生成完整动漫,并可在抖音、小红书、红果等平台发布使用。

## 分析内容

需要从六个维度进行全面分析:

1. 整体流程架构设计合理性
2. AI Prompt 工程质量评估
3. 角色一致性问题与解决方案
4. 视频生成质量和连贯性优化
5. 成片质量和平台适配性
6. 成本效率和性能优化

## 交付物

生成一份完整的分析报告文档(Markdown格式),包含:

- 项目现状分析
- 问题诊断
- 优化建议(短期/中期/长期)
- 实施路线图

## 分析方法

基于已读取的项目代码和文档,进行以下分析:

### 数据来源

- 后端 AI 模块代码 (`/server/src/ai/`)
- 服务层业务逻辑 (`/server/src/services/`)
- 提示词模板 (`/docs/` 10个MD文件)
- 前端工作流组件 (`/web/src/views/workspace/`)
- 测试样例 (`/极简测试短片.txt`)

### 分析工具

- 使用 [skill:docx] 生成最终的分析报告文档

### 报告结构

1. 项目概述与技术架构
2. 八步流程深度分析
3. 核心问题诊断
4. 优化方案设计
5. 实施路线图
6. 风险评估与建议

## Agent Extensions

### Skill

- **docx**
- Purpose: 将分析报告生成为专业的 Word 文档格式
- Expected outcome: 生成一份格式规范、内容完整的分析报告文档,包含目录、章节结构、表格等元素