import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, PhoneCall, Loader2, MessageSquare, Send, Settings2 } from "lucide-react";
import { toast } from "sonner";

const TwilioDemo = () => {
    // Voice Call State
    const [phoneNumber, setPhoneNumber] = useState("");
    const [calling, setCalling] = useState(false);
    const [callSid, setCallSid] = useState<string | null>(null);
    const twilioNumber = "+19166596816"; // Displaying your Twilio number

    // Text Chat State
    const [chatMessage, setChatMessage] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const [chatHistory, setChatHistory] = useState<{ role: string, content: string }[]>([]);

    const handleCall = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!phoneNumber) {
            toast.error("Please enter a phone number");
            return;
        }

        setCalling(true);
        setCallSid(null);

        try {
            const response = await fetch("http://localhost:3001/api/make-call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: phoneNumber }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to initiate call");

            toast.success("Call initiated! Answer your phone.");
            setCallSid(data.sid);
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Failed to initiate call");
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
                body: JSON.stringify({
                    message: chatMessage,
                    history: chatHistory.slice(-5)
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            setChatHistory(prev => [...prev, { role: "assistant", content: data.content }]);
        } catch (error: any) {
            toast.error("Chat error: " + error.message);
        } finally {
            setChatLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-4xl space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-bold tracking-tight text-foreground">AI Voice Center</h1>
                <p className="text-lg text-muted-foreground">Experience the future of banking with our ultra-realistic AI voice assistant.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Panel: Status & Info */}
                <div className="lg:col-span-4 space-y-6">
                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Settings2 className="h-4 w-4" />
                                Gateway Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">STT Engine</span>
                                <span className="font-mono text-primary px-2 py-0.5 bg-primary/10 rounded">Deepgram Nova-2</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">TTS engine</span>
                                <span className="font-mono text-primary px-2 py-0.5 bg-primary/10 rounded">ElevenLabs v2</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Latency</span>
                                <span className="font-mono text-green-500 underline decoration-dotted">Ultra Low</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Inbound Number</CardTitle>
                            <CardDescription>You can call the assistant directly at this number.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-center p-4 bg-muted rounded-lg border-2 border-dashed flex items-center justify-center gap-3">
                                <Phone className="h-5 w-5 text-primary" />
                                {twilioNumber}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Panel: Tabs */}
                <div className="lg:col-span-8">
                    <Card className="shadow-xl border-none ring-1 ring-border/50">
                        <Tabs defaultValue="voice">
                            <CardHeader className="border-b bg-muted/30">
                                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                                    <TabsTrigger value="voice" className="gap-2">
                                        <PhoneCall className="h-4 w-4" />
                                        Voice Interface
                                    </TabsTrigger>
                                    <TabsTrigger value="chat" className="gap-2">
                                        <MessageSquare className="h-4 w-4" />
                                        Text Test
                                    </TabsTrigger>
                                </TabsList>
                            </CardHeader>

                            <CardContent className="p-6">
                                <TabsContent value="voice">
                                    <form onSubmit={handleCall} className="space-y-6">
                                        <div className="space-y-3">
                                            <label className="text-sm font-semibold text-foreground">Initiate Outbound Call</label>
                                            <div className="flex gap-3">
                                                <Input
                                                    placeholder="+970..."
                                                    value={phoneNumber}
                                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                                    className="text-lg h-12"
                                                    disabled={calling}
                                                />
                                                <Button size="lg" className="h-12 px-8" disabled={calling}>
                                                    {calling ? <Loader2 className="animate-spin" /> : "Dial Now"}
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground bg-amber-500/10 p-2 rounded border border-amber-500/20 italic">
                                                * Note: For Trial accounts, the "To" number must be verified in Twilio Console.
                                            </p>
                                        </div>

                                        {callSid && (
                                            <div className="animate-pulse flex items-center justify-center gap-3 p-8 border rounded-xl bg-green-500/5 border-green-500/30">
                                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                                <span className="text-green-700 font-medium">Session Active: {callSid.substring(0, 10)}...</span>
                                            </div>
                                        )}
                                    </form>
                                </TabsContent>

                                <TabsContent value="chat" className="space-y-4">
                                    <div className="h-[400px] border rounded-xl overflow-hidden flex flex-col bg-muted/10">
                                        <div className="flex-1 p-6 overflow-y-auto space-y-4">
                                            {chatHistory.length === 0 && (
                                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-50">
                                                    <MessageSquare className="h-12 w-12" />
                                                    <p>Start a conversation to test the AI's logic.</p>
                                                </div>
                                            )}
                                            {chatHistory.map((msg, i) => (
                                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                                                    <div className={`max-w-[75%] p-4 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-card border rounded-tl-none'
                                                        }`} style={{ direction: msg.role === 'assistant' ? 'rtl' : 'ltr' }}>
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            ))}
                                            {chatLoading && (
                                                <div className="flex justify-start">
                                                    <div className="bg-card border p-3 rounded-2xl rounded-tl-none flex gap-3 items-center shadow-sm">
                                                        <div className="flex gap-1">
                                                            <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                            <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                            <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" />
                                                        </div>
                                                        <span className="text-[10px] font-medium text-muted-foreground">AI is Thinking</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <form onSubmit={handleChat} className="p-4 bg-background border-t flex gap-2">
                                            <Input
                                                placeholder="Ask about banking..."
                                                value={chatMessage}
                                                onChange={(e) => setChatMessage(e.target.value)}
                                                className="border-none focus-visible:ring-0 px-4 h-11"
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
