import React from "react";
import qplusIcon from "../../assets/qplus-icon-dark.png";

export const AuthLayout: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src={qplusIcon} alt="" className="h-14 w-14 object-contain" />
        <h1 className="text-lg font-semibold text-slate-900">QPlus - Unified Business Module Platform</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  </div>
);
