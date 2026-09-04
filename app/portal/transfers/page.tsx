import Link from "next/link";
import { fetchPremierLeagueTransfers, TRANSFER_WINDOW_START, type Transfer } from "@/lib/transfers/bzzoiro";
import { fetchBsdPlayerPositions } from "@/lib/bsd/players";
import { BSD_TEAM_ID_TO_ABBREV } from "@/lib/bsd/teams";
import { positionBadgeClass } from "@/lib/portal/positionBadge";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const PAGE_SIZE = 25;

type TransfersPageProps = {
  searchParams?: { offset?: string | string[] } | Promise<{ offset?: string | string[] }>;
};

type FantraxPlayerMatch = {
  id: string;
  position: string;
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

function feeCell(transfer: Transfer): { text: string; className: string } {
  if (transfer.transferType === 1) {
    return { text: "Loan", className: "font-semibold text-amber-600" };
  }
  if (transfer.feeEur > 0) {
    return { text: transfer.feeDescription, className: "font-semibold text-brand-green" };
  }
  if (transfer.feeDescription === "Free") {
    return { text: "Free", className: "text-slate-600" };
  }
  return { text: "-", className: "text-slate-400" };
}

function TeamCell({ teamId, teamName, fallback }: { teamId: number | null; teamName: string | null; fallback: string }) {
  const abbrev = teamId != null ? BSD_TEAM_ID_TO_ABBREV[teamId] : undefined;
  const label = teamName ?? fallback;

  if (abbrev) {
    return (
      <Link href={`/portal/teams/${abbrev}`} className="font-semibold text-brand-green hover:underline">
        {label}
      </Link>
    );
  }

  return <span className="text-slate-600">{label}</span>;
}

export default async function TransfersPage({ searchParams }: TransfersPageProps) {
  const resolvedSearchParams = searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;
  const offset = parseOffset(resolvedSearchParams?.offset);

  const { transfers, total } = await fetchPremierLeagueTransfers({
    dateFrom: TRANSFER_WINDOW_START,
    limit: PAGE_SIZE,
    offset,
  });

  const bsdPlayerIds = transfers.map((transfer) => transfer.playerId);

  // BSD player ids not present in fantraxByBsdId either aren't in our
  // Fantrax player pool at all, or haven't been matched yet via
  // /admin/bsd-player-mapping -- either way the name renders as plain text
  // until that's resolved, per the same reasoning below.
  const supabase = await createServerSupabaseClient();
  const [{ data: mappedPlayers }, bsdPositionByPlayerId] = await Promise.all([
    bsdPlayerIds.length ? supabase.from("players").select("id, bsd_id, position").in("bsd_id", bsdPlayerIds) : Promise.resolve({ data: [] }),
    fetchBsdPlayerPositions(bsdPlayerIds),
  ]);

  const fantraxByBsdId = new Map<number, FantraxPlayerMatch>(
    (mappedPlayers ?? []).map((player) => [player.bsd_id as number, { id: player.id as string, position: player.position as string }])
  );

  const hasPrevious = offset > 0;
  const hasNext = offset + transfers.length < total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Premier League Transfers</h1>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th className="border-b border-brand-cream/25 bg-brand-green px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">From</th>
              <th className="border-b border-brand-cream/25 bg-brand-green px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">To</th>
              <th className="border-b border-brand-cream/25 bg-brand-green px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">Player</th>
              <th className="border-b border-brand-cream/25 bg-brand-green px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">Fantrax Pos</th>
              <th className="border-b border-brand-cream/25 bg-brand-green px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">BSD Pos</th>
              <th className="border-b border-brand-cream/25 bg-brand-green px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Fee</th>
              <th className="border-b border-brand-cream/25 bg-brand-green px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Date</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer, index) => {
              const fantraxMatch = fantraxByBsdId.get(transfer.playerId);
              const bsdPosition = bsdPositionByPlayerId.get(transfer.playerId);
              const fee = feeCell(transfer);
              const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";

              return (
                <tr key={transfer.id} className={`${rowShade} text-brand-dark`}>
                  <td className="border-b border-slate-200 px-3 py-2">
                    <TeamCell teamId={transfer.fromTeamId} teamName={transfer.fromTeamName} fallback="Unattached" />
                  </td>
                  <td className="border-b border-slate-200 px-3 py-2">
                    <TeamCell teamId={transfer.toTeamId} teamName={transfer.toTeamName} fallback="No team" />
                  </td>
                  <td className="border-b border-slate-200 px-3 py-2">
                    {fantraxMatch ? (
                      <Link href={`/portal/players/${fantraxMatch.id}`} className="font-semibold text-brand-dark hover:underline">
                        {transfer.playerName}
                      </Link>
                    ) : (
                      <span className="font-normal text-brand-dark">{transfer.playerName}</span>
                    )}
                  </td>
                  <td className="border-b border-slate-200 px-3 py-2 text-center">
                    {fantraxMatch ? (
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${positionBadgeClass(fantraxMatch.position)}`}>
                        {fantraxMatch.position.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="border-b border-slate-200 px-3 py-2 text-center text-slate-600">{bsdPosition ?? "-"}</td>
                  <td className={`border-b border-slate-200 px-3 py-2 text-right ${fee.className}`}>{fee.text}</td>
                  <td className="border-b border-slate-200 px-3 py-2 text-right text-slate-600">{formatDate(transfer.transferDate)}</td>
                </tr>
              );
            })}
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={7} className="border-b border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-500">
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
