const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const P = require(path.join(process.env.CODIXEL_DIR ?? path.join(os.homedir(), '.claude/skills/codixel'), 'core/pixel.js'))
const OUT = path.join(__dirname, '../src/renderer/src/assets/pokemon')

const leaf = P.hueRamp(6, { hue: 105, sat: 0.5, light: [0.16, 0.6] })
const sand = P.hueRamp(5, { hue: 40, sat: 0.35, shift: 25, light: [0.5, 0.82] })
const crown = P.hueRamp(6, { hue: 135, sat: 0.45, light: [0.07, 0.42] })
const bark = P.hueRamp(4, { hue: 25, sat: 0.35, light: [0.14, 0.42] })

const T = 16
const wrap = (v) => ((v % T) + T) % T
const tileNoise = (x, y, f, s) => {
  const a = (wrap(x) / T) * Math.PI * 2, b = (wrap(y) / T) * Math.PI * 2
  return P.fbm(Math.cos(a) * f + 10, Math.sin(a) * f + Math.cos(b) * f + 20, 2, s + Math.round(Math.sin(b) * 3))
}

function groundGrass(b) {
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = 0.35 + (tileNoise(x, y, 0.9, 3) - 0.5) * 0.5
      b.pset(x, y, leaf[1 + P.band(v, 3, x, y)])
    }
}

const N = 1, E = 2, S = 4, W = 8
const CORNER = 7

function grassMaskOf(open) {
  const inside = (x, y) => {
    const fx = Math.min(open & W ? x + 0.5 : Infinity, open & E ? T - 0.5 - x : Infinity)
    const fy = Math.min(open & N ? y + 0.5 : Infinity, open & S ? T - 0.5 - y : Infinity)
    const d = fx < CORNER && fy < CORNER ? CORNER - Math.hypot(CORNER - fx, CORNER - fy) : Math.min(fx, fy)
    const along = fx < fy ? y : x
    return d - (2 + (tileNoise(along, along * 0.5, 2.2, 21) - 0.5) * 5)
  }
  return inside
}

function grassTile(neighbors) {
  const open = ~neighbors & 15
  const b = pathTile()
  const inside = grassMaskOf(open)
  const g = new P.Buf(T, T)
  groundGrass(g)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const d = inside(x, y)
      if (d <= 0) continue
      b.pset(x, y, d < 1 ? leaf[0] : g.get(x, y))
    }
  const tuft = (cx, by) => {
    const blades = [[-2, 2], [-1, 3], [0, 4], [1, 3], [2, 2]]
    const put = (x, y, c) => (inside(wrap(x), y) > 1 ? b.pset(wrap(x), y, c) : null)
    for (const [dx, h] of blades)
      for (let k = 0; k < h; k++) put(cx + dx + (k === h - 1 && dx !== 0 ? Math.sign(dx) : 0), by - k, leaf[Math.min(5, 2 + Math.round((k / Math.max(1, h - 1)) * 3))])
    for (let dx = -2; dx <= 2; dx++) put(cx + dx, by + 1, leaf[0])
  }
  tuft(3, 6)
  tuft(11, 6)
  tuft(7, 14)
  tuft(15, 14)
  return b
}

function pathTile() {
  const b = new P.Buf(T, T)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const v = 0.55 + (tileNoise(x, y, 1.1, 9) - 0.5) * 0.7
      b.pset(x, y, sand[1 + P.band(v, 4, x, y)])
    }
  const r = P.rng(11)
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T)
    b.pset(x, y, sand[0])
    b.pset(wrap(x + 1), y, sand[4])
  }
  return b
}

function treeTile(neighbors) {
  const inside = grassMaskOf(~neighbors & 15)
  const b = pathTile()
  const g = new P.Buf(T, T)
  groundGrass(g)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const d = inside(x, y)
      if (d > 0) b.pset(x, y, d < 1 ? leaf[0] : g.get(x, y))
    }
  for (let x = 4; x < 12; x++) b.pset(x, 14, leaf[0])
  for (let x = 5; x < 11; x++) b.pset(x, 15, leaf[0])
  P.tree(b, { x: 8, base: 14, h: 8, rx: 5, ry: 4.4, trunk: 1.4, clumps: 22, clumpR: [2.6, 3.8], cols: crown, bark, seed: 4, branches: false, leaf: 0.9 })
  return b
}

function platformSprite() {
  const W = 32, H = 8, b = new P.Buf(W, H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - W / 2) / (W / 2), ny = (y + 0.5 - H / 2) / (H / 2)
      const d = nx * nx + ny * ny
      if (d > 1) continue
      const v = 0.8 - ny * 0.45 - nx * 0.15 - (d > 0.75 ? 0.3 : 0)
      b.pset(x, y, leaf[P.band(v, 6, x, y)])
    }
  return b
}

const ALL = Array.from({ length: 16 }, (_, m) => m)
P.save(P.pack(ALL.map(grassTile), { cols: 16 }), path.join(OUT, 'grass-tiles.png'))
P.save(P.pack(ALL.map(treeTile), { cols: 16 }), path.join(OUT, 'tree-tiles.png'))
P.save(pathTile(), path.join(OUT, 'path.png'))
P.save(platformSprite(), path.join(OUT, 'platform.png'))

const SOURCE_CELL = 64
const TRAINER_FRAME = 32
const TRAINER_SOURCES = path.join(__dirname, 'pokemon-art-sources/trainers')

function trainerSheet(file) {
  const sheet = P.load(path.join(TRAINER_SOURCES, file))
  const cells = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push(P.crop(sheet, c * SOURCE_CELL, r * SOURCE_CELL, SOURCE_CELL, SOURCE_CELL))
  const boxes = cells.map(P.bounds).filter(Boolean)
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h))
  const frames = cells.map((cell) => {
    const half = P.cleanup(P.resize(P.crop(cell, x0, y0, x1 - x0, y1 - y0), Math.round((x1 - x0) / 2), { mode: true }), { tol: 20 })
    const frame = new P.Buf(TRAINER_FRAME, TRAINER_FRAME)
    frame.sprite(half, Math.round((TRAINER_FRAME - half.w) / 2), TRAINER_FRAME - half.h)
    return frame
  })
  return P.pack(frames, { cols: 4 })
}

for (const file of fs.readdirSync(TRAINER_SOURCES).filter((f) => f.endsWith('.png'))) {
  P.save(trainerSheet(file), path.join(OUT, 'trainers', file))
}

function centerInterior() {
  const mapSource = fs.readFileSync(path.join(__dirname, '../src/shared/pokemon/map.ts'), 'utf8')
  const LAYOUT = JSON.parse(mapSource.match(/const CENTER = (\[[^\]]*\])/)[1].replace(/'/g, '"'))
  const T = 16
  const W = LAYOUT[0].length, H = LAYOUT.length
  const b = new P.Buf(W * T, H * T)
  const at = (x, y) => LAYOUT[y]?.[x] ?? 'W'
  const tilesOf = (ch) => LAYOUT.flatMap((row, y) => [...row].map((c, x) => (c === ch ? { x, y } : null)).filter(Boolean))

  const hsl = (h, s, l) => P.col(P.hsl(h, s, l))
  const ink = hsl(230, 0.35, 0.1)
  const floor = [hsl(38, 0.3, 0.7), hsl(40, 0.35, 0.8), hsl(42, 0.4, 0.86), hsl(44, 0.45, 0.91)]
  const slate = [hsl(222, 0.2, 0.16), hsl(222, 0.2, 0.24), hsl(222, 0.18, 0.34), hsl(222, 0.16, 0.46)]
  const panel = [hsl(210, 0.12, 0.7), hsl(210, 0.14, 0.82), hsl(210, 0.16, 0.92), hsl(210, 0.2, 0.98)]
  const cyan = [hsl(200, 0.85, 0.35), hsl(195, 0.85, 0.5), hsl(190, 0.85, 0.66), hsl(185, 0.9, 0.82)]
  const red = [hsl(352, 0.7, 0.26), hsl(355, 0.72, 0.38), hsl(358, 0.75, 0.5), hsl(4, 0.8, 0.62)]
  const leaf = [hsl(130, 0.45, 0.18), hsl(122, 0.45, 0.3), hsl(112, 0.5, 0.42), hsl(100, 0.55, 0.56)]
  const pink = [hsl(335, 0.6, 0.55), hsl(338, 0.7, 0.7), hsl(340, 0.8, 0.82)]
  const skin = hsl(28, 0.6, 0.78)
  const rect = (x0, y0, x1, y1, c) => b.rect(x0, y0, x1, y1, c)
  const hline = (x0, x1, y, c) => { for (let x = x0; x < x1; x++) b.pset(x, y, c) }
  const vline = (x, y0, y1, c) => { for (let y = y0; y < y1; y++) b.pset(x, y, c) }
  const frame = (x0, y0, x1, y1, c = ink) => { hline(x0, x1, y0, c); hline(x0, x1, y1 - 1, c); vline(x0, y0, y1, c); vline(x1 - 1, y0, y1, c) }
  const disc = (cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) b.pset(x, y, c) }
  const ring = (cx, cy, r0, r1, c) => { for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r1 && d > r0) b.pset(x, y, c) } }

  for (let y = 0; y < H * T; y++)
    for (let x = 0; x < W * T; x++) {
      const tx = Math.floor(x / T), ty = Math.floor(y / T)
      if (at(tx, ty) === 'W') continue
      const lane = tx >= 4 && tx <= 7
      const seam = x % T === 0 || y % T === 0
      const shade = lane ? 3 : 2
      b.pset(x, y, seam ? floor[1] : (x + y) % 23 === 0 ? floor[shade - 1] : floor[shade])
    }
  for (let y = 2 * T; y < 7 * T; y++) { b.pset(4 * T, y, floor[0]); b.pset(8 * T - 1, y, floor[0]) }

  for (let tx = 0; tx < W; tx++) {
    const x0 = tx * T
    if (tx === 0 || tx === W - 1) continue
    rect(x0, 0, x0 + T, 7, panel[2])
    hline(x0, x0 + T, 1, panel[3])
    rect(x0, 7, x0 + T, 10, cyan[2])
    hline(x0, x0 + T, 7, cyan[3])
    rect(x0, 10, x0 + T, T, red[1])
    hline(x0, x0 + T, 10, red[3])
    hline(x0, x0 + T, T - 1, red[0])
  }
  for (const tx of [0, W - 1])
    for (let ty = 0; ty < H; ty++) {
      const x0 = tx * T, y0 = ty * T
      rect(x0, y0, x0 + T, y0 + T, slate[1])
      vline(tx === 0 ? x0 + T - 1 : x0, y0, y0 + T, slate[3])
      vline(tx === 0 ? x0 + T - 4 : x0 + 3, y0, y0 + T, red[2])
      if (ty % 2 === 1) rect(x0 + 4, y0 + 4, x0 + T - 4, y0 + 10, slate[2])
    }
  for (let tx = 1; tx < W - 1; tx++) {
    const x0 = tx * T, y0 = (H - 1) * T
    if (at(tx, H - 1) !== 'W') continue
    rect(x0, y0, x0 + T, y0 + T, slate[1])
    hline(x0, x0 + T, y0, slate[3])
  }
  const door = tilesOf('M')
  if (door.length) {
    const dx0 = Math.min(...door.map((d) => d.x)) * T, dx1 = (Math.max(...door.map((d) => d.x)) + 1) * T, y0 = (H - 1) * T
    rect(dx0, y0, dx1, y0 + T, floor[0])
    for (let i = 0; i < 4; i++) hline(dx0 + 2, dx1 - 2, y0 + 3 + i * 3, i % 2 ? floor[1] : panel[1])
    for (const px of [dx0 - 6, dx1]) {
      rect(px, y0 - 6, px + 6, y0 + T, cyan[1])
      vline(px + 1, y0 - 5, y0 + T, cyan[3])
      frame(px, y0 - 6, px + 6, y0 + T)
    }
    const cx = (dx0 + dx1) / 2, cy = (H - 2) * T + 8
    disc(cx, cy, 13, ink)
    disc(cx, cy, 11.5, floor[3])
    ring(cx, cy, 7, 8.5, floor[1])
    rect(cx - 12, cy - 1, cx + 12, cy + 1, ink)
    disc(cx, cy, 4.5, ink)
    disc(cx, cy, 3, floor[3])
    for (const sy of [cy - 18, cy + 14]) {
      b.pset(cx - 1, sy, ink); b.pset(cx, sy, ink)
      hline(cx - 2, cx + 2, sy + (sy < cy ? 1 : -1), ink)
    }
  }

  const counter = tilesOf('K').filter((t) => t.y === 1)
  const kx0 = Math.min(...counter.map((t) => t.x)) * T, kx1 = (Math.max(...counter.map((t) => t.x)) + 1) * T
  const mx = (kx0 + kx1) / 2
  for (let y = 0; y < T + 4; y++)
    for (let x = mx - 13; x < mx + 13; x++) {
      const across = (x - (mx - 13)) / 26
      const glow = 0.5 + 0.5 * Math.cos((across - 0.35) * Math.PI)
      let col = cyan[Math.min(3, Math.floor(glow * 3.4))]
      if ((x * 7 + y * 3) % 29 === 0) col = cyan[3]
      b.pset(x, y, col)
    }
  for (const yy of [0, 1, T + 2, T + 3]) hline(mx - 14, mx + 14, yy, panel[yy > 2 ? 0 : 2])
  vline(mx - 14, 0, T + 4, ink)
  vline(mx + 13, 0, T + 4, ink)
  const cyArc = T + 2, rxOut = (kx1 - kx0) / 2, ryOut = 19, rxIn = rxOut - 14, ryIn = 8
  for (let y = cyArc; y < cyArc + ryOut + 1; y++)
    for (let x = kx0; x < kx1; x++) {
      const dOut = ((x + 0.5 - mx) / rxOut) ** 2 + ((y + 0.5 - cyArc) / ryOut) ** 2
      const dIn = ((x + 0.5 - mx) / rxIn) ** 2 + ((y + 0.5 - cyArc) / ryIn) ** 2
      if (dOut > 1 || dIn < 1) continue
      const top = dOut < 0.55 || dIn < 1.5
      const lit = 1 - Math.abs(x + 0.5 - mx) / rxOut
      b.pset(x, y, top ? panel[2 + (lit > 0.5 ? 1 : 0)] : red[1 + Math.round(lit * 2)])
    }
  for (let x = kx0; x < kx1; x++)
    for (let y = cyArc; y < cyArc + ryOut + 2; y++) {
      const dOut = ((x + 0.5 - mx) / rxOut) ** 2 + ((y + 0.5 - cyArc) / ryOut) ** 2
      const dOut2 = ((x + 0.5 - mx) / (rxOut + 1)) ** 2 + ((y + 0.5 - cyArc) / (ryOut + 1)) ** 2
      if (dOut > 1 && dOut2 <= 1) b.pset(x, y, ink)
    }
  {
    const nx = mx, ny = T + 6
    disc(nx, ny - 4, 4, pink[1])
    disc(nx - 4, ny - 1, 2.5, pink[0])
    disc(nx + 4, ny - 1, 2.5, pink[0])
    rect(nx - 2, ny - 4, nx + 2, ny, skin)
    b.pset(nx - 1, ny - 2, ink); b.pset(nx + 1, ny - 2, ink)
    rect(nx - 3, ny - 9, nx + 3, ny - 6, panel[3])
    b.pset(nx, ny - 8, red[2])
    rect(nx - 4, ny, nx + 4, ny + 4, panel[3])
  }
  {
    const hx = kx0 + 10, hy = T + 2
    rect(hx, hy, hx + 16, hy + 8, panel[1])
    frame(hx, hy, hx + 16, hy + 8)
    for (let i = 0; i < 6; i++) disc(hx + 3 + (i % 3) * 5, hy + 2.5 + Math.floor(i / 3) * 3, 1.3, i % 2 ? red[2] : panel[3])
    const sx = kx1 - 22, sy = T + 1
    rect(sx, sy, sx + 12, sy + 8, slate[1])
    rect(sx + 1, sy + 1, sx + 11, sy + 6, cyan[1])
    hline(sx + 2, sx + 9, sy + 2, cyan[3])
    frame(sx, sy, sx + 12, sy + 8)
  }

  for (const { x, y } of tilesOf('P')) {
    const px = x * T, py = y * T
    rect(px + 4, py + 9, px + 12, py + 16, red[1])
    hline(px + 4, px + 12, py + 9, red[3])
    frame(px + 4, py + 9, px + 12, py + 16)
    for (const [dx, dy, r, c] of [[8, 4, 5, 1], [4, 6, 3.5, 0], [12, 6, 3.5, 0], [8, 0, 3, 2]]) disc(px + dx, py + dy, r, leaf[c])
    for (const [dx, dy] of [[7, 1], [9, 3], [5, 5], [11, 5]]) b.pset(px + dx, py + dy, leaf[3])
  }

  const tables = tilesOf('B').filter((t) => at(t.x - 1, t.y) !== 'B' && at(t.x, t.y - 1) !== 'B')
  for (const { x, y } of tables) {
    const x0 = x * T, y0 = y * T, x1 = x0 + 2 * T, y1 = y0 + 2 * T
    if (x < W / 2) {
      rect(x0 + 1, y0 + 2, x0 + 7, y1 - 2, slate[1])
      rect(x0 + 1, y1 - 8, x1 - 2, y1 - 2, slate[1])
      vline(x0 + 2, y0 + 3, y1 - 3, slate[3])
      hline(x0 + 2, x1 - 3, y1 - 7, slate[3])
      frame(x0 + 1, y0 + 2, x0 + 7, y1 - 2)
      frame(x0 + 1, y1 - 8, x1 - 2, y1 - 2)
      rect(x0 + 11, y0 + 6, x1 - 4, y0 + 18, panel[3])
      rect(x0 + 11, y0 + 16, x1 - 4, y0 + 19, panel[0])
      frame(x0 + 11, y0 + 6, x1 - 4, y0 + 19)
    } else {
      const cx = x0 + T, cy = y0 + T - 2
      disc(cx, cy, 8, ink)
      disc(cx, cy, 7, red[2])
      disc(cx - 2, cy - 2, 3, red[3])
      rect(cx - 1, cy + 7, cx + 1, cy + 12, slate[2])
      for (const [sx, sy] of [[x0 + 3, y0 + 6], [x1 - 4, y0 + 6], [x0 + 4, y1 - 5], [x1 - 5, y1 - 5]]) {
        disc(sx, sy, 3.2, ink)
        disc(sx, sy, 2.4, red[1])
        b.pset(Math.floor(sx) - 1, Math.floor(sy) - 1, red[3])
      }
    }
  }
  return b
}

