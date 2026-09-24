import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Cloud,
  Cpu,
  Globe2,
  Mail,
  MapPin,
  Menu,
  Phone,
  Server,
  ShieldCheck,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { api } from "../lib/apiClient";
import { extractApiError } from "../lib/apiClient";
import onerraLogoFullLight from "../assets/onerra-logo-full-light.png";
import onerraLogoIcon from "../assets/onerra-logo-icon.png";
import onerraMarketingDashboard from "../assets/onerra-marketing-dashboard.webp";
import onerraMarketingTeamWorkload from "../assets/onerra-marketing-teamworkload.webp";

const SERVICES = [
  {
    icon: Server,
    title: "Enterprise Systems & ERP",
    description: "Custom-built enterprise systems that bring every department onto one reliable platform.",
  },
  {
    icon: Workflow,
    title: "Workflow & Operations Automation",
    description: "Replace manual, paper-based processes with automated, trackable workflows built around how your team actually works.",
  },
  {
    icon: Cpu,
    title: "Custom Software Development",
    description: "Purpose-built software for your business, from internal tools to full customer-facing platforms.",
  },
  {
    icon: Globe2,
    title: "Web & Digital Presence",
    description: "Fast, modern websites and web apps designed to represent your brand and convert visitors into customers.",
  },
  {
    icon: ShieldCheck,
    title: "Data Security & Infrastructure",
    description: "Protect your business-critical data with secure infrastructure, backups, and access controls.",
  },
  {
    icon: Cloud,
    title: "IT Support & Managed Services",
    description: "Ongoing support and infrastructure management so your systems stay online and up to date.",
  },
];

const SERVICE_OPTIONS = SERVICES.map((s) => s.title);

const SOFTWARE_FEATURES = ["Workflow & Project Management", "CRM & Customer Tracking", "HRMS & Employee Management", "ERP & Inventory Control"];

const WHY_US = [
  { title: "Built Around Your Workflow", description: "Every engagement starts with your actual processes, not a generic template we adapt you into." },
  { title: "Integrated Systems", description: "Software, infrastructure, and operations connected as one platform, not a pile of disconnected tools." },
  { title: "Scalable Architecture", description: "Built to grow with the organization, from a single team to the whole business." },
  { title: "Ongoing Support", description: "We stay involved after launch — support, updates, and improvements as your business grows." },
];

const SCREENSHOTS = [
  { src: onerraMarketingDashboard, alt: "Onerra dashboard overview" },
  { src: onerraMarketingTeamWorkload, alt: "Onerra team workload view" },
];

