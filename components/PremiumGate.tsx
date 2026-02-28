import Link from "next/link";

type PremiumGateProps = {
  isPremium: boolean;
  children: React.ReactNode;
  message?: string;
};

export default function PremiumGate({
  isPremium,
  children,
  message = "This feature is available to Premium subscribers",
}: PremiumGateProps) {
  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[2px] opacity-55">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-brand-cream/25 bg-brand-dark/95 p-6 text-center text-brand-cream shadow-xl">
          <p className="text-base font-semibold">{message}</p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex rounded-md bg-brand-green px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
          >
            Upgrade to Premium
          </Link>
        </div>
      </div>
    </div>
  );
}
