"use strict";

const forest = document.getElementById("forest");
const fairy = document.getElementById("fairy");
const canvas = document.getElementById("trails");
const context = canvas.getContext("2d");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const IDLE_DELAY = 2000;
const LIGHT_LIFETIME = 4200;
const LIGHT_SPACING = 8;
const MAX_LIGHTS = 900;
let lights = [];
let previousPoint = null;
let idleTimer;
let animationFrame = null;
let lastFrame = null;
let lastFairySparkle = 0;
let width;
let height;
let fairyX;
let fairyY;
let targetX;
let targetY;
let fairyWidth;
let fairyHeight;
let customGlow = null;

// Reuse one glow texture instead of creating hundreds of gradients per frame.
const glow = document.createElement("canvas");
glow.width = glow.height = 64;
const glowContext = glow.getContext("2d");
const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
gradient.addColorStop(0, "rgba(255,255,255,1)");
gradient.addColorStop(.12, "rgba(243,247,255,.7)");
gradient.addColorStop(.35, "rgba(205,222,255,.15)");
gradient.addColorStop(1, "rgba(205,222,255,0)");
glowContext.fillStyle = gradient;
glowContext.fillRect(0, 0, 64, 64);

function constrainTarget(x, y) {
  const marginX = Math.min(fairyWidth / 2 + 10, width / 2);
  const marginY = Math.min(fairyHeight / 2 + 14, height / 2);
  targetX = Math.max(marginX, Math.min(width - marginX, x));
  targetY = Math.max(marginY, Math.min(height - marginY, y));
}

function positionFairy() {
  fairy.style.transform = `translate3d(${fairyX - fairyWidth / 2}px, ${fairyY - fairyHeight / 2}px, 0)`;
}

function resize() {
  width = forest.clientWidth;
  height = forest.clientHeight;
  fairyWidth = fairy.offsetWidth;
  fairyHeight = fairy.offsetHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  constrainTarget(fairyX ?? width * .5, fairyY ?? height * .58);
  fairyX = targetX;
  fairyY = targetY;
  positionFairy();
  lights = [];
  previousPoint = null;
}

function addLight(x, y, time, star = false) {
  lights.push({
    x, y, born: time, star,
    lifetime: star ? LIGHT_LIFETIME : 1800 + Math.random() * 2300,
    radius: star ? 1 + Math.random() * 1.2 : .35 + Math.random() * .9,
    vx: (Math.random() - .5) * (star ? 8 : 75),
    vy: star ? -4 - Math.random() * 5 : -12 - Math.random() * 42,
    phase: Math.random() * Math.PI * 2,
  });
}

function scatter(x, y, time) {
  addLight(x, y, time, true);
  for (let i = 0; i < 4; i++) {
    addLight(x + (Math.random() - .5) * 12, y + (Math.random() - .5) * 12, time);
  }
}

function startAnimation() {
  if (animationFrame === null) {
    lastFrame = null;
    animationFrame = requestAnimationFrame(drawScene);
  }
}

