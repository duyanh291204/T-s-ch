"use strict";

const CK_PRESETS = [0, 5, 10, 15, 20, 25, 30];

const STORAGE_KEY = "tusach_app_v2";
const IDB_MIGRATED_FLAG = "tusach_idb_migrated_v1";
const TEXT_SHADOW_KEY = "tusach_text_shadow_v1";

const DEFAULT_STATE = {
  theme: "light",
  fxLevel: "rich", // "rich" | "minimal"
  catEnabled: true,
  catCoat: "blue", // "blue" | "yellow" | "gray" | "white" | "black"
  soundEnabled: true,
  soundPack: "marble", // "marble" | "tactile" | "console" | "watch"
  soundMap: {
    tabs: "auto",
    book: "auto",
    shelf: "paper",
    filter: "auto",
    save: "auto",
    close: "auto",
    del: "auto",
    camera: "watch",
  },
  bookView: "grid",
  merchView: "list", // "list" | "gallery"
  volView: "cards", // "cards" | "compact"
  budgetLimit: 1000000,
  aiNewsCache: { updatedAt: "", items: [] },
  geminiApiKey: "",
  geminiModel: "",
  lastBackupAt: "",
  lastEntry: {
    publisher: "Kim Đồng",
    category: "Manga",
    sectionName: "Bản thường",
    coverPrice: 35000,
    discount: 15,
  },
  series: [],     // { id, title, publisher, category, status, aliases, note, cover, createdAt, sections: [{ id, name, note, volumes: [...] }] }
  giftGroups: [], // { id, title, publisher, cover, note, createdAt, gifts: [{ id, name, quantity, price, source, status, date, image, note }] }
  pinned: [],     // { id, title, publisher, type, channel, releaseDate, estPrice, gift, url, manual }
  images: {},     // Kho ảnh chống trùng lặp: { hashId: "data:image/jpeg;base64,..." }
};

// ============================
// BỘ LƯU TRỮ INDEXEDDB CHỐNG MẤT DỮ LIỆU CHO IPHONE
// - Chống ghi đè khi app đang load (appReady lock)
// - Tự nối lại khi iOS ngắt kết nối IDB nền (auto-retry)
// - Không bao giờ tự đọc lại localStorage cũ ghi đè IDB
// - Lưu kèm 1 bản text-only (<100KB) dự phòng khẩn cấp
// ============================
const IDB_NAME = "tusach_db_v1";
const IDB_STORE = "kv";
let idbInstance = null;
let storageEngine = "IndexedDB";
let appReady = false;
let pendingSaves = 0;
let saveChain = Promise.resolve();
let lastSaveErrorShown = 0;

function setSaveStatus(status, text) {
  const el = document.getElementById("saveIndicator");
  if (!el) return;
  el.textContent = text || "";
  el.className = "save-status mono" + (status ? " " + status : "");
}

function resetIDBHandle() {
  if (idbInstance) {
    try { idbInstance.close(); } catch {}
  }
  idbInstance = null;
}

function openIDB() {
  if (idbInstance) return Promise.resolve(idbInstance);
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Trình duyệt không hỗ trợ IndexedDB"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      idbInstance = req.result;
      idbInstance.onclose = () => { idbInstance = null; };
      idbInstance.onversionchange = () => { resetIDBHandle(); };
      resolve(idbInstance);
    };
    req.onerror = () => reject(req.error || new Error("Lỗi mở IndexedDB"));
    req.onblocked = () => reject(new Error("IndexedDB đang bị tab khác khoá"));
  });
}

async function idbGet(key) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const db = await openIDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error || new Error("IDB read abort"));
      });
    } catch (err) {
      resetIDBHandle();
      if (attempt === 1) throw err;
    }
  }
  return null;
}

async function idbSet(key, val) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const db = await openIDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("Lỗi ghi IndexedDB"));
        tx.onabort = () => reject(tx.error || new Error("Giao dịch IndexedDB bị huỷ"));
      });
    } catch (err) {
      resetIDBHandle();
      if (attempt === 1) throw err;
    }
  }
  return false;
}

function hashStringFast(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36) + "_" + str.length.toString(36);
}

function resolveImg(ref) {
  if (!ref) return "";
  if (typeof ref === "string" && ref.startsWith("img:")) {
    return (state.images && state.images[ref.slice(4)]) || "";
  }
  return ref;
}

