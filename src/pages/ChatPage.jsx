import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";
import { playSoftChime } from "../lib/chime";

export default function ChatPage() {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [adminId, setAdminId] = useState(null);
    const [user, setUser] = useState(null);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const scrollRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const [kb, setKb] = useState({ open: false, top: 0, height: 0 });

    // Clavier ouvert : la page occupe exactement la zone visible au-dessus du clavier,
    // et la barre du bas est masquée (elle reste « en bas », derrière le clavier, au lieu de remonter).
    useEffect(() => {
        const vv = window.visualViewport;
        let focused = false;
        let blurTimer = null;
        const update = () => {
            const shrunk = vv ? window.innerHeight - vv.height > 120 : false;
            const open = focused || shrunk;
            setKb(open ? { open: true, top: vv?.offsetTop || 0, height: vv?.height || window.innerHeight } : { open: false, top: 0, height: 0 });
            document.documentElement.classList.toggle("kb-open", open);
        };
        const isField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
        const onFocusIn = (e) => { if (isField(e.target)) { clearTimeout(blurTimer); focused = true; update(); } };
        const onFocusOut = (e) => { if (isField(e.target)) { blurTimer = setTimeout(() => { focused = false; update(); }, 120); } };
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);
        vv?.addEventListener("resize", update);
        vv?.addEventListener("scroll", update);
        update();
        return () => {
            document.removeEventListener("focusin", onFocusIn);
            document.removeEventListener("focusout", onFocusOut);
            vv?.removeEventListener("resize", update);
            vv?.removeEventListener("scroll", update);
            clearTimeout(blurTimer);
            document.documentElement.classList.remove("kb-open");
        };
    }, []);

    // Chargement : on lit seulement les messages qui concernent ce chauffeur (les règles de sécurité
    // de la base le garantissent). L'identifiant de l'administrateur se déduit de ses messages :
    // un chauffeur n'a pas le droit de lire le profil d'un autre utilisateur.
    useEffect(() => {
        const init = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            setUser(authUser);
            if (!authUser) return;

            const { data } = await supabase
                .from('messages')
                .select('*')
                .or(`sender_id.eq.${authUser.id},recipient_id.eq.${authUser.id}`)
                .order('created_at', { ascending: true });
            if (data) {
                setMessages(data);
                const fromAdmin = [...data].reverse().find((m) => m.is_admin_message && m.sender_id !== authUser.id);
                if (fromAdmin) setAdminId(fromAdmin.sender_id);
            }
        };
        init();
    }, []);

    // Réception en direct des messages envoyés à ce chauffeur
    useEffect(() => {
        if (!user) return;
        const channel = supabase
            .channel(`driver-inbox-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `recipient_id=eq.${user.id}`,
            }, (payload) => {
                const msg = payload.new;
                setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]));
                if (msg.is_admin_message) {
                    setAdminId(msg.sender_id);
                    playSoftChime();
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `sender_id=eq.${user.id}`,
            }, (payload) => {
                // mon message vient d'être lu par l'administrateur
                setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)));
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id]);

    // Ouvrir le Chat = lire : on marque comme lus les messages de l'administrateur
    useEffect(() => {
        if (!user || document.visibilityState !== "visible") return;
        const unread = messages.some((m) => m.is_admin_message && m.recipient_id === user.id && !m.read_at);
        if (!unread) return;
        supabase.rpc("mark_messages_read").then(({ error }) => {
            if (error) return;
            const now = new Date().toISOString();
            setMessages((prev) => prev.map((m) => (m.is_admin_message && m.recipient_id === user.id && !m.read_at ? { ...m, read_at: now } : m)));
            window.dispatchEvent(new Event("oc-unread-refresh"));
        });
    }, [messages, user]);

    // Indicateur « le dispatch écrit… » : canal partagé avec l'administrateur, une fois son identifiant connu
    useEffect(() => {
        if (!user || !adminId) return;

        const channelId = `chat-${[user.id, adminId].sort().join('-')}`;
        const channel = supabase
            .channel(channelId)
            .on('broadcast', { event: 'new_message' }, (payload) => {
                const msg = payload.payload;
                setMessages(prev => (prev.find(m => m.id === msg.id) ? prev : [...prev, msg]));
            })
            .on('broadcast', { event: 'typing' }, (payload) => {
                const { userId, typing } = payload.payload;
                if (userId === adminId) {
                    setIsPartnerTyping(typing);
                }
            })
            .subscribe();

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
    }, [messages, kb.open, kb.height]);

    const sendText = async (raw) => {
        if (!raw.trim() || !user) return;

        const content = raw.trim();

        const tempId = Math.random().toString();
        const tempMsg = {
            id: tempId,
            sender_id: user.id,
            recipient_id: adminId || null,
            content,
            is_admin_message: false,
            created_at: new Date().toISOString()
        };

        setMessages(prev => [...prev, tempMsg]);

        const { data, error } = await supabase
            .from('messages')
            .insert([{
                sender_id: user.id,
                recipient_id: adminId || null,
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

    const sendMessage = (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        const content = newMessage;
        setNewMessage("");
        sendText(content);
    };

    const formatTime = (iso) => {
        if (!iso) return "--:--";
        try {
            return new Date(iso).toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
        } catch {
            return "--:--";
        }
    };

    const dayKey = (iso) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };

    const dayLabel = (iso) => {
        const d = new Date(iso);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (dayKey(d) === dayKey(today)) return "Aujourd'hui";
        if (dayKey(d) === dayKey(yesterday)) return "Hier";
        const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
        return label.charAt(0).toUpperCase() + label.slice(1);
    };

    const QUICK_REPLIES = ["J'arrive", "Je suis sur place", "Colis récupéré", "Petit retard, j'arrive"];

    return (
        <div
            className={`flex flex-col bg-paper ${kb.open ? "fixed inset-x-0 z-40" : "-mb-24"}`}
            style={kb.open
                ? { top: kb.top, height: kb.height }
                : { height: "calc(100dvh - 5rem - env(safe-area-inset-bottom, 0px))" }}
        >
            <header className="relative sticky top-0 z-30 bg-paper-card/95 border-b border-line px-4 py-3.5 flex items-center justify-between backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <Link to="/missions" className="p-2 -ml-2 rounded-[2px] active:bg-line transition-colors text-ink">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </Link>
                    <h1 className="text-base font-bold tracking-tight text-ink">Chat</h1>
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: "calc(50% + env(safe-area-inset-top, 0px) / 2)" }}>
                    <OnlineSwitch />
                </div>
            </header>

            <main
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4"
            >
                {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
                            <svg className="h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </div>
                        <p className="text-base font-bold text-ink">Aucun message</p>
                        <p className="mt-1.5 max-w-[16rem] text-sm text-muted">Écrivez au dispatch : une question sur une course, un retard, un problème.</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {messages.map((msg, i) => {
                            const isMe = msg.sender_id === user?.id;
                            const prev = messages[i - 1];
                            const next = messages[i + 1];
                            const newDay = !prev || dayKey(prev.created_at) !== dayKey(msg.created_at);
                            const sameAsPrev = prev && !newDay && prev.sender_id === msg.sender_id;
                            const sameAsNext = next && dayKey(next.created_at) === dayKey(msg.created_at) && next.sender_id === msg.sender_id;

                            return (
                                <div key={msg.id}>
                                    {newDay && (
                                        <div className="flex items-center gap-2 pb-3 pt-4 first:pt-0">
                                            <span className="h-px flex-1 bg-line" />
                                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-label">{dayLabel(msg.created_at)}</span>
                                            <span className="h-px flex-1 bg-line" />
                                        </div>
                                    )}
                                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${sameAsPrev ? 'mt-0.5' : 'mt-3'}`}>
                                        {!isMe && !sameAsPrev && (
                                            <span className="mb-1 ml-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-label">
                                                {msg.is_admin_message ? 'Dispatch' : 'Chauffeur'}
                                            </span>
                                        )}
                                        <div className={`max-w-[82%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-[15px] leading-snug ${isMe
                                            ? 'bg-accent text-white rounded-xl rounded-br-[4px]'
                                            : 'bg-paper-card text-ink border border-line rounded-xl rounded-bl-[4px]'
                                            } ${msg.is_optimistic ? 'opacity-70' : ''}`}>
                                            {msg.content}
                                        </div>
                                        {!sameAsNext && (
                                            <span className="mx-1 mt-1 flex items-center gap-1.5 font-mono text-[10px] text-label">
                                                {formatTime(msg.created_at)}
                                                {isMe && !msg.is_optimistic && (
                                                    msg.read_at ? (
                                                        <span className="flex items-center gap-1 font-semibold text-accent">
                                                            <svg width="14" height="10" viewBox="0 0 28 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 11 8 17 18 4" /><polyline points="12 14 14 17 26 4" /></svg>
                                                            Lu {formatTime(msg.read_at)}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1">
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                                            Envoyé
                                                        </span>
                                                    )
                                                )}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {isPartnerTyping && (
                    <div className="mt-3 flex items-center gap-2 px-1 text-xs font-semibold text-muted">
                        <div className="typing-indicator text-accent">
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                        </div>
                        Le dispatch écrit…
                    </div>
                )}
            </main>

            <div className="border-t border-line bg-paper-card px-4 pb-3 pt-2.5">
                <div className="-mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {QUICK_REPLIES.map((q) => (
                        <button
                            key={q}
                            type="button"
                            onClick={() => sendText(q)}
                            disabled={!user}
                            className="shrink-0 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink active:bg-line disabled:opacity-40 transition-colors"
                        >
                            {q}
                        </button>
                    ))}
                </div>
                <form onSubmit={sendMessage} className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="Votre message…"
                        enterKeyHint="send"
                        className="flex-1 rounded-xl border border-line bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-label focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
                        value={newMessage}
                        onChange={(e) => {
                            setNewMessage(e.target.value);
                            handleTyping();
                        }}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        aria-label="Envoyer"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-white active:scale-95 disabled:opacity-40 transition-all"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    </button>
                </form>
            </div>
        </div>
    );
}
