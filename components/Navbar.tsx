"use client";

import { createClient } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NavbarProps = {
  isLoggedIn: boolean;
};

type PlayerSearchRow = {
  id: string;
  name: string;
};

type TeamSearchRow = {
  abbrev: string;
  name: string | null;
  full_name: string | null;
};

type SearchResult =
  | {
      type: "player";
      id: string;
      label: string;
      href: string;
    }
  | {
      type: "team";
      id: string;
      label: string;
      href: string;
    };

const links = [
  { href: "/", label: "Home" },
  { href: "/episodes", label: "Episodes" },
  { href: "/articles", label: "Articles" },
  { href: "/contact", label: "Contact" },
];

function normalizeSearchTerm(value: string): string {
  return value.trim().replace(/[%_,]/g, " ");
}

function PortalSearch({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const runSearch = useCallback(
    async (value: string) => {
      const normalized = normalizeSearchTerm(value);
      if (!normalized) {
        setResults([]);
        setShowDropdown(false);
        return;
      }

      setIsLoading(true);
      const pattern = `%${normalized}%`;

      const [playersResponse, teamsResponse] = await Promise.all([
        supabase.from("players").select("id, name").ilike("name", pattern).order("name").limit(5),
        supabase
          .from("teams")
          .select("abbrev, name, full_name")
          .or(`name.ilike.${pattern},full_name.ilike.${pattern}`)
          .order("full_name")
          .limit(5),
      ]);

      if (playersResponse.error || teamsResponse.error) {
        setResults([]);
        setShowDropdown(true);
        setIsLoading(false);
        return;
      }

      const playerResults = ((playersResponse.data ?? []) as PlayerSearchRow[]).map((player) => ({
        type: "player" as const,
        id: player.id,
        label: player.name,
        href: `/portal/players/${player.id}`,
      }));

      const teamResults = ((teamsResponse.data ?? []) as TeamSearchRow[]).map((team) => ({
        type: "team" as const,
        id: team.abbrev,
        label: team.full_name || team.name || team.abbrev,
        href: `/portal/teams?team=${encodeURIComponent(team.abbrev)}`,
      }));

      const mergedResults = [...playerResults, ...teamResults]
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, 5);

      setResults(mergedResults);
      setShowDropdown(true);
      setIsLoading(false);
    },
    [supabase]
  );

  const handleSelect = useCallback(
    (href: string) => {
      setShowDropdown(false);
      setResults([]);
      router.push(href);
      onNavigate?.();
    },
    [onNavigate, router]
  );

  return (
    <div ref={containerRef} className={compact ? "relative w-full" : "relative w-64"}>
      <input
        type="search"
        value={query}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          const normalized = normalizeSearchTerm(nextValue);
          if (normalized.length >= 2) {
            void runSearch(normalized);
          } else {
            setResults([]);
            setShowDropdown(false);
          }
        }}
        onFocus={() => {
          const normalized = normalizeSearchTerm(query);
          if (normalized.length >= 2) {
            void runSearch(normalized);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void runSearch(query);
          }
        }}
        placeholder="Search players or teams"
        className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-sm text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none"
        aria-label="Search players and teams"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-md border border-brand-cream/20 bg-brand-dark shadow-lg">
          {isLoading ? (
            <p className="px-3 py-2 text-xs text-brand-creamDark">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-brand-creamDark">No results</p>
          ) : (
            results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                onClick={() => handleSelect(result.href)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-brand-cream transition-colors hover:bg-brand-green/20"
              >
                <span className="truncate">{result.label}</span>
                <span className="ml-3 shrink-0 text-xs uppercase text-brand-creamDark">{result.type}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Navbar({ isLoggedIn }: NavbarProps) {
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
          {isLoggedIn ? (
            <PortalSearch />
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
            >
              Login
            </Link>
          )}
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
            {isLoggedIn ? (
              <div className="mt-2">
                <PortalSearch compact onNavigate={() => setIsOpen(false)} />
              </div>
            ) : (
              <Link
                href="/login"
                className="mt-2 w-fit rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream"
                onClick={() => setIsOpen(false)}
              >
                Login
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
