<template>
    <el-dialog v-model="visible" title="视频生成" width="1000px" destroy-on-close :close-on-click-modal="false"
        class="video-gen-dialog">
        <div class="modal-body" v-loading="submitting" element-loading-text="正在提交生成任务...">
            <div class="content-wrapper">
                <!-- 左侧面板 -->
                <div class="left-panel">
                    <div class="section-card">
                        <!-- 关联分镜 -->
                        <div class="form-section">
                            <div class="section-header">
                                <span class="name-pre">关联分镜</span>
                            </div>
                            <el-select v-model="currentStoryboardId" placeholder="选择分镜（可选）" clearable
                                style="width: 100%" @change="onStoryboardChange">
                                <el-option v-for="s in storyboardShots" :key="s.id"
                                    :label="`S${s.segmentIndex}-${s.shotIndex}: ${(s.shotPrompt || '').slice(0, 30)}...`"
                                    :value="s.id" />
                            </el-select>
                        </div>

                        <!-- 首帧预览 -->
                        <div class="form-section">
                            <div class="section-header">
                                <span class="name-pre">首帧图片</span>
                                <span class="optional-tag">图生视频</span>
                            </div>
                            <div class="frame-preview">
                                <template v-if="startFrame">
                                    <img :src="`http://localhost:60000/uploads/${startFrame}`" />
                                    <div class="frame-overlay">
                                        <el-button type="danger" circle size="small" :icon="Delete"
                                            @click="startFrame = ''" />
                                    </div>
                                </template>
                                <div v-else class="frame-empty">
                                    {{ currentStoryboardId ? '该分镜暂无图片' : '选择分镜自动填充' }}
                                </div>
                            </div>
                        </div>

                        <!-- 分镜信息（只读展示） -->
                        <div v-if="currentShotData" class="form-section">
                            <div class="section-header">
                                <span class="name-pre">关联分镜信息</span>
                                <span class="optional-tag">中文</span>
                            </div>
                            <div class="cn-prompt-box">
                                <div v-if="currentShotData.shotPrompt"><b>场景：</b>{{ currentShotData.shotPrompt }}</div>
                                <div v-if="currentShotData.shotAction"><b>动作：</b>{{ currentShotData.shotAction }}</div>
                                <div v-if="currentShotData.cameraMovement"><b>运镜：</b>{{ currentShotData.cameraMovement
                                    }}</div>
                            </div>
                        </div>

                        <!-- 视频提示词（英文，可编辑） -->
                        <div class="form-section" style="flex:1;">
                            <div class="section-header">
                                <span class="name-pre">视频提示词</span>
                                <el-button link type="primary" size="small" @click="polishPrompt" :loading="polishing"
                                    :disabled="!currentStoryboardId">
                                    <el-icon class="mr-4">
                                        <MagicStick />
                                    </el-icon>AI 润色
                                </el-button>
                            </div>
                            <el-input v-model="promptText" type="textarea" :rows="5"
                                placeholder="选择分镜后点击「AI 润色」自动生成，或手动输入..." />
                            <div v-if="promptText && !polishing" class="prompt-hint">
                                <el-button link size="small" @click="saveVideoPrompt">
                                    <el-icon class="mr-4">
                                        <Check />
                                    </el-icon>保存提示词
                                </el-button>
                            </div>
                        </div>

                        <!-- 参数设置 -->
                        <div class="form-section config-grid">
                            <div class="config-item">
                                <span class="label">时长</span>
                                <el-input-number v-model="duration" :min="4" :max="12" size="small"
                                    style="width: 100px" />
                            </div>
                            <div class="config-item">
                                <span class="label">画幅</span>
                                <el-select v-model="ratio" size="small" style="width: 100px">
                                    <el-option label="16:9" value="16:9" />
                                    <el-option label="9:16(抖音)" value="9:16" />
                                    <el-option label="3:4(小红书)" value="3:4" />
                                    <el-option label="1:1" value="1:1" />
                                    <el-option label="4:3" value="4:3" />
                                </el-select>
                            </div>
                        </div>
                        <div class="form-section options-row">
                            <el-checkbox v-model="draft" size="small">预览样片 (省Token)</el-checkbox>
                            <el-checkbox v-model="cameraFixed" size="small">固定机位</el-checkbox>
                            <el-checkbox v-model="audioEnabled" size="small" title="豆包根据台词自动生成声音"
                                :disabled="!currentShotData?.dubbingText">包含配音</el-checkbox>
                        </div>

                        <el-button type="primary" size="large" class="generate-btn" @click="startGenerate"
                            :loading="generateLoading" style="width: 100%;">
                            <el-icon class="mr-8">
                                <VideoCamera />
                            </el-icon> 开始生成
                        </el-button>
                    </div>
                </div>

                <!-- 右侧结果面板 -->
                <div class="right-panel">
                    <div class="section-card result-card">
                        <div class="section-header">
                            <span class="name-pre">生成结果</span>
                            <el-tag v-if="resultVideos.length" type="info">{{ resultVideos.length }} 个</el-tag>
                        </div>
                        <div class="result-content">
                            <el-empty v-if="!resultVideos.length" description="暂无生成结果" :image-size="80" />
                            <div v-else class="result-list">
                                <div v-for="(item, index) in resultVideos" :key="item.id || index" class="result-item"
                                    :class="{ selected: selectedIndex === index }">
                                    <template v-if="item.state === 1 && item.filePath">
                                        <video :src="`http://localhost:60000/uploads/${item.filePath}`"
                                            class="result-video" controls />
                                        <div class="video-badge-row">
                                            <el-tag size="small" type="info">{{ item.duration || '?' }}s</el-tag>
                                            <el-button v-if="selectedIndex !== index" size="small" type="primary"
                                                @click="handleSelect(index)">选择此视频</el-button>
                                            <el-tag v-else size="small" type="success" effect="dark">
                                                <el-icon class="mr-4">
                                                    <Check />
                                                </el-icon>已选择
                                            </el-tag>
                                        </div>
                                    </template>
                                    <template v-else-if="item.state === 0">
                                        <div class="generating-placeholder">
                                            <el-icon class="is-loading" size="28">
                                                <Loading />
                                            </el-icon>
                                            <span class="mt-8"
                                                style="font-size:12px;color:var(--text-secondary)">视频生成中，预计 2~5
                                                分钟...</span>
                                        </div>
                                    </template>
                                    <template v-else>
                                        <div class="error-placeholder">
                                            <el-icon size="20">
                                                <WarningFilled />
                                            </el-icon>
                                            <span>{{ item.errorReason || '生成失败' }}</span>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 底部按钮 -->
            <div class="footer-btns">
                <el-button size="large" @click="visible = false">关闭</el-button>
            </div>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, MagicStick, VideoCamera, Loading, Check, WarningFilled } from '@element-plus/icons-vue'
