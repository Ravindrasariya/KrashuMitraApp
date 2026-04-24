import { useState, useRef, useEffect } from "react";
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
import { Plus, MapPin, Phone, Loader2, ShoppingBag, Camera, Trash2, ArrowUpDown, X, Sprout, Leaf, ChevronLeft, ChevronRight, ImageIcon, Star, Check, ChevronsUpDown, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotoLightbox } from "@/components/photo-lightbox";
import {
  MARKETPLACE_ONION_SEED_TYPES,
  MARKETPLACE_ONION_SEED_VARIETIES,
  MARKETPLACE_ONION_SEED_BRANDS,
  type MarketplaceListing,
} from "@shared/schema";

type ListingNoPhoto = Omit<MarketplaceListing, "photoData"> & { photoCount: number; avgRating: number; ratingCount: number };

const POTATO_VARIETIES = ["CS3", "CS1", "Torus", "Pukhraj", "Jyoti", "Lakar", "Others"];
const POTATO_BRANDS = ["Merino", "Technico", "Uttkal", "Jain", "Jalandhar", "Merath"];
const MAX_PHOTOS = 3;

// Onion-seed dropdown values come from shared/schema.ts so the seller form
// here and the POST /api/marketplace allow-list cannot drift apart.
const ONION_SEED_TYPES: string[] = [...MARKETPLACE_ONION_SEED_TYPES];
const ONION_SEED_VARIETIES: string[] = [...MARKETPLACE_ONION_SEED_VARIETIES];
const ONION_SEED_BRANDS: string[] = [...MARKETPLACE_ONION_SEED_BRANDS];

