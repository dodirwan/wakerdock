(() => {
  'use strict';

  const canvas = document.getElementById('office');
  const ctx = canvas.getContext('2d');
  const twin = window.OfficeTwin;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let animate = !reducedMotion.matches;
  let frameRequest = null;
  let lastFrame = 0;
  let frameCount = 0;
  let lastDrawMs = 0;
  let motionTime = 0;
  let dirty = true;
  let zoom = 1;
  let hldOpen = false;
  let hldZoom = 100;
  let hldMaxZoom = 250;

  /* ================= layout ================= */
  const SPOTS = {
    snowDesk: { x: 70, y: 190, fx: 70, fy: 196 },
    winterDesk: { x: 222, y: 190, fx: 222, fy: 196 },
    summerDesk: { x: 374, y: 190, fx: 374, fy: 196 },
    adminDesk: { x: 324, y: 110, fx: 324, fy: 116 },
    guide: { x: 162.5, y: 12 },
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
    { x: 155, y: 100, w: 95, h: 40 },
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
      top: '#54cfa0', topDark: '#278e68', pants: '#24395a', shoe: '#101820', accent: '#ffffff'
    },
    winter: {
      hair: '#3c2f57', hairEdge: '#2a2040', skin: '#edc096', skinShade: '#c99671',
      top: '#63c9e9', topDark: '#318caf', pants: '#1a2740', shoe: '#0c1320', accent: '#d7f5ff'
    },
    summer: {
      hair: '#c9762f', hairEdge: '#9c571f', skin: '#f4c99c', skinShade: '#d9a877',
      top: '#ffc145', topDark: '#dd9a1f', pants: '#b4552d', shoe: '#3a1c12', accent: '#ff8a5b'
    },
    'ai.msp': {
      top: '#b9e4eb', topDark: '#7c9da9', pants: '#9aa7b6', shoe: '#243c49', accent: '#6ee6f1'
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
      this.stationary = this.name.toLowerCase() === 'ai.msp';
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
        { x: 130, y: 160 }, { x: 300, y: 96 }, { x: SPOTS.board.x, y: SPOTS.board.y },
        { x: 380, y: 150 }, { x: 240, y: 210 }, { x: 130, y: 180 }
      ];
      const st = this.stationary ? SPOTS.guide : starts[index % starts.length];
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
      if (this.stationary) return;
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
      this.bubble = { text, until: motionTime + seconds * 1000 };
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
      if (this.stationary) return;
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
      if (this.stationary) return;
      this.queue = [{ type: 'pause', dur: 1.6 }];
      this.refill(1);
    }

    update(dt) {
      if (this.bubble && motionTime > this.bubble.until) this.bubble = null;
      if (this.stationary) return;
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
      return this.demo ? 'Demo · integrasi offline' : 'Terhubung · gerakan karakter ilustratif';
    }
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
      chip.lastChild.textContent = e.demo ? 'DEMO' : !connected || !e.online ? 'OFFLINE' : e.working ? 'WORKING' : e.isAdmin ? 'ADMIN' : e.runner === 'qwen' ? 'QWEN' : 'WAKE';
      chip.setAttribute('aria-pressed', String(active === e));
    }
    for (const r of rooms) {
      const chip = rosterChips.get('r:' + r.id);
      if (chip) {
        chip.className = 'chip room' + (active === r ? ' active' : '');
        chip.setAttribute('aria-pressed', String(active === r));
      }
    }
    requestDraw();
  }

  function resize() {
    document.documentElement.style.setProperty('--hud-height', el('hud').getBoundingClientRect().height + 'px');
    const viewport = el('office-viewport');
    let reserve = 0;
    if (hldOpen) {
      fitHldFrame(viewport);
      const origin = viewport.getBoundingClientRect();
      const panel = el('hld-hologram').getBoundingClientRect();
      const roof = twin.project(0, 0, 101);
      const next = twin.project(1, 0, 101);
      const slope = (next.y - roof.y) / (next.x - roof.x);
      const wallOffset = roof.y + (twin.width / 2 - roof.x) * slope;
      for (let pass = 0; pass < 3; pass++) {
        const available = viewport.clientHeight - reserve;
        const widthLimited = viewport.clientWidth / twin.width <= available / twin.height;
        const scale = Math.min(viewport.clientWidth / twin.width, available / twin.height) * zoom;
        const left = (viewport.clientWidth - twin.width * scale) / 2;
        const top = reserve + (available - twin.height * scale) / 2;
        const wallY = top + roof.y * scale + (panel.left - origin.left - left - roof.x * scale) * slope;
        const gap = panel.bottom - origin.top + 20 - wallY;
        if (gap <= 0) break;
        const shift = widthLimited ? 0.5 : 0.5 + zoom * (0.5 - wallOffset / twin.height);
        reserve = Math.min(viewport.clientHeight * 0.85, reserve + gap / shift);
      }
    }
    viewport.style.paddingTop = reserve + 'px';
    const scale = Math.max(0.01, Math.min(viewport.clientWidth / twin.width, (viewport.clientHeight - reserve) / twin.height)) * zoom;
    const width = twin.width * scale;
    const height = twin.height * scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 2200 / width);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(canvas.width / twin.width, 0, 0, canvas.height / twin.height, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const board = twin.board;
    const p = twin.project(board.x, board.y, board.z);
    const horizontal = twin.project(board.x + 1, board.y, board.z);
    const vertical = twin.project(board.x, board.y, board.z - 1);
    const bounds = canvas.getBoundingClientRect();
    const origin = viewport.getBoundingClientRect();
    const button = el('hld-board');
    button.style.width = board.width + 'px';
    button.style.height = board.height + 'px';
    button.style.transform = `matrix(${(horizontal.x - p.x) * scale}, ${(horizontal.y - p.y) * scale}, 0, ${(vertical.y - p.y) * scale}, ${bounds.left - origin.left + p.x * scale}, ${bounds.top - origin.top + p.y * scale})`;
    requestDraw();
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(el('office-viewport'));
  function setZoom(value) {
    zoom = Math.max(0.75, Math.min(1.5, Math.round(value * 100) / 100));
    el('zoom-fit').textContent = Math.round(zoom * 100) + '%';
    el('zoom-out').disabled = zoom <= 0.75;
    el('zoom-in').disabled = zoom >= 1.5;
    resize();
  }
  el('zoom-in').addEventListener('click', () => setZoom(zoom + 0.15));
  el('zoom-out').addEventListener('click', () => setZoom(zoom - 0.15));
  el('zoom-fit').addEventListener('click', () => setZoom(1));

  function updateHldControls() {
    el('hld-zoom-reset').textContent = hldZoom + '%';
    el('hld-zoom-reset').setAttribute('aria-label', `Ukuran frame hologram ${hldZoom}%; kembalikan ke 100%`);
    el('hld-zoom-out').disabled = hldZoom <= 75;
    el('hld-zoom-in').disabled = hldZoom >= hldMaxZoom;
    el('hld-zoom-in').title = `Perbesar frame hologram (maksimum layar ini ${hldMaxZoom}%)`;
  }

  function fitHldFrame(viewport) {
    const panel = el('hld-hologram');
    const style = getComputedStyle(panel);
    const availableWidth = Math.max(1, viewport.clientWidth - parseFloat(style.right) * 2);
    // Leave space below the projection for the office and its wall-board hit target.
    const availableHeight = Math.max(1, viewport.clientHeight * 0.78 - parseFloat(style.top));
    const limit = Math.min(availableWidth / panel.offsetWidth, availableHeight / panel.offsetHeight);
    const fit = Math.min(1, limit);
    hldMaxZoom = Math.max(100, Math.min(250, Math.floor(limit / fit * 4) * 25));
    hldZoom = Math.min(hldZoom, hldMaxZoom);
    panel.style.setProperty('--hld-scale', fit * hldZoom / 100);
    updateHldControls();
  }

  function setHldZoom(value) {
    hldZoom = Math.max(75, Math.min(hldMaxZoom, Math.round(value / 25) * 25));
    updateHldControls();
    resize();
  }
  el('hld-zoom-in').addEventListener('click', () => setHldZoom(hldZoom + 25));
  el('hld-zoom-out').addEventListener('click', () => setHldZoom(hldZoom - 25));
  el('hld-zoom-reset').addEventListener('click', () => setHldZoom(100));
  setHldZoom(100);

  function setHld(open, moveFocus = true) {
    hldOpen = open;
    el('stage').classList.toggle('hld-open', open);
    el('hld-hologram').hidden = !open;
    el('hld-board').setAttribute('aria-expanded', String(open));
    el('hld-board').setAttribute('aria-label', open ? 'Tutup hologram HLD Berca MSP BaaS' : 'Tampilkan hologram HLD Berca MSP BaaS');
    resize();
    if (moveFocus) el(open ? 'helios-hologram' : 'hld-board').focus({ preventScroll: true });
  }
  el('hld-board').addEventListener('click', () => setHld(!hldOpen));
  el('hld-close').addEventListener('click', () => setHld(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && hldOpen) {
      event.preventDefault();
      setHld(false);
    }
  });

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
  const summerControls = el('summer-controls');
  const summerConsoleButton = el('summer-cli-console');
  const summerConsoleStatus = el('summer-console-status');
  const SUMMER_ID = 'a1f397dea1ad';
  let summerConsoleLaunching = false;
  let showAdminHistory = false;
  const input = el('chat-input');
  const sendBtn = el('send');
  const quick = el('quick-tasks');
  const portrait = el('chat-portrait');
  const pctx = portrait.getContext('2d');
  pctx.imageSmoothingEnabled = true;

  const QUICK_TASKS = {
    'ai.msp': [
      'Jelaskan fungsi Snow, Winter, Summer, wakeadmin, dan Ai.MSP di virtual office.',
      'Panduan workflow project baru dan renewal BaaS: urutan role, input, dan output tiap tahap.',
      'Bantu gw menyusun brief task untuk waker yang tepat. Tanyakan kebutuhan dulu; jangan kirim atau jalankan task.',
      'Bagaimana menggunakan chat, grup, board HLD, zoom hologram, dan approval di office?'
    ],
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
    twin.portrait(pctx, e);
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
    summerControls.hidden = active.id !== SUMMER_ID;
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
      } else if (active.name.toLowerCase() === 'ai.msp') {
        empty.textContent = 'Tanya role, workflow, cara memakai office, atau minta bantuan menyusun draft task. Task tidak dikirim otomatis ke waker lain.';
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
    if (hldOpen) setHld(false, false);
    active = e;
    e.unread = 0;
    chat.classList.add('open');
    chat.classList.remove('closed');
    chat.setAttribute('aria-hidden', 'false');
    chat.inert = false;
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
    chat.inert = true;
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

  el('summer-task-chat').addEventListener('click', () => {
    if (active?.id === SUMMER_ID) input.focus();
  });
  summerConsoleButton.addEventListener('click', async () => {
    if (active?.id !== SUMMER_ID || summerConsoleLaunching) return;
    summerConsoleLaunching = true;
    summerConsoleButton.disabled = true;
    summerConsoleButton.textContent = 'Membuka CMD…';
    summerConsoleStatus.hidden = false;
    summerConsoleStatus.classList.remove('error');
    summerConsoleStatus.textContent = 'Meminta jendela Command Prompt baru…';
    try {
      const res = await fetch('/api/summer/console', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: SUMMER_ID }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Permintaan launcher ditolak');
      summerConsoleStatus.textContent = data.message;
    } catch (error) {
      summerConsoleStatus.classList.add('error');
      summerConsoleStatus.textContent = error instanceof TypeError
        ? 'Koneksi launcher terputus. Periksa apakah CMD sudah terbuka sebelum mencoba lagi.'
        : error.message;
    } finally {
      summerConsoleLaunching = false;
      summerConsoleButton.disabled = false;
      summerConsoleButton.textContent = '2. CLI Console ↗';
    }
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

  function requestDraw() {
    dirty = true;
    if (!document.hidden && frameRequest === null) frameRequest = requestAnimationFrame(loop);
  }

  function loop(now) {
    frameRequest = null;
    if (document.hidden) return;
    const elapsed = lastFrame ? now - lastFrame : 1000 / 30;
    if (elapsed >= 1000 / 30) {
      lastFrame = now;
      if (animate) {
        const dt = Math.min(0.05, elapsed / 1000);
        motionTime += dt * 1000;
        for (const e of employees) e.update(dt);
      }
      if (animate || dirty) {
        const started = performance.now();
        twin.draw(ctx, employees, motionTime, { hover, active, animate, boardOpen: hldOpen });
        lastDrawMs = performance.now() - started;
        frameCount++;
        dirty = false;
      }
    }
    if (animate || dirty) frameRequest = requestAnimationFrame(loop);
  }

  function setMotion(enabled) {
    animate = enabled;
    lastFrame = 0;
    el('motion-toggle').textContent = animate ? 'Jeda animasi' : 'Aktifkan animasi';
    el('motion-toggle').setAttribute('aria-pressed', String(!animate));
    el('render-mode').textContent = animate ? 'CANVAS 2D · MAX 30 FPS' : 'CANVAS 2D · ANIMASI DIJEDA';
    requestDraw();
  }
  el('motion-toggle').addEventListener('click', () => setMotion(!animate));
  reducedMotion.addEventListener('change', (event) => setMotion(!event.matches));
  document.addEventListener('visibilitychange', () => {
    if (frameRequest !== null) cancelAnimationFrame(frameRequest);
    frameRequest = null;
    lastFrame = 0;
    if (!document.hidden) requestDraw();
  });

  function toInternal(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * twin.width,
      y: ((ev.clientY - r.top) / r.height) * twin.height
    };
  }

  function charAt(x, y) {
    return twin.hitTest(x, y, employees);
  }

  canvas.addEventListener('pointermove', (ev) => {
    const p = toInternal(ev);
    const next = charAt(p.x, p.y);
    if (next !== hover) {
      hover = next;
      canvas.classList.toggle('pointing', !!hover);
      requestDraw();
    }
  });
  canvas.addEventListener('pointerleave', () => { hover = null; canvas.classList.remove('pointing'); requestDraw(); });
  canvas.addEventListener('pointerdown', (ev) => {
    const p = toInternal(ev);
    const hit = charAt(p.x, p.y);
    if (hit) openChat(hit);
  });

  twin.loadAssets(() => {
    requestDraw();
    if (active) drawPortrait(active);
  });
  loadOffice(false);
  setInterval(() => { if (!document.hidden) loadOffice(false); }, 30000);
  resize();
  setMotion(animate);

  window.__office = {
    renderer: () => ({ ...twin.stats(), animate, zoom, hidden: document.hidden, frameCount, lastDrawMs, backingWidth: canvas.width, backingHeight: canvas.height }),
    employees: () => employees.map((e) => ({ id: e.id, name: e.name, x: e.x, y: e.y, state: e.state, action: e.action && e.action.type, connected })),
    pending: () => (pending ? pending.target.name : null),
    open: (name) => { const e = employees.find((c) => c.name.toLowerCase() === String(name).toLowerCase()); if (e) openChat(e); return !!e; }
  };
})();
