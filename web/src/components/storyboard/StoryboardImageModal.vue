<template>
    <el-dialog v-model="visible" title="分镜图片生成" width="960px" destroy-on-close :close-on-click-modal="false"
        class="storyboard-img-dialog">
        <div class="modal-body" v-loading="loading" element-loading-text="正在生成图片...">
            <div v-if="shot" class="content-wrapper">
                <!-- 左侧面板 -->
                <div class="left-panel">
                    <div class="section-card">
                        <!-- 分镜信息 -->
                        <div class="shot-badge">
                            <el-tag>S{{ shot.segmentIndex }}-{{ shot.shotIndex }}</el-tag>
                            <span class="seg-desc">{{ shot.segmentDesc }}</span>
                        </div>

                        <!-- 匹配的资产 -->
                        <div class="ref-section">
                            <div class="section-header">
                                <span class="name-pre">引用资产</span>
                                <el-button link type="primary" size="small" @click="loadMatchedAssets"
                                    :loading="assetsLoading">
                                    <el-icon class="mr-4"><Refresh /></el-icon>刷新
                                </el-button>
                            </div>
                            <div v-if="matchedAssets.length" class="ref-list">
                                <div v-for="a in matchedAssets" :key="a.id" class="ref-item">
                                    <div class="ref-img-box">
                                        <img v-if="a.filePath"
                                            :src="`http://localhost:60000/uploads/${a.filePath}`" />
                                        <div v-else class="no-img">无图</div>
                                    </div>
                                    <div class="ref-info">
                                        <div class="ref-name">
                                            <el-tag size="small" :type="a.type === 'role' ? 'warning' : a.type === 'scene' ? 'success' : 'info'">
                                                {{ a.type === 'role' ? '角色' : a.type === 'scene' ? '场景' : '道具' }}
                                            </el-tag>
                                            <span>{{ a.name }}</span>
                                            <el-tag v-if="a.publicUrl" size="small" type="success" effect="plain">有OSS</el-tag>
                                        </div>
                                        <div class="ref-desc">{{ a.intro || '无描述' }}</div>
                                    </div>
                                </div>
                            </div>
                            <el-empty v-else description="未匹配到资产" :image-size="40" />
                        </div>

                        <!-- 镜头描述 -->
                        <div class="prompt-section">
                            <div class="section-header">
                                <span class="name-pre">镜头描述</span>
                                <span class="auto-hint" v-if="promptDirty">修改后失焦自动刷新资产</span>
                            </div>
                            <el-input v-model="shotPromptText" type="textarea" :rows="3"
                                placeholder="镜头描述..." @blur="onPromptBlur" />
                        </div>

                        <!-- 润色后提示词 -->
                        <div class="prompt-section">
                            <div class="section-header">
                                <span class="name-pre">绘图提示词</span>
                                <el-button link type="primary" size="small" @click="polishPrompt"
                                    :loading="polishLoading">
                                    <el-icon class="mr-4"><MagicStick /></el-icon>智能润色
                                </el-button>
                            </div>
                            <el-input v-model="polishedPromptText" type="textarea" :rows="5"
                                placeholder="点击「智能润色」自动生成，或手动编辑提示词..."
                                @blur="onPolishedPromptBlur" />
                        </div>

                        <el-button type="primary" size="large" class="generate-btn" @click="startGenerate"
                            :loading="generateLoading" style="width: 100%;">
                            <el-icon class="mr-8"><Lightning /></el-icon> 开始生成
                        </el-button>
                    </div>
                </div>

                <!-- 右侧结果面板 -->
                <div class="right-panel">
                    <div class="section-card result-card">
                        <div class="section-header">
                            <span class="name-pre">生成结果</span>
                            <el-tag v-if="resultImages.length" type="info">{{ resultImages.length }} 张</el-tag>
                        </div>
                        <div class="result-content">
                            <el-empty v-if="!resultImages.length" description="暂无生成结果" :image-size="80" />
                            <div v-else class="result-grid">
                                <div v-for="(item, index) in resultImages" :key="index" class="result-item"
                                    :class="{ selected: selectedIndex === index, generating: item.state === 'generating' }"
                                    @click="handleSelect(item, index)">
                                    <template v-if="item.state === 'success' && item.filePath">
                                        <el-image :src="`http://localhost:60000/uploads/${item.filePath}`"
                                            class="result-img" fit="cover"
                                            :preview-src-list="[`http://localhost:60000/uploads/${item.filePath}`]">
                                            <template #error>
                                                <div class="image-slot"><el-icon><Picture /></el-icon></div>
                                            </template>
                                        </el-image>
                                        <div v-if="selectedIndex === index" class="selected-badge">
                                            <el-icon color="#fff"><Check /></el-icon>
                                        </div>
                                    </template>
                                    <template v-else-if="item.state === 'generating'">
                                        <div class="generating-placeholder">
                                            <el-icon class="is-loading" size="24"><Loading /></el-icon>
                                            <span class="mt-8 text-secondary" style="font-size:12px;">生成中...</span>
                                        </div>
                                    </template>
                                    <template v-else>
                                        <div class="error-placeholder">生成失败</div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 底部按钮 -->
            <div class="footer-btns">
                <el-button size="large" @click="visible = false">取消</el-button>
                <el-button type="primary" size="large" :loading="saveLoading" @click="handleSave">保存选择</el-button>
            </div>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Lightning, Loading, Picture, Check, Refresh } from '@element-plus/icons-vue'
