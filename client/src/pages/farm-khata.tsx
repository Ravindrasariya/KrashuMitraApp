import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { KhataItemDialog } from "@/components/khata-item-dialog";
import { Plus, ChevronDown, ChevronUp, Trash2, Pencil, IndianRupee, Loader2 } from "lucide-react";
import type { KhataRegister, KhataItem, CropCard } from "@shared/schema";

const KHATA_TYPES = [
  { value: "all", labelKey: "allKhata" as const },
  { value: "crop_card", labelKey: "cropCardKhata" as const },
  { value: "batai", labelKey: "bataiKhata" as const },
  { value: "panat", labelKey: "panatKhata" as const },
  { value: "miscellaneous", labelKey: "miscKhata" as const },
  { value: "rental", labelKey: "rentalKhata" as const },
];

const MONTHS: { value: string; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "allMonths" },
  { value: "1", labelKey: "january" },
  { value: "2", labelKey: "february" },
  { value: "3", labelKey: "march" },
  { value: "4", labelKey: "april" },
  { value: "5", labelKey: "may" },
  { value: "6", labelKey: "june" },
  { value: "7", labelKey: "july" },
  { value: "8", labelKey: "august" },
  { value: "9", labelKey: "september" },
  { value: "10", labelKey: "october" },
  { value: "11", labelKey: "november" },
  { value: "12", labelKey: "december" },
];

const CATEGORY_LABELS: Record<string, TranslationKey> = {
  farm_preparation: "farmPreparation",
  seed_cost: "seedCost",
  plantation: "plantation",
  fertiliser: "fertiliser",
  pesticide: "pesticide",
  manual_weed: "manualWeed",
  watering_labour: "wateringLabour",
  harvest: "harvest",
};