const NAV_ITEMS = [
  { label: "Home", href: "#top" },
  { label: "Solutions", href: "#services" },
  { label: "Software", href: "#software" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

/** Floating pill nav with a sliding highlight that follows the hovered item
 *  (https://dribbble.com/shots/24920157-Navbar-Interaction) — the pill's
 *  position/width are measured from the actual hovered link's DOM rect so it
 *  glides smoothly to any item regardless of its label length. */
function PillNav({ onHomeClick }: { onHomeClick: (e: React.MouseEvent) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverStyle, setHoverStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  function handleEnter(e: React.MouseEvent<HTMLAnchorElement>) {
    const container = containerRef.current;
    if (!container) return;
    const itemRect = e.currentTarget.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setHoverStyle({ left: itemRect.left - containerRect.left, width: itemRect.width, opacity: 1 });
  }

  function handleLeave() {
    setHoverStyle((s) => ({ ...s, opacity: 0 }));
  }

  return (
    <div
      ref={containerRef}
      onMouseLeave={handleLeave}
      className="relative hidden items-center gap-1 rounded-full bg-white/5 p-1 sm:flex"
    >
      <span
        className="absolute inset-y-1 rounded-full bg-white/10 transition-all duration-300 ease-out"
        style={{ left: hoverStyle.left, width: hoverStyle.width, opacity: hoverStyle.opacity }}
      />
      {NAV_ITEMS.map(({ label, href }) => (
        <a
          key={label}
          href={href}
          onClick={label === "Home" ? onHomeClick : undefined}
          onMouseEnter={handleEnter}
          className="relative z-10 rounded-full px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:text-white"
        >
          {label}
        </a>
      ))}
    </div>
  );
}

/** Abstract dot-grid + connecting lines, standing in for the old Dubai
 *  skyline photo — reads as "technology/network" rather than "Dubai city",
 *  and stays quiet enough to never compete with the headline on top of it. */
function TechGridBackground() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <pattern id="tech-grid-dots" width="42" height="42" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="white" fillOpacity="0.16" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#tech-grid-dots)" />
      <line x1="8%" y1="18%" x2="34%" y2="4%" stroke="white" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="34%" y1="4%" x2="60%" y2="14%" stroke="white" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="72%" y1="82%" x2="94%" y2="68%" stroke="white" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="46%" y1="92%" x2="72%" y2="82%" stroke="white" strokeOpacity="0.08" strokeWidth="1" />
    </svg>
  );
}

function ScreenshotCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % SCREENSHOTS.length), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative">
      <div className="relative flex h-[420px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm sm:h-[460px]">
        {SCREENSHOTS.map((shot, i) => (
          <img
            key={shot.src}
            src={shot.src}
            alt={shot.alt}
            className="absolute max-h-[90%] max-w-[92%] rounded-lg object-contain shadow-2xl transition-opacity duration-700 ease-in-out"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        {SCREENSHOTS.map((shot, i) => (
          <button
            key={shot.src}
            type="button"
            aria-label={`Show screenshot ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-amber-400" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}

function ServicesMultiSelect({
  selected,
  onChange,
  other,
  onOtherChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  other: string;
  onOtherChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [otherChecked, setOtherChecked] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(service: string) {
    onChange(selected.includes(service) ? selected.filter((s) => s !== service) : [...selected, service]);
  }

  const summary = [...selected, ...(otherChecked && other ? [other] : otherChecked ? ["Other"] : [])];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-left text-sm text-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        <span className={summary.length ? "text-white" : "text-slate-400"}>
          {summary.length ? summary.join(", ") : "Select the services you're looking for"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {SERVICE_OPTIONS.map((service) => (
            <label
              key={service}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  selected.includes(service) ? "border-blue-500 bg-blue-500" : "border-slate-300"
                }`}
              >
                {selected.includes(service) && <Check className="h-3 w-3 text-white" />}
              </span>
              <input type="checkbox" className="hidden" checked={selected.includes(service)} onChange={() => toggle(service)} />
              {service}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                otherChecked ? "border-blue-500 bg-blue-500" : "border-slate-300"
              }`}
            >
              {otherChecked && <Check className="h-3 w-3 text-white" />}
            </span>
            <input
              type="checkbox"
              className="hidden"
              checked={otherChecked}
              onChange={() => {
                setOtherChecked((c) => !c);
                if (otherChecked) onOtherChange("");
              }}
            />
            Other
          </label>
          {otherChecked && (
            <input
              autoFocus
              value={other}
              onChange={(e) => onOtherChange(e.target.value)}
              placeholder="Tell us what you need…"
              className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
            />
          )}
        </div>
      )}
    </div>
  );
}

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [otherService, setOtherService] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await api.post("/contact", { name, email, phone, services, otherService, message });
      setStatus("sent");
      setName("");
      setEmail("");
      setPhone("");
      setServices([]);
      setOtherService("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError(extractApiError(err).message);
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-10 text-center backdrop-blur-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-6 w-6 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Message sent</h3>
        <p className="text-sm text-slate-300">Thanks for reaching out — we'll get back to you shortly.</p>
        <button type="button" onClick={() => setStatus("idle")} className="mt-2 text-sm font-medium text-blue-300 hover:text-blue-200">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-sm sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-300">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-300">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-300">Contact Number</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+971 5X XXX XXXX"
          className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-300">Service you're looking for</label>
        <ServicesMultiSelect selected={services} onChange={setServices} other={otherService} onOtherChange={setOtherService} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-300">Message</label>
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Tell us about your project…"
          className="w-full resize-none rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {status === "error" && (
        <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error ?? "Something went wrong. Please try again."}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110 disabled:opacity-60 sm:w-auto"
      >
        {status === "sending" ? "Sending…" : "Send Message"} <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

export default function HomePage() {
  const [navHidden, setNavHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, []);

  // Hides the floating nav on scroll-down, brings it back on scroll-up — a
  // small threshold avoids it flickering on trackpad micro-jitter, and it
  // always stays visible near the very top of the page.
  useEffect(() => {
    let lastY = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      if (y < 80) {
        setNavHidden(false);
      } else if (y - lastY > 8) {
        setNavHidden(true);
        setMobileMenuOpen(false);
      } else if (lastY - y > 8) {
        setNavHidden(false);
      }
      lastY = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToTop(e: React.MouseEvent) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-white">
      <div id="top" />
      {/* Floating pill nav (no full-width bar) — logo/CTA sit outside the pill,
          nav links + sliding hover highlight live inside it */}
      <header
        className={`fixed inset-x-0 top-4 z-50 px-4 transition-transform duration-300 ease-out sm:px-6 ${
          navHidden ? "-translate-y-24" : "translate-y-0"
        }`}
      >
        <div className="relative mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-full border border-white/10 bg-[#0b1330]/90 shadow-2xl shadow-black/20 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 px-3 py-2">
              <a href="#top" onClick={scrollToTop} className="flex shrink-0 items-center pl-2">
                <img src={onerraLogoFullLight} alt="Onerra" className="h-7 w-auto object-contain sm:h-8" />
              </a>
              <PillNav onHomeClick={scrollToTop} />
              <a
                href="#contact"
                className="hidden shrink-0 rounded-full bg-gradient-to-r from-[#0a7e6d] to-[#0d9488] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:brightness-110 sm:inline-flex"
              >
                Get in Touch
              </a>
              <button
                type="button"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white sm:hidden"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile-only dropdown — a separate floating panel (not affecting the
              pill's own layout/height) animated with transform+opacity only, so
              it's GPU-composited and never triggers a layout recalc. The earlier
              grid-template-rows approach animated a layout property, which is
              what caused the lag on mobile. Always mounted so the transition
              actually plays instead of the panel just popping in/out. */}
          <div
            className={`absolute inset-x-0 top-full mt-2 origin-top rounded-3xl border border-white/10 bg-[#0b1330]/95 shadow-2xl shadow-black/20 backdrop-blur-md transition-[opacity,transform] duration-200 ease-out sm:hidden ${
              mobileMenuOpen ? "translate-y-0 scale-y-100 opacity-100" : "pointer-events-none -translate-y-1 scale-y-95 opacity-0"
            }`}
          >
            <div className="flex flex-col gap-1 p-3">
              {NAV_ITEMS.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  onClick={(e) => {
                    setMobileMenuOpen(false);
                    if (label === "Home") scrollToTop(e);
                  }}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  {label}
                </a>
              ))}
              <a
                href="#contact"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-1 rounded-full bg-gradient-to-r from-[#0a7e6d] to-[#0d9488] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-900/30"
              >
                Get in Touch
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero — padded to clear the floating header */}
      <div className="relative overflow-hidden bg-[#0b1330] pt-24">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b1330] via-[#111c4e] to-[#1c2f7f]" />
        <TechGridBackground />
        <div className="pointer-events-none absolute -left-28 -top-28 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-10 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-12 text-center sm:px-6 sm:pt-20">
          <p className="text-sm font-medium tracking-wide text-blue-300">IT Solutions & Software Services</p>
          <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Technology That Runs Your Business
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
            Custom software, workflow automation, and IT infrastructure designed around your business.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#services"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:brightness-95"
            >
              Explore Services <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Services — "what we do", right after the hero */}
      <section id="services" className="scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">What We Do</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Technology built around how you work</h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                  <Icon className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Software spotlight — Onerra, no sign-in link */}
      <section id="software" className="relative scroll-mt-20 overflow-hidden bg-[#0b1330] py-20">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b1330] via-[#111c4e] to-[#1c2f7f]" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-400">Our Software</p>
              <div className="mt-2 flex items-center gap-3">
                <img src={onerraLogoIcon} alt="" className="h-10 w-10 rounded-xl object-contain" />
                <h2 className="text-3xl font-bold tracking-tight text-white">Onerra</h2>
              </div>
              <p className="mt-2 text-sm font-medium tracking-wide text-blue-300">Unified Business Module Platform</p>
              <p className="mt-4 text-justify text-slate-300">
                Onerra is our in-house business management platform — built to bring workflow tracking, customer
                relationships, HR, and operations together in one place. It's a working example of the kind of software we
                build for our clients, on desktop and mobile alike.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {SOFTWARE_FEATURES.map((label) => (
                  <div key={label} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-sm">
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span className="text-sm font-medium text-slate-200">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ScreenshotCarousel />
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Why Onerra</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">A partner that stays involved</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_US.map(({ title, description }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About — company background, kept but no longer the first thing after the hero */}
      <section id="about" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">About Onerra</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">A product of DaCentric Technologies</h2>
            <p className="mt-4 text-justify text-slate-600">
              Onerra is built and maintained by <span className="font-medium text-slate-800">DaCentric Technologies</span>, a
              software and IT infrastructure company headquartered in the UAE, serving businesses across the MEA region and
              India. DaCentric combines global technology expertise with local market knowledge to help enterprises adopt
              secure, scalable digital solutions with confidence.
            </p>
            <p className="mt-4 text-justify text-slate-600">
              DaCentric's work spans enterprise systems, workflow automation, AI-driven solutions, and IT infrastructure —
              built on long-term partnerships grounded in transparency, integrity, and collaboration. Onerra is a direct
              product of that same engineering team.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: BarChart3, label: "Operational Focus" },
              { icon: Users, label: "Client-Centric" },
              { icon: ShieldCheck, label: "Secure by Design" },
              { icon: Workflow, label: "Automation First" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
                <Icon className="h-6 w-6 text-blue-600" />
                <span className="text-sm font-medium text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-[#0b1330] py-16">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b1330] via-[#111c4e] to-[#1c2f7f]" />
        <TechGridBackground />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Let's build technology around your business.</h2>
          <a
            href="#contact"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:brightness-95"
          >
            Talk to Onerra <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Contact / footer */}
      <section id="contact" className="relative scroll-mt-20 overflow-hidden bg-[#0b1330] py-20">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b1330] via-[#111c4e] to-[#1c2f7f]" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-400">Get in Touch</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Let's talk about your project</h2>
            <p className="mt-3 text-slate-300">Send us a message and we'll get back to you shortly.</p>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <ContactForm />

            <div className="space-y-3">
              <a
                href="mailto:info@dac-onerra.com"
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-slate-200 transition hover:bg-white/10"
              >
                <Mail className="h-4 w-4 shrink-0 text-blue-400" /> info@dac-onerra.com
              </a>
              <a
                href="tel:+97142397959"
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-slate-200 transition hover:bg-white/10"
              >
                <Phone className="h-4 w-4 shrink-0 text-blue-400" /> UAE: +971 4 239 7959
              </a>
              <a
                href="tel:+918807377688"
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-slate-200 transition hover:bg-white/10"
              >
                <Phone className="h-4 w-4 shrink-0 text-blue-400" /> India: +91 88073 77688
              </a>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-slate-200">
                <MapPin className="h-4 w-4 shrink-0 text-blue-400" />
                <span>Office 203, Dar Al Wuheida Building, Al Doha St, Hor Al Anz East, Deira, Dubai, UAE</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#080e26] py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} DaCentric Technologies. All rights reserved.
      </footer>
    </div>
  );
}
