"use strict";

// ============================
// TAB 2: QUÀ & ĐỒ (Manga/Sách có quà -> Thống kê số lượng quà -> Tên, ảnh, giá...)
// ============================
const MERCH_STATUSES = ["Đã có", "Đang ship", "Đang săn"];

let cabinetAnimId = null;
let cabinetIsOpen = false;
let cabinetHoverTime = 0;
let cabinetRotY = 0.28;
let cabinetRotX = -0.14;
let cabinetVelY = 0;
let cabinetVelX = 0;
let cabinetDragging = false;
let cabinetActiveStage = null;
let cabinetActiveSpecs = [];

function isCabinetViewActive() {
  if (document.hidden) return false;
  const merchView = document.getElementById("view-merch");
  return Boolean(merchView && merchView.classList.contains("active"));
}

function stopCabinetOrbit() {
  if (cabinetAnimId !== null) {
    cancelAnimationFrame(cabinetAnimId);
    cabinetAnimId = null;
  }
}

function layoutCabinetItems(stageEl, specs, hoverTime) {
  const sw = stageEl.clientWidth || 320;
  const sh = stageEl.clientHeight || 376;
  const cx = sw * 0.5;
  const cy = sh * 0.49;
  const radius = Math.max(78, Math.min(sw * 0.34, sh * 0.32, 126));
  const cosY = Math.cos(cabinetRotY);
  const sinY = Math.sin(cabinetRotY);
  const cosX = Math.cos(cabinetRotX);
  const sinX = Math.sin(cabinetRotX);
  const rich = isRichFx();

  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    // Xoay điểm trên hình cầu theo góc kéo tay (Y ngang, X dọc)
    const x1 = sp.ux * cosY + sp.uz * sinY;
    const z1 = -sp.ux * sinY + sp.uz * cosY;
    const y2 = sp.uy * cosX - z1 * sinX;
    const z2 = sp.uy * sinX + z1 * cosX;

    const depth = (z2 + 1) * 0.5; // 0 (mặt sau cầu) -> 1 (mặt trước cầu)
    const persp = 460 / (460 - z2 * radius);
    const bobY = rich ? Math.sin(hoverTime * sp.bobFreq + sp.phase) * 2.8 : 0;

    const px = cx + x1 * radius * persp;
    const py = cy + y2 * radius * persp + bobY;
    const scale = 0.62 + depth * 0.46;
    const alpha = 0.44 + depth * 0.56;
    const bright = 0.72 + depth * 0.28;

    sp.el.style.transform = `translate3d(${(px - 38).toFixed(1)}px, ${(py - 45).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
    sp.el.style.zIndex = String(10 + Math.round(depth * 90));
    sp.el.style.opacity = alpha.toFixed(2);
    sp.el.style.filter = `brightness(${bright.toFixed(2)})`;
  }
}

function resumeCabinetOrbitIfVisible() {
  if (cabinetAnimId !== null) return;
  if (!cabinetActiveStage || !cabinetActiveStage.isConnected || !cabinetActiveSpecs.length) return;
  if ((state.merchView || "list") !== "gallery") return;
  if (!isCabinetViewActive()) return;

  const stageEl = cabinetActiveStage;
  const specs = cabinetActiveSpecs;
  let lastTs = performance.now();

  const tick = (now) => {
    if (!stageEl.isConnected || !isCabinetViewActive()) {
      cabinetAnimId = null;
      return;
    }
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;

    // Chỉ có quán tính nhẹ sau khi hất tay kéo — tuyệt đối không tự quay!
    if (!cabinetDragging && (Math.abs(cabinetVelY) > 0.001 || Math.abs(cabinetVelX) > 0.001)) {
      cabinetRotY += cabinetVelY * dt;
      cabinetRotX = Math.max(-1.18, Math.min(1.18, cabinetRotX + cabinetVelX * dt));
      const damp = Math.exp(-5.6 * dt);
      cabinetVelY *= damp;
      cabinetVelX *= damp;
      if (Math.abs(cabinetVelY) < 0.004) cabinetVelY = 0;
      if (Math.abs(cabinetVelX) < 0.004) cabinetVelX = 0;
    }

    // Lơ lửng nhấp nhô tại chỗ nhẹ nhàng
    cabinetHoverTime += dt;
    layoutCabinetItems(stageEl, specs, cabinetHoverTime);
    cabinetAnimId = requestAnimationFrame(tick);
  };
  cabinetAnimId = requestAnimationFrame(tick);
}

function startCabinetOrbit(stageEl, itemEls) {
  stopCabinetOrbit();
  cabinetActiveStage = null;
  cabinetActiveSpecs = [];
  if (!stageEl || !itemEls.length) return;
  const n = itemEls.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // Xếp các món quà đều quanh mặt cầu 3D (Fibonacci Sphere)
  const specs = itemEls.map((el, i) => {
    let ux = 0;
    let uy = 0;
    let uz = 0.35;
    if (n === 1) {
      ux = 0; uy = 0; uz = 0.35;
    } else if (n === 2) {
      const side = i === 0 ? -1 : 1;
      ux = side * 0.78;
      uy = side * 0.1;
      uz = -side * 0.56;
    } else {
      const y = 1 - ((i + 0.5) * 2) / n;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      ux = Math.cos(theta) * r;
      uy = y * 0.92;
      uz = Math.sin(theta) * r;
    }
    return {
      el,
      ux,
      uy,
      uz,
      phase: i * 1.15,
      bobFreq: 1.35 + (i % 3) * 0.22,
    };
  });

  cabinetActiveStage = stageEl;
  cabinetActiveSpecs = specs;
  layoutCabinetItems(stageEl, specs, cabinetHoverTime);
  resumeCabinetOrbitIfVisible();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCabinetOrbit();
  else resumeCabinetOrbitIfVisible();
});

function renderMerch() {
  const kpiEl = document.getElementById("giftSummaryKpis");
  const container = document.getElementById("merchContainer");
  const q = normVN(filters.merchSearch);

  // Thống kê tổng toàn bộ quà
  let totalQtyAll = 0;
  let totalTypesAll = 0;
  let totalSpentAll = 0;
  let totalOwnedAll = 0;
  let totalShipAll = 0;
  let totalHuntAll = 0;

  state.giftGroups.forEach((g) => {
    const st = getGroupGiftStats(g);
    totalQtyAll += st.qty;
    totalTypesAll += st.itemCount;
    totalSpentAll += st.spent;
    totalOwnedAll += st.owned;
    totalShipAll += st.shipping;
    totalHuntAll += st.hunting;
  });

  kpiEl.innerHTML = `
    <div class="gift-kpi">
      <div class="gift-kpi-label">Tổng số quà</div>
      <div class="gift-kpi-val mono">${totalQtyAll}</div>
      <div class="small-muted" style="font-size:10.5px;">${totalTypesAll} loại món</div>
    </div>
    <div class="gift-kpi">
      <div class="gift-kpi-label">Bộ có quà</div>
      <div class="gift-kpi-val mono">${state.giftGroups.length}</div>
      <div class="small-muted" style="font-size:10.5px;">Truyện & sách</div>
    </div>
    <div class="gift-kpi">
      <div class="gift-kpi-label">Tiền quà</div>
      <div class="gift-kpi-val mono">${fmtMoney(totalSpentAll)}</div>
      <div class="small-muted" style="font-size:10.5px;">Tổng đã chi</div>
    </div>`;

  document.getElementById("merchStatusSummary").textContent =
    `Đã có ${totalOwnedAll} · Ship ${totalShipAll} · Săn ${totalHuntAll}`;

  const list = state.giftGroups.filter((g) => {
    if (filters.merchPub !== "Tất cả") {
      const known = ["Trẻ", "Kim Đồng", "IPM", "Nhã Nam"];
      if (filters.merchPub === "Khác") {
        if (known.includes(g.publisher)) return false;
      } else if (g.publisher !== filters.merchPub) {
        return false;
      }
    }
    if (q) {
      const giftNames = (g.gifts || []).map((it) => `${it.name} ${it.note || ""}`).join(" ");
      const hay = normVN(`${g.title} ${g.publisher} ${g.note || ""} ${giftNames}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const filteredQty = list.reduce((a, g) => a + getGroupGiftStats(g).qty, 0);
  document.getElementById("merchCountLabel").textContent = `${list.length} bộ có quà · ${filteredQty} quà`;

  if (!list.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-title">${state.giftGroups.length ? "Không tìm thấy truyện/quà phù hợp" : "Chưa có manga hay sách có quà nào"}</div>
        <div class="empty-desc">Tạo từng đầu manga/sách có quà, rồi bấm vào để thêm tên quà, ảnh quà, số lượng và giá tiền.</div>
        ${state.giftGroups.length ? "" : `<button class="btn btn-primary" id="emptyAddGiftGroupBtn">+ Tạo truyện có quà đầu tiên</button>`}
      </div>`;
    const btn = document.getElementById("emptyAddGiftGroupBtn");
    if (btn) btn.addEventListener("click", () => openGiftGroupForm());
    return;
  }

  const merchMode = state.merchView || "list";
  document.querySelectorAll("#merchViewSeg button").forEach((b) =>
    b.classList.toggle("active", b.dataset.mmode === merchMode)
  );

  stopCabinetOrbit();
  cabinetActiveStage = null;
  cabinetActiveSpecs = [];
  if (merchMode === "gallery") {
    const allCards = [];
    list.forEach((g) => {
      (g.gifts || []).forEach((it) => {
        if (q) {
          const hay = normVN(`${g.title} ${g.publisher} ${it.name} ${it.note || ""} ${it.source || ""}`);
          if (!hay.includes(q)) return;
        }
        allCards.push({ g, it });
      });
    });

    if (!allCards.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-title">Tủ kính chưa có món quà nào</div>
          <div class="empty-desc">Bấm vào từng bộ ở chế độ Danh sách hoặc tạo mới để thêm ảnh standee, postcard, shikishi vào trưng bày nhé.</div>
          <button class="btn btn-sm btn-primary" id="switchBackMerchListBtn">Về Danh sách bộ</button>
        </div>`;
      const sb = container.querySelector("#switchBackMerchListBtn");
      if (sb) {
        sb.addEventListener("click", () => {
          state.merchView = "list";
          saveState();
          renderMerch();
        });
      }
      return;
    }

    const itemsHtml = allCards
      .map(({ g, it }) => {
        const imgSrc = resolveImg(it.image) || resolveImg(g.cover);
        const qty = Math.max(1, Number(it.quantity) || 1);
        return `
          <button type="button" class="cabinet-item" data-cab-item="${g.id}::${it.id}" title="${esc(it.name)} — ${esc(g.title)}">
            <span class="cabinet-item-media">
              ${
                imgSrc
                  ? `<img src="${esc(imgSrc)}" alt="${esc(it.name)}" loading="lazy" />`
                  : `<span class="cabinet-item-fallback">${esc(it.name)}</span>`
              }
              ${qty > 1 ? `<span class="cabinet-item-qty mono">x${qty}</span>` : ""}
            </span>
            <span class="cabinet-item-name">${esc(it.name)}</span>
          </button>`;
      })
      .join("");

    container.innerHTML = `
      <div class="cabinet-wrap">
        <div class="cabinet-frame ${cabinetIsOpen ? "is-open" : ""}" id="giftCabinetFrame">
          <div class="cabinet-stage" id="giftCabinetStage">
            <div class="cabinet-backdrop"></div>
            <div class="cabinet-arch"></div>
            <div class="cabinet-spot cabinet-spot-left"></div>
            <div class="cabinet-spot cabinet-spot-right"></div>
            <div class="cabinet-sphere-aura"></div>
            <div class="cabinet-sphere-equator"></div>
            <div class="cabinet-led"></div>
            <div class="cabinet-floor"><div class="cabinet-floor-glow"></div></div>
            ${itemsHtml}
            <div class="cabinet-doors" id="giftCabinetDoors">
              <div class="cabinet-door cabinet-door-left"><span class="cabinet-handle"></span></div>
              <div class="cabinet-door cabinet-door-right"><span class="cabinet-handle"></span></div>
            </div>
            <div class="cabinet-open-hint">Chạm mở tủ · Kéo tay xoay 3D · ${allCards.length} món</div>
          </div>
        </div>
        <div class="cabinet-bar">
          <span class="small-muted" id="cabinetStateHint">${
            cabinetIsOpen ? "Kéo tay để xoay khối cầu · Chạm món quà để xem" : "Chạm cửa kính để mở · Kéo để xoay khối cầu"
          }</span>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button type="button" class="btn btn-sm" id="cabinetResetAngleBtn">Góc gốc</button>
            <button type="button" class="btn btn-sm btn-primary" id="cabinetToggleDoorBtn">${cabinetIsOpen ? "Đóng tủ" : "Mở tủ"}</button>
          </div>
        </div>
      </div>`;

    const frameEl = container.querySelector("#giftCabinetFrame");
    const stageEl = container.querySelector("#giftCabinetStage");
    const toggleDoorBtn = container.querySelector("#cabinetToggleDoorBtn");
    const resetAngleBtn = container.querySelector("#cabinetResetAngleBtn");
    const stateHint = container.querySelector("#cabinetStateHint");

    const syncDoorUI = () => {
      frameEl.classList.toggle("is-open", cabinetIsOpen);
      toggleDoorBtn.textContent = cabinetIsOpen ? "Đóng tủ" : "Mở tủ";
      stateHint.textContent = cabinetIsOpen
        ? "Kéo tay để xoay khối cầu · Chạm món quà để xem"
        : "Chạm cửa kính để mở · Kéo để xoay khối cầu";
    };

    const setCabinetOpen = (openVal) => {
      if (cabinetIsOpen === openVal) return;
      cabinetIsOpen = openVal;
      if (cabinetIsOpen) SFX.openBook();
      else SFX.close();
      syncDoorUI();
    };

    toggleDoorBtn.addEventListener("click", () => setCabinetOpen(!cabinetIsOpen));
    resetAngleBtn.addEventListener("click", () => {
      SFX.filter();
      cabinetRotY = 0.28;
      cabinetRotX = -0.14;
      cabinetVelY = 0;
      cabinetVelX = 0;
      if (cabinetActiveStage && cabinetActiveSpecs.length) {
        layoutCabinetItems(cabinetActiveStage, cabinetActiveSpecs, cabinetHoverTime);
      }
    });

    // Kéo tay xoay khối cầu 3D (có quán tính) + phân biệt rõ kéo vs chạm mở tủ / chạm món quà
    let activePtrId = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastMoveTs = 0;
    let didDrag = false;
    let downTarget = null;

    stageEl.addEventListener("pointerdown", (e) => {
      if (activePtrId !== null) return;
      activePtrId = e.pointerId;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      lastMoveTs = performance.now();
      didDrag = false;
      downTarget = e.target;
      cabinetVelY = 0;
      cabinetVelX = 0;
      stageEl.setPointerCapture?.(e.pointerId);
    });

    stageEl.addEventListener("pointermove", (e) => {
      if (e.pointerId !== activePtrId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const totalDist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (!didDrag && totalDist > 6) {
        didDrag = true;
        cabinetDragging = true;
        stageEl.classList.add("is-dragging");
      }
      if (!didDrag) return;
      e.preventDefault();

      const now = performance.now();
      const dt = Math.max(0.008, (now - lastMoveTs) / 1000);
      lastMoveTs = now;
      lastX = e.clientX;
      lastY = e.clientY;

      const dRotY = dx * 0.0092;
      const dRotX = -dy * 0.0082;
      cabinetRotY += dRotY;
      cabinetRotX = Math.max(-1.18, Math.min(1.18, cabinetRotX + dRotX));
      cabinetVelY = Math.max(-6, Math.min(6, dRotY / dt));
      cabinetVelX = Math.max(-5, Math.min(5, dRotX / dt));

      if (cabinetActiveStage && cabinetActiveSpecs.length) {
        layoutCabinetItems(cabinetActiveStage, cabinetActiveSpecs, cabinetHoverTime);
      }
    });

    const finishDrag = (e, isCancel) => {
      if (e.pointerId !== activePtrId) return;
      activePtrId = null;
      cabinetDragging = false;
      stageEl.classList.remove("is-dragging");
      if (performance.now() - lastMoveTs > 90) {
        cabinetVelY = 0;
        cabinetVelX = 0;
      }
      if (!didDrag && !isCancel) {
        if (!cabinetIsOpen) {
          setCabinetOpen(true);
        } else {
          const itemBtn = downTarget && downTarget.closest ? downTarget.closest(".cabinet-item") : null;
          if (itemBtn && itemBtn.dataset.cabItem) {
            const [gid, iid] = itemBtn.dataset.cabItem.split("::");
            const g = state.giftGroups.find((x) => x.id === gid);
            const it = g && (g.gifts || []).find((x) => x.id === iid);
            if (g && it) {
              SFX.openBook();
              openGiftItemForm(gid, iid);
            }
          }
        }
      }
      downTarget = null;
    };

    stageEl.addEventListener("pointerup", (e) => finishDrag(e, false));
    stageEl.addEventListener("pointercancel", (e) => finishDrag(e, true));

    const itemEls = [...stageEl.querySelectorAll(".cabinet-item")];
    startCabinetOrbit(stageEl, itemEls);
    return;
  }

  container.innerHTML = `<div class="merch-list">${list
    .map((g, idx) => {
      const st = getGroupGiftStats(g);
      const firstGiftImg = (g.gifts || []).find((x) => resolveImg(x.image))?.image || "";
      const thumbSrc = resolveImg(g.cover) || resolveImg(firstGiftImg);
      return `
        <div class="gift-group-card fx-card-in" style="--stagger:${idx}" data-open-group="${g.id}">
          <div class="gift-group-thumb" style="border-left:2px solid ${pubColorVar(g.publisher)}">
            ${thumbSrc ? `<img src="${esc(thumbSrc)}" alt="" loading="lazy" />` : `<span class="mono">${esc(g.publisher.slice(0, 3))}</span>`}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(g.title)}</div>
            <div class="merch-meta" style="margin-top:5px;">
              <span class="tag">${esc(g.publisher)}</span>
              <span class="tag tag-accent mono">${st.qty} quà</span>
              ${st.hunting ? `<span class="tag mono">Đang săn ${st.hunting}</span>` : ""}
            </div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div class="mono" style="font-size:13px; font-weight:600;">${fmtMoney(st.spent)}</div>
            <div class="small-muted" style="margin-top:2px;">Mở →</div>
          </div>
        </div>`;
    })
    .join("")}</div>`;

  container.querySelectorAll("[data-open-group]").forEach((el) => {
    el.addEventListener("click", () => { SFX.openBook(); openGiftGroupDetail(el.dataset.openGroup); });
  });
}

