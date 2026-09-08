// ============================================================================
// TRADE MANAGEMENT ENGINE (Section 17)
// Walks forward from the candle where a signal was LOCKED, checking for a
// stop-out or TP1 hit, then trails the stop structurally behind new HLs
// (buy) / LHs (sell) once TP1 is hit — never moving the stop backwards.
// Only touches the mutable `management` shell via SignalStateEngine's own
// methods; never the frozen core fields (Sections 36-37).
//
// Deterministic and idempotent: re-running against the same candle history
// always replays to the same conclusion, so calling this on every
// orchestrator.runFull() is safe and is NOT a repaint of the locked core.
// ============================================================================

export class TradeManagementEngine {
  manage(signal, candles, labeledSwings, signalStateEngine) {
    if (!['LOCKED', 'TP1_HIT', 'RUNNER', 'TRAILING'].includes(signal.state)) return signal;
    if (signal.lockIndex == null) return signal;

    const direction = signal.direction;
    const risk = Math.abs(signal.entry - signal.sl);
    if (risk === 0) return signal;

    let state = signal.state;
    let trailingSL = signal.management.trailingSL;

    for (let i = signal.lockIndex + 1; i < candles.length; i++) {
      const c = candles[i];

      if (state === 'LOCKED') {
        const slHit = direction === 'bearish' ? c.high >= signal.sl : c.low <= signal.sl;
        const tp1Hit = direction === 'bearish' ? c.low <= signal.tp1 : c.high >= signal.tp1;

        // Conservative ordering when both could occur in the same candle: assume the
        // worse outcome (stop) triggers first, since we can't know intracandle sequence.
        if (slHit) {
          signalStateEngine.markClosed(signal.id, 'LOSS', c.bucketStart, -1);
          return signalStateEngine.getAll().find(s => s.id === signal.id);
        }
        if (tp1Hit) {
          signalStateEngine.markTP1Hit(signal.id, i);
          state = 'TP1_HIT';
          trailingSL = signal.sl; // runner starts protected at original SL
          continue;
        }
      } else {
        // TP1_HIT / RUNNER / TRAILING: trail structurally, check for stop-out
        const newStop = this._latestStructuralStop(direction, labeledSwings, i, trailingSL);
        if (newStop !== trailingSL) {
          signalStateEngine.trailStop(signal.id, newStop, direction);
          trailingSL = newStop;
          state = 'TRAILING';
        }
        const stoppedOut = direction === 'bearish' ? c.high >= trailingSL : c.low <= trailingSL;
        if (stoppedOut) {
          const resultR = direction === 'bearish'
            ? (signal.entry - trailingSL) / risk
            : (trailingSL - signal.entry) / risk;
          const result = resultR > 0 ? 'WIN' : (resultR < 0 ? 'LOSS' : 'BE');
          signalStateEngine.markClosed(signal.id, result, c.bucketStart, Math.round(resultR * 100) / 100);
          return signalStateEngine.getAll().find(s => s.id === signal.id);
        }
      }
    }

    return signalStateEngine.getAll().find(s => s.id === signal.id);
  }

  _latestStructuralStop(direction, labeledSwings, uptoIndex, currentStop) {
    const wantLabel = direction === 'bearish' ? 'LH' : 'HL';
    const candidates = labeledSwings.filter(s => s.index <= uptoIndex && s.label === wantLabel);
    if (candidates.length === 0) return currentStop;
    const best = direction === 'bearish'
      ? Math.min(...candidates.map(s => s.price))
      : Math.max(...candidates.map(s => s.price));
    if (direction === 'bearish') return best < currentStop ? best : currentStop; // never move backwards (Section 17)
    return best > currentStop ? best : currentStop;
  }
}
