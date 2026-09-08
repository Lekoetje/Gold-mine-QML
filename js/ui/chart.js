// ============================================================================
// CHART RENDERER (Sections 5–6)
// Plain <canvas> candlestick chart. Deliberately restrained — HH/HL/LH/LL,
// QM head, QML zone, and Entry/SL/TP1 lines only. No indicator clutter.
// ============================================================================

const COLORS = {
  bull: '#4FB8A6',
  bear: '#D06759',
  grid: '#1B1F26',
  text: '#8B9098',
  gold: '#C6A15B',
  qmlZone: 'rgba(198, 161, 91, 0.14)',
  qmlBorder: 'rgba(198, 161, 91, 0.55)',
  sl: '#D06759',
  tp: '#4FB8A6',
  entry: '#C6A15B'
};

export class ChartRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
  }

  render(data) {
    const { candles, swings, qmCandidates, lockedSignal, maxBars = 90 } = data;
    if (!candles || candles.length === 0) return;
    this._resize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const visible = candles.slice(-maxBars);
    const offset = candles.length - visible.length;
    const padTop = 14, padBottom = 22, padLeft = 6, padRight = 56;
    const plotW = this.width - padLeft - padRight;
    const plotH = this.height - padTop - padBottom;

    let min = Infinity, max = -Infinity;
    for (const c of visible) { min = Math.min(min, c.low); max = Math.max(max, c.high); }
    const range = (max - min) || 1;
    min -= range * 0.06; max += range * 0.06;

    const x = i => padLeft + (i / Math.max(1, visible.length - 1)) * plotW;
    const y = price => padTop + (1 - (price - min) / (max - min)) * plotH;
    const barW = Math.max(2, plotW / visible.length * 0.62);

    // grid + price labels
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px IBM Plex Mono, monospace';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let g = 0; g <= gridLines; g++) {
      const price = min + (range * 1.12) * (g / gridLines);
      const py = y(price);
      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(this.width - padRight, py);
      ctx.stroke();
      ctx.fillText(price.toFixed(2), this.width - padRight + 6, py + 3);
    }

    // QML zones for developing/armed/locked QMs
    for (const qm of qmCandidates || []) {
      if (qm.headIndex < offset - 20) continue;
      const yHigh = y(qm.qmlZone.high), yLow = y(qm.qmlZone.low);
      ctx.fillStyle = COLORS.qmlZone;
      ctx.fillRect(padLeft, yHigh, plotW, yLow - yHigh);
      ctx.strokeStyle = COLORS.qmlBorder;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(padLeft, yHigh); ctx.lineTo(this.width - padRight, yHigh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padLeft, yLow); ctx.lineTo(this.width - padRight, yLow); ctx.stroke();
      ctx.setLineDash([]);
    }

    // candles
    visible.forEach((c, i) => {
      const cx = x(i);
      const up = c.close >= c.open;
      ctx.strokeStyle = up ? COLORS.bull : COLORS.bear;
      ctx.fillStyle = up ? COLORS.bull : COLORS.bear;
      ctx.beginPath();
      ctx.moveTo(cx, y(c.high));
      ctx.lineTo(cx, y(c.low));
      ctx.stroke();
      const oy = y(c.open), cy = y(c.close);
      const top = Math.min(oy, cy), h = Math.max(1, Math.abs(cy - oy));
      ctx.fillRect(cx - barW / 2, top, barW, h);
    });

    // swing labels (HH/HL/LH/LL) — sparse, only within visible range
    ctx.font = '9px IBM Plex Mono, monospace';
    for (const s of swings || []) {
      if (s.index < offset || !s.label) continue;
      const i = s.index - offset;
      const cx = x(i);
      const py = s.type === 'high' ? y(s.price) - 8 : y(s.price) + 14;
      ctx.fillStyle = COLORS.gold;
      ctx.textAlign = 'center';
      ctx.fillText(s.label, cx, py);
    }
    ctx.textAlign = 'left';

    // locked signal: entry/SL/TP1 lines
    if (lockedSignal) {
      this._levelLine(ctx, y(lockedSignal.entry), plotW, padLeft, this.width - padRight, COLORS.entry, `ENTRY ${lockedSignal.entry.toFixed(2)}`);
      this._levelLine(ctx, y(lockedSignal.sl), plotW, padLeft, this.width - padRight, COLORS.sl, `SL ${lockedSignal.sl.toFixed(2)}`);
      this._levelLine(ctx, y(lockedSignal.tp1), plotW, padLeft, this.width - padRight, COLORS.tp, `TP1 ${lockedSignal.tp1.toFixed(2)}`);
    }
  }

  _levelLine(ctx, py, plotW, x1, x2, color, label) {
    ctx.strokeStyle = color;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(x1, py); ctx.lineTo(x2, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = '10px IBM Plex Mono, monospace';
    ctx.fillText(label, x1 + 4, py - 3);
  }
}