import api from '../../utils/axios'
import type { StoryboardShot } from '../../types'

interface MatchedAsset {
    id: number; name: string; type: string; intro: string; filePath: string | null; publicUrl: string | null;
}
interface ImageState {
    filePath: string; state: 'success' | 'generating' | 'failed';
}

const props = defineProps<{ shot?: StoryboardShot }>()
const emit = defineEmits<{ (e: 'update'): void }>()
const visible = defineModel<boolean>({ default: false })

const loading = ref(false)
const assetsLoading = ref(false)
const polishLoading = ref(false)
const generateLoading = ref(false)
const saveLoading = ref(false)

const shotPromptText = ref('')
const polishedPromptText = ref('')
const matchedAssets = ref<MatchedAsset[]>([])
const resultImages = ref<ImageState[]>([])
const selectedIndex = ref(-1)
const promptDirty = ref(false)
let initialPrompt = ''

watch(visible, async (val) => {
    if (val && props.shot) {
        shotPromptText.value = props.shot.shotPrompt || ''
        initialPrompt = shotPromptText.value
        promptDirty.value = false
        polishedPromptText.value = props.shot.polishedPrompt || ''
        resultImages.value = []
        selectedIndex.value = -1
        matchedAssets.value = []

        // 加载历史图片
        let historyArr: string[] = []
        try {
            if (props.shot.history) historyArr = JSON.parse(props.shot.history)
        } catch (e) { }
        resultImages.value = historyArr.map(h => ({ filePath: h, state: 'success' as const }))
        if (resultImages.value.length === 0 && props.shot.filePath) {
            resultImages.value = [{ filePath: props.shot.filePath, state: 'success' }]
        }
        selectedIndex.value = resultImages.value.findIndex(item => item.filePath === props.shot?.filePath)
        if (selectedIndex.value === -1 && resultImages.value.length > 0) selectedIndex.value = 0

        // 自动加载匹配的资产
        await loadMatchedAssets()
    }
})

async function loadMatchedAssets() {
    if (!props.shot) return
    assetsLoading.value = true
    try {
        // 先保存最新的 shotPrompt
        if (shotPromptText.value !== props.shot.shotPrompt) {
            await api.post('/api/storyboard/update', { id: props.shot.id, shotPrompt: shotPromptText.value })
        }
        const res: any = await api.post('/api/storyboard/matchAssets', {
            storyboardId: props.shot.id,
            extraPrompt: polishedPromptText.value || '',
        })
        matchedAssets.value = res.data?.matched || []
    } catch (e: any) {
        ElMessage.error(e.message || '加载资产失败')
    } finally {
        assetsLoading.value = false
    }
}

// 镜头描述修改后失焦：自动保存并刷新资产匹配
async function onPromptBlur() {
    if (!props.shot) return
    if (shotPromptText.value !== initialPrompt) {
        // 保存到数据库
        await api.post('/api/storyboard/update', { id: props.shot.id, shotPrompt: shotPromptText.value })
        initialPrompt = shotPromptText.value
        promptDirty.value = false
        // 自动刷新资产匹配
        await loadMatchedAssets()
    }
}

// 绘图提示词修改后失焦：保存到数据库并刷新资产匹配
async function onPolishedPromptBlur() {
    if (!props.shot) return
    // 保存到数据库
    await api.post('/api/storyboard/update', { id: props.shot.id, polishedPrompt: polishedPromptText.value })
    await loadMatchedAssets()
}

// 监听镜头描述变化，显示提示
watch(shotPromptText, (val) => {
    promptDirty.value = val !== initialPrompt
})

async function polishPrompt() {
    if (!props.shot) return
    polishLoading.value = true
    try {
        // 先保存最新的 shotPrompt
        if (shotPromptText.value !== props.shot.shotPrompt) {
            await api.post('/api/storyboard/update', { id: props.shot.id, shotPrompt: shotPromptText.value })
        }
        const res: any = await api.post('/api/storyboard/polishPrompt', { storyboardId: props.shot.id })
        polishedPromptText.value = res.data?.polishedPrompt || ''
        // 保存润色后的提示词到数据库
        await api.post('/api/storyboard/update', { id: props.shot.id, polishedPrompt: polishedPromptText.value })
        ElMessage.success('提示词润色完成')
        // 刷新资产匹配
        await loadMatchedAssets()
    } catch (e: any) {
        ElMessage.error(e.message || '润色失败')
    } finally {
        polishLoading.value = false
    }
}

function handleSelect(item: ImageState, index: number) {
    if (item.state === 'generating') { ElMessage.warning('图片仍在生成中'); return }
    selectedIndex.value = index
}

