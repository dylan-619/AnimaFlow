<template>
    <el-dialog v-model="visible" title="图片生成" width="900px" destroy-on-close :close-on-click-modal="false"
        class="image-gen-dialog">
        <div class="model-body" v-loading="loading" element-loading-text="正在为您生成图片，请耐心等待...">
            <div v-if="asset" class="content-wrapper">
                <!-- 左侧面板 -->
                <div class="left-panel">
                    <div class="section-card">
                        <!-- 模式切换，由于只有AI生成，暂定不显示上传选项，但也留好后续扩展结构 -->

                        <div class="upload-section">
                            <div class="section-header">
                                <span class="name-pre">参考图片</span>
                                <span class="optional-tag">可选</span>
                            </div>
                            <div class="picture-preview" @click="changeFile">
                                <template v-if="sampleImage">
                                    <div class="image-div pr">
                                        <img :src="sampleImage" class="element-img" />
                                        <div class="image-overlay">
                                            <el-button type="danger" circle size="small" :icon="Delete"
                                                @click.stop="deleteImage" />
                                        </div>
                                    </div>
                                </template>
                                <div v-else class="upload-placeholder">
                                    <el-icon class="upload-icon" size="32" color="var(--accent)">
                                        <UploadFilled />
                                    </el-icon>
                                    <span class="upload-text">点击上传</span>
                                </div>
                            </div>
                        </div>

                        <!-- 资产描述 -->
                        <div class="prompt-section" style="margin-bottom: 24px;">
                            <div class="section-header">
                                <span class="name-pre">资产描述</span>
                            </div>
                            <el-input v-model="introText" type="textarea" :rows="3" placeholder="请输入资产描述..." />
                        </div>

                        <!-- 提示词 -->
                        <div class="prompt-section">
                            <div class="section-header">
                                <span class="name-pre">绘图提示词</span>
                                <el-button link type="primary" size="small" @click.stop="generatePrompt"
                                    :loading="promptLoading">
                                    <el-icon class="mr-4">
                                        <MagicStick />
                                    </el-icon>智能生成
                                </el-button>
                            </div>
                            <el-input v-model="promptText" type="textarea" :rows="6"
                                placeholder="请输入或使用 AI 生成提示词，描述您想要生成的图片内容..." class="prompt-textarea" />

                            <div class="mt-16 flex-center" v-if="asset.type === 'role'"
                                style="justify-content: space-between;">
                                <span
                                    style="font-size: 14px; color: var(--text-primary); font-weight: 500;">作为后续主参考图</span>
                                <el-switch v-model="isMasterReference" />
                            </div>
                        </div>

                        <el-button type="primary" size="large" class="generate-btn" @click="startGenerate"
                            :loading="generateLoading" style="width: 100%;">
                            <el-icon class="mr-8">
                                <Lightning />
                            </el-icon> 开始生成
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
                                                <div class="image-slot"><el-icon>
                                                        <Picture />
                                                    </el-icon></div>
                                            </template>
                                        </el-image>
                                        <div v-if="selectedIndex === index" class="selected-badge">
                                            <el-icon color="#fff">
                                                <Check />
                                            </el-icon>
                                        </div>
                                    </template>
                                    <template v-else-if="item.state === 'generating'">
                                        <div class="generating-placeholder">
                                            <el-icon class="is-loading" size="24">
                                                <Loading />
                                            </el-icon>
                                            <span class="mt-8 text-secondary" style="font-size:12px;">生成中...</span>
                                        </div>
                                    </template>
                                    <template v-else>
                                        <div class="image-div">
                                            <div class="error-placeholder">生成失败</div>
                                            <div class="image-overlay">
                                                <el-button type="danger" circle size="small" :icon="Delete"
                                                    @click.stop="removeResult(index)" />
                                            </div>
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
                <el-button size="large" @click="visible = false">取消</el-button>
                <el-button type="primary" size="large" :loading="saveLoading" @click="handleSave">保存修改</el-button>
            </div>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, UploadFilled, MagicStick, Lightning, Loading, Picture, Check } from '@element-plus/icons-vue'
