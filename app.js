"use strict";

// ============================
// EVENT WIRING
// ============================
const tabButtons = [...document.querySelectorAll(".tab-btn")];
const tabIndicator = document.getElementById("tabIndicator");

function updateTabIndicator(idx) {
  if (tabIndicator) {
    tabIndicator.style.transform = `translateX(${idx * 100}%)`;
  }
}

tabButtons.forEach((btn, idx) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    SFX.tab(tab);
    tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
    updateTabIndicator(idx);
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${tab}`));
    window.scrollTo({ top: 0, behavior: isRichFx() ? "smooth" : "auto" });
    if (tab === "spending") renderSpending(true);
    if (tab === "news") renderNews();
    if (tab === "books") checkCapooBudgetMood();
    if (tab === "merch") resumeCabinetOrbitIfVisible();
    else stopCabinetOrbit();
  });
});

document.getElementById("themeBtn").addEventListener("click", (e) => {
  const curIdx = THEME_LIST.findIndex((t) => t.id === state.theme);
  const nextTheme = THEME_LIST[(curIdx + 1) % THEME_LIST.length];
  SFX.lamp(nextTheme.dark);
  triggerThemeWash(e.currentTarget, nextTheme.dark);
  state.theme = nextTheme.id;
  saveState();
  applyTheme();
  showToast(`Bảng màu: ${nextTheme.label}`);
});

document.getElementById("soundBtn").addEventListener("click", () => {
  state.soundEnabled = !isSoundOn();
  applySoundUI();
  saveState();
  if (state.soundEnabled) SFX.pop();
  showToast(state.soundEnabled ? "Đã bật âm thanh." : "Đã tắt âm thanh.");
});
document.getElementById("undoBtn").addEventListener("click", performUndo);
document.getElementById("markLegacyBtn").addEventListener("click", openMarkLegacyModal);
document.getElementById("exportReceiptBtn").addEventListener("click", openReceiptModal);
document.getElementById("settingsBtn").addEventListener("click", openSettingsModal);
document.getElementById("quickCoverBtn").addEventListener("click", () => openQuickCoverModal("single"));
document.getElementById("addSeriesBtn").addEventListener("click", () => openSeriesForm());
document.getElementById("addGiftGroupBtn").addEventListener("click", () => openGiftGroupForm());
document.getElementById("manualPinBtn").addEventListener("click", openManualPinForm);
document.getElementById("refreshNewsBtn").addEventListener("click", () => fetchNews(true));

document.getElementById("editBudgetBtn").addEventListener("click", () => {
  const val = prompt("Nhập hạn mức chi tiêu tháng (VNĐ):", String(state.budgetLimit || 1000000));
  if (val === null) return;
  const num = Number(val.replace(/[^\d]/g, ""));
  if (num > 0) {
    state.budgetLimit = num;
    saveState();
    renderSpending();
    showToast(`Đã đặt hạn mức ${fmtMoney(num)}/tháng.`);
  }
});

document.getElementById("bookGroupSwitch").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-group]");
  if (!btn) return;
  const grp = btn.dataset.group;
  const idx = grp === "all" ? 0 : grp === "truyen" ? 1 : 2;
  SFX.groupSwitch(idx);
  filters.bookGroup = grp;
  if (filters.bookGroup === "truyen" && filters.bookCat === "Sách") {
    filters.bookCat = "Tất cả";
    document.querySelectorAll("#bookCatChips .chip").forEach((c) => c.classList.toggle("active", c.dataset.cat === "Tất cả"));
  }
  document.querySelectorAll("#bookGroupSwitch button").forEach((b) => b.classList.toggle("active", b === btn));
  renderBooks();
  onCapooTabSwitch(grp);
});

document.getElementById("bookSortSel").addEventListener("change", (e) => {
  filters.bookSort = e.target.value;
  renderBooks();
});

document.getElementById("bookSearch").addEventListener("input", (e) => {
  filters.bookSearch = e.target.value;
  renderBooks();
});

document.getElementById("bookCatChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  filters.bookCat = btn.dataset.cat;
  document.querySelectorAll("#bookCatChips .chip").forEach((c) => c.classList.toggle("active", c === btn));
  renderBooks();
});

document.getElementById("bookPubChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  filters.bookPub = btn.dataset.pub;
  document.querySelectorAll("#bookPubChips .chip").forEach((c) => c.classList.toggle("active", c === btn));
  renderBooks();
});

document.getElementById("bookViewSeg").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  state.bookView = btn.dataset.mode;
  saveState();
  document.querySelectorAll("#bookViewSeg button").forEach((b) => b.classList.toggle("active", b === btn));
  renderBooks();
});

document.getElementById("merchSearch").addEventListener("input", (e) => {
  filters.merchSearch = e.target.value;
  renderMerch();
});

const merchViewSeg = document.getElementById("merchViewSeg");
if (merchViewSeg) {
  merchViewSeg.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mmode]");
    if (!btn) return;
    state.merchView = btn.dataset.mmode;
    saveState();
    renderMerch();
  });
}

document.getElementById("merchPubChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  filters.merchPub = btn.dataset.pub;
  document.querySelectorAll("#merchPubChips .chip").forEach((c) => c.classList.toggle("active", c === btn));
  renderMerch();
});

document.getElementById("newsPubChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  filters.newsPub = btn.dataset.pub;
  document.querySelectorAll("#newsPubChips .chip").forEach((c) => c.classList.toggle("active", c === btn));
  renderNews();
});

document.getElementById("newsTypeChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  filters.newsType = btn.dataset.type;
  document.querySelectorAll("#newsTypeChips .chip").forEach((c) => c.classList.toggle("active", c === btn));
  renderNews();
});

document.getElementById("newsScopeSwitch").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-scope]");
  if (!btn) return;
  filters.newsScope = btn.dataset.scope;
  document.querySelectorAll("#newsScopeSwitch button").forEach((b) => b.classList.toggle("active", b === btn));
  renderNews();
});

document.getElementById("newsChanChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  filters.newsChan = btn.dataset.chan;
  document.querySelectorAll("#newsChanChips .chip[data-chan]").forEach((c) => c.classList.toggle("active", c === btn));
  renderNews();
});

function renderAll() {
  updateHeaderSummary();
  document.querySelectorAll("#bookViewSeg button").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === state.bookView)
  );
  renderBooks();
  renderMerch();
  renderNews();
  renderSpending();
}

async function initApp() {
  const ok = await loadStateAsync();
  applyTheme();
  applyFxLevel();
  applySoundUI();
  applyCatVisibility();
  if (ok) {
    updateUndoBtnUI();
    renderAll();
    fetchNews(false);
  }
}

initApp();
