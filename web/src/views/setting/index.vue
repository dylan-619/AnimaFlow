<template>
  <div class="setting-page page-container">
    <div class="page-header">
      <el-button @click="$router.back()"><el-icon class="mr-4">
          <Back />
        </el-icon>返回</el-button>
      <h1 class="flex-center"><el-icon class="mr-8">
          <Setting />
        </el-icon>系统设置</h1>
    </div>

    <el-tabs v-model="activeTab" class="mt-24">
      <!-- AI 模型配置 -->
      <el-tab-pane label="AI 模型" name="models">
        <el-card shadow="never" class="mb-24">
          <template #header>
            <div class="card-header">
              <span>当前使用的模型</span>
            </div>
          </template>
          <div class="current-models">
            <div class="model-slot">
              <label>文本模型</label>
              <el-select v-model="setting.textConfigId" @change="saveSetting" placeholder="选择">
                <el-option v-for="c in textConfigs" :key="c.id" :label="`${c.name} (${c.model})`" :value="c.id" />
              </el-select>
            </div>
            <div class="model-slot">
              <label>图像模型</label>
              <el-select v-model="setting.imageConfigId" @change="saveSetting" placeholder="选择">
                <el-option v-for="c in imageConfigs" :key="c.id" :label="`${c.name} (${c.model})`" :value="c.id" />
              </el-select>
            </div>
            <div class="model-slot">
              <label>视频模型</label>
              <el-select v-model="setting.videoConfigId" @change="saveSetting" placeholder="选择">
                <el-option v-for="c in videoConfigs" :key="c.id" :label="`${c.name} (${c.model})`" :value="c.id" />
              </el-select>
            </div>
            <div class="model-slot">
              <label>配音模型(TTS)</label>
              <el-select v-model="setting.ttsConfigId" @change="saveSetting" placeholder="选择">
                <el-option v-for="c in ttsConfigs" :key="c.id" :label="`${c.name} (${c.model})`" :value="c.id" />
              </el-select>
            </div>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>
            <div class="flex-between">
              <span>模型配置列表</span>
              <el-button type="primary" size="small" @click="showAddModel = true"><el-icon class="mr-4">
                  <Plus />
                </el-icon>添加</el-button>
            </div>
          </template>
          <div class="model-list">
            <div v-for="c in configs" :key="c.id" class="model-card">
              <div class="model-info">
                <strong>{{ c.name || '未命名' }}</strong>
                <div class="model-meta">
                  <el-tag size="small">{{ c.type }}</el-tag>
                  <el-tag size="small" type="info">{{ c.manufacturer }}</el-tag>
                  <span>{{ c.model }}</span>
                </div>
              </div>
              <div class="model-actions">
                <el-button size="small" @click="editModel(c)">编辑</el-button>
                <el-button size="small" @click="testModel(c.id)" :loading="testing">测试</el-button>
                <el-button size="small" type="danger" @click="deleteModel(c.id)">删除</el-button>
              </div>
            </div>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 提示词管理 -->
      <el-tab-pane label="提示词" name="prompts">
        <div class="prompt-grid">
          <div v-for="p in prompts" :key="p.id" class="prompt-card" @click="openPromptDialog(p)">
            <div class="prompt-card-header">
              <div class="prompt-card-title">
                <span class="prompt-name">{{ p.name }}</span>
                <el-tag v-if="p.customValue" size="small" type="warning" class="ml-8">已自定义</el-tag>
              </div>
              <el-tag size="small" type="info">{{ p.code }}</el-tag>
            </div>
            <div class="prompt-card-preview">
              {{ (p.customValue || p.defaultValue || '').slice(0, 120) }}...
            </div>
            <div class="prompt-card-actions">
              <el-button size="small" text type="primary" @click.stop="openPromptDialog(p)">
                <el-icon class="mr-4"><Edit /></el-icon>编辑
              </el-button>
              <el-button v-if="p.customValue" size="small" text type="warning" @click.stop="resetPrompt(p)">
                <el-icon class="mr-4"><RefreshRight /></el-icon>重置
              </el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 对象存储配置 -->
      <el-tab-pane label="对象存储" name="oss">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>阿里云 OSS 配置</span>
              <el-text type="info" size="small">用于资产图片公网访问，分镜生成时可传入参考图保持角色一致性</el-text>
            </div>
          </template>
          <el-form label-width="140px" style="max-width: 560px">
            <el-form-item label="AccessKey ID">
              <el-input v-model="setting.ossAccessKeyId" placeholder="请输入" />
            </el-form-item>
            <el-form-item label="AccessKey Secret">
              <el-input v-model="setting.ossAccessKeySecret" type="password" show-password placeholder="请输入" />
            </el-form-item>
            <el-form-item label="Bucket">
              <el-input v-model="setting.ossBucket" placeholder="例如：video-bucket" />
            </el-form-item>
            <el-form-item label="Region">
              <el-input v-model="setting.ossRegion" placeholder="例如：oss-cn-hangzhou" />
            </el-form-item>
            <el-form-item label="自定义域名">
              <el-input v-model="setting.ossCustomDomain" placeholder="可选，例如：https://cdn.example.com" />
              <el-text type="info" size="small" style="margin-top: 4px">如果绑定了自定义域名或 CDN，填写此项；否则使用 OSS 默认域名</el-text>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveOSS">保存配置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 调试工具 -->
      <el-tab-pane label="调试工具" name="debug">
        <el-card shadow="never">
          <template #header>
            <span>视频任务查询</span>
          </template>
          <el-form label-width="100px" style="max-width: 600px">
            <el-form-item label="任务 ID">
              <div style="display:flex;gap:8px;width:100%">
                <el-input v-model="debugTaskId" placeholder="例如：cgt-20260226105259-f9pzl" />
                <el-button type="primary" @click="queryExternalTask" :loading="debugLoading">查询</el-button>
              </div>
            </el-form-item>
          </el-form>
          <div v-if="debugResult" class="debug-result">
            <pre>{{ JSON.stringify(debugResult, null, 2) }}</pre>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 添加/编辑模型对话框 -->
    <el-dialog v-model="showAddModel" :title="editingModel ? '编辑模型' : '添加模型'" width="500px">
      <el-form :model="modelForm" label-width="80px">
        <el-form-item label="名称"><el-input v-model="modelForm.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="modelForm.type">
            <el-option label="文本" value="text" /><el-option label="图像" value="image" />
            <el-option label="视频" value="video" /><el-option label="TTS" value="tts" />
          </el-select>
        </el-form-item>
        <el-form-item label="厂商">
          <el-select v-model="modelForm.manufacturer" filterable allow-create>
            <el-option label="DeepSeek" value="deepseek" />
            <el-option label="火山引擎" value="volcengine" />
            <el-option label="MiniMax(星火)" value="minimax" />
            <el-option label="OpenAI" value="openai" />
          </el-select>
        </el-form-item>
        <el-form-item label="模型"><el-input v-model="modelForm.model" /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="modelForm.apiKey" type="password"
            show-password /></el-form-item>
        <el-form-item label="Base URL"><el-input v-model="modelForm.baseUrl" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddModel = false">取消</el-button>
        <el-button type="primary" @click="submitModel">{{ editingModel ? '保存' : '添加' }}</el-button>
      </template>
    </el-dialog>

    <!-- 图片模型测试预览 -->
    <el-dialog v-model="showTestImage" title="图片模型测试生成成功！" width="450px">
      <div v-if="testImageUrl" class="flex-center" style="background:#1a1d28; padding: 12px; border-radius: 8px;">
        <img :src="`http://localhost:60000/uploads/${testImageUrl}`" style="max-width: 100%; border-radius: 6px;" />
      </div>
      <p style="text-align: center; margin-top: 12px; color: var(--text-secondary); font-size: 13px;">测试提示词：一只卡通小狗</p>
    </el-dialog>

    <!-- TTS 模型测试弹窗 -->
    <el-dialog v-model="showTestTTS" :title="testTTSSuccess ? 'TTS 配音测试成功！' : 'TTS 配音测试失败'" width="520px">
      <div v-if="testTTSAudioUrl" style="background:#1a1d28; padding: 16px; border-radius: 8px; margin-bottom: 12px;">
        <p style="color: #ccc; font-size: 13px; margin-bottom: 8px;">🎵 测试文本: "你好，Anime!"</p>
        <audio :src="`http://localhost:60000/uploads/${testTTSAudioUrl}`" controls style="width: 100%"></audio>
      </div>
      <div style="background: #0d1117; border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto;">
        <p style="color: #8b949e; font-size: 12px; margin: 0 0 8px 0;">📝 完整日志:</p>
        <pre
          style="color: #c9d1d9; font-size: 12px; white-space: pre-wrap; margin: 0;">{{ testTTSLogs.join('\n') }}</pre>
      </div>
    </el-dialog>

    <!-- 提示词编辑弹窗 -->
    <el-dialog v-model="showPromptDialog" :title="editingPrompt?.name || '编辑提示词'" width="800px" top="5vh">
      <div v-if="editingPrompt" class="prompt-dialog-content">
        <div class="prompt-dialog-meta">
          <el-tag size="small" type="info">{{ editingPrompt.code }}</el-tag>
          <el-tag v-if="editingPrompt.customValue" size="small" type="warning">已自定义</el-tag>
          <el-tag v-else size="small" type="success">使用默认值</el-tag>
        </div>
        
        <el-alert v-if="editingPrompt.customValue" type="warning" :closable="false" class="mb-16">
          <template #title>
            <span>当前使用自定义值，点击"重置为默认"可恢复默认提示词</span>
          </template>
        </el-alert>

        <div class="prompt-editor-section">
          <div class="section-header">
            <span class="section-title">提示词内容</span>
            <el-button v-if="editingPrompt.customValue" size="small" text type="warning" @click="resetPromptInDialog">
              <el-icon class="mr-4"><RefreshRight /></el-icon>重置为默认
            </el-button>
          </div>
          <el-input
            v-model="editPromptValue"
            type="textarea"
            :rows="18"
            placeholder="请输入自定义提示词..."
            class="prompt-textarea"
          />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showPromptDialog = false">取消</el-button>
          <el-button type="primary" @click="savePromptFromDialog" :loading="savingPrompt">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../../utils/axios'
