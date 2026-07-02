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

const OCR_ROIS = [
  { key: "name", label: "称呼", x: 210, y: 115, w: 355, h: 120, psm: "7" },
  { key: "number", label: "编号", x: 45, y: 205, w: 520, h: 250, psm: "7", whitelist: "0123456789" },
  { key: "pickup", label: "取餐", x: 555, y: 240, w: 220, h: 100, psm: "7" },
  { key: "cups", label: "杯数", x: 550, y: 335, w: 350, h: 120, psm: "7" },
  { key: "drink", label: "饮品名", x: 50, y: 430, w: 790, h: 170, psm: "6" },
  { key: "temperature", label: "冷热", x: 55, y: 610, w: 160, h: 120, psm: "7" },
  { key: "size", label: "规格", x: 205, y: 605, w: 330, h: 120, psm: "7" },
  { key: "options", label: "糖/加料/备注", x: 55, y: 735, w: 1020, h: 220, psm: "6" },
  { key: "identityA", label: "产品标识 1", x: 80, y: 1090, w: 350, h: 190, psm: "6" },
  { key: "identityB", label: "产品标识 2", x: 465, y: 1120, w: 350, h: 150, psm: "6" },
  { key: "identityC", label: "产品标识 3", x: 850, y: 1080, w: 390, h: 220, psm: "6" },
  { key: "time", label: "时间", x: 45, y: 1510, w: 520, h: 120, psm: "7", whitelist: "0123456789-/:. " }
];

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
const gridJumpForm = document.querySelector("#gridJumpForm");
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

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}

function imageToCanvas(image, maxSide = 1800) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function waitForOpenCv(timeoutMs = 7000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (window.cv && typeof cv.Mat === "function" && typeof cv.imread === "function") {
        resolve(true);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(check, 120);
    };
    check();
  });
}

function orderQuadPoints(points) {
  const sorted = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = sorted[0];
  const br = sorted[3];
  const middle = sorted.slice(1, 3).sort((a, b) => a.y - a.x - (b.y - b.x));
  return [tl, middle[0], br, middle[1]];
}

function contourToPoints(contour) {
  const points = [];
  for (let i = 0; i < contour.rows; i += 1) {
    const point = contour.intPtr(i, 0);
    points.push({ x: point[0], y: point[1] });
  }
  return points;
}

function findLabelQuad(src) {
  const rgb = new cv.Mat();
  const hsv = new cv.Mat();
  const mask = new cv.Mat();
  const kernel = cv.Mat.ones(15, 15, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let best = null;
  let bestArea = 0;
  let bestContour = null;

  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    cv.inRange(hsv, new cv.Scalar(70, 8, 90), new cv.Scalar(118, 150, 255), mask);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < src.cols * src.rows * 0.08 || area < bestArea) {
        contour.delete();
        continue;
      }

      bestArea = area;
      if (bestContour) bestContour.delete();
      bestContour = contour.clone();

      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.035 * peri, true);

      if (approx.rows === 4) {
        best = contourToPoints(approx);
      }

      approx.delete();
      contour.delete();
    }

    if (!best && bestContour) {
      const rect = cv.minAreaRect(bestContour);
      best = cv.RotatedRect.points(rect).map((point) => ({ x: point.x, y: point.y }));
    }
  } finally {
    rgb.delete();
    hsv.delete();
    mask.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
    if (bestContour) bestContour.delete();
  }

  return best ? orderQuadPoints(best) : null;
}

function enhanceOcrCanvas(canvas) {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const equalized = new cv.Mat();
  const binary = new cv.Mat();
  const out = document.createElement("canvas");

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.equalizeHist(gray, equalized);
    cv.adaptiveThreshold(equalized, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 13);
    cv.imshow(out, binary);
  } finally {
    src.delete();
    gray.delete();
    equalized.delete();
    binary.delete();
  }

  return out;
}

