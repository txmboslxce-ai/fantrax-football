import type { Metadata } from "next";
import { Inter, League_Spartan } from "next/font/google";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { isAdminEmail } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isWriter } from "@/lib/writer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  variable: "--font-league-spartan",
});

export const metadata: Metadata = {
  title: "Draft Academical",
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
  const writer = user ? await isWriter(supabase, user.id) : false;

  return (
    <html lang="en">
      <body className={`${inter.variable} ${leagueSpartan.variable} bg-brand-cream font-sans text-brand-dark antialiased`}>
        <div className="flex min-h-screen flex-col">
          <Navbar isLoggedIn={Boolean(user)} isAdmin={isAdminEmail(user?.email)} isWriter={writer} />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
