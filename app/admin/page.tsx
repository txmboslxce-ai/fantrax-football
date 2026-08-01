import Link from "next/link";
import { isAdminEmail } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const adminLinks = [
  {
    href: "/admin/upload",
    title: "Upload Player Dump",
    description: "Upload weekly outfield CSV and process player gameweek stats.",
  },
  {
    href: "/admin/upload",
    title: "Upload Keeper Dump",
    description: "Upload weekly keeper CSV and process goalkeeper gameweek stats.",
  },
  {
    href: "/admin/fixtures",
    title: "Upload Fixtures",
    description: "Upload fixture key XLSX and upsert full season fixtures.",
  },
  {
    href: "/admin/teams",
    title: "Upload Teams",
    description: "Upload team map XLSX and upsert team definitions.",
  },
];

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-red-400/40 bg-red-950/20 p-6">
          <h1 className="text-2xl font-bold">Admin Access Required</h1>
          <p className="mt-2 text-sm text-brand-creamDark">Your account is not in `ADMIN_EMAILS`.</p>
        </div>
      </div>
    );
  }

  const [{ count: playersCount }, { count: gameweeksCount }, { count: fixturesCount }] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }),
    supabase.from("player_gameweeks").select("id", { count: "exact", head: true }),
    supabase.from("fixtures").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black sm:text-5xl">Admin Dashboard</h1>
        <p className="mt-3 text-brand-creamDark">Manage data imports for teams, fixtures, and weekly player dumps.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-brand-greenLight/50 bg-brand-green p-5">
            <p className="text-xs uppercase tracking-wider text-brand-creamDark">Players in DB</p>
            <p className="mt-2 text-3xl font-black">{playersCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-brand-greenLight/50 bg-brand-green p-5">
            <p className="text-xs uppercase tracking-wider text-brand-creamDark">Gameweek Rows</p>
            <p className="mt-2 text-3xl font-black">{gameweeksCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-brand-greenLight/50 bg-brand-green p-5">
            <p className="text-xs uppercase tracking-wider text-brand-creamDark">Fixtures</p>
            <p className="mt-2 text-3xl font-black">{fixturesCount ?? 0}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {adminLinks.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-xl border border-brand-greenLight/40 bg-brand-green p-6 transition-colors hover:bg-brand-greenLight"
            >
              <h2 className="text-2xl font-bold text-brand-cream">{card.title}</h2>
              <p className="mt-2 text-sm text-brand-creamDark">{card.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
