import Link from "next/link";
import { fetchPremierLeagueTransfers, type Transfer } from "@/lib/transfers/bzzoiro";

const TRANSFER_WINDOW_START = "2026-06-01";
const PAGE_SIZE = 25;

type TransfersPageProps = {
  searchParams?: { offset?: string | string[] } | Promise<{ offset?: string | string[] }>;
};

function parseOffset(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function transferBadge(transfer: Transfer): { label: string; className: string } {
  if (transfer.transferType === 1) {
    return { label: "Loan", className: "bg-amber-200 text-amber-950" };
  }
  if (transfer.feeEur === 0) {
    return { label: "Free", className: "bg-brand-cream/60 text-brand-dark" };
  }
  return { label: "Transfer", className: "bg-brand-greenLight/20 text-brand-greenDark" };
}

function feeDisplay(transfer: Transfer): string {
  if (transfer.feeEur > 0) {
    return transfer.feeDescription;
  }
  if (transfer.feeDescription === "Free") {
    return "Free";
  }
  return "";
}

export default async function TransfersPage({ searchParams }: TransfersPageProps) {
  const resolvedSearchParams = searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;
  const offset = parseOffset(resolvedSearchParams?.offset);

  const { transfers, total } = await fetchPremierLeagueTransfers({
    dateFrom: TRANSFER_WINDOW_START,
    limit: PAGE_SIZE,
    offset,
  });

  const hasPrevious = offset > 0;
  const hasNext = offset + transfers.length < total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Premier League Transfers</h1>
        <p className="mt-2 text-sm text-brand-dark/70">
          Every Premier League move since 1 June 2026 &mdash; {total.toLocaleString("en-GB")} total.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-creamDark bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brand-creamDark">
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-dark/60">Player</th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-dark/60">Move</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-brand-dark/60">Fee</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-brand-dark/60">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-creamDark">
            {transfers.map((transfer) => {
              const badge = transferBadge(transfer);
              return (
                <tr key={transfer.id} className="hover:bg-brand-cream/40">
                  <td className="px-4 py-2">
                    <span className="font-semibold text-brand-dark">{transfer.playerName}</span>{" "}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-2 text-sm text-brand-dark/70">
                    {transfer.fromTeamName ?? "Unattached"}
                    <span className="mx-2 text-brand-dark/40">&rarr;</span>
                    {transfer.toTeamName ?? "No team"}
                  </td>
                  <td className={`px-4 py-2 text-right text-sm ${transfer.feeEur > 0 ? "font-semibold text-brand-greenLight" : "text-brand-dark/60"}`}>
                    {feeDisplay(transfer)}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-brand-dark/60">{formatDate(transfer.transferDate)}</td>
                </tr>
              );
            })}
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-brand-dark/60">
                  No transfers found in this window.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-brand-dark/70">
        <span>
          Showing {total === 0 ? 0 : offset + 1}&ndash;{offset + transfers.length} of {total.toLocaleString("en-GB")}
        </span>
        <div className="flex gap-2">
          <Link
            href={`/portal/transfers?offset=${Math.max(0, offset - PAGE_SIZE)}`}
            aria-disabled={!hasPrevious}
            className={`rounded-full border px-4 py-2 font-semibold transition-colors ${
              hasPrevious
                ? "border-brand-dark/20 bg-white text-brand-dark hover:bg-brand-cream"
                : "pointer-events-none border-brand-dark/10 bg-brand-cream/40 text-brand-dark/30"
            }`}
          >
            Previous
          </Link>
          <Link
            href={`/portal/transfers?offset=${offset + PAGE_SIZE}`}
            aria-disabled={!hasNext}
            className={`rounded-full border px-4 py-2 font-semibold transition-colors ${
              hasNext
                ? "border-brand-dark/20 bg-white text-brand-dark hover:bg-brand-cream"
                : "pointer-events-none border-brand-dark/10 bg-brand-cream/40 text-brand-dark/30"
            }`}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}
