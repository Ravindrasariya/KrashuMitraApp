import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sprout, Stethoscope, ShoppingBag, BookOpen, ArrowRight, MapPin, TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "wouter";
import { WeatherWidget } from "@/components/weather-widget";
import { useState, useEffect, useCallback } from "react";
import type { Banner, PriceCrop, PriceEntry } from "@shared/schema";

type BannerWithImage = Banner & { hasImage: boolean };

function BannerCarousel({ banners, language }: { banners: BannerWithImage[]; language: string }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const timer = setInterval(next, 25000);
    return () => clearInterval(timer);
  }, [banners.length, paused, next]);

  if (banners.length === 0) return null;

  const banner = banners[current];

  return (
    <div
      className="relative overflow-hidden rounded-xl md:rounded-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="banner-carousel"
    >
      <div className="relative min-h-[180px] md:min-h-[253px]">
        {banner.type === "text" ? (
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 py-8 md:px-12 md:py-10 min-h-[180px] md:min-h-[253px] flex flex-col justify-center">
            <h2 className="text-xl md:text-2xl font-bold leading-tight mb-2 text-foreground" data-testid="text-banner-heading">
              {language === "hi" ? banner.headingHi : banner.headingEn}
            </h2>
            {(banner.subHeadingHi || banner.subHeadingEn) && (
              <p className="text-base md:text-lg font-semibold text-emerald-700 dark:text-emerald-400 mb-1" data-testid="text-banner-subheading">
                {language === "hi" ? banner.subHeadingHi : banner.subHeadingEn}
              </p>
            )}
            {(banner.descriptionHi || banner.descriptionEn) && (
              <p className="text-sm md:text-base text-amber-700 dark:text-amber-400 md:max-w-xl" data-testid="text-banner-description">
                {language === "hi" ? banner.descriptionHi : banner.descriptionEn}
              </p>
            )}
          </div>
        ) : (
          <div className="relative min-h-[180px] md:min-h-[253px]">
            {banner.hasImage && (
              <img
                src={`/api/banners/${banner.id}/image`}
                alt=""
                className="w-full h-[180px] md:h-[220px] object-cover"
                data-testid="img-banner"
              />
            )}
            {(banner.captionHi || banner.captionEn) && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-6 py-4">
                <p className="text-white text-sm md:text-base font-medium" data-testid="text-banner-caption">
                  {language === "hi" ? banner.captionHi : banner.captionEn}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {banners.length > 1 && (
        <>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`w-2 h-2 rounded-full transition-colors ${idx === current ? "bg-primary" : "bg-muted-foreground/30"}`}
                data-testid={`button-banner-dot-${idx}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PriceTrendsSection({ language }: { language: string }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [selectedCropId, setSelectedCropId] = useState<string>("");

  const { data: crops = [] } = useQuery<PriceCrop[]>({
    queryKey: ["/api/price-crops"],
  });

  useEffect(() => {
    if (crops.length > 0 && !selectedCropId) {
      setSelectedCropId(String(crops[0].id));
    }
  }, [crops, selectedCropId]);

  const cropId = selectedCropId ? parseInt(selectedCropId) : null;
  const selectedCrop = crops.find(c => c.id === cropId);

  const { data: entries = [] } = useQuery<PriceEntry[]>({
    queryKey: ["/api/price-entries", cropId],
    enabled: !!cropId,
  });

  const { data: pollResults = { hold: 0, sale: 0 } } = useQuery<{ hold: number; sale: number }>({
    queryKey: ["/api/price-polls", cropId],
    enabled: !!cropId,
  });

  const { data: myVoteData } = useQuery<{ vote: string | null }>({
    queryKey: ["/api/price-polls", cropId, "my-vote"],
    enabled: !!cropId && isAuthenticated,
  });

  const voteMutation = useMutation({
    mutationFn: async (vote: string) => {
      const res = await apiRequest("POST", `/api/price-polls/${cropId}/vote`, { vote });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-polls", cropId] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-polls", cropId, "my-vote"] });
    },
  });

  if (crops.length === 0) return null;

  const stateMap: Record<string, { en: string; hi: string }> = {
    "andhra pradesh": { en: "AP", hi: "आंप्र" }, "arunachal pradesh": { en: "AR", hi: "अरुप्र" },
    "assam": { en: "AS", hi: "असम" }, "bihar": { en: "BR", hi: "बिहार" },
    "chhattisgarh": { en: "CG", hi: "छग" }, "goa": { en: "GA", hi: "गोवा" },
    "gujarat": { en: "GJ", hi: "गुज" }, "haryana": { en: "HR", hi: "हरि" },
    "himachal pradesh": { en: "HP", hi: "हिप्र" }, "jharkhand": { en: "JH", hi: "झार" },
    "karnataka": { en: "KA", hi: "कर्ना" }, "kerala": { en: "KL", hi: "केरल" },
    "madhya pradesh": { en: "MP", hi: "मप्र" }, "maharashtra": { en: "MH", hi: "महा" },
    "manipur": { en: "MN", hi: "मणि" }, "meghalaya": { en: "ML", hi: "मेघा" },
    "mizoram": { en: "MZ", hi: "मिज़ो" }, "nagaland": { en: "NL", hi: "नागा" },
    "odisha": { en: "OD", hi: "ओडि" }, "punjab": { en: "PB", hi: "पंजाब" },
    "rajasthan": { en: "RJ", hi: "राज" }, "sikkim": { en: "SK", hi: "सिक्किम" },
    "tamil nadu": { en: "TN", hi: "तमिना" }, "telangana": { en: "TG", hi: "तेलं" },
    "tripura": { en: "TR", hi: "त्रिपु" }, "uttar pradesh": { en: "UP", hi: "उप्र" },
    "uttarakhand": { en: "UK", hi: "उत्तरा" }, "west bengal": { en: "WB", hi: "पबं" },
    "delhi": { en: "DL", hi: "दिल्ली" }, "nct of delhi": { en: "DL", hi: "दिल्ली" },
    "nctof delhi": { en: "DL", hi: "दिल्ली" },
    "jammu and kashmir": { en: "JK", hi: "जम्मू" }, "ladakh": { en: "LA", hi: "लद्दाख" },
    "chandigarh": { en: "CH", hi: "चंडी" }, "elangana": { en: "TG", hi: "तेलं" },
  };

  const districtHindi: Record<string, string> = {
    "agra": "आगरा", "ahmedabad": "अहमदाबाद", "ajmer": "अजमेर", "aligarh": "अलीगढ़",
    "allahabad": "इलाहाबाद", "amaravati": "अमरावती", "amritsar": "अमृतसर", "aurangabad": "औरंगाबाद",
    "bangalore": "बेंगलुरु", "bareilly": "बरेली", "belgaum": "बेलगाम", "bhavnagar": "भावनगर",
    "bhopal": "भोपाल", "bhubaneswar": "भुवनेश्वर", "bikaner": "बीकानेर", "chandigarh": "चंडीगढ़",
    "chennai": "चेन्नई", "coimbatore": "कोयम्बटूर", "cuttack": "कटक", "dehradun": "देहरादून",
    "delhi": "दिल्ली", "dhanbad": "धनबाद", "etawah": "इटावा", "faridabad": "फरीदाबाद",
    "farukhabad": "फर्रुखाबाद", "farrukhabad": "फर्रुखाबाद", "fatehabad": "फतेहाबाद",
    "firozabad": "फ़िरोज़ाबाद", "ghaziabad": "गाज़ियाबाद", "gorakhpur": "गोरखपुर",
    "guntur": "गुंटूर", "guwahati": "गुवाहाटी", "gwalior": "ग्वालियर",
    "hathras": "हाथरस", "hubli": "हुबली", "hyderabad": "हैदराबाद",
    "indore": "इंदौर", "jabalpur": "जबलपुर", "jaipur": "जयपुर", "jalandhar": "जालंधर",
    "jammu": "जम्मू", "jamnagar": "जामनगर", "jamshedpur": "जमशेदपुर", "jhansi": "झाँसी",
    "jodhpur": "जोधपुर", "kanpur": "कानपुर", "khairagarh": "खैरागढ़", "kochi": "कोच्चि",
    "kolhapur": "कोल्हापुर", "kolkata": "कोलकाता", "kota": "कोटा",
    "lucknow": "लखनऊ", "ludhiana": "लुधियाना", "madurai": "मदुरै", "mainpuri": "मैनपुरी",
    "mangalore": "मंगलुरु", "mathura": "मथुरा", "meerut": "मेरठ", "moradabad": "मुरादाबाद",
    "mumbai": "मुंबई", "murshidabad": "मुर्शिदाबाद", "mysore": "मैसूर",
    "nagpur": "नागपुर", "nashik": "नासिक", "nellore": "नेल्लोर", "noida": "नोएडा",
    "panipat": "पानीपत", "patna": "पटना", "pondicherry": "पुडुचेरी", "pune": "पुणे",
    "raipur": "रायपुर", "rajkot": "राजकोट", "ranchi": "राँची", "rohtak": "रोहतक",
    "saharanpur": "सहारनपुर", "salem": "सेलम", "samsabad": "सम्साबाद",
    "sangli": "सांगली", "shimla": "शिमला", "sholapur": "शोलापुर", "solapur": "सोलापुर",
    "srinagar": "श्रीनगर", "surat": "सूरत", "thane": "ठाणे", "thiruvananthapuram": "तिरुवनंतपुरम",
    "tiruchirappalli": "तिरुचिरापल्ली", "tirupati": "तिरुपति", "udaipur": "उदयपुर",
    "ujjain": "उज्जैन", "vadodara": "वडोदरा", "varanasi": "वाराणसी",
    "vijayawada": "विजयवाड़ा", "visakhapatnam": "विशाखापत्तनम", "warangal": "वारंगल",
  };

  const getDistrictKey = (e: any) => e.district || e.market;
  const getDistrictLabel = (e: any) => {
    const dist = e.district || e.market;
    const isHi = language === "hi";
    const distDisplay = isHi ? (districtHindi[dist.toLowerCase().trim()] || dist) : dist;
    if (e.state) {
      const stInfo = stateMap[e.state.toLowerCase().trim()];
      const stAbbr = stInfo ? (isHi ? stInfo.hi : stInfo.en) : e.state.substring(0, 2).toUpperCase();
      return `${distDisplay}, ${stAbbr}`;
    }
    return distDisplay;
  };

  const dates = [...new Set(entries.map(e => e.date))].sort((a, b) => b.localeCompare(a));
  const districtKeys = [...new Set(entries.map(e => getDistrictKey(e)))].sort((a, b) => a.localeCompare(b));
  const districtLabels: Record<string, string> = {};
  for (const e of entries) {
    const key = getDistrictKey(e);
    if (!districtLabels[key]) districtLabels[key] = getDistrictLabel(e);
  }

  const getEntry = (date: string, districtKey: string) => {
    const matching = entries.filter(e => e.date === date && getDistrictKey(e) === districtKey);
    if (matching.length === 0) return null;
    if (matching.length === 1) return matching[0];
    const avgModal = Math.round(matching.reduce((sum, e) => sum + Number(e.modalPrice), 0) / matching.length);
    return { ...matching[0], modalPrice: String(avgModal) };
  };

  const getPriceChange = (date: string, districtKey: string) => {
    const dateIdx = dates.indexOf(date);
    if (dateIdx >= dates.length - 1) return 0;
    const current = getEntry(date, districtKey);
    const prev = getEntry(dates[dateIdx + 1], districtKey);
    if (!current || !prev) return 0;
    return Math.round(Number(current.modalPrice) - Number(prev.modalPrice));
  };

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" });
  };

  const totalVotes = pollResults.hold + pollResults.sale;
  const holdPct = totalVotes > 0 ? Math.round((pollResults.hold / totalVotes) * 100) : 0;
  const salePct = totalVotes > 0 ? 100 - holdPct : 0;

  return (
    <div className="px-4 md:px-12 pb-4">
      <div className="max-w-lg md:max-w-5xl mx-auto">
        <Card className="p-4 md:p-6 bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/50" data-testid="section-price-trends">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2" data-testid="text-price-trends-title">
              <TrendingUp className="w-5 h-5 text-primary" />
              {t("priceTrends")}
            </h2>
            <Select value={selectedCropId} onValueChange={setSelectedCropId}>
              <SelectTrigger className="w-[140px] md:w-auto bg-green-600 text-white border-green-600 hover:bg-green-700 [&>svg]:text-white font-bold text-base" data-testid="select-crop">
                <SelectValue placeholder={t("selectCrop")} />
              </SelectTrigger>
              <SelectContent>
                {crops.map(crop => (
                  <SelectItem key={crop.id} value={String(crop.id)} data-testid={`select-crop-${crop.id}`}>
                    {language === "hi" ? crop.nameHi : crop.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {entries.length > 0 ? (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm" data-testid="table-price-data">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-semibold text-muted-foreground">{t("district")}</th>
                    {dates.map(d => (
                      <th key={d} className="text-center py-2 px-2 font-semibold text-muted-foreground whitespace-nowrap">{formatDate(d)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {districtKeys.map(dk => (
                    <tr key={dk} className="border-b last:border-0">
                      <td className="py-2.5 px-2 font-medium whitespace-nowrap">{districtLabels[dk] || dk}</td>
                      {dates.map(d => {
                        const entry = getEntry(d, dk);
                        const change = getPriceChange(d, dk);
                        return (
                          <td key={d} className="text-center py-2.5 px-2">
                            {entry ? (
                              <div className="flex flex-col items-center">
                                <span className={`text-sm font-bold ${change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : ""}`}>
                                  ₹{Number(entry.modalPrice).toLocaleString()}
                                </span>
                                {change !== 0 && (
                                  <span className={`text-xs flex items-center ${change > 0 ? "text-green-600" : "text-red-600"}`}>
                                    {change > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                                    {change > 0 ? "+" : ""}{change}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-1 text-right">{t("perQuintal")}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-price-data">{t("noPriceData")}</p>
          )}

          {selectedCrop?.recommendation && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-4 p-3 rounded-lg bg-muted/50" data-testid="section-krashuved-expectation">
              <span className="text-sm font-semibold">{t("krashuvedExpectation")}:</span>
              {selectedCrop.recommendation === "hold" ? (
                <span className="px-4 py-1.5 rounded-full bg-green-600 text-white font-bold text-sm" data-testid="badge-recommendation-hold">
                  {t("hold")}
                </span>
              ) : (
                <span className="px-4 py-1.5 rounded-full bg-red-600 text-white font-bold text-sm" data-testid="badge-recommendation-sale">
                  {t("sale")}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground italic leading-snug" data-testid="text-price-disclaimer">
                {t("priceDisclaimer")}
              </span>
            </div>
          )}

          {cropId && (
            <div className="p-2 px-3 rounded-lg bg-muted/50" data-testid="section-farmer-poll">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold whitespace-nowrap">{t("farmerPoll")}</span>

                {isAuthenticated && (
                  <div className="flex rounded-full overflow-hidden border border-muted-foreground/20 shrink-0">
                    <button
                      className={`px-3 py-0.5 text-xs font-medium transition-colors ${myVoteData?.vote === "hold" ? "bg-green-600 text-white" : "bg-background text-green-600 hover:bg-green-50"}`}
                      onClick={() => voteMutation.mutate("hold")}
                      disabled={voteMutation.isPending}
                      data-testid="button-vote-hold"
                    >
                      {t("hold")}
                    </button>
                    <button
                      className={`px-3 py-0.5 text-xs font-medium transition-colors border-l border-muted-foreground/20 ${myVoteData?.vote === "sale" ? "bg-red-600 text-white" : "bg-background text-red-600 hover:bg-red-50"}`}
                      onClick={() => voteMutation.mutate("sale")}
                      disabled={voteMutation.isPending}
                      data-testid="button-vote-sale"
                    >
                      {t("sale")}
                    </button>
                  </div>
                )}

                {totalVotes > 0 ? (
                  <div className="flex-1 flex items-center gap-1.5" data-testid="poll-battery">
                    <div className="flex-1 flex rounded-full overflow-hidden h-4 bg-muted">
                      {holdPct > 0 && (
                        <div
                          className="bg-green-600 flex items-center justify-center transition-all duration-500"
                          style={{ width: `${holdPct}%`, minWidth: holdPct > 0 ? '28px' : '0' }}
                        >
                          <span className="text-[10px] font-bold text-white leading-none">{holdPct}%</span>
                        </div>
                      )}
                      {salePct > 0 && (
                        <div
                          className="bg-red-600 flex items-center justify-center transition-all duration-500"
                          style={{ width: `${salePct}%`, minWidth: salePct > 0 ? '28px' : '0' }}
                        >
                          <span className="text-[10px] font-bold text-white leading-none">{salePct}%</span>
                        </div>
                      )}
                    </div>
                    {totalVotes >= 20 && <span className="text-[10px] text-muted-foreground whitespace-nowrap">{totalVotes}</span>}
                  </div>
                ) : (
                  !isAuthenticated && (
                    <span className="text-xs text-muted-foreground">{t("yourOpinion")}</span>
                  )
                )}
              </div>
            </div>
          )}

        </Card>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { t, language } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();

  const { data: banners = [] } = useQuery<BannerWithImage[]>({
    queryKey: ["/api/banners"],
  });

  const { data: profile } = useQuery<{ village?: string; district?: string }>({
    queryKey: ["/api/farmer/profile"],
    enabled: isAuthenticated,
  });

  return (
    <div className="pb-20 md:pb-8" data-testid="page-home">
      <div className="px-4 md:px-12 pt-6 md:pt-8 pb-4">
        <div className="max-w-lg md:max-w-5xl mx-auto">
          <div className="flex items-start justify-between mb-4">
            <div>
              {isAuthenticated && user && (
                <div data-testid="text-welcome">
                  <p className="text-base md:text-lg text-muted-foreground">
                    {t("welcome")}, <span className="font-bold text-foreground">{user.firstName || user.email}</span>
                  </p>
                  {profile?.village && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5" data-testid="text-village">
                      <MapPin className="w-3.5 h-3.5" />
                      {profile.village}{profile.district ? `, ${profile.district}` : ""}
                    </p>
                  )}
                </div>
              )}
              {!isAuthenticated && !isLoading && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href="/auth">
                    <Button size="sm" data-testid="button-hero-login">
                      {t("getStarted")}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                  <span className="text-xs text-muted-foreground" data-testid="text-login-description">{t("loginDescription")}</span>
                </div>
              )}
            </div>
            <WeatherWidget />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-12 pb-6">
        <div className="max-w-lg md:max-w-5xl mx-auto">
          {banners.length > 0 ? (
            <BannerCarousel banners={banners} language={language} />
          ) : (
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background rounded-xl md:rounded-2xl px-6 py-8 md:px-12 md:py-10 min-h-[180px] md:min-h-[253px] flex flex-col justify-center">
              <h2 className="text-2xl md:text-3xl font-bold leading-tight mb-2" data-testid="text-hero-title">
                {t("heroTitle")}
              </h2>
              <p className="text-sm md:text-base text-muted-foreground mb-5 md:max-w-xl" data-testid="text-hero-subtitle">
                {t("heroSubtitle")}
              </p>
            </div>
          )}
        </div>
      </div>

      <PriceTrendsSection language={language} />

      <div className="px-4 md:px-8 py-6 max-w-lg md:max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Link href="/farm-management">
            <Card className="p-4 md:p-5 hover-elevate cursor-pointer h-full" data-testid="card-farm-management">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <Sprout className="w-5 h-5 md:w-6 md:h-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-sm md:text-base mb-1">{t("farmManagement")}</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {t("myCropCards")}
              </p>
            </Card>
          </Link>

          <Link href="/digital-clinic">
            <Card className="p-4 md:p-5 hover-elevate cursor-pointer h-full" data-testid="card-digital-clinic">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-3">
                <Stethoscope className="w-5 h-5 md:w-6 md:h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-sm md:text-base mb-1">{t("digitalClinic")}</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {t("clinicServices")}
              </p>
            </Card>
          </Link>

          <Link href="/marketplace">
            <Card className="p-4 md:p-5 hover-elevate cursor-pointer h-full" data-testid="card-marketplace">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-3">
                <ShoppingBag className="w-5 h-5 md:w-6 md:h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="font-semibold text-sm md:text-base mb-1">{t("marketplace")}</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {t("marketplaceDesc")}
              </p>
            </Card>
          </Link>

          <Link href="/farm-khata">
            <Card className="p-4 md:p-5 hover-elevate cursor-pointer h-full" data-testid="card-farm-khata">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-semibold text-sm md:text-base mb-1">{t("farmKhata")}</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {t("farmKhataDesc")}
              </p>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