export default function FarmKhataPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newKhataOpen, setNewKhataOpen] = useState(false);
  const [editKhataOpen, setEditKhataOpen] = useState(false);
  const [editingKhata, setEditingKhata] = useState<KhataRegister | null>(null);
  const [deleteKhataId, setDeleteKhataId] = useState<number | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KhataItem | null>(null);
  const [activeRegisterId, setActiveRegisterId] = useState<number | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [deleteItemRegisterId, setDeleteItemRegisterId] = useState<number | null>(null);

  const queryParams = new URLSearchParams();
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (yearFilter !== "all") queryParams.set("year", yearFilter);
  if (monthFilter !== "all") queryParams.set("month", monthFilter);
  const queryString = queryParams.toString();

  const { data: registers = [], isLoading } = useQuery<KhataRegister[]>({
    queryKey: ["/api/khata", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/khata?${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: cropCards = [] } = useQuery<CropCard[]>({
    queryKey: ["/api/crop-cards"],
  });

  const expandedData = useQuery<KhataRegister & { items: KhataItem[] }>({
    queryKey: ["/api/khata", expandedId],
    queryFn: async () => {
      const res = await fetch(`/api/khata/${expandedId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!expandedId,
  });

  const createKhataMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/khata", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setNewKhataOpen(false);
      toast({ title: t("khataCreated") });
    },
  });

  const updateKhataMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/khata/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setEditKhataOpen(false);
      setEditingKhata(null);
      toast({ title: t("khataUpdated") });
    },
  });

  const deleteKhataMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/khata/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setDeleteKhataId(null);
      setExpandedId(null);
      toast({ title: t("khataDeleted") });
    },
  });

  const createItemMut = useMutation({
    mutationFn: async ({ registerId, data }: { registerId: number; data: any }) => {
      const res = await apiRequest("POST", `/api/khata/${registerId}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setItemDialogOpen(false);
      setEditingItem(null);
      toast({ title: t("itemAdded") });
    },
  });

  const updateItemMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/khata/items/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setItemDialogOpen(false);
      setEditingItem(null);
      toast({ title: t("itemUpdated") });
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/khata/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setDeleteItemId(null);
      toast({ title: t("itemDeleted") });
    },
  });

  const totalDue = registers.reduce((sum, r) => sum + (parseFloat(r.totalDue) || 0), 0);
  const totalPaid = registers.reduce((sum, r) => sum + (parseFloat(r.totalPaid) || 0), 0);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const handleItemSave = (data: any) => {
    if (editingItem) {
      updateItemMut.mutate({ id: editingItem.id, data });
    } else if (activeRegisterId) {
      createItemMut.mutate({ registerId: activeRegisterId, data });
    }
  };

  const getCropCardLabel = (cardId: number | null) => {
    if (!cardId) return "";
    const card = cropCards.find(c => c.id === cardId);
    return card ? `${card.cropName} (${card.startDate})` : "";
  };

  return (
    <div className="px-4 py-4 pb-24 md:pb-8 max-w-3xl mx-auto" data-testid="page-farmKhata">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold" data-testid="text-page-title">{t("farmKhata")}</h1>
        <Button
          size="sm"
          onClick={() => setNewKhataOpen(true)}
          data-testid="button-new-khata"
        >
          <Plus className="w-4 h-4 mr-1" />
          {t("newKhata")}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="text-xs h-9" data-testid="select-type-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KHATA_TYPES.map(kt => (
              <SelectItem key={kt.value} value={kt.value}>{t(kt.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="text-xs h-9" data-testid="select-year-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allYears")}</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="text-xs h-9" data-testid="select-month-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map(m => (
              <SelectItem key={m.value} value={m.value}>{t(m.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("totalDue")}</p>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400" data-testid="text-total-due">
              ₹{totalDue.toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("totalPaid")}</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-total-paid">
              ₹{totalPaid.toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : registers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-khata">
          <IndianRupee className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t("noKhata")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registers.map(reg => {
            const isExpanded = expandedId === reg.id;
            const items = isExpanded ? (expandedData.data?.items || []) : [];
            const due = parseFloat(reg.totalDue) || 0;
            const paid = parseFloat(reg.totalPaid) || 0;
            const total = due + paid;

            return (
              <Card key={reg.id} data-testid={`card-khata-${reg.id}`}>
                <div
                  className="p-3 cursor-pointer flex items-center justify-between"
                  onClick={() => setExpandedId(isExpanded ? null : reg.id)}
                  data-testid={`button-expand-khata-${reg.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm truncate">{reg.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                        {t(KHATA_TYPES.find(k => k.value === reg.khataType)?.labelKey || "cropCardKhata")}
                      </span>
                    </div>
                    {reg.cropCardId && (
                      <p className="text-xs text-muted-foreground truncate">{getCropCardLabel(reg.cropCardId)}</p>
                    )}
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-orange-600">₹{due.toLocaleString("en-IN")} {t("unpaid")}</span>
                      <span className="text-xs text-green-600">₹{paid.toLocaleString("en-IN")} {t("paid")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold">₹{total.toLocaleString("en-IN")}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-3 pb-3">
                    <div className="flex gap-2 py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setActiveRegisterId(reg.id); setEditingItem(null); setItemDialogOpen(true); }}
                        data-testid={`button-add-item-${reg.id}`}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {t("addItem")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setEditingKhata(reg); setEditKhataOpen(true); }}
                        data-testid={`button-edit-khata-${reg.id}`}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        {t("edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteKhataId(reg.id); }}
                        data-testid={`button-delete-khata-${reg.id}`}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        {t("delete")}
                      </Button>
                    </div>

                    {expandedData.isLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    ) : items.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-3 text-center">{t("noKhata")}</p>
                    ) : (
                      <div className="space-y-2">
                        {items.map(item => (
                          <div
                            key={item.id}
                            className="bg-muted/50 rounded-md p-2.5 text-sm"
                            data-testid={`item-${item.id}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{t(CATEGORY_LABELS[item.expenseCategory] || "others")}</span>
                                  {item.subType && (
                                    <span className="text-xs bg-background px-1.5 py-0.5 rounded">{item.subType}</span>
                                  )}
                                  <span className={`text-[10px] px-1 py-0.5 rounded ${item.isPaid ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                                    {item.isPaid ? t("paid") : t("unpaid")}
                                  </span>
                                </div>
                                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>{item.date}</span>
                                  {item.hours && <span>{item.hours} {t("hoursTaken")}</span>}
                                  {item.perBighaRate && <span>@₹{item.perBighaRate}</span>}
                                </div>
                                {item.remarks && <p className="text-xs text-muted-foreground mt-1">{item.remarks}</p>}
                              </div>
                              <div className="flex items-center gap-1 ml-2 shrink-0">
                                <span className="font-bold text-sm">₹{parseFloat(item.totalCost).toLocaleString("en-IN")}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => { setActiveRegisterId(reg.id); setEditingItem(item); setItemDialogOpen(true); }}
                                  data-testid={`button-edit-item-${item.id}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => { setDeleteItemId(item.id); setDeleteItemRegisterId(reg.id); }}
                                  data-testid={`button-delete-item-${item.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {items.length > 0 && (
                      <div className="flex justify-between mt-3 pt-2 border-t text-sm font-semibold">
                        <span>{t("totalExpense")}</span>
                        <span>₹{(due + paid).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <NewKhataDialog
        open={newKhataOpen}
        onOpenChange={setNewKhataOpen}
        cropCards={cropCards}
        onSave={(data) => createKhataMut.mutate(data)}
        isPending={createKhataMut.isPending}
      />

      {editingKhata && (
        <EditKhataDialog
          open={editKhataOpen}
          onOpenChange={(v) => { setEditKhataOpen(v); if (!v) setEditingKhata(null); }}
          khata={editingKhata}
          onSave={(data) => updateKhataMut.mutate({ id: editingKhata.id, data })}
          isPending={updateKhataMut.isPending}
        />
      )}

      <KhataItemDialog
        open={itemDialogOpen}
        onOpenChange={(v) => { setItemDialogOpen(v); if (!v) setEditingItem(null); }}
        onSave={handleItemSave}
        editItem={editingItem}
        isPending={createItemMut.isPending || updateItemMut.isPending}
      />

      <AlertDialog open={deleteKhataId !== null} onOpenChange={(v) => { if (!v) setDeleteKhataId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteKhata")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteKhataConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-khata">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKhataId && deleteKhataMut.mutate(deleteKhataId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-khata"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteItemId !== null} onOpenChange={(v) => { if (!v) setDeleteItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteItemConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-item">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItemId && deleteItemMut.mutate(deleteItemId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-item"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewKhataDialog({ open, onOpenChange, cropCards, onSave, isPending }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cropCards: CropCard[];
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [khataType, setKhataType] = useState("crop_card");
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [plantationDate, setPlantationDate] = useState("");
  const [harvestDate, setHarvestDate] = useState("");
  const [production, setProduction] = useState("");
  const [productionUnit, setProductionUnit] = useState("quintal");

  const isCropCard = khataType === "crop_card";
  const selectedCard = cropCards.find(c => c.id.toString() === selectedCardId);

  const handleCardSelect = (val: string) => {
    setSelectedCardId(val);
    if (val !== "none") {
      const card = cropCards.find(c => c.id.toString() === val);
      if (card) {
        setTitle(`${card.cropName} ${card.startDate}`);
        setPlantationDate(card.startDate);
      }
    } else {
      setTitle("");
      setPlantationDate("");
      setHarvestDate("");
      setProduction("");
    }
  };

  const handleSave = () => {
    if (!title || (isCropCard && !plantationDate)) return;
    const data: any = {
      khataType,
      title,
      plantationDate: plantationDate || null,
      harvestDate: harvestDate || null,
      production: production || null,
      productionUnit: productionUnit || null,
    };
    if (isCropCard && selectedCardId && selectedCardId !== "none") {
      data.cropCardId = parseInt(selectedCardId);
    }
    onSave(data);
    setTitle("");
    setSelectedCardId("");
    setPlantationDate("");
    setHarvestDate("");
    setProduction("");
  };

  const isOtherType = !isCropCard;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newKhata")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t("khataType")}</Label>
            <Select value={khataType} onValueChange={setKhataType}>
              <SelectTrigger data-testid="select-new-khata-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KHATA_TYPES.filter(k => k.value !== "all").map(kt => (
                  <SelectItem key={kt.value} value={kt.value}>{t(kt.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isOtherType && (
            <p className="text-sm text-muted-foreground text-center py-2">{t("comingSoon")}</p>
          )}

          {isCropCard && (
            <>
              <div>
                <Label>{t("selectCropCard")}</Label>
                <Select value={selectedCardId} onValueChange={handleCardSelect}>
                  <SelectTrigger data-testid="select-crop-card">
                    <SelectValue placeholder={t("noCropCardSelected")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("noCropCardSelected")}</SelectItem>
                    {cropCards.map(card => (
                      <SelectItem key={card.id} value={card.id.toString()}>
                        {card.cropName} ({card.startDate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t("khataTitle")}</Label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={t("khataTitle")}
                  data-testid="input-khata-title"
                />
              </div>

              <div>
                <Label>{t("plantationDate")} *</Label>
                <Input
                  type="date"
                  value={plantationDate}
                  onChange={e => setPlantationDate(e.target.value)}
                  data-testid="input-plantation-date"
                />
              </div>

              <div>
                <Label>{t("harvestDate")}</Label>
                <Input
                  type="date"
                  value={harvestDate}
                  onChange={e => setHarvestDate(e.target.value)}
                  data-testid="input-harvest-date"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("production")}</Label>
                  <Input
                    type="number"
                    value={production}
                    onChange={e => setProduction(e.target.value)}
                    placeholder={t("production")}
                    data-testid="input-production"
                  />
                </div>
                <div>
                  <Label>{t("productionPerBigha")}</Label>
                  <Select value={productionUnit} onValueChange={setProductionUnit}>
                    <SelectTrigger data-testid="select-production-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quintal">क्विंटल / Quintal</SelectItem>
                      <SelectItem value="kg">किलो / Kg</SelectItem>
                      <SelectItem value="bag">बोरी / Bag</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" data-testid="button-cancel-new-khata">
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!title || (isCropCard && !plantationDate) || isOtherType || isPending}
              className="flex-1"
              data-testid="button-create-khata"
            >
              {isPending ? t("loading") : t("createKhata")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditKhataDialog({ open, onOpenChange, khata, onSave, isPending }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  khata: KhataRegister;
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(khata.title);
  const [plantationDate, setPlantationDate] = useState(khata.plantationDate || "");
  const [harvestDate, setHarvestDate] = useState(khata.harvestDate || "");
  const [production, setProduction] = useState(khata.production || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editKhata")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("khataTitle")}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} data-testid="input-edit-khata-title" />
          </div>
          <div>
            <Label>{t("plantationDate")}</Label>
            <Input type="date" value={plantationDate} onChange={e => setPlantationDate(e.target.value)} data-testid="input-edit-plantation-date" />
          </div>
          <div>
            <Label>{t("harvestDate")}</Label>
            <Input type="date" value={harvestDate} onChange={e => setHarvestDate(e.target.value)} data-testid="input-edit-harvest-date" />
          </div>
          <div>
            <Label>{t("production")}</Label>
            <Input value={production} onChange={e => setProduction(e.target.value)} data-testid="input-edit-production" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" data-testid="button-cancel-edit-khata">
              {t("cancel")}
            </Button>
            <Button
              onClick={() => onSave({ title, plantationDate: plantationDate || null, harvestDate: harvestDate || null, production: production || null })}
              disabled={!title || isPending}
              className="flex-1"
              data-testid="button-save-edit-khata"
            >
              {isPending ? t("loading") : t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