async function startGenerate() {
    if (!props.shot) return
    generateLoading.value = true
    loading.value = true
    try {
        // 保存最新的 shotPrompt
        if (shotPromptText.value !== props.shot.shotPrompt) {
            await api.post('/api/storyboard/update', { id: props.shot.id, shotPrompt: shotPromptText.value })
        }

        const tempIndex = resultImages.value.length
        resultImages.value.push({ filePath: '', state: 'generating' })

        const res: any = await api.post('/api/task/create', {
            type: 'storyboard_image',
            projectId: props.shot.projectId,
            input: { storyboardIds: [props.shot.id] },
        })
        const taskId = res.data.taskId

        // 轮询等待
        let completed = false
        while (!completed) {
            await new Promise(r => setTimeout(r, 2000))
            const check: any = await api.post('/api/task/status', { taskId })
            if (check.data.status === 'completed') {
                completed = true
                // 重新获取分镜数据以拿到最新的 filePath
                const listRes: any = await api.post('/api/storyboard/list', { scriptId: props.shot.scriptId })
                const updatedShot = (listRes.data || []).find((s: any) => s.id === props.shot!.id)
                if (updatedShot?.filePath) {
                    resultImages.value[tempIndex] = { filePath: updatedShot.filePath, state: 'success' }
                    selectedIndex.value = tempIndex
                }
                ElMessage.success('图片生成成功！')
            } else if (check.data.status === 'failed') {
                completed = true
                resultImages.value[tempIndex].state = 'failed'
                ElMessage.error(check.data.error || '生成失败')
            }
        }
    } catch (e: any) {
        ElMessage.error(e.message || '生成请求失败')
    } finally {
        generateLoading.value = false
        loading.value = false
    }
}

async function handleSave() {
    if (!props.shot) return
    saveLoading.value = true
    try {
        const payload: any = {
            id: props.shot.id,
            shotPrompt: shotPromptText.value,
        }
        if (selectedIndex.value !== -1 && resultImages.value[selectedIndex.value]?.filePath) {
            payload.filePath = resultImages.value[selectedIndex.value].filePath
        }
        await api.post('/api/storyboard/update', payload)
        ElMessage.success('保存成功')
        emit('update')
        visible.value = false
    } catch (e: any) {
        ElMessage.error(e.message || '保存失败')
    } finally {
        saveLoading.value = false
    }
}
</script>

<style scoped>
.content-wrapper { display: flex; gap: 20px; align-items: stretch; min-height: 450px; }
.left-panel { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; }
.right-panel { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.section-card {
    background: var(--bg-card); border-radius: 12px; padding: 20px;
    border: 1px solid var(--border); height: 100%; display: flex; flex-direction: column;
}
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.name-pre { font-size: 14px; font-weight: 600; color: var(--text-primary); }

.shot-badge { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.seg-desc { color: var(--text-secondary); font-size: 13px; }

.ref-section { margin-bottom: 16px; }
.ref-list { display: flex; flex-direction: column; gap: 8px; max-height: 160px; overflow-y: auto; }
.ref-item {
    display: flex; gap: 10px; padding: 8px; background: var(--bg-secondary);
    border-radius: 8px; border: 1px solid var(--border);
}
.ref-img-box {
    width: 48px; height: 48px; border-radius: 6px; overflow: hidden;
    flex-shrink: 0; background: var(--bg-body);
}
.ref-img-box img { width: 100%; height: 100%; object-fit: cover; }
.no-img {
    width: 100%; height: 100%; display: flex; align-items: center;
    justify-content: center; font-size: 11px; color: var(--text-secondary);
}
.ref-info { flex: 1; min-width: 0; }
.ref-name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; }
.ref-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.prompt-section { margin-bottom: 14px; }
.auto-hint { font-size: 11px; color: var(--el-color-warning); }
.generate-btn { margin-top: auto; border-radius: 8px; font-weight: 600; }

.result-card { display: flex; flex-direction: column; }
.result-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
.result-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.result-item {
    aspect-ratio: 16/9; border-radius: 10px; overflow: hidden; cursor: pointer;
    position: relative; border: 2px solid transparent; transition: all 0.2s ease; background: var(--bg-body);
}
.result-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.result-item.selected { border-color: var(--accent); }
.result-img { width: 100%; height: 100%; display: block; }
.selected-badge {
    position: absolute; top: 6px; right: 6px; width: 22px; height: 22px;
    background: var(--accent); border-radius: 50%; display: flex;
    align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}
.generating-placeholder {
    width: 100%; height: 100%; display: flex; flex-direction: column;
    align-items: center; justify-content: center; background: rgba(0,0,0,0.02);
}
.error-placeholder {
    width: 100%; height: 100%; display: flex; align-items: center;
    justify-content: center; background: rgba(245,108,108,0.1); color: var(--danger); font-size: 13px;
}
.footer-btns {
    margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);
    display: flex; justify-content: flex-end; gap: 16px;
}
.image-slot {
    display: flex; justify-content: center; align-items: center;
    width: 100%; height: 100%; background: var(--bg-body); color: var(--text-secondary); font-size: 24px;
}
</style>
