// ============================================================
// Anime 2.0 — 全局类型定义
// ============================================================

// ---------- 数据库表类型 ----------

export interface User {
    id: number;
    name: string;
    password: string;
}

export interface Setting {
    id: number;
    userId: number;
    tokenKey: string | null;
    textConfigId: number | null;
    imageConfigId: number | null;
    videoConfigId: number | null;
    ttsConfigId: number | null;
    ossAccessKeyId: string | null;
    ossAccessKeySecret: string | null;
    ossBucket: string | null;
    ossRegion: string | null;
    ossCustomDomain: string | null;
}

export interface Config {
    id: number;
    name: string | null;
    type: 'text' | 'image' | 'video' | 'tts';
    model: string | null;
    apiKey: string | null;
    baseUrl: string | null;
    manufacturer: string;
    createTime: number | null;
    userId: number;
}

export interface Project {
    id: number;
    name: string;
    intro: string | null;
    type: string | null;
    artStyle: string | null;
    videoRatio: string;
    createTime: number | null;
    userId: number;
}

export interface Novel {
    id: number;
    chapterIndex: number;
    reel: string | null;
    chapter: string | null;
    chapterData: string | null;
    projectId: number;
    createTime: number | null;
}

export interface Storyline {
    id: number;
    name: string;
    content: string | null;
    novelIds: string | null;
    projectId: number;
}

export interface Outline {
    id: number;
    episode: number;
    data: string; // JSON string of EpisodeData
    projectId: number;
}

export interface Script {
    id: number;
    name: string | null;
    content: string | null;
    projectId: number;
    outlineId: number | null;
}

export interface Asset {
    id: number;
    name: string;
    intro: string | null;
    prompt: string | null;
    type: 'role' | 'scene' | 'props';
    filePath: string | null;
    publicUrl: string | null;
    voiceType?: string | null; // 角色的配音音色（仅type=role时使用）
    defaultEmotion?: string | null; // 角色的默认情绪（仅type=role时使用）
    isMasterReference: number;
    projectId: number;
}

export interface Storyboard {
    id: number;
    scriptId: number;
    segmentIndex: number;
    segmentDesc: string | null;
    shotIndex: number;
    shotDuration?: number;
    cameraMovement?: string | null;
    shotPrompt: string | null;
    dubbingText: string | null;
    dubbingVoice?: string | null; // 配音音色
    dubbingEmotion?: string | null; // 配音情绪
    speaker?: string | null; // 说话者（角色名或"旁白"）
    filePath: string | null;
    publicUrl: string | null;
    audioPath: string | null;
    projectId: number;
}

export interface VideoConfig {
    id: number;
    scriptId: number;
    projectId: number;
    configId: number | null;
    mode: string;
    startFrame: string | null;
    endFrame: string | null;
    resolution: string | null;
    duration: number;
    prompt: string | null;
    audioEnabled: number;
    selectedResultId: number | null;
    createTime: number | null;
}

export interface Video {
    id: number;
    configId: number;
    state: number; // 0=生成中 / 1=成功 / -1=失败
    filePath: string | null;
    firstFrame: string | null;
    duration: number | null;
    prompt: string | null;
    model: string | null;
    errorReason: string | null;
    taskId: string | null;
    scriptId: number | null;
    createTime: number | null;
}

export interface Task {
    id: string;
    projectId: number;
    type: TaskType;
    status: 'pending' | 'running' | 'completed' | 'failed';
    input: string | null;
    output: string | null;
    error: string | null;
    progress: number;
    createdAt: number | null;
    updatedAt: number | null;
}

export interface Prompt {
    id: number;
    code: string;
    name: string | null;
    type: string | null;
    defaultValue: string | null;
    customValue: string | null;
}

// ---------- 业务类型 ----------

export type TaskType =
    | 'storyline'
    | 'outline'
    | 'assets_extract'
    | 'asset_image'
    | 'script'
    | 'storyboard'
    | 'storyboard_image'
    | 'storyboard_tts'
    | 'storyboard_inpaint'
    | 'video'
    | 'video_generate'
    | 'video_mux'
    | 'composite';

export interface EpisodeData {
    episodeIndex: number;
    title: string;
    chapterRange: number[];
    scenes: { name: string; description: string }[];
    characters: { name: string; description: string }[];
    props: { name: string; description: string }[];
    coreConflict: string;
    outline: string;
    openingHook: string;
    keyEvents: string[];
    emotionalCurve: string;
    visualHighlights: string[];
    endingHook: string;
    classicQuotes: string[];
}

// ---------- API 响应格式 ----------

export interface ApiResponse<T = any> {
    code: number;
    data?: T;
    msg?: string;
}

export type TaskHandler = (
    task: Task,
    updateProgress: (progress: number) => Promise<void>,
) => Promise<any>;
