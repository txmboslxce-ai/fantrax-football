import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <section className="bg-brand-green px-4 py-20 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-brand-creamDark">Fantasy Premier League Podcast</p>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">Fantrax and Football</h1>
            <p className="mt-5 max-w-2xl text-lg text-brand-creamDark">The Fantrax Premier League fantasy podcast</p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href="#"
              className="rounded-md bg-brand-dark px-6 py-3 text-center font-semibold text-brand-cream transition-colors hover:bg-black"
            >
              Listen on Spotify
            </a>
            <a
              href="#"
              className="rounded-md border border-brand-cream/70 px-6 py-3 text-center font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
            >
              Listen on Apple Podcasts
            </a>
          </div>
        </div>
      </section>

      <section className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-brand-dark">What we cover</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <article className="rounded-xl border border-brand-green/20 border-l-4 border-brand-green bg-white p-6 pl-4 shadow-sm">
              <h3 className="text-xl font-semibold text-brand-greenDark">Fantasy Tactics</h3>
              <p className="mt-3 text-sm leading-6 text-brand-dark/80">Captain picks, chip strategy, fixture swings, and weekly decision frameworks that help you stay ahead.</p>
            </article>
            <article className="rounded-xl border border-brand-green/20 border-l-4 border-brand-green bg-brand-creamDark/40 p-6 pl-4 shadow-sm">
              <h3 className="text-xl font-semibold text-brand-greenDark">Waiver Wire</h3>
              <p className="mt-3 text-sm leading-6 text-brand-dark/80">Target priority adds, under-the-radar assets, and streamers to win your Fantrax matchups.</p>
            </article>
            <article className="rounded-xl border border-brand-green/20 border-l-4 border-brand-green bg-white p-6 pl-4 shadow-sm">
              <h3 className="text-xl font-semibold text-brand-greenDark">Player Analysis</h3>
              <p className="mt-3 text-sm leading-6 text-brand-dark/80">Data-driven breakdowns mixed with football context so you can trust your picks with confidence.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold">Join the Portal</h2>
            <p className="mt-3 max-w-2xl text-brand-creamDark">Get premium waiver notes, rankings, and community access built for serious fantasy managers.</p>
          </div>
          <Link
            href="/pricing"
            className="rounded-md bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
          >
            View Portal Plans
          </Link>
        </div>
      </section>
    </div>
  );
}
