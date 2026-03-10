<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="flex-center"><el-icon class="mr-8">
          <VideoCamera />
        </el-icon> 分镜</h2>
      <div class="header-actions">
        <el-select v-model="selectedScriptId" placeholder="选择剧本" size="default" style="width:200px">
          <el-option v-for="s in scripts" :key="s.id" :label="s.name || `#${s.id}`" :value="s.id" />
        </el-select>
        <el-button type="primary" @click="generateStoryboard" :loading="generating"
          :disabled="!selectedScriptId">生成分镜</el-button>
        <el-button @click="polishPrompts" :loading="polishing" :disabled="!shots.length">批量优化提示词</el-button>
        <el-button @click="generateImages" :loading="genImages" :disabled="!shots.length">批量生成图片</el-button>
        <el-button type="success" @click="generateTTS" :loading="genTTS" :disabled="!shots.length">批量生成配音</el-button>
        <el-divider direction="vertical" />
        <el-button :type="selectMode ? 'warning' : 'info'" plain @click="toggleSelectMode" :disabled="!shots.length">
          {{ selectMode ? '取消选择' : '批量选择' }}
        </el-button>
        <el-button v-if="selectMode" type="danger" @click="batchDelete" :disabled="!selectedIds.length">
          删除选中 ({{ selectedIds.length }})
        </el-button>
      </div>
    </div>
    <TaskProgress :visible="!!currentTaskId" :taskId="currentTaskId" @close="currentTaskId = ''" />

    <div v-if="shots.length" class="shot-list mt-16">
      <div v-for="shot in shots" :key="shot.id" class="shot-card"
        :class="{ 'is-selected': selectMode && selectedIds.includes(shot.id) }">
        <el-checkbox v-if="selectMode" :model-value="selectedIds.includes(shot.id)" @change="toggleSelect(shot.id)"
          class="shot-checkbox" />
        <div class="shot-img-box" @click="openImageModal(shot)">
          <img v-if="shot.filePath" :src="`http://localhost:60000/uploads/${shot.filePath}`" />
          <div v-else class="img-placeholder">点击生成</div>
        </div>
        <div class="shot-info">
          <div class="shot-header">
            <el-tag size="small">S{{ shot.segmentIndex }}-{{ shot.shotIndex }}</el-tag>
            <span class="seg-desc">{{ shot.segmentDesc }}</span>
            <div class="ml-auto" style="display:flex;gap:4px;">
              <el-button type="primary" link size="small" @click="openImageModal(shot)">
                <el-icon class="mr-4">
                  <Picture />
                </el-icon>生成图片
              </el-button>
              <el-button type="warning" link size="small" @click="openVideoModal(shot)" :disabled="!shot.filePath">
                <el-icon class="mr-4">
                  <Film />
                </el-icon>生成视频
              </el-button>
              <el-button type="success" link size="small" @click="generateSingleTTS(shot)"
                :disabled="!shot.dubbingText || !shot.dubbingVoice">
                <el-icon class="mr-4">
                  <Microphone />
                </el-icon>生成配音
              </el-button>
            </div>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <el-input-number v-model="shot.shotDuration" :min="1" :max="30" size="small" @change="updateShot(shot)"
              style="width: 120px" controls-position="right" placeholder="时长(秒)" title="预估时长(秒)" />
            <el-input v-model="shot.cameraMovement" size="small" @blur="updateShot(shot)"
              placeholder="运镜指令（如：静止、推镜头、跟拍等）" style="flex: 1;" />
          </div>
          <el-input v-model="shot.shotAction" type="textarea" :rows="2" size="small" @blur="updateShot(shot)"
            placeholder="主体动作" style="margin-bottom: 8px;" />
          <el-input v-model="shot.shotPrompt" type="textarea" :rows="3" size="small" @blur="updateShot(shot)"
            placeholder="镜头描述" />
          <div v-if="shot.polishedPrompt" class="polished-prompt-section mt-8">
            <div class="polished-label">
              <span>润色后提示词</span>
              <el-button link type="primary" size="small" @click="copyPolishedPrompt(shot.polishedPrompt)">
                复制
              </el-button>
            </div>
            <div class="polished-content">{{ shot.polishedPrompt }}</div>
          </div>
          <div v-if="shot.dubbingText !== null" class="mt-12">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <el-select v-model="shot.dubbingVoice" size="small" placeholder="无配音" style="width: 140px"
                @change="updateShot(shot)">
                <el-option value="" label="静音（无配音）" />
                <el-option-group label="OpenAI API 通用">
                  <el-option value="alloy" label="Alloy (通用中性)" />
                  <el-option value="echo" label="Echo (清朗男声)" />
                  <el-option value="fable" label="Fable (活泼男声)" />
                  <el-option value="onyx" label="Onyx (深沉男声)" />
                  <el-option value="nova" label="Nova (知性女声)" />
                  <el-option value="shimmer" label="Shimmer (柔和女声)" />
                </el-option-group>
                <el-option-group label="MiniMax 国内版">
                  <el-option value="male-qn-qingse" label="青涩男声" />
                  <el-option value="female-shaonv" label="元气少女" />
                  <el-option value="male-qn-jingying" label="精英男声" />
                  <el-option value="female-yujie" label="气质御姐" />
                  <el-option value="audiobook_male_2" label="男播音员" />
                  <el-option value="audiobook_female_1" label="女播音员" />
                </el-option-group>
              </el-select>
              <audio v-if="shot.audioPath" :src="`http://localhost:60000/uploads/${shot.audioPath}`" controls
                style="height: 24px; flex: 1" />
            </div>
            <el-input v-model="shot.dubbingText" size="small" @blur="updateShot(shot)" placeholder="台词">
              <template #prepend><el-icon>
                  <Microphone />
                </el-icon></template>
            </el-input>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else-if="selectedScriptId && !generating" description="暂无分镜，请点击生成" />

    <!-- 分镜图片生成模态框 -->
    <StoryboardImageModal v-model="showImageModal" :shot="currentShot" @update="loadShots" />

    <!-- 视频生成模态框 -->
    <VideoGeneratorModal v-model="showVideoModal" :scriptId="selectedScriptId ?? undefined" :projectId="projectId"
      :preSelectedShot="currentVideoShot" />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoCamera, Picture, Film, Microphone } from '@element-plus/icons-vue'
