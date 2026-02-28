export function isPremiumUserEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const raw = process.env.PREMIUM_USERS ?? "";
  if (!raw.trim()) {
    return false;
  }

  const premiumEmails = new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );

  return premiumEmails.has(email.toLowerCase());
}
