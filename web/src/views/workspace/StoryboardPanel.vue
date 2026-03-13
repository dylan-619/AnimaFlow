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
        <el-button size="default" type="primary" @click="generateStoryboard" :loading="generating"
          :disabled="!selectedScriptId">生成分镜</el-button>
        <el-button size="default" @click="polishPrompts" :loading="polishing" :disabled="!shots.length">批量优化提示词</el-button>
        <el-button size="default" @click="generateImages" :loading="genImages" :disabled="!shots.length">批量生成图片</el-button>
        <el-button size="default" type="warning" @click="generateVideos" :loading="genVideos" :disabled="!shots.length">批量生成视频</el-button>
        <el-button size="default" type="success" @click="generateTTS" :loading="genTTS" :disabled="!shots.length">批量生成配音</el-button>
        <el-divider direction="vertical" />
        <el-button size="default" :type="selectMode ? 'warning' : 'info'" plain @click="toggleSelectMode" :disabled="!shots.length">
          {{ selectMode ? '取消选择' : '批量选择' }}
        </el-button>
        <el-button v-if="selectMode" size="default" type="danger" @click="batchDelete" :disabled="!selectedIds.length">
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
        
        <!-- 🔴 新增：历史图片选择 -->
        <div v-if="getHistoryImages(shot).length > 1" class="shot-history">
          <div class="history-label">历史图片 ({{ getHistoryImages(shot).length }})</div>
          <div class="history-grid">
            <div v-for="(imgPath, idx) in getHistoryImages(shot)" :key="idx"
              class="history-item"
              :class="{ 'is-selected': shot.filePath === imgPath }"
              @click="selectHistoryImage(shot, imgPath)">
              <img :src="`http://localhost:60000/uploads/${imgPath}`" />
              <div v-if="shot.filePath === imgPath" class="selected-badge">
                <el-icon><Check /></el-icon>
              </div>
            </div>
          </div>
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
            <!-- 说话者标签 -->
            <div v-if="shot.speaker" style="margin-bottom: 6px;">
              <el-tag :type="shot.speaker === '旁白' ? 'info' : 'primary'" size="small">
                {{ shot.speaker === '旁白' ? '🎙️ 旁白' : `👤 ${shot.speaker}` }}
              </el-tag>
            </div>
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
              <!-- 情绪选择器 -->
              <el-select v-model="shot.dubbingEmotion" size="small" placeholder="自动" style="width: 100px"
                @change="updateShot(shot)" clearable>
                <el-option value="" label="自动（继承角色）" />
                <el-option value="calm" label="中性" />
                <el-option value="happy" label="高兴" />
                <el-option value="sad" label="悲伤" />
                <el-option value="angry" label="愤怒" />
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
const genVideos = ref(false)
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
    // 🔴 修复：如果在选择模式下，只生成选中的分镜（允许重新生成）；否则生成所有未生成的
    let targetIds: number[]
    let skipExisting: boolean
    
    if (selectMode.value && selectedIds.value.length > 0) {
      // 批量选择模式：生成选中的分镜（包括已有图片的，允许重新生成）
      targetIds = selectedIds.value
      
      // 检查是否所有选中的分镜都有图片
      const allHaveImages = selectedIds.value.every(id => {
        const shot = shots.value.find(s => s.id === id)
        return shot && shot.filePath
      })
      
      if (allHaveImages) {
        // 如果都有图片，提示用户确认是否重新生成
        try {
          await ElMessageBox.confirm(
            '选中的分镜都已有图片，确定要重新生成吗？',
            '确认重新生成',
            { type: 'warning', confirmButtonText: '重新生成', cancelButtonText: '取消' }
          )
        } catch {
          // 用户取消
          return
        }
      }
      
      skipExisting = false // 允许重新生成已有图片的分镜
      ElMessage.info(`开始生成选中的 ${targetIds.length} 个分镜图片...`)
    } else {
      // 普通模式：只生成未生成的分镜
      targetIds = shots.value.filter(s => !s.filePath).map(s => s.id)
      
      if (!targetIds.length) {
        ElMessage.info('所有分镜已有图片')
        return
      }
      
      skipExisting = true // 跳过已有图片的分镜
    }
    
    const taskId = await taskStore.createTask(projectId, 'storyboard_image', { 
      storyboardIds: targetIds,
      skipExisting  // 🔴 新增：传递 skipExisting 参数
    })
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('图片生成完成')
    loadShots()
  } catch (e: any) { 
    if (e !== 'cancel') ElMessage.error(e.message) 
  }
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
    // 🔴 修复：如果在选择模式下，只生成选中的分镜；否则生成所有需要的分镜
    let targetIds: number[]
    
    if (selectMode.value && selectedIds.value.length > 0) {
      // 批量选择模式：生成选中的分镜（需要有台词和音色）
      targetIds = selectedIds.value.filter(id => {
        const shot = shots.value.find(s => s.id === id)
        return shot && shot.dubbingText && shot.dubbingVoice
      })
      
      if (!targetIds.length) {
        ElMessage.info('选中的分镜需要填写台词并选择音色')
        return
      }
      
      ElMessage.info(`开始生成选中的 ${targetIds.length} 个分镜配音...`)
    } else {
      // 普通模式：生成所有需要的分镜
      targetIds = shots.value.filter(s => s.dubbingText && s.dubbingVoice && !s.audioPath).map(s => s.id)
      
      if (!targetIds.length) {
        ElMessage.info('没有需要生成配音的分镜（需填写台词并选择音色）')
        return
      }
    }
    
    const taskId = await taskStore.createTask(projectId, 'storyboard_tts', { storyboardIds: targetIds })
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('配音批量生成完成')
    loadShots()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { genTTS.value = false }
}

