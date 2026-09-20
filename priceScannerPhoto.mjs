export function drawScannerPhoto(canvas, video, crop, viewport, labels, logo) {
    const scale = Math.min(3, 1920 / Math.max(viewport.width, viewport.height));
    canvas.width = Math.round(viewport.width * scale);
    canvas.height = Math.round(viewport.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    for (const label of labels) {
        ctx.fillStyle = '#101112';
        ctx.fillRect(label.left, label.top, label.width, label.height);
        ctx.strokeStyle = '#f2a900';
        ctx.lineWidth = 1;
        ctx.strokeRect(label.left + 0.5, label.top + 0.5, label.width - 1, label.height - 1);
        ctx.fillStyle = '#f2a900';
        ctx.font = 'bold 16px Arial';
        ctx.textBaseline = 'middle';
        ctx.fillText(label.btc, label.left + 10, label.top + label.height / 2 - 8, label.width - 20);
        ctx.fillStyle = '#d0d3d5';
        ctx.font = '11px Arial';
        ctx.fillText(label.fiat, label.left + 10, label.top + label.height / 2 + 12, label.width - 20);
    }
    const width = Math.min(196, viewport.width - 24), height = 52;
    const left = viewport.width - width - 12, top = viewport.height - height - 12;
    ctx.fillStyle = '#101112e8';
    ctx.fillRect(left, top, width, height);
    ctx.drawImage(logo, left + 10, top + 8, 36, 36);
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#f2a900';
    ctx.textBaseline = 'middle';
    ctx.fillText('satoshi.si', left + 56, top + height / 2, width - 66);
    return canvas;
}
