"use strict";

// ============================
// HỆ THỐNG HOÀN TÁC (UNDO) TIẾT KIỆM RAM CHO IPHONE
// ============================
const MAX_UNDO_STEPS = 25;
const UNDO_BTN_DURATION_MS = 5000;
const undoStack = [];
const undoImageBank = {}; // Giữ mỗi ảnh duy nhất 1 lần trong RAM để hoàn tác xoá nhầm ảnh/bộ
let undoHideTimer = null;

function hideUndoBtn() {
  const btn = document.getElementById("undoBtn");
  if (btn) btn.classList.remove("undo-visible");
  clearTimeout(undoHideTimer);
  undoHideTimer = null;
}

function flashUndoBtnFor5s() {
  const btn = document.getElementById("undoBtn");
  const lbl = document.getElementById("undoBtnLabel");
  if (!btn) return;
  const count = undoStack.length;
  if (count === 0) {
    hideUndoBtn();
    return;
  }
  if (lbl) lbl.textContent = "Hoàn tác";
  btn.title = `Hoàn tác: ${undoStack[count - 1].label}`;
  btn.classList.add("undo-visible");
  if (isRichFx()) {
    btn.classList.remove("undo-wiggle");
    void btn.offsetWidth;
    btn.classList.add("undo-wiggle");
  }
  clearTimeout(undoHideTimer);
  undoHideTimer = setTimeout(hideUndoBtn, UNDO_BTN_DURATION_MS);
}

function updateUndoBtnUI() {
  if (undoStack.length === 0) hideUndoBtn();
}

function pushUndo(label) {
  if (!appReady) return;
  compactImagesInState(state);
  const pool = state.images || {};
  for (const k in pool) {
    if (pool[k] && !undoImageBank[k]) undoImageBank[k] = pool[k];
  }
  const lightSnap = structuredClone({ ...state, images: {} });
  undoStack.push({ label: label || "thao tác vừa rồi", snap: lightSnap });
  if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
  flashUndoBtnFor5s();
}

function collectImgKeysFromState(obj) {
  const keys = new Set();
  const addKey = (ref) => {
    if (typeof ref === "string" && ref.startsWith("img:")) keys.add(ref.slice(4));
  };
  (obj.series || []).forEach((s) => {
    addKey(s.cover);
    (s.sections || []).forEach((sec) => {
      addKey(sec.image);
      (sec.volumes || []).forEach((v) => addKey(v.image));
    });
  });
  (obj.giftGroups || []).forEach((g) => {
    addKey(g.cover);
    (g.gifts || []).forEach((it) => addKey(it.image));
  });
  return keys;
}

function performUndo() {
  if (!undoStack.length) {
    hideUndoBtn();
    showToast("Không còn bước nào để hoàn tác.");
    return;
  }
  const entry = undoStack.pop();
  const restored = structuredClone(entry.snap);
  const neededKeys = collectImgKeysFromState(restored);
  const rebuiltPool = {};
  neededKeys.forEach((k) => {
    if (undoImageBank[k]) rebuiltPool[k] = undoImageBank[k];
    else if (state.images && state.images[k]) rebuiltPool[k] = state.images[k];
  });
  restored.images = rebuiltPool;
  state = migrateStateData(restored);
  saveState();
  applyTheme();
  applyFxLevel();
  applySoundUI();
  applyCatVisibility();
  renderAll();
  closeModal();
  if (undoStack.length > 0) flashUndoBtnFor5s();
  else hideUndoBtn();
  SFX.undo();
  showToast(`Đã hoàn tác: ${entry.label}`);
}

// Toast thông minh: nút "Hoàn tác" hiện đúng 5 giây cùng nhịp với nút trên header
let toastTimer = null;
function showToast(msg, opts = {}) {
  const el = document.getElementById("toast");
  const undoable = Boolean(opts && opts.undoable && undoStack.length > 0);
  const duration = opts.duration || (undoable ? UNDO_BTN_DURATION_MS : 2600);
  el.innerHTML = `<span>${esc(msg)}</span>${
    undoable ? `<button type="button" class="toast-undo-btn" id="toastUndoAction">Hoàn tác</button>` : ""
  }`;
  if (undoable) {
    const ub = el.querySelector("#toastUndoAction");
    if (ub) {
      ub.addEventListener("click", (e) => {
        e.stopPropagation();
        clearTimeout(toastTimer);
        el.classList.remove("show");
        performUndo();
      });
    }
  }
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), duration);
}

// ============================
// HIỆU ỨNG BẤM NÚT RÕ RÀNG TRÊN IPHONE (PRESS + RIPPLE)
// ============================
const PRESS_SELECTOR =
  ".btn, .icon-btn, .chip, .preset-chip, .ck-btn, .missing-chip, .status-cycle, .tab-btn, .seg button, .scope-switch button, .scope-switch-3 button, .section-card, .book-card, .book-row, .vol-card, .vol-compact-cell, .gift-group-card";
