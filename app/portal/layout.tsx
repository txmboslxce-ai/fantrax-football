import PortalShell from "@/components/portal/PortalShell";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <PortalShell email={user?.email ?? null}>{children}</PortalShell>;
}
