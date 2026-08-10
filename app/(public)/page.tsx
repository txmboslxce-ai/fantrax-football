import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <section className="bg-brand-green px-4 py-20 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          <article className="flex min-h-full flex-col rounded-2xl border border-brand-cream/30 bg-brand-greenDark p-6 sm:p-8">
            <h1 className="sr-only">Draft Academical</h1>
            <Image
              src="/logo-lockup.png"
              alt="Draft Academical — Data. Debate. Decisions."
              width={1536}
              height={1024}
              className="mx-auto w-full max-w-md object-contain"
              priority
            />
            <p className="mt-5 text-lg text-brand-creamDark">The tools, stats, and analysis behind every decision.</p>
            <Link
              href="/login"
              className="mt-auto inline-flex w-fit rounded-md bg-brand-cream px-6 py-3 font-semibold text-brand-greenDark transition-colors hover:bg-white"
            >
              Sign In / Sign Up
            </Link>
          </article>

          <article className="flex min-h-full flex-col rounded-2xl border border-brand-cream/30 bg-brand-greenDark p-6 sm:p-8">
            <Image
              src="/logo.jpeg"
              alt="Fantrax and Football podcast"
              width={1179}
              height={1156}
              quality={95}
              className="h-36 w-36 rounded-xl object-cover"
            />
            <h2 className="mt-5 text-2xl font-black">Fantrax and Football</h2>
            <p className="mt-3 text-brand-creamDark">Weekly Premier League fantasy conversations focused on tactics, waivers, ranks, and real decisions for Fantrax managers.</p>
            <div className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row">
              <a
                href="https://open.spotify.com/show/2g6xYDAZvN1OIfJ5Hh1Tmn?si=3fe57265a1aa4f0d"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-brand-dark px-6 py-3 text-center font-semibold text-brand-cream transition-colors hover:bg-black"
              >
                Listen on Spotify
              </a>
              <a
                href="https://podcasts.apple.com/us/podcast/fantrax-and-football/id1826549507"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-brand-cream/70 px-6 py-3 text-center font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
              >
                Listen on Apple Podcasts
              </a>
            </div>
          </article>
        </div>
      </section>

      <section className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-brand-dark">What we cover</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-brand-green/20 border-l-4 border-brand-green bg-white p-6 pl-4 shadow-sm">
              <h3 className="text-xl font-semibold text-brand-greenDark">Draft Tool</h3>
              <p className="mt-3 text-sm leading-6 text-brand-dark/80">Rank every eligible player by ADP or your own custom order, track who&apos;s picked, and build your watchlist before draft day — all saved automatically.</p>
            </article>
            <article className="rounded-xl border border-brand-green/20 border-l-4 border-brand-green bg-brand-creamDark/40 p-6 pl-4 shadow-sm">
              <h3 className="text-xl font-semibold text-brand-greenDark">My League</h3>
              <p className="mt-3 text-sm leading-6 text-brand-dark/80">Connect your Fantrax league and see exactly which players are available in your waiver pool. The same data the podcast uses to identify the best pickups, surfaced for your specific league.</p>
            </article>
            <article className="rounded-xl border border-brand-green/20 border-l-4 border-brand-green bg-white p-6 pl-4 shadow-sm">
              <h3 className="text-xl font-semibold text-brand-greenDark">Player & Team Stats</h3>
              <p className="mt-3 text-sm leading-6 text-brand-dark/80">Full per-90 stat breakdowns, gameweek history, and points conceded by opponent. Everything you need to analyse any player or fixture in the league.</p>
            </article>
            <article className="rounded-xl border border-brand-green/20 border-l-4 border-brand-green bg-brand-creamDark/40 p-6 pl-4 shadow-sm">
              <h3 className="text-xl font-semibold text-brand-greenDark">Compare</h3>
              <p className="mt-3 text-sm leading-6 text-brand-dark/80">Put two to four players side by side and see how they stack up — season points, ghost points, attacking and defensive output, visualized on a radar chart against the full player pool.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold">Join the Portal</h2>
            <p className="mt-3 max-w-2xl text-brand-creamDark">The data behind the podcast, built into a tool for your Fantrax league.</p>
          </div>
          <Link
            href="/login"
            className="rounded-md bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
          >
            Sign In / Sign Up
          </Link>
        </div>
      </section>
    </div>
  );
}
