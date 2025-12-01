import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type { 
  ApiResponse, 
  Card, 
  CardSearchParams, 
  Tokens, 
  User, 
  UserCard, 
  CollectionStats,
  Invite
} from './types'

const API_URL = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Don't redirect for login failures, let the component handle it
    const isLoginRequest = error.config?.url?.endsWith('auth/login')
    
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// API surface
export const api = {
  auth: {
    async login(payload: { username: string; password: string }): Promise<Tokens> {
      const formData = new URLSearchParams()
      formData.append('username', payload.username)
      formData.append('password', payload.password)
      
      const { data } = await apiClient.post<Tokens>('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    },

    async register(payload: { 
      email: string 
      username: string 
      password: string 
      invite_code?: string
    }): Promise<User> {
      const { data } = await apiClient.post<ApiResponse<User>>('/auth/register', payload)
      return data.data
    },

    async me(): Promise<User> {
      const { data } = await apiClient.get<User>('/users/me')
      return data
    },

    async logout(): Promise<void> {
      try {
        await apiClient.post('/auth/logout')
      } catch {
        // Ignore errors on logout
      }
    },
  },

  cards: {
    async search(params: CardSearchParams): Promise<Card[]> {
      const { data } = await apiClient.get<ApiResponse<Card[]>>('/cards/search', { params })
      return data.data
    },

    async searchUnique(params: CardSearchParams): Promise<{ data: (Card & { version_count: number })[], meta: { total: number; page: number; per_page: number; total_pages: number; has_next: boolean; has_prev: boolean } }> {
      const { data } = await apiClient.get<{ data: (Card & { version_count: number })[], meta: { total: number; page: number; per_page: number; total_pages: number; has_next: boolean; has_prev: boolean } }>('/cards/search-unique', { params })
      return data
    },

    async getVersions(oracleId: string): Promise<Card[]> {
      const { data } = await apiClient.get<Card[]>(`/cards/oracle/${oracleId}/versions`)
      return data
    },

    async byId(id: string): Promise<Card> {
      const { data } = await apiClient.get<ApiResponse<Card>>(`/cards/${id}`)
      return data.data
    },
  },

  collections: {
    async mine(): Promise<{ items: UserCard[]; stats?: CollectionStats }> {
      const { data } = await apiClient.get<{ items: UserCard[]; stats?: CollectionStats }>('/collections/mine')
      return data
    },

    async addCard(payload: { 
      card_scryfall_id: string 
      quantity: number 
      condition?: string
    }): Promise<UserCard> {
      // Use FormData since the backend expects form data
      const formData = new FormData()
      formData.append('card_scryfall_id', payload.card_scryfall_id)
      formData.append('quantity', payload.quantity.toString())
      if (payload.condition) {
        formData.append('condition', payload.condition)
      }
      const { data } = await apiClient.post<UserCard>('/collections/mine/cards', formData)
      return data
    },

    async updateCard(id: string, payload: Partial<UserCard>): Promise<UserCard> {
      const { data } = await apiClient.patch<ApiResponse<UserCard>>(`/collections/mine/cards/${id}`, payload)
      return data.data
    },

    async removeCard(id: string): Promise<void> {
      await apiClient.delete(`/collections/mine/cards/${id}`)
    },

    async stats(): Promise<CollectionStats> {
      const { data } = await apiClient.get<CollectionStats>('/collections/mine/stats')
      return data
    },
  },

  admin: {
    async users(): Promise<User[]> {
      const { data } = await apiClient.get<User[]>('/admin/users')
      return data
    },

    async createUser(payload: { 
      email: string 
      username: string 
      password: string 
      is_admin?: boolean
    }): Promise<User> {
      const { data } = await apiClient.post<ApiResponse<User>>('/admin/users', payload)
      return data.data
    },

    async createInvite(payload: { 
      email_restriction?: string 
      max_uses?: number
      expires_at?: string
    }): Promise<Invite> {
      const { data } = await apiClient.post<ApiResponse<Invite>>('/admin/invites', payload)
      return data.data
    },

    async invites(): Promise<Invite[]> {
      const { data } = await apiClient.get<ApiResponse<Invite[]>>('/admin/invites')
      return data.data
    },

    async updateUserStatus(userId: string, status: string): Promise<User> {
      const { data } = await apiClient.patch<ApiResponse<User>>(`/admin/users/${userId}/status`, { status })
      return data.data
    },

    async stats(): Promise<{ 
      total_users: number 
      pending_users: number 
      approved_users: number 
      admin_users: number 
      registration_mode: string
    }> {
      const { data } = await apiClient.get<{
        total_users: number 
        pending_users: number 
        approved_users: number 
        admin_users: number 
        registration_mode: string
      }>('/admin/stats')
      return data
    },

    async deleteUser(userId: string): Promise<{ message: string; deleted_user_id: string }> {
      const { data } = await apiClient.delete<ApiResponse<{ message: string; deleted_user_id: string }>>(`/admin/users/${userId}`)
      return data.data
    },
  },

  scan: {
    async getBatches(): Promise<{ batches: { id: string; status: string; total_scans: number; completed_scans: number; failed_scans: number; created_at: string; completed_at?: string }[] }> {
      const { data } = await apiClient.get<{ batches: { id: string; status: string; total_scans: number; completed_scans: number; failed_scans: number; created_at: string; completed_at?: string }[] }>('/scan/batches')
      return data
    },

    async getPendingScans(): Promise<{ scans: unknown[] }> {
      const { data } = await apiClient.get<{ scans: unknown[] }>('/scan/scans/pending')
      return data
    },

    async getBatchScans(batchId: string): Promise<{ scans: unknown[] }> {
      const { data } = await apiClient.get<{ scans: unknown[] }>(`/scan/batches/${batchId}/scans`)
      return data
    },

    async confirmScan(scanId: string, payload: { confirmed_card_id: string; quantity?: number }): Promise<void> {
      await apiClient.post(`/scan/scans/${scanId}/confirm`, payload)
    },

    async rejectScan(scanId: string): Promise<void> {
      await apiClient.post(`/scan/scans/${scanId}/reject`)
    },

    async confirmBatch(batchId: string): Promise<void> {
      await apiClient.post(`/scan/batches/${batchId}/confirm`)
    },
  },
}

// Auth API (hatchery-style)
export const authApi = {
  login: async (credentials: { username: string; password: string }): Promise<Tokens> => {
    return api.auth.login(credentials)
  },
  
  register: async (data: { username: string; email: string; password: string }): Promise<User> => {
    return api.auth.register(data)
  },
  
  getCurrentUser: async (): Promise<User> => {
    return api.auth.me()
  },
}
