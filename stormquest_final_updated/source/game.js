
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let W = canvas.width;
let H = canvas.height;

let currentLevel = 1;
let score = 0;
let totalScore = 0;
let lives = 3;

let gameRunning = false;
let animationId = null;
let worldTime = 0;
let lastTime = 0;

let objects = [];
let particles = [];
let clouds = [];

let failedRun = false;
let warningTimer = 0;
let warningCooldown = 0;
let spawnTimer = 0;
let collisionLocked = false;
let levelElapsed = 0;
let lessonIndex = 0;
let lessonOpen = false;


/* ===== SOUND (synthesised in the browser, no audio files) ===== */
let audioCtx = null, ambientGain = null, soundMuted = false;
try { soundMuted = localStorage.getItem("stormQuestMuted") === "1"; } catch (e) {}
function initAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      // Soft looping wind: filtered noise
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource(); src.buffer = buf; src.loop = true;
      const filter = audioCtx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 500;
      ambientGain = audioCtx.createGain(); ambientGain.gain.value = 0;
      src.connect(filter); filter.connect(ambientGain); ambientGain.connect(audioCtx.destination); src.start();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {}
}
function tone(freq, start, dur, type, vol, slideTo) {
  if (!audioCtx || soundMuted) return;
  const t = audioCtx.currentTime + start;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noiseBurst(start, dur, vol, cutoff) {
  if (!audioCtx || soundMuted) return;
  const t = audioCtx.currentTime + start;
  const buf = audioCtx.createBuffer(1, Math.max(1, audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff || 800;
  const g = audioCtx.createGain(); g.gain.value = vol || 0.3;
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start(t);
}
const sfx = {
  hit() { noiseBurst(0, 0.5, 0.5, 1200); tone(160, 0, 0.4, "sawtooth", 0.18, 40); },
  thunder() { noiseBurst(0.35, 1.6, 0.55, 300); },
  correct() { tone(660, 0, 0.14, "triangle", 0.18); tone(990, 0.12, 0.25, "triangle", 0.18); },
  wrong() { tone(220, 0, 0.3, "square", 0.1, 140); },
  beep() { tone(520, 0, 0.12, "sine", 0.18); },
  go() { tone(780, 0, 0.35, "triangle", 0.2); tone(1170, 0.1, 0.35, "triangle", 0.15); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3, "triangle", 0.18)); },
  card() { tone(440, 0, 0.12, "sine", 0.12, 660); }
};
setInterval(() => {
  if (!ambientGain || !audioCtx) return;
  const on = gameRunning && !soundMuted;
  ambientGain.gain.setTargetAtTime(on ? (currentLevel === 2 ? 0.1 : 0.05) : 0, audioCtx.currentTime, 0.3);
}, 300);
function toggleSound() {
  soundMuted = !soundMuted;
  try { localStorage.setItem("stormQuestMuted", soundMuted ? "1" : "0"); } catch (e) {}
  initAudio(); updateSoundButton();
}
function updateSoundButton() {
  const b = document.getElementById("soundButton");
  if (b) { b.textContent = soundMuted ? "🔇" : "🔊"; b.setAttribute("aria-label", soundMuted ? "Unmute sound" : "Mute sound"); }
}
document.addEventListener("pointerdown", initAudio, { once: true });
document.addEventListener("keydown", initAudio, { once: true });

/* ===== HIT EFFECTS ===== */
let pendingHazard = null; // { key, final, t } — slow-motion before the info card
function hitEffects() {
  const wrap = document.getElementById("canvasWrap");
  if (wrap) { wrap.classList.remove("shake"); void wrap.offsetWidth; wrap.classList.add("shake"); setTimeout(() => wrap.classList.remove("shake"), 450); }
  const flash = document.getElementById("hitFlash");
  if (flash) { flash.classList.remove("show"); void flash.offsetWidth; flash.classList.add("show"); }
  sfx.hit();
  if (navigator.vibrate) { try { navigator.vibrate(120); } catch (e) {} }
}

/* ===== COUNTDOWN + PAUSE ===== */
let startToken = 0, countdownActive = false, paused = false;
function runCountdown(token, done) {
  countdownActive = true;
  const el = document.getElementById("countdown");
  const steps = ["3", "2", "1", "FLY!"];
  let i = 0;
  const tick = () => {
    if (token !== startToken) { countdownActive = false; if (el) el.classList.remove("show"); return; }
    if (i >= steps.length) { countdownActive = false; if (el) el.classList.remove("show"); done(); return; }
    if (el) { el.textContent = steps[i]; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
    steps[i] === "FLY!" ? sfx.go() : sfx.beep();
    i++; setTimeout(tick, i === steps.length ? 600 : 750);
  };
  tick();
}
function pauseGame() {
  if (!gameRunning || lessonOpen || countdownActive || pendingHazard) return;
  gameRunning = false; paused = true;
  if (animationId) cancelAnimationFrame(animationId);
  const p = document.getElementById("pauseOverlay"); if (p) p.classList.add("show");
}
function resumeGame() {
  const p = document.getElementById("pauseOverlay"); if (p) p.classList.remove("show");
  if (!paused) return; paused = false;
  if (document.getElementById("gameScreen")?.classList.contains("active")) {
    gameRunning = true; lastTime = performance.now(); animationId = requestAnimationFrame(gameLoop);
  }
}
function togglePause() { paused ? resumeGame() : pauseGame(); }
document.addEventListener("keydown", e => {
  if (e.key === "p" || e.key === "P" || e.key === "Escape") { if (gameRunning || paused) { e.preventDefault(); togglePause(); } }
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });

const levelOneLessons = [
  {
    title: "PRESSURE: FORCE OVER AREA",
    tag: "FLIGHT SCHOOL 01 · AIR PRESSURE",
    icon: "📌",
    visual: "pressure",
    body: "Pressure tells us how much force acts on a certain area. The same force creates greater pressure when it acts on a smaller area.",
    takeaway: "A sharp nail enters wood more easily than a blunt nail because its tiny tip produces greater pressure.",
    question: "If the same force acts on a smaller area, what happens to pressure?",
    answer: "It increases!"
  },
  {
    title: "HIGH PRESSURE & LOW PRESSURE",
    tag: "FLIGHT SCHOOL 02 · MOVING AIR",
    icon: "🌬️",
    visual: "pressure-zones",
    body: "Air moves from a region of higher pressure towards a region of lower pressure. This movement of air is called wind.",
    takeaway: "Near the surface, air spreads out from a high-pressure region. Near a low-pressure region, air flows inward and rises.",
    question: "Which way does air move?",
    answer: "From high pressure towards low pressure."
  },
  {
    title: "SEA BREEZE: THE DAYTIME WIND",
    tag: "FLIGHT SCHOOL 03 · COASTAL WINDS",
    icon: "🌊",
    visual: "sea-breeze",
    body: "During the day, land heats up faster than the sea. Warm air above the land rises, and cooler air from the sea moves towards the land.",
    takeaway: "Sea breeze = wind from sea to land. The arrows in the scene show the cooler sea air moving inland.",
    question: "During the day, does the sea breeze blow towards land or towards the sea?",
    answer: "Towards the land."
  },
  {
    title: "LAND BREEZE: THE NIGHTTIME WIND",
    tag: "FLIGHT SCHOOL 04 · COASTAL WINDS",
    icon: "🌙",
    visual: "land-breeze",
    body: "At night, land cools faster than the sea. The sea stays relatively warmer, so air above it rises. Cooler air moves from the land towards the sea.",
    takeaway: "Land breeze = wind from land to sea. It is the opposite direction to a daytime sea breeze.",
    question: "At night, which way does the land breeze blow?",
    answer: "From land towards the sea."
  },
  {
    title: "PRESSURE IN LIQUIDS", tag: "FLIGHT SCHOOL 05 · LIQUID PRESSURE", icon: "💧", visual: "pressure",
    body: "Water exerts pressure in all directions. The deeper you go in a liquid, the greater the pressure because more liquid is above you.",
    takeaway: "A water tank is often placed high so water pressure can help it flow through pipes.",
    question: "Does liquid pressure increase or decrease with depth?", answer: "It increases with depth."
  },
  {
    title: "THE AIR AROUND US", tag: "FLIGHT SCHOOL 06 · ATMOSPHERIC PRESSURE", icon: "🌍", visual: "pressure-zones",
    body: "Earth is surrounded by a blanket of air called the atmosphere. Air has weight and exerts pressure in all directions. The pressure inside our bodies balances the outside air pressure.",
    takeaway: "Atmospheric pressure is the pressure exerted by the air around us.",
    question: "What is the blanket of air around Earth called?", answer: "The atmosphere."
  },
  {
    title: "WIND AND ROOFS", tag: "FLIGHT SCHOOL 07 · WIND PRESSURE", icon: "🏠", visual: "pressure-zones",
    body: "Very fast wind can create lower pressure above a roof. The pressure inside a building may then be greater, pushing the roof upward. Weak roofs can be damaged.",
    takeaway: "Strong winds can damage buildings. During severe weather, follow official local safety instructions and warnings.",
    question: "Can fast wind create lower pressure above a roof?", answer: "Yes, it can."
  }
];

const levelTwoLessons = [
  { title: "HOW A THUNDERSTORM FORMS", tag: "FLIGHT SCHOOL 08 · STORM FORMATION", icon: "⛈️", visual: "storm", body: "Warm, moist air rises. As it rises, it cools and water vapour condenses into tiny droplets, forming tall storm clouds. Thunderstorms can bring heavy rain, lightning and strong winds.", takeaway: "Rising warm, moist air helps build a thunderstorm.", question: "What happens to warm, moist air as it rises?", answer: "It cools, and water vapour condenses into cloud droplets." },
  { title: "LIGHTNING AND THUNDER", tag: "FLIGHT SCHOOL 09 · ELECTRICITY IN CLOUDS", icon: "⚡", visual: "lightning", body: "Collisions between ice particles and water droplets inside storm clouds can separate electric charges. A sudden electrical discharge is lightning. Lightning heats nearby air very rapidly, making it expand and produce the sound we hear as thunder.", takeaway: "We see lightning before hearing thunder because light travels much faster than sound.", question: "What causes thunder?", answer: "Rapid heating and expansion of air around a lightning discharge." },
  { title: "LIGHTNING CONDUCTORS", tag: "FLIGHT SCHOOL 10 · PROTECTION", icon: "🏢", visual: "lightning", body: "A lightning conductor is a metal rod fixed at a high point of a building and connected to the ground by a thick metal strip. It provides a safe path for electric charge to reach the ground.", takeaway: "Lightning conductors help protect buildings. They do not make it safe to stand outside during lightning.", question: "What does a lightning conductor provide?", answer: "A conducting path to the ground." },
  { title: "HOW CYCLONES FORM", tag: "FLIGHT SCHOOL 11 · CYCLONE SCIENCE", icon: "🌪️", visual: "cyclone", body: "Over warm ocean water, warm moist air rises and creates a low-pressure area. Surrounding air moves inward. Earth's rotation helps the system spin. Condensation releases heat, helping the air rise and the storm intensify.", takeaway: "Cyclones are large rotating weather systems that form over warm ocean waters.", question: "Where do tropical cyclones usually get the energy and moisture they need?", answer: "From warm ocean water." },
  { title: "THE EYE OF A CYCLONE", tag: "FLIGHT SCHOOL 12 · INSIDE THE STORM", icon: "🌀", visual: "cyclone", body: "The eye is the relatively calm centre of a mature cyclone. Around it is the eyewall, where the strongest winds and heaviest rain are usually found. Calm conditions in the eye do not mean the cyclone is over.", takeaway: "Never go outside during the eye. Dangerous winds can return quickly as the other side of the eyewall passes.", question: "Where are the strongest winds usually found?", answer: "In the eyewall surrounding the eye." },
  { title: "CYCLONE TRACKING AND SAFETY", tag: "FLIGHT SCHOOL 13 · BE WEATHER READY", icon: "📡", visual: "emergency", body: "Weather satellites and radar help meteorologists monitor storms and issue warnings. During a cyclone, follow official alerts and evacuation instructions. Prepare water, food, medicines, a torch, a battery radio and a first-aid kit.", takeaway: "Go to a designated shelter when authorities advise. Stay away from floodwater and fallen power lines.", question: "Whose instructions should you follow during a cyclone warning?", answer: "Official weather and disaster-management authorities." },
  { title: "WHAT STORMS CAN DO", tag: "FLIGHT SCHOOL 14 · IMPACTS", icon: "🌧️", visual: "safety", body: "Cyclones can bring destructive winds, very heavy rain, storm surges and flooding. They may damage homes, roads, power lines, communication systems and crops.", takeaway: "Early warnings, strong shelters, evacuation plans and emergency supplies reduce risk.", question: "Name one possible danger caused by a cyclone.", answer: "Strong winds, heavy rain, flooding or storm surge." }
];


// Information shown when a weather hazard hits the aircraft
const hazardInfo = {
  high: {
    icon: "🔷", tag: "WEATHER HIT · HIGH PRESSURE",
    title: "HIGH-PRESSURE AREA",
    body: "You flew into a high-pressure region. Air here is pressed together more strongly, so near the surface it spreads outwards towards regions of lower pressure. This moving air is wind.",
    takeaway: "The greater the difference in pressure between two regions, the faster the wind blows."
  },
  low: {
    icon: "🔶", tag: "WEATHER HIT · LOW PRESSURE",
    title: "LOW-PRESSURE AREA",
    body: "You flew into a low-pressure region. Air from surrounding higher-pressure areas flows inward towards it and then rises. Rising air cools and can form clouds and rain.",
    takeaway: "A very deep low-pressure area can grow into a storm or a cyclone."
  },
  cloud: {
    icon: "⛈️", tag: "WEATHER HIT · THUNDERSTORM",
    title: "THUNDERSTORM CLOUD",
    body: "You flew into a thunderstorm cloud. Warm, moist air rises, cools and condenses into tall dark clouds. Inside, charges separate and cause lightning, which heats the air and makes thunder. Thunderstorms bring heavy rain and strong winds.",
    takeaway: "Lightning is seen before thunder is heard because light travels faster than sound."
  },
  cyclone: {
    icon: "🌪️", tag: "WEATHER HIT · CYCLONE",
    title: "TROPICAL CYCLONE",
    body: "You flew into a cyclone. It forms over warm ocean water around a very low-pressure centre. Winds spiral inwards and rotate because of Earth's rotation. The calm centre is the eye; the strongest winds and heaviest rain are in the eyewall around it. In other regions the same system is called a hurricane or a typhoon.",
    takeaway: "Cyclones bring destructive winds, heavy rain and storm surges. Always follow official warnings and move to a shelter when advised."
  }
};
const hazardFacts = {
  1: [
    "A high-pressure area pushes air outwards, and a low-pressure area draws air inwards so that it rises. Air flows from high to low pressure, and the bigger the pressure difference, the faster the wind.",
  ],
  2: [
    "A thunderstorm cloud forms from rising warm, moist air. It brings lightning, thunder, heavy rain and strong winds.",
    "A cyclone forms around a very low-pressure centre over warm ocean water. In other parts of the world it is called a hurricane or typhoon. The eye is calm, but the eyewall around it has the strongest winds and heaviest rain."
  ]
};
let hazardsHit = new Set();

const levelQuizzes = {
  1: [
    { q: "What is pressure?", options: ["Force on each unit of area", "Area added to force", "The speed of air", "The weight of water only"], a: 0, why: "Pressure is force per unit area." },
    { q: "During the day, a sea breeze usually blows…", options: ["From sea to land", "From land to sea", "Only upwards", "From north to south"], a: 0, why: "Land heats faster, warm air rises over land, and cooler air moves in from the sea." },
    { q: "At night, a land breeze usually blows…", options: ["From sea to land", "From land to sea", "Only towards the sky", "There is no breeze"], a: 1, why: "Land cools faster, so air moves from land towards the sea." },
    { q: "What does air near the surface do in a HIGH-pressure area?", options: ["Spreads outwards", "Flows inward and rises", "Stops moving", "Turns into water"], a: 0, why: "Near the surface, air spreads out from a high-pressure region towards lower pressure." },
    { q: "What happens to air that flows into a LOW-pressure area?", options: ["It sinks into the ground", "It flows inward and rises", "It freezes", "It disappears"], a: 1, why: "Air flows inward towards a low-pressure area and rises, which can form clouds and rain." },
    { q: "Why can very fast wind lift a weak roof?", options: ["It creates lower pressure above the roof than inside", "It makes the roof heavier", "It cools the building", "It removes all air inside"], a: 0, why: "Fast wind lowers pressure above the roof; higher pressure inside can push the roof upward." }
  ],
  2: [
    { q: "What causes thunder?", options: ["Rapid heating and expansion of air", "Rain cooling the sea", "Clouds turning dark", "The wind stopping"], a: 0, why: "Lightning heats nearby air rapidly. The air expands and produces thunder." },
    { q: "Where do tropical cyclones form?", options: ["Over warm ocean water", "Over deserts only", "On snowy mountains", "Inside buildings"], a: 0, why: "Tropical cyclones form over warm ocean water." },
    { q: "What should we do when officials advise cyclone evacuation?", options: ["Go to the beach", "Move to a designated shelter", "Stand under a tree", "Stay near windows"], a: 1, why: "Follow official alerts and move to a designated shelter when advised." },
    { q: "How does a thunderstorm cloud form?", options: ["Cold dry air sinks", "Warm, moist air rises, cools and condenses", "Wind stops blowing", "Snow melts on mountains"], a: 1, why: "Rising warm, moist air cools and condenses into tall storm clouds." },
    { q: "What kind of pressure is found at the centre of a cyclone?", options: ["Very low pressure", "Very high pressure", "No air at all", "Pressure that never changes"], a: 0, why: "A cyclone forms around a very low-pressure centre." },
    { q: "Where are the strongest winds and heaviest rain of a cyclone found?", options: ["In the calm eye", "In the eyewall around the eye", "Far away from the storm", "Only over land"], a: 1, why: "The eyewall around the eye has the strongest winds and heaviest rain." }
  ]
};

// Level 2 thunderstorm and lightning state
let lightningTimer = 2;
let lightningFlash = 0;
let lightningX = 0;
let lightningSegments = [];

const bird = {
  x: 125,
  y: 250,
  velocity: 0,
  wobble: 0,
  bob: 0,
  forward: 0,
  tilt: 0,
  radius: 30
};

const levelData = {
  1: {
    title: "SKY OF SECRETS",
    subtitle: "PRESSURE & WINDS",
    facts: [
      "Pressure is the force acting on each unit of area. The same force on a smaller area creates greater pressure.",
      "Wind is moving air. Air generally moves from a region of higher pressure towards a region of lower pressure.",
      "During the day, land heats up faster than the sea. Warm air above land rises, and cooler air moves from sea to land. This is a sea breeze.",
      "At night, land cools faster than the sea. Air moves from land towards the sea. This is a land breeze.",
      "Water exerts pressure in all directions. Liquid pressure increases with depth.",
      "The atmosphere is the blanket of air around Earth. Air has weight and exerts pressure in all directions.",
      "Very fast wind can create lower pressure above a roof. Pressure inside a building may push the roof upward.",
      ...hazardFacts[1]
    ]
  },
  2: {
    title: "EYE OF THE STORM",
    subtitle: "STORMS & CYCLONES",
    facts: [
      "A thunderstorm forms when warm, moist air rises, cools and condenses into tall clouds. It can bring heavy rain, lightning and strong winds.",
      "Lightning is a sudden electrical discharge. Collisions between ice particles and water droplets in storm clouds can separate electric charges.",
      "Lightning heats nearby air very quickly. The air expands and produces the sound called thunder. We see lightning before hearing thunder because light travels faster than sound.",
      "A lightning conductor is a metal path connected to the ground. It helps protect a building by giving electric charge a path to the ground.",
      "Tropical cyclones form over warm ocean water. Warm, moist air rises and surrounding air moves inward. Earth's rotation helps the system spin.",
      "The eye is the relatively calm centre of a cyclone. The strongest winds are around the eyewall.",
      "Weather satellites and radar help meteorologists track storms and issue warnings.",
      "During a cyclone, follow official weather alerts. Move to a designated shelter when advised and keep an emergency kit with water, a torch, a battery radio and a first-aid kit.",
      ...hazardFacts[2]
    ]
  }
};

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  if (rect.width && rect.height) {
    W = canvas.width = rect.width;
    H = canvas.height = rect.height;
  }
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const target = document.getElementById(id);

  if (target) {
    target.classList.add("active");
  }

  if (id !== "gameScreen") {
    startToken++; paused = false; pendingHazard = null;
    gameRunning = false;

    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  }
}

function updateHUD() {
  const scoreElement = document.getElementById("score");
  const livesElement = document.getElementById("lives");
  const titleElement = document.getElementById("levelTitle");
  const subtitleElement = document.getElementById("levelSubtitle");

  if (scoreElement) scoreElement.textContent = score;
  if (livesElement) livesElement.textContent = "❤️".repeat(lives);

  if (titleElement) {
    titleElement.textContent = levelData[currentLevel].title;
  }

  if (subtitleElement) {
    subtitleElement.textContent = levelData[currentLevel].subtitle;
  }
}

function createClouds() {
  clouds = [];

  for (let i = 0; i < 9; i++) {
    clouds.push({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 25 + Math.random() * 40,
      speed: 12 + Math.random() * 22,
      phase: Math.random() * Math.PI * 2
    });
  }
}

function startLevel(level) {
  currentLevel = level;
  score = 0;
  lives = 3;

  objects = [];
  particles = [];

  worldTime = 0;
  spawnTimer = 0;
  warningTimer = 0;
  warningCooldown = 0;
  collisionLocked = false;
  failedRun = false;
  levelElapsed = 0;
  lessonIndex = 0;
  lessonOpen = false;
  hideLearningStop();
  hideHazardInfo();
  hazardsHit = new Set();

  // Reset Level 2 thunderstorm effects
  lightningTimer = 1.5 + Math.random() * 2;
  lightningFlash = 0;
  lightningSegments = [];

  bird.y = H / 2;
  bird.velocity = 0;
  bird.tilt = 0;

  createClouds();
  updateHUD();

  showScreen("gameScreen");
  initAudio(); updateSoundButton();
  pendingHazard = null; paused = false;
  const pauseEl = document.getElementById("pauseOverlay"); if (pauseEl) pauseEl.classList.remove("show");

  gameRunning = false;
  const token = ++startToken;
  resizeCanvas();
  drawGame();
  runCountdown(token, () => {
    if (token !== startToken || !document.getElementById("gameScreen")?.classList.contains("active")) return;
    gameRunning = true;
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
  });
}

function restartAdventure() {
  totalScore = 0;
  failedRun = false;
  startLevel(1);
}

function ensureLearningUI() {
  if (document.getElementById("learningStop")) return;
  const panel = document.createElement("div");
  panel.id = "learningStop"; panel.className = "learning-stop";
  panel.innerHTML = `<article class="learning-card"><div class="lesson-topline"><span id="lessonTag"></span><span id="lessonProgress" class="lesson-badge"></span></div><div class="lesson-heading"><div id="lessonIcon" class="lesson-icon"></div><div><h2 id="lessonTitle"></h2></div></div><div id="lessonVisual" class="lesson-visual"></div><p id="lessonBody" class="lesson-body"></p><div class="lesson-takeaway"><strong>REMEMBER</strong><span id="lessonTakeaway"></span></div><div class="lesson-check"><strong>QUICK THINK</strong><span id="lessonQuestion"></span><b id="lessonAnswer"></b></div><button class="lesson-resume" onclick="resumeLearningStop()">GOT IT! RESUME FLIGHT</button></article>`;
  document.getElementById("canvasWrap").appendChild(panel);
}

function showLearningStop(lesson) {
  ensureLearningUI();
  const panel = document.getElementById("learningStop");
  if (!panel || !lesson) return;
  lessonOpen = true; gameRunning = false;
  document.getElementById("lessonTag").textContent = lesson.tag;
  document.getElementById("lessonTitle").textContent = lesson.title;
  document.getElementById("lessonIcon").textContent = lesson.icon;
  document.getElementById("lessonBody").textContent = lesson.body;
  document.getElementById("lessonTakeaway").textContent = lesson.takeaway;
  document.getElementById("lessonQuestion").textContent = lesson.question;
  document.getElementById("lessonAnswer").textContent = lesson.answer;
  const list = currentLevel === 1 ? levelOneLessons : levelTwoLessons;
  document.getElementById("lessonProgress").textContent = `LEARNING STOP ${lessonIndex} OF ${list.length}`;
  const visual = document.getElementById("lessonVisual");
  visual.className = `lesson-visual ${lesson.visual || "pressure"}`;
  visual.innerHTML = getLessonVisual(lesson.visual || "pressure");
  if (lesson.visual === "emergency") {
    visual.classList.add("emergency-visual");
    const selected = new Set();
    visual.querySelectorAll("[data-kit]").forEach(button => button.addEventListener("click", () => {
      const item = button.dataset.kit;
      if (selected.has(item)) { selected.delete(item); button.classList.remove("selected"); }
      else if (selected.size < 4) { selected.add(item); button.classList.add("selected"); }
      const feedback = visual.querySelector("#kitFeedback");
      if (feedback) feedback.textContent = `${selected.size} of 4 selected`;
    }));
    const check = document.createElement("button"); check.className = "kit-check"; check.textContent = "CHECK MY EMERGENCY KIT";
    check.addEventListener("click", () => {
      const needed = ["Water", "Torch", "Battery radio", "First-aid kit"];
      const good = needed.every(item => selected.has(item)) && selected.size === 4;
      const feedback = visual.querySelector("#kitFeedback");
      if (feedback) feedback.textContent = good ? "✓ Excellent! These are useful emergency supplies." : "Try again. Choose water, a torch, a battery radio and a first-aid kit.";
    });
    visual.appendChild(check);
  }
  panel.classList.add("show");
}

function getLessonVisual(type) {
  if (type === "storm") return `<div class="science-visual storm-visual"><span>☀️ Warm moist air ↑</span><span>☁️ Cooling + condensation</span><strong>⛈️ THUNDERCLOUD</strong></div>`;
  if (type === "lightning") return `<div class="science-visual lightning-visual"><span>☁️ +  −</span><strong>⚡ LIGHTNING</strong><small>Rapidly heated air expands → THUNDER</small></div>`;
  if (type === "cyclone") return `<div class="science-visual cyclone-visual"><strong>🌀 EYE</strong><span>↻ rotating winds ↺</span><small>Strongest winds around the eye</small></div>`;
  if (type === "safety") return `<div class="science-visual safety-visual"><span>📡 Weather warning</span><strong>🏠 SAFE SHELTER</strong><small>Water · torch · radio · first aid</small></div>`;
  if (type === "emergency") return `<div class="science-visual safety-visual"><strong>🎒 BUILD AN EMERGENCY KIT</strong><small>Choose the four useful supplies below.</small><div class="kit-options"><button data-kit="Water">💧 Water</button><button data-kit="Torch">🔦 Torch</button><button data-kit="Battery radio">📻 Battery radio</button><button data-kit="First-aid kit">🩹 First-aid kit</button><button data-kit="Game console">🎮 Game console</button><button data-kit="Glass vase">🏺 Glass vase</button></div><p id="kitFeedback"></p></div>`;
  if (type === "pressure") return `
    <div class="pressure-demo"><div class="demo-block">SAME FORCE ↓</div><div class="nail-row"><div><span class="nail blunt"></span><small>BLUNT TIP<br>MORE AREA</small></div><div><span class="nail sharp"></span><small>SHARP TIP<br>LESS AREA</small></div></div><div class="demo-caption">Smaller area = greater pressure</div></div>`;
  if (type === "pressure-zones") return `
    <div class="zone-demo"><div class="zone high-zone"><b>HIGH</b><span>↙ ↓ ↘</span><small>Air spreads out</small></div><div class="zone low-zone"><b>LOW</b><span>↗ ↑ ↖</span><small>Air rises</small></div><div class="zone-arrow">WIND →</div></div>`;
  if (type === "sea-breeze") return `
    <div class="coast-demo day"><div class="sun">☀️</div><div class="coast-land"><b>LAND</b><span>Warm air rises ↑</span></div><div class="coast-sea"><b>SEA</b><span>Cool air →</span></div><div class="coast-flow">SEA BREEZE →</div></div>`;
  return `
    <div class="coast-demo night"><div class="moon">🌙</div><div class="coast-land"><b>LAND</b><span>Cool air →</span></div><div class="coast-sea"><b>SEA</b><span>Warm air rises ↑</span></div><div class="coast-flow">LAND BREEZE →</div></div>`;
}

function resumeLearningStop() {
  const panel = document.getElementById("learningStop");
  if (panel) panel.classList.remove("show");
  lessonOpen = false;
  if (!gameRunning && document.getElementById("gameScreen")?.classList.contains("active")) {
    gameRunning = true;
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
  }
}

function hideLearningStop() {
  const panel = document.getElementById("learningStop");
  if (panel) panel.classList.remove("show");
}

function updateLearningStops(dt) {
  const list = currentLevel === 1 ? levelOneLessons : levelTwoLessons;
  if (lessonOpen || lessonIndex >= list.length) return;
  levelElapsed += dt;
  const lessonTimes = currentLevel === 1 ? [7, 17, 27, 37, 47, 57, 67] : [7, 17, 27, 37, 47, 57, 67];
  if (levelElapsed >= lessonTimes[lessonIndex]) {
    const lesson = list[lessonIndex];
    lessonIndex++;
    showLearningStop(lesson);
  }
}

function updateBird(dt) {
  bird.velocity += 650 * dt;
  bird.y += bird.velocity * dt;

  bird.wobble = Math.sin(worldTime * 9) * 0.09;
  bird.bob = Math.sin(worldTime * 5) * 5;
  bird.forward = Math.sin(worldTime * 4) * 7;

  bird.tilt = Math.max(
    -0.45,
    Math.min(0.45, bird.velocity / 1100)
  );

  bird.y += bird.bob * dt * 2;

  if (bird.y < 28) {
    bird.y = 28;
    bird.velocity = 0;
  }

  if (bird.y > H - 28) {
    bird.y = H - 28;
    bird.velocity = 0;
  }
}

document.addEventListener("keydown", e => {
  if (!gameRunning) return;

  if (e.key === "ArrowUp") {
    e.preventDefault();
    bird.velocity = -340;
  }

  if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") {
    e.preventDefault();
    bird.velocity = 340;
  }
  if (e.key.toLowerCase() === "w") {
    e.preventDefault();
    bird.velocity = -340;
  }
});

