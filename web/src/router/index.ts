import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '../stores/app'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/login',
            name: 'Login',
            component: () => import('../views/login/index.vue'),
        },
        {
            path: '/projects',
            name: 'Projects',
            component: () => import('../views/project/index.vue'),
        },
        {
            path: '/workspace/:projectId',
            name: 'Workspace',
            component: () => import('../views/workspace/index.vue'),
            redirect: (to) => `/workspace/${to.params.projectId}/novel`,
            children: [
                { path: 'novel', name: 'Novel', component: () => import('../views/workspace/NovelPanel.vue') },
                { path: 'storyline', name: 'Storyline', component: () => import('../views/workspace/StorylinePanel.vue') },
                { path: 'outline', name: 'Outline', component: () => import('../views/workspace/OutlinePanel.vue') },
                { path: 'assets', name: 'Assets', component: () => import('../views/workspace/AssetsPanel.vue') },
                { path: 'script', name: 'Script', component: () => import('../views/workspace/ScriptPanel.vue') },
                { path: 'storyboard', name: 'Storyboard', component: () => import('../views/workspace/StoryboardPanel.vue') },
                { path: 'video', name: 'Video', component: () => import('../views/workspace/VideoPanel.vue') },
                { path: 'composite', name: 'Composite', component: () => import('../views/workspace/CompositePanel.vue') },
            ],
        },
        {
            path: '/setting',
            name: 'Setting',
            component: () => import('../views/setting/index.vue'),
        },
        { path: '/', redirect: '/projects' },
    ],
})

router.beforeEach((to, _from, next) => {
    if (to.path === '/login') return next()
    const appStore = useAppStore()
    if (!appStore.token) return next('/login')
    next()
})

export default router
