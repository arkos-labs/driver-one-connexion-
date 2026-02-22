export async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("This browser does not support desktop notification");
        return false;
    }

    if (Notification.permission === "granted") {
        return true;
    }

    const permission = await Notification.requestPermission();
    return permission === "granted";
}

export async function showPersistentNotification(count) {
    if (Notification.permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;

    // Tag ensures only one notification is shown (replaces previous one)
    const options = {
        body: `Vous avez ${count} mission(s) active(s) en cours.`,
        icon: '/vite.svg', // Replace with app icon later
        badge: '/vite.svg',
        tag: 'active-missions',
        requireInteraction: true, // Key for persistence on some platforms
        renotify: true,
        data: { url: window.location.origin + '/missions' }
    };

    registration.showNotification('Mission en cours - One Connexion', options);
}

export async function clearMissionNotification() {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag: 'active-missions' });
    notifications.forEach(notification => notification.close());
}
