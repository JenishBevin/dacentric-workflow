import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button, Input, PasswordInput, Label } from "../../components/ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { extractApiError } from "../../lib/apiClient";

const schema = z.object({
  email: z.string().email("Enter a valid work email."),
  password: z.string().min(1, "Password is required."),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate("/", { replace: true });
    } catch (err) {
      setServerError(extractApiError(err).message);
    }
  };

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email" required>
            Work email
          </Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@dacentric.example" error={errors.email?.message} {...register("email")} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password" required>
              Password
            </Label>
            <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Forgot password?
            </Link>
          </div>
          <PasswordInput id="password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
        </div>
        {serverError && (
          <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </div>
        )}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-slate-400">
        Accounts are provisioned by an Administrator. There is no self-registration.
      </p>
    </AuthLayout>
  );
}
