// Carillon doux pour l'arrivée d'une mission : deux notes sinusoïdales qui s'estompent.
// Le son est généré ici (aucun fichier à charger, fonctionne hors ligne) puis joué comme un média,
// ce qui l'autorise même quand l'iPhone est en mode silencieux.

let wavUrl = null;
let player = null;
let armed = false;

function buildWavUrl() {
  const rate = 22050;
  const seconds = 1.9;
  const total = Math.floor(rate * seconds);
  const data = new Float32Array(total);

  // do (523 Hz) puis mi (659 Hz) : attaque douce, fondu long
  const notes = [
    { freq: 523.25, start: 0.0, dur: 1.3, amp: 0.34 },
    { freq: 659.25, start: 0.24, dur: 1.6, amp: 0.3 },
  ];
  for (const n of notes) {
    const s0 = Math.floor(n.start * rate);
    const len = Math.floor(n.dur * rate);
    for (let i = 0; i < len && s0 + i < total; i++) {
      const t = i / rate;
      const attack = Math.min(1, t / 0.05);
      const decay = Math.pow(1 - i / len, 2.2);
      data[s0 + i] += Math.sin(2 * Math.PI * n.freq * t) * n.amp * attack * decay;
    }
  }

  // WAV 16 bits mono
  const buffer = new ArrayBuffer(44 + total * 2);
  const v = new DataView(buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  v.setUint32(4, 36 + total * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, total * 2, true);
  for (let i = 0; i < total; i++) {
    const x = Math.max(-1, Math.min(1, data[i]));
    v.setInt16(44 + i * 2, x * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function getPlayer() {
  if (!player) {
    if (!wavUrl) wavUrl = buildWavUrl();
    player = new Audio(wavUrl);
    player.preload = "auto";
  }
  return player;
}

function usePlaybackSession() {
  try {
    // iOS 16.4+ : le son passe même si le bouton silencieux est activé
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {
    // non pris en charge : on joue quand même
  }
}

// iOS n'autorise le son qu'après un premier geste de l'utilisateur : on prépare le lecteur au premier toucher.
export function armChime() {
  if (armed) return;
  armed = true;
  usePlaybackSession();
  const unlock = () => {
    const p = getPlayer();
    p.muted = true;
    p.play()
      .then(() => {
        p.pause();
        p.currentTime = 0;
        p.muted = false;
      })
      .catch(() => {
        p.muted = false;
      });
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
}

export function playSoftChime() {
  try {
    usePlaybackSession();
    const p = getPlayer();
    p.muted = false;
    p.currentTime = 0;
    p.volume = 1;
    p.play().catch(() => {});
  } catch {
    // pas de son disponible : la notification visuelle suffit
  }
}

// Vibration native (fonctionne aussi quand l'iPhone est en mode silencieux / vibreur).
export async function vibrateAlert() {
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.vibrate({ duration: 400 });
    setTimeout(() => Haptics.vibrate({ duration: 400 }).catch(() => {}), 700);
  } catch {
    try {
      if ("vibrate" in navigator) navigator.vibrate([400, 300, 400]);
    } catch {
      // pas de vibration disponible
    }
  }
}

// Carillon + vibration : alerte d'arrivée d'une mission.
export function playMissionAlert() {
  playSoftChime();
  vibrateAlert();
}

// Petite vibration « succès » (livraison validée)
export async function vibrateSuccess() {
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    try {
      if ("vibrate" in navigator) navigator.vibrate([60, 40, 60]);
    } catch {
      // pas de vibration disponible
    }
  }
}