const RIPPLE_SELECTOR =
  ".btn, .icon-btn, .chip, .preset-chip, .ck-btn, .missing-chip, .status-cycle, .seg button, .scope-switch button, .scope-switch-3 button";
let activePressedEl = null;

function releasePressedEl() {
  if (!activePressedEl) return;
  const el = activePressedEl;
  activePressedEl = null;
  setTimeout(() => el.classList.remove("is-pressed"), 90);
}

document.addEventListener(
  "pointerdown",
  (e) => {
    const target = e.target.closest(PRESS_SELECTOR);
    if (!target || target.disabled) return;
    if (activePressedEl && activePressedEl !== target) {
      activePressedEl.classList.remove("is-pressed");
    }
    activePressedEl = target;
    target.classList.add("is-pressed");

    // Chỉ mở khoá AudioContext im lặng trên iOS (KHÔNG phát tiếng ở pointerdown để lúc cuộn trang không bị kêu bừa!)
    ensureAudioCtx();

    // Hiệu ứng gợn sóng nhẹ cho các nút bấm
    if (target.matches(RIPPLE_SELECTOR)) {
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement("span");
      ripple.className = "tap-ripple";
      ripple.style.width = size + "px";
      ripple.style.height = size + "px";
      ripple.style.left = e.clientX - rect.left - size / 2 + "px";
      ripple.style.top = e.clientY - rect.top - size / 2 + "px";
      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 400);
    }
  },
  { passive: true }
);

document.addEventListener("pointerup", releasePressedEl, { passive: true });

// Phát tiếng trên sự kiện CLICK thật (đảm bảo cuộn trang 100% im lặng + không chồng 2 tiếng!)
const FILTER_CLICK_SEL =
  ".chip, .preset-chip, .ck-btn, .missing-chip, .seg button, .scope-switch button, .scope-switch-3 button";
const BACK_CLICK_SEL =
  "#backToSeriesBtn, #backFromSecFormBtn, #backSecBtn, #backBulkBtn, #lbDoneBtn, #backGiftGroupBtn";
const SILENT_FALLBACK_SEL =
  "#themeBtn, #soundBtn, #undoBtn, #modalCloseBtn, .status-cycle, .tab-btn, .shelf-book-group, #bookGroupSwitch button, [data-sndval]";

document.addEventListener("click", (e) => {
  // Nếu nút vừa bấm đã tự phát tiếng chuyên biệt (mở sách, rút kệ, lưu, xoá, đóng, chuyển tab...) -> bỏ qua không phát chồng!
  if (performance.now() - lastSfxAt < 110) return;
  const target = e.target.closest(PRESS_SELECTOR);
  if (!target || target.disabled) return;
  if (target.matches(SILENT_FALLBACK_SEL)) return;

  if (target.matches(BACK_CLICK_SEL)) {
    SFX.close();
  } else if (target.matches(FILTER_CLICK_SEL)) {
    SFX.filter();
  } else if (target.matches(".btn, .icon-btn")) {
    SFX.tap();
  }
});

// ============================
// HỆ THỐNG ÂM THANH CỐ ĐỊNH TỪNG MỤC (100% KHÔNG RANDOM · KHÔNG CHỒNG TIẾNG)
// - Bộ đệm nhiễu cố định bằng PRNG có seed -> bấm 100 lần kêu chuẩn y hệt nhau
// - Mỗi mục (4 Tab, Mở sách, Rút kệ, Lọc chip, Lưu, Đóng, Xoá, Chụp bìa) có âm thanh riêng
// - Tuỳ chỉnh độc lập từng mục trong Cài đặt
// ============================
let audioCtx = null;
let lastSfxAt = 0;
const detBufferCache = new Map();

// Gán CỐ ĐỊNH 100% âm thanh cho từng thanh / khu vực (không random, không cần chỉnh tay)
const FIXED_SOUND_MAP = {
  tabs: "marble",      // 4 Tab đáy (mỗi tab 1 cao độ riêng cố định)
  group: "console",    // Thanh Tất cả / Truyện / Sách (Switch Snap siêu mượt)
  filter: "tactile",   // Thanh chip lọc loại, NXB, Lưới/Dòng/Kệ, %CK (Tactile giòn nhẹ)
  book: "marble",      // Mở thẻ sách / mục / tập
  shelf: "paper",      // Rút sách trên Kệ (lật giấy + gỗ)
  save: "marble",      // Lưu & thêm tập (+T.x)
  close: "marble",     // Đóng bảng / quay lại
  del: "tactile",      // Xoá & hoàn tác
  camera: "watch",     // Chụp bìa AI & Xuất hoá đơn (màn trập máy ảnh)
};

function markSfx() {
  lastSfxAt = performance.now();
}

function isSoundOn() {
  return state.soundEnabled !== false;
}

function getSectionVoice(sectionKey) {
  return FIXED_SOUND_MAP[sectionKey] || "marble";
}

