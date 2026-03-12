<template>
  <div class="workspace-layout">
    <!-- 左侧悬浮工具栏 -->
    <aside class="sidebar">
      <!-- 顶部操作区 -->
      <div class="sidebar-header">
        <el-button @click="$router.push('/projects')" circle title="返回项目列表">
          <el-icon><Back /></el-icon>
        </el-button>
        <h3 class="project-name" :title="appStore.currentProject?.name">
          {{ appStore.currentProject?.name || '项目' }}
        </h3>
      </div>

      <!-- 垂直导航 -->
      <nav class="sidebar-nav">
        <router-link v-for="item in navItems" :key="item.path" :to="`/workspace/${projectId}/${item.path}`"
          class="nav-item" :class="{ active: $route.path.includes(item.path) }">
          <span class="nav-step">{{ item.step }}</span>
          <el-icon class="nav-icon">
            <component :is="item.icon" />
          </el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>

      <!-- 底部设置按钮 -->
      <div class="sidebar-footer">
        <el-button @click="$router.push('/setting')" circle title="设置">
          <el-icon><Setting /></el-icon>
        </el-button>
      </div>
    </aside>

    <!-- 右侧内容区（全屏） -->
    <main class="main-content">
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
.workspace-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* 左侧悬浮工具栏 */
.sidebar {
  width: 80px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 100;
}

.sidebar-header {
  padding: 16px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.project-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--text-secondary);
  transition: all .2s;
  font-size: 12px;
  gap: 6px;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(99, 102, 241, .15);
  color: var(--accent);
}

.nav-step {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.nav-item.active .nav-step {
  background: rgba(99, 102, 241, .2);
}

.nav-icon {
  font-size: 18px;
}

.nav-label {
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
}

.sidebar-footer {
  padding: 16px 12px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: center;
}

/* 右侧内容区（全屏） */
.main-content {
  flex: 1;
  margin-left: 80px;
  overflow-y: auto;
  background: var(--bg-primary);
  padding: 24px;
  box-sizing: border-box;
}
</style>
