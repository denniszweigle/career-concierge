import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

export function useSiteName(): string {
  const { data } = trpc.system.getSiteConfig.useQuery();
  const siteName = data?.siteName ?? "Agentic Zweigle";

  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  return siteName;
}
