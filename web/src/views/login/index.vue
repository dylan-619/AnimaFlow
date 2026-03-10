<template>
  <div class="login-page flex-center">
    <div class="login-card">
      <div class="login-header">
        <h1 class="logo">🎬 Anime</h1>
        <p class="subtitle">AI 短剧创作工作台</p>
      </div>
      <el-form :model="form" @submit.prevent="handleLogin" class="login-form">
        <el-form-item>
          <el-input v-model="form.name" placeholder="用户名" prefix-icon="User" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" placeholder="密码" type="password" prefix-icon="Lock" size="large" show-password />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" @click="handleLogin" style="width:100%">
          登 录
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../../utils/axios'
import { useAppStore } from '../../stores/app'

const router = useRouter()
const appStore = useAppStore()
const form = ref({ name: 'admin', password: 'admin123' })
const loading = ref(false)

async function handleLogin() {
  if (!form.value.name || !form.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    const res: any = await api.post('/api/auth/login', form.value)
    appStore.setToken(res.data.token)
    ElMessage.success('登录成功')
    router.push('/projects')
  } catch { /* axios 拦截器已处理 */ }
  finally { loading.value = false }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
}
.login-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 48px 40px;
  width: 400px;
  box-shadow: 0 25px 50px rgba(0,0,0,0.5);
}
.login-header { text-align: center; margin-bottom: 32px; }
.logo { font-size: 28px; color: var(--accent); }
.subtitle { color: var(--text-secondary); margin-top: 8px; font-size: 14px; }
.login-form :deep(.el-input__wrapper) { border-radius: 8px; }
</style>
