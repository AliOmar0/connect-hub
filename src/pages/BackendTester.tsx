import { useEffect, useRef, useState } from "react";
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
import { toast } from "sonner";
import { NODE_API_URL, apiFetch } from "@/lib/config";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface StatusResponse {
  ok: boolean;
  env: string;
  model: string;
  ttsProvider: string;
  redisHealthy: boolean;
  mediaConfigured: boolean;
  twilioSignatureValidation: boolean;
  providers: Record<string, boolean>;
}

interface VoiceResult {
  userText: string;
  aiText: string;
  ttsProvider: string;
  audio: { contentType: string; provider: string; base64: string } | null;
}

const BoolPill = ({ ok, label }: { ok: boolean; label: string }) => (
  <div className="flex items-center gap-2 text-sm">
    {ok ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-muted-foreground" />
    )}
    <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
  </div>
);

const BackendTester = () => {
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
        `Could not reach the Node API at ${NODE_API_URL}. Is it running? (npm run backend)`,
      );
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
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
      if (data.audio?.base64)
        playBase64(data.audio.base64, data.audio.contentType);
    } catch (err) {
      toast.error((err as Error).message);
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
      toast.error((err as Error).message);
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
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTtsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-6 animate-in fade-in duration-500">
        <audio ref={audioRef} hidden />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Backend Tester
            </h1>
            <p className="text-muted-foreground">
              Exercise the Node API (chat, voice, TTS) with no Twilio cost.
            </p>
          </div>
          <code className="text-xs bg-muted px-3 py-1.5 rounded-md">
            {NODE_API_URL}
          </code>
        </div>

        {/* Health panel */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Backend Health
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={loadingStatus}
            >
              {loadingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
          </CardHeader>
          <CardContent>
            {statusError && (
              <p className="text-sm text-destructive">{statusError}</p>
            )}
            {status && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">env: {status.env}</Badge>
                  <Badge variant="secondary">TTS: {status.ttsProvider}</Badge>
                  <Badge variant="secondary">model: {status.model}</Badge>
                  <Badge variant={status.redisHealthy ? "default" : "outline"}>
                    Redis:{" "}
                    {status.redisHealthy ? "connected" : "in-memory fallback"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <BoolPill
                    ok={status.providers.openrouter}
                    label="OpenRouter (AI)"
                  />
                  <BoolPill ok={status.providers.supabase} label="Supabase" />
                  <BoolPill ok={status.providers.twilio} label="Twilio" />
                  <BoolPill
                    ok={status.providers.whatsappOtp}
                    label="WhatsApp OTP"
                  />
                  <BoolPill ok={status.providers.azureTts} label="Azure TTS" />
                  <BoolPill
                    ok={status.providers.elevenlabs}
                    label="ElevenLabs"
                  />
                  <BoolPill
                    ok={status.providers.edgeTts}
                    label="Edge TTS (free)"
                  />
                  <BoolPill ok={status.mediaConfigured} label="Media storage" />
                </div>
                {status.ttsProvider !== "edge" &&
                  !status.providers.azureTts && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      TTS provider is "{status.ttsProvider}" but it isn't
                      configured. For free audio, set TTS_PROVIDER=edge in .env
                      and run the edge-tts server.
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
                  <PhoneCall className="h-4 w-4 mr-2" /> Voice
                </TabsTrigger>
                <TabsTrigger value="chat">
                  <MessageSquare className="h-4 w-4 mr-2" /> Chat
                </TabsTrigger>
                <TabsTrigger value="tts">
                  <Volume2 className="h-4 w-4 mr-2" /> TTS
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-6">
              {/* Voice simulator */}
              <TabsContent value="voice" className="space-y-4 mt-0">
                <CardDescription>
                  Simulates one phone turn (speech → AI reply) without placing a
                  real call. Plays the synthesized reply if TTS is configured.
                </CardDescription>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="Caller phone (e.g. +970599123456)"
                    value={voicePhone}
                    onChange={(e) => setVoicePhone(e.target.value)}
                    className="sm:w-64"
                  />
                  <Input
                    placeholder="What the caller says..."
                    value={voiceMsg}
                    onChange={(e) => setVoiceMsg(e.target.value)}
                    style={{ direction: "rtl" }}
                    className="flex-1"
                  />
                  <Button onClick={handleSimulateVoice} disabled={voiceLoading}>
                    {voiceLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PhoneCall className="h-4 w-4" />
                    )}
                    <span className="ml-2">Simulate</span>
                  </Button>
                </div>
                {voiceResult && (
                  <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Caller said
                      </span>
                      <p style={{ direction: "rtl" }}>{voiceResult.userText}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        AI reply
                      </span>
                      <p style={{ direction: "rtl" }}>{voiceResult.aiText}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        tts: {voiceResult.ttsProvider}
                      </Badge>
                      {voiceResult.audio ? (
                        <span className="flex items-center gap-1">
                          <Volume2 className="h-3 w-3" /> audio played (
                          {voiceResult.audio.provider})
                        </span>
                      ) : (
                        <span>
                          no audio (provider returned none — would use Twilio
                          Polly on a real call)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Chat */}
              <TabsContent value="chat" className="space-y-4 mt-0">
                <CardDescription>
                  Talks to /api/chat — the same AI logic the voice path uses. No
                  Twilio.
                </CardDescription>
                <div className="h-[360px] border rounded-xl flex flex-col bg-muted/5">
                  <div className="flex-1 p-4 overflow-y-auto space-y-3">
                    {chatHistory.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center mt-8">
                        Send a message to start.
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
                          style={{
                            direction: m.role === "assistant" ? "rtl" : "ltr",
                          }}
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
                      placeholder="Ask the AI..."
                      value={chatMsg}
                      onChange={(e) => setChatMsg(e.target.value)}
                      style={{ direction: "rtl" }}
                    />
                    <Button type="submit" size="icon" disabled={chatLoading}>
                      {chatLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </TabsContent>

              {/* TTS */}
              <TabsContent value="tts" className="space-y-4 mt-0">
                <CardDescription>
                  Synthesizes Arabic speech via the configured TTS provider and
                  plays it.
                </CardDescription>
                <Textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  style={{ direction: "rtl" }}
                  rows={3}
                />
                <div className="flex items-center gap-3">
                  <Button onClick={handleTts} disabled={ttsLoading}>
                    {ttsLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                    <span className="ml-2">Synthesize & Play</span>
                  </Button>
                  {ttsUrl && <audio controls src={ttsUrl} className="h-9" />}
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
