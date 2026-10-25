import { storage } from "@/src/utils/storage";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL!;
export const API_BASE = `${BACKEND}/api`;
export const TOKEN_KEY = "auth_token";

export type Role = "owner" | "employee";
export type Session = {
  access_token: string;
  token_type: string;
  role: Role;
  user_id: string;
  name: string;
  email: string;
};

export async function getToken(): Promise<string | null> {
  return storage.secureGet<string>(TOKEN_KEY, "" as any) as any;
}

export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as any),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Bağlantı hatası, internetinizi kontrol edin");
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data && (data.detail || data.message);
    const msg = typeof detail === "string" ? detail : res.status === 422 ? "Lütfen girdiğiniz bilgileri kontrol edin" : `İşlem başarısız (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}
