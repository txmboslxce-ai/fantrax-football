import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const nextParam = requestUrl.searchParams.get("next");
  const nextPath =
    nextParam === "/reset-password" || nextParam?.startsWith("/portal") ? nextParam ?? "/portal" : "/portal";

  if ((tokenHash && type) || code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash: tokenHash,
      });

      if (error) {
        const loginUrl = new URL("/login", requestUrl.origin);
        loginUrl.searchParams.set("error", "auth_callback_failed");
        return NextResponse.redirect(loginUrl);
      }
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        const loginUrl = new URL("/login", requestUrl.origin);
        loginUrl.searchParams.set("error", "auth_callback_failed");
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
