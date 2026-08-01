import { redirect } from "next/navigation";
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

  if (!user) {
    redirect("/login?next=/portal");
  }

  return (
    <PortalShell email={user.email ?? null}>
      {children}
    </PortalShell>
  );
}