let flightControl = 0;
function holdFlight(direction) { flightControl = direction; if (gameRunning) bird.velocity = direction * 340; }
function releaseFlight() { flightControl = 0; }
const flightCanvas = document.getElementById("gameCanvas");
if (flightCanvas) {
  flightCanvas.addEventListener("pointerdown", (event) => {
    if (!gameRunning) return;
    const rect = flightCanvas.getBoundingClientRect();
    const direction = (event.clientY - rect.top) < rect.height / 2 ? -1 : 1;
    holdFlight(direction);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(type => flightCanvas.addEventListener(type, releaseFlight));
}

function spawnObject() {
  const y = 70 + Math.random() * (H - 140);

  if (currentLevel === 1) {
    // Colour-only pressure currents. Cyan and amber, with no floating labels.
    const type = Math.random() < 0.5 ? "high" : "low";
    objects.push({
      id: `weather-${Math.random().toString(36).slice(2)}`,
      type,
      x: W + 90,
      y,
      size: 42 + Math.random() * 12,
      speed: 175 + Math.random() * 45,
      phase: Math.random() * 6,
      amplitude: 20 + Math.random() * 32
    });

  } else {
    // Dark thunderstorm clouds and rotating cyclones move towards the aircraft.
    const type = Math.random() < 0.48 ? "cyclone" : "cloud";

    objects.push({
      id: `weather-${Math.random().toString(36).slice(2)}`,
      type,
      x: W + 100,
      y,
      size: type === "cyclone"
        ? 48 + Math.random() * 16
        : 35,

      speed: type === "cyclone"
        ? 125 + Math.random() * 45
        : 145,

      phase: Math.random() * 6,

      amplitude: type === "cyclone"
        ? 35 + Math.random() * 30
        : 20,

      rotation: 0,
      rotationSpeed: 2.5 + Math.random() * 2
    });
  }
}

function updateObjects(dt) {
  spawnTimer -= dt;

  if (spawnTimer <= 0) {
    spawnObject();

    spawnTimer = currentLevel === 1
      ? 1.8 + Math.random() * 1.5
      : 2.5 + Math.random() * 1.5;
  }

  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];

    obj.x -= obj.speed * dt;

    obj.y +=
      Math.sin(worldTime * 2 + obj.phase) *
      obj.amplitude * dt;

    if (obj.type === "cyclone") {
      obj.rotation += obj.rotationSpeed * dt;
    }

    if (obj.x < -150) {
      objects.splice(i, 1);
      score += 10;
      updateHUD();
    }
  }
}

