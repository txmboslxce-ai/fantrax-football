import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-160px)] items-center justify-center bg-brand-dark text-brand-cream">
          Loading...
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