function compactImagesInState(obj) {
  if (!obj || typeof obj !== "object") return;
  const oldPool = obj.images && typeof obj.images === "object" ? obj.images : {};
  const nextPool = {};

  const packRef = (val) => {
    if (!val || typeof val !== "string") return "";
    if (val.startsWith("img:")) {
      const key = val.slice(4);
      if (oldPool[key]) {
        nextPool[key] = oldPool[key];
        return val;
      }
      return "";
    }
    if (val.startsWith("data:image/")) {
      const key = hashStringFast(val);
      nextPool[key] = val;
      return "img:" + key;
    }
    return val;
  };

  (obj.series || []).forEach((s) => {
    s.cover = packRef(s.cover);
    (s.sections || []).forEach((sec) => {
      sec.image = packRef(sec.image);
      (sec.volumes || []).forEach((v) => {
        v.image = packRef(v.image);
      });
    });
  });

  (obj.giftGroups || []).forEach((g) => {
    g.cover = packRef(g.cover);
    (g.gifts || []).forEach((it) => {
      it.image = packRef(it.image);
    });
  });

  obj.images = nextPool;
}

// Tạo bản sao chỉ gồm chữ & số (bỏ ảnh) siêu nhẹ để cất dự phòng khẩn cấp vào localStorage
function writeTextOnlyShadow(snapshot) {
  try {
    const shadow = {
      ...snapshot,
      images: {},
      series: (snapshot.series || []).map((s) => ({
        ...s,
        cover: "",
        sections: (s.sections || []).map((sec) => ({
          ...sec,
          image: "",
          volumes: (sec.volumes || []).map((v) => ({ ...v, image: "" })),
        })),
      })),
      giftGroups: (snapshot.giftGroups || []).map((g) => ({
        ...g,
        cover: "",
        gifts: (g.gifts || []).map((it) => ({ ...it, image: "" })),
      })),
      shadowSavedAt: new Date().toISOString(),
    };
    localStorage.setItem(TEXT_SHADOW_KEY, JSON.stringify(shadow));
  } catch {}
}

