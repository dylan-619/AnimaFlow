<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="flex-center"><el-icon class="mr-8">
          <Film />
        </el-icon> 视频</h2>
      <div class="header-actions">
        <el-select v-model="selectedScriptId" placeholder="选择剧本" size="default" style="width:200px">
          <el-option v-for="s in scripts" :key="s.id" :label="s.name || `#${s.id}`" :value="s.id" />
        </el-select>
        <el-button type="primary" @click="openGenerateModal" :disabled="!selectedScriptId">
          <el-icon class="mr-4">
            <Plus />
          </el-icon> 新建视频任务
        </el-button>
        <el-button type="success" @click="batchGenerate" :disabled="!selectedScriptId" :loading="batchLoading">
          <el-icon class="mr-4">
            <VideoCamera />
          </el-icon> 一键生成
        </el-button>
      </div>
    </div>

    <!-- 视频配置列表 -->
    <div v-if="configs.length" class="config-list mt-16">
      <div v-for="vc in configs" :key="vc.id" class="config-card">
        <div class="config-top">
          <!-- 首帧预览 -->
          <div class="frame-preview">
            <img v-if="vc.startFrame" :src="`http://localhost:60000/uploads/${vc.startFrame}`" />
            <div v-else class="no-frame">无首帧</div>
          </div>
          <div class="config-body">
            <div class="config-info">
              <div class="config-tags">
                <el-tag v-if="vc.storyboard" size="small">
                  S{{ vc.storyboard.segmentIndex }}-{{ vc.storyboard.shotIndex }}
                </el-tag>
                <el-tag size="small" type="info">{{ vc.duration }}s</el-tag>
                <el-tag size="small" :type="vc.mode === 'single' ? 'warning' : 'success'">
                  {{ vc.mode === 'single' ? '图生视频' : '纯文本' }}
                </el-tag>
              </div>
              <p class="config-prompt">{{ vc.prompt || '无提示词' }}</p>
            </div>
            <div class="config-actions">
              <el-button size="small" type="danger" @click="deleteConfig(vc.id)">删除</el-button>
            </div>
          </div>
        </div>
        <!-- 已生成的视频 -->
        <div v-if="videoResults[vc.id]?.length" class="video-results">
          <div v-for="v in videoResults[vc.id]" :key="v.id" class="video-item">
            <video v-if="v.state === 1 && v.filePath" :src="`http://localhost:60000/uploads/${v.filePath}`" controls
              class="video-player" />
            <el-tag v-else-if="v.state === 0" type="warning">生成中...</el-tag>
            <el-tag v-else-if="v.state === -1" type="danger">失败: {{ v.errorReason }}</el-tag>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else-if="selectedScriptId" description="暂无视频任务，请点击新建" />

    <!-- 批量生成进度 -->
    <el-alert v-if="batchProgress" type="info" show-icon class="mt-16" :closable="false">
      <span>{{ batchProgress }}</span>
    </el-alert>

    <!-- 视频生成模态框 -->
    <VideoGeneratorModal v-model="showGenModal" :scriptId="selectedScriptId ?? undefined" :projectId="projectId"
      @update="loadConfigs" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoCamera } from '@element-plus/icons-vue'
import api from '../../utils/axios'
import { useAppStore } from '../../stores/app'
import VideoGeneratorModal from '../../components/video/VideoGeneratorModal.vue'
import type { Script, VideoConfig, VideoResult, StoryboardShot } from '../../types'

const appStore = useAppStore()

const route = useRoute()
const projectId = Number(route.params.projectId)
const scripts = ref<Script[]>([])
const selectedScriptId = ref<number | null>(null)
const configs = ref<VideoConfig[]>([])
const videoResults = ref<Record<number, VideoResult[]>>({})
const showGenModal = ref(false)
const batchLoading = ref(false)
const batchProgress = ref('')

onMounted(async () => {
  const res: any = await api.post('/api/script/list', { projectId })
  scripts.value = (res.data || []).filter((s: Script) => s.content)
  if (scripts.value.length) selectedScriptId.value = scripts.value[0].id
})

watch(selectedScriptId, loadConfigs)

