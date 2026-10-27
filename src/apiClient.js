import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://react-api.dev2life.workers.dev/api/v1'

/**
 * Token Store ตามมาตรฐาน React Course API
 * จัดเก็บ accessToken (อายุ 15 นาที) และ refreshToken (อายุ 7 วัน)
 */
export const tokenStore = {
  get access() {
    return localStorage.getItem('accessToken') || localStorage.getItem('scary_api_access_token') || null
  },
  get refresh() {
    return localStorage.getItem('refreshToken') || localStorage.getItem('scary_api_refresh_token') || null
  },
  save({ accessToken, refreshToken }) {
    if (accessToken) {
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('scary_api_access_token', accessToken)
    }
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('scary_api_refresh_token', refreshToken)
    }
  },
  clear() {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('scary_api_access_token')
    localStorage.removeItem('scary_api_refresh_token')
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
})

// 1. Request Interceptor: แนบ Authorization: Bearer <accessToken>
apiClient.interceptors.request.use((config) => {
  const token = tokenStore.access
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 2. Response Interceptor: จัดการ Auto-Refresh และ Error กลาง
// ถ้ามีหลาย request หมดอายุพร้อมกัน ให้ refresh แค่ครั้งเดียว (Single in-flight refresh promise)
let refreshing = null

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const code = error.response?.data?.error?.code

    // กรณี Token ใช้ไม่ได้แล้ว / ถูกระงับบัญชี (ACCOUNT_BANNED)
    if (['TOKEN_INVALID', 'TOKEN_MISSING', 'REFRESH_TOKEN_INVALID', 'ACCOUNT_BANNED'].includes(code)) {
      tokenStore.clear()
      window.dispatchEvent(
        new CustomEvent('auth:logout', {
          detail: {
            code,
            message: error.response?.data?.error?.message || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'
          }
        })
      )
      return Promise.reject(error)
    }

    // กรณี Token หมดอายุ (TOKEN_EXPIRED) ให้ Auto Refresh และ Retry ครั้งเดียว
    if (code !== 'TOKEN_EXPIRED' || original?._retry) {
      return Promise.reject(error)
    }

    original._retry = true

    if (!tokenStore.refresh) {
      tokenStore.clear()
      window.dispatchEvent(
        new CustomEvent('auth:logout', {
          detail: { code: 'REFRESH_TOKEN_INVALID', message: 'ไม่พบ Refresh Token กรุณาเข้าสู่ระบบใหม่' }
        })
      )
      return Promise.reject(error)
    }

    refreshing ??= axios
      .post(`${API_BASE_URL}/auth/refresh`, { refreshToken: tokenStore.refresh })
      .then(({ data }) => {
        tokenStore.save(data.data)
        return data.data.accessToken
      })
      .finally(() => {
        refreshing = null
      })

    try {
      const accessToken = await refreshing
      original.headers.Authorization = `Bearer ${accessToken}`
      return apiClient(original)
    } catch (refreshError) {
      tokenStore.clear()
      window.dispatchEvent(
        new CustomEvent('auth:logout', {
          detail: { code: 'REFRESH_TOKEN_INVALID', message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }
        })
      )
      return Promise.reject(refreshError)
    }
  }
)

/**
 * แปลง error.details ให้เป็น Object { [field]: message }
 * เพื่อนำไปแสดง error ใต้ช่องกรอกข้อมูลแต่ละช่องตามกฎของ API
 */
export const fieldErrors = (error) =>
  Object.fromEntries((error.response?.data?.error?.details ?? []).map((d) => [d.field, d.message]))

/**
 * API helper methods ครอบคลุมทุก Endpoint ใน React Course API
 */
export const api = {
  // 0. System
  checkHealth: async () => {
    const start = performance.now()
    const response = await apiClient.get('/system/health')
    const latency = Math.round(performance.now() - start)
    return { data: response.data, latency }
  },

  // 1. Auth
  login: async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password })
    const { user, accessToken, refreshToken } = response.data.data
    tokenStore.save({ accessToken, refreshToken })
    return { user, accessToken, refreshToken }
  },

  register: async ({ name, email, password }) => {
    const response = await apiClient.post('/auth/register', { name, email, password })
    const { user, accessToken, refreshToken } = response.data.data
    tokenStore.save({ accessToken, refreshToken })
    return { user, accessToken, refreshToken }
  },

  getMe: async () => {
    const response = await apiClient.get('/auth/me')
    return response.data.data
  },

  updateMe: async (body) => {
    const response = await apiClient.patch('/auth/me', body)
    return response.data.data
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await apiClient.put('/auth/change-password', { currentPassword, newPassword })
    const tokens = response.data.data
    tokenStore.save(tokens)
    return tokens
  },

  logout: async () => {
    const refreshToken = tokenStore.refresh
    try {
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken })
      }
    } catch (err) {
      console.warn('API logout error:', err)
    } finally {
      tokenStore.clear()
    }
  },

  logoutAll: async () => {
    const response = await apiClient.post('/auth/logout-all')
    tokenStore.clear()
    return response.data.data
  },

  getSessions: async () => {
    const response = await apiClient.get('/auth/sessions')
    return response.data.data
  },

  deleteSession: async (id) => {
    const response = await apiClient.delete(`/auth/sessions/${id}`)
    return response.data.data
  },

  // ตัวช่วยสอน: ขอ Token ที่หมดอายุแล้วเพื่อทดสอบ auto refresh
  getExpiredToken: async () => {
    const response = await apiClient.post('/auth/dev/expired-token')
    return response.data.data.accessToken
  },

  // 1.1 Admin
  getAdminUsers: async (params = {}) => {
    const response = await apiClient.get('/admin/users', { params })
    return response.data
  },

  getAdminStats: async () => {
    const response = await apiClient.get('/admin/users/stats')
    return response.data.data
  },

  getAdminUser: async (id) => {
    const response = await apiClient.get(`/admin/users/${id}`)
    return response.data.data
  },

  updateRole: async (id, role) => {
    const response = await apiClient.patch(`/admin/users/${id}/role`, { role })
    return response.data.data
  },

  updateStatus: async (id, status) => {
    const response = await apiClient.patch(`/admin/users/${id}/status`, { status })
    return response.data.data
  },

  deleteUser: async (id) => {
    const response = await apiClient.delete(`/admin/users/${id}`)
    return response.data.data
  },

  // 1.2 Demo routes
  testDemoRoute: async (level = 'public') => {
    const response = await apiClient.get(`/demo/${level}`)
    return response.data
  }
}

export default apiClient