// 🔴 新增：批量生成视频
async function generateVideos() {
  genVideos.value = true
  try {
    // 如果在选择模式下，只生成选中的分镜；否则生成所有需要的分镜
    let targetIds: number[]
    
    if (selectMode.value && selectedIds.value.length > 0) {
      // 批量选择模式：生成选中的分镜（需要有图片）
      targetIds = selectedIds.value.filter(id => {
        const shot = shots.value.find(s => s.id === id)
        return shot && shot.filePath // 需要有图片才能生成视频
      })
      
      if (!targetIds.length) {
        ElMessage.info('选中的分镜需要先生成图片')
        return
      }
      
      ElMessage.info(`开始生成选中的 ${targetIds.length} 个分镜视频...`)
    } else {
      // 普通模式：生成所有有图片的分镜
      targetIds = shots.value.filter(s => s.filePath).map(s => s.id)
      
      if (!targetIds.length) {
        ElMessage.info('没有需要生成视频的分镜（需先生成图片）')
        return
      }
    }
    
    // 调用后端批量生成视频接口
    const res: any = await api.post('/api/batch/videos', {
      projectId,
      storyboardIds: targetIds,
      skipExisting: !selectMode.value, // 批量选择模式下不跳过已有视频
      concurrency: 2 // 视频生成并行度较低
    })
    
    if (res.data?.taskIds?.length) {
      ElMessage.success(`已创建 ${res.data.taskIds.length} 个视频生成任务`)
      // 监听第一个任务的状态
      currentTaskId.value = res.data.taskIds[0]
    } else {
      ElMessage.info(res.data?.message || '没有需要生成视频的分镜')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '批量生成视频失败')
  } finally {
    genVideos.value = false
  }
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
  await api.post('/api/storyboard/update', { id: shot.id, shotPrompt: shot.shotPrompt, shotAction: shot.shotAction, dubbingText: shot.dubbingText, dubbingVoice: shot.dubbingVoice, dubbingEmotion: shot.dubbingEmotion, speaker: shot.speaker, shotDuration: shot.shotDuration, cameraMovement: shot.cameraMovement })
}

// 🔴 新增：获取历史图片数组（兼容新旧格式）
function getHistoryImages(shot: StoryboardShot): string[] {
  try {
    const history = shot.history || '[]'
    const parsed = JSON.parse(history)
    // 新格式：对象数组 [{fileName: "xxx", publicUrl: "..."}]
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && 'fileName' in parsed[0]) {
      return parsed.map((h: any) => h.fileName)
    }
    // 旧格式：字符串数组 ["xxx", "yyy"]
    return parsed
  } catch (e) {
    return []
  }
}

// 🔴 新增：选择使用某张历史图片
async function selectHistoryImage(shot: StoryboardShot, imgPath: string) {
  // 如果选择的是当前图片，不做任何操作
  if (shot.filePath === imgPath) return
  
  // 调用接口更新
  await api.post('/api/storyboard/select-image', {
    id: shot.id,
    filePath: imgPath
  })
  
  // 更新本地数据
  const index = shots.value.findIndex(s => s.id === shot.id)
  if (index !== -1) {
    shots.value[index].filePath = imgPath
  }
  
  ElMessage.success('已切换使用图片')
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

.shot-history {
  width: 200px;
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.history-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  font-weight: 500;
}

.history-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.history-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.history-item:hover {
  border-color: var(--accent);
  transform: scale(1.05);
}

.history-item.is-selected {
  border-color: var(--success);
}

.history-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.selected-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  background: var(--success);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
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