P.save(centerInterior(), path.join(OUT, 'center-interior.png'))

const TYPE_ORDER = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/shared/pokemon/types.ts'), 'utf8').match(/POKEMON_TYPES = (\[[^\]]*\])/)[1].replace(/'/g, '"'))
const TYPE_COLORS = {
  normal: [168, 167, 122], fire: [238, 129, 48], water: [99, 144, 240], electric: [247, 208, 44], grass: [122, 199, 76], ice: [150, 217, 214],
  fighting: [194, 46, 40], poison: [163, 62, 161], ground: [226, 191, 101], flying: [169, 143, 243], psychic: [249, 85, 135], bug: [166, 185, 26],
  rock: [182, 161, 54], ghost: [115, 87, 151], dragon: [111, 53, 252], dark: [112, 87, 70], steel: [183, 183, 206], fairy: [214, 133, 173]
}

const GLYPHS = {
  normal: ['..#####..', '.#.....#.', '#.......#', '#..###..#', '#..###..#', '#..###..#', '#.......#', '.#.....#.', '..#####..'],
  fire: ['....#....', '...##....', '...###...', '..####.#.', '.######..', '.#######.', '.###.###.', '..#...#..', '...###...'],
  water: ['....#....', '....#....', '...###...', '..#####..', '.#######.', '.#######.', '.##.####.', '..#####..', '...###...'],
  electric: ['.....###.', '....###..', '...###...', '..######.', '.....##..', '....##...', '...##....', '..##.....', '.#.......'],
  grass: ['......###', '....#####', '...######', '..#####.#', '.####.##.', '.###.##..', '..#.##...', '..##.....', '.#.......'],
  ice: ['....#....', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '....#....'],
  fighting: ['.........', '.#######.', '.#.#.#.#.', '.#######.', '.#######.', '..######.', '..#####..', '..#####..', '.........'],
  poison: ['.....##..', '....####.', '....####.', '.##..##..', '####.....', '####..##.', '.##..####', '.....####', '......##.'],
  ground: ['.........', '.........', '....#....', '...###...', '..#####..', '.###.###.', '#########', '#########', '.........'],
  flying: ['#........', '##.......', '###......', '####.....', '#####...#', '.######.#', '..#######', '...######', '.....###.'],
  psychic: ['.........', '..#####..', '.#.....#.', '#..###..#', '#.#####.#', '#..###..#', '.#.....#.', '..#####..', '.........'],
  bug: ['.#.....#.', '..#...#..', '...###...', '.#######.', '..#####..', '.#######.', '..#####..', '...###...', '.........'],
  rock: ['.........', '...###...', '..#####..', '.###.###.', '.##...##.', '.#######.', '#########', '.#######.', '.........'],
  ghost: ['...###...', '..#####..', '.#######.', '.##.#.##.', '.#######.', '.#######.', '.#######.', '.#.#.#.#.', '.........'],
  dragon: ['#.......#', '##.....##', '###...###', '.#######.', '..#####..', '..#####..', '...###...', '...###...', '....#....'],
  dark: ['...####..', '..###....', '.###.....', '.###.....', '.###.....', '.###.....', '..###....', '...####..', '.........'],
  steel: ['...###...', '..#####..', '.###.###.', '.##...##.', '.##...##.', '.###.###.', '..#####..', '...###...', '.........'],
  fairy: ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '.#.....#.']
}

const LIGHT_BACKGROUND = 175
const glyphColor = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b > LIGHT_BACKGROUND ? [45, 45, 60] : [255, 255, 255])
const darker = (c, k) => c.map((v) => Math.round(v * k))

function typeIcon(type) {
  const b = new P.Buf(16, 16)
  const base = TYPE_COLORS[type]
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8)
      if (d > 8) continue
      const shade = y < 7 ? 1.08 : 1
      b.pset(x, y, d > 7 ? darker(base, 0.55) : darker(base, shade).map((v) => Math.min(255, v)))
    }
  const glyph = GLYPHS[type]
  glyph.forEach((row, y) => {
    if (row.length !== 9) throw new Error(`${type} linha ${y}`)
    ;[...row].forEach((ch, x) => ch === '#' && b.pset(x + 4, y + 4, glyphColor(base)))
  })
  return b
}

P.save(P.pack(TYPE_ORDER.map(typeIcon), { cols: TYPE_ORDER.length }), path.join(OUT, 'types.png'))


const STONE_SPRITES = (() => {
  const G = 18
  const H = G / 2
  const L = (() => { const v = [-0.55, -0.65, 0.55]; const m = Math.hypot(...v); return v.map((c) => c / m) })()
  const ramp = (hue, sat, lo, hi, shift = 40) => P.hueRamp(6, { hue, sat, light: [lo, hi], shift })
  const rot = (u, v, a) => [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)]

  const ellipse = (rx, ry, a = 0) => (u, v) => { const [p, q] = rot(u, v, a); return (p / rx) ** 2 + (q / ry) ** 2 <= 1 }
  const tear = (a = 0.7, r = 0.62, cy = 0.32) => (u, v) => {
    const [p, q] = rot(u, v, a)
    if (Math.hypot(p, q - cy) <= r) return true
    return q >= -0.96 && q <= cy && Math.abs(p) <= r * ((q + 0.96) / (cy + 0.96)) ** 0.75
  }
  const gem = (a, b, rnd = 0.12) => (u, v) => Math.abs(u) / a + Math.abs(v) / b <= 1 + rnd * (1 - Math.abs(Math.abs(u) / a - Math.abs(v) / b))
  const poly = (n, r, a0 = 0) => (u, v) => {
    const t = Math.atan2(v, u) - a0, s = (2 * Math.PI) / n
    const k = ((t % s) + s) % s - s / 2
    return Math.hypot(u, v) * Math.cos(k) <= r * Math.cos(Math.PI / n) + 0.04
  }
  const sun = (u, v) => { const t = Math.atan2(v, u); return Math.hypot(u, v) <= 0.6 + 0.36 * Math.max(0, Math.cos(8 * t + 0.4)) ** 2.5 }
  const pebble = (u, v) => { const t = Math.atan2(v, u); return (u / 0.94) ** 2 + (v / 0.68) ** 2 <= 1 + 0.08 * Math.sin(3 * t + 1) }
  const FEATHER = [[-0.92, 0.9], [-0.7, 0.1], [-0.2, -0.55], [0.5, -0.95], [0.95, -0.9], [0.85, -0.3], [0.45, 0.35], [-0.2, 0.8]]
  const feather = (u, v) => inPoly(u, v, FEATHER)

  const sphereLight = (rx = 1, ry = 1) => (u, v) => {
    const nx = u / rx, ny = v / ry, z = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny) * 0.92))
    return Math.max(0, nx * L[0] + ny * L[1] + z * L[2])
  }
  const facetLight = (n, a0 = 0, tilt = 0.6) => (u, v) => {
    const r = Math.hypot(u, v)
    if (r < 0.3) return 0.86
    const s = (2 * Math.PI) / n, t = Math.atan2(v, u) - a0
    const c = Math.round(t / s) * s + a0
    const nx = Math.cos(c) * tilt, ny = Math.sin(c) * tilt, nz = Math.sqrt(1 - tilt * tilt)
    return Math.max(0, nx * L[0] + ny * L[1] + nz * L[2])
  }

  const near = (u, v, pts, w) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
      const dx = bx - ax, dy = by - ay, t = P.clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy))
      if (Math.hypot(u - ax - dx * t, v - ay - dy * t) <= w) return true
    }
    return false
  }
  const inPoly = (u, v, pts) => {
    let c = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }

  function stone({ shape, body, light = sphereLight(), motif, glint = [[-0.45, -0.4]], base = 0.08, spread = 1 }) {
    const b = new P.Buf(G, G)
    for (let y = 0; y < G; y++)
      for (let x = 0; x < G; x++) {
        const u = (x + 0.5 - H) / H, v = (y + 0.5 - H) / H
        if (!shape(u, v)) continue
        const lit = P.clamp(base + light(u, v) * spread)
        const m = motif?.(u, v)
        const pal = m ? m.ramp : body
        const shift = m?.shift ?? 0
        b.pset(x, y, pal[P.clamp(P.band(lit, pal.length - 1, x, y) + shift, 0, pal.length - 1)])
      }
    for (const [gu, gv] of glint) {
      const x = Math.floor(gu * H + H), y = Math.floor(gv * H + H)
      if (b.get(x, y)) b.pset(x, y, 0xffffffff)
    }
    const dark = body[0]
    return P.outline(P.selout(b, body[1], dark), P.rgb(18, 14, 24))
  }

  const fireBody = ramp(42, 0.95, 0.32, 0.86, 25)
  const flame = ramp(12, 0.9, 0.3, 0.62, 25)
  const blue = ramp(212, 0.75, 0.2, 0.8)
  const aqua = ramp(192, 0.7, 0.45, 0.92)
  const green = ramp(110, 0.55, 0.16, 0.66)
  const lime = ramp(95, 0.6, 0.35, 0.8)
  const bolt = ramp(52, 1, 0.45, 0.85, 15)
  const leaf = ramp(130, 0.55, 0.1, 0.42)
  const ice = ramp(195, 0.55, 0.5, 0.95)
  const moon = ramp(150, 0.12, 0.3, 0.82)
  const moonMark = ramp(220, 0.2, 0.15, 0.45)
  const sunRed = ramp(8, 0.85, 0.28, 0.6, 25)
  const sunCore = ramp(36, 0.95, 0.45, 0.82, 20)
  const dusk = ramp(278, 0.35, 0.1, 0.6)
  const dawn = ramp(178, 0.6, 0.3, 0.82)
  const shiny = ramp(70, 0.6, 0.55, 0.96)
  const oval = ramp(40, 0.15, 0.62, 0.97, 20)
  const ever = ramp(210, 0.08, 0.3, 0.78)
  const cocoon = ramp(100, 0.38, 0.32, 0.86)
  const silk = ramp(80, 0.3, 0.6, 0.97)
  const featherBody = ramp(55, 0.75, 0.62, 0.95, 20)
  const featherBlue = ramp(200, 0.6, 0.35, 0.82)
  const earth = ramp(28, 0.5, 0.14, 0.72, 25)
  const crack = [P.rgb(30, 20, 12), P.rgb(48, 32, 18), P.rgb(66, 44, 24)]
  const punch = ramp(28, 0.95, 0.38, 0.78, 20)
  const punchMark = ramp(48, 1, 0.62, 0.9, 10)

  const STONES = {
    fire: { shape: tear(0.7), body: fireBody, motif: (u, v) => inPoly(u, v, [[-0.42, 0.62], [-0.5, 0.1], [-0.3, -0.25], [-0.22, 0.05], [-0.05, -0.55], [0.12, -0.1], [0.28, -0.3], [0.38, 0.15], [0.3, 0.62]]) ? { ramp: flame } : null },
    water: { shape: gem(0.82, 0.98), body: blue, light: facetLight(8, Math.PI / 8), motif: (u, v) => (Math.hypot(u, v - 0.18) < 0.3 || (v < 0.18 && v > -0.42 && Math.abs(u) < 0.3 * ((v + 0.42) / 0.6))) ? { ramp: aqua } : null },
    electric: { shape: ellipse(0.62, 0.98, -0.6), body: lime, motif: (u, v) => inPoly(u, v, [[0.32, -0.75], [-0.3, 0.05], [0.02, 0.08], [-0.3, 0.78], [0.34, -0.12], [0.02, -0.14], [0.3, -0.75]]) ? { ramp: bolt } : null },
    grass: { shape: ellipse(0.66, 0.98, -0.6), body: green, motif: (u, v) => {
      const [p, q] = rot(u, v, 0.6)
      if (Math.abs(p) < 0.05 && Math.abs(q) < 0.7) return { ramp: green, shift: 2 }
      return (p / 0.4) ** 2 + (q / 0.78) ** 2 <= 1 ? { ramp: leaf } : null
    } },
    ice: { shape: poly(6, 0.98, Math.PI / 6), body: ice, light: facetLight(6, Math.PI / 6, 0.5), glint: [[-0.4, -0.5], [-0.3, -0.5]] },
    normal: { shape: sun, body: sunRed, motif: (u, v) => Math.hypot(u, v) < 0.56 ? { ramp: sunCore } : null },
    poison: { shape: tear(0.6, 0.64), body: dusk, motif: (u, v) => near(u, v, [[-0.1, 0.55], [-0.35, 0.25], [-0.15, -0.05], [0.15, -0.3]], 0.07) ? { ramp: dusk, shift: 2 } : null },
    psychic: { shape: gem(0.86, 0.98), body: shiny, light: facetLight(4, Math.PI / 4, 0.55), glint: [[-0.3, -0.35], [-0.2, -0.45], [-0.4, -0.25]] },
    bug: { shape: ellipse(0.62, 0.98, -0.7), body: cocoon, motif: (u, v) => { const [, q] = rot(u, v, 0.7); const band = ((q + 1) * 3.2) % 1; return band < 0.28 ? { ramp: silk } : null } },
    flying: { shape: feather, body: featherBody, motif: (u, v) => {
      if (near(u, v, [[-0.85, 0.85], [0.75, -0.75]], 0.07)) return { ramp: featherBlue, shift: 1 }
      return near(u, v, [[-0.92, 0.9], [-0.7, 0.1], [-0.2, -0.55], [0.5, -0.95]], 0.22) ? { ramp: featherBlue } : null
    } },
    ground: { shape: gem(0.98, 0.84, 0.4), body: earth, light: facetLight(7, 0.3, 0.55), motif: (u, v) => near(u, v, [[-0.55, -0.2], [-0.15, 0.05], [0.1, -0.35], [0.45, -0.15]], 0.06) || near(u, v, [[-0.15, 0.05], [0.05, 0.5]], 0.06) ? { ramp: crack } : null },
    fighting: { shape: tear(0.75, 0.66, 0.28), body: punch, motif: (u, v) => {
      const t = Math.atan2(v - 0.15, u + 0.05), r = Math.hypot(u + 0.05, v - 0.15)
      return r < 0.18 + 0.2 * Math.max(0, Math.cos(5 * t)) ** 3 ? { ramp: punchMark } : null
    } },
    ghost: { shape: tear(3.6, 0.64, 0.3), body: ramp(282, 0.6, 0.18, 0.66), motif: (u, v) => P.fbm(u * 2.2 + 3, v * 2.2 + 7, 2, 5) > 0.52 && Math.hypot(u - 0.15, v + 0.1) < 0.6 ? { ramp: ramp(270, 0.35, 0.06, 0.3) } : null },
    rock: { shape: gem(0.95, 0.85, 0.35), body: ramp(145, 0.14, 0.12, 0.66), light: facetLight(6, 0.5, 0.6), motif: (u, v) => near(u, v, [[-0.6, 0.2], [-0.1, -0.05], [0.25, 0.35]], 0.06) || near(u, v, [[-0.1, -0.05], [0.2, -0.55]], 0.06) ? { ramp: [P.rgb(24, 26, 30), P.rgb(34, 38, 40), P.rgb(44, 50, 50)] } : null },
    fairy: { shape: (u, v) => { const x = Math.abs(u) / 0.98, y = -(v - 0.05) / 0.98 * 1.15; return (x * x + y * y - 0.55) ** 3 - x * x * y ** 3 <= 0 }, body: ramp(322, 0.85, 0.32, 0.86, 20), light: sphereLight(1, 0.9), glint: [[-0.5, -0.45], [-0.4, -0.55]] },
    dragon: { shape: tear(0.75, 0.64, 0.3), body: ramp(25, 0.45, 0.3, 0.84, 25), motif: (u, v) => {
      if (-(u + v) > 0.78) return { ramp: ramp(46, 0.9, 0.4, 0.88, 15) }
      if (inPoly(u, v, [[0.15, 0.35], [0.7, 0.05], [0.55, 0.75], [0.2, 0.75]])) return { ramp: ramp(200, 0.65, 0.3, 0.86) }
      return near(u, v, [[-0.2, -0.4], [0.35, 0.1]], 0.06) ? { ramp: ramp(25, 0.45, 0.3, 0.84, 25), shift: -2 } : null
    } },
    steel: { shape: poly(6, 0.98, 0.25), body: ramp(215, 0.06, 0.28, 0.97, 10), light: facetLight(6, 0.25, 0.65), glint: [[-0.35, -0.45], [-0.25, -0.55], [-0.45, -0.35]] }
  }
  return Object.fromEntries(Object.entries(STONES).map(([type, spec]) => [type, stone(spec)]))
})()
const STONE_OF = (type) => STONE_SPRITES[type] ?? STONE_SPRITES.ghost

