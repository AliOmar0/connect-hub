import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PhoneCall,
  PhoneOff,
  Loader2,
  Send,
  Mic,
  Globe,
  ServerCog,
  ServerOff,
  FileText,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { supabase } from "@/integrations/supabase/client";
import Vapi from "@vapi-ai/web";

const API_BASE = "http://localhost:3001";

// The Vapi config and outbound-call endpoints are protected by the Node server
// (requireAuth + agent role), so requests must carry the Supabase access token
// as a Bearer header. Without it the server replies 401 "Missing or malformed
// Authorization header." Chat is unauthenticated, so it doesn't need this.
const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
};

const VapiDemo = () => {
  const { t } = useTranslation();

  // Outbound (dialed) call state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [calling, setCalling] = useState(false);
  const [, setCallSid] = useState<string | null>(null);

  // Browser (web) voice-call state
  const vapiRef = useRef<Vapi | null>(null);
  const [voiceStatus, setVoiceStatus] = useState(() =>
    t("diagnostics.vapi.sdk.offline"),
  );
  const [inCall, setInCall] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Live transcript of the browser voice call. `transcript` holds finalized
  // turns (both what the customer said and what the assistant replied) and
  // `partialLine` shows the in-progress utterance. Toggled for testing.
  type TranscriptEntry = { role: "user" | "assistant"; text: string };
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [partialLine, setPartialLine] = useState<TranscriptEntry | null>(null);

  // Text Chat State
  const [chatMessage, setChatMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    { role: string; content: string }[]
  >([]);

  // Chat Verification State
  const [chatPhone, setChatPhone] = useState("");
  const [chatSessionId] = useState(() =>
    Math.random().toString(36).substring(7),
  );

  // Backend availability. Calls are only allowed once the Node voice server
  // (started in a terminal via `npm run channel:voice`) answers /health.
  const [serverStatus, setServerStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");
  const serverOnline = serverStatus === "online";

  // Tear down any active Vapi call when leaving the page.
  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
      vapiRef.current = null;
    };
  }, []);

  // Poll the backend health endpoint so the UI knows whether the server is up.
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
        if (active) setServerStatus(res.ok ? "online" : "offline");
      } catch {
        if (active) setServerStatus("offline");
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Start a live in-browser voice call with the AI assistant through Vapi.
  const startVoiceCall = async () => {
    if (!serverOnline) {
      notifyError(t("diagnostics.vapi.server.blocked"));
      return;
    }
    setConnecting(true);
    setVoiceStatus(t("diagnostics.vapi.sdk.connecting"));
    setTranscript([]);
    setPartialLine(null);
    try {
      const response = await fetch(`${API_BASE}/api/vapi/config`, {
        headers: await getAuthHeaders(),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            errorData.details ||
            `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();
      const publicKey = data.publicKey ?? data.data?.publicKey;
      const assistantId = data.assistantId ?? data.data?.assistantId;
      if (!publicKey || !assistantId) {
        throw new Error(t("diagnostics.vapi.sdk.noConfig"));
      }

      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      // Capture live transcripts. Vapi emits { type: "transcript", role,
      // transcriptType: "partial"|"final", transcript }. Finalized turns are
      // appended; partials update a single in-progress line.
      vapi.on("message", (msg: unknown) => {
        const m = msg as {
          type?: string;
          role?: string;
          transcriptType?: string;
          transcript?: string;
        };
        if (m?.type !== "transcript" || !m.transcript) return;
        const role: TranscriptEntry["role"] =
          m.role === "assistant" ? "assistant" : "user";
        if (m.transcriptType === "final") {
          setTranscript((prev) => [...prev, { role, text: m.transcript! }]);
          setPartialLine(null);
        } else {
          setPartialLine({ role, text: m.transcript! });
        }
      });

      vapi.on("call-start", () => {
        setInCall(true);
        setConnecting(false);
        setVoiceStatus(t("diagnostics.vapi.sdk.online"));
        notifySuccess(t("diagnostics.vapi.sdk.registered"));
      });

      vapi.on("call-end", () => {
        setInCall(false);
        setConnecting(false);
        setPartialLine(null);
        setVoiceStatus(t("diagnostics.vapi.sdk.ended"));
      });

      vapi.on("error", (error: unknown) => {
        const message =
          (error as Error)?.message || t("diagnostics.vapi.sdk.unknownError");
        setInCall(false);
        setConnecting(false);
        setVoiceStatus(t("diagnostics.vapi.sdk.error", { message }));
        notifyError(t("diagnostics.vapi.sdk.errorToast", { message }));
      });

      await vapi.start(assistantId);
    } catch (err: unknown) {
      const error = err as Error;
      const errorMessage =
        error?.message || t("diagnostics.vapi.sdk.unknownError");
      setConnecting(false);
      setInCall(false);
      setVoiceStatus(
        t("diagnostics.vapi.sdk.setupRequired", { message: errorMessage }),
      );
      notifyError(
        t("diagnostics.vapi.sdk.setupError", { message: errorMessage }),
      );
    }
  };

  const stopVoiceCall = () => {
    vapiRef.current?.stop();
    setInCall(false);
    setVoiceStatus(t("diagnostics.vapi.sdk.ended"));
  };

  const handleCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;
    if (!serverOnline) {
      notifyError(t("diagnostics.vapi.server.blocked"));
      return;
    }
    setCalling(true);
    try {
      const response = await fetch(`${API_BASE}/api/make-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ to: phoneNumber }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      notifySuccess(t("diagnostics.vapi.voice.success"));
      setCallSid(data.sid ?? data.data?.sid ?? null);
    } catch (err: unknown) {
      const error = err as Error;
      notifyError(error.message);
    } finally {
      setCalling(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    const userMsg = { role: "user", content: chatMessage };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatMessage("");
    setChatLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: chatMessage,
          history: chatHistory.slice(-5),
          phone: chatPhone,
          sessionId: chatSessionId,
        }),
      });
      const data = await response.json();
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: data.content ?? data.data?.content },
      ]);
    } catch (err: unknown) {
      const error = err as Error;
      notifyError(t("diagnostics.vapi.chat.error", { message: error.message }));
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {t("diagnostics.vapi.title")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t("diagnostics.vapi.subtitle")}
          </p>
        </div>
        <div
          role="status"
          className={`px-4 py-2 rounded-full text-xs font-bold border ${
            inCall
              ? "bg-status-success/10 text-status-success border-status-success/20"
              : "bg-status-error/10 text-status-error border-status-error/20"
          }`}
        >
          {t("diagnostics.vapi.sdkStatus", { status: voiceStatus })}
        </div>
      </div>

      <div
        role="status"
        className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
          serverOnline
            ? "border-status-success/20 bg-status-success/10 text-status-success"
            : "border-status-error/20 bg-status-error/10 text-status-error"
        }`}
      >
        {serverStatus === "checking" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : serverOnline ? (
          <ServerCog className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ServerOff className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="font-medium">
          {t(`diagnostics.vapi.server.${serverStatus}`)}
        </span>
        {!serverOnline && serverStatus !== "checking" && (
          <span className="text-muted-foreground">
            — {t("diagnostics.vapi.server.offlineHint")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Mic className="h-4 w-4" aria-hidden="true" />
                {t("diagnostics.vapi.security.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {inCall ? (
                <Button
                  variant="destructive"
                  className="w-full text-xs"
                  onClick={stopVoiceCall}
                >
                  <PhoneOff className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("diagnostics.vapi.security.stop")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full text-xs"
                  onClick={startVoiceCall}
                  disabled={connecting || !serverOnline}
                >
                  {connecting ? (
                    <Loader2
                      className="h-4 w-4 mr-2 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <PhoneCall className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  {t("diagnostics.vapi.security.start")}
                </Button>
              )}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("diagnostics.vapi.security.hint")}
              </p>

              <div className="flex items-center justify-between border-t pt-3">
                <Label
                  htmlFor="vapi-transcript-toggle"
                  className="flex items-center gap-2 text-xs font-medium"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {t("diagnostics.vapi.transcript.toggle")}
                </Label>
                <Switch
                  id="vapi-transcript-toggle"
                  checked={showTranscript}
                  onCheckedChange={setShowTranscript}
                  aria-label={t("diagnostics.vapi.transcript.toggle")}
                />
              </div>

              {showTranscript && (
                <div
                  className="max-h-64 overflow-y-auto rounded-lg border bg-muted/20 p-3 space-y-2"
                  aria-live="polite"
                  aria-label={t("diagnostics.vapi.transcript.title")}
                >
                  {transcript.length === 0 && !partialLine ? (
                    <p className="text-xs text-muted-foreground italic">
                      {t("diagnostics.vapi.transcript.empty")}
                    </p>
                  ) : (
                    <>
                      {transcript.map((entry, i) => (
                        <div key={i} className="text-xs">
                          <span
                            className={`font-semibold ${
                              entry.role === "assistant"
                                ? "text-primary"
                                : "text-foreground"
                            }`}
                          >
                            {entry.role === "assistant"
                              ? t("diagnostics.vapi.transcript.roleAssistant")
                              : t("diagnostics.vapi.transcript.roleCustomer")}
                            :{" "}
                          </span>
                          <span className="text-muted-foreground">
                            {entry.text}
                          </span>
                        </div>
                      ))}
                      {partialLine && (
                        <div className="text-xs opacity-60">
                          <span
                            className={`font-semibold ${
                              partialLine.role === "assistant"
                                ? "text-primary"
                                : "text-foreground"
                            }`}
                          >
                            {partialLine.role === "assistant"
                              ? t("diagnostics.vapi.transcript.roleAssistant")
                              : t("diagnostics.vapi.transcript.roleCustomer")}
                            :{" "}
                          </span>
                          <span className="text-muted-foreground italic">
                            {partialLine.text}…
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {t("diagnostics.vapi.bankingVoice.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 text-sm text-primary">
                <Globe className="h-4 w-4" aria-hidden="true" />
                <span>{t("diagnostics.vapi.bankingVoice.value")}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Card className="shadow-xl">
            <Tabs defaultValue="voice">
              <CardHeader className="border-b bg-muted/20">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                  <TabsTrigger value="voice">
                    {t("diagnostics.vapi.tabs.voice")}
                  </TabsTrigger>
                  <TabsTrigger value="chat">
                    {t("diagnostics.vapi.tabs.chat")}
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="p-6">
                <TabsContent value="voice">
                  <form onSubmit={handleCall} className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="vapi-voice-number">
                        {t("diagnostics.vapi.voice.label")}
                      </Label>
                      <div className="flex gap-3">
                        <Input
                          id="vapi-voice-number"
                          placeholder={t("diagnostics.vapi.voice.placeholder")}
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="text-lg h-12"
                          disabled={!serverOnline}
                        />
                        <Button
                          type="submit"
                          size="lg"
                          className="h-12"
                          disabled={calling || !serverOnline}
                        >
                          {calling ? (
                            <Loader2
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            t("diagnostics.vapi.voice.dial")
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        {t("diagnostics.vapi.voice.hint")}
                      </p>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="chat">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                      <Globe
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Label
                        htmlFor="vapi-chat-phone"
                        className="text-xs font-semibold text-muted-foreground"
                      >
                        {t("diagnostics.vapi.chat.identityLabel")}
                      </Label>
                      <Input
                        id="vapi-chat-phone"
                        className="h-8 text-xs w-48"
                        placeholder={t(
                          "diagnostics.vapi.chat.identityPlaceholder",
                        )}
                        value={chatPhone}
                        onChange={(e) => setChatPhone(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground italic">
                        {t("diagnostics.vapi.chat.identityHint")}
                      </p>
                    </div>
                    <div className="h-[400px] border rounded-xl flex flex-col bg-muted/5">
                      <div className="flex-1 p-6 overflow-y-auto space-y-4">
                        {chatHistory.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] p-4 rounded-2xl text-sm ${
                                msg.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-card border"
                              }`}
                              dir={msg.role === "assistant" ? "rtl" : "ltr"}
                            >
                              {msg.content}
                            </div>
                          </div>
                        ))}
                      </div>
                      <form
                        onSubmit={handleChat}
                        className="p-4 border-t flex gap-2"
                      >
                        <Input
                          aria-label={t("diagnostics.vapi.chat.placeholder")}
                          placeholder={t("diagnostics.vapi.chat.placeholder")}
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          className="h-11"
                          dir="rtl"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          className="rounded-full h-11 w-11"
                          disabled={chatLoading}
                          aria-label={t("diagnostics.vapi.chat.send")}
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
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VapiDemo;
