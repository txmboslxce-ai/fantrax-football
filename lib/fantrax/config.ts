function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Set it in .env.local for local dev or in your Vercel project's environment variables.`);
  }

  return value;
}

export function getFantraxLeagueId(): string {
  return getRequiredEnv("FANTRAX_LEAGUE_ID");
}