import type { AIConfig, Setting, PromptItem } from '../../types'

const activeTab = ref('models')
const configs = ref<AIConfig[]>([])
const setting = ref<Setting>({
  id: 1, textConfigId: null, imageConfigId: null, videoConfigId: null, ttsConfigId: null,
  ossAccessKeyId: null, ossAccessKeySecret: null, ossBucket: null, ossRegion: null, ossCustomDomain: null
})
const prompts = ref<PromptItem[]>([])
const showAddModel = ref(false)
const editingModel = ref<AIConfig | null>(null)
const testing = ref(false)
const showTestImage = ref(false)
const testImageUrl = ref('')
const showTestTTS = ref(false)
const testTTSAudioUrl = ref('')
const testTTSLogs = ref<string[]>([])
const testTTSSuccess = ref(false)
const modelForm = reactive({ name: '', type: 'text', model: '', apiKey: '', baseUrl: '', manufacturer: 'deepseek' })

const editingPromptId = ref<number | null>(null)
const editPromptValue = ref('')
const showPromptDialog = ref(false)
const editingPrompt = ref<PromptItem | null>(null)
const savingPrompt = ref(false)
const textConfigs = computed(() => configs.value.filter(c => c.type === 'text'))
const imageConfigs = computed(() => configs.value.filter(c => c.type === 'image'))
const videoConfigs = computed(() => configs.value.filter(c => c.type === 'video'))
const ttsConfigs = computed(() => configs.value.filter(c => c.type === 'tts'))

