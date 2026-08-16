import { Suspense } from "react";
import ForgotPasswordClient from "./ForgotPasswordClient";

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-160px)] items-center justify-center bg-brand-dark text-brand-cream">
          Loading...
        </div>
      }
    >
      <ForgotPasswordClient />
    </Suspense>
  );
}
