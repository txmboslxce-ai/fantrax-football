"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/episodes", label: "Episodes" },
  { href: "/articles", label: "Articles" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-brand-green/40 bg-brand-dark text-brand-cream">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Fantrax and Football home">
          <Image
            src="/logo.jpeg"
            alt="Fantrax and Football logo"
            width={44}
            height={44}
            className="h-11 w-11 rounded-full border border-brand-cream/30 object-cover"
            priority
          />
          <span className="text-sm font-semibold tracking-wide sm:text-base">Fantrax and Football</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-brand-greenLight">
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
          >
            Login
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-brand-cream/30 md:hidden"
          aria-expanded={isOpen}
          aria-label="Toggle navigation menu"
        >
          <span className="text-2xl leading-none">{isOpen ? "\u00d7" : "\u2261"}</span>
        </button>
      </div>

      {isOpen && (
        <nav className="border-t border-brand-green/40 bg-brand-dark px-4 py-4 md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-2 py-2 transition-colors hover:bg-brand-green/20"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="mt-2 w-fit rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream"
              onClick={() => setIsOpen(false)}
            >
              Login
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