import { useFileDialog } from '@vueuse/core'
import api from '../../utils/axios'
import type { Asset } from '../../types'

const props = defineProps<{ asset?: Asset }>()
const emit = defineEmits<{ (e: 'update'): void }>()
const visible = defineModel<boolean>({ default: false })

interface ImageState {
    filePath: string;
    state: 'success' | 'generating' | 'failed';
}

const loading = ref(false)
const promptLoading = ref(false)
const generateLoading = ref(false)
const saveLoading = ref(false)

const promptText = ref('')
const introText = ref('')
const sampleImage = ref('')
const isMasterReference = ref(false)
const resultImages = ref<ImageState[]>([])
const selectedIndex = ref(-1)

// 文件选择
const { open, onChange, onCancel } = useFileDialog({ multiple: false, reset: true, accept: 'image/png,image/jpeg,image/jpg' })

// Fake Timer mechanism for progress check since standard generation api is synchronous but potentially slow.
// NOTE: With standard HTTP, we wait. If there's an async job mechanism, we poll. Currently we wait synchronously.
// ResultImages format supports both. We'll simulate async for UX briefly if needed, or simply wait.

watch(visible, (val) => {
    if (val && props.asset) {
        promptText.value = props.asset.prompt || ''
        introText.value = props.asset.intro || ''
        sampleImage.value = '' // Initial empty for sample unless fetched
        isMasterReference.value = props.asset.isMasterReference === 1

        let historyArr: string[] = []
        try {
            if (props.asset.history) {
                historyArr = JSON.parse(props.asset.history)
            }
        } catch (e) { }

        resultImages.value = historyArr.map(h => ({ filePath: h, state: 'success' }))

        if (resultImages.value.length === 0 && props.asset.filePath) {
            resultImages.value = [{ filePath: props.asset.filePath, state: 'success' }]
        }

        selectedIndex.value = resultImages.value.findIndex(item => item.filePath === props.asset?.filePath)
        if (selectedIndex.value === -1 && resultImages.value.length > 0) {
            selectedIndex.value = 0
        }

        promptLoading.value = false
        generateLoading.value = false
    }
})

async function changeFile() {
    const files = await new Promise<FileList | null>((resolve) => {
        open();
        onChange((f) => resolve(f));
        onCancel(() => resolve(null));
    });

    if (!files?.length) return;
    const file = files[0];
    sampleImage.value = await fileToBase64(file);
}

function deleteImage() {
    sampleImage.value = '';
}

async function generatePrompt() {
    if (!props.asset) return;
    promptLoading.value = true;
    try {
        const res: any = await api.post('/api/assets/polishPrompt', { assetId: props.asset.id });
        promptText.value = res.data.prompt;
        emit('update'); // Emit update so the new prompt is reloaded in the parent list
        ElMessage.success('提示词生成成功');
    } catch (e: any) {
        ElMessage.error(e.message || '提示词生成失败');
    } finally {
        promptLoading.value = false;
    }
}

function handleSelect(item: ImageState, index: number) {
    if (item.state === 'generating') {
        ElMessage.warning('图片仍在生成中');
        return;
    }
    selectedIndex.value = index;
}

function removeResult(index: number) {
    if (selectedIndex.value === index) {
        selectedIndex.value = -1;
    } else if (selectedIndex.value > index) {
        selectedIndex.value -= 1;
    }
    resultImages.value.splice(index, 1);
}

