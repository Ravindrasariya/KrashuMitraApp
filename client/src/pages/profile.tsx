import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Loader2, Save, User, Phone, IdCard } from "lucide-react";
import type { User as UserType } from "@shared/schema";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, isAuthenticated, authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: profile } = useQuery<UserType & { farmerCode: string }>({
    queryKey: ["/api/farmer/profile"],
    enabled: isAuthenticated,
  });

  const [firstName, setFirstName] = useState("");
  const [village, setVillage] = useState("");
  const [tehsil, setTehsil] = useState("");
  const [district, setDistrict] = useState("");
  const [stateName, setStateName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || "");
      setVillage(profile.village || "");
      setTehsil(profile.tehsil || "");
      setDistrict(profile.district || "");
      setStateName(profile.state || "");
      setPostalCode(profile.postalCode || "");
      setLat(profile.latitude || "");
      setLng(profile.longitude || "");
    }
  }, [profile]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/auth");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const updateMutation = useMutation({
    mutationFn: async (data: { firstName: string; village: string; tehsil: string; district: string; state: string; postalCode: string; latitude?: string; longitude?: string }) => {
      const res = await apiRequest("PATCH", "/api/farmer/profile", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("profileUpdated") });
      qc.invalidateQueries({ queryKey: ["/api/farmer/profile"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: () => {
      toast({ title: t("profileUpdateFailed"), variant: "destructive" });
    },
  });

  if (!authLoading && !isAuthenticated) {
    return null;
  }

  async function handleDetectLocation() {
    if (!navigator.geolocation) {
      toast({ title: t("locationError"), variant: "destructive" });
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          setLat(latitude.toString());
          setLng(longitude.toString());
          const res = await apiRequest("POST", "/api/geocode/reverse", { lat: latitude, lng: longitude });
          const data = await res.json();
          if (data.village) setVillage(data.village);
          if (data.tehsil) setTehsil(data.tehsil);
          if (data.district) setDistrict(data.district);
          if (data.state) setStateName(data.state);
          if (data.postalCode) setPostalCode(data.postalCode);
          toast({ title: t("locationDetected") });
        } catch {
          toast({ title: t("locationError"), variant: "destructive" });
        } finally {
          setDetecting(false);
        }
      },
      () => {
        setDetecting(false);
        toast({ title: t("locationDenied"), variant: "destructive" });
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  function handleSave() {
    updateMutation.mutate({
      firstName: firstName.trim(),
      village: village.trim(),
      tehsil: tehsil.trim(),
      district: district.trim(),
      state: stateName.trim(),
      postalCode: postalCode.trim(),
      latitude: lat || undefined,
      longitude: lng || undefined,
    });
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 md:pb-6">
      <h2 className="text-xl font-bold mb-4" data-testid="text-profile-title">{t("myProfile")}</h2>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate" data-testid="text-profile-name">
              {profile?.firstName || user?.firstName || ""}
            </p>
            {profile?.farmerCode && (
              <div className="flex items-center gap-1 text-xs text-primary">
                <IdCard className="w-3 h-3" />
                <span data-testid="text-profile-farmer-code">{profile.farmerCode}</span>
              </div>
            )}
            {user?.phoneNumber && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="w-3 h-3" />
                <span data-testid="text-profile-phone">+91 {user.phoneNumber}</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="profileName" className="text-sm">{t("name")}</Label>
          <Input
            id="profileName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("namePlaceholder")}
            data-testid="input-profile-name"
          />
        </div>

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {t("detectLocation")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDetectLocation}
              disabled={detecting}
              data-testid="button-detect-location"
            >
              {detecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {t("detectingLocation")}
                </>
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5 mr-1.5" />
                  GPS
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="village" className="text-sm">{t("village")}</Label>
              <Input
                id="village"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder={t("villagePlaceholder")}
                data-testid="input-profile-village"
              />
            </div>
            <div>
              <Label htmlFor="tehsil" className="text-sm">{t("tehsil")}</Label>
              <Input
                id="tehsil"
                value={tehsil}
                onChange={(e) => setTehsil(e.target.value)}
                placeholder={t("tehsilPlaceholder")}
                data-testid="input-profile-tehsil"
              />
            </div>
            <div>
              <Label htmlFor="district" className="text-sm">{t("district")}</Label>
              <Input
                id="district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder={t("districtPlaceholder")}
                data-testid="input-profile-district"
              />
            </div>
            <div>
              <Label htmlFor="stateName" className="text-sm">{t("stateName")}</Label>
              <Input
                id="stateName"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                placeholder={t("statePlaceholder")}
                data-testid="input-profile-state"
              />
            </div>
            <div>
              <Label htmlFor="postalCode" className="text-sm">{t("postalCode")}</Label>
              <Input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("postalCodePlaceholder")}
                inputMode="numeric"
                maxLength={6}
                data-testid="input-profile-postal-code"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full"
          data-testid="button-save-profile"
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {t("save")}
        </Button>
      </Card>
    </div>
  );
}