// LEVEL 2 THUNDERSTORM LIGHTNING
function updateThunderstorm(dt) {
  if (currentLevel !== 2) {
    lightningFlash = 0;
    return;
  }

  if (lightningFlash > 0) {
    lightningFlash = Math.max(0, lightningFlash - dt);

  } else {
    lightningTimer -= dt;

    if (lightningTimer <= 0) {
      lightningFlash = 0.13 + Math.random() * 0.12;
      sfx.thunder();
      lightningTimer = 3 + Math.random() * 5;

      lightningX = W * (0.18 + Math.random() * 0.68);

      lightningSegments = [];

      let boltY = 0;
      let boltX = lightningX;

      while (boltY < H * 0.72) {
        boltY += 18 + Math.random() * 24;
        boltX += (Math.random() - 0.5) * 48;

        lightningSegments.push({
          x: boltX,
          y: boltY
        });
      }
    }
  }
}

function drawThunderstormEffects() {
  if (currentLevel !== 2) return;

  // Rain
  ctx.save();

  ctx.strokeStyle = "rgba(205,225,245,0.28)";
  ctx.lineWidth = 1.2;

  for (let i = 0; i < 95; i++) {
    const x = (i * 97 + worldTime * 260) % (W + 30);
    const y = (i * 53 + worldTime * 430) % (H + 40);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9, y + 19);
    ctx.stroke();
  }

  ctx.restore();

  // Lightning flash
  if (lightningFlash > 0) {
    ctx.save();

    ctx.fillStyle =
      `rgba(220,235,255,${0.12 + lightningFlash * 0.65})`;

    ctx.fillRect(0, 0, W, H);

    if (lightningSegments.length > 1) {
      ctx.beginPath();
      ctx.moveTo(lightningX, 0);

      lightningSegments.forEach(point => {
        ctx.lineTo(point.x, point.y);
      });

      ctx.strokeStyle = "rgba(255,255,255,0.98)";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#d9edff";
      ctx.shadowBlur = 22;
      ctx.stroke();

      ctx.strokeStyle = "rgba(145,195,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);

  if (currentLevel === 1) {
    gradient.addColorStop(0, "#58b8ee");
    gradient.addColorStop(1, "#d1f3ff");

  } else {
    // Original dark Level 2 background
    gradient.addColorStop(0, "#192d52");
    gradient.addColorStop(1, "#607a9e");
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Original Level 2 stars
  if (currentLevel === 2) {
    for (let i = 0; i < 45; i++) {
      const x = (i * 137) % W;
      const y = (i * 73) % H;

      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Keep the thunderstorm atmosphere
  drawThunderstormEffects();

  // Moving background clouds
  clouds.forEach(cloud => {
    cloud.x -= cloud.speed * 0.3 * (1 / 60);

    cloud.y += Math.sin(worldTime * 1.5 + cloud.phase) * 0.25;

    if (cloud.x < -150) cloud.x = W + 150;

    if (currentLevel === 1) {
      // Original fluffy white clouds in Level 1
      ctx.fillStyle = "rgba(255,255,255,0.65)";

      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.7, cloud.y - 12, cloud.size * 0.75, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 1.3, cloud.y, cloud.size * 0.65, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // Dark layered thunderclouds in Level 2
      const s = cloud.size;

      ctx.save();
      ctx.translate(cloud.x, cloud.y);

      const stormShade = ctx.createLinearGradient(0, -s, 0, s * 0.9);
      stormShade.addColorStop(0, "#8795a8");
      stormShade.addColorStop(0.38, "#53647a");
      stormShade.addColorStop(1, "#26364d");

      // Cloud shadow
      ctx.fillStyle = "rgba(9,18,34,0.25)";
      ctx.beginPath();
      ctx.ellipse(s * 0.55, s * 0.42, s * 1.25, s * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();

      // Main cloud body
      ctx.fillStyle = stormShade;
      ctx.beginPath();
      ctx.arc(-s * 0.65, s * 0.05, s * 0.55, 0, Math.PI * 2);
      ctx.arc(-s * 0.18, -s * 0.35, s * 0.72, 0, Math.PI * 2);
      ctx.arc(s * 0.42, -s * 0.2, s * 0.82, 0, Math.PI * 2);
      ctx.arc(s * 0.95, s * 0.08, s * 0.55, 0, Math.PI * 2);
      ctx.arc(s * 0.25, s * 0.18, s * 0.9, 0, Math.PI * 2);
      ctx.fill();

      // Subtle illuminated upper edges
      ctx.strokeStyle = "rgba(210,225,242,0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-s * 0.18, -s * 0.35, s * 0.72, Math.PI, Math.PI * 1.85);
      ctx.arc(s * 0.42, -s * 0.2, s * 0.82, Math.PI * 1.05, Math.PI * 1.9);
      ctx.stroke();

      // Occasional lightning strikes from beneath the clouds
      const flashPhase = (worldTime * 1.15 + cloud.phase * 3) % 7.5;

      if (flashPhase < 0.16) {
        const boltX = s * (0.15 + 0.55 * Math.sin(cloud.phase));

        ctx.shadowColor = "#d9efff";
        ctx.shadowBlur = 16;
        ctx.strokeStyle = "rgba(235,247,255,0.98)";
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(boltX, s * 0.45);
        ctx.lineTo(boltX - 7, s * 0.78);
        ctx.lineTo(boltX + 5, s * 0.73);
        ctx.lineTo(boltX - 8, s * 1.22);
        ctx.stroke();

        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }
  });
}

function drawWind(obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;

  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-20, i * 13);

    ctx.quadraticCurveTo(
      0,
      i * 13 - 15,
      25,
      i * 13
    );

    ctx.stroke();
  }

  ctx.restore();
}

function drawCloudObstacle(obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);

  ctx.fillStyle = "#8497a8";

  ctx.beginPath();
  ctx.arc(-15, 5, obj.size * 0.55, 0, Math.PI * 2);
  ctx.arc(5, -10, obj.size * 0.7, 0, Math.PI * 2);
  ctx.arc(25, 4, obj.size * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Rotating cyclone effect
function drawCyclone(obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);

  const radius = obj.size;

  const glow = ctx.createRadialGradient(
    0, 0,
    radius * 0.1,
    0, 0,
    radius * 1.5
  );

  glow.addColorStop(0, "rgba(190,215,235,0.05)");
  glow.addColorStop(0.65, "rgba(160,190,215,0.28)");
  glow.addColorStop(1, "rgba(90,125,165,0)");

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(obj.rotation);

  for (let band = 0; band < 4; band++) {
    ctx.save();
    ctx.rotate(band * Math.PI / 2);

    ctx.beginPath();

    const startRadius = radius * (0.45 + band * 0.12);

    ctx.arc(
      0, 0,
      startRadius,
      -0.4,
      Math.PI * 1.55
    );

    ctx.lineWidth = radius * 0.19;

    ctx.strokeStyle = [
      "#d7e1eb",
      "#aab9ca",
      "#788da5",
      "#c1d0df"
    ][band];

    ctx.globalAlpha = 0.85;
    ctx.stroke();

    ctx.restore();
  }

  const centre = ctx.createRadialGradient(
    0, 0, 2,
    0, 0,
    radius * 0.43
  );

  centre.addColorStop(0, "#101d35");
  centre.addColorStop(0.45, "#243b59");
  centre.addColorStop(1, "#738ba5");

  ctx.fillStyle = centre;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.43, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.43, 0, Math.PI * 2);
  ctx.stroke();

  // Calm eye
  ctx.fillStyle = "#0b172b";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.17, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPressureCurrent(obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  const high = obj.type === "high";
  const colour = high ? "#35d8ff" : "#ffad42";
  ctx.strokeStyle = colour;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.shadowColor = colour;
  ctx.shadowBlur = 18;
  for (let i = 0; i < 5; i++) {
    const yy = (i - 2) * 12;
    ctx.beginPath();
    if (high) {
      ctx.moveTo(-obj.size * .9, yy - 8);
      ctx.bezierCurveTo(-obj.size * .25, yy - 20, obj.size * .25, yy + 20, obj.size * .9, yy + 8);
    } else {
      ctx.moveTo(-obj.size * .9, yy + 8);
      ctx.bezierCurveTo(-obj.size * .25, yy + 20, obj.size * .25, yy - 20, obj.size * .9, yy - 8);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawObjects() {
  objects.forEach(obj => {
    if (obj.type === "high" || obj.type === "low") drawPressureCurrent(obj);
    if (obj.type === "cloud") {
      drawCloudObstacle(obj);
    }

    if (obj.type === "wind") {
      drawWind(obj);
    }

    if (obj.type === "cyclone") {
      drawCyclone(obj);
    }
  });
}

// Redesigned classic red Angry-Birds-inspired bird
function drawBird() {
  ctx.save();

  ctx.translate(
    bird.x + bird.forward,
    bird.y + bird.bob
  );

  ctx.rotate(bird.tilt + bird.wobble);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 29, 25, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail feathers
  ctx.fillStyle = "#8f0909";
  ctx.beginPath();
  ctx.moveTo(-19, 5);
  ctx.lineTo(-38, -5);
  ctx.lineTo(-31, 8);
  ctx.lineTo(-40, 17);
  ctx.lineTo(-17, 17);
  ctx.closePath();
  ctx.fill();

  // Rounded red body
  const body = ctx.createRadialGradient(-10, -13, 3, 0, 0, 34);

  body.addColorStop(0, "#ff7770");
  body.addColorStop(0.38, "#ed2925");
  body.addColorStop(0.78, "#c81018");
  body.addColorStop(1, "#78070d");

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();

  // Red feather crest
  ctx.fillStyle = "#bd1018";
  ctx.beginPath();
  ctx.moveTo(-13, -22);
  ctx.quadraticCurveTo(-23, -43, -8, -34);
  ctx.quadraticCurveTo(-2, -46, 3, -29);
  ctx.quadraticCurveTo(13, -42, 12, -22);
  ctx.closePath();
  ctx.fill();

  // Large white eyes
  ctx.fillStyle = "#fffdf5";
  ctx.beginPath();
  ctx.ellipse(-7, -5, 8, 10, -0.08, 0, Math.PI * 2);
  ctx.ellipse(8, -5, 8, 10, 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = "#17131a";
  ctx.beginPath();
  ctx.arc(-4, -4, 3.5, 0, Math.PI * 2);
  ctx.arc(11, -4, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Thick angry eyebrows
  ctx.strokeStyle = "#401014";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-17, -17);
  ctx.lineTo(-2, -12);
  ctx.moveTo(3, -12);
  ctx.lineTo(19, -18);
  ctx.stroke();

  // Golden triangular beak
  const beak = ctx.createLinearGradient(17, 0, 39, 12);
  beak.addColorStop(0, "#ffe05a");
  beak.addColorStop(1, "#ed8a08");

  ctx.fillStyle = beak;
  ctx.beginPath();
  ctx.moveTo(19, 1);
  ctx.lineTo(39, 9);
  ctx.lineTo(18, 16);
  ctx.lineTo(23, 9);
  ctx.closePath();
  ctx.fill();

  // Lower beak line
  ctx.strokeStyle = "rgba(125,63,0,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 9);
  ctx.lineTo(35, 9);
  ctx.stroke();

  // Belly highlight
  ctx.fillStyle = "rgba(255,190,170,0.18)";
  ctx.beginPath();
  ctx.ellipse(-5, 17, 13, 6, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function createParticles(x, y) {
  for (let i = 0; i < 16; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 180,
      vy: (Math.random() - 0.5) * 180,
      life: 0.6
    });
  }
}

function updateParticles(dt) {
  particles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });

  particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life / 0.6);

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1;
}

function showWarning(message) {
  const warning = document.getElementById("warningFlash");
  const title = document.getElementById("warningTitle");
  const text = document.getElementById("warningText");

  if (warning) {
    warning.classList.add("show");

    if (title) {
      title.textContent = currentLevel === 2
        ? "⚠ CYCLONE ALERT!"
        : "⚠ WEATHER ALERT!";
    }

    if (text) {
      text.textContent = message;
    }

    setTimeout(() => {
      warning.classList.remove("show");
    }, 1600);
  }
}

function hazardKeyFor(obj) {
  return obj.type;
}

function ensureHazardUI() {
  if (document.getElementById("hazardInfo")) return;
  const panel = document.createElement("div");
  panel.id = "hazardInfo"; panel.className = "learning-stop";
  panel.innerHTML = `<article class="learning-card"><div class="lesson-topline"><span id="hazardTag"></span><span class="lesson-badge">WEATHER INFO</span></div><div class="lesson-heading"><div id="hazardIcon" class="lesson-icon"></div><div><h2 id="hazardTitle"></h2></div></div><p id="hazardBody" class="lesson-body"></p><div class="lesson-takeaway"><strong>REMEMBER</strong><span id="hazardTakeaway"></span></div><button id="hazardResume" class="lesson-resume"></button></article>`;
  document.getElementById("canvasWrap").appendChild(panel);
}

function showHazardInfo(key, final) {
  const info = hazardInfo[key];
  if (!info) { if (final) endGame(); else resumeAfterHazard(); return; }
  ensureHazardUI();
  hazardsHit.add(key);
  document.getElementById("hazardTag").textContent = info.tag;
  document.getElementById("hazardIcon").textContent = info.icon;
  document.getElementById("hazardTitle").textContent = info.title;
  document.getElementById("hazardBody").textContent = info.body;
  document.getElementById("hazardTakeaway").textContent = info.takeaway;
  const btn = document.getElementById("hazardResume");
  btn.textContent = final ? "SEE MY SCIENCE FACTS" : "GOT IT! RESUME FLIGHT";
  btn.onclick = () => { hideHazardInfo(); if (final) endGame(); else resumeAfterHazard(); };
  document.getElementById("hazardInfo").classList.add("show");
}

function hideHazardInfo() {
  const panel = document.getElementById("hazardInfo");
  if (panel) panel.classList.remove("show");
}

function resumeAfterHazard() {
  if (document.getElementById("gameScreen")?.classList.contains("active")) {
    gameRunning = true;
    lastTime = performance.now();
    setTimeout(() => { collisionLocked = false; }, 900);
    animationId = requestAnimationFrame(gameLoop);
  }
}

function checkCollisions() {
  if (collisionLocked) return;
  for (const obj of objects) {
    if (obj.hit) continue;
    const distance = Math.hypot(bird.x - obj.x, bird.y - obj.y);
    const isPressure = obj.type === "high" || obj.type === "low";
    const collisionDistance = obj.type === "cyclone"
      ? obj.size * 0.72 + bird.radius
      : obj.size * 0.72 + bird.radius;
    let touching;
    if (isPressure) {
      // Sensitive hit-box: matches the visible size of the pressure current,
      // so the warning fires the moment the aircraft touches it.
      const s = Math.max(0.55, obj.size / 45);
      const halfW = 1.3 * s * (W / 11.4) + 25;
      const halfH = 0.85 * s * (H / 5.92) + 12;
      const dx = (bird.x - obj.x) / halfW, dy = (bird.y - obj.y) / halfH;
      touching = dx * dx + dy * dy < 1;
    } else {
      touching = distance < collisionDistance;
    }
    if (touching) {
      obj.hit = true;
      lives = Math.max(0, lives - 1);
      createParticles(bird.x, bird.y);
      updateHUD();
      collisionLocked = true;
      showWarning(currentLevel === 1 ? "PRESSURE CURRENT HIT!" : (obj.type === "cyclone" ? "CYCLONE HIT!" : "THUNDERSTORM HIT!"));
      hitEffects();
      pendingHazard = { key: hazardKeyFor(obj), final: lives <= 0, t: isPressure ? 0.05 : 0.55 };
      break;
    }
  }
}

function showLevelInformation() {
  const content = document.getElementById("summaryContent");

  if (!content) return;

  const facts = levelData[currentLevel].facts;

  content.innerHTML = facts.map((fact, index) =>
    `<div class="fact-card">
      <strong>📘 FACT ${index + 1}</strong>
      <p>${fact}</p>
    </div>`
  ).join("");
}

function endGame() {
  gameRunning = false;

  if (animationId) {
    cancelAnimationFrame(animationId);
  }

  failedRun = true;

  const title = document.getElementById("summaryTitle");
  const icon = document.getElementById("summaryIcon");
  const scoreElement = document.getElementById("summaryScore");
  const button = document.getElementById("continueButton");

  if (title) {
    title.textContent = "FLIGHT COMPLETE! YOUR SCIENCE FACTS";
  }

  if (icon) {
    icon.textContent = "📘";
  }

  if (scoreElement) {
    scoreElement.textContent = `Flight score: ${score} · Read these facts, then try the ${levelQuizzes[currentLevel].length}-question quiz.`;
  }

  showLevelInformation();

  if (button) {
    button.textContent = `START ${levelQuizzes[currentLevel].length}-QUESTION QUIZ`;
  }

  showScreen("summaryScreen");
}

let quizIndex = 0;
let quizCorrect = 0;
let quizLocked = false;
let activeQuiz = [];
const ORIGINAL_QUIZ_COUNT = 3; // the first 5 stay first; extra questions stay at the end

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function buildShuffledQuiz(level) {
  const all = levelQuizzes[level];
  const ordered = [...shuffleArray(all.slice(0, ORIGINAL_QUIZ_COUNT)), ...shuffleArray(all.slice(ORIGINAL_QUIZ_COUNT))];
  return ordered.map(q => {
    const idx = shuffleArray(q.options.map((_, i) => i));
    return { q: q.q, why: q.why, options: idx.map(i => q.options[i]), a: idx.indexOf(q.a) };
  });
}

function beginQuiz() {
  gameRunning = false;
  if (animationId) cancelAnimationFrame(animationId);
  quizIndex = 0; quizCorrect = 0; quizLocked = false;
  activeQuiz = buildShuffledQuiz(currentLevel);
  renderQuizQuestion();
}

function renderQuizQuestion() {
  let panel = document.getElementById("quizPanel");
  if (!panel) {
    panel = document.createElement("div"); panel.id = "quizPanel"; panel.className = "quiz-overlay";
    document.querySelector("main").appendChild(panel);
  }
  const questions = activeQuiz;
  const q = questions[quizIndex];
  panel.innerHTML = `<section class="quiz-card"><p class="eyebrow">STORM QUEST · MISSION CHECK</p><div class="quiz-progress">QUESTION ${quizIndex+1} / ${questions.length}</div><div class="quiz-bar"><span style="width:${Math.round(quizIndex/questions.length*100)}%"></span></div><h1>${currentLevel === 1 ? "SKY EXPLORER QUIZ" : "STORM SURVIVOR QUIZ"}</h1><h2>${q.q}</h2><div class="quiz-options">${q.options.map((option,i)=>`<button class="quiz-option" data-option="${i}">${String.fromCharCode(65+i)}. ${option}</button>`).join("")}</div><p id="quizFeedback" class="quiz-feedback" aria-live="polite"></p><button id="quizNext" class="main-button" disabled>${quizIndex === questions.length-1 ? "SEE RESULTS" : "NEXT QUESTION"}</button></section>`;
  panel.classList.add("show");
  panel.querySelectorAll(".quiz-option").forEach(button => button.addEventListener("click", () => {
    if (quizLocked) return; quizLocked = true;
    const chosen = Number(button.dataset.option);
    const correct = chosen === q.a;
    if (correct) { quizCorrect++; sfx.correct(); } else sfx.wrong();
    panel.querySelectorAll(".quiz-option").forEach((b,i)=>{ b.disabled = true; if (i === q.a) b.classList.add("correct"); else if (i === chosen) b.classList.add("incorrect"); });
    const feedback = document.getElementById("quizFeedback");
    feedback.textContent = (correct ? "✓ Correct! " : "Not quite. ") + q.why;
    const next = document.getElementById("quizNext"); next.disabled = false;
  }));
  document.getElementById("quizNext").addEventListener("click", () => {
    if (!quizLocked) return; quizIndex++; quizLocked = false;
    if (quizIndex < questions.length) renderQuizQuestion(); else completeQuiz();
  });
}

function completeQuiz() {
  failedRun = false;
  const panel = document.getElementById("quizPanel"); if (panel) panel.classList.remove("show");
  const questions = activeQuiz;
  const quizPoints = quizCorrect * 20;
  totalScore += score + quizPoints;
  const record = { date: new Date().toLocaleString(), level: currentLevel, score, quizCorrect, quizTotal: questions.length, quizPoints };
  try { const records = JSON.parse(localStorage.getItem("stormQuestReports") || "[]"); records.push(record); localStorage.setItem("stormQuestReports", JSON.stringify(records.slice(-100))); } catch(e) {}
  const title = document.getElementById("summaryTitle");
  const icon = document.getElementById("summaryIcon");
  const scoreElement = document.getElementById("summaryScore");
  const button = document.getElementById("continueButton");
  title.textContent = currentLevel === 1 ? "SKY OF SECRETS COMPLETE!" : "STORM SURVIVOR!";
  icon.textContent = currentLevel === 1 ? "🌤️" : "🏆";
  scoreElement.textContent = `Flight score: ${score} · Quiz: ${quizCorrect}/${questions.length} · Quiz points: ${quizPoints}`;
  showLevelInformation();
  const content = document.getElementById("summaryContent");
  content.insertAdjacentHTML("afterbegin", `<div class="fact-card quiz-result"><strong>🧠 QUIZ RESULT</strong><p>You answered ${quizCorrect} out of ${questions.length} questions correctly.</p><p>${quizCorrect === questions.length ? "Perfect flight-school score!" : quizCorrect >= Math.ceil(questions.length * 0.6) ? "Good work! Review the facts below to strengthen your learning." : "Keep exploring. Read the learning notes and try again."}</p></div>`);
  const pct = quizCorrect / questions.length;
  const stars = pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
  const badgeName = currentLevel === 1
    ? (stars === 3 ? "PRESSURE PRO" : stars === 2 ? "WIND WATCHER" : "ROOKIE PILOT")
    : (stars === 3 ? "CYCLONE EXPERT" : stars === 2 ? "STORM SPOTTER" : "ROOKIE PILOT");
  content.insertAdjacentHTML("afterbegin", `<div class="fact-card badge-card"><div class="badge-medal">${stars === 3 ? "🥇" : stars === 2 ? "🥈" : "🥉"}</div><strong>BADGE EARNED</strong><p class="badge-name">${badgeName}</p><p class="badge-stars">${"⭐".repeat(stars)}${"☆".repeat(3 - stars)}</p></div>`);
  if (stars >= 2) sfx.win();
  button.textContent = currentLevel === 1 ? "CONTINUE TO LEVEL 2" : "VIEW FINAL RESULTS";
  showScreen("summaryScreen");
}

function finishLevel() {
  if (!gameRunning) return;
  beginQuiz();
}

function continueAfterSummary() {
  if (failedRun) {
    beginQuiz();
    return;
  }

  if (currentLevel === 1) {
    startLevel(2);

  } else {
    const totalElement = document.getElementById("totalScore");

    if (totalElement) {
      totalElement.textContent = totalScore;
    }

    showScreen("resultsScreen");
  }
}

function drawFallbackAircraft() {
  // Lightweight 2D aircraft for browsers without WebGL or while the GLB is loading.
  ctx.save();
  ctx.translate(bird.x + bird.forward, bird.y + bird.bob);
  ctx.rotate(bird.tilt + bird.wobble);
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(0, 28, 38, 7, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#f4f7fb"; ctx.strokeStyle = "#183d5b"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-42,0); ctx.lineTo(-8,-8); ctx.lineTo(24,-5); ctx.lineTo(43,0); ctx.lineTo(24,7); ctx.lineTo(-8,8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ff9c43"; ctx.beginPath(); ctx.moveTo(-5,-5); ctx.lineTo(-23,-25); ctx.lineTo(10,-7); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(-5,5); ctx.lineTo(-23,25); ctx.lineTo(10,7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d92f3a"; ctx.beginPath(); ctx.ellipse(4,-12,10,12,0,0,Math.PI*2); ctx.fill(); ctx.fillStyle = "#8deaff"; ctx.beginPath(); ctx.ellipse(8,-14,6,5,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawGame() {
  drawBackground();
  drawObjects();
  drawParticles();
  // Prefer the 3D aircraft. A lightweight 2D aircraft is used if WebGL/model loading fails.
  if (window.stormAircraft) {
    window.stormAircraft.update({
      x: bird.x + bird.forward,
      y: bird.y + bird.bob,
      tilt: bird.tilt,
      wobble: bird.wobble,
      objects: objects.map((obj, index) => ({ ...obj, id: obj.id ?? `${obj.type}-${index}` })),
      level: currentLevel,
      worldTime,
      lightningFlash
    });
  }
  const has3DAircraft = !!(window.stormAircraft && window.stormAircraft.loaded);
  canvas.style.opacity = has3DAircraft ? "0" : "1";
  if (!has3DAircraft) drawFallbackAircraft();
}

function gameLoop(timestamp) {
  if (!gameRunning) return;

  const realDt = Math.min((timestamp - lastTime) / 1000, 0.04);
  const dt = pendingHazard ? realDt * (pendingHazard.t < 0.1 ? 1 : 0.25) : realDt;

  lastTime = timestamp;
  worldTime += dt;

  updateThunderstorm(dt);
  updateBird(dt);
  updateObjects(dt);
  updateParticles(dt);
  if (!pendingHazard) checkCollisions();

  drawGame();

  if (pendingHazard) {
    pendingHazard.t -= realDt;
    if (pendingHazard.t <= 0) {
      const ph = pendingHazard; pendingHazard = null;
      gameRunning = false;
      sfx.card();
      showHazardInfo(ph.key, ph.final);
      return;
    }
  }

  if (gameRunning) {
    animationId = requestAnimationFrame(gameLoop);
  }
}

// Button connections
const continueButton = document.getElementById("continueButton");

if (continueButton) {
  continueButton.onclick = continueAfterSummary;
}

// Level selection buttons
const level1Button = document.getElementById("level1Button");
const level2Button = document.getElementById("level2Button");

if (level1Button) {
  level1Button.onclick = () => startLevel(1);
}

if (level2Button) {
  level2Button.onclick = () => startLevel(2);
}

// Home start button
const startButton = document.getElementById("startButton");

if (startButton) {
  startButton.onclick = () => showScreen("levelSelectScreen");
}

// Finish-level button
const finishButton = document.getElementById("finishLevelButton");

if (finishButton) {
  finishButton.onclick = finishLevel;
}


// TEACHER DASHBOARD: reports stay on this device; no student names are collected.
function showTeacherDashboard() {
  let panel = document.getElementById("teacherPanel");
  if (!panel) {
    panel = document.createElement("section"); panel.id = "teacherPanel"; panel.className = "teacher-overlay";
    document.querySelector("main").appendChild(panel);
  }
  let records = [];
  try { records = JSON.parse(localStorage.getItem("stormQuestReports") || "[]"); } catch(e) {}
  const completed = records.length;
  const correct = records.reduce((n,r)=>n+(r.quizCorrect||0),0);
  const total = records.reduce((n,r)=>n+(r.quizTotal||0),0);
  panel.innerHTML = `<section class="teacher-card"><button class="teacher-close" onclick="closeTeacherDashboard()">✕</button><p class="eyebrow">STORM QUEST · LOCAL REPORT</p><h1>TEACHER DASHBOARD</h1><p>Results saved on this device only. No student names or personal details are collected.</p><div class="teacher-stats"><div><b>${completed}</b><span>Level attempts</span></div><div><b>${total ? Math.round(correct/total*100) : 0}%</b><span>Quiz accuracy</span></div><div><b>${records.filter(r=>r.level===1).length}</b><span>Level 1 attempts</span></div><div><b>${records.filter(r=>r.level===2).length}</b><span>Level 2 attempts</span></div></div><div class="teacher-records">${records.length ? records.slice().reverse().map(r=>`<p><b>Level ${r.level}</b> · ${r.date} · Flight ${r.score} · Quiz ${r.quizCorrect}/${r.quizTotal}</p>`).join("") : "No quiz reports yet. Complete a level quiz to see results here."}</div><button class="main-button" onclick="exportTeacherReport()">EXPORT CSV REPORT</button><button class="secondary-button" onclick="clearTeacherReport()">CLEAR LOCAL REPORTS</button></section>`;
  panel.classList.add("show");
}
function closeTeacherDashboard() { document.getElementById("teacherPanel")?.classList.remove("show"); }
function exportTeacherReport() {
  let records=[]; try { records=JSON.parse(localStorage.getItem("stormQuestReports")||"[]"); } catch(e) {}
  const rows=[["Date","Level","Flight Score","Quiz Correct","Quiz Total","Quiz Points"],...records.map(r=>[r.date,r.level,r.score,r.quizCorrect,r.quizTotal,r.quizPoints])];
  const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="storm-quest-class-report.csv"; a.click(); URL.revokeObjectURL(url);
}
function clearTeacherReport() { if(confirm("Clear all quiz reports saved on this device?")){ localStorage.removeItem("stormQuestReports"); showTeacherDashboard(); } }



/* ===== HOW TO PLAY + ANSWER KEY ===== */
function ensureInfoOverlay() {
  let panel = document.getElementById("infoPanel");
  if (!panel) {
    panel = document.createElement("section"); panel.id = "infoPanel"; panel.className = "teacher-overlay";
    document.querySelector("main").appendChild(panel);
  }
  return panel;
}
function closeInfoPanel() { document.getElementById("infoPanel")?.classList.remove("show"); }

function showHowToPlay() {
  const panel = ensureInfoOverlay();
  panel.innerHTML = `<section class="teacher-card info-card"><button class="teacher-close" onclick="closeInfoPanel()" aria-label="Close">✕</button>
    <p class="eyebrow">STORM QUEST · PILOT BRIEFING</p><h1>HOW TO PLAY</h1>
    <ol class="howto-list">
      <li><b>Choose a mission.</b> Level 1 is <i>Sky of Secrets</i> (pressure and winds). Level 2 is <i>Eye of the Storm</i> (storms and cyclones).</li>
      <li><b>Fly your aircraft up and down.</b> Keyboard: <kbd>↑</kbd>/<kbd>W</kbd> to go up, <kbd>↓</kbd>/<kbd>S</kbd> to go down. Touch: tap the upper or lower half of the flight window, or hold the ▲ / ▼ buttons.</li>
      <li><b>Dodge the weather.</b> Level 1: cyan and amber pressure currents (high and low pressure). Level 2: dark thunderstorm clouds and spinning cyclones.</li>
      <li><b>You have 3 lives (❤️).</b> Each hit removes one life, shakes the screen and opens a weather-info card that explains what hit you. Press <i>Got it! Resume flight</i> to continue.</li>
      <li><b>Score points</b> (⭐) by letting weather pass you safely. Quiz answers earn extra points later.</li>
      <li><b>Learning stops.</b> Every so often the flight pauses with a science lesson. Read it, then press <i>Got it! Resume flight</i>.</li>
      <li><b>When all 3 lives are lost,</b> the facts screen appears. Read the facts, then start the 6-question quiz.</li>
      <li><b>Take the quiz.</b> Pick one answer per question. You see at once if you were right and why. Earn a badge and 1–3 stars based on your score.</li>
      <li><b>Pause</b> with the ⏸ button, <kbd>P</kbd> or <kbd>Esc</kbd>. Use 🔊 / 🔇 to mute sound.</li>
      <li><b>Stay safe in real life.</b> This is a game. In real severe weather, follow your local official alerts and evacuation instructions.</li>
    </ol>
    <button class="main-button" onclick="closeInfoPanel()">GOT IT!</button></section>`;
  panel.classList.add("show");
}

function showAnswerKey() {
  const panel = ensureInfoOverlay();
  const names = { 1: "LEVEL 1 · SKY OF SECRETS", 2: "LEVEL 2 · EYE OF THE STORM" };
  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const sections = [1, 2].map(level => `<h2 class="key-heading">${names[level]}</h2>` +
    levelQuizzes[level].map((q, i) => `<div class="key-item"><p><b>Q${i + 1}.</b> ${esc(q.q)}</p>
      <ul>${q.options.map((o, j) => `<li class="${j === q.a ? "key-correct" : ""}">${String.fromCharCode(65 + j)}. ${esc(o)}${j === q.a ? " ✓" : ""}</li>`).join("")}</ul>
      <p class="key-why">Why: ${esc(q.why)}</p></div>`).join("")).join("");
  panel.innerHTML = `<section class="teacher-card info-card"><button class="teacher-close" onclick="closeInfoPanel()" aria-label="Close">✕</button>
    <p class="eyebrow">STORM QUEST · FOR TEACHERS</p><h1>ANSWER KEY</h1>
    <p class="key-note">In the game the order of questions and options is shuffled each time, so match answers by the wording of the question. Correct answers are marked ✓.</p>
    ${sections}<button class="main-button" onclick="window.print()">PRINT</button><button class="secondary-button" onclick="closeInfoPanel()">CLOSE</button></section>`;
  panel.classList.add("show");
}
