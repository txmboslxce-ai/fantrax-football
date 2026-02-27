export default function ArticlesPage() {
  const articles = [
    "Top Waiver Targets for Gameweek 1",
    "Breakout Midfielders to Watch",
    "Defender Rotation Strategy for Fantrax",
  ];

  return (
    <div className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black text-brand-dark sm:text-5xl">Articles</h1>
        <p className="mt-4 text-lg text-brand-dark/80">Waiver wire tips, player analysis and more</p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {articles.map((title) => (
            <article key={title} className="rounded-xl border border-brand-green/30 bg-white p-6 shadow-sm">
              <span className="inline-block rounded-full bg-brand-green px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-cream">Coming soon</span>
              <h2 className="mt-4 text-xl font-semibold text-brand-greenDark">{title}</h2>
              <p className="mt-3 text-sm text-brand-dark/75">Full write-up and tactical detail will land here shortly.</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
