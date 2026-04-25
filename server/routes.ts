import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupPhoneAuth, isAuthenticated } from "./auth-phone";
import { registerChatRoutes } from "./replit_integrations/chat";
import { GoogleGenAI } from "@google/genai";
import {
  insertCropCardSchema,
  insertCropEventSchema,
  insertKhataRegisterSchema,
  insertKhataItemSchema,
  insertPanatPaymentSchema,
  MARKETPLACE_ONION_SEED_TYPES,
  MARKETPLACE_ONION_SEED_VARIETIES,
  MARKETPLACE_ONION_SEED_BRANDS,
  MARKETPLACE_BAG_COMMODITY_TYPES,
  MARKETPLACE_BAG_MATERIAL_TYPES,
  MARKETPLACE_BAG_COLORS,
  MARKETPLACE_BAG_GSM_OPTIONS,
  MARKETPLACE_FAN_BRANDS,
  MARKETPLACE_FAN_COLORS,
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { z } from "zod";
import sharp from "sharp";

async function compressOnionImageForStorage(
  base64Data: string,
  mimeType: string,
): Promise<{ data: string; mime: string }> {
  try {
    const inputBuffer = Buffer.from(base64Data, "base64");
    const outputBuffer = await sharp(inputBuffer, { failOn: "none" })
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer();
    return { data: outputBuffer.toString("base64"), mime: "image/jpeg" };
  } catch (err) {
    console.error("Onion image compression failed, falling back to original:", err);
    return { data: base64Data, mime: mimeType };
  }
}

const onionResultSchema = z.object({
  pricing_analysis: z.object({
    market_heat_index: z.enum(["Low", "Medium", "High"]),
    calculated_market_price: z.number().positive(),
    collateral_value: z.number().positive(),
    valuation_breakdown: z.object({
      base_multiplier_used: z.number().positive(),
      quality_adjustments_total: z.string().regex(/^[+-]?\d+(\.\d+)?%$/),
      puffy_penalty_applied: z.boolean(),
    }).strict(),
    underwriting_note: z.string().min(1),
  }).strict(),
  visual_parameters: z.object({
    size_grade: z.enum(["Super", "Medium", "Gola", "Golti"]),
    color: z.string().min(1),
    luster_score: z.number().int().min(1).max(5),
    shape_uniformity: z.string().min(1),
    neck_rating: z.number().int().min(1).max(5),
    shoulder_geometry: z.enum(["Flat", "Convex", "Tapered"]),
  }).strict(),
  quality_rating: z.object({
    overall_score: z.number().min(1).max(5).refine(
      (n) => Math.round(n * 10) === n * 10,
      { message: "overall_score must have at most 1 decimal place" },
    ),
    score_band: z.enum([
      "Elite Storage",
      "Premium Commercial",
      "Standard/Domestic",
      "High Risk/Puffy",
      "Distress/Reject",
    ]),
    pillar_scores: z.object({
      neck_integrity: z.number().int().min(1).max(5),
      shoulder_geometry: z.number().int().min(1).max(5),
      parda_luster: z.number().int().min(1).max(5),
      shape_roundness: z.number().int().min(1).max(5),
      uniformity_size: z.number().int().min(1).max(5),
    }).strict(),
    rationale_markdown: z.string().min(1),
  }).strict(),
}).strict();

type OnionAiResult = z.infer<typeof onionResultSchema>;

type StorageRecommendation = {
  action: "Sell Immediate" | "Store Long-term" | "Average Storage (Short-term)";
  window: "0-15 Days" | "120-180 Days" | "30-60 Days" | "Immediate";
  risk: "Low" | "Medium" | "High" | "Extreme";
  rule: "high_risk_grade" | "elite_storage" | "average_storage" | "reject_liquidate";
};

function computeStorageRecommendation(data: OnionAiResult): StorageRecommendation {
  const overall = data.quality_rating.overall_score;
  const neck = data.visual_parameters.neck_rating;
  const shoulder = data.visual_parameters.shoulder_geometry;
  const skin = data.visual_parameters.luster_score;

  // Rule 1 — SELL IMMEDIATE (High-Risk Grade)
  if (shoulder === "Convex" || neck <= 2 || skin <= 2) {
    return { action: "Sell Immediate", window: "0-15 Days", risk: "High", rule: "high_risk_grade" };
  }
  // Rule 2 — STORE LONG-TERM (Elite Storage Grade) — "Sharp 90°" maps to Flat in our enum
  if (overall >= 4.0 && neck >= 4 && shoulder === "Flat") {
    return { action: "Store Long-term", window: "120-180 Days", risk: "Low", rule: "elite_storage" };
  }
  // Rule 4 — SAFETY CATCH (REJECT / LIQUIDATE) — checked before fallback rule 3
  if (overall < 3.0) {
    return { action: "Sell Immediate", window: "Immediate", risk: "Extreme", rule: "reject_liquidate" };
  }
  // Rule 3 — AVERAGE STORAGE (Fallback / Short-term)
  return { action: "Average Storage (Short-term)", window: "30-60 Days", risk: "Medium", rule: "average_storage" };
}

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  ...(process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ? {
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  } : {}),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupPhoneAuth(app);
  registerChatRoutes(app);

  app.get("/api/farmer/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const farmerCode = await storage.ensureFarmerCode(userId);
      const user = await storage.getUserById(userId);
      res.json({ ...user, farmerCode });
    } catch (error) {
      console.error("Error fetching farmer profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.patch("/api/farmer/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const { firstName, village, tehsil, district, state, postalCode, latitude, longitude } = req.body;
      if (typeof req.body !== "object" || req.body === null) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = String(firstName).slice(0, 100);
      if (village !== undefined) updateData.village = String(village).slice(0, 100);
      if (tehsil !== undefined) updateData.tehsil = String(tehsil).slice(0, 100);
      if (district !== undefined) updateData.district = String(district).slice(0, 100);
      if (state !== undefined) updateData.state = String(state).slice(0, 100);
      if (postalCode !== undefined) updateData.postalCode = String(postalCode).slice(0, 10);
      if (latitude !== undefined) updateData.latitude = String(latitude).slice(0, 20);
      if (longitude !== undefined) updateData.longitude = String(longitude).slice(0, 20);
      const updated = await storage.updateUserProfile(userId, updateData);
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/geocode/reverse", isAuthenticated, async (req: any, res) => {
    try {
      const { lat, lng } = req.body;
      if (!lat || !lng) return res.status(400).json({ message: "lat and lng required" });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`,
        { headers: { "User-Agent": "KrashuMitra/1.0" } }
      );
      if (!response.ok) {
        return res.status(502).json({ message: "Geocoding service unavailable" });
      }
      const data = await response.json() as any;
      const address = data.address || {};
      res.json({
        village: address.village || address.town || address.city || address.hamlet || "",
        tehsil: address.suburb || address.city_district || address.town || "",
        district: address.county || address.state_district || "",
        state: address.state || "",
        postalCode: address.postcode || "",
      });
    } catch (error) {
      console.error("Error reverse geocoding:", error);
      res.status(500).json({ message: "Geocoding failed" });
    }
  });

  app.get("/api/crop-cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const showArchived = req.query.showArchived === "true";
      const cards = await storage.getCropCardsByUser(userId, showArchived);
      res.json(cards);
    } catch (error) {
      console.error("Error fetching crop cards:", error);
      res.status(500).json({ message: "Failed to fetch crop cards" });
    }
  });

  app.post("/api/crop-cards/:id/archive", isAuthenticated, async (req: any, res) => {
    try {
      const card = await storage.getCropCard(parseInt(req.params.id));
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.archiveCropCard(card.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to archive crop card" });
    }
  });

  app.get("/api/crop-cards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const card = await storage.getCropCard(parseInt(req.params.id));
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      res.json(card);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch crop card" });
    }
  });

  app.post("/api/crop-cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const data = insertCropCardSchema.parse({ ...req.body, userId });
      const card = await storage.createCropCard(data);

      const startDate = new Date(data.startDate);
      const harvestDate = new Date(startDate);
      harvestDate.setMonth(harvestDate.getMonth() + 4);
      await storage.createCropEvent({
        cropCardId: card.id,
        eventType: "harvesting",
        description: null,
        eventDate: harvestDate.toISOString().split("T")[0],
        isCompleted: false,
        productionPerBigha: null,
      });

      res.status(201).json(card);
    } catch (error) {
      console.error("Error creating crop card:", error);
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.patch("/api/crop-cards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const card = await storage.getCropCard(parseInt(req.params.id));
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const allowedFields = insertCropCardSchema.pick({ cropName: true, farmName: true, variety: true, status: true }).partial();
      const parsed = allowedFields.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const updated = await storage.updateCropCard(parseInt(req.params.id), parsed.data);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update crop card" });
    }
  });

  app.delete("/api/crop-cards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const card = await storage.getCropCard(parseInt(req.params.id));
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteCropCard(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete crop card" });
    }
  });

  app.get("/api/crop-cards/:id/events", isAuthenticated, async (req: any, res) => {
    try {
      const card = await storage.getCropCard(parseInt(req.params.id));
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const events = await storage.getCropEvents(parseInt(req.params.id));
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.post("/api/crop-cards/:id/events", isAuthenticated, async (req: any, res) => {
    try {
      const card = await storage.getCropCard(parseInt(req.params.id));
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const data = insertCropEventSchema.parse({ ...req.body, cropCardId: parseInt(req.params.id) });
      const event = await storage.createCropEvent(data);
      invalidateSuggestionsForCard(parseInt(req.params.id));
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.post("/api/crop-events/:id/toggle", isAuthenticated, async (req: any, res) => {
    try {
      const event = await storage.getCropEvent(parseInt(req.params.id));
      if (!event) return res.status(404).json({ message: "Not found" });
      const card = await storage.getCropCard(event.cropCardId);
      if (!card || card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.toggleCropEventComplete(parseInt(req.params.id));
      invalidateSuggestionsForCard(event.cropCardId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle event" });
    }
  });

  app.patch("/api/crop-events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const event = await storage.getCropEvent(parseInt(req.params.id));
      if (!event) return res.status(404).json({ message: "Not found" });
      const card = await storage.getCropCard(event.cropCardId);
      if (!card || card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const allowedFields = insertCropEventSchema.pick({ eventType: true, description: true, eventDate: true, productionPerBigha: true, productionUnit: true }).partial();
      const parsed = allowedFields.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const updated = await storage.updateCropEvent(parseInt(req.params.id), parsed.data);
      invalidateSuggestionsForCard(event.cropCardId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.delete("/api/crop-events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const event = await storage.getCropEvent(parseInt(req.params.id));
      if (!event) return res.status(404).json({ message: "Not found" });
      const card = await storage.getCropCard(event.cropCardId);
      if (!card || card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteCropEvent(parseInt(req.params.id));
      invalidateSuggestionsForCard(event.cropCardId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  const suggestionsCache = new Map<string, { en: any; hi: any | null; timestamp: number }>();
  const SUGGESTIONS_CACHE_MS = 6 * 60 * 60 * 1000;
  const nullSuggestions = { nextActivity: null, weatherWarning: null, suggestion: null };

  function invalidateSuggestionsForCard(cardId: number) {
    const prefix = `${cardId}-`;
    for (const key of suggestionsCache.keys()) {
      if (key.startsWith(prefix)) suggestionsCache.delete(key);
    }
  }

  function extractGeminiJson(result: any): any | null {
    let responseText = "";
    try {
      responseText = result.text || "";
    } catch {
      try {
        const parts = (result as any).candidates?.[0]?.content?.parts;
        if (parts) responseText = parts.map((p: any) => p.text || "").join("");
      } catch {}
    }
    let cleanedText = responseText;
    const codeBlockMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleanedText = codeBlockMatch[1].trim();
    } else {
      cleanedText = cleanedText.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
    }
    try {
      return JSON.parse(cleanedText);
    } catch {}
    const objMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch {}
    }
    const arrMatch = cleanedText.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch {}
    }
    return null;
  }

  async function translateSuggestionToHindi(enData: any): Promise<any> {
    const textsToTranslate: string[] = [];
    if (enData.nextActivity) {
      textsToTranslate.push(enData.nextActivity.name, enData.nextActivity.description);
    }
    if (enData.weatherWarning) {
      textsToTranslate.push(enData.weatherWarning.message);
    }
    if (enData.suggestion) {
      textsToTranslate.push(enData.suggestion);
    }
    if (textsToTranslate.length === 0) return enData;

    try {
      const translatePrompt = `Translate the following English texts to Hindi. Return a JSON array of translated strings in the same order. Keep agricultural terms natural in Hindi.\n\n${JSON.stringify(textsToTranslate)}`;
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: translatePrompt }] }],
        config: {
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 256 },
        },
      });
      const parsed = extractGeminiJson(result);
      let translations: string[] = [];
      if (Array.isArray(parsed)) {
        translations = parsed;
      } else if (parsed && Array.isArray(parsed.translations)) {
        translations = parsed.translations;
      }
      if (translations.length !== textsToTranslate.length) return enData;

      let idx = 0;
      const hiData: any = JSON.parse(JSON.stringify(enData));
      if (hiData.nextActivity) {
        hiData.nextActivity.name = translations[idx++];
        hiData.nextActivity.description = translations[idx++];
      }
      if (hiData.weatherWarning) {
        hiData.weatherWarning.message = translations[idx++];
      }
      if (hiData.suggestion) {
        hiData.suggestion = translations[idx++];
      }
      return hiData;
    } catch {
      return enData;
    }
  }

  app.get("/api/crop-cards/:id/suggestions", isAuthenticated, async (req: any, res) => {
    try {
      const cardId = parseInt(req.params.id);
      const card = await storage.getCropCard(cardId);
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      if (card.status !== "active") return res.json(nullSuggestions);

      const lat = parseFloat(req.query.lat as string) || 28.6139;
      const lng = parseFloat(req.query.lng as string) || 77.2090;
      const lang = (req.query.lang as string) === "en" ? "en" : "hi";

      const cacheKey = `${cardId}-${lat.toFixed(2)}-${lng.toFixed(2)}`;
      const cached = suggestionsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < SUGGESTIONS_CACHE_MS) {
        if (lang === "en") return res.json(cached.en);
        if (cached.hi) return res.json(cached.hi);
        const hiData = await translateSuggestionToHindi(cached.en);
        cached.hi = hiData;
        return res.json(hiData);
      }

      const events = await storage.getCropEvents(cardId);
      const today = new Date();
      const startDate = new Date(card.startDate);
      const daysSincePlanting = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      let weatherInfo = "";
      try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=Asia%2FKolkata&forecast_days=3`;
        const weatherRes = await fetch(weatherUrl);
        if (weatherRes.ok) {
          const w = await weatherRes.json();
          weatherInfo = `Current weather: ${w.current.temperature_2m}°C, humidity ${w.current.relative_humidity_2m}%, wind ${w.current.wind_speed_10m} km/h. `;
          weatherInfo += `3-day forecast: `;
          for (let i = 0; i < w.daily.time.length; i++) {
            weatherInfo += `${w.daily.time[i]}: ${w.daily.temperature_2m_min[i]}°-${w.daily.temperature_2m_max[i]}°C, rain ${w.daily.precipitation_sum[i]}mm; `;
          }
        }
      } catch {}

      const completedEvents = events.filter(e => e.isCompleted).map(e => `${e.eventType} (${e.eventDate})`).join(", ");
      const pendingEvents = events.filter(e => !e.isCompleted).map(e => `${e.eventType} (${e.eventDate})`).join(", ");

      const prompt = `You are an agriculture expert. Here is a crop card:

Crop: ${card.cropName}${card.variety ? ` (${card.variety})` : ""}
Farm: ${card.farmName || "Unknown"}
Planting date: ${card.startDate} (${daysSincePlanting} days ago)
Completed activities: ${completedEvents || "None"}
Pending activities: ${pendingEvents || "None"}
${weatherInfo}

Based on the crop's current stage and weather, respond ONLY with this JSON (no other text):
{
  "nextActivity": { "name": "Next activity name", "daysFromNow": number, "description": "Brief description (1 sentence)" },
  "weatherWarning": { "message": "Weather warning (1 sentence)", "severity": "info|warning|danger" } or null if no warning,
  "suggestion": "1 actionable farming tip (1 sentence)"
}

Rules:
- nextActivity should be the most important upcoming activity for this crop stage (irrigation, fertilizer, pesticide, weeding, harvest, etc.)
- daysFromNow = days from today to do this (0 = today, negative = overdue)
- weatherWarning only if weather poses a concern for the crop (heavy rain, frost, extreme heat, etc.)
- suggestion should consider both crop stage and weather conditions`;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 1024 },
        },
      });

      const parsed = extractGeminiJson(result);
      if (!parsed) return res.json(nullSuggestions);

      const enData = {
        nextActivity: parsed.nextActivity || null,
        weatherWarning: parsed.weatherWarning || null,
        suggestion: parsed.suggestion || null,
      };

      const cacheEntry: any = { en: enData, hi: null, timestamp: Date.now() };

      if (lang === "hi") {
        const hiData = await translateSuggestionToHindi(enData);
        cacheEntry.hi = hiData;
        suggestionsCache.set(cacheKey, cacheEntry);
        return res.json(hiData);
      }

      suggestionsCache.set(cacheKey, cacheEntry);
      res.json(enData);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      res.json(nullSuggestions);
    }
  });

  app.get("/api/khata", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const filters: { khataType?: string; year?: number; month?: number; showArchived?: boolean } = {};
      if (req.query.type && req.query.type !== "all") filters.khataType = req.query.type;
      if (req.query.year && req.query.year !== "all") filters.year = parseInt(req.query.year);
      if (req.query.month && req.query.month !== "all") filters.month = parseInt(req.query.month);
      if (req.query.showArchived === "true") filters.showArchived = true;
      const registers = await storage.getKhataRegisters(userId, filters);
      res.json(registers);
    } catch (error) {
      console.error("Error fetching khata registers:", error);
      res.status(500).json({ message: "Failed to fetch khata registers" });
    }
  });

  app.get("/api/khata/:id", isAuthenticated, async (req: any, res) => {
    try {
      const reg = await storage.getKhataRegister(parseInt(req.params.id));
      if (!reg) return res.status(404).json({ message: "Not found" });
      if (reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const items = await storage.getKhataItems(reg.id);
      const panatPaymentsList = reg.khataType === "panat" ? await storage.getPanatPayments(reg.id) : [];
      let lendenTxns: any[] = [];
      if (reg.khataType === "lending_ledger") {
        await storage.accrueInterestForRegister(reg.id);
        lendenTxns = await storage.getLendenTransactions(reg.id);
      }
      res.json({ ...reg, items, panatPayments: panatPaymentsList, lendenTransactions: lendenTxns });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch khata" });
    }
  });

  app.post("/api/khata", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const data = insertKhataRegisterSchema.parse({ ...req.body, userId });
      const reg = await storage.createKhataRegister(data);
      res.status(201).json(reg);
    } catch (error) {
      console.error("Error creating khata:", error);
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.patch("/api/khata/:id", isAuthenticated, async (req: any, res) => {
    try {
      const reg = await storage.getKhataRegister(parseInt(req.params.id));
      if (!reg) return res.status(404).json({ message: "Not found" });
      if (reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const allowedFields = insertKhataRegisterSchema.pick({ title: true, plantationDate: true, harvestDate: true, production: true, productionUnit: true, bataidarName: true, bataidarContact: true, bataiType: true, bighaCount: true, panatPersonName: true, panatContact: true, panatRatePerBigha: true, panatTotalBigha: true, panatTotalAmount: true, panatRemarks: true, rentalFarmerName: true, rentalContact: true, rentalVillage: true, rentalOpeningBalance: true, rentalRedFlag: true, machineryCategory: true, machineryName: true, machineryHp: true, machineryPurchaseYear: true, lendenPersonName: true, lendenContact: true, lendenVillage: true, lendenType: true, lendenRedFlag: true }).partial();
      const parsed = allowedFields.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const updated = await storage.updateKhataRegister(parseInt(req.params.id), parsed.data);
      if (parsed.data.bataiType && parsed.data.bataiType !== reg.bataiType) {
        await storage.recalculateKhataTotals(parseInt(req.params.id));
      }
      const final = parsed.data.bataiType && parsed.data.bataiType !== reg.bataiType
        ? await storage.getKhataRegister(parseInt(req.params.id))
        : updated;
      res.json(final);
    } catch (error) {
      res.status(500).json({ message: "Failed to update khata" });
    }
  });

  app.delete("/api/khata/:id", isAuthenticated, async (req: any, res) => {
    try {
      const reg = await storage.getKhataRegister(parseInt(req.params.id));
      if (!reg) return res.status(404).json({ message: "Not found" });
      if (reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteKhataRegister(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete khata" });
    }
  });

  app.post("/api/khata/:id/archive", isAuthenticated, async (req: any, res) => {
    try {
      const reg = await storage.getKhataRegister(parseInt(req.params.id));
      if (!reg) return res.status(404).json({ message: "Not found" });
      if (reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.archiveKhataRegister(parseInt(req.params.id));
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to archive khata" });
    }
  });

  app.post("/api/khata/:id/items", isAuthenticated, async (req: any, res) => {
    try {
      const reg = await storage.getKhataRegister(parseInt(req.params.id));
      if (!reg) return res.status(404).json({ message: "Not found" });
      if (reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const data = insertKhataItemSchema.parse({ ...req.body, khataRegisterId: parseInt(req.params.id) });
      const item = await storage.createKhataItem(data);
      await storage.recalculateKhataTotals(parseInt(req.params.id));
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating khata item:", error);
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.patch("/api/khata/items/:itemId", isAuthenticated, async (req: any, res) => {
    try {
      const item = await storage.getKhataItem(parseInt(req.params.itemId));
      if (!item) return res.status(404).json({ message: "Not found" });
      const reg = await storage.getKhataRegister(item.khataRegisterId);
      if (!reg || reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const allowedItemFields = insertKhataItemSchema.pick({ date: true, expenseCategory: true, subType: true, hours: true, perBighaRate: true, totalCost: true, remarks: true, isPaid: true, expenseBornBy: true, rentalMachinery: true, rentalFarmWork: true, rentalChargesPerBigha: true, rentalChargesPerHour: true, rentalHours: true, rentalBigha: true, rentalTotalCharges: true, rentalRemarks: true, rentalIsPaid: true }).partial();
      const parsed = allowedItemFields.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const updated = await storage.updateKhataItem(parseInt(req.params.itemId), parsed.data);
      await storage.recalculateKhataTotals(item.khataRegisterId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update item" });
    }
  });

  app.delete("/api/khata/items/:itemId", isAuthenticated, async (req: any, res) => {
    try {
      const item = await storage.getKhataItem(parseInt(req.params.itemId));
      if (!item) return res.status(404).json({ message: "Not found" });
      const reg = await storage.getKhataRegister(item.khataRegisterId);
      if (!reg || reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const registerId = item.khataRegisterId;
      await storage.deleteKhataItem(parseInt(req.params.itemId));
      await storage.recalculateKhataTotals(registerId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete item" });
    }
  });

  app.get("/api/khata/:id/panat-payments", isAuthenticated, async (req: any, res) => {
    try {
      const reg = await storage.getKhataRegister(parseInt(req.params.id));
      if (!reg) return res.status(404).json({ message: "Not found" });
      if (reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const payments = await storage.getPanatPayments(reg.id);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch panat payments" });
    }
  });

  app.post("/api/khata/:id/panat-payments", isAuthenticated, async (req: any, res) => {
    try {
      const reg = await storage.getKhataRegister(parseInt(req.params.id));
      if (!reg) return res.status(404).json({ message: "Not found" });
      if (reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const data = insertPanatPaymentSchema.parse({ ...req.body, khataRegisterId: parseInt(req.params.id) });
      const payment = await storage.createPanatPayment(data);
      const allPayments = await storage.getPanatPayments(reg.id);
      const totalPaidAmount = allPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      await storage.updateKhataRegister(reg.id, { totalPaid: totalPaidAmount.toString() } as any);
      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating panat payment:", error);
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete("/api/khata/panat-payments/:paymentId", isAuthenticated, async (req: any, res) => {
    try {
      const payment = await storage.getPanatPayment(parseInt(req.params.paymentId));
      if (!payment) return res.status(404).json({ message: "Not found" });
      const reg = await storage.getKhataRegister(payment.khataRegisterId);
      if (!reg || reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      await storage.deletePanatPayment(parseInt(req.params.paymentId));
      const allPayments = await storage.getPanatPayments(reg.id);
      const totalPaidAmount = allPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      await storage.updateKhataRegister(reg.id, { totalPaid: totalPaidAmount.toString() } as any);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete panat payment" });
    }
  });

  app.post("/api/khata/:id/lenden", isAuthenticated, async (req: any, res) => {
    try {
      const reg = await storage.getKhataRegister(parseInt(req.params.id));
      if (!reg) return res.status(404).json({ message: "Not found" });
      if (reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      if (reg.khataType !== "lending_ledger") return res.status(400).json({ message: "Not a lending ledger" });

      const { transactionType, date, principalAmount, interestRateMonthly, paymentAmount, remarks } = req.body;

      if (transactionType === "borrowing") {
        if (!date || !principalAmount || !interestRateMonthly) return res.status(400).json({ message: "Missing fields" });
        const txn = await storage.createLendenBorrowing({
          khataRegisterId: parseInt(req.params.id),
          date,
          principalAmount: principalAmount.toString(),
          interestRateMonthly: interestRateMonthly.toString(),
          remarks: remarks || undefined,
        });
        await storage.recalculateLendenTotals(parseInt(req.params.id));
        res.status(201).json(txn);
      } else if (transactionType === "payment") {
        if (!date || !paymentAmount) return res.status(400).json({ message: "Missing fields" });
        const txn = await storage.createLendenPayment(
          parseInt(req.params.id),
          date,
          parseFloat(paymentAmount),
          remarks || undefined,
        );
        await storage.recalculateLendenTotals(parseInt(req.params.id));
        res.status(201).json(txn);
      } else {
        return res.status(400).json({ message: "Invalid transaction type" });
      }
    } catch (error) {
      console.error("Error creating lenden transaction:", error);
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete("/api/khata/lenden/:transactionId", isAuthenticated, async (req: any, res) => {
    try {
      const txn = await storage.getLendenTransaction(parseInt(req.params.transactionId));
      if (!txn) return res.status(404).json({ message: "Not found" });
      const reg = await storage.getKhataRegister(txn.khataRegisterId);
      if (!reg || reg.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const registerId = txn.khataRegisterId;
      await storage.deleteLendenTransaction(parseInt(req.params.transactionId));
      await storage.recalculateLendenTotals(registerId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete lenden transaction" });
    }
  });

  const isAdmin: RequestHandler = async (req: any, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user?.isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };

  app.post("/api/track-visit", async (req, res) => {
    try {
      const { visitorId } = req.body;
      if (!visitorId || typeof visitorId !== "string") {
        return res.status(400).json({ message: "Invalid visitorId" });
      }
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
      await storage.recordSiteVisit(visitorId, ip);
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  app.post("/api/admin/weather-log-now", isAdmin, async (req: any, res) => {
    try {
      const count = await storage.fetchAndLogWeather();
      res.json({ message: `Weather logged for ${count} locations`, count });
    } catch (err) {
      res.status(500).json({ message: "Weather logging failed" });
    }
  });

  app.get("/api/admin/stats", isAdmin, async (req: any, res) => {
    try {
      const [totalVisitors, todayVisitors, allUsers] = await Promise.all([
        storage.getTotalUniqueVisitors(),
        storage.getTodayUniqueVisitors(),
        storage.getAllUsers(),
      ]);
      res.json({ totalVisitors, todayVisitors, totalUsers: allUsers.length });
    } catch (err) {
      res.status(500).json({ message: "Failed to get stats" });
    }
  });

  app.get("/api/admin/users", isAdmin, async (req: any, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const sanitized = allUsers.map(u => {
        const { pin, knownIps, ...safe } = u;
        return safe;
      });
      res.json(sanitized);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id", isAdmin, async (req: any, res) => {
    try {
      const { firstName, lastName, phoneNumber, email } = req.body;
      if (phoneNumber !== undefined && !/^\d{10}$/.test(phoneNumber)) {
        return res.status(400).json({ message: "Invalid phone number (must be 10 digits)" });
      }
      if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      const data: any = {};
      if (firstName !== undefined) data.firstName = firstName;
      if (lastName !== undefined) data.lastName = lastName;
      if (phoneNumber !== undefined) data.phoneNumber = phoneNumber;
      if (email !== undefined) data.email = email || null;
      const updated = await storage.updateUserAdmin(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { pin, knownIps, ...safe } = updated;
      res.json(safe);
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "Duplicate phone or email" });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.post("/api/admin/users/:id/reset-pin", isAdmin, async (req: any, res) => {
    try {
      const defaultPin = "0000";
      const hashedPin = await bcrypt.hash(defaultPin, 10);
      const updated = await storage.resetUserPin(req.params.id, hashedPin);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { pin, knownIps, ...safe } = updated;
      res.json(safe);
    } catch (error) {
      console.error("Error resetting PIN:", error);
      res.status(500).json({ message: "Failed to reset PIN" });
    }
  });

  app.post("/api/service-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { serviceType, imageData, imageMimeType, imageDataList, imageMimeTypeList, benchmarkRate, declaredSizeBand } = req.body;
      if (!serviceType || !["soil_test", "potato_perishability_test", "crop_doctor", "onion_price_predictor"].includes(serviceType)) {
        return res.status(400).json({ message: "Invalid service type" });
      }

      let aiDiagnosis: string | null = null;
      let inputData: string | null = null;
      let onionImagesForStorage: { data: string; mime: string }[] = [];

      if (serviceType === "onion_price_predictor") {
        const rawList: string[] = Array.isArray(imageDataList) && imageDataList.length > 0
          ? imageDataList
          : (imageData ? [imageData] : []);
        const rawMimes: string[] = Array.isArray(imageMimeTypeList) && imageMimeTypeList.length > 0
          ? imageMimeTypeList
          : (imageMimeType ? [imageMimeType] : []);

        if (rawList.length === 0 || rawMimes.length === 0) {
          return res.status(400).json({ message: "Image required for Onion Price Predictor" });
        }
        if (rawList.length > 3) {
          return res.status(400).json({ message: "Maximum 3 photos per onion lot" });
        }
        if (rawList.length !== rawMimes.length) {
          return res.status(400).json({ message: "Image data and mime type counts must match" });
        }

        onionImagesForStorage = rawList.map((d: string, i: number) => ({
          data: String(d).replace(/^data:[^;]+;base64,/, ""),
          mime: String(rawMimes[i] || "image/jpeg"),
        }));

        const totalBytes = onionImagesForStorage.reduce(
          (sum, img) => sum + Buffer.byteLength(img.data, "base64"),
          0,
        );
        if (totalBytes > 12 * 1024 * 1024) {
          return res.status(400).json({ message: "Total image size exceeds 12 MB" });
        }

        const B = Number(benchmarkRate);
        if (!Number.isFinite(B) || B <= 0) {
          return res.status(400).json({ message: "Valid mandi benchmark price required" });
        }

        const VALID_SIZE_BANDS = ["super", "medium", "gola", "golti", "auto"] as const;
        type SizeBand = typeof VALID_SIZE_BANDS[number];
        if (typeof declaredSizeBand !== "string" || !VALID_SIZE_BANDS.includes(declaredSizeBand as SizeBand)) {
          return res.status(400).json({ message: "Valid size band required" });
        }
        const declared = declaredSizeBand as SizeBand;
        const SIZE_BAND_LABELS: Record<Exclude<SizeBand, "auto">, string> = {
          super: "Super (>60mm)",
          medium: "Medium (45-60mm)",
          gola: "Gola (35-45mm)",
          golti: "Golti (<35mm)",
        };

        inputData = JSON.stringify({ benchmarkRate: B, declaredSizeBand: declared });

        const sizeSection = declared === "auto"
          ? `# Phase 2: Dynamic Size Multipliers (M_size)
The farmer chose **"Let AI decide"** for the size band. Visually assess the dominant grade category from the photo(s) and apply the multiplier to B based on that category and the Heat Index:`
          : `# Phase 2: Dynamic Size Multipliers (M_size) — Farmer-Declared Size Band
The farmer has declared the lot's size band as **${SIZE_BAND_LABELS[declared as Exclude<SizeBand, "auto">]}** (at least 50% of the lot is in this band). Use this declared category directly — do NOT re-estimate the size from the photo. Look up M_size from the table below using this band and the computed Heat Index:`;

        const uniformityRule = declared === "auto"
          ? `5. **uniformity_size** (45–60 mm reference) — tightly consistent size distribution = 5; mixed field-run lot = 1.`
          : `5. **uniformity_size** — score how tightly the visible onions cluster around the farmer-declared band (${SIZE_BAND_LABELS[declared as Exclude<SizeBand, "auto">]}). Tight, uniform sizing within that band = 5; widely scattered sizes outside it = 1.`;

        const sizeGradeEcho = declared === "auto"
          ? `"size_grade": "Super" | "Medium" | "Gola" | "Golti"  // pick EXACTLY one of these four one-word tokens — no parentheses, no mm range, no other text`
          : `"size_grade": "${declared.charAt(0).toUpperCase() + declared.slice(1)}"  // MUST be EXACTLY this one-word token "${declared.charAt(0).toUpperCase() + declared.slice(1)}" — DO NOT include parentheses, mm range, or any other characters (write "${declared.charAt(0).toUpperCase() + declared.slice(1)}", NOT "${declared.charAt(0).toUpperCase() + declared.slice(1)} (35-45mm)" or similar)`;

        const kqvPrompt = `# Role: KrashuVed Commodity Pricing & Underwriting Agent
You are a high-precision pricing engine for the Indian Onion ecosystem. Your task is to calculate two values for every lot:
1. **Market Price:** The estimated current sale value in the Mandi.
2. **Collateral Value:** The de-risked value used for Lending (LSP) and Storage decisions.

You may receive 1 to 3 photos of the same lot — score the lot as a whole, not each photo separately.

The user-provided mandi_benchmark_price (B) for this lot is: INR ${B} per kg (this is the price for Lot 1 — Premium Super grade in the user's mandi today).

# Phase 1: Market Heat Index (H) Calculation
Determine the Market State based on B:
- **H = "Low" (Quality-Driven):** If B <= 15.
- **H = "Medium" (Balanced):** If 15 < B < 30.
- **H = "High" (Supply-Driven/Scarcity):** If B >= 30.

${sizeSection}

| Grade Category   | Low Heat (B<=15) | Medium Heat (15<B<30) | High Heat (B>=30) |
| Super (>60mm)    | 1.00             | 1.00                  | 1.00              |
| Medium (45-60mm) | 0.80             | 0.85                  | 0.90              |
| Gola (35-45mm)   | 0.55             | 0.65                  | 0.75              |
| Golti (<35mm)    | 0.35             | 0.45                  | 0.55              |

# Phase 3: Visual Quality Refinements (Q_adj)
Adjust the resulting price by these cumulative percentages based on visual parameters:
- **Color:** Dark Red / Vibrant Pink: +5%. Dull / Pale / Discolored: -10%.
- **Luster/Parda:** High Waxy Luster (luster_score 5): +5%. Peeling Skin (Kattar) / luster_score <= 2: -15%.
- **Shape/Uniformity:** Perfectly Globe/Uniform: +5%. Irregular / Elongated / Pear-shaped: -10%.

# Phase 4: Sustainability & Lending Haircuts (the LSP Logic — applied to Market Price to derive Collateral Value)
1. **Puffy Penalty:** IF shoulder_geometry == "Convex":
   - If Heat is Low or Medium: -15% on Market Price.
   - If Heat is High: -25% on Market Price.
2. **Dormancy Penalty:** IF neck_rating <= 2: additional -10%.
Sustainability_Haircut = sum of the applicable penalties above (0 if neither applies).

# Phase 5: Final Pricing Formula
1. Base_Price = B × M_size
2. Market_Price = Base_Price × (1 + sum(Q_adj))
3. Collateral_Value = Market_Price × (1 - Sustainability_Haircut)

Round both Market_Price and Collateral_Value to 2 decimals. Express quality_adjustments_total as a signed percentage string (e.g. "+5%", "-10%", "0%").

# Quality Rating Engine (independent of pricing — runs in parallel)
This block is a separate, parallel evaluation of the lot's *visual quality* on the original KQV (KrashuVed Quality Vision) scoring matrix. It is fully independent of the Pricing Engine above:
- It does NOT use the benchmark price B, mandi heat, multipliers, haircuts, or any pricing math.
- It does NOT output any LTV, lending recommendation, collateral percentage, or money value of any kind. LTV stays inside the Pricing Engine only (surfaced via Collateral Value % above).
- Its only job is to express the visual quality of the lot as a 1–5 score, a named band, a 1–5 score for each of the 5 pillars, and a brief markdown rationale.

Score five pillars on an integer 1–5 scale (1 = worst, 5 = best), based purely on the photo:
1. **neck_integrity** (Dormancy) — paper-thin dry closed neck = 5; thick / fleshy / open / sprouting = 1.
2. **shoulder_geometry** — sharp ~90° flat shoulders = 5; convex / puffy / bulging = 1.
3. **parda_luster** — 2–3 waxy intact skin layers + vibrant pink/dark-red shine = 5; dull / peeling (Kattar) / single thin skin = 1.
4. **shape_roundness** — perfectly globe / round = 5; elongated / pear-shaped / oven-shaped = 1.
${uniformityRule}

Compute overall_score (the simple average of the five pillar scores, expressed as a number with at most one decimal, between 1.0 and 5.0) and pick exactly one score_band:
- **5.0–4.5 → "Elite Storage"** — flat shoulders, thin necks, triple skin, vibrant color.
- **4.4–3.5 → "Premium Commercial"** — good size, mostly round, stable necks.
- **3.4–2.5 → "Standard/Domestic"** — average mandi quality, minor peeling, mixed sizes.
- **2.4–1.5 → "High Risk/Puffy"** — convex shoulders, fleshy necks, dull luster.
- **1.4–1.0 → "Distress/Reject"** — sprouting, rot, or severe mechanical damage.

The rationale_markdown must be a short markdown string (2–4 bullet points, "- " prefixed) calling out which pillars drove the score. It must NOT contain any rupee value, percentage, LTV, collateral, or pricing language.

# Output Format (return ONLY this JSON object — no markdown, no commentary)
{
  "pricing_analysis": {
    "market_heat_index": "Low" | "Medium" | "High",
    "calculated_market_price": <number>,
    "collateral_value": <number>,
    "valuation_breakdown": {
      "base_multiplier_used": <number>,
      "quality_adjustments_total": "<signed percentage string>",
      "puffy_penalty_applied": <boolean>
    },
    "underwriting_note": "<one short English sentence explaining the price drift or safety haircut applied>"
  },
  "visual_parameters": {
    ${sizeGradeEcho},
    "color": "<short description like 'Dark Red', 'Pale Yellow'>",
    "luster_score": <integer 1-5>,
    "shape_uniformity": "<short description like 'Perfectly Globe', 'Irregular', 'Mixed'>",
    "neck_rating": <integer 1-5>,
    "shoulder_geometry": "Flat" | "Convex" | "Tapered"
  },
  "quality_rating": {
    "overall_score": <number 1.0-5.0, at most 1 decimal>,
    "score_band": "Elite Storage" | "Premium Commercial" | "Standard/Domestic" | "High Risk/Puffy" | "Distress/Reject",
    "pillar_scores": {
      "neck_integrity": <integer 1-5>,
      "shoulder_geometry": <integer 1-5>,
      "parda_luster": <integer 1-5>,
      "shape_roundness": <integer 1-5>,
      "uniformity_size": <integer 1-5>
    },
    "rationale_markdown": "<short markdown, 2-4 bullets, no rupee/LTV/percent>"
  }
}

If the image does not appear to be onions, return:
{ "error": "image_not_onion", "message": "The uploaded image does not appear to be an onion lot. Please upload a clear photo of onions." }`;

        try {
          const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
              role: "user",
              parts: [
                { text: kqvPrompt },
                ...onionImagesForStorage.map((img) => ({
                  inlineData: { mimeType: img.mime, data: img.data },
                })),
              ],
            }],
            config: {
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 1024 },
            },
          });
          let raw = (result.text || "").trim();
          raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed.error === "image_not_onion") {
              aiDiagnosis = JSON.stringify(parsed);
            } else {
              if (parsed && typeof parsed === "object" && parsed.visual_parameters && typeof parsed.visual_parameters.size_grade === "string") {
                const sg = String(parsed.visual_parameters.size_grade)
                  .replace(/\s*\(.*?\)\s*/g, "")
                  .trim();
                const sgLower = sg.toLowerCase();
                const canonical: Record<string, string> = { super: "Super", medium: "Medium", gola: "Gola", golti: "Golti" };
                if (canonical[sgLower]) {
                  parsed.visual_parameters.size_grade = canonical[sgLower];
                }
              }
              const validated = onionResultSchema.safeParse(parsed);
              if (validated.success) {
                const storage_recommendation = computeStorageRecommendation(validated.data);
                aiDiagnosis = JSON.stringify({ ...validated.data, storage_recommendation });
              } else {
                aiDiagnosis = JSON.stringify({
                  error: "invalid_shape",
                  message: "AI returned an unexpected response. Please try again.",
                  raw,
                });
              }
            }
          } catch {
            aiDiagnosis = JSON.stringify({ error: "parse_failed", raw });
          }
        } catch (aiErr) {
          console.error("Gemini onion predictor error:", aiErr);
          aiDiagnosis = JSON.stringify({ error: "ai_failed", message: "AI analysis failed. Please try again." });
        }
      } else if (serviceType === "crop_doctor") {
        if (!imageData || !imageMimeType) {
          return res.status(400).json({ message: "Image required for Crop Doctor" });
        }
        const base64Data = imageData.replace(/^data:[^;]+;base64,/, "");
        const language = req.body.language || "hi";
        const diagPrompt = language === "hi"
          ? `आप एक कृषि विशेषज्ञ हैं। इस फसल/पौधे की तस्वीर का विश्लेषण करें।

फॉर्मेटिंग नियम:
- हर सेक्शन का शीर्षक **बोल्ड** में लिखें (सिर्फ एक बार ** लगाएं)
- बुलेट पॉइंट्स के लिए "- " का उपयोग करें
- छोटे और सटीक जवाब दें, हर पॉइंट 1-2 लाइन में
- बेवजह तारे (*) या नेस्टेड फॉर्मेटिंग न लगाएं

इस ढांचे में जवाब दें:

**समस्या की पहचान**
- रोग/कीट/कमी का नाम
- यह रोग है, कीट है, या पोषक तत्व की कमी

**कारण**
- यह समस्या क्यों हुई (1-2 पॉइंट)

**लक्षण**
- तस्वीर में दिखने वाले मुख्य लक्षण (2-3 पॉइंट)

**उपचार**
- दवा का नाम और मात्रा
- छिड़काव/उपयोग का तरीका
- कब करें

**रोकथाम**
- भविष्य में बचाव के 2-3 टिप्स`
          : `You are an agriculture expert. Analyze this crop/plant image.

Formatting rules:
- Use **bold** for section headings only (single pair of **)
- Use "- " for bullet points
- Keep each point concise (1-2 lines max)
- Do NOT use nested asterisks, excessive markdown, or numbered sub-lists

Respond in this structure:

**Identified Problem**
- Disease/pest/deficiency name
- Type: disease, pest, or nutrient deficiency

**Cause**
- Why this happened (1-2 points)

**Symptoms**
- Key visible symptoms from the image (2-3 points)

**Treatment**
- Medicine name and dosage
- Application method
- When to apply

**Prevention**
- 2-3 tips to prevent in future`;

        try {
          const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
              role: "user",
              parts: [
                { text: diagPrompt },
                { inlineData: { mimeType: imageMimeType, data: base64Data } },
              ],
            }],
            config: { maxOutputTokens: 4096 },
          });
          aiDiagnosis = result.text || null;
        } catch (aiErr) {
          console.error("Gemini crop doctor error:", aiErr);
          aiDiagnosis = language === "hi" ? "AI विश्लेषण में त्रुटि हुई। कृपया पुनः प्रयास करें।" : "AI analysis failed. Please try again.";
        }
      }

      const savesImage = serviceType === "crop_doctor" || serviceType === "onion_price_predictor";
      const isOnionSave = serviceType === "onion_price_predictor" && onionImagesForStorage.length > 0;

      let onionImagesForDb: { data: string; mime: string }[] = [];
      if (isOnionSave) {
        onionImagesForDb = await Promise.all(
          onionImagesForStorage.map((img) => compressOnionImageForStorage(img.data, img.mime)),
        );
      }

      const primaryImageData = isOnionSave
        ? onionImagesForDb[0].data
        : (savesImage ? imageData : null);
      const primaryImageMime = isOnionSave
        ? onionImagesForDb[0].mime
        : (savesImage ? imageMimeType : null);
      const request = await storage.createServiceRequest({
        userId,
        serviceType,
        farmerName: user.firstName || null,
        farmerPhone: user.phoneNumber || null,
        farmerCode: user.farmerCode || null,
        imageData: primaryImageData,
        imageMimeType: primaryImageMime,
        imageDataList: isOnionSave ? onionImagesForDb.map((i) => i.data) : null,
        imageMimeTypeList: isOnionSave ? onionImagesForDb.map((i) => i.mime) : null,
        declaredSizeBand: serviceType === "onion_price_predictor" ? (declaredSizeBand ?? null) : null,
        aiDiagnosis,
        inputData,
      });

      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating service request:", error);
      res.status(500).json({ message: "Failed to create service request" });
    }
  });

  app.get("/api/service-requests", isAuthenticated, async (req: any, res) => {
    try {
      const requests = await storage.getServiceRequestsByUser(req.session.userId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service requests" });
    }
  });

  app.get("/api/service-requests/:id/image", isAuthenticated, async (req: any, res) => {
    try {
      const request = await storage.getServiceRequest(parseInt(req.params.id));
      if (!request) return res.status(404).json({ message: "Not found" });
      const user = await storage.getUserById(req.session.userId);
      if (request.userId !== req.session.userId && !user?.isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const rawIndex = req.query.index;
      const requestedIndex = Number.isFinite(Number(rawIndex)) ? Math.max(0, Math.floor(Number(rawIndex))) : 0;
      const list = request.imageDataList;
      const mimes = request.imageMimeTypeList;

      let data: string | null = null;
      let mime: string | null = null;
      if (Array.isArray(list) && list.length > 0) {
        const safeIndex = requestedIndex < list.length ? requestedIndex : 0;
        data = list[safeIndex];
        mime = (Array.isArray(mimes) && mimes[safeIndex]) ? mimes[safeIndex] : (request.imageMimeType || "image/jpeg");
      } else if (request.imageData) {
        data = request.imageData;
        mime = request.imageMimeType || "image/jpeg";
      }

      if (!data) return res.status(404).json({ message: "Not found" });
      const buffer = Buffer.from(data, "base64");
      res.set("Content-Type", mime || "image/jpeg");
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch image" });
    }
  });

  app.get("/api/admin/service-requests", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const requests = await storage.getAllServiceRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service requests" });
    }
  });

  app.patch("/api/admin/service-requests/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, adminRemarks, isArchived } = req.body;
      const data: any = {};
      if (status !== undefined) {
        if (!["open", "closed"].includes(status)) return res.status(400).json({ message: "Invalid status" });
        data.status = status;
      }
      if (adminRemarks !== undefined) {
        if (typeof adminRemarks !== "string") return res.status(400).json({ message: "Invalid remarks" });
        data.adminRemarks = adminRemarks;
      }
      if (isArchived !== undefined) {
        if (typeof isArchived !== "boolean") return res.status(400).json({ message: "Invalid isArchived" });
        data.isArchived = isArchived;
      }
      const updated = await storage.updateServiceRequest(parseInt(req.params.id), data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update service request" });
    }
  });

  // Banner routes
  app.get("/api/banners", async (_req: any, res) => {
    try {
      const activeBanners = await storage.getActiveBanners();
      const result = activeBanners.map(({ imageData, ...rest }) => ({
        ...rest,
        hasImage: !!imageData,
      }));
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch banners" });
    }
  });

  app.get("/api/banners/:id/image", async (req: any, res) => {
    try {
      const banner = await storage.getBanner(parseInt(req.params.id));
      if (!banner || !banner.imageData || !banner.imageMime) {
        return res.status(404).json({ message: "Image not found" });
      }
      const buffer = Buffer.from(banner.imageData, "base64");
      res.set("Content-Type", banner.imageMime);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch banner image" });
    }
  });

  app.get("/api/admin/banners", isAdmin, async (_req: any, res) => {
    try {
      const allBanners = await storage.getAllBanners();
      const result = allBanners.map(({ imageData, ...rest }) => ({
        ...rest,
        hasImage: !!imageData,
      }));
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch banners" });
    }
  });

  app.post("/api/admin/banners", isAdmin, async (req: any, res) => {
    try {
      const { type, headingHi, headingEn, subHeadingHi, subHeadingEn, descriptionHi, descriptionEn, imageData, imageMime, captionHi, captionEn, sortOrder, isActive } = req.body;
      if (!type || !["text", "image"].includes(type)) {
        return res.status(400).json({ message: "Invalid banner type" });
      }
      if (type === "text" && !headingHi && !headingEn) {
        return res.status(400).json({ message: "Text banner requires at least one heading" });
      }
      if (type === "image" && imageData) {
        const sizeBytes = Buffer.byteLength(imageData, "base64");
        if (sizeBytes > 5 * 1024 * 1024) {
          return res.status(400).json({ message: "Image too large (max 5MB)" });
        }
        const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (imageMime && !allowedMimes.includes(imageMime)) {
          return res.status(400).json({ message: "Invalid image type" });
        }
      }
      const banner = await storage.createBanner({
        type,
        headingHi: headingHi || null,
        headingEn: headingEn || null,
        subHeadingHi: subHeadingHi || null,
        subHeadingEn: subHeadingEn || null,
        descriptionHi: descriptionHi || null,
        descriptionEn: descriptionEn || null,
        imageData: imageData || null,
        imageMime: imageMime || null,
        captionHi: captionHi || null,
        captionEn: captionEn || null,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        isActive: typeof isActive === "boolean" ? isActive : true,
      });
      const { imageData: _, ...rest } = banner;
      res.json({ ...rest, hasImage: !!banner.imageData });
    } catch (error) {
      console.error("Error creating banner:", error);
      res.status(500).json({ message: "Failed to create banner" });
    }
  });

  app.patch("/api/admin/banners/:id", isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getBanner(id);
      if (!existing) return res.status(404).json({ message: "Banner not found" });

      if (req.body.type && !["text", "image"].includes(req.body.type)) {
        return res.status(400).json({ message: "Invalid banner type" });
      }
      if (req.body.imageData) {
        const sizeBytes = Buffer.byteLength(req.body.imageData, "base64");
        if (sizeBytes > 5 * 1024 * 1024) {
          return res.status(400).json({ message: "Image too large (max 5MB)" });
        }
      }
      const data: any = {};
      const allowedFields = ["type", "headingHi", "headingEn", "subHeadingHi", "subHeadingEn", "descriptionHi", "descriptionEn", "imageData", "imageMime", "captionHi", "captionEn", "sortOrder", "isActive"];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) data[field] = req.body[field];
      }
      const banner = await storage.updateBanner(id, data);
      if (!banner) return res.status(404).json({ message: "Banner not found" });
      const { imageData: _, ...rest } = banner;
      res.json({ ...rest, hasImage: !!banner.imageData });
    } catch (error) {
      res.status(500).json({ message: "Failed to update banner" });
    }
  });

  app.delete("/api/admin/banners/:id", isAdmin, async (req: any, res) => {
    try {
      await storage.deleteBanner(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete banner" });
    }
  });

  // Price Trends - Public routes
  app.get("/api/price-crops", async (_req, res) => {
    try {
      const crops = await storage.getActivePriceCrops();
      res.json(crops);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch price crops" });
    }
  });

  app.get("/api/price-entries/:cropId", async (req, res) => {
    try {
      const cropId = parseInt(req.params.cropId);
      const entries = await storage.getPriceEntries(cropId, 5);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch price entries" });
    }
  });

  app.get("/api/price-polls/:cropId", async (req, res) => {
    try {
      const cropId = parseInt(req.params.cropId);
      const results = await storage.getPricePollResults(cropId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch poll results" });
    }
  });

  app.get("/api/price-polls/:cropId/my-vote", async (req: any, res) => {
    try {
      if (!req.session?.userId) return res.json({ vote: null });
      const cropId = parseInt(req.params.cropId);
      const poll = await storage.getUserPollVote(cropId, req.session.userId);
      res.json({ vote: poll?.vote || null });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vote" });
    }
  });

  app.post("/api/price-polls/:cropId/vote", async (req: any, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ message: "Login required" });
      const cropId = parseInt(req.params.cropId);
      const { vote } = req.body;
      if (!vote || !["hold", "sale"].includes(vote)) {
        return res.status(400).json({ message: "Invalid vote" });
      }
      await storage.upsertPricePoll(cropId, req.session.userId, vote);
      const results = await storage.getPricePollResults(cropId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to cast vote" });
    }
  });

  // Price Trends - Admin routes
  app.get("/api/admin/price-crops", isAdmin, async (_req: any, res) => {
    try {
      const crops = await storage.getAllPriceCrops();
      res.json(crops);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch price crops" });
    }
  });

  app.post("/api/admin/price-crops", isAdmin, async (req: any, res) => {
    try {
      const { nameHi, nameEn } = req.body;
      if (!nameHi || !nameEn) {
        return res.status(400).json({ message: "Both Hindi and English names required" });
      }
      const crop = await storage.createPriceCrop({ nameHi, nameEn });
      res.json(crop);
    } catch (error) {
      res.status(500).json({ message: "Failed to create price crop" });
    }
  });

  app.patch("/api/admin/price-crops/:id", isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const data: any = {};
      const allowedFields = ["nameHi", "nameEn", "recommendation", "isActive", "uploadedSources"];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) data[field] = req.body[field];
      }
      if (data.recommendation && !["hold", "sale"].includes(data.recommendation)) {
        data.recommendation = null;
      }
      const crop = await storage.updatePriceCrop(id, data);
      if (!crop) return res.status(404).json({ message: "Crop not found" });
      res.json(crop);
    } catch (error) {
      res.status(500).json({ message: "Failed to update price crop" });
    }
  });

  app.delete("/api/admin/price-crops/:id", isAdmin, async (req: any, res) => {
    try {
      await storage.deletePriceCrop(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete price crop" });
    }
  });

  app.post("/api/admin/price-crops/:id/upload", isAdmin, async (req: any, res) => {
    try {
      const cropId = parseInt(req.params.id);
      const crop = await storage.getPriceCrop(cropId);
      if (!crop) return res.status(404).json({ message: "Crop not found" });

      const { fileData, clearExisting } = req.body;
      if (!fileData) return res.status(400).json({ message: "No file data" });

      const xlsxModule = await import("xlsx");
      const XLSX = xlsxModule.default || xlsxModule;
      const buffer = Buffer.from(fileData, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        return res.status(400).json({ message: "Excel file is empty" });
      }

      const entries: any[] = [];
      for (const row of rows) {
        const dateVal = row["Date"] || row["date"] || row["DATE"] || row["date_arrival"] || row["Date_Arrival"] || row["Arrival_Date"];
        const market = row["Market"] || row["market"] || row["MARKET"] || row["Market Name"] || row["market_name"] || row["market_center_name"] || row["Market_Center_Name"] || row["Market Center Name"];
        const district = row["district_name"] || row["District"] || row["district"] || row["DISTRICT"] || row["District Name"] || "";
        const stateName = row["state_name"] || row["State"] || row["state"] || row["STATE"] || row["State Name"] || "";
        const minPrice = row["Min Price"] || row["min_price"] || row["MIN_PRICE"] || row["Min"] || row["min"] || row["MIN"];
        const maxPrice = row["Max Price"] || row["max_price"] || row["MAX_PRICE"] || row["Max"] || row["max"] || row["MAX"];
        const modalPrice = row["Modal Price"] || row["modal_price"] || row["MODAL_PRICE"] || row["Modal"] || row["modal"] || row["MODAL"];

        if (!market || modalPrice === undefined) continue;

        let parsedDate: string;
        if (typeof dateVal === "number") {
          const d = XLSX.SSF.parse_date_code(dateVal);
          parsedDate = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        } else if (dateVal) {
          const d = new Date(dateVal);
          if (!isNaN(d.getTime())) {
            parsedDate = d.toISOString().split("T")[0];
          } else {
            continue;
          }
        } else {
          continue;
        }

        entries.push({
          cropId,
          market: String(market).trim(),
          district: district ? String(district).trim() : null,
          state: stateName ? String(stateName).trim() : null,
          date: parsedDate,
          minPrice: String(minPrice || modalPrice),
          maxPrice: String(maxPrice || modalPrice),
          modalPrice: String(modalPrice),
          unit: row["Unit"] || row["unit"] || "quintal",
        });
      }

      if (entries.length === 0) {
        return res.status(400).json({ message: "No valid data found in Excel. Expected columns: Date, Market, Min Price, Max Price, Modal Price" });
      }

      if (clearExisting) {
        await storage.clearPriceEntries(cropId);
        await storage.updatePriceCrop(cropId, { uploadedSources: [] } as any);
      }

      await storage.bulkInsertPriceEntries(entries);

      const stateAbbr: Record<string, string> = {
        "andhra pradesh": "AP", "arunachal pradesh": "AR", "assam": "AS", "bihar": "BR",
        "chhattisgarh": "CG", "goa": "GA", "gujarat": "GJ", "haryana": "HR",
        "himachal pradesh": "HP", "jharkhand": "JH", "karnataka": "KA", "kerala": "KL",
        "madhya pradesh": "MP", "maharashtra": "MH", "manipur": "MN", "meghalaya": "ML",
        "mizoram": "MZ", "nagaland": "NL", "odisha": "OD", "punjab": "PB",
        "rajasthan": "RJ", "sikkim": "SK", "tamil nadu": "TN", "telangana": "TG",
        "tripura": "TR", "uttar pradesh": "UP", "uttarakhand": "UK", "west bengal": "WB",
        "delhi": "DL", "jammu and kashmir": "JK", "ladakh": "LA", "chandigarh": "CH",
      };
      const sourceTags = new Set<string>();
      for (const row of rows) {
        const state = row["state_name"] || row["State"] || row["state"] || "";
        const district = row["district_name"] || row["District"] || row["district"] || "";
        if (state) {
          const stCode = stateAbbr[state.toLowerCase().trim()] || state.substring(0, 2).toUpperCase();
          const dtCode = district ? district.substring(0, 2).toUpperCase() : "";
          sourceTags.add(dtCode ? `${stCode}_${dtCode}` : stCode);
        }
      }

      if (sourceTags.size > 0) {
        const existing = crop.uploadedSources || [];
        const merged = [...new Set([...existing, ...sourceTags])];
        await storage.updatePriceCrop(cropId, { uploadedSources: merged } as any);
      }

      res.json({ success: true, count: entries.length, sources: [...sourceTags] });
    } catch (error) {
      console.error("Excel upload error:", error);
      res.status(500).json({ message: "Failed to process Excel file" });
    }
  });

  // Marketplace routes
  app.get("/api/marketplace", async (req: any, res) => {
    try {
      const category = req.query.category as string | undefined;
      const listings = await storage.getMarketplaceListings(category ? { category } : undefined);
      const results = await Promise.all(listings.map(async ({ photoData, ...rest }) => {
        const [photoCount, ratingInfo] = await Promise.all([
          storage.getListingPhotoCount(rest.id),
          storage.getListingAvgRating(rest.id),
        ]);
        return { ...rest, photoCount, avgRating: ratingInfo.avg, ratingCount: ratingInfo.count };
      }));
      res.json(results);
    } catch (error) {
      console.error("Error fetching marketplace:", error);
      res.status(500).json({ message: "Failed to fetch listings" });
    }
  });

  // Lightweight status endpoint used by deep-link handlers to tell buyers
  // why a shared listing link no longer resolves to a viewable listing.
  // Returns "active" if the listing is live, "inactive" if the seller has
  // paused it, or "deleted" if no row exists. Exposes only the status flag
  // (and sellerId when a row exists, so the UI can suggest the seller's
  // other live listings) — never the full listing payload.
  app.get("/api/marketplace/:id/status", async (req: any, res) => {
    try {
      const listingId = parseInt(req.params.id);
      if (!listingId || Number.isNaN(listingId)) {
        return res.status(400).json({ message: "Invalid id" });
      }
      const listing = await storage.getMarketplaceListing(listingId);
      if (!listing) {
        return res.json({ status: "deleted" });
      }
      if (!listing.isActive) {
        return res.json({ status: "inactive", sellerId: listing.sellerId });
      }
      return res.json({ status: "active", sellerId: listing.sellerId });
    } catch (error) {
      console.error("Error fetching listing status:", error);
      res.status(500).json({ message: "Failed to fetch listing status" });
    }
  });

  app.get("/api/marketplace/:id/image", async (req: any, res) => {
    try {
      const listingId = parseInt(req.params.id);
      const index = parseInt(req.query.index as string) || 0;
      const photo = await storage.getListingPhotoByIndex(listingId, index);
      if (photo) {
        const buffer = Buffer.from(photo.photoData, "base64");
        res.setHeader("Content-Type", photo.photoMime);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
      }
      const listing = await storage.getMarketplaceListing(listingId);
      if (!listing || !listing.photoData || !listing.photoMime) {
        return res.status(404).json({ message: "Image not found" });
      }
      const buffer = Buffer.from(listing.photoData, "base64");
      res.setHeader("Content-Type", listing.photoMime);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch image" });
    }
  });

  app.get("/api/marketplace/:id/photos", async (req: any, res) => {
    try {
      const photos = await storage.getListingPhotos(parseInt(req.params.id));
      res.json(photos.map(p => ({ id: p.id, sortOrder: p.sortOrder })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch photos" });
    }
  });

  app.get("/api/marketplace/:id/contact", isAuthenticated, async (req: any, res) => {
    try {
      const listing = await storage.getMarketplaceListing(parseInt(req.params.id));
      if (!listing) return res.status(404).json({ message: "Not found" });
      const seller = await storage.getUserById(listing.sellerId);
      if (!seller) return res.status(404).json({ message: "Seller not found" });
      const sellerRating = await storage.getSellerAvgRating(listing.sellerId);
      res.json({
        name: seller.firstName || "",
        phone: seller.phoneNumber || "",
        farmerCode: seller.farmerCode || "",
        sellerAvgRating: sellerRating.avg,
        sellerRatingCount: sellerRating.count,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contact" });
    }
  });

  app.post("/api/marketplace", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { category, photos, photoData, photoMime, quantityBigha, availableAfterDays, onionType, quantityBags, potatoVariety, potatoBrand, onionSeedType, onionSeedVariety, onionSeedBrand, onionSeedPricePerKg, soyabeanSeedDuration, soyabeanSeedVariety, soyabeanSeedPricePerQuintal, bagCommodityType, bagCommodityOther, bagMaterialType, bagDimension, bagGsm, bagColor, bagMinQuantity, bagPricePerBag, fanBrand, fanBrandOther, fanColor, fanColorOther, fanWattage, fanVoltage, fanAirflowCmh, fanBladeLengthMm, fanSpeedRpm, fanBladeMaterial, fanBladeCount, fanCountryOfOrigin, fanWarrantyYears, fanDimensions, fanPricePerPiece } = req.body || {};
      if (!category || !["onion_seedling", "potato_seed", "onion_seed", "soyabean_seed", "bardan_bag", "exhaust_fan"].includes(category)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      if (category === "onion_seedling" && !quantityBigha) {
        return res.status(400).json({ message: "quantityBigha required for onion_seedling" });
      }
      if (category === "potato_seed" && !quantityBags) {
        return res.status(400).json({ message: "quantityBags required for potato_seed" });
      }
      if (category === "onion_seed" && !onionSeedVariety) {
        return res.status(400).json({ message: "onionSeedVariety required for onion_seed" });
      }
      if (category === "soyabean_seed" && (!soyabeanSeedVariety || !String(soyabeanSeedVariety).trim())) {
        return res.status(400).json({ message: "soyabeanSeedVariety required for soyabean_seed" });
      }
      if (category === "bardan_bag") {
        if (!Array.isArray(bagCommodityType) || bagCommodityType.length === 0) {
          return res.status(400).json({ message: "bagCommodityType required for bardan_bag" });
        }
        if (!bagMaterialType) {
          return res.status(400).json({ message: "bagMaterialType required for bardan_bag" });
        }
        if (!Array.isArray(bagGsm) || bagGsm.length === 0) {
          return res.status(400).json({ message: "bagGsm required for bardan_bag" });
        }
        if (bagPricePerBag === undefined || bagPricePerBag === null || String(bagPricePerBag).trim() === "") {
          return res.status(400).json({ message: "bagPricePerBag required for bardan_bag" });
        }
      }
      if (category === "exhaust_fan") {
        if (fanPricePerPiece === undefined || fanPricePerPiece === null || String(fanPricePerPiece).trim() === "") {
          return res.status(400).json({ message: "fanPricePerPiece required for exhaust_fan" });
        }
      }

      // Allow-lists are imported from shared/schema.ts so the seller form
      // dropdowns and this validation always agree.
      const SOYABEAN_DURATIONS_ALLOWED = ["Long", "Short"];

      if (category === "onion_seed") {
        if (onionSeedType && !MARKETPLACE_ONION_SEED_TYPES.includes(String(onionSeedType) as typeof MARKETPLACE_ONION_SEED_TYPES[number])) {
          return res.status(400).json({ message: "Invalid onionSeedType" });
        }
        if (!MARKETPLACE_ONION_SEED_VARIETIES.includes(String(onionSeedVariety) as typeof MARKETPLACE_ONION_SEED_VARIETIES[number])) {
          return res.status(400).json({ message: "Invalid onionSeedVariety" });
        }
        if (onionSeedBrand && !MARKETPLACE_ONION_SEED_BRANDS.includes(String(onionSeedBrand) as typeof MARKETPLACE_ONION_SEED_BRANDS[number])) {
          return res.status(400).json({ message: "Invalid onionSeedBrand" });
        }
      }

      if (category === "soyabean_seed") {
        if (soyabeanSeedDuration && !SOYABEAN_DURATIONS_ALLOWED.includes(String(soyabeanSeedDuration))) {
          return res.status(400).json({ message: "Invalid soyabeanSeedDuration" });
        }
      }

      let parsedBagGsm: number[] | null = null;
      let parsedBagPricePerBag: number | null = null;
      let parsedBagMinQuantity: number | null = null;
      let parsedBagCommodityTypes: string[] = [];
      let parsedBagCommodityOther: string | null = null;
      if (category === "bardan_bag") {
        const seen = new Set<string>();
        for (const v of bagCommodityType as unknown[]) {
          const s = String(v);
          if (!MARKETPLACE_BAG_COMMODITY_TYPES.includes(s as typeof MARKETPLACE_BAG_COMMODITY_TYPES[number])) {
            return res.status(400).json({ message: "Invalid bagCommodityType" });
          }
          seen.add(s);
        }
        if (seen.size === 0 || seen.size > MARKETPLACE_BAG_COMMODITY_TYPES.length) {
          return res.status(400).json({ message: "Invalid bagCommodityType" });
        }
        parsedBagCommodityTypes = Array.from(seen);
        if (parsedBagCommodityTypes.includes("Others")) {
          const otherStr = typeof bagCommodityOther === "string" ? bagCommodityOther.trim() : "";
          if (!otherStr) {
            return res.status(400).json({ message: "bagCommodityOther required when Others is selected" });
          }
          if (otherStr.length > 40) {
            return res.status(400).json({ message: "bagCommodityOther must be 40 characters or fewer" });
          }
          parsedBagCommodityOther = otherStr;
        }
        if (!MARKETPLACE_BAG_MATERIAL_TYPES.includes(String(bagMaterialType) as typeof MARKETPLACE_BAG_MATERIAL_TYPES[number])) {
          return res.status(400).json({ message: "Invalid bagMaterialType" });
        }
        if (bagColor !== undefined && bagColor !== null && String(bagColor).trim() !== "" && String(bagColor) !== "none") {
          if (!MARKETPLACE_BAG_COLORS.includes(String(bagColor) as typeof MARKETPLACE_BAG_COLORS[number])) {
            return res.status(400).json({ message: "Invalid bagColor" });
          }
        }
        const gsmSeen = new Set<number>();
        for (const v of bagGsm as unknown[]) {
          const raw = String(v).trim();
          if (!/^\d+$/.test(raw)) {
            return res.status(400).json({ message: "Invalid bagGsm" });
          }
          const n = parseInt(raw, 10);
          if (Number.isNaN(n) || !MARKETPLACE_BAG_GSM_OPTIONS.includes(n as typeof MARKETPLACE_BAG_GSM_OPTIONS[number])) {
            return res.status(400).json({ message: "Invalid bagGsm" });
          }
          gsmSeen.add(n);
        }
        if (gsmSeen.size === 0 || gsmSeen.size > MARKETPLACE_BAG_GSM_OPTIONS.length) {
          return res.status(400).json({ message: "Invalid bagGsm" });
        }
        parsedBagGsm = Array.from(gsmSeen).sort((a, b) => a - b);

        const priceRaw = String(bagPricePerBag).trim();
        if (!/^\d+$/.test(priceRaw)) {
          return res.status(400).json({ message: "Invalid bagPricePerBag" });
        }
        const priceN = parseInt(priceRaw, 10);
        if (Number.isNaN(priceN) || priceN < 1 || priceN > 999999) {
          return res.status(400).json({ message: "Invalid bagPricePerBag" });
        }
        parsedBagPricePerBag = priceN;

        if (bagMinQuantity !== undefined && bagMinQuantity !== null && String(bagMinQuantity).trim() !== "") {
          const minRaw = String(bagMinQuantity).trim();
          if (!/^\d+$/.test(minRaw)) {
            return res.status(400).json({ message: "Invalid bagMinQuantity" });
          }
          const minN = parseInt(minRaw, 10);
          if (Number.isNaN(minN) || minN < 0 || minN > 999999) {
            return res.status(400).json({ message: "Invalid bagMinQuantity" });
          }
          parsedBagMinQuantity = minN;
        }
      }

      // Exhaust fan parsing/validation. All fields are optional except price.
      let parsedFanBrand: string | null = null;
      let parsedFanBrandOther: string | null = null;
      let parsedFanColor: string | null = null;
      let parsedFanColorOther: string | null = null;
      let parsedFanWattage: number | null = null;
      let parsedFanVoltage: number | null = null;
      let parsedFanAirflowCmh: number | null = null;
      let parsedFanBladeLengthMm: number | null = null;
      let parsedFanSpeedRpm: number | null = null;
      let parsedFanBladeMaterial: string | null = null;
      let parsedFanBladeCount: number | null = null;
      let parsedFanCountryOfOrigin: string | null = null;
      let parsedFanWarrantyYears: number | null = null;
      let parsedFanDimensions: string | null = null;
      let parsedFanPricePerPiece: number | null = null;
      if (category === "exhaust_fan") {
        const intRangeReq = (raw: any, min: number, max: number, label: string): number => {
          if (raw === undefined || raw === null || String(raw).trim() === "") throw new Error(`${label} required`);
          const s = String(raw).trim();
          if (!/^\d+$/.test(s)) throw new Error(`Invalid ${label}`);
          const n = parseInt(s, 10);
          if (Number.isNaN(n) || n < min || n > max) throw new Error(`Invalid ${label}`);
          return n;
        };
        try {
          if (fanBrand === undefined || fanBrand === null || String(fanBrand).trim() === "" || String(fanBrand) === "none") {
            return res.status(400).json({ message: "fanBrand required for exhaust_fan" });
          }
          if (!MARKETPLACE_FAN_BRANDS.includes(String(fanBrand) as typeof MARKETPLACE_FAN_BRANDS[number])) {
            return res.status(400).json({ message: "Invalid fanBrand" });
          }
          parsedFanBrand = String(fanBrand);
          if (parsedFanBrand === "Others") {
            const otherStr = typeof fanBrandOther === "string" ? fanBrandOther.trim() : "";
            if (!otherStr) return res.status(400).json({ message: "fanBrandOther required when Others is selected" });
            if (otherStr.length > 40) return res.status(400).json({ message: "fanBrandOther must be 40 characters or fewer" });
            parsedFanBrandOther = otherStr;
          }
          if (fanColor === undefined || fanColor === null || String(fanColor).trim() === "" || String(fanColor) === "none") {
            return res.status(400).json({ message: "fanColor required for exhaust_fan" });
          }
          if (!MARKETPLACE_FAN_COLORS.includes(String(fanColor) as typeof MARKETPLACE_FAN_COLORS[number])) {
            return res.status(400).json({ message: "Invalid fanColor" });
          }
          parsedFanColor = String(fanColor);
          if (parsedFanColor === "Others") {
            const otherStr = typeof fanColorOther === "string" ? fanColorOther.trim() : "";
            if (!otherStr) return res.status(400).json({ message: "fanColorOther required when Others is selected" });
            if (otherStr.length > 40) return res.status(400).json({ message: "fanColorOther must be 40 characters or fewer" });
            parsedFanColorOther = otherStr;
          }
          parsedFanWattage = intRangeReq(fanWattage, 1, 10000, "fanWattage");
          parsedFanVoltage = intRangeReq(fanVoltage, 1, 1000, "fanVoltage");
          parsedFanAirflowCmh = intRangeReq(fanAirflowCmh, 1, 999999, "fanAirflowCmh");
          parsedFanBladeLengthMm = intRangeReq(fanBladeLengthMm, 1, 10000, "fanBladeLengthMm");
          parsedFanSpeedRpm = intRangeReq(fanSpeedRpm, 1, 10000, "fanSpeedRpm");
          parsedFanBladeCount = intRangeReq(fanBladeCount, 1, 50, "fanBladeCount");
          parsedFanWarrantyYears = intRangeReq(fanWarrantyYears, 0, 50, "fanWarrantyYears");
          parsedFanPricePerPiece = intRangeReq(fanPricePerPiece, 1, 999999, "fanPricePerPiece");
          const bladeMatStr = typeof fanBladeMaterial === "string" ? fanBladeMaterial.trim() : "";
          if (!bladeMatStr) return res.status(400).json({ message: "fanBladeMaterial required for exhaust_fan" });
          if (bladeMatStr.length > 40) return res.status(400).json({ message: "fanBladeMaterial must be 40 characters or fewer" });
          parsedFanBladeMaterial = bladeMatStr;
          const countryStr = typeof fanCountryOfOrigin === "string" ? fanCountryOfOrigin.trim() : "";
          if (!countryStr) return res.status(400).json({ message: "fanCountryOfOrigin required for exhaust_fan" });
          if (countryStr.length > 40) return res.status(400).json({ message: "fanCountryOfOrigin must be 40 characters or fewer" });
          parsedFanCountryOfOrigin = countryStr;
          const dimStr = typeof fanDimensions === "string" ? fanDimensions.trim() : "";
          if (!dimStr) return res.status(400).json({ message: "fanDimensions required for exhaust_fan" });
          if (dimStr.length > 80) return res.status(400).json({ message: "fanDimensions must be 80 characters or fewer" });
          parsedFanDimensions = dimStr;
        } catch (e: any) {
          return res.status(400).json({ message: e?.message || "Invalid exhaust_fan field" });
        }
      }

      let parsedPricePerKg: number | null = null;
      if (category === "onion_seed" && onionSeedPricePerKg !== undefined && onionSeedPricePerKg !== null && String(onionSeedPricePerKg).trim() !== "") {
        const n = parseInt(String(onionSeedPricePerKg), 10);
        if (Number.isNaN(n) || n < 0 || n > 999999) {
          return res.status(400).json({ message: "Invalid price per kg" });
        }
        parsedPricePerKg = n;
      }

      let parsedPricePerQuintal: number | null = null;
      if (category === "soyabean_seed" && soyabeanSeedPricePerQuintal !== undefined && soyabeanSeedPricePerQuintal !== null && String(soyabeanSeedPricePerQuintal).trim() !== "") {
        const raw = String(soyabeanSeedPricePerQuintal).trim();
        if (!/^\d+$/.test(raw)) {
          return res.status(400).json({ message: "Invalid price per quintal" });
        }
        const n = parseInt(raw, 10);
        if (Number.isNaN(n) || n < 0 || n > 999999) {
          return res.status(400).json({ message: "Invalid price per quintal" });
        }
        parsedPricePerQuintal = n;
      }

      const listing = await storage.createMarketplaceListing({
        sellerId: userId,
        category,
        photoData: null,
        photoMime: null,
        quantityBigha: category === "onion_seedling" && quantityBigha ? String(quantityBigha).slice(0, 20) : null,
        availableAfterDays: category === "onion_seedling" && availableAfterDays ? Math.max(0, parseInt(String(availableAfterDays)) || 0) : null,
        onionType: category === "onion_seedling" && onionType ? String(onionType).slice(0, 100) : null,
        quantityBags: category === "potato_seed" && quantityBags ? String(quantityBags).slice(0, 20) : null,
        potatoVariety: category === "potato_seed" && potatoVariety ? String(potatoVariety).slice(0, 50) : null,
        potatoBrand: category === "potato_seed" && potatoBrand ? String(potatoBrand).slice(0, 50) : null,
        onionSeedType: category === "onion_seed" && onionSeedType ? String(onionSeedType).slice(0, 100) : null,
        onionSeedVariety: category === "onion_seed" && onionSeedVariety ? String(onionSeedVariety).slice(0, 100) : null,
        onionSeedBrand: category === "onion_seed" && onionSeedBrand ? String(onionSeedBrand).slice(0, 100) : null,
        onionSeedPricePerKg: parsedPricePerKg,
        soyabeanSeedDuration: category === "soyabean_seed" && soyabeanSeedDuration ? String(soyabeanSeedDuration).slice(0, 20) : null,
        soyabeanSeedVariety: category === "soyabean_seed" && soyabeanSeedVariety ? String(soyabeanSeedVariety).trim().slice(0, 100) : null,
        soyabeanSeedPricePerQuintal: parsedPricePerQuintal,
        bagCommodityType: category === "bardan_bag" ? parsedBagCommodityTypes : null,
        bagCommodityOther: category === "bardan_bag" ? parsedBagCommodityOther : null,
        bagMaterialType: category === "bardan_bag" && bagMaterialType ? String(bagMaterialType).slice(0, 30) : null,
        bagDimension: category === "bardan_bag" && bagDimension ? String(bagDimension).trim().slice(0, 40) : null,
        bagGsm: category === "bardan_bag" ? parsedBagGsm : null,
        bagColor: category === "bardan_bag" && bagColor && String(bagColor) !== "none" && String(bagColor).trim() !== "" ? String(bagColor).slice(0, 20) : null,
        bagMinQuantity: category === "bardan_bag" ? parsedBagMinQuantity : null,
        bagPricePerBag: category === "bardan_bag" ? parsedBagPricePerBag : null,
        fanBrand: category === "exhaust_fan" ? parsedFanBrand : null,
        fanBrandOther: category === "exhaust_fan" ? parsedFanBrandOther : null,
        fanColor: category === "exhaust_fan" ? parsedFanColor : null,
        fanColorOther: category === "exhaust_fan" ? parsedFanColorOther : null,
        fanWattage: category === "exhaust_fan" ? parsedFanWattage : null,
        fanVoltage: category === "exhaust_fan" ? parsedFanVoltage : null,
        fanAirflowCmh: category === "exhaust_fan" ? parsedFanAirflowCmh : null,
        fanBladeLengthMm: category === "exhaust_fan" ? parsedFanBladeLengthMm : null,
        fanSpeedRpm: category === "exhaust_fan" ? parsedFanSpeedRpm : null,
        fanBladeMaterial: category === "exhaust_fan" ? parsedFanBladeMaterial : null,
        fanBladeCount: category === "exhaust_fan" ? parsedFanBladeCount : null,
        fanCountryOfOrigin: category === "exhaust_fan" ? parsedFanCountryOfOrigin : null,
        fanWarrantyYears: category === "exhaust_fan" ? parsedFanWarrantyYears : null,
        fanDimensions: category === "exhaust_fan" ? parsedFanDimensions : null,
        fanPricePerPiece: category === "exhaust_fan" ? parsedFanPricePerPiece : null,
        sellerVillage: user.village || null,
        sellerTehsil: user.tehsil || null,
        sellerDistrict: user.district || null,
        sellerLat: user.latitude || null,
        sellerLng: user.longitude || null,
        isActive: true,
      });

      const photoArr = Array.isArray(photos) ? photos.slice(0, 3) : [];
      if (photoArr.length > 0) {
        await storage.addListingPhotos(listing.id, photoArr.map((p: any, i: number) => ({
          photoData: String(p.base64),
          photoMime: String(p.mime).slice(0, 50),
          sortOrder: i,
        })));
      } else if (photoData) {
        await storage.addListingPhotos(listing.id, [{
          photoData: String(photoData),
          photoMime: String(photoMime || "image/jpeg").slice(0, 50),
          sortOrder: 0,
        }]);
      }

      const photoCount = await storage.getListingPhotoCount(listing.id);
      const { photoData: _, ...listingWithoutPhoto } = listing;
      res.status(201).json({ ...listingWithoutPhoto, photoCount });
    } catch (error) {
      console.error("Error creating listing:", error);
      res.status(500).json({ message: "Failed to create listing" });
    }
  });

  app.patch("/api/marketplace/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const existing = await storage.getMarketplaceListing(parseInt(req.params.id));
      if (!existing) return res.status(404).json({ message: "Not found" });
      const requester = await storage.getUserById(userId);
      if (existing.sellerId !== userId && !requester?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const category = existing.category;
      const { photos, photoData, photoMime, quantityBigha, availableAfterDays, onionType, quantityBags, potatoVariety, potatoBrand, onionSeedType, onionSeedVariety, onionSeedBrand, onionSeedPricePerKg, soyabeanSeedDuration, soyabeanSeedVariety, soyabeanSeedPricePerQuintal, bagCommodityType, bagCommodityOther, bagMaterialType, bagDimension, bagGsm, bagColor, bagMinQuantity, bagPricePerBag, fanBrand, fanBrandOther, fanColor, fanColorOther, fanWattage, fanVoltage, fanAirflowCmh, fanBladeLengthMm, fanSpeedRpm, fanBladeMaterial, fanBladeCount, fanCountryOfOrigin, fanWarrantyYears, fanDimensions, fanPricePerPiece } = req.body || {};

      if (category === "onion_seedling" && quantityBigha !== undefined && !quantityBigha) {
        return res.status(400).json({ message: "quantityBigha required for onion_seedling" });
      }
      if (category === "potato_seed" && quantityBags !== undefined && !quantityBags) {
        return res.status(400).json({ message: "quantityBags required for potato_seed" });
      }
      if (category === "onion_seed" && onionSeedVariety !== undefined && !onionSeedVariety) {
        return res.status(400).json({ message: "onionSeedVariety required for onion_seed" });
      }
      if (category === "soyabean_seed" && soyabeanSeedVariety !== undefined && (typeof soyabeanSeedVariety !== "string" || !soyabeanSeedVariety.trim())) {
        return res.status(400).json({ message: "soyabeanSeedVariety required for soyabean_seed" });
      }
      if (category === "bardan_bag") {
        if (bagCommodityType !== undefined && (!Array.isArray(bagCommodityType) || bagCommodityType.length === 0)) {
          return res.status(400).json({ message: "bagCommodityType required for bardan_bag" });
        }
        if (bagMaterialType !== undefined && !bagMaterialType) {
          return res.status(400).json({ message: "bagMaterialType required for bardan_bag" });
        }
        if (bagGsm !== undefined && (!Array.isArray(bagGsm) || bagGsm.length === 0)) {
          return res.status(400).json({ message: "bagGsm required for bardan_bag" });
        }
        if (bagPricePerBag !== undefined && (bagPricePerBag === null || String(bagPricePerBag).trim() === "")) {
          return res.status(400).json({ message: "bagPricePerBag required for bardan_bag" });
        }
      }

      // Onion-seed allow-lists are imported from shared/schema.ts so the
      // seller form dropdowns and this validation always agree.
      const SOYABEAN_DURATIONS_ALLOWED_PATCH = ["Long", "Short"];


      if (category === "onion_seed") {
        if (onionSeedType && !MARKETPLACE_ONION_SEED_TYPES.includes(String(onionSeedType) as typeof MARKETPLACE_ONION_SEED_TYPES[number])) {
          return res.status(400).json({ message: "Invalid onionSeedType" });
        }
        if (onionSeedVariety && !MARKETPLACE_ONION_SEED_VARIETIES.includes(String(onionSeedVariety) as typeof MARKETPLACE_ONION_SEED_VARIETIES[number])) {
          return res.status(400).json({ message: "Invalid onionSeedVariety" });
        }
        if (onionSeedBrand && !MARKETPLACE_ONION_SEED_BRANDS.includes(String(onionSeedBrand) as typeof MARKETPLACE_ONION_SEED_BRANDS[number])) {
          return res.status(400).json({ message: "Invalid onionSeedBrand" });
        }
      }

      if (category === "soyabean_seed" && soyabeanSeedDuration !== undefined && soyabeanSeedDuration !== null && soyabeanSeedDuration !== "") {
        if (!SOYABEAN_DURATIONS_ALLOWED_PATCH.includes(String(soyabeanSeedDuration))) {
          return res.status(400).json({ message: "Invalid soyabeanSeedDuration" });
        }
      }

      let parsedBagGsmPatch: number[] | null | undefined = undefined;
      let parsedBagPricePerBagPatch: number | null | undefined = undefined;
      let parsedBagMinQuantityPatch: number | null | undefined = undefined;
      let parsedBagCommodityTypesPatch: string[] | undefined = undefined;
      let parsedBagCommodityOtherPatch: string | null | undefined = undefined;
      if (category === "bardan_bag") {
        if (bagCommodityType !== undefined && Array.isArray(bagCommodityType)) {
          const seen = new Set<string>();
          for (const v of bagCommodityType) {
            const s = String(v);
            if (!MARKETPLACE_BAG_COMMODITY_TYPES.includes(s as typeof MARKETPLACE_BAG_COMMODITY_TYPES[number])) {
              return res.status(400).json({ message: "Invalid bagCommodityType" });
            }
            seen.add(s);
          }
          if (seen.size === 0 || seen.size > MARKETPLACE_BAG_COMMODITY_TYPES.length) {
            return res.status(400).json({ message: "Invalid bagCommodityType" });
          }
          parsedBagCommodityTypesPatch = Array.from(seen);
        }
        // Determine the effective commodity type set for "Others" presence:
        // either the new array (if provided) or the existing stored array.
        const existingTypes = existing.bagCommodityType;
        const effectiveTypes: string[] = parsedBagCommodityTypesPatch
          ?? (Array.isArray(existingTypes) ? existingTypes : []);
        const effectiveHasOthers = effectiveTypes.includes("Others");
        if (bagCommodityOther !== undefined) {
          // Caller explicitly sent the other-text field. Validate based on
          // whether Others is in the (effective) selection.
          if (effectiveHasOthers) {
            const otherStr = typeof bagCommodityOther === "string" ? bagCommodityOther.trim() : "";
            if (!otherStr) {
              return res.status(400).json({ message: "bagCommodityOther required when Others is selected" });
            }
            if (otherStr.length > 40) {
              return res.status(400).json({ message: "bagCommodityOther must be 40 characters or fewer" });
            }
            parsedBagCommodityOtherPatch = otherStr;
          } else {
            parsedBagCommodityOtherPatch = null;
          }
        } else if (parsedBagCommodityTypesPatch !== undefined) {
          // Caller sent a new commodity selection but no other-text.
          // If the new selection includes Others, require the existing
          // other-text to still be present; otherwise clear it.
          if (effectiveHasOthers) {
            const existingOther = existing.bagCommodityOther;
            if (typeof existingOther !== "string" || !existingOther.trim()) {
              return res.status(400).json({ message: "bagCommodityOther required when Others is selected" });
            }
            // No update needed — keep existing value.
          } else {
            parsedBagCommodityOtherPatch = null;
          }
        }
        if (bagMaterialType !== undefined && bagMaterialType && !MARKETPLACE_BAG_MATERIAL_TYPES.includes(String(bagMaterialType) as typeof MARKETPLACE_BAG_MATERIAL_TYPES[number])) {
          return res.status(400).json({ message: "Invalid bagMaterialType" });
        }
        if (bagColor !== undefined && bagColor !== null && String(bagColor).trim() !== "" && String(bagColor) !== "none") {
          if (!MARKETPLACE_BAG_COLORS.includes(String(bagColor) as typeof MARKETPLACE_BAG_COLORS[number])) {
            return res.status(400).json({ message: "Invalid bagColor" });
          }
        }
        if (bagGsm !== undefined && Array.isArray(bagGsm)) {
          const seen = new Set<number>();
          for (const v of bagGsm as unknown[]) {
            const raw = String(v).trim();
            if (!/^\d+$/.test(raw)) {
              return res.status(400).json({ message: "Invalid bagGsm" });
            }
            const n = parseInt(raw, 10);
            if (Number.isNaN(n) || !MARKETPLACE_BAG_GSM_OPTIONS.includes(n as typeof MARKETPLACE_BAG_GSM_OPTIONS[number])) {
              return res.status(400).json({ message: "Invalid bagGsm" });
            }
            seen.add(n);
          }
          if (seen.size === 0 || seen.size > MARKETPLACE_BAG_GSM_OPTIONS.length) {
            return res.status(400).json({ message: "Invalid bagGsm" });
          }
          parsedBagGsmPatch = Array.from(seen).sort((a, b) => a - b);
        }
        if (bagPricePerBag !== undefined && bagPricePerBag !== null && String(bagPricePerBag).trim() !== "") {
          const raw = String(bagPricePerBag).trim();
          if (!/^\d+$/.test(raw)) {
            return res.status(400).json({ message: "Invalid bagPricePerBag" });
          }
          const n = parseInt(raw, 10);
          if (Number.isNaN(n) || n < 1 || n > 999999) {
            return res.status(400).json({ message: "Invalid bagPricePerBag" });
          }
          parsedBagPricePerBagPatch = n;
        }
        if (bagMinQuantity !== undefined) {
          if (bagMinQuantity === null || String(bagMinQuantity).trim() === "") {
            parsedBagMinQuantityPatch = null;
          } else {
            const raw = String(bagMinQuantity).trim();
            if (!/^\d+$/.test(raw)) {
              return res.status(400).json({ message: "Invalid bagMinQuantity" });
            }
            const n = parseInt(raw, 10);
            if (Number.isNaN(n) || n < 0 || n > 999999) {
              return res.status(400).json({ message: "Invalid bagMinQuantity" });
            }
            parsedBagMinQuantityPatch = n;
          }
        }
      }

      // Exhaust fan parsing/validation for PATCH. All fields use undefined to
      // signal "no change" so partial edits don't wipe other columns.
      let parsedFanBrandPatch: string | null | undefined = undefined;
      let parsedFanBrandOtherPatch: string | null | undefined = undefined;
      let parsedFanColorPatch: string | null | undefined = undefined;
      let parsedFanColorOtherPatch: string | null | undefined = undefined;
      let parsedFanWattagePatch: number | null | undefined = undefined;
      let parsedFanVoltagePatch: number | null | undefined = undefined;
      let parsedFanAirflowCmhPatch: number | null | undefined = undefined;
      let parsedFanBladeLengthMmPatch: number | null | undefined = undefined;
      let parsedFanSpeedRpmPatch: number | null | undefined = undefined;
      let parsedFanBladeMaterialPatch: string | null | undefined = undefined;
      let parsedFanBladeCountPatch: number | null | undefined = undefined;
      let parsedFanCountryOfOriginPatch: string | null | undefined = undefined;
      let parsedFanWarrantyYearsPatch: number | null | undefined = undefined;
      let parsedFanDimensionsPatch: string | null | undefined = undefined;
      let parsedFanPricePerPiecePatch: number | null | undefined = undefined;
      if (category === "exhaust_fan") {
        const intRangeReqPatch = (raw: any, min: number, max: number, label: string): number => {
          if (raw === undefined || raw === null || String(raw).trim() === "") throw new Error(`${label} required`);
          const s = String(raw).trim();
          if (!/^\d+$/.test(s)) throw new Error(`Invalid ${label}`);
          const n = parseInt(s, 10);
          if (Number.isNaN(n) || n < min || n > max) throw new Error(`Invalid ${label}`);
          return n;
        };
        const reqStr = (raw: any, max: number, label: string): string => {
          if (raw === undefined || raw === null || typeof raw !== "string" || !raw.trim()) {
            throw new Error(`${label} required`);
          }
          const s = raw.trim();
          if (s.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
          return s;
        };
        try {
          // Resolve effective values (use existing when not provided in body).
          const brandRaw = fanBrand !== undefined ? fanBrand : existing.fanBrand;
          if (brandRaw === undefined || brandRaw === null || String(brandRaw).trim() === "" || String(brandRaw) === "none") {
            return res.status(400).json({ message: "fanBrand required for exhaust_fan" });
          }
          if (!MARKETPLACE_FAN_BRANDS.includes(String(brandRaw) as typeof MARKETPLACE_FAN_BRANDS[number])) {
            return res.status(400).json({ message: "Invalid fanBrand" });
          }
          parsedFanBrandPatch = String(brandRaw);
          if (parsedFanBrandPatch === "Others") {
            const brandOtherRaw = fanBrandOther !== undefined ? fanBrandOther : existing.fanBrandOther;
            const otherStr = typeof brandOtherRaw === "string" ? brandOtherRaw.trim() : "";
            if (!otherStr) return res.status(400).json({ message: "fanBrandOther required when Others is selected" });
            if (otherStr.length > 40) return res.status(400).json({ message: "fanBrandOther must be 40 characters or fewer" });
            parsedFanBrandOtherPatch = otherStr;
          } else {
            parsedFanBrandOtherPatch = null;
          }

          const colorRaw = fanColor !== undefined ? fanColor : existing.fanColor;
          if (colorRaw === undefined || colorRaw === null || String(colorRaw).trim() === "" || String(colorRaw) === "none") {
            return res.status(400).json({ message: "fanColor required for exhaust_fan" });
          }
          if (!MARKETPLACE_FAN_COLORS.includes(String(colorRaw) as typeof MARKETPLACE_FAN_COLORS[number])) {
            return res.status(400).json({ message: "Invalid fanColor" });
          }
          parsedFanColorPatch = String(colorRaw);
          if (parsedFanColorPatch === "Others") {
            const colorOtherRaw = fanColorOther !== undefined ? fanColorOther : existing.fanColorOther;
            const otherStr = typeof colorOtherRaw === "string" ? colorOtherRaw.trim() : "";
            if (!otherStr) return res.status(400).json({ message: "fanColorOther required when Others is selected" });
            if (otherStr.length > 40) return res.status(400).json({ message: "fanColorOther must be 40 characters or fewer" });
            parsedFanColorOtherPatch = otherStr;
          } else {
            parsedFanColorOtherPatch = null;
          }

          const wattageRaw = fanWattage !== undefined ? fanWattage : existing.fanWattage;
          parsedFanWattagePatch = intRangeReqPatch(wattageRaw, 1, 10000, "fanWattage");
          const voltageRaw = fanVoltage !== undefined ? fanVoltage : existing.fanVoltage;
          parsedFanVoltagePatch = intRangeReqPatch(voltageRaw, 1, 1000, "fanVoltage");
          const airflowRaw = fanAirflowCmh !== undefined ? fanAirflowCmh : existing.fanAirflowCmh;
          parsedFanAirflowCmhPatch = intRangeReqPatch(airflowRaw, 1, 999999, "fanAirflowCmh");
          const bladeLenRaw = fanBladeLengthMm !== undefined ? fanBladeLengthMm : existing.fanBladeLengthMm;
          parsedFanBladeLengthMmPatch = intRangeReqPatch(bladeLenRaw, 1, 10000, "fanBladeLengthMm");
          const speedRaw = fanSpeedRpm !== undefined ? fanSpeedRpm : existing.fanSpeedRpm;
          parsedFanSpeedRpmPatch = intRangeReqPatch(speedRaw, 1, 10000, "fanSpeedRpm");
          const bladeCountRaw = fanBladeCount !== undefined ? fanBladeCount : existing.fanBladeCount;
          parsedFanBladeCountPatch = intRangeReqPatch(bladeCountRaw, 1, 50, "fanBladeCount");
          const warrantyRaw = fanWarrantyYears !== undefined ? fanWarrantyYears : existing.fanWarrantyYears;
          parsedFanWarrantyYearsPatch = intRangeReqPatch(warrantyRaw, 0, 50, "fanWarrantyYears");
          const priceRaw = fanPricePerPiece !== undefined ? fanPricePerPiece : existing.fanPricePerPiece;
          parsedFanPricePerPiecePatch = intRangeReqPatch(priceRaw, 1, 999999, "fanPricePerPiece");

          const bladeMatRaw = fanBladeMaterial !== undefined ? fanBladeMaterial : existing.fanBladeMaterial;
          parsedFanBladeMaterialPatch = reqStr(bladeMatRaw, 40, "fanBladeMaterial");
          const countryRaw = fanCountryOfOrigin !== undefined ? fanCountryOfOrigin : existing.fanCountryOfOrigin;
          parsedFanCountryOfOriginPatch = reqStr(countryRaw, 40, "fanCountryOfOrigin");
          const dimRaw = fanDimensions !== undefined ? fanDimensions : existing.fanDimensions;
          parsedFanDimensionsPatch = reqStr(dimRaw, 80, "fanDimensions");
        } catch (e: any) {
          return res.status(400).json({ message: e?.message || "Invalid exhaust_fan field" });
        }
      }

      let parsedPricePerKg: number | null | undefined = undefined;
      if (category === "onion_seed" && onionSeedPricePerKg !== undefined) {
        if (onionSeedPricePerKg === null || String(onionSeedPricePerKg).trim() === "") {
          parsedPricePerKg = null;
        } else {
          const n = parseInt(String(onionSeedPricePerKg), 10);
          if (Number.isNaN(n) || n < 0 || n > 999999) {
            return res.status(400).json({ message: "Invalid price per kg" });
          }
          parsedPricePerKg = n;
        }
      }

      let parsedPricePerQuintal: number | null | undefined = undefined;
      if (category === "soyabean_seed" && soyabeanSeedPricePerQuintal !== undefined) {
        if (soyabeanSeedPricePerQuintal === null || String(soyabeanSeedPricePerQuintal).trim() === "") {
          parsedPricePerQuintal = null;
        } else {
          const raw = String(soyabeanSeedPricePerQuintal).trim();
          if (!/^\d+$/.test(raw)) {
            return res.status(400).json({ message: "Invalid price per quintal" });
          }
          const n = parseInt(raw, 10);
          if (Number.isNaN(n) || n < 0 || n > 999999) {
            return res.status(400).json({ message: "Invalid price per quintal" });
          }
          parsedPricePerQuintal = n;
        }
      }

      const updates: Partial<typeof existing> = {};
      if (category === "onion_seedling") {
        if (quantityBigha !== undefined) updates.quantityBigha = quantityBigha ? String(quantityBigha).slice(0, 20) : null;
        if (availableAfterDays !== undefined) updates.availableAfterDays = availableAfterDays !== null && availableAfterDays !== "" ? Math.max(0, parseInt(String(availableAfterDays)) || 0) : null;
        if (onionType !== undefined) updates.onionType = onionType ? String(onionType).slice(0, 100) : null;
      } else if (category === "potato_seed") {
        if (quantityBags !== undefined) updates.quantityBags = quantityBags ? String(quantityBags).slice(0, 20) : null;
        if (potatoVariety !== undefined) updates.potatoVariety = potatoVariety ? String(potatoVariety).slice(0, 50) : null;
        if (potatoBrand !== undefined) updates.potatoBrand = potatoBrand ? String(potatoBrand).slice(0, 50) : null;
      } else if (category === "onion_seed") {
        if (onionSeedType !== undefined) updates.onionSeedType = onionSeedType ? String(onionSeedType).slice(0, 100) : null;
        if (onionSeedVariety !== undefined) updates.onionSeedVariety = onionSeedVariety ? String(onionSeedVariety).slice(0, 100) : null;
        if (onionSeedBrand !== undefined) updates.onionSeedBrand = onionSeedBrand ? String(onionSeedBrand).slice(0, 100) : null;
        if (parsedPricePerKg !== undefined) updates.onionSeedPricePerKg = parsedPricePerKg;
      } else if (category === "soyabean_seed") {
        if (soyabeanSeedDuration !== undefined) updates.soyabeanSeedDuration = soyabeanSeedDuration ? String(soyabeanSeedDuration).slice(0, 20) : null;
        if (soyabeanSeedVariety !== undefined && typeof soyabeanSeedVariety === "string" && soyabeanSeedVariety.trim()) {
          updates.soyabeanSeedVariety = soyabeanSeedVariety.trim().slice(0, 100);
        }
        if (parsedPricePerQuintal !== undefined) updates.soyabeanSeedPricePerQuintal = parsedPricePerQuintal;
      } else if (category === "bardan_bag") {
        if (parsedBagCommodityTypesPatch !== undefined) updates.bagCommodityType = parsedBagCommodityTypesPatch;
        if (parsedBagCommodityOtherPatch !== undefined) updates.bagCommodityOther = parsedBagCommodityOtherPatch;
        if (bagMaterialType !== undefined) updates.bagMaterialType = bagMaterialType ? String(bagMaterialType).slice(0, 30) : null;
        if (bagDimension !== undefined) updates.bagDimension = bagDimension ? String(bagDimension).trim().slice(0, 40) : null;
        if (parsedBagGsmPatch !== undefined) updates.bagGsm = parsedBagGsmPatch;
        if (bagColor !== undefined) {
          updates.bagColor = bagColor && String(bagColor) !== "none" && String(bagColor).trim() !== ""
            ? String(bagColor).slice(0, 20)
            : null;
        }
        if (parsedBagMinQuantityPatch !== undefined) updates.bagMinQuantity = parsedBagMinQuantityPatch;
        if (parsedBagPricePerBagPatch !== undefined) updates.bagPricePerBag = parsedBagPricePerBagPatch;
      } else if (category === "exhaust_fan") {
        if (parsedFanBrandPatch !== undefined) updates.fanBrand = parsedFanBrandPatch;
        if (parsedFanBrandOtherPatch !== undefined) updates.fanBrandOther = parsedFanBrandOtherPatch;
        if (parsedFanColorPatch !== undefined) updates.fanColor = parsedFanColorPatch;
        if (parsedFanColorOtherPatch !== undefined) updates.fanColorOther = parsedFanColorOtherPatch;
        if (parsedFanWattagePatch !== undefined) updates.fanWattage = parsedFanWattagePatch;
        if (parsedFanVoltagePatch !== undefined) updates.fanVoltage = parsedFanVoltagePatch;
        if (parsedFanAirflowCmhPatch !== undefined) updates.fanAirflowCmh = parsedFanAirflowCmhPatch;
        if (parsedFanBladeLengthMmPatch !== undefined) updates.fanBladeLengthMm = parsedFanBladeLengthMmPatch;
        if (parsedFanSpeedRpmPatch !== undefined) updates.fanSpeedRpm = parsedFanSpeedRpmPatch;
        if (parsedFanBladeMaterialPatch !== undefined) updates.fanBladeMaterial = parsedFanBladeMaterialPatch;
        if (parsedFanBladeCountPatch !== undefined) updates.fanBladeCount = parsedFanBladeCountPatch;
        if (parsedFanCountryOfOriginPatch !== undefined) updates.fanCountryOfOrigin = parsedFanCountryOfOriginPatch;
        if (parsedFanWarrantyYearsPatch !== undefined) updates.fanWarrantyYears = parsedFanWarrantyYearsPatch;
        if (parsedFanDimensionsPatch !== undefined) updates.fanDimensions = parsedFanDimensionsPatch;
        if (parsedFanPricePerPiecePatch !== undefined) updates.fanPricePerPiece = parsedFanPricePerPiecePatch;
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateMarketplaceListing(existing.id, updates);
      }

      if (Array.isArray(photos)) {
        const photoArr = photos.slice(0, 3);
        await storage.replaceListingPhotos(existing.id, photoArr.map((p: any, i: number) => ({
          photoData: String(p.base64),
          photoMime: String(p.mime).slice(0, 50),
          sortOrder: i,
        })));
        if (photoArr.length > 0 || existing.photoData) {
          await storage.updateMarketplaceListing(existing.id, { photoData: null, photoMime: null });
        }
      } else if (photoData) {
        await storage.replaceListingPhotos(existing.id, [{
          photoData: String(photoData),
          photoMime: String(photoMime || "image/jpeg").slice(0, 50),
          sortOrder: 0,
        }]);
      }

      const refreshed = await storage.getMarketplaceListing(existing.id);
      const photoCount = await storage.getListingPhotoCount(existing.id);
      const { photoData: _, ...listingWithoutPhoto } = refreshed!;
      res.json({ ...listingWithoutPhoto, photoCount });
    } catch (error) {
      console.error("Error updating listing:", error);
      res.status(500).json({ message: "Failed to update listing" });
    }
  });

  app.delete("/api/marketplace/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const listing = await storage.getMarketplaceListing(parseInt(req.params.id));
      if (!listing) return res.status(404).json({ message: "Not found" });
      const requester = await storage.getUserById(userId);
      if (listing.sellerId !== userId && !requester?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteMarketplaceListing(listing.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete listing" });
    }
  });

  app.post("/api/marketplace/:id/rate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const listingId = parseInt(req.params.id);
      const { stars } = req.body || {};
      if (!stars || stars < 1 || stars > 5 || !Number.isInteger(stars)) {
        return res.status(400).json({ message: "Stars must be an integer between 1 and 5" });
      }
      const listing = await storage.getMarketplaceListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.sellerId === userId) {
        return res.status(403).json({ message: "Cannot rate your own listing" });
      }
      const rating = await storage.upsertListingRating(listingId, userId, stars);
      const avgInfo = await storage.getListingAvgRating(listingId);
      res.json({ rating, avg: avgInfo.avg, count: avgInfo.count });
    } catch (error) {
      console.error("Error rating listing:", error);
      res.status(500).json({ message: "Failed to rate listing" });
    }
  });

  app.get("/api/marketplace/:id/rating", async (req: any, res) => {
    try {
      const listingId = parseInt(req.params.id);
      const avgInfo = await storage.getListingAvgRating(listingId);
      const result: any = { avg: avgInfo.avg, count: avgInfo.count };
      if (req.session?.userId) {
        const myRating = await storage.getListingRating(listingId, req.session.userId);
        result.myRating = myRating?.stars || null;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rating" });
    }
  });

  app.get("/api/suggestions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const suggestions = await storage.getSuggestions(userId);
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  app.post("/api/chat-images", isAuthenticated, async (req: any, res) => {
    try {
      const { imageData, mimeType } = req.body;
      if (!imageData || !mimeType) {
        return res.status(400).json({ message: "imageData and mimeType required" });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(mimeType)) {
        return res.status(400).json({ message: "Invalid image type" });
      }
      const base64Only = imageData.replace(/^data:[^;]+;base64,/, "");
      const actualBytes = Buffer.byteLength(base64Only, "base64");
      if (actualBytes > 5 * 1024 * 1024) {
        return res.status(413).json({ message: "Image too large. Max 5MB." });
      }
      const image = await storage.saveChatImage(req.session.userId, imageData, mimeType);
      res.json({ id: image.id, url: `/api/chat-images/${image.id}` });
    } catch (error) {
      res.status(500).json({ message: "Failed to save image" });
    }
  });

  app.get("/api/chat-images/:id", isAuthenticated, async (req: any, res) => {
    try {
      const image = await storage.getChatImage(parseInt(req.params.id));
      if (!image) return res.status(404).json({ message: "Image not found" });
      if (image.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const base64Data = image.imageData.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      res.setHeader("Content-Type", image.mimeType);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch image" });
    }
  });

  app.post("/api/krashuved/chat", isAuthenticated, async (req: any, res) => {
    try {
      const { message, language, history, imageId } = req.body;
      const userId = req.session.userId;

      const today = new Date().toISOString().split("T")[0];

      const farmerCode = await storage.ensureFarmerCode(userId);
      const user = await storage.getUserById(userId);
      const cardsWithEvents = await storage.getCropCardsWithEvents(userId);
      const khataRegisters = await storage.getKhataRegisters(userId, { showArchived: false });
      const serviceRequests = await storage.getServiceRequestsByUser(userId);
      const farmerListings = await storage.getMarketplaceListings();
      const myListings = farmerListings.filter(l => l.sellerId === userId && l.isActive);
      const priceCrops = await storage.getAllPriceCrops();
      const activePriceCrops = priceCrops.filter(c => c.isActive);
      let priceTrendsContext = "";
      for (const crop of activePriceCrops) {
        const entries = await storage.getPriceEntries(crop.id, 20);
        if (entries.length > 0) {
          const recentDates = [...new Set(entries.map(e => e.date))].sort((a, b) => b.localeCompare(a)).slice(0, 3);
          const recentEntries = entries.filter(e => recentDates.includes(e.date));
          const districtPrices = recentEntries.map(e => `${e.district || e.market}:₹${e.modalPrice}(${e.date})`).join(", ");
          priceTrendsContext += `\n• ${crop.nameHi}/${crop.nameEn}: ${districtPrices}`;
          if (crop.recommendation) priceTrendsContext += ` [सुझाव/Advice: ${crop.recommendation}]`;
        }
      }

      let farmerContext = "";
      if (language === "hi") {
        farmerContext = `\n\n--- किसान की जानकारी ---\nकिसान ID: ${farmerCode}\nनाम: ${user?.firstName || ""} ${user?.lastName || ""}\n`;
        if (cardsWithEvents.length > 0) {
          farmerContext += `\nकिसान के मौजूदा फसल कार्ड (${cardsWithEvents.length}):\n`;
          for (const card of cardsWithEvents) {
            farmerContext += `\n• कार्ड #${card.id}: ${card.cropName}`;
            if (card.farmName) farmerContext += ` | खेत: ${card.farmName}`;
            if (card.variety) farmerContext += ` | किस्म: ${card.variety}`;
            farmerContext += ` | शुरू: ${card.startDate} | स्थिति: ${card.status === "active" ? "सक्रिय" : "पूर्ण"}`;
            if (card.events.length > 0) {
              farmerContext += `\n  गतिविधियाँ (${card.events.length}):`;
              for (const e of card.events) {
                farmerContext += `\n    - [ID:${e.id}] ${e.eventDate} ${e.eventType}: ${e.description || ""} ${e.isCompleted ? "(✓ पूर्ण)" : "(बाकी)"}`;
              }
            }
          }
        } else {
          farmerContext += "\nकिसान ने अभी तक कोई फसल कार्ड नहीं बनाया है।";
        }
        if (serviceRequests.length > 0) {
          const recentReqs = serviceRequests.slice(0, 10);
          const typeLabelsHi: Record<string, string> = { soil_test: "मिट्टी जाँच", potato_perishability_test: "आलू फसल नश्वरता परीक्षण", crop_doctor: "फसल डॉक्टर" };
          farmerContext += `\n\nकिसान की डिजिटल क्लिनिक रिक्वेस्ट (${serviceRequests.length}):\n`;
          for (const sr of recentReqs) {
            farmerContext += `\n• ${typeLabelsHi[sr.serviceType] || sr.serviceType} | स्थिति: ${sr.status === "open" ? "खुला" : "बंद"} | तारीख: ${sr.createdAt ? new Date(sr.createdAt).toISOString().split("T")[0] : ""}`;
          }
        }

        if (khataRegisters.length > 0) {
          farmerContext += `\n\nकिसान के मौजूदा खाता रजिस्टर (${khataRegisters.length}):\n`;
          for (const reg of khataRegisters) {
            const typeLabels: Record<string, string> = { crop_card: "फसल कार्ड खाता", batai: "बटाई खाता", panat: "पानत खाता", miscellaneous: "विविध खाता", rental: "किराया खाता", machinery_expense: "मशीनरी खर्चा", lending_ledger: "लेन देन खाता" };
            farmerContext += `\n• खाता #${reg.id}: ${typeLabels[reg.khataType] || reg.khataType} | शीर्षक: ${reg.title}`;
            if (reg.khataType === "rental") farmerContext += ` | किसान: ${reg.rentalFarmerName || ""} | गाँव: ${reg.rentalVillage || ""}`;
            if (reg.khataType === "batai") farmerContext += ` | बटाईदार: ${reg.bataidarName || ""} | बटाई: ${reg.bataiType || ""}`;
            if (reg.khataType === "panat") farmerContext += ` | व्यक्ति: ${reg.panatPersonName || ""}`;
            if (reg.khataType === "machinery_expense") farmerContext += ` | मशीन: ${reg.machineryCategory || ""} ${reg.machineryName || ""}`;
            if (reg.khataType === "lending_ledger") farmerContext += ` | व्यक्ति: ${reg.lendenPersonName || ""} | प्रकार: ${reg.lendenType === "credit" ? "उधार दिया" : "उधार लिया"}`;
            farmerContext += ` | बकाया: ₹${reg.totalDue || "0"} | भुगतान: ₹${reg.totalPaid || "0"}`;
          }
        } else {
          farmerContext += "\n\nकिसान ने अभी तक कोई खाता नहीं बनाया है।";
        }

        if (myListings.length > 0) {
          const catLabels: Record<string, string> = { onion_seedling: "प्याज पौध", potato_seed: "आलू बीज" };
          farmerContext += `\n\nकिसान की बाज़ार लिस्टिंग (${myListings.length}):\n`;
          for (const l of myListings) {
            farmerContext += `\n• ${catLabels[l.category] || l.category}`;
            if (l.quantityBigha) farmerContext += ` | ${l.quantityBigha} बीघा`;
            if (l.quantityBags) farmerContext += ` | ${l.quantityBags} बैग`;
            if (l.sellerVillage) farmerContext += ` | गाँव: ${l.sellerVillage}`;
            if (l.sellerDistrict) farmerContext += ` | जिला: ${l.sellerDistrict}`;
          }
        }

        if (priceTrendsContext) {
          farmerContext += `\n\n--- मूल्य रुझान (हाल के भाव) ---${priceTrendsContext}`;
        }
      } else {
        farmerContext = `\n\n--- Farmer Profile ---\nFarmer ID: ${farmerCode}\nName: ${user?.firstName || ""} ${user?.lastName || ""}\n`;
        if (cardsWithEvents.length > 0) {
          farmerContext += `\nFarmer's existing crop cards (${cardsWithEvents.length}):\n`;
          for (const card of cardsWithEvents) {
            farmerContext += `\n• Card #${card.id}: ${card.cropName}`;
            if (card.farmName) farmerContext += ` | Farm: ${card.farmName}`;
            if (card.variety) farmerContext += ` | Variety: ${card.variety}`;
            farmerContext += ` | Start: ${card.startDate} | Status: ${card.status}`;
            if (card.events.length > 0) {
              farmerContext += `\n  Events (${card.events.length}):`;
              for (const e of card.events) {
                farmerContext += `\n    - [ID:${e.id}] ${e.eventDate} ${e.eventType}: ${e.description || ""} ${e.isCompleted ? "(✓ done)" : "(pending)"}`;
              }
            }
          }
        } else {
          farmerContext += "\nFarmer has no crop cards yet.";
        }
        if (serviceRequests.length > 0) {
          const recentReqs = serviceRequests.slice(0, 10);
          const typeLabelsEn: Record<string, string> = { soil_test: "Soil Test", potato_perishability_test: "Potato Harvest Perishability Test", crop_doctor: "Crop Doctor" };
          farmerContext += `\n\nFarmer's Digital Clinic requests (${serviceRequests.length}):\n`;
          for (const sr of recentReqs) {
            farmerContext += `\n• ${typeLabelsEn[sr.serviceType] || sr.serviceType} | Status: ${sr.status} | Date: ${sr.createdAt ? new Date(sr.createdAt).toISOString().split("T")[0] : ""}`;
          }
        }

        if (khataRegisters.length > 0) {
          farmerContext += `\n\nFarmer's existing khata registers (${khataRegisters.length}):\n`;
          for (const reg of khataRegisters) {
            const typeLabels: Record<string, string> = { crop_card: "Crop Card Khata", batai: "Batai Khata", panat: "Panat Khata", miscellaneous: "Miscellaneous Khata", rental: "Rental Khata", machinery: "Machinery Expense", lending_ledger: "Lending Ledger" };
            farmerContext += `\n• Khata #${reg.id}: ${typeLabels[reg.khataType] || reg.khataType} | Title: ${reg.title}`;
            if (reg.khataType === "rental") farmerContext += ` | Farmer: ${reg.rentalFarmerName || ""} | Village: ${reg.rentalVillage || ""}`;
            if (reg.khataType === "batai") farmerContext += ` | Bataidar: ${reg.bataidarName || ""} | Type: ${reg.bataiType || ""}`;
            if (reg.khataType === "panat") farmerContext += ` | Person: ${reg.panatPersonName || ""}`;
            if (reg.khataType === "machinery_expense") farmerContext += ` | Machine: ${reg.machineryCategory || ""} ${reg.machineryName || ""}`;
            if (reg.khataType === "lending_ledger") farmerContext += ` | Person: ${reg.lendenPersonName || ""} | Type: ${reg.lendenType === "credit" ? "Lent" : "Borrowed"}`;
            farmerContext += ` | Due: ₹${reg.totalDue || "0"} | Paid: ₹${reg.totalPaid || "0"}`;
          }
        } else {
          farmerContext += "\n\nFarmer has no khata registers yet.";
        }

        if (myListings.length > 0) {
          const catLabels: Record<string, string> = { onion_seedling: "Onion Seedling", potato_seed: "Potato Seeds" };
          farmerContext += `\n\nFarmer's marketplace listings (${myListings.length}):\n`;
          for (const l of myListings) {
            farmerContext += `\n• ${catLabels[l.category] || l.category}`;
            if (l.quantityBigha) farmerContext += ` | ${l.quantityBigha} Bigha`;
            if (l.quantityBags) farmerContext += ` | ${l.quantityBags} Bags`;
            if (l.sellerVillage) farmerContext += ` | Village: ${l.sellerVillage}`;
            if (l.sellerDistrict) farmerContext += ` | District: ${l.sellerDistrict}`;
          }
        }

        if (priceTrendsContext) {
          farmerContext += `\n\n--- Price Trends (Recent Prices) ---${priceTrendsContext}`;
        }
      }

      const systemPrompt = language === "hi"
        ? `तुम कृषु मित्र (Krashu Mitra) हो, एक कृषि विशेषज्ञ AI सहायिका। तुम किसानों की मदद करती हो फसल प्रबंधन में।
तुम एक महिला सहायिका हो, इसलिए हमेशा स्त्रीलिंग क्रियाओं का उपयोग करो (जैसे: करती हूँ, बताती हूँ, देती हूँ, लिखती हूँ, सुझाव देती हूँ)।

आज की तारीख: ${today}
${farmerContext}

जब किसान नया फसल कार्ड बनाने को कहे, तो:
1. पहले एक छोटा सा सारांश लिखो जो किसान को समझ आए
2. फिर नई लाइन पर JSON ब्लॉक दो इस format में:
\`\`\`json
{"type":"crop_card_draft","cropName":"फसल का नाम","farmName":"खेत का नाम (वैकल्पिक)","variety":"किस्म (वैकल्पिक)","startDate":"YYYY-MM-DD","events":[{"eventType":"plantation|fertiliser|pesticide|watering|harvesting","description":"विवरण","eventDate":"YYYY-MM-DD"}]}
\`\`\`

जब किसान किसी मौजूदा फसल कार्ड में बदलाव करना चाहे (जैसे "मेरे गेहूँ कार्ड में खाद जोड़ दो", "आलू का कार्ड अपडेट करो"), तो:
1. ऊपर दी गई किसान की जानकारी से सही कार्ड ढूंढो (cardId से)
2. एक छोटा सारांश लिखो
3. फिर JSON ब्लॉक दो:
\`\`\`json
{"type":"crop_card_edit_draft","cardId":123,"updates":{"cropName":"नया नाम (वैकल्पिक)","farmName":"नया खेत (वैकल्पिक)","variety":"नई किस्म (वैकल्पिक)"},"addEvents":[{"eventType":"plantation|fertiliser|pesticide|watering|harvesting","description":"विवरण","eventDate":"YYYY-MM-DD"}],"removeEventIds":[]}
\`\`\`
- updates में केवल वो fields डालो जो बदलने हैं
- addEvents में नई गतिविधियाँ जो जोड़नी हैं
- removeEventIds में उन events की IDs जो हटानी हैं

महत्वपूर्ण नियम:
- farmName और variety वैकल्पिक हैं। अगर किसान ने बताया हो तो शामिल करो, नहीं तो छोड़ दो।
- अगर किसान कोई तारीख नहीं बताए तो startDate आज (${today}) रखो।
- अगर किसान "2 महीने पहले" या "3 हफ्ते पहले" बोले तो आज की तारीख से गणना करो।
- अगर कोई recurring/बार-बार होने वाली गतिविधि हो (जैसे "हर 15 दिन में सिंचाई"), तो हर बार के लिए अलग-अलग entry बनाओ। कम से कम 3-4 महीने की अवधि के लिए entries बनाओ।
- eventType केवल ये हो सकते हैं: plantation, fertiliser, pesticide, watering, harvesting
- जब किसान अपनी फसलों के बारे में पूछे, तो ऊपर दी गई जानकारी का उपयोग करो।

--- फार्म खाता (Farm Khata) ---

तुम किसानों की खाता-बही (फार्म खाता) बनाने और उसमें एंट्री जोड़ने में भी मदद करती हो। 7 प्रकार के खाते हैं:

1. **किराया खाता (rental)**: एक किसान के लिए एक कार्ड। मशीनरी किराये का हिसाब।
2. **बटाई खाता (batai)**: साझेदारी खेती का हिसाब।
3. **पानत खाता (panat)**: जमीन लीज़/पट्टे का हिसाब।
4. **फसल कार्ड खाता (crop_card)**: किसी फसल कार्ड से जुड़ा खर्चा।
5. **विविध खाता (miscellaneous)**: अन्य खर्चों का हिसाब।
6. **मशीनरी खर्चा (machinery_expense)**: एक मशीन के रखरखाव/ईंधन का खर्चा।
7. **लेन देन खाता (lending_ledger)**: उधार/कर्ज़ का हिसाब।

जब किसान कोई नया खाता बनाना चाहे, तो:
- पहले ज़रूरी जानकारी पूछो जो किसान ने नहीं बताई
- फिर ऊपर दी गई खाता सूची में देखो कि क्या उस व्यक्ति/मशीन का खाता पहले से है
- अगर खाता पहले से है तो उसमें नई एंट्री जोड़ो (khata_add_item_draft)
- अगर नया खाता बनाना हो तो (khata_create_draft) का उपयोग करो

**नया खाता बनाने के लिए** — सारांश लिखो फिर JSON दो:
\`\`\`json
{"type":"khata_create_draft","khataType":"rental|batai|panat|crop_card|miscellaneous|machinery_expense|lending_ledger","title":"खाता का शीर्षक","fields":{...type-specific fields...},"items":[...optional initial items...]}
\`\`\`

**मौजूदा खाते में एंट्री जोड़ने के लिए** — सारांश लिखो फिर JSON दो:
\`\`\`json
{"type":"khata_add_item_draft","khataId":123,"khataType":"rental|batai|panat|crop_card|miscellaneous|machinery_expense|lending_ledger","khataTitle":"खाता शीर्षक","items":[...items to add...]}
\`\`\`

हर खाता प्रकार की fields और items:

**किराया खाता (rental)**:
- fields: {"rentalFarmerName":"नाम","rentalContact":"फोन (वैकल्पिक)","rentalVillage":"गाँव (वैकल्पिक)","rentalOpeningBalance":"0"}
- title: "किसान_नाम, गाँव" (जैसे "रमेश, मोतीपुर")
- items: [{"rentalMachinery":"harvester|pesticide_spray|plantar|rotavator|seed_drill|thresher|tractor|tractor_trolley|others","rentalFarmWork":"काम का नाम","rentalChargesPerBigha":"दर (या null)","rentalChargesPerHour":"दर (या null)","rentalBigha":"बीघा (या null)","rentalHours":"घंटे (या null)","rentalTotalCharges":"कुल राशि","rentalIsPaid":false,"rentalRemarks":"टिप्पणी (वैकल्पिक)","date":"YYYY-MM-DD"}]
- rentalTotalCharges = (rentalChargesPerBigha × rentalBigha) या (rentalChargesPerHour × rentalHours)

**बटाई खाता (batai)**:
- fields: {"bataidarName":"नाम","bataidarContact":"फोन (वैकल्पिक)","bataiType":"half|one_third","bighaCount":"बीघा","plantationDate":"YYYY-MM-DD (वैकल्पिक)","harvestDate":"YYYY-MM-DD (वैकल्पिक)"}
- title: "फसल_नाम - बटाईदार_नाम" (जैसे "गेहूँ - सुरेश")
- items: [{"date":"YYYY-MM-DD","expenseCategory":"farm_preparation|seed_cost|plantation|fertiliser|pesticide|manual_weed|watering_labour|harvest","subType":"sub type (वैकल्पिक)","totalCost":"राशि","isPaid":false,"expenseBornBy":"owner|bataidar|batai_ratio","remarks":"टिप्पणी (वैकल्पिक)"}]

**पानत खाता (panat)**:
- fields: {"panatPersonName":"नाम","panatContact":"फोन (वैकल्पिक)","panatRatePerBigha":"दर प्रति बीघा","panatTotalBigha":"कुल बीघा","panatTotalAmount":"कुल राशि (दर × बीघा)","panatRemarks":"टिप्पणी (वैकल्पिक)"}
- title: "व्यक्ति_नाम - बीघा" (जैसे "रामू - 5 बीघा")
- items (panat_payments): [{"date":"YYYY-MM-DD","amount":"भुगतान राशि","remarks":"टिप्पणी (वैकल्पिक)"}]

**फसल कार्ड खाता (crop_card)**:
- fields: {"cropCardId":123,"plantationDate":"YYYY-MM-DD (वैकल्पिक)","harvestDate":"YYYY-MM-DD (वैकल्पिक)","production":"उत्पादन (वैकल्पिक)","productionUnit":"quintal|bag (वैकल्पिक)"}
- title: "फसल_नाम - खेत_नाम" (जैसे "गेहूँ - बड़ा खेत")
- items: same as batai items but expenseBornBy is always "owner"

**विविध खाता (miscellaneous)**:
- fields: {} (no special fields)
- title: जो किसान बताए
- items: same as crop_card items (expenseBornBy always "owner")

**मशीनरी खर्चा (machinery_expense)**:
- fields: {"machineryCategory":"tractor|harvester|thresher","machineryName":"नाम (वैकल्पिक)","machineryHp":"HP (वैकल्पिक)","machineryPurchaseYear":"खरीद वर्ष (वैकल्पिक)"}
- title: "श्रेणी" या "श्रेणी - नाम" (जैसे "ट्रैक्टर - महिंद्रा 575")
- items: [{"date":"YYYY-MM-DD","expenseCategory":"fuel|maintenance|others","totalCost":"राशि","isPaid":false,"remarks":"टिप्पणी (वैकल्पिक)"}]

**लेन देन खाता (lending_ledger)**:
- fields: {"lendenPersonName":"नाम","lendenContact":"फोन (वैकल्पिक)","lendenVillage":"गाँव (वैकल्पिक)","lendenType":"credit|debit"}
- credit = किसान ने उधार दिया, debit = किसान ने उधार लिया
- title: "व्यक्ति_नाम, गाँव"
- items (lenden_transactions): [{"transactionType":"borrowing|payment","date":"YYYY-MM-DD","principalAmount":"राशि (borrowing के लिए)","interestRateMonthly":"मासिक ब्याज दर % (borrowing के लिए)","paymentAmount":"राशि (payment के लिए)","remarks":"टिप्पणी (वैकल्पिक)"}]

खाता बनाने के महत्वपूर्ण नियम:
- किसान से बातचीत में सारी ज़रूरी जानकारी पूछो, एक साथ सब मत पूछो — प्राकृतिक बातचीत करो
- अगर किसान बोले "रमेश का किराया खाता बनाओ" तो पहले पूछो: "रमेश जी का गाँव कौन सा है?" और "कौन सी मशीन का काम किया?"
- title अपने आप बनाओ उचित format में (ऊपर दिए गए उदाहरण देखो)
- अगर किसान कहे "plowing" या "जुताई" तो rentalMachinery = "tractor" और rentalFarmWork = "जुताई/plowing" समझो
- दर और मात्रा से कुल राशि गणना करो
- अगर तारीख नहीं बताई तो आज (${today}) रखो

--- बाज़ार (Marketplace) ---

तुम किसानों को बाज़ार में अपनी फसल/बीज बेचने की लिस्टिंग बनाने में भी मदद करती हो। 2 श्रेणियाँ हैं:

1. **प्याज पौध (onion_seedling)**: प्याज की पौध बेचने के लिए। ज़रूरी जानकारी: कितने बीघा (quantityBigha), कितने दिन बाद उपलब्ध (availableAfterDays), प्याज का प्रकार (onionType - जैसे "Red/लाल", "White/सफेद"), गाँव (sellerVillage), जिला (sellerDistrict)।
2. **आलू बीज (potato_seed)**: आलू के बीज बेचने के लिए। ज़रूरी जानकारी: कितने बैग (quantityBags), किस्म (potatoVariety - जैसे "Pukhraj/पुखराज", "Chipsona"), ब्रांड (potatoBrand - वैकल्पिक), गाँव (sellerVillage), जिला (sellerDistrict)।

जब किसान बाज़ार में कुछ बेचना चाहे:
- पहले पूछो कि प्याज पौध बेचनी है या आलू बीज
- फिर ज़रूरी जानकारी प्राकृतिक बातचीत में पूछो
- जानकारी मिलने पर JSON ब्लॉक दो:
\`\`\`json
{"type":"marketplace_listing_draft","category":"onion_seedling|potato_seed","quantityBigha":"3 (प्याज के लिए)","availableAfterDays":10,"onionType":"Red (प्याज के लिए)","quantityBags":"100 (आलू के लिए)","potatoVariety":"Pukhraj (आलू के लिए)","potatoBrand":"ब्रांड (वैकल्पिक, आलू के लिए)","sellerVillage":"गाँव","sellerDistrict":"जिला"}
\`\`\`
- श्रेणी के अनुसार केवल relevant fields भरो (प्याज के लिए quantityBigha/availableAfterDays/onionType, आलू के लिए quantityBags/potatoVariety/potatoBrand)

--- मूल्य रुझान (Price Trends) ---

तुम्हारे पास फसलों के हाल के मंडी भावों की जानकारी है (ऊपर किसान डेटा में "मूल्य रुझान" सेक्शन देखो)। जब किसान किसी फसल का भाव या ट्रेंड पूछे:
- आज की तारीख ${today} है — इसे "आज" मानो। डेटा में जो तारीख है वो डेटा की तारीख है, आज की नहीं।
- मंडी भाव हमेशा अंकों में बताओ (जैसे: ₹1200, ₹735, ₹900)। शब्दों में मत लिखो (जैसे: "बारह सौ" गलत है)।
- हाल के भाव बताओ (जिला और तारीख के साथ)
- भाव बढ़ रहे हैं या घट रहे हैं, यह बताओ
- अगर सुझाव उपलब्ध है (hold/sale) तो सीधे बोलो "अभी रोककर रखें" या "अभी बेच दें"। "कुछ दिन और" जैसी समय सीमा मत बताओ क्योंकि यह बदल सकती है।

--- डिजिटल क्लिनिक (Digital Clinic) ---

तुम किसानों को 3 क्लिनिक सेवाएँ बुक करने में भी मदद करती हो:

1. **मिट्टी जाँच (soil_test)**: मिट्टी की गुणवत्ता, pH, पोषक तत्वों की जाँच। हमारी टीम नमूना लेकर जाँच करती है।
2. **आलू फसल नश्वरता परीक्षण (potato_perishability_test)**: अपने आलू लॉट की भंडारण और शेल्फ लाइफ जानने के लिए। आलू कितने दिन तक सुरक्षित रहेगा।
3. **फसल डॉक्टर AI (crop_doctor)**: फसल/पौधे की फोटो से AI रोग पहचान और उपचार सुझाव।

जब किसान इनमें से कोई सेवा बुक करना चाहे:
- पहले सेवा के बारे में संक्षेप में बताओ
- किसान की पुष्टि माँगो
- फिर JSON ब्लॉक दो:
\`\`\`json
{"type":"service_request_draft","serviceType":"soil_test|potato_perishability_test|crop_doctor"}
\`\`\`

**फसल डॉक्टर के लिए विशेष नियम:**
- अगर किसान फसल रोग/समस्या पूछे और साथ में फोटो लगाई हो → फसल डॉक्टर सेवा सुझाओ और पुष्टि के बाद service_request_draft दो (serviceType: "crop_doctor")
- अगर किसान बिना फोटो के रोग पूछे → पहले फोटो लगाने को कहो ("कृपया फसल की फोटो भी भेजें ताकि AI बेहतर जाँच कर सके"), फिर जब फोटो आए तब draft दो
- फसल डॉक्टर में किसान की लगाई फोटो को AI जाँच के लिए भेजा जाएगा — तुम्हें सिर्फ draft देना है

**मिट्टी जाँच / बीज जाँच के लिए:**
- किसान की पुष्टि मिलने पर draft दो।
- सेवा बुक होने पर किसान को सिर्फ इतना बोलो: "हमारी टीम जल्द ही आपसे संपर्क करेगी।" कभी भी किसान ID, नाम, फोन नंबर, एडमिन की जानकारी, या कोई भी आंतरिक विवरण किसान को मत बताओ।

जवाब का तरीका:
- जवाब हमेशा छोटा और सटीक रखो (अधिकतम 3-5 बुलेट पॉइंट)।
- मुख्य जानकारी के लिए बुलेट पॉइंट (•) का उपयोग करो। कभी भी asterisk (*) या hash (#) से बुलेट या heading मत बनाओ — सिर्फ • (बुलेट डॉट) का उपयोग करो।
- heading बनाने के लिए markdown (## या ###) का उपयोग मत करो — सीधे बोल्ड (**शीर्षक**) का उपयोग करो।
- हमेशा स्त्रीलिंग में बोलो (मैं बताती हूँ, मैं सुझाव देती हूँ, मैंने देखा, etc.)।
- किसान को संबोधित करते समय हमेशा पुल्लिंग/तटस्थ क्रियाओं का उपयोग करो (जैसे: "क्या आप चाहते हैं", "आप बता सकते हैं", "आपने किया")। कभी भी किसान के लिए स्त्रीलिंग क्रियाएँ मत उपयोग करो (जैसे: "चाहती हैं", "बता सकती हैं", "आपने की")।
- मंडी भाव और कीमतें हमेशा अंकों में लिखो (जैसे: ₹1200, ₹735, ₹900 प्रति क्विंटल)। बड़ी राशियाँ (लोन, खर्च आदि) भारतीय प्रणाली में शब्दों में बोलो (जैसे: ₹120000 = "एक लाख बीस हज़ार रुपये")। कभी भी अंकों को एक-एक करके मत पढ़ो।

भाषा संबंधी सख्त नियम:
- कभी भी कोई तकनीकी/कंप्यूटर शब्द मत बोलो। ये शब्द पूरी तरह वर्जित हैं: JSON, event type, system, format, data, update, draft, string, database, server, API, code, type, ID, error, input, output, request, response।
- किसान को कभी अपनी आंतरिक व्यवस्था (कार्ड सिस्टम, इवेंट टाइप, JSON ड्राफ्ट आदि) के बारे में मत बताओ।
- तकनीकी शब्दों की जगह सरल हिंदी शब्द बोलो: "जानकारी" (data), "गतिविधि" (event), "सूची" (list), "बदलाव" (update), "तैयार" (draft)।
- हमेशा ऐसे बोलो जैसे एक गाँव की अनुभवी किसान महिला बोल रही हो।

चित्र सहायता (Image Support):
- जब किसान कोई ऐसा विषय पूछे जिसमें चित्र से समझ बढ़े (जैसे फसल रोग, कीट पहचान, विकास चरण, खेती की तकनीक), तो अपने जवाब में [IMG: English search keywords] मार्कर शामिल करो।
- IMG मार्कर का text हमेशा अंग्रेज़ी में छोटे सर्च कीवर्ड हों (जैसे: [IMG: wheat leaf rust disease], [IMG: potato early blight], [IMG: rice stem borer pest])
- IMG मार्कर हमेशा अपनी अलग लाइन पर रखो — कभी भी बुलेट पॉइंट (•, *, -) के अंदर IMG मार्कर मत रखो।
- एक जवाब में अधिकतम 2 IMG मार्कर रखो।
- IMG मार्कर केवल तब दो जब चित्र वाकई उपयोगी हो — साधारण सवालों में IMG मत दो।

अगर किसान सामान्य कृषि सवाल पूछे तो सादा हिंदी में जवाब दो।`
        : `You are Krashu Mitra, an agricultural expert AI assistant. You help farmers with crop management.

Today's date: ${today}
${farmerContext}

When a farmer asks to create a NEW crop card:
1. First write a brief friendly summary in plain language
2. Then on a new line, output the JSON block:
\`\`\`json
{"type":"crop_card_draft","cropName":"crop name","farmName":"farm/plot name (optional)","variety":"variety (optional)","startDate":"YYYY-MM-DD","events":[{"eventType":"plantation|fertiliser|pesticide|watering|harvesting","description":"details","eventDate":"YYYY-MM-DD"}]}
\`\`\`

When a farmer asks to EDIT an existing crop card (e.g., "add fertilizer to my wheat card", "update my potato card"), then:
1. Find the correct card from the farmer's data above (use cardId)
2. Write a brief summary of changes
3. Output JSON block:
\`\`\`json
{"type":"crop_card_edit_draft","cardId":123,"updates":{"cropName":"new name (optional)","farmName":"new farm (optional)","variety":"new variety (optional)"},"addEvents":[{"eventType":"plantation|fertiliser|pesticide|watering|harvesting","description":"details","eventDate":"YYYY-MM-DD"}],"removeEventIds":[]}
\`\`\`
- In updates, only include fields that are changing
- In addEvents, include new events to add
- In removeEventIds, include IDs of events to remove

Important rules:
- farmName and variety are optional. Include only if the farmer mentions them.
- If no date is specified, use today (${today}) as the startDate.
- If the farmer says "2 months ago" or "3 weeks back", calculate from today's date.
- For recurring activities (e.g., "watering every 15 days"), create individual entries for EACH occurrence. Generate entries for at least 3-4 months.
- eventType must be one of: plantation, fertiliser, pesticide, watering, harvesting
- When the farmer asks about their crops, use the farmer data provided above to answer.

--- Farm Khata ---

You also help farmers create and manage their farm ledgers (Farm Khata). There are 7 khata types:

1. **Rental Khata (rental)**: One card per farmer. Tracks machinery rental charges.
2. **Batai Khata (batai)**: Sharecropping partnership expenses.
3. **Panat Khata (panat)**: Land lease/irrigation tracking.
4. **Crop Card Khata (crop_card)**: Expenses linked to a crop card.
5. **Miscellaneous Khata (miscellaneous)**: General expenses.
6. **Machinery Expense (machinery_expense)**: One card per machine, tracks fuel/maintenance.
7. **Lending Ledger (lending_ledger)**: Loan/credit tracking.

When a farmer wants to create or add to a khata:
- Ask for any missing required information conversationally
- Check the farmer's existing khata list above to see if a card already exists for that person/machine
- If it exists, add items to it (khata_add_item_draft)
- If not, create a new card (khata_create_draft)

**To create a new khata** — write summary then JSON:
\`\`\`json
{"type":"khata_create_draft","khataType":"rental|batai|panat|crop_card|miscellaneous|machinery_expense|lending_ledger","title":"khata title","fields":{...type-specific fields...},"items":[...optional initial items...]}
\`\`\`

**To add items to existing khata** — write summary then JSON:
\`\`\`json
{"type":"khata_add_item_draft","khataId":123,"khataType":"rental|batai|panat|crop_card|miscellaneous|machinery_expense|lending_ledger","khataTitle":"khata title","items":[...items to add...]}
\`\`\`

Type-specific fields and items:

**Rental (rental)**:
- fields: {"rentalFarmerName":"name","rentalContact":"phone (optional)","rentalVillage":"village (optional)","rentalOpeningBalance":"0"}
- title: "FarmerName, Village" (e.g. "Ramesh, Motipur")
- items: [{"rentalMachinery":"harvester|pesticide_spray|plantar|rotavator|seed_drill|thresher|tractor|tractor_trolley|others","rentalFarmWork":"work description","rentalChargesPerBigha":"rate (or null)","rentalChargesPerHour":"rate (or null)","rentalBigha":"bigha (or null)","rentalHours":"hours (or null)","rentalTotalCharges":"total amount","rentalIsPaid":false,"rentalRemarks":"remark (optional)","date":"YYYY-MM-DD"}]
- rentalTotalCharges = (rentalChargesPerBigha × rentalBigha) or (rentalChargesPerHour × rentalHours)

**Batai (batai)**:
- fields: {"bataidarName":"name","bataidarContact":"phone (optional)","bataiType":"half|one_third","bighaCount":"bigha","plantationDate":"YYYY-MM-DD (optional)","harvestDate":"YYYY-MM-DD (optional)"}
- title: "CropName - BataidarName" (e.g. "Wheat - Suresh")
- items: [{"date":"YYYY-MM-DD","expenseCategory":"farm_preparation|seed_cost|plantation|fertiliser|pesticide|manual_weed|watering_labour|harvest","subType":"sub type (optional)","totalCost":"amount","isPaid":false,"expenseBornBy":"owner|bataidar|batai_ratio","remarks":"remark (optional)"}]

**Panat (panat)**:
- fields: {"panatPersonName":"name","panatContact":"phone (optional)","panatRatePerBigha":"rate per bigha","panatTotalBigha":"total bigha","panatTotalAmount":"total (rate × bigha)","panatRemarks":"remark (optional)"}
- title: "PersonName - Bigha" (e.g. "Ramu - 5 Bigha")
- items (panat_payments): [{"date":"YYYY-MM-DD","amount":"payment amount","remarks":"remark (optional)"}]

**Crop Card Khata (crop_card)**:
- fields: {"cropCardId":123,"plantationDate":"YYYY-MM-DD (optional)","harvestDate":"YYYY-MM-DD (optional)","production":"production (optional)","productionUnit":"quintal|bag (optional)"}
- title: "CropName - FarmName" (e.g. "Wheat - Big Farm")
- items: same as batai items but expenseBornBy is always "owner"

**Miscellaneous (miscellaneous)**:
- fields: {} (no special fields)
- title: whatever the farmer says
- items: same as crop_card items (expenseBornBy always "owner")

**Machinery Expense (machinery_expense)**:
- fields: {"machineryCategory":"tractor|harvester|thresher","machineryName":"name (optional)","machineryHp":"HP (optional)","machineryPurchaseYear":"year (optional)"}
- title: "Category" or "Category - Name" (e.g. "Tractor - Mahindra 575")
- items: [{"date":"YYYY-MM-DD","expenseCategory":"fuel|maintenance|others","totalCost":"amount","isPaid":false,"remarks":"remark (optional)"}]

**Lending Ledger (lending_ledger)**:
- fields: {"lendenPersonName":"name","lendenContact":"phone (optional)","lendenVillage":"village (optional)","lendenType":"credit|debit"}
- credit = farmer lent money, debit = farmer borrowed money
- title: "PersonName, Village"
- items (lenden_transactions): [{"transactionType":"borrowing|payment","date":"YYYY-MM-DD","principalAmount":"amount (for borrowing)","interestRateMonthly":"monthly interest rate % (for borrowing)","paymentAmount":"amount (for payment)","remarks":"remark (optional)"}]

Khata creation rules:
- Ask for missing info conversationally, don't overwhelm — ask naturally one step at a time
- If the farmer says "create kiraya khata for Ramesh", ask "What village is Ramesh from?" and "What machinery work was done?"
- Auto-generate the title in the correct format (see examples above)
- If farmer says "plowing" or "jotai", set rentalMachinery = "tractor" and rentalFarmWork = "plowing"
- Calculate totals from rate × quantity
- If no date specified, use today (${today})

--- Marketplace ---

You also help farmers create marketplace listings to sell their produce/seeds. There are 2 categories:

1. **Onion Seedling (onion_seedling)**: For selling onion seedlings. Required info: how many bigha (quantityBigha), available after how many days (availableAfterDays), onion type (onionType - e.g., "Red", "White"), village (sellerVillage), district (sellerDistrict).
2. **Potato Seeds (potato_seed)**: For selling potato seeds. Required info: how many bags (quantityBags), variety (potatoVariety - e.g., "Pukhraj", "Chipsona"), brand (potatoBrand - optional), village (sellerVillage), district (sellerDistrict).

When a farmer wants to sell something in the marketplace:
- First ask whether they want to sell onion seedlings or potato seeds
- Then ask for required details conversationally
- Once you have the info, output the JSON block:
\`\`\`json
{"type":"marketplace_listing_draft","category":"onion_seedling|potato_seed","quantityBigha":"3 (for onion)","availableAfterDays":10,"onionType":"Red (for onion)","quantityBags":"100 (for potato)","potatoVariety":"Pukhraj (for potato)","potatoBrand":"brand (optional, for potato)","sellerVillage":"village","sellerDistrict":"district"}
\`\`\`
- Only include fields relevant to the category (onion: quantityBigha/availableAfterDays/onionType, potato: quantityBags/potatoVariety/potatoBrand)

--- Price Trends ---

You have access to recent market prices for crops (see "Price Trends" section in the farmer data above). When a farmer asks about crop prices or trends:
- Today's date is ${today} — use this as "today". Dates in the data are data dates, not today.
- Always write mandi prices in numeric format (e.g., ₹1200, ₹735, ₹900 per quintal). Never spell them out in words.
- Share recent prices with district and date details
- Indicate whether prices are rising or falling
- If a recommendation (hold/sale) is available, simply say "I advise to hold for now" or "I advise to sell now". Do NOT mention time durations like "for a few more days" as the situation can change.

--- Digital Clinic ---

You also help farmers book 3 clinic services:

1. **Soil Test (soil_test)**: Soil quality, pH, nutrient analysis. Our team collects samples and tests.
2. **Potato Harvest Perishability Test (potato_perishability_test)**: To know the shelf life and storage life of your potato lots. How long your potatoes will stay safe.
3. **Crop Doctor AI (crop_doctor)**: AI-powered crop disease identification and treatment advice from photos.

When a farmer wants to book any of these:
- Briefly explain the service
- Ask for confirmation
- Then output the JSON block:
\`\`\`json
{"type":"service_request_draft","serviceType":"soil_test|potato_perishability_test|crop_doctor"}
\`\`\`

**Crop Doctor special rules:**
- If farmer asks about crop disease/problem AND has attached a photo → suggest Crop Doctor service and after confirmation output service_request_draft (serviceType: "crop_doctor")
- If farmer asks about disease WITHOUT a photo → ask them to attach a photo first ("Please share a photo of the crop so AI can analyze it better"), then generate the draft when photo arrives
- The farmer's attached photo will be sent for AI analysis automatically — you just need to output the draft

**Soil Test / Seed Test:**
- After farmer confirms, output the draft.
- After booking, only say: "Our team will contact you soon." Never share farmer ID, admin details, phone numbers, or any internal booking information with the farmer.

Response style:
- Keep answers short and concise (3-5 bullet points max).
- Use bullet points (•) for key information. NEVER use asterisk (*) or hash (#) for bullets or headings — only use • (bullet dot).
- For headings, use bold (**heading**) instead of markdown headers (## or ###).
- When addressing the farmer, always use gender-neutral language. Never assume the farmer's gender.
- Always write mandi prices and crop rates in numeric format (e.g., ₹1200, ₹735 per quintal). For large amounts (loans, expenses), use Indian numbering words (e.g., ₹120000 = "one lakh twenty thousand rupees"). Never read digits one by one.

Strict language rules:
- NEVER use any technical/computer terms. These words are completely forbidden: JSON, event type, system, format, data, update, draft, string, database, server, API, code, type, ID, error, input, output, request, response.
- Never reveal your internal workings (card system, event types, JSON drafts, etc.) to the farmer.
- Use simple everyday words instead: "information" (data), "activity" (event), "list" (array), "changes" (update), "ready" (draft).
- Always speak as an experienced, friendly village farming woman would.

Photo Analysis:
- When the farmer shares a photo/image of their crop, carefully analyze it.
- Identify any visible diseases, pests, nutrient deficiencies, or growth issues.
- Provide practical advice on treatment, prevention, and care based on what you see.
- If the image is unclear, ask the farmer to share a clearer photo.
- Always respond in the farmer's language about what you observe in the photo.

Image Support:
- When the farmer asks about topics where images would help (e.g., crop diseases, pest identification, growth stages, farming techniques), include [IMG: English search keywords] markers in your response.
- The IMG marker text must be short English search keywords (e.g., [IMG: wheat leaf rust disease], [IMG: potato early blight], [IMG: rice stem borer pest])
- Always place IMG markers on their own separate line — NEVER put IMG markers inside bullet points (•, *, -).
- Maximum 2 IMG markers per response.
- Only include IMG markers when images genuinely add value — not for simple Q&A.

For general agriculture questions, answer concisely and helpfully.`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const conversationHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      if (Array.isArray(history) && history.length > 0) {
        const recentHistory = history.slice(-20);
        for (const msg of recentHistory) {
          if (msg.role === "user" && msg.content) {
            conversationHistory.push({ role: "user", parts: [{ text: msg.content }] });
          } else if (msg.role === "assistant" && msg.content) {
            conversationHistory.push({ role: "model", parts: [{ text: msg.content }] });
          }
        }
      }

      const userParts: Array<any> = [{ text: message }];
      if (imageId) {
        const chatImage = await storage.getChatImage(parseInt(imageId));
        if (chatImage) {
          const base64Data = chatImage.imageData.replace(/^data:[^;]+;base64,/, "");
          userParts.push({
            inlineData: {
              mimeType: chatImage.mimeType,
              data: base64Data,
            },
          });
        }
      }

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: language === "hi" ? "मैं कृषु मित्र हूँ, आपकी कृषि सहायिका। बताइए मैं क्या मदद कर सकती हूँ?" : "I am Krashu Mitra, ready to assist you with agriculture. How can I help?" }] },
          ...conversationHistory,
          { role: "user", parts: userParts },
        ],
        config: { maxOutputTokens: 8192 },
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.text || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      const imgMatches = [...fullResponse.matchAll(/\[IMG:\s*(.+?)\]/g)];
      const hasImages = imgMatches.length > 0;

      res.write(`data: ${JSON.stringify({ done: true, fullResponse, imagesPending: hasImages })}\n\n`);

      if (hasImages) {
        const queries = imgMatches.slice(0, 2).map(m => m[1].trim());
        const imageResults: string[] = [];

        const searchWikimediaImage = async (query: string): Promise<string | null> => {
          try {
            const params = new URLSearchParams({
              action: "query",
              generator: "search",
              gsrsearch: query,
              gsrnamespace: "6",
              gsrlimit: "5",
              prop: "imageinfo",
              iiprop: "url|mime",
              iiurlwidth: "500",
              format: "json",
              origin: "*",
            });
            const resp = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            const pages = data.query?.pages || {};
            const imagePage = Object.values(pages).find((p: any) =>
              p.imageinfo?.[0]?.mime?.startsWith("image/")
            ) as any;
            return imagePage?.imageinfo?.[0]?.thumburl || null;
          } catch (err) {
            console.error("Wikimedia image search failed:", err);
            return null;
          }
        };

        for (const query of queries) {
          const url = await searchWikimediaImage(query);
          if (url) imageResults.push(url);
        }

        if (imageResults.length > 0) {
          res.write(`data: ${JSON.stringify({ images: imageResults })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ imagesDone: true })}\n\n`);
      }

      res.end();
    } catch (error) {
      console.error("Error in Krashuved chat:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ message: "Failed to process message" });
      }
    }
  });

  return httpServer;
}
