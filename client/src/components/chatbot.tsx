import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MessageCircle, Send, Mic, MicOff, X, Check, Sprout, Loader2, Pencil } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CropCardDraft {
  type: "crop_card_draft";
  cropName: string;
  farmName?: string;
  variety?: string;
  startDate: string;
  events: Array<{
    eventType: string;
    description: string;
    eventDate: string;
  }>;
}

interface CropCardEditDraft {
  type: "crop_card_edit_draft";
  cardId: number;
  updates?: {
    cropName?: string;
    farmName?: string;
    variety?: string;
  };
  addEvents?: Array<{
    eventType: string;
    description: string;
    eventDate: string;
  }>;
  removeEventIds?: number[];
}

type Draft = CropCardDraft | CropCardEditDraft;

const CHAT_STORAGE_KEY = "krashu-chat-history";
const CHAT_EXPIRY_MS = 24 * 60 * 60 * 1000;

function stripJsonFromMessage(text: string): string {
  let cleaned = text.replace(/```json\s*[\s\S]*?```/g, "").trim();
  cleaned = cleaned.replace(/```\s*[\s\S]*?```/g, "").trim();
  cleaned = cleaned.replace(/\{[\s\S]*"type"\s*:\s*"crop_card_(draft|edit_draft)"[\s\S]*\}/g, "").trim();
  return cleaned;
}

function loadSavedMessages(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (Date.now() - parsed.timestamp > CHAT_EXPIRY_MS) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      return [];
    }
    return parsed.messages || [];
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
      messages,
      timestamp: Date.now(),
    }));
  } catch {}
}

function tryParseDraft(text: string): Draft | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed.type === "crop_card_draft" || parsed.type === "crop_card_edit_draft") return parsed;
  } catch {}

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.type === "crop_card_draft" || parsed.type === "crop_card_edit_draft") return parsed;
    }
  } catch {}

  try {
    const rawMatch = text.match(/\{[\s\S]*"type"\s*:\s*"crop_card_(draft|edit_draft)"[\s\S]*\}/);
    if (rawMatch) {
      const parsed = JSON.parse(rawMatch[0]);
      return parsed;
    }
  } catch {}

  return null;
}

