import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, PasswordInput, Label } from "../../components/ui/primitives";
import { api, extractApiError } from "../../lib/apiClient";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "At least 8 characters.")
      .regex(/[A-Z]/, "Needs an uppercase letter.")
      .regex(/[a-z]/, "Needs a lowercase letter.")
      .regex(/\d/, "Needs a number.")
      .regex(/[^A-Za-z0-9]/, "Needs a symbol."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });
type FormValues = z.infer<typeof schema>;

export const PasswordSetupForm: React.FC<{ endpoint: "/auth/activate" | "/auth/reset-password"; successMessage: string }> = ({
  endpoint,
  successMessage,
}) => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await api.post(endpoint, { token, password: values.password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setServerError(extractApiError(err).message);
    }
  };

  if (!token) {
    return <p className="text-sm text-red-600">This link is missing its token. Please use the link from your email exactly as sent.</p>;
  }

  if (done) {
    return <p className="text-sm text-emerald-700">{successMessage} Redirecting you to sign in…</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="password" required>
          New password
        </Label>
        <PasswordInput id="password" error={errors.password?.message} {...register("password")} />
        <p className="mt-1 text-xs text-slate-400">At least 8 characters, with upper &amp; lower case, a number and a symbol.</p>
      </div>
      <div>
        <Label htmlFor="confirm" required>
          Confirm password
        </Label>
        <PasswordInput id="confirm" error={errors.confirm?.message} {...register("confirm")} />
      </div>
      {serverError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</div>}
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Set password
      </Button>
    </form>
  );
};