P.save(P.pack(TYPE_ORDER.map(STONE_OF), { cols: TYPE_ORDER.length }), path.join(OUT, 'stones.png'))


const BALL_ART = (() => {
  const S = 22
  const C = S / 2
  const L = (() => { const v = [-0.5, -0.7, 0.6]; const m = Math.hypot(...v); return v.map((c) => c / m) })()
  const ramp = (hue, sat, lo, hi, shift = 10) => P.hueRamp(4, { hue, sat, light: [lo, hi], shift })
  const WHITE = [P.rgb(140, 140, 156), P.rgb(196, 196, 208), P.rgb(232, 232, 240), P.rgb(255, 255, 255)]
  const BLACK = [P.rgb(18, 18, 24), P.rgb(34, 34, 42), P.rgb(52, 52, 62), P.rgb(74, 74, 86)]
  const SILVER = [P.rgb(110, 116, 128), P.rgb(160, 166, 178), P.rgb(205, 210, 220), P.rgb(245, 246, 250)]
  const INK = P.rgb(20, 16, 28)

  const RED = ramp(356, 0.78, 0.3, 0.64)
  const BLUE = ramp(208, 0.72, 0.26, 0.62)
  const STRIPE = ramp(6, 0.82, 0.36, 0.66)
  const YELLOW = ramp(46, 0.92, 0.42, 0.74, 15)
  const DEEP = ramp(226, 0.58, 0.18, 0.48)
  const SKY = ramp(205, 0.5, 0.58, 0.86)
  const CLAW = ramp(44, 0.55, 0.5, 0.86, 15)

  const bandY = (u) => 0.06 + u * 0.08
  const tilt = (u, v) => v - bandY(u)

  const BALLS = {
    pokeball: { radius: 9, region: (u, v) => (tilt(u, v) < 0 ? RED : WHITE) },
    greatball: {
      radius: 9,
      region: (u, v) => {
        if (tilt(u, v) >= 0) return WHITE
        const side = Math.abs(u)
        return side > 0.32 && side < 0.78 && v < -0.18 && v > -0.86 + side * 0.25 ? STRIPE : BLUE
      }
    },
    ultraball: {
      radius: 9,
      region: (u, v) => {
        if (tilt(u, v) >= 0) return WHITE
        return Math.abs(u) > 0.3 && v > -0.72 ? YELLOW : BLACK
      }
    },
    beastball: {
      radius: 7,
      claws: true,
      lightBand: true,
      region: (u, v) => {
        const t = tilt(u, v)
        if (Math.abs(Math.abs(u) - 0.45) < 0.07 || Math.abs(Math.abs(t) - 0.5) < 0.07) return SKY
        return DEEP
      }
    }
  }

  function shadeIndex(nx, ny, x, y) {
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    const lit = P.clamp(0.02 + (nx * L[0] + ny * L[1] + nz * L[2]) * 0.85)
    return P.band(lit, 4, x, y)
  }

  function drawClaws(b, radius) {
    const span = (75 * Math.PI) / 180
    for (const corner of [-135, -45, 45, 135].map((d) => (d * Math.PI) / 180))
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const px = x + 0.5 - C, py = y + 0.5 - C
          const d = Math.atan2(Math.sin(Math.atan2(py, px) - corner), Math.cos(Math.atan2(py, px) - corner))
          const t = (d + span * 0.6) / span
          if (t < 0 || t > 1) continue
          const thick = 4.6 * Math.sin(Math.PI * t) ** 0.8 * (1 - t * 0.5)
          const out = Math.hypot(px, py) - radius + 0.8
          if (out < 0 || out > thick) continue
          b.pset(x, y, CLAW[Math.min(3, Math.max(0, Math.round(3 - (out / Math.max(thick, 0.1)) * 2 - (py > 0 ? 1 : 0))))])
        }
  }

  function ball(id, { open = 0 } = {}) {
    const spec = BALLS[id]
    const r = spec.radius
    const b = new P.Buf(S, S)
    if (spec.claws) drawClaws(b, r)
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const px = x + 0.5 - C, py = y + 0.5 - C
        const u = px / r
        let v = py / r
        const top = tilt(u, v) < 0
        if (open && top) v = (py + open) / r
        if (u * u + v * v > 1) continue
        const t = tilt(u, v)
        const band = Math.abs(t) < 0.1
        const button = Math.hypot(u, v - bandY(0))
        let pal = spec.region(u, v)
        if (band) pal = spec.lightBand ? SKY : BLACK
        const i = shadeIndex(u, v, x, y)
        let col = pal[i]
        if (!open && button < 0.34) col = button < 0.22 ? (button < 0.12 ? SILVER[3] : SILVER[2]) : BLACK[1]
        if (!open && button < 0.17 && button > 0.12) col = SILVER[1]
        b.pset(x, y, col)
      }
    if (open) {
      for (let x = 0; x < S; x++)
        for (let y = 0; y < S; y++) {
          const px = x + 0.5 - C, py = y + 0.5 - C, u = px / r
          const gap = py - bandY(u) * r
          if (gap < 0 && gap > -open && Math.hypot(px, py) < r - 0.5) b.pset(x, y, P.rgb(255, 250, 225))
        }
    }
    const hx = Math.round(C - r * 0.45), hy = Math.round(C - r * 0.55)
    if (!open && b.get(hx, hy)) { b.pset(hx, hy, 0xffffffff); b.pset(hx + 1, hy, 0xffffffff); b.pset(hx, hy + 1, 0xffffffff) }
    return P.outline(b, INK)
  }

  const STAR = (() => {
    const b = new P.Buf(7, 7)
    const rows = ['...#...', '...#...', '..###..', '#######', '..###..', '..#.#..', '.#...#.']
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && b.pset(x, y, x === 3 && y === 3 ? P.rgb(255, 255, 255) : P.rgb(255, 222, 60))))
    return P.outline(b, INK)
  })()
  return { ball, BALLS, STAR }
})()

fs.mkdirSync(path.join(OUT, 'balls'), { recursive: true })
for (const id of Object.keys(BALL_ART.BALLS)) P.save(P.pack([BALL_ART.ball(id), BALL_ART.ball(id, { open: 4 })], { cols: 2 }), path.join(OUT, 'balls', `${id}.png`))
P.save(BALL_ART.STAR, path.join(OUT, 'star.png'))


const MEDICINE_ART = (() => {
  const S = 24
  const INK = P.rgb(22, 18, 34)
  const hsl = (h, s, l) => P.col(P.hsl(h, s, l))
  const ramp = (hue, sat, lights) => lights.map((l, i) => hsl(hue + (i - 2) * -6, sat, l))
  const CAP = [P.rgb(92, 104, 140), P.rgb(150, 164, 200), P.rgb(204, 216, 240), P.rgb(244, 248, 255)]
  const GLASS = [P.rgb(150, 170, 196), P.rgb(200, 216, 232), P.rgb(236, 244, 252)]

  const inPoly = (x, y, pts) => {
    let c = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }

  function flaskShape(wide) {
    if (wide) return (x, y) => y >= 10 && y <= 22 && x >= 4 && x <= 19 && !((x === 4 || x === 19) && (y === 10 || y === 22))
    return (x, y) => {
      if (y < 9 || y > 22) return false
      if (y <= 11) return x >= 10 && x <= 13
      const t = (y - 11) / 11
      const half = 2 + t * 7.5
      const inside = Math.abs(x + 0.5 - 12) <= half
      const corner = y === 22 && Math.abs(x + 0.5 - 12) > half - 1
      return inside && !corner
    }
  }

  function bottle({ liquid, ring, wide = false, level = 13 }) {
    const b = new P.Buf(S, S)
    const shape = flaskShape(wide)
    let left = S, right = 0
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (shape(x, y)) { left = Math.min(left, x); right = Math.max(right, x) }
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!shape(x, y)) continue
        let rowL = x, rowR = x
        while (shape(rowL - 1, y)) rowL--
        while (shape(rowR + 1, y)) rowR++
        const across = rowR === rowL ? 0.5 : (x - rowL) / (rowR - rowL)
        if (y < level) {
          b.pset(x, y, GLASS[across < 0.3 ? 2 : across > 0.75 ? 0 : 1])
          continue
        }
        const v = P.clamp(0.92 - across * 0.85 + (y === level ? 0.2 : 0))
        let col = liquid[Math.min(liquid.length - 1, P.band(v, liquid.length, x, y))]
        const sparkle = P.noise(x * 1.7 + 3, y * 1.7 + 9, 4) > 0.9 && across > 0.2 && across < 0.9
        if (sparkle) col = liquid[liquid.length - 1]
        if (x === rowL || x === rowR) col = liquid[x === rowL ? 3 : 0]
        b.pset(x, y, col)
      }
    for (let y = level + 1; y <= 20; y++) if (shape(left + 1, y) && y % 3 !== 0) b.pset(Math.max(left + 1, 12 - Math.round(((y - 11) / 11) * 7.5) + 1), y, P.rgb(255, 255, 255))
    const capL = wide ? 5 : 8, capR = wide ? 18 : 15, capTop = wide ? 3 : 4, capBottom = wide ? 9 : 8
    for (let y = capTop; y <= capBottom; y++)
      for (let x = capL; x <= capR; x++) {
        if (y === capTop && (x === capL || x === capR)) continue
        const across = (x - capL) / (capR - capL)
        b.pset(x, y, CAP[across < 0.25 ? 3 : across < 0.65 ? 2 : across < 0.9 ? 1 : 0])
      }
    for (let x = capL; x <= capR; x++) b.pset(x, capBottom, CAP[1])
    const triggerX = capL - 1
    for (let y = capTop + 2; y <= capBottom + 3; y++) b.pset(triggerX, y, CAP[y > capBottom ? 1 : 2])
    b.pset(triggerX - 1, capBottom + 3, CAP[1])
    for (let y = capTop + 1; y <= capTop + 3; y++) for (let x = capL - 3; x < capL; x++) b.pset(x, y, ring[1])
    b.pset(capL - 3, capTop + 2, ring[0])
    b.pset(capL - 2, capTop + 2, P.rgb(255, 255, 255))
    b.pset(capL - 3, capTop + 1, ring[2])
    return P.outline(b, INK)
  }

  function crystal(pts, ridge, light, dark) {
    const b = new P.Buf(S, S)
    const [[ax, ay], [bx, by]] = ridge
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const px = x + 0.5, py = y + 0.5
        if (!inPoly(px, py, pts)) continue
        const side = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
        const t = P.clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2))
        const pal = side < 0 ? light : dark
        const near = Math.abs(side) / Math.hypot(bx - ax, by - ay) < 0.9
        const i = near && side < 0 ? pal.length - 1 : P.band(P.clamp(0.75 - t * 0.5), pal.length - 1, x, y)
        b.pset(x, y, pal[i])
      }
    return P.outline(b, INK)
  }

  function starCrystal(cx, cy, rOut, rIn, n, a0, light, dark) {
    const b = new P.Buf(S, S)
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const px = x + 0.5 - cx, py = y + 0.5 - cy
        const a = Math.atan2(py, px) - a0, r = Math.hypot(px, py)
        const seg = (2 * Math.PI) / n
        const k = ((a % seg) + seg) % seg
        const half = k < seg / 2
        const f = half ? k / (seg / 2) : (seg - k) / (seg / 2)
        const edge = rOut + (rIn - rOut) * f
        if (r > edge + 0.3) continue
        const point = Math.round((a - k) / seg + (half ? 0 : 1))
        const facing = Math.cos(a0 + point * seg + Math.PI * 0.75)
        const lit = half ? 0.85 : 0.4
        const v = P.clamp(lit + facing * 0.15 - (r / rOut) * 0.15)
        const pal = half ? light : dark
        b.pset(x, y, pal[P.band(v, pal.length, x, y)])
      }
    b.pset(Math.round(cx - 1), Math.round(cy - 1), P.rgb(255, 255, 255))
    return P.outline(b, INK)
  }

  const GOLD_LIGHT = [P.rgb(214, 160, 40), P.rgb(240, 196, 64), P.rgb(252, 224, 120), P.rgb(255, 246, 200)]
  const GOLD_DARK = [P.rgb(140, 92, 26), P.rgb(184, 128, 34), P.rgb(214, 162, 52), P.rgb(232, 190, 80)]

  const MEDS = {
    potion: bottle({ liquid: ramp(290, 0.72, [0.32, 0.44, 0.56, 0.68, 0.84]), ring: [P.rgb(70, 40, 160), P.rgb(120, 90, 220), P.rgb(170, 150, 245)] }),
    'super-potion': bottle({ liquid: ramp(34, 0.95, [0.4, 0.5, 0.6, 0.72, 0.88]), ring: [P.rgb(170, 40, 30), P.rgb(220, 80, 60), P.rgb(250, 150, 130)] }),
    'hyper-potion': bottle({ liquid: ramp(342, 0.72, [0.6, 0.7, 0.78, 0.86, 0.95]), ring: [P.rgb(30, 120, 180), P.rgb(80, 170, 230), P.rgb(150, 210, 250)] }),
    'max-potion': bottle({ liquid: ramp(206, 0.85, [0.3, 0.42, 0.54, 0.66, 0.84]), ring: [P.rgb(30, 60, 150), P.rgb(70, 110, 210), P.rgb(140, 180, 245)], wide: true, level: 12 }),
    revive: crystal([[16, 1.5], [21.5, 7], [8, 22.5], [4.5, 12]], [[16, 1.5], [8, 22.5]], GOLD_LIGHT, GOLD_DARK),
    'max-revive': starCrystal(12, 12.8, 11.5, 5, 5, -Math.PI / 2, GOLD_LIGHT, GOLD_DARK)
  }
  return MEDS
})()