function ensureAudioCtx() {
  if (!isSoundOn()) return null;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Tạo buffer nhiễu CỐ ĐỊNH (seeded PRNG + chuẩn hoá biên độ) -> không bao giờ bị biến thiên random giữa các lần bấm!
function getDetNoiseBuffer(ctx, duration, decayPow = 2.6, shape = "decay", seed = 0x54555341) {
  const samples = Math.max(16, Math.floor(ctx.sampleRate * duration));
  const key = `${ctx.sampleRate}_${samples}_${decayPow}_${shape}_${seed}`;
  if (detBufferCache.has(key)) return detBufferCache.get(key);

  const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  let a = seed >>> 0;
  let sumSq = 0;
  for (let i = 0; i < samples; i++) {
    // Mulberry32 deterministic PRNG
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const rnd = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    const p = i / samples;
    const env = shape === "arch" ? Math.sin(p * Math.PI) : Math.pow(1 - p, decayPow);
    const v = rnd * env;
    ch[i] = v;
    sumSq += v * v;
  }
  // Chuẩn hoá năng lượng RMS để âm lượng luôn đều tăm tắp
  const rms = Math.sqrt(sumSq / samples) || 1;
  const norm = Math.min(2.2, 0.32 / rms);
  for (let i = 0; i < samples; i++) ch[i] = Math.max(-1, Math.min(1, ch[i] * norm));

  detBufferCache.set(key, buf);
  return buf;
}

function playModalResonance(opts) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime + (opts.delay || 0);
    const bodyDur = opts.bodyDur || 0.032;
    const gain = opts.gain || 0.15;

    if (opts.f1) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.wave || "sine";
      osc.frequency.setValueAtTime(opts.f1, now);
      if (opts.f2 && opts.f2 !== opts.f1) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(85, opts.f2), now + bodyDur);
      }
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, now + bodyDur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + bodyDur + 0.012);
    }

    const modes = opts.modes || [];
    if (modes.length) {
      const nDur = opts.noiseDur || 0.016;
      const buf = getDetNoiseBuffer(ctx, nDur, opts.decayPow || 2.6, opts.shape || "decay", opts.seed || 0x54555341);
      modes.forEach((m) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = m.freq;
        bp.Q.value = m.q || 4.8;
        const mg = ctx.createGain();
        const pk = gain * (m.amp || 0.85);
        mg.gain.setValueAtTime(0.0001, now);
        mg.gain.linearRampToValueAtTime(pk, now + 0.0012);
        mg.gain.exponentialRampToValueAtTime(0.0001, now + nDur);
        src.connect(bp);
        bp.connect(mg);
        mg.connect(ctx.destination);
        src.start(now);
      });
    }
  } catch {}
}

function playCleanChime(freq, duration = 0.13, gain = 0.085, delay = 0, overtoneRatio = 2.0) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime + delay;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    o1.type = "sine";
    o2.type = "triangle";
    o1.frequency.setValueAtTime(freq, now);
    o2.frequency.setValueAtTime(freq * overtoneRatio, now);
    g1.gain.setValueAtTime(0.0001, now);
    g1.gain.linearRampToValueAtTime(gain, now + 0.004);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.linearRampToValueAtTime(gain * 0.2, now + 0.002);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(0.032, duration * 0.4));
    o1.connect(g1);
    o2.connect(g2);
    g1.connect(ctx.destination);
    g2.connect(ctx.destination);
    o1.start(now);
    o2.start(now);
    o1.stop(now + duration + 0.015);
    o2.stop(now + 0.045);
  } catch {}
}

function playPaperBrush(cutoff = 1250, duration = 0.052, gain = 0.048, delay = 0, seed = 0x11223344) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  try {
    const buf = getDetNoiseBuffer(ctx, duration, 1.0, "arch", seed);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = cutoff;
    bp.Q.value = 1.05;
    const g = ctx.createGain();
    const now = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + duration * 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  } catch {}
}

