// Site settings. Edit this file, then bump CACHE_VERSION in sw.js so returning users get it.
window.SA_CONFIG = {
  appVersion: "0.1.1",

  auth: {
    // "preview": no emails are sent; any address signs in on this device. For testing only.
    // "supabase": real magic links via Supabase Auth (see README).
    provider: "preview",
    supabaseUrl: "",
    supabaseAnonKey: ""
  },

  // "quiet": before the edge session opens, the workshop is a small text link.
  //          The full panel appears once the day 10 session is unlocked.
  // "equal": the full panel with its ochre button is always on the home screen.
  workshopProminence: "quiet",

  // Allows ?day=N in the URL to preview the unlock schedule. Turn off for launch.
  allowDayOverride: true
};
