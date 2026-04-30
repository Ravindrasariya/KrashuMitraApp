import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sprout, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import ReCAPTCHA from "react-google-recaptcha";

const RECAPTCHA_SITE_KEY = import.meta.env.DEV ? "" : "6LfDSIIsAAAAAKaKfw8TBpyhYXde06X7cjQjBU_V";

type AuthMode = "login" | "register" | "forgot" | "changePin";

function PinInput({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (val: string) => void;
  testId: string;
}) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const digits = value.padEnd(4, "").split("").slice(0, 4);

  const handleChange = useCallback(
    (index: number, char: string) => {
      if (char && !/^\d$/.test(char)) return;
      const arr = value.padEnd(4, " ").split("").slice(0, 4);
      arr[index] = char || " ";
      const newVal = arr.join("").replace(/ /g, "");
      onChange(newVal.slice(0, 4));
      if (char && index < 3) {
        refs[index + 1].current?.focus();
      }
    },
    [value, onChange, refs]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !digits[index]?.trim() && index > 0) {
        refs[index - 1].current?.focus();
      }
    },
    [digits, refs]
  );

  return (
    <div className="flex gap-3 justify-center" data-testid={testId}>
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={refs[i]}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digits[i]?.trim() || ""}
          onChange={(e) => handleChange(i, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-12 h-14 text-center text-xl font-bold border-2 rounded-lg bg-background focus:border-primary focus:outline-none transition-colors"
          data-testid={`${testId}-digit-${i}`}
        />
      ))}
    </div>
  );
}

function getSafeNextPath(): string {
  if (typeof window === "undefined") return "/";
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("next");
    if (!raw) return "/";
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  } catch {
    return "/";
  }
}

