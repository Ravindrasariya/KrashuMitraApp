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
import { KhataItemDialog, SUB_TYPES } from "@/components/khata-item-dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ChevronDown, ChevronUp, Trash2, Pencil, IndianRupee, Loader2, Archive, ArchiveRestore, Banknote } from "lucide-react";
import type { KhataRegister, KhataItem, CropCard, PanatPayment } from "@shared/schema";

const KHATA_TYPES = [
  { value: "all", labelKey: "allKhata" as const },
  { value: "crop_card", labelKey: "cropCardKhata" as const },
  { value: "batai", labelKey: "bataiKhata" as const },
  { value: "panat", labelKey: "panatKhata" as const },
  { value: "miscellaneous", labelKey: "miscKhata" as const },
  { value: "rental", labelKey: "rentalKhata" as const },
];

const MACHINERY_OPTIONS = [
  { value: "harvester", labelKey: "machineryHarvester" as const },
  { value: "pesticide_spray", labelKey: "machineryPesticideSpray" as const },
  { value: "plantar", labelKey: "machineryPlantar" as const },
  { value: "rotavator", labelKey: "machineryRotavator" as const },
  { value: "seed_drill", labelKey: "machinerySeedDrill" as const },
  { value: "thresher", labelKey: "machineryThresher" as const },
  { value: "tractor", labelKey: "machineryTractor" as const },
  { value: "tractor_trolley", labelKey: "machineryTractorTrolley" as const },
  { value: "others", labelKey: "machineryOthers" as const },
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
  const [showArchived, setShowArchived] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newKhataOpen, setNewKhataOpen] = useState(false);
  const [editKhataOpen, setEditKhataOpen] = useState(false);
  const [editingKhata, setEditingKhata] = useState<KhataRegister | null>(null);
  const [deleteKhataId, setDeleteKhataId] = useState<number | null>(null);
  const [archiveKhataId, setArchiveKhataId] = useState<number | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KhataItem | null>(null);
  const [activeRegisterId, setActiveRegisterId] = useState<number | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [deleteItemRegisterId, setDeleteItemRegisterId] = useState<number | null>(null);
  const [panatPaymentOpen, setPanatPaymentOpen] = useState(false);
  const [panatPaymentRegisterId, setPanatPaymentRegisterId] = useState<number | null>(null);
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);

  const queryParams = new URLSearchParams();
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (yearFilter !== "all") queryParams.set("year", yearFilter);
  if (monthFilter !== "all") queryParams.set("month", monthFilter);
  if (showArchived) queryParams.set("showArchived", "true");
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

  const archiveKhataMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/khata/${id}/archive`);
      return res.json();
    },
    onSuccess: (data: KhataRegister) => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setArchiveKhataId(null);
      setExpandedId(null);
      toast({ title: data.isArchived ? t("khataArchived") : t("khataUnarchived") });
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

  const createPanatPaymentMut = useMutation({
    mutationFn: async ({ registerId, data }: { registerId: number; data: any }) => {
      const res = await apiRequest("POST", `/api/khata/${registerId}/panat-payments`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setPanatPaymentOpen(false);
      toast({ title: t("paymentAdded") });
    },
  });

  const deletePanatPaymentMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/khata/panat-payments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/khata"] });
      setDeletePaymentId(null);
      toast({ title: t("paymentDeleted") });
    },
  });

  const totalDue = registers.reduce((sum, r) => {
    if (r.khataType === "panat") {
      const panatTotal = parseFloat(r.panatTotalAmount || "0") || 0;
      const panatPaid = parseFloat(r.totalPaid) || 0;
      return sum + Math.max(0, panatTotal - panatPaid);
    }
    if (r.khataType === "rental") {
      return sum + (r.rentalIsPaid ? 0 : (parseFloat(r.rentalTotalCharges || "0") || 0));
    }
    return sum + (parseFloat(r.totalDue) || 0);
  }, 0);
  const totalPaid = registers.reduce((sum, r) => {
    if (r.khataType === "rental") {
      return sum + (r.rentalIsPaid ? (parseFloat(r.rentalTotalCharges || "0") || 0) : 0);
    }
    return sum + (parseFloat(r.totalPaid) || 0);
  }, 0);

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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={showArchived}
              onCheckedChange={setShowArchived}
              data-testid="switch-show-archived"
              className="scale-75"
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t("showArchived")}</span>
          </div>
          <Button
            size="sm"
            onClick={() => setNewKhataOpen(true)}
            data-testid="button-new-khata"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("newKhata")}
          </Button>
        </div>
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
            const panatDue = reg.khataType === "panat" ? Math.max(0, (parseFloat(reg.panatTotalAmount || "0") || 0) - paid) : 0;
            const rentalTotal = parseFloat(reg.rentalTotalCharges || "0") || 0;
            const total = reg.khataType === "panat" ? paid : reg.khataType === "rental" ? rentalTotal : (due + paid);

            return (
              <Card key={reg.id} className={reg.isArchived ? "opacity-60" : ""} data-testid={`card-khata-${reg.id}`}>
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
                      {reg.isArchived && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 whitespace-nowrap" data-testid={`badge-archived-${reg.id}`}>
                          {t("archived")}
                        </span>
                      )}
                    </div>
                    {reg.cropCardId && (
                      <p className="text-xs text-muted-foreground truncate">{getCropCardLabel(reg.cropCardId)}</p>
                    )}
                    {reg.khataType === "batai" && reg.bataidarName && (
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{t("bataidar")}: {reg.bataidarName}</span>
                        {reg.bataidarContact && <span>📞 {reg.bataidarContact}</span>}
                        <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          {reg.bataiType === "half" ? t("halfBatai") : t("oneThird")}
                        </span>
                      </div>
                    )}
                    {reg.khataType === "panat" && reg.panatPersonName && (
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span>{reg.panatPersonName}</span>
                        {reg.panatContact && <span>📞 {reg.panatContact}</span>}
                        {reg.panatTotalBigha && <span>{reg.panatTotalBigha} {t("totalBigha")}</span>}
                        {reg.panatRatePerBigha && <span>@₹{reg.panatRatePerBigha}/{t("bighaCount")}</span>}
                      </div>
                    )}
                    {reg.khataType === "rental" && reg.rentalFarmerName && (
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span>{reg.rentalFarmerName}</span>
                        {reg.rentalContact && <span>📞 {reg.rentalContact}</span>}
                        {reg.rentalMachinery && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {t(MACHINERY_OPTIONS.find(m => m.value === reg.rentalMachinery)?.labelKey || "machineryOthers")}
                          </span>
                        )}
                        {reg.rentalFarmWork && <span>• {reg.rentalFarmWork}</span>}
                      </div>
                    )}
                    {reg.khataType === "panat" ? (
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-blue-600 dark:text-blue-400">{t("totalAmount")}: ₹{(parseFloat(reg.panatTotalAmount || "0") || 0).toLocaleString("en-IN")}</span>
                        <span className="text-xs text-green-600">₹{paid.toLocaleString("en-IN")} {t("paid")}</span>
                        <span className="text-xs text-orange-600 font-semibold">{t("netBalance")}: ₹{((parseFloat(reg.panatTotalAmount || "0") || 0) - paid).toLocaleString("en-IN")}</span>
                      </div>
                    ) : reg.khataType === "rental" ? (
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-blue-600 dark:text-blue-400">{t("rentalTotalCharges")}: ₹{(parseFloat(reg.rentalTotalCharges || "0") || 0).toLocaleString("en-IN")}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${reg.rentalIsPaid ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                          {reg.rentalIsPaid ? t("paid") : t("unpaid")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-orange-600">₹{due.toLocaleString("en-IN")} {t("unpaid")}</span>
                        <span className="text-xs text-green-600">₹{paid.toLocaleString("en-IN")} {t("paid")}</span>
                      </div>
                    )}
                    {reg.khataType === "batai" && (
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-xs text-purple-600 dark:text-purple-400">
                          {t("ownerExpense")}: ₹{(parseFloat(reg.totalOwnerExpense) || 0).toLocaleString("en-IN")}
                        </span>
                        <span className="text-xs text-indigo-600 dark:text-indigo-400">
                          {t("bataidarExpense")}: ₹{(parseFloat(reg.totalBataidarExpense) || 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold">₹{total.toLocaleString("en-IN")}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-3 pb-3">
                    <div className="flex gap-2 py-2 flex-wrap">
                      {reg.khataType !== "panat" && reg.khataType !== "rental" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setActiveRegisterId(reg.id); setEditingItem(null); setItemDialogOpen(true); }}
                          data-testid={`button-add-item-${reg.id}`}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          {t("addItem")}
                        </Button>
                      )}
                      {reg.khataType === "panat" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setPanatPaymentRegisterId(reg.id); setPanatPaymentOpen(true); }}
                          data-testid={`button-add-payment-${reg.id}`}
                        >
                          <Banknote className="w-3 h-3 mr-1" />
                          {t("addPayment")}
                        </Button>
                      )}
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
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setArchiveKhataId(reg.id); }}
                        data-testid={`button-archive-khata-${reg.id}`}
                      >
                        {reg.isArchived ? <ArchiveRestore className="w-3 h-3 mr-1" /> : <Archive className="w-3 h-3 mr-1" />}
                        {reg.isArchived ? t("unarchive") : t("archive")}
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

                    {reg.khataType === "rental" && (
                      <div className="bg-muted/50 rounded-md p-3 text-sm space-y-2 mt-1">
                        {reg.rentalChargesPerBigha && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("chargesPerBigha")}</span>
                            <span>₹{parseFloat(reg.rentalChargesPerBigha).toLocaleString("en-IN")}</span>
                          </div>
                        )}
                        {reg.rentalChargesPerHour && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("chargesPerHour")}</span>
                            <span>₹{parseFloat(reg.rentalChargesPerHour).toLocaleString("en-IN")}</span>
                          </div>
                        )}
                        {reg.rentalBigha && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("rentalBigha")}</span>
                            <span>{reg.rentalBigha}</span>
                          </div>
                        )}
                        {reg.rentalHours && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("rentalHours")}</span>
                            <span>{reg.rentalHours}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t pt-1 font-semibold">
                          <span>{t("rentalTotalCharges")}</span>
                          <span>₹{(parseFloat(reg.rentalTotalCharges || "0") || 0).toLocaleString("en-IN")}</span>
                        </div>
                        {reg.rentalRemarks && (
                          <div className="text-muted-foreground italic mt-1">{reg.rentalRemarks}</div>
                        )}
                      </div>
                    )}

                    {reg.khataType === "panat" || reg.khataType === "rental" ? null : expandedData.isLoading ? (
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
                                    <span className="text-xs bg-background px-1.5 py-0.5 rounded">
                                      {(() => {
                                        const subs = SUB_TYPES[item.expenseCategory];
                                        const match = subs?.find(s => s.value === item.subType);
                                        return match ? t(match.labelKey as any) : item.subType;
                                      })()}
                                    </span>
                                  )}
                                  <span className={`text-[10px] px-1 py-0.5 rounded ${item.isPaid ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                                    {item.isPaid ? t("paid") : t("unpaid")}
                                  </span>
                                  {reg.khataType === "batai" && (
                                    <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                      {item.expenseBornBy === "owner" ? t("farmOwner") : item.expenseBornBy === "bataidar" ? t("bataidar") : t("asPerBataiRatio")}
                                    </span>
                                  )}
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

                    {items.length > 0 && reg.khataType !== "panat" && (
                      <div className="flex justify-between mt-3 pt-2 border-t text-sm font-semibold">
                        <span>{t("totalExpense")}</span>
                        <span>₹{(due + paid).toLocaleString("en-IN")}</span>
                      </div>
                    )}

                    {reg.khataType === "panat" && (() => {
                      const panatPaymentsList: PanatPayment[] = (expandedData.data as any)?.panatPayments || [];
                      const panatTotal = parseFloat(reg.panatTotalAmount || "0") || 0;
                      let cumulative = 0;
                      return (
                        <div className="mt-2">
                          {reg.panatRemarks && (
                            <p className="text-xs text-muted-foreground mb-2 italic">{reg.panatRemarks}</p>
                          )}
                          {panatPaymentsList.length > 0 && (
                            <>
                              <p className="text-xs font-semibold mb-1.5">{t("payments")}</p>
                              <div className="space-y-1.5">
                                {panatPaymentsList.map(payment => {
                                  cumulative += parseFloat(payment.amount) || 0;
                                  const net = panatTotal - cumulative;
                                  return (
                                    <div key={payment.id} className="bg-muted/50 rounded-md p-2 text-xs" data-testid={`payment-${payment.id}`}>
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium">{payment.date}</span>
                                            <span className="font-bold text-green-600">₹{(parseFloat(payment.amount) || 0).toLocaleString("en-IN")}</span>
                                            <span className={`text-[10px] px-1 py-0.5 rounded ${payment.paymentMode === "account" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                                              {payment.paymentMode === "account" ? t("account") : t("cash")}
                                            </span>
                                            <span className="text-orange-600 font-semibold">{t("netBalance")}: ₹{net.toLocaleString("en-IN")}</span>
                                          </div>
                                          {payment.remarks && <p className="text-muted-foreground mt-0.5">{payment.remarks}</p>}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-destructive shrink-0"
                                          onClick={() => setDeletePaymentId(payment.id)}
                                          data-testid={`button-delete-payment-${payment.id}`}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex justify-between mt-2 pt-2 border-t text-sm font-semibold">
                                <span>{t("netBalance")}</span>
                                <span className="text-orange-600">₹{(panatTotal - cumulative).toLocaleString("en-IN")}</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
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
        khataType={registers.find(r => r.id === activeRegisterId)?.khataType}
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

      <PanatPaymentDialog
        open={panatPaymentOpen}
        onOpenChange={setPanatPaymentOpen}
        register={registers.find(r => r.id === panatPaymentRegisterId) || null}
        existingPayments={(expandedData.data as any)?.panatPayments || []}
        onSave={(data) => panatPaymentRegisterId && createPanatPaymentMut.mutate({ registerId: panatPaymentRegisterId, data })}
        isPending={createPanatPaymentMut.isPending}
      />

      <AlertDialog open={deletePaymentId !== null} onOpenChange={(v) => { if (!v) setDeletePaymentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deletePaymentConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePaymentId && deletePanatPaymentMut.mutate(deletePaymentId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-payment"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveKhataId !== null} onOpenChange={(v) => { if (!v) setArchiveKhataId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {registers.find(r => r.id === archiveKhataId)?.isArchived ? t("unarchive") : t("archive")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {registers.find(r => r.id === archiveKhataId)?.isArchived ? t("unarchiveConfirm") : t("archiveConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveKhataId && archiveKhataMut.mutate(archiveKhataId)}
              data-testid="button-confirm-archive"
            >
              {registers.find(r => r.id === archiveKhataId)?.isArchived ? t("unarchive") : t("archive")}
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
  const [bataidarName, setBataidarName] = useState("");
  const [bataidarContact, setBataidarContact] = useState("");
  const [bataiType, setBataiType] = useState("half");
  const [bighaCount, setBighaCount] = useState("");

  const [panatPersonName, setPanatPersonName] = useState("");
  const [panatContact, setPanatContact] = useState("");
  const [panatRatePerBigha, setPanatRatePerBigha] = useState("");
  const [panatTotalBigha, setPanatTotalBigha] = useState("");
  const [panatTotalAmount, setPanatTotalAmount] = useState("");
  const [panatRemarks, setPanatRemarks] = useState("");

  const [rentalFarmerName, setRentalFarmerName] = useState("");
  const [rentalContact, setRentalContact] = useState("");
  const [rentalMachinery, setRentalMachinery] = useState("");
  const [rentalFarmWork, setRentalFarmWork] = useState("");
  const [rentalChargesPerBigha, setRentalChargesPerBigha] = useState("");
  const [rentalChargesPerHour, setRentalChargesPerHour] = useState("");
  const [rentalHours, setRentalHours] = useState("");
  const [rentalBighaVal, setRentalBighaVal] = useState("");
  const [rentalTotalCharges, setRentalTotalCharges] = useState("");
  const [rentalIsPaid, setRentalIsPaid] = useState(false);
  const [rentalRemarks, setRentalRemarks] = useState("");

  const isCropCard = khataType === "crop_card";
  const isBatai = khataType === "batai";
  const isPanat = khataType === "panat";
  const isMisc = khataType === "miscellaneous";
  const isRental = khataType === "rental";
  const showCropFields = isCropCard || isBatai;
  const isOtherType = !showCropFields && !isPanat && !isMisc && !isRental;

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

  const computedPanatTotal = (parseFloat(panatRatePerBigha) || 0) * (parseFloat(panatTotalBigha) || 0);

  const computedRentalTotal = (() => {
    const bighaCharges = (parseFloat(rentalChargesPerBigha) || 0) * (parseFloat(rentalBighaVal) || 0);
    const hourCharges = (parseFloat(rentalChargesPerHour) || 0) * (parseFloat(rentalHours) || 0);
    return bighaCharges + hourCharges;
  })();

  const effectiveRentalTotal = rentalTotalCharges !== "" ? rentalTotalCharges : (computedRentalTotal > 0 ? computedRentalTotal.toString() : "");

  const handleSave = () => {
    if (isPanat) {
      if (!panatPersonName || !panatRatePerBigha || !panatTotalBigha) return;
      const totalAmt = computedPanatTotal.toString();
      onSave({
        khataType: "panat",
        title: panatPersonName,
        panatPersonName,
        panatContact: panatContact || null,
        panatRatePerBigha,
        panatTotalBigha,
        panatTotalAmount: totalAmt,
        panatRemarks: panatRemarks || null,
      });
      setPanatPersonName(""); setPanatContact(""); setPanatRatePerBigha(""); setPanatTotalBigha(""); setPanatTotalAmount(""); setPanatRemarks("");
      return;
    }
    if (isRental) {
      if (!rentalFarmerName || !rentalMachinery) return;
      const finalTotal = effectiveRentalTotal || computedRentalTotal.toString();
      onSave({
        khataType: "rental",
        title: rentalFarmWork || rentalFarmerName,
        rentalFarmerName,
        rentalContact: rentalContact || null,
        rentalMachinery,
        rentalFarmWork: rentalFarmWork || null,
        rentalChargesPerBigha: rentalChargesPerBigha || null,
        rentalChargesPerHour: rentalChargesPerHour || null,
        rentalHours: rentalHours || null,
        rentalBigha: rentalBighaVal || null,
        rentalTotalCharges: finalTotal,
        rentalIsPaid,
        rentalRemarks: rentalRemarks || null,
      });
      setRentalFarmerName(""); setRentalContact(""); setRentalMachinery(""); setRentalFarmWork("");
      setRentalChargesPerBigha(""); setRentalChargesPerHour(""); setRentalHours(""); setRentalBighaVal("");
      setRentalTotalCharges(""); setRentalIsPaid(false); setRentalRemarks("");
      return;
    }
    if (!title || (showCropFields && !plantationDate)) return;
    if (isBatai && (!bataidarName || !bataiType)) return;
    const data: any = {
      khataType,
      title,
      plantationDate: plantationDate || null,
      harvestDate: harvestDate || null,
      production: production || null,
      productionUnit: productionUnit || null,
    };
    if (showCropFields && selectedCardId && selectedCardId !== "none") {
      data.cropCardId = parseInt(selectedCardId);
    }
    if (isBatai) {
      data.bataidarName = bataidarName;
      data.bataidarContact = bataidarContact || null;
      data.bataiType = bataiType;
      data.bighaCount = bighaCount || null;
    }
    onSave(data);
    setTitle(""); setSelectedCardId(""); setPlantationDate(""); setHarvestDate(""); setProduction("");
    setBataidarName(""); setBataidarContact(""); setBataiType("half"); setBighaCount("");
  };

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

          {isMisc && (
            <div>
              <Label>{t("khataTitle")} *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t("khataTitle")}
                data-testid="input-misc-khata-title"
              />
            </div>
          )}

          {isRental && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("rentalFarmerName")} *</Label>
                  <Input value={rentalFarmerName} onChange={e => setRentalFarmerName(e.target.value)} placeholder={t("rentalFarmerName")} data-testid="input-rental-farmer-name" />
                </div>
                <div>
                  <Label>{t("rentalContact")}</Label>
                  <Input type="tel" value={rentalContact} onChange={e => setRentalContact(e.target.value)} placeholder={t("rentalContact")} data-testid="input-rental-contact" />
                </div>
              </div>
              <div>
                <Label>{t("rentalMachinery")} *</Label>
                <Select value={rentalMachinery} onValueChange={setRentalMachinery}>
                  <SelectTrigger data-testid="select-rental-machinery">
                    <SelectValue placeholder={t("selectMachinery")} />
                  </SelectTrigger>
                  <SelectContent>
                    {MACHINERY_OPTIONS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{t(m.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("rentalFarmWork")}</Label>
                <Input value={rentalFarmWork} onChange={e => setRentalFarmWork(e.target.value)} placeholder={t("rentalFarmWork")} data-testid="input-rental-farm-work" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("chargesPerBigha")}</Label>
                  <Input type="number" min="0" value={rentalChargesPerBigha} onChange={e => { setRentalChargesPerBigha(e.target.value); setRentalTotalCharges(""); }} placeholder="₹0" data-testid="input-rental-charges-bigha" />
                </div>
                <div>
                  <Label>{t("chargesPerHour")}</Label>
                  <Input type="number" min="0" value={rentalChargesPerHour} onChange={e => { setRentalChargesPerHour(e.target.value); setRentalTotalCharges(""); }} placeholder="₹0" data-testid="input-rental-charges-hour" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("rentalBigha")}</Label>
                  <Input type="number" step="0.5" min="0" value={rentalBighaVal} onChange={e => { setRentalBighaVal(e.target.value); setRentalTotalCharges(""); }} placeholder="0" data-testid="input-rental-bigha" />
                </div>
                <div>
                  <Label>{t("rentalHours")}</Label>
                  <Input type="number" step="0.5" min="0" value={rentalHours} onChange={e => { setRentalHours(e.target.value); setRentalTotalCharges(""); }} placeholder="0" data-testid="input-rental-hours" />
                </div>
              </div>
              <div>
                <Label>{t("rentalTotalCharges")}</Label>
                <Input
                  type="number"
                  min="0"
                  value={effectiveRentalTotal}
                  onChange={e => setRentalTotalCharges(e.target.value)}
                  placeholder="₹0"
                  data-testid="input-rental-total-charges"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("paid")}</Label>
                <Switch checked={rentalIsPaid} onCheckedChange={setRentalIsPaid} data-testid="switch-rental-paid" />
              </div>
              <div>
                <Label>{t("rentalRemarks")}</Label>
                <Textarea value={rentalRemarks} onChange={e => setRentalRemarks(e.target.value)} placeholder={t("rentalRemarks")} rows={2} data-testid="input-rental-remarks" />
              </div>
            </>
          )}

          {isPanat && (
            <>
              <div>
                <Label>{t("panatPersonName")} *</Label>
                <Input value={panatPersonName} onChange={e => setPanatPersonName(e.target.value)} placeholder={t("panatPersonName")} data-testid="input-panat-person-name" />
              </div>
              <div>
                <Label>{t("panatContact")}</Label>
                <Input type="tel" value={panatContact} onChange={e => setPanatContact(e.target.value)} placeholder={t("panatContact")} data-testid="input-panat-contact" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("ratePerBigha")} *</Label>
                  <Input type="number" min="0" value={panatRatePerBigha} onChange={e => setPanatRatePerBigha(e.target.value)} placeholder="₹0" data-testid="input-panat-rate" />
                </div>
                <div>
                  <Label>{t("totalBigha")} *</Label>
                  <Input type="number" step="0.5" min="0" value={panatTotalBigha} onChange={e => setPanatTotalBigha(e.target.value)} placeholder="0" data-testid="input-panat-bigha" />
                </div>
              </div>
              <div>
                <Label>{t("totalAmount")}</Label>
                <Input type="text" readOnly value={`₹${computedPanatTotal.toLocaleString("en-IN")}`} className="bg-muted font-bold" data-testid="input-panat-total" />
              </div>
              <div>
                <Label>{t("panatRemarks")}</Label>
                <Textarea value={panatRemarks} onChange={e => setPanatRemarks(e.target.value)} placeholder={t("panatRemarks")} rows={2} data-testid="input-panat-remarks" />
              </div>
            </>
          )}

          {isBatai && (
            <>
              <div>
                <Label>{t("bataidarName")} *</Label>
                <Input
                  value={bataidarName}
                  onChange={e => setBataidarName(e.target.value)}
                  placeholder={t("bataidarName")}
                  data-testid="input-bataidar-name"
                />
              </div>
              <div>
                <Label>{t("bataidarContact")}</Label>
                <Input
                  type="tel"
                  value={bataidarContact}
                  onChange={e => setBataidarContact(e.target.value)}
                  placeholder={t("bataidarContact")}
                  data-testid="input-bataidar-contact"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("bataiTypeLbl")} *</Label>
                  <Select value={bataiType} onValueChange={setBataiType}>
                    <SelectTrigger data-testid="select-batai-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="half">{t("halfBatai")}</SelectItem>
                      <SelectItem value="one_third">{t("oneThird")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("bighaCount")}</Label>
                  <Input type="number" step="0.5" min="0" value={bighaCount} onChange={e => setBighaCount(e.target.value)} placeholder="0" data-testid="input-bigha-count" />
                </div>
              </div>
            </>
          )}

          {showCropFields && (
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
              disabled={(isPanat ? (!panatPersonName || !panatRatePerBigha || !panatTotalBigha) : isRental ? (!rentalFarmerName || !rentalMachinery) : (isMisc ? !title : (!title || (showCropFields && !plantationDate) || (isBatai && !bataidarName) || isOtherType))) || isPending}
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
  const [productionUnit, setProductionUnit] = useState(khata.productionUnit || "quintal");
  const [bataidarName, setBataidarName] = useState(khata.bataidarName || "");
  const [bataidarContact, setBataidarContact] = useState(khata.bataidarContact || "");
  const [bataiType, setBataiType] = useState(khata.bataiType || "half");
  const [bighaCount, setBighaCount] = useState(khata.bighaCount || "");
  const isBatai = khata.khataType === "batai";
  const isPanat = khata.khataType === "panat";
  const isMisc = khata.khataType === "miscellaneous";
  const isRental = khata.khataType === "rental";

  const [panatPersonName, setPanatPersonName] = useState(khata.panatPersonName || "");
  const [panatContact, setPanatContact] = useState(khata.panatContact || "");
  const [panatRatePerBigha, setPanatRatePerBigha] = useState(khata.panatRatePerBigha || "");
  const [panatTotalBigha, setPanatTotalBigha] = useState(khata.panatTotalBigha || "");
  const [panatRemarks, setPanatRemarks] = useState(khata.panatRemarks || "");
  const computedPanatTotal = (parseFloat(panatRatePerBigha) || 0) * (parseFloat(panatTotalBigha) || 0);

  const [editRentalFarmerName, setEditRentalFarmerName] = useState(khata.rentalFarmerName || "");
  const [editRentalContact, setEditRentalContact] = useState(khata.rentalContact || "");
  const [editRentalMachinery, setEditRentalMachinery] = useState(khata.rentalMachinery || "");
  const [editRentalFarmWork, setEditRentalFarmWork] = useState(khata.rentalFarmWork || "");
  const [editRentalChargesPerBigha, setEditRentalChargesPerBigha] = useState(khata.rentalChargesPerBigha || "");
  const [editRentalChargesPerHour, setEditRentalChargesPerHour] = useState(khata.rentalChargesPerHour || "");
  const [editRentalHours, setEditRentalHours] = useState(khata.rentalHours || "");
  const [editRentalBigha, setEditRentalBigha] = useState(khata.rentalBigha || "");
  const [editRentalTotalCharges, setEditRentalTotalCharges] = useState(khata.rentalTotalCharges || "");
  const [editRentalIsPaid, setEditRentalIsPaid] = useState(khata.rentalIsPaid || false);
  const [editRentalRemarks, setEditRentalRemarks] = useState(khata.rentalRemarks || "");

  const editComputedRentalTotal = (() => {
    const b = (parseFloat(editRentalChargesPerBigha) || 0) * (parseFloat(editRentalBigha) || 0);
    const h = (parseFloat(editRentalChargesPerHour) || 0) * (parseFloat(editRentalHours) || 0);
    return b + h;
  })();
  const editEffectiveRentalTotal = editRentalTotalCharges !== "" ? editRentalTotalCharges : (editComputedRentalTotal > 0 ? editComputedRentalTotal.toString() : "");

  const handleEditSave = () => {
    if (isPanat) {
      if (!panatPersonName || !panatRatePerBigha || !panatTotalBigha) return;
      onSave({
        title: panatPersonName,
        panatPersonName,
        panatContact: panatContact || null,
        panatRatePerBigha,
        panatTotalBigha,
        panatTotalAmount: computedPanatTotal.toString(),
        panatRemarks: panatRemarks || null,
      });
      return;
    }
    if (isRental) {
      if (!editRentalFarmerName || !editRentalMachinery) return;
      const finalTotal = editEffectiveRentalTotal || editComputedRentalTotal.toString();
      onSave({
        title: editRentalFarmWork || editRentalFarmerName,
        rentalFarmerName: editRentalFarmerName,
        rentalContact: editRentalContact || null,
        rentalMachinery: editRentalMachinery,
        rentalFarmWork: editRentalFarmWork || null,
        rentalChargesPerBigha: editRentalChargesPerBigha || null,
        rentalChargesPerHour: editRentalChargesPerHour || null,
        rentalHours: editRentalHours || null,
        rentalBigha: editRentalBigha || null,
        rentalTotalCharges: finalTotal,
        rentalIsPaid: editRentalIsPaid,
        rentalRemarks: editRentalRemarks || null,
      });
      return;
    }
    onSave({
      title,
      plantationDate: plantationDate || null,
      harvestDate: harvestDate || null,
      production: production || null,
      productionUnit: productionUnit || null,
      ...(isBatai ? { bataidarName, bataidarContact: bataidarContact || null, bataiType, bighaCount: bighaCount || null } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editKhata")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isPanat && (
            <>
              <div>
                <Label>{t("panatPersonName")} *</Label>
                <Input value={panatPersonName} onChange={e => setPanatPersonName(e.target.value)} data-testid="input-edit-panat-person-name" />
              </div>
              <div>
                <Label>{t("panatContact")}</Label>
                <Input type="tel" value={panatContact} onChange={e => setPanatContact(e.target.value)} data-testid="input-edit-panat-contact" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("ratePerBigha")} *</Label>
                  <Input type="number" min="0" value={panatRatePerBigha} onChange={e => setPanatRatePerBigha(e.target.value)} data-testid="input-edit-panat-rate" />
                </div>
                <div>
                  <Label>{t("totalBigha")} *</Label>
                  <Input type="number" step="0.5" min="0" value={panatTotalBigha} onChange={e => setPanatTotalBigha(e.target.value)} data-testid="input-edit-panat-bigha" />
                </div>
              </div>
              <div>
                <Label>{t("totalAmount")}</Label>
                <Input type="text" readOnly value={`₹${computedPanatTotal.toLocaleString("en-IN")}`} className="bg-muted font-bold" data-testid="input-edit-panat-total" />
              </div>
              <div>
                <Label>{t("panatRemarks")}</Label>
                <Textarea value={panatRemarks} onChange={e => setPanatRemarks(e.target.value)} rows={2} data-testid="input-edit-panat-remarks" />
              </div>
            </>
          )}
          {isRental && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("rentalFarmerName")} *</Label>
                  <Input value={editRentalFarmerName} onChange={e => setEditRentalFarmerName(e.target.value)} data-testid="input-edit-rental-farmer-name" />
                </div>
                <div>
                  <Label>{t("rentalContact")}</Label>
                  <Input type="tel" value={editRentalContact} onChange={e => setEditRentalContact(e.target.value)} data-testid="input-edit-rental-contact" />
                </div>
              </div>
              <div>
                <Label>{t("rentalMachinery")} *</Label>
                <Select value={editRentalMachinery} onValueChange={setEditRentalMachinery}>
                  <SelectTrigger data-testid="select-edit-rental-machinery">
                    <SelectValue placeholder={t("selectMachinery")} />
                  </SelectTrigger>
                  <SelectContent>
                    {MACHINERY_OPTIONS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{t(m.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("rentalFarmWork")}</Label>
                <Input value={editRentalFarmWork} onChange={e => setEditRentalFarmWork(e.target.value)} data-testid="input-edit-rental-farm-work" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("chargesPerBigha")}</Label>
                  <Input type="number" min="0" value={editRentalChargesPerBigha} onChange={e => { setEditRentalChargesPerBigha(e.target.value); setEditRentalTotalCharges(""); }} data-testid="input-edit-rental-charges-bigha" />
                </div>
                <div>
                  <Label>{t("chargesPerHour")}</Label>
                  <Input type="number" min="0" value={editRentalChargesPerHour} onChange={e => { setEditRentalChargesPerHour(e.target.value); setEditRentalTotalCharges(""); }} data-testid="input-edit-rental-charges-hour" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("rentalBigha")}</Label>
                  <Input type="number" step="0.5" min="0" value={editRentalBigha} onChange={e => { setEditRentalBigha(e.target.value); setEditRentalTotalCharges(""); }} data-testid="input-edit-rental-bigha" />
                </div>
                <div>
                  <Label>{t("rentalHours")}</Label>
                  <Input type="number" step="0.5" min="0" value={editRentalHours} onChange={e => { setEditRentalHours(e.target.value); setEditRentalTotalCharges(""); }} data-testid="input-edit-rental-hours" />
                </div>
              </div>
              <div>
                <Label>{t("rentalTotalCharges")}</Label>
                <Input type="number" min="0" value={editEffectiveRentalTotal} onChange={e => setEditRentalTotalCharges(e.target.value)} data-testid="input-edit-rental-total-charges" />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("paid")}</Label>
                <Switch checked={editRentalIsPaid} onCheckedChange={setEditRentalIsPaid} data-testid="switch-edit-rental-paid" />
              </div>
              <div>
                <Label>{t("rentalRemarks")}</Label>
                <Textarea value={editRentalRemarks} onChange={e => setEditRentalRemarks(e.target.value)} rows={2} data-testid="input-edit-rental-remarks" />
              </div>
            </>
          )}
          {isBatai && (
            <>
              <div>
                <Label>{t("bataidarName")} *</Label>
                <Input value={bataidarName} onChange={e => setBataidarName(e.target.value)} data-testid="input-edit-bataidar-name" />
              </div>
              <div>
                <Label>{t("bataidarContact")}</Label>
                <Input type="tel" value={bataidarContact} onChange={e => setBataidarContact(e.target.value)} data-testid="input-edit-bataidar-contact" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("bataiTypeLbl")} *</Label>
                  <Select value={bataiType} onValueChange={setBataiType}>
                    <SelectTrigger data-testid="select-edit-batai-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="half">{t("halfBatai")}</SelectItem>
                      <SelectItem value="one_third">{t("oneThird")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("bighaCount")}</Label>
                  <Input type="number" step="0.5" min="0" value={bighaCount} onChange={e => setBighaCount(e.target.value)} placeholder="0" data-testid="input-edit-bigha-count" />
                </div>
              </div>
            </>
          )}
          {!isPanat && !isRental && (
            <div>
              <Label>{t("khataTitle")}</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} data-testid="input-edit-khata-title" />
            </div>
          )}
          {!isPanat && !isMisc && !isRental && (
            <>
              <div>
                <Label>{t("plantationDate")}</Label>
                <Input type="date" value={plantationDate} onChange={e => setPlantationDate(e.target.value)} data-testid="input-edit-plantation-date" />
              </div>
              <div>
                <Label>{t("harvestDate")}</Label>
                <Input type="date" value={harvestDate} onChange={e => setHarvestDate(e.target.value)} data-testid="input-edit-harvest-date" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("production")}</Label>
                  <Input type="number" value={production} onChange={e => setProduction(e.target.value)} data-testid="input-edit-production" />
                </div>
                <div>
                  <Label>{t("productionPerBigha")}</Label>
                  <Select value={productionUnit} onValueChange={setProductionUnit}>
                    <SelectTrigger data-testid="select-edit-production-unit">
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
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" data-testid="button-cancel-edit-khata">
              {t("cancel")}
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={(isPanat ? (!panatPersonName || !panatRatePerBigha || !panatTotalBigha) : isRental ? (!editRentalFarmerName || !editRentalMachinery) : (!title || (isBatai && !bataidarName))) || isPending}
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

function PanatPaymentDialog({ open, onOpenChange, register, existingPayments, onSave, isPending }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  register: KhataRegister | null;
  existingPayments: PanatPayment[];
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [remarks, setRemarks] = useState("");

  const totalPaidSoFar = existingPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const totalAmount = parseFloat(register?.panatTotalAmount || "0") || 0;
  const netBefore = totalAmount - totalPaidSoFar;
  const netAfter = netBefore - (parseFloat(amount) || 0);

  const handleSave = () => {
    if (!amount || !date) return;
    onSave({ date, amount, paymentMode, remarks: remarks || null });
    setDate(today); setAmount(""); setPaymentMode("cash"); setRemarks("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addPayment")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <div className="flex justify-between">
              <span>{t("totalAmount")}</span>
              <span className="font-bold">₹{totalAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>{t("totalPaid")}</span>
              <span className="font-bold text-green-600">₹{totalPaidSoFar.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between mt-1 border-t pt-1">
              <span className="font-semibold">{t("netBalance")}</span>
              <span className="font-bold text-orange-600">₹{netBefore.toLocaleString("en-IN")}</span>
            </div>
          </div>
          <div>
            <Label>{t("paymentDate")} *</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-payment-date" />
          </div>
          <div>
            <Label>{t("paymentAmount")} *</Label>
            <Input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₹0" data-testid="input-payment-amount" />
          </div>
          <div>
            <Label>{t("paymentMode")}</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger data-testid="select-payment-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t("cash")}</SelectItem>
                <SelectItem value="account">{t("account")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("paymentRemarks")}</Label>
            <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder={t("paymentRemarks")} data-testid="input-payment-remarks" />
          </div>
          {amount && (
            <div className="text-sm text-center font-semibold text-orange-600">
              {t("netBalance")}: ₹{netAfter.toLocaleString("en-IN")}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!amount || !date || isPending} className="flex-1" data-testid="button-save-payment">
              {isPending ? t("loading") : t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
