"use strict";

// ============================
// MÈO BÉO CAPOO v3 (CHÂN TRƯỚC / CHÂN SAU RÕ RÀNG · ĐẦU SẠCH ĐỐM · KHUNG GỌN · NỐI CẢM XÚC SỰ KIỆN)
// - Ngồi: 2 chân trước tròn hơi dài đặt phía trước + thân bánh bao mũm mĩm (hết kiểu 4 chân bạch tuộc!)
// - Chạy/Đi: tách rõ cặp chân trước & cặp chân sau có khoảng hở bụng ở giữa, chạy lăn tăn siêu mượt
// - Nối cảm xúc: thêm sách -> ăn mừng tung tim; vượt hạn mức -> dỗi đổ mồ hôi; khuya 23h-5h -> đội mũ ngủ; giữ tay -> xoa đầu lim dim!
// ============================
const catStage = document.getElementById("bookGroupStage");
const catCanvas = document.getElementById("catCanvas");
const catHitBox = document.getElementById("catHitBox");
const bookGroupSwitchEl = document.getElementById("bookGroupSwitch");

const CAT_COLORS = {
  blue: {
    id: "blue",
    label: "Xanh biển",
    body: "#59CBF0",
    belly: "#FFFFFF",
    ink: "#363740",
    inkDark: "#24252C",
    eye: "#2C2D35",
    eyeShine: "#FFFFFF",
    mouthLine: "#2C2D35",
    pink: "#FF7B89",
    cheek: "#FF9AA6",
    isBlack: false,
  },
  yellow: {
    id: "yellow",
    label: "Vàng",
    body: "#FFD15C",
    belly: "#FFF9E8",
    ink: "#3D3226",
    inkDark: "#2C231A",
    eye: "#2F251B",
    eyeShine: "#FFFFFF",
    mouthLine: "#2F251B",
    pink: "#FF7E82",
    cheek: "#FF9B8C",
    isBlack: false,
  },
  gray: {
    id: "gray",
    label: "Xám",
    body: "#A6B0BC",
    belly: "#F4F6F9",
    ink: "#343842",
    inkDark: "#242730",
    eye: "#282B33",
    eyeShine: "#FFFFFF",
    mouthLine: "#282B33",
    pink: "#FF8292",
    cheek: "#FFA1AD",
    isBlack: false,
  },
  white: {
    id: "white",
    label: "Trắng",
    body: "#FAF8F3",
    belly: "#FFFFFF",
    ink: "#3E3C44",
    inkDark: "#2D2B33",
    eye: "#2E2C34",
    eyeShine: "#FFFFFF",
    mouthLine: "#2E2C34",
    pink: "#FF7F8E",
    cheek: "#FFA3B0",
    isBlack: false,
  },
  black: {
    id: "black",
    label: "Đen",
    body: "#323540",
    belly: "#535869",
    ink: "#17181E",
    inkDark: "#6A7082",
    eye: "#FFFDF7",
    eyeShine: "#FFFFFF",
    mouthLine: "#F5F0E6",
    pink: "#FF7E8E",
    cheek: "#FF8B9B",
    isBlack: true,
  },
};

const CAT_COLOR_LIST = [
  CAT_COLORS.blue,
  CAT_COLORS.yellow,
  CAT_COLORS.gray,
  CAT_COLORS.white,
  CAT_COLORS.black,
];

function getCapooColorKey() {
  const raw = state.catCoat || "blue";
  if (CAT_COLORS[raw]) return raw;
  if (raw === "ginger") return "yellow";
  if (raw === "tabby") return "gray";
  if (raw === "cream") return "white";
  return "blue";
}

function isLateNightHour() {
  const hr = new Date().getHours();
  return hr >= 23 || hr < 5;
}

function isOverMonthlyBudget() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let spent = 0;
  (state.series || []).forEach((s) => {
    getAllSeriesVolumes(s).forEach((v) => {
      if (!v.isLegacy && (v.date || "").slice(0, 7) === ym) spent += Number(v.paidPrice) || 0;
    });
  });
  (state.giftGroups || []).forEach((g) => {
    (g.gifts || []).forEach((m) => {
      if (!m.isLegacy && (m.date || "").slice(0, 7) === ym) spent += Number(m.price) || 0;
    });
  });
  return spent > (Number(state.budgetLimit) || 1000000);
}

const CAPOO_IDLE_EXPRS = ["sparkle", "question", "blep", "pout", "gasp", "love", "happy", "chew", "bellyup", "bellyup"];

const capoo = {
  w: 340,
  h: 41,
  dpr: 1,
  x: 60,
  targetX: 60,
  activeGroup: "all",
  dir: 1,
  faceDir: 0,
  vx: 0,
  gait: 0,
  state: "idle",       // "idle" | "walk" | "run" | "tired" | "sleep"
  stamina: 100,
  tiredTimer: 0,
  idleTimer: 0,
  switchTimes: [],
  lastSwitchAt: 0,

  // Sticker expression & event reaction
  expr: "none",        // "none" | "sparkle" | "question" | "blep" | "pout" | "gasp" | "love" | "happy" | "chew" | "pet"
  exprTimer: 0,
  exprCooldown: 1.5,
  lastExpr: "",
  pendingEvent: "",    // queued reaction when user returns to Tủ sách
  isPetting: false,
  petPressTimer: null,
  petHoldActive: false,

  // Smooth blend weights
  runMix: 0,
  sleepMix: 0,
  tiredMix: 0,
  moveMix: 0,
  bellyMix: 0,
  squash: 0,
  squashV: 0,
  hopY: 0,
  hopV: 0,
  tilt: 0,
  wobble: 0,

  // Micro-animation timers
  clock: 0,
  blinkTimer: 2.1,
  blinkDur: 0,
  dustCD: 0,
  sweatCD: 0,
  zzzCD: 0,
  fxCD: 0,
  particles: [],
};

function getGroupCenterX(groupName) {
  const w = capoo.w || 340;
  if (groupName === "truyen") return w * 0.5;
  if (groupName === "sach") return w * (5 / 6);
  return w * (1 / 6);
}

function applyCatVisibility() {
  if (!catStage) return;
  const on = state.catEnabled !== false;
  catStage.classList.toggle("no-cat", !on);
  if (on) {
    resizeCatCanvas();
    capoo.targetX = getGroupCenterX(capoo.activeGroup);
    if (capoo.state === "idle" || capoo.state === "sleep") {
      capoo.x = capoo.targetX;
    }
  }
}

function resizeCatCanvas() {
  if (!catCanvas || !catStage) return;
  const rect = (bookGroupSwitchEl || catStage).getBoundingClientRect();
  if (rect.width < 40) return;
  const prevW = capoo.w || rect.width;
  capoo.w = Math.round(rect.width);
  capoo.h = 41;
  capoo.dpr = Math.min(window.devicePixelRatio || 1, 3);
  catCanvas.width = Math.round(capoo.w * capoo.dpr);
  catCanvas.height = Math.round(capoo.h * capoo.dpr);
  capoo.targetX = getGroupCenterX(capoo.activeGroup);
  if (prevW > 40) {
    capoo.x = Math.max(22, Math.min(capoo.w - 22, (capoo.x / prevW) * capoo.w));
  } else {
    capoo.x = capoo.targetX;
  }
}

