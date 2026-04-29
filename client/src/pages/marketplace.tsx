import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Plus, MapPin, Phone, Loader2, ShoppingBag, Camera, Trash2, ArrowUpDown, X, Sprout, Leaf, ChevronLeft, ChevronRight, ImageIcon, Star, Check, ChevronsUpDown, Pencil, Maximize2, Package, Fan, Share2, Mail, Link2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { cn } from "@/lib/utils";
import { PhotoLightbox } from "@/components/photo-lightbox";
import {
  MARKETPLACE_ONION_SEED_TYPES,
  MARKETPLACE_ONION_SEED_VARIETIES,
  MARKETPLACE_ONION_SEED_BRANDS,
  MARKETPLACE_BAG_COMMODITY_TYPES,
  MARKETPLACE_BAG_MATERIAL_TYPES,
  MARKETPLACE_BAG_COLORS,
  MARKETPLACE_BAG_GSM_OPTIONS,
  MARKETPLACE_FAN_BRANDS,
  MARKETPLACE_FAN_COLORS,
  type MarketplaceListing,
} from "@shared/schema";

type ListingNoPhoto = Omit<MarketplaceListing, "photoData"> & {
  photoCount: number;
  avgRating: number;
  ratingCount: number;
  // Server still computes and returns this; we keep the field so the API
  // response type stays accurate and so the server can continue using it
  // for its own ETag / cache-key purposes. The client no longer appends
  // it to share URLs — see composeShareInfo and the Task #76 doc note in
  // replit.md for why.
  shareVersion?: string;
};

const POTATO_VARIETIES = ["CS3", "CS1", "Torus", "Pukhraj", "Jyoti", "Lakar", "Others"];
const POTATO_BRANDS = ["Merino", "Technico", "Uttkal", "Jain", "Jalandhar", "Merath"];
const MAX_PHOTOS = 3;

// Onion-seed dropdown values come from shared/schema.ts so the seller form
// here and the POST /api/marketplace allow-list cannot drift apart.
const ONION_SEED_TYPES: string[] = [...MARKETPLACE_ONION_SEED_TYPES];
const ONION_SEED_VARIETIES: string[] = [...MARKETPLACE_ONION_SEED_VARIETIES];
const ONION_SEED_BRANDS: string[] = [...MARKETPLACE_ONION_SEED_BRANDS];

const SOYABEAN_DURATIONS = ["Long", "Short"] as const;

const BAG_COMMODITY_TYPES: string[] = [...MARKETPLACE_BAG_COMMODITY_TYPES];
const BAG_MATERIAL_TYPES: string[] = [...MARKETPLACE_BAG_MATERIAL_TYPES];
const BAG_COLORS: string[] = [...MARKETPLACE_BAG_COLORS];
const BAG_GSM_OPTIONS = MARKETPLACE_BAG_GSM_OPTIONS;
const FAN_BRANDS: string[] = [...MARKETPLACE_FAN_BRANDS];
const FAN_COLORS: string[] = [...MARKETPLACE_FAN_COLORS];

