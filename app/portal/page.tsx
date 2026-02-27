import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const portalCards = [
  {
    href: "/portal/players",
    title: "Players",
    description: "Search the player pool and scout breakout options.",
  },
  {
    href: "/portal/compare",
    title: "Compare",
    description: "Stack players side by side across key fantasy metrics.",
  },
  {
    href: "/portal/fixtures",
    title: "Fixtures",
    description: "Plan transfers and waivers with fixture context.",
  },
  {
    href: "/portal/my-league",
    title: "My League",
    description: "Identify free-agent opportunities in your league.",
  },
];

export default async function PortalPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black sm:text-5xl">Welcome to the Portal</h1>
        <p className="mt-3 text-brand-creamDark">Signed in as: {user?.email ?? "Unknown user"}</p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {portalCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-xl bg-brand-green p-6 transition-colors hover:bg-brand-greenLight"
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
