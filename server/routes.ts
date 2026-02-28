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

      const today = new Date().toISOString().split("T")[0];

      const systemPrompt = language === "hi"
        ? `तुम KrashuVed (कृषुवेद) हो, एक कृषि विशेषज्ञ AI सहायक। तुम किसानों की मदद करते हो फसल प्रबंधन में।

आज की तारीख: ${today}

जब किसान "Krashuved" या "कृषुवेद" कहकर फसल कार्ड बनाने को कहे, तो:
1. पहले एक छोटा सा सारांश लिखो जो किसान को समझ आए (जैसे "मैंने आलू का फसल कार्ड तैयार किया है जिसमें बुवाई, खाद, और सिंचाई शामिल है।")
2. फिर नई लाइन पर JSON ब्लॉक दो इस format में:
\`\`\`json
{"type":"crop_card_draft","cropName":"फसल का नाम","farmName":"खेत का नाम (वैकल्पिक)","variety":"किस्म (वैकल्पिक)","startDate":"YYYY-MM-DD","events":[{"eventType":"plantation|fertiliser|pesticide|watering","description":"विवरण","eventDate":"YYYY-MM-DD"}]}
\`\`\`

महत्वपूर्ण नियम:
- farmName और variety वैकल्पिक हैं। अगर किसान ने बताया हो तो शामिल करो, नहीं तो छोड़ दो।
- अगर किसान कोई तारीख नहीं बताए तो startDate आज (${today}) रखो।
- अगर किसान "2 महीने पहले" या "3 हफ्ते पहले" बोले तो आज की तारीख से गणना करो।
- अगर कोई recurring/बार-बार होने वाली गतिविधि हो (जैसे "हर 15 दिन में सिंचाई"), तो हर बार के लिए अलग-अलग entry बनाओ अपनी-अपनी तारीख के साथ। कम से कम 3-4 महीने की अवधि के लिए entries बनाओ।
- eventType केवल ये हो सकते हैं: plantation, fertiliser, pesticide, watering

अगर किसान सामान्य कृषि सवाल पूछे तो सादा हिंदी में जवाब दो। जवाब छोटा और उपयोगी रखो।`
        : `You are KrashuVed, an agricultural expert AI assistant. You help farmers with crop management.

Today's date: ${today}

When a farmer says "Krashuved" and asks to create a crop card:
1. First write a brief friendly summary in plain language (e.g., "I've prepared a potato crop card with plantation, fertilizer, and watering events.")
2. Then on a new line, output the JSON block in this format:
\`\`\`json
{"type":"crop_card_draft","cropName":"crop name","farmName":"farm/plot name (optional)","variety":"variety (optional)","startDate":"YYYY-MM-DD","events":[{"eventType":"plantation|fertiliser|pesticide|watering","description":"details","eventDate":"YYYY-MM-DD"}]}
\`\`\`

Important rules:
- farmName and variety are optional. Include them only if the farmer mentions them.
- If no date is specified, use today (${today}) as the startDate.
- If the farmer says "2 months ago" or "3 weeks back", calculate from today's date.
- For recurring activities (e.g., "watering every 15 days"), create individual entries for EACH occurrence with specific dates. Generate entries for at least 3-4 months.
- eventType must be one of: plantation, fertiliser, pesticide, watering

For general agriculture questions, answer concisely and helpfully.`;

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
