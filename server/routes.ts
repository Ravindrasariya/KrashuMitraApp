import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { GoogleGenAI } from "@google/genai";
import { insertCropCardSchema, insertCropEventSchema } from "@shared/schema";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerChatRoutes(app);

  app.get("/api/crop-cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cards = await storage.getCropCardsByUser(userId);
      res.json(cards);
    } catch (error) {
      console.error("Error fetching crop cards:", error);
      res.status(500).json({ message: "Failed to fetch crop cards" });
    }
  });

  app.get("/api/crop-cards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const card = await storage.getCropCard(parseInt(req.params.id));
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.user.claims.sub) return res.status(403).json({ message: "Forbidden" });
      res.json(card);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch crop card" });
    }
  });

  app.post("/api/crop-cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const data = insertCropCardSchema.parse({ ...req.body, userId });
      const card = await storage.createCropCard(data);
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
      if (card.userId !== req.user.claims.sub) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.updateCropCard(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update crop card" });
    }
  });

  app.delete("/api/crop-cards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const card = await storage.getCropCard(parseInt(req.params.id));
      if (!card) return res.status(404).json({ message: "Not found" });
      if (card.userId !== req.user.claims.sub) return res.status(403).json({ message: "Forbidden" });
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
      if (card.userId !== req.user.claims.sub) return res.status(403).json({ message: "Forbidden" });
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
      if (card.userId !== req.user.claims.sub) return res.status(403).json({ message: "Forbidden" });
      const data = insertCropEventSchema.parse({ ...req.body, cropCardId: parseInt(req.params.id) });
      const event = await storage.createCropEvent(data);
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.patch("/api/crop-events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const event = await storage.getCropEvent(parseInt(req.params.id));
      if (!event) return res.status(404).json({ message: "Not found" });
      const card = await storage.getCropCard(event.cropCardId);
      if (!card || card.userId !== req.user.claims.sub) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.updateCropEvent(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.post("/api/crop-events/:id/toggle", isAuthenticated, async (req: any, res) => {
    try {
      const event = await storage.getCropEvent(parseInt(req.params.id));
      if (!event) return res.status(404).json({ message: "Not found" });
      const card = await storage.getCropCard(event.cropCardId);
      if (!card || card.userId !== req.user.claims.sub) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.toggleCropEventComplete(parseInt(req.params.id));
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle event" });
    }
  });

  app.delete("/api/crop-events/:id", isAuthenticated, async (req: any, res) => {
    try {
      const event = await storage.getCropEvent(parseInt(req.params.id));
      if (!event) return res.status(404).json({ message: "Not found" });
      const card = await storage.getCropCard(event.cropCardId);
      if (!card || card.userId !== req.user.claims.sub) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteCropEvent(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  app.get("/api/suggestions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const suggestions = await storage.getSuggestions(userId);
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  app.post("/api/krashuved/chat", isAuthenticated, async (req: any, res) => {
    try {
      const { message, language } = req.body;
      const userId = req.user.claims.sub;

      const systemPrompt = language === "hi"
        ? `तुम KrashuVed (कृषुवेद) हो, एक कृषि विशेषज्ञ AI सहायक। तुम किसानों की मदद करते हो फसल प्रबंधन में।

जब किसान "Krashuved" या "कृषुवेद" कहकर फसल कार्ड बनाने को कहे, तो तुम्हें JSON format में जवाब देना है:
{
  "type": "crop_card_draft",
  "cropName": "फसल का नाम",
  "startDate": "YYYY-MM-DD",
  "events": [
    {"eventType": "plantation|fertiliser|pesticide|watering", "description": "विवरण", "eventDate": "YYYY-MM-DD"}
  ]
}

अगर किसान सामान्य कृषि सवाल पूछे तो सादा हिंदी में जवाब दो। जवाब छोटा और उपयोगी रखो।
अगर crop card बनाने का अनुरोध है तो ONLY JSON दो, कोई अतिरिक्त text नहीं।`
        : `You are KrashuVed, an agricultural expert AI assistant. You help farmers with crop management.

When a farmer says "Krashuved" and asks to create a crop card, respond ONLY with JSON:
{
  "type": "crop_card_draft",
  "cropName": "crop name",
  "startDate": "YYYY-MM-DD",
  "events": [
    {"eventType": "plantation|fertiliser|pesticide|watering", "description": "details", "eventDate": "YYYY-MM-DD"}
  ]
}

For general agriculture questions, answer concisely and helpfully.
If it's a crop card request, respond ONLY with the JSON, no additional text.`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: language === "hi" ? "मैं कृषुवेद हूँ, आपकी कृषि सहायता के लिए तैयार हूँ। बताइए क्या मदद चाहिए?" : "I am KrashuVed, ready to assist you with agriculture. How can I help?" }] },
          { role: "user", parts: [{ text: message }] },
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

      res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
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
