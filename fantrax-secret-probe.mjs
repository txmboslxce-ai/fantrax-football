// fantrax-secret-probe.mjs
// Throwaway diagnostic script — NOT part of the app repo.
// Goal: figure out how Fantrax's Secret ID authenticates a request, by trying
// several candidate placements and diffing the response against an
// unauthenticated baseline call.
//
// Run with: node fantrax-secret-probe.mjs
// Requires Node 18+ (built-in fetch).

// ---------------------------------------------------------------------------
// CONFIG — fill these in before running
// ---------------------------------------------------------------------------
const CONFIG = {
  SECRET_ID: "yjojt9bxlj4wf7bh",
  EMAIL: "PASTE_YOUR_FANTRAX_EMAIL_HERE", // TDS tool uses email + secret ID together — try with and without
  LEAGUE_ID: "PASTE_A_PRIVATE_LEAGUE_ID_YOU_ARE_IN",

  // The method your current My League sync route actually calls.
  // Check app/api/my-league/sync/route.ts for the exact `method` string
  // passed in msgs[0].method — paste it here. getDraftResults is the
  // fallback default since we know that one works unauthenticated.
  METHOD_NAME: "getDraftResults",

  // Any extra fields that method's `data` object needs beyond leagueId
  // (e.g. { teamId: "..." }). Leave empty object if unsure.
  EXTRA_METHOD_DATA: {},
};

const BASE_URL = "https://www.fantrax.com/fxpa/req";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envelope(method, data) {
  return JSON.stringify({ msgs: [{ method, data }] });
}

async function rawFetch({ label, url, method = "POST", headers = {}, body }) {
  console.log(`\n--- ${label} ---`);
  console.log(`URL: ${url}`);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body,
      redirect: "manual",
    });

    const setCookie = res.headers.get("set-cookie");
    const text = await res.text();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    console.log(`Status: ${res.status}`);
    if (setCookie) console.log(`Set-Cookie: ${setCookie}`);

    if (parsed) {
      summarize(parsed);
    } else {
      console.log("Non-JSON response (truncated):", text.slice(0, 300));
    }

    return { res, setCookie, parsed, rawText: text };
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    return null;
  }
}

