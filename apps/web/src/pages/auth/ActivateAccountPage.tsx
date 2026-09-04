import React from "react";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { PasswordSetupForm } from "./PasswordSetupForm";

export default function ActivateAccountPage() {
  return (
    <AuthLayout title="Activate your account" subtitle="Set a password to finish setting up your DaCentric account.">
      <PasswordSetupForm endpoint="/auth/activate" successMessage="Your account is now active." />
    </AuthLayout>
  );
}
