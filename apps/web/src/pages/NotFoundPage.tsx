import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/primitives";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="text-sm text-slate-500">This page doesn't exist.</p>
      <Link to="/">
        <Button variant="outline">Back to Dashboard</Button>
      </Link>
    </div>
  );
}
