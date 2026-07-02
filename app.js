const STORAGE_KEY = "luckin-labels-v1";
const LABEL_W = 1440;
const LABEL_H = 1707;
const TEMPLATE_SRC = "./label-template.jpg";

const sampleLabel = {
  number: "812",
  name: "KELSKELS",
  title: "",
  pickup: "自提",
  cupIndex: "1",
  cupTotal: "1",
  temperature: "热",
  size: "特大20",
  drink: "精萃澳瑞白",
  options: "不另外加糖，埃塞金烘，牛奶，\n埃塞豆007",
  identityA: "埃塞俄比亚\n单一产区",
  identityB: "IAC铂金豆",
  identityC: "花香可可浓\n糖口感",
  time: "2026-07-01 09:07"
};

const blankLabel = {
  number: "",
  name: "",
  title: "",
  pickup: "自提",
  cupIndex: "1",
  cupTotal: "1",
  temperature: "热",
  size: "",
  drink: "",
  options: "",
  identityA: "",
  identityB: "",
  identityC: "",
  time: ""
};

const form = document.querySelector("#labelForm");
const previewCanvas = document.querySelector("#previewCanvas");
const photoInput = document.querySelector("#photoInput");
const ocrStatus = document.querySelector("#ocrStatus");
const saveBtn = document.querySelector("#saveBtn");
const exportBtn = document.querySelector("#exportBtn");
const sampleBtn = document.querySelector("#sampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const collectionList = document.querySelector("#collectionList");
const collectionCount = document.querySelector("#collectionCount");
const emptyCollected = document.querySelector("#emptyCollected");
const gridBoard = document.querySelector("#gridBoard");
const gridSearch = document.querySelector("#gridSearch");
const installBtn = document.querySelector("#installBtn");
const labelDialog = document.querySelector("#labelDialog");
const dialogCanvas = document.querySelector("#dialogCanvas");
const closeDialogBtn = document.querySelector("#closeDialogBtn");
const dialogEditBtn = document.querySelector("#dialogEditBtn");
const dialogExportBtn = document.querySelector("#dialogExportBtn");

let deferredInstallPrompt = null;
let labels = loadLabels();
let qrCanvas = document.createElement("canvas");
let dialogLabelNumber = "";

const templateImage = new Image();
templateImage.src = TEMPLATE_SRC;
templateImage.addEventListener("load", () => {
  renderPreview();
  renderCollection();
  renderGrid();
});

function padNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 3);
  return digits ? digits.padStart(3, "0") : "";
}

function getFormData() {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormData(data) {
  for (const [key, value] of Object.entries({ ...blankLabel, ...data })) {
    const field = form.elements[key];
    if (field) field.value = value ?? "";
  }
  renderPreview();
}

function normalizeLabel(data) {
  const normalized = { ...blankLabel, ...data };
  normalized.number = padNumber(normalized.number);
  normalized.cupIndex = normalized.cupIndex || "1";
  normalized.cupTotal = normalized.cupTotal || "1";
  normalized.time = normalized.time || formatNow();
  return normalized;
}

function formatNow() {
  const date = new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return parts.replace(" ", " ");
}

function loadLabels() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistLabels() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
}

function clearStatus() {
  ocrStatus.textContent = "";
  ocrStatus.classList.remove("error");
}

function setStatus(message, isError = false) {
  ocrStatus.textContent = message;
  ocrStatus.classList.toggle("error", isError);
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
  const value = String(text || "");
  const words = value.split(/\n/).flatMap((line, index, arr) => {
    const chars = Array.from(line);
    if (index < arr.length - 1) chars.push("\n");
    return chars;
  });
  let line = "";
  let currentY = y;
  const maxLines = options.maxLines || 4;
  let lines = 0;

  for (const word of words) {
    if (word === "\n") {
      ctx.fillText(line, x, currentY, maxWidth);
      line = "";
      currentY += lineHeight;
      lines += 1;
      if (lines >= maxLines) return;
      continue;
    }

    const test = line + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY, maxWidth);
      line = word;
      currentY += lineHeight;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }

  if (line && lines < maxLines) ctx.fillText(line, x, currentY, maxWidth);
}

function getAppUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/index\.html$/, "");
  return url.href;
}

function drawAppQr(ctx, x, y, size) {
  if (typeof window.qrcode !== "function") {
    ctx.save();
    ctx.fillStyle = "#050505";
    ctx.font = "700 34px Arial, sans-serif";
    ctx.fillText("QR", x + size / 2 - 24, y + size / 2 + 12);
    ctx.restore();
    return;
  }

  const qr = window.qrcode(0, "M");
  qr.addData(getAppUrl());
  qr.make();
  const modules = qr.getModuleCount();
  const quiet = 4;
  const total = modules + quiet * 2;
  const cell = size / total;

  ctx.save();
  ctx.fillStyle = "#050505";
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(
          Math.round(x + (col + quiet) * cell),
          Math.round(y + (row + quiet) * cell),
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }
  }
  ctx.restore();
}

function drawLabel(canvas, rawData, ratio = 1) {
  const data = normalizeLabel(rawData);
  const ctx = canvas.getContext("2d");
  canvas.width = LABEL_W * ratio;
  canvas.height = LABEL_H * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, LABEL_W, LABEL_H);

  if (templateImage.complete && templateImage.naturalWidth) {
    ctx.drawImage(templateImage, 0, 0, LABEL_W, LABEL_H);
  } else {
    ctx.fillStyle = "#a9d6f5";
    roundedRect(ctx, 0, 0, LABEL_W, LABEL_H, 64);
    ctx.fill();
  }

  ctx.fillStyle = "#050505";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.font = "900 74px Arial, sans-serif";
  ctx.fillText("Hi,", 92, 208);
  ctx.font = "900 68px Arial, 'PingFang SC', sans-serif";
  drawText(ctx, `${data.name || "__"} ${data.title || ""}`.trim(), 250, 208, 520, 74, { maxLines: 1 });

  ctx.font = "900 178px Arial, sans-serif";
  ctx.fillText(data.number || "000", 88, 375);

  ctx.font = "900 58px Arial, 'PingFang SC', sans-serif";
  ctx.fillText(data.pickup || "自提", 630, 310);
  ctx.font = "900 50px Arial, 'PingFang SC', sans-serif";
  ctx.fillText(`第${data.cupIndex || "1"}/${data.cupTotal || "1"}杯`, 630, 392);

  ctx.font = "900 76px Arial, 'PingFang SC', sans-serif";
  drawText(ctx, data.drink || "饮品名称", 90, 550, 660, 86, { maxLines: 2 });

  ctx.font = "900 58px Arial, 'PingFang SC', sans-serif";
  ctx.fillText(data.temperature || "热", 92, 748);
  ctx.font = "900 54px Arial, 'PingFang SC', sans-serif";
  ctx.fillText(data.size || "规格", 250, 748, 260);

  drawAppQr(ctx, 880, 345, 410);

  ctx.font = "700 52px Arial, 'PingFang SC', sans-serif";
  drawText(ctx, data.options || "糖/加料/备注", 90, 960, 970, 66, { maxLines: 3 });

  ctx.font = "900 52px Arial, 'PingFang SC', sans-serif";
  ctx.fillText("产品身份标识", 90, 1194);
  ctx.font = "800 43px Arial, 'PingFang SC', sans-serif";
  drawText(ctx, data.identityA, 132, 1320, 310, 56, { maxLines: 2 });
  ctx.fillRect(585, 1270, 6, 122);
  drawText(ctx, data.identityB, 670, 1350, 260, 54, { maxLines: 2 });
  ctx.fillRect(1052, 1270, 6, 122);
  drawText(ctx, data.identityC, 1110, 1306, 230, 54, { maxLines: 2 });

  ctx.strokeStyle = "#050505";
  ctx.lineWidth = 4;
  ctx.setLineDash([1, 13]);
  ctx.beginPath();
  ctx.moveTo(88, 1480);
  ctx.lineTo(1352, 1480);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "900 45px Arial, sans-serif";
  ctx.fillText(data.time || formatNow(), 92, 1585);
  ctx.font = "900 44px Arial, 'PingFang SC', sans-serif";
  ctx.fillText("建议尽快享用，风味更佳", 840, 1585, 490);
}