function spawnCapooParticle(kind, x, y, extra = {}) {
  if (capoo.particles.length > 26) capoo.particles.shift();
  capoo.particles.push({
    kind,
    x,
    y,
    vx: extra.vx || 0,
    vy: extra.vy || 0,
    age: 0,
    life: extra.life || 0.85,
    size: extra.size || 4.2,
    text: extra.text || "",
    color: extra.color || "",
  });
}

function pickRandomCapooExpr() {
  const pool = CAPOO_IDLE_EXPRS.filter((e) => e !== capoo.lastExpr);
  return pool[Math.floor(Math.random() * pool.length)] || "love";
}

function triggerCapooExpression(kind = "", duration = 1.9, withHop = false) {
  const chosen = kind || pickRandomCapooExpr();
  capoo.expr = chosen;
  capoo.lastExpr = chosen;
  capoo.exprTimer = duration;
  capoo.fxCD = 0.05;
  if (withHop) {
    capoo.hopV = -114;
    capoo.squashV = 5.2;
  } else {
    capoo.squashV = chosen === "pout" || chosen === "gasp" ? -3.0 : 2.5;
  }

  if (chosen === "love") {
    spawnCapooParticle("heart", capoo.x, 9, { vx: 0, vy: -16, life: 0.9, size: 5.0 });
  } else if (chosen === "sparkle") {
    spawnCapooParticle("star", capoo.x - 15, 11, { vx: -6, vy: -12, life: 0.85, size: 4.0 });
    spawnCapooParticle("star", capoo.x + 15, 10, { vx: 6, vy: -14, life: 0.9, size: 4.5 });
  } else if (chosen === "happy") {
    spawnCapooParticle("note", capoo.x + 14, 12, { vx: 7, vy: -14, life: 0.95, text: "♪", color: "#FF7B89" });
  } else if (chosen === "gasp") {
    spawnCapooParticle("exclaim", capoo.x, 9, { vx: 0, vy: -8, life: 0.8, text: "?!", color: "#FF6874" });
  } else if (chosen === "pout") {
    spawnCapooParticle("sweat", capoo.x + 13, 14, { vx: 16, vy: -26, life: 0.65, size: 2.7 });
  } else if (chosen === "bellyup") {
    // Nằm ngửa ra làm nũng: lật người nhảy nhẹ + tung tim & sao lấp lánh
    capoo.exprTimer = Math.max(duration, 3.2);
    if (!withHop) {
      capoo.hopV = -74;
      capoo.squashV = 3.8;
    }
    spawnCapooParticle("heart", capoo.x - 10, 12, { vx: -7, vy: -15, life: 0.95, size: 4.4 });
    spawnCapooParticle("heart", capoo.x + 10, 10, { vx: 7, vy: -17, life: 1.0, size: 4.8 });
    spawnCapooParticle("star", capoo.x, 8, { vx: 0, vy: -13, life: 0.85, size: 3.8 });
  }
}

// Nối cảm xúc Capoo với sự kiện thật của app!
function notifyCapooEvent(evName) {
  if (state.catEnabled === false) return;
  if (capoo.state === "sleep") capoo.state = "idle";
  capoo.idleTimer = 0;
  if (evName === "added") {
    const over = isOverMonthlyBudget();
    if (over) {
      triggerCapooExpression("pout", 2.4, true);
    } else {
      const celebrate = Math.random() < 0.55 ? "love" : "happy";
      triggerCapooExpression(celebrate, 2.2, true);
      spawnCapooParticle("star", capoo.x - 14, 11, { vx: -10, vy: -16, life: 0.85, size: 4.2 });
      spawnCapooParticle("heart", capoo.x + 14, 10, { vx: 10, vy: -18, life: 0.95, size: 4.8 });
    }
  } else if (evName === "deleted") {
    triggerCapooExpression("gasp", 1.5, false);
  }
}

function checkCapooBudgetMood() {
  if (state.catEnabled === false) return;
  if (isOverMonthlyBudget() && capoo.state === "idle" && capoo.expr === "none") {
    triggerCapooExpression("pout", 2.1, false);
  }
}

function onCapooTabSwitch(groupName) {
  if (state.catEnabled === false) return;
  const now = performance.now();
  const prevAt = capoo.lastSwitchAt;
  const prevGroup = capoo.activeGroup;
  capoo.activeGroup = groupName;
  capoo.targetX = getGroupCenterX(groupName);
  capoo.idleTimer = 0;

  capoo.switchTimes.push(now);
  while (capoo.switchTimes.length && now - capoo.switchTimes[0] > 2600) {
    capoo.switchTimes.shift();
  }
  capoo.lastSwitchAt = now;

  if (capoo.state === "tired") {
    capoo.wobble = 1.0;
    capoo.squashV = -4.0;
    spawnCapooParticle("sweat", capoo.x + capoo.dir * 12, 16, {
      vx: capoo.dir * 24,
      vy: -32,
      life: 0.62,
      size: 2.8,
    });
    SFX.catTired();
    return;
  }

  if (capoo.state === "sleep") {
    capoo.hopV = -108;
    capoo.squashV = 4.8;
    capoo.expr = "gasp";
    capoo.exprTimer = 0.55;
  }

  if (prevGroup === groupName && Math.abs(capoo.x - capoo.targetX) < 6) {
    capoo.state = "idle";
    triggerCapooExpression("", 1.85, true);
    return;
  }

  const gap = prevAt ? now - prevAt : 9999;
  const recentCount = capoo.switchTimes.length;
  const isFast = (gap < 430 && recentCount >= 2) || recentCount >= 3;

  if (capoo.targetX !== capoo.x) {
    capoo.dir = capoo.targetX > capoo.x ? 1 : -1;
  }

  capoo.expr = "none";
  capoo.exprTimer = 0;
  capoo.exprCooldown = 1.3 + Math.random() * 1.0;

  if (isFast) {
    capoo.state = "run";
    capoo.squashV = 3.6;
    capoo.stamina = Math.max(0, capoo.stamina - 15.5);
    spawnCapooParticle("dust", capoo.x - capoo.dir * 14, 36, {
      vx: -capoo.dir * 24,
      vy: -9,
      life: 0.4,
      size: 3.1,
    });
    if (capoo.stamina <= 0) {
      capoo.state = "tired";
      capoo.tiredTimer = 3.6;
      capoo.wobble = 1.0;
      capoo.squashV = -5.6;
      SFX.catTired();
      spawnCapooParticle("sweat", capoo.x + capoo.dir * 12, 16, {
        vx: capoo.dir * 22,
        vy: -34,
        life: 0.68,
        size: 2.9,
      });
    }
  } else {
    capoo.state = "walk";
    capoo.squashV = 2.2;
  }
}

