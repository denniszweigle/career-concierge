import { trpc } from "@/lib/trpc";

type SiteConfig = {
  siteName: string;
  candidateName: string;
  heroTagline: string;
  matchPageTitle: string;
  matchPageDescription: string;
  chatPageDescription: string;
};

const DEFAULTS: SiteConfig = {
  siteName: "Agentic Me",
  candidateName: "Your Name",
  heroTagline: "Companies use AI to screen you out before a human ever sees your name. This fights back — using AI to get past AI, so the conversation becomes about your skills, your experience, and your value. Not a keyword score.",
  matchPageTitle: "AI vs. AI — Get Past the Gatekeepers",
  matchPageDescription: "Companies deploy AI to filter candidates before a human ever reads a word. Paste the job description and this platform deploys AI right back — analyzing the role against your indexed portfolio documents, scoring alignment across hard skills, experience, domain knowledge, and leadership, then tailoring a resume and cover letter that speaks the exact language the hiring system is listening for. The goal isn't a high score. It's earning the conversation.",
  chatPageDescription: "Ask anything about the candidate — answers grounded in indexed portfolio documents",
};

export function useSiteConfig(): SiteConfig {
  const { data } = trpc.system.getSiteConfig.useQuery();
  return { ...DEFAULTS, ...data };
}
