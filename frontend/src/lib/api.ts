import axios from 'axios';
import type { 
  ApiResponse, 
  Card, 
  CardSearchParams, 
  Tokens, 
  User, 
  UserCard, 
  CollectionStats,
  Invite
} from './types';
import { useAuthStore } from '../stores/auth';
import Cookies from 'js-cookie';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // to send cookies
  timeout: 30000,
});

// Request interceptor to add auth token
apiClient.interceptors.request.use((config) => {
  const { tokens } = useAuthStore.getState();
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`;
  }
  return config;
});

export const refreshAccessToken = async (): Promise<Tokens> => {
  const refreshToken = Cookies.get('refresh_token');
  if (!refreshToken) {
    throw new Error('No refresh token found');
  }
  const { data } = await apiClient.post<Tokens>('/auth/refresh', { refresh_token: refreshToken });
  return data;
};

// API surface
export const api = {
  auth: {
    async login(payload: { username: string; password: string }): Promise<Tokens> {
      const { data } = await apiClient.post<Tokens>('/auth/login', payload);
      return data;
    },

    async register(payload: { 
      email: string; 
      username: string; 
      password: string; 
      invite_code?: string;
    }): Promise<User> {
      const { data } = await apiClient.post<ApiResponse<User>>('/auth/register', payload);
      return data.data;
    },

    async me(): Promise<User> {
      const { data } = await apiClient.get<User>('/users/me');
      return data;
    },

    async logout(): Promise<void> {
      try {
        await apiClient.post('/auth/logout');
      } catch {
        // Ignore errors on logout
      }
    },
  },

  cards: {
    async search(params: CardSearchParams): Promise<Card[]> {
      const { data } = await apiClient.get<ApiResponse<Card[]>>('/cards/search', { params });
      return data.data;
    },

    async searchUnique(params: CardSearchParams): Promise<{ data: (Card & { version_count: number })[], meta: any }> {
      const { data } = await apiClient.get<{ data: (Card & { version_count: number })[], meta: any }>('/cards/search-unique', { params });
      return data;
    },

    async getVersions(oracleId: string): Promise<Card[]> {
      const { data } = await apiClient.get<Card[]>(`/cards/oracle/${oracleId}/versions`);
      return data;
    },

    async byId(id: string): Promise<Card> {
      const { data } = await apiClient.get<ApiResponse<Card>>(`/cards/${id}`);
      return data.data;
    },
  },

  collections: {
    async mine(): Promise<{ items: UserCard[]; stats?: CollectionStats }> {
      const { data } = await apiClient.get<ApiResponse<{ items: UserCard[]; stats?: CollectionStats }>>('/collections/mine');
      return data.data;
    },

    async addCard(payload: { 
      card_id: string; 
      quantity: number; 
      foil_quantity?: number; 
      condition?: string;
      purchase_price?: string;
      tags?: string[];
      notes?: string;
    }): Promise<UserCard> {
      const { data } = await apiClient.post<ApiResponse<UserCard>>('/collections/mine/cards', payload);
      return data.data;
    },

    async updateCard(id: string, payload: Partial<UserCard>): Promise<UserCard> {
      const { data } = await apiClient.patch<ApiResponse<UserCard>>(`/collections/mine/cards/${id}`, payload);
      return data.data;
    },

    async removeCard(id: string): Promise<void> {
      await apiClient.delete(`/collections/mine/cards/${id}`);
    },

    async stats(): Promise<CollectionStats> {
      const { data } = await apiClient.get<ApiResponse<CollectionStats>>('/collections/mine/stats');
      return data.data;
    },
  },

  admin: {
    async users(): Promise<User[]> {
      const { data } = await apiClient.get<User[]>('/admin/users');
      return data;
    },

    async createUser(payload: { 
      email: string; 
      username: string; 
      password: string; 
      is_admin?: boolean;
    }): Promise<User> {
      const { data } = await apiClient.post<ApiResponse<User>>('/admin/users', payload);
      return data.data;
    },

    async createInvite(payload: { 
      email_restriction?: string; 
      max_uses?: number; 
      expires_at?: string;
    }): Promise<Invite> {
      const { data } = await apiClient.post<ApiResponse<Invite>>('/admin/invites', payload);
      return data.data;
    },

    async invites(): Promise<Invite[]> {
      const { data } = await apiClient.get<ApiResponse<Invite[]>>('/admin/invites');
      return data.data;
    },

    async updateUserStatus(userId: string, status: string): Promise<User> {
      const { data } = await apiClient.patch<ApiResponse<User>>(`/admin/users/${userId}/status`, { status });
      return data.data;
    },

    async stats(): Promise<{ 
      total_users: number; 
      pending_users: number; 
      approved_users: number; 
      admin_users: number; 
      registration_mode: string;
    }> {
      const { data } = await apiClient.get<{
        total_users: number; 
        pending_users: number; 
        approved_users: number; 
        admin_users: number; 
        registration_mode: string;
      }>('/admin/stats');
      return data;
    },

    async deleteUser(userId: string): Promise<{ message: string; deleted_user_id: string }> {
      const { data } = await apiClient.delete<ApiResponse<{ message: string; deleted_user_id: string }>>(`/admin/users/${userId}`);
      return data.data;
    },
  },
};