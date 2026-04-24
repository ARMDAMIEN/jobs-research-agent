import { APOLLO_API_KEY } from "../config.js";

export interface UnlockedContact {
  found: boolean;
  email: string | null;
  email_status: "verified" | "guessed" | "locked" | "unavailable" | "unknown";
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  linkedin_url: string | null;
}

export async function unlockContactEmail(params: {
  person_id: string;
}): Promise<UnlockedContact> {
  const empty: UnlockedContact = {
    found: false,
    email: null,
    email_status: "unavailable",
    first_name: null,
    last_name: null,
    title: null,
    linkedin_url: null,
  };

  const res = await fetch("https://api.apollo.io/api/v1/people/bulk_match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_API_KEY,
    },
    body: JSON.stringify({
      details: [{ id: params.person_id }],
      reveal_personal_emails: false,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Apollo bulk_match ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const m = data.matches?.[0];
  if (!m) return empty;

  const email: string | null = m.email ?? null;
  const statusRaw: string = (m.email_status ?? "").toLowerCase();
  let email_status: UnlockedContact["email_status"] = "unknown";
  if (!email || email === "email_not_unlocked@domain.com") {
    email_status = "locked";
  } else if (statusRaw === "verified") {
    email_status = "verified";
  } else if (statusRaw === "guessed" || statusRaw === "unverified") {
    email_status = "guessed";
  }

  return {
    found: true,
    email: email_status === "locked" ? null : email,
    email_status,
    first_name: m.first_name ?? null,
    last_name: m.last_name ?? null,
    title: m.title ?? null,
    linkedin_url: m.linkedin_url ?? null,
  };
}
