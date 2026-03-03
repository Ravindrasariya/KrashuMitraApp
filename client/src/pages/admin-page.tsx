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
import { Search, Pencil, KeyRound, Check, X, Users, Loader2, AlertTriangle, Phone, Mail, User as UserIcon, Calendar } from "lucide-react";

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

export default function AdminPage() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "" });
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated,
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
    <div className="p-4 md:p-6 max-w-4xl mx-auto" data-testid="page-admin">
      <div className="flex items-center gap-3 mb-6">
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
    </div>
  );
}