function renderPreview() {
  drawLabel(previewCanvas, getFormData(), Math.max(1, window.devicePixelRatio || 1));
}

function sortedLabels() {
  return Object.values(labels).sort((a, b) => Number(a.number) - Number(b.number));
}

function renderCollection() {
  const all = sortedLabels();
  collectionCount.textContent = String(all.length);
  emptyCollected.classList.toggle("show", all.length === 0);
  collectionList.innerHTML = "";

  for (const item of all) {
    const row = document.createElement("article");
    row.className = "collection-item";
    const canvas = document.createElement("canvas");
    drawLabel(canvas, item, 0.22);
    const meta = document.createElement("div");
    meta.className = "collection-meta";
    meta.innerHTML = `
      <strong>${item.number}</strong>
      <p>${escapeHtml(item.drink || "未填写饮品")} · ${escapeHtml(item.time || "")}</p>
      <div class="item-actions">
        <button class="mini-button" type="button" data-action="edit" data-number="${item.number}">编辑</button>
        <button class="mini-button" type="button" data-action="download" data-number="${item.number}">导出</button>
        <button class="mini-button danger" type="button" data-action="delete" data-number="${item.number}">删除</button>
      </div>
    `;
    row.append(canvas, meta);
    collectionList.append(row);
  }
}

