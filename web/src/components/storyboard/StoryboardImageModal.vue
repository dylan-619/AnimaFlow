<template>
    <el-dialog v-model="visible" title="分镜图片生成与编辑" width="960px" destroy-on-close :close-on-click-modal="false"
        class="storyboard-img-dialog">
        <div class="modal-body" v-loading="loading" :element-loading-text="loadingText">
            <div v-if="shot" class="content-wrapper">
                <!-- 左侧面板 -->
                <div class="left-panel">
                    <div class="section-card">
                        <!-- 分镜信息 -->
                        <div class="shot-badge">
                            <el-tag>S{{ shot.segmentIndex }}-{{ shot.shotIndex }}</el-tag>
                            <span class="seg-desc">{{ shot.segmentDesc }}</span>
                        </div>

                        <!-- 模式切换 -->
                        <div class="mode-section">
                            <div class="section-header">
                                <span class="name-pre">生成模式</span>
                            </div>
                            <el-radio-group v-model="editMode" size="small" class="mode-radio-group">
                                <el-radio-button value="create">新建</el-radio-button>
                                <el-radio-button value="local_edit">局部修改</el-radio-button>
                                <el-radio-button value="style_transfer">风格迁移</el-radio-button>
                                <el-radio-button value="expand">画面扩展</el-radio-button>
                            </el-radio-group>
                        </div>

                        <!-- 编辑模式：源图片选择 -->
                        <div v-if="editMode !== 'create'" class="source-section">
                            <div class="section-header">
                                <span class="name-pre">源图片</span>
                                <span class="source-count" v-if="historyImages.length > 0">共 {{ historyImages.length }} 张</span>
                            </div>
                            <div v-if="historyImages.length > 0" class="source-grid">
                                <div v-for="(img, index) in historyImages" :key="index" 
                                    class="source-item"
                                    :class="{ selected: selectedSourceIndex === index }"
                                    @click="selectSourceImage(index)">
                                    <el-image :src="`http://localhost:60000/uploads/${img}`" fit="cover" />
                                    <div v-if="selectedSourceIndex === index" class="source-badge">
                                        <el-icon color="#fff"><Check /></el-icon>
                                    </div>
                                </div>
                            </div>
                            <el-empty v-else description="暂无历史图片" :image-size="40" />
                        </div>

                        <!-- 编辑模式：强度滑块 -->
                        <div v-if="editMode !== 'create'" class="strength-section">
                            <div class="section-header">
                                <span class="name-pre">编辑强度</span>
                                <span class="strength-value">{{ editStrength.toFixed(1) }}</span>
                            </div>
                            <el-slider v-model="editStrength" :min="0.3" :max="0.8" :step="0.1" show-stops />
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
                            <el-input v-model="shotPromptText" type="textarea" :rows="2"
                                placeholder="镜头描述..." @blur="onPromptBlur" />
                        </div>

                        <!-- 提示词 -->
                        <div class="prompt-section">
                            <div class="section-header">
                                <span class="name-pre">{{ editMode === 'create' ? '绘图提示词' : '编辑描述' }}</span>
                                <el-button v-if="editMode === 'create'" link type="primary" size="small" @click="polishPrompt"
                                    :loading="polishLoading">
                                    <el-icon class="mr-4"><MagicStick /></el-icon>智能润色
                                </el-button>
                            </div>
                            <el-input v-model="polishedPromptText" type="textarea" :rows="editMode === 'create' ? 3 : 2"
                                :placeholder="getPromptPlaceholder()"
                                @blur="onPolishedPromptBlur" />
                        </div>

                        <el-button type="primary" size="large" class="generate-btn" @click="startGenerate"
                            :loading="generateLoading" style="width: 100%;">
                            <el-icon class="mr-8"><Lightning /></el-icon> {{ editMode === 'create' ? '开始生成' : '开始编辑' }}
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
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Lightning, Loading, Picture, Check, Refresh } from '@element-plus/icons-vue'
import api from '../../utils/axios'
import type { StoryboardShot } from '../../types'

// 编辑模式类型
type EditMode = 'create' | 'local_edit' | 'style_transfer' | 'expand'

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

// 编辑模式相关
const editMode = ref<EditMode>('create')
const editStrength = ref(0.5)
const selectedSourceIndex = ref(-1)
const historyImages = ref<string[]>([])
const historyData = ref<Array<{ fileName: string; publicUrl: string | null }>>([]) // 历史图片详细信息（含OSS地址）

