import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/ui/error-state";
import {
  Loader2,
  Send,
  RefreshCw,
  Volume2,
  PhoneCall,
  MessageSquare,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { NODE_API_URL, apiFetch } from "@/lib/config";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface StatusResponse {
  ok: boolean;
  env: string;
  model: string;
  ttsProvider: string;
  redisHealthy: boolean;
  mediaConfigured: boolean;
  vapiSignatureValidation: boolean;
  providers: Record<string, boolean>;
}

interface VoiceResult {
  userText: string;
  aiText: string;
  ttsProvider: string;
  audio: { contentType: string; provider: string; base64: string } | null;
}

const BoolPill = ({ ok, label }: { ok: boolean; label: string }) => {
  const { t } = useTranslation();
  // Non-color cue (icon + status word) pairs with the color per Requirement 3.5.
  const stateLabel = ok
    ? t("diagnostics.backend.health.available", { label })
    : t("diagnostics.backend.health.unavailable", { label });
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2
          className="h-4 w-4 text-status-success"
          aria-hidden="true"
        />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>
        <span className="sr-only">{stateLabel}</span>
        <span aria-hidden="true">{label}</span>
      </span>
    </div>
  );
};

const BackendTester = () => {
  const { t } = useTranslation();

  // --- Status ---
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // --- Voice simulator ---
  const [voiceMsg, setVoiceMsg] = useState("بدي اعرف رصيدي");
  const [voicePhone, setVoicePhone] = useState("+970599123456");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceResult, setVoiceResult] = useState<VoiceResult | null>(null);
  const [sessionId] = useState(
    () => `tester-${Math.random().toString(36).slice(2, 9)}`,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Chat ---
  const [chatMsg, setChatMsg] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    { role: string; content: string }[]
  >([]);

  // --- TTS ---
  const [ttsText, setTtsText] = useState(
    "أهلاً بك في البنك الإسلامي الفلسطيني",
  );
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await apiFetch(`${NODE_API_URL}/api/test/status`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setStatus(await res.json());
    } catch (err) {
      setStatusError(
        t("diagnostics.backend.health.unreachable", { url: NODE_API_URL }),
      );
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playBase64 = (b64: string, mime: string) => {
    const url = `data:${mime};base64,${b64}`;
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play().catch(() => {});
    }
  };

  const handleSimulateVoice = async () => {
    if (!voiceMsg.trim()) return;
    setVoiceLoading(true);
    setVoiceResult(null);
    try {
      const res = await apiFetch(`${NODE_API_URL}/api/test/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: voiceMsg,
          sessionId,
          phone: voicePhone || undefined,
          speak: true,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || `Server returned ${res.status}`);
      setVoiceResult(data);
      notifySuccess(t("diagnostics.backend.voice.success"));
      if (data.audio?.base64)
        playBase64(data.audio.base64, data.audio.contentType);
    } catch (err) {
      notifyError((err as Error).message);
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMsg.trim()) return;
    const userMsg = { role: "user", content: chatMsg };
    setChatHistory((p) => [...p, userMsg]);
    const sent = chatMsg;
    setChatMsg("");
    setChatLoading(true);
    try {
      const res = await apiFetch(`${NODE_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: sent,
          history: chatHistory.slice(-5),
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || `Server returned ${res.status}`);
      setChatHistory((p) => [
        ...p,
        { role: "assistant", content: data.content },
      ]);
    } catch (err) {
      notifyError((err as Error).message);
    } finally {
      setChatLoading(false);
    }
  };

  const handleTts = async () => {
    if (!ttsText.trim()) return;
    setTtsLoading(true);
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    setTtsUrl(null);
    try {
      const res = await apiFetch(`${NODE_API_URL}/api/test/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setTtsUrl(url);
      notifySuccess(t("diagnostics.backend.tts.success"));
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
    } catch (err) {
      notifyError((err as Error).message);
    } finally {
      setTtsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <audio
          ref={audioRef}
          hidden
          aria-label={t("diagnostics.backend.audioLabel")}
        />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t("diagnostics.backend.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("diagnostics.backend.subtitle")}
            </p>
          </div>
          <code className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded-md">
            {NODE_API_URL}
          </code>
        </div>

        {/* Health panel */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" aria-hidden="true" />{" "}
              {t("diagnostics.backend.health.title")}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={loadingStatus}
            >
              {loadingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="ml-2">
                {t("diagnostics.backend.health.refresh")}
              </span>
            </Button>
          </CardHeader>
          <CardContent>
            {statusError && (
              <ErrorState
                title={t("feedback.errorTitle")}
                description={statusError}
                onRetry={fetchStatus}
              />
            )}
            {status && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {t("diagnostics.backend.health.env", { value: status.env })}
                  </Badge>
                  <Badge variant="secondary">
                    {t("diagnostics.backend.health.tts", {
                      value: status.ttsProvider,
                    })}
                  </Badge>
                  <Badge variant="secondary">
                    {t("diagnostics.backend.health.model", {
                      value: status.model,
                    })}
                  </Badge>
                  <Badge variant={status.redisHealthy ? "default" : "outline"}>
                    {status.redisHealthy
                      ? t("diagnostics.backend.health.redisConnected")
                      : t("diagnostics.backend.health.redisFallback")}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <BoolPill
                    ok={status.providers.openrouter}
                    label={t("diagnostics.backend.health.providers.openrouter")}
                  />
                  <BoolPill
                    ok={status.providers.supabase}
                    label={t("diagnostics.backend.health.providers.supabase")}
                  />
                  <BoolPill
                    ok={status.providers.vapi}
                    label={t("diagnostics.backend.health.providers.vapi")}
                  />
                  <BoolPill
                    ok={status.providers.whatsappOtp}
                    label={t(
                      "diagnostics.backend.health.providers.whatsappOtp",
                    )}
                  />
                  <BoolPill
                    ok={status.providers.azureTts}
                    label={t("diagnostics.backend.health.providers.azureTts")}
                  />
                  <BoolPill
                    ok={status.providers.elevenlabs}
                    label={t("diagnostics.backend.health.providers.elevenlabs")}
                  />
                  <BoolPill
                    ok={status.providers.edgeTts}
                    label={t("diagnostics.backend.health.providers.edgeTts")}
                  />
                  <BoolPill
                    ok={status.mediaConfigured}
                    label={t("diagnostics.backend.health.providers.media")}
                  />
                </div>
                {status.ttsProvider !== "edge" &&
                  !status.providers.azureTts && (
                    <p className="text-xs text-status-warning-foreground">
                      {t("diagnostics.backend.health.ttsWarning", {
                        provider: status.ttsProvider,
                      })}
                    </p>
                  )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test tabs */}
        <Card className="shadow-lg">
          <Tabs defaultValue="voice">
            <CardHeader className="border-b">
              <TabsList className="grid w-full grid-cols-3 max-w-[480px]">
                <TabsTrigger value="voice">
                  <PhoneCall className="h-4 w-4 mr-2" aria-hidden="true" />{" "}
                  {t("diagnostics.backend.tabs.voice")}
                </TabsTrigger>
                <TabsTrigger value="chat">
                  <MessageSquare className="h-4 w-4 mr-2" aria-hidden="true" />{" "}
                  {t("diagnostics.backend.tabs.chat")}
                </TabsTrigger>
                <TabsTrigger value="tts">
                  <Volume2 className="h-4 w-4 mr-2" aria-hidden="true" />{" "}
                  {t("diagnostics.backend.tabs.tts")}
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-6">
              {/* Voice simulator */}
              <TabsContent value="voice" className="space-y-4 mt-0">
                <CardDescription>
                  {t("diagnostics.backend.voice.description")}
                </CardDescription>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    aria-label={t("diagnostics.backend.voice.phonePlaceholder")}
                    placeholder={t(
                      "diagnostics.backend.voice.phonePlaceholder",
                    )}
                    value={voicePhone}
                    onChange={(e) => setVoicePhone(e.target.value)}
                    className="sm:w-64"
                  />
                  <Input
                    aria-label={t(
                      "diagnostics.backend.voice.messagePlaceholder",
                    )}
                    placeholder={t(
                      "diagnostics.backend.voice.messagePlaceholder",
                    )}
                    value={voiceMsg}
                    onChange={(e) => setVoiceMsg(e.target.value)}
                    dir="rtl"
                    className="flex-1"
                  />
                  <Button onClick={handleSimulateVoice} disabled={voiceLoading}>
                    {voiceLoading ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <PhoneCall className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="ml-2">
                      {t("diagnostics.backend.voice.simulate")}
                    </span>
                  </Button>
                </div>
                {voiceResult && (
                  <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        {t("diagnostics.backend.voice.callerSaid")}
                      </span>
                      <p dir="rtl">{voiceResult.userText}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        {t("diagnostics.backend.voice.aiReply")}
                      </span>
                      <p dir="rtl">{voiceResult.aiText}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        {t("diagnostics.backend.voice.ttsLabel", {
                          provider: voiceResult.ttsProvider,
                        })}
                      </Badge>
                      {voiceResult.audio ? (
                        <span className="flex items-center gap-1">
                          <Volume2 className="h-3 w-3" aria-hidden="true" />{" "}
                          {t("diagnostics.backend.voice.audioPlayed", {
                            provider: voiceResult.audio.provider,
                          })}
                        </span>
                      ) : (
                        <span>{t("diagnostics.backend.voice.noAudio")}</span>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Chat */}
              <TabsContent value="chat" className="space-y-4 mt-0">
                <CardDescription>
                  {t("diagnostics.backend.chat.description")}
                </CardDescription>
                <div className="h-[360px] border rounded-xl flex flex-col bg-muted/5">
                  <div className="flex-1 p-4 overflow-y-auto space-y-3">
                    {chatHistory.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center mt-8">
                        {t("diagnostics.backend.chat.empty")}
                      </p>
                    )}
                    {chatHistory.map((m, i) => (
                      <div
                        key={i}
                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                            m.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-card border"
                          }`}
                          dir={m.role === "assistant" ? "rtl" : "ltr"}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={handleChat}
                    className="p-3 border-t flex gap-2"
                  >
                    <Input
                      aria-label={t("diagnostics.backend.chat.placeholder")}
                      placeholder={t("diagnostics.backend.chat.placeholder")}
                      value={chatMsg}
                      onChange={(e) => setChatMsg(e.target.value)}
                      dir="rtl"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={chatLoading}
                      aria-label={t("diagnostics.backend.chat.send")}
                    >
                      {chatLoading ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </form>
                </div>
              </TabsContent>

              {/* TTS */}
              <TabsContent value="tts" className="space-y-4 mt-0">
                <CardDescription>
                  {t("diagnostics.backend.tts.description")}
                </CardDescription>
                <Textarea
                  aria-label={t("diagnostics.backend.tts.description")}
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  dir="rtl"
                  rows={3}
                />
                <div className="flex items-center gap-3">
                  <Button onClick={handleTts} disabled={ttsLoading}>
                    {ttsLoading ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Volume2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="ml-2">
                      {t("diagnostics.backend.tts.synthesize")}
                    </span>
                  </Button>
                  {ttsUrl && (
                    <audio
                      controls
                      src={ttsUrl}
                      className="h-9"
                      aria-label={t("diagnostics.backend.tts.playerLabel")}
                    />
                  )}
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default BackendTester;
