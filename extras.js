
(function () {
  "use strict";
  if (window.__schoolCountdownExtrasLoaded) return;
  window.__schoolCountdownExtrasLoaded = true;

  var target = new Date("2026-12-03T15:15:00+11:00").getTime();
  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var storage = {
    get: function (key, fallback) {
      try { var value = localStorage.getItem("schoolCountdown." + key); return value === null ? fallback : value; }
      catch (e) { return fallback; }
    },
    set: function (key, value) { try { localStorage.setItem("schoolCountdown." + key, value); } catch (e) {} }
  };
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var soundOn = storage.get("sound", "false") === "true";
  var audioContext = null;
  var toastTimer = 0;
  var bellSequence = [];
  var logoClicks = 0;
  var logoTimer = 0;
  var konamiBuffer = "";
  var secretWordBuffer = "";
  var secretTimer = 0;
  var pickedUnits = [];
  var gameScore = 0;
  var gameOpen = false;

  function toast(message) {
    var node = $("#extra-toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { node.classList.remove("show"); }, 2500);
  }

  function safeName(value) {
    return String(value || "").replace(/[<>]/g, "").trim().slice(0, 22);
  }

  function getAudio() {
    if (!audioContext) {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) audioContext = new AudioCtor();
    }
    if (audioContext && audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function tone(frequency, start, duration, volume, type) {
    var ctx = getAudio();
    if (!ctx) return;
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();
    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume || .075, start + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  }

  function bellSound() {
    var ctx = getAudio();
    if (!ctx) return;
    var now = ctx.currentTime;
    tone(880, now, .42, .09, "sine");
    tone(1174.66, now + .1, .55, .065, "sine");
    tone(1567.98, now + .2, .75, .05, "sine");
  }

  function makeButton(action, glyph, label, primary) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "extra-action" + (primary ? " primary" : "");
    button.dataset.action = action;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = '<span class="glyph" aria-hidden="true">' + glyph + '</span><span class="action-text">' + label + '</span>';
    return button;
  }

  function createInterface() {
    var header = $("header");
    if (!header) return;
    var actions = document.createElement("div");
    actions.className = "extra-actions";
    actions.appendChild(makeButton("share", "↗", "Share", false));
    actions.appendChild(makeButton("focus", "◎", "Focus", false));
    actions.appendChild(makeButton("fullscreen", "⛶", "Full screen", false));
    actions.appendChild(makeButton("panel", "☷", "Explore", true));
    header.appendChild(actions);

    var panel = document.createElement("aside");
    panel.id = "feature-panel";
    panel.setAttribute("aria-label", "Countdown settings and extras");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML =
      '<div class="panel-topline"><div><div class="panel-kicker">Make it yours</div><div class="panel-title">Countdown control room</div></div><button class="extra-close" type="button" aria-label="Close settings" data-action="close-panel">×</button></div>' +
      '<section class="panel-section"><span class="panel-label">Choose your atmosphere</span><div class="theme-row">' +
      '<button class="theme-swatch" data-theme-choice="midnight" aria-pressed="true"><span class="swatch-dot" style="--swatch:#68e4f4"></span>Midnight</button>' +
      '<button class="theme-swatch" data-theme-choice="aurora" aria-pressed="false"><span class="swatch-dot" style="--swatch:#8df2c7"></span>Aurora</button>' +
      '<button class="theme-swatch" data-theme-choice="sunset" aria-pressed="false"><span class="swatch-dot" style="--swatch:#ff9abd"></span>Sunset</button>' +
      '<button class="theme-swatch" data-theme-choice="mono" aria-pressed="false"><span class="swatch-dot" style="--swatch:#dce5f2"></span>Mono</button>' +
      '<button class="theme-swatch" data-theme-choice="retro" aria-pressed="false"><span class="swatch-dot" style="--swatch:#c5ff70"></span>Arcade</button>' +
      '</div><p class="panel-help">Your choice is saved on this device.</p></section>' +
      '<section class="panel-section">' +
      '<div class="panel-control-row"><div class="panel-control-copy"><strong>Countdown sound</strong><small>Final seconds + finish bell</small></div><label class="extra-switch"><input id="sound-toggle" type="checkbox" ' + (soundOn ? "checked" : "") + '><span></span></label></div>' +
      '<div class="panel-control-row"><div class="panel-control-copy"><strong>Motion effects</strong><small>Big pulses, glow and transitions</small></div><label class="extra-switch"><input id="motion-toggle" type="checkbox" ' + (storage.get("motion", reduced ? "false" : "true") === "true" ? "checked" : "") + '><span></span></label></div>' +
      '<div class="panel-control-row"><div class="panel-control-copy"><strong>Digital display</strong><small>Monospaced timer numbers</small></div><label class="extra-switch"><input id="digital-toggle" type="checkbox" ' + (storage.get("digital", "false") === "true" ? "checked" : "") + '><span></span></label></div>' +
      '</section>' +
      '<section class="panel-section"><label class="panel-label" for="name-input">Put your name on the countdown</label><input class="panel-input" id="name-input" maxlength="22" placeholder="Enter a nickname..." value="' + safeName(storage.get("name", "")).replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"><p class="panel-help">Only saved in this browser. Leave blank for the classic version.</p></section>' +
      '<section class="panel-section"><span class="panel-label">Quick actions</span><div class="panel-button-grid">' +
      '<button class="extra-btn" data-action="copy-time">Copy time left</button>' +
      '<button class="extra-btn" data-action="calendar">Add to calendar</button>' +
      '<button class="extra-btn" data-action="share">Share countdown</button>' +
      '<button class="extra-btn" data-action="preview">Preview the big finish</button>' +
      '</div></section>' +
      '<section class="panel-section"><span class="panel-label">Secret menu</span><div class="panel-button-grid">' +
      '<button class="extra-btn" data-action="bell-game">Play Bell Catcher</button>' +
      '<button class="extra-btn" data-action="surprise">Surprise me</button>' +
      '</div><p class="panel-help">There are a few secrets hidden around this page. Try the logo, the keyboard, and the timer tiles.</p></section>';
    document.body.appendChild(panel);

    var dashboard = document.createElement("section");
    dashboard.className = "extras-dashboard";
    dashboard.innerHTML =
      '<div class="extra-card"><div class="extra-card-head"><span class="extra-card-title">The final stretch</span><span class="extra-card-subtitle" id="runway-percent">0% complete</span></div>' +
      '<div class="runway-track" role="progressbar" aria-label="Progress through the final 30-day countdown runway" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="runway-track"><div class="runway-fill" id="runway-fill"></div></div>' +
      '<div class="runway-meta"><span>30-day runway</span><strong id="next-milestone">Next: final 24 hours</strong></div></div>' +
      '<div class="extra-card"><div class="extra-card-head"><span class="extra-card-title">School survival kit</span><span class="extra-card-subtitle">A little boost</span></div>' +
      '<div class="boost-line" id="boost-line">You are closer to the finish than you were yesterday.</div><button class="boost-action" type="button" data-action="boost">Give me another boost ↗</button></div>' +
      '<div class="extra-card checkpoint-card"><div class="extra-card-head"><span class="extra-card-title">Bell checkpoints</span><span class="extra-card-subtitle">Five moments to victory</span></div>' +
      '<div class="checkpoint-list" id="checkpoint-list">' +
      '<button class="checkpoint" type="button" data-checkpoint="day"><strong>24 hours</strong><small>One day left</small></button>' +
      '<button class="checkpoint" type="button" data-checkpoint="hour"><strong>1 hour</strong><small>Final hour</small></button>' +
      '<button class="checkpoint" type="button" data-checkpoint="ten"><strong>10 minutes</strong><small>Home stretch</small></button>' +
      '<button class="checkpoint" type="button" data-checkpoint="minute"><strong>60 seconds</strong><small>Last minute</small></button>' +
      '<button class="checkpoint" type="button" data-checkpoint="bell"><strong>3:15 PM</strong><small>The last bell</small></button>' +
      '</div></div>' +
      '<div class="clock-line"><span>SYDNEY CLOCK <strong id="sydney-clock">--:--:--</strong></span><span>YOUR STATUS <strong id="personal-status">Final stretch in progress</strong></span><span id="secret-badge">✦ secret level unlocked</span></div>';
    var main = $("main");
    var note = $(".bottom-note");
    if (main && note) main.insertBefore(dashboard, note);
    else if (main) main.appendChild(dashboard);

    var toastNode = document.createElement("div");
    toastNode.id = "extra-toast";
    toastNode.setAttribute("role", "status");
    toastNode.setAttribute("aria-live", "polite");
    document.body.appendChild(toastNode);

    var game = document.createElement("div");
    game.className = "bell-game";
    game.id = "bell-game";
    game.setAttribute("aria-hidden", "true");
    game.innerHTML = '<div class="bell-game-card"><div class="bell-game-top"><div><div class="panel-kicker">Tiny hidden challenge</div><h3>Bell catcher</h3><p>Catch the bell five times. It jumps to a new spot after every catch.</p></div><button class="extra-close" type="button" aria-label="Close game" data-action="close-game">×</button></div><div class="game-arena" id="game-arena"><button class="bell-target" id="bell-target" type="button" aria-label="Catch the bell">🔔</button></div><div class="bell-game-footer"><span class="game-score" id="game-score">0 / 5 caught</span><button class="extra-btn" type="button" data-action="restart-game">Restart</button></div></div>';
    document.body.appendChild(game);

    applyTheme(storage.get("theme", "midnight"));
    applyName(storage.get("name", ""));
    document.body.classList.toggle("no-extra-motion", storage.get("motion", reduced ? "false" : "true") !== "true");
    document.body.classList.toggle("digital-display", storage.get("digital", "false") === "true");
    updateRunway();
    updateSydneyClock();
    window.setInterval(function () {
      updateRunway();
      updateSydneyClock();
    }, 1000);
  }

  function applyTheme(theme) {
    var allowed = ["midnight", "aurora", "sunset", "mono", "retro"];
    if (allowed.indexOf(theme) === -1) theme = "midnight";
    document.body.setAttribute("data-theme", theme);
    storage.set("theme", theme);
    $$("[data-theme-choice]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.themeChoice === theme ? "true" : "false");
    });
    if (theme === "retro") document.body.classList.add("retro-mode");
    else document.body.classList.remove("retro-mode");
  }

  function applyName(name) {
    name = safeName(name);
    var brand = $(".brand span");
    if (brand) brand.textContent = name ? "School countdown · " + name : "School countdown";
    document.title = name ? name + "'s School Countdown" : "School's Almost Out — The Countdown";
    storage.set("name", name);
  }

  function remainingMs() { return Math.max(0, target - Date.now()); }
  function formatRemaining(ms) {
    var seconds = Math.floor(ms / 1000);
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var secs = seconds % 60;
    return days + " days, " + hours + " hours, " + minutes + " minutes and " + secs + " seconds";
  }

  function updateRunway() {
    var start = target - (30 * 24 * 60 * 60 * 1000);
    var total = target - start;
    var progress = Math.max(0, Math.min(100, ((Date.now() - start) / total) * 100));
    var fill = $("#runway-fill");
    var label = $("#runway-percent");
    var bar = $("#runway-track");
    if (fill) fill.style.width = progress.toFixed(2) + "%";
    if (label) label.textContent = Math.floor(progress) + "% complete";
    if (bar) bar.setAttribute("aria-valuenow", String(Math.floor(progress)));
    var next = $("#next-milestone");
    var status = $("#personal-status");
    var ms = target - Date.now();
    var checkpointRules = [
      {id:"day", at:86400000, detail:"24 hours to go — the final school day is almost here."},
      {id:"hour", at:3600000, detail:"One hour left — the home stretch begins."},
      {id:"ten", at:600000, detail:"Ten minutes to go — things are getting real."},
      {id:"minute", at:60000, detail:"The final minute. Get ready for the bell."},
      {id:"bell", at:0, detail:"3:15 PM. The final bell. School is out."}
    ];
    var upcoming = checkpointRules.find(function (item) { return ms > item.at; });
    $(".checkpoint").forEach(function (button) {
      var rule = checkpointRules.find(function (item) { return item.id === button.dataset.checkpoint; });
      if (!rule) return;
      button.classList.toggle("is-reached", ms <= rule.at);
      button.classList.toggle("is-next", !!upcoming && upcoming.id === rule.id);
      button.setAttribute("aria-pressed", ms <= rule.at ? "true" : "false");
    });
    if (next) {
      if (ms > 86400000) next.textContent = "Next: final 24 hours";
      else if (ms > 3600000) next.textContent = "Next: final hour";
      else if (ms > 600000) next.textContent = "Next: final 10 minutes";
      else if (ms > 60000) next.textContent = "Next: final minute";
      else if (ms > 0) next.textContent = "Next: the last 10 seconds";
      else next.textContent = "Milestone complete ✦";
    }
    if (status) {
      if (ms <= 0) status.textContent = "SCHOOL'S OUT";
      else if (ms <= 600000) status.textContent = "Almost at the bell";
      else if (ms <= 86400000) status.textContent = "Final day energy";
      else status.textContent = "Final stretch in progress";
    }
  }

  function updateSydneyClock() {
    var clock = $("#sydney-clock");
    if (!clock) return;
    try {
      clock.textContent = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
      }).format(new Date());
    } catch (e) {
      clock.textContent = new Date().toLocaleTimeString();
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard ✦"); }).catch(function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try { document.execCommand("copy"); toast("Copied to clipboard ✦"); }
    catch (e) { toast("Copy isn't available in this browser."); }
    document.body.removeChild(input);
  }
  function shareCountdown() {
    var text = "School's almost out! " + formatRemaining(remainingMs()) + " until Thursday 3 December at 3:15 pm Sydney time. " + location.href;
    if (navigator.share) {
      navigator.share({ title: "School countdown", text: text, url: location.href }).then(function () {}).catch(function (error) {
        if (error && error.name !== "AbortError") copyText(text);
      });
    } else copyText(text);
  }
  function downloadCalendar() {
    var ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//School Countdown//Last Bell//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:school-countdown-20261203T151500@school-countdown",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
      "DTSTART:20261203T041500Z",
      "DTEND:20261203T043000Z",
      "SUMMARY:School is out!",
      "DESCRIPTION:The final bell. School countdown complete.",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "school-is-out-3-december-2026.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Calendar event downloaded ✦");
  }

  function openPanel() {
    var panel = $("#feature-panel");
    if (!panel) return;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    $("#feature-toggle")?.setAttribute("aria-expanded", "true");
    var closeButton = $('[data-action="close-panel"]',panel);
    if (closeButton) closeButton.focus({preventScroll:true});
  }
  function closePanel() {
    var panel = $("#feature-panel");
    if (!panel) return;
    var wasOpen = panel.classList.contains("open");
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    $("#feature-toggle")?.setAttribute("aria-expanded", "false");
    if (wasOpen) {
      var trigger = $('[data-action="panel"]');
      if (trigger) trigger.focus({preventScroll:true});
    }
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      var request = document.documentElement.requestFullscreen;
      if (request) request.call(document.documentElement).then(function () { toast("Full-screen mode enabled"); }).catch(function () { toast("Full screen isn't available here."); });
      else toast("Full screen isn't supported by this browser.");
    } else document.exitFullscreen().catch(function () {});
  }
  function toggleFocus() {
    document.body.classList.toggle("focus-mode");
    toast(document.body.classList.contains("focus-mode") ? "Focus mode on · Press F to exit" : "Focus mode off");
  }

  var boosts = [
    "You're not counting the days. You're collecting the last few victories.",
    "Future you is already celebrating. Keep going.",
    "One lesson at a time. One bell at a time. You're nearly there.",
    "The finish line isn't moving. You're getting closer.",
    "Remember: every school day ends. This one has a particularly good ending.",
    "Your future self says: keep the momentum. The afternoon is waiting.",
    "You're in the endgame now. Final stretch unlocked.",
    "A little more patience. A lot more freedom.",
    "The last chapter is always the most satisfying.",
    "You have officially entered the 'nearly there' cinematic universe.",
    "Take a breath, do your thing, and let the clock do its thing.",
    "The bell is on its way. You just have to meet it there."
  ];
  var lastBoost = -1;
  function newBoost() {
    var index = Math.floor(Math.random() * boosts.length);
    if (boosts.length > 1 && index === lastBoost) index = (index + 1) % boosts.length;
    lastBoost = index;
    var node = $("#boost-line");
    if (!node) return;
    node.animate && !reduced ? node.animate([{ opacity: .2, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 320, easing: "ease-out" }) : null;
    node.textContent = boosts[index];
  }

  var previewFrame = 0;
  var previewParticles = [];
  var previewStartedAt = 0;
  var previewStopTimer = 0;

  function previewBurst(context, x, y) {
    var hue = Math.floor(Math.random() * 360);
    for (var i = 0; i < 64; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1.1 + Math.random() * 4.5;
      previewParticles.push({
        x:x,y:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        life:50 + Math.random()*35,size:1 + Math.random()*2.7,
        hue:(hue + Math.random()*75 - 37 + 360)%360
      });
    }
  }

  function stopPreviewFireworks() {
    if (previewFrame) window.cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    previewParticles = [];
    var canvas = $("#fireworks");
    if (canvas) {
      var context = canvas.getContext("2d");
      context.clearRect(0,0,window.innerWidth,window.innerHeight);
    }
  }

  function animatePreviewFireworks(now) {
    var canvas = $("#fireworks");
    if (!canvas) return;
    var context = canvas.getContext("2d");
    var width = window.innerWidth;
    var height = window.innerHeight;
    context.clearRect(0,0,width,height);
    if (now - previewStartedAt < 7600 && Math.random() < .12) {
      previewBurst(context,width*(.12+Math.random()*.76),height*(.12+Math.random()*.5));
    }
    for (var i=previewParticles.length-1;i>=0;i--) {
      var p=previewParticles[i];
      p.x+=p.vx;p.y+=p.vy;p.vy+=.045;p.vx*=.986;p.vy*=.986;p.life--;
      if(p.life<=0){previewParticles.splice(i,1);continue;}
      context.beginPath();
      context.fillStyle="hsla("+p.hue+",100%,72%,"+Math.min(1,p.life/20)+")";
      context.shadowBlur=14;
      context.shadowColor="hsla("+p.hue+",100%,72%,.7)";
      context.arc(p.x,p.y,p.size,0,Math.PI*2);
      context.fill();
    }
    context.shadowBlur=0;
    if(now-previewStartedAt<9000||previewParticles.length) previewFrame=window.requestAnimationFrame(animatePreviewFireworks);
    else previewFrame=0;
  }

  function previewCelebration() {
    var layer = $("#celebration");
    if (!layer) return;
    window.clearTimeout(previewStopTimer);
    layer.classList.add("show");
    layer.setAttribute("aria-hidden", "false");
    toast("Celebration preview · The real timer stays unchanged");
    if (!reduced && !document.body.classList.contains("no-extra-motion")) {
      var canvas = $("#fireworks");
      var ratio = Math.min(window.devicePixelRatio || 1,2);
      canvas.width = Math.floor(window.innerWidth*ratio);
      canvas.height = Math.floor(window.innerHeight*ratio);
      canvas.style.width = window.innerWidth+"px";
      canvas.style.height = window.innerHeight+"px";
      canvas.getContext("2d").setTransform(ratio,0,0,ratio,0,0);
      stopPreviewFireworks();
      previewStartedAt = performance.now();
      previewBurst(canvas.getContext("2d"),window.innerWidth*.5,window.innerHeight*.34);
      previewBurst(canvas.getContext("2d"),window.innerWidth*.22,window.innerHeight*.46);
      previewBurst(canvas.getContext("2d"),window.innerWidth*.78,window.innerHeight*.43);
      previewFrame = window.requestAnimationFrame(animatePreviewFireworks);
    }
    if (soundOn) bellSound();
    launchConfetti(140);
    previewStopTimer = window.setTimeout(function () {
      if (target > Date.now()) {
        layer.classList.remove("show");
        layer.setAttribute("aria-hidden", "true");
        stopPreviewFireworks();
      }
    }, 9500);
  }

  function launchConfetti(count) {
    if (reduced || document.body.classList.contains("no-extra-motion")) return;
    var colors = ["#c9ff76", "#68e4f4", "#92a7ff", "#ffdb85", "#ff8cc5", "#f6fbff"];
    for (var i = 0; i < count; i++) {
      var piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.setProperty("--x", Math.random() * 100 + "vw");
      piece.style.setProperty("--w", 4 + Math.random() * 7 + "px");
      piece.style.setProperty("--h", 7 + Math.random() * 13 + "px");
      piece.style.setProperty("--c", colors[Math.floor(Math.random() * colors.length)]);
      piece.style.setProperty("--d", 4 + Math.random() * 4 + "s");
      piece.style.setProperty("--delay", Math.random() * .8 + "s");
      piece.style.setProperty("--drift", (Math.random() - .5) * 220 + "px");
      piece.style.setProperty("--spin", (Math.random() - .5) * 1300 + "deg");
      document.body.appendChild(piece);
      window.setTimeout(function (node) { return function () { node.remove(); }; }(piece), 9500);
    }
  }

  function secretUnlock(message) {
    applyTheme("retro");
    var badge = $("#secret-badge");
    if (badge) badge.classList.add("show");
    toast(message || "SECRET UNLOCKED · Retro bell mode");
    launchConfetti(100);
  }

  function startBellGame() {
    gameScore = 0;
    gameOpen = true;
    var game = $("#bell-game");
    if (!game) return;
    game.classList.add("open");
    game.setAttribute("aria-hidden", "false");
    moveBell();
    updateGameScore();
  }
  function moveBell() {
    var arena = $("#game-arena");
    var button = $("#bell-target");
    if (!arena || !button) return;
    var maxX = Math.max(45, arena.clientWidth - 45);
    var maxY = Math.max(50, arena.clientHeight - 50);
    button.style.left = (34 + Math.random() * (maxX - 34)) + "px";
    button.style.top = (34 + Math.random() * (maxY - 34)) + "px";
  }
  function updateGameScore() {
    var score = $("#game-score");
    if (score) score.textContent = gameScore + " / 5 caught";
  }
  function closeBellGame() {
    gameOpen = false;
    var game = $("#bell-game");
    if (game) {
      game.classList.remove("open");
      game.setAttribute("aria-hidden", "true");
    }
  }
  function catchBell() {
    if (!gameOpen) return;
    gameScore += 1;
    updateGameScore();
    if (soundOn) {
      var ctx = getAudio();
      if (ctx) tone(740 + gameScore * 90, ctx.currentTime, .12, .045, "triangle");
    }
    if (gameScore >= 5) {
      closeBellGame();
      secretUnlock("HALL PASS EARNED · You caught all five bells");
    } else {
      moveBell();
      var button = $("#bell-target");
      if (button) button.style.transform = "translate(-50%,-50%) rotate(" + (Math.random() * 24 - 12) + "deg) scale(1.08)";
    }
  }

  function sparkleBurst(x, y) {
    if (reduced || document.body.classList.contains("no-extra-motion")) return;
    var symbols = ["✦","＋","·","✧"];
    for (var i = 0; i < 7; i++) {
      var sparkle = document.createElement("span");
      sparkle.className = "sparkle";
      sparkle.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      sparkle.style.setProperty("--sx", x + "px");
      sparkle.style.setProperty("--sy", y + "px");
      sparkle.style.setProperty("--ss", (8 + Math.random() * 12) + "px");
      sparkle.style.setProperty("--dx", ((Math.random() - .5) * 90) + "px");
      sparkle.style.setProperty("--dy", ((Math.random() - .5) * 80 - 20) + "px");
      document.body.appendChild(sparkle);
      window.setTimeout(function (node) { return function () { node.remove(); }; }(sparkle), 850);
    }
  }

  function clickTimerUnit(event) {
    var unit = event.target.closest(".unit");
    if (!unit) return;
    unit.classList.remove("unit-tapped");
    void unit.offsetWidth;
    unit.classList.add("unit-tapped");
    var sequence = ["days", "hours", "minutes", "seconds"];
    var id = unit.querySelector(".number")?.id;
    if (!id) return;
    var order = sequence[pickedUnits.length];
    if (id === order) {
      pickedUnits.push(id);
      if (pickedUnits.length === 4) {
        pickedUnits = [];
        secretUnlock("FOUR BELLS FOUND · Secret level complete");
      }
    } else {
      pickedUnits = id === "days" ? ["days"] : [];
    }
    var value = unit.querySelector(".number").textContent;
    toast(value + " " + id + " left · Tap tiles in order to find a secret.");
  }

  function onClick(event) {
    var theme = event.target.closest("[data-theme-choice]");
    if (theme) { applyTheme(theme.dataset.themeChoice); toast(theme.textContent.trim() + " theme applied"); return; }
    var checkpoint = event.target.closest("[data-checkpoint]");
    if (checkpoint) {
      var threshold = {day:86400000,hour:3600000,ten:600000,minute:60000,bell:0}[checkpoint.dataset.checkpoint];
      var title = checkpoint.querySelector("strong")?.textContent || "Milestone";
      var remaining = target - Date.now();
      var detail = remaining <= threshold ? "UNLOCKED · " : (checkpoint.classList.contains("is-next") ? "NEXT UP · " : "LOCKED · ");
      var messages = {
        day: "The final 24-hour stretch begins.",
        hour: "One hour until the last bell.",
        ten: "Ten minutes until freedom.",
        minute: "One minute left. Here we go.",
        bell: "Thursday 3 December · 3:15 PM · School's out."
      };
      toast(detail + title + " · " + messages[checkpoint.dataset.checkpoint]);
      if (soundOn && remaining <= threshold) bellSound();
      return;
    }
    var actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    var action = actionButton.dataset.action;
    if (action === "panel") { openPanel(); return; }
    if (action === "close-panel") { closePanel(); return; }
    if (action === "share") { shareCountdown(); return; }
    if (action === "focus") { toggleFocus(); return; }
    if (action === "fullscreen") { toggleFullscreen(); return; }
    if (action === "copy-time") { copyText("Time until school finishes: " + formatRemaining(remainingMs()) + ". Thursday 3 December 2026, 3:15 pm Sydney time."); return; }
    if (action === "calendar") { downloadCalendar(); return; }
    if (action === "preview") { closePanel(); previewCelebration(); return; }
    if (action === "boost" || action === "surprise") { newBoost(); if (action === "surprise") launchConfetti(35); return; }
    if (action === "bell-game") { closePanel(); startBellGame(); return; }
    if (action === "close-game") { closeBellGame(); return; }
    if (action === "restart-game") { gameScore = 0; updateGameScore(); moveBell(); return; }
  }

  function onKeydown(event) {
    var tag = event.target && event.target.tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (event.target && event.target.isContentEditable);
    if (event.key === "Escape") { closePanel(); closeBellGame(); return; }
    if (typing) return;
    if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey) { toggleFocus(); return; }
    if (event.key.toLowerCase() === "t" && !event.ctrlKey && !event.metaKey) {
      var themes = ["midnight", "aurora", "sunset", "mono", "retro"];
      var active = storage.get("theme", "midnight");
      applyTheme(themes[(themes.indexOf(active) + 1) % themes.length]);
      toast("Theme changed · " + storage.get("theme", "midnight"));
      return;
    }
    if (event.key === "?") { openPanel(); toast("Explore the control room for shortcuts and secrets"); return; }

    var code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    konamiBuffer = konamiBuffer + "|" + event.key;
    if (konamiBuffer.length > 100) konamiBuffer = konamiBuffer.slice(-100);
    var entered = konamiBuffer.split("|").filter(Boolean);
    if (entered.slice(-code.length).join("|").toLowerCase() === code.join("|").toLowerCase()) {
      konamiBuffer = "";
      secretUnlock("KONAMI CODE ACCEPTED · Retro mode unlocked");
    }

    if (event.key.length === 1 && /[a-z']/i.test(event.key)) {
      secretWord(event.key.toLowerCase());
    }
  }

  function secretWord(letter) {
    secretWordBuffer = (secretWordBuffer + letter).slice(-4);
    window.clearTimeout(secretTimer);
    secretTimer = window.setTimeout(function () { secretWordBuffer = ""; }, 1800);
    if (secretWordBuffer === "bell") {
      secretWordBuffer = "";
      previewCelebration();
    }
  }

  function onLogoClick(event) {
    if (!event.target.closest(".brand-mark")) return;
    logoClicks += 1;
    window.clearTimeout(logoTimer);
    logoTimer = window.setTimeout(function () { logoClicks = 0; }, 2800);
    if (logoClicks >= 7) {
      logoClicks = 0;
      secretUnlock("PRINCIPAL'S OFFICE FOUND · You are now in charge");
      startBellGame();
    }
  }

  function initialize() {
    createInterface();
    newBoost();
    document.addEventListener("click", onClick);
    document.addEventListener("click", onLogoClick);
    document.addEventListener("click", clickTimerUnit);
    document.addEventListener("keydown", onKeydown);

    var sound = $("#sound-toggle");
    if (sound) sound.addEventListener("change", function () {
      soundOn = sound.checked;
      storage.set("sound", String(soundOn));
      if (soundOn) { bellSound(); toast("Sound effects enabled"); }
      else toast("Sound effects muted");
    });
    var motion = $("#motion-toggle");
    if (motion) motion.addEventListener("change", function () {
      document.body.classList.toggle("no-extra-motion", !motion.checked);
      storage.set("motion", String(motion.checked));
      toast(motion.checked ? "Motion effects enabled" : "Motion effects reduced");
    });
    var digital = $("#digital-toggle");
    if (digital) digital.addEventListener("change", function () {
      document.body.classList.toggle("digital-display", digital.checked);
      storage.set("digital", String(digital.checked));
      toast(digital.checked ? "Digital display enabled" : "Classic display restored");
    });
    var name = $("#name-input");
    if (name) name.addEventListener("input", function () { applyName(name.value); });
    var timerNumbers = $(".number");
    timerNumbers.forEach(function (node) {
      var previous = node.textContent;
      var observer = new MutationObserver(function () {
        if (node.textContent !== previous) {
          previous = node.textContent;
          if (!reduced && !document.body.classList.contains("no-extra-motion")) {
            node.classList.remove("digit-changed");
            void node.offsetWidth;
            node.classList.add("digit-changed");
          }
        }
      });
      observer.observe(node, {childList:true,characterData:true,subtree:true});
    });
    var bell = $("#bell-target");
    if (bell) bell.addEventListener("click", catchBell);
    $(".unit").forEach(function (unit) {
      var number = unit.querySelector(".number");
      var label = unit.querySelector(".unit-label");
      unit.setAttribute("role","button");
      unit.setAttribute("tabindex","0");
      unit.setAttribute("aria-label","Copy " + (label ? label.textContent : "countdown") + " remaining");
      unit.addEventListener("keydown",function(event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          unit.dispatchEvent(new MouseEvent("click",{bubbles:true}));
        }
      });
    });
    var timer = $(".timer");
    if (timer) timer.addEventListener("click", function (event) {
      if (event.target.closest(".unit")) return;
      var ms = remainingMs();
      copyText(formatRemaining(ms) + " remaining");
    });
    var footer = $("footer");
    if (footer) footer.addEventListener("dblclick", function () {
      secretUnlock("SECRET STRETCH · You found the hidden shortcut");
    });
    document.addEventListener("click", function (event) {
      var panel = $("#feature-panel");
      var action = event.target.closest(".extra-actions");
      if (panel && panel.classList.contains("open") && !panel.contains(event.target) && !action) closePanel();
    });
    document.addEventListener("pointerdown", function (event) {
      if (event.target.closest(".timer,.extra-card,.extra-action,.extra-btn,.checkpoint,.bell-target")) {
        sparkleBurst(event.clientX,event.clientY);
      }
    }, {passive:true});

    var glow = document.createElement("div");
    glow.className = "cursor-glow";
    glow.setAttribute("aria-hidden", "true");
    document.body.appendChild(glow);
    if (!reduced && window.matchMedia && window.matchMedia("(pointer:fine)").matches) {
      var pointerFrame = 0;
      document.addEventListener("pointermove", function (event) {
        if (pointerFrame) return;
        pointerFrame = window.requestAnimationFrame(function () {
          pointerFrame = 0;
          glow.style.transform = "translate3d(" + event.clientX + "px," + event.clientY + "px,0) translate(-50%,-50%)";
        });
      }, {passive:true});
    }
    var previousSecond = null;
    var finishSounded = false;
    window.setInterval(function () {
      var left = target - Date.now();
      if (left <= 0 && !finishSounded) {
        finishSounded = true;
        if (soundOn) bellSound();
      } else if (left > 0 && left <= 10000 && soundOn) {
        var count = Math.ceil(left / 1000);
        if (count !== previousSecond) {
          previousSecond = count;
          var ctx = getAudio();
          if (ctx) tone(460 + count * 42, ctx.currentTime, .12, .045, "triangle");
        }
      }
    }, 200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