// Bộ phát chất liệu âm chuẩn cho từng giọng (pitchScale giúp mỗi mục có sắc thái riêng rõ rệt)
function playVoiceStrike(voice, pitchScale = 1.0, delay = 0, gainScale = 1.0) {
  if (voice === "off") return;
  const ps = pitchScale;
  const gs = gainScale;
  if (voice === "marble") {
    playModalResonance({
      delay, f1: 310 * ps, f2: 165 * ps, bodyDur: 0.032, gain: 0.15 * gs, wave: "sine",
      noiseDur: 0.017, decayPow: 2.8, seed: 0x202601,
      modes: [{ freq: 1180 * ps, q: 5.5, amp: 0.92 }, { freq: 2380 * ps, q: 6.2, amp: 0.48 }],
    });
  } else if (voice === "tactile") {
    playModalResonance({
      delay, f1: 500 * ps, f2: 330 * ps, bodyDur: 0.011, gain: 0.075 * gs, wave: "triangle",
      noiseDur: 0.008, seed: 0x202602, modes: [{ freq: 2450 * ps, q: 3.8, amp: 0.75 }],
    });
    playModalResonance({
      delay: delay + 0.012, f1: 365 * ps, f2: 185 * ps, bodyDur: 0.032, gain: 0.15 * gs, wave: "triangle",
      noiseDur: 0.015, seed: 0x202603, modes: [{ freq: 1560 * ps, q: 4.2, amp: 0.88 }],
    });
  } else if (voice === "console") {
    playModalResonance({
      delay, f1: 510 * ps, f2: 375 * ps, bodyDur: 0.024, gain: 0.12 * gs, wave: "sine",
      noiseDur: 0.01, seed: 0x202604, modes: [{ freq: 2150 * ps, q: 5.0, amp: 0.55 }],
    });
  } else if (voice === "watch") {
    playModalResonance({
      delay, f1: 280 * ps, f2: 175 * ps, bodyDur: 0.015, gain: 0.12 * gs, wave: "sine",
      noiseDur: 0.007, decayPow: 3.4, seed: 0x202605,
      modes: [{ freq: 2850 * ps, q: 6.2, amp: 1.0 }, { freq: 4350 * ps, q: 6.5, amp: 0.5 }],
    });
  } else {
    // "paper" — lật giấy + gõ bìa gỗ đặc ấm
    playPaperBrush(1050 * ps, 0.048, 0.046 * gs, delay, 0x202606);
    playModalResonance({
      delay: delay + 0.014, f1: 245 * ps, f2: 135 * ps, bodyDur: 0.036, gain: 0.14 * gs, wave: "sine",
      noiseDur: 0.015, decayPow: 2.5, seed: 0x202607, modes: [{ freq: 920 * ps, q: 3.2, amp: 0.72 }],
    });
  }
}

