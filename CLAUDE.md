# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (server/)
```bash
cd server
npm install          # Install dependencies
npm run dev          # Start dev server with hot reload (nodemon + tsx)
npm run build        # Compile TypeScript to dist/
npm start            # Run production build
```

### Frontend (web/)
```bash
cd web
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Build for production (outputs to web/dist/)
npm run preview      # Preview production build
```

### Full Development Stack
```bash
# Terminal 1: Backend
cd server && npm run dev           # Runs on http://localhost:60000

# Terminal 2: Frontend
cd web && npm run dev             # Vite dev server (usually http://localhost:5173)
```

### Production Deployment
```bash
# Build frontend
cd web && npm run build

# Start backend (serves frontend static files)
cd ../server && npm run build && npm start
```

## Architecture Overview

### 8-Step Production Pipeline
AnimaFlow implements an end-to-end AI short drama production pipeline:

1. **Novel (原著)** - Upload/edit novel chapters
2. **Storyline (故事线)** - Extract core storyline from novel using text AI
3. **Outline (大纲)** - Decompose into episode outlines using text AI
4. **Assets (资产)** - Extract/generate characters, scenes, props using text + image AI
5. **Script (剧本)** - Generate episode scripts using text AI
6. **Storyboard (分镜)** - Generate shot prompts, images, and dubbing using text + image + TTS AI
7. **Video (视频)** - Generate video clips from storyboard images using video AI
8. **Composite (合成)** - Export as CapCut (剪映) draft project

### Backend Architecture (server/src/)

- **Entry Point**: `app.ts` - Express server setup, middleware, route registration
- **Database**: SQLite with Knex ORM (`db/`), auto-initialized on startup
- **AI Integration**: Unified interfaces in `ai/` directory
  - `text.ts` - Text generation (OpenAI SDK, compatible with DeepSeek/OpenAI)
  - `image.ts` - Image generation (Volcengine/Doubao Seedream)
  - `video.ts` - Video generation with async polling (Volcengine/Doubao Seedance)
  - `tts.ts` - Text-to-speech (MiniMax/OpenAI TTS)
- **Task Queue**: `task/taskRunner.ts` - Async task processing with:
  - Automatic retry with exponential backoff
  - Batch parallel processing (configurable concurrency)
  - Task type-based dependency handling
- **Services**: Core business logic (`services/`)
  - `storyboardService.ts` - Shot generation, image/video creation
  - `videoService.ts` - Video config and generation
  - `batchService.ts` - Batch generation for images/videos
- **Routes**: Express routers (`routes/`) for each functional area
- **Types**: Shared TypeScript definitions (`types/index.ts`)

### Frontend Architecture (web/src/)

- **Framework**: Vue 3 Composition API with `<script setup>`
- **State Management**: Pinia stores (`stores/`) with localStorage persistence
- **UI Library**: Element Plus components
- **Workspace Layout**: `views/workspace/index.vue` - 8-step sidebar navigation
- **Task Polling**: `stores/task.ts` - Auto-polling for async task status
- **Panels**: Each step has a dedicated panel in `views/workspace/`

### Key Design Patterns

#### Task-Driven Architecture
- All async operations use the task queue system
- Task types defined in `types/index.ts` (TaskType enum)
- Handlers registered via `registerTaskHandler()` in `task/taskTypes.ts`
- Progress updates via `updateProgress()` callback
- Frontend polls task status through `useTaskStore()`

#### Asset Reference System
- Assets (roles, scenes, props) are extracted and stored with reference images
- Master reference assets ensure character/scene consistency across shots
- Matching uses both exact name matching and fuzzy text search
- Asset types have priority: role (1) > scene (2) > props (3)

#### Video Generation Flow
1. Create video config (`t_videoConfig`) with prompt, duration, ratio, etc.
2. Submit async task to video AI API
3. Poll for completion with exponential backoff tolerance
4. Download video file to `server/uploads/`
5. Update `t_video` record with success/failure status

#### Batch Processing
- `batchService.ts` provides batch generation for:
  - Storyboard images (`batchGenerateStoryboardImages`)
  - Videos (`batchGenerateVideos`)
  - Asset images (`batchGenerateAssetImages`)
- Supports configurable concurrency and skipExisting options
- Uses task queue's `enqueueBatch()` for parallel processing

## Database Schema

Key tables (see `server/src/db/init.ts`):
- `t_user` - User accounts (default: admin/admin123)
- `t_project` - Project metadata (name, artStyle, videoRatio, etc.)
- `t_novel` - Novel chapters
- `t_storyline` - Core storyline extraction
- `t_outline` - Episode outlines (JSON data in `data` field)
- `t_script` - Episode scripts
- `t_assets` - Characters, scenes, props with reference images
- `t_storyboard` - Shot-level data with image/video paths
- `t_videoConfig` - Video generation configurations
- `t_video` - Video generation results
- `t_task` - Async task queue
- `t_config` - AI model configurations (text/image/video/tts)
- `t_setting` - User settings (links to config IDs)

## Configuration

All API keys and model configurations are managed through the web UI (Settings page), not environment variables:
- **Text Model**: OpenAI-compatible API (DeepSeek recommended)
- **Image Model**: Volcengine (Doubao Seedream)
- **Video Model**: Volcengine (Doubao Seedance) with async polling
- **TTS**: MiniMax or OpenAI TTS
- **OSS**: Optional Alibaba Cloud OSS for public file URLs

## Important Implementation Notes

### Video Ratio Handling
- Project's `videoRatio` determines image dimensions for all generations
- Dimension mapping in `storyboardService.ts` (lines 242-248, 559-567)
- Ratios: 9:16 (vertical), 16:9 (horizontal), 1:1 (square), 3:4, 4:3

### Asset Matching Priority
1. Exact match via `relatedAssets` field (set during storyboard generation)
2. Fuzzy match by searching asset names in shot text
3. Type priority sorting: roles > scenes > props

### Reference Image Injection
- Up to 4 reference images supported (Volcengine limit)
- Reference weights: role (0.8) > scene (0.6) > props (0.4)
- Consistency mode: 'character-focused' when roles present, else 'scene-focused'

### Error Handling
- Task failures are automatically retryable with exponential backoff
- Retryable errors: network timeouts, rate limits, 5xx server errors
- Max retries: 3 with delays: 1000ms, 2000ms, 4000ms

### File Storage
- Local files: `server/uploads/` (served at `/uploads/` route)
- OSS upload optional: `utils/oss.ts`
- Generated files follow naming patterns: `storyboard_{id}_{timestamp}.png`, `video_{id}_{timestamp}.mp4`

## Testing

No test suite currently exists. When adding tests, use appropriate frameworks for the stack:
- Backend: Node.js testing frameworks (Jest, Mocha)
- Frontend: Vue Test Utils + Vitest
