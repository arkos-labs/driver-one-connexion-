import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
    requestNotificationPermission,
    showPersistentNotification,
    clearMissionNotification
} from "../lib/notifications";
import { ensurePushSubscription, removePushSubscription } from "../lib/push";

export default function MissionMonitor() {
    const activeMissionsRef = useRef(0);
    const prevMissionsRef = useRef(0);
    const audioRef = useRef(null);
    // Refs to hold cleanup functions/subscriptions so we can manage them across auth events
    const subsRef = useRef({
        orderChannel: null,
        profileChannel: null,
        pollInterval: null
    });

    useEffect(() => {
        // 1. Register Service Worker & Request Permission
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(reg => console.log('SW Registered', reg));
        }
        requestNotificationPermission();

        // Prepare sound (small ring)
        audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
        audioRef.current.volume = 0.5;

        // 2. Define monitor startup/shutdown functions
        const stopMonitoring = async () => {
            if (subsRef.current.orderChannel) await supabase.removeChannel(subsRef.current.orderChannel);
            if (subsRef.current.profileChannel) await supabase.removeChannel(subsRef.current.profileChannel);
            if (subsRef.current.pollInterval) clearInterval(subsRef.current.pollInterval);
            if (subsRef.current.visibilityListener) {
                document.removeEventListener('visibilitychange', subsRef.current.visibilityListener);
            }

            subsRef.current = { orderChannel: null, profileChannel: null, pollInterval: null, visibilityListener: null };
            activeMissionsRef.current = 0;
            clearMissionNotification();
            await removePushSubscription();
        };

        const startMonitoring = async (user) => {
            if (!user) return;
            // cleanup existing just in case
            await stopMonitoring();
            await ensurePushSubscription(user.id);

            // --- A. Order Monitor (Missions) ---
            const checkMissions = async () => {
                const { count, error } = await supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('driver_id', user.id)
                    .neq('status', 'delivered')
                    .neq('status', 'cancelled');

                if (!error && count > 0) {
                    activeMissionsRef.current = count;

                    // Ring if new mission arrived
                    if (count > prevMissionsRef.current) {
                        try {
                            audioRef.current?.play();
                        } catch (e) {
                            // ignore autoplay errors
                        }
                    }
                    prevMissionsRef.current = count;

                    showPersistentNotification(count);

                    // Trap history
                    if (!window.history.state?.missionLocked) {
                        window.history.pushState({ missionLocked: true }, "", window.location.href);
                    }
                } else {
                    activeMissionsRef.current = 0;
                    prevMissionsRef.current = 0;
                    clearMissionNotification();
                }
            };

            // Initial Check
            checkMissions();

            // Realtime Order Subscription
            const orderChannel = supabase
                .channel('global-mission-monitor')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'orders'
                    // Removed filter for robustness, RLS handles security
                }, () => {
                    console.log("[Monitor] Realtime mission change detected");
                    checkMissions();
                })
                .subscribe((status) => {
                    console.log("[Monitor] Order Channel Status:", status);
                });

            subsRef.current.orderChannel = orderChannel;

            // Visibility change sync
            const handleVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                    console.log("[Monitor] App visible, re-checking missions...");
                    checkMissions();
                }
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
            subsRef.current.visibilityListener = handleVisibilityChange;

            // --- B. Profile Status Monitor (Online/Offline) ---
            const handleStatusChange = (newStatus) => {
                const oldStatus = localStorage.getItem("oc_online_status") === "true";
                if (newStatus !== oldStatus) {
                    localStorage.setItem("oc_online_status", String(newStatus));
                    window.dispatchEvent(new Event("oc_status_change"));

                    if (newStatus === false) {
                        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
                        alert("Vous avez été passé HORS LIGNE par l'administrateur.");
                    }
                }
            };

            // Realtime Profile Subscription
            const profileChannel = supabase
                .channel(`global_profile_monitor_${user.id}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${user.id}`
                }, (payload) => {
                    handleStatusChange(payload.new.is_online);
                })
                .subscribe();

            subsRef.current.profileChannel = profileChannel;

            // Polling Fallback (10s)
            const interval = setInterval(async () => {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('is_online')
                    .eq('id', user.id)
                    .single();

                if (!error && data) {
                    handleStatusChange(data.is_online);
                }
            }, 10000);

            subsRef.current.pollInterval = interval;
        };

        // 3. Initialize Auth Listener
        let authSubscription = null;

        const init = async () => {
            // Check initial session
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                startMonitoring(session.user);
            }

            // Listen for changes
            const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_IN' && session?.user) {
                    startMonitoring(session.user);
                } else if (event === 'SIGNED_OUT') {
                    stopMonitoring();
                }
            });
            authSubscription = data.subscription;
        };

        init();

        // 4. Global Event Handlers
        const handleBeforeUnload = (e) => {
            if (activeMissionsRef.current > 0) {
                e.preventDefault();
                e.returnValue = 'Vous avez une course en cours.';
                return e.returnValue;
            }
        };

        const handlePopState = () => {
            if (activeMissionsRef.current > 0) {
                window.history.pushState({ missionLocked: true }, "", window.location.href);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', handlePopState);

        return () => {
            stopMonitoring();
            if (authSubscription) authSubscription.unsubscribe();
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);

    return null;
}
