export default function EpisodesPage() {
  return (
    <div className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black text-brand-dark sm:text-5xl">Episodes</h1>
        <p className="mt-4 max-w-3xl text-lg text-brand-dark/80">Weekly Premier League fantasy conversations focused on tactics, waivers, ranks, and real decisions for Fantrax managers.</p>

        <div className="mt-10 flex flex-row flex-wrap gap-4">
          <a
            href="https://open.spotify.com/show/2g6xYDAZvN1OIfJ5Hh1Tmn?si=3fe57265a1aa4f0d"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-brand-green text-brand-cream hover:bg-brand-greenLight px-8 py-4 rounded-lg font-semibold text-lg shadow-md transition-colors"
          >
            Listen on Spotify
          </a>
          <a
            href="https://podcasts.apple.com/us/podcast/fantrax-and-football/id1826549507"
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-brand-green bg-brand-creamDark text-brand-greenDark hover:bg-brand-cream px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
          >
            Listen on Apple Podcasts
          </a>
        </div>

        <div className="mt-14 rounded-2xl border border-brand-green/30 bg-brand-dark p-6 sm:p-8">
          <iframe
            width="100%"
            height="390"
            frameBorder="no"
            scrolling="no"
            seamless
            src="https://share.transistor.fm/e/fantrax-and-football/playlist"
          />
        </div>
      </div>
    </div>
  );
}
