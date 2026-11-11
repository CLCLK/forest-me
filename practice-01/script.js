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
let lightMode = "sparkle";

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
    lifetime: lightMode === "sparkle" ? (star ? LIGHT_LIFETIME : 1800 + Math.random() * 2300) : 3400 + Math.random() * 1300,
    radius: star ? 1 + Math.random() * 1.2 : .35 + Math.random() * .9,
    vx: (Math.random() - .5) * (lightMode === "sparkle" && star ? 8 : 60),
    vy: lightMode === "leaf" ? 12 + Math.random() * 20 : star ? -4 - Math.random() * 5 : -12 - Math.random() * 42,
    size: lightMode === "crow" ? 5 + Math.random() * 3 : 4 + Math.random() * 3,
    phase: Math.random() * Math.PI * 2,
  });
}

function scatter(x, y, time) {
  if (lightMode !== "sparkle") {
    addLight(x, y, time);
    return;
  }
  addLight(x, y, time, true);
  for (let i = 0; i < 4; i++) {
    addLight(x + (Math.random() - .5) * 12, y + (Math.random() - .5) * 12, time);
  }
}

function particleLimit() {
  return lightMode === "sparkle" ? MAX_LIGHTS : lightMode === "crow" ? 100 : 180;
}

function drawMotif(light, x, y, time, seconds, opacity) {
  context.save();
  context.globalAlpha = opacity;
  context.translate(x, y);
  if (lightMode === "crow") {
    const flap = reducedMotion.matches ? -4 : Math.sin(time * .018 + light.phase) * 5;
    context.scale((light.vx < 0 ? -1 : 1) * light.size / 8, light.size / 8);
    context.fillStyle = "#32364b";
    context.strokeStyle = "#a3a8bc";
    context.lineWidth = .65;
    context.beginPath();
    context.moveTo(-1, 0);
    context.quadraticCurveTo(-7, -10 + flap, -12, -5 + flap);
    context.quadraticCurveTo(-9, 3, -2, 3);
    context.fill();
    context.stroke();
    context.fillStyle = "#202332";
    context.beginPath();
    context.ellipse(0, 2, 4.5, 5.2, -.25, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(3, -3.5, 3.7, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#aaaab8";
    context.beginPath();
    context.moveTo(6, -4);
    context.lineTo(9, -2.5);
    context.lineTo(6, -1.5);
    context.closePath();
    context.fill();
    context.fillStyle = "#ecedfa";
    context.beginPath();
    context.arc(4.2, -4.3, .75, 0, Math.PI * 2);
    context.fill();
  } else {
    context.rotate(light.phase + (reducedMotion.matches ? 0 : seconds * 1.4));
    context.scale(1, .65 + Math.abs(Math.sin(seconds * 2 + light.phase)) * .35);
    context.fillStyle = "#9599a5";
    context.strokeStyle = "#c8cbd3";
    context.lineWidth = .6;
    context.beginPath();
    context.moveTo(-light.size, 0);
    context.quadraticCurveTo(0, -light.size, light.size, 0);
    context.quadraticCurveTo(0, light.size * .8, -light.size, 0);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(-light.size - 2, 0);
    context.lineTo(light.size * .8, 0);
    context.stroke();
  }
  context.restore();
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
  const horizontalDistance = targetX - fairyX;
  if (Math.abs(horizontalDistance) > .5) {
    fairy.dataset.facing = horizontalDistance < 0 ? "left" : "right";
  }
  fairyX += (targetX - fairyX) * follow;
  fairyY += (targetY - fairyY) * follow;
  positionFairy();

  if (forest.dataset.state === "awake" && time - lastFairySparkle > (lightMode === "sparkle" ? 40 : 150)) {
    const x = fairyX + (Math.random() - .5) * fairyWidth * .65;
    const y = fairyY - fairyHeight * .16;
    if (lightMode === "sparkle") addLight(x, y, time);
    addLight(x, y, time);
    lastFairySparkle = time;
  }
  lights = lights.filter(light => time - light.born < light.lifetime);
  if (lights.length > particleLimit()) lights.splice(0, lights.length - particleLimit());
  context.clearRect(0, 0, width, height);

  for (const light of lights) {
    const seconds = (time - light.born) / 1000;
    const age = (time - light.born) / light.lifetime;
    const movement = reducedMotion.matches ? .15 : 1;
    const x = light.x + light.vx * seconds * movement;
    const y = light.y + (light.vy * seconds + 3 * seconds * seconds) * movement;
    if (lightMode !== "sparkle") {
      drawMotif(light, x, y, time, seconds, Math.min(1, (1 - age) * 2));
      continue;
    }
    const twinkle = reducedMotion.matches ? .75 : .22 + .78 * Math.pow(Math.sin(time * .006 + light.phase), 4);
    const opacity = Math.pow(1 - age, 1.3) * twinkle;
    const glowSize = light.star ? 30 : 12;
    context.globalAlpha = opacity * .8;
    context.globalCompositeOperation = "screen";
    context.drawImage(glow, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
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
  if (document.body.dataset.view !== "forest") return;
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
    const spacing = lightMode === "sparkle" ? LIGHT_SPACING : lightMode === "crow" ? 32 : 20;
    const count = Math.min(24, Math.max(1, Math.floor(Math.hypot(dx, dy) / spacing)));
    for (let i = 1; i <= count; i++) {
      scatter(previousPoint.x + dx * i / count, previousPoint.y + dy * i / count, now);
    }
  } else {
    scatter(point.x, point.y, now);
  }
  if (lights.length > particleLimit()) lights.splice(0, lights.length - particleLimit());
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

const assetStatus = document.getElementById("asset-status");
const forestPreset = document.getElementById("forest-preset");
const lightPreset = document.getElementById("light-preset");

forestPreset.addEventListener("change", () => {
  forest.dataset.background = forestPreset.value;
  assetStatus.textContent = `숲: ${forestPreset.selectedOptions[0].textContent}`;
});

lightPreset.addEventListener("change", () => {
  lightMode = lightPreset.value;
  lights = [];
  context.clearRect(0, 0, width, height);
  previousPoint = null;
  assetStatus.textContent = `불빛: ${lightPreset.selectedOptions[0].textContent}`;
});

document.getElementById("enter-forest").addEventListener("click", () => {
  const panel = document.querySelector(".control-panel");
  document.body.append(panel);
  document.body.dataset.view = "forest";
  document.getElementById("intro-screen").hidden = true;
  forest.focus({ preventScroll: true });
});