onMounted(async () => {
  await loadSettings()
  const pRes: any = await api.post('/api/prompt/list')
  prompts.value = pRes.data || []
})

async function loadSettings() {
  const res: any = await api.post('/api/setting/get')
  setting.value = res.data.setting || setting.value
  configs.value = res.data.configs || []
}

async function saveSetting() {
  await api.post('/api/setting/update', {
    textConfigId: setting.value.textConfigId,
    imageConfigId: setting.value.imageConfigId,
    videoConfigId: setting.value.videoConfigId,
    ttsConfigId: setting.value.ttsConfigId,
  })
  ElMessage.success('已保存')
}

async function saveOSS() {
  await api.post('/api/setting/update', {
    ossAccessKeyId: setting.value.ossAccessKeyId,
    ossAccessKeySecret: setting.value.ossAccessKeySecret,
    ossBucket: setting.value.ossBucket,
    ossRegion: setting.value.ossRegion,
    ossCustomDomain: setting.value.ossCustomDomain,
  })
  ElMessage.success('OSS 配置已保存')
}

function editModel(c: AIConfig) {
  editingModel.value = c
  Object.assign(modelForm, c)
  showAddModel.value = true
}

async function submitModel() {
  if (editingModel.value) {
    await api.post('/api/setting/updateModel', { id: editingModel.value.id, ...modelForm })
  } else {
    await api.post('/api/setting/addModel', modelForm)
  }
  showAddModel.value = false
  editingModel.value = null
  ElMessage.success('已保存')
  loadSettings()
}

