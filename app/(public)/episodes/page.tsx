export default function EpisodesPage() {
  return (
    <div className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black text-brand-dark sm:text-5xl">Episodes</h1>
        <p className="mt-4 max-w-3xl text-lg text-brand-dark/80">Weekly Premier League fantasy conversations focused on tactics, waivers, ranks, and real decisions for Fantrax managers.</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a
            href="#"
            className="rounded-xl bg-brand-green px-8 py-6 text-center text-lg font-bold text-brand-cream shadow-md transition-colors hover:bg-brand-greenLight"
          >
            Listen on Spotify
          </a>
          <a
            href="#"
            className="rounded-xl border-2 border-brand-green bg-brand-creamDark px-8 py-6 text-center text-lg font-bold text-brand-greenDark transition-colors hover:bg-brand-cream"
          >
            Listen on Apple Podcasts
          </a>
        </div>

        <section className="mt-14 rounded-2xl border border-dashed border-brand-green/40 bg-white p-10 text-center">
          <h2 className="text-2xl font-bold text-brand-greenDark">Latest Episodes - coming soon</h2>
          <p className="mt-3 text-brand-dark/70">Episode cards and embedded players will be added here next.</p>
        </section>
      </div>
    </div>
  );
}
