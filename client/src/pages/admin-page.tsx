import { useState, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Pencil, KeyRound, Check, X, Users, Loader2, Phone, Mail, User as UserIcon, Calendar, Stethoscope, FlaskConical, Leaf, Camera, Archive, ArchiveRestore, MessageSquare, Save, Image, Trash2, ChevronUp, ChevronDown, Plus, Eye, EyeOff, TrendingUp, Upload, FileSpreadsheet } from "lucide-react";
import type { ServiceRequest, Banner, PriceCrop } from "@shared/schema";

interface AdminUser {
  id: string;
  phoneNumber: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  farmerCode: string | null;
  isAdmin: boolean | null;
  mustChangePin: boolean | null;
  createdAt: string | null;
}

const SERVICE_TYPE_CONFIG: Record<string, { icon: typeof FlaskConical; color: string; label: string }> = {
  soil_test: { icon: FlaskConical, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400", label: "soilTest" },
  potato_seed_test: { icon: Leaf, color: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400", label: "potatoSeedTest" },
  crop_doctor: { icon: Camera, color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400", label: "cropDoctorAI" },
};

export default function AdminPage() {
  const { t, language } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"users" | "requests" | "banners" | "prices">("users");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "" });
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [remarksEdit, setRemarksEdit] = useState<Record<number, string>>({});

  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<(Banner & { hasImage?: boolean }) | null>(null);
  const [bannerForm, setBannerForm] = useState({
    type: "text" as "text" | "image",
    headingHi: "", headingEn: "", subHeadingHi: "", subHeadingEn: "",
    descriptionHi: "", descriptionEn: "",
    imageData: "", imageMime: "", captionHi: "", captionEn: "",
    sortOrder: 0, isActive: true,
  });
  const [bannerDeleteConfirm, setBannerDeleteConfirm] = useState<number | null>(null);
  const bannerImageRef = useRef<HTMLInputElement>(null);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated,
  });

  const { data: serviceRequests = [], isLoading: requestsLoading } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/admin/service-requests"],
    enabled: isAuthenticated && activeTab === "requests",
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("userUpdated") });
      setEditingId(null);
    },
    onError: () => {
      toast({ title: "Update failed", variant: "destructive" });
    },
  });

  const resetPinMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${id}/reset-pin`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("pinResetSuccess") });
      setResetConfirmId(null);
    },
    onError: () => {
      toast({ title: t("resetFailed"), variant: "destructive" });
    },
  });

  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/service-requests/${id}`, data);
      return res.json();
    },
    onSuccess: (_data: any, variables: { id: number; data: any }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-requests"] });
      if (variables.data.adminRemarks !== undefined) toast({ title: t("remarksSaved") });
      else if (variables.data.status === "closed") toast({ title: t("requestClosed") });
      else if (variables.data.status === "open") toast({ title: t("requestReopened") });
      else if (variables.data.isArchived === true) toast({ title: t("requestArchived") });
      else if (variables.data.isArchived === false) toast({ title: t("requestUnarchived") });
    },
    onError: () => {
      toast({ title: "Update failed", variant: "destructive" });
    },
  });

  const { data: adminBanners = [], isLoading: bannersLoading } = useQuery<(Banner & { hasImage: boolean })[]>({
    queryKey: ["/api/admin/banners"],
    enabled: isAuthenticated && activeTab === "banners",
  });

  const createBannerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/banners", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
      toast({ title: t("bannerSaved") });
      setBannerDialogOpen(false);
      setEditingBanner(null);
    },
    onError: () => {
      toast({ title: "Failed to save banner", variant: "destructive" });
    },
  });

  const updateBannerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/banners/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
      toast({ title: t("bannerSaved") });
      setBannerDialogOpen(false);
      setEditingBanner(null);
    },
    onError: () => {
      toast({ title: "Failed to update banner", variant: "destructive" });
    },
  });

  const deleteBannerMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/banners/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
      toast({ title: t("bannerDeleted") });
      setBannerDeleteConfirm(null);
    },
    onError: () => {
      toast({ title: "Failed to delete banner", variant: "destructive" });
    },
  });

  const { data: priceCrops = [], isLoading: priceCropsLoading } = useQuery<PriceCrop[]>({
    queryKey: ["/api/admin/price-crops"],
    enabled: isAuthenticated && activeTab === "prices",
  });

  const [priceCropDialogOpen, setPriceCropDialogOpen] = useState(false);
  const [editingPriceCrop, setEditingPriceCrop] = useState<PriceCrop | null>(null);
  const [priceCropForm, setPriceCropForm] = useState({ nameHi: "", nameEn: "" });
  const [priceCropDeleteConfirm, setPriceCropDeleteConfirm] = useState<number | null>(null);
  const priceFileRef = useRef<HTMLInputElement>(null);
  const [uploadingCropId, setUploadingCropId] = useState<number | null>(null);

  const createPriceCropMutation = useMutation({
    mutationFn: async (data: { nameHi: string; nameEn: string }) => {
      const res = await apiRequest("POST", "/api/admin/price-crops", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/price-crops"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-crops"] });
      toast({ title: language === "hi" ? "फसल जोड़ी गई" : "Crop added" });
      setPriceCropDialogOpen(false);
      setEditingPriceCrop(null);
    },
    onError: () => {
      toast({ title: "Failed to save crop", variant: "destructive" });
    },
  });

  const updatePriceCropMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/price-crops/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/price-crops"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-crops"] });
    },
    onError: () => {
      toast({ title: "Failed to update crop", variant: "destructive" });
    },
  });

  const deletePriceCropMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/price-crops/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/price-crops"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-crops"] });
      toast({ title: language === "hi" ? "फसल हटाई गई" : "Crop deleted" });
      setPriceCropDeleteConfirm(null);
    },
  });

  const uploadExcelMutation = useMutation({
    mutationFn: async ({ cropId, fileData, clearExisting }: { cropId: number; fileData: string; clearExisting: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/price-crops/${cropId}/upload`, { fileData, clearExisting });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/price-crops"] });
      toast({ title: `${t("dataUploaded")} (${data.count} rows)` });
      setUploadingCropId(null);
    },
    onError: () => {
      toast({ title: "Failed to upload Excel", variant: "destructive" });
      setUploadingCropId(null);
    },
  });

  const handleExcelUpload = (cropId: number, clearExisting: boolean) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadingCropId(cropId);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadExcelMutation.mutate({ cropId, fileData: base64, clearExisting });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const openPriceCropDialog = (crop?: PriceCrop) => {
    if (crop) {
      setEditingPriceCrop(crop);
      setPriceCropForm({ nameHi: crop.nameHi, nameEn: crop.nameEn });
    } else {
      setEditingPriceCrop(null);
      setPriceCropForm({ nameHi: "", nameEn: "" });
    }
    setPriceCropDialogOpen(true);
  };

  const savePriceCrop = () => {
    if (!priceCropForm.nameHi || !priceCropForm.nameEn) {
      toast({ title: "Both names required", variant: "destructive" });
      return;
    }
    if (editingPriceCrop) {
      updatePriceCropMutation.mutate({ id: editingPriceCrop.id, data: priceCropForm });
      setPriceCropDialogOpen(false);
      setEditingPriceCrop(null);
    } else {
      createPriceCropMutation.mutate(priceCropForm);
    }
  };

  const openBannerDialog = (banner?: Banner & { hasImage?: boolean }) => {
    if (banner) {
      setEditingBanner(banner);
      setBannerForm({
        type: (banner.type as "text" | "image") || "text",
        headingHi: banner.headingHi || "",
        headingEn: banner.headingEn || "",
        subHeadingHi: banner.subHeadingHi || "",
        subHeadingEn: banner.subHeadingEn || "",
        descriptionHi: banner.descriptionHi || "",
        descriptionEn: banner.descriptionEn || "",
        imageData: "",
        imageMime: "",
        captionHi: banner.captionHi || "",
        captionEn: banner.captionEn || "",
        sortOrder: banner.sortOrder,
        isActive: banner.isActive,
      });
    } else {
      setEditingBanner(null);
      setBannerForm({
        type: "text", headingHi: "", headingEn: "", subHeadingHi: "", subHeadingEn: "",
        descriptionHi: "", descriptionEn: "", imageData: "", imageMime: "",
        captionHi: "", captionEn: "", sortOrder: adminBanners.length, isActive: true,
      });
    }
    setBannerDialogOpen(true);
  };

  const handleBannerImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [meta, base64] = dataUrl.split(",");
      const mime = meta.match(/:(.*?);/)?.[1] || "image/jpeg";
      setBannerForm(prev => ({ ...prev, imageData: base64, imageMime: mime }));
    };
    reader.readAsDataURL(file);
  };

  const saveBanner = () => {
    const data = { ...bannerForm };
    if (editingBanner) {
      if (!data.imageData) {
        const { imageData, imageMime, ...rest } = data;
        updateBannerMutation.mutate({ id: editingBanner.id, data: rest });
      } else {
        updateBannerMutation.mutate({ id: editingBanner.id, data });
      }
    } else {
      createBannerMutation.mutate(data);
    }
  };

  const moveBanner = (id: number, direction: "up" | "down") => {
    const idx = adminBanners.findIndex(b => b.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= adminBanners.length) return;
    const currentOrder = adminBanners[idx].sortOrder;
    const swapOrder = adminBanners[swapIdx].sortOrder;
    updateBannerMutation.mutate({ id: adminBanners[idx].id, data: { sortOrder: swapOrder } });
    updateBannerMutation.mutate({ id: adminBanners[swapIdx].id, data: { sortOrder: currentOrder } });
  };

  if (!isAuthenticated) {
    setLocation("/auth");
    return null;
  }

  if (!user?.isAdmin) {
    setLocation("/");
    return null;
  }

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.phoneNumber?.includes(q) ||
      u.farmerCode?.toLowerCase().includes(q)
    );
  });

  const filteredRequests = serviceRequests.filter(r => {
    if (typeFilter !== "all" && r.serviceType !== typeFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!showArchived && r.isArchived) return false;
    if (showArchived && !r.isArchived) return false;
    return true;
  });

  const startEdit = (u: AdminUser) => {
    setEditingId(u.id);
    setEditData({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      phoneNumber: u.phoneNumber || "",
      email: u.email || "",
    });
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, data: editData });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-20 md:pb-8" data-testid="page-admin">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-admin-title">{t("adminPanel")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("totalUsers")}: {users.length}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant={activeTab === "users" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("users")}
          data-testid="tab-users"
        >
          <Users className="w-4 h-4 mr-1" />
          {t("manageUsers")}
        </Button>
        <Button
          variant={activeTab === "requests" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("requests")}
          data-testid="tab-service-requests"
        >
          <Stethoscope className="w-4 h-4 mr-1" />
          {t("serviceRequests")}
        </Button>
        <Button
          variant={activeTab === "banners" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("banners")}
          data-testid="tab-banners"
        >
          <Image className="w-4 h-4 mr-1" />
          {t("manageBanners")}
        </Button>
        <Button
          variant={activeTab === "prices" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("prices")}
          data-testid="tab-prices"
        >
          <TrendingUp className="w-4 h-4 mr-1" />
          {t("managePriceTrends")}
        </Button>
      </div>

      {activeTab === "users" ? (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("searchUsers")}
              className="pl-9"
              data-testid="input-admin-search"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-results">{t("noResults")}</p>
          ) : (
            <div className="grid gap-3">
              {filtered.map(u => (
                <Card key={u.id} className="overflow-hidden" data-testid={`card-user-${u.id}`}>
                  <CardContent className="p-4">
                    {editingId === u.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">{t("name")}</Label>
                            <Input
                              value={editData.firstName}
                              onChange={e => setEditData(d => ({ ...d, firstName: e.target.value }))}
                              placeholder={t("namePlaceholder")}
                              data-testid="input-edit-first-name"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Last Name</Label>
                            <Input
                              value={editData.lastName}
                              onChange={e => setEditData(d => ({ ...d, lastName: e.target.value }))}
                              placeholder="Last name"
                              data-testid="input-edit-last-name"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">{t("phoneNumber")}</Label>
                            <Input
                              value={editData.phoneNumber}
                              onChange={e => setEditData(d => ({ ...d, phoneNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                              data-testid="input-edit-phone"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t("email")}</Label>
                            <Input
                              value={editData.email}
                              onChange={e => setEditData(d => ({ ...d, email: e.target.value }))}
                              placeholder={t("emailPlaceholder")}
                              data-testid="input-edit-email"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)} data-testid="button-cancel-edit">
                            <X className="w-3.5 h-3.5 mr-1" />
                            {t("cancel")}
                          </Button>
                          <Button size="sm" onClick={() => saveEdit(u.id)} disabled={updateMutation.isPending} data-testid="button-save-edit">
                            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                            {t("save")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm" data-testid={`text-user-name-${u.id}`}>
                                {u.firstName || ""} {u.lastName || ""}
                              </h3>
                              {u.isAdmin && (
                                <Badge variant="default" className="text-[10px] px-1.5 py-0">Admin</Badge>
                              )}
                              {u.mustChangePin && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid={`badge-pin-pending-${u.id}`}>
                                  {t("pinPending")}
                                </Badge>
                              )}
                            </div>

                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3 h-3" />
                                <span data-testid={`text-user-phone-${u.id}`}>+91 {u.phoneNumber}</span>
                              </div>
                              {u.farmerCode && (
                                <div className="flex items-center gap-1.5">
                                  <UserIcon className="w-3 h-3" />
                                  <span className="text-primary font-medium" data-testid={`text-user-code-${u.id}`}>{u.farmerCode}</span>
                                </div>
                              )}
                              {u.email && (
                                <div className="flex items-center gap-1.5">
                                  <Mail className="w-3 h-3" />
                                  <span data-testid={`text-user-email-${u.id}`}>{u.email}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3 h-3" />
                                <span>{t("registeredOn")}: {formatDate(u.createdAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => startEdit(u)} data-testid={`button-edit-user-${u.id}`}>
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              {t("edit")}
                            </Button>
                            {resetConfirmId === u.id ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => resetPinMutation.mutate(u.id)}
                                  disabled={resetPinMutation.isPending}
                                  data-testid={`button-confirm-reset-${u.id}`}
                                >
                                  {resetPinMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("yes")}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setResetConfirmId(null)} data-testid={`button-cancel-reset-${u.id}`}>
                                  {t("no")}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-amber-600 border-amber-300 hover:bg-amber-50"
                                onClick={() => setResetConfirmId(u.id)}
                                data-testid={`button-reset-pin-${u.id}`}
                              >
                                <KeyRound className="w-3.5 h-3.5 mr-1" />
                                {t("resetPin")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : activeTab === "requests" ? (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
                <SelectValue placeholder={t("allTypes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTypes")}</SelectItem>
                <SelectItem value="soil_test">{t("soilTest")}</SelectItem>
                <SelectItem value="potato_seed_test">{t("potatoSeedTest")}</SelectItem>
                <SelectItem value="crop_doctor">{t("cropDoctorAI")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                <SelectValue placeholder={t("allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                <SelectItem value="open">{t("open")}</SelectItem>
                <SelectItem value="closed">{t("closed")}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              data-testid="button-toggle-archived"
            >
              <Archive className="w-4 h-4 mr-1" />
              {language === "hi" ? "संग्रहित" : "Archived"}
            </Button>
          </div>

          {requestsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-requests">{t("noRequests")}</p>
          ) : (
            <div className="grid gap-3">
              {filteredRequests.map(req => {
                const cfg = SERVICE_TYPE_CONFIG[req.serviceType] || SERVICE_TYPE_CONFIG.soil_test;
                const Icon = cfg.icon;
                const localRemarks = remarksEdit[req.id] ?? (req.adminRemarks || "");
                const remarksChanged = localRemarks !== (req.adminRemarks || "");

                return (
                  <Card key={req.id} className="overflow-hidden" data-testid={`card-service-request-${req.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="secondary" data-testid={`badge-req-type-${req.id}`}>
                              {t(cfg.label as any)}
                            </Badge>
                            <Badge
                              variant={req.status === "open" ? "default" : "outline"}
                              data-testid={`badge-req-status-${req.id}`}
                            >
                              {req.status === "open" ? t("open") : t("closed")}
                            </Badge>
                            {req.isArchived && (
                              <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-archived-${req.id}`}>
                                <Archive className="w-3 h-3 mr-1" />
                                {language === "hi" ? "संग्रहित" : "Archived"}
                              </Badge>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground space-y-0.5 mb-2">
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="w-3 h-3" />
                              <span data-testid={`text-req-farmer-${req.id}`}>
                                {req.farmerName || "-"} | {req.farmerPhone ? `+91 ${req.farmerPhone}` : "-"} | {req.farmerCode || "-"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDate(req.createdAt)}</span>
                            </div>
                          </div>

                          {req.serviceType === "crop_doctor" && req.imageData && (
                            <img
                              src={`/api/service-requests/${req.id}/image`}
                              alt=""
                              className="w-20 h-20 rounded-md object-cover mb-2"
                              data-testid={`img-req-${req.id}`}
                            />
                          )}

                          {req.serviceType === "crop_doctor" && req.aiDiagnosis && (
                            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-md p-2 mb-2 text-xs" data-testid={`text-req-diagnosis-${req.id}`}>
                              <p className="font-medium text-purple-700 dark:text-purple-300 mb-1">
                                {t("cropDoctorResult")}:
                              </p>
                              <p className="text-muted-foreground whitespace-pre-wrap line-clamp-4">{req.aiDiagnosis}</p>
                            </div>
                          )}

                          <div className="mt-2">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                              <MessageSquare className="w-3 h-3" />
                              {t("adminRemarksLabel")}
                            </Label>
                            <div className="flex gap-2">
                              <Textarea
                                value={localRemarks}
                                onChange={e => setRemarksEdit(prev => ({ ...prev, [req.id]: e.target.value }))}
                                placeholder={language === "hi" ? "टिप्पणी लिखें..." : "Write remarks..."}
                                className="text-xs min-h-[40px] h-10 resize-none"
                                data-testid={`textarea-remarks-${req.id}`}
                              />
                              {remarksChanged && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateRequestMutation.mutate({ id: req.id, data: { adminRemarks: localRemarks } })}
                                  disabled={updateRequestMutation.isPending}
                                  data-testid={`button-save-remarks-${req.id}`}
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2 mt-3 flex-wrap">
                            <Button
                              size="sm"
                              variant={req.status === "open" ? "default" : "outline"}
                              onClick={() => updateRequestMutation.mutate({
                                id: req.id,
                                data: { status: req.status === "open" ? "closed" : "open" }
                              })}
                              disabled={updateRequestMutation.isPending}
                              data-testid={`button-toggle-status-${req.id}`}
                            >
                              {req.status === "open" ? t("closeRequest") : t("reopenRequest")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateRequestMutation.mutate({
                                id: req.id,
                                data: { isArchived: !req.isArchived }
                              })}
                              disabled={updateRequestMutation.isPending}
                              data-testid={`button-toggle-archive-${req.id}`}
                            >
                              {req.isArchived ? (
                                <><ArchiveRestore className="w-3.5 h-3.5 mr-1" />{language === "hi" ? "वापस लाएं" : "Unarchive"}</>
                              ) : (
                                <><Archive className="w-3.5 h-3.5 mr-1" />{language === "hi" ? "संग्रहित करें" : "Archive"}</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : activeTab === "banners" ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t("manageBanners")}</h2>
            <Button size="sm" onClick={() => openBannerDialog()} data-testid="button-add-banner">
              <Plus className="w-4 h-4 mr-1" />
              {t("addBanner")}
            </Button>
          </div>

          {bannersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : adminBanners.length === 0 ? (
            <Card className="p-8 text-center">
              <Image className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">{t("noBanners")}</p>
              <Button className="mt-3" size="sm" onClick={() => openBannerDialog()} data-testid="button-add-banner-empty">
                <Plus className="w-4 h-4 mr-1" />
                {t("addBanner")}
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {adminBanners.map((banner, idx) => (
                <Card key={banner.id} className="overflow-hidden" data-testid={`card-banner-${banner.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => moveBanner(banner.id, "up")}
                          data-testid={`button-banner-up-${banner.id}`}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <span className="text-xs text-center text-muted-foreground">{banner.sortOrder}</span>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={idx === adminBanners.length - 1}
                          onClick={() => moveBanner(banner.id, "down")}
                          data-testid={`button-banner-down-${banner.id}`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={banner.type === "text" ? "default" : "secondary"}>
                            {banner.type === "text" ? t("textBanner") : t("imageBanner")}
                          </Badge>
                          <Badge variant={banner.isActive ? "default" : "outline"} className={banner.isActive ? "bg-green-600" : ""}>
                            {banner.isActive ? t("bannerActive") : t("bannerInactive")}
                          </Badge>
                        </div>
                        {banner.type === "text" ? (
                          <div>
                            <p className="font-semibold text-sm truncate">{language === "hi" ? banner.headingHi : banner.headingEn}</p>
                            {(banner.subHeadingHi || banner.subHeadingEn) && (
                              <p className="text-xs text-muted-foreground truncate">{language === "hi" ? banner.subHeadingHi : banner.subHeadingEn}</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {banner.hasImage && (
                              <img src={`/api/banners/${banner.id}/image`} alt="" className="w-16 h-10 object-cover rounded" />
                            )}
                            <p className="text-sm truncate">{language === "hi" ? banner.captionHi : banner.captionEn}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => updateBannerMutation.mutate({ id: banner.id, data: { isActive: !banner.isActive } })}
                          data-testid={`button-banner-toggle-${banner.id}`}
                        >
                          {banner.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => openBannerDialog(banner)}
                          data-testid={`button-banner-edit-${banner.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {bannerDeleteConfirm === banner.id ? (
                          <div className="flex items-center gap-1">
                            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => deleteBannerMutation.mutate(banner.id)} data-testid={`button-banner-confirm-delete-${banner.id}`}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setBannerDeleteConfirm(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => setBannerDeleteConfirm(banner.id)}
                            data-testid={`button-banner-delete-${banner.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {bannerDialogOpen && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setBannerDialogOpen(false)}>
              <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()} data-testid="dialog-banner-form">
                <h3 className="text-lg font-bold mb-4">{editingBanner ? t("editBanner") : t("addBanner")}</h3>

                <div className="space-y-3">
                  <div>
                    <Label>{t("bannerType")}</Label>
                    <Select value={bannerForm.type} onValueChange={v => setBannerForm(p => ({ ...p, type: v as "text" | "image" }))}>
                      <SelectTrigger data-testid="select-banner-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t("textBanner")}</SelectItem>
                        <SelectItem value="image">{t("imageBanner")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {bannerForm.type === "text" ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>{t("headingHi")}</Label>
                          <Input value={bannerForm.headingHi} onChange={e => setBannerForm(p => ({ ...p, headingHi: e.target.value }))} data-testid="input-banner-heading-hi" />
                        </div>
                        <div>
                          <Label>{t("headingEn")}</Label>
                          <Input value={bannerForm.headingEn} onChange={e => setBannerForm(p => ({ ...p, headingEn: e.target.value }))} data-testid="input-banner-heading-en" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>{t("subHeadingHi")}</Label>
                          <Input value={bannerForm.subHeadingHi} onChange={e => setBannerForm(p => ({ ...p, subHeadingHi: e.target.value }))} data-testid="input-banner-subheading-hi" />
                        </div>
                        <div>
                          <Label>{t("subHeadingEn")}</Label>
                          <Input value={bannerForm.subHeadingEn} onChange={e => setBannerForm(p => ({ ...p, subHeadingEn: e.target.value }))} data-testid="input-banner-subheading-en" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>{t("descriptionHi")}</Label>
                          <Textarea value={bannerForm.descriptionHi} onChange={e => setBannerForm(p => ({ ...p, descriptionHi: e.target.value }))} rows={2} data-testid="input-banner-desc-hi" />
                        </div>
                        <div>
                          <Label>{t("descriptionEn")}</Label>
                          <Textarea value={bannerForm.descriptionEn} onChange={e => setBannerForm(p => ({ ...p, descriptionEn: e.target.value }))} rows={2} data-testid="input-banner-desc-en" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label>{t("uploadImage")}</Label>
                        <input type="file" accept="image/*" ref={bannerImageRef} onChange={handleBannerImageUpload} className="block w-full text-sm mt-1" data-testid="input-banner-image" />
                        {(bannerForm.imageData || (editingBanner?.hasImage)) && (
                          <div className="mt-2">
                            <img
                              src={bannerForm.imageData ? `data:${bannerForm.imageMime};base64,${bannerForm.imageData}` : `/api/banners/${editingBanner?.id}/image`}
                              alt="Preview"
                              className="w-full h-32 object-cover rounded"
                            />
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>{t("captionHi")}</Label>
                          <Input value={bannerForm.captionHi} onChange={e => setBannerForm(p => ({ ...p, captionHi: e.target.value }))} data-testid="input-banner-caption-hi" />
                        </div>
                        <div>
                          <Label>{t("captionEn")}</Label>
                          <Input value={bannerForm.captionEn} onChange={e => setBannerForm(p => ({ ...p, captionEn: e.target.value }))} data-testid="input-banner-caption-en" />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>{t("sortOrder")}</Label>
                      <Input type="number" value={bannerForm.sortOrder} onChange={e => setBannerForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))} data-testid="input-banner-sort" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bannerForm.isActive}
                          onChange={e => setBannerForm(p => ({ ...p, isActive: e.target.checked }))}
                          className="w-4 h-4"
                          data-testid="input-banner-active"
                        />
                        <span className="text-sm font-medium">{t("bannerActive")}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="outline" onClick={() => setBannerDialogOpen(false)} data-testid="button-banner-cancel">
                    <X className="w-4 h-4 mr-1" />
                    {language === "hi" ? "रद्द करें" : "Cancel"}
                  </Button>
                  <Button
                    onClick={saveBanner}
                    disabled={createBannerMutation.isPending || updateBannerMutation.isPending}
                    data-testid="button-banner-save"
                  >
                    {(createBannerMutation.isPending || updateBannerMutation.isPending) ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-1" />
                    )}
                    {language === "hi" ? "सेव करें" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : activeTab === "prices" ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t("managePriceTrends")}</h2>
            <Button size="sm" onClick={() => openPriceCropDialog()} data-testid="button-add-price-crop">
              <Plus className="w-4 h-4 mr-1" />
              {t("addCrop")}
            </Button>
          </div>

          {priceCropsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : priceCrops.length === 0 ? (
            <Card className="p-8 text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground mb-3">{language === "hi" ? "कोई फसल नहीं जोड़ी गई" : "No crops added yet"}</p>
              <Button size="sm" onClick={() => openPriceCropDialog()} data-testid="button-add-price-crop-empty">
                <Plus className="w-4 h-4 mr-1" />
                {t("addCrop")}
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {priceCrops.map(crop => (
                <Card key={crop.id} className="p-4" data-testid={`card-price-crop-${crop.id}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{language === "hi" ? crop.nameHi : crop.nameEn}</h3>
                      <span className="text-xs text-muted-foreground">({language === "hi" ? crop.nameEn : crop.nameHi})</span>
                      {!crop.isActive && <Badge variant="secondary">{language === "hi" ? "निष्क्रिय" : "Inactive"}</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updatePriceCropMutation.mutate({ id: crop.id, data: { isActive: !crop.isActive } })}
                        data-testid={`button-toggle-price-crop-${crop.id}`}
                      >
                        {crop.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPriceCropDialog(crop)} data-testid={`button-edit-price-crop-${crop.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {priceCropDeleteConfirm === crop.id ? (
                        <div className="flex items-center gap-1">
                          <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => deletePriceCropMutation.mutate(crop.id)}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPriceCropDeleteConfirm(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPriceCropDeleteConfirm(crop.id)} data-testid={`button-delete-price-crop-${crop.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium">{t("krashuvedExpectation")}:</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={crop.recommendation === "hold" ? "default" : "outline"}
                        className={crop.recommendation === "hold" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                        onClick={() => updatePriceCropMutation.mutate({ id: crop.id, data: { recommendation: crop.recommendation === "hold" ? null : "hold" } })}
                        data-testid={`button-hold-${crop.id}`}
                      >
                        {t("hold")}
                      </Button>
                      <Button
                        size="sm"
                        variant={crop.recommendation === "sale" ? "default" : "outline"}
                        className={crop.recommendation === "sale" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                        onClick={() => updatePriceCropMutation.mutate({ id: crop.id, data: { recommendation: crop.recommendation === "sale" ? null : "sale" } })}
                        data-testid={`button-sale-${crop.id}`}
                      >
                        {t("sale")}
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExcelUpload(crop.id, false)}
                      disabled={uploadingCropId === crop.id}
                      data-testid={`button-upload-${crop.id}`}
                    >
                      {uploadingCropId === crop.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                      {t("uploadExcel")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExcelUpload(crop.id, true)}
                      disabled={uploadingCropId === crop.id}
                      data-testid={`button-clear-upload-${crop.id}`}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      {t("clearAndUpload")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {priceCropDialogOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPriceCropDialogOpen(false)}>
              <div className="bg-background rounded-lg p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()} data-testid="dialog-price-crop-form">
                <h3 className="text-lg font-semibold mb-4">
                  {editingPriceCrop ? (language === "hi" ? "फसल संपादित करें" : "Edit Crop") : t("addCrop")}
                </h3>
                <div className="space-y-3">
                  <div>
                    <Label>{t("cropNameHi")}</Label>
                    <Input value={priceCropForm.nameHi} onChange={e => setPriceCropForm(p => ({ ...p, nameHi: e.target.value }))} placeholder="आलू" data-testid="input-price-crop-name-hi" />
                  </div>
                  <div>
                    <Label>{t("cropNameEn")}</Label>
                    <Input value={priceCropForm.nameEn} onChange={e => setPriceCropForm(p => ({ ...p, nameEn: e.target.value }))} placeholder="Potato" data-testid="input-price-crop-name-en" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="outline" onClick={() => setPriceCropDialogOpen(false)}>
                    <X className="w-4 h-4 mr-1" />
                    {language === "hi" ? "रद्द करें" : "Cancel"}
                  </Button>
                  <Button onClick={savePriceCrop} disabled={createPriceCropMutation.isPending} data-testid="button-price-crop-save">
                    {createPriceCropMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                    {language === "hi" ? "सेव करें" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
