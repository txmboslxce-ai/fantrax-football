"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type PortalShellProps = {
  email: string | null;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  locked?: boolean;
};

const navItems: NavItem[] = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/players", label: "Players" },
  { href: "/portal/fixtures", label: "Fixtures" },
  { href: "/portal/teams", label: "Teams", locked: true },
  { href: "/portal/compare", label: "Compare", locked: true },
  { href: "/portal/stats", label: "Stats", locked: true },
  { href: "/portal/my-league", label: "My League", locked: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/portal") {
    return pathname === "/portal";
  }
  return pathname.startsWith(href);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {navItems.map((item) => {
        if (item.locked) {
          return (
            <li key={item.href}>
              <span className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-brand-cream/50">
                {item.label}
                <span aria-hidden="true">🔒</span>
              </span>
            </li>
          );
        }

        const active = isActive(pathname, item.href);

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={`block rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                active ? "bg-brand-green text-brand-cream" : "text-brand-cream hover:bg-brand-cream/10"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function PortalShell({ email, children }: PortalShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-full bg-brand-dark text-brand-cream">
      <div className="border-b border-brand-cream/20 px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold uppercase tracking-wide">Portal</p>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="rounded-md border border-brand-cream/30 px-3 py-1 text-sm"
            aria-expanded={mobileOpen}
            aria-controls="portal-mobile-nav"
          >
            Menu
          </button>
        </div>

        {mobileOpen && (
          <div id="portal-mobile-nav" className="mt-3 space-y-3">
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="rounded-md border border-brand-cream/20 p-3 text-xs text-brand-creamDark">
              <p className="truncate">{email ?? "Unknown user"}</p>
              <form action="/auth/logout" method="post" className="mt-2">
                <button
                  type="submit"
                  className="w-full rounded-md border border-brand-cream/30 px-3 py-1.5 text-left font-semibold text-brand-cream hover:bg-brand-cream/10"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto flex min-h-full max-w-[1440px] md:min-h-[calc(100vh-8rem)]">
        <aside className="hidden w-72 flex-col border-r border-brand-cream/20 bg-brand-dark px-4 py-6 md:flex">
          <p className="px-3 text-xs font-bold uppercase tracking-widest text-brand-creamDark">Subscriber Portal</p>
          <div className="mt-4 flex-1">
            <NavLinks pathname={pathname} />
          </div>

          <div className="rounded-lg border border-brand-cream/20 bg-brand-dark/70 p-3">
            <p className="truncate text-xs text-brand-creamDark">{email ?? "Unknown user"}</p>
            <form action="/auth/logout" method="post" className="mt-3">
              <button
                type="submit"
                className="w-full rounded-md border border-brand-cream/30 px-3 py-2 text-left text-sm font-semibold text-brand-cream hover:bg-brand-cream/10"
              >
                Logout
              </button>
            </form>
          </div>
        </aside>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