function renderGrid() {
  const fragment = document.createDocumentFragment();
  gridBoard.innerHTML = "";
  for (let i = 1; i <= 999; i += 1) {
    const number = String(i).padStart(3, "0");
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `grid-cell ${labels[number] ? "filled" : "empty"}`;
    cell.dataset.number = number;
    if (labels[number]) {
      const canvas = document.createElement("canvas");
      drawLabel(canvas, labels[number], 0.14);
      cell.append(canvas);
      cell.setAttribute("aria-label", `查看 ${number}`);
    } else {
      cell.textContent = number;
      cell.setAttribute("aria-label", `${number} 未收集`);
    }
    fragment.append(cell);
  }
  gridBoard.append(fragment);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function saveCurrentLabel() {
  const data = normalizeLabel(getFormData());
  if (!data.number) {
    setStatus("请先填写 001-999 的编号。", true);
    form.elements.number.focus();
    return;
  }
  if (Number(data.number) < 1 || Number(data.number) > 999) {
    setStatus("编号范围需要在 001-999。", true);
    form.elements.number.focus();
    return;
  }
  if (labels[data.number]) {
    const shouldOverwrite = window.confirm("改编号已收集，是否覆盖旧记录？");
    if (!shouldOverwrite) {
      activateScreen("collected");
      return;
    }
  }
  labels[data.number] = data;
  persistLabels();
  renderCollection();
  renderGrid();
  setStatus(`已保存 ${data.number}。`);
  activateScreen("collected");
}

function downloadLabel(data, filename = "luckin-label.png") {
  const exportCanvas = document.createElement("canvas");
  drawLabel(exportCanvas, data, 2);
  const link = document.createElement("a");
  link.href = exportCanvas.toDataURL("image/png");
  link.download = filename;
  link.click();
}

function openLabelPreview(number) {
  const item = labels[number];
  if (!item) return;
  dialogLabelNumber = number;
  drawLabel(dialogCanvas, item, Math.max(1, window.devicePixelRatio || 1));
  if (typeof labelDialog.showModal === "function") {
    labelDialog.showModal();
  } else {
    labelDialog.setAttribute("open", "");
  }
}

function closeLabelPreview() {
  labelDialog.close();
}

function parseOcrText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[|｜]/g, " ")
        .replace(/[「」『』【】[\]()（）]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
  const cleaned = lines.join(" ");
  const compact = cleaned.replace(/\s+/g, "");
  const data = {};

  const dateMatch = cleaned.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}[:：]\d{2}/);
  if (dateMatch) data.time = dateMatch[0].replace(/[/.]/g, "-").replace("：", ":");

  const cupMatch = cleaned.match(/第\s*(\d+)\s*\/\s*(\d+)\s*杯/);
  if (cupMatch) {
    data.cupIndex = cupMatch[1];
    data.cupTotal = cupMatch[2];
  }

  if (/外送/.test(cleaned)) data.pickup = "外送";
  if (/自提/.test(cleaned)) data.pickup = "自提";
  if (/热/.test(cleaned)) data.temperature = "热";
  if (/冰/.test(cleaned)) data.temperature = "冰";
  if (/温/.test(cleaned)) data.temperature = "温";

  const nameMatch = cleaned.match(/Hi[,，]?\s*([^\s,，]{1,16})\s*(先生|女士|同学)?/i);
  if (nameMatch) {
    data.name = nameMatch[1].replace(/第?\d.*$/, "");
    data.title = nameMatch[2] || "";
  }

  const numberCandidates = [];
  const withoutDate = cleaned.replace(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}[:：]\d{2}/g, " ");
  const beforePickup = withoutDate.match(/(?:Hi[,，]?.{0,24})\s(\d{1,3})\s*(?:外送|自提|第)/);
  if (beforePickup) numberCandidates.push(beforePickup[1]);
  for (const match of withoutDate.matchAll(/\b([1-9]\d{0,2})\b/g)) {
    const value = Number(match[1]);
    if (value >= 1 && value <= 999) numberCandidates.push(match[1]);
  }
  const filtered = numberCandidates.filter((value) => !["1", "20", "83", "100"].includes(value));
  const preferredNumber = filtered.find((value) => value.length === 3) || filtered[0];
  if (preferredNumber) data.number = padNumber(preferredNumber);

  const likelyDrink = lines
    .map((line) => line.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, ""))
    .filter((line) =>
      line.length >= 4 &&
      !/(建议|产品|身份|标识|风味|加糖|牛奶|外送|自提|先生|女士|二维码|检测|报告|时间|特大|大杯|中杯|小杯|IAC|铂金豆|单一产区|花香|可可|口感)/.test(line)
    )
    .sort((a, b) => b.length - a.length)[0];
  if (likelyDrink) data.drink = likelyDrink.slice(0, 18);

  const sizeMatch = cleaned.match(/(特大\s*20|大杯|中杯|小杯|超大杯)/);
  if (sizeMatch) data.size = sizeMatch[1].replace(/\s+/g, "");

  const optionStart = lines.findIndex((line) => /(加糖|标准糖|少糖|无糖|牛奶|燕麦|奶油|椰浆|不另外|少冰|去冰)/.test(line));
  if (optionStart >= 0) {
    const optionLines = [];
    for (const line of lines.slice(optionStart)) {
      if (/(产品身份标识|产品标识|建议|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/.test(line)) break;
      optionLines.push(line);
      if (optionLines.length >= 3) break;
    }
    data.options = optionLines.join("，").replace(/，+/g, "，");
  }

  const identityAFromLines = lines.filter((line) => /(埃塞俄比亚|单一产区|产区)/.test(line)).join("\n");
  const identityBFromLines = lines.find((line) => /(IAC|铂金豆|金豆)/i.test(line));
  const identityCFromLines = lines.filter((line) => /(花香|可可|糖口感|口感|果香|坚果|焦糖)/.test(line)).join("\n");

  if (identityAFromLines) {
    data.identityA = identityAFromLines
      .replace(/产品标识\s*1?/g, "")
      .replace(/产品身份标识/g, "")
      .trim();
  }
  if (identityBFromLines) {
    data.identityB = identityBFromLines
      .replace(/产品标识\s*2?/g, "")
      .trim();
  }
  if (identityCFromLines) {
    data.identityC = identityCFromLines
      .replace(/产品标识\s*3?/g, "")
      .trim();
  }

  const labeledA = compact.match(/产品标识1?(.{2,24}?)(?:产品标识2|IAC|$)/);
  const labeledB = compact.match(/产品标识2?(.{2,24}?)(?:产品标识3|花香|$)/);
  const labeledC = compact.match(/产品标识3?(.{2,24}?)(?:时间|20\d{2}|$)/);
  if (!data.identityA && labeledA) data.identityA = labeledA[1];
  if (!data.identityB && labeledB) data.identityB = labeledB[1];
  if (!data.identityC && labeledC) data.identityC = labeledC[1];

  return data;
}

