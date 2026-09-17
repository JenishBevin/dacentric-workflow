import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ArrowRight, BarChart3, Eye, Lock, Mail, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { Button, Input, PasswordInput, Label } from "../../components/ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { extractApiError } from "../../lib/apiClient";
import qplusIcon from "../../assets/qplus-icon.png";
import dubaiSkyline from "../../assets/dubai-skyline-sunset.jpg";
import dacnexusLogo from "../../assets/dacnexus-logo.png";

const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";

const schema = z.object({
  email: z.string().email("Enter a valid work email."),
  password: z.string().min(1, "Password is required."),
});
type FormValues = z.infer<typeof schema>;

const FEATURES = [
  { icon: BarChart3, label: "Manage Operations" },
  { icon: Users, label: "Collaborate with Ease" },
  { icon: ShieldCheck, label: "Secure & Reliable" },
  { icon: TrendingUp, label: "Drive Business Growth" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1330] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b1330] via-[#111c4e] to-[#1c2f7f]" />
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: `url(${dubaiSkyline})` }}
      />
      <div className="pointer-events-none absolute -left-28 -top-28 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
      <div
        className="pointer-events-none absolute right-0 top-0 h-72 w-72 [mask-image:linear-gradient(to_bottom_left,black,transparent)]"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1.5px)", backgroundSize: "16px 16px" }}
      />

      <div className="relative z-10 flex w-full max-w-5xl items-center justify-center gap-16">
        <div className="hidden flex-1 flex-col items-center gap-8 lg:flex">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3">
              {isLocalhost && (
                <>
                  <img src={dacnexusLogo} alt="DaCneXus" className="h-20 w-auto object-contain" />
                  <div className="mx-1 h-16 w-px bg-white/20" />
                </>
              )}
              <img src={qplusIcon} alt="" className="h-20 w-20 object-contain" />
              <h1 className="text-5xl font-extrabold tracking-tight text-white">
                Q<span className="text-amber-400">Plus</span>
              </h1>
            </div>
            <p className="mt-3 text-lg font-medium text-slate-200">Unified Business Module Platform</p>
            <p className="mt-4 text-sm font-medium tracking-wide text-blue-300">Simplify &nbsp;·&nbsp; Connect &nbsp;·&nbsp; Grow</p>
          </div>
          <div className="grid max-w-md grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center backdrop-blur-sm"
              >
                <Icon className="h-5 w-5 text-blue-300" />
                <span className="text-xs font-medium text-slate-200">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-sm lg:max-w-md">
          <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
            <div className="flex items-center gap-2">
              {isLocalhost && (
                <>
                  <img src={dacnexusLogo} alt="DaCneXus" className="h-16 w-auto object-contain" />
                  <div className="mx-1 h-10 w-px bg-white/20" />
                </>
              )}
              <img src={qplusIcon} alt="" className="h-16 w-16 object-contain" />
              <h1 className="text-2xl font-bold text-white">
                Q<span className="text-amber-400">Plus</span>
              </h1>
            </div>
            <p className="text-xs text-slate-300">Unified Business Module Platform</p>
          </div>

          <div
            className={clsx(
              "relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] shadow-2xl backdrop-blur-xl",
              !revealed && "cursor-pointer"
            )}
            onClick={() => setRevealed(true)}
          >
            <div
              className={clsx(
                "p-6 transition-all duration-500 ease-out sm:p-8",
                revealed ? "scale-100 opacity-100 blur-0" : "pointer-events-none scale-[0.97] select-none opacity-70 blur-md"
              )}
            >
              <h2 className="text-xl font-semibold text-white">Sign in</h2>
              <p className="mt-1 text-sm text-slate-300">Access your account to continue</p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
                <div>
                  <Label htmlFor="email" required className="!text-slate-200">
                    Work email
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@dacentric.example"
                      error={errors.email?.message}
                      className="!border-white/15 !bg-white/10 !pl-9 !text-white placeholder:!text-slate-400"
                      {...register("email")}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" required className="!text-slate-200">
                      Password
                    </Label>
                    <Link to="/forgot-password" className="text-xs font-medium text-blue-300 hover:text-blue-200">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <PasswordInput
                      id="password"
                      autoComplete="current-password"
                      error={errors.password?.message}
                      className="!border-white/15 !bg-white/10 !pl-9 !text-white placeholder:!text-slate-400"
                      {...register("password")}
                    />
                  </div>
                </div>
                {serverError && (
                  <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {serverError}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full !bg-gradient-to-r !from-blue-500 !to-indigo-500 hover:!brightness-110"
                  loading={isSubmitting}
                >
                  Sign in <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
              <p className="mt-5 text-center text-xs text-slate-400">
                Accounts are provisioned by an Administrator. There is no self-registration.
              </p>
            </div>

            {!revealed && (
              <div className="absolute inset-0 flex animate-pulse flex-col items-center justify-center gap-2 bg-slate-900/20">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white">
                  <Eye className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-white">Click to sign in</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