const HINDI_NAMES: Record<string, string> = {
  CS3: "सीएस3", CS1: "सीएस1", Torus: "टोरस", Pukhraj: "पुखराज",
  Jyoti: "ज्योति", Lakar: "लकड़", Others: "अन्य",
  Merino: "मेरिनो", Technico: "टेक्निको", Uttkal: "उत्कल",
  Jain: "जैन", Jalandhar: "जालंधर", Merath: "मेरठ",
  Nafed: "नाफेड", Nasik: "नासिक",
  Agriwell: "एग्रीवेल", Kalash: "कलश",
  "Nasik Fursungi": "नासिक फुरसुंगी",
  "Nasik Red (N-53)": "नासिक रेड (एन-53)",
  "NHRDF Red / L-28": "एनएचआरडीएफ रेड / एल-28",
  Deepak: "दीपक",
  "Divya Seeds": "दिव्य सीड्स",
  "East-West Seed": "ईस्ट-वेस्ट सीड",
  Ellora: "एलोरा",
  "Farmson Biotech": "फार्मसन बायोटेक",
  "Indo-American Hybrid Seeds (IAHS)": "इंडो-अमेरिकन हाइब्रिड सीड्स (IAHS)",
  "Jindal Seeds": "जिंदल सीड्स",
  "Kalash Seeds": "कलश सीड्स",
  "Malav Seeds": "मालव सीड्स",
  Mukund: "मुकुंद",
  "Namdhari Seeds": "नामधारी सीड्स",
  Prashant: "प्रशांत",
  "Rudraksh Seeds": "रुद्राक्ष सीड्स",
  "Sarpan Hybrid Seeds": "सर्पन हाइब्रिड सीड्स",
  "Seminis (Bayer)": "सेमिनिस (बेयर)",
  Syngenta: "सिंजेंटा",
  "Urja Seeds": "ऊर्जा सीड्स",
};

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  hn,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  hn: (v: string) => string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          data-testid={testId}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? hn(value) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} data-testid={`${testId}-search`} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  data-testid={`${testId}-option-${opt}`}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt ? "opacity-100" : "opacity-0")} />
                  {hn(opt)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function StarDisplay({ avg, count, size = "sm" }: { avg: number; count: number; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const textClass = size === "sm" ? "text-[10px]" : "text-xs";
  return (
    <div className="flex items-center gap-0.5" data-testid="star-display">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`${sizeClass} ${i <= Math.round(avg) ? "fill-yellow-400 text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
        />
      ))}
      {count > 0 && <span className={`${textClass} text-muted-foreground ml-0.5`}>({count})</span>}
    </div>
  );
}

function InteractiveStars({ currentRating, onRate, disabled }: { currentRating: number; onRate: (stars: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5" data-testid="interactive-stars">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          disabled={disabled}
          className="p-0.5 disabled:opacity-50"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onRate(i)}
          data-testid={`star-button-${i}`}
        >
          <Star
            className={`w-6 h-6 transition-colors ${
              i <= (hover || currentRating)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300 dark:text-gray-600"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

interface ShareInfo {
  title: string;
  text: string;
  url: string;
  emailSubject: string;
}

function ShareButton({
  shareInfo,
  variant,
  testId,
  listingId,
}: {
  shareInfo: ShareInfo;
  variant: "card" | "detail";
  testId: string;
  listingId?: number;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const fullText = `${shareInfo.text}\n${shareInfo.url}`;

  const tryNativeShare = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: shareInfo.title,
          text: shareInfo.text,
          url: shareInfo.url,
        });
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return true;
        return false;
      }
    }
    return false;
  };

  const copyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareInfo.url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = shareInfo.url;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand copy failed");
      }
      toast({ title: t("shareLinkCopied") });
    } catch {
      toast({ title: t("shareCopyFailed"), variant: "destructive" });
    }
  };

  const openWhatsapp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(fullText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openEmail = () => {
    const subject = encodeURIComponent(shareInfo.emailSubject);
    const body = encodeURIComponent(fullText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleShareClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (listingId) {
      // Fire-and-forget: ask the server to pre-render and persist the share
      // preview so WhatsApp's bot — which scrapes the URL a few seconds
      // after the user picks a contact and hits send — finds the composed
      // JPEG already on disk and returns it as a static byte stream
      // instead of triggering a cold ~250 ms render. Failures are ignored;
      // the share-image GET endpoint still composes on demand as a safety
      // net for legacy listings whose preview was never pre-rendered.
      fetch(`/api/marketplace/${listingId}/prewarm-share-image`, {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => {});
    }
    const ok = await tryNativeShare();
    if (!ok) setPopoverOpen(true);
  };

  const triggerClass =
    variant === "card"
      ? "h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center"
      : "h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center border";

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("shareListing")}
          title={t("shareListing")}
          className={triggerClass}
          onClick={handleShareClick}
          data-testid={testId}
        >
          <Share2 className={variant === "card" ? "w-3.5 h-3.5 text-primary" : "w-4 h-4 text-primary"} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-48 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent"
          onClick={() => { setPopoverOpen(false); openWhatsapp(); }}
          data-testid={`${testId}-whatsapp`}
        >
          <SiWhatsapp className="w-4 h-4 text-[#25D366]" />
          <span>{t("shareViaWhatsapp")}</span>
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent"
          onClick={() => { setPopoverOpen(false); openEmail(); }}
          data-testid={`${testId}-email`}
        >
          <Mail className="w-4 h-4 text-primary" />
          <span>{t("shareViaEmail")}</span>
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent"
          onClick={async () => { setPopoverOpen(false); await copyLink(); }}
          data-testid={`${testId}-copy`}
        >
          <Link2 className="w-4 h-4 text-primary" />
          <span>{t("shareCopyLink")}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

export default function MarketplacePage() {
  const { t, language } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editingListingId, setEditingListingId] = useState<number | null>(null);
  const [editPhotosLoading, setEditPhotosLoading] = useState(false);
  const [photosDirty, setPhotosDirty] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [uploadedPhotos, setUploadedPhotos] = useState<{ preview: string; base64: string; mime: string }[]>([]);
  const [quantityBigha, setQuantityBigha] = useState("");
  const [availableDays, setAvailableDays] = useState("");
  const [onionType, setOnionType] = useState("");
  const [quantityBags, setQuantityBags] = useState("");
  const [potatoVariety, setPotatoVariety] = useState("");
  const [potatoBrand, setPotatoBrand] = useState("");
  const [onionSeedType, setOnionSeedType] = useState("");
  const [onionSeedVariety, setOnionSeedVariety] = useState("");
  const [onionSeedBrand, setOnionSeedBrand] = useState("");
  const [onionSeedPricePerKg, setOnionSeedPricePerKg] = useState("");
  const [soyabeanDuration, setSoyabeanDuration] = useState("");
  const [soyabeanVariety, setSoyabeanVariety] = useState("");
  const [soyabeanPricePerQuintal, setSoyabeanPricePerQuintal] = useState("");
  const [bagCommodityType, setBagCommodityType] = useState<string[]>([]);
  const [bagCommodityOther, setBagCommodityOther] = useState("");
  const [bagMaterialType, setBagMaterialType] = useState("");
  const [bagDimension, setBagDimension] = useState("");
  const [bagGsm, setBagGsm] = useState<string[]>([]);
  const [bagColor, setBagColor] = useState("none");
  const [bagMinQuantity, setBagMinQuantity] = useState("");
  const [bagPricePerBag, setBagPricePerBag] = useState("");
  const [fanBrand, setFanBrand] = useState("none");
  const [fanBrandOther, setFanBrandOther] = useState("");
  const [fanColor, setFanColor] = useState("none");
  const [fanColorOther, setFanColorOther] = useState("");
  const [fanWattage, setFanWattage] = useState("");
  const [fanVoltage, setFanVoltage] = useState("");
  const [fanAirflowCmh, setFanAirflowCmh] = useState("");
  const [fanBladeLengthMm, setFanBladeLengthMm] = useState("");
  const [fanSpeedRpm, setFanSpeedRpm] = useState("");
  const [fanBladeMaterial, setFanBladeMaterial] = useState("");
  const [fanBladeCount, setFanBladeCount] = useState("");
  const [fanCountryOfOrigin, setFanCountryOfOrigin] = useState("");
  const [fanWarrantyYears, setFanWarrantyYears] = useState("");
  const [fanDimensions, setFanDimensions] = useState("");
  const [fanPricePerPiece, setFanPricePerPiece] = useState("");
  // Task #84: Others-category form state. Mirrors the 13 nullable columns
  // on `marketplace_listings` for the generic "Others" category. Only
  // othersProductName + ≥1 photo are mandatory; everything else is empty
  // string by default and serialised as null when blank on submit. The two
  // enums use "none" sentinel like other selects so SelectItem never gets
  // an empty value (which throws).
  const [othersProductName, setOthersProductName] = useState("");
  const [othersBrand, setOthersBrand] = useState("");
  const [othersPrice, setOthersPrice] = useState("");
  const [othersMaterials, setOthersMaterials] = useState("");
  // Sentinel `"unset"` distinguishes "no selection" from real enum values.
  // (Important for return policy because `"none"` IS itself a valid stored
  // option meaning "No return policy", so we can't reuse it as the sentinel.)
  const [othersCondition, setOthersCondition] = useState("unset");
  const [othersWarrantyYears, setOthersWarrantyYears] = useState("");
  const [othersDimensions, setOthersDimensions] = useState("");
  const [othersReturnPolicy, setOthersReturnPolicy] = useState("unset");
  const [othersExtra1, setOthersExtra1] = useState("");
  const [othersExtra2, setOthersExtra2] = useState("");
  const [othersExtra3, setOthersExtra3] = useState("");
  const [othersExtra4, setOthersExtra4] = useState("");
  const [othersExtra5, setOthersExtra5] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"latest" | "nearest" | "oldest">("latest");
  const [sortOpen, setSortOpen] = useState(false);
  const [viewerCoords, setViewerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [contactInfo, setContactInfo] = useState<{ [id: number]: { name: string; phone: string; farmerCode: string; sellerAvgRating?: number; sellerRatingCount?: number } }>({});
  const [contactLoading, setContactLoading] = useState<number | null>(null);
  const [detailListing, setDetailListing] = useState<ListingNoPhoto | null>(null);
  const [pendingListingId, setPendingListingId] = useState<number | null>(null);
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxListing, setLightboxListing] = useState<ListingNoPhoto | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [cardPhotoIndex, setCardPhotoIndex] = useState<Record<number, number>>({});
  const cardSwipeRef = useRef<Map<number, { startX: number; startY: number; swiped: boolean }>>(new Map());
  const notFoundToastShownRef = useRef<Set<number>>(new Set());

  const advanceCardPhoto = (id: number, total: number, dir: 1 | -1) => {
    setCardPhotoIndex(s => {
      const cur = s[id] ?? 0;
      return { ...s, [id]: (cur + dir + total) % total };
    });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: listings = [], isLoading } = useQuery<ListingNoPhoto[]>({
    queryKey: ["/api/marketplace", filterCategory],
    queryFn: async () => {
      const url = filterCategory !== "all" ? `/api/marketplace?category=${filterCategory}` : "/api/marketplace";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  useEffect(() => {
    setCardPhotoIndex({});
  }, [listings]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/marketplace", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("listingCreated") });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      resetForm();
      setAddOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/marketplace/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("listingUpdated") });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      resetForm();
      setEditingListingId(null);
      setAddOpen(false);
      setDetailListing(null);
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/marketplace/${id}`);
    },
    onSuccess: () => {
      toast({ title: t("listingDeleted") });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      setDetailListing(null);
    },
  });

  const detailRatingQuery = useQuery<{ avg: number; count: number; myRating: number | null }>({
    queryKey: ["/api/marketplace", detailListing?.id, "rating"],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/${detailListing!.id}/rating`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!detailListing,
  });

  const rateMutation = useMutation({
    mutationFn: async ({ listingId, stars }: { listingId: number; stars: number }) => {
      const res = await apiRequest("POST", `/api/marketplace/${listingId}/rate`, { stars });
      return res.json();
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace", variables.listingId, "rating"] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setCategory("");
    setUploadedPhotos([]);
    setPhotosDirty(false);
    setQuantityBigha("");
    setAvailableDays("");
    setOnionType("");
    setQuantityBags("");
    setPotatoVariety("");
    setPotatoBrand("");
    setOnionSeedType("");
    setOnionSeedVariety("");
    setOnionSeedBrand("");
    setOnionSeedPricePerKg("");
    setSoyabeanDuration("");
    setSoyabeanVariety("");
    setSoyabeanPricePerQuintal("");
    setBagCommodityType([]);
    setBagCommodityOther("");
    setBagMaterialType("");
    setBagDimension("");
    setBagGsm([]);
    setBagColor("none");
    setBagMinQuantity("");
    setBagPricePerBag("");
    setFanBrand("none");
    setFanBrandOther("");
    setFanColor("none");
    setFanColorOther("");
    setFanWattage("");
    setFanVoltage("");
    setFanAirflowCmh("");
    setFanBladeLengthMm("");
    setFanSpeedRpm("");
    setFanBladeMaterial("");
    setFanBladeCount("");
    setFanCountryOfOrigin("");
    setFanWarrantyYears("");
    setFanDimensions("");
    setFanPricePerPiece("");
    setOthersProductName("");
    setOthersBrand("");
    setOthersPrice("");
    setOthersMaterials("");
    setOthersCondition("unset");
    setOthersWarrantyYears("");
    setOthersDimensions("");
    setOthersReturnPolicy("unset");
    setOthersExtra1("");
    setOthersExtra2("");
    setOthersExtra3("");
    setOthersExtra4("");
    setOthersExtra5("");
    setAdditionalNotes("");
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadedPhotos.length >= MAX_PHOTOS) {
      toast({ title: t("maxPhotosReached"), variant: "destructive" });
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadedPhotos(prev => [...prev, {
        preview: result,
        base64: result.split(",")[1],
        mime: file.type,
      }]);
      setPhotosDirty(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setUploadedPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotosDirty(true);
  }

  function handleSubmit() {
    if (!category) return;
    const data: any = { category };
    // For create, always include photos. For edit, only include when the user
    // actually touched the photo widget — this prevents accidentally wiping
    // photos when the prefetch failed or the user is doing a metadata-only edit.
    if (editingListingId == null || photosDirty) {
      data.photos = uploadedPhotos.map(p => ({ base64: p.base64, mime: p.mime }));
    }
    if (category === "onion_seedling") {
      data.quantityBigha = quantityBigha;
      data.availableAfterDays = availableDays;
      data.onionType = onionType;
    } else if (category === "potato_seed") {
      data.quantityBags = quantityBags;
      data.potatoVariety = potatoVariety;
      data.potatoBrand = potatoBrand;
    } else if (category === "onion_seed") {
      if (!onionSeedVariety) {
        toast({ title: t("onionSeedVariety"), variant: "destructive" });
        return;
      }
      data.onionSeedType = onionSeedType || null;
      data.onionSeedVariety = onionSeedVariety;
      data.onionSeedBrand = onionSeedBrand && onionSeedBrand !== "none" ? onionSeedBrand : null;
      data.onionSeedPricePerKg = onionSeedPricePerKg ? parseInt(onionSeedPricePerKg, 10) : null;
    } else if (category === "soyabean_seed") {
      if (!soyabeanVariety.trim()) {
        toast({ title: t("soyabeanVariety"), variant: "destructive" });
        return;
      }
      data.soyabeanSeedDuration = soyabeanDuration || null;
      data.soyabeanSeedVariety = soyabeanVariety.trim();
      data.soyabeanSeedPricePerQuintal = soyabeanPricePerQuintal ? parseInt(soyabeanPricePerQuintal, 10) : null;
    } else if (category === "bardan_bag") {
      if (!Array.isArray(bagCommodityType) || bagCommodityType.length === 0) {
        toast({ title: t("bagCommodityType"), variant: "destructive" });
        return;
      }
      const otherTrim = bagCommodityOther.trim();
      if (bagCommodityType.includes("Others") && !otherTrim) {
        toast({ title: t("bagCommodityOtherLabel"), variant: "destructive" });
        return;
      }
      if (!bagMaterialType) {
        toast({ title: t("bagMaterialType"), variant: "destructive" });
        return;
      }
      if (!Array.isArray(bagGsm) || bagGsm.length === 0) {
        toast({ title: t("bagGsm"), variant: "destructive" });
        return;
      }
      const gsmSet = new Set<number>();
      for (const v of bagGsm) {
        const s = String(v).trim();
        if (!/^\d+$/.test(s)) {
          toast({ title: t("bagGsm"), variant: "destructive" });
          return;
        }
        const n = parseInt(s, 10);
        if (!BAG_GSM_OPTIONS.includes(n as typeof BAG_GSM_OPTIONS[number])) {
          toast({ title: t("bagGsm"), variant: "destructive" });
          return;
        }
        gsmSet.add(n);
      }
      const gsmArr = Array.from(gsmSet).sort((a, b) => a - b);
      const priceStr = bagPricePerBag.trim();
      if (!/^\d+$/.test(priceStr)) {
        toast({ title: t("pricePerBag"), variant: "destructive" });
        return;
      }
      const priceNum = parseInt(priceStr, 10);
      if (priceNum < 1 || priceNum > 999999) {
        toast({ title: t("pricePerBag"), variant: "destructive" });
        return;
      }
      let minQtyNum: number | null = null;
      const minQtyStr = bagMinQuantity.trim();
      if (minQtyStr) {
        if (!/^\d+$/.test(minQtyStr)) {
          toast({ title: t("bagMinQuantity"), variant: "destructive" });
          return;
        }
        minQtyNum = parseInt(minQtyStr, 10);
        if (minQtyNum < 0 || minQtyNum > 999999) {
          toast({ title: t("bagMinQuantity"), variant: "destructive" });
          return;
        }
      }
      data.bagCommodityType = bagCommodityType;
      data.bagCommodityOther = bagCommodityType.includes("Others") ? otherTrim.slice(0, 40) : null;
      data.bagMaterialType = bagMaterialType;
      data.bagDimension = bagDimension.trim() || null;
      data.bagGsm = gsmArr;
      data.bagColor = bagColor && bagColor !== "none" ? bagColor : null;
      data.bagMinQuantity = minQtyNum;
      data.bagPricePerBag = priceNum;
    } else if (category === "exhaust_fan") {
      const intReq = (raw: string, min: number, max: number, label: string): number | null => {
        const s = raw.trim();
        if (!s || !/^\d+$/.test(s)) {
          toast({ title: label, variant: "destructive" });
          return null;
        }
        const n = parseInt(s, 10);
        if (n < min || n > max) {
          toast({ title: label, variant: "destructive" });
          return null;
        }
        return n;
      };
      const brandSelected = fanBrand && fanBrand !== "none" ? fanBrand : "";
      if (!brandSelected) {
        toast({ title: t("fanBrand"), variant: "destructive" });
        return;
      }
      if (brandSelected === "Others") {
        const otherTrim = fanBrandOther.trim();
        if (!otherTrim) {
          toast({ title: t("fanBrandOtherLabel"), variant: "destructive" });
          return;
        }
        data.fanBrand = "Others";
        data.fanBrandOther = otherTrim.slice(0, 40);
      } else {
        data.fanBrand = brandSelected;
        data.fanBrandOther = null;
      }
      const colorSelected = fanColor && fanColor !== "none" ? fanColor : "";
      if (!colorSelected) {
        toast({ title: t("fanColor"), variant: "destructive" });
        return;
      }
      if (colorSelected === "Others") {
        const otherTrim = fanColorOther.trim();
        if (!otherTrim) {
          toast({ title: t("fanColorOtherLabel"), variant: "destructive" });
          return;
        }
        data.fanColor = "Others";
        data.fanColorOther = otherTrim.slice(0, 40);
      } else {
        data.fanColor = colorSelected;
        data.fanColorOther = null;
      }
      const numFields: { val: string; min: number; max: number; key: string; label: string }[] = [
        { val: fanWattage, min: 1, max: 10000, key: "fanWattage", label: t("fanWattage") },
        { val: fanVoltage, min: 1, max: 1000, key: "fanVoltage", label: t("fanVoltage") },
        { val: fanAirflowCmh, min: 1, max: 999999, key: "fanAirflowCmh", label: t("fanAirflowCmh") },
        { val: fanBladeLengthMm, min: 1, max: 10000, key: "fanBladeLengthMm", label: t("fanBladeLength") },
        { val: fanSpeedRpm, min: 1, max: 10000, key: "fanSpeedRpm", label: t("fanSpeedRpm") },
        { val: fanBladeCount, min: 1, max: 50, key: "fanBladeCount", label: t("fanBladeCount") },
        { val: fanWarrantyYears, min: 0, max: 50, key: "fanWarrantyYears", label: t("fanWarrantyYears") },
        { val: fanPricePerPiece, min: 1, max: 999999, key: "fanPricePerPiece", label: t("pricePerPiece") },
      ];
      for (const f of numFields) {
        const r = intReq(f.val, f.min, f.max, f.label);
        if (r === null) return;
        data[f.key] = r;
      }
      const bladeMat = fanBladeMaterial.trim();
      if (!bladeMat) { toast({ title: t("fanBladeMaterial"), variant: "destructive" }); return; }
      data.fanBladeMaterial = bladeMat.slice(0, 40);
      const country = fanCountryOfOrigin.trim();
      if (!country) { toast({ title: t("fanCountryOfOrigin"), variant: "destructive" }); return; }
      data.fanCountryOfOrigin = country.slice(0, 40);
      const dim = fanDimensions.trim();
      if (!dim) { toast({ title: t("fanDimensions"), variant: "destructive" }); return; }
      data.fanDimensions = dim.slice(0, 80);
    } else if (category === "others") {
      // Task #84: Others. Only product name + ≥1 photo are required.
      // Every other field is optional and serialised as null when blank.
      const name = othersProductName.trim();
      if (!name) {
        toast({ title: t("othersProductName"), variant: "destructive" });
        return;
      }
      // Photo guard: at least 1 required when creating, OR when editing
      // and the user has touched the photos and now has zero. When editing
      // without touching, server preserves photos and skips the check.
      if (editingListingId == null && uploadedPhotos.length === 0) {
        toast({ title: t("othersPhotoRequired"), variant: "destructive" });
        return;
      }
      if (editingListingId != null && photosDirty && uploadedPhotos.length === 0) {
        toast({ title: t("othersPhotoRequired"), variant: "destructive" });
        return;
      }
      data.othersProductName = name.slice(0, 80);
      const trimOpt = (raw: string, max: number): string | null => {
        const s = raw.trim();
        return s ? s.slice(0, max) : null;
      };
      data.othersBrand = trimOpt(othersBrand, 40);
      data.othersMaterials = trimOpt(othersMaterials, 60);
      data.othersDimensions = trimOpt(othersDimensions, 60);
      data.othersExtra1 = trimOpt(othersExtra1, 60);
      data.othersExtra2 = trimOpt(othersExtra2, 60);
      data.othersExtra3 = trimOpt(othersExtra3, 60);
      data.othersExtra4 = trimOpt(othersExtra4, 60);
      data.othersExtra5 = trimOpt(othersExtra5, 60);
      const priceStr = othersPrice.trim();
      if (priceStr) {
        if (!/^\d+$/.test(priceStr)) { toast({ title: t("othersPrice"), variant: "destructive" }); return; }
        const n = parseInt(priceStr, 10);
        if (n < 1 || n > 999999) { toast({ title: t("othersPrice"), variant: "destructive" }); return; }
        data.othersPrice = n;
      } else {
        data.othersPrice = null;
      }
      const warStr = othersWarrantyYears.trim();
      if (warStr) {
        if (!/^\d+$/.test(warStr)) { toast({ title: t("othersWarrantyYears"), variant: "destructive" }); return; }
        const n = parseInt(warStr, 10);
        if (n < 0 || n > 50) { toast({ title: t("othersWarrantyYears"), variant: "destructive" }); return; }
        data.othersWarrantyYears = n;
      } else {
        data.othersWarrantyYears = null;
      }
      // Sentinel `"unset"` -> null. `"none"` is a real return-policy value
      // ("No return policy") and must be persisted as "none", NOT coerced.
      data.othersCondition = othersCondition && othersCondition !== "unset" ? othersCondition : null;
      data.othersReturnPolicy = othersReturnPolicy && othersReturnPolicy !== "unset" ? othersReturnPolicy : null;
    }
    // Task #79: optional freehand notes apply to ALL categories. Trim and
    // coerce empty -> null so an unset field round-trips cleanly through the
    // Zod schema (.nullable().optional()) and so editing doesn't leave a
    // dangling whitespace string in the DB. Cap to 50 chars defensively in
    // case the input's maxLength is bypassed (also enforced server-side).
    const notes = additionalNotes.trim().slice(0, 50);
    data.additionalNotes = notes || null;
    if (editingListingId != null) {
      updateMutation.mutate({ id: editingListingId, data });
    } else {
      createMutation.mutate(data);
    }
  }

  async function openEditDialog(listing: ListingNoPhoto) {
    resetForm();
    setCategory(listing.category);
    // Task #79: notes apply to every category, so prefill before the
    // category-specific branches.
    setAdditionalNotes(listing.additionalNotes || "");
    if (listing.category === "onion_seedling") {
      setQuantityBigha(listing.quantityBigha || "");
      setAvailableDays(listing.availableAfterDays != null ? String(listing.availableAfterDays) : "");
      setOnionType(listing.onionType || "");
    } else if (listing.category === "potato_seed") {
      setQuantityBags(listing.quantityBags || "");
      setPotatoVariety(listing.potatoVariety || "");
      setPotatoBrand(listing.potatoBrand || "");
    } else if (listing.category === "onion_seed") {
      setOnionSeedType(listing.onionSeedType || "");
      setOnionSeedVariety(listing.onionSeedVariety || "");
      setOnionSeedBrand(listing.onionSeedBrand || "none");
      setOnionSeedPricePerKg(listing.onionSeedPricePerKg != null ? String(listing.onionSeedPricePerKg) : "");
    } else if (listing.category === "soyabean_seed") {
      setSoyabeanDuration(listing.soyabeanSeedDuration || "");
      setSoyabeanVariety(listing.soyabeanSeedVariety || "");
      setSoyabeanPricePerQuintal(listing.soyabeanSeedPricePerQuintal != null ? String(listing.soyabeanSeedPricePerQuintal) : "");
    } else if (listing.category === "bardan_bag") {
      setBagCommodityType(Array.isArray(listing.bagCommodityType) ? listing.bagCommodityType : []);
      setBagCommodityOther(listing.bagCommodityOther || "");
      setBagMaterialType(listing.bagMaterialType || "");
      setBagDimension(listing.bagDimension || "");
      setBagGsm(Array.isArray(listing.bagGsm) ? listing.bagGsm.map(String) : []);
      setBagColor(listing.bagColor || "none");
      setBagMinQuantity(listing.bagMinQuantity != null ? String(listing.bagMinQuantity) : "");
      setBagPricePerBag(listing.bagPricePerBag != null ? String(listing.bagPricePerBag) : "");
    } else if (listing.category === "exhaust_fan") {
      setFanBrand(listing.fanBrand || "none");
      setFanBrandOther(listing.fanBrandOther || "");
      setFanColor(listing.fanColor || "none");
      setFanColorOther(listing.fanColorOther || "");
      setFanWattage(listing.fanWattage != null ? String(listing.fanWattage) : "");
      setFanVoltage(listing.fanVoltage != null ? String(listing.fanVoltage) : "");
      setFanAirflowCmh(listing.fanAirflowCmh != null ? String(listing.fanAirflowCmh) : "");
      setFanBladeLengthMm(listing.fanBladeLengthMm != null ? String(listing.fanBladeLengthMm) : "");
      setFanSpeedRpm(listing.fanSpeedRpm != null ? String(listing.fanSpeedRpm) : "");
      setFanBladeMaterial(listing.fanBladeMaterial || "");
      setFanBladeCount(listing.fanBladeCount != null ? String(listing.fanBladeCount) : "");
      setFanCountryOfOrigin(listing.fanCountryOfOrigin || "");
      setFanWarrantyYears(listing.fanWarrantyYears != null ? String(listing.fanWarrantyYears) : "");
      setFanDimensions(listing.fanDimensions || "");
      setFanPricePerPiece(listing.fanPricePerPiece != null ? String(listing.fanPricePerPiece) : "");
    } else if (listing.category === "others") {
      setOthersProductName(listing.othersProductName || "");
      setOthersBrand(listing.othersBrand || "");
      setOthersPrice(listing.othersPrice != null ? String(listing.othersPrice) : "");
      setOthersMaterials(listing.othersMaterials || "");
      setOthersCondition(listing.othersCondition || "unset");
      setOthersWarrantyYears(listing.othersWarrantyYears != null ? String(listing.othersWarrantyYears) : "");
      setOthersDimensions(listing.othersDimensions || "");
      setOthersReturnPolicy(listing.othersReturnPolicy || "unset");
      setOthersExtra1(listing.othersExtra1 || "");
      setOthersExtra2(listing.othersExtra2 || "");
      setOthersExtra3(listing.othersExtra3 || "");
      setOthersExtra4(listing.othersExtra4 || "");
      setOthersExtra5(listing.othersExtra5 || "");
    }
    setEditingListingId(listing.id);
    setPhotosDirty(false);
    setAddOpen(true);

    const totalPhotos = listing.photoCount || (listing.photoMime ? 1 : 0);
    if (totalPhotos > 0) {
      setEditPhotosLoading(true);
      try {
        const fetched = await Promise.all(
          Array.from({ length: Math.min(totalPhotos, MAX_PHOTOS) }, async (_, i) => {
            const res = await fetch(`/api/marketplace/${listing.id}/image?index=${i}`, { credentials: "include" });
            if (!res.ok) throw new Error("photo-fetch-failed");
            const blob = await res.blob();
            const dataUrl: string = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            return {
              preview: dataUrl,
              base64: dataUrl.split(",")[1] || "",
              mime: blob.type || "image/jpeg",
            };
          })
        );
        setUploadedPhotos(fetched);
        // Pre-fill itself isn't a user edit; only mark dirty when the user
        // explicitly adds or removes a photo afterwards.
        setPhotosDirty(false);
      } catch {
        // Photo prefetch failed. Surface a clear toast so the seller knows
        // photos shown in the dialog (none) don't reflect what's saved, and
        // submitting won't touch existing photos unless they explicitly
        // add/remove a photo (which sets photosDirty).
        toast({ title: t("editPhotoFetchFailed"), variant: "destructive" });
        setUploadedPhotos([]);
        setPhotosDirty(false);
      } finally {
        setEditPhotosLoading(false);
      }
    }
  }

  async function handleContactClick(id: number, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (contactInfo[id]) return;
    setContactLoading(id);
    try {
      const res = await apiRequest("GET", `/api/marketplace/${id}/contact`);
      const data = await res.json();
      setContactInfo(prev => ({ ...prev, [id]: data }));
    } catch {
      toast({ title: "Could not fetch contact", variant: "destructive" });
    } finally {
      setContactLoading(null);
    }
  }

  function handleSortChange(value: string) {
    if (value === "nearest") {
      if (viewerCoords) {
        setSortBy("nearest");
        return;
      }
      if (!navigator.geolocation) {
        toast({ title: t("locationError"), variant: "destructive" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setViewerCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setSortBy("nearest");
        },
        () => {
          toast({ title: t("locationDenied"), variant: "destructive" });
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    } else {
      setSortBy(value as "latest" | "oldest");
    }
  }

  function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getDistanceKm(listing: ListingNoPhoto): number | null {
    if (!viewerCoords || !listing.sellerLat || !listing.sellerLng) return null;
    return calcDistance(viewerCoords.lat, viewerCoords.lng, parseFloat(listing.sellerLat), parseFloat(listing.sellerLng));
  }

  function daysSinceListed(listing: ListingNoPhoto): number {
    return Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  const sortedListings = [...listings].sort((a, b) => {
    if (sortBy === "nearest" && viewerCoords) {
      const dA = getDistanceKm(a);
      const dB = getDistanceKm(b);
      if (dA !== null && dB !== null) return dA - dB;
      if (dA !== null) return -1;
      if (dB !== null) return 1;
    }
    if (sortBy === "oldest") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const categoryLabel = (cat: string) =>
    cat === "onion_seedling" ? t("onionSeedling")
      : cat === "potato_seed" ? t("potatoSeed")
      : cat === "onion_seed" ? t("onionSeed")
      : cat === "soyabean_seed" ? t("soyabeanSeed")
      : cat === "bardan_bag" ? t("bardanBag")
      : cat === "exhaust_fan" ? t("exhaustFan")
      : cat === "others" ? t("marketplaceOthers")
      : cat;

  const categoryBadgeColor = (cat: string) =>
    cat === "onion_seedling"
      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      : cat === "potato_seed"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : cat === "onion_seed"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
      : cat === "soyabean_seed"
      ? "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300"
      : cat === "exhaust_fan"
      ? "bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
      : cat === "bardan_bag"
      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
      : cat === "others"
      ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300"
      : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300";

  const categoryBorderGradient = (cat: string) => {
    const base = "border-2 border-transparent [background-origin:border-box] [background-clip:padding-box,border-box]";
    if (cat === "onion_seedling") {
      return `${base} [background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#bbf7d0,#22c55e,#15803d)] dark:[background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#86efac,#16a34a,#166534)]`;
    }
    if (cat === "potato_seed") {
      return `${base} [background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#fde68a,#f59e0b,#b45309)] dark:[background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#fcd34d,#d97706,#92400e)]`;
    }
    if (cat === "onion_seed") {
      return `${base} [background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#fecdd3,#f43f5e,#9f1239)] dark:[background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#fda4af,#e11d48,#881337)]`;
    }
    if (cat === "soyabean_seed") {
      return `${base} [background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#ddd6fe,#8b5cf6,#5b21b6)] dark:[background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#c4b5fd,#7c3aed,#4c1d95)]`;
    }
    if (cat === "exhaust_fan") {
      return `${base} [background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#e2e8f0,#64748b,#1e293b)] dark:[background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#cbd5e1,#475569,#0f172a)]`;
    }
    if (cat === "others") {
      return `${base} [background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#ccfbf1,#14b8a6,#115e59)] dark:[background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#99f6e4,#0d9488,#134e4a)]`;
    }
    return `${base} [background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#bae6fd,#0ea5e9,#075985)] dark:[background-image:linear-gradient(hsl(var(--card)),hsl(var(--card))),linear-gradient(135deg,#7dd3fc,#0284c7,#0c4a6e)]`;
  };

  const categoryPlaceholderBg = (cat: string) =>
    cat === "onion_seedling"
      ? "bg-green-50 dark:bg-green-950/30"
      : cat === "potato_seed"
      ? "bg-amber-50 dark:bg-amber-950/30"
      : cat === "onion_seed"
      ? "bg-rose-50 dark:bg-rose-950/30"
      : cat === "soyabean_seed"
      ? "bg-violet-50 dark:bg-violet-950/30"
      : cat === "exhaust_fan"
      ? "bg-slate-50 dark:bg-slate-900/40"
      : cat === "others"
      ? "bg-teal-50 dark:bg-teal-950/30"
      : "bg-sky-50 dark:bg-sky-950/30";

  const renderPlaceholderIcon = (cat: string, size: "sm" | "lg") => {
    const cls = size === "sm" ? "w-10 h-10" : "w-16 h-16";
    if (cat === "onion_seedling") {
      return <Sprout className={`${cls} text-green-300 dark:text-green-700`} />;
    }
    if (cat === "potato_seed") {
      return <Leaf className={`${cls} text-amber-300 dark:text-amber-700`} />;
    }
    if (cat === "onion_seed") {
      return <Sprout className={`${cls} text-rose-300 dark:text-rose-700`} />;
    }
    if (cat === "bardan_bag") {
      return <Package className={`${cls} text-sky-300 dark:text-sky-700`} />;
    }
    if (cat === "exhaust_fan") {
      return <Fan className={`${cls} text-slate-300 dark:text-slate-600`} />;
    }
    if (cat === "others") {
      return <ShoppingBag className={`${cls} text-teal-300 dark:text-teal-700`} />;
    }
    return <Sprout className={`${cls} text-violet-300 dark:text-violet-700`} />;
  };

  // Task #84: Others-category enum label helpers (Hindi/English).
  const othersConditionLabel = (val: string | null | undefined) => {
    if (val === "new") return t("othersConditionNew");
    if (val === "used") return t("othersConditionUsed");
    if (val === "refurbished") return t("othersConditionRefurbished");
    return val || "";
  };

  const othersReturnPolicyLabel = (val: string | null | undefined) => {
    if (val === "5_day_return") return t("othersReturn5Day");
    if (val === "5_day_replacement") return t("othersReplacement5Day");
    if (val === "none") return t("othersReturnNone");
    return val || "";
  };

  const fanBrandLabel = (val: string | null | undefined) => {
    if (val === "Crompton") return t("fanBrandCrompton");
    if (val === "Havells") return t("fanBrandHavells");
    if (val === "Usha") return t("fanBrandUsha");
    if (val === "Others") return t("fanBrandOthers");
    return val || "";
  };

  const fanColorLabelLocal = (val: string | null | undefined) => {
    if (val === "Grey") return t("fanColorGrey");
    if (val === "Brown") return t("fanColorBrown");
    if (val === "Black") return t("fanColorBlack");
    if (val === "Others") return t("fanColorOthers");
    return val || "";
  };

  const fanBrandText = (b: string | null | undefined, other: string | null | undefined) => {
    if (!b) return "";
    if (b === "Others") return (other || "").trim();
    return fanBrandLabel(b);
  };

  const fanColorText = (c: string | null | undefined, other: string | null | undefined) => {
    if (!c) return "";
    if (c === "Others") return (other || "").trim();
    return fanColorLabelLocal(c);
  };

  const formatPrice = (n: number | null | undefined) => {
    if (n == null) return null;
    return language === "hi" ? `₹${n} / किलो` : `₹${n} / kg`;
  };

  const formatPricePerQuintal = (n: number | null | undefined) => {
    if (n == null) return null;
    return language === "hi" ? `₹${n} / क्विंटल` : `₹${n} / quintal`;
  };

  const soyabeanDurationLabel = (val: string | null | undefined) => {
    if (val === "Long") return t("soyabeanDurationLong");
    if (val === "Short") return t("soyabeanDurationShort");
    return val || "";
  };

  const bagCommodityLabel = (val: string | null | undefined) => {
    if (val === "Onion") return t("bagCommodityOnion");
    if (val === "Potato") return t("bagCommodityPotato");
    if (val === "Garlic") return t("bagCommodityGarlic");
    if (val === "Others") return t("bagCommodityOthers");
    return val || "";
  };

  const bagCommodityListLabel = (
    arr: string[] | null | undefined,
    custom: string | null | undefined,
  ) => {
    if (!Array.isArray(arr) || arr.length === 0) return "";
    const customTrim = (custom || "").trim();
    const parts: string[] = [];
    for (const v of arr) {
      if (v === "Others") {
        if (customTrim) parts.push(customTrim);
      } else {
        parts.push(bagCommodityLabel(v));
      }
    }
    return parts.filter(Boolean).join(", ");
  };

  const bagMaterialLabel = (val: string | null | undefined) => {
    if (val === "Jute/Hessian") return t("bagMaterialJute");
    if (val === "LENO Mesh") return t("bagMaterialLeno");
    if (val === "PP") return t("bagMaterialPP");
    if (val === "Others") return t("bagMaterialOthers");
    return val || "";
  };

  const bagColorLabel = (val: string | null | undefined) => {
    if (val === "Red") return t("bagColorRed");
    if (val === "Orange") return t("bagColorOrange");
    if (val === "Blue") return t("bagColorBlue");
    if (val === "Violet") return t("bagColorViolet");
    if (val === "Yellow") return t("bagColorYellow");
    if (val === "Pink") return t("bagColorPink");
    return val || "";
  };

  const hn = (val: string | null | undefined) => {
    if (!val) return val;
    return language === "hi" ? (HINDI_NAMES[val] || val) : val;
  };

  const sortLabel = sortBy === "latest" ? t("sortLatest") : sortBy === "nearest" ? t("sortNearest") : t("sortOldest");

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("listing");
      const lid = raw ? parseInt(raw, 10) : NaN;
      if (!lid || Number.isNaN(lid)) {
        setDetailListing(null);
        setPendingListingId(null);
      } else {
        setPendingListingId(lid);
      }
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    if (!pendingListingId) return;
    if (detailListing && detailListing.id === pendingListingId) {
      setPendingListingId(null);
      return;
    }
    const found = listings.find(l => l.id === pendingListingId);
    if (found) {
      setDetailListing(found);
      setDetailPhotoIndex(0);
      setPendingListingId(null);
    } else if (!isLoading && filterCategory !== "all") {
      setFilterCategory("all");
    } else if (!isLoading && filterCategory === "all") {
      if (!notFoundToastShownRef.current.has(pendingListingId)) {
        notFoundToastShownRef.current.add(pendingListingId);
        const idToCheck = pendingListingId;
        // Ask the backend whether this listing was deleted or just paused so
        // the buyer sees a more specific reason than a generic "not available".
        fetch(`/api/marketplace/${idToCheck}/status`, { credentials: "include" })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            const status = data?.status;
            const title =
              status === "inactive"
                ? t("shareListingInactive")
                : status === "deleted"
                ? t("shareListingDeleted")
                : t("shareListingNotFound");
            toast({ title });
          })
          .catch(() => {
            toast({ title: t("shareListingNotFound") });
          });
      }
      setPendingListingId(null);
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.has("listing")) {
          params.delete("listing");
          const newUrl = params.toString()
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;
          window.history.replaceState(null, "", newUrl);
        }
      } catch {}
    }
  }, [pendingListingId, listings, detailListing, isLoading, filterCategory]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cur = params.get("listing");
    const curId = cur ? parseInt(cur, 10) : null;
    if (detailListing) {
      if (curId !== detailListing.id) {
        params.set("listing", String(detailListing.id));
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.pushState({ listingId: detailListing.id }, "", newUrl);
      }
    } else {
      if (cur) {
        params.delete("listing");
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? `?${qs}` : "");
        window.history.replaceState(null, "", newUrl);
      }
    }
  }, [detailListing]);

  const composeShareInfo = (listing: ListingNoPhoto): ShareInfo => {
    const envBase = (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined)?.replace(/\/+$/, "");
    const origin = envBase || "https://km.krashuved.com";
    // Keep the share URL short and stable. Earlier work appended a per-listing
    // `&v=<token>` cache-bust parameter, but in practice that only helps when
    // the receiver already has a previous version of the link cached on their
    // device — and in the seller→buyer flow the receiver almost always sees
    // the link for the first time. Freshness on Meta's side is handled by the
    // server-side sharing-debugger ping fired after every create/edit/delete
    // (see server/share-meta.ts:pingListingShareCache). See Task #76 in
    // replit.md.
    const url = `${origin}/marketplace?listing=${listing.id}`;
    const cat = categoryLabel(listing.category);
    return {
      title: `${cat} | KrashuVed`,
      // Task #77: deliberately blank. The Web Share API on Android puts
      // `text` directly into the WhatsApp message bubble above the URL —
      // and the URL's rich preview card already shows the brand title
      // (og:title) and the listing description (og:description) right
      // there, so emitting "🌾 KrashuVed — किसानों का साथी" again only
      // duplicates the brand line. WhatsApp / Facebook still get all the
      // brand + listing context they need from the OG meta the server
      // injects on the canonical URL. Email keeps its own subject below.
      text: "",
      url,
      emailSubject: t("shareEmailSubject"),
    };
  };

  return (
    <div className="max-w-5xl mx-auto px-3 py-4 pb-24 md:pb-6" data-testid="page-marketplace">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold" data-testid="text-marketplace-title">{t("marketplace")}</h2>
        {isAuthenticated && (
          <Button size="sm" onClick={() => {
            if (!user?.village || !user?.district) {
              toast({ title: t("updateAddressFirst"), variant: "destructive" });
              return;
            }
            setAddOpen(true);
          }} data-testid="button-add-sale">
            <Plus className="w-4 h-4 mr-1" />
            {t("addSale")}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px] h-9 text-sm" data-testid="select-filter-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="filter-all">{t("allCategories")}</SelectItem>
            <SelectItem value="onion_seedling" data-testid="filter-onion_seedling">{t("onionSeedling")}</SelectItem>
            <SelectItem value="potato_seed" data-testid="filter-potato_seed">{t("potatoSeed")}</SelectItem>
            <SelectItem value="onion_seed" data-testid="filter-onion_seed">{t("onionSeed")}</SelectItem>
            <SelectItem value="soyabean_seed" data-testid="filter-soyabean_seed">{t("soyabeanSeed")}</SelectItem>
            <SelectItem value="bardan_bag" data-testid="filter-bardan_bag">{t("bardanBag")}</SelectItem>
            <SelectItem value="exhaust_fan" data-testid="filter-exhaust_fan">{t("exhaustFan")}</SelectItem>
            <SelectItem value="others" data-testid="filter-others">{t("marketplaceOthers")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOpen(!sortOpen)}
            data-testid="button-sort"
          >
            <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
            {sortLabel}
          </Button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-md shadow-lg min-w-[140px]" data-testid="sort-dropdown">
                {[
                  { value: "latest", label: t("sortLatest") },
                  { value: "nearest", label: t("sortNearest") },
                  { value: "oldest", label: t("sortOldest") },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${sortBy === opt.value ? "font-semibold text-primary" : ""}`}
                    onClick={() => { handleSortChange(opt.value); setSortOpen(false); }}
                    data-testid={`sort-option-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sortedListings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm" data-testid="text-no-listings">{t("noListings")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {sortedListings.map(listing => {
            const dist = getDistanceKm(listing);
            const isOwner = user?.id === listing.sellerId;
            const canManage = isOwner || !!user?.isAdmin;
            const isOnion = listing.category === "onion_seedling";
            const isOnionSeed = listing.category === "onion_seed";
            const isSoyabeanSeed = listing.category === "soyabean_seed";
            const isBardanBag = listing.category === "bardan_bag";
            const isFan = listing.category === "exhaust_fan";
            const isOthers = listing.category === "others";
            const hasPhoto = listing.photoCount > 0 || listing.photoMime;
            const cardTotalPhotos = listing.photoCount || (listing.photoMime ? 1 : 0);
            const cardIdxRaw = cardPhotoIndex[listing.id] ?? 0;
            const cardIdx = cardTotalPhotos > 0 ? Math.min(cardIdxRaw, cardTotalPhotos - 1) : 0;
            const showCardSwipe = cardTotalPhotos > 1;
            return (
              <Card
                key={listing.id}
                className={`group relative overflow-hidden flex flex-col cursor-pointer rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out will-change-transform ${categoryBorderGradient(listing.category)}`}
                onClick={() => { setDetailListing(listing); setDetailPhotoIndex(0); }}
                data-testid={`card-listing-${listing.id}`}
              >
                {hasPhoto ? (
                  <div
                    className="relative"
                    onTouchStart={(e) => {
                      const t = e.touches[0];
                      cardSwipeRef.current.set(listing.id, { startX: t.clientX, startY: t.clientY, swiped: false });
                    }}
                    onTouchEnd={(e) => {
                      const s = cardSwipeRef.current.get(listing.id);
                      if (!s) return;
                      const t = e.changedTouches[0];
                      const dx = t.clientX - s.startX;
                      const dy = t.clientY - s.startY;
                      if (showCardSwipe && Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) {
                        advanceCardPhoto(listing.id, cardTotalPhotos, dx < 0 ? 1 : -1);
                        s.swiped = true;
                        e.preventDefault();
                      }
                    }}
                    onTouchCancel={() => {
                      cardSwipeRef.current.delete(listing.id);
                    }}
                    onClick={(e) => {
                      const s = cardSwipeRef.current.get(listing.id);
                      if (s?.swiped) {
                        e.stopPropagation();
                      }
                      cardSwipeRef.current.delete(listing.id);
                    }}
                  >
                    <img
                      src={`/api/marketplace/${listing.id}/image${showCardSwipe ? `?index=${cardIdx}` : ""}`}
                      alt=""
                      className="w-full aspect-[4/3] object-cover"
                      data-testid={`img-listing-${listing.id}`}
                    />
                    {showCardSwipe && (
                      <>
                        <button
                          type="button"
                          aria-label={t("previousPhoto")}
                          className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            advanceCardPhoto(listing.id, cardTotalPhotos, -1);
                          }}
                          data-testid={`button-card-photo-prev-${listing.id}`}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("nextPhoto")}
                          className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            advanceCardPhoto(listing.id, cardTotalPhotos, 1);
                          }}
                          data-testid={`button-card-photo-next-${listing.id}`}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <div
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full pointer-events-none"
                          data-testid={`text-card-photo-counter-${listing.id}`}
                        >
                          {cardIdx + 1} / {cardTotalPhotos}
                        </div>
                      </>
                    )}
                    {/* Task #88: zoom-in icon is shown on every
                        photo-bearing card, not just multi-photo ones.
                        Single-photo cards (cardTotalPhotos === 1) need
                        the same affordance. The swipe arrows + counter
                        above remain gated on showCardSwipe since they
                        only make sense for >1 photos. */}
                    <button
                      type="button"
                      aria-label={t("zoom")}
                      className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        cardSwipeRef.current.delete(listing.id);
                        setLightboxListing(listing);
                        setLightboxIndex(cardIdx);
                        setLightboxOpen(true);
                      }}
                      data-testid={`button-card-photo-zoom-${listing.id}`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className={`w-full aspect-[4/3] flex items-center justify-center ${categoryPlaceholderBg(listing.category)}`}>
                    {renderPlaceholderIcon(listing.category, "sm")}
                  </div>
                )}

                <div className="relative z-10 p-2 flex flex-col flex-1 gap-1">
                  {listing.category !== "others" && (
                    <Badge className={`text-xs font-semibold px-1.5 py-0.5 leading-4 w-fit ${categoryBadgeColor(listing.category)}`} data-testid={`badge-category-${listing.id}`}>
                      {categoryLabel(listing.category)}
                    </Badge>
                  )}

                  <div className="flex-1 min-h-0">
                    {isOnion && (
                      <>
                        {listing.quantityBigha && (
                          <p className="text-sm font-bold leading-snug" data-testid={`text-qty-${listing.id}`}>
                            {listing.quantityBigha} {t("bigha")}
                          </p>
                        )}
                        <p className="text-xs font-medium text-foreground leading-snug truncate">
                          {[
                            listing.availableAfterDays != null ? `${listing.availableAfterDays} ${t("daysAvailable")}` : null,
                            listing.onionType,
                          ].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </>
                    )}
                    {!isOnion && !isOnionSeed && !isSoyabeanSeed && !isBardanBag && !isFan && !isOthers && (
                      <>
                        {listing.quantityBags && (
                          <p className="text-sm font-bold leading-snug" data-testid={`text-qty-${listing.id}`}>
                            {listing.quantityBags} {t("bags")}
                          </p>
                        )}
                        <p className="text-xs font-medium text-foreground leading-snug truncate">
                          {[hn(listing.potatoVariety), hn(listing.potatoBrand)].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </>
                    )}
                    {isBardanBag && (
                      <>
                        <p className="text-sm font-bold leading-snug" data-testid={`text-price-${listing.id}`}>
                          {language === "hi" ? `₹${listing.bagPricePerBag} / बैग` : `₹${listing.bagPricePerBag} / bag`}
                        </p>
                        <p className="text-xs font-medium text-foreground leading-snug truncate">
                          {[bagCommodityListLabel(listing.bagCommodityType, listing.bagCommodityOther), bagMaterialLabel(listing.bagMaterialType)].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {(listing.bagColor || listing.bagDimension) && (
                          <p className="text-[11px] font-medium text-foreground/70 leading-snug truncate">
                            {[bagColorLabel(listing.bagColor), listing.bagDimension].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </>
                    )}
                    {isFan && (
                      <>
                        <p className="text-sm font-bold leading-snug" data-testid={`text-price-${listing.id}`}>
                          {language === "hi" ? `₹${listing.fanPricePerPiece} / पीस` : `₹${listing.fanPricePerPiece} / piece`}
                        </p>
                        <p className="text-xs font-medium text-foreground leading-snug truncate">
                          {[
                            fanBrandText(listing.fanBrand, listing.fanBrandOther),
                            listing.fanWattage != null ? `${listing.fanWattage} W` : null,
                            listing.fanSpeedRpm != null ? `${listing.fanSpeedRpm} RPM` : null,
                          ].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </>
                    )}
                    {isOthers && (
                      <>
                        <p className="text-sm font-bold leading-snug truncate" data-testid={`text-others-name-${listing.id}`}>
                          {listing.othersProductName || "—"}
                        </p>
                        <p className="text-xs font-medium text-foreground leading-snug" data-testid={`text-price-${listing.id}`}>
                          {listing.othersPrice != null
                            ? `₹${listing.othersPrice}`
                            : <span className="text-foreground/70 font-medium">{t("contactForPrice")}</span>}
                        </p>
                        {(() => {
                          // Task #84: hide the optional-facts line entirely
                          // when no Others field is filled — a minimal card
                          // (name + price/contact + location) is the
                          // intended look. Avoid rendering a placeholder
                          // dash, per spec.
                          const otherFacts = [
                            listing.othersBrand,
                            othersConditionLabel(listing.othersCondition),
                            listing.othersWarrantyYears != null
                              ? `${listing.othersWarrantyYears} yr`
                              : null,
                            listing.othersDimensions,
                            listing.othersMaterials,
                            othersReturnPolicyLabel(listing.othersReturnPolicy),
                            listing.othersExtra1,
                            listing.othersExtra2,
                            listing.othersExtra3,
                            listing.othersExtra4,
                            listing.othersExtra5,
                          ].filter(Boolean);
                          if (otherFacts.length === 0) return null;
                          return (
                            <p className="text-[11px] font-medium text-foreground/70 leading-snug truncate">
                              {otherFacts.join(" · ")}
                            </p>
                          );
                        })()}
                      </>
                    )}
                    {isOnionSeed && (
                      <>
                        <p className="text-sm font-bold leading-snug" data-testid={`text-price-${listing.id}`}>
                          {listing.onionSeedPricePerKg != null
                            ? formatPrice(listing.onionSeedPricePerKg)
                            : <span className="text-foreground/70 font-medium">{t("contactForPrice")}</span>}
                        </p>
                        <p className="text-xs font-medium text-foreground leading-snug truncate">
                          {[hn(listing.onionSeedType), hn(listing.onionSeedVariety), hn(listing.onionSeedBrand)].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </>
                    )}
                    {isSoyabeanSeed && (
                      <>
                        <p className="text-sm font-bold leading-snug" data-testid={`text-price-${listing.id}`}>
                          {listing.soyabeanSeedPricePerQuintal != null
                            ? formatPricePerQuintal(listing.soyabeanSeedPricePerQuintal)
                            : <span className="text-foreground/70 font-medium">{t("contactForPrice")}</span>}
                        </p>
                        <p className="text-xs font-medium text-foreground leading-snug truncate">
                          {[soyabeanDurationLabel(listing.soyabeanSeedDuration), listing.soyabeanSeedVariety].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 text-xs font-medium text-foreground mt-auto">
                    <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="truncate" data-testid={`text-location-${listing.id}`}>
                      {[listing.sellerVillage, listing.sellerDistrict].filter(Boolean).join(", ") || "—"}
                    </span>
                    {dist !== null && (
                      <span className="shrink-0 text-primary font-semibold ml-0.5">({Math.round(dist)}km)</span>
                    )}
                  </div>

                  {(listing.ratingCount > 0) && (
                    <StarDisplay avg={listing.avgRating} count={listing.ratingCount} />
                  )}

                  <div className="flex items-center gap-0.5 pt-1 border-t border-border/40">
                    {isAuthenticated && !contactInfo[listing.id] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleContactClick(listing.id, e)}
                        disabled={contactLoading === listing.id}
                        data-testid={`button-contact-${listing.id}`}
                      >
                        {contactLoading === listing.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Phone className="w-3 h-3 text-primary" />
                            <span className="text-primary text-xs">{t("contact")}</span>
                          </>
                        )}
                      </Button>
                    )}
                    {isAuthenticated && contactInfo[listing.id] && (
                      <div className="text-[10px] flex-1 min-w-0" data-testid={`text-contact-${listing.id}`} onClick={(e) => e.stopPropagation()}>
                        <p className="font-semibold truncate">{contactInfo[listing.id].name}</p>
                        <a href={`tel:+91${contactInfo[listing.id].phone}`} className="text-primary font-medium flex items-center gap-0.5">
                          <Phone className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{contactInfo[listing.id].phone}</span>
                        </a>
                      </div>
                    )}
                    {!isAuthenticated && (
                      <Link
                        href={`/auth?next=${encodeURIComponent(`/marketplace?listing=${listing.id}`)}`}
                        className="text-[9px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`link-login-card-${listing.id}`}
                      >
                        {t("loginToContact")}
                      </Link>
                    )}
                    <div className="ml-auto flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <ShareButton
                        shareInfo={composeShareInfo(listing)}
                        variant="card"
                        testId={`button-share-listing-${listing.id}`}
                        listingId={listing.id}
                      />
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(listing);
                            }}
                            data-testid={`button-edit-listing-${listing.id}`}
                          >
                            <Pencil className="w-3 h-3 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(t("deleteListingConfirm"))) {
                                deleteMutation.mutate(listing.id);
                              }
                            }}
                            data-testid={`button-delete-listing-${listing.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-[1] rounded-2xl bg-[linear-gradient(115deg,transparent_28%,rgba(255,255,255,0.18)_46%,rgba(255,255,255,0.32)_50%,rgba(255,255,255,0.18)_54%,transparent_72%)] dark:bg-[linear-gradient(115deg,transparent_28%,rgba(255,255,255,0.05)_46%,rgba(255,255,255,0.10)_50%,rgba(255,255,255,0.05)_54%,transparent_72%)] opacity-60 group-hover:opacity-90 translate-x-0 group-hover:translate-x-[6%] transition-[opacity,transform] duration-700 ease-out mix-blend-overlay dark:mix-blend-soft-light"
                />
              </Card>
            );
          })}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-listing-photo"
      />

      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { resetForm(); setEditingListingId(null); setAddOpen(false); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingListingId != null ? t("editListing") : t("addSale")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm">{t("selectItem")}</Label>
              <Select value={category} onValueChange={setCategory} disabled={editingListingId != null}>
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder={t("selectItem")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onion_seedling">{t("onionSeedling")}</SelectItem>
                  <SelectItem value="potato_seed">{t("potatoSeed")}</SelectItem>
                  <SelectItem value="onion_seed">{t("onionSeed")}</SelectItem>
                  <SelectItem value="soyabean_seed">{t("soyabeanSeed")}</SelectItem>
                  <SelectItem value="bardan_bag">{t("bardanBag")}</SelectItem>
                  <SelectItem value="exhaust_fan">{t("exhaustFan")}</SelectItem>
                  <SelectItem value="others">{t("marketplaceOthers")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">
                {t("photos")} ({uploadedPhotos.length}/{MAX_PHOTOS})
                {editPhotosLoading && <Loader2 className="inline-block w-3 h-3 ml-2 animate-spin" />}
              </Label>
              {editingListingId != null && !photosDirty && !editPhotosLoading && (
                <p className="text-[11px] text-muted-foreground mt-0.5" data-testid="text-photos-unchanged-hint">
                  {t("photosUnchangedHint")}
                </p>
              )}
              <div className="flex gap-2 mt-1 flex-wrap">
                {uploadedPhotos.map((photo, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-md overflow-hidden border">
                    <img src={photo.preview} alt="" className="w-full h-full object-cover" data-testid={`img-upload-preview-${i}`} />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
                      data-testid={`button-remove-photo-${i}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] text-center py-0.5">{t("coverPhoto")}</span>
                    )}
                  </div>
                ))}
                {uploadedPhotos.length < MAX_PHOTOS && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors"
                    data-testid="button-add-photo"
                  >
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground">{t("addPhoto")}</span>
                  </button>
                )}
              </div>
            </div>

            {category === "onion_seedling" && (
              <>
                <div>
                  <Label className="text-sm">{t("quantityBigha")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={quantityBigha}
                    onChange={(e) => setQuantityBigha(e.target.value)}
                    placeholder="0"
                    data-testid="input-quantity-bigha"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("availableAfterDays")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={availableDays}
                    onChange={(e) => setAvailableDays(e.target.value)}
                    placeholder="0"
                    data-testid="input-available-days"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("onionType")}</Label>
                  <Input
                    value={onionType}
                    onChange={(e) => setOnionType(e.target.value)}
                    placeholder="Nafed"
                    data-testid="input-onion-type"
                  />
                </div>
              </>
            )}

            {category === "potato_seed" && (
              <>
                <div>
                  <Label className="text-sm">{t("quantityBags")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={quantityBags}
                    onChange={(e) => setQuantityBags(e.target.value)}
                    placeholder="0"
                    data-testid="input-quantity-bags"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("potatoVariety")}</Label>
                  <Select value={potatoVariety} onValueChange={setPotatoVariety}>
                    <SelectTrigger data-testid="select-potato-variety">
                      <SelectValue placeholder={t("potatoVariety")} />
                    </SelectTrigger>
                    <SelectContent>
                      {POTATO_VARIETIES.map(v => (
                        <SelectItem key={v} value={v}>{hn(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">{t("potatoBrand")}</Label>
                  <Select value={potatoBrand} onValueChange={setPotatoBrand}>
                    <SelectTrigger data-testid="select-potato-brand">
                      <SelectValue placeholder={t("potatoBrand")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("noBrand")}</SelectItem>
                      {POTATO_BRANDS.map(b => (
                        <SelectItem key={b} value={b}>{hn(b)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {category === "onion_seed" && (
              <>
                <div>
                  <Label className="text-sm">{t("pricePerKg")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={999999}
                    value={onionSeedPricePerKg}
                    onChange={(e) => setOnionSeedPricePerKg(e.target.value)}
                    placeholder="0"
                    data-testid="input-onion-seed-price"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("onionSeedType")}</Label>
                  <Select value={onionSeedType} onValueChange={setOnionSeedType}>
                    <SelectTrigger data-testid="select-onion-seed-type">
                      <SelectValue placeholder={t("selectOption")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ONION_SEED_TYPES.map(v => (
                        <SelectItem key={v} value={v} data-testid={`option-onion-seed-type-${v}`}>{hn(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">{t("onionSeedVariety")}</Label>
                  <SearchableSelect
                    value={onionSeedVariety}
                    onChange={setOnionSeedVariety}
                    options={ONION_SEED_VARIETIES}
                    placeholder={t("selectOption")}
                    searchPlaceholder={t("searchPlaceholder")}
                    emptyText={t("noResults")}
                    hn={(v) => hn(v) || v}
                    testId="select-onion-seed-variety"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("onionSeedBrand")}</Label>
                  <SearchableSelect
                    value={onionSeedBrand}
                    onChange={setOnionSeedBrand}
                    options={["none", ...ONION_SEED_BRANDS]}
                    placeholder={t("selectOption")}
                    searchPlaceholder={t("searchPlaceholder")}
                    emptyText={t("noResults")}
                    hn={(v) => v === "none" ? t("noBrand") : (hn(v) || v)}
                    testId="select-onion-seed-brand"
                  />
                </div>
              </>
            )}

            {category === "soyabean_seed" && (
              <>
                <div>
                  <Label className="text-sm">{t("pricePerQuintal")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={999999}
                    value={soyabeanPricePerQuintal}
                    onChange={(e) => setSoyabeanPricePerQuintal(e.target.value)}
                    placeholder="0"
                    data-testid="input-soyabean-price"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("soyabeanDuration")}</Label>
                  <Select value={soyabeanDuration} onValueChange={setSoyabeanDuration}>
                    <SelectTrigger data-testid="select-soyabean-duration">
                      <SelectValue placeholder={t("selectOption")} />
                    </SelectTrigger>
                    <SelectContent>
                      {SOYABEAN_DURATIONS.map(v => (
                        <SelectItem key={v} value={v} data-testid={`option-soyabean-duration-${v}`}>
                          {soyabeanDurationLabel(v)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">{t("soyabeanVariety")}</Label>
                  <Input
                    value={soyabeanVariety}
                    onChange={(e) => setSoyabeanVariety(e.target.value)}
                    placeholder={t("soyabeanVariety")}
                    data-testid="input-soyabean-variety"
                  />
                </div>
              </>
            )}

            {category === "bardan_bag" && (
              <>
                <div>
                  <Label className="text-sm">{t("bagCommodityType")}</Label>
                  <ToggleGroup
                    type="multiple"
                    value={bagCommodityType}
                    onValueChange={(v) => {
                      const next = Array.isArray(v) ? v : [];
                      setBagCommodityType(next);
                      if (!next.includes("Others")) setBagCommodityOther("");
                    }}
                    className="flex flex-wrap justify-start gap-2 mt-1"
                    data-testid="toggle-bag-commodity"
                  >
                    {BAG_COMMODITY_TYPES.map(v => (
                      <ToggleGroupItem
                        key={v}
                        value={v}
                        variant="outline"
                        size="sm"
                        className="rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                        data-testid={`chip-bag-commodity-${v}`}
                      >
                        {bagCommodityLabel(v)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-xs text-muted-foreground mt-1">{t("bagCommodityHint")}</p>
                  {bagCommodityType.includes("Others") && (
                    <div className="mt-2">
                      <Label className="text-sm">{t("bagCommodityOtherLabel")}</Label>
                      <Input
                        value={bagCommodityOther}
                        onChange={(e) => setBagCommodityOther(e.target.value.slice(0, 40))}
                        placeholder={t("bagCommodityOtherPlaceholder")}
                        maxLength={40}
                        data-testid="input-bag-commodity-other"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-sm">{t("bagMaterialType")}</Label>
                  <Select value={bagMaterialType} onValueChange={setBagMaterialType}>
                    <SelectTrigger data-testid="select-bag-material">
                      <SelectValue placeholder={t("selectOption")} />
                    </SelectTrigger>
                    <SelectContent>
                      {BAG_MATERIAL_TYPES.map(v => (
                        <SelectItem key={v} value={v} data-testid={`option-bag-material-${v}`}>
                          {bagMaterialLabel(v)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">{t("bagDimension")}</Label>
                  <Input
                    value={bagDimension}
                    onChange={(e) => setBagDimension(e.target.value.slice(0, 40))}
                    placeholder={t("bagDimensionPlaceholder")}
                    data-testid="input-bag-dimension"
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t("bagDimensionHelper")}</p>
                </div>
                <div>
                  <Label className="text-sm">{t("bagGsm")}</Label>
                  <ToggleGroup
                    type="multiple"
                    value={bagGsm}
                    onValueChange={(v) => setBagGsm(Array.isArray(v) ? v : [])}
                    className="flex flex-wrap justify-start gap-2 mt-1"
                    data-testid="toggle-bag-gsm"
                  >
                    {BAG_GSM_OPTIONS.map(v => (
                      <ToggleGroupItem
                        key={v}
                        value={String(v)}
                        variant="outline"
                        size="sm"
                        className="rounded-full data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                        data-testid={`chip-bag-gsm-${v}`}
                      >
                        {v}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div>
                  <Label className="text-sm">{t("bagColor")}</Label>
                  <Select value={bagColor} onValueChange={setBagColor}>
                    <SelectTrigger data-testid="select-bag-color">
                      <SelectValue placeholder={t("bagColorNone")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" data-testid="option-bag-color-none">{t("bagColorNone")}</SelectItem>
                      {BAG_COLORS.map(v => (
                        <SelectItem key={v} value={v} data-testid={`option-bag-color-${v}`}>
                          {bagColorLabel(v)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">{t("bagMinQuantity")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={999999}
                    value={bagMinQuantity}
                    onChange={(e) => setBagMinQuantity(e.target.value)}
                    placeholder="0"
                    data-testid="input-bag-min-quantity"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("pricePerBag")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={999999}
                    value={bagPricePerBag}
                    onChange={(e) => setBagPricePerBag(e.target.value)}
                    placeholder="0"
                    data-testid="input-bag-price"
                  />
                </div>
              </>
            )}

            {category === "exhaust_fan" && (
              <>
                <div>
                  <Label className="text-sm">{t("fanBrand")}</Label>
                  <Select value={fanBrand} onValueChange={(v) => { setFanBrand(v); if (v !== "Others") setFanBrandOther(""); }}>
                    <SelectTrigger data-testid="select-fan-brand">
                      <SelectValue placeholder={t("selectOption")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" data-testid="option-fan-brand-none">{t("selectOption")}</SelectItem>
                      {FAN_BRANDS.map(v => (
                        <SelectItem key={v} value={v} data-testid={`option-fan-brand-${v}`}>
                          {fanBrandLabel(v)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fanBrand === "Others" && (
                    <div className="mt-2">
                      <Label className="text-sm">{t("fanBrandOtherLabel")}</Label>
                      <Input
                        value={fanBrandOther}
                        onChange={(e) => setFanBrandOther(e.target.value.slice(0, 40))}
                        placeholder={t("fanBrandOtherPlaceholder")}
                        maxLength={40}
                        data-testid="input-fan-brand-other"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-sm">{t("fanColor")}</Label>
                  <Select value={fanColor} onValueChange={(v) => { setFanColor(v); if (v !== "Others") setFanColorOther(""); }}>
                    <SelectTrigger data-testid="select-fan-color">
                      <SelectValue placeholder={t("selectOption")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" data-testid="option-fan-color-none">{t("selectOption")}</SelectItem>
                      {FAN_COLORS.map(v => (
                        <SelectItem key={v} value={v} data-testid={`option-fan-color-${v}`}>
                          {fanColorLabelLocal(v)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fanColor === "Others" && (
                    <div className="mt-2">
                      <Label className="text-sm">{t("fanColorOtherLabel")}</Label>
                      <Input
                        value={fanColorOther}
                        onChange={(e) => setFanColorOther(e.target.value.slice(0, 40))}
                        placeholder={t("fanColorOtherPlaceholder")}
                        maxLength={40}
                        data-testid="input-fan-color-other"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-sm">{t("fanWattage")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    value={fanWattage}
                    onChange={(e) => setFanWattage(e.target.value)}
                    placeholder="0"
                    data-testid="input-fan-wattage"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanVoltage")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    value={fanVoltage}
                    onChange={(e) => setFanVoltage(e.target.value)}
                    placeholder="0"
                    data-testid="input-fan-voltage"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanAirflowCmh")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    value={fanAirflowCmh}
                    onChange={(e) => setFanAirflowCmh(e.target.value)}
                    placeholder="0"
                    data-testid="input-fan-airflow"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanBladeLength")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={5000}
                    value={fanBladeLengthMm}
                    onChange={(e) => setFanBladeLengthMm(e.target.value)}
                    placeholder="0"
                    data-testid="input-fan-blade-length"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanSpeedRpm")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    value={fanSpeedRpm}
                    onChange={(e) => setFanSpeedRpm(e.target.value)}
                    placeholder="0"
                    data-testid="input-fan-speed-rpm"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanBladeMaterial")}</Label>
                  <Input
                    value={fanBladeMaterial}
                    onChange={(e) => setFanBladeMaterial(e.target.value.slice(0, 40))}
                    maxLength={40}
                    data-testid="input-fan-blade-material"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanBladeCount")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={fanBladeCount}
                    onChange={(e) => setFanBladeCount(e.target.value)}
                    placeholder="0"
                    data-testid="input-fan-blade-count"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanCountryOfOrigin")}</Label>
                  <Input
                    value={fanCountryOfOrigin}
                    onChange={(e) => setFanCountryOfOrigin(e.target.value.slice(0, 40))}
                    maxLength={40}
                    data-testid="input-fan-country"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanWarrantyYears")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    value={fanWarrantyYears}
                    onChange={(e) => setFanWarrantyYears(e.target.value)}
                    placeholder="0"
                    data-testid="input-fan-warranty"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("fanDimensions")}</Label>
                  <Input
                    value={fanDimensions}
                    onChange={(e) => setFanDimensions(e.target.value.slice(0, 80))}
                    placeholder={t("fanDimensionsPlaceholder")}
                    maxLength={80}
                    data-testid="input-fan-dimensions"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("pricePerPiece")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={999999}
                    value={fanPricePerPiece}
                    onChange={(e) => setFanPricePerPiece(e.target.value)}
                    placeholder="0"
                    data-testid="input-fan-price"
                  />
                </div>
              </>
            )}

            {/* Task #84: Others-category form. ONLY othersProductName + ≥1
                photo are required. The five extra-info slots are bare freehand
                inputs (no labels in the card body — only in the dialog/popup
                with the generic "Extra Info" heading). */}
            {category === "others" && (
              <>
                <div>
                  <Label className="text-sm">{t("othersProductName")} <span className="text-destructive">*</span></Label>
                  <Input
                    value={othersProductName}
                    onChange={(e) => setOthersProductName(e.target.value.slice(0, 80))}
                    placeholder={t("othersProductNamePlaceholder")}
                    maxLength={80}
                    data-testid="input-others-product-name"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("othersBrand")}</Label>
                  <Input
                    value={othersBrand}
                    onChange={(e) => setOthersBrand(e.target.value.slice(0, 40))}
                    maxLength={40}
                    data-testid="input-others-brand"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("othersPrice")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={999999}
                    value={othersPrice}
                    onChange={(e) => setOthersPrice(e.target.value)}
                    placeholder="0"
                    data-testid="input-others-price"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("othersMaterials")}</Label>
                  <Input
                    value={othersMaterials}
                    onChange={(e) => setOthersMaterials(e.target.value.slice(0, 60))}
                    placeholder={t("othersMaterialsPlaceholder")}
                    maxLength={60}
                    data-testid="input-others-materials"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("othersCondition")}</Label>
                  <Select value={othersCondition} onValueChange={setOthersCondition}>
                    <SelectTrigger data-testid="select-others-condition">
                      <SelectValue placeholder={t("selectOption")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset" data-testid="option-others-condition-unset">{t("selectOption")}</SelectItem>
                      <SelectItem value="new" data-testid="option-others-condition-new">{t("othersConditionNew")}</SelectItem>
                      <SelectItem value="used" data-testid="option-others-condition-used">{t("othersConditionUsed")}</SelectItem>
                      <SelectItem value="refurbished" data-testid="option-others-condition-refurbished">{t("othersConditionRefurbished")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">{t("othersWarrantyYears")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    value={othersWarrantyYears}
                    onChange={(e) => setOthersWarrantyYears(e.target.value)}
                    placeholder="0"
                    data-testid="input-others-warranty"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("othersDimensions")}</Label>
                  <Input
                    value={othersDimensions}
                    onChange={(e) => setOthersDimensions(e.target.value.slice(0, 60))}
                    placeholder={t("othersDimensionsPlaceholder")}
                    maxLength={60}
                    data-testid="input-others-dimensions"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("othersReturnPolicy")}</Label>
                  <Select value={othersReturnPolicy} onValueChange={setOthersReturnPolicy}>
                    <SelectTrigger data-testid="select-others-return-policy">
                      <SelectValue placeholder={t("selectOption")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset" data-testid="option-others-return-unset">{t("selectOption")}</SelectItem>
                      <SelectItem value="5_day_return" data-testid="option-others-return-5day">{t("othersReturn5Day")}</SelectItem>
                      <SelectItem value="5_day_replacement" data-testid="option-others-return-5day-replace">{t("othersReplacement5Day")}</SelectItem>
                      <SelectItem value="none" data-testid="option-others-return-none">{t("othersReturnNone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Label className="text-sm">{t("othersExtra")}</Label>
                  {[
                    { val: othersExtra1, set: setOthersExtra1, idx: 1 },
                    { val: othersExtra2, set: setOthersExtra2, idx: 2 },
                    { val: othersExtra3, set: setOthersExtra3, idx: 3 },
                    { val: othersExtra4, set: setOthersExtra4, idx: 4 },
                    { val: othersExtra5, set: setOthersExtra5, idx: 5 },
                  ].map(slot => (
                    <Input
                      key={slot.idx}
                      value={slot.val}
                      onChange={(e) => slot.set(e.target.value.slice(0, 60))}
                      placeholder={t("othersExtraPlaceholder")}
                      maxLength={60}
                      data-testid={`input-others-extra-${slot.idx}`}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Task #79: optional 50-char freehand notes — rendered for ALL
                categories (only when one is picked, to keep the empty form
                quiet). Trimmed and coerced to null on submit; shown only in
                the listing detail popup and appended to og:description. */}
            {category && (
              <div>
                <Label className="text-sm">{t("additionalNotesLabel")}</Label>
                <Input
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value.slice(0, 50))}
                  placeholder={t("additionalNotesPlaceholder")}
                  maxLength={50}
                  data-testid="input-additional-notes"
                />
                <div className="text-xs mt-1 flex justify-between">
                  <span className="text-muted-foreground">{t("additionalNotesHelp")}</span>
                  <span
                    className={additionalNotes.length >= 50 ? "text-destructive font-semibold" : "text-muted-foreground"}
                    data-testid="text-notes-counter"
                  >
                    {additionalNotes.length} / 50
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={
                !category ||
                createMutation.isPending ||
                updateMutation.isPending ||
                editPhotosLoading ||
                // Task #84: Others requires ≥1 photo. Disable Save when:
                // - Creating an Others listing with no photos picked, OR
                // - Editing an Others listing where the photo set was touched
                //   (`photosDirty`) and the user has cleared it to empty.
                (category === "others" && (
                  (editingListingId == null && uploadedPhotos.length === 0) ||
                  (editingListingId != null && photosDirty && uploadedPhotos.length === 0)
                ))
              }
              className="w-full"
              data-testid="button-submit-listing"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailListing && (
        <Dialog open={!!detailListing} onOpenChange={(open) => { if (!open) { setDetailListing(null); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
            <div>
              {(() => {
                const listing = detailListing;
                const isOnion = listing.category === "onion_seedling";
                const isOnionSeed = listing.category === "onion_seed";
                const isSoyabeanSeed = listing.category === "soyabean_seed";
                const isBardanBag = listing.category === "bardan_bag";
                const isFan = listing.category === "exhaust_fan";
                const isOthers = listing.category === "others";
                const totalPhotos = listing.photoCount || (listing.photoMime ? 1 : 0);
                const hasPhotos = totalPhotos > 0;
                const dist = getDistanceKm(listing);
                const isOwner = user?.id === listing.sellerId;
                const canManage = isOwner || !!user?.isAdmin;

                return (
                  <>
                    <div className="relative">
                      {hasPhotos ? (
                        <img
                          src={`/api/marketplace/${listing.id}/image?index=${detailPhotoIndex}`}
                          alt=""
                          className="w-full aspect-[4/3] object-cover cursor-zoom-in"
                          onClick={() => {
                            setLightboxListing(listing);
                            setLightboxIndex(detailPhotoIndex);
                            setLightboxOpen(true);
                          }}
                          data-testid="img-detail-photo"
                        />
                      ) : (
                        <div className={`w-full aspect-[4/3] flex items-center justify-center ${categoryPlaceholderBg(listing.category)}`}>
                          {renderPlaceholderIcon(listing.category, "lg")}
                        </div>
                      )}
                      {totalPhotos > 1 && (
                        <>
                          <button
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5"
                            onClick={() => setDetailPhotoIndex(i => (i - 1 + totalPhotos) % totalPhotos)}
                            data-testid="button-photo-prev"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5"
                            onClick={() => setDetailPhotoIndex(i => (i + 1) % totalPhotos)}
                            data-testid="button-photo-next"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2.5 py-0.5 rounded-full" data-testid="text-photo-counter">
                            {detailPhotoIndex + 1} / {totalPhotos}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        {listing.category !== "others" && (
                          <Badge className={`text-sm font-semibold px-2 py-0.5 ${categoryBadgeColor(listing.category)}`}>
                            {categoryLabel(listing.category)}
                          </Badge>
                        )}
                        {isOwner && (
                          <Badge variant="outline" className="text-xs">
                            {t("myListing")}
                          </Badge>
                        )}
                        <div className="ml-auto">
                          <ShareButton
                            shareInfo={composeShareInfo(listing)}
                            variant="detail"
                            testId="button-share-detail"
                            listingId={listing.id}
                          />
                        </div>
                      </div>

                      {isOnion && (
                        <div>
                          {listing.quantityBigha && (
                            <p className="text-xl font-bold">{listing.quantityBigha} {t("bigha")}</p>
                          )}
                          {listing.availableAfterDays != null && (
                            <p className="text-sm font-medium">{listing.availableAfterDays} {t("daysAvailable")}</p>
                          )}
                          {listing.onionType && (
                            <p className="text-sm font-medium">{t("onionType")}: {listing.onionType}</p>
                          )}
                        </div>
                      )}
                      {!isOnion && !isOnionSeed && !isSoyabeanSeed && !isBardanBag && !isFan && !isOthers && (
                        <div>
                          {listing.quantityBags && (
                            <p className="text-xl font-bold">{listing.quantityBags} {t("bags")}</p>
                          )}
                          {listing.potatoVariety && (
                            <p className="text-sm font-medium">{t("potatoVariety")}: {hn(listing.potatoVariety)}</p>
                          )}
                          {listing.potatoBrand && (
                            <p className="text-sm font-medium">{t("potatoBrand")}: {hn(listing.potatoBrand)}</p>
                          )}
                        </div>
                      )}
                      {isBardanBag && (
                        <div>
                          <p className="text-xl font-bold" data-testid="text-detail-price">
                            {language === "hi" ? `₹${listing.bagPricePerBag} / बैग` : `₹${listing.bagPricePerBag} / bag`}
                          </p>
                          {listing.bagCommodityType && (
                            <p className="text-sm font-medium">{t("bagCommodityType")}: {bagCommodityListLabel(listing.bagCommodityType, listing.bagCommodityOther) || "—"}</p>
                          )}
                          {listing.bagMaterialType && (
                            <p className="text-sm font-medium">{t("bagMaterialType")}: {bagMaterialLabel(listing.bagMaterialType)}</p>
                          )}
                          {listing.bagDimension && (
                            <p className="text-sm font-medium">{t("bagDimension")}: {listing.bagDimension}</p>
                          )}
                          {Array.isArray(listing.bagGsm) && listing.bagGsm.length > 0 && (
                            <p className="text-sm font-medium">{t("bagGsm")}: {[...listing.bagGsm].sort((a, b) => a - b).join(", ")}</p>
                          )}
                          {listing.bagColor && (
                            <p className="text-sm font-medium">{t("bagColor")}: {bagColorLabel(listing.bagColor)}</p>
                          )}
                          {listing.bagMinQuantity != null && (
                            <p className="text-sm font-medium">{t("bagMinQuantity")}: {listing.bagMinQuantity}</p>
                          )}
                        </div>
                      )}
                      {isOnionSeed && (
                        <div>
                          <p className="text-xl font-bold" data-testid="text-detail-price">
                            {listing.onionSeedPricePerKg != null
                              ? formatPrice(listing.onionSeedPricePerKg)
                              : <span className="text-foreground/70">{t("contactForPrice")}</span>}
                          </p>
                          {listing.onionSeedType && (
                            <p className="text-sm font-medium">{t("onionSeedType")}: {hn(listing.onionSeedType)}</p>
                          )}
                          {listing.onionSeedVariety && (
                            <p className="text-sm font-medium">{t("onionSeedVariety")}: {hn(listing.onionSeedVariety)}</p>
                          )}
                          {listing.onionSeedBrand && (
                            <p className="text-sm font-medium">{t("onionSeedBrand")}: {hn(listing.onionSeedBrand)}</p>
                          )}
                        </div>
                      )}
                      {isSoyabeanSeed && (
                        <div>
                          <p className="text-xl font-bold" data-testid="text-detail-price">
                            {listing.soyabeanSeedPricePerQuintal != null
                              ? formatPricePerQuintal(listing.soyabeanSeedPricePerQuintal)
                              : <span className="text-foreground/70">{t("contactForPrice")}</span>}
                          </p>
                          {listing.soyabeanSeedDuration && (
                            <p className="text-sm font-medium">{t("soyabeanDuration")}: {soyabeanDurationLabel(listing.soyabeanSeedDuration)}</p>
                          )}
                          {listing.soyabeanSeedVariety && (
                            <p className="text-sm font-medium">{t("soyabeanVariety")}: {listing.soyabeanSeedVariety}</p>
                          )}
                        </div>
                      )}
                      {isFan && (
                        <div>
                          <p className="text-xl font-bold" data-testid="text-detail-price">
                            {language === "hi" ? `₹${listing.fanPricePerPiece} / पीस` : `₹${listing.fanPricePerPiece} / piece`}
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
                            <p className="text-sm font-medium">{t("fanBrand")}: {fanBrandText(listing.fanBrand, listing.fanBrandOther) || "—"}</p>
                            <p className="text-sm font-medium">{t("fanColor")}: {fanColorText(listing.fanColor, listing.fanColorOther) || "—"}</p>
                            <p className="text-sm font-medium">{t("fanWattage")}: {listing.fanWattage != null ? listing.fanWattage : "—"}</p>
                            <p className="text-sm font-medium">{t("fanVoltage")}: {listing.fanVoltage != null ? listing.fanVoltage : "—"}</p>
                            <p className="text-sm font-medium">{t("fanAirflowCmh")}: {listing.fanAirflowCmh != null ? listing.fanAirflowCmh : "—"}</p>
                            <p className="text-sm font-medium">{t("fanSpeedRpm")}: {listing.fanSpeedRpm != null ? listing.fanSpeedRpm : "—"}</p>
                            <p className="text-sm font-medium">{t("fanBladeLength")}: {listing.fanBladeLengthMm != null ? listing.fanBladeLengthMm : "—"}</p>
                            <p className="text-sm font-medium">{t("fanBladeCount")}: {listing.fanBladeCount != null ? listing.fanBladeCount : "—"}</p>
                            <p className="text-sm font-medium">{t("fanBladeMaterial")}: {listing.fanBladeMaterial || "—"}</p>
                            <p className="text-sm font-medium">{t("fanCountryOfOrigin")}: {listing.fanCountryOfOrigin || "—"}</p>
                            <p className="text-sm font-medium col-span-2">{t("fanWarrantyYears")}: {listing.fanWarrantyYears != null ? listing.fanWarrantyYears : "—"}</p>
                          </div>
                          <p className="text-sm font-medium mt-1.5">{t("fanDimensions")}: {listing.fanDimensions || "—"}</p>
                        </div>
                      )}
                      {isOthers && (
                        <div>
                          <p className="text-xl font-bold" data-testid="text-detail-others-name">
                            {listing.othersProductName || "—"}
                          </p>
                          <p className="text-lg font-semibold mt-0.5" data-testid="text-detail-price">
                            {listing.othersPrice != null
                              ? `₹${listing.othersPrice}`
                              : <span className="text-foreground/70">{t("contactForPrice")}</span>}
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
                            {listing.othersBrand && (
                              <p className="text-sm font-medium" data-testid="text-detail-others-brand">{t("othersBrand")}: {listing.othersBrand}</p>
                            )}
                            {listing.othersCondition && (
                              <p className="text-sm font-medium" data-testid="text-detail-others-condition">{t("othersCondition")}: {othersConditionLabel(listing.othersCondition)}</p>
                            )}
                            {listing.othersWarrantyYears != null && (
                              <p className="text-sm font-medium" data-testid="text-detail-others-warranty">{t("othersWarrantyYears")}: {listing.othersWarrantyYears}</p>
                            )}
                            {listing.othersReturnPolicy && (
                              <p className="text-sm font-medium" data-testid="text-detail-others-return">{t("othersReturnPolicy")}: {othersReturnPolicyLabel(listing.othersReturnPolicy)}</p>
                            )}
                          </div>
                          {listing.othersMaterials && (
                            <p className="text-sm font-medium mt-1.5" data-testid="text-detail-others-materials">{t("othersMaterials")}: {listing.othersMaterials}</p>
                          )}
                          {listing.othersDimensions && (
                            <p className="text-sm font-medium" data-testid="text-detail-others-dimensions">{t("othersDimensions")}: {listing.othersDimensions}</p>
                          )}
                          {/* Task #84: extras are intentionally unlabeled.
                              Each non-empty extra cell renders as a raw
                              line so the seller can use the slot for any
                              freeform fact (warranty terms, accessory
                              list, certification, etc.) without an
                              "Extra Info:" heading boxing it in. */}
                          {(listing.othersExtra1 || listing.othersExtra2 || listing.othersExtra3 || listing.othersExtra4 || listing.othersExtra5) && (
                            <div className="mt-1.5 space-y-0.5">
                              {[listing.othersExtra1, listing.othersExtra2, listing.othersExtra3, listing.othersExtra4, listing.othersExtra5]
                                .filter((x): x is string => !!x && x.trim().length > 0)
                                .map((line, idx) => (
                                  <p
                                    key={idx}
                                    className="text-sm font-medium"
                                    data-testid={`text-detail-others-extra-${idx + 1}`}
                                  >
                                    {line}
                                  </p>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span data-testid="text-detail-location">
                          {[listing.sellerVillage, listing.sellerTehsil, listing.sellerDistrict].filter(Boolean).join(", ") || "—"}
                        </span>
                        {dist !== null && (
                          <span className="text-primary font-semibold">({Math.round(dist)} km)</span>
                        )}
                      </div>

                      <div className="text-sm font-medium text-foreground/70">
                        {t("listedOn")}: {new Date(listing.createdAt).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN")}
                        {" · "}{daysSinceListed(listing)} {t("daysAgo")}
                      </div>

                      {/* Task #79: seller's freehand notes — detail popup
                          only (intentionally NOT on the card grid to keep
                          cards scannable). Hidden when null/empty. */}
                      {listing.additionalNotes && listing.additionalNotes.trim() && (
                        <div
                          className="text-sm font-medium bg-muted/40 border border-muted rounded-md px-3 py-2 break-words"
                          data-testid={`text-detail-notes-${listing.id}`}
                        >
                          <span className="text-muted-foreground">{t("additionalNotesLabel")}: </span>
                          {listing.additionalNotes}
                        </div>
                      )}

                      {detailRatingQuery.data && (
                        <div className="space-y-2">
                          <StarDisplay avg={detailRatingQuery.data.avg} count={detailRatingQuery.data.count} size="md" />
                          {isAuthenticated && !isOwner && (
                            <div className="flex items-center gap-2" data-testid="rate-section">
                              <span className="text-xs text-muted-foreground">{t("yourRating")}:</span>
                              <InteractiveStars
                                currentRating={detailRatingQuery.data.myRating || 0}
                                onRate={(stars) => rateMutation.mutate({ listingId: listing.id, stars })}
                                disabled={rateMutation.isPending}
                              />
                            </div>
                          )}
                          {isOwner && (
                            <p className="text-xs text-muted-foreground italic">{t("cannotRateOwn")}</p>
                          )}
                        </div>
                      )}

                      <div className="pt-2 border-t space-y-2">
                        {isAuthenticated ? (
                          contactInfo[listing.id] ? (
                            <div className="space-y-1.5 text-sm" data-testid="text-detail-contact">
                              <div className="flex items-center gap-3">
                                <div>
                                  <p className="font-semibold">{contactInfo[listing.id].name}</p>
                                  <a href={`tel:+91${contactInfo[listing.id].phone}`} className="text-primary font-medium flex items-center gap-1">
                                    <Phone className="w-3.5 h-3.5" />
                                    +91 {contactInfo[listing.id].phone}
                                  </a>
                                </div>
                              </div>
                              {(contactInfo[listing.id].sellerRatingCount ?? 0) > 0 && (
                                <div className="flex items-center gap-1.5" data-testid="seller-rating">
                                  <span className="text-xs text-muted-foreground">{t("sellerRating")}:</span>
                                  <StarDisplay avg={contactInfo[listing.id].sellerAvgRating ?? 0} count={contactInfo[listing.id].sellerRatingCount ?? 0} />
                                </div>
                              )}
                            </div>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleContactClick(listing.id)}
                              disabled={contactLoading === listing.id}
                              data-testid="button-detail-contact"
                            >
                              {contactLoading === listing.id ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                              ) : (
                                <Phone className="w-4 h-4 mr-1" />
                              )}
                              {t("contactSeller")}
                            </Button>
                          )
                        ) : (
                          <Link
                            href={`/auth?next=${encodeURIComponent(`/marketplace?listing=${listing.id}`)}`}
                            className="text-sm text-primary hover:underline"
                            data-testid={`link-login-detail-${listing.id}`}
                          >
                            {t("loginToContact")}
                          </Link>
                        )}
                        {canManage && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(listing)}
                              data-testid="button-detail-edit"
                            >
                              <Pencil className="w-4 h-4 mr-1" />
                              {t("editListing")}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm(t("deleteListingConfirm"))) {
                                  deleteMutation.mutate(listing.id);
                                }
                              }}
                              data-testid="button-detail-delete"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              {t("deleteListing")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {lightboxListing && (() => {
        const total = lightboxListing.photoCount || (lightboxListing.photoMime ? 1 : 0);
        if (total === 0) return null;
        const safeIndex = Math.min(Math.max(lightboxIndex, 0), total - 1);
        return (
          <PhotoLightbox
            open={lightboxOpen}
            index={safeIndex}
            total={total}
            srcFor={(i) => `/api/marketplace/${lightboxListing.id}/image?index=${i}`}
            onIndexChange={(i) => {
              setLightboxIndex(i);
              if (detailListing && detailListing.id === lightboxListing.id) {
                setDetailPhotoIndex(i);
              }
            }}
            onClose={() => setLightboxOpen(false)}
          />
        );
      })()}
    </div>
  );
}