import api from '../../utils/axios'
import TaskProgress from '../../components/TaskProgress.vue'
import StoryboardImageModal from '../../components/storyboard/StoryboardImageModal.vue'
import VideoGeneratorModal from '../../components/video/VideoGeneratorModal.vue'
import { useTaskStore } from '../../stores/task'
import type { Script, StoryboardShot } from '../../types'

const route = useRoute()
const projectId = Number(route.params.projectId)
const taskStore = useTaskStore()
const scripts = ref<Script[]>([])
const shots = ref<StoryboardShot[]>([])
const selectedScriptId = ref<number | null>(null)
const generating = ref(false)
const genImages = ref(false)
const genTTS = ref(false)
const polishing = ref(false)
const currentTaskId = ref('')
const selectMode = ref(false)
const selectedIds = ref<number[]>([])

// 模态框状态
const showImageModal = ref(false)
const currentShot = ref<StoryboardShot | undefined>(undefined)
const showVideoModal = ref(false)
const currentVideoShot = ref<StoryboardShot | undefined>(undefined)

onMounted(async () => {
  const res: any = await api.post('/api/script/list', { projectId })
  scripts.value = (res.data || []).filter((s: Script) => s.content)
  if (scripts.value.length) selectedScriptId.value = scripts.value[0].id
})

watch(selectedScriptId, loadShots)

async function loadShots() {
  if (!selectedScriptId.value) return
  const res: any = await api.post('/api/storyboard/list', { scriptId: selectedScriptId.value })
  shots.value = res.data || []
}

