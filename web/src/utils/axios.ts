import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const api = axios.create({
    baseURL: 'http://localhost:60000',
    timeout: 120000, // AI 调用可能较慢
})

// 请求拦截：注入 token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

// 响应拦截
api.interceptors.response.use(
    (res) => {
        const data = res.data
        if (data.code !== 0 && data.code !== undefined) {
            ElMessage.error(data.msg || '请求失败')
            return Promise.reject(new Error(data.msg))
        }
        return data
    },
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('token')
            router.push('/login')
            ElMessage.error('登录已过期')
        } else {
            ElMessage.error(err.message || '网络错误')
        }
        return Promise.reject(err)
    },
)

export default api
