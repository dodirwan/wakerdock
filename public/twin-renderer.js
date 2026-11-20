(function () {
  'use strict';

  const WIDTH = 1200;
  const HEIGHT = 620;
  const X_SCALE = 1.44;
  const Y_SCALE = 0.55;
  const Z_SCALE = 1.4;
  const AVATAR_SCALE = 1.3;
  const FONT = '"Segoe UI", Arial, sans-serif';
  const C = {
    navy: '#203342', ink: '#d7dfdc', muted: '#87958f',
    floor: '#958a79', grout: '#7f786e', wood: '#ae855c',
    woodEdge: '#78583f', woodLight: '#c29b70',
    green: '#51967b', cyan: '#54a5b8', amber: '#d4a14e', purple: '#9482be'
  };
  const defaults = [C.green, C.cyan, C.amber, C.purple];
  const board = { x: 27, y: 0, z: 94, width: 113, height: 64 };
  const boardImage = new Image();
  const avatarImage = new Image();
  let background = null;
  let meter = null;
  let scenery = [];
  let lastPeople = [];
  let frameCount = 0;
  let lastNow = 0;
  let lastAnimate = true;

  function project(x, y, z = 0) {
    return { x: 441 + (x - y) * X_SCALE, y: 155 + (x + y) * Y_SCALE - z * Z_SCALE };
  }

  function canvas(width, height) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(width));
    c.height = Math.max(1, Math.ceil(height));
    return c;
  }

  function rounded(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function rect(ctx, x, y, w, h, r, fill, stroke) {
    rounded(ctx, x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function polygon(ctx, points, fill, stroke) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function line(ctx, points, color, width = 1) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function ellipse(ctx, x, y, rx, ry, fill, stroke) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function floorPlane(ctx, x, y, z, paint) {
    const p = project(x, y, z);
    ctx.save();
    ctx.transform(X_SCALE, Y_SCALE, -X_SCALE, Y_SCALE, p.x, p.y);
    paint(ctx);
    ctx.restore();
  }

  function wallPlane(ctx, x, y, z, axis, paint) {
    const p = project(x, y, z);
    ctx.save();
    ctx.transform(axis === 'x' ? X_SCALE : -X_SCALE, Y_SCALE, 0, Z_SCALE, p.x, p.y);
    paint(ctx);
    ctx.restore();
  }

  function slab(ctx, x, y, w, d, z, h, top, front, side, radius = 0) {
    const p = (a, b, c) => project(a, b, c);
    const r = Math.min(radius, w / 2, d / 2);
    if (r > 0) {
      const arc = (cx, cy, start, end) => {
        const points = [];
        for (let i = 0; i <= 8; i++) {
          const angle = start + (end - start) * i / 8;
          points.push({ x: x + cx + Math.cos(angle) * r, y: y + cy + Math.sin(angle) * r });
        }
        return points;
      };
      const edge = (points, color) => polygon(ctx,
        points.map(a => p(a.x, a.y, z + h)).concat(points.slice().reverse().map(a => p(a.x, a.y, z))), color);
      edge(arc(w - r, r, -Math.PI / 4, 0).concat(arc(w - r, d - r, 0, Math.PI / 4)), side);
      edge(arc(w - r, d - r, Math.PI / 4, Math.PI / 2).concat(arc(r, d - r, Math.PI / 2, Math.PI * 0.75)), front);
    } else {
      polygon(ctx, [p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)], front);
      polygon(ctx, [p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)], side);
    }
    floorPlane(ctx, x, y, z + h, c => rect(c, 0, 0, w, d, r, top));
  }

  function groundShadow(ctx, x, y, w, d, radius = 5) {
    floorPlane(ctx, x + 2, y + 3, 0.1, c => {
      rect(c, -2, -2, w + 4, d + 4, radius + 2, 'rgba(35,53,57,0.035)');
      rect(c, 0, 0, w, d, radius, 'rgba(35,53,57,0.065)');
    });
  }

  function text(ctx, value, x, y, size, color, weight = 500, align = 'left') {
    ctx.font = weight + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function paintWindow(ctx, x, y, z, axis, w, h) {
    wallPlane(ctx, x, y, z, axis, c => {
      rect(c, -3, -3, w + 6, h + 6, 1, '#3a4d58');
      rect(c, 0, 0, w, h, 0, C.navy);
      const glass = c.createLinearGradient(0, 0, w, h);
      glass.addColorStop(0, '#344e65');
      glass.addColorStop(0.58, '#536c7c');
      glass.addColorStop(1, '#7b8a8d');
      rect(c, 2, 2, w - 4, h - 4, 0, glass);
      c.save();
      rounded(c, 2, 2, w - 4, h - 4, 0);
      c.clip();
      polygon(c, [{ x: w * 0.5, y: 3 }, { x: w * 0.7, y: 3 }, { x: w * 0.3, y: h }, { x: w * 0.1, y: h }], 'rgba(187,209,215,0.07)');
      for (let i = 0; i < 8; i++) {
        const bh = 9 + (i % 3) * 5;
        rect(c, i * w / 8, h - bh - 2, w / 9, bh, 0, '#3c5362');
        for (let j = 0; j < 3; j++) rect(c, i * w / 8 + 3, h - bh + j * 4, 1.5, 1, 0, 'rgba(216,182,118,0.35)');
      }
      c.restore();
      rect(c, w / 2 - 0.7, 1, 1.4, h - 2, 0, C.navy);
      rect(c, 1, h * 0.65, w - 2, 1.2, 0, C.navy);
      rect(c, -2, h, w + 4, 3, 0.5, '#52616a');
    });
  }

  function sconce(ctx, x, y, axis) {
    wallPlane(ctx, x, y, 78, axis, c => {
      const glow = c.createRadialGradient(0, 2, 1, 0, 2, 19);
      glow.addColorStop(0, 'rgba(236,182,105,0.23)');
      glow.addColorStop(1, 'rgba(236,182,105,0)');
      ellipse(c, 0, 2, 19, 19, glow);
      rect(c, -2.5, -4, 5, 13, 1, '#273b45');
      rect(c, -3, -3, 6, 2, 0.5, '#c7a476');
      rect(c, -3, 7, 6, 1.5, 0.5, '#b88e5d');
    });
  }

  function rug(ctx, x, y, w, d, accent) {
    floorPlane(ctx, x, y, 0.2, c => {
      rect(c, 0, 0, w, d, 4, '#4b5b5d');
      rect(c, 2, 2, w - 4, d - 4, 3, null, '#78837b');
      for (let yy = 5; yy < d - 3; yy += 3) line(c, [{ x: 4, y: yy }, { x: w - 4, y: yy }], 'rgba(164,176,160,0.12)', 0.6);
      rect(c, 4, 4, 1.5, d - 8, 0.5, accent);
    });
  }

  function paintRoom(ctx) {
    // Leave the surrounding canvas transparent; only the room casts a cached shadow.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const corners = [project(0, 0), project(480, 0), project(480, 270), project(0, 270)];
    polygon(ctx, corners.map(p => ({ x: p.x + 3, y: p.y + 23 })), 'rgba(34,56,67,0.035)');
    polygon(ctx, corners.map(p => ({ x: p.x + 1, y: p.y + 16 })), 'rgba(34,56,67,0.06)');
    slab(ctx, 0, 0, 480, 270, -9, 9, C.floor, '#344f5f', '#294352');
    floorPlane(ctx, 0, 0, 0.1, c => {
      for (let x = 0; x < 480; x += 30) {
        for (let y = 0; y < 270; y += 30) {
          if ((x / 30 + y / 30) % 3 === 0) rect(c, x, y, 30, 30, 0, '#9b907e');
        }
      }
      polygon(c, [{ x: 5, y: 34 }, { x: 118, y: 82 }, { x: 155, y: 195 }, { x: 5, y: 140 }], 'rgba(145,168,176,0.06)');
      for (let x = 30; x < 480; x += 30) line(c, [{ x, y: 0 }, { x, y: 270 }], C.grout, 0.42);
      for (let y = 30; y < 270; y += 30) line(c, [{ x: 0, y }, { x: 480, y }], C.grout, 0.42);
      rect(c, 3, 3, 474, 264, 0, null, '#746e63');
    });
    line(ctx, [project(0, 270, -1), project(480, 270, -1), project(480, 0, -1)], '#68777a', 1.2);

    polygon(ctx, [project(0, 0), project(0, 270), project(0, 270, 101), project(0, 0, 101)], '#52616d');
    polygon(ctx, [project(0, 0), project(480, 0), project(480, 0, 101), project(0, 0, 101)], '#8e867c');
    wallPlane(ctx, 0, 0, 5, 'y', c => rect(c, 0, 0, 270, 5, 0, '#354955'));
    wallPlane(ctx, 0, 0, 5, 'x', c => rect(c, 0, 0, 480, 5, 0, '#5f605b'));
    line(ctx, [project(0, 270, 101), project(0, 0, 101), project(480, 0, 101)], C.navy, 7);
    line(ctx, [project(0, 270, 103), project(0, 0, 103), project(480, 0, 103)], '#738895', 1.2);
    line(ctx, [project(0, 270), project(0, 270, 101)], C.navy, 5);
    line(ctx, [project(480, 0), project(480, 0, 101)], C.navy, 5);
    line(ctx, [project(0, 0), project(0, 0, 100)], '#65736f', 2);

    paintWindow(ctx, 0, 31, 87, 'y', 111, 58);
    paintWindow(ctx, 351, 0, 87, 'x', 96, 54);
    wallPlane(ctx, board.x, board.y, board.z, 'x', c => {
      rect(c, 2, 3, board.width, board.height, 2, 'rgba(20,32,40,0.24)');
    });
    wallPlane(ctx, 161, 0, 83, 'x', c => {
      rect(c, 1.5, 2, 132, 43, 1.5, 'rgba(20,32,40,0.17)');
      rect(c, 0, 0, 132, 43, 1.5, '#354851', '#b29169');
      text(c, 'BaaS / TEAM WORKFLOW', 8, 11, 5.8, '#d1c5af', 600);
      const steps = ['Snow', 'Winter', 'Summer', 'Winter', 'Snow'];
      const colors = [C.green, C.cyan, C.amber, C.cyan, C.green];
      steps.forEach((step, i) => {
        const xx = 7 + i * 25;
        rect(c, xx, 20, 21, 12, 2, '#263b46');
        rect(c, xx + 2, 21, 17, 1, 0.5, colors[i]);
        text(c, step, xx + 10.5, 29, 4.8, '#dce0d9', 600, 'center');
        if (i < 4) text(c, '>', xx + 23, 28.5, 5, '#9dabaa', 500, 'center');
      });
    });
    wallPlane(ctx, 307, 0, 80, 'x', c => {
      rect(c, -2, -2, 32, 82, 0, '#5d594f');
      rect(c, 0, 0, 28, 80, 0, '#253e50');
      rect(c, 3, 4, 22, 70, 0.5, null, '#52616b');
      rect(c, 7, 10, 14, 21, 1, '#466072');
      line(c, [{ x: 8, y: 12 }, { x: 19, y: 27 }], '#607783', 0.7);
      rect(c, 21, 44, 1.2, 6, 0.5, '#c3a579');
      rect(c, 18, 44, 4, 1, 0.4, '#c3a579');
      text(c, 'MSP', 14, 39, 4.5, '#b7c2be', 600, 'center');
    });
    wallPlane(ctx, 0, 170, 79, 'y', c => {
      rect(c, 0, 0, 28, 24, 1, '#384b56', '#77827b');
      ellipse(c, 14, 12, 7.8, 7.8, '#b3ae99', '#283f4b');
      line(c, [{ x: 14, y: 6.5 }, { x: 14, y: 12 }, { x: 18, y: 14.5 }], C.navy, 1.1);
    });
    for (const x of [11, 150, 343, 464]) sconce(ctx, x, 0, 'x');
    for (const y of [17, 155, 226]) sconce(ctx, 0, y, 'y');
  }

  function loadAssets(onReady) {
    boardImage.onload = onReady;
    avatarImage.onload = onReady;
    boardImage.src = '/baas-hld.svg';
    avatarImage.src = '/ai-msp-robot.png';
  }

  function drawBoard(ctx, open) {
    wallPlane(ctx, board.x, board.y, board.z, 'x', c => {
      c.lineWidth = open ? 1.5 : 0.8;
      rect(c, 0, 0, board.width, board.height, 2, '#0c1b2a', open ? '#76e6dc' : '#497c83');
      if (boardImage.complete && boardImage.naturalWidth) {
        c.drawImage(boardImage, 3, 2.3, 107, 59.4);
      } else {
        text(c, 'HYBRID BaaS / HLD', 8, 30, 7, '#a9d7d8', 600);
      }
    });
  }

  function object(x, y, w, d, h, paint, depth, pad = 12, extraBounds = null) {
    const points = [];
    if (extraBounds) {
      points.push({ x: extraBounds.x, y: extraBounds.y },
        { x: extraBounds.x + extraBounds.w, y: extraBounds.y + extraBounds.h });
    }
    for (const a of [x, x + w]) for (const b of [y, y + d]) {
      points.push(project(a, b, -2), project(a, b, h));
    }
    const left = Math.floor(Math.min(...points.map(p => p.x)) - pad);
    const top = Math.floor(Math.min(...points.map(p => p.y)) - pad);
    const right = Math.ceil(Math.max(...points.map(p => p.x)) + pad);
    const bottom = Math.ceil(Math.max(...points.map(p => p.y)) + pad);
    const buffer = canvas(right - left, bottom - top);
    const ctx = buffer.getContext('2d');
    ctx.translate(-left, -top);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    paint(ctx);
    scenery.push({ kind: 'object', canvas: buffer, x: left, y: top,
      depth: depth === undefined ? project(x + w / 2, y + d * 0.75).y : depth,
      order: scenery.length });
  }

  function monitor(ctx, x, y, accent, width = 24) {
    slab(ctx, x - 5, y - 2, 10, 6, 25, 0.8, '#748787', '#536c72', '#405b66', 1);
    slab(ctx, x - 1, y, 2, 2, 25.8, 6.5, '#597780', '#4a6672', '#34505e');
    wallPlane(ctx, x - width / 2, y + 1, 49, 'x', c => {
      rect(c, 1, 1, width, 16, 1.4, '#172f41');
      rect(c, 0, 0, width, 16, 1.4, '#375262');
      rect(c, 1.1, 1.1, width - 2.2, 13.4, 0.7, '#172b39');
      rect(c, 1.1, 1.1, width - 2.2, 2.7, 0.7, '#304855');
      rect(c, 2.5, 5.2, 4.7, 7.6, 0.5, '#243f4d');
      rect(c, 8.8, 5.2, width - 11.3, 3.6, 0.5, '#385563');
      for (let i = 0; i < 3; i++) rect(c, 9, 10.3 + i * 1.25, width - 12 - i * 2, 0.55, 0.2, '#749398');
      for (let i = 0; i < 3; i++) ellipse(c, 3 + i * 1.7, 2.4, 0.4, 0.4, i === 0 ? accent : '#769089');
      rect(c, 3.5, 6.5, 2.7, 1, 0.2, accent);
      ellipse(c, width / 2, 15.15, 0.45, 0.3, '#a5cebc');
    });
  }

  function cup(ctx, x, y, z, color = '#fbf8ed') {
    const p = project(x, y, z);
    ellipse(ctx, p.x + 3.1, p.y - 3, 2.1, 2.3, null, color);
    rect(ctx, p.x - 3.1, p.y - 6, 6.2, 6.2, 1.8, color);
    ellipse(ctx, p.x, p.y - 6, 3.1, 1.5, color);
    ellipse(ctx, p.x, p.y - 6, 2.1, 0.9, '#7b6550');
  }

  function deskPlacardBounds(x, y) {
    const p = project(x + 66, y + 4, 54);
    return { x: p.x - 2, y: p.y, w: 66, h: 27 };
  }

  function desk(ctx, x, y, accent, name, role) {
    slab(ctx, x + 3, y + 3, 3, 24, 0, 22, '#6d7a76', '#43595f', '#344d56', 0.6);
    slab(ctx, x + 5, y + 25, 58, 1.4, 5, 15, '#596d6b', '#45595c', '#354b52');
    slab(ctx, x + 47, y + 3, 18, 24, 1, 21, '#7b8276', '#626f68', '#4f615e', 1);
    wallPlane(ctx, x + 49, y + 27.2, 20, 'x', c => {
      for (const yy of [6, 12]) line(c, [{ x: 0, y: yy }, { x: 14, y: yy }], '#3b5051', 0.65);
      for (const yy of [3, 9, 15]) rect(c, 5, yy, 5, 0.9, 0.3, '#9caa99');
    });
    // The slim sign is mounted at the cabinet side, clear of a seated avatar's head.
    slab(ctx, x + 65, y + 3, 1.5, 1.5, 25, 27, '#667b7e', '#425963', '#344b56');
    const sign = deskPlacardBounds(x, y);
    rect(ctx, sign.x, sign.y, sign.w, sign.h, 3, '#243944', '#5b716f');
    rect(ctx, sign.x + 3, sign.y + 4, 2, sign.h - 8, 1, accent);
    const words = role.split(' ');
    text(ctx, words[0], sign.x + 10, sign.y + 11, 9, '#d8ded6', 600);
    text(ctx, words.slice(1).join(' '), sign.x + 10, sign.y + 22, 9, '#aebfb8', 500);
    slab(ctx, x, y, 68, 30, 22, 2.8, C.wood, C.woodEdge, '#906a49', 2.6);
    floorPlane(ctx, x, y, 24.9, c => {
      c.lineWidth = 0.55;
      rect(c, 1, 1, 66, 28, 2, null, C.woodLight);
      for (const yy of [4, 8, 25]) line(c, [{ x: 4, y: yy }, { x: 63, y: yy + 0.6 }], 'rgba(137,93,53,0.10)', 0.5);
      rect(c, 15, 4, 34, 21, 2, '#4b625d');
      rect(c, 17, 16, 20, 6.5, 1.2, '#344b54');
      for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
        rect(c, 18.5 + col * 2.15, 17 + row * 1.4, 1.45, 0.7, 0.2, '#8a9d95');
      }
      rect(c, 40, 17, 3.9, 5.7, 1.8, '#6f817a');
      rect(c, 4, 12, 8, 12, 0.6, '#f5f0db');
      rect(c, 4, 12, 1.5, 12, 0.4, accent);
      line(c, [{ x: 7, y: 15 }, { x: 10, y: 15 }], '#b2b6a5', 0.6);
      line(c, [{ x: 7, y: 18 }, { x: 10, y: 18 }], '#b2b6a5', 0.6);
      text(c, name, 52, 28, 3.1, '#826647', 600, 'center');
    });
    monitor(ctx, x + 32, y + 10, accent);
    cup(ctx, x + 55, y + 12, 25, '#b9bda9');
    slab(ctx, x + 52, y + 20, 10, 7, 25, 1.2, '#ccc4ab', '#a3a08b', '#a4a18e', 0.5);
    slab(ctx, x + 53, y + 20, 9, 6, 26.2, 1.1, accent, '#4d6564', '#3d575b', 0.5);
    floorPlane(ctx, x + 7, y + 18, 25.2, c => {
      rect(c, 0, 0, 7, 9, 0.3, '#d5cfb7');
      for (let i = 0; i < 3; i++) line(c, [{ x: 1, y: 2 + i * 2 }, { x: 5, y: 2 + i * 2 }], '#8c9386', 0.5);
    });
    plant(ctx, x + 3, y - 1, 25, 0.38);
  }

  function chair(ctx, x, y, accent, small = false) {
    const p = project(x, y);
    const scale = small ? 0.68 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    line(ctx, [{ x: 0, y: -12 }, { x: 0, y: -3 }], '#6c8589', 3);
    line(ctx, [{ x: -10, y: 1 }, { x: 0, y: -3 }, { x: 11, y: 1 }], '#647d84', 2);
    line(ctx, [{ x: -5, y: 4 }, { x: 0, y: -3 }, { x: 6, y: -5 }], '#647d84', 1.8);
    for (const pos of [[-10, 1], [11, 1], [-5, 4], [6, -5]]) ellipse(ctx, pos[0], pos[1], 2.1, 1.5, '#3b5664');
    ellipse(ctx, 0, -13, 11.2, 5.6, '#3c5863');
    ellipse(ctx, 0, -14.5, 10.5, 5.2, accent);
    line(ctx, [{ x: -7, y: -14 }, { x: -9, y: -35 }], '#49656e', 2);
    rect(ctx, -11, -42, 21, 25, 5, '#2e4955');
    rect(ctx, -9.5, -41, 18, 22, 4, accent);
    line(ctx, [{ x: -5, y: -36 }, { x: 5, y: -36 }], 'rgba(214,224,203,0.23)', 1);
    line(ctx, [{ x: -5, y: -23 }, { x: 5, y: -23 }], 'rgba(30,54,57,0.20)', 0.8);
    ctx.restore();
  }

  function meeting(ctx) {
    for (const x of [169, 201, 233]) chair(ctx, x, 109, '#667b77');
    slab(ctx, 178, 113, 8, 17, 0, 23, '#566865', '#3d5256', '#314b55', 2);
    slab(ctx, 220, 113, 8, 17, 0, 23, '#566865', '#3d5256', '#314b55', 2);
    slab(ctx, 156, 106, 93, 29, 23, 3.2, C.wood, C.woodEdge, '#8c674b', 12);
    floorPlane(ctx, 156, 106, 26.3, c => {
      c.lineWidth = 0.55;
      rect(c, 1, 1, 91, 27, 11, null, C.woodLight);
      for (const yy of [6, 13, 22]) line(c, [{ x: 12, y: yy }, { x: 81, y: yy + 0.6 }], 'rgba(87,57,36,0.16)', 0.6);
      rect(c, 12, 6, 12, 8, 1, '#cfc7af');
      rect(c, 12, 6, 2, 8, 0.6, C.cyan);
      rect(c, 67, 15, 12, 8, 1, '#d2c4a5');
      rect(c, 67, 15, 2, 8, 0.6, C.purple);
      for (const xx of [16, 71]) for (let i = 0; i < 3; i++) rect(c, xx, (xx === 16 ? 8 : 17) + i * 1.5, 5, 0.5, 0, '#8c8e7d');
      ellipse(c, 46, 12, 6, 4, '#2c4651');
      ellipse(c, 46, 12, 3, 1.5, '#6f9b92');
      text(c, 'MSP BaaS Team', 46.5, 23, 4.6, '#574636', 600, 'center');
    });
    cup(ctx, 188, 115, 26.4, '#b9bda9');
    cup(ctx, 223, 123, 26.4, '#b9bda9');
    for (const x of [169, 201, 233]) chair(ctx, x, 132, '#667b77');
  }

  function leaf(ctx, x, y, dx, dy, width, color) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx * 0.12 - width, y + dy * 0.55, x + dx, y + dy);
    ctx.quadraticCurveTo(x + dx * 0.8 + width, y + dy * 0.35, x, y);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function plant(ctx, x, y, z = 0, scale = 1) {
    const p = project(x + 7, y + 7, z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(-11, -17);
    ctx.lineTo(-8, -2);
    ctx.quadraticCurveTo(0, 4, 8, -2);
    ctx.lineTo(11, -17);
    ctx.closePath();
    ctx.fillStyle = '#8c7058';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-11, -17);
    ctx.lineTo(-8, -2);
    ctx.quadraticCurveTo(-5, 1, -1, 1);
    ctx.lineTo(-1, -17);
    ctx.closePath();
    ctx.fillStyle = '#ac8e6a';
    ctx.fill();
    line(ctx, [{ x: -7, y: -12 }, { x: -5, y: -3 }], '#c09f76', 0.7);
    line(ctx, [{ x: 5, y: -12 }, { x: 4, y: -3 }], '#705c4e', 0.7);
    ellipse(ctx, 0, -17, 11, 5, '#b29972');
    ellipse(ctx, 0, -17, 8.5, 3.5, '#6b7560');
    line(ctx, [{ x: 0, y: -17 }, { x: -1, y: -53 }], '#5f7b54', 1.5);
    line(ctx, [{ x: 1, y: -20 }, { x: 11, y: -42 }], '#5f7b54', 1.3);
    line(ctx, [{ x: -1, y: -21 }, { x: -14, y: -36 }], '#5f7b54', 1.3);
    leaf(ctx, -1, -40, -9, -20, 7, '#698a60');
    leaf(ctx, -1, -37, 14, -20, 8, '#497762');
    leaf(ctx, 1, -25, 21, -17, 7, '#6f9675');
    leaf(ctx, -2, -25, -21, -13, 8, '#396d5b');
    leaf(ctx, -1, -28, -10, -20, 8, '#7e9e77');
    leaf(ctx, 1, -22, 8, -24, 7, '#56866b');
    leaf(ctx, -1, -45, 5, -18, 5, '#81a078');
    leaf(ctx, -1, -32, -18, -18, 6, '#426c5a');
    leaf(ctx, 2, -28, 17, -7, 6, '#789875');
    line(ctx, [{ x: -1, y: -25 }, { x: 6, y: -42 }], 'rgba(222,233,180,0.24)', 0.8);
    ctx.restore();
  }

  function coffee(ctx) {
    slab(ctx, 8, 150, 24, 27, 0, 22, '#768779', '#425e5b', '#536e64', 1);
    wallPlane(ctx, 9, 177, 19, 'x', c => {
      line(c, [{ x: 10, y: 0 }, { x: 10, y: 17 }], '#4e6a68', 0.8);
      rect(c, 7, 3, 1, 4, 0.4, '#c3d1c4');
      rect(c, 12, 3, 1, 4, 0.4, '#c3d1c4');
    });
    slab(ctx, 7, 149, 26, 29, 22, 2, C.wood, C.woodEdge, '#896746', 1.6);
    slab(ctx, 11, 153, 13, 13, 24, 17, '#627b80', '#3b5664', '#284657', 1.2);
    wallPlane(ctx, 12, 166.1, 40, 'x', c => {
      rect(c, 2, 2, 7, 3, 0.5, '#b1cfc3');
      rect(c, 3, 7, 5, 7, 0.5, '#213c4b');
      rect(c, 5, 7, 1.4, 3, 0.3, '#a9bfba');
      rect(c, 1, 14, 10, 1, 0.3, '#a0b5b0');
    });
    cup(ctx, 17, 168, 25);
    cup(ctx, 28, 157, 24);
    floorPlane(ctx, 25, 166, 24.2, c => rect(c, 0, 0, 5, 8, 0.8, '#b69873'));
    plant(ctx, 22, 147, 24, 0.35);
  }

  function bookshelf(ctx) {
    slab(ctx, 8, 210, 18, 36, 0, 47, '#a8855d', '#856747', '#725c46', 1);
    wallPlane(ctx, 26.1, 212, 44, 'y', c => {
      rect(c, 0, 0, 32, 40, 0, '#514e43');
      for (let row = 0; row < 3; row++) {
        const base = row * 13;
        rect(c, 0, base + 11, 32, 2, 0, '#b09067');
        const colors = ['#a9b39b', '#5f8272', '#839c96', '#b99360', '#426573'];
        for (let i = 0; i < 7; i++) {
          const height = 7.5 + (i + row) % 3;
          rect(c, 2 + i * 3.9, base + 11 - height, 2.8, height, 0.4, colors[(i + row) % colors.length]);
          rect(c, 2.5 + i * 3.9, base + 8, 1.8, 0.6, 0.1, 'rgba(255,255,255,0.42)');
        }
      }
    });
    slab(ctx, 11, 218, 9, 15, 47, 1.4, '#e8e5d1', '#b2b7a6', '#c6cbb7', 0.5);
    slab(ctx, 12, 219, 9, 14, 48.4, 1.2, '#91ada1', '#6c8b83', '#79958d', 0.5);
    plant(ctx, 11, 232, 47, 0.52);
  }

  function whiteboard(ctx) {
    for (const x of [80, 119]) {
      slab(ctx, x, 87, 1.5, 2, 0, 47, '#9bb2af', '#7e9696', '#607f86');
      line(ctx, [project(x, 82, 1), project(x, 95, 1)], '#839d9a', 2.4);
      const a = project(x, 82);
      const b = project(x, 95);
      ellipse(ctx, a.x, a.y, 2, 1.6, '#587481');
      ellipse(ctx, b.x, b.y, 2, 1.6, '#587481');
    }
    wallPlane(ctx, 76, 90, 49, 'x', c => {
      rect(c, 1, 1, 48, 29, 1.5, '#3a5057');
      rect(c, 0, 0, 48, 29, 1.5, '#60756f', '#93a396');
      text(c, 'TEAM / NOTES', 4, 6, 3.9, '#d6dac8', 600);
      line(c, [{ x: 14, y: 15 }, { x: 24, y: 15 }, { x: 24, y: 22 }, { x: 34, y: 22 }], '#9ebcb0', 0.7);
      line(c, [{ x: 24, y: 15 }, { x: 24, y: 12 }, { x: 34, y: 12 }], '#9ebcb0', 0.7);
      rect(c, 5, 11, 11, 9, 1, '#cce0d2');
      rect(c, 32, 8, 11, 7, 1, '#d5e6e4');
      rect(c, 32, 19, 11, 6, 1, '#eee1bf');
      line(c, [{ x: 8, y: 14 }, { x: 12, y: 14 }], '#6b9b84', 0.8);
      line(c, [{ x: 35, y: 11 }, { x: 40, y: 11 }], '#84aaa9', 0.8);
      rect(c, -1, 29, 50, 1.6, 0.4, '#b1c5bc');
      rect(c, 35, 28, 5, 0.8, 0.3, C.green);
    });
  }

  function server(ctx) {
    slab(ctx, 424, 86, 28, 24, 0, 59, '#536b77', '#233e50', '#365363', 1.2);
    floorPlane(ctx, 425, 87, 59.1, c => {
      for (let i = 0; i < 5; i++) rect(c, 4 + i * 4, 4, 1.5, 15, 0.6, '#344e5f');
    });
    wallPlane(ctx, 426, 110.1, 56, 'x', c => {
      rect(c, 0, 0, 24, 51, 1.3, '#193648', '#567380');
      text(c, 'MSP / RACK 01', 12, 5, 2.7, '#a9c2c3', 600, 'center');
      for (let i = 0; i < 6; i++) {
        const yy = 8 + i * 6.7;
        rect(c, 2, yy, 20, 5.5, 0.6, '#385668');
        for (let j = 0; j < 4; j++) rect(c, 4 + j * 2.6, yy + 1.3, 1.5, 2.5, 0.2, '#1c394b');
        ellipse(c, 18, yy + 2.2, 0.65, 0.65, i % 2 ? '#a8cbb1' : '#75b4b5');
        ellipse(c, 20, yy + 2.2, 0.5, 0.5, '#c5c58d');
      }
    });
    wallPlane(ctx, 452.1, 90, 47, 'y', c => {
      rect(c, 0, 0, 15, 31, 1, '#294859');
      for (let i = 0; i < 10; i++) rect(c, 3, 4 + i * 2.2, 9, 0.65, 0.3, '#607c86');
    });
  }

  function watercooler(ctx) {
    slab(ctx, 446, 206, 16, 18, 0, 32, '#73898c', '#526c76', '#3c5565', 1.5);
    slab(ctx, 447, 207, 14, 16, 32, 2, '#8c9b97', '#667c80', '#4d636e', 1);
    const p = project(454, 214, 34);
    rect(ctx, p.x - 8, p.y - 21, 16, 21, 4, '#496d83', '#799499');
    ellipse(ctx, p.x, p.y - 21, 7, 2.5, '#738f9a');
    rect(ctx, p.x - 6, p.y - 18, 2, 12, 1, 'rgba(180,210,215,0.22)');
    rect(ctx, p.x - 4, p.y - 25, 8, 4, 1, '#304f64');
    wallPlane(ctx, 448, 224.1, 28, 'x', c => {
      rect(c, 0, 0, 12, 17, 1, '#273f50');
      rect(c, 2, 3, 2, 3, 0.4, C.cyan);
      rect(c, 8, 3, 2, 3, 0.4, '#b38670');
      rect(c, 1, 14, 10, 2, 0.4, '#7e9191');
      line(c, [{ x: 3, y: 16 }, { x: 3, y: 19 }], '#354f5a', 0.6);
    });
  }

  function printer(ctx) {
    slab(ctx, 404, 240, 26, 18, 0, 17, '#6e7972', '#4b605e', '#394e54', 1);
    wallPlane(ctx, 406, 258, 15, 'x', c => {
      rect(c, 0, 0, 22, 12, 0.8, null, '#78857a');
      rect(c, 8, 2, 6, 1, 0.4, '#a3ad9b');
    });
    slab(ctx, 405, 241, 24, 16, 17, 10, '#8b9690', '#677b7c', '#4c646f', 1.5);
    slab(ctx, 407, 242, 20, 12, 27, 2, '#415867', '#344b59', '#2a4252', 1);
    floorPlane(ctx, 410, 244, 29.1, c => {
      rect(c, 0, 0, 13, 8, 0.4, '#b9b9a6');
      rect(c, 1, 1, 11, 6, 0.3, '#d1cdb7');
      for (let i = 0; i < 3; i++) rect(c, 3, 2 + i * 1.3, 6, 0.4, 0, '#929a8a');
    });
    wallPlane(ctx, 407, 257.1, 25, 'x', c => {
      rect(c, 0, 0, 20, 6, 0.8, '#243e4d');
      rect(c, 1, 1, 4, 2, 0.3, '#628f93');
      ellipse(c, 18, 2, 0.6, 0.6, C.green);
      rect(c, 5, 4, 12, 1, 0.3, '#b5bba7');
    });
  }

  function initialize() {
    if (background) return;
    background = canvas(WIDTH, HEIGHT);
    const ctx = background.getContext('2d');
    paintRoom(ctx);
    const desks = [
      { x: 36, y: 196, name: 'SNOW', role: 'Account Manager', color: C.green, foot: [70, 190] },
      { x: 188, y: 196, name: 'WINTER', role: 'Product Manager', color: C.cyan, foot: [222, 190] },
      { x: 340, y: 196, name: 'SUMMER', role: 'Solution Architect', color: C.amber, foot: [374, 190] },
      { x: 290, y: 116, name: 'ADMIN', role: 'Admin Ops', color: C.purple, foot: [324, 110] }
    ];
    // Flat floor zoning never introduces a collision obstacle.
    rug(ctx, 149, 96, 107, 49, '#a7936d');
    groundShadow(ctx, 155, 100, 95, 40, 10);
    object(155, 100, 95, 40, 36, meeting);
    for (const item of desks) {
      rug(ctx, item.x - 4, item.y - 17, 76, 53, item.color);
      groundShadow(ctx, item.x, item.y, 68, 30, 3);
      groundShadow(ctx, item.foot[0] - 6, item.foot[1] - 5, 12, 10, 5);
      // Include only the projecting side placard, rather than inflating padding on every edge.
      object(item.x, item.y, 68, 30, 56,
        c => desk(c, item.x, item.y, item.color, item.name, item.role), undefined, 12,
        deskPlacardBounds(item.x, item.y));
      const [x, y] = item.foot;
      object(x - 8, y - 8, 16, 16, 28, c => chair(c, x, y, item.color), project(x, y).y - 0.1);
    }
    for (const [x, y] of [[10, 58], [452, 58], [450, 148]]) {
      groundShadow(ctx, x, y, 14, 14, 7);
      object(x, y, 14, 14, 48, c => plant(c, x, y));
    }
    groundShadow(ctx, 8, 150, 24, 27, 2);
    groundShadow(ctx, 8, 210, 18, 36, 2);
    groundShadow(ctx, 76, 82, 48, 13, 3);
    groundShadow(ctx, 424, 86, 28, 24, 2);
    groundShadow(ctx, 446, 206, 16, 18, 2);
    groundShadow(ctx, 404, 240, 26, 18, 2);
    object(7, 149, 26, 29, 44, coffee);
    object(8, 210, 18, 36, 73, bookshelf);
    object(76, 82, 49, 14, 51, whiteboard);
    object(424, 86, 28, 24, 61, server);
    object(446, 206, 16, 18, 54, watercooler);
    object(404, 240, 26, 18, 31, printer);
    scenery.sort((a, b) => a.depth - b.depth || a.order - b.order);
  }

  function hash(employee) {
    const value = String(employee.id == null ? employee.name || '' : employee.id);
    let n = 0;
    for (let i = 0; i < value.length; i++) n = (n * 31 + value.charCodeAt(i)) | 0;
    return n >>> 0;
  }

  function palette(employee) {
    const p = employee.palette || {};
    const key = String(employee.name || employee.id || '').toLowerCase();
    const index = ['snow', 'winter', 'summer', 'admin'].findIndex(name => key.includes(name));
    const accent = p.accent || defaults[index < 0 ? hash(employee) % 4 : index];
    return {
      top: p.top || accent, topDark: p.topDark || '#44616d',
      hair: p.hair || '#344653', hairEdge: p.hairEdge || '#243846',
      skin: p.skin || '#e9bd97', skinShade: p.skinShade || '#ca9776',
      pants: p.pants || '#344f61', shoe: p.shoe || '#253e4e', accent
    };
  }

  function plain(value, max = 80) {
    return Array.from(String(value == null ? '' : value).replace(/\s+/g, ' ').trim()).slice(0, max).join('');
  }

  function measure() {
    if (!meter) meter = canvas(1, 1).getContext('2d');
    meter.font = '600 13px ' + FONT;
    return meter;
  }

  function fit(value, maxWidth) {
    const ctx = measure();
    if (ctx.measureText(value).width <= maxWidth) return value;
    const chars = Array.from(value);
    while (chars.length && ctx.measureText(chars.join('') + '\u2026').width > maxWidth) chars.pop();
    return chars.join('') + '\u2026';
  }

  function isTarget(target, employee) {
    return target != null && (target === employee ||
      (employee.id != null && target === employee.id) ||
      (employee.name != null && target === employee.name));
  }

  function person(employee, now, animate, index) {
    const x = Number.isFinite(employee.x) ? employee.x : 240;
    const y = Number.isFinite(employee.y) ? employee.y : 150;
    const p = project(x, y);
    const seed = hash(employee);
    const robot = String(employee.name || '').toLowerCase() === 'ai.msp';
    const seated = employee.state === 'sit';
    const walking = !seated && (employee.state === 'walk' || employee.moving === true);
    const phase = animate ? now * 0.009 + (seed % 97) : 0;
    const stride = animate && walking ? Math.sin(phase) : 0;
    const bob = !robot && animate ? (walking ? -Math.abs(Math.sin(phase)) * 1.6 : Math.sin(now * 0.0018 + seed % 29) * 0.45) : 0;
    const name = fit(plain(employee.name || employee.id || 'Team member'), 103);
    const unread = Number(employee.unread) > 0 || employee.unread === true;
    const width = Math.ceil(measure().measureText(name).width) + (unread ? 37 : 27);
    const label = { x: p.x - width / 2, y: robot ? p.y + 7 : p.y + bob - 47 * AVATAR_SCALE - 31, w: width, h: 25 };
    const halfWidth = robot ? 22 : 15;
    const arm = robot ? 22 : employee.state === 'present' ? 24 : 15;
    return {
      kind: 'person', employee, p, seated, walking, phase, stride, bob, name, unread, label,
      colors: palette(employee), depth: p.y, order: 1000 + index,
      body: { x: p.x - halfWidth * AVATAR_SCALE, y: p.y + bob - (robot ? 50 : 47) * AVATAR_SCALE,
        w: (arm + halfWidth) * AVATAR_SCALE, h: (robot ? 54 : 51) * AVATAR_SCALE }
    };
  }

  function drawAvatar(ctx, row, selected) {
    const e = row.employee;
    const c = row.colors;
    const stride = row.stride;
    const seated = row.seated;
    ctx.save();
    ctx.translate(row.p.x, row.p.y);
    if (selected) {
      ctx.globalAlpha = 0.18;
      ellipse(ctx, 0, 0, 25, 10, c.top);
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.5;
      ellipse(ctx, 0, 0, 24, 9, null, c.top);
      ctx.globalAlpha = 1;
    }
    ellipse(ctx, 1, 1.2, seated ? 14 : 13, 4.8, 'rgba(20,35,42,0.23)');
    ctx.translate(0, row.bob);
    ctx.scale(AVATAR_SCALE, AVATAR_SCALE);
    if (e.online === false) ctx.globalAlpha = 0.72;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (String(e.name || '').toLowerCase() === 'ai.msp') {
      if (avatarImage.complete && avatarImage.naturalWidth > 0) {
        const height = 48;
        const width = height * avatarImage.naturalWidth / avatarImage.naturalHeight;
        ctx.drawImage(avatarImage, -width / 2, -50, width, height);
      }
      ctx.restore();
      return;
    }

    if (seated) {
      line(ctx, [{ x: -4, y: -15 }, { x: -9, y: -9 }, { x: -9, y: -4 }], c.pants, 5.4);
      line(ctx, [{ x: 4, y: -15 }, { x: 9, y: -10 }, { x: 11, y: -5 }], c.pants, 5.4);
      rect(ctx, -12.3, -5, 7, 4, 1.8, c.shoe);
      rect(ctx, 8, -6, 7, 4, 1.8, c.shoe);
    } else {
      line(ctx, [{ x: -4, y: -13 }, { x: -4 - stride * 2, y: -7 }, { x: -4 - stride * 3.5, y: -2 }], c.pants, 5.1);
      line(ctx, [{ x: 4, y: -13 }, { x: 4 + stride * 2, y: -7 }, { x: 4 + stride * 3.5, y: -2 }], c.pants, 5.1);
      rect(ctx, -7.3 - stride * 3.5, -3, 7.8, 4, 1.8, c.shoe);
      rect(ctx, 1 + stride * 3.5, -3, 7.8, 4, 1.8, c.shoe);
      line(ctx, [{ x: -6 - stride * 3.5, y: 0.7 }, { x: -1 - stride * 3.5, y: 0.7 }], '#9caeae', 0.7);
    }

    const torsoY = seated ? -26 : -27;
    rect(ctx, -8.7, torsoY + 0.7, 17.4, seated ? 14 : 17, 6, c.topDark);
    rect(ctx, -8, torsoY, 14, seated ? 13 : 15.5, 5.5, c.top);
    line(ctx, [{ x: -2, y: torsoY + 3 }, { x: 0.5, y: torsoY + 11 }, { x: 3, y: torsoY + 3 }], 'rgba(244,251,236,0.57)', 0.8);
    rect(ctx, -0.8, torsoY + 9.5, 3.4, 4.2, 0.8, '#ebf1e6');
    rect(ctx, -0.2, torsoY + 10.3, 2.1, 0.8, 0.2, c.accent);

    let left = { x: -10.5, y: -12 + stride * 3 };
    let right = { x: 11, y: -12 - stride * 3 };
    if (seated) {
      const typing = e.working && lastAnimate ? Math.sin(row.phase * 1.8) * 0.7 : 0;
      left = { x: -11, y: -17 + typing };
      right = { x: 12, y: -17 - typing };
    }
    if (e.state === 'phone') right = { x: 12, y: -32 };
    if (e.state === 'present') right = { x: 21, y: -28 };
    line(ctx, [{ x: -6.5, y: torsoY + 4 }, { x: -10, y: -19 }, left], c.skinShade, 4.4);
    line(ctx, [{ x: 6.5, y: torsoY + 4 }, { x: 10, y: -20 }, right], c.skin, 4.4);
    line(ctx, [{ x: -6.5, y: torsoY + 4 }, { x: -9, y: -19.5 }], c.top, 5.4);
    line(ctx, [{ x: 6.5, y: torsoY + 4 }, { x: 9, y: -20 }], c.topDark, 5.4);
    ellipse(ctx, left.x, left.y, 2.5, 2.6, c.skin);
    ellipse(ctx, right.x, right.y, 2.5, 2.6, c.skin);
    if (e.state === 'phone') {
      rect(ctx, 10, -37, 4.5, 9.5, 1.2, C.navy);
      rect(ctx, 11, -35.5, 2.5, 5.5, 0.6, '#9bc4bd');
    }
    if (e.state === 'present') line(ctx, [{ x: 21.5, y: -29 }, { x: 23, y: -34 }], c.skin, 2);

    const headY = seated ? -33.5 : -35;
    rect(ctx, -2.8, headY + 6, 5.5, 4.8, 1.9, c.skinShade);
    ellipse(ctx, -0.7, headY - 1.2, 9.1, 9, c.hairEdge);
    ellipse(ctx, -7.5, headY + 1.2, 2.1, 2.8, c.skinShade);
    ellipse(ctx, 7.6, headY + 1.2, 2.1, 2.8, c.skin);
    ellipse(ctx, 0.7, headY + 0.2, 7.4, 8, c.skin);
    ctx.beginPath();
    ctx.moveTo(-7.8, headY + 1.4);
    ctx.bezierCurveTo(-10.5, headY - 10, 3, headY - 13, 8.5, headY - 5);
    ctx.quadraticCurveTo(10, headY - 1, 7.7, headY + 2);
    ctx.lineTo(5.4, headY - 4);
    ctx.quadraticCurveTo(-0.5, headY - 1, -5.5, headY - 4);
    ctx.lineTo(-6.4, headY + 2);
    ctx.closePath();
    ctx.fillStyle = c.hair;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5.5, headY - 6);
    ctx.quadraticCurveTo(-1, headY - 9, 4.5, headY - 6.5);
    ctx.strokeStyle = 'rgba(241,239,222,0.12)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ellipse(ctx, -1.8, headY + 0.8, 0.75, 1, C.navy);
    ellipse(ctx, 4.4, headY + 0.8, 0.75, 1, C.navy);
    line(ctx, [{ x: 1.8, y: headY + 2 }, { x: 2.6, y: headY + 3.3 }], c.skinShade, 0.75);
    ctx.beginPath();
    ctx.moveTo(0, headY + 5);
    ctx.quadraticCurveTo(2, headY + 6.2, 4, headY + 4.6);
    ctx.strokeStyle = '#a27561';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  function nameLabel(ctx, row, selected) {
    const b = row.label;
    const accent = row.colors.top;
    rect(ctx, b.x, b.y + 2, b.w, b.h, 12.5, 'rgba(12,25,34,0.20)');
    ctx.lineWidth = selected ? 1.2 : 0.7;
    rect(ctx, b.x, b.y, b.w, b.h, 12.5, selected ? '#2c4558' : '#203442', selected ? accent : '#567078');
    ellipse(ctx, b.x + 10.5, b.y + 12.5, 3, 3, row.employee.online === false ? '#778580' : accent);
    text(ctx, row.name, b.x + 19, b.y + 17, 13, '#e0e6df', 600);
    if (row.unread) ellipse(ctx, b.x + b.w - 9, b.y + 12.5, 2.6, 2.6, '#d6a66c');
  }

  function hasBubble(row) {
    const data = row.employee.bubble;
    return data && data.text && (!Number.isFinite(data.until) || data.until > lastNow);
  }

  function bubble(ctx, row) {
    if (!hasBubble(row)) return;
    const message = fit(plain(row.employee.bubble.text, 100), 194);
    if (!message) return;
    const w = Math.ceil(measure().measureText(message).width) + 24;
    const x = Math.max(16, Math.min(WIDTH - w - 16, row.p.x - w / 2));
    const y = Math.max(16, row.label.y - 40);
    rect(ctx, x, y + 2, w, 31, 10, 'rgba(12,25,34,0.20)');
    ctx.lineWidth = 0.8;
    rect(ctx, x, y, w, 31, 10, '#2b424f', '#708581');
    const tip = Math.max(x + 12, Math.min(x + w - 12, row.p.x));
    polygon(ctx, [{ x: tip - 4, y: y + 30 }, { x: tip + 4, y: y + 30 }, { x: tip, y: y + 36 }], '#2b424f');
    text(ctx, message, x + 12, y + 20, 13, '#e0e6df', 600);
  }

  function employeesList(employees) {
    return Array.isArray(employees) ? employees.filter(e => e && typeof e === 'object') : [];
  }

  function draw(ctx, employees, now, options = {}) {
    initialize();
    now = Number.isFinite(now) ? now : 0;
    options = options || {};
    lastNow = now;
    lastAnimate = options.animate !== false;
    const people = employeesList(employees).map((e, i) => person(e, now, lastAnimate, i));
    people.sort((a, b) => a.depth - b.depth || a.order - b.order);
    const queue = scenery.concat(people).sort((a, b) => a.depth - b.depth || a.order - b.order);
    ctx.save();
    try {
      // The caller owns the backing-store transform; all geometry stays in 1200 x 620 units.
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowColor = 'transparent';
      ctx.filter = 'none';
      ctx.imageSmoothingEnabled = true;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(background, 0, 0);
      drawBoard(ctx, options.boardOpen);
      for (const entry of queue) {
        if (entry.kind === 'object') ctx.drawImage(entry.canvas, entry.x, entry.y);
        else drawAvatar(ctx, entry, isTarget(options.hover, entry.employee) || isTarget(options.active, entry.employee));
      }
      for (const row of people) nameLabel(ctx, row, isTarget(options.hover, row.employee) || isTarget(options.active, row.employee));
      const focus = people.find(row => isTarget(options.hover, row.employee) && hasBubble(row)) ||
        people.find(row => isTarget(options.active, row.employee) && hasBubble(row));
      if (focus) bubble(ctx, focus);
      lastPeople = people;
      frameCount++;
    } finally {
      ctx.restore();
    }
  }

  function inside(x, y, box) {
    return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  }

  function hitTest(x, y, employees) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const list = employeesList(employees);
    const known = new Map(lastPeople.map(row => [row.employee, row]));
    const rows = list.map((e, i) => known.get(e) || person(e, lastNow, lastAnimate, i));
    rows.sort((a, b) => a.depth - b.depth || a.order - b.order);
    // Labels are a final overlay, so test them before the reverse-depth body pass.
    for (let i = rows.length - 1; i >= 0; i--) if (inside(x, y, rows[i].label)) return rows[i].employee;
    for (let i = rows.length - 1; i >= 0; i--) if (inside(x, y, rows[i].body)) return rows[i].employee;
    return null;
  }

  function portrait(ctx, employee) {
    const e = employee && typeof employee === 'object' ? employee : {};
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    if (!w || !h) return;
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.filter = 'none';
      ctx.setLineDash([]);
      ctx.clearRect(0, 0, w, h);
      rounded(ctx, 0, 0, w, h, Math.min(w, h) * 0.2);
      ctx.clip();
      const wash = ctx.createLinearGradient(0, 0, w, h);
      wash.addColorStop(0, '#314b60');
      wash.addColorStop(1, '#142838');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
      const colors = palette(e);
      ctx.globalAlpha = 0.11;
      ellipse(ctx, w * 0.73, h * 0.28, w * 0.43, h * 0.43, colors.top);
      ctx.globalAlpha = 1;
      const scale = Math.min(w / (57 * AVATAR_SCALE), h / (58 * AVATAR_SCALE));
      ctx.translate(w / 2, h * 0.86);
      ctx.scale(scale, scale);
      drawAvatar(ctx, {
        employee: { ...e, state: 'idle', moving: false, working: false },
        p: { x: 0, y: 0 }, colors, seated: false, walking: false, phase: 0, stride: 0, bob: 0
      }, false);
    } finally {
      ctx.restore();
    }
  }

  function stats() {
    const backgroundPixels = background ? WIDTH * HEIGHT : 0;
    const objectPixels = scenery.reduce((total, item) => total + item.canvas.width * item.canvas.height, 0);
    const cacheBytes = (backgroundPixels + objectPixels + (meter ? 1 : 0)) * 4;
    return {
      width: WIDTH, height: HEIGHT, ready: !!background, frames: frameCount,
      boardReady: boardImage.complete && boardImage.naturalWidth > 0,
      avatarReady: avatarImage.complete && avatarImage.naturalWidth > 0,
      employees: lastPeople.length, staticObjects: scenery.length,
      cacheCanvases: scenery.length + (background ? 1 : 0) + (meter ? 1 : 0),
      backgroundPixels, objectPixels, cacheBytes,
      cacheMiB: Math.round(cacheBytes / 1048576 * 100) / 100
    };
  }

  window.OfficeTwin = { width: WIDTH, height: HEIGHT, board, loadAssets, project, draw, hitTest, portrait, stats };
})();
