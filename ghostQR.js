// Generate real QR from seed input
function generateRealQR(seedText) {
    const qr = qrcode(0, "M");
    qr.addData(seedText);
    qr.make();

    const canvas = document.createElement("canvas");
    const size = qr.getModuleCount();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            ctx.fillStyle = qr.isDark(y, x) ? "#000" : "#fff";
            ctx.fillRect(x, y, 1, 1);
        }
    }

    return canvas;
}

// Generate consistent marker positions
const borderMarkerSides = (() => {
    const sides = ["top", "right", "bottom", "left"];
    const shuffled = sides.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2); // Pick 3 unique sides
})();

// Random marker positions for each selected side, persistent per session for printouts
const borderMarkerPositions = (() => {
    const positions = {};
    const min = 10;
    const max = 300;

    borderMarkerSides.forEach((side) => {
        if (side === "top" || side === "bottom") {
            positions[side] = {
                side,
                offset: Math.floor(Math.random() * (max - min) + min),
            };
        } else if (side === "left" || side === "right") {
            positions[side] = {
                side,
                offset: Math.floor(Math.random() * (max - min) + min),
            };
        }
    });

    return positions;
})();

// Draw the + markers consistently using stored positions
function drawBorderMarkers(ctx, canvasWidth, canvasHeight) {
    ctx.font = "14px monospace";
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    borderMarkerSides.forEach((side) => {
        const pos = borderMarkerPositions[side];
        if (!pos) return;

        switch (side) {
            case "top":
                ctx.fillText("+", pos.offset, 2);
                break;
            case "bottom":
                ctx.fillText("+", pos.offset, canvasHeight - 18); // 16px font + small margin
                break;
            case "left":
                ctx.fillText("+", 2, pos.offset);
                break;
            case "right":
                ctx.fillText("+", canvasWidth - 10, pos.offset);
                break;
        }
    });
}

let logoImg = null;
document.getElementById("logo-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const status = document.getElementById("logo-upload-status");

    if (!file) {
        status.textContent = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        logoImg = new Image();
        logoImg.onload = () => {
            status.textContent = "Logo uploaded successfully.";
            status.className = "upload-status success";
        };
        logoImg.onerror = (err) => {
            console.error("Image load error:", err);
            status.textContent = "Something went wrong. Try another image.";
            status.className = "upload-status error";
        };
        logoImg.src = reader.result;
    };

    reader.onerror = (err) => {
        console.error("File read error:", err);
        status.textContent = "Failed to read file. Try again.";
        status.className = "upload-status error";
    };

    reader.readAsDataURL(file);
});

function drawQRToCanvas(sourceCanvas, targetCanvas) {
    const ctx = targetCanvas.getContext("2d");
    const moduleCount = sourceCanvas.width;
    const scale = Math.floor(300 / moduleCount);
    const outputSize = moduleCount * scale;

    targetCanvas.width = outputSize;
    targetCanvas.height = outputSize;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, outputSize, outputSize);
    ctx.drawImage(sourceCanvas, 0, 0, outputSize, outputSize);
}

function createCanvasBlock(label, canvasId) {
    const container = document.createElement("div");
    container.style.marginBottom = "30px";
    container.style.textAlign = "center";

    const labelElem = document.createElement("label");
    labelElem.textContent = label;
    labelElem.style.display = "block";
    labelElem.style.marginBottom = "8px";
    container.appendChild(labelElem);

    const canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.width = 300;
    canvas.height = 300;
    canvas.style.border = "1px solid #aaa";
    container.appendChild(canvas);

    return container;
}

function createBlankQRMatrix(size) {
    const matrix = [];
    for (let y = 0; y < size; y++) {
        const row = new Array(size).fill(0);
        matrix.push(row);
    }
    return matrix;
}

function distributeQRIntoLayers(seedText, layerCount) {
    const qr = qrcode(0, "M");
    qr.addData(seedText);
    qr.make();
    const size = qr.getModuleCount();

    const trueMatrix = [];
    for (let y = 0; y < size; y++) {
        const row = [];
        for (let x = 0; x < size; x++) {
            row.push(qr.isDark(y, x) ? 1 : 0);
        }
        trueMatrix.push(row);
    }

    const layers = Array.from({ length: layerCount }, () =>
        createBlankQRMatrix(size)
    );

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (trueMatrix[y][x]) {
                const layerIndex = Math.floor(Math.random() * layerCount);
                layers[layerIndex][y][x] = 1;
            }
        }
    }

    return { layers, size };
}