// Tạo / Sửa đầu Manga / Sách có quà
function openGiftGroupForm(groupId = null) {
  const g = groupId ? state.giftGroups.find((x) => x.id === groupId) : null;
  let currentCover = resolveImg(g?.cover || "");

  // Gợi ý nhanh các đầu sách đang có trong Tủ sách (chưa tạo bên tab Quà)
  const existingTitles = new Set(state.giftGroups.map((x) => normVN(x.title)));
  const shelfSuggestions = !g
    ? state.series.filter((s) => !existingTitles.has(normVN(s.title))).slice(0, 8)
    : [];

  const html = `
    <form id="giftGroupForm" class="form-grid">
      ${
        shelfSuggestions.length
          ? `<div class="field">
               <label>Chọn nhanh từ Tủ sách của bạn</label>
               <div class="preset-chips">
                 ${shelfSuggestions
                   .map((s) => `<button type="button" class="preset-chip" data-pick-shelf="${s.id}">${esc(s.title.slice(0, 26))}</button>`)
                   .join("")}
               </div>
             </div>`
          : ""
      }
      <div class="field">
        <label>Tên manga / sách có quà *</label>
        <input name="title" id="ggTitleInput" required value="${esc(g?.title || "")}" placeholder="VD: Dungeon Meshi, Chainsaw Man, Rừng Na Uy..." />
      </div>
      <div class="field">
        <label>Nhà xuất bản</label>
        <select name="publisher" id="ggPubSelect">
          ${["Trẻ", "Kim Đồng", "IPM", "Nhã Nam", "Khác"]
            .map((p) => `<option value="${p}" ${g?.publisher === p ? "selected" : ""}>${p}</option>`)
            .join("")}
        </select>
      </div>
      <div class="field">
        <label>Ảnh đại diện bộ (tuỳ chọn)</label>
        <div class="cover-preview-wrap">
          <div class="cover-preview" id="ggCoverPreview">
            ${currentCover ? `<img src="${esc(currentCover)}" alt="" />` : "Chưa có"}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <label class="btn btn-sm" style="margin:0;">
              ${currentCover ? "Đổi ảnh" : "Chọn ảnh"}
              <input type="file" id="ggCoverInput" accept="image/*" style="display:none;" />
            </label>
            <button type="button" class="btn btn-sm btn-danger" id="clearGgCoverBtn" style="${currentCover ? "" : "display:none;"}">Xoá ảnh</button>
            <button type="button" class="btn btn-sm" id="undoGgCoverBtn" style="display:none;">Hoàn tác ảnh</button>
          </div>
        </div>
      </div>
      <div class="field">
        <label>Ghi chú</label>
        <input name="note" value="${esc(g?.note || "")}" placeholder="VD: Bộ săn nhiều standee & postcard Fes..." />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-sm" id="cancelGgBtn">Huỷ</button>
        <button type="submit" class="btn btn-sm btn-primary">${g ? "Lưu thay đổi" : "Tạo & thêm quà"}</button>
      </div>
    </form>`;

  openModal(g ? "Sửa truyện/sách có quà" : "Tạo manga / sách có quà", html, (body) => {
    const titleInput = body.querySelector("#ggTitleInput");
    const pubSel = body.querySelector("#ggPubSelect");
    const previewEl = body.querySelector("#ggCoverPreview");
    const clearBtn = body.querySelector("#clearGgCoverBtn");

    const setGgPreview = (url) => {
      currentCover = url || "";
      previewEl.innerHTML = currentCover ? `<img src="${esc(currentCover)}" alt="" />` : "Chưa có";
      clearBtn.style.display = currentCover ? "" : "none";
    };

    body.querySelectorAll("[data-pick-shelf]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = state.series.find((x) => x.id === btn.dataset.pickShelf);
        if (!s) return;
        titleInput.value = s.title;
        pubSel.value = s.publisher || "Khác";
        if (s.cover) setGgPreview(resolveImg(s.cover));
        showToast(`Đã điền từ Tủ sách: ${s.title}`);
      });
    });

    const undoGgCoverBtn = body.querySelector("#undoGgCoverBtn");
    let clearedGgBackup = "";

    clearBtn.addEventListener("click", () => {
      if (currentCover) clearedGgBackup = currentCover;
      setGgPreview("");
      if (undoGgCoverBtn && clearedGgBackup) undoGgCoverBtn.style.display = "";
      showToast("Đã xoá ảnh — bấm 'Hoàn tác ảnh' nếu lỡ tay.");
    });

    if (undoGgCoverBtn) {
      undoGgCoverBtn.addEventListener("click", () => {
        if (!clearedGgBackup) return;
        setGgPreview(clearedGgBackup);
        clearedGgBackup = "";
        undoGgCoverBtn.style.display = "none";
        showToast("Đã khôi phục ảnh.");
      });
    }

    body.querySelector("#ggCoverInput").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const cropped = await openImageCropper(file, { ratio: 2 / 3, maxW: 360, maxH: 540, quality: 0.76, title: "Cắt ảnh đại diện bộ quà" });
      if (cropped) {
        setGgPreview(cropped);
        if (undoGgCoverBtn) undoGgCoverBtn.style.display = "none";
      }
    });

    body.querySelector("#cancelGgBtn").addEventListener("click", () => {
      if (g) openGiftGroupDetail(g.id);
      else closeModal();
    });

    body.querySelector("#giftGroupForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = fd.get("title").trim();
      if (!title) return;
      if (g) {
        g.title = title;
        g.publisher = fd.get("publisher");
        g.note = fd.get("note").trim();
        g.cover = currentCover;
        saveState();
        renderMerch();
        renderSpending();
        openGiftGroupDetail(g.id);
        showToast("Đã cập nhật.");
      } else {
        const newG = {
          id: uid(),
          title,
          publisher: fd.get("publisher"),
          cover: currentCover,
          note: fd.get("note").trim(),
          createdAt: todayISO(),
          gifts: [],
        };
        state.giftGroups.unshift(newG);
        saveState();
        renderMerch();
        openGiftGroupDetail(newG.id);
        showToast(`Đã tạo "${title}" — thêm các món quà vào đây nhé.`);
      }
    });
  });
}

