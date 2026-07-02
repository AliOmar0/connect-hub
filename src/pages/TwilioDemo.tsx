import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhoneCall, Loader2, Send, ShieldCheck, Globe } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { Device } from "@twilio/voice-sdk";

const TwilioDemo = () => {
  const { t } = useTranslation();

  // Standard Call State
  const [phoneNumber, setPhoneNumber] = useState("");
  const [calling, setCalling] = useState(false);
  const [, setCallSid] = useState<string | null>(null);

  // Voice SDK State
  const [, setDevice] = useState<Device | null>(null);
  const [sdkStatus, setSdkStatus] = useState(() =>
    t("diagnostics.twilio.sdk.offline"),
  );
  const [sdkOnline, setSdkOnline] = useState(false);
  const [isIncoming, setIsIncoming] = useState(false);
  const [activeConnection, setActiveConnection] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Text Chat State
  const [chatMessage, setChatMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    { role: string; content: string }[]
  >([]);

  // SMS State
  const [smsNumber, setSmsNumber] = useState("");
  const [smsBody, setSmsBody] = useState("Testing SMS from PIB Hub");
  const [smsSending, setSmsSending] = useState(false);

  // Chat Verification State
  const [chatPhone, setChatPhone] = useState("");
  const [chatSessionId] = useState(() =>
    Math.random().toString(36).substring(7),
  );

  // Initialize Twilio Voice SDK
  const initSDK = async () => {
    setSdkStatus(t("diagnostics.twilio.sdk.connecting"));
    setSdkOnline(false);
    try {
      const response = await fetch("http://localhost:3001/api/token");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            errorData.details ||
            `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.token) {
        throw new Error(t("diagnostics.twilio.sdk.noToken"));
      }

      // Twilio Voice SDK v2.0+ instantiation
      const newDevice = new Device(data.token, {
        logLevel: "debug",
      });

      newDevice.on("registered", () => {
        setSdkStatus(
          t("diagnostics.twilio.sdk.online", { identity: data.identity }),
        );
        setSdkOnline(true);
        notifySuccess(t("diagnostics.twilio.sdk.registered"));
      });

      newDevice.on("error", (error) => {
        setSdkStatus(
          t("diagnostics.twilio.sdk.error", { message: error.message }),
        );
        setSdkOnline(false);
        notifyError(
          t("diagnostics.twilio.sdk.errorToast", { message: error.message }),
        );
      });

      newDevice.on("incoming", (connection) => {
        notifySuccess(t("diagnostics.twilio.incoming.toast"));
        setIsIncoming(true);
        setActiveConnection(connection);

        connection.on("disconnect", () => {
          setIsIncoming(false);
          setActiveConnection(null);
        });
      });

      await newDevice.register();
      setDevice(newDevice);
    } catch (err: unknown) {
      const error = err as Error;
      const errorMessage =
        error?.message || t("diagnostics.twilio.sdk.unknownError");
      setSdkStatus(
        t("diagnostics.twilio.sdk.setupRequired", { message: errorMessage }),
      );
      setSdkOnline(false);
      notifyError(
        t("diagnostics.twilio.sdk.setupError", { message: errorMessage }),
      );
    }
  };

  const handleAcceptCall = () => {
    if (activeConnection) {
      activeConnection.accept();
      setIsIncoming(false);
    }
  };

  const handleCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setCalling(true);
    try {
      const response = await fetch("http://localhost:3001/api/make-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phoneNumber }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      notifySuccess(t("diagnostics.twilio.voice.success"));
      setCallSid(data.sid);
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
      const response = await fetch("http://localhost:3001/api/chat", {
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
        { role: "assistant", content: data.content },
      ]);
    } catch (err: unknown) {
      const error = err as Error;
      notifyError(
        t("diagnostics.twilio.chat.error", { message: error.message }),
      );
    } finally {
      setChatLoading(false);
    }
  };

  const handleSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsNumber || !smsBody) {
      notifyError(t("diagnostics.twilio.sms.missingFields"));
      return;
    }
    setSmsSending(true);
    try {
      const response = await fetch("http://localhost:3001/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: smsNumber, message: smsBody }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || t("diagnostics.twilio.sms.failed"));
      notifySuccess(t("diagnostics.twilio.sms.success", { sid: data.sid }));
    } catch (err: unknown) {
      const error = err as Error;
      notifyError(
        t("diagnostics.twilio.sms.error", { message: error.message }),
      );
    } finally {
      setSmsSending(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {t("diagnostics.twilio.title")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t("diagnostics.twilio.subtitle")}
          </p>
        </div>
        <div
          role="status"
          className={`px-4 py-2 rounded-full text-xs font-bold border ${
            sdkOnline
              ? "bg-status-success/10 text-status-success border-status-success/20"
              : "bg-status-error/10 text-status-error border-status-error/20"
          }`}
        >
          {t("diagnostics.twilio.sdkStatus", { status: sdkStatus })}
        </div>
      </div>

      {isIncoming && (
        <Card className="border-primary motion-safe:animate-bounce bg-primary/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PhoneCall
                className="motion-safe:animate-pulse text-primary"
                aria-hidden="true"
              />
              <span className="font-bold">
                {t("diagnostics.twilio.incoming.title")}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="default" onClick={handleAcceptCall}>
                {t("diagnostics.twilio.incoming.accept")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => activeConnection?.ignore()}
              >
                {t("diagnostics.twilio.incoming.ignore")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {t("diagnostics.twilio.security.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={initSDK}
              >
                {t("diagnostics.twilio.security.initialize")}
              </Button>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("diagnostics.twilio.security.hint")}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {t("diagnostics.twilio.bankingVoice.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 text-sm text-primary">
                <Globe className="h-4 w-4" aria-hidden="true" />
                <span>{t("diagnostics.twilio.bankingVoice.value")}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Card className="shadow-xl">
            <Tabs defaultValue="voice">
              <CardHeader className="border-b bg-muted/20">
                <TabsList className="grid w-full grid-cols-3 max-w-[500px]">
                  <TabsTrigger value="voice">
                    {t("diagnostics.twilio.tabs.voice")}
                  </TabsTrigger>
                  <TabsTrigger value="sms">
                    {t("diagnostics.twilio.tabs.sms")}
                  </TabsTrigger>
                  <TabsTrigger value="chat">
                    {t("diagnostics.twilio.tabs.chat")}
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="p-6">
                <TabsContent value="voice">
                  <form onSubmit={handleCall} className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="twilio-voice-number">
                        {t("diagnostics.twilio.voice.label")}
                      </Label>
                      <div className="flex gap-3">
                        <Input
                          id="twilio-voice-number"
                          placeholder={t(
                            "diagnostics.twilio.voice.placeholder",
                          )}
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="text-lg h-12"
                        />
                        <Button
                          type="submit"
                          size="lg"
                          className="h-12"
                          disabled={calling}
                        >
                          {calling ? (
                            <Loader2
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            t("diagnostics.twilio.voice.dial")
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        {t("diagnostics.twilio.voice.hint")}
                      </p>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="sms">
                  <form onSubmit={handleSms} className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="twilio-sms-number">
                          {t("diagnostics.twilio.sms.recipient")}
                        </Label>
                        <Input
                          id="twilio-sms-number"
                          placeholder={t(
                            "diagnostics.twilio.sms.recipientPlaceholder",
                          )}
                          value={smsNumber}
                          onChange={(e) => setSmsNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="twilio-sms-body">
                          {t("diagnostics.twilio.sms.message")}
                        </Label>
                        <Input
                          id="twilio-sms-body"
                          value={smsBody}
                          onChange={(e) => setSmsBody(e.target.value)}
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full h-12"
                        disabled={smsSending}
                      >
                        {smsSending ? (
                          <Loader2
                            className="animate-spin mr-2"
                            aria-hidden="true"
                          />
                        ) : (
                          <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                        )}
                        {t("diagnostics.twilio.sms.send")}
                      </Button>
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
                        htmlFor="twilio-chat-phone"
                        className="text-xs font-semibold text-muted-foreground"
                      >
                        {t("diagnostics.twilio.chat.identityLabel")}
                      </Label>
                      <Input
                        id="twilio-chat-phone"
                        className="h-8 text-xs w-48"
                        placeholder={t(
                          "diagnostics.twilio.chat.identityPlaceholder",
                        )}
                        value={chatPhone}
                        onChange={(e) => setChatPhone(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground italic">
                        {t("diagnostics.twilio.chat.identityHint")}
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
                          aria-label={t("diagnostics.twilio.chat.placeholder")}
                          placeholder={t("diagnostics.twilio.chat.placeholder")}
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
                          aria-label={t("diagnostics.twilio.chat.send")}
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

export default TwilioDemo;
