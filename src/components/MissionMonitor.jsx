import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
    requestNotificationPermission,
    showPersistentNotification,
    clearMissionNotification
} from "../lib/notifications";
import { ensurePushSubscription, removePushSubscription } from "../lib/push";
import { registerNativePush } from "../lib/nativePush";
import { armChime, playMissionAlert, vibrateAlert } from "../lib/chime";

export default function MissionMonitor() {
    const activeMissionsRef = useRef(0);
    const prevMissionsRef = useRef(0);
    // Refs to hold cleanup functions/subscriptions so we can manage them across auth events
    const subsRef = useRef({
        orderChannel: null,
        profileChannel: null,
        pollInterval: null
    });

    useEffect(() => {
        // 1. Register Service Worker & Request Permission
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
        requestNotificationPermission();

        // Carillon doux (généré localement)
        armChime();

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
            registerNativePush(user.id);

            // --- A. Order Monitor (Missions) ---
            // Sonne seulement pour un changement reçu en direct (ring = true), jamais au chargement de l'app
            const checkMissions = async (ring = false) => {
                const { count, error } = await supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('driver_id', user.id)
                    .not('status', 'in', '("delivered","cancelled","livree","annulee")');

                if (!error && count > 0) {
                    activeMissionsRef.current = count;

                    // Ring if new mission arrived
                    if (ring && count > prevMissionsRef.current) {
                        playMissionAlert();
                    }
                    prevMissionsRef.current = count;

                    // Trap history
                    if (!window.history.state?.missionLocked) {
                        window.history.pushState({ missionLocked: true }, "", window.location.href);
                    }
                } else {
                    primed = true;
                    activeMissionsRef.current = 0;
                    prevMissionsRef.current = 0;
                    clearMissionNotification();
                }
            };

            // Initial Check (sans sonnerie)
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
                    checkMissions(true);
                })
                .subscribe();

            subsRef.current.orderChannel = orderChannel;

            // Visibility change sync
            const handleVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                    checkMissions();
                }
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
            subsRef.current.visibilityListener = handleVisibilityChange;

            // --- B. Profile Status Monitor (Online/Offline) ---
            const handleStatusChange = (newStatus) => {
                const oldStatus = localStorage.getItem("oc_online_status") === "true";
                const lastStatusChangeTime = parseInt(localStorage.getItem("oc_last_status_change_time") || "0", 10);
                const now = Date.now();

                if (newStatus !== oldStatus) {
                    // Ignore updates from Realtime if they happen immediately after a self-initiated logout
                    // (within 2 seconds of the driver clicking disconnect)
                    const selfInitiated = localStorage.getItem("oc_self_initiated_logout") === "true";
                    const recentSelfChange = selfInitiated && (now - lastStatusChangeTime) < 2000;

                    localStorage.setItem("oc_online_status", String(newStatus));
                    localStorage.setItem("oc_last_status_change_time", String(now));
                    window.dispatchEvent(new Event("oc_status_change"));

                    if (newStatus === false && !recentSelfChange) {
                        // Only show message if ADMIN disconnected this driver, not if driver self-logged out
                        vibrateAlert();
                        alert("Vous avez été passé HORS LIGNE par l'administrateur.");
                    }
                    // Clear the self-initiated flag after handling
                    localStorage.removeItem("oc_self_initiated_logout");
                }
            };

            // Realtime Driver Status Subscription
            const profileChannel = supabase
                .channel(`global_driver_monitor_${user.id}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'drivers',
                    filter: `auth_id=eq.${user.id}`
                }, (payload) => {
                    handleStatusChange(payload.new.status !== 'hors_service');
                })
                .subscribe();

            subsRef.current.profileChannel = profileChannel;

            // Polling Fallback (10s)
            const interval = setInterval(async () => {
                const { data, error } = await supabase
                    .from('drivers')
                    .select('status')
                    .eq('auth_id', user.id)
                    .single();

                if (!error && data) {
                    handleStatusChange(data.status !== 'hors_service');
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