function renderMatrixToCanvas(
    matrix,
    size,
    canvas,
    topText = "",
    bottomText = "",
    layerIndex = 0,
    totalLayers = 1
) {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    // Draw QR dots
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (matrix[y][x]) {
                ctx.fillStyle = "#000";
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
}

function splitTextShiftedChunks(text, layerCount, totalWidth = 25) {
    const result = [];

    // Step 1: Chunk text evenly
    const chunkSize = Math.ceil(text.length / layerCount);
    const chunks = [];
    for (let i = 0; i < layerCount; i++) {
        chunks.push(text.slice(i * chunkSize, (i + 1) * chunkSize));
    }

    // Step 2: Combine chunks and center-align total
    const combined = chunks.join("");
    const totalPadding = Math.floor((totalWidth - combined.length) / 2);

    // Step 3: Pad each chunk progressively
    let offset = 0;
    for (let i = 0; i < layerCount; i++) {
        const leftPad = " ".repeat(totalPadding + offset);
        result.push(leftPad + chunks[i]);
        offset += chunks[i].length;
    }

    return result;
}

// Generate ZIP and A4 download
async function downloadAllLayersAsZip() {
    const zip = new JSZip();
    const canvases = document.querySelectorAll("canvas");
    const topFull = document.getElementById("upper-text")?.value.trim() || "";
    const bottomFull =
        document.getElementById("lower-text")?.value.trim() || "";
    const layerCount = canvases.length;

    // === Settings ===
    const qrSize = 350;
    const fontSize = 24;
    const charWidth = 14;
    const textPadding = 10;
    const outerMargin = 16;
    const lineHeight = fontSize + 6;
    const maxTopLines = 1;
    const maxBottomLines = 1;

    const contentHeight =
        maxTopLines * lineHeight +
        textPadding +
        qrSize +
        textPadding +
        maxBottomLines * lineHeight;

    const canvasWidth = qrSize + outerMargin * 2;
    const canvasHeight = contentHeight + outerMargin * 2;

    canvases.forEach((qrCanvas, i) => {
        const scaledQR = document.createElement("canvas");
        scaledQR.width = qrSize;
        scaledQR.height = qrSize;
        const sctx = scaledQR.getContext("2d");
        sctx.imageSmoothingEnabled = false;
        sctx.drawImage(qrCanvas, 0, 0, qrSize, qrSize);

        const canvas = document.createElement("canvas");
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext("2d");

        // Dashed border
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        ctx.setLineDash([]);
        drawBorderMarkers(ctx, canvas.width, canvas.height);

        // Font setup
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillStyle = "#000";
        ctx.textBaseline = "top";

        // Text position calculation
        const topY = outerMargin;
        const qrY = topY + lineHeight * maxTopLines + textPadding;
        const bottomY = qrY + qrSize + textPadding;

        // Use left-align but aligned as full sentence
        drawAlignedChunkText(
            ctx,
            topFull,
            i,
            layerCount,
            outerMargin,
            topY,
            charWidth
        );
        ctx.drawImage(scaledQR, outerMargin, qrY);
        drawAlignedChunkText(
            ctx,
            bottomFull,
            i,
            layerCount,
            outerMargin,
            bottomY,
            charWidth
        );

        // Optional logo overlay (centered in QR)
        if (logoImg?.complete) {
            const logoSize = qrSize * 0.12; // 12% of QR
            const logoX = outerMargin + (qrSize - logoSize) / 2;
            const logoY = qrY + (qrSize - logoSize) / 2;

            // Optional: add white background behind logo for visibility
            ctx.fillStyle = "#fff";
            ctx.fillRect(logoX - 4, logoY - 4, logoSize + 8, logoSize + 8);

            ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        }

        // Export PNG
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",")[1];
        zip.file(`Layer-${i + 1}.png`, base64, { base64: true });
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "qr-layers.zip";
    link.click();
}

function drawAlignedChunkText(
    ctx,
    fullText,
    index,
    totalLayers,
    xStart,
    y,
    charWidth
) {
    const chunkSize = Math.ceil(fullText.length / totalLayers);

    // All chunks
    const chunks = [];
    for (let i = 0; i < totalLayers; i++) {
        chunks.push(fullText.slice(i * chunkSize, (i + 1) * chunkSize));
    }

    const text = chunks[index] || "";

    // Align all to center of full sentence
    const fullPixelWidth = fullText.length * charWidth;
    const totalOffset = (ctx.canvas.width - fullPixelWidth) / 2;
    const offset = index * chunkSize * charWidth;

    ctx.textAlign = "left";
    ctx.fillText(text, totalOffset + offset, y);
}

function generatePrintableA4Page() {
    const win = window.open("", "_blank");
    const canvases = document.querySelectorAll("canvas");
    const topFull = document.getElementById("upper-text")?.value.trim() || "";
    const bottomFull =
        document.getElementById("lower-text")?.value.trim() || "";
    const layerCount = canvases.length;

    win.document.title = "Printable QR Layers";

    // === Style ===
    const style = document.createElement("style");
    style.textContent = `
    body {
      font-family: sans-serif;
      margin: 0;
      padding: 20px;
    }
    .page {
      display: grid;
      grid-template-columns: repeat(3, 1fr); /* 3 columns */
      grid-auto-rows: auto;
      gap: 20px;
      page-break-after: always;
    }
    .qr-wrap {
      position: relative;
      width: 330px;
      height: 330px;
      border: 2px dashed #000;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
    }

    .qr-marker {
      position: absolute;
      font-family: monospace;
      font-weight: bold;
      font-size: 16px;
      color: #000;
    }
    .qr-marker.top    { top: 2px; left: 50%; transform: translateX(-50%); }
    .qr-marker.right  { top: 50%; right: 2px; transform: translateY(-50%); }
    .qr-marker.bottom { bottom: 2px; left: 50%; transform: translateX(-50%); }
    .qr-marker.left   { top: 50%; left: 2px; transform: translateY(-50%); }

    .qr-wrap img {
      image-rendering: pixelated;
      width: 250px;
      height: 250px;
    }
    pre {
      font-family: monospace;
      font-size: 14px;
      font-weight: bold;
      margin: 0;
      white-space: pre-wrap;
      text-align: left;
      width: 100%;
      line-height: 1.3;
    }
  `;
    win.document.head.appendChild(style);

    const body = win.document.body;
    body.innerHTML = "";

    const itemsPerPage = 6; // 3 columns × 2 rows
    const maxTextLength = Math.max(topFull.length, bottomFull.length);

    const computeShiftedText = (fullText, i) => {
        const chunkSize = Math.ceil(fullText.length / layerCount);
        const chunks = [];
        for (let j = 0; j < layerCount; j++) {
            chunks.push(fullText.slice(j * chunkSize, (j + 1) * chunkSize));
        }
        const chunk = chunks[i] || "";
        const totalOffset = (maxTextLength - fullText.length) / 2;
        const shift = Math.floor(
            totalOffset + chunks.slice(0, i).join("").length
        );
        return " ".repeat(shift) + chunk;
    };

    let currentPage = null;

    canvases.forEach((canvas, i) => {
        // Create a new page if needed
        if (i % itemsPerPage === 0) {
            currentPage = win.document.createElement("div");
            currentPage.className = "page";
            body.appendChild(currentPage);
        }

        const wrap = win.document.createElement("div");
        wrap.className = "qr-wrap";

        borderMarkerSides.forEach((side) => {
            const marker = win.document.createElement("div");
            marker.className = "qr-marker";
            marker.textContent = "+";

            marker.style.position = "absolute";
            marker.style.fontFamily = "monospace";
            // marker.style.fontWeight = 'bold';
            marker.style.fontSize = "14px";
            marker.style.color = "#000";

            const offset = borderMarkerPositions[side]?.offset || 50;

            if (side === "top" || side === "bottom") {
                marker.style.left = `${offset}px`;
                marker.style[side] = "2px";
            } else {
                marker.style.top = `${offset}px`;
                marker.style[side] = "2px";
            }

            wrap.appendChild(marker);
        });

        const topDiv = win.document.createElement("pre");
        topDiv.textContent = computeShiftedText(topFull, i);

        const img = win.document.createElement("img");
        img.src = canvas.toDataURL();
        img.alt = `QR Layer ${i + 1}`;

        const bottomDiv = win.document.createElement("pre");
        bottomDiv.textContent = computeShiftedText(bottomFull, i);

        wrap.appendChild(topDiv);
        wrap.appendChild(img);
        wrap.appendChild(bottomDiv);
        currentPage.appendChild(wrap);
    });

    setTimeout(() => {
        win.focus();
        win.print();
    }, 400);
}

// handle warnings about max characters in seed input
const bestSeedLength = 210;
const maxSeedLength = 1000;

let hasWarnedBest = false;
let hasWarnedMax = false;

document.addEventListener("DOMContentLoaded", () => {
    const seedInput = document.getElementById("true-seed");

    seedInput.addEventListener("input", () => {
        const len = seedInput.value.length;

        if (len > maxSeedLength) {
            if (!hasWarnedMax) {
                showAlert(
                    `⚠️ Your data is too long for QR code! Max allowed is ${maxSeedLength} characters.`
                );
                hasWarnedMax = true;
            }
            hasWarnedBest = true; // suppress best warning
        } else if (len > bestSeedLength) {
            if (!hasWarnedBest) {
                showAlert(
                    `⚠️ QR codes containing more than ${bestSeedLength} characters will be much more dense. Keep that in mind.`
                );
                hasWarnedBest = true;
            }
            hasWarnedMax = false;
        } else {
            hasWarnedBest = false;
            hasWarnedMax = false;
        }
    });
});

// Select number of available layers
document.addEventListener("DOMContentLoaded", () => {
    const layerSelect = document.getElementById("layer-count");

    if (layerSelect) {
        for (let i = 1; i <= 69; i++) {
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = `${i} Layers`;
            layerSelect.appendChild(opt);
        }

        // Set default to 2 layers
        layerSelect.value = 2;

        // 🟠 Show warning if 1 layer is selected
        layerSelect.addEventListener("change", () => {
            if (parseInt(layerSelect.value) === 1) {
                showAlert(
                    "⚠️ Warning: You selected only 1 layer. Everything will be visible in a single QR. Don't include anything secret!"
                );
            }
        });
    }
});

// info modal
function openSeedQrInfoModal(event) {
    if (event) event.stopPropagation();
    closeAllModals();
    const modal = document.getElementById("SeedQrInfoModal");
    modal.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeSeedQrInfoModal() {
    const modal = document.getElementById("SeedQrInfoModal");
    modal.classList.remove("active");
    document.body.classList.remove("modal-open");
}

// Global handlers
window.openSeedQrInfoModal = openSeedQrInfoModal;
window.closeSeedQrInfoModal = closeSeedQrInfoModal;

// Register on DOM ready
document.addEventListener("DOMContentLoaded", () => {
    const openBtn = document.getElementById("openSeedQrInfoModal");
    const closeBtn = document.getElementById("closeSeedQrInfoModal");
    const modal = document.getElementById("SeedQrInfoModal");

    if (openBtn) {
        openBtn.addEventListener("click", openSeedQrInfoModal);
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", closeSeedQrInfoModal);
    }

    // Close if user clicks outside the modal content
    window.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeSeedQrInfoModal();
        }
    });
});
// info modal END

