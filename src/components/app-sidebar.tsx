"use client";

import { useState } from "react";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";

interface SidebarProps {
  navItems: { href: string; label: string; iconKey: string; group?: string }[];
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  ShoppingBag,
  CalendarDays,
  Wallet,
  Landmark,
  HandCoins,
  Package,
  Receipt,
  BookOpen,
  BarChart3,
  MessageCircle,
  Sparkles,
  Users,
};

export function AppSidebar({ navItems }: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        data-app-chrome
        onClick={() => setOpen(true)}
        className="fixed top-3 left-3 z-50 lg:hidden rounded-xl bg-card border border-border p-2 text-muted-foreground shadow-sm hover:bg-cream transition"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — banda oscura de marca (ink), como las secciones de la landing.
          Texto claro; el verde queda de acento y el logo va en blanco. */}
      <aside
        data-app-chrome
        className={`
          fixed top-0 left-0 z-50 h-screen w-64 shrink-0 border-r border-white/10 bg-ink text-white flex flex-col
          transition-transform duration-200 ease-out
          lg:sticky lg:top-0 lg:translate-x-0 lg:self-start
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 lg:hidden rounded-full p-1.5 text-white/70 hover:bg-white/10 transition"
          aria-label="Cerrar menú"
        >
          <X className="h-4 w-4" />
        </button>

        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className="block px-6 py-4 border-b border-white/10 hover:bg-white/5 transition-colors"
        >
          <h1 className="font-display text-xl tracking-[0.3em] uppercase text-white">
            MALALA
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-white/50 mt-1">
            Hair and Nails
          </p>
        </Link>

        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-0.5">
          {navItems.map((item, i) => {
            const Icon = ICONS[item.iconKey] ?? LayoutDashboard;
            const showHeader =
              !!item.group && item.group !== navItems[i - 1]?.group;
            return (
              <div key={item.href}>
                {showHeader && (
                  <p
                    className={`px-3 text-[10px] font-medium uppercase tracking-widest text-white/40 ${
                      i === 0 ? "pb-1.5" : "pt-4 pb-1.5"
                    }`}
                  >
                    {item.group}
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Icon className="h-4 w-4 stroke-[1.5]" />
                  <span>{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