async function deleteModel(id: number) {
  await ElMessageBox.confirm('确定删除该模型配置？')
  await api.post('/api/setting/deleteModel', { id })
  ElMessage.success('已删除')
  loadSettings()
}

async function testModel(id: number) {
  testing.value = true
  try {
    const res: any = await api.post('/api/setting/testModel', { configId: id })
    if (res.data.success) {
      if (res.data.imagePath) {
        testImageUrl.value = res.data.imagePath
        showTestImage.value = true
        ElMessage.success('生成成功')
      } else if (res.data.audioPath) {
        testTTSAudioUrl.value = res.data.audioPath
        testTTSLogs.value = res.data.logs || []
        testTTSSuccess.value = true
        showTestTTS.value = true
        ElMessage.success(res.data.message)
      } else {
        ElMessage.success(res.data.message)
      }
    } else {
      if (res.data.logs && res.data.logs.length) {
        testTTSAudioUrl.value = ''
        testTTSLogs.value = res.data.logs
        testTTSSuccess.value = false
        showTestTTS.value = true
      }
      ElMessage.warning(res.data.message)
    }
  } catch (err: any) {
    ElMessage.error(err.message || '测试出错')
  } finally { testing.value = false }
}

async function savePrompt(p: PromptItem) {
  await api.post('/api/prompt/update', { id: p.id, customValue: editPromptValue.value })
  p.customValue = editPromptValue.value
  editingPromptId.value = null
  ElMessage.success('已保存')
}

function openPromptDialog(p: PromptItem) {
  editingPrompt.value = p
  editingPromptId.value = p.id
  editPromptValue.value = p.customValue || p.defaultValue || ''
  showPromptDialog.value = true
}

async function savePromptFromDialog() {
  if (!editingPrompt.value) return
  savingPrompt.value = true
  try {
    await api.post('/api/prompt/update', { id: editingPrompt.value.id, customValue: editPromptValue.value })
    editingPrompt.value.customValue = editPromptValue.value
    showPromptDialog.value = false
    ElMessage.success('已保存')
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    savingPrompt.value = false
  }
}

async function resetPromptInDialog() {
  if (!editingPrompt.value) return
  try {
    await ElMessageBox.confirm('确定重置为默认提示词？')
    await api.post('/api/prompt/reset', { id: editingPrompt.value.id })
    editingPrompt.value.customValue = null
    editPromptValue.value = editingPrompt.value.defaultValue || ''
    ElMessage.success('已重置为默认值')
  } catch (e) {
    // 用户取消
  }
}

async function resetPrompt(p: PromptItem) {
  await api.post('/api/prompt/reset', { id: p.id })
  p.customValue = null
  if (editingPromptId.value === p.id) {
    editPromptValue.value = p.defaultValue || ''
  }
  ElMessage.success('已重置')
}

// --- 调试工具 ---
const debugTaskId = ref('')
const debugLoading = ref(false)
const debugResult = ref<any>(null)

async function queryExternalTask() {
  if (!debugTaskId.value.trim()) { ElMessage.warning('请输入任务 ID'); return }
  debugLoading.value = true
  debugResult.value = null
  try {
    const res: any = await api.post('/api/video/queryExternalTask', { taskId: debugTaskId.value.trim() })
    debugResult.value = res.data || res
  } catch (e: any) {
    ElMessage.error(e.message || '查询失败')
  } finally {
    debugLoading.value = false
  }
}
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-header h1 {
  font-size: 22px;
}

.current-models {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.model-slot label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.model-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.model-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.model-actions {
  display: flex;
  gap: 6px;
}

/* 提示词卡片网格 */
.prompt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.prompt-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.prompt-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.prompt-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.prompt-card-preview {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  flex: 1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.prompt-card-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

/* 提示词编辑弹窗 */
.prompt-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prompt-dialog-meta {
  display: flex;
  gap: 8px;
}

.prompt-editor-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.prompt-textarea :deep(textarea) {
  font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 通用 */
.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ml-8 {
  margin-left: 8px;
}

.mr-4 {
  margin-right: 4px;
}

.mb-16 {
  margin-bottom: 16px;
}

.mb-24 {
  margin-bottom: 24px;
}

.debug-result {
  margin-top: 16px;
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 8px;
  max-height: 500px;
  overflow: auto;
}

.debug-result pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}
</style>
