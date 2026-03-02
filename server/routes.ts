import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupPhoneAuth, isAuthenticated } from "./auth-phone";
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

  app.get("/api/crop-cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
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
      const allowedFields = insertCropEventSchema.pick({ eventType: true, description: true, eventDate: true }).partial();
      const parsed = allowedFields.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const updated = await storage.updateCropEvent(parseInt(req.params.id), parsed.data);
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
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete event" });
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

  app.post("/api/krashuved/chat", isAuthenticated, async (req: any, res) => {
    try {
      const { message, language } = req.body;
      const userId = req.session.userId;

      const today = new Date().toISOString().split("T")[0];

      const farmerCode = await storage.ensureFarmerCode(userId);
      const user = await storage.getUserById(userId);
      const cardsWithEvents = await storage.getCropCardsWithEvents(userId);

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
      }

      const systemPrompt = language === "hi"
        ? `तुम KrashuVed (कृषुवेद) हो, एक कृषि विशेषज्ञ AI सहायक। तुम किसानों की मदद करते हो फसल प्रबंधन में।

आज की तारीख: ${today}
${farmerContext}

जब किसान नया फसल कार्ड बनाने को कहे, तो:
1. पहले एक छोटा सा सारांश लिखो जो किसान को समझ आए
2. फिर नई लाइन पर JSON ब्लॉक दो इस format में:
\`\`\`json
{"type":"crop_card_draft","cropName":"फसल का नाम","farmName":"खेत का नाम (वैकल्पिक)","variety":"किस्म (वैकल्पिक)","startDate":"YYYY-MM-DD","events":[{"eventType":"plantation|fertiliser|pesticide|watering","description":"विवरण","eventDate":"YYYY-MM-DD"}]}
\`\`\`

जब किसान किसी मौजूदा फसल कार्ड में बदलाव करना चाहे (जैसे "मेरे गेहूँ कार्ड में खाद जोड़ दो", "आलू का कार्ड अपडेट करो"), तो:
1. ऊपर दी गई किसान की जानकारी से सही कार्ड ढूंढो (cardId से)
2. एक छोटा सारांश लिखो
3. फिर JSON ब्लॉक दो:
\`\`\`json
{"type":"crop_card_edit_draft","cardId":123,"updates":{"cropName":"नया नाम (वैकल्पिक)","farmName":"नया खेत (वैकल्पिक)","variety":"नई किस्म (वैकल्पिक)"},"addEvents":[{"eventType":"plantation|fertiliser|pesticide|watering","description":"विवरण","eventDate":"YYYY-MM-DD"}],"removeEventIds":[]}
\`\`\`
- updates में केवल वो fields डालो जो बदलने हैं
- addEvents में नई गतिविधियाँ जो जोड़नी हैं
- removeEventIds में उन events की IDs जो हटानी हैं

महत्वपूर्ण नियम:
- farmName और variety वैकल्पिक हैं। अगर किसान ने बताया हो तो शामिल करो, नहीं तो छोड़ दो।
- अगर किसान कोई तारीख नहीं बताए तो startDate आज (${today}) रखो।
- अगर किसान "2 महीने पहले" या "3 हफ्ते पहले" बोले तो आज की तारीख से गणना करो।
- अगर कोई recurring/बार-बार होने वाली गतिविधि हो (जैसे "हर 15 दिन में सिंचाई"), तो हर बार के लिए अलग-अलग entry बनाओ। कम से कम 3-4 महीने की अवधि के लिए entries बनाओ।
- eventType केवल ये हो सकते हैं: plantation, fertiliser, pesticide, watering
- जब किसान अपनी फसलों के बारे में पूछे, तो ऊपर दी गई जानकारी का उपयोग करो।

जवाब का तरीका:
- जवाब हमेशा छोटा और सटीक रखो (अधिकतम 3-5 बुलेट पॉइंट)।
- मुख्य जानकारी के लिए बुलेट पॉइंट (•) का उपयोग करो।
- जवाब के अंत में 1-2 संबंधित सवाल सुझाओ जो किसान आगे पूछ सकता है, हर सुझाव "🔎" से शुरू करो।

अगर किसान सामान्य कृषि सवाल पूछे तो सादा हिंदी में जवाब दो।`
        : `You are KrashuVed, an agricultural expert AI assistant. You help farmers with crop management.

Today's date: ${today}
${farmerContext}

When a farmer asks to create a NEW crop card:
1. First write a brief friendly summary in plain language
2. Then on a new line, output the JSON block:
\`\`\`json
{"type":"crop_card_draft","cropName":"crop name","farmName":"farm/plot name (optional)","variety":"variety (optional)","startDate":"YYYY-MM-DD","events":[{"eventType":"plantation|fertiliser|pesticide|watering","description":"details","eventDate":"YYYY-MM-DD"}]}
\`\`\`

When a farmer asks to EDIT an existing crop card (e.g., "add fertilizer to my wheat card", "update my potato card"), then:
1. Find the correct card from the farmer's data above (use cardId)
2. Write a brief summary of changes
3. Output JSON block:
\`\`\`json
{"type":"crop_card_edit_draft","cardId":123,"updates":{"cropName":"new name (optional)","farmName":"new farm (optional)","variety":"new variety (optional)"},"addEvents":[{"eventType":"plantation|fertiliser|pesticide|watering","description":"details","eventDate":"YYYY-MM-DD"}],"removeEventIds":[]}
\`\`\`
- In updates, only include fields that are changing
- In addEvents, include new events to add
- In removeEventIds, include IDs of events to remove

Important rules:
- farmName and variety are optional. Include only if the farmer mentions them.
- If no date is specified, use today (${today}) as the startDate.
- If the farmer says "2 months ago" or "3 weeks back", calculate from today's date.
- For recurring activities (e.g., "watering every 15 days"), create individual entries for EACH occurrence. Generate entries for at least 3-4 months.
- eventType must be one of: plantation, fertiliser, pesticide, watering
- When the farmer asks about their crops, use the farmer data provided above to answer.

Response style:
- Keep answers short and concise (3-5 bullet points max).
- Use bullet points (•) for key information.
- At the end of your reply, suggest 1-2 related questions the farmer might want to ask next, prefix each with "🔎".

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