import api from '../../utils/axios'
import { useAppStore } from '../../stores/app'
import type { StoryboardShot, VideoResult } from '../../types'

const appStore = useAppStore()

const props = defineProps<{
    scriptId?: number
    projectId: number
    preSelectedShot?: StoryboardShot
}>()
const emit = defineEmits<{ (e: 'update'): void }>()
const visible = defineModel<boolean>({ default: false })

const submitting = ref(false)
const polishing = ref(false)
const generateLoading = ref(false)

const storyboardShots = ref<StoryboardShot[]>([])
const currentStoryboardId = ref<number | null>(null)
const currentShotData = ref<StoryboardShot | null>(null)
const startFrame = ref('')
const promptText = ref('')
const shotPromptCN = ref('')
const duration = ref(5)
const ratio = ref('16:9')
const draft = ref(false)
const cameraFixed = ref(false)
const audioEnabled = ref(false)

const resultVideos = ref<VideoResult[]>([])
const selectedIndex = ref(-1)

watch(visible, async (val) => {
    if (!val) return

    resultVideos.value = []
    selectedIndex.value = -1
    promptText.value = ''
    shotPromptCN.value = ''
    startFrame.value = ''
    currentShotData.value = null
    duration.value = 5
    ratio.value = appStore.currentProject?.videoRatio || '16:9'
    draft.value = false
    cameraFixed.value = false
    audioEnabled.value = false

    if (props.scriptId) {
        const res: any = await api.post('/api/storyboard/list', { scriptId: props.scriptId })
        storyboardShots.value = res.data || []
    }

    if (props.preSelectedShot) {
        currentStoryboardId.value = props.preSelectedShot.id
        currentShotData.value = props.preSelectedShot
        startFrame.value = props.preSelectedShot.filePath || ''
        shotPromptCN.value = props.preSelectedShot.shotPrompt || ''

        if (props.preSelectedShot.videoPrompt) {
            promptText.value = props.preSelectedShot.videoPrompt
        } else {
            const parts = []
            if (props.preSelectedShot.shotPrompt) parts.push(`场景：${props.preSelectedShot.shotPrompt}`)
            if (props.preSelectedShot.shotAction) parts.push(`动作：${props.preSelectedShot.shotAction}`)
            if (props.preSelectedShot.cameraMovement) parts.push(`运镜：${props.preSelectedShot.cameraMovement}`)
            promptText.value = parts.filter(Boolean).join('；')
        }

        if (props.preSelectedShot.shotDuration) {
            duration.value = props.preSelectedShot.shotDuration
        }
        await loadHistoryVideos(props.preSelectedShot.id)
    } else {
        currentStoryboardId.value = null
        currentShotData.value = null
    }
})

