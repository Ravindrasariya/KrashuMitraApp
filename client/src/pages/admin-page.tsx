import { useState } from "react";
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
import { Search, Pencil, KeyRound, Check, X, Users, Loader2, Phone, Mail, User as UserIcon, Calendar, Stethoscope, FlaskConical, Leaf, Camera, Archive, ArchiveRestore, MessageSquare, Save } from "lucide-react";
import type { ServiceRequest } from "@shared/schema";

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
  const [activeTab, setActiveTab] = useState<"users" | "requests">("users");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "" });
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [remarksEdit, setRemarksEdit] = useState<Record<number, string>>({});

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
      ) : (
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
      )}
    </div>
  );
}
