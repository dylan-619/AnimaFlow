// Anime 2.0 前端类型定义

export interface Project {
    id: number
    name: string
    intro: string | null
    type: string | null
    artStyle: string | null
    styleGuide: string | null
    videoRatio: string
    createTime: number | null
    novelCount?: number
    outlineCount?: number
    scriptCount?: number
    assetCount?: number
}

export interface Novel {
    id: number
    chapterIndex: number
    reel: string | null
    chapter: string | null
    chapterData: string | null
    projectId: number
}

export interface Storyline {
    id: number
    name: string
    content: string | null
    projectId: number
}

export interface EpisodeData {
    episodeIndex: number
    title: string
    chapterRange: number[]
    scenes: { name: string; description: string }[]
    characters: { name: string; description: string }[]
    props: { name: string; description: string }[]
    coreConflict: string
    outline: string
    openingHook: string
    keyEvents: string[]
    emotionalCurve: string
    visualHighlights: string[]
    endingHook: string
    classicQuotes: string[]
}

export interface Outline {
    id: number
    episode: number
    data: EpisodeData
    projectId: number
}

export interface Script {
    id: number
    name: string | null
    content: string | null
    projectId: number
    outlineId: number | null
    compositeVideo?: string | null
}

export interface Asset {
    id: number
    name: string
    intro: string | null
    prompt: string | null
    type: 'role' | 'scene' | 'props'
    filePath: string | null
    publicUrl: string | null
    history?: string | null
    historyData?: Array<{ fileName: string; publicUrl: string | null }> // 历史图片详细信息
    voiceType?: string | null // 角色的配音音色（仅type=role时使用）
    defaultEmotion?: string | null // 角色的默认情绪（仅type=role时使用）
    isMasterReference: number
    projectId: number
}

export interface StoryboardShot {
    id: number
    scriptId: number
    segmentIndex: number
    segmentDesc: string | null
    shotIndex: number
    shotDuration?: number
    cameraMovement?: string | null
    shotAction?: string | null
    shotPrompt: string | null
    dubbingText: string | null
    dubbingVoice?: string | null
    dubbingEmotion?: string | null // 配音情绪
    speaker?: string | null // 说话者（角色名或"旁白"）
    filePath: string | null // 当前使用的图片路径
    publicUrl: string | null // 当前使用的图片公网URL
    audioPath: string | null
    videoPath?: string | null
    history?: string | null // 所有生成历史图片的数组（JSON字符串）
    historyData?: Array<{ fileName: string; publicUrl: string | null }> // 历史图片详细信息
    videoPrompt?: string | null
    polishedPrompt?: string | null
    relatedAssets?: string | null
    projectId: number
}

export interface VideoConfig {
    id: number
    scriptId: number
    projectId: number
    configId: number | null
    mode: string
    startFrame: string | null
    endFrame: string | null
    resolution: string | null
    ratio: string | null
    draft: number
    cameraFixed: number
    duration: number
    prompt: string | null
    audioEnabled: number
    selectedResultId: number | null
    storyboardId: number | null
    storyboard?: StoryboardShot | null
}

export interface VideoResult {
    id: number
    configId: number
    state: number
    filePath: string | null
    prompt: string | null
    errorReason: string | null
    createTime: number | null
    duration?: number
}

export interface TaskInfo {
    id: string
    type: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    progress: number
    output: any
    error: string | null
}

export interface AIConfig {
    id: number
    name: string | null
    type: 'text' | 'image' | 'video' | 'tts'
    model: string | null
    apiKey: string | null
    baseUrl: string | null
    manufacturer: string
}

export interface Setting {
    id: number
    textConfigId: number | null
    imageConfigId: number | null
    videoConfigId: number | null
    ttsConfigId: number | null
    ossAccessKeyId: string | null
    ossAccessKeySecret: string | null
    ossBucket: string | null
    ossRegion: string | null
    ossCustomDomain: string | null
}

export interface PromptItem {
    id: number
    code: string
    name: string | null
    defaultValue: string | null
    customValue: string | null
}
