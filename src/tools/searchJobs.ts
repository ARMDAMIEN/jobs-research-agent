import { SERPAPI_API_KEY } from "../config.js";

export interface JobResult {
  title: string;
  company_name: string;
  location: string;
  description: string;
  via: string;
  job_id: string;
  apply_link: string;
  posted_at: string;
}

export interface SearchJobsResult {
  jobs: JobResult[];
  next_page_token: string | null;
}

export async function searchJobs(params: {
  query: string;
  next_page_token?: string;
}): Promise<SearchJobsResult> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", params.query);
  url.searchParams.set("hl", "en");
  url.searchParams.set("google_domain", "google.com");
  url.searchParams.set("api_key", SERPAPI_API_KEY);
  if (params.next_page_token) {
    url.searchParams.set("next_page_token", params.next_page_token);
  }

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    throw new Error(`SerpAPI returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();

  const jobs: JobResult[] = (data.jobs_results ?? []).map((j: any) => ({
    title: j.title ?? "",
    company_name: j.company_name ?? "",
    location: j.location ?? "",
    description: (j.description ?? "").slice(0, 1500),
    via: j.via ?? "",
    job_id: j.job_id ?? "",
    apply_link: j.apply_options?.[0]?.link ?? j.share_link ?? "",
    posted_at: j.detected_extensions?.posted_at ?? "",
  }));

  const next_page_token: string | null =
    data.serpapi_pagination?.next_page_token ?? data.pagination?.next_page_token ?? null;

  return { jobs, next_page_token };
}
