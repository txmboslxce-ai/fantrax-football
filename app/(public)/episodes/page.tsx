export default function EpisodesPage() {
  return (
    <div className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black text-brand-dark sm:text-5xl">Episodes</h1>
        <p className="mt-4 max-w-3xl text-lg text-brand-dark/80">Weekly Premier League fantasy conversations focused on tactics, waivers, ranks, and real decisions for Fantrax managers.</p>

        <div className="mt-10 flex flex-row flex-wrap gap-4">
          <a
            href="#"
            className="bg-brand-green text-brand-cream hover:bg-brand-greenLight px-8 py-4 rounded-lg font-semibold text-lg shadow-md transition-colors"
          >
            Listen on Spotify
          </a>
          <a
            href="#"
            className="border-2 border-brand-green bg-brand-creamDark text-brand-greenDark hover:bg-brand-cream px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
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
