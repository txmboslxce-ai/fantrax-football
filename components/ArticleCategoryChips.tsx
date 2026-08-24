"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ARTICLE_CATEGORIES } from "@/lib/articles";

export default function ArticleCategoryChips() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("category");

  const chip =
    "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors";
  const activeChip = "bg-brand-green text-brand-cream";
  const idleChip =
    "bg-white text-brand-greenDark border border-brand-green/30 hover:bg-brand-cream";

  const hrefFor = (category: string | null) =>
    category ? `${pathname}?category=${encodeURIComponent(category)}` : pathname;

  return (
    <div className="mt-8 flex flex-wrap gap-2">
      <Link href={hrefFor(null)} className={`${chip} ${!active ? activeChip : idleChip}`}>
        All
      </Link>
      {ARTICLE_CATEGORIES.map((category) => (
        <Link
          key={category}
          href={hrefFor(category)}
          className={`${chip} ${active === category ? activeChip : idleChip}`}
        >
          {category}
        </Link>
      ))}
    </div>
  );
}