const shotPromptText = ref('')
const polishedPromptText = ref('')
const matchedAssets = ref<MatchedAsset[]>([])
const resultImages = ref<ImageState[]>([])
const selectedIndex = ref(-1)
const promptDirty = ref(false)
let initialPrompt = ''

// 计算加载文本
const loadingText = computed(() => {
    return editMode.value === 'create' ? '正在生成图片...' : '正在编辑图片...'
})

watch(visible, async (val) => {
    if (val && props.shot) {
        shotPromptText.value = props.shot.shotPrompt || ''
        initialPrompt = shotPromptText.value
        promptDirty.value = false
        polishedPromptText.value = props.shot.polishedPrompt || ''
        resultImages.value = []
        selectedIndex.value = -1
        matchedAssets.value = []
        
        // 重置编辑模式相关状态
        editMode.value = 'create'
        editStrength.value = 0.5
        selectedSourceIndex.value = -1

        // 加载历史图片 - 优先使用historyData（包含OSS地址）
        let historyArr: string[] = []
        let historyDetailArr: Array<{ fileName: string; publicUrl: string | null }> = []
        try {
            // 优先读取新的historyData格式
            if (props.shot.historyData) {
                historyDetailArr = props.shot.historyData
                historyArr = historyDetailArr.map(h => h.fileName)
            } else if (props.shot.history) {
                // 兼容旧格式（纯字符串数组）
                historyArr = JSON.parse(props.shot.history)
                historyDetailArr = historyArr.map(h => ({ fileName: h, publicUrl: props.shot?.publicUrl }))
            }
        } catch (e) { }
        historyImages.value = historyArr
        historyData.value = historyDetailArr
        resultImages.value = historyArr.map(h => ({ filePath: h, state: 'success' as const }))
        if (resultImages.value.length === 0 && props.shot.filePath) {
            resultImages.value = [{ filePath: props.shot.filePath, state: 'success' }]
            historyImages.value = [props.shot.filePath]
        }
        selectedIndex.value = resultImages.value.findIndex(item => item.filePath === props.shot?.filePath)
        if (selectedIndex.value === -1 && resultImages.value.length > 0) selectedIndex.value = 0
        
        // 默认选择第一个历史图片作为源图片
        if (historyImages.value.length > 0) {
            selectedSourceIndex.value = 0
        }

        // 自动加载匹配的资产
        await loadMatchedAssets()
    }
})

// 获取提示词占位符
function getPromptPlaceholder() {
    switch (editMode.value) {
        case 'local_edit':
            return '描述您想要的修改，如：让她微笑、改变衣服颜色、调整姿势...'
        case 'style_transfer':
            return '描述目标风格，如：转换为赛博朋克风格、水彩画风...'
        case 'expand':
            return '描述扩展区域的内容，如：向右扩展展示更多场景...'
        default:
            return '点击「智能润色」自动生成，或手动编辑提示词...'
    }
}

// 选择源图片
function selectSourceImage(index: number) {
    selectedSourceIndex.value = index
}

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

// 获取源图片URL - 优先使用OSS地址
function getSourceImageUrl(): string {
    if (selectedSourceIndex.value >= 0) {
        const historyItem = historyData.value[selectedSourceIndex.value]
        
        // 优先使用OSS地址
        if (historyItem?.publicUrl) {
            return historyItem.publicUrl
        }
        
        // 如果没有OSS地址，使用本地服务器URL
        const selectedFileName = historyImages.value[selectedSourceIndex.value]
        if (selectedFileName) {
            return `http://localhost:60000/uploads/${selectedFileName}`
        }
    }
    return ''
}

