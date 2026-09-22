export function paddleBlocks(items) {
    const words = (items || []).filter(item => typeof item.text === 'string' && Number.isFinite(item.score) &&
        item.poly?.length === 4 && item.poly.every(point => point.length === 2 && point.every(Number.isFinite)))
        .map(item => ({text: item.text.trim(), confidence: item.score * 100, bbox: {
            x0: Math.min(...item.poly.map(point => point[0])), y0: Math.min(...item.poly.map(point => point[1])),
            x1: Math.max(...item.poly.map(point => point[0])), y1: Math.max(...item.poly.map(point => point[1])),
        }}));
    return [{paragraphs: [{lines: [{words}]}]}];
}

export function createScannerOcr() {
    const thread = new Worker(new URL('./priceScannerOcrWorker.mjs', import.meta.url), {type: 'module'});
    const pending = new Map();
    let nextId = 0, closed = false;
    const terminate = () => {
        closed = true;
        thread.terminate();
        for (const {reject, timer} of pending.values()) {
            clearTimeout(timer); reject(new Error('Recognition stopped'));
        }
        pending.clear();
        return Promise.resolve();
    };
    thread.onmessage = ({data}) => {
        const job = pending.get(data.id);
        if (!job) return;
        pending.delete(data.id); clearTimeout(job.timer);
        if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
    };
    thread.onerror = terminate;
    thread.onmessageerror = terminate;
    const request = (type, image) => new Promise((resolve, reject) => {
        if (closed) { reject(new Error('Recognition stopped')); return; }
        const id = ++nextId;
        const timer = setTimeout(() => { terminate(); }, type === 'init' ? 120000 : 15000);
        pending.set(id, {resolve, reject, timer});
        try { thread.postMessage({id, type, image}, image ? [image.buffer] : []); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
    return {
        ready: request('init'),
        async recognize(canvas) {
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            const result = await request('recognize', {buffer: pixels.data.buffer, width: pixels.width, height: pixels.height});
            return {data: {blocks: paddleBlocks(result.items)}, metrics: result.metrics};
        },
        terminate,
    };
}
