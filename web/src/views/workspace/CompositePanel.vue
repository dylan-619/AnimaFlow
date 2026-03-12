<template>
    <div class="panel composite-panel">
        <div class="panel-header">
            <h2 class="flex-center"><el-icon class="mr-8">
                    <VideoCamera />
                </el-icon> 成片合成</h2>
            <div class="header-actions">
                <el-select v-model="selectedScriptId" placeholder="选择剧本以合成" size="default" style="width:200px">
                    <el-option v-for="s in scripts" :key="s.id" :label="s.name || `#${s.id}`" :value="s.id" />
                </el-select>
                <el-button type="warning" @click="exportProjectData" :loading="exporting">
                    <el-icon class="mr-4">
                        <Document />
                    </el-icon> 导出资料
                </el-button>
                <el-button type="success" :disabled="!selectedScriptId || !canComposite" @click="downloadVideos"
                    :loading="downloading">
                    <el-icon class="mr-4">
                        <Download />
                    </el-icon> 打包分镜
                </el-button>
                <el-button type="info" color="#1A1A1A" :disabled="!selectedScriptId || !canComposite"
                    @click="exportToJianying" :loading="exportingJianying">
                    导出剪映草稿
                </el-button>
                <el-button type="primary" :disabled="!selectedScriptId || !canComposite" @click="startComposite">
                    <el-icon class="mr-4">
                        <Film />
                    </el-icon> 导出成片
                </el-button>
            </div>
        </div>

        <!-- 合成画布预览区 -->
        <div class="workspace-area mt-16" v-loading="loading">
            <el-empty v-if="!selectedScriptId" description="请选择要合成的剧本" />
            <div v-else-if="shots.length > 0" class="timeline-container">
                <!-- 分镜轨道预览 -->
                <div class="track-info mb-16">
                    <span>共 {{ shots.length }} 个分镜片段</span>
                    <span class="ml-16">预计时长: ~{{ totalDuration }}s</span>
                </div>

                <!-- 生成好的成品视频 -->
                <div v-if="currentScript?.compositeVideo" class="final-video-container mb-24">
                    <div class="flex-center space-between mb-8">
                        <span style="font-weight: 600; color: var(--success);">
                            <el-icon class="mr-4">
                                <CircleCheck />
                            </el-icon> 成片已生成
                        </span>
                        <el-button type="success" size="small" tag="a"
                            :href="`http://localhost:60000/uploads/${currentScript.compositeVideo}`" target="_blank"
                            download>下载成片</el-button>
                    </div>
                    <video :src="`http://localhost:60000/uploads/${currentScript.compositeVideo}`" controls autoplay
                        loop class="final-video-player" />
                </div>

                <!-- 合成配置区 -->
                <div class="composite-config mb-16">
                    <div class="config-row">
                        <div class="config-group">
                            <el-switch v-model="subtitleEnabled" active-text="字幕" />
                            <template v-if="subtitleEnabled">
                                <el-select v-model="subtitleFontSize" size="small" style="width:80px" placeholder="字号">
                                    <el-option :value="22" label="小" />
                                    <el-option :value="28" label="中" />
                                    <el-option :value="36" label="大" />
                                </el-select>
                            </template>
                        </div>
                        <div class="config-group">
                            <span class="config-label">BGM</span>
                            <el-upload action="http://localhost:60000/api/upload" :show-file-list="false"
                                :on-success="onBgmUploaded" accept=".mp3,.wav,.m4a">
                                <el-button size="small" :type="bgmPath ? 'success' : 'default'">
                                    {{ bgmPath ? '✓ 已上传' : '上传BGM' }}
                                </el-button>
                            </el-upload>
                            <el-button v-if="bgmPath" link type="danger" size="small"
                                @click="bgmPath = ''">移除</el-button>
                            <template v-if="bgmPath">
                                <span class="config-label ml-8">音量</span>
                                <el-slider v-model="bgmVolume" :min="0" :max="100" :step="5" style="width:100px"
                                    size="small" />
                                <span class="volume-label">{{ bgmVolume }}%</span>
                            </template>
                        </div>
                    </div>
                </div>

                <div class="timeline-track">
                    <div v-for="shot in shots" :key="shot.id" class="shot-clip" @click="openVideoSelector(shot)">
                        <div class="clip-header">S{{ shot.segmentIndex }}-{{ shot.shotIndex }}</div>
                        <div class="clip-body" :class="{ 'no-video': !shotVideoMap[shot.id] }">
                            <template v-if="shotVideoMap[shot.id]">
                                <video :src="`http://localhost:60000/uploads/${shotVideoMap[shot.id].filePath}`"
                                    class="clip-thumb" />
                                <div class="clip-duration">{{ shotVideoMap[shot.id].duration }}s</div>
                            </template>
                            <div v-else class="clip-missing">无选择视频</div>
                        </div>
                        <div class="clip-desc">{{ shot.shotPrompt?.slice(0, 15) }}...</div>
                    </div>
                </div>

                <el-alert v-if="!canComposite" type="warning" show-icon class="mt-16" title="有分镜尚未选定视频，无法合成" />
            </div>
        </div>

        <!-- 视频选择弹窗 -->
        <el-dialog v-model="selectorVisible" title="选择视频版本" width="600px" destroy-on-close>
            <div v-if="selectorShot" class="video-selector">
                <p class="mb-12" style="color: var(--text-secondary); font-size: 13px;">
                    分镜 S{{ selectorShot.segmentIndex }}-{{ selectorShot.shotIndex }}
                </p>
                <div v-if="selectorVideos.length" class="selector-list">
                    <div v-for="v in selectorVideos" :key="v.id" class="selector-item"
                        :class="{ selected: v.id === selectorSelectedId }" @click="selectorSelectedId = v.id">
                        <video v-if="v.filePath" :src="`http://localhost:60000/uploads/${v.filePath}`"
                            class="selector-thumb" controls />
                        <div class="selector-info">
                            <el-tag size="small" type="info">{{ v.duration || '?' }}s</el-tag>
                            <el-tag v-if="v.id === selectorSelectedId" size="small" type="success">已选</el-tag>
                            <span class="selector-time">{{ formatTime(v.createTime) }}</span>
                        </div>
                    </div>
                </div>
                <el-empty v-else description="该分镜暂无成功的视频" :image-size="60" />
            </div>
            <template #footer>
                <el-button @click="selectorVisible = false">取消</el-button>
                <el-button type="primary" @click="confirmVideoSelection"
                    :disabled="!selectorSelectedId">确认选择</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { VideoCamera, Film, CircleCheck, Download, Document } from '@element-plus/icons-vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import api from '../../utils/axios'
