// --- Configuration simple ---
const CITY = "Lille";
const COUNTRY = "France";
const METHOD = 3; // Muslim World League

// --- Références DOM (remplies dans init) ---
let dateDuJourEl,
  prochainePriereTexteEl,
  tablePrieresEl,
  messageErreurEl,
  btnAnnonceProchaine,
  btnLireToutes,
  toggleMessageAmour;

// --- État en mémoire ---
let prayerList = []; // { id, label, time (Date), rawString }
let nextPrayer = null;
let hasPlayedLoveMessageThisLoad = false;

// --- Utils dates/format ---
function formatDateFr(d) {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimeFr(d) {
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Service de synthèse vocale ---
function speak(text) {
  if (!("speechSynthesis" in window)) {
    console.warn("Synthèse vocale non supportée.");
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  synth.speak(utterance);
}

// Message d'amour déclenché après une interaction
function maybeSpeakLoveMessage() {
  const isEnabled =
    localStorage.getItem("loveMessageEnabled") !== "false"; // par défaut true
  if (!isEnabled || hasPlayedLoveMessageThisLoad) return;
  hasPlayedLoveMessageThisLoad = true;
  speak("De la part de ton amoureux, Anas.");
}

// --- Gestion des paramètres ---
function initLoveMessageToggle() {
  const isEnabled =
    localStorage.getItem("loveMessageEnabled") !== "false"; // défaut = true
  toggleMessageAmour.checked = isEnabled;

  toggleMessageAmour.addEventListener("change", () => {
    localStorage.setItem("loveMessageEnabled", toggleMessageAmour.checked);
  });
}

// --- Récupération des horaires via API AlAdhan ---
async function fetchPrayerTimes() {
  const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(
    CITY
  )}&country=${encodeURIComponent(COUNTRY)}&method=${METHOD}`;

  console.log("Appel API AlAdhan :", url);

  const response = await fetch(url);
  if (!response.ok) {
    console.error("Réponse réseau incorrecte :", response.status);
    throw new Error("Réponse réseau incorrecte");
  }

  const json = await response.json();
  console.log("Réponse brute AlAdhan :", json);

  if (json.code !== 200 || !json.data || !json.data.timings) {
    console.error("Format de données inattendu :", json);
    throw new Error("Format de données inattendu");
  }

  return json.data.timings;
}

// --- Construction de la liste des prières ---
function buildPrayerList(timings) {
  const today = new Date();
  const [year, month, day] = [
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ];

  const mapping = [
    { id: "Fajr", label: "Fajr" },
    { id: "Dhuhr", label: "Dhor" },
    { id: "Asr", label: "Asr" },
    { id: "Maghrib", label: "Maghrib" },
    { id: "Isha", label: "Isha" },
  ];

  return mapping.map((p) => {
    const raw = timings[p.id]; // ex "05:24"
    const [h, m] = raw.split(":").map((x) => parseInt(x, 10));
    const d = new Date(year, month, day, h, m, 0, 0);
    return {
      id: p.id,
      label: p.label,
      time: d,
      rawString: raw,
    };
  });
}

// --- Calcul de la prochaine prière ---
function computeNextPrayer(prayers) {
  const now = new Date();
  const upcoming = prayers.filter((p) => p.time > now);
  if (upcoming.length === 0) return null;
  upcoming.sort((a, b) => a.time - b.time);
  return upcoming[0];
}

// --- Rendu dans la page ---
function renderTable(prayers) {
  tablePrieresEl.innerHTML = "";
  const now = new Date();

  prayers.forEach((p) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = p.label;

    const tdTime = document.createElement("td");
    tdTime.textContent = formatTimeFr(p.time);

    const tdState = document.createElement("td");
    tdState.textContent = p.time > now ? "À venir" : "Déjà passée";

    tr.appendChild(tdName);
    tr.appendChild(tdTime);
    tr.appendChild(tdState);
    tablePrieresEl.appendChild(tr);
  });
}

function renderNextPrayer() {
  if (!nextPrayer) {
    prochainePriereTexteEl.textContent =
      "Aucune autre prière à venir pour aujourd’hui.";
    return;
  }
  prochainePriereTexteEl.textContent = `Prochaine prière : ${
    nextPrayer.label
  } à ${formatTimeFr(nextPrayer.time)}.`;
}

// --- Actions boutons ---
function onAnnounceNextPrayer() {
  maybeSpeakLoveMessage();
  if (!nextPrayer) {
    speak("Aucune autre prière à venir pour aujourd’hui.");
    return;
  }
  const sentence = `Prochaine prière : ${
    nextPrayer.label
  } à ${formatTimeFr(nextPrayer.time)}.`;
  speak(sentence);
}

function onLireToutes() {
  maybeSpeakLoveMessage();
  if (!prayerList.length) {
    speak("Aucun horaire de prière n’est disponible.");
    return;
  }
  const parts = prayerList.map(
    (p) => `Salat ${p.label} à ${formatTimeFr(p.time)}.`
  );
  speak(parts.join(" "));
}

// --- Initialisation globale ---
async function init() {
  // 1) Désinscrire anciens SW
  if ("serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      regs.forEach((r) => r.unregister());
      console.log("Anciens service workers désinscrits.");
    } catch (e) {
      console.warn("Impossible de désinscrire les service workers :", e);
    }
  }

  // 2) Date du jour
  const now = new Date();
  dateDuJourEl.textContent = `Nous sommes le ${formatDateFr(now)}.`;

  initLoveMessageToggle();

  try {
    messageErreurEl.textContent = "";
    prochainePriereTexteEl.textContent = "Chargement des horaires...";
    const timings = await fetchPrayerTimes();
    prayerList = buildPrayerList(timings);
    nextPrayer = computeNextPrayer(prayerList);
    renderTable(prayerList);
    renderNextPrayer();
  } catch (e) {
    console.error(e);
    messageErreurEl.textContent =
      "Impossible de charger les horaires de prière. Vérifie ta connexion Internet.";
    prochainePriereTexteEl.textContent =
      "Les horaires de prière n’ont pas pu être chargés.";
  }

  // 3) Boutons
  btnAnnonceProchaine.addEventListener("click", onAnnounceNextPrayer);
  btnLireToutes.addEventListener("click", onLireToutes);

  // 4) Premier clic => message d'amour éventuel
  document.body.addEventListener(
    "click",
    () => {
      maybeSpeakLoveMessage();
    },
    { once: true }
  );
}


// Lancer l’app
document.addEventListener("DOMContentLoaded", init);