async function loadConfigs() {
  if (!selectedScriptId.value) return
  const res: any = await api.post('/api/video/listConfigs', { scriptId: selectedScriptId.value })
  configs.value = res.data || []
  for (const vc of configs.value) {
    const vRes: any = await api.post('/api/video/listResults', { configId: vc.id })
    videoResults.value[vc.id] = vRes.data || []
  }
}

function openGenerateModal() {
  showGenModal.value = true
}

async function deleteConfig(id: number) {
  await ElMessageBox.confirm('确定删除该视频任务及结果？')
  await api.post('/api/video/deleteConfig', { id })
  ElMessage.success('已删除')
  loadConfigs()
}

/** 一键为所有有分镜图且无成功视频的分镜生成视频 */
async function batchGenerate() {
  if (!selectedScriptId.value) return
  const confirmed = await ElMessageBox.confirm(
    '将为所有有分镜图且无成功视频的分镜自动创建视频任务，是否继续？',
    '一键生成',
    { type: 'info' }
  ).catch(() => false)
  if (!confirmed) return

  batchLoading.value = true
  batchProgress.value = '正在分析分镜...'

  try {
    // 1. 获取所有分镜
    const shotRes: any = await api.post('/api/storyboard/list', { scriptId: selectedScriptId.value })
    const allShots: StoryboardShot[] = shotRes.data || []
    const shotsWithImage = allShots.filter(s => s.filePath)

    if (!shotsWithImage.length) {
      ElMessage.warning('没有已生成图片的分镜，请先生成分镜图')
      return
    }

    // 2. 过滤已有成功视频的分镜
    const needGenerate: StoryboardShot[] = []
    for (const shot of shotsWithImage) {
      const vRes: any = await api.post('/api/video/listByStoryboard', { storyboardId: shot.id })
      const hasSuccess = (vRes.data || []).some((v: VideoResult) => v.state === 1 && v.filePath)
      if (!hasSuccess) needGenerate.push(shot)
    }

    if (!needGenerate.length) {
      ElMessage.success('所有分镜都已有成功视频，无需生成')
      return
    }

    const ratio = appStore.currentProject?.videoRatio || '16:9'

    // 3. 逐个创建视频任务
    for (let i = 0; i < needGenerate.length; i++) {
      const shot = needGenerate[i]
      batchProgress.value = `[${i + 1}/${needGenerate.length}] S${shot.segmentIndex}-${shot.shotIndex} 正在创建任务...`

      try {
        // 创建配置
        const createRes: any = await api.post('/api/video/createConfig', {
          scriptId: selectedScriptId.value,
          projectId,
          storyboardId: shot.id,
          startFrame: shot.filePath,
          prompt: shot.videoPrompt || [
            shot.shotPrompt ? `场景：${shot.shotPrompt}` : '',
            shot.shotAction ? `动作：${shot.shotAction}` : '',
            shot.cameraMovement ? `运镜：${shot.cameraMovement}` : ''
          ].filter(Boolean).join('；'),
          duration: 5,
          ratio,
          mode: 'single',
        })
        const configId = createRes.data.id

        // 提交生成任务
        const taskRes: any = await api.post('/api/task/create', {
          type: 'video',
          projectId,
          input: { videoConfigId: configId },
        })

        batchProgress.value = `[${i + 1}/${needGenerate.length}] S${shot.segmentIndex}-${shot.shotIndex} 已提交 (taskId: ${taskRes.data.taskId})`
      } catch (e: any) {
        console.error(`批量生成 S${shot.segmentIndex}-${shot.shotIndex} 失败:`, e.message)
      }
    }

    batchProgress.value = `✅ 已提交 ${needGenerate.length} 个视频任务，视频将在后台生成`
    ElMessage.success(`已提交 ${needGenerate.length} 个视频生成任务`)
    loadConfigs()
  } catch (e: any) {
    ElMessage.error(e.message || '批量生成失败')
  } finally {
    batchLoading.value = false
    setTimeout(() => { batchProgress.value = '' }, 10000)
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

.config-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}

.config-top {
  display: flex;
  gap: 16px;
}

.frame-preview {
  width: 160px;
  height: 100px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}

.frame-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-frame {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.config-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.config-tags {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.config-prompt {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.config-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.video-results {
  margin-top: 12px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.video-player {
  width: 320px;
  border-radius: 8px;
}
</style>
