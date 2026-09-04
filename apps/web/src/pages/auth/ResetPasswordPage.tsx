import React from "react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { PasswordSetupForm } from "./PasswordSetupForm";

export default function ResetPasswordPage() {
  return (
    <AuthLayout title="Reset your password" subtitle="Choose a new password for your account.">
      <PasswordSetupForm endpoint="/auth/reset-password" successMessage="Your password has been reset." />
    </AuthLayout>
  );
}
