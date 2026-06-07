import { create } from "zustand";

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface AppState {
  user: User | null;
  token: string | null;
  currentProjectId: string | null;
  authInitialized: boolean;
  
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  
  initAuth: () => void;
  logout: () => void;
  apiFetch: (path: string, options?: RequestInit) => Promise<any>;
}

const API_BASE_URL = "/api/v1";

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  token: null,
  currentProjectId: null,
  authInitialized: false,

  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (token) {
      localStorage.setItem("omnibase_token", token);
    } else {
      localStorage.removeItem("omnibase_token");
    }
    set({ token });
  },
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),

  initAuth: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("omnibase_token");
    if (token) {
      set({ token });
      // Fetch /auth/me to verify token and load user
      get().apiFetch("/auth/me")
        .then((user) => set({ user, authInitialized: true }))
        .catch(() => {
          localStorage.removeItem("omnibase_token");
          set({ token: null, user: null, authInitialized: true });
        });
    } else {
      set({ authInitialized: true });
    }
  },

  logout: () => {
    localStorage.removeItem("omnibase_token");
    set({ token: null, user: null, currentProjectId: null });
  },

  apiFetch: async (path, options = {}) => {
    const { token } = get();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    } as Record<string, string>;

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 204) {
      return null;
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || data.error || "API Request failed");
    }

    return data;
  },
}));
