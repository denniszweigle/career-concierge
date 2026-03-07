import { z } from "zod";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

const SITE_CONFIG_PATH = join(process.cwd(), "data", "site.config.json");

function readSiteConfig(): { siteName: string } {
  try {
    return JSON.parse(readFileSync(SITE_CONFIG_PATH, "utf-8"));
  } catch {
    return { siteName: "Agentic DZ" };
  }
}

function writeSiteConfig(config: { siteName: string }): void {
  writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export const systemRouter = router({
  getSiteConfig: publicProcedure.query(() => readSiteConfig()),

  saveSiteConfig: adminProcedure
    .input(z.object({ siteName: z.string().min(1) }))
    .mutation(({ input }) => {
      writeSiteConfig({ siteName: input.siteName });
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