// Chi tiết 1 Manga / Sách có quà: Thống kê số lượng quà + danh sách quà + thêm/sửa quà
function openGiftGroupDetail(groupId, filterStatus = "Tất cả") {
  const g = state.giftGroups.find((x) => x.id === groupId);
  if (!g) return;
  const st = getGroupGiftStats(g);
  const shownGifts = (g.gifts || []).filter((it) => filterStatus === "Tất cả" || it.status === filterStatus);

  const listHtml = shownGifts.length
    ? `<div class="merch-list" style="margin-top:8px;">${shownGifts
        .map((it) => {
          const qty = Math.max(1, Number(it.quantity) || 1);
          return `
            <div class="merch-card">
              ${
                resolveImg(it.image)
                  ? `<button type="button" class="merch-thumb" data-zoom-gift="${it.id}" title="Xem ảnh lớn">
                       <img src="${esc(resolveImg(it.image))}" alt="${esc(it.name)}" loading="lazy" />
                     </button>`
                  : ""
              }
              <div class="merch-main" data-edit-gift="${it.id}" style="cursor:pointer;">
                <div class="merch-title">
                  ${esc(it.name)}
                  ${qty > 1 ? `<span class="tag tag-accent mono" style="margin-left:4px;">x${qty}</span>` : ""}
                </div>
                ${it.note ? `<div class="merch-sub">${esc(it.note)}</div>` : ""}
                <div class="merch-meta">
                  <span class="tag">${esc(it.source)}</span>
                  <span class="small-muted mono">${esc(it.date || "")}</span>
                </div>
              </div>
              <div class="merch-right">
                <button type="button" class="status-cycle" data-cycle-gift="${it.id}" data-status="${esc(it.status)}">${esc(it.status)}</button>
                <div class="mono" style="font-size:13px; font-weight:600;">${fmtMoney(it.price)}</div>
              </div>
            </div>`;
        })
        .join("")}</div>`
    : `<div class="empty" style="padding:18px; margin-top:8px;">
         <div class="empty-title" style="font-size:13px;">${(g.gifts || []).length ? "Không có quà ở trạng thái này" : "Chưa thêm món quà nào"}</div>
         <div class="empty-desc" style="margin-bottom:0;">Bấm <strong>+ Thêm quà</strong> để lưu tên quà, ảnh quà, số lượng và giá tiền.</div>
       </div>`;

  const html = `
    <div style="display:flex; gap:12px; align-items:flex-start;">
      <div class="cover-preview" style="width:56px; height:82px; border-left:3px solid ${pubColorVar(g.publisher)}">
        ${resolveImg(g.cover) ? `<img src="${esc(resolveImg(g.cover))}" alt="" />` : `<span class="mono" style="text-align:center; padding:3px;">${esc(g.publisher)}</span>`}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:15px; font-weight:700; line-height:1.3;">${esc(g.title)}</div>
        <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">
          <span class="tag">${esc(g.publisher)}</span>
          <span class="tag tag-accent mono">${st.qty} quà (${st.itemCount} loại)</span>
        </div>
        <div class="mono small-muted" style="margin-top:6px;">
          Tổng tiền quà: <strong>${fmtMoney(st.spent)}</strong><br/>
          Đã có ${st.owned} · Đang ship ${st.shipping} · Đang săn ${st.hunting}
        </div>
      </div>
    </div>
    ${g.note ? `<div class="small-muted" style="margin-top:8px; padding:7px 9px; background:var(--surface); border:1px solid var(--line);">${esc(g.note)}</div>` : ""}

    <div class="divider"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
      <span class="panel-title">Danh sách quà</span>
      <button type="button" class="btn btn-sm btn-primary" id="addGiftItemBtn">+ Thêm quà</button>
    </div>

    <div class="chip-row" id="groupStatusChips">
      ${["Tất cả", "Đã có", "Đang ship", "Đang săn"]
        .map((stLabel) => `<button type="button" class="chip ${filterStatus === stLabel ? "active" : ""}" data-gs="${stLabel}">${stLabel}</button>`)
        .join("")}
    </div>

    ${listHtml}

    <div class="modal-actions" style="justify-content:space-between;">
      <button type="button" class="btn btn-sm btn-danger" id="delGiftGroupBtn">Xoá bộ này</button>
      <button type="button" class="btn btn-sm" id="editGiftGroupBtn">Sửa thông tin bộ</button>
    </div>`;

  openModal(`Quà — ${g.title}`, html, (body) => {
    body.querySelector("#addGiftItemBtn").addEventListener("click", () => openGiftItemForm(groupId));
    body.querySelector("#editGiftGroupBtn").addEventListener("click", () => openGiftGroupForm(groupId));
    body.querySelector("#delGiftGroupBtn").addEventListener("click", () => {
      if (!confirm(`Xoá "${g.title}" cùng toàn bộ ${st.qty} quà bên trong?`)) return;
      pushUndo(`xoá bộ quà "${g.title}"`);
      state.giftGroups = state.giftGroups.filter((x) => x.id !== groupId);
      saveState();
      renderMerch();
      renderSpending();
      closeModal();
      SFX.del();
      showToast(`Đã xoá bộ quà "${g.title}".`, { undoable: true });
    });

    body.querySelectorAll("#groupStatusChips [data-gs]").forEach((chip) => {
      chip.addEventListener("click", () => openGiftGroupDetail(groupId, chip.dataset.gs));
    });

    body.querySelectorAll("[data-zoom-gift]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const it = (g.gifts || []).find((x) => x.id === btn.dataset.zoomGift);
        if (resolveImg(it?.image)) {
          openImageLightbox(resolveImg(it.image), `${it.name} (${g.title}) · ${fmtMoney(it.price)}`, () =>
            openGiftGroupDetail(groupId, filterStatus)
          );
        }
      });
    });

    body.querySelectorAll("[data-cycle-gift]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const it = (g.gifts || []).find((x) => x.id === btn.dataset.cycleGift);
        if (!it) return;
        const nextIdx = (MERCH_STATUSES.indexOf(it.status) + 1) % MERCH_STATUSES.length;
        it.status = MERCH_STATUSES[nextIdx];
        SFX.status(nextIdx);
        saveState();
        renderMerch();
        openGiftGroupDetail(groupId, filterStatus);
        showToast(`Đổi trạng thái -> ${it.status}`);
      });
    });

    body.querySelectorAll("[data-edit-gift]").forEach((el) => {
      el.addEventListener("click", () => openGiftItemForm(groupId, el.dataset.editGift));
    });
  });
}

