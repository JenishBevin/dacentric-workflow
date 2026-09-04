import React, { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useUpdateMyProfile, useChangeMyPassword, useChangeMyEmail, useUploadMyAvatar, useRemoveMyAvatar, myAvatarUrl } from "../../api/profile";
import { Avatar, Button, Input, Label } from "../../components/ui/primitives";
import { roleLabel, isSuperAdmin } from "../../lib/permissions";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";

const MAX_AVATAR_MB = 5;
const ACCEPTED_TYPES = "image/png,image/jpeg,image/gif,image/webp";

export default function MyProfilePage() {
  const { user, refreshMe } = useAuth();
  const { push } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cacheBust, setCacheBust] = useState(0);

  const [name, setName] = useState(user?.name ?? "");
  const updateProfile = useUpdateMyProfile();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const changePassword = useChangeMyPassword();

  const uploadAvatar = useUploadMyAvatar();
  const removeAvatar = useRemoveMyAvatar();

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const changeEmail = useChangeMyEmail();

  if (!user) return null;
  const canEditEmail = isSuperAdmin(user);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await updateProfile.mutateAsync({ name: name.trim() });
      await refreshMe();
      push({ variant: "success", title: "Profile updated." });
    } catch (err) {
      push({ variant: "error", title: "Could not update profile", description: extractApiError(err).message });
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      push({ variant: "error", title: "Passwords don't match", description: "New password and confirmation must be identical." });
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      push({ variant: "success", title: "Password changed.", description: "Your other signed-in devices have been signed out." });
    } catch (err) {
      push({ variant: "error", title: "Could not change password", description: extractApiError(err).message });
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      push({ variant: "error", title: "File too large", description: `Profile pictures must be ${MAX_AVATAR_MB} MB or smaller.` });
      return;
    }
    try {
      await uploadAvatar.mutateAsync(file);
      setCacheBust((c) => c + 1);
      await refreshMe();
      push({ variant: "success", title: "Profile picture updated." });
    } catch (err) {
      push({ variant: "error", title: "Could not upload picture", description: extractApiError(err).message });
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    try {
      await changeEmail.mutateAsync({ newEmail: newEmail.trim(), currentPassword: emailPassword });
      await refreshMe();
      setNewEmail("");
      setEmailPassword("");
      push({ variant: "success", title: "Work email changed.", description: `Sign in with ${newEmail.trim()} next time.` });
    } catch (err) {
      push({ variant: "error", title: "Could not change email", description: extractApiError(err).message });
    }
  }

  async function onRemoveAvatar() {
    try {
      await removeAvatar.mutateAsync();
      // refreshMe first: it flips user.hasAvatar to false, which drops the
      // <img src> entirely — no need to cache-bust a request for a file that
      // no longer exists (and doing it in the other order briefly re-fetches
      // the just-deleted avatar for one render).
      await refreshMe();
      push({ variant: "success", title: "Profile picture removed." });
    } catch (err) {
      push({ variant: "error", title: "Could not remove picture", description: extractApiError(err).message });
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">My Profile</h1>
        <p className="text-sm text-slate-500">Update your own name, profile picture, and password.</p>
      </div>

      {/* Profile picture */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">Profile Picture</p>
        <div className="flex items-center gap-4">
          <Avatar name={user.name} size="lg" src={user.hasAvatar ? myAvatarUrl(cacheBust) : undefined} />
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" loading={uploadAvatar.isPending} onClick={() => fileInputRef.current?.click()}>
                <Camera className="h-4 w-4" /> {user.hasAvatar ? "Change" : "Upload"}
              </Button>
              {user.hasAvatar && (
                <Button type="button" variant="ghost" size="sm" loading={removeAvatar.isPending} onClick={onRemoveAvatar}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-400">PNG, JPG, GIF or WEBP. Up to {MAX_AVATAR_MB} MB.</p>
          </div>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={onFileSelected} />
        </div>
      </div>

      {/* Basic details */}
      <form onSubmit={saveName} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">Details</p>
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </div>
        <div>
          <Label>Work email</Label>
          <Input value={user.workEmail} disabled className="!bg-slate-50 !text-slate-500" />
          <p className="mt-1 text-xs text-slate-400">
            {canEditEmail ? "Change this below." : "Contact your administrator to change your work email."}
          </p>
        </div>
        <div>
          <Label>Roles</Label>
          <p className="text-sm text-slate-700">{user.roles.map(roleLabel).join(", ")}</p>
        </div>
        <Button type="submit" loading={updateProfile.isPending} disabled={!name.trim() || name === user.name}>
          Save changes
        </Button>
      </form>

      {/* Password */}
      <form onSubmit={submitPassword} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">Change Password</p>
        <div>
          <Label required>Current password</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>
        <div>
          <Label required>New password</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          <p className="mt-1 text-xs text-slate-400">8+ characters, with upper, lower, digit and symbol.</p>
        </div>
        <div>
          <Label required>Confirm new password</Label>
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
        </div>
        <Button type="submit" loading={changePassword.isPending} disabled={!currentPassword || !newPassword || !confirmPassword}>
          Change password
        </Button>
      </form>

      {/* Work email — Super Admin only */}
      {canEditEmail && (
        <form onSubmit={submitEmail} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Change Work Email</p>
            <p className="text-xs text-slate-500">Only Super Admin can change their own sign-in email. Everyone else has to ask you.</p>
          </div>
          <div>
            <Label required>New work email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={user.workEmail} required />
          </div>
          <div>
            <Label required>Current password</Label>
            <Input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required />
          </div>
          <Button type="submit" loading={changeEmail.isPending} disabled={!newEmail.trim() || !emailPassword}>
            Change email
          </Button>
        </form>
      )}
    </div>
  );
}
