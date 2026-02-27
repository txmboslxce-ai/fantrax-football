export default function ContactPage() {
  return (
    <div className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-black text-brand-dark sm:text-5xl">Get in Touch</h1>

        <form className="mt-8 space-y-5 rounded-2xl border border-brand-green/25 bg-white p-8 shadow-sm">
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-semibold text-brand-dark">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="w-full rounded-md border border-brand-creamDark bg-brand-cream px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold text-brand-dark">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full rounded-md border border-brand-creamDark bg-brand-cream px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="message" className="mb-2 block text-sm font-semibold text-brand-dark">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              rows={6}
              className="w-full rounded-md border border-brand-creamDark bg-brand-cream px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
              placeholder="Drop us your question, topic request, or feedback"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
          >
            Submit
          </button>
        </form>

        <section className="mt-10 rounded-2xl bg-brand-dark p-6 text-brand-cream">
          <h2 className="text-xl font-bold">Follow the show</h2>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <a href="#" className="rounded-md bg-brand-green/30 px-3 py-2 transition-colors hover:bg-brand-green/50">Twitter/X</a>
            <a href="#" className="rounded-md bg-brand-green/30 px-3 py-2 transition-colors hover:bg-brand-green/50">Instagram</a>
            <a href="#" className="rounded-md bg-brand-green/30 px-3 py-2 transition-colors hover:bg-brand-green/50">Spotify</a>
            <a href="#" className="rounded-md bg-brand-green/30 px-3 py-2 transition-colors hover:bg-brand-green/50">Apple Podcasts</a>
          </div>
        </section>
      </div>
    </div>
  );
}