function drawScene(time) {
  webcam.update(time);
  const delta = Math.min(lastFrame === null ? 16 : time - lastFrame, 64);
  lastFrame = time;
  const follow = 1 - Math.exp(-delta / (reducedMotion.matches ? 75 : 170));
  fairyX += (targetX - fairyX) * follow;
  fairyY += (targetY - fairyY) * follow;
  positionFairy();

  if (forest.dataset.state === "awake" && time - lastFairySparkle > 40) {
    const x = fairyX + (Math.random() - .5) * fairyWidth * .65;
    const y = fairyY - fairyHeight * .16;
    addLight(x, y, time);
    addLight(x, y, time);
    lastFairySparkle = time;
  }
  lights = lights.filter(light => time - light.born < light.lifetime);
  if (lights.length > MAX_LIGHTS) lights.splice(0, lights.length - MAX_LIGHTS);
  context.clearRect(0, 0, width, height);

  for (const light of lights) {
    const seconds = (time - light.born) / 1000;
    const age = (time - light.born) / light.lifetime;
    const movement = reducedMotion.matches ? .15 : 1;
    const x = light.x + light.vx * seconds * movement;
    const y = light.y + (light.vy * seconds + 3 * seconds * seconds) * movement;
    const twinkle = reducedMotion.matches ? .75 : .22 + .78 * Math.pow(Math.sin(time * .006 + light.phase), 4);
    const opacity = Math.pow(1 - age, 1.3) * twinkle;
    const glowSize = light.star ? 30 : 12;
    context.globalAlpha = opacity * .8;
    context.globalCompositeOperation = "screen";
    context.drawImage(customGlow || glow, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = opacity;
    context.fillStyle = "#fff";
    context.beginPath();
    context.arc(x, y, light.radius, 0, Math.PI * 2);
    context.fill();

    if (light.star) {
      const size = light.radius * (2 + twinkle * 2.5);
      context.save();
      context.translate(x, y);
      context.rotate(light.phase + seconds * .12);
      context.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const radius = i % 2 ? size * .16 : size;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.restore();
    }
  }
  context.globalAlpha = 1;
  const following = Math.hypot(targetX - fairyX, targetY - fairyY) > .2;
  const animate = lights.length || following || forest.dataset.state === "awake" || webcam.active;
  animationFrame = animate ? requestAnimationFrame(drawScene) : null;
}

forest.addEventListener("pointermove", event => {
  const point = { x: event.clientX, y: event.clientY };
  if (previousPoint && point.x === previousPoint.x && point.y === previousPoint.y) return;
  const now = performance.now();
  forest.dataset.state = "awake";
  constrainTarget(point.x + 34, point.y - 28);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    forest.dataset.state = "resting";
    previousPoint = null;
  }, IDLE_DELAY);

  if (previousPoint) {
    const dx = point.x - previousPoint.x;
    const dy = point.y - previousPoint.y;
    const count = Math.min(24, Math.max(1, Math.floor(Math.hypot(dx, dy) / LIGHT_SPACING)));
    for (let i = 1; i <= count; i++) {
      scatter(previousPoint.x + dx * i / count, previousPoint.y + dy * i / count, now);
    }
  } else {
    scatter(point.x, point.y, now);
  }
  if (lights.length > MAX_LIGHTS) lights.splice(0, lights.length - MAX_LIGHTS);
  previousPoint = point;
  startAnimation();
});

forest.addEventListener("pointerleave", () => { previousPoint = null; });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(idleTimer);
    forest.dataset.state = "resting";
    previousPoint = null;
    lights = [];
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
    lastFrame = null;
    context.clearRect(0, 0, width, height);
  }
});

window.addEventListener("resize", resize);
resize();

let forestObjectUrl = null;
const assetStatus = document.getElementById("asset-status");

for (const kind of ["forest", "light"]) {
  const input = document.getElementById(`${kind}-file`);
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (kind === "forest") {
        document.querySelector(".landscape").style.backgroundImage = `url("${url}")`;
        if (forestObjectUrl) URL.revokeObjectURL(forestObjectUrl);
        forestObjectUrl = url;
      } else {
        customGlow = document.createElement("canvas");
        customGlow.width = customGlow.height = 64;
        const ratio = Math.min(64 / image.width, 64 / image.height);
        const w = image.width * ratio;
        const h = image.height * ratio;
        customGlow.getContext("2d").drawImage(image, (64 - w) / 2, (64 - h) / 2, w, h);
        URL.revokeObjectURL(url);
      }
      document.getElementById(`${kind}-file-name`).textContent = file.name;
      assetStatus.textContent = `${kind === "forest" ? "숲" : "불빛"} 이미지를 적용했어요.`;
    } catch {
      URL.revokeObjectURL(url);
      assetStatus.textContent = "이미지를 읽을 수 없어요. JPG·PNG·WebP 파일을 선택해주세요.";
    }
    input.value = "";
  });
}
