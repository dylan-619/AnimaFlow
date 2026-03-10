<template>
  <div class="workspace page-container">
    <!-- 顶部标题栏 -->
    <div class="page-header">
      <div class="flex-center gap-12">
        <el-button @click="$router.push('/projects')"><el-icon class="mr-4">
            <Back />
          </el-icon>返回</el-button>
        <h2 style="font-size: 20px;">{{ appStore.currentProject?.name || '项目' }}</h2>
      </div>
      <el-button @click="$router.push('/setting')"><el-icon class="mr-4">
          <Setting />
        </el-icon>设置</el-button>
    </div>

    <!-- 顶部分步导航 -->
    <nav class="ws-nav mt-24">
      <router-link v-for="item in navItems" :key="item.path" :to="`/workspace/${projectId}/${item.path}`"
        class="nav-item" :class="{ active: $route.path.includes(item.path) }">
        <span class="nav-step">STEP {{ item.step }}</span>
        <el-icon class="nav-icon">
          <component :is="item.icon" />
        </el-icon>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- 主体内容 -->
    <main class="ws-content mt-16">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../utils/axios'
import { useAppStore } from '../../stores/app'

const route = useRoute()
const appStore = useAppStore()
const projectId = route.params.projectId as string

const navItems = [
  { path: 'novel', label: '原著', icon: 'Notebook', step: '1' },
  { path: 'storyline', label: '故事线', icon: 'Connection', step: '2' },
  { path: 'outline', label: '大纲', icon: 'List', step: '3' },
  { path: 'assets', label: '资产', icon: 'User', step: '4' },
  { path: 'script', label: '剧本', icon: 'EditPen', step: '5' },
  { path: 'storyboard', label: '分镜', icon: 'Picture', step: '6' },
  { path: 'video', label: '视频', icon: 'Film', step: '7' },
  { path: 'composite', label: '合成', icon: 'VideoCamera', step: '8' },
]

onMounted(async () => {
  if (!appStore.currentProject || appStore.currentProject.id !== Number(projectId)) {
    const res: any = await api.post('/api/project/detail', { id: Number(projectId) })
    appStore.setProject(res.data)
  }
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ws-nav {
  display: flex;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  gap: 8px;
  overflow-x: auto;
}

.nav-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 12px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--text-secondary);
  transition: all .2s;
  font-size: 14px;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(99, 102, 241, .15);
  color: var(--accent);
}

.nav-icon {
  font-size: 16px;
}

.nav-step {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.nav-item.active .nav-step {
  background: rgba(99, 102, 241, .2);
}

.nav-label {
  font-weight: 500;
  white-space: nowrap;
}

.ws-content {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  min-height: calc(100vh - 200px);
}
</style>