// Thêm / Sửa từng món quà trong Manga/Sách có quà
function openGiftItemForm(groupId, giftId = null) {
  const g = state.giftGroups.find((x) => x.id === groupId);
  if (!g) return;
  const it = giftId ? (g.gifts || []).find((x) => x.id === giftId) : null;
  let currentImage = resolveImg(it?.image || "");

  const html = `
    <form id="giftItemForm" class="form-grid">
      <div class="field">
        <label>Tên quà *</label>
        <input name="name" required value="${esc(it?.name || "")}" placeholder="VD: Standee Acrylic Laios, Shikishi Fes, Bookmark PVC..." />
      </div>

      <div class="field">
        <label>Ảnh quà (chọn từ ảnh iPhone — tự nén nhẹ)</label>
        <div class="cover-preview-wrap">
          <div class="merch-preview" id="giftImgPreview" style="cursor:${currentImage ? "zoom-in" : "default"};">
            ${currentImage ? `<img src="${esc(currentImage)}" alt="" />` : "Chưa có"}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <label class="btn btn-sm" style="margin:0;">
              ${currentImage ? "Đổi ảnh" : "Chọn ảnh"}
              <input type="file" id="giftImgInput" accept="image/*" style="display:none;" />
            </label>
            <button type="button" class="btn btn-sm btn-danger" id="clearGiftImgBtn" style="${currentImage ? "" : "display:none;"}">Xoá ảnh</button>
            <button type="button" class="btn btn-sm" id="undoGiftImgBtn" style="display:none;">Hoàn tác ảnh</button>
          </div>
        </div>
      </div>

      <div class="form-row-2">
        <div class="field">
          <label>Số lượng *</label>
          <input name="quantity" type="number" min="1" required value="${it?.quantity ?? 1}" />
        </div>
        <div class="field">
          <label>Giá tiền (VNĐ, 0 nếu kèm sách)</label>
          <input name="price" type="number" min="0" value="${it?.price ?? 0}" />
        </div>
      </div>

      <div class="form-row-2">
        <div class="field">
          <label>Nguồn gốc</label>
          <select name="source">
            ${["Kèm bản ĐB", "Mua thêm / Pass", "Săn tại Fes"]
              .map((sc) => `<option value="${sc}" ${it?.source === sc ? "selected" : ""}>${sc}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field">
          <label>Trạng thái</label>
          <select name="status">
            ${MERCH_STATUSES.map((st) => `<option value="${st}" ${it?.status === st ? "selected" : ""}>${st}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="field">
        <label>Ngày mua / nhận</label>
        <input name="date" id="giftDateInput" type="date" value="${esc(it?.date || todayISO())}" />
      </div>
      <label class="check-inline">
        <input type="checkbox" id="giftLegacyChk" ${it?.isLegacy ? "checked" : ""} />
        <span>Mua / nhận từ trước (không tính vào hạn mức tháng này)</span>
      </label>

      <div class="field">
        <label>Ghi chú</label>
        <input name="note" value="${esc(it?.note || "")}" placeholder="Tình trạng, shop mua, kèm tập mấy, sự kiện Fes..." />
      </div>

      <div class="modal-actions" style="justify-content:space-between;">
        <div>
          ${it ? `<button type="button" class="btn btn-sm btn-danger" id="delGiftItemBtn">Xoá quà</button>` : ""}
        </div>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn-sm" id="backGiftGroupBtn">Quay lại</button>
          <button type="submit" class="btn btn-sm btn-primary">${it ? "Lưu" : "Thêm quà"}</button>
        </div>
      </div>
    </form>`;

  openModal(`${g.title} — ${it ? "Sửa quà" : "Thêm quà mới"}`, html, (body) => {
    const previewEl = body.querySelector("#giftImgPreview");
    const clearBtn = body.querySelector("#clearGiftImgBtn");

    const setGiftPreview = (url) => {
      currentImage = url || "";
      previewEl.innerHTML = currentImage ? `<img src="${esc(currentImage)}" alt="" />` : "Chưa có";
      previewEl.style.cursor = currentImage ? "zoom-in" : "default";
      clearBtn.style.display = currentImage ? "" : "none";
    };

    previewEl.addEventListener("click", () => {
      if (!currentImage) return;
      openImageLightbox(currentImage, it ? it.name : g.title, () => openGiftItemForm(groupId, giftId));
    });

    const undoGiftImgBtn = body.querySelector("#undoGiftImgBtn");
    const giftLegacyChk = body.querySelector("#giftLegacyChk");
    const giftDateInput = body.querySelector("#giftDateInput");
    let clearedGiftImgBackup = "";

    if (giftLegacyChk && giftDateInput) {
      const syncGiftLegacy = () => {
        giftDateInput.style.opacity = giftLegacyChk.checked ? "0.45" : "1";
      };
      giftLegacyChk.addEventListener("change", syncGiftLegacy);
      syncGiftLegacy();
    }

    clearBtn.addEventListener("click", () => {
      if (currentImage) clearedGiftImgBackup = currentImage;
      setGiftPreview("");
      if (undoGiftImgBtn && clearedGiftImgBackup) undoGiftImgBtn.style.display = "";
      showToast("Đã xoá ảnh quà — bấm 'Hoàn tác ảnh' nếu lỡ tay.");
    });

    if (undoGiftImgBtn) {
      undoGiftImgBtn.addEventListener("click", () => {
        if (!clearedGiftImgBackup) return;
        setGiftPreview(clearedGiftImgBackup);
        clearedGiftImgBackup = "";
        undoGiftImgBtn.style.display = "none";
        showToast("Đã khôi phục ảnh quà.");
      });
    }

    body.querySelector("#giftImgInput").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const cropped = await openImageCropper(file, { ratio: 1, maxW: 440, maxH: 440, quality: 0.76, title: "Cắt ảnh quà" });
      if (cropped) {
        setGiftPreview(cropped);
        if (undoGiftImgBtn) undoGiftImgBtn.style.display = "none";
      }
    });

    body.querySelector("#backGiftGroupBtn").addEventListener("click", () => openGiftGroupDetail(groupId));

    const delBtn = body.querySelector("#delGiftItemBtn");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        pushUndo(`xoá quà "${it.name}"`);
        g.gifts = (g.gifts || []).filter((x) => x.id !== giftId);
        saveState();
        renderMerch();
        renderSpending();
        openGiftGroupDetail(groupId);
        SFX.del();
      showToast(`Đã xoá "${it.name}".`, { undoable: true });
      });
    }

    body.querySelector("#giftItemForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const rec = {
        id: it?.id || uid(),
        name: fd.get("name").trim(),
        quantity: Math.max(1, Math.round(Number(fd.get("quantity")) || 1)),
        price: Math.max(0, Number(fd.get("price")) || 0),
        source: fd.get("source"),
        status: fd.get("status"),
        date: fd.get("date") || todayISO(),
        isLegacy: Boolean(giftLegacyChk && giftLegacyChk.checked),
        image: currentImage,
        note: fd.get("note").trim(),
      };
      if (!rec.name) return;
      g.gifts = g.gifts || [];
      if (it) {
        pushUndo(`sửa quà "${it.name}"`);
        const idx = g.gifts.findIndex((x) => x.id === giftId);
        g.gifts[idx] = rec;
      } else {
        g.gifts.unshift(rec);
      }
      saveState();
      renderMerch();
      renderSpending();
      openGiftGroupDetail(groupId);
      if (!it) { SFX.success(); spawnCelebration(undefined, undefined, 14); } else SFX.pop();
      showToast(it ? "Đã cập nhật quà." : `Đã thêm "${rec.name}".`);
    });
  });
}
