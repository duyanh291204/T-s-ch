"use strict";

// ============================
// TAB 4: CHI TIÊU
// ============================

// ============================
// QUY ĐỔI VẬT LÝ & XUẤT ẢNH HOÁ ĐƠN HIỆU SÁCH (THERMAL RECEIPT PNG)
// ============================
function computePhysicalStats() {
  let totalVols = 0;
  let totalLengthCm = 0;
  let totalWeightG = 0;
  let fullSeriesCount = 0;
  let totalGiftQty = 0;

  state.series.forEach((s) => {
    const vols = getAllSeriesVolumes(s);
    const cnt = vols.length;
    totalVols += cnt;
    if (s.status === "Đã full") fullSeriesCount++;
    const cmPerVol =
      s.category === "Sách" ? 2.3 : s.category === "Light Novel" ? 2.0 : s.category === "Artbook" ? 1.8 : 1.5;
    const gPerVol =
      s.category === "Sách" ? 420 : s.category === "Light Novel" ? 310 : s.category === "Artbook" ? 560 : 205;
    totalLengthCm += cnt * cmPerVol;
    totalWeightG += cnt * gPerVol;
  });

  state.giftGroups.forEach((g) => {
    totalGiftQty += getGroupGiftStats(g).qty;
  });

  const lengthText =
    totalLengthCm >= 100
      ? `${(totalLengthCm / 100).toFixed(2).replace(".", ",")} m`
      : `${Math.round(totalLengthCm)} cm`;
  const weightKg = totalWeightG / 1000;
  const weightText =
    weightKg >= 1 ? `${weightKg.toFixed(1).replace(".", ",")} kg` : `${Math.round(totalWeightG)} g`;

  return {
    totalVols,
    totalLengthCm,
    lengthText,
    totalWeightG,
    weightText,
    fullSeriesCount,
    totalGiftQty,
  };
}

