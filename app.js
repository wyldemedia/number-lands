const CFG = window.SA_CONFIG;
const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

// ---------- storage ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("sa." + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("sa." + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("sa." + k); } catch {} }
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- auth ----------
// Both providers resolve to { email, signedUpAt } or null.
const auth = {
  client: null,

  async init() {
    if (CFG.auth.provider !== "supabase") return;
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    this.client = createClient(CFG.auth.supabaseUrl, CFG.auth.supabaseAnonKey);
    await this.client.auth.getSession(); // finishes reading a magic-link token from the URL
    if (/access_token|error_description/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/");
  },

  async user() {
    if (!this.client) return store.get("user");
    const { data } = await this.client.auth.getSession();
    const u = data.session?.user;
    return u ? { email: u.email, signedUpAt: u.created_at } : null;
  },

  async sendLink(email) {
    if (!this.client) {
      store.set("user", { email, signedUpAt: new Date().toISOString() });
      return { signedIn: true };
    }
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    return { signedIn: false };
  },

  // The 6-digit code lets people finish sign-in inside the home-screen app,
  // where tapping the email link would open Safari instead.
  async verifyCode(email, token) {
    const { error } = await this.client.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;
  },

  async signOut() {
    if (this.client) await this.client.auth.signOut();
    store.del("user");
  }
};

// ---------- schedule ----------
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function daysSince(iso) {
  if (CFG.allowDayOverride) {
    const q = new URLSearchParams(location.search).get("day");
    if (q !== null && !isNaN(+q)) return +q;
  }
  return Math.round((startOfDay(new Date()) - startOfDay(iso)) / 86400000);
}

function unlockDate(iso, day) { const d = startOfDay(iso); d.setDate(d.getDate() + day); return d; }
const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// ---------- data ----------
async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.json();
}

let DATA = null;
async function loadData() {
  const [tracks, workshop] = await Promise.all([getJSON("data/tracks.json"), getJSON("data/workshop.json")]);
  DATA = { tracks: tracks.tracks, workshop };
}

function sessionState(s, user) {
  const day = daysSince(user.signedUpAt);
  const open = day >= s.unlockDay;
  return { open, ready: open && !!s.audio, opensOn: unlockDate(user.signedUpAt, s.unlockDay) };
}

function edgeOpen(user) {
  return DATA.tracks.some((t) => t.sessions.some((s) => s.isEdge && sessionState(s, user).open));
}

// ---------- views ----------
function viewSignIn() {
  const lead = DATA.tracks[0].sessions[0];
  app.innerHTML = `
    <h1>${esc(lead.title)}</h1>
    <p>${esc(lead.summary)} A short guided session for the moments money stress hits.</p>
    <form id="signin" novalidate>
      <label for="email">Your email</label>
      <input id="email" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com">
      <button class="btn btn-play btn-wide" type="submit">Send my sign-in link</button>
      <p class="muted small" style="margin-top:12px">We only email to tell you when your next session is open.</p>
      <p class="error small" id="err" role="alert"></p>
    </form>`;
  $("#signin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("#err").textContent = "That email doesn't look complete."; return; }
    const btn = e.submitter; btn.disabled = true;
    try {
      const r = await auth.sendLink(email);
      if (r.signedIn) return route();
      viewCheckInbox(email);
    } catch (err) {
      $("#err").textContent = "Couldn't send the link. Please try again in a moment.";
      btn.disabled = false;
    }
  });
}

function viewCheckInbox(email) {
  app.innerHTML = `
    <h1>Check your inbox</h1>
    <p>We've sent a sign-in link to <strong>${esc(email)}</strong>. Tap it on this device.</p>
    <form id="code" novalidate>
      <label for="otp">Or type the 6-digit code from the email</label>
      <input id="otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}">
      <button class="btn btn-ghost btn-wide" type="submit">Sign in with code</button>
      <p class="error small" id="err" role="alert"></p>
    </form>
    <p class="small"><button class="link-btn" id="again" type="button">Use a different email</button></p>`;
  $("#again").onclick = viewSignIn;
  $("#code").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await auth.verifyCode(email, $("#otp").value.trim()); location.hash = "#/"; route(); }
    catch { $("#err").textContent = "That code didn't work. Check it, or ask for a new link."; }
  });
}

