import { redirect } from "next/navigation";

type PageProps = {
  searchParams?:
    | {
        startGw?: string | string[];
      }
    | Promise<{
        startGw?: string | string[];
      }>;
};

export default async function GWOverviewPage({ searchParams }: PageProps) {
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;

  const rawStartGw = Array.isArray(resolvedSearchParams?.startGw)
    ? resolvedSearchParams.startGw[0]
    : resolvedSearchParams?.startGw;

  if (rawStartGw) {
    redirect(`/portal/players?tab=form&startGw=${encodeURIComponent(rawStartGw)}`);
  }

  redirect("/portal/players?tab=form");
}