function generateReceiptPngDataUrl() {
  const phys = computePhysicalStats();
  let bookPaid = 0;
  let bookCover = 0;
  let merchPaid = 0;
  const pubTotals = { Trẻ: 0, "Kim Đồng": 0, IPM: 0, "Nhã Nam": 0, Khác: 0 };

  const seriesRows = state.series.map((s) => {
    const vols = getAllSeriesVolumes(s);
    const paid = vols.reduce((a, v) => a + (Number(v.paidPrice) || 0), 0);
    const cover = vols.reduce((a, v) => a + (Number(v.coverPrice) || 0), 0);
    bookPaid += paid;
    bookCover += cover;
    const pk = pubTotals.hasOwnProperty(s.publisher) ? s.publisher : "Khác";
    pubTotals[pk] += paid;
    return { title: s.title, vols: vols.length, paid, publisher: s.publisher };
  });

  state.giftGroups.forEach((g) => {
    const st = getGroupGiftStats(g);
    merchPaid += st.spent;
    const pk = pubTotals.hasOwnProperty(g.publisher) ? g.publisher : "Khác";
    pubTotals[pk] += st.spent;
  });

  seriesRows.sort((a, b) => b.paid - a.paid);
  const topSeries = seriesRows.slice(0, 6);
  const othersCount = Math.max(0, seriesRows.length - topSeries.length);
  const othersPaid = seriesRows.slice(6).reduce((a, x) => a + x.paid, 0);
  const totalPaid = bookPaid + merchPaid;
  const savedDiff = bookCover - bookPaid;
  const pubEntries = Object.entries(pubTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  const W = 720;
  const padX = 48;
  const rowH = 34;
  const dynamicRows = topSeries.length + (othersCount ? 1 : 0) + (merchPaid > 0 || phys.totalGiftQty > 0 ? 1 : 0);
  const pubRowsCount = Math.max(1, pubEntries.length);
  const H = 640 + dynamicRows * rowH + pubRowsCount * 28;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Nền ngoài tối nhẹ để nổi bật tờ giấy nhiệt
  ctx.fillStyle = "#E5E0D5";
  ctx.fillRect(0, 0, W, H);

  // Vẽ tờ hoá đơn giấy nhiệt răng cưa trên & dưới
  const mx = 22;
  const my = 20;
  const rw = W - mx * 2;
  const rh = H - my * 2;
  const toothW = 14;
  const toothH = 9;

  ctx.save();
  ctx.shadowColor = "rgba(35, 28, 20, 0.18)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#FCFBF7";
  ctx.beginPath();
  ctx.moveTo(mx, my + toothH);
  for (let x = mx; x < mx + rw; x += toothW) {
    ctx.lineTo(Math.min(mx + rw, x + toothW / 2), my);
    ctx.lineTo(Math.min(mx + rw, x + toothW), my + toothH);
  }
  ctx.lineTo(mx + rw, my + rh - toothH);
  for (let x = mx + rw; x > mx; x -= toothW) {
    ctx.lineTo(Math.max(mx, x - toothW / 2), my + rh);
    ctx.lineTo(Math.max(mx, x - toothW), my + rh - toothH);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Hạt giấy mịn trên hoá đơn
  ctx.fillStyle = "rgba(80, 70, 55, 0.035)";
  for (let i = 0; i < 650; i++) {
    const gx = mx + ((i * 97) % rw);
    const gy = my + toothH + ((i * 131) % (rh - toothH * 2));
    ctx.fillRect(gx, gy, 2, 2);
  }

  const ink = "#1E1C1A";
  const muted = "#6B655D";
  const accent = "#9E472A";
  const forest = "#2F5D50";
  const fontMono = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const fontSans = '"Be Vietnam Pro", -apple-system, sans-serif';

  const drawDash = (y) => {
    ctx.strokeStyle = "#BDB7AC";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(W - padX, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const truncText = (text, maxW) => {
    let s = String(text || "");
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  };

  let y = my + 54;

  // Header hiệu sách
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = `700 28px ${fontMono}`;
  ctx.fillText("HIỆU SÁCH TỦ SÁCH", W / 2, y);
  y += 28;
  ctx.fillStyle = muted;
  ctx.font = `500 15px ${fontMono}`;
  ctx.fillText("PHIẾU KIỂM KÊ SƯU TẦM · MANGA & SÁCH", W / 2, y);
  y += 26;
  const nowStr = new Date().toLocaleString("vi-VN", { hour12: false });
  ctx.font = `400 14px ${fontMono}`;
  ctx.fillText(`NGÀY IN: ${nowStr}   ·   MÃ #${todayISO().replace(/-/g, "")}`, W / 2, y);
  y += 22;
  drawDash(y);
  y += 28;

  // Column header
  ctx.textAlign = "left";
  ctx.fillStyle = muted;
  ctx.font = `600 13px ${fontMono}`;
  ctx.fillText("TOP BỘ ĐỐT VÍ NHẤT", padX, y);
  ctx.textAlign = "right";
  ctx.fillText("SL · THỰC CHI", W - padX, y);
  y += 26;

  // Top series rows
  ctx.fillStyle = ink;
  topSeries.forEach((row, idx) => {
    ctx.textAlign = "left";
    ctx.font = `600 16px ${fontSans}`;
    const nameStr = truncText(`${idx + 1}. ${row.title}`, W - padX * 2 - 190);
    ctx.fillText(nameStr, padX, y);

    ctx.textAlign = "right";
    ctx.font = `500 15px ${fontMono}`;
    ctx.fillText(`${row.vols}t · ${fmtMoney(row.paid)}`, W - padX, y);
    y += rowH;
  });

  if (othersCount > 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = muted;
    ctx.font = `500 15px ${fontSans}`;
    ctx.fillText(`+ ${othersCount} bộ khác trong tủ`, padX, y);
    ctx.textAlign = "right";
    ctx.font = `500 15px ${fontMono}`;
    ctx.fillText(fmtMoney(othersPaid), W - padX, y);
    y += rowH;
  }

  if (merchPaid > 0 || phys.totalGiftQty > 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = ink;
    ctx.font = `500 15px ${fontSans}`;
    ctx.fillText(`Quà & Đồ sưu tầm (${phys.totalGiftQty} món)`, padX, y);
    ctx.textAlign = "right";
    ctx.font = `500 15px ${fontMono}`;
    ctx.fillText(fmtMoney(merchPaid), W - padX, y);
    y += rowH;
  }

  y += 4;
  drawDash(y);
  y += 32;

  // Tổng cộng
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = `700 20px ${fontMono}`;
  ctx.fillText("TỔNG THỰC CHI", padX, y);
  ctx.textAlign = "right";
  ctx.fillStyle = accent;
  ctx.font = `700 24px ${fontMono}`;
  ctx.fillText(fmtMoney(totalPaid), W - padX, y);
  y += 30;

  ctx.fillStyle = muted;
  ctx.textAlign = "left";
  ctx.font = `500 15px ${fontMono}`;
  ctx.fillText("TỔNG GIÁ BÌA SÁCH", padX, y);
  ctx.textAlign = "right";
  ctx.fillText(fmtMoney(bookCover), W - padX, y);
  y += 26;

  ctx.textAlign = "left";
  ctx.fillStyle = savedDiff >= 0 ? forest : accent;
  ctx.font = `600 15px ${fontMono}`;
  ctx.fillText(savedDiff >= 0 ? "TIẾT KIỆM SĂN SALE" : "CHÊNH MUA BẢN HIẾM", padX, y);
  ctx.textAlign = "right";
  ctx.fillText(`${savedDiff >= 0 ? "-" : "+"}${fmtMoney(Math.abs(savedDiff))}`, W - padX, y);
  y += 24;

  drawDash(y);
  y += 28;

  // Quy đổi vật lý
  ctx.textAlign = "left";
  ctx.fillStyle = muted;
  ctx.font = `600 13px ${fontMono}`;
  ctx.fillText("THÔNG SỐ KỆ SÁCH VẬT LÝ", padX, y);
  y += 26;
  ctx.fillStyle = ink;
  ctx.font = `600 15px ${fontMono}`;
  ctx.fillText(`• ${state.series.length} đầu sách (${phys.fullSeriesCount} bộ full) · ${phys.totalVols} tập`, padX, y);
  y += 25;
  ctx.fillText(`• Chiều dài kệ ước tính : ~${phys.lengthText}`, padX, y);
  y += 25;
  ctx.fillText(`• Cân nặng giấy ước tính: ~${phys.weightText}`, padX, y);
  y += 22;

  drawDash(y);
  y += 28;

  // Theo NXB
  ctx.fillStyle = muted;
  ctx.font = `600 13px ${fontMono}`;
  ctx.fillText("PHÂN BỔ THEO NXB", padX, y);
  y += 24;
  ctx.fillStyle = ink;
  ctx.font = `500 14.5px ${fontMono}`;
  if (!pubEntries.length) {
    ctx.fillText("Chưa có dữ liệu chi tiêu.", padX, y);
    y += 28;
  } else {
    pubEntries.forEach(([pubName, val]) => {
      ctx.textAlign = "left";
      ctx.fillText(pubName, padX, y);
      ctx.textAlign = "right";
      ctx.fillText(fmtMoney(val), W - padX, y);
      y += 28;
    });
  }

  y += 10;
  drawDash(y);
  y += 24;

  // Vẽ mã vạch trang trí cuối hoá đơn (tạo từ tổng tập + tổng tiền)
  const barSeed = `${phys.totalVols}${totalPaid}TUSACH2026`;
  const barAreaW = 340;
  const barStartX = (W - barAreaW) / 2;
  const barH = 44;
  ctx.fillStyle = ink;
  let bx = barStartX;
  let bi = 0;
  while (bx < barStartX + barAreaW - 4) {
    const code = barSeed.charCodeAt(bi % barSeed.length) + bi * 13;
    const bw = (code % 3) + 1.6;
    const gap = ((code >> 2) % 3) + 1.8;
    ctx.fillRect(bx, y, bw, barH);
    bx += bw + gap;
    bi++;
  }
  y += barH + 22;

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = `500 13px ${fontMono}`;
  ctx.fillText("CẢM ƠN ĐÃ NUÔI KỆ SÁCH · TỦ SÁCH APP", W / 2, y);

  return canvas.toDataURL("image/png");
}

function openReceiptModal() {
  const pngUrl = generateReceiptPngDataUrl();
  SFX.shutter();
  const html = `
    <div class="form-grid">
      <div class="receipt-preview-box">
        <img src="${pngUrl}" alt="Hoá đơn hiệu sách" />
      </div>
      <div class="small-muted" style="text-align:center;">
        Bấm <strong>Lưu ảnh / Chia sẻ</strong> để lưu vào Ảnh iPhone hoặc gửi khoe bạn bè!
      </div>
      <div class="modal-actions" style="justify-content:space-between;">
        <button type="button" class="btn btn-sm" id="closeReceiptBtn">Đóng</button>
        <button type="button" class="btn btn-sm btn-primary" id="shareReceiptBtn">Lưu ảnh / Chia sẻ</button>
      </div>
    </div>`;

  openModal("Hoá đơn hiệu sách của bạn", html, (body) => {
    body.querySelector("#closeReceiptBtn").addEventListener("click", closeModal);
    body.querySelector("#shareReceiptBtn").addEventListener("click", async () => {
      try {
        const res = await fetch(pngUrl);
        const blob = await res.blob();
        const fileName = `hoadon-tusach-${todayISO()}.png`;
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: "Hoá đơn Tủ Sách", files: [file] });
          SFX.success();
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        SFX.success();
        showToast("Đã tải ảnh hoá đơn .png!");
      } catch (err) {
        if (err && err.name === "AbortError") return;
        SFX.error();
        showToast("Giữ tay vào ảnh hoá đơn phía trên để chọn Lưu vào Ảnh nhé.");
      }
    });
  });
}

function renderSpending(animateSpending = false) {
  let bookPaid = 0;
  let bookCover = 0;
  let merchPaid = 0;
  const pubTotals = { Trẻ: 0, "Kim Đồng": 0, IPM: 0, "Nhã Nam": 0, Khác: 0 };
  const catTotals = { Manga: 0, "Light Novel": 0, Sách: 0, Artbook: 0, "Quà & Đồ": 0 };
  const monthTotals = {};

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    last6Months.push(ym);
    monthTotals[ym] = 0;
  }

  let legacyVols = 0;
  let legacyGifts = 0;
  let legacyPaid = 0;

  state.series.forEach((s) => {
    const pubKey = pubTotals.hasOwnProperty(s.publisher) ? s.publisher : "Khác";
    const catKey = catTotals.hasOwnProperty(s.category) ? s.category : "Sách";
    getAllSeriesVolumes(s).forEach((v) => {
      const p = Number(v.paidPrice) || 0;
      const c = Number(v.coverPrice) || 0;
      bookPaid += p;
      bookCover += c;
      pubTotals[pubKey] += p;
      catTotals[catKey] += p;
      if (v.isLegacy) {
        legacyVols++;
        legacyPaid += p;
      } else {
        const ym = (v.date || "").slice(0, 7);
        if (monthTotals.hasOwnProperty(ym)) monthTotals[ym] += p;
      }
    });
  });

  state.giftGroups.forEach((g) => {
    const pubKey = pubTotals.hasOwnProperty(g.publisher) ? g.publisher : "Khác";
    (g.gifts || []).forEach((m) => {
      const p = Number(m.price) || 0;
      merchPaid += p;
      pubTotals[pubKey] += p;
      catTotals["Quà & Đồ"] += p;
      if (m.isLegacy) {
        legacyGifts++;
        legacyPaid += p;
      } else {
        const ym = (m.date || "").slice(0, 7);
        if (monthTotals.hasOwnProperty(ym)) monthTotals[ym] += p;
      }
    });
  });

  const totalPaid = bookPaid + merchPaid;
  const savedDiff = bookCover - bookPaid;
  const pinnedTotal = state.pinned.reduce((a, p) => a + (Number(p.estPrice) || 0), 0);

  const kpiWrap = document.getElementById("spendingKpis");
  kpiWrap.innerHTML = `
    <div class="kpi-card fx-card-in" style="--stagger:0">
      <div class="kpi-label">Tổng thực chi</div>
      <div class="kpi-val mono" id="kpiValTotalPaid">${fmtMoney(totalPaid)}</div>
      <div class="kpi-sub">Sách ${fmtMoney(bookPaid)} · Quà ${fmtMoney(merchPaid)}</div>
    </div>
    <div class="kpi-card fx-card-in" style="--stagger:1">
      <div class="kpi-label">Tổng giá bìa</div>
      <div class="kpi-val mono" id="kpiValBookCover">${fmtMoney(bookCover)}</div>
      <div class="kpi-sub">Chỉ tính sách & truyện</div>
    </div>
    <div class="kpi-card fx-card-in" style="--stagger:2">
      <div class="kpi-label">${savedDiff >= 0 ? "Tiết kiệm sale" : "Chênh mua hiếm"}</div>
      <div class="kpi-val mono" id="kpiValSavedDiff" style="color:${savedDiff >= 0 ? "var(--forest)" : "var(--accent)"}">
        ${savedDiff >= 0 ? "-" : "+"}${fmtMoney(Math.abs(savedDiff))}
      </div>
      <div class="kpi-sub">So với giá bìa</div>
    </div>
    <div class="kpi-card fx-card-in" style="--stagger:3">
      <div class="kpi-label">Dự chi đang ghim</div>
      <div class="kpi-val mono" id="kpiValPinned">${fmtMoney(pinnedTotal)}</div>
      <div class="kpi-sub">${state.pinned.length} mục chờ săn</div>
    </div>`;

  if (animateSpending) {
    animateCountUp(document.getElementById("kpiValTotalPaid"), totalPaid, fmtMoney, 480);
    animateCountUp(document.getElementById("kpiValBookCover"), bookCover, fmtMoney, 520);
    animateCountUp(
      document.getElementById("kpiValSavedDiff"),
      Math.abs(savedDiff),
      (n) => (savedDiff >= 0 ? "-" : "+") + fmtMoney(n),
      560
    );
    animateCountUp(document.getElementById("kpiValPinned"), pinnedTotal, fmtMoney, 420);
  }

  // Quy đổi vật lý kệ sách
  const phys = computePhysicalStats();
  const physGrid = document.getElementById("physicalStatsGrid");
  const physNote = document.getElementById("physicalStatsNote");
  if (physGrid) {
    physGrid.innerHTML = `
      <div class="phys-stat">
        <div class="phys-val mono">${esc(phys.lengthText)}</div>
        <div class="phys-lbl">Chiều dài kệ</div>
      </div>
      <div class="phys-stat">
        <div class="phys-val mono">${esc(phys.weightText)}</div>
        <div class="phys-lbl">Cân nặng giấy</div>
      </div>
      <div class="phys-stat">
        <div class="phys-val mono">${phys.totalVols}</div>
        <div class="phys-lbl">Tổng số tập</div>
      </div>`;
  }
  if (physNote) {
    const shelvesNeeded = Math.max(1, Math.ceil(phys.totalLengthCm / 80));
    physNote.textContent = phys.totalVols
      ? `Ước tính chiếm khoảng ${shelvesNeeded} tầng kệ chuẩn 80cm · ${phys.fullSeriesCount} bộ đã full · ${phys.totalGiftQty} món quà.`
      : "Thêm truyện hoặc sách để xem tủ của bạn dài bao nhiêu mét và nặng mấy ký giấy!";
  }

  // Budget month
  const thisMonthSpent = monthTotals[currentYM] || 0;
  const limit = Number(state.budgetLimit) || 1000000;
  const pct = Math.min(100, Math.round((thisMonthSpent / Math.max(1, limit)) * 100));
  document.getElementById("budgetMonthTitle").textContent = `Hạn mức tháng ${currentYM.slice(5)}/${currentYM.slice(0, 4)}`;
  document.getElementById("budgetSpentText").textContent = fmtMoney(thisMonthSpent);
  document.getElementById("budgetLimitText").textContent = `/ ${fmtMoney(limit)}`;
  const bar = document.getElementById("budgetBar");
  bar.classList.toggle("over", thisMonthSpent > limit);
  if (animateSpending && isRichFx()) {
    bar.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${pct}%`; }));
  } else {
    bar.style.width = `${pct}%`;
  }
  const legacySummary =
    legacyVols || legacyGifts
      ? ` · Đã tách ${legacyVols} tập${legacyGifts ? ` & ${legacyGifts} quà` : ""} mua từ trước (${fmtMoney(legacyPaid)}).`
      : "";
  document.getElementById("budgetNote").textContent =
    (thisMonthSpent > limit
      ? `Đã vượt hạn mức tháng ${fmtMoney(thisMonthSpent - limit)}.`
      : `Còn dư ${fmtMoney(limit - thisMonthSpent)} trong tháng này (${pct}%).`) + legacySummary;

  // Helper for flat bar lists
  function renderBars(elId, entries) {
    const max = Math.max(...entries.map(([, v]) => v), 1);
    const wrapEl = document.getElementById(elId);
    wrapEl.innerHTML = entries
      .map(([label, val], idx) => {
        const targetPct = Math.round((val / max) * 100);
        const initPct = animateSpending && isRichFx() ? 0 : targetPct;
        return `
      <div class="bar-row">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(label)}</span>
        <div class="bar-track"><div class="bar-fill" data-target-w="${targetPct}" style="width:${initPct}%; transition-delay:${idx * 35}ms"></div></div>
        <span class="bar-val mono">${fmtMoney(val)}</span>
      </div>`;
      })
      .join("");
    if (animateSpending && isRichFx()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          wrapEl.querySelectorAll(".bar-fill[data-target-w]").forEach((f) => {
            f.style.width = f.dataset.targetW + "%";
          });
        });
      });
    }
  }

  renderBars(
    "chartMonths",
    last6Months.map((ym) => [`T${ym.slice(5)}/${ym.slice(2, 4)}`, monthTotals[ym]])
  );
  renderBars("chartPublishers", Object.entries(pubTotals));
  renderBars("chartCategories", Object.entries(catTotals));

  // Pinned watchlist
  document.getElementById("pinnedTotalLabel").textContent = fmtMoney(pinnedTotal);
  const pinContainer = document.getElementById("pinnedListContainer");
  if (!state.pinned.length) {
    pinContainer.innerHTML = `<div class="small-muted">Chưa ghim mục nào. Vào tab Tin NXB bấm "Ghim dự chi" để theo dõi.</div>`;
  } else {
    pinContainer.innerHTML = state.pinned
      .map(
        (p) => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--line);">
        <div style="min-width:0;">
          <div style="font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(p.title)}</div>
          <div class="small-muted mono">${esc(p.publisher)} ${p.releaseDate ? `· ${esc(p.releaseDate)}` : ""}</div>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          <button class="btn btn-sm mono" data-edit-pin-price="${esc(p.id)}">${fmtMoney(p.estPrice)}</button>
          <button class="btn btn-sm" data-unpin="${esc(p.id)}">Bỏ</button>
        </div>
      </div>`
      )
      .join("");

    pinContainer.querySelectorAll("[data-edit-pin-price]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = state.pinned.find((x) => x.id === btn.dataset.editPinPrice);
        if (!p) return;
        const val = prompt(`Nhập số tiền dự chi (VNĐ) cho "${p.title}":`, String(p.estPrice || 0));
        if (val === null) return;
        p.estPrice = Math.max(0, Number(val.replace(/[^\d]/g, "")) || 0);
        saveState();
        renderSpending();
      });
    });
    pinContainer.querySelectorAll("[data-unpin]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.pinned = state.pinned.filter((x) => x.id !== btn.dataset.unpin);
        saveState();
        renderNews();
        renderSpending();
      });
    });
  }
}

