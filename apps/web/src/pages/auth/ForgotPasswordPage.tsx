import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button, Input, Label } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";

const schema = z.object({ email: z.string().email("Enter a valid work email.") });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    await api.post("/auth/forgot-password", values);
    setSent(true);
  };

  return (
    <AuthLayout title="Forgot password" subtitle="We'll email you a link to reset it.">
      {sent ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>If that email is registered, a reset link is on its way. It expires in 2 hours.</p>
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email" required>
              Work email
            </Label>
            <Input id="email" type="email" error={errors.email?.message} {...register("email")} />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
          <Link to="/login" className="block text-center text-xs font-medium text-slate-500 hover:text-slate-700">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