function sessionCard(s, user) {
  const st = sessionState(s, user);
  const status = !st.open ? `Opens ${fmtDate(st.opensOn)}` : st.ready ? (s.minutes ? `${s.minutes} min` : "Open") : "Recording soon";
  const inner = `
    <div class="row"><span class="title">${esc(s.title)}</span><span class="status ${st.open ? "open" : ""}">${esc(status)}</span></div>
    ${st.open ? `<p>${esc(s.summary)}</p>` : ""}`;
  return st.open
    ? `<li><a class="card" href="#/session/${esc(s.id)}">${inner}</a></li>`
    : `<li><div class="card locked" aria-label="${esc(s.title)}, ${esc(status)}">${inner}</div></li>`;
}

function workshopBlock(user) {
  if (CFG.workshopProminence === "quiet" && !edgeOpen(user)) {
    return `<p class="workshop-quiet"><a href="#/workshop">About the live workshop</a></p>`;
  }
  return workshopPanel();
}

function workshopPanel() {
  const w = DATA.workshop;
  if (w.state === "open") {
    const o = w.open;
    const pct = Math.min(100, Math.round((o.reserved / o.threshold) * 100));
    return `
      <section class="workshop" aria-labelledby="ws-h">
        <h2 id="ws-h">${esc(w.name)}</h2>
        <p>${esc(w.summary)}</p>
        <p><strong>${esc(o.dates)}</strong></p>
        <p class="small muted">${esc(o.price)} · ${esc(o.foundingPrice)}. ${esc(o.deposit)}</p>
        <div class="meter" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <p class="small">It runs when ${o.threshold} places are reserved. ${o.reserved} reserved so far.</p>
        ${o.reserveUrl
          ? `<a class="btn btn-workshop" href="${esc(o.reserveUrl)}" target="_blank" rel="noopener">Reserve a place</a>`
          : `<button class="btn btn-workshop" disabled>Reservations open soon</button>`}
        ${o.bonusOnlyUrl ? `<p class="small" style="margin-top:12px"><a href="${esc(o.bonusOnlyUrl)}" target="_blank" rel="noopener">${esc(o.bonusOnlyNote)}</a></p>` : ""}
        ${optIn("Not this time? Email me before the next one", true)}
      </section>`;
  }
  const h = w.hibernating;
  return `
    <section class="workshop" aria-labelledby="ws-h">
      <h2 id="ws-h">${esc(w.name)}</h2>
      <p>${esc(w.summary)}</p>
      <p class="small muted">${esc(h.message)}</p>
      ${optIn("Email me when it next runs", false)}
    </section>`;
}

// The only route to workshop emails. Sign-up consent covers session nudges only.
function optIn(label, quiet) {
  const h = DATA.workshop.hibernating;
  if (store.get("notify")) return `<p class="small" style="margin-top:12px"><strong>You're on the list.</strong> We'll email you about the next workshop.</p>`;
  const cls = quiet ? "link-btn" : "btn btn-workshop";
  const btn = h.notifyUrl
    ? `<a class="${cls}" href="${esc(h.notifyUrl)}" target="_blank" rel="noopener">${esc(label)}</a>`
    : `<button class="${cls}" id="notify" type="button">${esc(label)}</button>`;
  return `<div class="optin">${btn}<p class="muted small">Workshop emails only. Unsubscribe any time.</p></div>`;
}

async function bindNotify(user) {
  const b = $("#notify");
  if (!b) return;
  b.onclick = async () => {
    b.disabled = true;
    try {
      if (auth.client) {
        const { error } = await auth.client.from("workshop_notify").insert({ email: user.email });
        if (error && error.code !== "23505") throw error; // 23505 = already on the list
      }
      store.set("notify", true);
      route();
    } catch { b.disabled = false; b.textContent = "Couldn't save. Try again"; }
  };
}

function viewHome(user) {
  const t = DATA.tracks[0];
  app.innerHTML = `
    <h1>${esc(t.title)}</h1>
    <p class="muted">${esc(t.intro)}</p>
    <ul class="sessions">${t.sessions.map((s) => sessionCard(s, user)).join("")}</ul>
    ${workshopBlock(user)}`;
  bindNotify(user);
}

function viewWorkshop(user) {
  app.innerHTML = `<a class="back" href="#/">← Sessions</a>${workshopPanel()}`;
  bindNotify(user);
}