function cropRoiCanvas(sourceCanvas, roi, scale = 3) {
  const padding = 14;
  const sx = Math.max(0, roi.x - padding);
  const sy = Math.max(0, roi.y - padding);
  const sw = Math.min(sourceCanvas.width - sx, roi.w + padding * 2);
  const sh = Math.min(sourceCanvas.height - sy, roi.h + padding * 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (!window.cv || typeof cv.imread !== "function") return canvas;

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  const kernel = cv.Mat.ones(2, 2, cv.CV_8U);
  const out = document.createElement("canvas");

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 35, 11);
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);
    cv.imshow(out, binary);
  } finally {
    src.delete();
    gray.delete();
    binary.delete();
    kernel.delete();
  }

  return out;
}

function cleanRoiText(text) {
  return String(text || "")
    .replace(/[|｜]/g, " ")
    .replace(/[「」『』【】[\]()（）]/g, " ")
    .replace(/[；;]/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanChineseText(text) {
  return cleanRoiText(text)
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9*_,，。.\-\/\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRoiValue(key, text) {
  const cleaned = cleanRoiText(text);
  const compact = cleaned.replace(/\s+/g, "");

  if (key === "number") {
    const match = compact.match(/\d{1,3}/);
    return match ? { number: padNumber(match[0]) } : {};
  }

  if (key === "name") {
    const value = cleaned
      .replace(/^Hi[,，]*/i, "")
      .replace(/先生|女士|同学/g, "")
      .replace(/[^\u4e00-\u9fa5A-Za-z0-9*]/g, "")
      .slice(0, 16);
    return value ? { name: value } : {};
  }

  if (key === "pickup") {
    if (/外送|送/.test(cleaned)) return { pickup: "外送" };
    if (/自提|提/.test(cleaned)) return { pickup: "自提" };
    return {};
  }

  if (key === "cups") {
    const match = compact.match(/第?(\d+)[\/／](\d+)杯?/);
    if (match) return { cupIndex: match[1], cupTotal: match[2] };
    const nums = compact.match(/\d+/g);
    if (nums?.length >= 2) return { cupIndex: nums[0], cupTotal: nums[1] };
    return {};
  }

  if (key === "temperature") {
    if (/热|熱/.test(cleaned)) return { temperature: "热" };
    if (/冰/.test(cleaned)) return { temperature: "冰" };
    if (/温|溫/.test(cleaned)) return { temperature: "温" };
    return {};
  }

  if (key === "size") {
    const sizeText = compact
      .replace(/[oO][zZ]?/g, "")
      .replace(/杯/g, "")
      .replace(/特大怀/g, "特大")
      .replace(/特大杯/g, "特大");
    const match = sizeText.match(/(特大|大|中|小|超大)?\s*(\d{1,2})?/);
    if (sizeText.includes("特大") || sizeText.includes("20")) return { size: "特大20" };
    if (sizeText.includes("大")) return { size: "大杯" };
    if (sizeText.includes("中")) return { size: "中杯" };
    if (sizeText.includes("小")) return { size: "小杯" };
    return match?.[0] ? { size: match[0] } : {};
  }

  if (key === "time") {
    const normalized = compact
      .replace(/[.。]/g, "-")
      .replace(/(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})[-\s]*(\d{1,2})[:：]?(\d{2})/, "$1-$2-$3 $4:$5");
    const match = normalized.match(/20\d{2}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}/);
    return match ? { time: match[0] } : {};
  }

  if (key === "drink") return { drink: cleanChineseText(text).slice(0, 18) };
  if (key === "options") return { options: cleanChineseText(text).replace(/\s+/g, "，") };
  if (key === "identityA") return { identityA: cleanChineseText(text).replace(/\s+/g, "\n") };
  if (key === "identityB") return { identityB: cleanChineseText(text).replace(/\s+/g, "") };
  if (key === "identityC") return { identityC: cleanChineseText(text).replace(/\s+/g, "\n") };

  return {};
}

async function recognizeRoiFields(canvas) {
  const data = {};

  for (let index = 0; index < OCR_ROIS.length; index += 1) {
    const roi = OCR_ROIS[index];
    setStatus(`正在识别 ${roi.label} (${index + 1}/${OCR_ROIS.length})...`);
    const roiCanvas = cropRoiCanvas(canvas, roi);
    const options = { tessedit_pageseg_mode: roi.psm || "6" };
    if (roi.whitelist) options.tessedit_char_whitelist = roi.whitelist;
    const result = await window.Tesseract.recognize(roiCanvas, "chi_sim+eng", options);
    Object.assign(data, parseRoiValue(roi.key, result.data.text || ""));
  }

  return data;
}

async function preparePhotoForOcr(file) {
  const image = await loadImageFromFile(file);
  const sourceCanvas = imageToCanvas(image);
  const hasOpenCv = await waitForOpenCv();

  if (!hasOpenCv) {
    return {
      canvas: sourceCanvas,
      corrected: false,
      message: "OpenCV 还没加载完成，已使用原图识别。"
    };
  }

  setStatus("正在用 OpenCV 矫正标签...");
  const src = cv.imread(sourceCanvas);
  const warped = new cv.Mat();
  let srcPts = null;
  let dstPts = null;
  let transform = null;
  const correctedCanvas = document.createElement("canvas");

  try {
    const quad = findLabelQuad(src);
    if (!quad) {
      return {
        canvas: enhanceOcrCanvas(sourceCanvas),
        corrected: false,
        message: "没有稳定找到标签四边形，已增强原图识别。"
      };
    }

    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      quad[0].x, quad[0].y,
      quad[1].x, quad[1].y,
      quad[2].x, quad[2].y,
      quad[3].x, quad[3].y
    ]);
    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      LABEL_W, 0,
      LABEL_W, LABEL_H,
      0, LABEL_H
    ]);
    transform = cv.getPerspectiveTransform(srcPts, dstPts);
    cv.warpPerspective(src, warped, transform, new cv.Size(LABEL_W, LABEL_H), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
    cv.imshow(correctedCanvas, warped);

    return {
      canvas: enhanceOcrCanvas(correctedCanvas),
      correctedCanvas,
      corrected: true,
      message: "已矫正标签并增强文字。"
    };
  } finally {
    src.delete();
    warped.delete();
    if (srcPts) srcPts.delete();
    if (dstPts) dstPts.delete();
    if (transform) transform.delete();
  }
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
  setStatus("正在读取照片...");
  try {
    const prepared = await preparePhotoForOcr(file);
    let parsed = {};

    if (prepared.correctedCanvas) {
      setStatus(`${prepared.message} 正在按 ROI 识别红框内容...`);
      parsed = await recognizeRoiFields(prepared.correctedCanvas);
    } else {
      setStatus(`${prepared.message} 正在识别整张图片...`);
      const result = await window.Tesseract.recognize(prepared.canvas, "chi_sim+eng", {
        logger(event) {
          if (event.status === "recognizing text") {
            setStatus(`正在识别整张图片 ${Math.round(event.progress * 100)}%`);
          }
        }
      });
      parsed = parseOcrText(result.data.text || "");
    }

    setFormData({ ...getFormData(), ...parsed });
    setStatus(`${prepared.corrected ? "OpenCV 矫正 + ROI 识别完成，" : ""}已自动填入可识别内容。请核对后保存。`);
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

function jumpToGridNumber(value) {
  const number = padNumber(value);
  if (!number || Number(number) < 1 || Number(number) > 999) return;

  activateScreen("grid");
  gridSearch.value = number;

  window.setTimeout(() => {
    const target = gridBoard.querySelector(`[data-number="${number}"]`);
    if (!target) return;

    gridBoard.querySelectorAll(".grid-cell.highlight").forEach((cell) => {
      cell.classList.remove("highlight");
    });
    target.classList.add("highlight");
    target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    target.animate(
      [
        { transform: "scale(1)", boxShadow: "0 0 0 rgba(8,121,188,0)" },
        { transform: "scale(1.06)", boxShadow: "0 0 0 5px rgba(8,121,188,0.26)" },
        { transform: "scale(1)", boxShadow: "0 0 0 rgba(8,121,188,0)" }
      ],
      { duration: 900 }
    );
  }, 80);
}

gridJumpForm.addEventListener("submit", (event) => {
  event.preventDefault();
  jumpToGridNumber(gridSearch.value);
});

gridSearch.addEventListener("input", () => {
  gridSearch.value = gridSearch.value.replace(/\D/g, "").slice(0, 3);
  if (gridSearch.value.length === 3) {
    jumpToGridNumber(gridSearch.value);
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