async function loadHistoryVideos(storyboardId: number) {
    try {
        const res: any = await api.post('/api/video/listByStoryboard', { storyboardId })
        resultVideos.value = res.data || []
        const firstSuccess = resultVideos.value.findIndex(v => v.state === 1 && v.filePath)
        selectedIndex.value = firstSuccess >= 0 ? firstSuccess : -1
    } catch (e) { /* ignore */ }
}

async function onStoryboardChange(id: number | null) {
    if (!id) {
        startFrame.value = ''
        promptText.value = ''
        shotPromptCN.value = ''
        currentShotData.value = null
        resultVideos.value = []
        selectedIndex.value = -1
        return
    }
    const shot = storyboardShots.value.find(s => s.id === id)
    currentShotData.value = shot || null
    startFrame.value = shot?.filePath || ''
    shotPromptCN.value = shot?.shotPrompt || ''

    // 加载已保存的视频提示词
    if (shot?.videoPrompt) {
        promptText.value = shot.videoPrompt
    } else if (shot) {
        const parts = []
        if (shot.shotPrompt) parts.push(`场景：${shot.shotPrompt}`)
        if (shot.shotAction) parts.push(`动作：${shot.shotAction}`)
        if (shot.cameraMovement) parts.push(`运镜：${shot.cameraMovement}`)
        promptText.value = parts.filter(Boolean).join('；')
    } else {
        promptText.value = ''
    }

    if (shot?.shotDuration) {
        duration.value = shot.shotDuration
    }
    await loadHistoryVideos(id)
}

async function polishPrompt() {
    if (!currentStoryboardId.value) { ElMessage.warning('请先选择分镜'); return }
    polishing.value = true
    try {
        const res: any = await api.post('/api/video/polishPrompt', {
            storyboardId: currentStoryboardId.value,
            duration: duration.value,
        })
        promptText.value = res.data?.polishedPrompt || ''
        ElMessage.success('提示词润色完成（已自动保存）')
    } catch (e: any) {
        ElMessage.error(e.message || '润色失败')
    } finally {
        polishing.value = false
    }
}

async function saveVideoPrompt() {
    if (!currentStoryboardId.value || !promptText.value) return
    try {
        await api.post('/api/storyboard/update', {
            id: currentStoryboardId.value,
            videoPrompt: promptText.value,
        })
        ElMessage.success('提示词已保存')
    } catch (e: any) {
        ElMessage.error(e.message || '保存失败')
    }
}

function handleSelect(index: number) {
    selectedIndex.value = index
}

