"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken] = useState(() => ({
    code: searchParams.get("code"),
    tokenHash: searchParams.get("token_hash"),
    tokenType: searchParams.get("type"),
  }));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasResetToken = Boolean(resetToken.code || (resetToken.tokenHash && resetToken.tokenType === "recovery"));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    if (!hasResetToken) {
      setError("This reset link is invalid or has expired. Request a new reset link and try again.");
      setIsSubmitting(false);
      return;
    }

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        isSingleton: false,
        auth: {
          detectSessionInUrl: false,
          flowType: "implicit",
          storageKey: "sb-reset-password-flow",
        },
      }
    );
    const { error: exchangeError } = resetToken.code
      ? await supabase.auth.exchangeCodeForSession(resetToken.code)
      : await supabase.auth.verifyOtp({ type: "recovery", token_hash: resetToken.tokenHash! });

    if (exchangeError) {
      setIsSubmitting(false);
      setError("This reset link is invalid or has expired. Request a new reset link and try again.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    setIsSubmitting(false);

    if (updateError) {
      setError("This reset link is invalid or has expired. Request a new reset link and try again.");
      return;
    }

    setSuccess("Your password has been updated successfully.");
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
          <p className="mt-1 text-sm text-brand-greenDark">Choose a new password</p>
        </div>

        {!hasResetToken ? (
          <div className="space-y-4 text-center">
            <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">This reset link is invalid. Request a new one.</p>
            <Link href="/forgot-password" className="font-semibold text-brand-green underline underline-offset-2">
              Request a new reset link
            </Link>
          </div>
        ) : !success ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-brand-dark">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-lg border border-brand-creamDark bg-white px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
                placeholder="Create a new password"
              />
            </div>
            <div>
              <label htmlFor="confirm-new-password" className="mb-2 block text-sm font-semibold text-brand-dark">
                Confirm New Password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-brand-creamDark bg-white px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
                placeholder="Confirm your new password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-70"
            >
              {isSubmitting ? "Updating Password..." : "Update Password"}
            </button>
          </form>
        ) : (
          <Link
            href="/portal"
            className="block w-full rounded-lg bg-brand-green px-6 py-3 text-center font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
          >
            Go to Portal
          </Link>
        )}

        {error && <p className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="mt-4 rounded-md bg-green-100 px-3 py-2 text-sm text-green-700">{success}</p>}

        {error && (
          <p className="mt-6 text-center text-sm text-brand-greenDark">
            <Link href="/forgot-password" className="font-semibold text-brand-green underline underline-offset-2">
              Request a new reset link
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