// Chạm nhanh -> nhảy làm biểu cảm | Giữ tay (>240ms) -> xoa đầu lim dim thả tim liên tục!
if (catHitBox) {
  const stopPetting = (wasCancel = false) => {
    clearTimeout(capoo.petPressTimer);
    capoo.petPressTimer = null;
    if (capoo.petHoldActive) {
      capoo.petHoldActive = false;
      capoo.isPetting = false;
      // Xoa đầu xong khoái quá lăn ngửa ra làm nũng!
      triggerCapooExpression("bellyup", 3.4, false);
      return;
    }
    if (wasCancel || state.catEnabled === false) return;
    // Chạm nhanh
    if (capoo.state === "tired") {
      capoo.wobble = 1.0;
      spawnCapooParticle("sweat", capoo.x + 11, 16, { vx: 20, vy: -30, life: 0.58, size: 2.8 });
      SFX.catTired();
      return;
    }
    capoo.idleTimer = 0;
    if (capoo.state === "sleep") capoo.state = "idle";
    SFX.catWake();
    if (capoo.expr === "bellyup") {
      // Chạm bụng lúc đang nằm ngửa -> quẫy chân thích thú bắn tim!
      capoo.exprTimer = 3.2;
      capoo.squashV = 4.2;
      spawnCapooParticle("heart", capoo.x - 11, 11, { vx: -10, vy: -18, life: 0.9, size: 4.8 });
      spawnCapooParticle("heart", capoo.x + 11, 11, { vx: 10, vy: -18, life: 0.9, size: 4.8 });
      spawnCapooParticle("star", capoo.x, 8, { vx: 0, vy: -15, life: 0.85, size: 4.2 });
    } else {
      triggerCapooExpression("", 2.2, true);
    }
  };

  catHitBox.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.catEnabled === false) return;
    ensureAudioCtx();
    capoo.petHoldActive = false;
    clearTimeout(capoo.petPressTimer);
    capoo.petPressTimer = setTimeout(() => {
      capoo.petHoldActive = true;
      capoo.isPetting = true;
      capoo.idleTimer = 0;
      if (capoo.state === "sleep") capoo.state = "idle";
      capoo.expr = "pet";
      capoo.exprTimer = 99;
      capoo.squashV = -2.4;
      SFX.catWake();
      spawnCapooParticle("heart", capoo.x, 9, { vx: 0, vy: -15, life: 0.9, size: 4.8 });
    }, 240);
  });

  catHitBox.addEventListener("pointerup", () => stopPetting(false));
  catHitBox.addEventListener("pointerleave", () => {
    if (capoo.petPressTimer || capoo.petHoldActive) stopPetting(true);
  });
  catHitBox.addEventListener("pointercancel", () => stopPetting(true));
}