import type { Script, StoryboardShot, VideoResult } from '../../types'

const route = useRoute()
const projectId = Number(route.params.projectId)
const scripts = ref<Script[]>([])
const selectedScriptId = ref<number | null>(null)
const loading = ref(false)

const shots = ref<StoryboardShot[]>([])
const shotVideoMap = ref<Record<number, VideoResult>>({})

// 字幕配置
const subtitleEnabled = ref(true)
const subtitleFontSize = ref(28)

// BGM 配置
const bgmPath = ref('')
const bgmVolume = ref(30)

const totalDuration = computed(() => {
    return Object.values(shotVideoMap.value).reduce((acc, curr) => acc + (curr.duration || 0), 0)
})

const canComposite = computed(() => {
    return shots.value.length > 0 && shots.value.every(s => shotVideoMap.value[s.id])
})

onMounted(async () => {
    const res: any = await api.post('/api/script/list', { projectId })
    scripts.value = (res.data || []).filter((s: Script) => s.content)
    if (scripts.value.length) selectedScriptId.value = scripts.value[0].id
})

watch(selectedScriptId, loadTimeline)

async function loadTimeline() {
    if (!selectedScriptId.value) return
    loading.value = true
    try {
        // 1. 获取所有分镜
        const shotRes: any = await api.post('/api/storyboard/list', { scriptId: selectedScriptId.value })
        shots.value = shotRes.data || []

        // 2. 加载剧本配置
        const scriptData = scripts.value.find(s => s.id === selectedScriptId.value) as any
        if (scriptData) {
            subtitleEnabled.value = scriptData.subtitleEnabled !== 0
            bgmPath.value = scriptData.bgmPath || ''
            bgmVolume.value = Math.round((scriptData.bgmVolume ?? 0.3) * 100)
            try {
                const style = JSON.parse(scriptData.subtitleStyle || '{}')
                subtitleFontSize.value = style.fontSize || 28
            } catch (e) { /* ignore */ }
        }

        // 3. 获取每个分镜的已选视频
        shotVideoMap.value = {}
        for (const shot of shots.value) {
            const vRes: any = await api.post('/api/video/listByStoryboard', { storyboardId: shot.id })
            const history = vRes.data || []
            const finalVideo = history.find((v: VideoResult) => v.state === 1 && v.filePath)
            if (finalVideo) {
                shotVideoMap.value[shot.id] = finalVideo
            }
        }
    } catch (e: any) {
        ElMessage.error(e.message || '加载合成轴失败')
    } finally {
        loading.value = false
    }
}