const SFX = {
  // 1. Nút bấm hành động chung
  tap() {
    const v = getSectionVoice("book");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 1.0, 0, 0.92);
  },

  // Thanh chuyển Tất cả / Truyện / Sách (cố định Switch Snap 3 bậc êm mượt)
  groupSwitch(idx = 0) {
    if (!isSoundOn()) return;
    markSfx();
    const pitch = idx === 0 ? 0.96 : idx === 1 ? 1.08 : 1.2;
    playVoiceStrike("console", pitch, 0, 0.92);
  },

  // 2. Thanh lọc chip / NXB / Chế độ Lưới-Dòng-Kệ / %CK (cố định Tactile giòn nhẹ)
  filter() {
    const v = getSectionVoice("filter");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 1.26, 0, 0.86);
  },
  chip() {
    this.filter();
  },

  // 3. 4 Tab chính dưới đáy: MỖI TAB 1 ĐẶC TRƯNG & CAO ĐỘ RIÊNG BIỆT!
  tab(tabName = "books") {
    const v = getSectionVoice("tabs");
    if (v === "off") return;
    markSfx();
    if (tabName === "books") {
      // Tủ sách: trầm ấm chắc tay (bìa sách)
      playPaperBrush(920, 0.045, 0.036, 0, 0x3101);
      playVoiceStrike(v, 0.9, 0.01, 1.0);
    } else if (tabName === "merch") {
      // Quà & Đồ: sáng trong nhẹ (hộp quà)
      playVoiceStrike(v, 1.15, 0, 0.92);
      playCleanChime(523.25, 0.085, 0.055, 0.016, 2.0);
    } else if (tabName === "news") {
      // Tin NXB: tiếng giở tờ báo sắc gọn
      playPaperBrush(1680, 0.055, 0.052, 0, 0x3103);
      playVoiceStrike(v, 1.28, 0.018, 0.85);
    } else if (tabName === "spending") {
      // Chi tiêu: tiếng phím tính tiền sắc rõ
      playVoiceStrike(v, 1.38, 0, 0.9);
      playVoiceStrike(v, 1.62, 0.042, 0.65);
    } else {
      playVoiceStrike(v, 1.0, 0, 0.9);
    }
  },

  // 4. Mở thẻ sách / Mở mục / Mở tập (2 nhịp lật mở đi lên)
  openBook() {
    const v = getSectionVoice("book");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 0.92, 0, 0.9);
    playVoiceStrike(v, 1.2, 0.042, 0.85);
  },

  // Mở bảng/modal chung (chỉ kêu nếu trước đó chưa có tiếng chuyên biệt như openBook / shelfPull / shutter)
  open() {
    if (performance.now() - lastSfxAt < 320) return;
    const v = getSectionVoice("book");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 0.95, 0, 0.85);
    playVoiceStrike(v, 1.18, 0.045, 0.8);
  },

  // 5. Rút sách khỏi Kệ gỗ (tiếng trượt ma sát + khấc rút riêng biệt cho chế độ Kệ)
  shelfPull() {
    const v = getSectionVoice("shelf");
    if (v === "off") return;
    markSfx();
    playPaperBrush(980, 0.072, 0.052, 0, 0x4101);
    playVoiceStrike(v, 0.94, 0.028, 0.92);
    playVoiceStrike(v, 1.22, 0.064, 0.82);
  },

  // 6. Đóng bảng / Huỷ / Quay lại (1 nhịp trầm gọn gập xuống)
  close() {
    const v = getSectionVoice("close");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 0.78, 0, 0.9);
  },

  // 7. Thêm nhanh 1 tập / Gắn ảnh / Bật tiếng
  pop() {
    const v = getSectionVoice("save");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 1.12, 0, 0.95);
    playCleanChime(587.33, 0.095, 0.065, 0.02, 2.0);
  },

  // Đổi trạng thái Quà (3 bậc rõ ràng: Đã có / Đang ship / Đang săn)
  status(idx = 0) {
    const v = getSectionVoice("filter");
    if (v === "off") return;
    markSfx();
    const freqs = [392.0, 493.88, 587.33];
    playVoiceStrike(v, 1.05 + (idx % 3) * 0.14, 0, 0.82);
    playCleanChime(freqs[idx % freqs.length], 0.11, 0.075, 0.014, 2.0);
  },

  // 8. Lưu thành công / Nhập nhiều bộ / AI đọc xong
  success() {
    const v = getSectionVoice("save");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 0.96, 0, 0.95);
    playVoiceStrike(v, 1.26, 0.055, 0.88);
    playCleanChime(523.25, 0.12, 0.07, 0.045, 2.0);
    playCleanChime(659.25, 0.18, 0.085, 0.11, 2.0);
  },

  // 9. Xoá (2 nhịp rơi trầm dứt khoát)
  del() {
    const v = getSectionVoice("del");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 0.95, 0, 1.0);
    playVoiceStrike(v, 0.68, 0.056, 1.05);
  },

  // Hoàn tác (2 nhịp kéo ngược đi lên)
  undo() {
    const v = getSectionVoice("del");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 0.76, 0, 0.9);
    playVoiceStrike(v, 1.18, 0.05, 0.95);
  },

  // 10. Chụp bìa AI / Xuất Hoá đơn hiệu sách (Màn trập máy ảnh cơ)
  shutter() {
    const v = getSectionVoice("camera");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, 1.18, 0, 1.0);
    playVoiceStrike(v, 0.92, 0.052, 0.82);
  },

  // Công tắc đèn Đèn bàn / Giấy ấm
  lamp(toDark) {
    const v = getSectionVoice("filter");
    if (v === "off") return;
    markSfx();
    playVoiceStrike(v, toDark ? 0.84 : 1.24, 0, 1.0);
  },

  // Báo lỗi
  error() {
    markSfx();
    playModalResonance({
      f1: 230, f2: 145, bodyDur: 0.038, gain: 0.15, wave: "triangle",
      noiseDur: 0.015, seed: 0x9901, modes: [{ freq: 720, q: 3.8, amp: 0.7 }],
    });
    playModalResonance({
      delay: 0.095, f1: 195, f2: 120, bodyDur: 0.048, gain: 0.15, wave: "triangle",
      noiseDur: 0.018, seed: 0x9902, modes: [{ freq: 600, q: 3.8, amp: 0.7 }],
    });
  },

  // Nghe thử từng mục cụ thể trong Cài đặt
  previewSection(sectionKey) {
    if (sectionKey === "tabs") {
      this.tab("books");
      setTimeout(() => this.tab("merch"), 170);
      setTimeout(() => this.tab("news"), 340);
      setTimeout(() => this.tab("spending"), 510);
    } else if (sectionKey === "book") this.openBook();
    else if (sectionKey === "shelf") this.shelfPull();
    else if (sectionKey === "filter") this.filter();
    else if (sectionKey === "save") this.success();
    else if (sectionKey === "close") this.close();
    else if (sectionKey === "del") this.del();
    else if (sectionKey === "camera") this.shutter();
  },

  catTap(isFast = false) {
    if (!isSoundOn()) return;
    markSfx();
    playModalResonance({
      f1: isFast ? 480 : 340,
      f2: isFast ? 290 : 210,
      bodyDur: isFast ? 0.02 : 0.026,
      gain: isFast ? 0.075 : 0.065,
      wave: "sine",
      noiseDur: 0.01,
      seed: isFast ? 0x7702 : 0x7701,
      modes: [{ freq: isFast ? 1850 : 1280, q: 5.0, amp: 0.45 }],
    });
  },
  catWake() {
    if (!isSoundOn()) return;
    markSfx();
    playCleanChime(587.33, 0.08, 0.055, 0, 1.5);
    playCleanChime(783.99, 0.1, 0.05, 0.045, 1.5);
  },
  catTired() {
    if (!isSoundOn()) return;
    markSfx();
    playPaperBrush(780, 0.14, 0.055, 0, 0x7705);
    playModalResonance({ f1: 310, f2: 180, bodyDur: 0.09, gain: 0.06, wave: "sine", delay: 0.02 });
  },
  demoPack() {
    this.filter();
    setTimeout(() => this.openBook(), 130);
    setTimeout(() => this.success(), 290);
  },
};