fs.mkdirSync(path.join(OUT, 'medicine'), { recursive: true })
for (const [id, sprite] of Object.entries(MEDICINE_ART)) P.save(sprite, path.join(OUT, 'medicine', `${id}.png`))


const ATTACK_ART = (() => {
  const S = 64
  const C = S / 2
  const N = 8
  const rgb = P.rgb
  const INK = rgb(24, 18, 36)
  const WHITE = rgb(255, 255, 255)
  const lerp = (a, b, t) => a + (b - a) * t
  const ease = (t) => 1 - (1 - t) ** 2
  const START = [6, 58]

  const disc = (b, cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) b.pset(x, y, c) }
  const ring = (b, cx, cy, r0, r1, c, keep = () => true) => { for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r1 && d > r0 && keep(x, y)) b.pset(x, y, c) } }
  const line = (b, x0, y0, x1, y1, c, w = 0) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1; for (let i = 0; i <= n; i++) { const t = i / n; disc(b, lerp(x0, x1, t), lerp(y0, y1, t), w + 0.5, c) } }
  const poly = (b, pts, c) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside } if (inside) b.pset(x, y, c) } }
  const outlined = (b) => {
    const out = new P.Buf(S, S)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (b.get(x, y)) { out.pset(x, y, b.get(x, y)); continue }
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => b.get(x + dx, y + dy))) out.pset(x, y, INK)
    }
    return out
  }
  const frames = (draw, n = N) => Array.from({ length: n }, (_, f) => { const b = new P.Buf(S, S); draw(b, f, f / (n - 1)); return b })
  const sparks = (b, cx, cy, r, count, c, seed) => { const rand = P.rng(seed); for (let i = 0; i < count; i++) { const a = rand() * Math.PI * 2, d = r * (0.6 + rand() * 0.4); b.pset(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), c) } }
  const burst = (b, cx, cy, r, cols, rays = 8) => {
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + 0.2
      line(b, cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cols[i % cols.length], 0.4)
    }
  }
  const travel = (t) => [lerp(START[0], C, ease(t)), lerp(START[1], C, ease(t))]

  const WATER = [rgb(30, 90, 200), rgb(60, 150, 240), rgb(140, 210, 255), WHITE]
  const FIRE = [rgb(170, 30, 20), rgb(240, 90, 20), rgb(255, 170, 40), rgb(255, 240, 150)]
  const ELEC = [rgb(60, 110, 255), rgb(140, 190, 255), rgb(255, 250, 160), WHITE]
  const GHOST = [rgb(70, 40, 120), rgb(130, 80, 200), rgb(180, 140, 240), rgb(230, 210, 255)]
  const STEEL = [rgb(80, 90, 110), rgb(140, 150, 170), rgb(200, 208, 222), WHITE]
  const WOOD = [rgb(90, 50, 30), rgb(140, 85, 45)]
  const SKIN = [rgb(170, 110, 70), rgb(230, 170, 120), rgb(255, 215, 175)]
  const LEAF = [rgb(30, 100, 40), rgb(70, 170, 60), rgb(150, 220, 90)]
  const ICE = [rgb(80, 160, 220), rgb(150, 220, 250), rgb(220, 248, 255), WHITE]
  const POISON = [rgb(80, 30, 110), rgb(150, 60, 190), rgb(200, 120, 235), rgb(240, 200, 255)]
  const EARTH = [rgb(80, 50, 30), rgb(140, 95, 55), rgb(190, 145, 90), rgb(225, 195, 140)]
  const WIND = [rgb(170, 200, 220), rgb(220, 236, 248), WHITE]
  const PSY = [rgb(200, 50, 130), rgb(245, 110, 180), rgb(255, 180, 220)]
  const BUG = [rgb(60, 90, 20), rgb(140, 170, 40), rgb(210, 230, 110)]
  const ROCK = [rgb(70, 64, 58), rgb(120, 110, 96), rgb(170, 158, 140), rgb(210, 200, 182)]
  const DRAGON = [rgb(50, 20, 110), rgb(110, 50, 200), rgb(80, 120, 255), rgb(190, 170, 255)]
  const DARK = [rgb(14, 8, 24), rgb(40, 22, 60), rgb(80, 50, 110), rgb(200, 40, 60)]
  const BUFF = [rgb(30, 80, 200), rgb(70, 140, 250), rgb(150, 200, 255), WHITE]
  const DEBUFF = [rgb(150, 20, 30), rgb(220, 50, 50), rgb(255, 130, 120), WHITE]
  const wave = (b, t, up, cols) => {
    const front = up ? lerp(S + 6, -6, t) : lerp(-6, S + 6, t)
    for (let y = 0; y < S; y++) for (let x = 8; x < S - 8; x++) {
      const curve = Math.sin((x / S) * Math.PI * 3 + t * 6) * 2.5
      const d = (up ? y - front : front - y) - curve
      if (d < 0 || d > 16) continue
      const band = d < 2 ? 3 : d < 5 ? 2 : d < 10 ? 1 : 0
      if (band === 0 && P.bt(x, y) > 1 - d / 16) continue
      b.pset(x, y, cols[band])
    }
    for (let k = 0; k < 6; k++) { const ax = 12 + k * 8, ay = Math.round(front + (up ? 10 + (k % 2) * 6 : -10 - (k % 2) * 6)); for (let i = 0; i < 3; i++) { b.pset(ax, ay + (up ? i : -i), cols[3]); if (i === 1) { b.pset(ax - 1, ay + (up ? 1 : -1), cols[2]); b.pset(ax + 1, ay + (up ? 1 : -1), cols[2]) } } }
  }
  const FAIRY = [rgb(230, 80, 170), rgb(255, 150, 210), rgb(255, 210, 235), WHITE]

  const ATTACKS = {
    buff: frames((b, f, t) => wave(b, t, true, BUFF)),
    debuff: frames((b, f, t) => wave(b, t, false, DEBUFF)),
    water: frames((b, f, t) => {
      const reach = Math.min(1, t * 1.6)
      const n = 40
      for (let i = 0; i <= n * reach; i++) {
        const u = i / n, x = lerp(START[0], C, u), y = lerp(START[1], C, u) + Math.sin(u * 9 + f) * 2
        disc(b, x, y, 3.2 + u * 1.5, WATER[1])
        disc(b, x - 0.6, y - 0.8, 1.6 + u, WATER[2])
        if ((i + f) % 5 === 0) b.pset(Math.round(x - 1), Math.round(y - 2), WHITE)
      }
      if (t > 0.55) {
        const s = (t - 0.55) / 0.45
        for (let i = 0; i < 9; i++) { const a = -Math.PI * (0.1 + (i / 8) * 0.8), d = 6 + s * 16; disc(b, C + Math.cos(a) * d, C + Math.sin(a) * d * 0.8 + s * s * 10, 2.2 - s, WATER[i % 2 ? 2 : 1]) }
      }
    }),
    fire: frames((b, f, t) => {
      if (t < 0.6) {
        const [x, y] = travel(t / 0.6)
        for (let k = 1; k <= 4; k++) disc(b, x - k * 3.2, y + k * 3.2, 5 - k, FIRE[Math.max(0, 2 - (k >> 1))])
        disc(b, x, y, 6.5, FIRE[1]); disc(b, x + 0.5, y - 0.5, 4.5, FIRE[2]); disc(b, x + 1, y - 1, 2.2, FIRE[3])
      } else {
        const s = (t - 0.6) / 0.4
        disc(b, C, C, 8 + s * 12, FIRE[0]); disc(b, C, C, 6 + s * 9, FIRE[1]); disc(b, C, C, Math.max(0, 9 - s * 9), FIRE[2]); disc(b, C, C, Math.max(0, 5 - s * 6), FIRE[3])
        sparks(b, C, C, 14 + s * 12, 14, FIRE[3], f)
      }
    }),
    electric: frames((b, f, t) => {
      const rand = P.rng(f * 7 + 3)
      const on = f % 2 === 0 || t > 0.7
      let x = C + (rand() - 0.5) * 6, y = 0
      const pts = [[x, y]]
      while (y < C) { y += 5 + rand() * 4; x += (rand() - 0.5) * 12; pts.push([x, Math.min(y, C)]) }
      pts.forEach((p, i) => { if (i) { line(b, pts[i - 1][0], pts[i - 1][1], p[0], p[1], on ? ELEC[0] : ELEC[1], 1.6); line(b, pts[i - 1][0], pts[i - 1][1], p[0], p[1], on ? ELEC[2] : ELEC[3], 0.5) } })
      if (t > 0.4) { burst(b, C, C, 10 + t * 10, [ELEC[2], ELEC[1], WHITE], 10); sparks(b, C, C, 18, 10, ELEC[3], f + 9) }
    }),
    ghost: frames((b, f, t) => {
      const show = t < 0.75 ? Math.min(1, t * 2.5) : 1 - (t - 0.75) / 0.25
      const cy = C - 2 + Math.sin(t * Math.PI * 2) * 2 - t * 6
      const ghost = new P.Buf(S, S)
      disc(ghost, C, cy - 4, 11, GHOST[2])
      for (let x = C - 11; x <= C + 11; x++) for (let y = cy - 4; y <= cy + 8 + ((x + f) % 6 < 3 ? 2 : 0); y++) ghost.pset(x, y, GHOST[2])
      disc(ghost, C - 4, cy - 7, 4, GHOST[3])
      disc(ghost, C - 4, cy - 4, 2.4, INK); disc(ghost, C + 4, cy - 4, 2.4, INK)
      ghost.pset(C - 5, cy - 5, WHITE); ghost.pset(C + 3, cy - 5, WHITE)
      disc(ghost, C, cy + 2, 2, GHOST[0])
      const o = outlined(ghost)
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (o.get(x, y) && P.bt(x, y) < show) b.pset(x, y, o.get(x, y))
    }),
    steel: frames((b, f, t) => {
      const swing = t < 0.55 ? ease(t / 0.55) : 1
      const angle = lerp(-0.7, -2.36, swing)
      const px = C + 18, py = C + 18
      const hx = px + Math.cos(angle) * 24, hy = py + Math.sin(angle) * 24
      const head = new P.Buf(S, S)
      line(head, px, py, hx, hy, WOOD[1], 1)
      const nx = -Math.sin(angle), ny = Math.cos(angle)
      poly(head, [[hx - nx * 8 - Math.cos(angle) * 3, hy - ny * 8 - Math.sin(angle) * 3], [hx + nx * 8 - Math.cos(angle) * 3, hy + ny * 8 - Math.sin(angle) * 3], [hx + nx * 8 + Math.cos(angle) * 5, hy + ny * 8 + Math.sin(angle) * 5], [hx - nx * 8 + Math.cos(angle) * 5, hy - ny * 8 + Math.sin(angle) * 5]], STEEL[1])
      line(head, hx - nx * 6, hy - ny * 6, hx + nx * 6, hy + ny * 6, STEEL[2], 0)
      const o = outlined(head)
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (o.get(x, y)) b.pset(x, y, o.get(x, y))
      if (t >= 0.55) { const s = (t - 0.55) / 0.45; burst(b, C - 2, C - 2, 8 + s * 12, [STEEL[3], rgb(255, 230, 120)], 8) }
    }),
    fighting: frames((b, f, t) => {
      const s = t < 0.55 ? ease(t / 0.55) : 1
      const [x, y] = [lerp(START[0] + 6, C, s), lerp(START[1] - 6, C, s)]
      const r = lerp(6, 12, s)
      const fist = new P.Buf(S, S)
      disc(fist, x, y, r, SKIN[1])
      for (let k = 0; k < 4; k++) disc(fist, x - r * 0.55 + k * r * 0.36, y - r * 0.55, r * 0.32, SKIN[2])
      disc(fist, x - r * 0.7, y + r * 0.2, r * 0.38, SKIN[0])
      for (let k = 1; k < 4; k++) line(fist, x - r * 0.55 + k * r * 0.36 - r * 0.18, y - r * 0.85, x - r * 0.55 + k * r * 0.36 - r * 0.18, y - r * 0.3, SKIN[0], 0)
      line(fist, x - r * 0.3, y + r * 0.1, x + r * 0.6, y + r * 0.1, SKIN[0], 0)
      const o = outlined(fist)
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if (o.get(xx, yy)) b.pset(xx, yy, o.get(xx, yy))
      if (t >= 0.55) { const k = (t - 0.55) / 0.45; burst(b, C, C, 14 + k * 12, [WHITE, rgb(255, 220, 90)], 10) }
    }),
    normal: frames((b, f, t) => {
      const r = 6 + t * 22
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3
        for (let k = 0; k < 8; k++) { const d = r * (0.55 + k * 0.06), a2 = a + k * 0.05; b.pset(Math.round(C + Math.cos(a2) * d), Math.round(C + Math.sin(a2) * d), t < 0.7 ? WHITE : rgb(220, 220, 230)) }
      }
      if (t < 0.4) { disc(b, C, C, 6 - t * 10, WHITE); disc(b, C, C, 3, rgb(255, 240, 160)) }
    }),
    grass: frames((b, f, t) => {
      for (let k = 0; k < 4; k++) {
        const lt = Math.min(1, Math.max(0, t * 1.4 - k * 0.12))
        if (lt <= 0) continue
        const [x0, y0] = [START[0] + k * 2, START[1] - k * 6]
        const x = lerp(x0, C + (k - 1.5) * 4, ease(lt)), y = lerp(y0, C + (k % 2 ? 3 : -3), ease(lt))
        const a = f * 0.9 + k
        const leaf = new P.Buf(S, S)
        for (let i = -8; i <= 8; i++) for (let j = -4; j <= 4; j++) if ((i / 8) ** 2 + (j / 3.6) ** 2 <= 1) leaf.pset(Math.round(x + Math.cos(a) * i - Math.sin(a) * j), Math.round(y + Math.sin(a) * i + Math.cos(a) * j), j < 0 ? LEAF[2] : LEAF[1])
        line(leaf, x - Math.cos(a) * 6, y - Math.sin(a) * 6, x + Math.cos(a) * 6, y + Math.sin(a) * 6, LEAF[0], 0)
        const o = outlined(leaf)
        for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if (o.get(xx, yy)) b.pset(xx, yy, o.get(xx, yy))
      }
    }),
    ice: frames((b, f, t) => {
      const reach = Math.min(1, t * 1.8)
      line(b, START[0], START[1], lerp(START[0], C, reach), lerp(START[1], C, reach), ICE[1], 2.2)
      line(b, START[0], START[1], lerp(START[0], C, reach), lerp(START[1], C, reach), ICE[3], 0.6)
      if (t > 0.5) {
        const s = (t - 0.5) / 0.5
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.4, d = 10 + (i % 2) * 4, len = 4 + s * 6
          const cx = C + Math.cos(a) * d * 0.6, cy = C + Math.sin(a) * d * 0.6
          const crystal = new P.Buf(S, S)
          poly(crystal, [[cx + Math.cos(a) * len, cy + Math.sin(a) * len], [cx + Math.cos(a + 1.6) * 2.5, cy + Math.sin(a + 1.6) * 2.5], [cx - Math.cos(a) * 2, cy - Math.sin(a) * 2], [cx + Math.cos(a - 1.6) * 2.5, cy + Math.sin(a - 1.6) * 2.5]], i % 2 ? ICE[2] : ICE[1])
          const o = outlined(crystal)
          for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if (o.get(xx, yy)) b.pset(xx, yy, o.get(xx, yy))
        }
        sparks(b, C, C, 20, 8, WHITE, f)
      }
    }),
    poison: frames((b, f, t) => {
      const rand = P.rng(11)
      for (let i = 0; i < 9; i++) {
        const x0 = C + (rand() - 0.5) * 34, delay = rand() * 0.4, size = 2.5 + rand() * 3
        const lt = (t - delay) / 0.6
        if (lt < 0 || lt > 1.15) continue
        const y = C + 22 - lt * 36
        if (lt > 0.95) { ring(b, x0, y, size, size + 1.2, POISON[3]); sparks(b, x0, y, size + 3, 5, POISON[2], i); continue }
        disc(b, x0, y, size + 1, INK); disc(b, x0, y, size, POISON[1]); disc(b, x0 - size * 0.35, y - size * 0.35, size * 0.4, POISON[3])
      }
    }),
    ground: frames((b, f, t) => {
      const rise = t < 0.6 ? ease(t / 0.6) : 1 - (t - 0.6) / 0.4 * 0.6
      const base = C + 20
      for (const [dx, h, w] of [[-12, 18, 5], [0, 26, 6], [12, 16, 5], [-20, 10, 4], [20, 11, 4]]) {
        const spike = new P.Buf(S, S)
        poly(spike, [[C + dx - w, base], [C + dx + w, base], [C + dx + 1, base - h * rise], [C + dx - 1, base - h * rise]], EARTH[1])
        line(spike, C + dx - w + 1, base - 1, C + dx, base - h * rise + 1, EARTH[2], 0)
        const o = outlined(spike)
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (o.get(x, y)) b.pset(x, y, o.get(x, y))
      }
      sparks(b, C, base - 4, 22 * rise + 4, 16, EARTH[3], f)
    }),
    flying: frames((b, f, t) => {
      for (let k = 0; k < 3; k++) {
        const lt = Math.min(1, Math.max(0, t * 1.5 - k * 0.2))
        if (lt <= 0 || lt >= 1) continue
        const cx = lerp(-10, S + 10, lt), cy = C - 10 + k * 10
        ring(b, cx, cy + 16, 13, 17, WIND[k % 2 ? 1 : 2], (x, y) => y < cy + 10 && x > cx - 14)
        ring(b, cx, cy + 16, 12, 13, WIND[0], (x, y) => y < cy + 10 && x > cx - 14)
        ring(b, cx - 6, cy + 22, 12, 13.5, WIND[1], (x, y) => y < cy + 14 && x > cx - 16)
      }
    }),
    psychic: frames((b, f, t) => {
      for (let k = 0; k < 3; k++) {
        const r = ((t * 1.3 + k / 3) % 1) * 30
        if (r < 2) continue
        ring(b, C, C, r - 1.5, r, PSY[k % 3])
        ring(b, C, C, r - 2.5, r - 1.5, PSY[0], (x, y) => (x + y) % 2 === 0)
      }
      disc(b, C, C, 2 + Math.sin(t * Math.PI) * 2, PSY[2])
    }),
    bug: frames((b, f, t) => {
      const s = t < 0.5 ? ease(t / 0.5) : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
      const tip = [lerp(START[0] + 8, C, s), lerp(START[1] - 8, C, s)]
      const dir = Math.atan2(C - START[1], C - START[0])
      const back = [tip[0] - Math.cos(dir) * 22, tip[1] - Math.sin(dir) * 22]
      const nx = -Math.sin(dir), ny = Math.cos(dir)
      const sting = new P.Buf(S, S)
      poly(sting, [tip, [back[0] + nx * 4, back[1] + ny * 4], [back[0] - nx * 4, back[1] - ny * 4]], BUG[1])
      line(sting, tip[0], tip[1], back[0] + nx * 1.5, back[1] + ny * 1.5, BUG[2], 0)
      for (let k = 1; k < 3; k++) { const m = [lerp(back[0], tip[0], k * 0.25), lerp(back[1], tip[1], k * 0.25)]; line(sting, m[0] + nx * 3, m[1] + ny * 3, m[0] - nx * 3, m[1] - ny * 3, BUG[0], 0) }
      const o = outlined(sting)
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (o.get(x, y)) b.pset(x, y, o.get(x, y))
      if (t >= 0.5 && t < 0.85) burst(b, C, C, 10, [BUG[2], WHITE], 6)
    }),
    rock: frames((b, f, t) => {
      for (const [dx, delay, r] of [[-10, 0, 6], [8, 0.15, 7], [0, 0.3, 5], [14, 0.4, 4]]) {
        const lt = (t - delay) / 0.5
        if (lt < 0) continue
        const y = Math.min(C + 6, -8 + lt * lt * 50)
        const rock = new P.Buf(S, S)
        poly(rock, [[C + dx - r, y], [C + dx - r * 0.4, y - r], [C + dx + r * 0.7, y - r * 0.8], [C + dx + r, y + r * 0.2], [C + dx + r * 0.3, y + r], [C + dx - r * 0.8, y + r * 0.7]], ROCK[1])
        disc(rock, C + dx - r * 0.3, y - r * 0.3, r * 0.4, ROCK[2])
        const o = outlined(rock)
        for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if (o.get(xx, yy)) b.pset(xx, yy, o.get(xx, yy))
        if (y >= C + 6) sparks(b, C + dx, C + 10, 8, 6, ROCK[3], f + dx)
      }
    }),
    dragon: frames((b, f, t) => {
      const grow = Math.min(1, t * 2), fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dy = (C + 22 - y) / 48
        if (dy < 0 || dy > grow) continue
        const half = 20 * (1 - dy) ** 0.6 * fade
        const wob = (P.noise(x * 0.18, y * 0.18 + f * 1.3, 5) - 0.5) * 10
        const dx = Math.abs(x + 0.5 - C + wob * dy)
        if (dx > half) continue
        const k = dx / half
        b.pset(x, y, k > 0.75 ? DRAGON[0] : k > 0.45 ? DRAGON[1] : dy > 0.5 ? DRAGON[3] : DRAGON[2])
      }
    }),
    dark: frames((b, f, t) => {
      const open = t < 0.5 ? 1 - t * 0.4 : Math.max(0, 1 - (t - 0.5) * 4)
      const show = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1
      if (show <= 0) return
      const gap = 4 + open * 12
      for (const side of [-1, 1]) {
        const jaw = new P.Buf(S, S)
        const cy = C + side * gap
        for (let x = C - 16; x <= C + 16; x++) for (let y = cy - 6; y <= cy + 6; y++) if (((x - C) / 16) ** 2 + ((y - cy) / 6) ** 2 <= 1 && (side < 0 ? y <= cy + 1 : y >= cy - 1)) jaw.pset(x, y, DARK[1])
        for (let k = -3; k <= 3; k++) poly(jaw, [[C + k * 4 - 2, cy - side * 1], [C + k * 4 + 2, cy - side * 1], [C + k * 4, cy - side * 6]], WHITE)
        const o = outlined(jaw)
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (o.get(x, y) && P.bt(x, y) < show) b.pset(x, y, o.get(x, y))
      }
      disc(b, C - 9, C - gap - 2, 1.5, DARK[3]); disc(b, C + 9, C - gap - 2, 1.5, DARK[3])
    }),
    fairy: frames((b, f, t) => {
      const trail = 14
      const pos = (u) => travel(Math.min(1, u))
      for (let k = trail; k >= 0; k--) {
        const u = t * 1.4 - k * 0.04
        if (u < 0 || u > 1) continue
        const [x, y] = pos(u)
        if (k === 0) {
          const star = new P.Buf(S, S)
          const pts = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 2.6 : 6.5, a = -Math.PI / 2 + (i * Math.PI) / 5 + f * 0.3; return [x + Math.cos(a) * r, y + Math.sin(a) * r] })
          poly(star, pts, FAIRY[1]); disc(star, x, y, 1.5, WHITE)
          const o = outlined(star)
          for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if (o.get(xx, yy)) b.pset(xx, yy, o.get(xx, yy))
        } else if ((k + f) % 2 === 0) b.pset(Math.round(x + (k % 3) - 1), Math.round(y + ((k * 7) % 3) - 1), FAIRY[k % 3 === 0 ? 3 : 2])
      }
      if (t > 0.7) { const s = (t - 0.7) / 0.3; sparks(b, C, C, 8 + s * 14, 14, FAIRY[3], f); sparks(b, C, C, 6 + s * 10, 10, FAIRY[1], f + 3) }
    })
  }
  return { ATTACKS, N }
})()

