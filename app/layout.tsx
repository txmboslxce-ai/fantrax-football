import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { isAdminEmail } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fantrax and Football",
  description: "The Fantrax Premier League fantasy podcast",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className="bg-brand-cream text-brand-dark antialiased">
        <div className="flex min-h-screen flex-col">
          <Navbar isLoggedIn={Boolean(user)} isAdmin={isAdminEmail(user?.email)} />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
