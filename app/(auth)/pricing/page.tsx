import Link from "next/link";

const freeFeatures = [
  "Browse player stats",
  "Search players",
  "View teams and fixtures",
  "Access episodes and articles",
];

const premiumFeatures = [
  "Everything in Free",
  "Full player pages",
  "Ghost points analysis",
  "Compare players",
  "Detailed stats",
  "My League free agent tool",
];

export default function PricingPage() {
  return (
    <div className="bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-center text-4xl font-black sm:text-5xl">Pricing</h1>
        <p className="mt-4 text-center text-brand-creamDark">Choose your Fantrax and Football membership tier.</p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-brand-cream/20 bg-brand-dark p-8">
            <h2 className="text-2xl font-bold">Free</h2>
            <p className="mt-2 text-4xl font-black">£0/month</p>
            <ul className="mt-6 space-y-2 text-brand-creamDark">
              {freeFeatures.map((feature) => (
                <li key={feature}>- {feature}</li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-8 inline-block rounded-lg bg-brand-cream px-6 py-3 font-semibold text-brand-dark transition-colors hover:bg-brand-creamDark"
            >
              Sign Up Free
            </Link>
          </article>

          <article className="relative rounded-2xl border-2 border-brand-green bg-brand-dark p-8 shadow-xl shadow-brand-green/20">
            <span className="absolute -top-3 right-6 rounded-full bg-brand-green px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-cream">
              Most Popular
            </span>
            <h2 className="text-2xl font-bold">Premium</h2>
            <p className="mt-2 text-4xl font-black">£X/month</p>
            <ul className="mt-6 space-y-2 text-brand-creamDark">
              {premiumFeatures.map((feature) => (
                <li key={feature}>- {feature}</li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-8 rounded-lg bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
            >
              Get Premium
            </button>
          </article>
        </div>
      </div>
    </div>
  );
}