function updateCapooPhysics(dt) {
  capoo.clock += dt;
  const smooth = (cur, target, speed) => cur + (target - cur) * (1 - Math.exp(-speed * dt));

  // Nháy mắt tự nhiên
  if (capoo.blinkDur > 0) {
    capoo.blinkDur = Math.max(0, capoo.blinkDur - dt);
  } else {
    capoo.blinkTimer -= dt;
    if (capoo.blinkTimer <= 0) {
      capoo.blinkDur = 0.125;
      capoo.blinkTimer = 2.0 + Math.random() * 2.5;
    }
  }

  capoo.wobble = Math.max(0, capoo.wobble - dt * 3.8);

  // Lò xo mochi siêu mượt
  const aSq = -175 * capoo.squash - 13.5 * capoo.squashV;
  capoo.squashV += aSq * dt;
  capoo.squash += capoo.squashV * dt;
  capoo.squash = Math.max(-0.34, Math.min(0.34, capoo.squash));

  // Nhảy & tiếp đất mềm
  if (capoo.hopY < 0 || capoo.hopV !== 0) {
    capoo.hopY += capoo.hopV * dt;
    capoo.hopV += 640 * dt;
    if (capoo.hopY >= 0) {
      capoo.hopY = 0;
      if (Math.abs(capoo.hopV) > 40) capoo.squashV = -4.8;
      capoo.hopV = 0;
    }
  }

  const now = performance.now();
  while (capoo.switchTimes.length && now - capoo.switchTimes[0] > 2600) {
    capoo.switchTimes.shift();
  }

  const dx = capoo.targetX - capoo.x;
  const dist = Math.abs(dx);
  const lateNight = isLateNightHour();
  const sleepDelay = 4.2; // Chỉ đi ngủ sau 23h (23:00–05:00)

  if (capoo.isPetting) {
    capoo.idleTimer = 0;
    capoo.fxCD -= dt;
    if (capoo.fxCD <= 0) {
      capoo.fxCD = 0.34;
      spawnCapooParticle("heart", capoo.x + (Math.random() - 0.5) * 20, 10, {
        vx: (Math.random() - 0.5) * 12,
        vy: -16,
        life: 0.85,
        size: 4.5,
      });
    }
  } else if (capoo.state === "tired") {
    capoo.vx = smooth(capoo.vx, 0, 10);
    capoo.x += capoo.vx * dt;
    capoo.tiredTimer -= dt;
    capoo.stamina = Math.min(100, capoo.stamina + dt * 25);
    capoo.sweatCD -= dt;
    if (capoo.sweatCD <= 0) {
      capoo.sweatCD = 0.58;
      spawnCapooParticle("sweat", capoo.x + capoo.dir * 11, 17, {
        vx: capoo.dir * 16,
        vy: -26,
        life: 0.62,
        size: 2.6,
      });
    }
    if (capoo.tiredTimer <= 0 && capoo.stamina >= 60) {
      capoo.state = dist > 2 ? "walk" : "idle";
      capoo.idleTimer = 0;
      capoo.squashV = 3.0;
    }
  } else if (capoo.state === "walk" || capoo.state === "run") {
    if (dist <= 1.8 && Math.abs(capoo.vx) < 95) {
      const wasRunning = capoo.state === "run";
      capoo.x = capoo.targetX;
      capoo.vx = 0;
      capoo.state = "idle";
      capoo.idleTimer = 0;
      capoo.squashV = wasRunning ? -4.8 : -2.5;
      if (wasRunning) {
        triggerCapooExpression("love", 1.15, false);
      } else if (isOverMonthlyBudget() && Math.random() < 0.45) {
        triggerCapooExpression("pout", 1.6, false);
      } else if (Math.random() < 0.35) {
        triggerCapooExpression("", 1.5, false);
      }
    } else {
      capoo.dir = dx >= 0 ? 1 : -1;
      const boost = Math.min(1, Math.max(0, (capoo.switchTimes.length - 2) / 4));
      const maxSpd = capoo.state === "run" ? 310 + boost * 150 : 165;
      const arriveFactor = Math.min(1, Math.max(0.18, Math.pow(dist / 58, 0.78)));
      const desiredVx = capoo.dir * maxSpd * arriveFactor;
      capoo.vx = smooth(capoo.vx, desiredVx, 13);
      const stepX = capoo.vx * dt;
      if (Math.abs(stepX) >= dist) {
        capoo.x = capoo.targetX;
        capoo.vx *= 0.25;
      } else {
        capoo.x += stepX;
      }
      capoo.gait += Math.abs(stepX) * 0.31;

      if (capoo.state === "run") {
        capoo.stamina = Math.max(0, capoo.stamina - dt * 12);
        capoo.dustCD -= dt;
        if (capoo.dustCD <= 0 && Math.abs(capoo.vx) > 155) {
          capoo.dustCD = 0.11;
          spawnCapooParticle("dust", capoo.x - capoo.dir * 16, 36, {
            vx: -capoo.dir * (22 + Math.random() * 12),
            vy: -7 - Math.random() * 6,
            life: 0.34,
            size: 2.5 + Math.random() * 1.3,
          });
        }
        if (capoo.stamina <= 0) {
          capoo.state = "tired";
          capoo.tiredTimer = 3.6;
          capoo.wobble = 1.0;
          capoo.squashV = -5.6;
          SFX.catTired();
        }
      } else {
        capoo.stamina = Math.min(100, capoo.stamina + dt * 14);
      }
    }
  } else if (capoo.state === "idle") {
    capoo.vx = smooth(capoo.vx, 0, 14);
    capoo.x = smooth(capoo.x, capoo.targetX, 12);
    capoo.stamina = Math.min(100, capoo.stamina + dt * 22);
    capoo.idleTimer += dt;

    if (capoo.exprTimer > 0) {
      capoo.exprTimer = Math.max(0, capoo.exprTimer - dt);
      capoo.fxCD -= dt;
      if (capoo.fxCD <= 0) {
        capoo.fxCD = 0.55;
        if (capoo.expr === "love") {
          spawnCapooParticle("heart", capoo.x + (Math.random() - 0.5) * 18, 10, { vx: (Math.random() - 0.5) * 9, vy: -15, life: 0.8, size: 4.3 });
        } else if (capoo.expr === "sparkle") {
          spawnCapooParticle("star", capoo.x + (Math.random() - 0.5) * 24, 12, { vx: (Math.random() - 0.5) * 8, vy: -12, life: 0.78, size: 3.9 });
        } else if (capoo.expr === "happy") {
          spawnCapooParticle("note", capoo.x + (Math.random() > 0.5 ? 14 : -14), 13, { vx: (Math.random() - 0.5) * 9, vy: -13, life: 0.85, text: "♪", color: "#FF7B89" });
        } else if (capoo.expr === "bellyup") {
          if (Math.random() < 0.65) {
            spawnCapooParticle("heart", capoo.x + (Math.random() - 0.5) * 24, 11, { vx: (Math.random() - 0.5) * 10, vy: -15, life: 0.88, size: 4.3 });
          } else {
            spawnCapooParticle("star", capoo.x + (Math.random() - 0.5) * 26, 12, { vx: (Math.random() - 0.5) * 8, vy: -12, life: 0.8, size: 3.7 });
          }
        }
      }
      if (capoo.exprTimer <= 0) {
        capoo.expr = "none";
        capoo.exprCooldown = lateNight ? 2.0 + Math.random() * 1.2 : 2.6 + Math.random() * 2.2;
      }
    } else if (!lateNight || capoo.idleTimer < sleepDelay - 1.0) {
      capoo.exprCooldown -= dt;
      if (capoo.exprCooldown <= 0) {
        if (isOverMonthlyBudget() && Math.random() < 0.35) {
          triggerCapooExpression("pout", 1.8, false);
        } else {
          triggerCapooExpression("", 1.85, false);
        }
      }
    }

    // Chỉ đi ngủ sau 23h đêm (23:00–05:00); giờ bình thường chỉ dừng nghỉ & làm biểu cảm
    if (lateNight && capoo.idleTimer >= sleepDelay) {
      capoo.state = "sleep";
      capoo.expr = "none";
      capoo.exprTimer = 0;
      capoo.zzzCD = 0.45;
    }
  } else if (capoo.state === "sleep") {
    if (!lateNight) {
      capoo.state = "idle";
      capoo.idleTimer = 0;
      capoo.exprCooldown = 1.6;
    }
    capoo.vx = 0;
    capoo.x = smooth(capoo.x, capoo.targetX, 10);
    capoo.stamina = Math.min(100, capoo.stamina + dt * 28);
    capoo.zzzCD -= dt;
    if (capoo.zzzCD <= 0) {
      capoo.zzzCD = 1.25;
      const ch = Math.floor(capoo.clock) % 2 === 0 ? "z" : "Z";
      spawnCapooParticle("zzz", capoo.x + 13, 14, {
        vx: 4.5,
        vy: -11,
        life: 1.4,
        text: ch,
      });
    }
  }

  const isMoving = capoo.state === "walk" || capoo.state === "run";
  const isBellyUp = capoo.expr === "bellyup" && capoo.state === "idle";
  capoo.moveMix = smooth(capoo.moveMix, isMoving ? 1 : 0, 11);
  capoo.runMix = smooth(capoo.runMix, capoo.state === "run" ? 1 : 0, 10);
  capoo.sleepMix = smooth(capoo.sleepMix, capoo.state === "sleep" ? 1 : 0, 5.2);
  capoo.tiredMix = smooth(capoo.tiredMix, capoo.state === "tired" ? 1 : 0, 8.5);
  capoo.bellyMix = smooth(capoo.bellyMix, isBellyUp ? 1 : 0, 10.5);
  capoo.faceDir = smooth(capoo.faceDir, isMoving ? capoo.dir : 0, 9.5);

  let targetTilt = 0;
  if (isMoving) targetTilt = capoo.dir * (0.055 + capoo.runMix * 0.085);
  else if (capoo.expr === "question") targetTilt = 0.14;
  else if (capoo.expr === "happy" || capoo.expr === "pet") targetTilt = Math.sin(capoo.clock * 7.5) * 0.075;
  else if (capoo.expr === "pout") targetTilt = Math.sin(capoo.clock * 24) * 0.03;
  capoo.tilt = smooth(capoo.tilt, targetTilt, 12);

  if (catHitBox) {
    catHitBox.style.left = Math.max(0, Math.round(capoo.x - 27)) + "px";
  }

  for (let i = capoo.particles.length - 1; i >= 0; i--) {
    const p = capoo.particles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === "sweat") p.vy += 120 * dt;
    if (p.kind === "dust") {
      p.vx *= 0.91;
      p.vy *= 0.91;
    }
    if (p.age >= p.life) capoo.particles.splice(i, 1);
  }
}

