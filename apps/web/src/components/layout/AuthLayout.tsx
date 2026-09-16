import React from "react";
import qplusIcon from "../../assets/qplus-icon.png";
import dubaiSkyline from "../../assets/dubai-skyline-sunset.jpg";

export const AuthLayout: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
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

    <div className="relative z-10 w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2">
          <img src={qplusIcon} alt="" className="h-12 w-12 object-contain" />
          <h1 className="text-xl font-bold text-white">
            Q<span className="text-amber-400">Plus</span>
          </h1>
        </div>
        <p className="text-xs text-slate-300">Unified Business Module Platform</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-xl">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  </div>
);