function applySoundUI() {
  const btn = document.getElementById("soundBtn");
  const svg = document.getElementById("soundIconSvg");
  const on = isSoundOn();
  if (btn) {
    btn.classList.toggle("sound-off", !on);
    btn.title = on ? "Đang bật âm thanh (chạm để tắt)" : "Đang tắt âm thanh (chạm để bật)";
  }
  if (svg) {
    svg.innerHTML = on
      ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'
      : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  }
}

document.addEventListener("pointercancel", releasePressedEl, { passive: true });
document.addEventListener("scroll", releasePressedEl, { passive: true, capture: true });

// Hiệu ứng & Chuyển động
function isRichFx() {
  return (state.fxLevel || "rich") !== "minimal";
}


// ============================
// MÀU CHỦ ĐẠO (AMBIENT GLOW) + NHẬN DIỆN BẢN ĐB (HOLO) + NGHIÊNG 3D
// ============================
const dominantColorCache = new Map();

function pubFallbackRGB(pub) {
  if (pub === "Trẻ") return [168, 58, 47];
  if (pub === "Kim Đồng") return [46, 82, 120];
  if (pub === "IPM") return [47, 93, 80];
  if (pub === "Nhã Nam") return [143, 100, 36];
  return [122, 92, 68];
}

function extractDominantColor(imgSrc, fallbackPub = "Khác") {
  const fb = pubFallbackRGB(fallbackPub);
  if (!imgSrc) return Promise.resolve(fb);
  const cacheKey = imgSrc.length > 120 ? hashStringFast(imgSrc) : imgSrc;
  if (dominantColorCache.has(cacheKey)) {
    return Promise.resolve(dominantColorCache.get(cacheKey));
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 120) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 510;
          if (lum < 0.08 || lum > 0.94) continue;
          const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lum - 1)) / 255;
          const weight = 0.25 + sat * 2.2;
          rSum += r * weight;
          gSum += g * weight;
          bSum += b * weight;
          wSum += weight;
        }
        if (wSum > 0) {
          const rgb = [Math.round(rSum / wSum), Math.round(gSum / wSum), Math.round(bSum / wSum)];
          dominantColorCache.set(cacheKey, rgb);
          resolve(rgb);
          return;
        }
      } catch {}
      dominantColorCache.set(cacheKey, fb);
      resolve(fb);
    };
    img.onerror = () => resolve(fb);
    img.src = imgSrc;
  });
}

const HOLO_REGEX = /limited|đặc biệt|ban db|bản đb|boxset|box\b|artbook|bìa cứng|giới hạn|special|collector|deluxe|hologram/i;

function isSpecialSection(sec) {
  return Boolean(sec && HOLO_REGEX.test(`${sec.name || ""} ${sec.note || ""}`));
}

function isSpecialSeries(s) {
  if (!s) return false;
  if (s.category === "Artbook") return true;
  if (HOLO_REGEX.test(`${s.title || ""} ${s.note || ""}`)) return true;
  return (s.sections || []).some((sec) => isSpecialSection(sec));
}

function isSeriesFull(s) {
  if (!s) return false;
  if (s.status === "Đã full") return true;
  const tot = Math.round(Number(s.totalVolumes) || 0);
  if (tot > 0 && getAllSeriesVolumes(s).length >= tot) return true;
  return false;
}

function rgbToSpinePalette(rgb) {
  let [r, g, b] = rgb || [78, 70, 64];
  // Tăng độ trong màu nhẹ & giữ tông trầm sang kiểu gáy truyện in matte (tránh bùn xỉn)
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  if (maxC > minC) {
    const mid = (maxC + minC) / 2;
    r = Math.min(255, Math.max(0, Math.round(mid + (r - mid) * 1.28)));
    g = Math.min(255, Math.max(0, Math.round(mid + (g - mid) * 1.28)));
    b = Math.min(255, Math.max(0, Math.round(mid + (b - mid) * 1.28)));
  }
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const targetLum = 0.27;
  const factor = lum > 0.05 ? Math.min(1.45, Math.max(0.36, targetLum / lum)) : 1.1;
  const dr = Math.min(165, Math.max(28, Math.round(r * factor)));
  const dg = Math.min(165, Math.max(28, Math.round(g * factor)));
  const db = Math.min(165, Math.max(28, Math.round(b * factor)));
  const botR = Math.max(18, Math.round(dr * 0.7));
  const botG = Math.max(18, Math.round(dg * 0.7));
  const botB = Math.max(18, Math.round(db * 0.7));
  const slR = Math.max(16, Math.round(dr * 0.62));
  const slG = Math.max(16, Math.round(dg * 0.62));
  const slB = Math.max(16, Math.round(db * 0.62));
  const accR = Math.min(245, Math.round(dr * 1.55 + 32));
  const accG = Math.min(245, Math.round(dg * 1.55 + 32));
  const accB = Math.min(245, Math.round(db * 1.55 + 32));
  return {
    bg: `linear-gradient(180deg, rgb(${dr},${dg},${db}) 0%, rgb(${botR},${botG},${botB}) 100%)`,
    slice: `rgb(${slR},${slG},${slB})`,
    accent: `rgb(${accR},${accG},${accB})`,
  };
}