async function startGenerate() {
    if (!promptText.value && !startFrame.value) {
        ElMessage.warning('请至少输入提示词或选择首帧图片')
        return
    }

    // 生成前先保存提示词
    if (currentStoryboardId.value && promptText.value) {
        await api.post('/api/storyboard/update', {
            id: currentStoryboardId.value,
            videoPrompt: promptText.value,
        })
    }

    generateLoading.value = true
    submitting.value = true
    try {
        const createRes: any = await api.post('/api/video/createConfig', {
            scriptId: props.scriptId,
            projectId: props.projectId,
            storyboardId: currentStoryboardId.value,
            startFrame: startFrame.value || undefined,
            prompt: promptText.value,
            duration: duration.value,
            ratio: ratio.value,
            draft: draft.value,
            cameraFixed: cameraFixed.value,
            audioEnabled: audioEnabled.value ? 1 : 0,
            mode: startFrame.value ? 'single' : 'text',
        })
        const configId = createRes.data.id

        const tempIndex = resultVideos.value.length
        resultVideos.value.push({
            id: 0, configId, state: 0, filePath: null,
            prompt: promptText.value, errorReason: null, createTime: null,
            duration: duration.value,
        } as any)

        const res: any = await api.post('/api/task/create', {
            type: 'video', projectId: props.projectId,
            input: { videoConfigId: configId },
        })
        const taskId = res.data.taskId
        submitting.value = false
        generateLoading.value = false

        pollResult(taskId, configId, tempIndex)
    } catch (e: any) {
        ElMessage.error(e.message || '创建失败')
        generateLoading.value = false
        submitting.value = false
    }
}

async function pollResult(taskId: string, configId: number, index: number) {
    let completed = false
    while (!completed) {
        await new Promise(r => setTimeout(r, 3000))
        try {
            const check: any = await api.post('/api/task/status', { taskId })
            if (check.data.status === 'completed') {
                completed = true
                const vRes: any = await api.post('/api/video/listResults', { configId })
                const results = vRes.data || []
                if (results.length > 0) {
                    resultVideos.value[index] = { ...results[0], duration: duration.value }
                    selectedIndex.value = index
                }
                ElMessage.success('视频生成成功！')
                emit('update')
            } else if (check.data.status === 'failed') {
                completed = true
                resultVideos.value[index] = {
                    ...resultVideos.value[index],
                    state: -1,
                    errorReason: check.data.error || '生成失败',
                }
                ElMessage.error(check.data.error || '生成失败')
            }
        } catch (e) { /* 网络错误继续轮询 */ }
    }
}
</script>

<style scoped>
.content-wrapper {
    display: flex;
    gap: 20px;
    align-items: stretch;
    min-height: 480px;
}

.left-panel {
    width: 380px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
}

.right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.section-card {
    background: var(--bg-card);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid var(--border);
    height: 100%;
    display: flex;
    flex-direction: column;
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.name-pre {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
}

.optional-tag {
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 2px 8px;
    border-radius: 4px;
}

.form-section {
    margin-bottom: 14px;
}

.frame-preview {
    width: 200px;
    height: 120px;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    border: 1px solid var(--border);
    background: var(--bg-body);
}

.frame-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.frame-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
}

.frame-preview:hover .frame-overlay {
    opacity: 1;
}

.frame-empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--text-secondary);
}


.cn-prompt-box {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
    max-height: 80px;
    overflow-y: auto;
}

.prompt-hint {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
}

.config-grid {
    display: flex;
    gap: 16px;
    align-items: center;
}

.config-item {
    display: flex;
    align-items: center;
    gap: 8px;
}

.config-item .label {
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 500;
}

.options-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    margin-bottom: 20px;
}

.generate-btn {
    margin-top: auto;
    border-radius: 8px;
    font-weight: 600;
}

.result-card {
    display: flex;
    flex-direction: column;
}

.result-content {
    flex: 1;
    overflow-y: auto;
}

.result-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.result-item {
    border-radius: 10px;
    overflow: hidden;
    position: relative;
    border: 2px solid transparent;
    transition: all 0.2s ease;
    background: var(--bg-body);
    padding: 8px;
}

.result-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.result-item.selected {
    border-color: var(--accent);
}

.result-video {
    width: 100%;
    display: block;
    border-radius: 8px;
}

.video-badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
    padding: 0 4px;
}

.generating-placeholder {
    width: 100%;
    height: 140px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 8px;
}

.error-placeholder {
    width: 100%;
    height: 100px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    justify-content: center;
    background: rgba(245, 108, 108, 0.08);
    color: var(--danger);
    font-size: 13px;
    border-radius: 8px;
}

.footer-btns {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 16px;
}
</style>
