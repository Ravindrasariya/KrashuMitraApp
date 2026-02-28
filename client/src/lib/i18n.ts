import { useState, useCallback, createContext, useContext } from "react";

export type Language = "hi" | "en";

const translations = {
  appName: { hi: "कृषु मित्र", en: "Krashu Mitra" },
  appTagline: { hi: "KrashuVed द्वारा", en: "by KrashuVed" },
  home: { hi: "होम", en: "Home" },
  digitalClinic: { hi: "डिजिटल क्लिनिक", en: "Digital Clinic" },
  marketplace: { hi: "बाज़ार", en: "Marketplace" },
  farmManagement: { hi: "फसल प्रबंधन", en: "Farm Management" },
  farmKhata: { hi: "फार्म खाता", en: "Farm Khata" },
  admin: { hi: "एडमिन", en: "Admin" },
  login: { hi: "लॉगिन", en: "Login" },
  logout: { hi: "लॉगआउट", en: "Logout" },
  profile: { hi: "प्रोफ़ाइल", en: "Profile" },
  more: { hi: "और", en: "More" },
  addCropCard: { hi: "फसल कार्ड जोड़ें", en: "Add Crop Card" },
  cropName: { hi: "फसल का नाम", en: "Crop Name" },
  startDate: { hi: "शुरू की तारीख", en: "Start Date" },
  status: { hi: "स्थिति", en: "Status" },
  active: { hi: "सक्रिय", en: "Active" },
  completed: { hi: "पूर्ण", en: "Completed" },
  pending: { hi: "बाकी", en: "Pending" },
  addEvent: { hi: "गतिविधि जोड़ें", en: "Add Event" },
  plantation: { hi: "बुवाई", en: "Plantation" },
  fertiliser: { hi: "खाद", en: "Fertiliser" },
  pesticide: { hi: "कीटनाशक", en: "Pesticide" },
  watering: { hi: "सिंचाई", en: "Watering" },
  description: { hi: "विवरण", en: "Description" },
  date: { hi: "तारीख", en: "Date" },
  save: { hi: "सहेजें", en: "Save" },
  cancel: { hi: "रद्द करें", en: "Cancel" },
  delete: { hi: "हटाएं", en: "Delete" },
  edit: { hi: "संपादित करें", en: "Edit" },
  timeline: { hi: "समयरेखा", en: "Timeline" },
  noCropCards: { hi: "कोई फसल कार्ड नहीं है। नया जोड़ें!", en: "No crop cards yet. Add one!" },
  loginRequired: { hi: "इस सुविधा के लिए लॉगिन करें", en: "Login required for this feature" },
  welcome: { hi: "स्वागत है", en: "Welcome" },
  heroTitle: { hi: "किसानों का स्मार्ट साथी", en: "Smart Companion for Farmers" },
  heroSubtitle: { hi: "AI-संचालित फसल प्रबंधन, डिजिटल क्लिनिक, और बाज़ार - सब एक जगह", en: "AI-powered crop management, digital clinic, and marketplace - all in one place" },
  getStarted: { hi: "शुरू करें", en: "Get Started" },
  comingSoon: { hi: "जल्द आ रहा है", en: "Coming Soon" },
  chatWithKrashuved: { hi: "कृषुवेद से बात करें", en: "Chat with KrashuVed" },
  askKrashuved: { hi: "कृषुवेद से पूछें...", en: "Ask KrashuVed..." },
  krashuvedIntro: { hi: "मैं कृषुवेद हूँ, आपका कृषि सहायक। 'कृषुवेद' कहकर फसल कार्ड बनवाएं या कोई भी कृषि सवाल पूछें।", en: "I am KrashuVed, your agriculture assistant. Say 'Krashuved' to create crop cards or ask any farming question." },
  approve: { hi: "मंजूर करें", en: "Approve" },
  reject: { hi: "अस्वीकार करें", en: "Reject" },
  listening: { hi: "सुन रहा हूँ...", en: "Listening..." },
  speak: { hi: "बोलें", en: "Speak" },
  send: { hi: "भेजें", en: "Send" },
  eventType: { hi: "गतिविधि का प्रकार", en: "Event Type" },
  selectEventType: { hi: "प्रकार चुनें", en: "Select Type" },
  enterDescription: { hi: "विवरण दर्ज करें (जैसे: यूरिया, NPK)", en: "Enter description (e.g. Urea, NPK)" },
  myCropCards: { hi: "मेरे फसल कार्ड", en: "My Crop Cards" },
  deleteConfirm: { hi: "क्या आप वाकई हटाना चाहते हैं?", en: "Are you sure you want to delete?" },
  yes: { hi: "हाँ", en: "Yes" },
  no: { hi: "नहीं", en: "No" },
  loading: { hi: "लोड हो रहा है...", en: "Loading..." },
  featureComingSoon: { hi: "यह सुविधा जल्द उपलब्ध होगी", en: "This feature will be available soon" },
  farmName: { hi: "खेत / प्लॉट", en: "Farm / Plot" },
  farmNamePlaceholder: { hi: "खेत या प्लॉट का नाम (वैकल्पिक)", en: "Farm or plot name (optional)" },
  variety: { hi: "किस्म", en: "Variety" },
  varietyPlaceholder: { hi: "फसल की किस्म (वैकल्पिक)", en: "Crop variety (optional)" },
  cropCardCreated: { hi: "फसल कार्ड बनाया गया!", en: "Crop card created!" },
  eventAdded: { hi: "गतिविधि जोड़ी गई!", en: "Event added!" },
} as const;

export type TranslationKey = keyof typeof translations;

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("krashu-lang") as Language) || "hi";
    }
    return "hi";
  });

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => {
      const next = prev === "hi" ? "en" : "hi";
      localStorage.setItem("krashu-lang", next);
      return next;
    });
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[key]?.[language] || key;
  }, [language]);

  return { language, setLanguage, toggleLanguage, t };
}

export type LanguageContextType = ReturnType<typeof useLanguage>;

export const LanguageContext = createContext<LanguageContextType | null>(null);

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}