// Hiệu ứng nghiêng bìa 3D + Hologram theo ngón tay (hoạt động mượt trên iPhone & chuột)
let activeTiltEl = null;

function resetTiltEl(el) {
  if (!el) return;
  el.classList.remove("tilting");
  el.style.transform = "";
}

document.addEventListener(
  "pointermove",
  (e) => {
    if (!isRichFx()) return;
    const cover = e.target.closest(".book-cover, .vol-card-media, .ambient-cover");
    if (activeTiltEl && activeTiltEl !== cover) {
      resetTiltEl(activeTiltEl);
      activeTiltEl = null;
    }
    if (!cover) return;
    if (e.pointerType === "touch" && e.buttons === 0) return;
    activeTiltEl = cover;
    const rect = cover.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const rotY = (nx - 0.5) * 18;
    const rotX = (0.5 - ny) * 14;
    cover.classList.add("tilting");
    cover.style.setProperty("--mx", nx.toFixed(3));
    cover.style.setProperty("--my", ny.toFixed(3));
    cover.style.transform = `perspective(520px) rotateX(${rotX.toFixed(1)}deg) rotateY(${rotY.toFixed(1)}deg) scale(1.02)`;
  },
  { passive: true }
);

["pointerup", "pointercancel", "pointerleave"].forEach((evt) => {
  document.addEventListener(
    evt,
    () => {
      if (activeTiltEl) {
        resetTiltEl(activeTiltEl);
        activeTiltEl = null;
      }
    },
    { passive: true }
  );
});

// Nghiêng nhẹ ảnh bìa hero trong modal theo cảm biến con quay iPhone (nếu máy hỗ trợ)
function attachHeroGyroTilt(coverEl) {
  if (!coverEl || !isRichFx() || !("DeviceOrientationEvent" in window)) return () => {};
  const onOrient = (ev) => {
    if (ev.gamma === null || ev.beta === null) return;
    const gx = Math.max(-18, Math.min(18, ev.gamma)) / 18; // -1..1
    const gy = Math.max(-18, Math.min(18, ev.beta - 42)) / 18;
    coverEl.style.setProperty("--mx", (0.5 + gx * 0.45).toFixed(3));
    coverEl.style.setProperty("--my", (0.5 + gy * 0.45).toFixed(3));
    coverEl.style.transform = `perspective(520px) rotateX(${(-gy * 9).toFixed(1)}deg) rotateY(${(gx * 11).toFixed(1)}deg)`;
  };
  window.addEventListener("deviceorientation", onOrient, { passive: true });
  return () => window.removeEventListener("deviceorientation", onOrient);
}

function applyFxLevel() {
  document.documentElement.setAttribute("data-fx", isRichFx() ? "rich" : "minimal");
}

function spawnCelebration(originX, originY, count = 14) {
  if (!isRichFx()) return;
  const cx = typeof originX === "number" ? originX : window.innerWidth / 2;
  const cy = typeof originY === "number" ? originY : window.innerHeight * 0.42;
  const colors = ["#9E472A", "#2F5D50", "#CCA05C", "#CE6E4E", "#62A08D", "#D9A84E"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "fx-particle";
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
    const dist = 36 + Math.random() * 68;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist - 18;
    const rot = Math.round((Math.random() - 0.5) * 320);
    const w = 5 + Math.round(Math.random() * 4);
    const h = 4 + Math.round(Math.random() * 5);
    p.style.left = cx + "px";
    p.style.top = cy + "px";
    p.style.width = w + "px";
    p.style.height = h + "px";
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--tx", `${tx.toFixed(1)}px`);
    p.style.setProperty("--ty", `${ty.toFixed(1)}px`);
    p.style.setProperty("--rot", `${rot}deg`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 660);
  }
}

function spawnCelebrationFromEl(el, count = 14) {
  if (!el) return spawnCelebration(undefined, undefined, count);
  const r = el.getBoundingClientRect();
  spawnCelebration(r.left + r.width / 2, r.top + r.height / 2, count);
}

function triggerThemeWash(btnEl, toDark) {
  if (!isRichFx()) return;
  const wave = document.createElement("div");
  wave.className = "theme-wave";
  let ox = "80%";
  let oy = "28px";
  if (btnEl) {
    const r = btnEl.getBoundingClientRect();
    ox = `${Math.round(r.left + r.width / 2)}px`;
    oy = `${Math.round(r.top + r.height / 2)}px`;
  }
  wave.style.background = toDark
    ? `radial-gradient(circle at ${ox} ${oy}, rgba(20, 19, 18, 0.72), transparent 64%)`
    : `radial-gradient(circle at ${ox} ${oy}, rgba(246, 245, 241, 0.85), transparent 64%)`;
  wave.style.transformOrigin = `${ox} ${oy}`;
  document.body.appendChild(wave);
  setTimeout(() => wave.remove(), 480);
}

