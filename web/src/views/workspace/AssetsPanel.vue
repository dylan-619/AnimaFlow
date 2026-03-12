<template>
  <div class="panel">
    <div class="panel-header">
      <h2 class="flex-center"><el-icon class="mr-8">
          <Picture />
        </el-icon> 资产</h2>
      <div class="header-actions">
        <el-button type="primary" @click="extractAssets" :loading="extracting">提取资产</el-button>
        <el-button @click="batchGenImages" :loading="batchGenerating">批量生成图片</el-button>
        <el-button @click="batchPolishPrompts" :loading="batchPolishing">批量优化提示词</el-button>
        <el-button type="danger" plain @click="batchDelete" :loading="batchDeleting">批量删除</el-button>
      </div>
    </div>
    <TaskProgress :visible="!!currentTaskId" :taskId="currentTaskId" @close="onTaskClose" />

    <el-tabs v-model="activeTab" class="mt-16">
      <el-tab-pane label="角色" name="role" />
      <el-tab-pane label="场景" name="scene" />
      <el-tab-pane label="道具" name="props" />
    </el-tabs>

    <div v-if="filteredAssets.length" class="mt-16">
      <el-table :data="filteredAssets" style="width: 100%" @selection-change="handleSelectionChange" border>
        <el-table-column type="selection" width="50" align="center" />

        <el-table-column label="参考图" width="100" align="center">
          <template #default="{ row }">
            <el-image v-if="row.filePath" :src="`http://localhost:60000/uploads/${row.filePath}`"
              style="width: 60px; height: 60px; border-radius: 4px;" fit="cover"
              :preview-src-list="[`http://localhost:60000/uploads/${row.filePath}`]" preview-teleported />
            <div v-else
              style="width: 60px; height: 60px; background: var(--bg-secondary); border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: var(--text-secondary);">
              暂无</div>
          </template>
        </el-table-column>

        <el-table-column label="资产名称" width="160">
          <template #default="{ row }">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">{{ row.name }}</div>
            <el-tag v-if="row.isMasterReference" size="small" type="success">主参考图</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="资产描述" min-width="260">
          <template #default="{ row }">
            <el-input v-model="row.intro" type="textarea" :rows="2" size="small" @blur="updateAsset(row)"
              placeholder="请输入内容..." />
          </template>
        </el-table-column>

        <!-- 配音音色列（仅角色Tab显示） -->
        <el-table-column v-if="activeTab === 'role'" label="配音音色" width="160" align="center">
          <template #default="{ row }">
            <el-select v-model="row.voiceType" size="small" placeholder="未设置" style="width: 140px"
              @change="updateAsset(row)" clearable>
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
          </template>
        </el-table-column>

        <!-- 默认情绪列（仅角色Tab显示） -->
        <el-table-column v-if="activeTab === 'role'" label="默认情绪" width="120" align="center">
          <template #default="{ row }">
            <el-select v-model="row.defaultEmotion" size="small" placeholder="自动" style="width: 100px"
              @change="updateAsset(row)" clearable>
              <el-option value="" label="自动（calm）" />
              <el-option value="calm" label="中性" />
              <el-option value="happy" label="高兴" />
              <el-option value="sad" label="悲伤" />
              <el-option value="angry" label="愤怒" />
            </el-select>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="openGenModal(row)">
              <el-icon class="mr-4">
                <Brush />
              </el-icon>详 情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <!-- 编辑/生成弹窗 -->
    <ImageGeneratorModal v-if="selectedAsset" v-model="showGenModal" :asset="selectedAsset" @update="load" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../../utils/axios'
import { useTaskStore } from '../../stores/task'
import TaskProgress from '../../components/TaskProgress.vue'
import ImageGeneratorModal from '../../components/assets/ImageGeneratorModal.vue'
import type { Asset } from '../../types'

const route = useRoute()
const projectId = Number(route.params.projectId)
const taskStore = useTaskStore()
const assets = ref<Asset[]>([])
const activeTab = ref('role')
const extracting = ref(false)
const batchGenerating = ref(false)
const batchPolishing = ref(false)
const batchDeleting = ref(false)
const currentTaskId = ref('')
const selectedAssets = ref<Asset[]>([])

const showGenModal = ref(false)
const selectedAsset = ref<Asset | undefined>(undefined)

const filteredAssets = computed(() => assets.value.filter(a => a.type === activeTab.value))

onMounted(load)

async function load() {
  const res: any = await api.post('/api/assets/list', { projectId })
  assets.value = res.data || []
  selectedAssets.value = [] // 重新加载后清空已选列表
}

function handleSelectionChange(val: Asset[]) {
  selectedAssets.value = val
}

async function extractAssets() {
  extracting.value = true
  try {
    const taskId = await taskStore.createTask(projectId, 'assets_extract')
    currentTaskId.value = taskId
    await taskStore.waitForTask(taskId)
    ElMessage.success('资产提取完成')
    load()
  } catch (e: any) { ElMessage.error(e.message) }
  finally { extracting.value = false }
}

async function updateAsset(a: Asset) {
  await api.post('/api/assets/update', { id: a.id, intro: a.intro, prompt: a.prompt, voiceType: a.voiceType, defaultEmotion: a.defaultEmotion, isMasterReference: a.isMasterReference })
}

function openGenModal(a: Asset) {
  selectedAsset.value = a
  showGenModal.value = true
}

async function batchGenImages() {
  if (!selectedAssets.value.length) {
    ElMessage.warning('请勾选需要生成图片的资产')
    return
  }
  batchGenerating.value = true
  try {
    for (const a of selectedAssets.value) {
      if (!a.filePath) {
        const taskId = await taskStore.createTask(projectId, 'asset_image', { assetId: a.id })
        currentTaskId.value = taskId
        await taskStore.waitForTask(taskId)
      }
    }
    load()
    ElMessage.success('批量生成完成')
  } catch (e: any) {
    ElMessage.error(e.message || '批量生成失败')
  } finally { batchGenerating.value = false }
}

async function batchPolishPrompts() {
  if (!selectedAssets.value.length) {
    ElMessage.warning('请勾选需要优化提示词的资产')
    return
  }
  batchPolishing.value = true
  try {
    for (const a of selectedAssets.value) {
      await api.post('/api/assets/polishPrompt', { assetId: a.id })
    }
    ElMessage.success('批量优化提示词完成')
    load()
  } catch (e: any) {
    ElMessage.error(e.message || '优化失败')
  } finally {
    batchPolishing.value = false
  }
}

async function batchDelete() {
  if (!selectedAssets.value.length) {
    ElMessage.warning('请勾选需要删除的资产')
    return
  }
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selectedAssets.value.length} 个资产吗？`, '确认删除', { type: 'warning' })
    batchDeleting.value = true
    const ids = selectedAssets.value.map(a => a.id)
    await api.post('/api/assets/delete', { ids })
    ElMessage.success('选中资产已删除')
    load()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message)
  } finally {
    batchDeleting.value = false
  }
}

function onTaskClose() { currentTaskId.value = '' }
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
}
</style>
