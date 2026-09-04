import { useMutation } from "@tanstack/react-query";
import { api, API_BASE_URL } from "../lib/apiClient";

export function useUpdateMyProfile() {
  return useMutation({
    mutationFn: async (payload: { name: string }) => (await api.patch("/auth/me", payload)).data.data,
  });
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: async (payload: { currentPassword: string; newPassword: string }) => api.post("/auth/me/password", payload),
  });
}

export function useChangeMyEmail() {
  return useMutation({
    mutationFn: async (payload: { newEmail: string; currentPassword: string }) => (await api.patch("/auth/me/email", payload)).data.data,
  });
}

export function useUploadMyAvatar() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post("/auth/me/avatar", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
  });
}

export function useRemoveMyAvatar() {
  return useMutation({
    mutationFn: async () => api.delete("/auth/me/avatar"),
  });
}

/** The avatar route is authenticated via the httpOnly accessToken cookie
 * (browsers attach cookies to <img> requests automatically, no JS needed),
 * so a plain <img src> pointed at it just works. `cacheBust` forces a
 * refetch after upload/removal, since the URL would otherwise be identical. */
export function myAvatarUrl(cacheBust?: string | number): string {
  return `${API_BASE_URL}/auth/me/avatar?v=${cacheBust ?? ""}`;
}
