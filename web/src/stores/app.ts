import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Project } from '../types'

export const useAppStore = defineStore('app', () => {
    const token = ref(localStorage.getItem('token') || '')
    const currentProject = ref<Project | null>(null)

    function setToken(t: string) {
        token.value = t
        localStorage.setItem('token', t)
    }

    function clearToken() {
        token.value = ''
        localStorage.removeItem('token')
    }

    function setProject(p: Project | null) {
        currentProject.value = p
    }

    return { token, currentProject, setToken, clearToken, setProject }
}, {
    persist: {
        pick: ['token'],
    },
})