async function startGenerate() {
    if (!props.shot) return
    
    // 编辑模式校验
    if (editMode.value !== 'create') {
        if (selectedSourceIndex.value < 0) {
            ElMessage.warning('请选择源图片')
            return
        }
        if (!polishedPromptText.value) {
            ElMessage.warning('请输入编辑描述')
            return
        }
    }
    
    generateLoading.value = true
    loading.value = true
    try {
        // 保存最新的 shotPrompt
        if (shotPromptText.value !== props.shot.shotPrompt) {
            await api.post('/api/storyboard/update', { id: props.shot.id, shotPrompt: shotPromptText.value })
        }

        const tempIndex = resultImages.value.length
        resultImages.value.push({ filePath: '', state: 'generating' })

        if (editMode.value === 'create') {
            // 新建模式
            const res: any = await api.post('/api/task/create', {
                type: 'storyboard_image',
                projectId: props.shot.projectId,
                input: { 
                    storyboardIds: [props.shot.id],
                    skipExisting: false
                },
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
                        // 更新历史图片列表
                        if (updatedShot.history) {
                            try {
                                historyImages.value = JSON.parse(updatedShot.history)
                            } catch (e) {}
                        }
                    }
                    ElMessage.success('图片生成成功！')
                } else if (check.data.status === 'failed') {
                    completed = true
                    resultImages.value[tempIndex].state = 'failed'
                    ElMessage.error(check.data.error || '生成失败')
                }
            }
        } else {
            // 编辑模式
            const sourceImage = getSourceImageUrl()
            const res: any = await api.post('/api/storyboard/editImage', {
                storyboardId: props.shot.id,
                mode: editMode.value,
                sourceImage,
                editPrompt: polishedPromptText.value,
                strength: editStrength.value
            })
            
            if (res.data?.filePath) {
                resultImages.value[tempIndex] = { filePath: res.data.filePath, state: 'success' }
                selectedIndex.value = tempIndex
                // 更新历史图片列表
                if (res.data.history) {
                    historyImages.value = res.data.history
                }
                // 更新历史详细数据（包含OSS地址）
                if (res.data.historyData) {
                    historyData.value = res.data.historyData
                }
                ElMessage.success('图片编辑成功！')
            } else {
                throw new Error('编辑结果无效')
            }
        }
    } catch (e: any) {
        ElMessage.error(e.message || '请求失败')
        // 移除生成中的占位
        const generatingIndex = resultImages.value.findIndex(item => item.state === 'generating')
        if (generatingIndex >= 0) {
            resultImages.value.splice(generatingIndex, 1)
        }
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

.shot-badge { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.seg-desc { color: var(--text-secondary); font-size: 13px; }

/* 模式选择 */
.mode-section { margin-bottom: 16px; }
.mode-radio-group { width: 100%; }
.mode-radio-group :deep(.el-radio-button__inner) { width: 100%; font-size: 12px; padding: 6px 8px; }

/* 源图片选择 */
.source-section { margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; }
.source-count { font-size: 12px; color: var(--text-secondary); }
.source-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 8px; }
.source-item {
    aspect-ratio: 16/9; border-radius: 6px; overflow: hidden; cursor: pointer;
    border: 2px solid transparent; transition: all 0.2s; position: relative;
}
.source-item:hover { border-color: var(--el-color-primary-light-3); }
.source-item.selected { border-color: var(--accent); }
.source-item :deep(.el-image) { width: 100%; height: 100%; }
.source-badge {
    position: absolute; top: 2px; right: 2px; width: 16px; height: 16px;
    background: var(--accent); border-radius: 50%; display: flex;
    align-items: center; justify-content: center;
}

/* 编辑强度 */
.strength-section { margin-bottom: 16px; }
.strength-value { font-size: 14px; font-weight: 600; color: var(--accent); }

.ref-section { margin-bottom: 12px; }
.ref-list { display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto; }
.ref-item {
    display: flex; gap: 8px; padding: 6px; background: var(--bg-body);
    border-radius: 6px; border: 1px solid var(--border);
}
.ref-img-box {
    width: 40px; height: 40px; border-radius: 4px; overflow: hidden;
    flex-shrink: 0; background: var(--bg-secondary);
}
.ref-img-box img { width: 100%; height: 100%; object-fit: cover; }
.no-img {
    width: 100%; height: 100%; display: flex; align-items: center;
    justify-content: center; font-size: 10px; color: var(--text-secondary);
}
.ref-info { flex: 1; min-width: 0; }
.ref-name { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; }
.ref-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.prompt-section { margin-bottom: 10px; }
.auto-hint { font-size: 11px; color: var(--el-color-warning); }
.generate-btn { margin-top: auto; border-radius: 8px; font-weight: 600; }

.result-card { display: flex; flex-direction: column; }
.result-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
.result-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.result-item {
    aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; cursor: pointer;
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
