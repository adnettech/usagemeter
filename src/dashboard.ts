import type { Snapshot } from "./types.ts";
import { PORT } from "./config.ts";

type Opts = {
  getSnapshot: () => Snapshot;
  refresh: () => Promise<Snapshot>;
  port?: number;
};

export function startDashboard(opts: Opts): { url: string; stop: () => void } {
  const server = Bun.serve({
    port: opts.port ?? PORT,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/api/usage") {
        const snap = url.searchParams.get("refresh") === "1" ? await opts.refresh() : opts.getSnapshot();
        return Response.json(snap);
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  return { url: `http://localhost:${server.port}`, stop: () => server.stop(true) };
}

// Inlined so `bun build --compile` produces a single self-contained binary.
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>usagemeter</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #161618; color: #ededef;
    font: 14px/1.4 -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif;
    display: flex; justify-content: center; padding: 40px 16px;
  }
  .card { width: 100%; max-width: 640px; background: #202023; border: 1px solid #2c2c30;
          border-radius: 14px; padding: 28px 30px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  h1 { font-size: 18px; margin: 0 0 2px; display: flex; align-items: center; gap: 10px; }
  .badge { font-size: 12px; font-weight: 500; color: #a8a8b0; background: #2c2c31;
           padding: 2px 9px; border-radius: 999px; }
  h2 { font-size: 14px; color: #c9c9d1; margin: 26px 0 14px; }
  a { color: #6aa3ff; text-decoration: none; font-size: 13px; }
  a:hover { text-decoration: underline; }
  .row { display: grid; grid-template-columns: 210px 1fr 78px; align-items: center; gap: 16px; margin: 16px 0; }
  .lbl { font-weight: 600; }
  .sub { color: #8a8a93; font-size: 12px; margin-top: 3px; }
  .track { height: 8px; border-radius: 999px; background: #3a3a40; overflow: hidden; }
  .fill { height: 100%; border-radius: 999px; background: #4a9eff; transition: width .5s ease; }
  .pctv { text-align: right; color: #c9c9d1; white-space: nowrap; }
  .extra { margin-top: 18px; color: #a8a8b0; font-size: 13px; }
  .foot { display: flex; align-items: center; gap: 12px; margin-top: 26px;
          color: #8a8a93; font-size: 13px; }
  button { background: #2c2c31; color: #ededef; border: 1px solid #3a3a40; border-radius: 8px;
           padding: 5px 11px; cursor: pointer; font-size: 13px; }
  button:hover { background: #34343a; }
  .err { background: #3a2526; border: 1px solid #6b3a3c; color: #ffb4b6; padding: 8px 12px;
         border-radius: 8px; font-size: 12px; margin-bottom: 16px; }
  .hidden { display: none; }
</style>
</head>
<body>
  <div class="card">
    <div id="err" class="err hidden"></div>
    <h1>Your usage limits <span id="plan" class="badge hidden"></span></h1>
    <div id="session"></div>
    <div id="weeklyWrap" class="hidden">
      <h2>Weekly limits</h2>
      <div style="margin:-6px 0 10px"><a href="https://support.anthropic.com" target="_blank" rel="noreferrer">Learn more about usage limits</a></div>
      <div id="weekly"></div>
    </div>
    <div id="extra" class="extra hidden"></div>
    <div class="foot">
      <span id="updated">Loading…</span>
      <button id="refresh" title="Refresh now">↻ Refresh</button>
    </div>
  </div>
<script>
  var snap = null;

  function fillColor(u){ if(u>=90) return "#ff4d4f"; if(u>=70) return "#f5a623"; return "#4a9eff"; }
  function relReset(iso){
    var ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return "Resetting now";
    var min = Math.floor(ms/60000), h = Math.floor(min/60), m = min%60;
    return "Resets " + (h>0 ? "in " + h + " hr " + m + " min" : "in " + m + " min");
  }
  function absReset(iso){
    var d = new Date(iso);
    return "Resets " + d.toLocaleString([], {weekday:"short", hour:"numeric", minute:"2-digit"});
  }
  function ago(ms){
    if (!ms) return "never";
    var s = Math.floor((Date.now()-ms)/1000);
    if (s < 10) return "just now";
    if (s < 60) return s + " sec ago";
    var m = Math.floor(s/60); if (m < 60) return m + " min ago";
    return Math.floor(m/60) + " hr ago";
  }
  function rowHtml(w){
    var u = Math.round(w.utilization);
    var sub = w.reltime ? relReset(w.resetsAt) : absReset(w.resetsAt);
    return '<div class="row">' +
      '<div><div class="lbl">' + w.label.replace(/^Weekly · /,"") + '</div><div class="sub">' + sub + '</div></div>' +
      '<div class="track"><div class="fill" style="width:' + u + '%;background:' + fillColor(u) + '"></div></div>' +
      '<div class="pctv">' + u + '% used</div></div>';
  }
  function render(){
    if (!snap) return;
    var err = document.getElementById("err");
    if (snap.error) { err.textContent = (snap.stale ? "Showing cached data — " : "") + snap.error; err.classList.remove("hidden"); }
    else err.classList.add("hidden");

    var plan = document.getElementById("plan");
    if (snap.plan) { plan.textContent = snap.plan; plan.classList.remove("hidden"); } else plan.classList.add("hidden");

    var session = (snap.windows||[]).filter(function(w){ return w.reltime; });
    var weekly = (snap.windows||[]).filter(function(w){ return !w.reltime; });
    document.getElementById("session").innerHTML = session.map(rowHtml).join("");
    var ww = document.getElementById("weeklyWrap");
    if (weekly.length) { document.getElementById("weekly").innerHTML = weekly.map(rowHtml).join(""); ww.classList.remove("hidden"); }
    else ww.classList.add("hidden");

    var ex = document.getElementById("extra");
    if (snap.extra && snap.extra.enabled) {
      var used = (snap.extra.usedCredits || 0).toFixed(2);
      var lim = snap.extra.monthlyLimit == null ? "—" : snap.extra.monthlyLimit;
      ex.textContent = "Extra usage: " + snap.extra.currency + " " + used + " / " + lim;
      ex.classList.remove("hidden");
    } else ex.classList.add("hidden");

    document.getElementById("updated").textContent = "Last updated: " + ago(snap.fetchedAt);
  }
  async function load(force){
    try {
      var r = await fetch("/api/usage" + (force ? "?refresh=1" : ""));
      snap = await r.json();
    } catch (e) {
      if (snap) snap.error = String(e);
    }
    render();
  }
  document.getElementById("refresh").addEventListener("click", function(){ load(true); });
  load(false);
  setInterval(render, 1000);        // live countdown + "updated X ago"
  setInterval(function(){ load(false); }, 30000);
</script>
</body>
</html>`;
