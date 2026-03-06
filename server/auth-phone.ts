import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users, type User } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function setupPhoneAuth(app: Express) {
  app.set("trust proxy", 1);

  const sessionTtl = 30 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: sessionTtl,
      },
    })
  );

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { phoneNumber, firstName, pin } = req.body;

      if (!phoneNumber || !/^\d{10}$/.test(phoneNumber)) {
        return res.status(400).json({ message: "invalidPhone" });
      }
      if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ message: "invalidPin" });
      }
      if (!firstName || firstName.trim().length === 0) {
        return res.status(400).json({ message: "nameRequired" });
      }

      const [existing] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
      if (existing) {
        return res.status(409).json({ message: "phoneExists" });
      }

      const hashedPin = await bcrypt.hash(pin, 10);
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";

      const [ipCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(sql`${users.knownIps} @> ARRAY[${clientIp}]::text[]`);
      if (ipCount && Number(ipCount.count) >= 2) {
        return res.status(429).json({ message: "ipLimitReached" });
      }

      const [user] = await db
        .insert(users)
        .values({
          phoneNumber,
          firstName: firstName.trim(),
          pin: hashedPin,
          knownIps: [clientIp],
        })
        .returning();

      await storage.ensureFarmerCode(user.id);

      req.session.userId = user.id;
      const safeUser = sanitizeUser(user);
      res.status(201).json(safeUser);
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "registrationFailed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { phoneNumber, pin } = req.body;

      if (!phoneNumber || !pin) {
        return res.status(400).json({ message: "invalidCredentials" });
      }

      const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
      if (!user || !user.pin) {
        return res.status(401).json({ message: "wrongCredentials" });
      }

      const pinMatch = await bcrypt.compare(pin, user.pin);
      if (!pinMatch) {
        return res.status(401).json({ message: "wrongCredentials" });
      }

      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const currentIps = user.knownIps || [];
      if (!currentIps.includes(clientIp)) {
        await db
          .update(users)
          .set({ knownIps: [...currentIps, clientIp], updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      req.session.userId = user.id;
      const safeUser = sanitizeUser(user);
      if (user.mustChangePin) {
        return res.json({ ...safeUser, mustChangePin: true });
      }
      res.json(safeUser);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "loginFailed" });
    }
  });

  app.post("/api/auth/change-pin", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { oldPin, newPin } = req.body;

      if (!oldPin || !newPin || !/^\d{4}$/.test(newPin)) {
        return res.status(400).json({ message: "invalidPin" });
      }

      const user = await storage.getUserById(req.session.userId);
      if (!user || !user.pin) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const pinMatch = await bcrypt.compare(oldPin, user.pin);
      if (!pinMatch) {
        return res.status(401).json({ message: "wrongCredentials" });
      }

      const hashedPin = await bcrypt.hash(newPin, 10);
      await db
        .update(users)
        .set({ pin: hashedPin, mustChangePin: false, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      const updatedUser = await storage.getUserById(user.id);
      res.json(sanitizeUser(updatedUser!));
    } catch (error) {
      console.error("Change pin error:", error);
      res.status(500).json({ message: "resetFailed" });
    }
  });

  app.post("/api/auth/forgot-pin", async (req, res) => {
    try {
      const { phoneNumber, newPin } = req.body;

      if (!phoneNumber || !/^\d{10}$/.test(phoneNumber)) {
        return res.status(400).json({ message: "invalidPhone" });
      }
      if (!newPin || !/^\d{4}$/.test(newPin)) {
        return res.status(400).json({ message: "invalidPin" });
      }

      const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
      if (!user) {
        return res.status(404).json({ message: "accountNotFound" });
      }

      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const knownIps = user.knownIps || [];

      if (!knownIps.includes(clientIp)) {
        return res.status(403).json({ message: "unrecognizedDevice" });
      }

      const hashedPin = await bcrypt.hash(newPin, 10);
      await db
        .update(users)
        .set({ pin: hashedPin, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      res.json({ message: "pinReset" });
    } catch (error) {
      console.error("Forgot pin error:", error);
      res.status(500).json({ message: "resetFailed" });
    }
  });

  app.get("/api/auth/user", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Unauthorized" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

function sanitizeUser(user: User) {
  const { pin, knownIps, ...safe } = user;
  return safe;
}