const fmtTime = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

function viewSession(user, id) {
  const s = DATA.tracks.flatMap((t) => t.sessions).find((x) => x.id === id);
  if (!s || !sessionState(s, user).open) { location.hash = "#/"; return; }
  const ready = !!s.audio;
  app.innerHTML = `
    <a class="back" href="#/">← Sessions</a>
    <h1>${esc(s.title)}</h1>
    <p class="muted">${esc(s.summary)}</p>
    <div class="stopline" role="note">
      <strong>You can stop at any point.</strong>
      If anything feels like too much, pause the audio, look around the room, and come back another time. Stopping is part of the practice.
    </div>
    <div class="player">
      <button class="play-big" id="play" type="button" aria-label="Play" ${ready ? "" : "disabled"}>▶</button>
      ${ready
        ? `<div class="timeline"><span id="cur">0:00</span><input id="seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Position"><span id="dur">${s.minutes ? s.minutes + ":00" : "0:00"}</span></div>`
        : `<p class="muted small" style="margin-top:14px">This session is being recorded. We'll email you when it's ready.</p>`}
    </div>
    ${s.afterLine || s.isEdge ? `<div class="after">${s.afterLine ? `<p class="line">${esc(s.afterLine)}</p>` : ""}${workshopBlock(user)}</div>` : ""}`;
  bindNotify(user);
  if (ready) bindPlayer(s);
}

let audio = null;
function bindPlayer(s) {
  if (!audio) audio = new Audio();
  if (!audio.src.endsWith(s.audio)) { audio.src = s.audio; audio.preload = "metadata"; }
  const play = $("#play"), seek = $("#seek"), cur = $("#cur"), dur = $("#dur");
  const sync = () => {
    play.textContent = audio.paused ? "▶" : "❚❚";
    play.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
    cur.textContent = fmtTime(audio.currentTime);
    if (isFinite(audio.duration)) { dur.textContent = fmtTime(audio.duration); seek.value = (audio.currentTime / audio.duration) * 100; }
  };
  play.onclick = () => (audio.paused ? audio.play() : audio.pause());
  seek.oninput = () => { if (isFinite(audio.duration)) audio.currentTime = (seek.value / 100) * audio.duration; };
  ["play", "pause", "timeupdate", "loadedmetadata", "ended"].forEach((ev) => (audio["on" + ev] = sync));
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: "Somatic Abundance", artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }] });
  }
  sync();
}

// ---------- router ----------
async function route() {
  const user = await auth.user();
  $("#signout-wrap").hidden = !user;
  if (!user) return viewSignIn();
  const [, page, id] = location.hash.split("/");
  if (page === "session" && id) viewSession(user, decodeURIComponent(id));
  else if (page === "workshop") viewWorkshop(user);
  else viewHome(user);
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------- chrome ----------
function setupTheme() {
  const btn = $("#theme-toggle");
  const label = () => {
    const dark = document.documentElement.dataset.theme !== "light";
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    $('meta[name="theme-color"]').content = dark ? "#1C1D24" : "#F4EFE6";
  };
  btn.onclick = () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sa.theme", next); } catch {}
    label();
  };
  label();
}

function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const offer = (sw) => {
      $("#update-toast").hidden = false;
      $("#update-btn").onclick = () => sw.postMessage("SKIP_WAITING");
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) offer(sw);
      });
    });
    // Check for a new version whenever the app comes back to the foreground.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update(); });
  });
  // Reload only when an update replaces an existing worker, not on the first install.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true; location.reload();
  });
}

async function start() {
  setupTheme();
  $("#version").textContent = "v" + CFG.appVersion;
  if (CFG.auth.provider !== "supabase") {
    const b = $("#banner"); b.hidden = false;
    b.textContent = "Preview mode: no emails are sent and sign-in only lasts on this device.";
  }
  $("#signout").onclick = async () => { await auth.signOut(); location.hash = "#/"; route(); };
  try {
    await auth.init();
    await loadData();
  } catch (e) {
    app.innerHTML = `<h1>Can't load right now</h1><p class="muted">Check your connection and try again.</p>`;
    console.error(e);
    return;
  }
  window.addEventListener("hashchange", route);
  await route();
  setupServiceWorker();
}

start();
