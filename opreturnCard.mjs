function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const character of Array.from(text)) {
    if (character === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const candidate = line + character;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line = candidate;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

function loadLogo() {
  return new Promise((resolve) => {
    const logo = new Image();
    logo.onload = () => resolve(logo);
    logo.onerror = () => resolve(null);
    logo.src = '/android-chrome-192x192.png';
  });
}

export async function renderOpReturnCard(note, pattern) {
  const computed = getComputedStyle(document.documentElement);
  const accent = computed.getPropertyValue('--accent').trim() || '#f2a900';
  const face = computed.getPropertyValue('--site-font').trim() || 'monospace';
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = `hsl(${(pattern.hue + 40) % 360} 62% 20%)`;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = pattern.ink;
  ctx.fillStyle = pattern.ink;
  if (pattern.shape === 0) {
    ctx.lineWidth = 3;
    for (let offset = -size; offset < size * 2; offset += pattern.size) {
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset - size, size);
      ctx.stroke();
    }
  } else if (pattern.shape === 1) {
    for (let y = 0; y < size; y += pattern.size) {
      for (let x = 0; x < size; x += pattern.size) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern.shape === 2) {
    ctx.lineWidth = 4;
    const step = pattern.size * 2;
    for (let offset = -size; offset < size * 2; offset += step) {
      ctx.beginPath();
      ctx.moveTo(0, offset);
      ctx.lineTo(size, offset + size * Math.tan((pattern.angle * Math.PI) / 180));
      ctx.stroke();
    }
  } else {
    const step = pattern.size * 2;
    for (let x = 0; x < size; x += step) {
      for (let y = 0; y < size; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, step * 0.4, 0, Math.PI * 0.35);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = 'rgba(10,12,16,0.82)';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = note.viaSatoshi ? accent : '#7d848f';
  ctx.lineWidth = 14;
  ctx.strokeRect(28, 28, size - 56, size - 56);

  let fontSize = 66;
  let lines = [];
  do {
    ctx.font = `600 ${fontSize}px ${face}`;
    lines = wrapText(ctx, String(note.text || ''), size - 190);
    if (lines.length * fontSize * 1.25 <= 610) break;
    fontSize -= 2;
  } while (fontSize > 10);
  ctx.fillStyle = note.viaSatoshi ? accent : '#ffffff';
  const startY = 475 - (lines.length * fontSize * 1.25) / 2;
  lines.forEach((row, index) => ctx.fillText(row, 95, startY + index * fontSize * 1.25));

  ctx.fillStyle = '#e8eaed';
  ctx.font = '400 25px system-ui, sans-serif';
  ctx.fillText(`Date and time: ${note.publishedAt ? new Date(note.publishedAt).toUTCString() : 'unavailable'}`, 95, 936);
  ctx.fillStyle = '#9aa3af';
  ctx.font = '400 22px ui-monospace, Menlo, monospace';
  ctx.fillText('Transaction ID:', 95, 972);
  const txid = String(note.txid || 'unavailable');
  ctx.fillText(txid.slice(0, 32), 95, 1002);
  if (txid.length > 32) ctx.fillText(txid.slice(32), 95, 1032);

  const logo = await loadLogo();
  if (logo) ctx.drawImage(logo, size - 145, size - 165, 72, 72);
  ctx.fillStyle = '#e8eaed';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('satoshi.si', size - 109, size - 72);
  ctx.textAlign = 'start';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The card image could not be created.')), 'image/png');
  });
}

export async function downloadOpReturnCard(note, pattern) {
  const blob = await renderOpReturnCard(note, pattern);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `opreturn-${(note.txid || 'message').slice(0, 12)}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

export async function shareOpReturnCard(note, pattern) {
  const blob = await renderOpReturnCard(note, pattern);
  const file = new File([blob], `opreturn-${(note.txid || 'message').slice(0, 12)}.png`, { type: 'image/png' });
  const url = note.txid ? `https://mempool.space/tx/${note.txid}` : 'https://satoshi.si/opreturnBoard.html';
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: 'Bitcoin OP_RETURN message', text: note.text || '', files: [file] });
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ title: 'Bitcoin OP_RETURN message', text: note.text || '', url });
    return 'shared';
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