// 视频选择器
const selectorVisible = ref(false)
const selectorShot = ref<StoryboardShot | null>(null)
const selectorVideos = ref<VideoResult[]>([])
const selectorSelectedId = ref<number | null>(null)

async function openVideoSelector(shot: StoryboardShot) {
    selectorShot.value = shot
    selectorSelectedId.value = shotVideoMap.value[shot.id]?.id || null
    try {
        const vRes: any = await api.post('/api/video/listByStoryboard', { storyboardId: shot.id })
        selectorVideos.value = (vRes.data || []).filter((v: VideoResult) => v.state === 1 && v.filePath)
    } catch (e) {
        selectorVideos.value = []
    }
    selectorVisible.value = true
}

async function confirmVideoSelection() {
    if (!selectorShot.value || !selectorSelectedId.value) return
    const video = selectorVideos.value.find(v => v.id === selectorSelectedId.value)
    if (video) {
        shotVideoMap.value[selectorShot.value.id] = video
        // 更新后端 selectedResultId
        try {
            await api.post('/api/video/selectResult', {
                storyboardId: selectorShot.value.id,
                videoId: selectorSelectedId.value,
            })
        } catch (e) { /* 非关键操作 */ }
    }
    selectorVisible.value = false
}

function formatTime(ts: number | null) {
    if (!ts) return ''
    return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const currentScript = computed(() => scripts.value.find(s => s.id === selectedScriptId.value))
const compositing = ref(false)
const downloading = ref(false)
const exporting = ref(false)
const exportingJianying = ref(false)

async function exportProjectData() {
    exporting.value = true
    try {
        let md = `# 项目资料集 (Project ID: ${projectId})\n\n`

        // 1. 原著
        md += `## 1. 原著\n\n`
        try {
            const novelRes: any = await api.post('/api/novel/list', { projectId })
            const novels = novelRes.data || []
            novels.sort((a: any, b: any) => a.chapterIndex - b.chapterIndex)
            if (novels.length === 0) md += `无内容\n\n`
            for (const nv of novels) {
                md += `### 第${nv.chapterIndex}章: ${nv.chapter || '未命名'}\n`
                md += `${nv.chapterData || '无内容'}\n\n`
            }
        } catch (e) { md += `获取失败\n\n` }

        // 2. 故事线
        md += `## 2. 故事线\n\n`
        try {
            const slRes: any = await api.post('/api/storyline/get', { projectId })
            if (slRes.data && slRes.data.content) {
                md += `${slRes.data.content}\n\n`
            } else {
                md += `无内容\n\n`
            }
        } catch (e) { md += `获取失败\n\n` }

        // 3. 大纲
        md += `## 3. 大纲\n\n`
        try {
            const olRes: any = await api.post('/api/outline/list', { projectId })
            const outlines = olRes.data || []
            outlines.sort((a: any, b: any) => a.episode - b.episode)
            if (outlines.length === 0) md += `无内容\n\n`
            for (const ol of outlines) {
                md += `### 第${ol.episode}集\n`
                if (ol.data) {
                    const od = ol.data
                    md += `- **标题**: ${od.title || ''}\n`
                    md += `- **核心冲突**: ${od.coreConflict || ''}\n`
                    md += `- **大纲**: ${od.outline || ''}\n`
                    md += `- **场景**: ${(od.scenes || []).map((s: any) => s.name).join(', ') || ''}\n`
                    md += `- **角色**: ${(od.characters || []).map((c: any) => c.name).join(', ') || ''}\n`
                    md += `- **道具**: ${(od.props || []).map((p: any) => p.name).join(', ') || ''}\n\n`
                }
            }
        } catch (e) { md += `获取失败\n\n` }

        // 4. 资产
        md += `## 4. 资产设定\n\n`
        try {
            const asRes: any = await api.post('/api/assets/list', { projectId })
            const assets = asRes.data || []
            const roles = assets.filter((a: any) => a.type === 'role')
            const scenes = assets.filter((a: any) => a.type === 'scene')
            const props = assets.filter((a: any) => a.type === 'props')

            md += `### 角色\n`
            if (roles.length === 0) md += `无\n`
            for (const r of roles) {
                md += `- **${r.name}**\n  - 简介: ${r.intro || '无'}\n  - 提示词: ${r.prompt || '无'}\n`
            }
            md += `\n### 场景\n`
            if (scenes.length === 0) md += `无\n`
            for (const s of scenes) {
                md += `- **${s.name}**\n  - 简介: ${s.intro || '无'}\n  - 提示词: ${s.prompt || '无'}\n`
            }
            md += `\n### 道具\n`
            if (props.length === 0) md += `无\n`
            for (const p of props) {
                md += `- **${p.name}**\n  - 简介: ${p.intro || '无'}\n  - 提示词: ${p.prompt || '无'}\n`
            }
            md += `\n`
        } catch (e) { md += `获取失败\n\n` }

        // 5. 剧本与 6. 分镜
        md += `## 5. 剧本与分镜\n\n`
        try {
            const scRes: any = await api.post('/api/script/list', { projectId })
            const allScripts = scRes.data || []
            if (allScripts.length === 0) md += `无内容\n\n`

            for (const sc of allScripts) {
                md += `### 剧本: ${sc.name || '未命名'} (ID: ${sc.id})\n`
                md += `#### 剧本内容\n${sc.content || '无内容'}\n\n`

                md += `#### 分镜列表\n`
                const shotRes: any = await api.post('/api/storyboard/list', { scriptId: sc.id })
                const shots = shotRes.data || []
                shots.sort((a: any, b: any) => {
                    if (a.segmentIndex !== b.segmentIndex) return a.segmentIndex - b.segmentIndex
                    return a.shotIndex - b.shotIndex
                })
                if (shots.length === 0) md += `无内容\n\n`
                for (const st of shots) {
                    md += `**S${st.segmentIndex}-${st.shotIndex}**\n`
                    md += `- 画面描述: ${st.segmentDesc || '无'}\n`
                    md += `- 首帧提示词: ${st.shotPrompt || '无'}\n`
                    md += `- 动作序列: ${st.shotAction || '无'}\n`
                    md += `- 视频提示词: ${st.videoPrompt || '无'}\n`
                    md += `- 运镜要求: ${st.cameraMovement || '无'}\n`
                    md += `- 镜头时长: ${st.shotDuration ? st.shotDuration + 's' : '无'}\n`
                    md += `- 配音文本: ${st.dubbingText || '无'}\n\n`
                }
            }
        } catch (e) { md += `获取失败\n\n` }

        // 下载
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
        const projectName = `project_${projectId}`
        saveAs(blob, `${projectName}_全案资料.md`)

        ElMessage.success('资料导出成功！')
    } catch (e: any) {
        ElMessage.error(e.message || '导出过程出错')
    } finally {
        exporting.value = false
    }
}

function onBgmUploaded(response: any) {
    if (response?.data?.filePath) {
        bgmPath.value = response.data.filePath
        ElMessage.success('BGM 上传成功')
    }
}

async function downloadVideos() {
    if (!selectedScriptId.value || !shots.value.length) return

    const videosToDownload = shots.value.filter(shot => shotVideoMap.value[shot.id])
    if (videosToDownload.length === 0) {
        ElMessage.warning('没有可下载的视频分镜')
        return
    }

    downloading.value = true
    try {
        const zip = new JSZip()

        const promises = videosToDownload.map(async (shot) => {
            const video = shotVideoMap.value[shot.id]
            if (!video || !video.filePath) return

            const url = `http://localhost:60000/uploads/${video.filePath}`
            try {
                const response = await fetch(url)
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
                const blob = await response.blob()
                const fileName = `s${shot.segmentIndex}-${shot.shotIndex}.mp4`
                zip.file(fileName, blob)
            } catch (err) {
                console.error(`Failed to download ${url}`, err)
                ElMessage.warning(`视频 s${shot.segmentIndex}-${shot.shotIndex} 加载失败，将被跳过`)
            }
        })

        await Promise.all(promises)

        const content = await zip.generateAsync({ type: 'blob' })
        const scriptName = currentScript.value?.name || `script_${selectedScriptId.value}`
        saveAs(content, `${scriptName}_videos.zip`)

        ElMessage.success('视频打包下载成功！')
    } catch (e: any) {
        ElMessage.error(e.message || '打包下载过程出错')
    } finally {
        downloading.value = false
    }
}

async function exportToJianying() {
    if (!selectedScriptId.value) return
    exportingJianying.value = true
    try {
        ElMessage.success('正在合成剪映工程，这可能需要一点时间...')
        const res = await api.get(`/api/export/jianying?scriptId=${selectedScriptId.value}`, {
            responseType: 'blob'
        })
        const scriptName = currentScript.value?.name || `script_${selectedScriptId.value}`
        saveAs(res as unknown as Blob, `${scriptName}_draft.zip`)
        ElMessage.success('剪映草稿导出成功！请解压后存入您的剪映草稿目录')
    } catch (e: any) {
        ElMessage.error(e.message || '草稿导出失败')
    } finally {
        exportingJianying.value = false
    }
}

async function saveCompositeConfig() {
    if (!selectedScriptId.value) return
    await api.post('/api/script/update', {
        id: selectedScriptId.value,
        subtitleEnabled: subtitleEnabled.value ? 1 : 0,
        subtitleStyle: JSON.stringify({ fontSize: subtitleFontSize.value }),
        bgmPath: bgmPath.value || null,
        bgmVolume: bgmVolume.value / 100,
    })
}

async function startComposite() {
    if (!selectedScriptId.value) return

    // 先保存配置
    await saveCompositeConfig()

    compositing.value = true
    try {
        const res: any = await api.post('/api/task/create', {
            type: 'composite',
            projectId: projectId,
            input: { scriptId: selectedScriptId.value },
        })
        const taskId = res.data.taskId

        // 开始轮询
        let completed = false
        while (!completed) {
            await new Promise(r => setTimeout(r, 2000))
            const check: any = await api.post('/api/task/status', { taskId })
            if (check.data.status === 'completed') {
                completed = true
                const finalPath = check.data.output?.filePath
                if (finalPath && currentScript.value) {
                    (currentScript.value as any).compositeVideo = finalPath
                }
                ElMessage.success('成片合成完成！')
            } else if (check.data.status === 'failed') {
                completed = true
                ElMessage.error(check.data.error || '合成失败')
            }
        }
    } catch (e: any) {
        ElMessage.error(e.message || '启动合成失败')
    } finally {
        compositing.value = false
    }
}
</script>

<style scoped>
.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
}

