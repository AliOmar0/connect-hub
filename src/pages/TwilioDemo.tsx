import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, PhoneCall, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

const TwilioDemo = () => {
    // Voice Call State
    const [phoneNumber, setPhoneNumber] = useState("");
    const [calling, setCalling] = useState(false);
    const [callSid, setCallSid] = useState<string | null>(null);

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

            toast.success("Call initiated! Answer your phone to talk to AI.");
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
                    history: chatHistory.slice(-5) // Send last 5 messages for context
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
        <div className="container mx-auto p-6 max-w-2xl">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Phone className="h-6 w-6 text-primary" />
                        PIB AI Assistant Demo
                    </CardTitle>
                    <CardDescription>
                        Test the AI assistant via phone call or free text chat.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="voice">
                        <TabsList className="grid w-full grid-cols-2 mb-6">
                            <TabsTrigger value="voice">Voice Call (Uses Trial)</TabsTrigger>
                            <TabsTrigger value="chat">Free Text Chat</TabsTrigger>
                        </TabsList>

                        <TabsContent value="voice">
                            <form onSubmit={handleCall} className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="phone" className="text-sm font-medium">
                                        Your Verified Phone Number
                                    </label>
                                    <Input
                                        id="phone"
                                        placeholder="+970..."
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        type="tel"
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Format: +[country code][number]
                                    </p>
                                </div>

                                {callSid && (
                                    <div className="p-3 bg-muted rounded-md text-sm">
                                        <span className="font-semibold text-green-600">Call active!</span> SID: {callSid}
                                    </div>
                                )}

                                <Button type="submit" className="w-full h-12 text-lg" disabled={calling}>
                                    {calling ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            Calling...
                                        </>
                                    ) : (
                                        <>
                                            <PhoneCall className="mr-2 h-5 w-5" />
                                            Make AI Call
                                        </>
                                    )}
                                </Button>
                            </form>
                        </TabsContent>

                        <TabsContent value="chat" className="space-y-4">
                            <div className="h-[300px] border rounded-md p-4 overflow-y-auto bg-muted/30 space-y-4">
                                {chatHistory.length === 0 && (
                                    <p className="text-center text-muted-foreground text-sm mt-10">
                                        Type a message below to start testing the AI personality.
                                    </p>
                                )}
                                {chatHistory.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border shadow-sm text-right'
                                            }`} style={{ direction: msg.role === 'assistant' ? 'rtl' : 'ltr' }}>
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                                {chatLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-card border p-3 rounded-lg flex gap-2 items-center">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span className="text-xs">يتم الآن التحليل...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <form onSubmit={handleChat} className="flex gap-2">
                                <Input
                                    placeholder="اسأل أي سؤال مصرفي..."
                                    value={chatMessage}
                                    onChange={(e) => setChatMessage(e.target.value)}
                                    style={{ direction: 'rtl' }}
                                />
                                <Button type="submit" size="icon" disabled={chatLoading}>
                                    <Send className="h-4 w-4" />
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>
                </CardContent>
                <CardFooter className="flex flex-col gap-2 text-xs text-muted-foreground text-center">
                    <p>The AI follows the system prompt for Palestinian Islamic Bank.</p>
                    <p>Text chat consumes no Twilio credits.</p>
                </CardFooter>
            </Card>
        </div>
    );
};

export default TwilioDemo;
