process.env.TZ = 'Asia/Kolkata';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cron from "node-cron";
import { storage } from "./storage";
import { sweepOrphanShareImages } from "./share-image";

const app = express();
// Trust exactly one upstream hop (Replit's edge proxy). Using `true` would
// trust the entire X-Forwarded-For chain, which lets a client spoof their
// apparent IP by injecting their own XFF header — that would defeat the
// per-IP rate limit on the public share-image endpoints in routes.ts.
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "35mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      cron.schedule('30 18 * * *', async () => {
        try {
          log("Running midnight IST lenden interest accrual...", "cron");
          await storage.accrueInterestAllLenden();
          log("Lenden interest accrual complete", "cron");
        } catch (error) {
          console.error("Cron lenden accrual error:", error);
        }
      });
      log("Lenden interest accrual cron scheduled (midnight IST)");

      cron.schedule('30 19 * * *', async () => {
        try {
          log("Running daily weather logging (1:00 AM IST)...", "cron");
          const count = await storage.fetchAndLogWeather();
          log(`Weather logged for ${count} locations`, "cron");
        } catch (error) {
          console.error("Cron weather log error:", error);
        }
      });
      log("Daily weather logging cron scheduled (1:00 AM IST)");

      // Sweep orphaned share-image cache files daily. The DELETE listing
      // route also clears its own file inline, so this is a safety net
      // that picks up anything missed by past deletions or by edge cases
      // (crash between DB delete and cache cleanup, manual DB edits, etc.)
      // and keeps the on-disk cache from drifting away from the DB.
      cron.schedule('0 21 * * *', async () => {
        try {
          log("Running daily share-image cache sweep (2:30 AM IST)...", "cron");
          const removed = await sweepOrphanShareImages();
          log(`Share-image sweep removed ${removed} orphan file(s)`, "cron");
        } catch (error) {
          console.error("Cron share-image sweep error:", error);
        }
      });
      log("Daily share-image cache sweep scheduled (2:30 AM IST)");
    },
  );
})();
