import { useState, useEffect, useId } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useAsyncAction } from "@/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/error-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { notifySuccess } from "@/lib/feedback";
import {
  Loader2,
  Eye,
  EyeOff,
  Phone,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import pibLogo from "@/assets/pib-logo.png";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

const channels = [
  { icon: Phone, labelKey: "auth.channels.voice" },
  { icon: MessageCircle, labelKey: "auth.channels.whatsapp" },
  { icon: MessagesSquare, labelKey: "auth.channels.webchat" },
] as const;

export default function AuthPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, signIn, loading: authLoading } = useAuth();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const emailErrorId = useId();
  const passwordErrorId = useId();

  // Wrap the unchanged `signIn` in the shared async-action so it enters a
  // loading Component_State, blocks duplicate submission while in flight, and
  // terminates with a recoverable Error_State after the 30s timeout budget
  // (Requirements 13.4, 13.5). The auth rules themselves are untouched.
  const signInAction = useAsyncAction(
    async (_signal, email: string, password: string) => {
      const { error } = await signIn(email, password);
      // Throw so the hook surfaces an Error_State; the thrown value is mapped
      // to a non-revealing message below (Requirement 13.3).
      if (error) throw error;
      return true;
    },
    {
      timeoutMessage: t("auth.errors.timeout"),
      // Non-revealing: every credential failure maps to the same message so we
      // never disclose which field was wrong (Requirement 13.3).
      getErrorMessage: () => t("auth.errors.invalid"),
      onSuccess: () => {
        notifySuccess(t("auth.success"));
        navigate("/");
      },
    },
  );

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const validate = () => {
    const nextEmailError = EMAIL_PATTERN.test(loginEmail)
      ? null
      : t("auth.validation.email");
    const nextPasswordError =
      loginPassword.length >= MIN_PASSWORD_LENGTH
        ? null
        : t("auth.validation.password");
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    return !nextEmailError && !nextPasswordError;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    // Duplicate submissions while a request is in flight are ignored by the
    // hook, enforcing a single in-flight authentication request (Req 13.4).
    void signInAction.run(loginEmail, loginPassword);
  };

  const isLoading = signInAction.isLoading;
  const authError = signInAction.status === "error" ? signInAction.error : null;

  if (authLoading) {
    return (
      <div className="h-full min-h-screen flex items-center justify-center bg-background">
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          aria-hidden="true"
        />
        <span className="sr-only">{t("auth.loading")}</span>
      </div>
    );
  }

  return (
    <div className="h-full min-h-screen w-full overflow-y-auto overflow-x-hidden bg-background lg:grid lg:grid-cols-2">
      {/* Brand panel — hidden on small screens, full banking identity on large */}
      <aside className="relative hidden overflow-hidden gradient-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* Decorative gold glow accents (constrained; no text overlaps them) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-gold/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-gold/10 blur-3xl"
        />

        <div className="relative flex min-w-0 items-center gap-3">
          <img
            src={pibLogo}
            alt={t("auth.logoAlt")}
            className="h-12 w-auto rounded-lg bg-white/95 p-1.5"
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="font-display text-lg font-bold">
              {t("auth.brandName")}
            </span>
            <span className="text-xs text-white/70">
              {t("auth.brandSubtitle")}
            </span>
          </div>
        </div>

        <div className="relative max-w-md space-y-6">
          <h1 className="font-display text-4xl font-bold leading-tight">
            {t("auth.brandTagline")}
          </h1>
          <p className="leading-relaxed text-white/80">
            {t("auth.brandDescription")}
          </p>

          <ul className="flex flex-wrap gap-3 pt-2">
            {channels.map(({ icon: Icon, labelKey }) => (
              <li
                key={labelKey}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm"
              >
                <Icon className="h-4 w-4 text-gold" aria-hidden="true" />
                {t(labelKey)}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-sm text-white/70">
          <ShieldCheck className="h-4 w-4 text-gold" aria-hidden="true" />
          {t("auth.security")}
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex min-h-screen flex-col items-center justify-center p-6 sm:p-10">
        <div className="absolute top-4 end-4">
          <LanguageSwitcher />
        </div>

        <div className="w-full max-w-md">
          {/* Compact logo for mobile (brand panel is hidden there) */}
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={pibLogo}
                alt={t("auth.logoAlt")}
                className="h-12 w-auto"
              />
              <div className="flex min-w-0 flex-col">
                <span className="font-display text-xl font-bold text-primary">
                  {t("auth.brandName")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("auth.brandSubtitle")}
                </span>
              </div>
            </div>
          </div>

          <Card className="border-border/60 shadow-elevated">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="font-display text-2xl">
                {t("auth.welcomeTitle")}
              </CardTitle>
              <CardDescription>{t("auth.welcomeSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              {authError ? (
                <ErrorState
                  title={t("auth.errors.title")}
                  description={authError.message}
                  onRetry={() => void signInAction.retry()}
                  className="mb-4 px-4 py-6"
                />
              ) : null}

              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="login-email">{t("auth.emailLabel")}</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder={t("auth.emailPlaceholder")}
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    required
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? emailErrorId : undefined}
                  />
                  {emailError ? (
                    <p
                      id={emailErrorId}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {emailError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">
                    {t("auth.passwordLabel")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder={t("auth.passwordPlaceholder")}
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        if (passwordError) setPasswordError(null);
                      }}
                      required
                      className="pe-11"
                      aria-invalid={passwordError ? true : undefined}
                      aria-describedby={
                        passwordError ? passwordErrorId : undefined
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword
                          ? t("auth.hidePassword")
                          : t("auth.showPassword")
                      }
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 end-0 flex w-11 cursor-pointer items-center justify-center text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {passwordError ? (
                    <p
                      id={passwordErrorId}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {passwordError}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  className="w-full cursor-pointer"
                  disabled={isLoading}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      {t("auth.signingIn")}
                    </>
                  ) : (
                    t("auth.signIn")
                  )}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                {t("auth.needAccount")}
              </p>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("auth.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </main>
    </div>
  );
}
