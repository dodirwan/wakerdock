(() => {
  'use strict';

  const canvas = document.getElementById('office');
  const ctx = canvas.getContext('2d');
  const W = 480, H = 270;
  ctx.imageSmoothingEnabled = false;

  /* ================= pixel font ================= */
  const GLYPHS = {
    A: ['010', '101', '111', '101', '101'],
    B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'],
    D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'],
    F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'],
    H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'],
    J: ['001', '001', '001', '101', '010'],
    K: ['101', '101', '110', '101', '101'],
    L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'],
    N: ['101', '111', '111', '111', '101'],
    O: ['010', '101', '101', '101', '010'],
    P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'],
    R: ['110', '101', '110', '101', '101'],
    S: ['011', '100', '010', '001', '110'],
    T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'],
    V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'],
    X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'],
    Z: ['111', '001', '010', '100', '111'],
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '011', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'],
    '7': ['111', '001', '001', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111'],
    '-': ['000', '000', '111', '000', '000'],
    '.': ['000', '000', '000', '000', '010'],
    ':': ['000', '010', '000', '010', '000'],
    '!': ['010', '010', '010', '000', '010'],
    '?': ['111', '001', '011', '000', '010'],
    "'": ['010', '010', '000', '000', '000'],
    ',': ['000', '000', '000', '010', '100'],
    '/': ['001', '001', '010', '100', '100'],
    '*': ['101', '010', '111', '010', '101'],
    '+': ['000', '010', '111', '010', '000'],
    '(': ['001', '010', '010', '010', '001'],
    ')': ['100', '010', '010', '010', '100'],
    ' ': ['000', '000', '000', '000', '000']
  };

  function textWidth(str, scale = 1, spacing = 1) {
    const n = String(str).length;
    return n === 0 ? 0 : n * 3 * scale + (n - 1) * spacing;
  }

  function drawText(g, str, x, y, color, scale = 1, spacing = 1) {
    const text = String(str).toUpperCase();
    g.fillStyle = color;
    let cx = Math.round(x);
    for (const ch of text) {
      const gl = GLYPHS[ch] || GLYPHS['?'];
      for (let r = 0; r < 5; r++) {
        const row = gl[r];
        for (let c = 0; c < 3; c++) {
          if (row[c] === '1') g.fillRect(cx + c * scale, Math.round(y) + r * scale, scale, scale);
        }
      }
      cx += 3 * scale + spacing;
    }
    return cx - x;
  }

  function rect(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /* ================= layout ================= */
  const SPOTS = {
    snowDesk: { x: 70, y: 190, fx: 70, fy: 196 },
    winterDesk: { x: 222, y: 190, fx: 222, fy: 196 },
    summerDesk: { x: 374, y: 190, fx: 374, fy: 196 },
    adminDesk: { x: 324, y: 110, fx: 324, fy: 116 },
    board: { x: 76, y: 88 },
    phone: { x: 446, y: 134 },
    coffee: { x: 46, y: 168 },
    cooler: { x: 434, y: 222 },
    center: { x: 240, y: 150 }
  };

  const FURNITURE = [
    { x: 36, y: 196, w: 68, h: 30 },   // snow desk
    { x: 188, y: 196, w: 68, h: 30 },  // winter desk
    { x: 340, y: 196, w: 68, h: 30 },  // summer desk
    { x: 290, y: 116, w: 68, h: 30 },
    { x: 424, y: 86, w: 44, h: 28 },   // phone table
    { x: 8, y: 150, w: 24, h: 34 },    // coffee machine
    { x: 446, y: 206, w: 22, h: 30 },  // water cooler
    { x: 404, y: 240, w: 30, h: 16 },  // printer
    { x: 8, y: 210, w: 16, h: 34 },    // bookshelf
    { x: 10, y: 58, w: 18, h: 22 },    // plant
    { x: 452, y: 58, w: 18, h: 22 },   // plant
    { x: 450, y: 148, w: 18, h: 22 }   // plant
  ];

  const TILE = 16, COLS = 30, ROWS = 17;
  const blocked = new Uint8Array(COLS * ROWS);

  function buildGrid() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = c * TILE + 8, cy = r * TILE + 8;
        let b = cx < 16 || cx > 464 || cy < 58 || cy > 248;
        if (!b) {
          for (const f of FURNITURE) {
            if (cx > f.x - 2 && cx < f.x + f.w + 2 && cy > f.y - 2 && cy < f.y + f.h + 2) { b = true; break; }
          }
        }
        blocked[r * COLS + c] = b ? 1 : 0;
      }
    }
  }
  buildGrid();

  const cellOf = (x, y) => {
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(x / TILE)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor(y / TILE)));
    return { c, r, i: r * COLS + c };
  };

  function walkableCell(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    return blocked[r * COLS + c] === 0;
  }

  function findPath(sx, sy, tx, ty) {
    const s = cellOf(sx, sy), t = cellOf(tx, ty);
    let startOk = walkableCell(s.c, s.r);
    const goalOk = walkableCell(t.c, t.r);
    if (!goalOk) return null;
    let start = s.i;
    if (!startOk) {
      // snap to nearest walkable neighbour
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let found = -1;
      for (const [dc, dr] of n) {
        if (walkableCell(s.c + dc, s.r + dr)) { found = (s.r + dr) * COLS + (s.c + dc); break; }
      }
      if (found === -1) return null;
      start = found;
    }
    const goal = t.i;
    if (start === goal) return [{ x: tx, y: ty }];

    const open = [start];
    const gScore = new Float32Array(COLS * ROWS).fill(Infinity);
    const fScore = new Float32Array(COLS * ROWS).fill(Infinity);
    const came = new Int32Array(COLS * ROWS).fill(-1);
    const closed = new Uint8Array(COLS * ROWS);
    gScore[start] = 0;
    const h = (i) => Math.abs((i % COLS) - t.c) + Math.abs(Math.floor(i / COLS) - t.r);
    fScore[start] = h(start);

    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[bi]]) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % COLS, cr = Math.floor(cur / COLS);
      const neigh = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dc, dr] of neigh) {
        const nc = cc + dc, nr = cr + dr;
        if (!walkableCell(nc, nr)) continue;
        const ni = nr * COLS + nc;
        if (closed[ni]) continue;
        const tentative = gScore[cur] + 1;
        if (tentative < gScore[ni]) {
          came[ni] = cur;
          gScore[ni] = tentative;
          fScore[ni] = tentative + h(ni);
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }

    if (came[goal] === -1 && goal !== start) return null;
    const cells = [];
    let cur = goal;
    let guard = 0;
    while (cur !== start && cur !== -1 && guard++ < 2000) {
      cells.push(cur);
      cur = came[cur];
    }
    if (cur === -1) return null;
    cells.reverse();
    const pts = cells.map((i) => ({ x: (i % COLS) * TILE + 8, y: Math.floor(i / COLS) * TILE + 8 }));
    pts.push({ x: tx, y: ty });
    return pts;
  }

  /* ================= palettes ================= */
  const PALETTES = {
    snow: {
      hair: '#eef6ff', hairEdge: '#cfe3f2', skin: '#f4c99c', skinShade: '#d9a877',
      top: '#63c9ff', topDark: '#2f9ad8', pants: '#24395a', shoe: '#101820', accent: '#ffffff'
    },
    winter: {
      hair: '#3c2f57', hairEdge: '#2a2040', skin: '#edc096', skinShade: '#c99671',
      top: '#2f4f8f', topDark: '#223a69', pants: '#1a2740', shoe: '#0c1320', accent: '#7fe3c3'
    },
    summer: {
      hair: '#c9762f', hairEdge: '#9c571f', skin: '#f4c99c', skinShade: '#d9a877',
      top: '#ffc145', topDark: '#dd9a1f', pants: '#b4552d', shoe: '#3a1c12', accent: '#ff8a5b'
    },
    wakeadmin: {
      hair: '#ddd3ff', hairEdge: '#a393cd', skin: '#e9bd92', skinShade: '#c69169',
      top: '#b39aff', topDark: '#795ab9', pants: '#263147', shoe: '#101820', accent: '#7fe3c3'
    },
    default: {
      hair: '#2b3a4d', hairEdge: '#1d2937', skin: '#e9bd92', skinShade: '#c69169',
      top: '#3fae7a', topDark: '#2b8359', pants: '#22303f', shoe: '#0e151d', accent: '#d9ffe9'
    }
  };

  const PROFILES = {
    snow: [
      { type: 'wander', count: 2 },
      { type: 'sitDesk', min: 16, max: 24 },
      { type: 'wander', count: 1 },
      { type: 'coffee', min: 7, max: 11 },
      { type: 'wander', count: 1 }
    ],
    winter: [
      { type: 'wander', count: 1 },
      { type: 'phone', min: 18, max: 26 },
      { type: 'wander', count: 1 },
      { type: 'sitDesk', min: 15, max: 22 }
    ],
    summer: [
      { type: 'present', min: 20, max: 28 },
      { type: 'wander', count: 2 },
      { type: 'sitDesk', min: 14, max: 20 },
      { type: 'wander', count: 1 }
    ],
    default: [
      { type: 'wander', count: 2 },
      { type: 'sitDesk', min: 16, max: 24 }
    ]
  };

  const LINES = {
    sit: ['Checking my laptop...', 'Laptop time!', 'Let me check the dashboard.', 'Inbox first.'],
    phone: ['Calling the principal...', 'One call coming up.', 'Dialing the principal now.'],
    present: ['BaaS update, everyone!', 'Sharing the solution board.', 'Slides up - quick walkthrough!'],
    coffee: ['Coffee break!', 'Refueling...'],
    wander: ['Stretching my legs.', 'Walking it off.', 'Quick lap around the office.']
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ================= employee ================= */
  class Employee {
    constructor(def, index) {
      this.id = def.id;
      this.name = def.name;
      this.role = def.role || 'QoderWake employee';
      this.runner = def.runner || 'qoderwake';
      this.isAdmin = !!def.isAdmin;
      this.adminApprovals = null;
      this.online = def.status !== 'offline';
      this.demo = !!def.demo;
      this.palette = PALETTES[this.name.toLowerCase()] || PALETTES.default;
      this.profileKey = PROFILES[this.name.toLowerCase()] ? this.name.toLowerCase() : 'default';
      this.desks = [SPOTS.snowDesk, SPOTS.winterDesk, SPOTS.summerDesk, SPOTS.adminDesk];
      const byName = { snow: SPOTS.snowDesk, winter: SPOTS.winterDesk, summer: SPOTS.summerDesk };
      this.desk = this.isAdmin ? SPOTS.adminDesk : byName[this.name.toLowerCase()] || this.desks[index % this.desks.length];
      const starts = [
        { x: 176, y: 120 }, { x: 300, y: 96 }, { x: SPOTS.board.x, y: SPOTS.board.y },
        { x: 380, y: 150 }, { x: 240, y: 210 }, { x: 130, y: 180 }
      ];
      const st = starts[index % starts.length];
      this.x = st.x;
      this.y = st.y;
      this.dir = 'down';
      this.state = 'idle';
      this.queue = [];
      this.action = null;
      this.working = false;
      this.messages = [];
      this.history = null;
      this.unread = 0;
      this.bubble = null;
      this.bob = Math.random() * 6;
      this.moving = false;
      this.animT = 0;
      this.speed = 34;
      this.workStart = 0;
      this.lastBubbleLine = '';
      if (this.name.toLowerCase() === 'summer') {
        this.queue.push({ type: 'present', dur: rand(22, 28) });
      } else if (this.name.toLowerCase() === 'winter') {
        this.queue.push({ type: 'walkTo', spot: 'phone' }, { type: 'phone', dur: rand(16, 22) });
      } else {
        this.refill(2);
      }
    }

    randomTarget() {
      for (let i = 0; i < 40; i++) {
        const c = 1 + Math.floor(Math.random() * (COLS - 2));
        const r = 4 + Math.floor(Math.random() * (ROWS - 6));
        if (walkableCell(c, r)) return { x: c * TILE + 8, y: r * TILE + 8 };
      }
      return SPOTS.center;
    }

    refill(count) {
      const cycle = PROFILES[this.profileKey];
      const items = [];
      for (let i = 0; i < (count || 1); i++) {
        for (const step of cycle) {
          if (step.type === 'wander') {
            for (let w = 0; w < step.count; w++) items.push({ type: 'wander' });
          } else if (step.type === 'sitDesk') {
            items.push({ type: 'walkTo', spot: 'desk' }, { type: 'sitDesk', dur: rand(step.min, step.max) });
          } else if (step.type === 'phone') {
            items.push({ type: 'walkTo', spot: 'phone' }, { type: 'phone', dur: rand(step.min, step.max) });
          } else if (step.type === 'present') {
            items.push({ type: 'walkTo', spot: 'board' }, { type: 'present', dur: rand(step.min, step.max) });
          } else if (step.type === 'coffee') {
            items.push({ type: 'walkTo', spot: 'coffee' }, { type: 'coffee', dur: rand(step.min, step.max) });
          }
        }
      }
      this.queue.push(...items);
    }

    spotFor(name) {
      if (name === 'desk') return this.desk;
      return SPOTS[name];
    }

    say(text, seconds = 4) {
      this.bubble = { text, until: performance.now() + seconds * 1000 };
    }

    startWalk(tx, ty) {
      let path = findPath(this.x, this.y, tx, ty);
      if (!path) {
        const d = Math.hypot(tx - this.x, ty - this.y);
        if (d < 70) path = [{ x: tx, y: ty }];
      }
      if (!path) { this.action = null; return false; }
      this.action = { type: 'walk', path };
      this.state = 'walk';
      return true;
    }

    begin(action) {
      switch (action.type) {
        case 'wander': {
          const t = this.randomTarget();
          this.startWalk(t.x, t.y);
          break;
        }
        case 'walkTo': {
          const s = this.spotFor(action.spot);
          this.startWalk(s.x, s.y);
          break;
        }
        case 'sitDesk': {
          this.state = 'sit';
          this.dir = 'down';
          this.action = { type: 'timed', kind: 'sit', t: action.dur || 18, untilReply: !!action.untilReply };
          if (!action.untilReply) this.say(pick(LINES.sit), 3.5);
          break;
        }
        case 'phone': {
          this.state = 'phone';
          this.dir = 'up';
          this.action = { type: 'timed', kind: 'phone', t: action.dur || 18 };
          this.say(pick(LINES.phone), 4);
          break;
        }
        case 'present': {
          this.state = 'present';
          this.dir = 'up';
          this.action = { type: 'timed', kind: 'present', t: action.dur || 22 };
          this.say(pick(LINES.present), 4);
          break;
        }
        case 'coffee': {
          this.state = 'idle';
          this.dir = 'left';
          this.action = { type: 'timed', kind: 'coffee', t: action.dur || 8 };
          this.say(pick(LINES.coffee), 3);
          break;
        }
        case 'pause': {
          this.state = 'idle';
          this.action = { type: 'timed', kind: 'pause', t: action.dur || 1.2 };
          break;
        }
        default:
          this.action = null;
      }
    }

    startTask() {
      this.working = true;
      this.unread = 0;
      this.queue = [];
      this.action = null;
      const s = this.desk;
      const walked = this.startWalk(s.x, s.y);
      if (walked) {
        this.afterWalk = { type: 'sitDesk', untilReply: true };
      } else {
        this.state = 'sit';
        this.dir = 'down';
        this.action = { type: 'timed', kind: 'sit', t: 600, untilReply: true };
      }
    }

    finishTask(replyText) {
      this.working = false;
      if (replyText) this.say(replyText.slice(0, 90), 6);
      this.action = null;
      this.afterWalk = null;
      this.queue = [{ type: 'pause', dur: 1.6 }];
      this.refill(1);
    }

    update(dt) {
      if (this.bubble && performance.now() > this.bubble.until) this.bubble = null;
      this.animT += dt;

      if (!this.action) {
        if (this.working) {
          this.state = 'sit';
          this.dir = 'down';
          this.action = { type: 'timed', kind: 'sit', t: 600, untilReply: true };
          return;
        }
        const next = this.queue.shift();
        if (next) this.begin(next);
        else { this.refill(1); return; }
      }

      const a = this.action;
      if (!a) return;

      if (a.type === 'walk') {
        this.moving = true;
        let pt = a.path[0];
        if (!pt) {
          this.action = null;
          this.moving = false;
          if (this.afterWalk) { const n = this.afterWalk; this.afterWalk = null; this.begin(n); }
          else this.state = 'idle';
          return;
        }
        const dx = pt.x - this.x, dy = pt.y - this.y;
        const dist = Math.hypot(dx, dy);
        const step = this.speed * dt;
        if (dist <= step) {
          this.x = pt.x; this.y = pt.y;
          a.path.shift();
          if (a.path.length === 0) {
            this.action = null;
            this.moving = false;
            if (this.afterWalk) { const n = this.afterWalk; this.afterWalk = null; this.begin(n); }
            else this.state = 'idle';
          }
        } else {
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
          if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
          else this.dir = dy > 0 ? 'down' : 'up';
        }
      } else if (a.type === 'timed') {
        this.moving = false;
        if (a.untilReply && this.working) return;
        a.t -= dt;
        if (a.t <= 0) {
          this.action = null;
          this.state = 'idle';
          if (a.kind === 'sit' && !this.working && Math.random() < 0.4) this.say(pick(LINES.wander), 3);
        }
      }
    }

    statusLabel() {
      if (this.working) return 'Working on your task…';
      if (!this.online && !this.demo) return 'Offline';
      switch (this.state) {
        case 'walk': return 'Walking around the office';
        case 'sit': return this.working ? 'Working on your task…' : 'Checking laptop at desk';
        case 'phone': return 'Calling the principal';
        case 'present': return 'Presenting at the whiteboard';
        default: return 'Standing by';
      }
    }
  }

  /* ================= room rendering ================= */
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  const bgx = bg.getContext('2d');
  bgx.imageSmoothingEnabled = false;

  let seed = 7;
  const nrand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  function drawPlant(g, x, y) {
    rect(g, x + 2, y + 16, 14, 4, '#141a21');
    rect(g, x + 3, y + 10, 12, 8, '#b5623a');
    rect(g, x + 4, y + 10, 10, 2, '#d0764a');
    rect(g, x + 6, y + 2, 4, 9, '#2f7a46');
    rect(g, x + 2, y + 5, 4, 5, '#3f9a58');
    rect(g, x + 10, y + 4, 4, 6, '#275f38');
    rect(g, x + 4, y, 3, 4, '#52b06a');
    rect(g, x + 11, y + 1, 3, 4, '#52b06a');
  }

  function drawWindow(g, x, y, w) {
    rect(g, x - 3, y - 3, w + 6, 32, '#0a1016');
    const grad = g.createLinearGradient(0, y, 0, y + 26);
    grad.addColorStop(0, '#8fd9ff');
    grad.addColorStop(0.6, '#5db4ea');
    grad.addColorStop(1, '#3b7fb5');
    g.fillStyle = grad;
    g.fillRect(x, y, w, 26);
    // skyline
    rect(g, x + 2, y + 16, 8, 10, '#2e5f8a');
    rect(g, x + 12, y + 12, 7, 14, '#356b98');
    rect(g, x + 21, y + 18, 9, 8, '#2a567d');
    rect(g, x + 32, y + 10, 6, 16, '#3a72a1');
    rect(g, x + 40, y + 15, 10, 11, '#2e5f8a');
    if (w > 60) {
      rect(g, x + 52, y + 13, 7, 13, '#356b98');
      rect(g, x + 61, y + 19, 8, 7, '#2a567d');
    }
    // window reflections
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x + 4, y + 3, 10, 1);
    g.fillRect(x + 4, y + 5, 6, 1);
    rect(g, x, y, 1, 26, '#f2fbff');
    rect(g, x + w - 1, y, 1, 26, '#f2fbff');
    rect(g, x, y + 13, w, 1, '#0a1016');
    rect(g, x, y + 26, w, 2, '#0a1016');
    rect(g, x + w / 2 - 1, y, 2, 26, '#0a1016');
  }

  function drawLaptop(g, x, y, open = true) {
    // x,y top-left of laptop base on desk
    rect(g, x, y + 8, 18, 6, '#2a323c');
    rect(g, x + 1, y + 9, 16, 4, '#151c24');
    if (open) {
      rect(g, x + 2, y - 4, 14, 12, '#1a232c');
      rect(g, x + 3, y - 3, 12, 10, '#0a2833');
      rect(g, x + 4, y - 2, 6, 1, '#2fbd6b');
      rect(g, x + 4, y, 9, 1, '#2fbd6b');
      rect(g, x + 4, y + 2, 5, 1, '#1b8a4a');
      rect(g, x + 4, y + 4, 8, 1, '#2fbd6b');
    }
  }

  function drawDesk(g, x, y, paperColor) {
    // chair behind
    rect(g, x + 26, y - 20, 16, 18, '#1b2634');
    rect(g, x + 27, y - 19, 14, 12, '#263647');
    rect(g, x + 24, y - 2, 20, 3, '#101820');
    // desk
    rect(g, x, y, 68, 6, '#c08a52');
    rect(g, x, y + 6, 68, 24, '#9a6a3c');
    rect(g, x, y, 68, 2, '#d9a96b');
    rect(g, x, y + 28, 68, 2, '#5e3f24');
    rect(g, x + 2, y + 8, 2, 18, '#7b5330');
    rect(g, x + 64, y + 8, 2, 18, '#7b5330');
    // laptop
    drawLaptop(g, x + 24, y + 8, true);
    // mug
    rect(g, x + 50, y + 4, 6, 6, paperColor);
    rect(g, x + 56, y + 5, 2, 3, paperColor);
    rect(g, x + 51, y + 5, 4, 1, '#3b2417');
    // papers
    rect(g, x + 6, y + 6, 10, 8, '#e8e2d2');
    rect(g, x + 7, y + 8, 8, 1, '#9c9484');
    rect(g, x + 7, y + 10, 6, 1, '#9c9484');
    rect(g, x + 47, y + 12, 9, 12, '#d8d2c2');
    rect(g, x + 48, y + 14, 7, 1, '#9c9484');
    // drawer handles
    rect(g, x + 10, y + 14, 10, 2, '#6d4a2c');
  }

  function drawRoom() {
    const g = bgx;
    // ceiling/wall
    const wall = g.createLinearGradient(0, 0, 0, 48);
    wall.addColorStop(0, '#203041');
    wall.addColorStop(1, '#182534');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, 48);
    // wall panels
    for (let x = 0; x < W; x += 48) {
      rect(g, x, 0, 1, 44, 'rgba(0,0,0,0.18)');
      rect(g, x + 1, 0, 1, 44, 'rgba(255,255,255,0.04)');
    }
    // baseboard
    rect(g, 0, 44, W, 4, '#0c1218');
    rect(g, 0, 44, W, 1, '#2a3a4c');
    // floor
    rect(g, 0, 48, W, 204, '#2b3643');
    rect(g, 0, 48, W, 2, '#101720');
    for (let ty = 48; ty < 252; ty += 16) {
      for (let tx = 0; tx < W; tx += 16) {
        const v = nrand();
        const col = v < 0.18 ? '#2a3542' : v < 0.4 ? '#2d3947' : '#2b3643';
        rect(g, tx, ty, 16, 16, col);
        rect(g, tx, ty, 16, 1, 'rgba(0,0,0,0.10)');
        rect(g, tx, ty, 1, 16, 'rgba(0,0,0,0.08)');
      }
    }
    // center rug
    rect(g, 168, 112, 144, 72, '#1c2b36');
    rect(g, 170, 114, 140, 68, '#21323e');
    for (let ry = 116; ry < 182; ry += 8) {
      for (let rx = 172; rx < 308; rx += 8) {
        if (((rx - 172) / 8 + (ry - 116) / 8) % 2 === 0) rect(g, rx, ry, 8, 8, '#243744');
      }
    }
    rect(g, 168, 112, 144, 2, '#3d5a6b');
    rect(g, 168, 112, 2, 72, '#3d5a6b');

    // left/right wall edges
    rect(g, 0, 48, 4, 204, '#0e151d');
    rect(g, W - 4, 48, 4, 204, '#0e151d');
    // bottom wall strip
    rect(g, 0, 252, W, 18, '#141e29');
    rect(g, 0, 252, W, 2, '#0a1016');
    rect(g, 0, 252, W, 1, '#2a3a4c');
    // door
    rect(g, 214, 250, 52, 20, '#0a1118');
    rect(g, 216, 252, 48, 16, '#1d2b3a');
    rect(g, 216, 252, 48, 2, '#0d141c');
    rect(g, 256, 258, 4, 2, '#c9a54a');
    rect(g, 230, 246, 20, 4, '#123d22');
    drawText(g, 'EXIT', 233, 246, '#54e38a', 1, 1);

    // whiteboard on top wall
    rect(g, 22, 6, 100, 36, '#0b1116');
    rect(g, 24, 8, 96, 30, '#eef3f7');
    rect(g, 24, 8, 96, 2, '#ffffff');
    rect(g, 30, 14, 26, 4, '#2b6ec9');
    rect(g, 30, 20, 40, 2, '#7f8c9b');
    rect(g, 30, 24, 32, 2, '#7f8c9b');
    rect(g, 34, 30, 10, 6, '#ffd75e');
    rect(g, 46, 31, 8, 5, '#ff9fb2');
    rect(g, 58, 30, 9, 6, '#8fe3c0');
    rect(g, 72, 14, 18, 12, '#cfe2f7');
    rect(g, 74, 16, 6, 8, '#3a6ea5');
    rect(g, 82, 20, 6, 4, '#3a6ea5');
    rect(g, 96, 14, 18, 3, '#c33');
    rect(g, 96, 19, 12, 2, '#7f8c9b');
    rect(g, 24, 38, 96, 3, '#8b98a6');
    rect(g, 34, 37, 9, 1, '#d64541');
    rect(g, 46, 37, 9, 1, '#2b6ec9');
    rect(g, 58, 37, 9, 1, '#2f2f2f');
    // window frames
    drawWindow(g, 148, 10, 88);
    drawWindow(g, 252, 10, 88);
    drawWindow(g, 356, 10, 56);
    // clock
    rect(g, 442, 12, 22, 22, '#0a1016');
    rect(g, 444, 14, 18, 18, '#e8eef4');
    rect(g, 451, 16, 2, 7, '#1d2733');
    rect(g, 453, 22, 6, 2, '#1d2733');
    rect(g, 444, 30, 18, 2, '#b9c4cf');
    // ceiling light glow
    for (const lx of [96, 240, 384]) {
      g.fillStyle = 'rgba(255, 244, 200, 0.05)';
      g.beginPath();
      g.moveTo(lx - 8, 48);
      g.lineTo(lx + 8, 48);
      g.lineTo(lx + 40, 120);
      g.lineTo(lx - 40, 120);
      g.closePath();
      g.fill();
      rect(g, lx - 14, 44, 28, 3, '#c7d3de');
      rect(g, lx - 12, 45, 24, 1, '#fff6cf');
    }

    // plants
    drawPlant(g, 10, 58);
    drawPlant(g, 452, 58);
    drawPlant(g, 450, 148);

    // bookshelf (left)
    rect(g, 8, 210, 16, 34, '#3b2a1d');
    rect(g, 9, 212, 14, 30, '#241a12');
    for (let s = 0; s < 3; s++) {
      rect(g, 10, 214 + s * 10, 12, 2, '#6b4a2f');
      rect(g, 10, 216 + s * 10, 3, 7, '#b85545');
      rect(g, 14, 216 + s * 10, 2, 7, '#4d7fba');
      rect(g, 17, 216 + s * 10, 3, 7, '#c9a54a');
    }

    // coffee machine (left wall)
    rect(g, 8, 150, 24, 34, '#1b232c');
    rect(g, 10, 152, 20, 12, '#0c1117');
    rect(g, 11, 153, 18, 10, '#1d3a2b');
    rect(g, 13, 156, 4, 4, '#3ee38a');
    rect(g, 19, 156, 4, 4, '#e35d5d');
    rect(g, 12, 167, 16, 9, '#2a3543');
    rect(g, 14, 168, 12, 2, '#141a21');
    rect(g, 13, 172, 3, 3, '#e8e2d2');
    rect(g, 19, 172, 3, 3, '#e8e2d2');
    rect(g, 10, 180, 20, 2, '#0c1117');

    // phone table (right wall)
    rect(g, 424, 86, 44, 6, '#c08a52');
    rect(g, 424, 92, 44, 22, '#9a6a3c');
    rect(g, 424, 112, 44, 2, '#5e3f24');
    rect(g, 428, 94, 2, 16, '#7b5330');
    rect(g, 462, 94, 2, 16, '#7b5330');
    // phone
    rect(g, 432, 88, 14, 6, '#101820');
    rect(g, 430, 94, 18, 4, '#1f2a36');
    rect(g, 433, 89, 12, 3, '#39485a');
    rect(g, 436, 91, 6, 2, '#7fe3c3');
    rect(g, 446, 95, 12, 1, '#0c1117');
    rect(g, 457, 96, 1, 10, '#0c1117');
    rect(g, 457, 106, 6, 1, '#0c1117');
    // note
    rect(g, 438, 100, 10, 8, '#e8e2d2');
    rect(g, 439, 102, 8, 1, '#9c9484');
    rect(g, 439, 104, 6, 1, '#9c9484');

    // desks
    drawDesk(g, 36, 196, '#ffc145');
    drawDesk(g, 188, 196, '#7fe3c3');
    drawDesk(g, 340, 196, '#63c9ff');
    drawDesk(g, 290, 116, '#b39aff');
    drawText(g, 'ADMIN', 312, 143, '#d5c6ff');

    // water cooler
    rect(g, 446, 216, 22, 20, '#cfd8e3');
    rect(g, 448, 218, 18, 16, '#93a3b5');
    rect(g, 450, 206, 14, 12, '#6fb8e8');
    rect(g, 451, 208, 12, 8, '#a4d8f7');
    rect(g, 452, 209, 2, 5, '#eaf7ff');
    rect(g, 456, 228, 3, 3, '#3d4b5c');
    rect(g, 461, 228, 3, 3, '#3d4b5c');

    // printer (bottom right)
    rect(g, 404, 240, 30, 14, '#cfd8e3');
    rect(g, 406, 242, 26, 4, '#93a3b5');
    rect(g, 408, 247, 22, 5, '#e8eef4');
    rect(g, 410, 248, 18, 3, '#ffffff');
    rect(g, 412, 238, 12, 2, '#b9c4cf');

    // floor stains / highlights
    g.fillStyle = 'rgba(255,255,255,0.03)';
    g.fillRect(120, 70, 60, 3);
    g.fillRect(320, 165, 40, 3);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(60, 120, 90, 5);
  }
  drawRoom();

  /* ================= character rendering ================= */
  function drawLegs(g, p, x, y, frame, moving) {
    const off = moving ? (frame % 2 === 0 ? 1 : -1) : 0;
    rect(g, x - 5, y - 7, 4, 6 + off, p.pants);
    rect(g, x + 1, y - 7, 4, 6 - off, p.pants);
    rect(g, x - 6, y - 2 + off, 5, 2, p.shoe);
    rect(g, x + 1, y - 2 - off, 5, 2, p.shoe);
  }

  function drawArm(g, p, x, y, side, reach, skinFirst) {
    // side: -1 left, 1 right; reach: extra downward length
    const ax = side < 0 ? x - 7 : x + 5;
    rect(g, ax, y - 15, 2, 7 + reach, p.top);
    rect(g, ax, y - 8 + reach, 2, 2, p.skin);
  }

  function drawHead(g, p, x, y, dir, t, sitting) {
    // y = top of head
    rect(g, x - 4, y + 2, 8, 7, p.skin);
    rect(g, x - 4, y + 8, 8, 1, p.skinShade);
    // hair
    rect(g, x - 5, y, 10, 3, p.hair);
    rect(g, x - 5, y, 2, 7, p.hair);
    rect(g, x + 3, y, 2, 7, p.hair);
    if (dir !== 'up') {
      const eyeY = y + 5;
      if (dir === 'left') {
        rect(g, x - 2, eyeY, 1, 1, '#1c222b');
        rect(g, x + 1, eyeY, 1, 1, '#1c222b');
        rect(g, x - 1, y + 7, 2, 1, p.skinShade);
      } else if (dir === 'right') {
        rect(g, x - 2, eyeY, 1, 1, '#1c222b');
        rect(g, x + 1, eyeY, 1, 1, '#1c222b');
        rect(g, x + 1, y + 7, 2, 1, p.skinShade);
      } else {
        rect(g, x - 2, eyeY, 1, 1, '#1c222b');
        rect(g, x + 1, eyeY, 1, 1, '#1c222b');
      }
    } else {
      rect(g, x - 5, y + 1, 10, 8, p.hair);
      rect(g, x - 3, y + 8, 6, 2, p.hairEdge);
    }
    // accent (scarf/headband)
    rect(g, x - 5, y + 9, 10, 2, p.accent);
    if (sitting) rect(g, x - 4, y + 11, 8, 2, p.top);
  }

  function drawEmployee(g, e, now) {
    const p = e.palette;
    const t = now / 1000;
    const frame = Math.floor((e.animT + e.bob) * 7) % 2;
    const x = Math.round(e.x);
    const y = Math.round(e.y);

    // shadow
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(x, y + 1, e.state === 'sit' ? 9 : 8, 2.5, 0, 0, Math.PI * 2);
    g.fill();

    if (e.state === 'sit') {
      // seated: torso above desk edge
      const ty = y - 13;
      drawHead(g, p, x, ty - 8, 'down', t, true);
      rect(g, x - 5, ty + 3, 10, 12, p.top);
      rect(g, x - 5, ty + 3, 10, 2, p.accent);
      rect(g, x - 5, ty + 13, 10, 2, p.topDark);
      const tap = Math.floor(t * 4) % 2;
      rect(g, x - 7, ty + 6 + tap, 2, 7, p.top);
      rect(g, x + 5, ty + 7 - tap, 2, 6, p.top);
      rect(g, x - 7, ty + 13 + tap, 2, 2, p.skin);
      rect(g, x + 5, ty + 13 - tap, 2, 2, p.skin);
      if (e.working) {
        // typing sparks
        g.fillStyle = 'rgba(126, 227, 195, 0.65)';
        g.fillRect(x - 2 + (tap ? 1 : 0), ty + 14, 1, 1);
        g.fillRect(x + 2 - (tap ? 0 : 1), ty + 15, 1, 1);
      }
      return;
    }

    const walk = e.moving;
    if (e.state === 'phone') {
      drawLegs(g, p, x, y, frame, false);
      rect(g, x - 5, y - 15, 10, 9, p.top);
      rect(g, x - 5, y - 15, 10, 2, p.accent);
      drawArm(g, p, x, y, -1, 0);
      // raised arm with phone
      rect(g, x + 5, y - 18, 2, 6, p.top);
      rect(g, x + 6, y - 18, 3, 5, p.skin);
      rect(g, x + 8, y - 19, 2, 4, '#0f141b');
      drawHead(g, p, x, y - 22, 'down', t, false);
      // ring waves
      const ph = Math.floor(t * 3) % 3;
      g.strokeStyle = 'rgba(255, 214, 94, ' + (0.8 - ph * 0.22) + ')';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x + 11, y - 18, 3 + ph * 2, -1.1, 1.1);
      g.stroke();
      return;
    }

    if (e.state === 'present') {
      drawLegs(g, p, x, y, frame, false);
      rect(g, x - 5, y - 15, 10, 9, p.top);
      rect(g, x - 5, y - 15, 10, 2, p.accent);
      drawArm(g, p, x, y, 1, 0);
      // pointing arm toward whiteboard (character faces up)
      const wave = Math.floor(t * 2) % 2;
      rect(g, x - 7, y - 20 + wave, 2, 7, p.top);
      rect(g, x - 7, y - 21 + wave, 2, 2, p.skin);
      rect(g, x - 13, y - 22 + wave, 6, 1, '#c08a52');
      drawHead(g, p, x, y - 22, 'up', t, false);
      return;
    }

    // standing / walking
    drawLegs(g, p, x, y, frame, walk);
    rect(g, x - 5, y - 15, 10, 9, p.top);
    rect(g, x - 5, y - 15, 10, 2, p.accent);
    rect(g, x - 5, y - 7, 10, 1, p.topDark);
    const swing = walk ? (frame === 0 ? 1 : 0) : 0;
    drawArm(g, p, x, y, -1, swing ? 1 : 0);
    drawArm(g, p, x, y, 1, swing ? 0 : 1);
    drawHead(g, p, x, y - 22, e.dir, t, false);
  }

  function drawStatusIcon(g, x, y, state) {
    if (state === 'sit') {
      rect(g, x, y, 6, 4, '#5bdcff');
      rect(g, x + 1, y + 4, 4, 1, '#5bdcff');
      rect(g, x + 2, y + 5, 2, 1, '#5bdcff');
    } else if (state === 'phone') {
      rect(g, x, y + 1, 2, 4, '#ffd65e');
      rect(g, x + 4, y + 1, 2, 4, '#ffd65e');
      rect(g, x, y, 6, 2, '#ffd65e');
    } else if (state === 'present') {
      rect(g, x, y, 6, 5, '#e8eef4');
      rect(g, x + 1, y + 1, 4, 3, '#2b6ec9');
      rect(g, x + 2, y + 5, 2, 1, '#8b98a6');
    } else if (state === 'walk') {
      rect(g, x, y + 2, 2, 3, '#9fb3c8');
      rect(g, x + 3, y, 2, 3, '#9fb3c8');
    } else {
      rect(g, x + 1, y + 1, 4, 4, '#5a6c80');
    }
  }

  function drawEmployeeLabel(g, e) {
    const x = Math.round(e.x);
    const topY = e.state === 'sit' ? e.y - 42 : e.y - 34;
    const label = e.name.toUpperCase();
    const w = textWidth(label, 1, 1) + 12;
    const bx = Math.round(x - w / 2);
    rect(g, bx, topY, w, 9, 'rgba(8, 13, 18, 0.86)');
    rect(g, bx, topY, w, 1, e.working ? '#ffc145' : '#27bd51');
    drawStatusIcon(g, bx + 3, topY + 2, e.state);
    drawText(g, label, bx + 11, topY + 2, '#d7e3f0', 1, 1);
    if (e.unread > 0) {
      rect(g, bx + w + 2, topY, 8, 8, '#ffc145');
      drawText(g, String(Math.min(9, e.unread)), bx + 4 + w + 2, topY + 1, '#1a1206', 1, 1);
    }
    if (e.working) {
      // working progress shimmer
      const p = (performance.now() / 600) % 1;
      rect(g, bx, topY + 9, w, 2, '#1a2431');
      rect(g, bx + Math.floor(w * p * 0.4), topY + 9, Math.ceil(w * 0.3), 2, '#ffc145');
    }
  }

  function wrapLines(text, maxChars) {
    const words = String(text).toUpperCase().split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxChars) {
        if (line) lines.push(line.trim());
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    if (line) lines.push(line.trim());
    return lines.slice(0, 3);
  }

  function drawBubble(g, e) {
    if (!e.bubble) return;
    const lines = wrapLines(e.bubble.text, 26);
    const w = Math.max(...lines.map((l) => textWidth(l, 1, 1))) + 10;
    const h = lines.length * 7 + 6;
    const x = Math.round(e.x - w / 2);
    const y = Math.round((e.state === 'sit' ? e.y - 42 : e.y - 34) - h - 4);
    rect(g, x + 1, y, w - 2, h, '#0a0f14');
    rect(g, x, y + 1, w, h - 2, '#f4f8fc');
    rect(g, x + 1, y + 1, w - 2, 1, '#ffffff');
    const tx = Math.round(e.x) - 2;
    rect(g, tx, y + h, 4, 3, '#f4f8fc');
    rect(g, tx - 1, y + h + 3, 6, 1, '#0a0f14');
    lines.forEach((line, i) => {
      drawText(g, line, x + 5, y + 4 + i * 7, '#111820', 1, 1);
    });
  }

  /* ================= game state ================= */
  let employees = [];
  let rooms = [];
  let hover = null;
  let active = null;
  let connected = false;
  let officeUser = null;
  let lastRosterKeys = '';
  const rosterChips = new Map();
  const el = (id) => document.getElementById(id);

  function spawnEmployees(wakers, demo) {
    employees = wakers.map((w, i) => new Employee({
      id: w.id,
      name: w.name,
      role: w.role,
      status: w.status,
      demo
    }, i));
    setTimeout(() => {
      const snow = employees.find((e) => e.name === 'Snow');
      if (snow) snow.say('Morning! Ready for today.', 4);
      const winter = employees.find((e) => e.name === 'Winter');
      if (winter) winter.say('Calling the principal first.', 4);
    }, 1400);
  }

  function makeRoom(g) {
    return {
      id: g.id,
      name: g.name || 'Group',
      role: g.role || 'GROUP CONVERSATION',
      isGroup: true,
      demo: false,
      runner: 'group',
      online: true,
      working: false,
      messages: [],
      history: null,
      unread: 0,
      palette: PALETTES.default,
      say() {},
      startTask() { this.working = true; },
      finishTask() { this.working = false; },
      statusLabel() {
        const n = this.messages.length;
        return `SHARED THREAD${n ? ' · ' + n + ' MESSAGES' : ''}`;
      }
    };
  }

  function updateHud() {
    const sub = el('hud-sub');
    const conn = el('conn');
    if (connected) {
      conn.textContent = 'LIVE';
      conn.classList.add('online');
      conn.classList.remove('offline');
      sub.textContent = (officeUser ? officeUser.toUpperCase() + ' · ' : '') + employees.length + ' WAKERS · QODERWAKE DAEMON ONLINE';
    } else {
      conn.textContent = 'OFFLINE';
      conn.classList.remove('online');
      conn.classList.add('offline');
      sub.textContent = 'QODERWAKE DAEMON UNREACHABLE — DEMO MODE';
    }
    const roster = el('roster');
    const keys = employees.map((e) => 'e:' + e.id).join(',') + '#' + rooms.map((r) => 'r:' + r.id).join(',');
    if (keys !== lastRosterKeys) {
      lastRosterKeys = keys;
      roster.innerHTML = '';
      rosterChips.clear();
      for (const e of employees) {
        const chip = document.createElement('button');
        chip.type = 'button';
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = e.palette.top;
        const nm = document.createElement('span');
        nm.textContent = e.name.toUpperCase();
        const st = document.createElement('span');
        st.className = 'chip-status';
        chip.append(sw, nm, st);
        chip.addEventListener('click', () => openChat(e));
        rosterChips.set('e:' + e.id, chip);
        roster.appendChild(chip);
      }
      for (const r of rooms) {
        const chip = document.createElement('button');
        chip.type = 'button';
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = '#7fe3c3';
        const nm = document.createElement('span');
        nm.textContent = r.name.toUpperCase();
        const st = document.createElement('span');
        st.className = 'chip-status';
        st.textContent = 'GROUP';
        chip.append(sw, nm, st);
        chip.addEventListener('click', () => openChat(r));
        rosterChips.set('r:' + r.id, chip);
        roster.appendChild(chip);
      }
    }
    for (const e of employees) {
      const chip = rosterChips.get('e:' + e.id);
      if (!chip) continue;
      chip.className = 'chip' + (e.isAdmin ? ' admin' : '') + (active === e ? ' active' : '');
      chip.children[1].textContent = e.name.toUpperCase();
      chip.lastChild.textContent = e.working ? 'WORKING' : e.isAdmin ? 'ADMIN' : e.state === 'walk' ? 'WALK' : e.state === 'sit' ? 'DESK' : e.state === 'phone' ? 'CALL' : e.state === 'present' ? 'BOARD' : 'IDLE';
    }
    for (const r of rooms) {
      const chip = rosterChips.get('r:' + r.id);
      if (chip) chip.className = 'chip room' + (active === r ? ' active' : '');
    }
  }

  function resize() {
    document.documentElement.style.setProperty('--hud-height', el('hud').getBoundingClientRect().height + 'px');
    const stage = el('stage');
    const availW = stage.clientWidth - 40;
    const availH = stage.clientHeight - 40;
    const scale = Math.max(1, Math.floor(Math.min(availW / W, availH / H)));
    canvas.style.width = W * scale + 'px';
    canvas.style.height = H * scale + 'px';
  }
  window.addEventListener('resize', resize);

  /* ================= chat UI ================= */
  const chat = el('chat');
  const chatLog = el('chat-log');
  const chatName = el('chat-name');
  const chatRole = el('chat-role');
  const chatStatus = el('chat-status-text');
  const chatDot = el('chat-dot');
  const chatBanner = el('chat-banner');
  const adminControls = el('admin-controls');
  const adminApprovalStatus = el('admin-approval-status');
  const adminConsole = el('admin-console');
  const adminHistory = el('admin-history');
  let showAdminHistory = false;
  const input = el('chat-input');
  const sendBtn = el('send');
  const quick = el('quick-tasks');
  const portrait = el('chat-portrait');
  const pctx = portrait.getContext('2d');
  pctx.imageSmoothingEnabled = false;

  const QUICK_TASKS = {
    wakeadmin: [
      'Cek daftar waker dan role sekarang, read-only tanpa perubahan.',
      'Bantu susun waker baru: tanyakan nama, role, tools dan permission yang gw inginkan.',
      'Review workflow BaaS sekarang dan jelaskan alurnya tanpa menjalankan atau mengubah workflow.'
    ],
    snow: [
      'Give me a status update on the BaaS pipeline',
      'Draft a renewal proposal for the principal account',
      'Summarize my unread emails and flag urgent ones'
    ],
    winter: [
      'Update the BaaS pricing sheet for new projects',
      'Write the product roadmap update for this sprint',
      'Review Snow\'s latest proposal and leave notes'
    ],
    summer: [
      'Summarize where we left off with the MSV NGCE deployment',
      'What is the current config status, and what is still pending?',
      'Give me the next three actions for the MSV rollout'
    ],
    default: [
      'Give me a quick status update',
      'Summarize what you are working on',
      'Draft a short report'
    ],
    group: [
      'Summarize the latest handoff in this thread',
      'What is the next step for PT. SMSAN?',
      'Who is blocking the BoQ right now?'
    ]
  };

  let sending = false;
  let sendingFor = null;
  let pollTimer = null;

  function drawPortrait(e) {
    pctx.clearRect(0, 0, 36, 48);
    pctx.fillStyle = '#0a0f15';
    pctx.fillRect(0, 0, 36, 48);
    // backdrop
    pctx.fillStyle = '#101a24';
    pctx.fillRect(0, 0, 36, 48);
    pctx.fillStyle = '#16222e';
    pctx.fillRect(4, 32, 28, 16);
    // pixel bust scaled 4x from 9x12
    const p = e.palette;
    const px = (x, y, w, h, c) => { pctx.fillStyle = c; pctx.fillRect(4 + x * 3, 4 + y * 3, w * 3, h * 3); };
    px(1, 0, 7, 2, p.hair);
    px(0, 1, 9, 3, p.hair);
    px(1, 4, 7, 4, p.skin);
    px(2, 5, 1, 1, '#1c222b');
    px(6, 5, 1, 1, '#1c222b');
    px(3, 7, 3, 1, p.skinShade);
    px(1, 8, 7, 1, p.accent);
    px(0, 9, 9, 3, p.top);
    px(1, 9, 7, 1, p.topDark);
    pctx.fillStyle = 'rgba(255,255,255,0.03)';
    pctx.fillRect(0, 0, 36, 2);
  }

  function setHeader(e) {
    chatName.textContent = e.name;
    chatRole.textContent = e.role;
    drawPortrait(e);
    updateChatStatus();
  }

  function updateChatStatus() {
    if (!active) return;
    adminControls.hidden = !active.isAdmin;
    chat.classList.toggle('admin-mode', !!active.isAdmin);
    adminConsole.hidden = !active.isAdmin || showAdminHistory;
    chatLog.hidden = !!active.isAdmin && !showAdminHistory;
    if (active.isAdmin) {
      if (!adminConsole.hasAttribute('src')) adminConsole.src = el('admin-console-link').href;
      adminHistory.textContent = showAdminHistory ? 'KEMBALI KE SESI INTERAKTIF' : 'RIWAYAT CHAT LAMA';
      adminHistory.setAttribute('aria-pressed', String(showAdminHistory));
      const approvals = active.adminApprovals;
      adminApprovalStatus.textContent = approvals?.error
        || (approvals?.pending == null ? 'Status approval belum tersedia; periksa sesi Console.'
          : approvals.pending > 0 ? `${approvals.pending} approval menunggu keputusan lo di sesi Console terkait.`
          : 'Belum ada approval terdeteksi. Persetujuan hanya lewat kontrol resmi Console; bukan otomatis.');
      chatStatus.textContent = showAdminHistory ? 'RIWAYAT GROUP · READ ONLY'
        : approvals?.pending > 0 ? 'WAITING FOR YOUR APPROVAL' : 'QODERWAKE · NATIVE CONSOLE';
      chatDot.className = 'dot' + (approvals?.pending > 0 ? ' busy' : connected ? '' : ' off');
      return;
    }
    if (active.isGroup) {
      chatStatus.textContent = active.statusLabel();
      chatDot.className = 'dot' + (connected ? '' : ' off');
      return;
    }
    if (active.runner === 'qwen') {
      const h = active.history || {};
      const busy = h.running || h.queued > 0 || active.working;
      chatDot.className = 'dot' + (busy ? ' busy' : connected ? '' : ' off');
      if (busy) chatStatus.textContent = 'Qwen working in msv' + (h.queued ? ` · ${h.queued} queued` : '');
      else if (h.total) chatStatus.textContent = `${h.label || 'Qwen Code'} · ${h.total} messages resumed`;
      else chatStatus.textContent = 'Qwen Code · msv';
      return;
    }
    chatStatus.textContent = active.statusLabel();
    chatDot.className = 'dot' + (active.working ? ' busy' : active.demo || connected ? '' : ' off');
  }

  function fmtTime(ts) {
    const d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderLog() {
    if (!active) return;
    const stick = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 80;
    chatLog.innerHTML = '';
    const h = active.history;
    if (h && (h.total || h.error)) {
      const bar = document.createElement('div');
      bar.className = 'msg sys history';
      const bits = [];
      if (h.total) bits.push(`${h.label || 'Qwen Code'} · ${h.total} messages in session history`);
      if (h.error) bits.push(h.error);
      bar.textContent = bits.join(' · ');
      if (h.total && h.hasOlder && h.oldestSeq != null) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history-more';
        btn.textContent = 'LOAD OLDER';
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'LOADING…';
          await loadMessages(h.oldestSeq);
        });
        bar.appendChild(btn);
      }
      chatLog.appendChild(bar);
    }
    if (active.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'msg sys';
      if (active.runner === 'qwen') {
        empty.textContent = active.history ? 'No messages in this session yet. Assign a task below.' : 'Loading Qwen session history…';
      } else {
        empty.textContent = 'No messages yet. Assign a task below.';
      }
      chatLog.appendChild(empty);
    }
    for (const m of active.messages) {
      const div = document.createElement('div');
      div.className = 'msg ' + (m.side === 'me' ? 'me' : 'them');
      const body = document.createElement('span');
      body.textContent = m.text;
      const meta = document.createElement('span');
      meta.className = 'meta';
      const who = m.side === 'me' ? 'YOU' : (m.speaker ? m.speaker.toUpperCase() : active.name.toUpperCase());
      meta.textContent = who + (m.ts ? ' · ' + fmtTime(m.ts) : '');
      div.append(body, meta);
      chatLog.appendChild(div);
    }
    const qwenBusy = active.runner === 'qwen' && active.history && (active.history.running || active.history.queued > 0);
    if ((sending && active === sendingFor) || qwenBusy) {
      const tip = document.createElement('div');
      tip.className = 'typing';
      tip.textContent = active.runner === 'qwen'
        ? 'QWEN IS WORKING IN MSV' + (active.history?.queued ? ` · ${active.history.queued} QUEUED` : '')
        : active.name.toUpperCase() + ' IS WORKING ON IT';
      chatLog.appendChild(tip);
    }
    if (stick) chatLog.scrollTop = chatLog.scrollHeight;
  }

  function mergeMessages(list, target = active) {
    if (!target) return;
    const byId = new Map();
    for (const m of target.messages) byId.set(m.id, m);
    for (const m of list) byId.set(m.id, m);
    let all = [...byId.values()];
    // drop optimistic echoes once the backend confirms the same text
    const confirmed = new Set(
      all.filter((m) => !String(m.id).startsWith('local-') && m.side === 'me').map((m) => m.text)
    );
    all = all.filter((m) => !(String(m.id).startsWith('local-') && confirmed.has(m.text)));
    target.messages = all.sort((a, b) => {
      const ta = Date.parse(a.ts) || 0;
      const tb = Date.parse(b.ts) || 0;
      return ta - tb || (a.seq || 0) - (b.seq || 0);
    });
  }

  async function loadMessages(before, target = active) {
    if (!target || target.demo) { renderLog(); return null; }
    const anchor = before != null ? chatLog.scrollHeight - chatLog.scrollTop : null;
    try {
      let url = '/api/messages?agentId=' + encodeURIComponent(target.id);
      if (before != null) url += '&before=' + before + '&limit=600';
      const res = await fetch(url);
      const data = await res.json();
      if (target.isAdmin && data.adminApprovals) target.adminApprovals = data.adminApprovals;
      if (Array.isArray(data.messages)) mergeMessages(data.messages, target);
      if (data && (data.total != null || data.running != null || data.error)) {
        const h = target.history || { oldestSeq: null };
        if (typeof data.total === 'number') h.total = data.total;
        if (data.label) h.label = data.label;
        if (before != null) {
          h.hasOlder = !!data.hasOlder;
          if (data.oldestSeq != null) h.oldestSeq = h.oldestSeq == null ? data.oldestSeq : Math.min(h.oldestSeq, data.oldestSeq);
        } else if (h.oldestSeq == null && data.oldestSeq != null) {
          h.oldestSeq = data.oldestSeq;
          h.hasOlder = !!data.hasOlder;
        }
        h.running = !!data.running;
        h.queued = data.queued || 0;
        if (data.runner === 'qwen') h.error = data.error || null;
        target.history = h;
      }
      if (active === target) {
        renderLog();
        if (anchor != null) chatLog.scrollTop = Math.max(0, chatLog.scrollHeight - anchor);
        updateChatStatus();
      }
      return data;
    } catch { return null; }
  }

  function banner(text) {
    if (!text) { chatBanner.hidden = true; return; }
    chatBanner.hidden = false;
    chatBanner.textContent = text;
  }

  function openChat(e) {
    active = e;
    e.unread = 0;
    chat.classList.add('open');
    chat.classList.remove('closed');
    chat.setAttribute('aria-hidden', 'false');
    document.getElementById('app').classList.add('chat-open');
    setHeader(e);
    banner(null);
    if (!connected) banner('Demo mode: QoderWake daemon not reachable. Messages stay local.');
    setTimeout(resize, 220);
    quick.innerHTML = '';
    const tasks = e.isAdmin ? QUICK_TASKS.wakeadmin : e.isGroup ? QUICK_TASKS.group : QUICK_TASKS[e.name.toLowerCase()] || QUICK_TASKS.default;
    for (const t of tasks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t;
      b.addEventListener('click', () => {
        input.value = t;
        input.focus();
      });
      quick.appendChild(b);
    }
    renderLog();
    loadMessages();
    updateHud();
    updateChatStatus();
    sendBtn.disabled = e.isAdmin || sendingFor === e;
    if (!e.isAdmin) input.focus();
    resize();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(loadMessages, 9000);
  }

  function closeChat() {
    chat.classList.remove('open');
    chat.classList.add('closed');
    chat.setAttribute('aria-hidden', 'true');
    document.getElementById('app').classList.remove('chat-open');
    active = null;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    updateHud();
    resize();
  }

  el('chat-close').addEventListener('click', closeChat);
  adminHistory.addEventListener('click', () => {
    if (!active?.isAdmin) return;
    showAdminHistory = !showAdminHistory;
    updateChatStatus();
    renderLog();
  });

  function demoReply(emp) {
    const name = emp.name.toLowerCase();
    const replies = {
      snow: 'Got it — I\'ll pull the latest pipeline numbers and have a draft to you shortly. (Demo mode: connect QoderWake to run me live.)',
      winter: 'Noted. I\'ll update the product pricing sheet and share the roadmap notes after. (Demo mode: connect QoderWake to run me live.)',
      summer: 'Understood. I\'ll map the solution architecture and drop the diagram in the thread. (Demo mode: connect QoderWake to run me live.)'
    };
    return replies[name] || 'Acknowledged. I\'ll get on that right away. (Demo mode: connect QoderWake to run me live.)';
  }

  let pending = null; // { target, seen:Set, startedAt, timer }

  function newReply(target, seen, since) {
    return target.messages.find((m) => {
      if (m.side !== 'them' || seen.has(m.id)) return false;
      const ts = Date.parse(m.ts);
      return !ts || ts >= since - 5000;
    }) || null;
  }

  function settle(target, replyText) {
    if (pending && pending.target === target) {
      clearTimeout(pending.timer);
      pending = null;
    }
    if (sendingFor === target) {
      sending = false;
      sendingFor = null;
      sendBtn.disabled = false;
    }
    if (target.history) {
      target.history.running = false;
      target.history.queued = 0;
    }
    target.finishTask(replyText || null);
    if (active === target) { renderLog(); updateChatStatus(); }
    updateHud();
  }

  async function pollPending() {
    if (!pending) return;
    const { target, seen, startedAt } = pending;
    try {
      const data = await loadMessages(undefined, target);
      if (data) {
        const busy = !!(data.running || data.queued > 0);
        pending.busy = busy;
        if (data.accepted) pending.accepted = true;
        const reply = newReply(target, seen, startedAt);
        if (reply) { settle(target, reply.text); return; }
        if (target.runner === 'qwen' && pending.accepted && !busy && data.error) {
          target.messages.push({ id: 'err-' + Date.now(), seq: (target.messages.at(-1)?.seq || 0) + 1, text: 'Qwen stopped: ' + data.error, side: 'them', ts: new Date().toISOString() });
          target.say('That run hit a problem.', 4);
          settle(target, null);
          return;
        }
        if (target.runner === 'qwen' && pending.accepted && !busy && !data.error && Date.now() - startedAt > 20000) {
          target.messages.push({ id: 'empty-' + Date.now(), seq: (target.messages.at(-1)?.seq || 0) + 1, text: 'Qwen finished the run but no new reply landed in the session. Try asking it again.', side: 'them', ts: new Date().toISOString() });
          settle(target, null);
          return;
        }
      }
    } catch { /* try again */ }
    const grace = pending.busy ? 1920000 : 360000;
    if (Date.now() - startedAt > grace) {
      const tail = pending.lastError ? ` (${pending.lastError})` : '';
      target.messages.push({ id: 'slow-' + Date.now(), seq: (target.messages.at(-1)?.seq || 0) + 1, text: 'No reply yet — the agent may still be running. Check back later.' + tail, side: 'them', ts: new Date().toISOString() });
      settle(target, null);
      return;
    }
    pending.timer = setTimeout(pollPending, target.runner === 'qwen' ? 5000 : 4000);
  }

  async function sendMessage(text) {
    if (!active || active.isAdmin || sendingFor === active) return;
    const target = active;
    const seen = new Set(target.messages.filter((m) => m.side === 'them').map((m) => m.id));
    const startedAt = Date.now();
    const localId = 'local-' + Date.now();
    target.messages.push({ id: localId, seq: (target.messages.at(-1)?.seq || 0) + 0.5, text, side: 'me', ts: new Date().toISOString() });
    sending = true;
    sendingFor = target;
    sendBtn.disabled = true;
    target.startTask();
    target.say('On it — give me a moment.', 4);
    renderLog();
    updateHud();
    updateChatStatus();

    try {
      if (target.demo) {
        await new Promise((r) => setTimeout(r, 1400 + Math.random() * 900));
        target.messages = target.messages.filter((m) => m.id !== localId);
        target.messages.push({ id: 'demo-' + Date.now(), seq: (target.messages.at(-1)?.seq || 0) + 1, text, side: 'me', ts: new Date().toISOString() });
        target.messages.push({ id: 'demo-r-' + Date.now(), seq: (target.messages.at(-1)?.seq || 0) + 1, text: demoReply(target), side: 'them', ts: new Date().toISOString() });
        settle(target, 'Got it! (demo)');
      } else {
        // the CLI send call can block for over a minute, so poll for the
        // reply right away instead of waiting on the POST response
        pending = { target, seen, startedAt, lastError: null, accepted: false, busy: false, timer: null };
        pending.timer = setTimeout(pollPending, 3000);
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId: target.id, text })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
        if (!pending || pending.target !== target) return; // reply already arrived via polling
        if (data.accepted) pending.accepted = true;
        if (Array.isArray(data.messages)) {
          mergeMessages(data.messages, target);
        const reply = newReply(target, seen, startedAt);
        if (reply) { settle(target, reply.text); return; }
          if (active === target) renderLog();
        }
      }
    } catch (err) {
      if (!pending || pending.target !== target) return;
      const definitive = !/tim(ed)?\s*out|timeout|network|fetch/i.test(err.message);
      if (definitive) {
        target.messages.push({ id: 'err-' + Date.now(), seq: (target.messages.at(-1)?.seq || 0) + 1, text: 'Could not deliver: ' + err.message, side: 'them', ts: new Date().toISOString() });
        target.say('Hmm, that did not go through.', 3);
        settle(target, null);
      } else {
        // the message may still have landed; keep polling for the reply
        pending.lastError = err.message;
      }
    }
  }

  el('chat-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendMessage(text);
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      el('chat-form').requestSubmit();
    }
  });

  /* ================= bootstrap ================= */
  const DEMO_WAKERS = [
    { id: 'demo-snow', name: 'Snow', role: 'Account Manager · Managed Backup as a Service', status: 'offline', demo: true },
    { id: 'demo-winter', name: 'Winter', role: 'Product Manager · Managed Backup as a Service', status: 'offline', demo: true },
    { id: 'demo-summer', name: 'Summer', role: 'Solution Architect · Managed Backup as a Service', status: 'offline', demo: true }
  ];

  let retryTimer = null;

  function scheduleRetry() {
    if (retryTimer || connected) return;
    retryTimer = setTimeout(() => { retryTimer = null; if (!connected) loadOffice(true); }, 6000);
  }

  async function loadOffice(force) {
    try {
      const res = await fetch('/api/office' + (force ? '?refresh=1' : ''));
      const data = await res.json();
      connected = !!data.connected;
      officeUser = data.user || null;
      if (data.connected && Array.isArray(data.wakers) && data.wakers.length) {
        const prev = new Map(employees.map((e) => [e.id, e]));
        const next = data.wakers.map((w, i) => {
          const existing = prev.get(w.id);
          if (existing) {
            existing.role = w.role || existing.role;
            existing.runner = w.runner || existing.runner;
            existing.isAdmin = !!w.isAdmin;
            existing.name = w.name;
            existing.online = w.status !== 'offline';
            return existing;
          }
          return new Employee({ id: w.id, name: w.name, role: w.role, status: w.status, runner: w.runner, isAdmin: w.isAdmin }, i);
        });
        const first = employees.length === 0;
        employees = next;
        const prevRooms = new Map(rooms.map((r) => [r.id, r]));
        rooms = (data.groups || []).map((g) => {
          const existing = prevRooms.get(g.id);
          if (existing) {
            existing.name = g.name || existing.name;
            existing.role = g.role || existing.role;
            return existing;
          }
          return makeRoom(g);
        });
        if (active) active = employees.find((e) => e.id === active.id) || rooms.find((r) => r.id === active.id) || null;
        if (first) {
          setTimeout(() => {
            const snow = employees.find((e) => e.name === 'Snow');
            if (snow) snow.say('Morning! Ready for today.', 4);
            const winter = employees.find((e) => e.name === 'Winter');
            if (winter) winter.say('Calling the principal first.', 4);
          }, 1400);
        }
      } else if (employees.length === 0) {
        spawnEmployees(DEMO_WAKERS, true);
      }
    } catch {
      connected = false;
      if (employees.length === 0) spawnEmployees(DEMO_WAKERS, true);
    }
    updateHud();
    if (active) setHeader(active);
    resize();
    scheduleRetry();
  }

  el('conn').title = 'Click to reconnect';
  el('conn').addEventListener('click', () => loadOffice(true));
  el('conn').style.cursor = 'pointer';

  function tickClock() {
    const d = new Date();
    el('clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  setInterval(tickClock, 1000);
  tickClock();

  let lastHud = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - (loop.prev || now)) / 1000);
    loop.prev = now;
    for (const e of employees) e.update(dt);
    // overlaps: gently push apart standing characters
    for (let i = 0; i < employees.length; i++) {
      for (let j = i + 1; j < employees.length; j++) {
        const a = employees[i], b = employees[j];
        if (a.state === 'sit' || b.state === 'sit') continue;
        if (a.state !== 'walk' && b.state !== 'walk') {
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < 14 && d > 0.01) {
            a.x -= (dx / d) * 0.2; a.y -= (dy / d) * 0.2;
            b.x += (dx / d) * 0.2; b.y += (dy / d) * 0.2;
          }
        }
      }
    }
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    // animated glows
    const glow = 0.1 + Math.sin(now / 600) * 0.04;
    for (const desk of [36, 188, 340]) {
      const gr = ctx.createRadialGradient(desk + 33, 208, 2, desk + 33, 208, 26);
      gr.addColorStop(0, 'rgba(91, 220, 255, ' + glow + ')');
      gr.addColorStop(1, 'rgba(91, 220, 255, 0)');
      ctx.fillStyle = gr;
      ctx.fillRect(desk + 5, 190, 56, 36);
    }
    const sorted = [...employees].sort((a, b) => a.y - b.y);
    for (const e of sorted) drawEmployee(ctx, e, now);
    for (const e of sorted) drawEmployeeLabel(ctx, e);
    for (const e of sorted) drawBubble(ctx, e);
    if (hover) {
      const e = hover;
      ctx.strokeStyle = 'rgba(39, 189, 81, 0.9)';
      ctx.lineWidth = 1;
      const w = 20;
      const x = Math.round(e.x - w / 2);
      const top = Math.round((e.state === 'sit' ? e.y - 44 : e.y - 26));
      const h = Math.round(e.y + 4 - top);
      ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h);
      rect(ctx, x + 2, top - 2, 4, 1, '#27bd51');
      rect(ctx, x + w - 6, top - 2, 4, 1, '#27bd51');
    }
    if (now - lastHud > 600) {
      lastHud = now;
      updateHud();
      if (active) updateChatStatus();
    }
    requestAnimationFrame(loop);
  }

  function toInternal(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * W,
      y: ((ev.clientY - r.top) / r.height) * H
    };
  }

  function charAt(x, y) {
    for (const e of [...employees].reverse()) {
      const top = e.state === 'sit' ? e.y - 30 : e.y - 26;
      if (x > e.x - 11 && x < e.x + 11 && y > top && y < e.y + 6) return e;
    }
    return null;
  }

  canvas.addEventListener('pointermove', (ev) => {
    const p = toInternal(ev);
    hover = charAt(p.x, p.y);
    canvas.classList.toggle('pointing', !!hover);
  });
  canvas.addEventListener('pointerleave', () => { hover = null; canvas.classList.remove('pointing'); });
  canvas.addEventListener('pointerdown', (ev) => {
    const p = toInternal(ev);
    const hit = charAt(p.x, p.y);
    if (hit) openChat(hit);
  });

  loadOffice(false);
  setInterval(() => { if (!document.hidden) loadOffice(false); }, 30000);
  resize();
  requestAnimationFrame(loop);

  window.__office = {
    employees: () => employees.map((e) => ({ id: e.id, name: e.name, x: e.x, y: e.y, state: e.state, action: e.action && e.action.type, connected })),
    pending: () => (pending ? pending.target.name : null),
    open: (name) => { const e = employees.find((c) => c.name.toLowerCase() === String(name).toLowerCase()); if (e) openChat(e); return !!e; }
  };
})();
