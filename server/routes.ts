import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupPhoneAuth, isAuthenticated } from "./auth-phone";
import { registerChatRoutes } from "./replit_integrations/chat";
import { GoogleGenAI } from "@google/genai";
import { insertCropCardSchema, insertCropEventSchema, insertKhataRegisterSchema, insertKhataItemSchema } from "@shared/schema";
import bcrypt from "bcryptjs";

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
      const allowedFields = insertCropEventSchema.pick({ eventType: true, description: true, eventDate: true, productionPerBigha: true, productionUnit: true }).partial();
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

  app.get("/api/khata", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const filters: { khataType?: string; year?: number; month?: number } = {};
      if (req.query.type && req.query.type !== "all") filters.khataType = req.query.type;
      if (req.query.year && req.query.year !== "all") filters.year = parseInt(req.query.year);
      if (req.query.month && req.query.month !== "all") filters.month = parseInt(req.query.month);
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
      res.json({ ...reg, items });
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
      const allowedFields = insertKhataRegisterSchema.pick({ title: true, plantationDate: true, harvestDate: true, production: true, productionUnit: true }).partial();
      const parsed = allowedFields.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const updated = await storage.updateKhataRegister(parseInt(req.params.id), parsed.data);
      res.json(updated);
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
      const allowedItemFields = insertKhataItemSchema.pick({ date: true, expenseCategory: true, subType: true, hours: true, perBighaRate: true, totalCost: true, remarks: true, isPaid: true }).partial();
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
      const { message, language, history } = req.body;
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

जवाब का तरीका:
- जवाब हमेशा छोटा और सटीक रखो (अधिकतम 3-5 बुलेट पॉइंट)।
- मुख्य जानकारी के लिए बुलेट पॉइंट (•) का उपयोग करो। कभी भी asterisk (*) या hash (#) से बुलेट या heading मत बनाओ — सिर्फ • (बुलेट डॉट) का उपयोग करो।
- heading बनाने के लिए markdown (## या ###) का उपयोग मत करो — सीधे बोल्ड (**शीर्षक**) का उपयोग करो।
- जवाब के अंत में 1-2 संबंधित सवाल सुझाओ जो किसान आगे पूछ सकता है, हर सुझाव "🔎" से शुरू करो।
- हमेशा स्त्रीलिंग में बोलो (मैं बताती हूँ, मैं सुझाव देती हूँ, मैंने देखा, etc.)।

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

Response style:
- Keep answers short and concise (3-5 bullet points max).
- Use bullet points (•) for key information. NEVER use asterisk (*) or hash (#) for bullets or headings — only use • (bullet dot).
- For headings, use bold (**heading**) instead of markdown headers (## or ###).
- At the end of your reply, suggest 1-2 related questions the farmer might want to ask next, prefix each with "🔎".

Strict language rules:
- NEVER use any technical/computer terms. These words are completely forbidden: JSON, event type, system, format, data, update, draft, string, database, server, API, code, type, ID, error, input, output, request, response.
- Never reveal your internal workings (card system, event types, JSON drafts, etc.) to the farmer.
- Use simple everyday words instead: "information" (data), "activity" (event), "list" (array), "changes" (update), "ready" (draft).
- Always speak as an experienced, friendly village farming woman would.

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

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: language === "hi" ? "मैं कृषु मित्र हूँ, आपकी कृषि सहायिका। बताइए मैं क्या मदद कर सकती हूँ?" : "I am Krashu Mitra, ready to assist you with agriculture. How can I help?" }] },
          ...conversationHistory,
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