// 模拟异步请求任务流程（根据后端接口替换真实实现）
async function startGenerate() {
    if (!props.asset) return;
    if (!promptText.value) {
        ElMessage.warning('请输入或生成提示词');
        return;
    }

    generateLoading.value = true;
    loading.value = true;

    try {
        // Currently we trigger /api/task/create wait style because generating images is heavy. But we can also trigger a direct call.
        const tempIndex = resultImages.value.length;
        resultImages.value.push({ filePath: '', state: 'generating' });

        // Note: Realistically, the generic /api/assets/generate endpoint needs to handle base64 images, which we mock logic for here.
        const payload = {
            assetId: props.asset.id,
            // Optional payload expansion could happen in backend to accept new prompt and reference
        };

        // Hack / Update prompt first
        if (promptText.value !== props.asset.prompt || introText.value !== props.asset.intro) {
            await api.post('/api/assets/update', { id: props.asset.id, intro: introText.value, prompt: promptText.value });
        }

        // Ideally we hit a specific controller. For now rely on generic /api/task/create (asset_image) 
        // which we see in AssetsPanel.vue genOneImage.
        const res: any = await api.post('/api/task/create', { type: 'asset_image', projectId: props.asset.projectId, input: payload });
        const taskId = res.data.taskId;

        // Poll task...
        let completed = false;
        while (!completed) {
            await new Promise(r => setTimeout(r, 2000));
            const check: any = await api.post('/api/task/status', { taskId });
            if (check.data.status === 'completed') {
                completed = true;
                const newAsset = await fetchAsset(props.asset.id);
                resultImages.value[tempIndex] = { filePath: newAsset.filePath || '', state: 'success' };
                selectedIndex.value = tempIndex;
                ElMessage.success('资产图片生成成功!');
            } else if (check.data.status === 'failed') {
                completed = true;
                resultImages.value[tempIndex].state = 'failed';
                ElMessage.error(check.data.error || '生成失败');
            }
        }

    } catch (e: any) {
        ElMessage.error(e.message || '生成请求失败');
    } finally {
        generateLoading.value = false;
        loading.value = false;
    }
}

async function fetchAsset(id: number) {
    // Hacky partial fetch workaround since standard list isn't single. 
    const res: any = await api.post('/api/assets/list', { projectId: props.asset?.projectId });
    return res.data.find((a: any) => a.id === id) || { filePath: '' };
}

async function handleSave() {
    if (!props.asset) return;

    saveLoading.value = true;
    try {
        const payload: any = {
            id: props.asset.id,
            prompt: promptText.value,
            intro: introText.value,
            isMasterReference: isMasterReference.value ? 1 : 0
        };

        if (selectedIndex.value !== -1 && resultImages.value[selectedIndex.value]?.filePath) {
            payload.filePath = resultImages.value[selectedIndex.value].filePath;
        }

        await api.post('/api/assets/update', payload);
        ElMessage.success('保存成功');
        emit('update');
        visible.value = false;
    } catch (e: any) {
        ElMessage.error(e.message || '保存失败');
    } finally {
        saveLoading.value = false;
    }
}

function fileToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
</script>

<style scoped>
.content-wrapper {
    display: flex;
    gap: 20px;
    align-items: stretch;
    min-height: 400px;
}

.left-panel {
    width: 340px;
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
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
    height: 100%;
    display: flex;
    flex-direction: column;
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.name-pre {
    font-size: 15px;
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

.upload-section {
    margin-bottom: 24px;
}

.picture-preview {
    width: 120px;
    aspect-ratio: 1/1;
    border: 2px dashed var(--border);
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg-body);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
}

.picture-preview:hover {
    border-color: var(--accent);
    background: rgba(153, 19, 250, 0.05);
}

.element-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
}

.upload-icon {
    opacity: 0.8;
}

.upload-text {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
}

.image-div {
    width: 100%;
    height: 100%;
    position: relative;
}

.image-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
}

.image-div:hover .image-overlay {
    opacity: 1;
}

.prompt-section {
    margin-bottom: 24px;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.prompt-textarea {
    margin-top: auto;
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
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.result-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 16px;
}

.result-item {
    aspect-ratio: 1/1;
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    position: relative;
    border: 2px solid transparent;
    transition: all 0.2s ease;
    background: var(--bg-body);
}

.result-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.result-item.selected {
    border-color: var(--accent);
}

.result-img {
    width: 100%;
    height: 100%;
    display: block;
}

.selected-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    background: var(--accent);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.generating-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.02);
}

.error-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(245, 108, 108, 0.1);
    color: var(--danger);
    font-size: 13px;
}

.footer-btns {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 16px;
}

.image-slot {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    background: var(--bg-body);
    color: var(--text-secondary);
    font-size: 24px;
}
</style>
