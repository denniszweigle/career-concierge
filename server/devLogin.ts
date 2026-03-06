import type { Express, Request, Response } from "express";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./_core/env";

/**
 * Dev-only route: GET /api/dev-login
 * Creates (or reuses) the admin user defined by OWNER_OPEN_ID, issues a
 * session JWT, sets the cookie, then redirects to /admin.
 *
 * Never registered in production (NODE_ENV === "production").
 */
export function registerDevLogin(app: Express) {
  const bootstrapSecret = process.env.DEV_LOGIN_SECRET;
  if (ENV.isProduction && !bootstrapSecret) return;

  app.get("/api/dev-login", async (req: Request, res: Response) => {
    // In production, require ?secret=<DEV_LOGIN_SECRET>
    if (ENV.isProduction) {
      if (!bootstrapSecret || req.query.secret !== bootstrapSecret) {
        res.status(403).send("Forbidden");
        return;
      }
    }

    const openId = ENV.ownerOpenId || "local-dev-user";
    const name = "Dev Admin";

    try {
      await db.upsertUser({
        openId,
        name,
        email: "dev@localhost",
        loginMethod: "dev",
        role: "admin",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      console.log(`[DevLogin] Signed in as '${openId}' → redirecting to /admin`);
      res.redirect(302, "/admin");
    } catch (error) {
      console.error("[DevLogin] Failed:", error);
      res.status(500).send("Dev login failed — check server logs.");
    }
  });

  console.log("[DevLogin] Route registered at GET /api/dev-login (dev only)");
}