function readTextOnlyShadow() {
  try {
    const raw = localStorage.getItem(TEXT_SHADOW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function estimateStateBytes(obj) {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return JSON.stringify(obj).length;
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function migrateStateData(rawObj) {
  const merged = {
    ...structuredClone(DEFAULT_STATE),
    ...(rawObj || {}),
    series: Array.isArray(rawObj?.series) ? rawObj.series : [],
    giftGroups: Array.isArray(rawObj?.giftGroups) ? rawObj.giftGroups : [],
    pinned: Array.isArray(rawObj?.pinned) ? rawObj.pinned : [],
    images: rawObj?.images && typeof rawObj.images === "object" ? { ...rawObj.images } : {},
    lastEntry: { ...DEFAULT_STATE.lastEntry, ...(rawObj?.lastEntry || {}) },
    soundMap: { ...DEFAULT_STATE.soundMap, ...(rawObj?.soundMap || {}) },
  };

  const edNameMap = {
    "Thường": "Manga — Bản thường",
    "ĐB / Limited": "Limited",
    "Tái bản": "Tái bản",
    "Boxset": "Boxset",
  };
  merged.series = merged.series.map((s) => {
    const copy = { author: "", ...s };
    if (!Array.isArray(copy.sections)) {
      const legacyVols = Array.isArray(copy.volumes) ? copy.volumes : [];
      const byEd = new Map();
      legacyVols.forEach((v) => {
        const secName = edNameMap[v.edition] || v.edition || "Bản thường";
        if (!byEd.has(secName)) byEd.set(secName, []);
        byEd.get(secName).push({
          id: v.id || uid(),
          number: Number(v.number) || 1,
          coverPrice: Math.max(0, Number(v.coverPrice) || 0),
          paidPrice: Math.max(0, Number(v.paidPrice) || 0),
          date: v.date || todayISO(),
          isLegacy: Boolean(v.isLegacy),
          image: v.image || "",
          readState: v.readState || "Chưa đọc",
          lentTo: v.lentTo || "",
          note: v.note || "",
          groupId: v.boxsetId || v.groupId || "",
          groupLabel: v.boxsetLabel || v.groupLabel || "",
        });
      });
      copy.sections = [...byEd.entries()].map(([name, vols]) => ({
        id: uid(),
        name,
        image: "",
        note: "",
        volumes: vols,
      }));
    } else {
      copy.sections = copy.sections.map((sec) => ({
        id: sec.id || uid(),
        name: sec.name || "Mục chưa đặt tên",
        image: sec.image || "",
        note: sec.note || "",
        volumes: Array.isArray(sec.volumes)
          ? sec.volumes.map((v) => ({
              id: v.id || uid(),
              number: Number(v.number) || 1,
              coverPrice: Math.max(0, Number(v.coverPrice) || 0),
              paidPrice: Math.max(0, Number(v.paidPrice) || 0),
              date: v.date || todayISO(),
              isLegacy: Boolean(v.isLegacy),
              image: v.image || "",
              readState: v.readState || "Chưa đọc",
              lentTo: v.lentTo || "",
              note: v.note || "",
              groupId: v.groupId || v.boxsetId || "",
              groupLabel: v.groupLabel || v.boxsetLabel || "",
            }))
          : [],
      }));
    }
    delete copy.volumes;
    return copy;
  });

  if (Array.isArray(rawObj?.merch) && rawObj.merch.length > 0 && merged.giftGroups.length === 0) {
    const byBook = new Map();
    rawObj.merch.forEach((m) => {
      const bookTitle = (m.seriesName || "").trim() || "Quà lẻ / Chưa gắn bộ";
      if (!byBook.has(bookTitle)) {
        const matchedS = merged.series.find((s) => normVN(s.title) === normVN(bookTitle));
        byBook.set(bookTitle, {
          id: uid(),
          title: bookTitle,
          publisher: m.publisher || matchedS?.publisher || "Khác",
          cover: matchedS?.cover || "",
          note: "",
          createdAt: m.date || todayISO(),
          gifts: [],
        });
      }
      byBook.get(bookTitle).gifts.push({
        id: m.id || uid(),
        name: m.name || "Quà tặng",
        quantity: Math.max(1, Number(m.quantity) || 1),
        price: Math.max(0, Number(m.price) || 0),
        source: m.source || "Kèm bản ĐB",
        status: m.status || "Đã có",
        date: m.date || todayISO(),
        isLegacy: Boolean(m.isLegacy),
        image: m.image || "",
        note: m.note || "",
      });
    });
    merged.giftGroups = [...byBook.values()];
  } else {
    merged.giftGroups = merged.giftGroups.map((g) => ({
      id: g.id || uid(),
      title: g.title || "Chưa đặt tên",
      publisher: g.publisher || "Khác",
      cover: g.cover || "",
      note: g.note || "",
      createdAt: g.createdAt || todayISO(),
      gifts: Array.isArray(g.gifts)
        ? g.gifts.map((it) => ({
            id: it.id || uid(),
            name: it.name || "Quà tặng",
            quantity: Math.max(1, Number(it.quantity) || 1),
            price: Math.max(0, Number(it.price) || 0),
            source: it.source || "Kèm bản ĐB",
            status: it.status || "Đã có",
            date: it.date || todayISO(),
            isLegacy: Boolean(it.isLegacy),
            image: it.image || "",
            note: it.note || "",
          }))
        : [],
    }));
  }
  delete merged.merch;
  return merged;
}

function getAllSeriesVolumes(s) {
  return (s.sections || []).flatMap((sec) => sec.volumes || []);
}

function isBookItem(s) {
  return s.category === "Sách";
}

function getGroupGiftStats(g) {
  const gifts = g.gifts || [];
  let qty = 0;
  let spent = 0;
  let owned = 0;
  let shipping = 0;
  let hunting = 0;
  gifts.forEach((it) => {
    const q = Math.max(1, Number(it.quantity) || 1);
    qty += q;
    spent += Math.max(0, Number(it.price) || 0);
    if (it.status === "Đã có") owned += q;
    else if (it.status === "Đang ship") shipping += q;
    else if (it.status === "Đang săn") hunting += q;
  });
  return { itemCount: gifts.length, qty, spent, owned, shipping, hunting };
}

function todayISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normVN(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let state = structuredClone(DEFAULT_STATE);
let newsItems = [];
let newsMeta = { updatedAt: "", loaded: false, error: "" };

const filters = {
  bookGroup: "all", // "all" | "truyen" | "sach"
  bookSearch: "",
  bookCat: "Tất cả",
  bookPub: "Tất cả",
  bookSort: "recent", // "recent" | "name" | "vols" | "spent"
  merchSearch: "",
  merchPub: "Tất cả",
  newsPub: "Tất cả",
  newsType: "Tất cả",
  newsChan: "Tất cả",
  newsScope: "shelf",
};

function loadFromLocalStorageLegacy() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadStateAsync() {
  let loadedRaw = null;
  let idbWorked = false;
  let alreadyMigrated = false;
  try {
    alreadyMigrated = localStorage.getItem(IDB_MIGRATED_FLAG) === "1";
  } catch {}

  try {
    loadedRaw = await idbGet(STORAGE_KEY);
    idbWorked = true;
    storageEngine = "IndexedDB";
  } catch (e) {
    idbWorked = false;
    storageEngine = "localStorage";
  }

  // CHỐNG MẤT DỮ LIỆU: Nếu trước đây đã chuyển sang IndexedDB mà nay IDB bị lỗi tạm thời,
  // KHÔNG ĐƯỢC tự nạp bản localStorage cũ lên đè! Báo lỗi & cho bấm tải lại.
  if (!idbWorked && alreadyMigrated) {
    setSaveStatus("error", "Lỗi đọc kho");
    alert(
      "Trình duyệt iPhone đang tạm khoá kho IndexedDB. App tạm dừng ghi để bảo vệ dữ liệu của bạn — hãy tắt hẳn app rồi mở lại!"
    );
    return false;
  }

  let cameFromLegacy = false;
  if (!loadedRaw) {
    const legacy = loadFromLocalStorageLegacy();
    if (legacy) {
      loadedRaw = legacy;
      cameFromLegacy = true;
    }
  }

  const migrated = loadedRaw ? migrateStateData(loadedRaw) : structuredClone(DEFAULT_STATE);
  compactImagesInState(migrated);
  state = migrated;

  if (idbWorked && (cameFromLegacy || loadedRaw)) {
    try {
      await idbSet(STORAGE_KEY, state);
      localStorage.setItem(IDB_MIGRATED_FLAG, "1");
      writeTextOnlyShadow(state);
      // Xoá bản localStorage cũ chứa ảnh nặng để tránh đọc nhầm về sau
      if (cameFromLegacy) {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      }
    } catch {}
  }

  if (navigator.storage && typeof navigator.storage.persist === "function") {
    navigator.storage.persist().catch(() => {});
  }
  appReady = true;
  setSaveStatus("", "Đã lưu");
  return true;
}

function saveState() {
  // Không bao giờ cho phép ghi đè trước khi loadStateAsync() đọc xong dữ liệu cũ
  if (!appReady) return;
  compactImagesInState(state);
  updateHeaderSummary();

  const snapshot = structuredClone(state);
  pendingSaves++;
  setSaveStatus("saving", "Đang lưu...");

  saveChain = saveChain.then(async () => {
    try {
      await idbSet(STORAGE_KEY, snapshot);
      storageEngine = "IndexedDB";
      try { localStorage.setItem(IDB_MIGRATED_FLAG, "1"); } catch {}
      writeTextOnlyShadow(snapshot);
    } catch (idbErr) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        storageEngine = "localStorage";
      } catch (lsErr) {
        setSaveStatus("error", "Lỗi lưu!");
        const now = Date.now();
        if (now - lastSaveErrorShown > 4000) {
          lastSaveErrorShown = now;
          alert(
            "CẢNH BÁO: Chưa lưu được vào bộ nhớ máy (" +
              (idbErr?.message || lsErr?.message || "QuotaExceeded") +
              "). Vào Cài đặt -> Xuất file sao lưu ngay trước khi thoát app!"
          );
        }
        pendingSaves = Math.max(0, pendingSaves - 1);
        return;
      }
    }
    pendingSaves = Math.max(0, pendingSaves - 1);
    if (pendingSaves === 0) {
      setSaveStatus("", "✓ Đã lưu");
      if (isRichFx()) {
        const sEl = document.getElementById("saveIndicator");
        if (sEl) {
          sEl.classList.remove("save-flash");
          void sEl.offsetWidth;
          sEl.classList.add("save-flash");
        }
      }
    }
  });
}

// Tự reset kết nối IDB cũ khi người dùng quay lại app sau khi ẩn nền trên iPhone
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (pendingSaves === 0) resetIDBHandle();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (pendingSaves > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});

function fmtMoney(n) {
  const val = Math.round(Number(n) || 0);
  return val.toLocaleString("vi-VN") + "đ";
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pubColorVar(pub) {
  if (pub === "Trẻ") return "var(--pub-tre)";
  if (pub === "Kim Đồng") return "var(--pub-kim)";
  if (pub === "IPM") return "var(--pub-ipm)";
  if (pub === "Nhã Nam") return "var(--pub-nn)";
  return "var(--pub-other)";
}

function typeLabel(t) {
  const map = { new: "Truyện mới", reprint: "Tái bản", gift: "Quà / ĐB", fes: "Fes" };
  return map[t] || "Tin mới";
}

function typeTagClass(t) {
  if (t === "reprint") return "tag-forest";
  if (t === "gift") return "tag-amber";
  if (t === "fes") return "tag-accent";
  return "";
}