// Print the full response content (truncated) so we can read actual error
// text and nested data — just logging top-level keys hides the useful info.
function summarize(parsed) {
  const json = JSON.stringify(parsed, null, 2);
  if (json.length > 1500) {
    console.log(json.slice(0, 1500) + "\n  ...(truncated)");
  } else {
    console.log(json);
  }
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

async function main() {
  const { SECRET_ID, EMAIL, LEAGUE_ID, METHOD_NAME, EXTRA_METHOD_DATA } = CONFIG;

  if (SECRET_ID.startsWith("PASTE_")) {
    console.error("Fill in SECRET_ID in CONFIG at the top of the file before running.");
    process.exit(1);
  }
  const haveLeagueId = LEAGUE_ID && !LEAGUE_ID.startsWith("PASTE_");

  const methodData = { leagueId: LEAGUE_ID, ...EXTRA_METHOD_DATA };
  const url = `${BASE_URL}?leagueId=${LEAGUE_ID}`;

  // ---------------------------------------------------------------------
  // A. ACCOUNT-LEVEL PROBE — no league ID at all.
  //    TDS's own tool only asks for email + Secret ID, no league ID, and
  //    gets back a dropdown of all your leagues. That means there's likely
  //    a dedicated method that takes just the Secret ID and returns your
  //    account's league list directly. Try that shape first.
  // ---------------------------------------------------------------------
  const accountMethods = [
    "login",
    "userLogin",
    "authenticateUser",
    "loginWithSecret",
    "getLeagues",
    "getUserLeagues",
    "getMyLeagues",
    "getHistoryLeagues",
    "getUserInfo",
    "getUser",
  ];
  const secretFieldNames = [
    "secretId",
    "secret",
    "userSecretId",
    "sId",
    "uid",
    "secretID",
    "userSecretID",
    "apiSecret",
    "apiSecretId",
    "token",
  ];

  for (const method of accountMethods) {
    // "login" is the only method that came back valid last run — hit it with
    // every field-name variant. The rest were invalid method names, so just
    // spot-check one variant each to capture the actual error text.
    const fieldsToTry = method === "login" ? secretFieldNames : [secretFieldNames[0]];

    for (const field of fieldsToTry) {
      const data = { [field]: SECRET_ID };
      if (EMAIL) data.email = EMAIL;
      await rawFetch({
        label: `A. Account-level: ${method} with ${field}${EMAIL ? "+email" : ""}`,
        url: BASE_URL,
        body: envelope(method, data),
      });
    }
  }

  console.log(
    "\n=== End of account-level probe. If any attempt above returned historyLeagues, a team list, or user info instead of a warning/error, THAT is the working shape — you likely don't need to run the league-scoped attempts below. ===\n"
  );

  // ---------------------------------------------------------------------
  // C. FXEA PROBE — a completely different Fantrax API surface discovered
  //    in an old script: https://www.fantrax.com/fxea/general/getStandings
  //    is a plain GET with query params, no msgs envelope, and works with
  //    zero auth for public league data. Worth testing whether this surface
  //    has account-level endpoints that accept secretId as a query param —
  //    totally different shape from everything else we've tried.
  // ---------------------------------------------------------------------
  const FXEA_BASE = "https://www.fantrax.com/fxea/general";
  const fxeaEndpoints = [
    "getLeagues",
    "getUserLeagues",
    "getMyLeagues",
    "getLeaguesForUser",
    "getLeagueInfo",
    "getUserInfo",
    "getTeamRosters",
    "getTeamRoster",
  ];
  const fxeaSecretParamNames = ["secretId", "secret", "userSecretId", "sId"];

  for (const endpoint of fxeaEndpoints) {
    // Try leagueId if we have one (some fxea endpoints require it regardless),
    // plus every secret param name variant.
    for (const param of fxeaSecretParamNames) {
      const params = new URLSearchParams({ [param]: SECRET_ID });
      if (haveLeagueId) params.set("leagueId", LEAGUE_ID);
      const fxeaUrl = `${FXEA_BASE}/${endpoint}?${params.toString()}`;
      await rawFetch({
        label: `C. fxea: ${endpoint} with ${param}`,
        url: fxeaUrl,
        method: "GET",
        body: undefined,
      });
    }
  }

  console.log(
    "\n=== End of fxea probe. Look for anything that isn't a 404/error — even a differently-shaped error message than the others is worth flagging, since it may mean the endpoint exists but wants different params. ===\n"
  );

  // ---------------------------------------------------------------------
  // B. LOGIN AS USERNAME/PASSWORD — Fantrax's own help text says you use
  //    the Secret ID "not your password" for third-party tools, which hints
  //    it may substitute directly for a password field in a normal login
  //    call, paired with your email as the username. Worth testing before
  //    giving up on the JSON API entirely.
  // ---------------------------------------------------------------------
  if (EMAIL) {
    const passwordStyleVariants = [
      { username: EMAIL, password: SECRET_ID },
      { email: EMAIL, password: SECRET_ID },
      { user: EMAIL, pass: SECRET_ID },
      { userName: EMAIL, password: SECRET_ID },
      { loginName: EMAIL, password: SECRET_ID },
    ];
    for (const data of passwordStyleVariants) {
      await rawFetch({
        label: `B. login as username/password: ${Object.keys(data).join("+")}`,
        url: BASE_URL,
        body: envelope("login", data),
      });
    }
  } else {
    console.log(
      "\nSkipping section B (login as username/password) — EMAIL is blank in CONFIG. Fill it in and rerun if section A didn't find anything."
    );
  }

  if (!haveLeagueId) {
    console.log(
      "\nNo LEAGUE_ID provided — skipping the league-scoped attempts below. That's fine if the account-level probe above already found the working shape."
    );
    console.log("\n=== DONE ===");
    return;
  }

  // 0. Baseline — no auth at all.
  await rawFetch({
    label: "0. BASELINE (unauthenticated)",
    url,
    body: envelope(METHOD_NAME, methodData),
  });

  // 1. Secret ID as a cookie, a few plausible cookie names.
  const cookieNames = ["FX_SECRET", "fantraxSecretId", "secretId", "sid"];
  for (const name of cookieNames) {
    await rawFetch({
      label: `1. Cookie header (${name})`,
      url,
      headers: { Cookie: `${name}=${SECRET_ID}` },
      body: envelope(METHOD_NAME, methodData),
    });
  }

  // 2. Secret ID as a field inside msgs[].data.
  const dataFieldNames = ["secretId", "secret", "userSecretId", "sId", "uid"];
  for (const field of dataFieldNames) {
    await rawFetch({
      label: `2. Body data field (${field})`,
      url,
      body: envelope(METHOD_NAME, { ...methodData, [field]: SECRET_ID }),
    });
  }

  // 3. Secret ID as a query param on the URL.
  const queryParamNames = ["secretId", "secret", "sId"];
  for (const param of queryParamNames) {
    await rawFetch({
      label: `3. Query param (${param})`,
      url: `${url}&${param}=${SECRET_ID}`,
      body: envelope(METHOD_NAME, methodData),
    });
  }

  // 4. Secret ID as a custom request header.
  const headerVariants = [
    { "X-Fantrax-Secret": SECRET_ID },
    { Authorization: `Bearer ${SECRET_ID}` },
    { "X-Secret-Id": SECRET_ID },
  ];
  for (const headers of headerVariants) {
    await rawFetch({
      label: `4. Custom header (${Object.keys(headers)[0]})`,
      url,
      headers,
      body: envelope(METHOD_NAME, methodData),
    });
  }

  // 5. Two-step login exchange — try a login-style method first, capture any
  //    Set-Cookie, then reuse it on the real call.
  const loginMethods = ["login", "userLogin", "authenticateUser", "loginWithSecret"];
  const loginDataVariants = [
    { secretId: SECRET_ID },
    { secret: SECRET_ID },
    { email: EMAIL, secretId: SECRET_ID },
    { email: EMAIL, secret: SECRET_ID },
  ];
  for (const loginMethod of loginMethods) {
    for (const loginData of loginDataVariants) {
      const loginResult = await rawFetch({
        label: `5. Login exchange: ${loginMethod} with ${Object.keys(loginData).join("+")}`,
        url: BASE_URL,
        body: envelope(loginMethod, loginData),
      });

      if (loginResult?.setCookie) {
        console.log("   -> Got a cookie back, retrying real call with it...");
        await rawFetch({
          label: `   5b. Follow-up ${METHOD_NAME} using cookie from ${loginMethod}`,
          url,
          headers: { Cookie: loginResult.setCookie.split(";")[0] },
          body: envelope(METHOD_NAME, methodData),
        });
      }
    }
  }

  console.log("\n=== DONE ===");
  console.log(
    "Look for any attempt whose response differs from the BASELINE — different team names/IDs in fantasyTeamsOrdered, a resolved historyLeagues list, or the absence of a WARNING_NOT_LOGGED_IN-style warning. Paste the full output back for review."
  );
}

main();