fs.mkdirSync(path.join(OUT, 'attacks'), { recursive: true })
for (const [type, sheet] of Object.entries(ATTACK_ART.ATTACKS)) P.save(P.pack(sheet, { cols: ATTACK_ART.N }), path.join(OUT, 'attacks', `${type}.png`))


const CATEGORY_ART = (() => {
  const W = 32
  const H = 14

  function badge(border, fill, mark) {
    const b = new P.Buf(W, H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1
        const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 1)
        if (corner) continue
        b.pset(x, y, edge ? border : fill)
      }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (mark(x + 0.5 - W / 2, y + 0.5 - H / 2)) b.pset(x, y, mark.color)
    return b
  }

  const ringMark = Object.assign((u, v) => {
    const d = Math.hypot(u / 2.2, v)
    return d < 1 || (d > 2 && d < 3) || (d > 4 && d < 5)
  }, { color: P.rgb(184, 216, 236) })

  const STAR = [[0, -5.6], [1.6, -2.2], [7, -4.2], [3.6, -1.1], [11, 0], [3.6, 1.1], [7, 4.2], [1.6, 2.2], [0, 5.6], [-1.6, 2.2], [-7, 4.2], [-3.6, 1.1], [-11, 0], [-3.6, -1.1], [-7, -4.2], [-1.6, -2.2]]
  const inside = (u, v, pts) => {
    let c = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
  const starMark = Object.assign((u, v) => inside(u, v, STAR), { color: P.rgb(248, 208, 0) })

  const CATEGORY = {
    special: badge(P.rgb(4, 26, 110), P.rgb(28, 74, 186), ringMark),
    physical: badge(P.rgb(212, 68, 30), P.rgb(255, 110, 0), starMark)
  }
  return CATEGORY
})()

fs.mkdirSync(path.join(OUT, 'category'), { recursive: true })
for (const [category, sprite] of Object.entries(CATEGORY_ART)) P.save(sprite, path.join(OUT, 'category', `${category}.png`))