export default function AuthPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<AuthMode>("login");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [firstName, setFirstName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<ReCAPTCHA>(null);
  const nextPath = getSafeNextPath();

  useEffect(() => {
    if (isAuthenticated && mode !== "changePin") {
      setLocation(nextPath);
    }
  }, [isAuthenticated, mode, setLocation, nextPath]);

  if (isAuthenticated && mode !== "changePin") {
    return null;
  }

  const resetForm = () => {
    setPin("");
    setConfirmPin("");
    setCaptchaToken(null);
    captchaRef.current?.reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        if (pin !== confirmPin) {
          toast({ title: t("pinMismatch"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        if (!firstName.trim()) {
          toast({ title: t("nameRequired"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }

        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: phone, firstName: firstName.trim(), pin }),
          credentials: "include",
        });

        if (!res.ok) {
          const data = await res.json();
          toast({ title: t(data.message as any) || t("registrationFailed"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setLocation(nextPath);
      } else if (mode === "login") {
        if (RECAPTCHA_SITE_KEY && !captchaToken) {
          toast({ title: t("captchaRequired"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: phone, pin, captchaToken: captchaToken || undefined }),
          credentials: "include",
        });

        if (!res.ok) {
          const data = await res.json();
          toast({ title: t(data.message as any) || t("wrongCredentials"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }

        const loginData = await res.json();

        if (loginData.mustChangePin) {
          setMode("changePin");
          setOldPin(pin);
          setPin("");
          setConfirmPin("");
          setIsSubmitting(false);
          return;
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setLocation(nextPath);
      } else if (mode === "changePin") {
        if (pin !== confirmPin) {
          toast({ title: t("pinMismatch"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }

        const res = await fetch("/api/auth/change-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPin, newPin: pin }),
          credentials: "include",
        });

        if (!res.ok) {
          const data = await res.json();
          toast({ title: t(data.message as any) || t("resetFailed"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({ title: t("pinChanged") });
        setLocation(nextPath);
      } else if (mode === "forgot") {
        if (pin !== confirmPin) {
          toast({ title: t("pinMismatch"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }

        const res = await fetch("/api/auth/forgot-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: phone, newPin: pin }),
          credentials: "include",
        });

        if (!res.ok) {
          const data = await res.json();
          toast({ title: t(data.message as any) || t("resetFailed"), variant: "destructive" });
          setIsSubmitting(false);
          return;
        }

        toast({ title: t("pinReset") });
        setMode("login");
        resetForm();
      }
    } catch {
      toast({ title: t("loginFailed"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid =
    mode === "changePin"
      ? pin.length === 4 && confirmPin.length === 4
      : phone.length === 10 &&
        pin.length === 4 &&
        (mode === "login" || confirmPin.length === 4) &&
        (mode !== "register" || firstName.trim().length > 0);

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background px-4 py-8"
      data-testid="page-auth"
    >
      <Card className="w-full max-w-sm">
        <CardContent className="pt-8 pb-6 px-6">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center mb-3">
              <Sprout className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold" data-testid="text-auth-title">
              {t("appName")}
            </h1>
            <p className="text-xs text-primary">{t("appTagline")}</p>
          </div>

          <h2 className="text-base font-semibold text-center mb-5" data-testid="text-auth-mode">
            {mode === "login"
              ? t("login")
              : mode === "register"
                ? t("register")
                : mode === "changePin"
                  ? t("changePinTitle")
                  : t("forgotPin")}
          </h2>

          {mode === "changePin" && (
            <p className="text-sm text-center text-muted-foreground mb-4" data-testid="text-change-pin-message">
              {t("changePinMessage")}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="firstName" className="text-sm">
                  {t("name")}
                </Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  data-testid="input-first-name"
                  autoComplete="name"
                />
              </div>
            )}

            {mode !== "changePin" && (
              <div>
                <Label htmlFor="phone" className="text-sm">
                  {t("phoneNumber")}
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground font-medium shrink-0">
                    +91
                  </span>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder={t("phonePlaceholder")}
                    data-testid="input-phone"
                    autoComplete="tel-national"
                  />
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm">
                {mode === "forgot" || mode === "changePin" ? t("newPin") : t("pin")}
              </Label>
              <PinInput value={pin} onChange={setPin} testId="input-pin" />
            </div>

            {(mode === "register" || mode === "forgot" || mode === "changePin") && (
              <div>
                <Label className="text-sm">{t("confirmPin")}</Label>
                <PinInput
                  value={confirmPin}
                  onChange={setConfirmPin}
                  testId="input-confirm-pin"
                />
              </div>
            )}

            {mode === "login" && RECAPTCHA_SITE_KEY && (
              <div className="flex justify-center" data-testid="captcha-container">
                <ReCAPTCHA
                  ref={captchaRef}
                  sitekey={RECAPTCHA_SITE_KEY}
                  onChange={(token) => setCaptchaToken(token)}
                  onExpired={() => setCaptchaToken(null)}
                />
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={!isValid || isSubmitting || (mode === "login" && !!RECAPTCHA_SITE_KEY && !captchaToken)}
              data-testid="button-auth-submit"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "login"
                ? t("login")
                : mode === "register"
                  ? t("register")
                  : mode === "changePin"
                    ? t("save")
                    : t("resetPin")}
            </Button>
          </form>

          <div className="mt-5 space-y-2 text-center text-sm">
            {mode === "login" && (
              <>
                <button
                  onClick={() => {
                    setMode("register");
                    resetForm();
                  }}
                  className="text-primary hover:underline block w-full"
                  data-testid="link-to-register"
                >
                  {t("noAccount")}
                </button>
                <button
                  onClick={() => {
                    setMode("forgot");
                    resetForm();
                  }}
                  className="text-muted-foreground hover:underline block w-full"
                  data-testid="link-to-forgot"
                >
                  {t("forgotPin")}
                </button>
              </>
            )}
            {(mode === "register" || mode === "forgot") && (
              <button
                onClick={() => {
                  setMode("login");
                  resetForm();
                }}
                className="text-primary hover:underline block w-full"
                data-testid="link-to-login"
              >
                {t("backToLogin")}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