function openMarkLegacyModal() {
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let thisMonthCount = 0;
  let thisMonthPaid = 0;
  let allNonLegacyCount = 0;
  let legacyCount = 0;

  state.series.forEach((s) => {
    getAllSeriesVolumes(s).forEach((v) => {
      if (v.isLegacy) legacyCount++;
      else {
        allNonLegacyCount++;
        if ((v.date || "").slice(0, 7) === currentYM) {
          thisMonthCount++;
          thisMonthPaid += Number(v.paidPrice) || 0;
        }
      }
    });
  });
  state.giftGroups.forEach((g) => {
    (g.gifts || []).forEach((m) => {
      if (m.isLegacy) legacyCount++;
      else {
        allNonLegacyCount++;
        if ((m.date || "").slice(0, 7) === currentYM) {
          thisMonthCount++;
          thisMonthPaid += Number(m.price) || 0;
        }
      }
    });
  });

  const html = `
    <div class="form-grid">
      <div class="small-muted">
        Các món đánh dấu <strong>Mua từ trước</strong> vẫn được tính vào <strong>Tổng thực chi</strong>, <strong>Tổng giá bìa</strong> và <strong>Theo NXB</strong>, nhưng sẽ <strong>không cộng vào Hạn mức tháng này & Biểu đồ 6 tháng</strong> để bạn theo dõi chi tiêu mới từ hôm nay chuẩn hơn.
      </div>

      <div class="boxset-hint mono">
        Tháng ${currentYM.slice(5)}/${currentYM.slice(0, 4)} đang có: ${thisMonthCount} mục (${fmtMoney(thisMonthPaid)})<br/>
        Đang là "Mua từ trước": ${legacyCount} mục
      </div>

      <button type="button" class="btn btn-primary" id="legThisMonthBtn" ${thisMonthCount ? "" : "disabled"}>
        Chuyển ${thisMonthCount} mục tháng ${currentYM.slice(5)}/${currentYM.slice(0, 4)} → Mua từ trước
      </button>

      <button type="button" class="btn" id="legAllShelfBtn" ${allNonLegacyCount ? "" : "disabled"}>
        Chuyển toàn bộ tủ (${allNonLegacyCount} mục) → Mua từ trước
      </button>

      ${
        legacyCount
          ? `<button type="button" class="btn btn-danger" id="legResetBtn">Bỏ nhãn "Mua từ trước" (${legacyCount} mục) về lại theo ngày mua</button>`
          : ""
      }
    </div>`;

  openModal("Gom tủ cũ → Mua từ trước", html, (body) => {
    const applyLegacy = (mode) => {
      let changed = 0;
      const label =
        mode === "month"
          ? `chuyển tháng ${currentYM.slice(5)} sang Mua từ trước`
          : mode === "all"
          ? "chuyển toàn bộ tủ sang Mua từ trước"
          : "bỏ nhãn Mua từ trước";
      pushUndo(label);

      state.series.forEach((s) => {
        getAllSeriesVolumes(s).forEach((v) => {
          if (mode === "reset" && v.isLegacy) {
            v.isLegacy = false;
            changed++;
          } else if (mode === "all" && !v.isLegacy) {
            v.isLegacy = true;
            changed++;
          } else if (mode === "month" && !v.isLegacy && (v.date || "").slice(0, 7) === currentYM) {
            v.isLegacy = true;
            changed++;
          }
        });
      });
      state.giftGroups.forEach((g) => {
        (g.gifts || []).forEach((m) => {
          if (mode === "reset" && m.isLegacy) {
            m.isLegacy = false;
            changed++;
          } else if (mode === "all" && !m.isLegacy) {
            m.isLegacy = true;
            changed++;
          } else if (mode === "month" && !m.isLegacy && (m.date || "").slice(0, 7) === currentYM) {
            m.isLegacy = true;
            changed++;
          }
        });
      });

      saveState();
      renderSpending();
      closeModal();
      showToast(
        mode === "reset"
          ? `Đã đưa ${changed} mục về lại tính theo ngày mua.`
          : `Đã chuyển ${changed} mục sang "Mua từ trước".`,
        { undoable: true }
      );
    };

    body.querySelector("#legThisMonthBtn").addEventListener("click", () => applyLegacy("month"));
    body.querySelector("#legAllShelfBtn").addEventListener("click", () => applyLegacy("all"));
    const resetBtn = body.querySelector("#legResetBtn");
    if (resetBtn) resetBtn.addEventListener("click", () => applyLegacy("reset"));
  });
}
