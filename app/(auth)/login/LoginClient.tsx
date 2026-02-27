"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

function formatAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }

  if (normalized.includes("password")) {
    return message;
  }

  return "Something went wrong. Please try again.";
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [showSignUp, setShowSignUp] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = searchParams.get("next") || "/portal";

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    setIsSubmitting(false);

    if (signInError) {
      setError(formatAuthError(signInError.message));
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (signUpPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: signUpEmail,
      password: signUpPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setIsSubmitting(false);

    if (signUpError) {
      setError(formatAuthError(signUpError.message));
      return;
    }

    if (data.session) {
      router.push(redirectTo);
      router.refresh();
      return;
    }

    setSuccess("Account created. Check your email to confirm your account, then sign in.");
    setShowSignUp(false);
  }

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center bg-brand-dark px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-2xl border border-brand-green/40 bg-brand-cream p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo.jpeg"
            alt="Fantrax and Football"
            width={84}
            height={84}
            className="rounded-full border-2 border-brand-green/50 object-cover"
          />
          <h1 className="mt-4 text-2xl font-black text-brand-dark">Fantrax and Football</h1>
          <p className="mt-1 text-sm text-brand-greenDark">Sign in to access the Portal</p>
        </div>

        {!showSignUp ? (
          <form className="space-y-4" onSubmit={handleSignIn}>
            <div>
              <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-brand-dark">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className="w-full rounded-lg border border-brand-creamDark bg-white px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-brand-dark">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="w-full rounded-lg border border-brand-creamDark bg-white px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
                placeholder="Your password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-70"
            >
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleSignUp}>
            <div>
              <label htmlFor="signup-email" className="mb-2 block text-sm font-semibold text-brand-dark">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                required
                value={signUpEmail}
                onChange={(event) => setSignUpEmail(event.target.value)}
                className="w-full rounded-lg border border-brand-creamDark bg-white px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-2 block text-sm font-semibold text-brand-dark">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                required
                value={signUpPassword}
                onChange={(event) => setSignUpPassword(event.target.value)}
                className="w-full rounded-lg border border-brand-creamDark bg-white px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
                placeholder="Create a password"
              />
            </div>
            <div>
              <label htmlFor="signup-confirm-password" className="mb-2 block text-sm font-semibold text-brand-dark">
                Confirm Password
              </label>
              <input
                id="signup-confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-brand-creamDark bg-white px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
                placeholder="Confirm your password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-70"
            >
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </button>
          </form>
        )}

        {error && <p className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="mt-4 rounded-md bg-green-100 px-3 py-2 text-sm text-green-700">{success}</p>}

        <p className="mt-6 text-center text-sm text-brand-greenDark">
          {!showSignUp ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setShowSignUp((prev) => !prev);
              setError(null);
              setSuccess(null);
            }}
            className="font-semibold text-brand-green underline underline-offset-2"
          >
            {!showSignUp ? "Sign up" : "Sign in"}
          </button>
        </p>

        <p className="mt-4 text-center text-xs text-brand-greenDark">
          Looking for plans?{" "}
          <Link href="/pricing" className="font-semibold underline underline-offset-2">
            View pricing
          </Link>
        </p>
      </div>
    </div>
  );
}
