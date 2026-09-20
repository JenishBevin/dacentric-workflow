import React, { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Cloud,
  Cpu,
  Globe2,
  Mail,
  MapPin,
  Phone,
  Server,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import onerraLogoFull from "../assets/onerra-logo-full.png";
import onerraLogoIcon from "../assets/onerra-logo-icon.png";
import onerraScreenshotBoard from "../assets/onerra-screenshot-board.png";
import onerraScreenshotTask from "../assets/onerra-screenshot-task.png";
import dubaiSkyline from "../assets/dubai-skyline-sunset.jpg";

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

const SOFTWARE_FEATURES = ["Workflow & Project Management", "CRM & Customer Tracking", "HRMS & Employee Management", "ERP & Inventory Control"];

const WHY_US = [
  { title: "Built In-House", description: "We build and maintain our own software, so we understand what it takes to ship reliable systems." },
  { title: "Client-Centric", description: "Every engagement starts with understanding your workflow, not fitting you into a generic template." },
  { title: "Long-Term Support", description: "We stay involved after launch — support, updates, and improvements as your business grows." },
];

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="group relative text-sm font-medium text-slate-200 transition hover:text-white"
    >
      {children}
      <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-amber-400 transition-all duration-300 group-hover:w-full" />
    </a>
  );
}

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Website enquiry from ${name || "a visitor"}`);
    const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
    window.location.href = `mailto:info@dac-onerra.com?subject=${subject}&body=${body}`;
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
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110 sm:w-auto"
      >
        Send Message <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero + nav */}
      <div className="relative overflow-hidden bg-[#0b1330]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b1330] via-[#111c4e] to-[#1c2f7f]" />
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${dubaiSkyline})` }}
        />
        <div className="pointer-events-none absolute -left-28 -top-28 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-10 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative z-10">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
            <a href="/" className="flex items-center">
              <img src={onerraLogoFull} alt="Onerra" className="h-9 w-auto object-contain sm:h-10" />
            </a>
            <div className="hidden items-center gap-8 sm:flex">
              <NavLink href="/">Home</NavLink>
              <NavLink href="#services">Services</NavLink>
              <NavLink href="#about">About</NavLink>
              <NavLink href="#software">Software</NavLink>
              <NavLink href="#contact">Contact</NavLink>
            </div>
            <a
              href="#contact"
              className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
            >
              Get in Touch
            </a>
          </nav>

          <div className="mx-auto max-w-6xl px-4 pb-24 pt-12 text-center sm:px-6 sm:pt-20">
            <p className="text-sm font-medium tracking-wide text-blue-300">IT Solutions & Software Services</p>
            <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              Technology That Runs Your Business, Not the Other Way Around
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
              Onerra designs and builds enterprise software, workflow automation, and IT infrastructure for businesses that
              want systems built around how they actually work.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#services"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:brightness-95"
              >
                Explore Services <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#contact"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                Get in Touch
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <section id="about" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">About Onerra</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">A product of DaCentric Technologies</h2>
            <p className="mt-4 text-slate-600">
              Onerra is built and maintained by <span className="font-medium text-slate-800">DaCentric Technologies</span>, a
              software and IT infrastructure company headquartered in the UAE, serving businesses across the MEA region and
              India. DaCentric combines global technology expertise with local market knowledge to help enterprises adopt
              secure, scalable digital solutions with confidence.
            </p>
            <p className="mt-4 text-slate-600">
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

      {/* Services */}
      <section id="services" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Services</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Everything your business needs to run on solid systems</h2>
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
      <section id="software" className="relative overflow-hidden bg-[#0b1330] py-20">
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
              <p className="mt-4 text-slate-300">
                Onerra is our in-house business management platform — built to bring workflow tracking, customer
                relationships, HR, and operations together in one place. It's a working example of the kind of software we
                build for our clients.
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
            <div className="relative">
              <img
                src={onerraScreenshotBoard}
                alt="Onerra project board screenshot"
                className="w-full rounded-xl border border-white/10 shadow-2xl"
              />
              <img
                src={onerraScreenshotTask}
                alt="Onerra task detail screenshot"
                className="absolute -bottom-10 -right-6 hidden w-2/3 rounded-xl border border-white/10 shadow-2xl sm:block"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="mx-auto max-w-6xl px-4 py-20 pt-28 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Why Onerra</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">A partner that stays involved</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {WHY_US.map(({ title, description }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact / footer */}
      <section id="contact" className="relative overflow-hidden bg-[#0b1330] py-20">
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
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-slate-200">
                <MapPin className="h-4 w-4 shrink-0 text-blue-400" /> United Arab Emirates
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
