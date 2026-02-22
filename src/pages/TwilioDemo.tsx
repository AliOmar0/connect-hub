import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, PhoneCall, Loader2, MessageSquare, Send, Settings2, ShieldCheck, Globe } from "lucide-react";
import { toast } from "sonner";
import { Device } from '@twilio/voice-sdk';

const TwilioDemo = () => {
    // Standard Call State
    const [phoneNumber, setPhoneNumber] = useState("");
    const [calling, setCalling] = useState(false);
    const [callSid, setCallSid] = useState<string | null>(null);

    // Voice SDK State
    const [device, setDevice] = useState<Device | null>(null);
    const [sdkStatus, setSdkStatus] = useState("Offline");
    const [isIncoming, setIsIncoming] = useState(false);
    const [activeConnection, setActiveConnection] = useState<any>(null);

    // Text Chat State
    const [chatMessage, setChatMessage] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const [chatHistory, setChatHistory] = useState<{ role: string, content: string }[]>([]);

    // Initialize Twilio Voice SDK
    const initSDK = async () => {
        setSdkStatus("Connecting...");
        try {
            const response = await fetch("http://localhost:3001/api/token");
            const data = await response.json();

            if (!response.ok) throw new Error(data.details || data.error);

            // Twilio Voice SDK v2.0+ instantiation
            const newDevice = new Device(data.token, {
                logLevel: 'debug',
                codecPreferences: ['opus', 'pcmu'],
            });

            newDevice.on('registered', () => {
                setSdkStatus("Online (agent: " + data.identity + ")");
                toast.success("Voice SDK Registered!");
            });

            newDevice.on('error', (error) => {
                setSdkStatus("Error: " + error.message);
                toast.error("SDK Error: " + error.message);
            });

            newDevice.on('incoming', (connection) => {
                toast.info("Incoming Call!");
                setIsIncoming(true);
                setActiveConnection(connection);

                connection.on('disconnect', () => {
                    setIsIncoming(false);
                    setActiveConnection(null);
                });
            });

            await newDevice.register();
            setDevice(newDevice);
        } catch (error: any) {
            console.error("SDK Setup Error:", error);
            const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
            setSdkStatus("Setup Required: " + errorMessage);
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
            toast.success("AI Call initiated!");
            setCallSid(data.sid);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setCalling(false);
        }
    };

    const handleChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatMessage.trim()) return;
        const userMsg = { role: "user", content: chatMessage };
        setChatHistory(prev => [...prev, userMsg]);
        setChatMessage("");
        setChatLoading(true);
        try {
            const response = await fetch("http://localhost:3001/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: chatMessage, history: chatHistory.slice(-5) }),
            });
            const data = await response.json();
            setChatHistory(prev => [...prev, { role: "assistant", content: data.content }]);
        } catch (error: any) {
            toast.error("Chat error: " + error.message);
        } finally {
            setChatLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-5xl space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-start">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-bold tracking-tight">Connect Hub AI</h1>
                    <p className="text-lg text-muted-foreground">Premium Voice Gateway for PIB</p>
                </div>
                <div className={`px-4 py-2 rounded-full text-xs font-bold border ${sdkStatus.startsWith("Online") ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                    }`}>
                    SDK: {sdkStatus}
                </div>
            </div>

            {isIncoming && (
                <Card className="border-primary animate-bounce bg-primary/10">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <PhoneCall className="animate-pulse text-primary" />
                            <span className="font-bold">Incoming Call...</span>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="default" onClick={handleAcceptCall}>Accept</Button>
                            <Button variant="destructive" onClick={() => activeConnection?.ignore()}>Ignore</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" />
                                Security Settings
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button variant="outline" className="w-full text-xs" onClick={initSDK}>
                                Initialize Voice SDK
                            </Button>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                Initializing the SDK allows your browser to receive calls directly from the Twilio cloud.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-muted/50">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Banking Voice</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3 text-sm text-primary">
                                <Globe className="h-4 w-4" />
                                <span>Arabic (Polly.Zeina)</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-8">
                    <Card className="shadow-xl">
                        <Tabs defaultValue="voice">
                            <CardHeader className="border-b bg-muted/20">
                                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                                    <TabsTrigger value="voice">AI Voice Call</TabsTrigger>
                                    <TabsTrigger value="chat">Free Text Test</TabsTrigger>
                                </TabsList>
                            </CardHeader>

                            <CardContent className="p-6">
                                <TabsContent value="voice">
                                    <form onSubmit={handleCall} className="space-y-6">
                                        <div className="space-y-3">
                                            <label className="text-sm font-semibold">Test Inbound/Outbound AI</label>
                                            <div className="flex gap-3">
                                                <Input
                                                    placeholder="+970..."
                                                    value={phoneNumber}
                                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                                    className="text-lg h-12"
                                                />
                                                <Button size="lg" className="h-12" disabled={calling}>
                                                    {calling ? <Loader2 className="animate-spin" /> : "Dial Now"}
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">
                                                To hear the AI, you can call +1 916 659 6816 or use "Dial Now".
                                            </p>
                                        </div>
                                    </form>
                                </TabsContent>

                                <TabsContent value="chat">
                                    <div className="h-[400px] border rounded-xl flex flex-col bg-muted/5">
                                        <div className="flex-1 p-6 overflow-y-auto space-y-4">
                                            {chatHistory.map((msg, i) => (
                                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border'
                                                        }`} style={{ direction: msg.role === 'assistant' ? 'rtl' : 'ltr' }}>
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <form onSubmit={handleChat} className="p-4 border-t flex gap-2">
                                            <Input
                                                placeholder="Ask the AI..."
                                                value={chatMessage}
                                                onChange={(e) => setChatMessage(e.target.value)}
                                                className="h-11 border-none focus-visible:ring-0"
                                                style={{ direction: 'rtl' }}
                                            />
                                            <Button type="submit" size="icon" className="rounded-full h-11 w-11" disabled={chatLoading}>
                                                <Send className="h-4 w-4" />
                                            </Button>
                                        </form>
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
