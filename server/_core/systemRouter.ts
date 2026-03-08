import { z } from "zod";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

const SITE_CONFIG_PATH = join(process.cwd(), "data", "site.config.json");

type SiteConfig = {
  siteName: string;
  candidateName: string;
  heroTagline: string;
  matchPageTitle: string;
  matchPageDescription: string;
  chatPageDescription: string;
};

const SITE_CONFIG_DEFAULTS: SiteConfig = {
  siteName: "Agentic Me",
  candidateName: "Your Name",
  heroTagline: "Companies use AI to screen you out before a human ever sees your name. This fights back — using AI to get past AI, so the conversation becomes about your skills, your experience, and your value. Not a keyword score.",
  matchPageTitle: "AI vs. AI — Get Past the Gatekeepers",
  matchPageDescription: "Companies deploy AI to filter candidates before a human ever reads a word. Paste the job description and this platform deploys AI right back — analyzing the role against your indexed portfolio documents, scoring alignment across hard skills, experience, domain knowledge, and leadership, then tailoring a resume and cover letter that speaks the exact language the hiring system is listening for. The goal isn't a high score. It's earning the conversation.",
  chatPageDescription: "Ask anything about the candidate — answers grounded in indexed portfolio documents",
};

function readSiteConfig(): SiteConfig {
  try {
    const parsed = JSON.parse(readFileSync(SITE_CONFIG_PATH, "utf-8"));
    return { ...SITE_CONFIG_DEFAULTS, ...parsed };
  } catch {
    return SITE_CONFIG_DEFAULTS;
  }
}

function writeSiteConfig(config: SiteConfig): void {
  writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

const siteConfigSchema = z.object({
  siteName: z.string().min(1),
  candidateName: z.string().min(1),
  heroTagline: z.string().min(1),
  matchPageTitle: z.string().min(1),
  matchPageDescription: z.string().min(1),
  chatPageDescription: z.string().min(1),
});

export const systemRouter = router({
  getSiteConfig: publicProcedure.query(() => readSiteConfig()),

  saveSiteConfig: adminProcedure
    .input(siteConfigSchema)
    .mutation(({ input }) => {
      writeSiteConfig(input);
      return { success: true };
    }),

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