function drawCapooHeart(ctx, x, y, s, inkCol, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#FF7B89";
  ctx.strokeStyle = inkCol;
  ctx.lineWidth = Math.max(1.2, s * 0.25);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(0, s * 0.72);
  ctx.bezierCurveTo(-s * 1.15, s * 0.05, -s * 1.05, -s * 0.92, 0, -s * 0.34);
  ctx.bezierCurveTo(s * 1.05, -s * 0.92, s * 1.15, s * 0.05, 0, s * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCapooSparkle(ctx, x, y, s, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#FFE169";
  ctx.strokeStyle = "#B8841E";
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0);
  ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawAngerMark(ctx, x, y, s, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#FF5A67";
  ctx.lineWidth = 1.55;
  ctx.lineCap = "round";
  for (let q = 0; q < 4; q++) {
    ctx.save();
    ctx.rotate((q * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(s * 0.22, -s * 0.92);
    ctx.quadraticCurveTo(s * 0.22, -s * 0.22, s * 0.92, -s * 0.22);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Thân bánh bao mochi Capoo
function traceCapooLoaf(ctx, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(rx * 0.9, 0, rx * 1.12, -ry * 0.24, rx * 1.02, -ry * 0.96);
  ctx.bezierCurveTo(rx * 0.92, -ry * 1.66, rx * 0.55, -ry * 1.92, 0, -ry * 1.92);
  ctx.bezierCurveTo(-rx * 0.55, -ry * 1.92, -rx * 0.92, -ry * 1.66, -rx * 1.02, -ry * 0.96);
  ctx.bezierCurveTo(-rx * 1.12, -ry * 0.24, -rx * 0.9, 0, 0, 0);
  ctx.closePath();
}

function traceCapooEar(ctx, side, rx, ry, droop) {
  const bx1 = side * rx * 0.2;
  const bx2 = side * rx * 0.86;
  const by1 = -ry * 1.64;
  const by2 = -ry * 1.16;
  const tx = side * rx * (0.64 + droop * 0.12);
  const ty = -ry * 2.38 + droop * 4.0;
  ctx.beginPath();
  ctx.moveTo(bx1, by1);
  ctx.quadraticCurveTo(side * rx * 0.42, ty - 0.5, tx, ty);
  ctx.quadraticCurveTo(side * rx * 0.92, ty + 1.3, bx2, by2);
  ctx.closePath();
}

// Nằm ngửa ra làm nũng (lăn lộn lộ bụng trắng + 4 chân quẫy lên trời + mắt long lanh)
function drawCapooBellyUp(ctx, pal, outlineCol, groundY, wobbleX, scaleX, scaleY) {
  const wiggleSpeed = capoo.isPetting ? 11.5 : 6.8;
  const rock = Math.sin(capoo.clock * wiggleSpeed) * 0.14;
  const brx = 18.2;
  const bry = 8.4;

  ctx.save();
  ctx.translate(capoo.x + wobbleX, groundY - 1.1 + capoo.hopY);
  ctx.rotate(rock);
  ctx.scale(scaleX * 1.04, scaleY * 0.96);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 4 chân nhỏ giơ lên trời quẫy quẫy (2 chân trong + 2 chân ngoài)
  const pawDefs = [
    { x: -brx * 0.62, y: -bry * 1.56, rw: 2.35, rh: 3.3, baseRot: -0.42, phase: 0 },
    { x: -brx * 0.24, y: -bry * 1.82, rw: 2.25, rh: 3.1, baseRot: -0.16, phase: 1.5 },
    { x: brx * 0.24, y: -bry * 1.82, rw: 2.25, rh: 3.1, baseRot: 0.16, phase: 3.1 },
    { x: brx * 0.62, y: -bry * 1.56, rw: 2.35, rh: 3.3, baseRot: 0.42, phase: 4.6 },
  ];

  const traceBellyBody = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(brx * 0.94, 0, brx * 1.1, -bry * 0.34, brx * 1.0, -bry * 0.98);
    ctx.bezierCurveTo(brx * 0.9, -bry * 1.62, brx * 0.56, -bry * 1.82, 0, -bry * 1.82);
    ctx.bezierCurveTo(-brx * 0.56, -bry * 1.82, -brx * 0.9, -bry * 1.62, -brx * 1.0, -bry * 0.98);
    ctx.bezierCurveTo(-brx * 1.1, -bry * 0.34, -brx * 0.94, 0, 0, 0);
    ctx.closePath();
  };

  const traceFlippedEar = (side) => {
    // 2 tai áp sát bên hông dưới (đầu ngửa dựa sát mép thanh)
    const bx1 = side * brx * 0.58;
    const by1 = -bry * 0.12;
    const bx2 = side * brx * 0.96;
    const by2 = -bry * 0.72;
    const tx = side * (brx * 1.18);
    const ty = -bry * 0.08 + Math.sin(capoo.clock * wiggleSpeed + side) * 0.7;
    ctx.beginPath();
    ctx.moveTo(bx1, by1);
    ctx.quadraticCurveTo(side * brx * 0.98, ty + 1.2, tx, ty);
    ctx.quadraticCurveTo(side * brx * 1.14, by2 + 1.5, bx2, by2);
    ctx.closePath();
  };

  const paintBellyPass = (mode) => {
    const apply = () => {
      if (mode === "outline") {
        ctx.fillStyle = outlineCol;
        ctx.strokeStyle = outlineCol;
        ctx.lineWidth = 4.2;
        ctx.stroke();
        ctx.fill();
      } else {
        ctx.fillStyle = pal.body;
        ctx.fill();
      }
    };

    // Tai áp dưới
    traceFlippedEar(-1);
    apply();
    traceFlippedEar(1);
    apply();

    // 4 chân quẫy lên trời
    pawDefs.forEach((p) => {
      const kick = Math.sin(capoo.clock * 13.5 + p.phase);
      const lift = kick * 1.6;
      const rot = p.baseRot + kick * 0.34;
      ctx.save();
      ctx.translate(p.x, p.y - lift);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.rw, p.rh, 0, 0, Math.PI * 2);
      apply();
      ctx.restore();
    });

    // Thân bánh bao nằm ngửa
    traceBellyBody();
    apply();
  };

  // PASS 1 & 2: Viền ngoài + màu lông liền khối
  paintBellyPass("outline");
  paintBellyPass("fill");

  // Đệm thịt hồng siêu nhỏ trên đầu 4 bàn chân giơ lên trời
  pawDefs.forEach((p) => {
    const kick = Math.sin(capoo.clock * 13.5 + p.phase);
    const lift = kick * 1.6;
    const rot = p.baseRot + kick * 0.34;
    ctx.save();
    ctx.translate(p.x, p.y - lift);
    ctx.rotate(rot);
    ctx.fillStyle = pal.cheek;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, -1.1, 1.15, 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // PASS 3: Bụng trắng múp phơi hẳn lên trên
  ctx.save();
  traceBellyBody();
  ctx.clip();
  const bellyPulse = Math.sin(capoo.clock * 5.2) * 0.5;
  ctx.fillStyle = pal.belly;
  ctx.beginPath();
  ctx.ellipse(0, -bry * 1.42, brx * 0.58, bry * 0.68 + bellyPulse * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // PASS 4: Khuôn mặt làm nũng (mắt cười cong tít > ω < + má ửng hồng rực)
  ctx.save();
  ctx.translate(0, -bry * 0.68);
  // Má hồng rực làm nũng
  ctx.fillStyle = pal.cheek;
  ctx.globalAlpha = 0.82;
  ctx.beginPath();
  ctx.ellipse(-8.4, -0.4, 2.55, 1.45, 0, 0, Math.PI * 2);
  ctx.ellipse(8.4, -0.4, 2.55, 1.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Mắt híp cong làm nũng (^^) hoặc long lanh chớp nhẹ
  ctx.strokeStyle = pal.mouthLine;
  ctx.lineWidth = 1.75;
  if (Math.sin(capoo.clock * 3.2) > -0.35) {
    // Mắt cong > < cực nũng
    ctx.beginPath();
    ctx.moveTo(-7.5, -2.0);
    ctx.lineTo(-4.7, -0.6);
    ctx.lineTo(-7.5, 0.8);
    ctx.moveTo(7.5, -2.0);
    ctx.lineTo(4.7, -0.6);
    ctx.lineTo(7.5, 0.8);
    ctx.stroke();
  } else {
    // Mắt long lanh xin xoa bụng
    const drawPleadEye = (ex) => {
      ctx.fillStyle = pal.isBlack ? "#FFFDF7" : pal.eye;
      ctx.beginPath();
      ctx.ellipse(ex, -0.7, 2.25, 2.45, 0, 0, Math.PI * 2);
      ctx.fill();
      if (pal.isBlack) {
        ctx.fillStyle = "#1D1F28";
        ctx.beginPath();
        ctx.ellipse(ex, -0.7, 1.4, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(ex - 0.75, -1.45, 0.9, 0, Math.PI * 2);
      ctx.arc(ex + 0.65, 0.1, 0.45, 0, Math.PI * 2);
      ctx.fill();
    };
    drawPleadEye(-5.8);
    drawPleadEye(5.8);
  }

  // Miệng ω nhỏ xinh hơi hé hồng nũng nịu
  ctx.fillStyle = pal.pink;
  ctx.strokeStyle = pal.mouthLine;
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  ctx.moveTo(-2.7, -1.2);
  ctx.quadraticCurveTo(-1.35, 0.4, 0, -1.0);
  ctx.quadraticCurveTo(1.35, 0.4, 2.7, -1.2);
  ctx.bezierCurveTo(2.4, 2.2, -2.4, 2.2, -2.7, -1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore(); // end face

  // Vệt rung lăn lộn hai bên hông
  const wAlpha = 0.35 + Math.abs(Math.sin(capoo.clock * wiggleSpeed)) * 0.4;
  ctx.strokeStyle = pal.pink;
  ctx.globalAlpha = wAlpha;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(-brx - 3.6, -bry * 0.95, 3.2, 0.72 * Math.PI, 1.28 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(brx + 3.6, -bry * 0.95, 3.2, -0.28 * Math.PI, 0.28 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

// 2-Pass Silhouette Union: tai + thân + chân trước/sau RÕ RÀNG (không bao giờ giống bạch tuộc!)
function paintCapooUnifiedSilhouette(ctx, geom, mode, pal, outlineCol) {
  const { rx, ry, earDroop, legVis, showArms, armWave, paws } = geom;

  const drawShape = () => {
    if (mode === "outline") {
      ctx.fillStyle = outlineCol;
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 4.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.fill();
    } else {
      ctx.fillStyle = pal.body;
      ctx.fill();
    }
  };

  // 1. Hai tai bầu dính liền đầu
  traceCapooEar(ctx, -1, rx, ry, earDroop);
  drawShape();
  traceCapooEar(ctx, 1, rx, ry, earDroop);
  drawShape();

  // 2. Chân trước / chân sau rõ ràng (dính liền thân 100%)
  if (legVis > 0.05) {
    paws.forEach((p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.rw, p.rh * legVis, 0, 0, Math.PI * 2);
      drawShape();
      ctx.restore();
    });
  }

  // 3. Tay giơ lên khi tung tim / hóng hớt / vui vẻ
  if (showArms) {
    ctx.beginPath();
    ctx.moveTo(-rx * 0.76, -ry * 0.46);
    ctx.quadraticCurveTo(-rx * 1.24, -ry * 0.84 + armWave, -rx * 1.0, -ry * 1.12 + armWave);
    ctx.quadraticCurveTo(-rx * 0.8, -ry * 0.96 + armWave, -rx * 0.66, -ry * 0.6);
    ctx.closePath();
    drawShape();

    ctx.beginPath();
    ctx.moveTo(rx * 0.76, -ry * 0.46);
    ctx.quadraticCurveTo(rx * 1.24, -ry * 0.84 - armWave, rx * 1.0, -ry * 1.12 - armWave);
    ctx.quadraticCurveTo(rx * 0.8, -ry * 0.96 - armWave, rx * 0.66, -ry * 0.6);
    ctx.closePath();
    drawShape();
  }

  // 4. Thân bánh bao mochi chính
  traceCapooLoaf(ctx, rx, ry);
  drawShape();
}

function drawCapooScene() {
  if (!catCanvas) return;
  const ctx = catCanvas.getContext("2d");
  const w = capoo.w;
  const h = capoo.h;
  const isDark = isDarkTheme();
  const pal = CAT_COLORS[getCapooColorKey()] || CAT_COLORS.blue;
  const outlineCol = isDark ? pal.inkDark : pal.ink;
  const groundY = 37.5; // khung gọn sát ngay mép trên thanh Tất cả / Truyện / Sách

  ctx.save();
  ctx.setTransform(capoo.dpr, 0, 0, capoo.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 1. Bụi chạy phía sau
  capoo.particles.forEach((p) => {
    if (p.kind !== "dust") return;
    const a = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = isDark
      ? `rgba(225, 220, 212, ${(a * 0.34).toFixed(2)})`
      : `rgba(140, 130, 118, ${(a * 0.34).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.7 + (1 - a) * 0.7), 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. Bóng mềm bám sát viền trên thanh tab
  const shadowRx = 16.2 + capoo.moveMix * 2.5 + capoo.sleepMix * 3.0 + capoo.tiredMix * 3.5 + capoo.bellyMix * 3.2 - Math.abs(capoo.hopY) * 0.2;
  ctx.fillStyle = isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(28, 25, 22, 0.14)";
  ctx.beginPath();
  ctx.ellipse(capoo.x, groundY + 0.5, Math.max(6, shadowRx), 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Co giãn mochi + nhún bước chạy
  const moveBob = Math.abs(Math.sin(capoo.gait * 0.5)) * (1.8 + capoo.runMix * 1.8) * capoo.moveMix;
  const chewPulse = capoo.expr === "chew" ? Math.sin(capoo.clock * 14) * 0.045 : 0;
  const petSquish = capoo.isPetting ? -0.1 : 0;
  const breath =
    capoo.sleepMix > 0.2
      ? Math.sin(capoo.clock * 2.4) * 0.06 * capoo.sleepMix
      : capoo.tiredMix > 0.2
      ? Math.sin(capoo.clock * 12) * 0.075 * capoo.tiredMix
      : Math.sin(capoo.clock * 3.0) * 0.022;
  const wobbleX = capoo.wobble > 0 ? Math.sin(capoo.clock * 46) * capoo.wobble * 2.0 : 0;

  const sprintStretch = capoo.runMix * 0.13;
  const scaleY = 1 + capoo.squash + breath + petSquish - capoo.sleepMix * 0.26 - capoo.tiredMix * 0.32 - sprintStretch * 0.45;
  const scaleX = 1 - capoo.squash * 0.72 - breath * 0.4 - petSquish * 0.8 + chewPulse + capoo.sleepMix * 0.2 + capoo.tiredMix * 0.24 + sprintStretch;

  // Vệt gió khi chạy nước rút
  if (capoo.runMix > 0.42) {
    ctx.strokeStyle = pal.isBlack
      ? `rgba(180, 190, 210, ${(capoo.runMix * 0.45).toFixed(2)})`
      : `rgba(89, 203, 240, ${(capoo.runMix * 0.52).toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    const gx = capoo.x - capoo.dir * 20;
    for (let k = 0; k < 2; k++) {
      const gy = groundY - 9 - k * 7 + Math.sin(capoo.clock * 22 + k) * 1.2;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - capoo.dir * (7 + capoo.runMix * 6), gy);
      ctx.stroke();
    }
  }

  if (capoo.bellyMix > 0.45) {
    drawCapooBellyUp(ctx, pal, outlineCol, groundY, wobbleX, scaleX, scaleY);
  } else {
  ctx.save();
  const legVis = Math.max(0, 1 - capoo.sleepMix * 1.25 - capoo.tiredMix * 1.05);
  const legLiftOff = 2.2 * legVis;
  ctx.translate(capoo.x + wobbleX, groundY - legLiftOff + capoo.hopY - moveBob);
  ctx.rotate(capoo.tilt);
  ctx.scale(scaleX, scaleY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Kích thước bánh bao bè ngang béo múp hơn, vẫn gọn đẹp trong khung 41px
  const rx = 16.6 + capoo.moveMix * 1.5;
  const ry = 9.7;
  const earDroop = capoo.sleepMix * 0.45 + capoo.tiredMix * 0.72 + capoo.runMix * 0.22 + (capoo.expr === "pout" ? 0.16 : 0) + (capoo.isPetting ? 0.22 : 0);

  // 4 mấu chân ngắn tũn dính liền nhau kiểu Bugcat Capoo siêu cute!
  const paws = [];
  for (let k = 0; k < 4; k++) {
    const frac = (k / 3) * 2 - 1; // -1, -0.33, 0.33, 1
    const baseX = frac * (rx * 0.62);
    const phase = capoo.gait + k * 1.45;
    const swingX = Math.sin(phase) * (2.5 + capoo.runMix * 2.0) * capoo.moveMix;
    const liftY = Math.max(0, -Math.cos(phase)) * (1.9 + capoo.runMix * 1.3) * capoo.moveMix;
    paws.push({
      x: baseX + swingX,
      y: 0.35 - liftY,
      rw: 2.25,
      rh: 2.75,
      rot: Math.sin(phase) * 0.26 * capoo.moveMix,
    });
  }

  const showArms =
    (capoo.expr === "love" || capoo.expr === "gasp" || capoo.expr === "happy") &&
    capoo.tiredMix < 0.25 &&
    capoo.sleepMix < 0.25 &&
    capoo.moveMix < 0.3;
  const armWave = Math.sin(capoo.clock * 18) * 1.7;
  const geom = { rx, ry, earDroop, legVis, showArms, armWave, paws };

  // PASS 1: VIỀN NGOÀI LIỀN MẠCH TOÀN KHỐI
  paintCapooUnifiedSilhouette(ctx, geom, "outline", pal, outlineCol);

  // PASS 2: TÔ MÀU LÔNG ĐÈ SẠCH ĐƯỜNG GIAO CẮT (KHÔNG SỌC/ĐỐM TRÊN ĐẦU!)
  paintCapooUnifiedSilhouette(ctx, geom, "fill", pal, outlineCol);

  // PASS 3: BỤNG TRẮNG MÚP (ĐẦU SẠCH ĐẸP 100%, KHÔNG ĐỐM TRÁN)
  const faceShift = capoo.faceDir * 3.8;
  ctx.save();
  traceCapooLoaf(ctx, rx, ry);
  ctx.clip();
  ctx.fillStyle = pal.belly;
  ctx.beginPath();
  ctx.ellipse(faceShift * 0.55, 1.5, rx * 0.46, ry * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2 trái tim trên tay khi tung tim ("love")
  if (showArms && capoo.expr === "love") {
    const ha = Math.min(1, capoo.exprTimer * 1.5);
    drawCapooHeart(ctx, -rx * 1.15, -ry * 1.24 + armWave, 3.2, outlineCol, ha);
    drawCapooHeart(ctx, rx * 1.15, -ry * 1.24 - armWave, 3.2, outlineCol, ha);
  }

  // Mũ ngủ nhỏ siêu cute khi ngủ vào ban đêm khuya (23h–5h)!
  if (capoo.sleepMix > 0.55 && isLateNightHour()) {
    ctx.save();
    ctx.translate(-1.5, -ry * 1.85);
    ctx.rotate(-0.18);
    ctx.fillStyle = "#5A7FD6";
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(-5.5, 1.2);
    ctx.quadraticCurveTo(-1.0, -7.2, 7.2, -3.5);
    ctx.quadraticCurveTo(3.2, -0.4, 4.8, 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Cục bông trắng đầu mũ
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(7.6, -3.4, 2.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // PASS 4: KHUÔN MẶT CAPOO BIỂU CẢM
  const faceY = -ry * 1.14 + capoo.sleepMix * 1.8 + capoo.tiredMix * 2.0;
  ctx.save();
  ctx.translate(faceShift, faceY);
  ctx.strokeStyle = pal.mouthLine;
  ctx.fillStyle = pal.eye;

  // Má hồng ửng cute
  if (capoo.sleepMix < 0.7) {
    ctx.fillStyle = pal.cheek;
    const blushA =
      capoo.expr === "pout" || capoo.expr === "love" || capoo.expr === "sparkle" || capoo.expr === "chew" || capoo.expr === "pet"
        ? 0.76
        : 0.44 + capoo.runMix * 0.24;
    ctx.globalAlpha = blushA;
    const cheekR = capoo.expr === "chew" ? 2.7 + Math.abs(Math.sin(capoo.clock * 14)) * 0.7 : 2.15;
    ctx.beginPath();
    ctx.ellipse(-7.8, 1.9, cheekR, 1.3, 0, 0, Math.PI * 2);
    ctx.ellipse(7.8, 1.9, cheekR, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const drawCapooEye = (ex, ey, rX = 2.05, rY = 2.3, sparkly = false) => {
    if (pal.isBlack) {
      ctx.fillStyle = "#FFFDF7";
      ctx.beginPath();
      ctx.ellipse(ex, ey, rX * 1.05, rY * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1D1F28";
      ctx.beginPath();
      ctx.ellipse(ex + capoo.faceDir * 0.3, ey, rX * 0.65, rY * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(ex - rX * 0.34, ey - rY * 0.34, sparkly ? 0.95 : 0.65, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.ellipse(ex, ey, rX, rY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.eyeShine;
      ctx.beginPath();
      ctx.arc(ex - rX * 0.32, ey - rY * 0.34, sparkly ? 0.98 : 0.65, 0, Math.PI * 2);
      ctx.fill();
      if (sparkly) {
        ctx.beginPath();
        ctx.arc(ex + rX * 0.3, ey + rY * 0.32, 0.52, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const drawCapooMouthW = (my = 0.6, spread = 2.9) => {
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.55;
    ctx.beginPath();
    ctx.moveTo(-spread, my);
    ctx.quadraticCurveTo(-spread * 0.5, my + 2.1, 0, my + 0.4);
    ctx.quadraticCurveTo(spread * 0.5, my + 2.1, spread, my);
    ctx.stroke();
  };

  if (capoo.expr === "pet") {
    // ĐƯỢC XOA ĐẦU: mắt nhắm lim dim ︶ ω ︶ cực phê!
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.arc(-5.6, 0.4, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(5.6, 0.4, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    drawCapooMouthW(0.9, 2.8);
  } else if (capoo.sleepMix > 0.55) {
    // NGỦ: mắt nhắm + bong bóng mũi phồng xẹp
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.arc(-5.4, 0.5, 2.1, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(5.4, 0.5, 2.1, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    drawCapooMouthW(1.0, 2.1);

    const bubR = 1.8 + (Math.sin(capoo.clock * 2.4) * 0.5 + 0.5) * 2.0;
    ctx.fillStyle = "rgba(180, 232, 255, 0.55)";
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(3.8, 1.2, bubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(3.8 - bubR * 0.3, 1.2 - bubR * 0.3, bubR * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (capoo.tiredMix > 0.5) {
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(-7.0, -1.4);
    ctx.lineTo(-4.0, 1.3);
    ctx.moveTo(-4.0, -1.4);
    ctx.lineTo(-7.0, 1.3);
    ctx.moveTo(4.0, -1.4);
    ctx.lineTo(7.0, 1.3);
    ctx.moveTo(7.0, -1.4);
    ctx.lineTo(4.0, 1.3);
    ctx.stroke();

    const pant = Math.abs(Math.sin(capoo.clock * 12));
    ctx.fillStyle = pal.pink;
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 2.7 + pant * 0.9, 2.3, 2.0 + pant * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (capoo.runMix > 0.45 || capoo.expr === "love") {
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-7.6, -1.8);
    ctx.lineTo(-4.8, -0.1);
    ctx.lineTo(-7.6, 1.6);
    ctx.moveTo(7.6, -1.8);
    ctx.lineTo(4.8, -0.1);
    ctx.lineTo(7.6, 1.6);
    ctx.stroke();

    ctx.fillStyle = pal.pink;
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(-3.0, 0.2);
    ctx.quadraticCurveTo(-1.5, 2.0, 0, 0.3);
    ctx.quadraticCurveTo(1.5, 2.0, 3.0, 0.2);
    ctx.bezierCurveTo(2.8, 4.6, -2.8, 4.6, -3.0, 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (capoo.expr === "happy") {
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.arc(-5.8, 0.9, 2.1, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(5.8, 0.9, 2.1, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    drawCapooMouthW(0.5, 2.8);
  } else if (capoo.expr === "sparkle") {
    drawCapooEye(-5.8, -0.25, 2.45, 2.7, true);
    drawCapooEye(5.8, -0.25, 2.45, 2.7, true);
    drawCapooMouthW(0.7, 2.8);
  } else if (capoo.expr === "question") {
    drawCapooEye(-5.8, -0.25, 2.2, 2.5, false);
    drawCapooEye(5.8, -0.1, 1.65, 1.85, false);
    drawCapooMouthW(0.8, 2.4);
  } else if (capoo.expr === "blep") {
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(-7.4, -1.4);
    ctx.lineTo(-4.7, -0.1);
    ctx.lineTo(-7.4, 1.2);
    ctx.stroke();
    drawCapooEye(5.8, -0.2, 2.05, 2.3, false);
    drawCapooMouthW(0.45, 2.8);
    const lick = Math.sin(capoo.clock * 14) * 0.4;
    ctx.fillStyle = pal.pink;
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(2.0 + lick, 2.5, 1.7, 2.0, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (capoo.expr === "pout") {
    drawCapooEye(-5.6, 0.0, 1.9, 2.1, false);
    drawCapooEye(5.6, 0.0, 1.9, 2.1, false);
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(-7.8, -2.5);
    ctx.lineTo(-4.0, -1.3);
    ctx.moveTo(7.8, -2.5);
    ctx.lineTo(4.0, -1.3);
    ctx.moveTo(-2.2, 2.0);
    ctx.quadraticCurveTo(0, 0.3, 2.2, 2.0);
    ctx.stroke();
  } else if (capoo.expr === "gasp") {
    drawCapooEye(-6.0, -0.35, 2.1, 2.4, true);
    drawCapooEye(6.0, -0.35, 2.1, 2.4, true);
    ctx.fillStyle = pal.pink;
    ctx.strokeStyle = pal.mouthLine;
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.ellipse(0, 2.0, 2.4, 2.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (capoo.expr === "chew") {
    drawCapooEye(-6.1, -0.25, 2.0, 2.2, false);
    drawCapooEye(6.1, -0.25, 2.0, 2.2, false);
    const chY = Math.sin(capoo.clock * 14) * 0.65;
    drawCapooMouthW(0.6 + chY, 2.5);
  } else {
    if (capoo.blinkDur > 0) {
      ctx.strokeStyle = pal.mouthLine;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-7.4, 0);
      ctx.lineTo(-4.2, 0);
      ctx.moveTo(4.2, 0);
      ctx.lineTo(7.4, 0);
      ctx.stroke();
    } else {
      drawCapooEye(-5.8, -0.2, 2.05, 2.3, false);
      drawCapooEye(5.8, -0.2, 2.05, 2.3, false);
    }
    drawCapooMouthW(0.6, 2.85);
  }

  ctx.restore(); // end face

  if (capoo.expr === "question" && capoo.exprTimer > 0) {
    ctx.save();
    ctx.translate(0, -ry * 2.45 + Math.sin(capoo.clock * 9) * 1.2);
    ctx.fillStyle = "#FF5A67";
    ctx.font = '700 11px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("?", 0, 0);
    ctx.restore();
  } else if (capoo.expr === "pout" && capoo.exprTimer > 0) {
    const pulse = 1 + Math.sin(capoo.clock * 16) * 0.12;
    drawAngerMark(ctx, rx * 0.92, -ry * 1.88, 3.8 * pulse, Math.min(1, capoo.exprTimer * 2));
  }

  ctx.restore(); // end capoo transform
  } // end upright vs bellyup

  // 4. Particles phía trước
  capoo.particles.forEach((p) => {
    if (p.kind === "dust") return;
    const a = Math.max(0, 1 - p.age / p.life);
    if (p.kind === "heart") {
      drawCapooHeart(ctx, p.x, p.y, p.size * (0.85 + (1 - a) * 0.25), outlineCol, a);
    } else if (p.kind === "star") {
      drawCapooSparkle(ctx, p.x, p.y, p.size * (0.7 + Math.sin(p.age * 14) * 0.25), a);
    } else if (p.kind === "sweat") {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "#9BE5FF";
      ctx.strokeStyle = outlineCol;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.size * 1.3);
      ctx.quadraticCurveTo(p.x + p.size, p.y, p.x, p.y + p.size);
      ctx.quadraticCurveTo(p.x - p.size, p.y, p.x, p.y - p.size * 1.3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === "note" || p.kind === "exclaim") {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color || "#FF7B89";
      ctx.font = '700 10.5px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(p.text || "♪", p.x, p.y);
      ctx.restore();
    } else if (p.kind === "zzz") {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = isDark ? "#EDEAE3" : "#4A4742";
      const sz = 7.0 + (1 - a) * 4.0;
      ctx.font = `700 ${sz.toFixed(1)}px "IBM Plex Mono", monospace`;
      ctx.fillText(p.text || "z", p.x, p.y);
      ctx.restore();
    }
  });

  ctx.restore();
}

let lastCatFrame = 0;
function catLoop(ts) {
  requestAnimationFrame(catLoop);
  if (document.hidden || state.catEnabled === false) {
    lastCatFrame = ts;
    return;
  }
  const booksView = document.getElementById("view-books");
  if (booksView && !booksView.classList.contains("active")) {
    lastCatFrame = ts;
    return;
  }
  const dt = lastCatFrame ? Math.min(0.05, (ts - lastCatFrame) / 1000) : 0.016;
  lastCatFrame = ts;
  updateCapooPhysics(dt);
  drawCapooScene();
}

window.addEventListener("resize", resizeCatCanvas, { passive: true });
resizeCatCanvas();
capoo.x = getGroupCenterX(filters.bookGroup || "all");
capoo.targetX = capoo.x;
requestAnimationFrame(catLoop);
