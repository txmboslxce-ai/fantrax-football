import UploadClient from "./UploadClient";
import { isAdminEmail } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function AdminUploadPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-red-400/40 bg-red-950/20 p-6">
          <h1 className="text-2xl font-bold">Admin Access Required</h1>
          <p className="mt-2 text-sm text-brand-creamDark">Your account is not in `ADMIN_EMAILS`.</p>
        </div>
      </div>
    );
  }

  return <UploadClient />;
}