function animateCountUp(el, targetVal, fmtFn = fmtMoney, duration = 460) {
  if (!el) return;
  if (!isRichFx() || targetVal === 0) {
    el.textContent = fmtFn(targetVal);
    return;
  }
  const start = performance.now();
  const sign = targetVal < 0 ? -1 : 1;
  const absTarget = Math.abs(targetVal);
  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const cur = Math.round(absTarget * eased) * sign;
    el.textContent = fmtFn(cur);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = fmtFn(targetVal);
  };
  requestAnimationFrame(step);
}

// Topbar scroll shadow
const topbarEl = document.querySelector(".topbar");
window.addEventListener(
  "scroll",
  () => {
    if (topbarEl) topbarEl.classList.toggle("scrolled", window.scrollY > 6);
  },
  { passive: true }
);

// 3 Bảng màu giấy (Giấy ấm, Đèn bàn, Xanh đêm)
const THEME_LIST = [
  { id: "light", label: "Giấy ấm", bg: "#F6F5F1", dot: "#EFE8D8", ink: "#1C1B19", dark: false },
  { id: "dark", label: "Đèn bàn", bg: "#141312", dot: "#2A2622", ink: "#EDEAE3", dark: true },
  { id: "midnight", label: "Xanh đêm", bg: "#0E1521", dot: "#1E304D", ink: "#E8F0FA", dark: true },
];

function getThemeInfo(id = state.theme) {
  return THEME_LIST.find((t) => t.id === id) || THEME_LIST[0];
}

function isDarkTheme() {
  return getThemeInfo().dark;
}

function applyTheme() {
  const info = getThemeInfo();
  document.documentElement.setAttribute("data-theme", info.id);
  const lbl = document.getElementById("themeLabel");
  if (lbl) lbl.textContent = info.label;
  const dot = document.getElementById("themeDotMini");
  if (dot) dot.style.background = info.dot;
  document.getElementById("metaThemeColor").setAttribute("content", info.bg);
}

// Modal helpers (with smooth open/close & drill-down step transition)
const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitleEl = document.getElementById("modalTitle");
const modalBodyEl = document.getElementById("modalBody");

let currentModalCleanup = null;
let modalCloseTimer = null;

function openModal(title, html, onMount, onClose = null) {
  if (modalCloseTimer) {
    clearTimeout(modalCloseTimer);
    modalCloseTimer = null;
  }
  if (typeof currentModalCleanup === "function") {
    try { currentModalCleanup(); } catch {}
    currentModalCleanup = null;
  }
  const wasAlreadyOpen = modalBackdrop.classList.contains("open") && !modalBackdrop.classList.contains("closing");
  modalBackdrop.classList.remove("closing");
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = html;
  modalBodyEl.scrollTop = 0;
  if (!wasAlreadyOpen) SFX.open();
  modalBackdrop.classList.add("open");

  if (wasAlreadyOpen && isRichFx()) {
    modalBodyEl.classList.remove("step-in");
    void modalBodyEl.offsetWidth;
    modalBodyEl.classList.add("step-in");
  } else {
    modalBodyEl.classList.remove("step-in");
  }

  currentModalCleanup = typeof onClose === "function" ? onClose : null;
  if (typeof onMount === "function") onMount(modalBodyEl);
}

function closeModal() {
  if (modalBackdrop.classList.contains("open") && !modalBackdrop.classList.contains("closing")) SFX.close();
  if (typeof currentModalCleanup === "function") {
    try { currentModalCleanup(); } catch {}
    currentModalCleanup = null;
  }
  if (!modalBackdrop.classList.contains("open")) return;
  if (!isRichFx()) {
    modalBackdrop.classList.remove("open", "closing");
    return;
  }
  modalBackdrop.classList.add("closing");
  clearTimeout(modalCloseTimer);
  modalCloseTimer = setTimeout(() => {
    modalBackdrop.classList.remove("open", "closing");
    modalCloseTimer = null;
  }, 200);
}

document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// Header Summary
function updateHeaderSummary() {
  const seriesCount = state.series.length;
  const volCount = state.series.reduce((sum, s) => sum + getAllSeriesVolumes(s).length, 0);
  document.getElementById("headerSummary").textContent = `${seriesCount} đầu sách · ${volCount} tập`;
}

// Nén ảnh chọn từ máy (iPhone/Laptop) để lưu nhẹ trong localStorage
function compressImageFile(file, maxW = 320, maxH = 480, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const ratio = Math.min(maxW / w, maxH / h, 1);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
