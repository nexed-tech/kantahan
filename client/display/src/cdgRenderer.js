// CDG (CD+G) renderer — parses binary .cdg data and draws frames to a canvas.
// CDG spec: 24-byte packets at 75 packets/second, 288x192 pixels, 16-color palette.

const CDG_CMD        = 0x09;
const CDG_W          = 288;
const CDG_H          = 192;
const PPS            = 75; // packets per second

const I_MEM_PRESET   = 1;
const I_BORDER       = 2;
const I_TILE         = 6;
const I_TILE_XOR     = 38;
const I_COL_LOW      = 30;
const I_COL_HIGH     = 31;
const I_SCROLL_FILL  = 32;
const I_SCROLL_COPY  = 36;

export class CDGRenderer {
  constructor() {
    this._buf    = new Uint8Array(CDG_W * CDG_H); // palette indices
    this._pal    = new Uint8Array(16 * 3);         // RGB triples
    this._data   = null;
    this._total  = 0;
    this._last   = -1;
  }

  load(arrayBuffer) {
    this._data  = new Uint8Array(arrayBuffer);
    this._total = Math.floor(this._data.length / 24);
    this._reset();
  }

  _reset() {
    this._buf.fill(0);
    this._pal.fill(0);
    this._last = -1;
  }

  renderToCanvas(canvas, currentTime) {
    if (!this._data) return;
    // Guard against NaN/Infinity currentTime (can occur when audio lacks range-request support
    // and the browser hasn't resolved duration yet — avoids silently skipping all packets).
    if (!isFinite(currentTime) || currentTime < 0) return;
    const target = Math.min(Math.floor(currentTime * PPS), this._total - 1);
    if (target === this._last) return;
    if (target < this._last) this._reset();

    for (let i = this._last + 1; i <= target; i++) this._packet(i);
    this._last = target;

    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(CDG_W, CDG_H);
    const px  = img.data;
    for (let i = 0; i < CDG_W * CDG_H; i++) {
      const ci = this._buf[i] * 3;
      px[i * 4]     = this._pal[ci];
      px[i * 4 + 1] = this._pal[ci + 1];
      px[i * 4 + 2] = this._pal[ci + 2];
      px[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  _packet(idx) {
    const base = idx * 24;
    if ((this._data[base] & 0x3F) !== CDG_CMD) return;
    const instr = this._data[base + 1] & 0x3F;
    const d     = this._data.subarray(base + 4, base + 20);
    switch (instr) {
      case I_MEM_PRESET:  this._buf.fill(d[0] & 0x0F); break;
      case I_BORDER:      this._border(d[0] & 0x0F); break;
      case I_TILE:        this._tile(d, false); break;
      case I_TILE_XOR:    this._tile(d, true); break;
      case I_COL_LOW:     this._colors(d, 0); break;
      case I_COL_HIGH:    this._colors(d, 8); break;
      case I_SCROLL_FILL: this._scroll(d, false); break;
      case I_SCROLL_COPY: this._scroll(d, true); break;
    }
  }

  _border(c) {
    for (let y = 0; y < CDG_H; y++)
      for (let x = 0; x < CDG_W; x++)
        if (x < 6 || x >= CDG_W - 6 || y < 12 || y >= CDG_H - 12)
          this._buf[y * CDG_W + x] = c;
  }

  _colors(d, base) {
    for (let i = 0; i < 8; i++) {
      const b0 = d[i * 2], b1 = d[i * 2 + 1];
      const ci = (base + i) * 3;
      this._pal[ci]     = ((b0 & 0x3C) >> 2) * 17;
      this._pal[ci + 1] = (((b0 & 0x03) << 2) | ((b1 & 0x30) >> 4)) * 17;
      this._pal[ci + 2] = (b1 & 0x0F) * 17;
    }
  }

  _tile(d, xor) {
    const c0  = d[0] & 0x0F;
    const c1  = d[1] & 0x0F;
    const row = (d[2] & 0x1F) * 12;
    const col = (d[3] & 0x3F) * 6;
    for (let r = 0; r < 12; r++) {
      const byte = d[4 + r];
      for (let c = 0; c < 6; c++) {
        const x = col + c, y = row + r;
        if (x >= CDG_W || y >= CDG_H) continue;
        const bit = (byte >> (5 - c)) & 1;
        const pi  = y * CDG_W + x;
        this._buf[pi] = xor ? this._buf[pi] ^ (bit ? c1 : c0) : (bit ? c1 : c0);
      }
    }
  }

  _scroll(d, copy) {
    const fill = d[0] & 0x0F;
    const hCmd = (d[1] >> 4) & 0x03;
    const vCmd = (d[2] >> 4) & 0x03;
    // 1 = right/down, 2 = left/up
    const dx = hCmd === 1 ? 6 : hCmd === 2 ? -6 : 0;
    const dy = vCmd === 1 ? 12 : vCmd === 2 ? -12 : 0;
    if (dx === 0 && dy === 0) return;

    const tmp = new Uint8Array(CDG_W * CDG_H).fill(fill);
    for (let y = 0; y < CDG_H; y++) {
      for (let x = 0; x < CDG_W; x++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < CDG_W && ny >= 0 && ny < CDG_H)
          tmp[ny * CDG_W + nx] = this._buf[y * CDG_W + x];
        else if (copy) {
          // wrap-around for SCROLL_COPY
          const wx = ((x + dx) % CDG_W + CDG_W) % CDG_W;
          const wy = ((y + dy) % CDG_H + CDG_H) % CDG_H;
          tmp[wy * CDG_W + wx] = this._buf[y * CDG_W + x];
        }
      }
    }
    this._buf.set(tmp);
  }
}