// max text length for upper and bottom text
const maxTextLength = 25;

["upper-text", "lower-text"].forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("input", () => {
        if (input.value.length === maxTextLength) {
            showAlert(`⚠️ Maximum ${maxTextLength} characters reached.`);
        }
    });
});

// alert banner
function showAlert(message, duration = 7000) {
    const banner = document.getElementById("alert-banner");
    banner.textContent = message;
    banner.classList.add("show");

    setTimeout(() => {
        banner.classList.remove("show");
    }, duration);
}

// Main click handler
document.getElementById("generate-qr-layers").addEventListener("click", () => {
    const seedText = document.getElementById("true-seed").value.trim();
    const layerCount = parseInt(document.getElementById("layer-count").value);
    const upperText = document.getElementById("upper-text")?.value.trim() || "";
    const lowerText = document.getElementById("lower-text")?.value.trim() || "";
    const maxTextLength = 25; // <-- Limits user input and changing this should be related to totalWidth = 25 in splitTextShiftedChunks()

    if (upperText.length > maxTextLength || lowerText.length > maxTextLength) {
        showAlert(
            `⚠️ Max text length is ${maxTextLength}. Please shorten your input.`
        );
        return;
    }

    if (!seedText || layerCount < 1 || layerCount > 69) {
        showAlert("Please include data and choose between 2 to 69 layers.");
        return;
    }

    // Warn if only 1 layer is selected
    if (layerCount === 1) {
        showAlert("I really hope you didn't include anything super secret!!!");
    }

    const output = document.getElementById("qr-output-container");
    output.innerHTML = "";

    const { layers, size } = distributeQRIntoLayers(seedText, layerCount);

    const upperSegments = splitTextShiftedChunks(upperText, layerCount);
    const lowerSegments = splitTextShiftedChunks(lowerText, layerCount);

    layers.forEach((matrix, i) => {
        const id = `qr-layer-${i + 1}`;

        const block = document.createElement("div");
        block.style.marginBottom = "30px";
        block.style.textAlign = "center";

        // Top Text
        if (upperSegments[i]) {
            const topWrap = document.createElement("div");
            topWrap.style.display = "flex";
            topWrap.style.justifyContent = "center";

            const topLabel = document.createElement("pre");
            topLabel.textContent = upperSegments[i];
            topLabel.style.fontFamily = "monospace";
            topLabel.style.whiteSpace = "pre";
            topLabel.style.marginBottom = "8px";
            topLabel.style.width = "100%";
            topLabel.style.textAlign = "start";
            topLabel.style.whiteSpace = "pre-wrap";
            topLabel.style.overflow = "visible";
            topLabel.style.maxWidth = "300px";
            topLabel.style.wordBreak = "break-word";

            topWrap.appendChild(topLabel);
            block.appendChild(topWrap);
        }

        // Canvas
        const canvas = document.createElement("canvas");
        canvas.id = id;
        canvas.width = 300;
        canvas.height = 300;
        canvas.style.border = "1px solid #aaa";
        block.appendChild(canvas);

        // Bottom Text
        if (lowerSegments[i]) {
            const bottomWrap = document.createElement("div");
            bottomWrap.style.display = "flex";
            bottomWrap.style.justifyContent = "center";

            const bottomLabel = document.createElement("pre");
            bottomLabel.textContent = lowerSegments[i];
            bottomLabel.style.fontFamily = "monospace";
            bottomLabel.style.whiteSpace = "pre";
            bottomLabel.style.marginTop = "8px";
            bottomLabel.style.width = "100%";
            bottomLabel.style.textAlign = "start";
            bottomLabel.style.whiteSpace = "pre-wrap";
            bottomLabel.style.overflow = "visible";
            bottomLabel.style.maxWidth = "300px";
            bottomLabel.style.wordBreak = "break-word";

            bottomWrap.appendChild(bottomLabel);
            block.appendChild(bottomWrap);
        }

        // Render and attach
        const temp = document.createElement("canvas");
        renderMatrixToCanvas(matrix, size, temp);
        drawQRToCanvas(temp, canvas);

        // === Draw logo if available ===
        if (logoImg?.complete) {
            const ctx = canvas.getContext("2d");
            const logoSize = canvas.width * 0.12; // 12% of QR
            const logoX = (canvas.width - logoSize) / 2;
            const logoY = (canvas.height - logoSize) / 2;

            // Optional: white background under logo
            ctx.fillStyle = "transparent";
            ctx.fillRect(logoX - 4, logoY - 4, logoSize + 8, logoSize + 8);

            ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        }

        output.appendChild(block);
    });

    // Add A4/ZIP export buttons centered
    function createOutputButtons() {
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.alignItems = "center";
      container.style.justifyContent = "center";
      container.style.gap = "10px";
      container.style.marginTop = "30px";
    
      const printBtn = document.createElement("button");
      printBtn.textContent = "🖨️ Print A4 Sheet";
      printBtn.onclick = generatePrintableA4Page;
    
      const zipBtn = document.createElement("button");
      zipBtn.textContent = "💾 Download PNGs as ZIP";
      zipBtn.onclick = downloadAllLayersAsZip;
    
      container.appendChild(printBtn);
      container.appendChild(zipBtn);
    
      return container;
    }

    // const printBtn = document.createElement("button");
    // printBtn.textContent = "🖨️ Print A4 Sheet";
    // printBtn.onclick = generatePrintableA4Page;

    // const zipBtn = document.createElement("button");
    // zipBtn.textContent = "💾 Download PNGs as ZIP";
    // zipBtn.onclick = downloadAllLayersAsZip;

    // tools.appendChild(printBtn);
    // tools.appendChild(zipBtn);
    // output.appendChild(tools);

    // Insert buttons at top and bottom
    const topButtons = document.getElementById("qr-output-buttons-top");
    const bottomButtons = document.getElementById("qr-output-buttons-bottom");

    topButtons.innerHTML = "";
    bottomButtons.innerHTML = "";

    topButtons.appendChild(createOutputButtons());
    bottomButtons.appendChild(createOutputButtons());

    // Scroll to output container smoothly
    const qrWrapper = document.getElementById('qr-output-wrapper');
    if (qrWrapper) {
      qrWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});
