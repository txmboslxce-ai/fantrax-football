import PortalShell from "@/components/portal/PortalShell";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <PortalShell email={user?.email ?? null} isAdmin={isAdminEmail(user?.email)}>
      {children}
    </PortalShell>
  );
}