const BIOME_ART = (() => {
  const T = 16
  const wrap = (v) => ((v % T) + T) % T
  const tileNoise = (x, y, f, s) => {
    const a = (wrap(x) / T) * Math.PI * 2, b = (wrap(y) / T) * Math.PI * 2
    return P.fbm(Math.cos(a) * f + 10, Math.sin(a) * f + Math.cos(b) * f + 20, 2, s + Math.round(Math.sin(b) * 3))
  }
  const N = 1, E = 2, S = 4, W = 8
  const CORNER = 7
  function maskOf(open, wobble = 5, seed = 21) {
    return (x, y) => {
      const fx = Math.min(open & W ? x + 0.5 : Infinity, open & E ? T - 0.5 - x : Infinity)
      const fy = Math.min(open & N ? y + 0.5 : Infinity, open & S ? T - 0.5 - y : Infinity)
      const d = fx < CORNER && fy < CORNER ? CORNER - Math.hypot(CORNER - fx, CORNER - fy) : Math.min(fx, fy)
      const along = fx < fy ? y : x
      return d - (2 + (tileNoise(along, along * 0.5, 2.2, seed) - 0.5) * wobble)
    }
  }
  const rgb = P.rgb
  const ramp = (hue, sat, lo, hi, n = 5, shift = 25) => P.hueRamp(n, { hue, sat, light: [lo, hi], shift })

  function textured(cols, f = 1.1, seed = 9, base = 0.55, amp = 0.7) {
    const b = new P.Buf(T, T)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const v = base + (tileNoise(x, y, f, seed) - 0.5) * amp
        b.pset(x, y, cols[P.band(v, cols.length, x, y)])
      }
    return b
  }
  const copy = (src) => { const b = new P.Buf(T, T); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) b.pset(x, y, src.get(x, y)); return b }
  const speckle = (b, count, cols, seed) => { const r = P.rng(seed); for (let i = 0; i < count; i++) b.pset(Math.floor(r() * T), Math.floor(r() * T), cols[Math.floor(r() * cols.length)]) }

  function blobSheet(ground, fill, edge, decorate) {
    return Array.from({ length: 16 }, (_, neighbors) => {
      const b = copy(ground)
      const inside = maskOf(~neighbors & 15)
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const d = inside(x, y)
          if (d <= 0) continue
          b.pset(x, y, d < 1 ? edge : fill(x, y, d))
        }
      if (decorate) decorate(b, inside)
      return b
    })
  }
  const objectSheet = (ground, draw) => Array.from({ length: 16 }, () => { const b = copy(ground); draw(b); return b })

  const BIOMES = {
    fire: () => {
      const rockC = ramp(15, 0.25, 0.1, 0.32, 4, 15)
      const lava = [rgb(150, 30, 10), rgb(220, 70, 10), rgb(255, 140, 20), rgb(255, 210, 80), rgb(255, 245, 180)]
      const ground = textured(rockC, 1.3, 31)
      for (let i = 0; i < 3; i++) { const r = P.rng(40 + i); let x = Math.floor(r() * T), y = Math.floor(r() * T); for (let k = 0; k < 6; k++) { ground.pset(wrap(x), wrap(y), k % 2 ? lava[1] : lava[2]); x += r() < 0.5 ? 1 : 0; y += r() < 0.5 ? 1 : -1 } }
      const ash = ramp(30, 0.3, 0.22, 0.4, 3)
      const dry = [rgb(110, 70, 30), rgb(160, 110, 40), rgb(205, 160, 70), rgb(235, 200, 110)]
      const encounter = blobSheet(ground, (x, y) => ash[P.band(0.5 + (tileNoise(x, y, 1.6, 5) - 0.5) * 0.6, 3, x, y)], rockC[0], (b, inside) => {
        for (const [cx, by] of [[3, 6], [11, 6], [7, 14], [15, 13]]) for (const [dx, h] of [[-2, 2], [-1, 3], [0, 4], [1, 3], [2, 2]]) for (let k = 0; k < h; k++) { const x = wrap(cx + dx + (k === h - 1 && dx ? Math.sign(dx) : 0)), y = by - k; if (inside(x, y) > 1) b.pset(x, y, dry[Math.min(3, k)]) }
      })
      const obstacle = blobSheet(ground, (x, y, d) => (d < 1.6 ? lava[0] : lava[1 + P.band(0.45 + (tileNoise(x, y, 1.7, 7) - 0.5) * 0.9, 3, x, y)]), rgb(60, 20, 10))
      return { ground, encounter, obstacle }
    },
    water: () => {
      const sea = ramp(205, 0.45, 0.28, 0.5, 4, 15)
      const ground = textured(sea, 1, 12)
      speckle(ground, 6, [rgb(140, 190, 210), rgb(60, 110, 150)], 3)
      const algae = [rgb(20, 80, 60), rgb(30, 120, 80), rgb(60, 170, 100), rgb(140, 220, 140)]
      const encounter = blobSheet(ground, (x, y) => sea[0], rgb(20, 50, 70), (b, inside) => {
        for (const sx of [2, 6, 10, 14]) { let x = sx; for (let y = 15; y > 1; y--) { if (inside(wrap(x), y) > 0.5) { b.pset(wrap(x), y, algae[y < 6 ? 3 : y < 10 ? 2 : 1]); b.pset(wrap(x + 1), y, algae[0]) } if (y % 3 === 0) x += (sx + y) % 2 ? 1 : -1 } }
      })
      const reef = ramp(220, 0.2, 0.14, 0.38, 4, 15)
      const obstacle = blobSheet(ground, (x, y, d) => reef[P.band(0.3 + d * 0.1 + (tileNoise(x, y, 2, 8) - 0.5) * 0.4, 4, x, y)], rgb(14, 22, 40), (b, inside) => {
        const r = P.rng(5)
        for (let i = 0; i < 5; i++) { const x = Math.floor(r() * T), y = Math.floor(r() * T); if (inside(x, y) > 2) { b.pset(x, y, rgb(240, 110, 150)); b.pset(wrap(x + 1), y, rgb(255, 170, 190)); b.pset(x, wrap(y - 1), rgb(240, 110, 150)) } }
      })
      return { ground, encounter, obstacle }
    },
    electric: () => {
      const metal = [rgb(70, 76, 90), rgb(96, 104, 118), rgb(122, 130, 144), rgb(150, 158, 170)]
      const ground = new P.Buf(T, T)
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) ground.pset(x, y, x % 8 === 0 || y % 8 === 0 ? metal[0] : (x + y) % 9 === 0 ? metal[3] : metal[2])
      for (const [x, y] of [[2, 2], [10, 2], [2, 10], [10, 10]]) ground.pset(x, y, metal[1])
      const encounter = blobSheet(ground, (x, y) => ((x + y) % 4 < 2 ? rgb(240, 200, 30) : rgb(40, 40, 46)), rgb(30, 30, 36), (b, inside) => {
        for (const [x, y] of [[5, 5], [11, 9], [4, 12]]) if (inside(x, y) > 1) { b.pset(x, y, rgb(255, 255, 220)); b.pset(x + 1, y - 1, rgb(140, 210, 255)); b.pset(x - 1, y + 1, rgb(140, 210, 255)) }
      })
      const obstacle = objectSheet(ground, (b) => {
        b.rect(1, 2, 15, 15, rgb(60, 66, 80))
        b.rect(2, 3, 14, 13, rgb(110, 118, 134))
        for (let x = 2; x < 14; x++) b.pset(x, 12, (x >> 1) % 2 ? rgb(240, 200, 30) : rgb(30, 30, 36))
        b.rect(4, 5, 12, 9, rgb(40, 46, 60))
        b.rect(5, 6, 8, 8, rgb(110, 220, 120))
        b.pset(10, 6, rgb(255, 80, 60)); b.pset(10, 7, rgb(255, 210, 60))
        for (let x = 1; x < 15; x++) b.pset(x, 15, rgb(30, 30, 36))
      })
      return { ground, encounter, obstacle }
    },
    grass: () => {
      const soil = ramp(80, 0.3, 0.16, 0.32, 4, 20)
      const ground = textured(soil, 1.2, 14)
      speckle(ground, 5, [rgb(120, 90, 50), rgb(60, 90, 40)], 7)
      const bush = ramp(125, 0.5, 0.12, 0.5, 5, 30)
      const encounter = blobSheet(ground, (x, y) => bush[1], soil[0], (b, inside) => {
        for (const [cx, cy, r] of [[4, 4, 3.4], [12, 4, 3.4], [8, 9, 3.6], [4, 13, 3.2], [12, 13, 3.2]])
          for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy)
            if (d > r || inside(wrap(x), wrap(y)) < 0.5) continue
            b.pset(wrap(x), wrap(y), bush[Math.max(1, Math.min(4, Math.round(3 - dy * 0.5 - dx * 0.2 - d * 0.3)))])
          }
      })
      const crown = ramp(140, 0.45, 0.06, 0.36, 6, 30)
      const bark = ramp(25, 0.35, 0.12, 0.36, 4)
      const obstacle = objectSheet(ground, (b) => P.tree(b, { x: 8, base: 15, h: 10, rx: 6, ry: 5.2, trunk: 1.6, clumps: 26, clumpR: [2.4, 3.8], cols: crown, bark, seed: 9, branches: false, leaf: 0.95 }))
      return { ground, encounter, obstacle }
    },
    ice: () => {
      const snow = [rgb(190, 214, 236), rgb(214, 232, 246), rgb(232, 244, 252), rgb(248, 252, 255)]
      const ground = textured(snow, 1, 18, 0.6, 0.5)
      const drift = [rgb(150, 186, 222), rgb(206, 228, 246), rgb(240, 248, 255), rgb(255, 255, 255)]
      const encounter = blobSheet(ground, (x, y, d) => drift[Math.min(3, Math.floor(1 + d * 0.45 - (y % 8) * 0.12 + 0.6))], drift[0], (b, inside) => speckle(b, 0, drift, 1))
      const ice = [rgb(60, 130, 190), rgb(100, 180, 225), rgb(160, 220, 245), rgb(225, 248, 255)]
      const obstacle = blobSheet(ground, (x, y, d) => {
        const facet = ((x * 3 + y * 5) >> 3) % 3
        return d < 2 ? ice[1] : ice[[2, 1, 3][facet]]
      }, ice[0], (b, inside) => { for (let k = 0; k < 4; k++) if (inside(4 + k, 4 - (k >> 1)) > 2) b.pset(4 + k, 4 - (k >> 1), rgb(255, 255, 255)) })
      return { ground, encounter, obstacle }
    },
    fighting: () => {
      const floor = [rgb(54, 56, 64), rgb(66, 68, 78), rgb(80, 82, 94)]
      const ground = new P.Buf(T, T)
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) ground.pset(x, y, x % 8 === 7 || y % 8 === 7 ? floor[0] : (x * 7 + y * 3) % 11 === 0 ? floor[2] : floor[1])
      const mat = [rgb(150, 20, 30), rgb(200, 40, 45), rgb(230, 80, 80)]
      const encounter = Array.from({ length: 16 }, (_, n) => {
        const b = copy(ground)
        const x0 = n & W ? 0 : 1, x1 = n & E ? T : T - 1, y0 = n & N ? 0 : 1, y1 = n & S ? T : T - 1
        b.rect(x0, y0, x1, y1, mat[1])
        for (let x = x0; x < x1; x++) { if (!(n & N)) b.pset(x, y0, mat[2]); if (!(n & S)) b.pset(x, y1 - 1, mat[0]) }
        for (let y = y0; y < y1; y++) { if (!(n & W)) b.pset(x0, y, mat[2]); if (!(n & E)) b.pset(x1 - 1, y, mat[0]) }
        for (let x = x0 + 2; x < x1 - 2; x++) if (!(n & N)) b.pset(x, y0 + 2, rgb(245, 240, 235))
        return b
      })
      const obstacle = objectSheet(ground, (b) => {
        b.rect(2, 9, 14, 11, rgb(120, 124, 134))
        for (const x of [1, 12]) { b.rect(x, 5, x + 3, 15, rgb(24, 24, 28)); b.rect(x, 6, x + 1, 14, rgb(70, 70, 80)) }
        b.rect(3, 10, 13, 11, rgb(190, 194, 204))
        b.rect(6, 1, 10, 4, rgb(200, 40, 45))
        b.pset(7, 2, rgb(240, 110, 110))
      })
      return { ground, encounter, obstacle }
    },
    poison: () => {
      const mud = ramp(75, 0.25, 0.14, 0.3, 4, 20)
      const ground = textured(mud, 1.3, 22)
      const sludge = [rgb(70, 20, 90), rgb(110, 40, 140), rgb(150, 70, 190), rgb(200, 130, 235)]
      const encounter = blobSheet(ground, (x, y) => sludge[P.band(0.45 + (tileNoise(x, y, 1.8, 3) - 0.5) * 0.7, 3, x, y) + 1], sludge[0], (b, inside) => {
        for (const [x, y] of [[4, 4], [11, 7], [6, 12], [13, 13]]) if (inside(x, y) > 1.5) { b.pset(x, y, sludge[3]); b.pset(x + 1, y, rgb(240, 200, 255)); b.pset(x, y + 1, sludge[2]) }
      })
      const wood = [rgb(50, 46, 44), rgb(84, 78, 74), rgb(120, 112, 104)]
      const obstacle = objectSheet(ground, (b) => {
        for (let y = 4; y < 16; y++) { b.pset(7, y, wood[1]); b.pset(8, y, wood[y % 3 ? 2 : 1]); b.pset(9, y, wood[0]) }
        const branch = (pts) => pts.forEach(([x, y], i) => b.pset(x, y, wood[i % 2 ? 1 : 2]))
        branch([[6, 7], [5, 6], [4, 5], [3, 3], [3, 2]])
        branch([[10, 6], [11, 5], [12, 4], [13, 3], [12, 2]])
        branch([[8, 3], [8, 2], [9, 1]])
        for (let x = 4; x < 13; x++) b.pset(x, 15, wood[0])
      })
      return { ground, encounter, obstacle }
    },
    ground: () => {
      const sand = [rgb(170, 100, 60), rgb(196, 124, 76), rgb(214, 148, 96), rgb(232, 176, 124)]
      const ground = textured(sand, 1.1, 26)
      const soft = [rgb(200, 140, 90), rgb(225, 170, 115), rgb(240, 196, 140)]
      const encounter = blobSheet(ground, (x, y) => soft[P.band(0.55 + (tileNoise(x, y, 2, 6) - 0.5) * 0.6, 3, x, y)], sand[0], (b, inside) => {
        for (const pts of [[[3, 4], [4, 5], [5, 5], [6, 6]], [[10, 10], [11, 9], [12, 9], [13, 8]]]) for (const [x, y] of pts) if (inside(x, y) > 1) b.pset(x, y, rgb(150, 90, 55))
      })
      const cliff = [rgb(110, 50, 34), rgb(150, 74, 46), rgb(186, 100, 62), rgb(214, 130, 84)]
      const obstacle = blobSheet(ground, (x, y, d) => cliff[Math.min(3, (y >> 2) % 2 ? 1 + (d > 3 ? 1 : 0) : 2 + (d > 4 ? 1 : 0))], cliff[0], (b, inside) => { for (let x = 0; x < T; x++) for (const y of [4, 8, 12]) if (inside(x, y) > 1.5) b.pset(x, y, cliff[0]) })
      return { ground, encounter, obstacle }
    },
    rock: () => {
      const gravel = [rgb(104, 100, 96), rgb(128, 124, 118), rgb(152, 148, 140), rgb(178, 174, 166)]
      const ground = textured(gravel, 1.6, 33, 0.5, 0.9)
      const pebble = [rgb(80, 76, 72), rgb(140, 134, 126), rgb(196, 190, 180)]
      const encounter = blobSheet(ground, (x, y) => (tileNoise(x, y, 2.4, 2) > 0.5 ? rgb(84, 80, 76) : rgb(96, 92, 88)), rgb(64, 60, 58), (b, inside) => {
        const r = P.rng(19)
        for (let i = 0; i < 22; i++) { const x = Math.floor(r() * 15), y = Math.floor(r() * 15); if (inside(x, y) > 1) { b.pset(x, y, pebble[2]); b.pset(x + 1, y, rgb(220, 214, 204)); b.pset(x, y + 1, pebble[1]) } }
      })
      const stone = [rgb(56, 54, 58), rgb(86, 84, 90), rgb(118, 116, 122), rgb(156, 154, 160)]
      const obstacle = objectSheet(ground, (b) => {
        for (let y = 2; y < 16; y++) for (let x = 1; x < 15; x++) {
          const nx = (x + 0.5 - 8) / 7, ny = (y + 0.5 - 9.5) / 6.5
          const d = nx * nx + ny * ny + (tileNoise(x, y, 2, 4) - 0.5) * 0.3
          if (d > 1) continue
          b.pset(x, y, d > 0.82 ? stone[0] : stone[Math.max(1, Math.min(3, Math.round(2.6 - ny * 1.2 - nx * 0.6)))])
        }
        b.pset(5, 5, rgb(200, 198, 204)); b.pset(6, 5, rgb(200, 198, 204))
      })
      return { ground, encounter, obstacle }
    }
  }

  const disc = (b, cx, cy, r, c) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && y >= 0 && x < T && y < T && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) b.pset(x, y, c)
  }

  Object.assign(BIOMES, {
    flying: () => {
      const sky = [rgb(120, 170, 230), rgb(146, 190, 240), rgb(170, 206, 246), rgb(196, 222, 250)]
      const ground = textured(sky, 0.9, 41, 0.55, 0.6)
      for (const [x, y, w] of [[2, 4, 5], [9, 11, 4]]) for (let k = 0; k < w; k++) ground.pset(x + k, y, rgb(230, 242, 255))
      const puff = [rgb(176, 196, 224), rgb(224, 234, 248), rgb(248, 252, 255)]
      const encounter = blobSheet(ground, (x, y, d) => puff[d > 2.5 ? 2 : 1], puff[0], (b, inside) => {
        for (let x = 0; x < T; x++) for (const y of [7, 15]) if (inside(x, y) > 0.5 && inside(x, y) < 2.5) b.pset(x, y, puff[0])
      })
      const storm = [rgb(70, 84, 112), rgb(104, 118, 146), rgb(140, 152, 178), rgb(176, 186, 206)]
      const obstacle = blobSheet(ground, (x, y, d) => storm[P.band(0.35 + d * 0.06 - (y % 8) * 0.03 + (tileNoise(x, y, 1.6, 3) - 0.5) * 0.4, 4, x, y)], storm[0])
      return { ground, encounter, obstacle }
    },
    psychic: () => {
      const stone = [rgb(84, 70, 104), rgb(104, 90, 126), rgb(124, 110, 146), rgb(146, 132, 166)]
      const ground = new P.Buf(T, T)
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) ground.pset(x, y, x % 8 === 0 || y % 8 === 0 ? stone[0] : stone[1 + P.band(0.5 + (tileNoise(x, y, 1.2, 44) - 0.5) * 0.6, 3, x, y)])
      const rune = [rgb(60, 30, 80), rgb(230, 90, 190), rgb(255, 170, 230)]
      const encounter = blobSheet(ground, () => rune[0], stone[0], (b, inside) => {
        for (const [cx, cy] of [[8, 8], [0, 0], [16, 0], [0, 16], [16, 16]])
          for (let y = 0; y < T; y++)
            for (let x = 0; x < T; x++) {
              const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
              if (inside(x, y) > 0.5 && (Math.abs(d - 5) < 0.6 || Math.abs(d - 2.5) < 0.5)) b.pset(x, y, d < 3.5 ? rune[2] : rune[1])
            }
      })
      const pillar = [rgb(150, 140, 170), rgb(190, 182, 206), rgb(224, 218, 236)]
      const obstacle = objectSheet(ground, (b) => {
        b.rect(3, 1, 13, 4, pillar[1])
        b.rect(3, 1, 13, 2, pillar[2])
        b.rect(5, 4, 11, 14, pillar[1])
        for (let y = 4; y < 14; y++) (b.pset(5, y, pillar[2]), b.pset(8, y, pillar[0]), b.pset(10, y, pillar[0]))
        b.rect(3, 14, 13, 16, pillar[0])
        b.pset(7, 2, rgb(230, 90, 190))
        b.pset(8, 2, rgb(255, 170, 230))
      })
      return { ground, encounter, obstacle }
    },
    bug: () => {
      const moss = ramp(95, 0.35, 0.16, 0.32, 4, 20)
      const ground = textured(moss, 1.3, 52)
      speckle(ground, 6, [rgb(110, 80, 40), rgb(140, 170, 60)], 9)
      const fern = [rgb(40, 90, 20), rgb(80, 140, 30), rgb(140, 190, 50), rgb(200, 220, 90)]
      const encounter = blobSheet(ground, () => fern[0], moss[0], (b, inside) => {
        for (const [cx, cy, a] of [[4, 5, -0.6], [11, 4, 0.5], [7, 11, -0.2], [13, 12, 0.7], [2, 13, 0.3]])
          for (let k = -4; k <= 4; k++) {
            const x = Math.round(cx + Math.sin(a) * k), y = Math.round(cy + Math.cos(a) * k)
            for (const side of [-1, 1]) {
              const lx = x + side * (1 + ((k + 5) % 3 === 0 ? 1 : 0))
              if (inside(wrap(lx), wrap(y)) > 0.5) b.pset(wrap(lx), wrap(y), fern[k < 0 ? 3 : 2])
            }
            if (inside(wrap(x), wrap(y)) > 0.5) b.pset(wrap(x), wrap(y), fern[1])
          }
      })
      const cap = [rgb(140, 20, 30), rgb(200, 40, 40), rgb(240, 90, 70)]
      const obstacle = objectSheet(ground, (b) => {
        b.rect(6, 8, 10, 16, rgb(226, 216, 190))
        for (let y = 8; y < 16; y++) b.pset(9, y, rgb(186, 172, 140))
        for (let y = 1; y < 10; y++)
          for (let x = 0; x < T; x++) {
            const nx = (x + 0.5 - 8) / 7.5, ny = (y + 0.5 - 8.5) / 7
            if (ny > 0.15 || nx * nx + ny * ny > 1) continue
            b.pset(x, y, cap[Math.max(0, Math.min(2, Math.round(1.6 - ny * 1.2 - nx * 0.6)))])
          }
        for (const [x, y] of [[4, 6], [8, 3], [11, 6], [6, 4]]) (b.pset(x, y, rgb(250, 246, 236)), b.pset(x + 1, y, rgb(250, 246, 236)))
      })
      return { ground, encounter, obstacle }
    },
    ghost: () => {
      const turf = ramp(170, 0.18, 0.12, 0.24, 4, 15)
      const ground = textured(turf, 1.2, 61)
      const fog = [rgb(70, 50, 100), rgb(110, 84, 150), rgb(150, 124, 190)]
      const encounter = blobSheet(ground, (x, y) => (P.bt(x, y) < 0.35 ? ground.get(x, y) : fog[P.band(0.5 + (tileNoise(x, y, 1.5, 8) - 0.5) * 0.8, 3, x, y)]), fog[0])
      const grave = [rgb(70, 72, 82), rgb(110, 112, 124), rgb(150, 152, 164)]
      const obstacle = objectSheet(ground, (b) => {
        for (let y = 3; y < 15; y++)
          for (let x = 3; x < 13; x++) {
            if (y < 6 && Math.hypot(x + 0.5 - 8, y + 0.5 - 6) > 5) continue
            b.pset(x, y, x < 5 ? grave[2] : x > 11 ? grave[0] : grave[1])
          }
        b.rect(7, 6, 9, 12, grave[0])
        b.rect(5, 8, 11, 9, grave[0])
        b.rect(2, 14, 14, 16, rgb(46, 40, 34))
      })
      return { ground, encounter, obstacle }
    },
    dragon: () => {
      const ruin = [rgb(120, 110, 96), rgb(146, 134, 116), rgb(170, 158, 138), rgb(192, 182, 162)]
      const ground = new P.Buf(T, T)
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) ground.pset(x, y, y % 8 === 0 || x % 8 === ((y >> 3) % 2) * 4 ? ruin[0] : ruin[1 + P.band(0.5 + (tileNoise(x, y, 1.4, 71) - 0.5) * 0.7, 3, x, y)])
      const crystal = [rgb(60, 30, 110), rgb(110, 60, 190), rgb(160, 110, 240), rgb(220, 190, 255)]
      const encounter = blobSheet(ground, () => rgb(70, 60, 70), ruin[0], (b, inside) => {
        for (const [cx, base, h] of [[4, 7, 5], [10, 6, 6], [7, 14, 5], [13, 14, 4], [2, 15, 3]])
          for (let k = 0; k < h; k++) {
            const w = Math.max(0, Math.round((h - k) / 2))
            for (let dx = -w; dx <= w; dx++) {
              const x = wrap(cx + dx), y = base - k
              if (inside(x, y) > 0.5) b.pset(x, y, crystal[dx < 0 ? 3 : dx > 0 ? 1 : 2])
            }
          }
      })
      const pillar = [rgb(40, 34, 40), rgb(74, 64, 70), rgb(104, 92, 96), rgb(138, 124, 124)]
      const obstacle = objectSheet(ground, (b) => {
        b.rect(2, 13, 15, 16, rgb(90, 82, 70))
        b.rect(3, 4, 13, 15, pillar[0])
        b.rect(4, 5, 12, 15, pillar[2])
        for (let y = 5; y < 15; y++) {
          b.pset(4, y, pillar[3])
          b.pset(5, y, pillar[3])
          b.pset(11, y, pillar[1])
          if (y % 4 === 0) for (let x = 4; x < 12; x++) b.pset(x, y, pillar[1])
        }
        for (const [x, y] of [[4, 4], [6, 3], [7, 4], [9, 2], [10, 3], [11, 4]]) b.pset(x, y, pillar[0])
        for (const [x, y] of [[6, 4], [9, 3], [10, 4]]) b.pset(x, y, pillar[2])
        b.pset(7, 9, rgb(160, 110, 240))
        b.pset(8, 9, rgb(220, 190, 255))
      })
      return { ground, encounter, obstacle }
    },
    dark: () => {
      const asphalt = [rgb(30, 32, 44), rgb(40, 42, 56), rgb(50, 52, 68), rgb(62, 64, 80)]
      const ground = textured(asphalt, 1.4, 81, 0.5, 0.6)
      for (const [x, y] of [[3, 9], [4, 9], [5, 9], [11, 3], [12, 3]]) ground.pset(x, y, rgb(80, 90, 130))
      const shade = [rgb(14, 10, 22), rgb(24, 18, 36)]
      const encounter = blobSheet(ground, (x, y) => shade[(x + y) % 5 === 0 ? 1 : 0], asphalt[0], (b, inside) => {
        for (const [x, y] of [[5, 6], [11, 12]]) if (inside(x, y) > 2) (b.pset(x, y, rgb(250, 220, 60)), b.pset(x + 2, y, rgb(250, 220, 60)))
      })
      const brick = [rgb(56, 30, 34), rgb(82, 44, 48), rgb(104, 58, 60)]
      const obstacle = objectSheet(ground, (b) => {
        b.rect(0, 0, 16, 16, brick[1])
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (y % 4 === 3 || (x + ((y >> 2) % 2) * 4) % 8 === 0) b.pset(x, y, brick[0])
        b.rect(5, 4, 11, 10, rgb(250, 210, 90))
        b.rect(5, 4, 11, 5, rgb(255, 240, 170))
        b.rect(7, 4, 9, 10, brick[0])
        b.rect(5, 6, 11, 7, brick[0])
      })
      return { ground, encounter, obstacle }
    },
    steel: () => {
      const concrete = [rgb(110, 112, 116), rgb(128, 130, 134), rgb(146, 148, 152), rgb(164, 166, 170)]
      const ground = textured(concrete, 1, 91, 0.55, 0.5)
      for (let x = 0; x < T; x++) if (x % 4 < 2) ground.pset(x, 15, rgb(230, 190, 40))
      const scrap = [rgb(90, 50, 30), rgb(140, 80, 40), rgb(180, 110, 60), rgb(160, 164, 172)]
      const encounter = blobSheet(ground, (x, y) => scrap[P.band(0.5 + (tileNoise(x, y, 2.2, 13) - 0.5) * 0.9, 3, x, y)], rgb(60, 36, 24), (b, inside) => {
        for (const [x, y, w] of [[3, 4, 4], [9, 9, 5], [4, 12, 3]]) for (let k = 0; k < w; k++) if (inside(x + k, y) > 1) (b.pset(x + k, y, scrap[3]), b.pset(x + k, y + 1, rgb(100, 104, 112)))
      })
      const steel = [rgb(70, 76, 88), rgb(110, 118, 132), rgb(160, 168, 182), rgb(210, 216, 226)]
      const obstacle = objectSheet(ground, (b) => {
        b.rect(1, 3, 15, 15, steel[1])
        b.rect(1, 3, 15, 4, steel[2])
        for (let y = 0; y < T; y++)
          for (let x = 0; x < T; x++) {
            const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 9), a = Math.atan2(y + 0.5 - 9, x + 0.5 - 8)
            if (d < 4.6 + (Math.cos(a * 8) > 0.3 ? 1 : 0) && d > 1.6) b.pset(x, y, d < 3 ? steel[3] : steel[2])
          }
        disc(b, 8, 9, 1.2, steel[0])
        b.rect(1, 14, 15, 15, steel[0])
      })
      return { ground, encounter, obstacle }
    },
    fairy: () => {
      const lawn = [rgb(130, 190, 120), rgb(150, 206, 136), rgb(170, 220, 152), rgb(196, 234, 176)]
      const ground = textured(lawn, 1.2, 101)
      speckle(ground, 4, [rgb(255, 230, 245)], 4)
      const flowers = [rgb(255, 120, 180), rgb(255, 255, 255), rgb(255, 220, 80), rgb(200, 140, 255)]
      const encounter = blobSheet(ground, (x, y) => (tileNoise(x, y, 2, 7) > 0.5 ? rgb(90, 160, 90) : rgb(110, 176, 100)), rgb(70, 130, 70), (b, inside) => {
        const r = P.rng(23)
        for (let i = 0; i < 14; i++) {
          const x = 1 + Math.floor(r() * 14), y = 1 + Math.floor(r() * 14)
          if (inside(x, y) < 1.2) continue
          const c = flowers[i % 4]
          b.pset(x, y, rgb(255, 240, 120))
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) b.pset(x + dx, y + dy, c)
        }
      })
      const hedge = [rgb(40, 110, 60), rgb(60, 140, 76), rgb(90, 170, 100)]
      const obstacle = objectSheet(ground, (b) => {
        for (let y = 1; y < 15; y++)
          for (let x = 1; x < 15; x++) {
            const nx = (x + 0.5 - 8) / 7, ny = (y + 0.5 - 8.5) / 6.5
            const d = nx * nx + ny * ny + (tileNoise(x, y, 2.5, 6) - 0.5) * 0.25
            if (d > 1) continue
            b.pset(x, y, d > 0.8 ? hedge[0] : hedge[Math.max(1, Math.min(2, Math.round(1.8 - ny - nx * 0.5)))])
          }
        for (const [x, y, c] of [[5, 5, 0], [10, 6, 3], [7, 10, 0], [11, 11, 1], [4, 9, 3]]) (b.pset(x, y, flowers[c]), b.pset(x + 1, y, flowers[c]), b.pset(x, y + 1, rgb(255, 240, 120)))
      })
      return { ground, encounter, obstacle }
    }
  })
  return { BIOMES, helpers: { T, N, E, S, W, rgb, tileNoise, textured, copy, speckle, blobSheet, objectSheet, wrap } }
})()

