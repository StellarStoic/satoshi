const SHADER_URL = '/vendor/nostr-key-miner/nostr_vanity.wgsl';
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const modN = value => ((value % N) + N) % N;

function patternValues(value = '') {
  return [...value].map(char => {
    const index = CHARSET.indexOf(char);
    if (index < 0) throw new Error(`Invalid npub character: ${char}`);
    return index;
  });
}

class GpuMiner {
  static async create({prefix = '', suffix = '', zeros = 0, k0, threadgroups = 48} = {}) {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable.');
    const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
    if (!adapter) throw new Error('No WebGPU adapter is available.');
    if (adapter.limits.maxComputeInvocationsPerWorkgroup < 256) throw new Error('This GPU cannot run the miner.');
    const device = await adapter.requestDevice({label: 'nostr-vanity'});
    const source = await fetch(SHADER_URL, {cache: 'force-cache'}).then(response => {
      if (!response.ok) throw new Error('The Nostr GPU shader could not be loaded.');
      return response.text();
    });
    const module = device.createShaderModule({code: source});
    const errors = await module.getCompilationInfo();
    const failure = errors.messages.find(message => message.type === 'error');
    if (failure) throw new Error(`GPU shader failed: ${failure.message}`);

    const miner = new GpuMiner();
    miner.device = device;
    miner.threadgroups = Math.max(1, Math.min(threadgroups, adapter.limits.maxComputeWorkgroupsPerDimension || 65535));
    miner.totalThreads = miner.threadgroups * 256;
    miner.iters = 1;
    miner.iterBase = 0;
    miner.k0 = k0 == null ? miner.randomScalar() : modN(BigInt(k0)) || 1n;
    const S = GPUBufferUsage.STORAGE, D = GPUBufferUsage.COPY_DST, C = GPUBufferUsage.COPY_SRC;
    miner.table = device.createBuffer({size: 32 * 256 * 16 * 4, usage: S});
    miner.state = device.createBuffer({size: miner.totalThreads * 24 * 4, usage: S});
    const config = new Uint32Array(68);
    const prefixData = patternValues(prefix), suffixData = patternValues(suffix);
    config[0] = prefixData.length; config[1] = suffixData.length; config[2] = zeros; config[3] = miner.totalThreads;
    prefixData.forEach((value, index) => { config[4 + index] = value; });
    suffixData.forEach((value, index) => { config[36 + index] = value; });
    miner.config = device.createBuffer({size: config.byteLength, usage: S | D});
    device.queue.writeBuffer(miner.config, 0, config);
    const params = new Uint32Array(12);
    let scalar = miner.k0;
    for (let index = 0; index < 8; index += 1) { params[index] = Number(scalar & 0xffffffffn); scalar >>= 32n; }
    params[9] = miner.iters;
    miner.params = device.createBuffer({size: params.byteLength, usage: S | D});
    device.queue.writeBuffer(miner.params, 0, params);
    miner.paramUpdate = new Uint32Array(2);
    miner.found = device.createBuffer({size: 80, usage: S | D | C});
    miner.readback = device.createBuffer({size: 80, usage: GPUBufferUsage.MAP_READ | D});
    const layout = device.createBindGroupLayout({entries: [0, 1, 2, 3, 4].map(binding => ({binding, visibility: GPUShaderStage.COMPUTE, buffer: {type: binding === 1 || binding === 4 ? 'read-only-storage' : 'storage'}}))});
    miner.group = device.createBindGroup({layout, entries: [miner.table, miner.config, miner.found, miner.state, miner.params].map((buffer, binding) => ({binding, resource: {buffer}}))});
    const pipelineLayout = device.createPipelineLayout({bindGroupLayouts: [layout]});
    miner.init = device.createComputePipeline({layout: pipelineLayout, compute: {module, entryPoint: 'init_table'}});
    miner.setup = device.createComputePipeline({layout: pipelineLayout, compute: {module, entryPoint: 'setup'}});
    miner.search = device.createComputePipeline({layout: pipelineLayout, compute: {module, entryPoint: 'search_fast'}});
    return miner;
  }

  randomScalar() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    return modN(value) || 1n;
  }

  dispatch(pipeline, groups) {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, this.group); pass.dispatchWorkgroups(groups); pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  async prepare() {
    this.dispatch(this.init, 32);
    await this.device.queue.onSubmittedWorkDone();
    this.dispatch(this.setup, this.threadgroups);
    await this.device.queue.onSubmittedWorkDone();
  }

  async step() {
    this.paramUpdate[0] = this.iterBase >>> 0;
    this.paramUpdate[1] = this.iters >>> 0;
    this.device.queue.writeBuffer(this.params, 32, this.paramUpdate);
    const started = performance.now();
    this.dispatch(this.search, this.threadgroups);
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.found, 0, this.readback, 0, 80);
    this.device.queue.submit([encoder.finish()]);
    await this.readback.mapAsync(GPUMapMode.READ);
    const found = new Uint32Array(this.readback.getMappedRange().slice(0));
    this.readback.unmap();
    const elapsed = Math.max(1, performance.now() - started);
    const tried = this.totalThreads * this.iters;
    this.iterBase += this.iters;
    this.iters = Math.max(1, Math.min(1024, Math.round(this.iters * Math.max(.5, Math.min(2, 75 / elapsed)))));
    if (!found[0]) return {tried};
    const key = modN(this.k0 + (BigInt(found[1]) << 32n) + BigInt(found[2]));
    const secret = new Uint8Array(32);
    let value = key;
    for (let index = 31; index >= 0; index -= 1) { secret[index] = Number(value & 255n); value >>= 8n; }
    return {tried, secret};
  }

  destroy() { try { this.device.destroy(); } catch { /* Device may already be lost. */ } }
}

export async function selfTestGpu() {
  const expected = 'npub10xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqpkge6d';
  const prefix = expected.slice(5, 13);
  const miner = await GpuMiner.create({prefix, k0: 1n, threadgroups: 1});
  try {
    await miner.prepare();
    const found = await miner.step();
    if (!found.secret) throw new Error('GPU known-vector search returned no match.');
    const pair = globalThis.NostrKeys.keyPair(found.secret);
    if (pair.npub !== expected) throw new Error('GPU known-vector verification failed.');
    return true;
  } finally { miner.destroy(); }
}

export async function mineGpu({prefix = '', suffix = '', zeros = 0, stopped = () => false, onProgress = () => {}}) {
  const miner = await GpuMiner.create({prefix, suffix, zeros});
  let tried = 0;
  try {
    await miner.prepare();
    while (!stopped()) {
      const step = await miner.step();
      tried += step.tried;
      onProgress(tried);
      if (step.secret) return step.secret;
      await new Promise(requestAnimationFrame);
    }
    return null;
  } finally { miner.destroy(); }
}
