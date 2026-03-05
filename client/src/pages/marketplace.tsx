import { useState, useRef } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, MapPin, Phone, Loader2, ShoppingBag, Camera, Trash2, ArrowUpDown, X, User, Sprout, Leaf } from "lucide-react";
import type { MarketplaceListing } from "@shared/schema";

type ListingNoPhoto = Omit<MarketplaceListing, "photoData">;

const POTATO_VARIETIES = ["CS3", "CS1", "Torus", "Pukhraj", "Jyoti", "Lakar", "Others"];
const POTATO_BRANDS = ["Merino", "Technico", "Uttkal", "Jain", "Jalandhar", "Merath"];

export default function MarketplacePage() {
  const { t, language } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string>("");
  const [quantityBigha, setQuantityBigha] = useState("");
  const [availableDays, setAvailableDays] = useState("");
  const [onionType, setOnionType] = useState("");
  const [quantityBags, setQuantityBags] = useState("");
  const [potatoVariety, setPotatoVariety] = useState("");
  const [potatoBrand, setPotatoBrand] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"latest" | "nearest">("latest");
  const [viewerCoords, setViewerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [contactInfo, setContactInfo] = useState<{ [id: number]: { name: string; phone: string; farmerCode: string } }>({});
  const [contactLoading, setContactLoading] = useState<number | null>(null);
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

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/marketplace/${id}`);
    },
    onSuccess: () => {
      toast({ title: t("listingDeleted") });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
    },
  });

  function resetForm() {
    setCategory("");
    setPhotoPreview(null);
    setPhotoBase64(null);
    setPhotoMime("");
    setQuantityBigha("");
    setAvailableDays("");
    setOnionType("");
    setQuantityBags("");
    setPotatoVariety("");
    setPotatoBrand("");
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPhotoPreview(result);
      setPhotoBase64(result.split(",")[1]);
      setPhotoMime(file.type);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleSubmit() {
    if (!category) return;
    const data: any = { category };
    if (photoBase64) {
      data.photoData = photoBase64;
      data.photoMime = photoMime;
    }
    if (category === "onion_seedling") {
      data.quantityBigha = quantityBigha;
      data.availableAfterDays = availableDays;
      data.onionType = onionType;
    } else {
      data.quantityBags = quantityBags;
      data.potatoVariety = potatoVariety;
      data.potatoBrand = potatoBrand;
    }
    createMutation.mutate(data);
  }

  async function handleContactClick(id: number) {
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

  function handleSortNearest() {
    if (sortBy === "nearest") {
      setSortBy("latest");
      return;
    }
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

  const sortedListings = [...listings].sort((a, b) => {
    if (sortBy === "nearest" && viewerCoords) {
      const dA = getDistanceKm(a);
      const dB = getDistanceKm(b);
      if (dA !== null && dB !== null) return dA - dB;
      if (dA !== null) return -1;
      if (dB !== null) return 1;
    }
    const dateCompare = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (dateCompare !== 0) return dateCompare;
    return a.category.localeCompare(b.category);
  });

  const categoryLabel = (cat: string) =>
    cat === "onion_seedling" ? t("onionSeedling") : t("potatoSeed");

  const categoryBadgeColor = (cat: string) =>
    cat === "onion_seedling"
      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";

  return (
    <div className="max-w-5xl mx-auto px-3 py-4 pb-24 md:pb-6" data-testid="page-marketplace">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold" data-testid="text-marketplace-title">{t("marketplace")}</h2>
        {isAuthenticated && (
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-sale">
            <Plus className="w-4 h-4 mr-1" />
            {t("addSale")}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <div className="flex gap-1">
          {["all", "onion_seedling", "potato_seed"].map(cat => (
            <Button
              key={cat}
              variant={filterCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterCategory(cat)}
              data-testid={`filter-${cat}`}
            >
              {cat === "all" ? t("allCategories") : cat === "onion_seedling" ? t("onionSeedling") : t("potatoSeed")}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSortNearest}
          className="ml-auto"
          data-testid="button-sort"
        >
          <ArrowUpDown className="w-3 h-3 mr-1" />
          {sortBy === "latest" ? t("sortNearest") : t("sortLatest")}
        </Button>
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3">
          {sortedListings.map(listing => {
            const dist = getDistanceKm(listing);
            const isOwner = user?.id === listing.sellerId;
            const isOnion = listing.category === "onion_seedling";
            return (
              <Card key={listing.id} className="overflow-hidden flex flex-col" data-testid={`card-listing-${listing.id}`}>
                {listing.photoMime ? (
                  <img
                    src={`/api/marketplace/${listing.id}/image`}
                    alt=""
                    className="w-full aspect-square object-cover"
                    data-testid={`img-listing-${listing.id}`}
                  />
                ) : (
                  <div className={`w-full aspect-square flex items-center justify-center ${isOnion ? "bg-green-50 dark:bg-green-950/30" : "bg-amber-50 dark:bg-amber-950/30"}`}>
                    {isOnion ? (
                      <Sprout className="w-12 h-12 text-green-300 dark:text-green-700" />
                    ) : (
                      <Leaf className="w-12 h-12 text-amber-300 dark:text-amber-700" />
                    )}
                  </div>
                )}

                <div className="p-2 flex flex-col flex-1 gap-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge className={`text-[10px] px-1.5 py-0 leading-4 ${categoryBadgeColor(listing.category)}`} data-testid={`badge-category-${listing.id}`}>
                      {categoryLabel(listing.category)}
                    </Badge>
                    {isOwner && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 leading-4" data-testid={`badge-owner-${listing.id}`}>
                        {t("myListing")}
                      </Badge>
                    )}
                  </div>

                  <div className="flex-1 min-h-0">
                    {isOnion ? (
                      <>
                        {listing.quantityBigha && (
                          <p className="text-sm font-semibold leading-tight" data-testid={`text-qty-${listing.id}`}>
                            {listing.quantityBigha} {t("bigha")}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground leading-tight truncate">
                          {[
                            listing.availableAfterDays != null ? `${listing.availableAfterDays} ${t("daysAvailable")}` : null,
                            listing.onionType,
                          ].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </>
                    ) : (
                      <>
                        {listing.quantityBags && (
                          <p className="text-sm font-semibold leading-tight" data-testid={`text-qty-${listing.id}`}>
                            {listing.quantityBags} {t("bags")}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground leading-tight truncate">
                          {[listing.potatoVariety, listing.potatoBrand].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground mt-auto">
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate" data-testid={`text-location-${listing.id}`}>
                      {[listing.sellerVillage, listing.sellerDistrict].filter(Boolean).join(", ") || "—"}
                    </span>
                    {dist !== null && (
                      <span className="shrink-0 text-primary font-medium ml-0.5">({Math.round(dist)}km)</span>
                    )}
                  </div>

                  <div className="text-[10px] text-muted-foreground">
                    {new Date(listing.createdAt).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN")}
                  </div>

                  <div className="flex items-center gap-0.5 pt-1 border-t border-border/40">
                    {isAuthenticated ? (
                      contactInfo[listing.id] ? (
                        <div className="text-[10px] flex-1 min-w-0" data-testid={`text-contact-${listing.id}`}>
                          <p className="font-medium truncate">{contactInfo[listing.id].name}</p>
                          <a href={`tel:+91${contactInfo[listing.id].phone}`} className="text-primary flex items-center gap-0.5">
                            <Phone className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{contactInfo[listing.id].phone}</span>
                          </a>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleContactClick(listing.id)}
                          disabled={contactLoading === listing.id}
                          data-testid={`button-contact-${listing.id}`}
                        >
                          {contactLoading === listing.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Phone className="w-3 h-3 text-primary" />
                              <span className="text-primary">{t("contact")}</span>
                            </>
                          )}
                        </Button>
                      )
                    ) : (
                      <span className="text-[9px] text-muted-foreground">{t("loginToContact")}</span>
                    )}
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto"
                        onClick={() => {
                          if (confirm(t("deleteListingConfirm"))) {
                            deleteMutation.mutate(listing.id);
                          }
                        }}
                        data-testid={`button-delete-listing-${listing.id}`}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
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

      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { resetForm(); setAddOpen(false); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addSale")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm">{t("selectItem")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder={t("selectItem")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onion_seedling">{t("onionSeedling")}</SelectItem>
                  <SelectItem value="potato_seed">{t("potatoSeed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-add-photo"
              >
                <Camera className="w-4 h-4 mr-2" />
                {photoPreview ? t("changePhoto") : t("addPhoto")}
              </Button>
              {photoPreview && (
                <div className="relative mt-2">
                  <img src={photoPreview} alt="" className="w-full h-32 object-cover rounded-md" />
                  <button
                    onClick={() => { setPhotoPreview(null); setPhotoBase64(null); setPhotoMime(""); }}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"
                    data-testid="button-remove-photo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
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
                        <SelectItem key={v} value={v}>{v}</SelectItem>
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
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={!category || createMutation.isPending}
              className="w-full"
              data-testid="button-submit-listing"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
