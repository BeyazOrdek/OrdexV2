import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { ArrowRight, Loader2, Lock, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ensureGuestUsername } from "@/lib/utils-room";
import { cn } from "@/lib/utils";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type Mode = "signin" | "signup";

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"main" | "email" | { email: string }>("main");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Username + password account form
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Reserve the persistent guest handle up front so "Misafir olarak gir"
  // always reuses the same Guest_#### identity across refreshes.
  useEffect(() => {
    if (step === "main") ensureGuestUsername();
  }, [step]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const clean = username.trim().toLowerCase();
      if (clean.length < 3 || password.length < 8) {
        throw new Error(
          "Kullanıcı adı en az 3 karakter, şifre en az 8 karakter olmalı.",
        );
      }
      await signIn("password", {
        flow: mode === "signup" ? "signUp" : "signIn",
        username: clean,
        password,
      });
      navigate(redirect);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/\{.*/s, "").trim() ||
              "Giriş yapılamadı. Bilgileri kontrol et."
          : "Giriş yapılamadı.",
      );
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Failed to sign in as guest: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Auth Content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center justify-center h-full flex-col">
        <Card className="min-w-[350px] pb-0 border shadow-md">
          {step === "main" ? (
            <>
              <CardHeader className="text-center">
                <div className="flex justify-center">
                  <img
                    src={logo}
                    alt="ÖRDEX"
                    width={64}
                    height={64}
                    className="rounded-lg mb-4 mt-4 cursor-pointer"
                    onClick={() => navigate("/")}
                  />
                </div>
                <CardTitle className="text-xl">ÖRDEX'e hoş geldin</CardTitle>
                <CardDescription>
                  Hesabınla gir ya da anında misafir olarak devam et
                </CardDescription>
              </CardHeader>
              <form onSubmit={handlePasswordSubmit}>
                <CardContent>
                  {/* Sign in / Sign up tabs */}
                  <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
                    {(["signin", "signup"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => switchMode(m)}
                        className={cn(
                          "rounded-md py-1.5 text-xs font-semibold transition-colors",
                          mode === m
                            ? "bg-[var(--ordex-accent)] text-white"
                            : "text-zinc-400 hover:text-zinc-200",
                        )}
                      >
                        {m === "signin" ? "Giriş yap" : "Kayıt ol"}
                      </button>
                    ))}
                  </div>

                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Kullanıcı adı"
                    autoComplete="username"
                    className="mb-2"
                    disabled={isLoading}
                    required
                    minLength={3}
                  />
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifre (en az 8 karakter)"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="mb-2"
                    disabled={isLoading}
                    required
                    minLength={8}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
                    disabled={isLoading || !username.trim() || password.length < 8}
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="mr-2 h-4 w-4" />
                    )}
                    {mode === "signup" ? "Hesap oluştur" : "Giriş yap"}
                  </Button>
                  {error && (
                    <p className="mt-2 text-sm text-red-500">{error}</p>
                  )}

                  <div className="mt-4">
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep("email")}
                        disabled={isLoading}
                        title="E-posta ile giriş (OTP)"
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        E-posta
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGuestLogin}
                        disabled={isLoading}
                        title="Misafir kimliği cihazında saklanır (Guest_1234)"
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        Misafir
                      </Button>
                    </div>
                    <p className="mt-2 text-center text-[10px] text-muted-foreground">
                      Misafir kimliğin (Guest_####) tarayıcında saklanır ve sayfa
                      yenilense de korunur.
                    </p>
                  </div>
                </CardContent>
              </form>
            </>
          ) : step === "email" ? (
            <>
              <CardHeader className="text-center">
                <div className="flex justify-center">
                  <img
                    src={logo}
                    alt="ÖRDEX"
                    width={64}
                    height={64}
                    className="rounded-lg mb-4 mt-4 cursor-pointer"
                    onClick={() => navigate("/")}
                  />
                </div>
                <CardTitle className="text-xl">E-posta ile giriş</CardTitle>
                <CardDescription>
                  E-postanı gir — doğrulama kodu gönderelim
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleEmailSubmit}>
                <CardContent>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="email"
                        placeholder="name@example.com"
                        type="email"
                        className="pl-9"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <Button type="submit" variant="outline" size="icon" disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-4 w-full"
                    onClick={() => setStep("main")}
                    disabled={isLoading}
                  >
                    Geri
                  </Button>
                </CardContent>
              </form>
            </>
          ) : (
            <>
              <CardHeader className="text-center mt-4">
                <CardTitle>Check your email</CardTitle>
                <CardDescription>
                  We've sent a code to {step.email}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleOtpSubmit}>
                <CardContent className="pb-4">
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />

                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                          const form = (e.target as HTMLElement).closest("form");
                          if (form) {
                            form.requestSubmit();
                          }
                        }
                      }}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {error && (
                    <p className="mt-2 text-sm text-red-500 text-center">{error}</p>
                  )}
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Didn't receive a code?{" "}
                    <Button
                      variant="link"
                      className="p-0 h-auto"
                      onClick={() => setStep("main")}
                    >
                      Try again
                    </Button>
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify code
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("main")}
                    disabled={isLoading}
                    className="w-full"
                  >
                    Use different email
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
            Secured by{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary transition-colors"
            >
              freebuff.com
            </a>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
