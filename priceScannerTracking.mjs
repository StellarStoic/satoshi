export class PriceTracker {
    constructor(cv) {
        this.cv = cv;
        this.nextId = 0;
        this.reset();
    }

    reset() {
        this.width = 0;
        this.height = 0;
        this.points = [];
        this.frameNumber = 0;
        this.generation = (this.generation || 0) + 1;
    }

    update(rgba, width, height) {
        const cv = this.cv;
        if (width !== this.width || height !== this.height) {
            this.reset();
            this.width = width; this.height = height;
            this.previous = new cv.pyramid_t(3);
            this.current = new cv.pyramid_t(3);
            this.previous.allocate(width, height, cv.U8_t | cv.C1_t);
            this.current.allocate(width, height, cv.U8_t | cv.C1_t);
            this.corners = Array.from({length: width * height}, () => new cv.keypoint_t());
        }
        cv.imgproc.grayscale(rgba, width, height, this.current.data[0]);
        this.current.build(this.current.data[0], true);
        const count = this.points.length;
        if (count) {
            const before = new Float32Array(count * 2), after = new Float32Array(count * 2), back = new Float32Array(count * 2);
            const forwardStatus = new Uint8Array(count), backStatus = new Uint8Array(count);
            this.points.forEach((point, i) => { before[i * 2] = point.x; before[i * 2 + 1] = point.y; });
            cv.optical_flow_lk.track(this.previous, this.current, before, after, count, 15, 20, forwardStatus, 0.01, 0.001);
            cv.optical_flow_lk.track(this.current, this.previous, after, back, count, 15, 20, backStatus, 0.01, 0.001);
            this.points = this.points.flatMap((point, i) => {
                const x = after[i * 2], y = after[i * 2 + 1];
                if (!forwardStatus[i] || !backStatus[i] || !Number.isFinite(x + y) ||
                    x < 5 || y < 5 || x >= width - 5 || y >= height - 5 ||
                    Math.hypot(back[i * 2] - point.x, back[i * 2 + 1] - point.y) > 1.2) return [];
                return [{id: point.id, x, y}];
            });
        }
        // Replenish corners without replacing IDs still anchoring a visible price.
        this.frameNumber++;
        if (this.points.length < 20 || (this.points.length < 280 && this.frameNumber % 4 === 0)) {
            cv.fast_corners.set_threshold(18);
            const found = cv.fast_corners.detect(this.current.data[0], this.corners, 8);
            const candidates = this.corners.slice(0, found).sort((a, b) => b.score - a.score);
            const cell = point => `${Math.floor(point.x / 48)},${Math.floor(point.y / 48)}`;
            const cells = new Map();
            this.points.forEach(point => cells.set(cell(point), (cells.get(cell(point)) || 0) + 1));
            for (const point of candidates) {
                if (this.points.length >= 320) break;
                const key = cell(point);
                if ((cells.get(key) || 0) >= 12) continue;
                if (this.points.some(old => Math.hypot(old.x - point.x, old.y - point.y) < 5)) continue;
                this.points.push({id: this.nextId++, x: point.x, y: point.y});
                cells.set(key, (cells.get(key) || 0) + 1);
            }
        }
        this.byId = new Map(this.points.map(point => [point.id, point]));
        [this.previous, this.current] = [this.current, this.previous];
    }

    snapshot() {
        return {generation: this.generation, width: this.width, height: this.height, points: this.points.map(point => ({...point}))};
    }

    anchor(snapshot, box, source) {
        if (!snapshot || snapshot.generation !== this.generation) return null;
        const sx = snapshot.width / source.width, sy = snapshot.height / source.height;
        const bbox = {x0: box.x0 * sx, y0: box.y0 * sy, x1: box.x1 * sx, y1: box.y1 * sy};
        const margin = Math.min(12, (bbox.y1 - bbox.y0) * 0.3);
        const points = snapshot.points.filter(point => point.x >= bbox.x0 - margin && point.x <= bbox.x1 + margin &&
            point.y >= bbox.y0 - margin && point.y <= bbox.y1 + margin);
        return {generation: snapshot.generation, points, bbox};
    }

    project(anchor) {
        if (!anchor || anchor.generation !== this.generation) return null;
        const from = [], to = [], cv = this.cv;
        for (const point of anchor.points) {
            const current = this.byId?.get(point.id);
            if (current) { from.push(point); to.push(current); }
        }
        if (from.length < 2 || from.length < anchor.points.length * 0.4) return null;
        // A short price on plain paper may not provide six corners for an affine fit.
        // Track translation only in that case, requiring agreement among surviving points.
        if (from.length < 6) {
            const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
            const dx = median(to.map((point, i) => point.x - from[i].x));
            const dy = median(to.map((point, i) => point.y - from[i].y));
            const agreeing = to.filter((point, i) => Math.hypot(point.x - from[i].x - dx, point.y - from[i].y - dy) <= 1.5);
            if (agreeing.length < 2 || agreeing.length < from.length * 0.8) return null;
            const {x0, x1, y0, y1} = anchor.bbox;
            const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({x: x + dx, y: y + dy}));
            if (corners.some(point => point.x < 0 || point.x > this.width || point.y < 0 || point.y > this.height)) return null;
            return {pose: [1, 0, 0, 1, dx, dy], corners};
        }
        const matrix = new cv.matrix_t(3, 3, cv.F32_t | cv.C1_t);
        const mask = new cv.matrix_t(from.length, 1, cv.U8_t | cv.C1_t);
        const kernel = new cv.motion_model.affine2d();
        const params = new cv.ransac_params_t(3, 1.5, 0.5, 0.99);
        if (!cv.motion_estimator.ransac(params, kernel, from, to, from.length, matrix, mask, 80)) return null;
        const inFrom = [], inTo = [];
        from.forEach((point, i) => { if (mask.data[i]) { inFrom.push(point); inTo.push(to[i]); } });
        if (inFrom.length < 6 || inFrom.length < from.length * 0.65) return null;
        kernel.run(inFrom, inTo, matrix, inFrom.length);
        const m = matrix.data;
        const pose = [m[0], m[3], m[1], m[4], m[2], m[5]];
        const sx = Math.hypot(m[0], m[3]), sy = Math.hypot(m[1], m[4]);
        const determinant = m[0] * m[4] - m[1] * m[3];
        if (!pose.every(Number.isFinite) || determinant < 0.25 || determinant > 4 || sx / sy < 0.6 || sx / sy > 1.65) return null;
        const {x0, x1, y0, y1} = anchor.bbox;
        const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({x: m[0] * x + m[1] * y + m[2], y: m[3] * x + m[4] * y + m[5]}));
        if (corners.some(point => point.x < 0 || point.x > this.width || point.y < 0 || point.y > this.height)) return null;
        return {pose, corners};
    }
}