const SOYABEAN_DURATIONS = ["Long", "Short"] as const;

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
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"latest" | "nearest" | "oldest">("latest");
  const [sortOpen, setSortOpen] = useState(false);
  const [viewerCoords, setViewerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [contactInfo, setContactInfo] = useState<{ [id: number]: { name: string; phone: string; farmerCode: string; sellerAvgRating?: number; sellerRatingCount?: number } }>({});
  const [contactLoading, setContactLoading] = useState<number | null>(null);
  const [detailListing, setDetailListing] = useState<ListingNoPhoto | null>(null);
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [cardPhotoIndex, setCardPhotoIndex] = useState<Record<number, number>>({});
  const cardSwipeRef = useRef<Map<number, { startX: number; startY: number; swiped: boolean }>>(new Map());

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
    }
    if (editingListingId != null) {
      updateMutation.mutate({ id: editingListingId, data });
    } else {
      createMutation.mutate(data);
    }
  }

  async function openEditDialog(listing: ListingNoPhoto) {
    resetForm();
    setCategory(listing.category);
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
      : cat;

  const categoryBadgeColor = (cat: string) =>
    cat === "onion_seedling"
      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      : cat === "potato_seed"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : cat === "onion_seed"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
      : "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300";

  const categoryPlaceholderBg = (cat: string) =>
    cat === "onion_seedling"
      ? "bg-green-50 dark:bg-green-950/30"
      : cat === "potato_seed"
      ? "bg-amber-50 dark:bg-amber-950/30"
      : cat === "onion_seed"
      ? "bg-rose-50 dark:bg-rose-950/30"
      : "bg-violet-50 dark:bg-violet-950/30";

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
    return <Sprout className={`${cls} text-violet-300 dark:text-violet-700`} />;
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

  const hn = (val: string | null | undefined) => {
    if (!val) return val;
    return language === "hi" ? (HINDI_NAMES[val] || val) : val;
  };

  const sortLabel = sortBy === "latest" ? t("sortLatest") : sortBy === "nearest" ? t("sortNearest") : t("sortOldest");

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
            const isOnion = listing.category === "onion_seedling";
            const isOnionSeed = listing.category === "onion_seed";
            const isSoyabeanSeed = listing.category === "soyabean_seed";
            const hasPhoto = listing.photoCount > 0 || listing.photoMime;
            const cardTotalPhotos = listing.photoCount || (listing.photoMime ? 1 : 0);
            const cardIdxRaw = cardPhotoIndex[listing.id] ?? 0;
            const cardIdx = cardTotalPhotos > 0 ? Math.min(cardIdxRaw, cardTotalPhotos - 1) : 0;
            const showCardSwipe = cardTotalPhotos > 1;
            return (
              <Card
                key={listing.id}
                className="group relative overflow-hidden flex flex-col cursor-pointer rounded-2xl border-card-border/80 bg-gradient-to-br from-card via-card to-card/70 dark:from-card dark:via-card dark:to-background/60 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/20 transition-all duration-300 ease-out will-change-transform"
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
                  </div>
                ) : (
                  <div className={`w-full aspect-[4/3] flex items-center justify-center ${categoryPlaceholderBg(listing.category)}`}>
                    {renderPlaceholderIcon(listing.category, "sm")}
                  </div>
                )}

                <div className="relative z-10 p-2 flex flex-col flex-1 gap-1">
                  <Badge className={`text-xs font-semibold px-1.5 py-0.5 leading-4 w-fit ${categoryBadgeColor(listing.category)}`} data-testid={`badge-category-${listing.id}`}>
                    {categoryLabel(listing.category)}
                  </Badge>

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
                    {!isOnion && !isOnionSeed && !isSoyabeanSeed && (
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

                  <div className="text-xs font-medium text-foreground/70">
                    {new Date(listing.createdAt).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN")}
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
                      <span className="text-[9px] text-muted-foreground">{t("loginToContact")}</span>
                    )}
                    {isOwner && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-auto"
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
        capture="environment"
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
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={!category || createMutation.isPending || updateMutation.isPending || editPhotosLoading}
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
        <Dialog open={!!detailListing} onOpenChange={(open) => { if (!open) { setDetailListing(null); setLightboxOpen(false); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
            <div>
              {(() => {
                const listing = detailListing;
                const isOnion = listing.category === "onion_seedling";
                const isOnionSeed = listing.category === "onion_seed";
                const isSoyabeanSeed = listing.category === "soyabean_seed";
                const totalPhotos = listing.photoCount || (listing.photoMime ? 1 : 0);
                const hasPhotos = totalPhotos > 0;
                const dist = getDistanceKm(listing);
                const isOwner = user?.id === listing.sellerId;

                return (
                  <>
                    <div className="relative">
                      {hasPhotos ? (
                        <img
                          src={`/api/marketplace/${listing.id}/image?index=${detailPhotoIndex}`}
                          alt=""
                          className="w-full aspect-[4/3] object-cover cursor-zoom-in"
                          onClick={() => setLightboxOpen(true)}
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
                        <Badge className={`text-sm font-semibold px-2 py-0.5 ${categoryBadgeColor(listing.category)}`}>
                          {categoryLabel(listing.category)}
                        </Badge>
                        {isOwner && (
                          <Badge variant="outline" className="text-xs">
                            {t("myListing")}
                          </Badge>
                        )}
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
                      {!isOnion && !isOnionSeed && !isSoyabeanSeed && (
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
                          <p className="text-sm text-muted-foreground">{t("loginToContact")}</p>
                        )}
                        {isOwner && (
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

      {detailListing && (() => {
        const total = detailListing.photoCount || (detailListing.photoMime ? 1 : 0);
        if (total === 0) return null;
        const safeIndex = Math.min(Math.max(detailPhotoIndex, 0), total - 1);
        return (
          <PhotoLightbox
            open={lightboxOpen}
            index={safeIndex}
            total={total}
            srcFor={(i) => `/api/marketplace/${detailListing.id}/image?index=${i}`}
            onIndexChange={setDetailPhotoIndex}
            onClose={() => setLightboxOpen(false)}
          />
        );
      })()}
    </div>
  );
}
