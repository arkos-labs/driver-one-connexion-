import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";

export default function ChatPage() {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [adminId, setAdminId] = useState(null);
    const [user, setUser] = useState(null);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const scrollRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    useEffect(() => {
        const init = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            setUser(authUser);

            // Fetch admin
            const { data: admin } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single();
            if (admin) {
                setAdminId(admin.id);
                if (authUser) {
                    const { data } = await supabase
                        .from('messages')
                        .select('*')
                        .or(`and(sender_id.eq.${authUser.id},recipient_id.eq.${admin.id}),and(sender_id.eq.${admin.id},recipient_id.eq.${authUser.id},recipient_id.is.null)`)
                        .order('created_at', { ascending: true });
                    if (data) setMessages(data);
                }
            }
        };
        init();
    }, []);

    useEffect(() => {
        if (!user || !adminId) return;

        // Use deterministic channel ID like other apps
        const channelId = `chat-${[user.id, adminId].sort().join('-')}`;
        console.log("Driver subscribing to:", channelId);

        const channel = supabase
            .channel(channelId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                const msg = payload.new;
                // Accept if it involves me, or if it's an admin message (Support)
                const isRelevant =
                    (msg.sender_id === user.id && msg.recipient_id === adminId) ||
                    (msg.sender_id === adminId && (msg.recipient_id === user.id || !msg.recipient_id));

                if (isRelevant) {
                    setMessages((prev) => (prev.find(m => m.id === msg.id) ? prev : [...prev, msg]));
                }
            })
            .on('broadcast', { event: 'new_message' }, (payload) => {
                const msg = payload.payload;
                console.log("Driver chat: Broadcast received:", msg);
                setMessages(prev => (prev.find(m => m.id === msg.id) ? prev : [...prev, msg]));
            })
            .on('broadcast', { event: 'typing' }, (payload) => {
                const { userId, typing } = payload.payload;
                if (userId === adminId) {
                    setIsPartnerTyping(typing);
                }
            })
            .subscribe((status) => {
                console.log("Driver Chat: Realtime status:", status);
            });

        const broadcastTyping = (isTyping) => {
            channel.send({
                type: 'broadcast',
                event: 'typing',
                payload: { userId: user.id, typing: isTyping },
            });
        };

        window._broadcastDriverTyping = broadcastTyping;
        window._currentDriverChannel = channel;

        return () => {
            supabase.removeChannel(channel);
            window._currentDriverChannel = null;
        };
    }, [user?.id, adminId]);

    const handleTyping = () => {
        if (!user) return;
        window._broadcastDriverTyping?.(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            window._broadcastDriverTyping?.(false);
        }, 3000);
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || !adminId) return;

        const content = newMessage.trim();
        setNewMessage("");

        const tempId = Math.random().toString();
        const tempMsg = {
            id: tempId,
            sender_id: user.id,
            recipient_id: adminId,
            content,
            is_admin_message: false,
            created_at: new Date().toISOString()
        };

        setMessages(prev => [...prev, tempMsg]);

        const { data, error } = await supabase
            .from('messages')
            .insert([{
                sender_id: user.id,
                recipient_id: adminId,
                content,
                is_admin_message: false
            }])
            .select()
            .single();

        if (error) {
            setMessages(prev => prev.filter(m => m.id !== tempId));
            alert("Erreur d'envoi");
        } else if (data) {
            window._currentDriverChannel?.send({
                type: 'broadcast',
                event: 'new_message',
                payload: data
            });
            setMessages(prev => prev.map(m => m.id === tempId ? data : m));
        }
    };

    const formatTime = (iso) => {
        if (!iso) return "--:--";
        try {
            return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return "--:--";
        }
    };

    return (
        <div className="flex flex-col h-screen bg-white">
            <header className="relative sticky top-0 z-30 bg-white border-b border-gray-100/50 px-4 py-3.5 flex items-center justify-between backdrop-blur-md bg-white/90">
                <div className="flex items-center gap-3">
                    <Link to="/missions" className="p-2 -ml-2 rounded-xl active:bg-slate-100 transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </Link>
                    <h1 className="text-sm font-black tracking-[0.1em] uppercase text-slate-900">Messagerie</h1>
                </div>
                <div className="absolute left-1/2 top-1 -translate-x-1/2">
                    <OnlineSwitch />
                </div>
            </header>

            <main
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
            >
                {messages.map((msg) => {
                    const isMe = msg.sender_id === user?.id;
                    const senderName = isMe ? 'Moi' : (msg.is_admin_message ? 'Dispatch' : 'Chauffeur');

                    return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">
                                    {senderName}
                                </span>
                                <span className="text-[9px] text-gray-300">
                                    {formatTime(msg.created_at)}
                                </span>
                            </div>
                            <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe
                                ? 'bg-blue-600 text-white rounded-tr-none'
                                : (msg.is_admin_message ? 'bg-amber-100 text-amber-900 rounded-tl-none border border-amber-200' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none')
                                } ${msg.is_optimistic ? 'opacity-70' : ''}`}>
                                {msg.content}
                            </div>
                        </div>
                    );
                })}
                {isPartnerTyping && (
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-600 animate-pulse pb-2 px-1">
                        <div className="typing-indicator text-amber-500">
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                        </div>
                        L'équipe Dispatch écrit...
                    </div>
                )}
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm italic">
                        Démarrer la discussion avec le dispatch...
                    </div>
                )}
            </main>

            <div className="bg-white border-t border-slate-100 p-4 pb-20">
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Votre message..."
                        className="flex-1 px-4 py-3.5 rounded-2xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all border border-slate-100"
                        value={newMessage}
                        onChange={(e) => {
                            setNewMessage(e.target.value);
                            handleTyping();
                        }}
                    />
                    <button
                        type="submit"
                        className="bg-slate-900 text-white w-12 h-12 flex items-center justify-center rounded-2xl shadow-lg shadow-slate-900/10 active:scale-95 transition-all"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    </button>
                </form>
            </div>

        </div>
    );
}