for (const [biome, make] of Object.entries(BIOME_ART.BIOMES)) {
  const art = make()
  const dir = path.join(OUT, 'biomes', biome)
  fs.mkdirSync(dir, { recursive: true })
  P.save(art.ground, path.join(dir, 'ground.png'))
  P.save(P.pack(art.encounter, { cols: 16 }), path.join(dir, 'encounter.png'))
  P.save(P.pack(art.obstacle, { cols: 16 }), path.join(dir, 'obstacle.png'))
}


const TOWN_ART = (() => {
  const { T, N, E, S, W, rgb, tileNoise, textured, copy, blobSheet, objectSheet, wrap } = BIOME_ART.helpers
  function cobble(cols, seed) {
    const b = new P.Buf(T, T)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const row = y >> 2, off = row % 2 ? 2 : 0
        const seam = y % 4 === 3 || (x + off) % 4 === 3
        b.pset(x, y, seam ? cols[0] : cols[1 + P.band(0.5 + (tileNoise(x, y, 1.4, seed) - 0.5) * 0.7, cols.length - 1, x, y)])
      }
    return b
  }

  function grassSheet(ground, blade) {
    return blobSheet(ground, () => blade[1], blade[0], (b, inside) => {
      for (const [cx, by] of [[3, 6], [11, 6], [7, 14], [15, 13], [7, 4]])
        for (const [dx, h] of [[-2, 2], [-1, 3], [0, 4], [1, 3], [2, 2]])
          for (let k = 0; k < h; k++) {
            const x = wrap(cx + dx + (k === h - 1 && dx ? Math.sign(dx) : 0)), y = by - k
            if (inside(x, y) > 1) b.pset(x, y, blade[Math.min(blade.length - 1, 2 + Math.round((k / Math.max(1, h - 1)) * (blade.length - 3)))])
          }
    })
  }

  function waterSheet(ground, deep, foam) {
    return blobSheet(ground, (x, y, d) => {
      const ripple = (x + y * 2 + Math.round(tileNoise(x, y, 1.2, 77) * 6)) % 9 === 0
      return ripple ? deep[2] : d < 2.2 ? deep[1] : deep[0]
    }, foam)
  }

  function treeSheet(ground, crown, bark, seed = 4) {
    return objectSheet(ground, (b) => P.tree(b, { x: 8, base: 15, h: 10, rx: 6, ry: 5.4, trunk: 1.5, clumps: 24, clumpR: [2.5, 3.8], cols: crown, bark, seed, branches: false, leaf: 0.95 }))
  }

  function palmSheet(ground) {
    const trunk = [rgb(110, 76, 44), rgb(150, 108, 64)]
    const leaf = [rgb(30, 110, 50), rgb(60, 160, 70), rgb(120, 210, 90)]
    return objectSheet(ground, (b) => {
      for (let y = 5; y < 16; y++) { const x = 8 + Math.round(Math.sin(y * 0.35) * 1.2); b.pset(x, y, trunk[y % 3 ? 1 : 0]); b.pset(x + 1, y, trunk[0]) }
      for (const [dx, dy] of [[-1, 0], [1, 0], [-0.7, -0.6], [0.7, -0.6], [-0.4, 0.5], [0.4, 0.5]])
        for (let k = 1; k < 7; k++) { const x = Math.round(8.5 + dx * k), y = Math.round(5 + dy * k + (k * k) / 12); if (x >= 0 && x < T && y >= 0 && y < T) { b.pset(x, y, leaf[k < 3 ? 2 : 1]); if (y + 1 < T) b.pset(x, y + 1, leaf[0]) } }
    })
  }

  function cliffSheet(ground, cols) {
    return blobSheet(ground, (x, y, d) => cols[Math.min(cols.length - 1, ((y >> 2) % 2 ? 1 : 2) + (d > 4 ? 1 : 0))], cols[0], (b, inside) => {
      for (let x = 0; x < T; x++) for (const y of [4, 8, 12]) if (inside(x, y) > 1.5) b.pset(x, y, cols[0])
    })
  }

  function buildingSheet(ground, s) {
    return Array.from({ length: 16 }, (_, n) => {
      const b = copy(ground)
      const top = !(n & N), bottom = !(n & S), left = !(n & W), right = !(n & E)
      const x0 = left ? 1 : 0, x1 = right ? T - 1 : T
      if (!bottom) {
        b.rect(x0, top ? 2 : 0, x1, T, s.roof[1])
        for (let y = top ? 2 : 0; y < T; y++) if (y % 4 === 1) for (let x = x0; x < x1; x++) b.pset(x, y, s.roof[0])
        if (top) for (let x = x0; x < x1; x++) (b.pset(x, 2, s.roof[2]), b.pset(x, 1, s.edge))
        if (left) for (let y = top ? 1 : 0; y < T; y++) b.pset(x0, y, s.edge)
        if (right) for (let y = top ? 1 : 0; y < T; y++) b.pset(x1 - 1, y, s.edge)
        return b
      }
      const roofEnd = top ? 7 : 5
      b.rect(x0, top ? 2 : 0, x1, roofEnd, s.roof[1])
      for (let x = x0; x < x1; x++) b.pset(x, roofEnd - 1, s.roof[0])
      if (top) for (let x = x0; x < x1; x++) (b.pset(x, 2, s.roof[2]), b.pset(x, 1, s.edge))
      b.rect(x0, roofEnd, x1, 15, s.wall[1])
      for (let x = x0; x < x1; x++) b.pset(x, roofEnd, s.wall[0])
      for (const wx of [2, 10]) if (wx >= x0 && wx + 3 <= x1) { b.rect(wx, roofEnd + 2, wx + 3, roofEnd + 5, s.window); b.pset(wx, roofEnd + 2, s.shine) }
      if ((n & W) && !(n & E)) { b.rect(6, 10, 10, 15, s.door); b.pset(9, 12, s.shine) }
      for (let x = x0; x < x1; x++) b.pset(x, 15, s.edge)
      if (left) for (let y = top ? 1 : 0; y < 16; y++) b.pset(x0, y, s.edge)
      if (right) for (let y = top ? 1 : 0; y < 16; y++) b.pset(x1 - 1, y, s.edge)
      return b
    })
  }

  const INK = rgb(30, 24, 36)
  const WATER = [rgb(40, 110, 200), rgb(70, 150, 230), rgb(170, 220, 250)]
  const GREEN_BLADE = [rgb(30, 100, 40), rgb(50, 140, 60), rgb(80, 175, 70), rgb(130, 210, 90), rgb(180, 235, 120)]
  const PINE = P.hueRamp(6, { hue: 135, sat: 0.45, light: [0.08, 0.42] })
  const BARK = P.hueRamp(4, { hue: 25, sat: 0.35, light: [0.14, 0.42] })

  const TOWNS = {
    kanto: () => {
      const ground = cobble([rgb(120, 126, 140), rgb(168, 174, 188), rgb(186, 192, 204), rgb(204, 210, 220)], 3)
      return {
        ground,
        encounter: grassSheet(ground, GREEN_BLADE),
        obstacle: treeSheet(ground, PINE, BARK),
        water: waterSheet(ground, WATER, rgb(230, 240, 250)),
        building: buildingSheet(ground, { roof: [rgb(40, 70, 150), rgb(60, 100, 190), rgb(110, 150, 230)], wall: [rgb(170, 150, 110), rgb(230, 214, 170)], window: rgb(90, 150, 210), door: rgb(110, 76, 50), shine: rgb(240, 250, 255), edge: INK })
      }
    },
    johto: () => {
      const sand = [rgb(170, 130, 80), rgb(206, 166, 110), rgb(222, 184, 130), rgb(236, 204, 154)]
      const ground = textured(sand, 1.1, 5)
      return {
        ground,
        encounter: grassSheet(ground, [rgb(40, 120, 70), rgb(70, 170, 110), rgb(110, 200, 130), rgb(160, 230, 160), rgb(200, 245, 190)]),
        obstacle: cliffSheet(ground, [rgb(90, 56, 34), rgb(140, 92, 56), rgb(176, 122, 76), rgb(204, 150, 98)]),
        water: waterSheet(ground, [rgb(50, 140, 210), rgb(90, 180, 236), rgb(180, 230, 250)], rgb(240, 244, 236)),
        building: buildingSheet(ground, { roof: [rgb(130, 96, 40), rgb(184, 146, 70), rgb(220, 188, 110)], wall: [rgb(90, 60, 36), rgb(130, 90, 56)], window: rgb(60, 50, 40), door: rgb(60, 40, 26), shine: rgb(250, 230, 160), edge: INK })
      }
    },
    hoenn: () => {
      const ground = cobble([rgb(150, 128, 100), rgb(200, 180, 150), rgb(214, 196, 168), rgb(228, 212, 186)], 8)
      return {
        ground,
        encounter: grassSheet(ground, GREEN_BLADE),
        obstacle: treeSheet(ground, P.hueRamp(6, { hue: 120, sat: 0.5, light: [0.1, 0.45] }), BARK, 7),
        water: waterSheet(ground, [rgb(20, 60, 160), rgb(40, 90, 200), rgb(130, 180, 240)], rgb(240, 236, 220)),
        building: buildingSheet(ground, { roof: [rgb(140, 132, 120), rgb(186, 178, 164), rgb(216, 210, 198)], wall: [rgb(176, 160, 130), rgb(222, 206, 172)], window: rgb(80, 120, 170), door: rgb(100, 80, 60), shine: rgb(230, 240, 255), edge: INK })
      }
    },
    sinnoh: () => {
      const ground = cobble([rgb(100, 112, 130), rgb(150, 162, 178), rgb(166, 178, 192), rgb(182, 194, 206)], 13)
      return {
        ground,
        encounter: grassSheet(ground, GREEN_BLADE),
        obstacle: treeSheet(ground, P.hueRamp(6, { hue: 140, sat: 0.5, light: [0.06, 0.4] }), BARK, 11),
        water: waterSheet(ground, [rgb(20, 70, 170), rgb(40, 110, 210), rgb(140, 190, 240)], rgb(220, 232, 244)),
        building: buildingSheet(ground, { roof: [rgb(40, 50, 70), rgb(64, 76, 100), rgb(100, 112, 136)], wall: [rgb(60, 80, 120), rgb(110, 140, 180)], window: rgb(170, 210, 240), door: rgb(40, 50, 70), shine: rgb(255, 255, 255), edge: INK })
      }
    },
    unova: () => {
      const ground = cobble([rgb(110, 110, 112), rgb(156, 156, 158), rgb(172, 172, 174), rgb(188, 188, 190)], 17)
      return {
        ground,
        encounter: grassSheet(ground, [rgb(130, 110, 40), rgb(180, 160, 60), rgb(210, 190, 80), rgb(232, 214, 110), rgb(246, 232, 150)]),
        obstacle: treeSheet(ground, P.hueRamp(6, { hue: 24, sat: 0.7, light: [0.18, 0.55], shift: 20 }), BARK, 15),
        water: waterSheet(ground, WATER, rgb(230, 236, 240)),
        building: buildingSheet(ground, { roof: [rgb(20, 100, 100), rgb(40, 150, 140), rgb(90, 200, 186)], wall: [rgb(120, 70, 50), rgb(170, 110, 80)], window: rgb(90, 140, 180), door: rgb(80, 50, 36), shine: rgb(240, 250, 250), edge: INK })
      }
    },
    kalos: () => {
      const ground = cobble([rgb(24, 30, 56), rgb(44, 52, 86), rgb(54, 62, 98), rgb(66, 74, 112)], 19)
      return {
        ground,
        encounter: grassSheet(ground, [rgb(16, 60, 50), rgb(24, 90, 70), rgb(40, 120, 90), rgb(70, 160, 120), rgb(120, 210, 170)]),
        obstacle: treeSheet(ground, P.hueRamp(6, { hue: 170, sat: 0.4, light: [0.05, 0.28] }), BARK, 19),
        water: waterSheet(ground, [rgb(14, 30, 80), rgb(24, 50, 120), rgb(100, 140, 220)], rgb(140, 170, 230)),
        building: buildingSheet(ground, { roof: [rgb(30, 40, 90), rgb(50, 64, 130), rgb(90, 110, 180)], wall: [rgb(70, 76, 110), rgb(110, 116, 150)], window: rgb(255, 214, 100), door: rgb(40, 36, 60), shine: rgb(255, 250, 210), edge: rgb(10, 10, 24) })
      }
    },
    alola: () => {
      const sand = [rgb(200, 170, 120), rgb(232, 210, 160), rgb(242, 224, 180), rgb(250, 238, 204)]
      const ground = textured(sand, 1, 23)
      return {
        ground,
        encounter: grassSheet(ground, [rgb(20, 120, 60), rgb(40, 170, 80), rgb(80, 205, 100), rgb(140, 230, 120), rgb(200, 250, 160)]),
        obstacle: palmSheet(ground),
        water: waterSheet(ground, [rgb(20, 150, 180), rgb(50, 190, 210), rgb(170, 240, 240)], rgb(255, 250, 236)),
        building: buildingSheet(ground, { roof: [rgb(200, 100, 60), rgb(240, 140, 90), rgb(255, 190, 140)], wall: [rgb(220, 170, 190), rgb(250, 220, 230)], window: rgb(100, 190, 220), door: rgb(150, 90, 70), shine: rgb(255, 255, 255), edge: INK })
      }
    },
    galar: () => {
      const ground = cobble([rgb(80, 44, 36), rgb(130, 74, 58), rgb(148, 88, 70), rgb(166, 104, 84)], 29)
      return {
        ground,
        encounter: grassSheet(ground, GREEN_BLADE),
        obstacle: treeSheet(ground, P.hueRamp(6, { hue: 130, sat: 0.35, light: [0.06, 0.36] }), BARK, 23),
        water: waterSheet(ground, [rgb(60, 90, 120), rgb(90, 124, 156), rgb(170, 196, 214)], rgb(210, 214, 220)),
        building: buildingSheet(ground, { roof: [rgb(40, 44, 54), rgb(66, 70, 84), rgb(100, 104, 118)], wall: [rgb(110, 40, 34), rgb(160, 66, 52)], window: rgb(220, 200, 140), door: rgb(50, 34, 30), shine: rgb(255, 240, 200), edge: INK })
      }
    },
    paldea: () => {
      const ground = cobble([rgb(150, 120, 90), rgb(196, 170, 136), rgb(210, 186, 154), rgb(224, 202, 172)], 31)
      return {
        ground,
        encounter: grassSheet(ground, GREEN_BLADE),
        obstacle: palmSheet(ground),
        water: waterSheet(ground, [rgb(20, 140, 170), rgb(50, 180, 200), rgb(160, 230, 236)], rgb(250, 246, 230)),
        building: buildingSheet(ground, { roof: [rgb(20, 110, 110), rgb(40, 160, 156), rgb(100, 210, 200)], wall: [rgb(210, 170, 60), rgb(246, 210, 90)], window: rgb(80, 160, 200), door: rgb(120, 80, 50), shine: rgb(255, 255, 240), edge: INK })
      }
    }
  }
  return TOWNS
})()

for (const [region, make] of Object.entries(TOWN_ART)) {
  const art = make()
  const dir = path.join(OUT, 'towns', region)
  fs.mkdirSync(dir, { recursive: true })
  P.save(art.ground, path.join(dir, 'ground.png'))
  for (const part of ['encounter', 'obstacle', 'water', 'building']) P.save(P.pack(art[part], { cols: 16 }), path.join(dir, `${part}.png`))
}
