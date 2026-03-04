import PortalShell from "@/components/portal/PortalShell";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidElement } from "react";

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (isValidElement(children) && children.props && typeof children.props === "object" && "dataPage" in children.props) {
    const page = (children.props as { dataPage?: string }).dataPage;
    if (page === "gw-overview") {
      return children;
    }
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <PortalShell email={user?.email ?? null}>{children}</PortalShell>;
}