export function Chatbot() {
  const { t, language } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadSavedMessages());
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const { data: profile } = useQuery<{ farmerCode: string; firstName: string; lastName: string }>({
    queryKey: ["/api/farmer/profile"],
    enabled: isAuthenticated && isOpen,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/krashuved/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text, language }),
      });

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assistantContent += data.content;
                const displayContent = stripJsonFromMessage(assistantContent);
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: displayContent };
                  return updated;
                });
              }
              if (data.done && data.fullResponse) {
                const displayContent = stripJsonFromMessage(data.fullResponse);
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: displayContent || (language === "hi" ? "फसल कार्ड तैयार है। कृपया नीचे देखें और मंजूर करें।" : "Crop card is ready. Please review below and approve.") };
                  return updated;
                });

                const parsedDraft = tryParseDraft(data.fullResponse);
                if (parsedDraft) setDraft(parsedDraft);
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: language === "hi" ? "माफ करें, कुछ गड़बड़ हुई। कृपया दोबारा प्रयास करें।" : "Sorry, something went wrong. Please try again."
      }]);
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, language]);

  const approveDraft = useCallback(async () => {
    if (!draft) return;

    try {
      if (draft.type === "crop_card_draft") {
        const cardRes = await apiRequest("POST", "/api/crop-cards", {
          cropName: draft.cropName,
          farmName: draft.farmName || null,
          variety: draft.variety || null,
          startDate: draft.startDate,
        });
        const card = await cardRes.json();

        for (const event of draft.events) {
          await apiRequest("POST", `/api/crop-cards/${card.id}/events`, {
            eventType: event.eventType,
            description: event.description,
            eventDate: event.eventDate,
          });
        }

        queryClient.invalidateQueries({ queryKey: ["/api/crop-cards"] });
        toast({ title: t("cropCardCreated") });
        setDraft(null);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: language === "hi" ? "फसल कार्ड सफलतापूर्वक बनाया गया! आप इसे फसल प्रबंधन टैब में देख सकते हैं।" : "Crop card created successfully! You can view it in the Farm Management tab."
        }]);
      } else if (draft.type === "crop_card_edit_draft") {
        if (draft.updates && Object.keys(draft.updates).length > 0) {
          await apiRequest("PATCH", `/api/crop-cards/${draft.cardId}`, draft.updates);
        }

        if (draft.addEvents && draft.addEvents.length > 0) {
          for (const event of draft.addEvents) {
            await apiRequest("POST", `/api/crop-cards/${draft.cardId}/events`, {
              eventType: event.eventType,
              description: event.description,
              eventDate: event.eventDate,
            });
          }
        }

        if (draft.removeEventIds && draft.removeEventIds.length > 0) {
          for (const eventId of draft.removeEventIds) {
            await apiRequest("DELETE", `/api/crop-events/${eventId}`);
          }
        }

        queryClient.invalidateQueries({ queryKey: ["/api/crop-cards"] });
        queryClient.invalidateQueries({ queryKey: ["/api/crop-cards", draft.cardId, "events"] });
        toast({ title: t("cropCardUpdated") });
        setDraft(null);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: language === "hi" ? "फसल कार्ड सफलतापूर्वक अपडेट किया गया!" : "Crop card updated successfully!"
        }]);
      }
    } catch (error) {
      toast({ title: "Error", variant: "destructive" });
    }
  }, [draft, language, t, toast]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: language === "hi" ? "ब्राउज़र समर्थित नहीं है" : "Browser not supported",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === "hi" ? "hi-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setInput(text);
      setIsListening(false);
      sendMessage(text);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [language, sendMessage, toast]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  if (!isAuthenticated) return null;

  const isEditDraft = draft?.type === "crop_card_edit_draft";
  const editDraft = isEditDraft ? (draft as CropCardEditDraft) : null;
  const createDraft = !isEditDraft ? (draft as CropCardDraft | null) : null;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed right-4 bottom-20 md:bottom-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
            data-testid="button-open-chatbot"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl p-0 flex flex-col" data-testid="chatbot-sheet">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <Sprout className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-bold">KrashuVed</h3>
                <p className="text-[10px] text-muted-foreground">
                  {language === "hi" ? "कृषि AI सहायक" : "Agri AI Assistant"}
                  {profile?.farmerCode && (
                    <span className="ml-1.5 text-primary font-medium" data-testid="text-farmer-code-chat">
                      · {profile.farmerCode}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Sprout className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {t("krashuvedIntro")}
                </p>
                {profile?.farmerCode && (
                  <p className="text-xs text-primary mt-2 font-medium" data-testid="text-farmer-id-intro">
                    {t("farmerId")}: {profile.farmerCode}
                  </p>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
                  }`}
                  data-testid={`chat-message-${i}`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            ))}

            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}

            {createDraft && (
              <Card className="p-3 border-primary/30 bg-primary/5" data-testid="draft-card">
                <h4 className="text-sm font-bold mb-2">
                  {language === "hi" ? "फसल कार्ड ड्राफ्ट:" : "Crop Card Draft:"}
                </h4>
                <p className="text-sm"><strong>{language === "hi" ? "फसल:" : "Crop:"}</strong> {createDraft.cropName}</p>
                {createDraft.farmName && <p className="text-sm"><strong>{language === "hi" ? "खेत:" : "Farm:"}</strong> {createDraft.farmName}</p>}
                {createDraft.variety && <p className="text-sm"><strong>{language === "hi" ? "किस्म:" : "Variety:"}</strong> {createDraft.variety}</p>}
                <p className="text-sm"><strong>{language === "hi" ? "तारीख:" : "Date:"}</strong> {createDraft.startDate}</p>
                {createDraft.events.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {language === "hi" ? `${createDraft.events.length} गतिविधियाँ:` : `${createDraft.events.length} events:`}
                    </p>
                    {createDraft.events.slice(0, 6).map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {e.eventDate} - {e.eventType}: {e.description}
                      </p>
                    ))}
                    {createDraft.events.length > 6 && (
                      <p className="text-xs text-muted-foreground italic">
                        {language === "hi" ? `...और ${createDraft.events.length - 6} और` : `...and ${createDraft.events.length - 6} more`}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={approveDraft} data-testid="button-approve-draft">
                    <Check className="w-3 h-3 mr-1" />
                    {t("approve")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDraft(null)} data-testid="button-reject-draft">
                    <X className="w-3 h-3 mr-1" />
                    {t("reject")}
                  </Button>
                </div>
              </Card>
            )}

            {editDraft && (
              <Card className="p-3 border-amber-500/30 bg-amber-50 dark:bg-amber-950/20" data-testid="edit-draft-card">
                <div className="flex items-center gap-2 mb-2">
                  <Pencil className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold">
                    {language === "hi" ? `कार्ड #${editDraft.cardId} में बदलाव:` : `Edit Card #${editDraft.cardId}:`}
                  </h4>
                </div>
                {editDraft.updates && Object.keys(editDraft.updates).length > 0 && (
                  <div className="space-y-0.5 mb-2">
                    {editDraft.updates.cropName && (
                      <p className="text-sm"><strong>{language === "hi" ? "नया नाम:" : "New name:"}</strong> {editDraft.updates.cropName}</p>
                    )}
                    {editDraft.updates.farmName && (
                      <p className="text-sm"><strong>{language === "hi" ? "नया खेत:" : "New farm:"}</strong> {editDraft.updates.farmName}</p>
                    )}
                    {editDraft.updates.variety && (
                      <p className="text-sm"><strong>{language === "hi" ? "नई किस्म:" : "New variety:"}</strong> {editDraft.updates.variety}</p>
                    )}
                  </div>
                )}
                {editDraft.addEvents && editDraft.addEvents.length > 0 && (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400">
                      {language === "hi" ? `+ ${editDraft.addEvents.length} नई गतिविधियाँ:` : `+ ${editDraft.addEvents.length} new events:`}
                    </p>
                    {editDraft.addEvents.slice(0, 6).map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {e.eventDate} - {e.eventType}: {e.description}
                      </p>
                    ))}
                    {editDraft.addEvents.length > 6 && (
                      <p className="text-xs text-muted-foreground italic">
                        {language === "hi" ? `...और ${editDraft.addEvents.length - 6} और` : `...and ${editDraft.addEvents.length - 6} more`}
                      </p>
                    )}
                  </div>
                )}
                {editDraft.removeEventIds && editDraft.removeEventIds.length > 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    {language === "hi" ? `- ${editDraft.removeEventIds.length} गतिविधियाँ हटाई जाएंगी` : `- ${editDraft.removeEventIds.length} events will be removed`}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={approveDraft} data-testid="button-approve-edit-draft">
                    <Check className="w-3 h-3 mr-1" />
                    {t("approve")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDraft(null)} data-testid="button-reject-edit-draft">
                    <X className="w-3 h-3 mr-1" />
                    {t("reject")}
                  </Button>
                </div>
              </Card>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t bg-background">
            <div className="flex items-center gap-2 max-w-lg mx-auto">
              <Button
                size="icon"
                variant={isListening ? "destructive" : "outline"}
                onClick={isListening ? stopListening : startListening}
                disabled={isStreaming}
                data-testid="button-voice"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={t("askKrashuved")}
                onKeyDown={e => e.key === "Enter" && sendMessage(input)}
                disabled={isStreaming}
                className="flex-1"
                data-testid="input-chat"
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming}
                data-testid="button-send-chat"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            {isListening && (
              <p className="text-xs text-center text-primary mt-1 animate-pulse">{t("listening")}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
