"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase";

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setIsSubmitting(false);

    if (resetError) {
      setError("We couldn't send a reset link right now. Please try again shortly.");
      return;
    }

    setSuccess("If an account exists for that email, a reset link is on its way.");
  }

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center bg-brand-dark px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-2xl border border-brand-green/40 bg-brand-cream p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo-mark.png"
            alt="Draft Academical"
            width={84}
            height={84}
            className="rounded-xl border-2 border-brand-green/50 object-cover"
          />
          <h1 className="mt-4 text-2xl font-black text-brand-dark">Draft Academical</h1>
          <p className="mt-1 text-sm text-brand-dark/70">Home of the Fantrax and Football podcast</p>
          <p className="mt-1 text-sm text-brand-greenDark">Reset your Portal password</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="reset-email" className="mb-2 block text-sm font-semibold text-brand-dark">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-brand-creamDark bg-white px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-70"
          >
            {isSubmitting ? "Sending Reset Link..." : "Send Reset Link"}
          </button>
        </form>

        {error && <p className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="mt-4 rounded-md bg-green-100 px-3 py-2 text-sm text-green-700">{success}</p>}

        <p className="mt-6 text-center text-sm text-brand-greenDark">
          <Link href="/login" className="font-semibold text-brand-green underline underline-offset-2">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