async function recognizePhoto(file) {
  if (!file) return;
  if (!window.Tesseract) {
    setStatus("OCR 组件还没加载完成，请稍等几秒后再试；也可以先手动填写。", true);
    return;
  }
  setStatus("正在识别照片，第一次加载会稍慢...");
  try {
    const result = await window.Tesseract.recognize(file, "chi_sim+eng", {
      logger(event) {
        if (event.status === "recognizing text") {
          setStatus(`正在识别照片 ${Math.round(event.progress * 100)}%`);
        }
      }
    });
    const parsed = parseOcrText(result.data.text || "");
    setFormData({ ...getFormData(), ...parsed });
    setStatus("识别完成，已自动填入可识别内容。请核对后保存。");
  } catch (error) {
    setStatus(`识别失败：${error.message || "请改为手动填写"}`, true);
  } finally {
    photoInput.value = "";
  }
}

function activateScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === `screen-${name}`);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.screen === name);
  });
  if (name === "grid") renderGrid();
  if (name === "collected") renderCollection();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

form.addEventListener("input", renderPreview);
form.addEventListener("change", renderPreview);
saveBtn.addEventListener("click", saveCurrentLabel);
exportBtn.addEventListener("click", () => {
  const data = normalizeLabel(getFormData());
  downloadLabel(data, `luckin-${data.number || "preview"}.png`);
});
sampleBtn.addEventListener("click", () => {
  setFormData(sampleLabel);
  clearStatus();
});
clearBtn.addEventListener("click", () => {
  setFormData(blankLabel);
  clearStatus();
});
photoInput.addEventListener("change", (event) => recognizePhoto(event.target.files[0]));

collectionList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = labels[button.dataset.number];
  if (!item) return;

  if (button.dataset.action === "edit") {
    setFormData(item);
    activateScreen("editor");
  }
  if (button.dataset.action === "download") {
    downloadLabel(item, `luckin-${item.number}.png`);
  }
  if (button.dataset.action === "delete" && window.confirm(`删除 ${item.number} 吗？`)) {
    delete labels[item.number];
    persistLabels();
    renderCollection();
    renderGrid();
  }
});

gridBoard.addEventListener("click", (event) => {
  const cell = event.target.closest(".grid-cell");
  if (!cell) return;
  const item = labels[cell.dataset.number];
  if (item) {
    openLabelPreview(cell.dataset.number);
  } else {
    setFormData({ ...blankLabel, number: cell.dataset.number });
    activateScreen("editor");
  }
});

closeDialogBtn.addEventListener("click", closeLabelPreview);
labelDialog.addEventListener("click", (event) => {
  if (event.target === labelDialog) closeLabelPreview();
});
dialogEditBtn.addEventListener("click", () => {
  const item = labels[dialogLabelNumber];
  if (!item) return;
  closeLabelPreview();
  setFormData(item);
  activateScreen("editor");
});
dialogExportBtn.addEventListener("click", () => {
  const item = labels[dialogLabelNumber];
  if (item) downloadLabel(item, `luckin-${item.number}.png`);
});

gridSearch.addEventListener("input", () => {
  const number = padNumber(gridSearch.value);
  if (number.length !== 3) return;
  const target = gridBoard.querySelector(`[data-number="${number}"]`);
  if (target) {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.animate(
      [
        { transform: "scale(1)", boxShadow: "0 0 0 rgba(8,121,188,0)" },
        { transform: "scale(1.05)", boxShadow: "0 0 0 4px rgba(8,121,188,0.24)" },
        { transform: "scale(1)", boxShadow: "0 0 0 rgba(8,121,188,0)" }
      ],
      { duration: 700 }
    );
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => activateScreen(tab.dataset.screen));
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

setFormData(sampleLabel);
renderCollection();