async function generateStoryboard() {
  generating.value = true
  try {
    const taskId = await taskStore.createTask(projectId, 'storyboard', { scriptId: selectedScriptId.value })
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('分镜生成完成')
    loadShots()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { generating.value = false }
}

async function generateImages() {
  genImages.value = true
  try {
    const ids = shots.value.filter(s => !s.filePath).map(s => s.id)
    if (!ids.length) { ElMessage.info('所有分镜已有图片'); return }
    const taskId = await taskStore.createTask(projectId, 'storyboard_image', { storyboardIds: ids })
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('图片生成完成')
    loadShots()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { genImages.value = false }
}

async function polishPrompts() {
  polishing.value = true
  try {
    // 如果在选择模式下，只优化选中的分镜；否则优化所有分镜
    const targetIds = selectMode.value && selectedIds.value.length > 0
      ? selectedIds.value
      : shots.value.map(s => s.id)

    if (!targetIds.length) {
      ElMessage.info('没有可优化的分镜')
      return
    }

    ElMessage.info(`开始优化 ${targetIds.length} 个分镜的提示词...`)

    let successCount = 0
    let failCount = 0

    // 逐个调用润色接口
    for (let i = 0; i < targetIds.length; i++) {
      const shotId = targetIds[i]
      try {
        const res: any = await api.post('/api/storyboard/polishPrompt', { storyboardId: shotId })
        const polishedPrompt = res.data?.polishedPrompt || ''

        // 保存润色后的提示词到数据库
        await api.post('/api/storyboard/update', { id: shotId, polishedPrompt })
        successCount++
      } catch (e: any) {
        console.error(`分镜 ${shotId} 优化失败:`, e.message)
        failCount++
      }
    }

    // 刷新分镜列表
    await loadShots()

    if (failCount === 0) {
      ElMessage.success(`成功优化 ${successCount} 个分镜的提示词`)
    } else {
      ElMessage.warning(`优化完成：成功 ${successCount} 个，失败 ${failCount} 个`)
    }
  } catch (e: any) {
    ElMessage.error(e.message || '批量优化失败')
  } finally {
    polishing.value = false
  }
}

async function generateTTS() {
  genTTS.value = true
  try {
    const ids = shots.value.filter(s => s.dubbingText && s.dubbingVoice && !s.audioPath).map(s => s.id)
    if (!ids.length) { ElMessage.info('没有需要生成配音的分镜（需填写台词并选择音色）'); return }
    const taskId = await taskStore.createTask(projectId, 'storyboard_tts', { storyboardIds: ids })
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('配音批量生成完成')
    loadShots()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { genTTS.value = false }
}

async function generateSingleTTS(shot: StoryboardShot) {
  if (!shot.dubbingText || !shot.dubbingVoice) {
    ElMessage.warning('请先填写台词并选择音色')
    return
  }
  try {
    const taskId = await taskStore.createTask(projectId, 'storyboard_tts', { storyboardIds: [shot.id] })
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('配音生成完成')
    loadShots()
  } catch (e: any) {
    ElMessage.error(e.message || '生成配音失败')
  }
}

async function updateShot(shot: StoryboardShot) {
  await api.post('/api/storyboard/update', { id: shot.id, shotPrompt: shot.shotPrompt, shotAction: shot.shotAction, dubbingText: shot.dubbingText, dubbingVoice: shot.dubbingVoice, shotDuration: shot.shotDuration, cameraMovement: shot.cameraMovement })
}

function openImageModal(shot: StoryboardShot) {
  currentShot.value = shot
  showImageModal.value = true
}

function openVideoModal(shot: StoryboardShot) {
  currentVideoShot.value = shot
  showVideoModal.value = true
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  selectedIds.value = []
}

function toggleSelect(id: number) {
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) selectedIds.value.push(id)
  else selectedIds.value.splice(idx, 1)
}

async function batchDelete() {
  if (!selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 个分镜？删除后不可恢复。`, '确认删除', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
    await api.post('/api/storyboard/batchDelete', { ids: selectedIds.value })
    ElMessage.success(`已删除 ${selectedIds.value.length} 个分镜`)
    selectedIds.value = []
    selectMode.value = false
    loadShots()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

function copyPolishedPrompt(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
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

.shot-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shot-card {
  display: flex;
  gap: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  padding: 12px;
}

.shot-img-box {
  width: 200px;
  min-height: 120px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.shot-img-box:hover {
  box-shadow: 0 0 0 2px var(--accent);
}

.shot-img-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.img-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.shot-info {
  flex: 1;
}

.shot-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.seg-desc {
  color: var(--text-secondary);
  font-size: 12px;
}

.shot-checkbox {
  flex-shrink: 0;
  margin-right: 4px;
}

.shot-card.is-selected {
  border-color: var(--el-color-danger);
  background: rgba(245, 108, 108, 0.04);
}

.polished-prompt-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
}

.polished-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.polished-content {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
