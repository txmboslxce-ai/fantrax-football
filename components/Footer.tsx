import Link from "next/link";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/episodes", label: "Episodes" },
  { href: "/articles", label: "Articles" },
  { href: "/contact", label: "Contact" },
  { href: "/login", label: "Login" },
];

const socialLinks = [
  { href: "#", label: "Twitter/X" },
  { href: "#", label: "Instagram" },
  { href: "#", label: "Spotify" },
  { href: "#", label: "Apple Podcasts" },
];

export default function Footer() {
  return (
    <footer className="bg-brand-greenDark text-brand-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="text-lg font-bold">Fantrax and Football</p>
          <p className="mt-2 text-sm text-brand-creamDark">Premier League fantasy insights, banter, and edge.</p>
        </div>

        <nav className="flex flex-col gap-2 text-sm md:items-center">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="md:justify-self-end">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-creamDark">Follow</p>
          <div className="flex flex-col gap-2 text-sm">
            {socialLinks.map((link) => (
              <a key={link.label} href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
