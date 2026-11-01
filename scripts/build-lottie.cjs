// Generates the two Lottie files used by the site (one-shot, theme-neutral colors).
// Run: node scripts/build-lottie.cjs
const fs = require('fs');
const path = require('path');

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};
const st = (v) => ({ a: 0, k: v });
const ease = { o: { x: [0.23], y: [0] }, i: { x: [0.32], y: [1] } };
const anim = (frames) => ({
  a: 1,
  k: frames.map(([t, s], idx) => (idx < frames.length - 1 ? { t, s, ...ease } : { t, s })),
});
const tr = (extra = {}) => ({
  ty: 'tr', p: st([0, 0]), a: st([0, 0]), s: st([100, 100]), r: st(0), o: st(100), sk: st(0), sa: st(0), ...extra,
});
const stroke = (color, w) => ({ ty: 'st', c: st(hex(color)), o: st(100), w: st(w), lc: 2, lj: 2, ml: 4 });
const fill = (color) => ({ ty: 'fl', c: st(hex(color)), o: st(100), r: 1 });
const trim = (from, to) => ({ ty: 'tm', s: st(0), e: anim([[from, 0], [to, 100]]), o: st(0), m: 1 });
const pathShape = (verts) => ({
  ty: 'sh',
  ks: st({ i: verts.map(() => [0, 0]), o: verts.map(() => [0, 0]), v: verts, c: false }),
});
const layer = (ind, nm, ks, shapes, op) => ({
  ddd: 0, ind, ty: 4, nm, sr: 1, ao: 0, ip: 0, op, st: 0, bm: 0,
  ks: { o: st(100), r: st(0), p: st([0, 0, 0]), a: st([0, 0, 0]), s: st([100, 100, 100]), ...ks },
  shapes,
});

// ---------- Vault success: ring draws, tick follows ----------
function vaultSuccess() {
  const op = 45;
  const green = '#2FA35A';
  return {
    v: '5.7.4', fr: 30, ip: 0, op, w: 96, h: 96, nm: 'hisaab-vault-success', ddd: 0, assets: [],
    layers: [
      layer(1, 'tick', { p: st([48, 48, 0]) }, [
        { ty: 'gr', it: [pathShape([[-15, 1], [-5, 11], [16, -11]]), stroke(green, 5), tr()] },
        trim(12, 30),
      ], op),
      layer(2, 'ring', {
        p: st([48, 48, 0]),
        s: anim([[0, [86, 86, 100]], [20, [100, 100, 100]]]),
      }, [
        { ty: 'gr', it: [{ ty: 'el', p: st([0, 0]), s: st([74, 74]), d: 1 }, stroke(green, 4), tr({ r: st(-90) })] },
        trim(0, 20),
      ], op),
    ],
  };
}

// ---------- Hero: ledger page fills line by line, seal stamps ----------
function heroLedger() {
  const op = 110;
  const gold = '#A88748';
  const grey = '#8D8B83';
  const green = '#2FA35A';
  const layers = [];
  let ind = 1;

  // Seal (top-most)
  layers.push(layer(ind++, 'seal', {
    p: st([368, 262, 0]),
    o: anim([[62, 0], [70, 100]]),
    s: anim([[62, [135, 135, 100]], [74, [96, 96, 100]], [80, [100, 100, 100]]]),
  }, [
    { ty: 'gr', it: [pathShape([[-12, 1], [-4, 9], [13, -9]]), stroke('#FFFDF8', 5), tr()] },
    { ty: 'gr', it: [{ ty: 'el', p: st([0, 0]), s: st([64, 64]), d: 1 }, fill(green), tr()] },
  ], op));

  // Ledger rows: label line + amount line
  const rows = [
    { y: -58, len: 150, t: 12 },
    { y: -22, len: 120, t: 20 },
    { y: 14, len: 168, t: 28 },
    { y: 50, len: 96, t: 36 },
  ];
  rows.forEach((r) => {
    layers.push(layer(ind++, `row${r.y}`, { p: st([240, 180, 0]) }, [
      { ty: 'gr', it: [pathShape([[-118, r.y], [-118 + r.len, r.y]]), stroke(grey, 6), tr()] },
      trim(r.t, r.t + 18),
    ], op));
    layers.push(layer(ind++, `amt${r.y}`, { p: st([240, 180, 0]) }, [
      { ty: 'gr', it: [pathShape([[78, r.y], [118, r.y]]), stroke(gold, 6), tr()] },
      trim(r.t + 6, r.t + 20),
    ], op));
  });

  // Gold total rule
  layers.push(layer(ind++, 'total-rule', { p: st([240, 180, 0]) }, [
    { ty: 'gr', it: [pathShape([[-118, 80], [118, 80]]), stroke(gold, 1.5), tr()] },
    trim(46, 62),
  ], op));

  // Page
  layers.push(layer(ind++, 'page', {
    p: st([240, 180, 0]),
    o: anim([[0, 0], [12, 100]]),
    s: anim([[0, [97, 97, 100]], [14, [100, 100, 100]]]),
  }, [
    { ty: 'gr', it: [{ ty: 'rc', p: st([0, 0]), s: st([300, 230]), r: st(18), d: 1 }, stroke(gold, 1.5), tr()] },
  ], op));

  return { v: '5.7.4', fr: 30, ip: 0, op, w: 480, h: 360, nm: 'hisaab-hero-ledger', ddd: 0, assets: [], layers };
}

const outDir = path.join(__dirname, '..', 'assets', 'lottie');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'vault-success.json'), JSON.stringify(vaultSuccess()));
fs.writeFileSync(path.join(outDir, 'hero-ledger.json'), JSON.stringify(heroLedger()));
console.log('Wrote', fs.readdirSync(outDir));