.panel-header h2 {
    font-size: 18px;
}

.header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}

.timeline-container {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
}

.track-info {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
}

.composite-config {
    background: var(--bg-body);
    border-radius: 8px;
    padding: 12px 16px;
    border: 1px solid var(--border);
}

.config-row {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
}

.config-group {
    display: flex;
    align-items: center;
    gap: 8px;
}

.config-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
}

.volume-label {
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 36px;
}

.timeline-track {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 12px;
}

.shot-clip {
    width: 140px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
    transition: transform 0.15s;
}

.shot-clip:hover {
    transform: translateY(-2px);
}

.clip-header {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
}

.clip-body {
    height: 80px;
    background: var(--bg-body);
    border-radius: 6px;
    border: 1px solid var(--border);
    overflow: hidden;
    position: relative;
}

.clip-body.no-video {
    border: 1px dashed var(--danger);
    background: rgba(245, 108, 108, 0.05);
}

.clip-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.clip-duration {
    position: absolute;
    bottom: 4px;
    right: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 10px;
    padding: 2px 4px;
    border-radius: 4px;
}

.clip-missing {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--danger);
}

.clip-desc {
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.4;
}

.final-video-container {
    background: var(--bg-body);
    border-radius: 8px;
    padding: 16px;
    border: 1px solid var(--border);
}

.final-video-player {
    width: 100%;
    max-height: 480px;
    border-radius: 8px;
    background: #000;
}

/* 视频选择器 */
.video-selector {
    max-height: 500px;
    overflow-y: auto;
}

.selector-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.selector-item {
    border: 2px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.selector-item:hover {
    border-color: var(--accent);
}

.selector-item.selected {
    border-color: var(--success);
    background: rgba(103, 194, 58, 0.05);
}

.selector-thumb {
    width: 100%;
    max-height: 200px;
    border-radius: 6px;
}

.selector-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
}

.selector-time {
    font-size: 12px;
    color: var(--text-secondary);
    margin-left: auto;
}
</style>
