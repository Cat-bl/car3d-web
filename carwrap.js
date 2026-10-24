/* demo3d 车身贴纸（window.D3Wrap；车模配置里有贴纸、或者打开贴纸页时才加载）：拉花（内置条纹、手绘线、图案）、自己的图片、文字，
   照投影的办法贴到车身上——沿一个方向把贴图投过去，按车身的曲面生成一层薄网格（沿法线外推一点，点不到、不挡射线）。
   只贴看得见的那层：沿投影方向离屏画一张深度图，被挡住的面（门缝里的门框、内衬、透过玻璃看到的车里、隔着车身的另一边）不贴；
   背对投影方向太多的面不贴（会拉成长条），快到这个角度时淡出。贴在哪种零件上：车身（标了车漆的；没标车漆就是玻璃、灯、车轮以外的）/ 车窗 / 都贴。
   包住（图片、文字）：一张图顺着车身弯过去——上下包绕车长方向的轴（侧面翻过肩线到车顶、引擎盖），前后包绕竖直的轴（车头绕过转角到侧面）。
   把车身的横截面当成圆角矩形（超椭圆），沿轴的位置当横坐标、沿截面周长走过的长度当纵坐标展开；看得见的面按截面上每 45° 一个方向收集，
   每个三角形归到它法线所在的那一格。
   网格按"会动的部件"分组挂：门、引擎盖、尾门的铰链组、车窗、车身——跨门缝的贴纸自然被切开，开门时门上那块跟着走；一张贴纸一般只多 1～4 次绘制。
   贴图按格子记哪里有内容，网格只铺在有内容的格子里：细条纹、抠了背景的图片不会在整面车身上多画一层透明的。
   贴图按预乘透明度取样（缩小、斜着看时边上没有黑边），着色器里除回去再转线性颜色；材质按质感（亮面、缎面、哑光、金属、镭射）。
   分两步：收集（按投影方向缓存看得见的三角形：投到投影平面上、按格子分桶）→ 切（按贴纸的框和有内容的格子裁三角形）；拖贴纸只重做第二步。
   贴图按内容缓存（重建车、改别的贴纸时不重画），没人用了才释放。
   拉花按车长、车高画：侧面的整侧投影（左 / 右 / 两侧，右侧是左侧的镜像，车头那头一样），车顶的从上往下投；
   画好形状后统一加工：配色（单色、交替、渐变）、虚线、两端渐隐、描边。
   图片加工：裁剪 → 去背景（从边缘漫延，角色身上的同色不挖）→ 调色 → 边缘渐隐 → 白边（欧氏距离变换，边是圆的）。
   文字：卡片带的字体（wrap-fonts.js）只有英文字母、数字、标点，中文用系统字体；导入的字体存在本地库（carmodel.js）。字距、斜体、阴影、多行、渐变色、白边。
   车况页给的 ctx：{ renderer, root, dims, invalidate(), atRest(fn), occluders(), targets(on), owner(mesh), mat(props) }。全部 ES5。 */
(function () {
  'use strict';
  var T = window.THREE;
  var DEG = Math.PI / 180;
  // ================= 拉花模板 =================
  // 参数：[键, 名字, 最小, 最大, 步长, 默认, 单位]。单位：n 个数、mm 毫米、cm 厘米、pos 车长的比例（从车头量）、hgt 车高的比例、dh 车高的比例（正负）、
  // deg 度、pct 百分比、frac 比例（显示百分比）、sw 开关、seed 随机花样
  // frame：side 整侧、top 车顶、any 侧面或车顶都行（pf 选）；c2 / c3：第二、三种颜色的名字（没有就不用）
  var TPL = {
    belt: { name: '侧面腰线', frame: 'side', c2: null, lines: true, desc: '沿着车身侧面的几道细线，后段往下拐（照常见的腰线拉花）。',
      params: [['n', '几道线', 1, 6, 1, 3, 'n'], ['lw', '线宽', 3, 60, 1, 16, 'mm'], ['gap', '线的间距', 2, 60, 1, 12, 'mm'], ['lwr', '外粗里细', 0.2, 1, 0.05, 1, 'pct'],
        ['y', '高度', 0.25, 0.92, 0.005, 0.6, 'hgt'], ['rise', '车头那端高低', -0.25, 0.25, 0.005, -0.05, 'dh'], ['s0', '起点', 0, 0.5, 0.005, 0.05, 'pos'],
        ['s1', '拐点', 0.3, 0.98, 0.005, 0.72, 'pos'], ['drop', '往下拐的角度', 0, 80, 1, 52, 'deg'], ['dlen', '往下拐多少', 0, 0.6, 0.005, 0.34, 'hgt'],
        ['round', '拐角圆滑', 0, 1, 0.05, 0.6, 'pct'], ['tip', '起头渐细', 0, 0.6, 0.02, 0.2, 'pct']] },
    slash: { name: '侧面斜切条', frame: 'side', c2: null, lines: true, desc: '车门上斜着的一道或几道宽条，尾巴可以渐细。',
      params: [['s', '前后位置', 0, 1, 0.005, 0.78, 'pos'], ['y', '高度', 0.12, 0.88, 0.005, 0.42, 'hgt'], ['ang', '倾斜', -60, 60, 1, 28, 'deg'],
        ['len', '长度', 0.1, 1, 0.01, 0.55, 'hgt'], ['wd', '宽度', 1, 40, 0.5, 7, 'cm'], ['n', '几道', 1, 5, 1, 2, 'n'], ['gap', '间距', 1, 30, 0.5, 3, 'cm'],
        ['tip', '尾巴渐细', 0, 1, 0.05, 0.6, 'pct']] },
    rocker: { name: '侧裙条', frame: 'side', c2: '细线颜色', desc: '贴着车门下沿的一道宽条，下面可以再加一道细线。',
      params: [['y', '离地高度', 0.04, 0.5, 0.005, 0.16, 'hgt'], ['wd', '粗细', 0.5, 30, 0.5, 2.5, 'cm'], ['s0', '起点', 0, 0.5, 0.005, 0.2, 'pos'],
        ['s1', '终点', 0.5, 1, 0.005, 0.8, 'pos'], ['pt', '两头尖', 0, 0.45, 0.01, 0, 'pct'], ['fine', '下面加一道细线', 0, 1, 1, 1, 'sw'], ['fw', '细线宽', 2, 20, 1, 5, 'mm'], ['fg', '细线间距', 0.5, 10, 0.5, 1.5, 'cm']] },
    race2: { name: '双赛道条纹', frame: 'top', c2: '描边、细线颜色', lines: true, desc: '从车头经过车顶到车尾的两道平行宽条（玻璃上默认不贴）。',
      params: [['wd', '每道宽度', 5, 60, 0.5, 24, 'cm'], ['gap', '中间间距', 2, 40, 0.5, 8, 'cm'], ['edge', '描边', 0, 30, 1, 0, 'mm'],
        ['mid', '中间加一道细线', 0, 1, 1, 0, 'sw'], ['mw', '细线宽', 3, 40, 1, 10, 'mm'],
        ['s0', '从车头', 0, 0.5, 0.005, 0, 'pos'], ['s1', '到车尾', 0.5, 1, 0.005, 1, 'pos'], ['off', '左右偏移', -50, 50, 0.5, 0, 'cm']] },
    band: { name: '单道宽条', frame: 'top', c2: '描边颜色', desc: '车身正中一道宽条（玻璃上默认不贴）。',
      params: [['wd', '宽度', 5, 150, 1, 40, 'cm'], ['off', '左右偏移', -80, 80, 0.5, 0, 'cm'], ['edge', '描边', 0, 30, 1, 6, 'mm'],
        ['s0', '从车头', 0, 0.5, 0.005, 0, 'pos'], ['s1', '到车尾', 0.5, 1, 0.005, 1, 'pos']] },
    path: { name: '手绘线', frame: 'any', c2: null, lines: true, desc: '在车身侧面或车顶上用手指画一条线，拉花照着这条线走。',
      params: [['n', '几道线', 1, 6, 1, 2, 'n'], ['lw', '线宽', 3, 150, 1, 20, 'mm'], ['gap', '线的间距', 2, 80, 1, 10, 'mm'], ['lwr', '外粗里细', 0.2, 1, 0.05, 1, 'pct'],
        ['tip', '起头渐细', 0, 0.6, 0.02, 0.15, 'pct'], ['tip2', '收尾渐细', 0, 0.6, 0.02, 0.15, 'pct']] },
    pixel: { name: '像素渐隐', frame: 'any', c2: '混进去的颜色', desc: '一格格方块从密到疏散开，现在痛车、赛车涂装常用。',
      params: [['s0', '从', 0, 1, 0.005, 0.05, 'pos'], ['s1', '到', 0, 1, 0.005, 0.7, 'pos'], ['y', '位置', 0, 1, 0.005, 0.45, 'frac'], ['hgt', '宽窄', 0.05, 1, 0.01, 0.35, 'frac'],
        ['cell', '方块大小', 1, 20, 0.5, 5, 'cm'], ['dir', '后面密前面疏', 0, 1, 1, 0, 'sw'], ['dens', '密度', 0.1, 1, 0.05, 1, 'pct'], ['mix', '混色多少', 0, 1, 0.05, 0, 'pct'],
        ['seed', '换个花样', 1, 99, 1, 1, 'seed']] },
    speed: { name: '速度线', frame: 'any', c2: null, lines: true, desc: '几道长短不一、往后拖的细线。',
      params: [['s0', '从', 0, 1, 0.005, 0.1, 'pos'], ['s1', '到', 0, 1, 0.005, 0.9, 'pos'], ['y', '位置', 0, 1, 0.005, 0.45, 'frac'], ['hgt', '宽窄', 0.05, 1, 0.01, 0.3, 'frac'],
        ['n', '几道', 3, 40, 1, 12, 'n'], ['lw', '线宽', 3, 60, 1, 12, 'mm'], ['var', '长短变化', 0, 1, 0.05, 0.6, 'pct'], ['tip', '尾巴渐细', 0, 1, 0.05, 0.5, 'pct'],
        ['seed', '换个花样', 1, 99, 1, 1, 'seed']] },
    checker: { name: '格子旗', frame: 'any', c2: '另一种格子颜色', desc: '黑白方格，可以整片或者往后碎开。',
      params: [['s0', '从', 0, 1, 0.005, 0.6, 'pos'], ['s1', '到', 0, 1, 0.005, 1, 'pos'], ['y', '位置', 0, 1, 0.005, 0.5, 'frac'], ['hgt', '宽窄', 0.05, 1, 0.01, 0.4, 'frac'],
        ['cell', '格子大小', 2, 30, 0.5, 8, 'cm'], ['frag', '往前碎开', 0, 1, 1, 1, 'sw'], ['seed', '换个花样', 1, 99, 1, 1, 'seed']] },
    flame: { name: '火焰', frame: 'any', c2: '中间的颜色', c3: '火芯的颜色', desc: '老式改装车车头那种火焰，从车头往后烧。',
      params: [['s0', '从车头', 0, 0.8, 0.005, 0.02, 'pos'], ['len', '烧多长', 0.1, 1, 0.01, 0.55, 'pct'], ['y', '位置', 0, 1, 0.005, 0.42, 'frac'], ['hgt', '宽窄', 0.05, 1, 0.01, 0.45, 'frac'],
        ['n', '几条火舌', 3, 14, 1, 7, 'n'], ['curl', '卷曲', 0, 1, 0.05, 0.5, 'pct'], ['seed', '换个花样', 1, 99, 1, 1, 'seed']] },
    camo: { name: '迷彩', frame: 'any', c2: '第二种颜色', c3: '第三种颜色', desc: '色块迷彩或者数码迷彩，可以整面也可以一段。',
      params: [['s0', '从', 0, 1, 0.005, 0, 'pos'], ['s1', '到', 0, 1, 0.005, 1, 'pos'], ['y', '位置', 0, 1, 0.005, 0.5, 'frac'], ['hgt', '宽窄', 0.05, 1, 0.01, 1, 'frac'],
        ['style', '数码迷彩（方块）', 0, 1, 1, 0, 'sw'], ['scale', '花纹大小', 5, 80, 1, 30, 'cm'], ['seed', '换个花样', 1, 99, 1, 1, 'seed']] }
  };
  var TPL_ORDER = ['belt', 'slash', 'rocker', 'race2', 'band', 'path', 'pixel', 'speed', 'checker', 'flame', 'camo'];
  var C1 = '#16181b', C1T = { flame: '#d62c1a', camo: '#4b5320' }, C2 = { rocker: '#16181b', race2: '#ffffff', band: '#ffffff', pixel: '#c8102e', checker: '#ffffff', flame: '#f39c12', camo: '#7c7a52' }, C3 = { flame: '#ffe066', camo: '#2f3326' };
  /** 这张拉花的参数（缺的用默认、超出范围的夹回去） */
  function params(w) {
    var t = TPL[w.tpl], p = {}, src = w.p || {};
    t.params.forEach(function (q) { var v = src[q[0]]; p[q[0]] = typeof v === 'number' && isFinite(v) ? Math.max(q[2], Math.min(q[3], v)) : q[5]; });
    return p;
  }
  /** 颜色：[主色, 第二色, 第三色, 交替色, 渐变的另一头, 描边] */
  function colors(w) { return [w.c1 || C1T[w.tpl] || C1, w.c2 || C2[w.tpl] || '#ffffff', w.c3 || C3[w.tpl] || '#ffffff', w.ac || '#ffffff', w.gc || '#ffffff', w.oc || '#ffffff']; }
  /** 拉花投到哪：侧面还是车顶 */
  function topOf(w) { var f = TPL[w.tpl].frame; return f === 'top' || (f === 'any' && w.pf === 'top'); }

  // ================= 画布上的小工具 =================
  var MAXPX = 2048;
  /** 一条中线（像素点）+ 每个点的半宽 → 填一条带子 */
  function ribbon(x, pts, half) {
    if (pts.length < 2) return;
    var L = [], R = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l, ny = dx / l;
      L.push([pts[i][0] + nx * half[i], pts[i][1] + ny * half[i]]); R.push([pts[i][0] - nx * half[i], pts[i][1] - ny * half[i]]);
    }
    x.beginPath();
    x.moveTo(L[0][0], L[0][1]);
    for (i = 1; i < L.length; i++) x.lineTo(L[i][0], L[i][1]);
    for (i = R.length - 1; i >= 0; i--) x.lineTo(R[i][0], R[i][1]);
    x.closePath();
    x.fill();
  }
  /** 一条中线平移 o（像素，往左手边为正）后的点 */
  function offset(pts, o) {
    return pts.map(function (p, i) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
      return [p[0] - dy / l * o, p[1] + dx / l * o];
    });
  }
  /** 折线（像素）按间距 st 重新取点，返回 { pts, f（从头到这个点占全长的比例） } */
  function resample(line, st) {
    var pts = [line[0]], acc = [0], i;
    for (i = 1; i < line.length; i++) {
      var a = line[i - 1], b = line[i], d = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])), n = Math.max(1, Math.ceil(d / st));
      for (var k = 1; k <= n; k++) { pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); acc.push(acc[acc.length - 1] + d / n); }
    }
    var tot = acc[acc.length - 1] || 1;
    return { pts: pts, f: acc.map(function (v) { return v / tot; }) };
  }
  /** 手画的点连成光滑的线（Catmull-Rom，每段 8 个点） */
  function smoothLine(p) {
    if (p.length < 3) return p.slice();
    var out = [];
    for (var i = 0; i < p.length - 1; i++) {
      var a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(p.length - 1, i + 2)];
      for (var k = 0; k < 8; k++) {
        var t = k / 8, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * b[0] + (-a[0] + c[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3),
          0.5 * (2 * b[1] + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3)]);
      }
    }
    out.push(p[p.length - 1]);
    return out;
  }
  /** 带种子的随机数（花样固定：同一个种子每次画出来一样） */
  function rng(seed) { var a = (seed * 2654435761) >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /** 二维值噪声（迷彩用）：格点随机值，平滑插值 */
  function noise2(seed) {
    var hash = function (i, j) { var h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    return function (x, y) {
      var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  /** 画布上有内容（透明度 > 8）的范围 */
  function inkBox(c) {
    var W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data, l = W, r = -1, t = H, b = -1, X, Y;
    for (Y = 0; Y < H; Y++) for (X = 0; X < W; X++) if (d[(Y * W + X) * 4 + 3] > 8) { if (X < l) l = X; if (X > r) r = X; if (Y < t) t = Y; b = Y; }
    return r < 0 ? null : { l: l, r: r + 1, t: t, b: b + 1 };
  }
  function newCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  // ================= 加工（拉花、图片、文字共用） =================
  /** 渐变上色：已有的形状换成从 c0 到 c1 的渐变（axis 'x' 横向、'y' 竖向，按内容的范围） */
  function gradFill(c, axis, c0, c1, box) {
    box = box || inkBox(c);
    if (!box) return;
    var x = c.getContext('2d'), g = axis === 'x' ? x.createLinearGradient(box.l, 0, box.r, 0) : x.createLinearGradient(0, box.t, 0, box.b);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    x.save(); x.globalCompositeOperation = 'source-in'; x.fillStyle = g; x.fillRect(0, 0, c.width, c.height); x.restore();
  }
  /** 虚线：沿 axis 方向每 len 像素留下、gap 像素切掉 */
  function dashCut(c, axis, len, gap, box) {
    box = box || inkBox(c);
    if (!box || len <= 0 || gap <= 0) return;
    var x = c.getContext('2d');
    x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    if (axis === 'x') for (var a = box.l + len; a < box.r; a += len + gap) x.fillRect(a, 0, gap, c.height);
    else for (var b = box.t + len; b < box.b; b += len + gap) x.fillRect(0, b, c.width, gap);
    x.restore();
  }
  /** 两端渐隐：沿 axis 方向从头 fa、到尾 fb（占内容长度的比例）慢慢淡出 */
  function endFade(c, axis, fa, fb, box) {
    box = box || inkBox(c);
    if (!box || (fa <= 0 && fb <= 0)) return;
    var x = c.getContext('2d'), g = axis === 'x' ? x.createLinearGradient(box.l, 0, box.r, 0) : x.createLinearGradient(0, box.t, 0, box.b);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(Math.min(0.5, Math.max(0.0001, fa)), '#000'); g.addColorStop(Math.max(0.5, Math.min(0.9999, 1 - fb)), '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save(); x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(0, 0, c.width, c.height); x.restore();
  }
  /** 一维平方距离变换（Felzenszwalb）：f 输入、d 输出，v / z 是工作数组 */
  function edt1(f, n, d, v, z) {
    var k = 0, q, s;
    v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (q = 1; q < n; q++) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
    }
    k = 0;
    for (q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  }
  /** 白边 / 描边：形状外面一圈 wpx 像素宽的颜色（欧氏距离，边是圆的）。pad：画布四周先留出描边的地方（图片、文字）；
     拉花的画布按车的大小，不加，只算形状（box）附近那一块（形状常常只占一条） */
  function outline(c, wpx, color, pad, box) {
    if (!(wpx > 0.5)) return c;
    var P = pad ? Math.ceil(wpx + 2) : 0, m = Math.ceil(wpx + 2), rx = 0, ry = 0, rw = c.width, rh = c.height;
    if (!pad && box) { rx = Math.max(0, Math.floor(box.l) - m); ry = Math.max(0, Math.floor(box.t) - m); rw = Math.min(c.width, Math.ceil(box.r) + m) - rx; rh = Math.min(c.height, Math.ceil(box.b) + m) - ry; }
    var W = rw + 2 * P, H = rh + 2 * P, src = c.getContext('2d').getImageData(rx, ry, rw, rh).data;
    var INF = 1e20, g = new Float32Array(W * H), i, X, Y;
    for (i = 0; i < g.length; i++) g[i] = INF;
    for (Y = 0; Y < rh; Y++) for (X = 0; X < rw; X++) if (src[(Y * rw + X) * 4 + 3] > 127) g[(Y + P) * W + X + P] = 0;
    var n = Math.max(W, H), f = new Float32Array(n), d = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
    for (X = 0; X < W; X++) { for (Y = 0; Y < H; Y++) f[Y] = g[Y * W + X]; edt1(f, H, d, v, z); for (Y = 0; Y < H; Y++) g[Y * W + X] = d[Y]; }
    for (Y = 0; Y < H; Y++) { for (X = 0; X < W; X++) f[X] = g[Y * W + X]; edt1(f, W, d, v, z); for (X = 0; X < W; X++) g[Y * W + X] = d[X]; }
    var out = newCanvas(pad ? W : c.width, pad ? H : c.height), ox = out.getContext('2d'), img = ox.createImageData(W, H), od = img.data, rgb = hexRgb(color);
    for (i = 0; i < g.length; i++) {
      var a = Math.max(0, Math.min(1, wpx + 0.5 - Math.sqrt(g[i])));
      if (a <= 0) continue;
      od[i * 4] = rgb[0]; od[i * 4 + 1] = rgb[1]; od[i * 4 + 2] = rgb[2]; od[i * 4 + 3] = Math.round(a * 255);
    }
    ox.putImageData(img, rx, ry);
    ox.drawImage(c, P, P);
    c.width = c.height = 0;
    return out;
  }
  /** 拉花画好形状后的统一加工：渐变、虚线、两端渐隐、描边（axis：拉花走向，侧面是横的、车顶是竖的） */
  function finishStripe(c, w, axis, k) {
    var col = colors(w), box = inkBox(c);
    if (!box) return c;
    var across = axis === 'x' ? 'y' : 'x';
    if (w.grad) gradFill(c, w.grad === 'a' ? axis : across, col[0], col[4], box);
    if (w.dash) dashCut(c, axis, w.dash[0] / 100 * k, w.dash[1] / 100 * k, box);
    if (w.fd) endFade(c, axis, w.fd[0], w.fd[1], box);
    if (w.out) c = outline(c, w.out / 1000 * k, col[5], false, box);
    return c;
  }

  // ================= 拉花的画布（按米画，长宽和车一样） =================
  /** 画布的大小（像素 / 米）：最长边不超过 2048，最细也有 700 像素一米 */
  function pxPerM(wm, hm) { return Math.min(700, MAXPX / Math.max(wm, hm)); }
  /** 拉花的画布：侧面的按车长 × 车高（左边是车头、上边是车顶），车顶的按车宽 × 车长（上边是车头、左边是车的左边） */
  function stripeCanvas(w, dims) {
    var p = params(w), col = colors(w), top = topOf(w);
    var Lc = 2 * dims.hl, Hc = dims.h, Wc = 2 * dims.hw, wm = top ? Wc : Lc, hm = top ? Lc : Hc, k = pxPerM(wm, hm);
    var c = newCanvas(wm * k, hm * k), x = c.getContext('2d');
    var ink = function (i) { return w.alt && i % 2 ? col[3] : col[0]; }; // 几道线交替两种颜色
    var P = function (s, h) { return [s * k, (Hc - h) * k]; }; // 侧面：s 从车头往后（米），h 离地（米）
    x.fillStyle = col[0];
    if (w.tpl === 'belt') {
      var mm = k / 1000, p0 = [p.s0 * Lc, (p.y + p.rise) * Hc], p1 = [Math.max(p.s0 + 0.02, p.s1) * Lc, p.y * Hc], line = [p0, p1];
      var band = (p.n * p.lw + (p.n - 1) * p.gap) / 2000; // 几道线合起来的半宽（米）
      if (p.drop >= 3 && p.dlen > 0.005) {
        var dv = p.dlen * Hc, p2 = [p1[0] + dv / Math.tan(p.drop * DEG), p1[1] - dv];
        var la = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), lb = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        var r = Math.min(0.48 * Math.min(la, lb), Math.max(p.round * 0.5 * Math.min(la, lb), p.round > 0 ? band * 1.2 : 0));
        var a1 = [p1[0] - (p1[0] - p0[0]) / la * r, p1[1] - (p1[1] - p0[1]) / la * r], b1 = [p1[0] + (p2[0] - p1[0]) / lb * r, p1[1] + (p2[1] - p1[1]) / lb * r];
        line = [p0, a1];
        for (var q = 1; q <= 24; q++) { var u = q / 24, v = 1 - u; line.push([v * v * a1[0] + 2 * v * u * p1[0] + u * u * b1[0], v * v * a1[1] + 2 * v * u * p1[1] + u * u * b1[1]]); }
        line.push(p2);
      }
      lines(x, resample(line.map(function (m) { return P(m[0], m[1]); }), 3), p, mm, ink, p.tip, 0);
    } else if (w.tpl === 'path') {
      var pts = (w.path || []).map(function (q2) { return [q2[0] * wm * k, q2[1] * hm * k]; });
      if (pts.length >= 2) lines(x, resample(smoothLine(pts), 3), p, k / 1000, ink, p.tip, p.tip2);
    } else if (w.tpl === 'slash') {
      var cm = k / 100, dx = Math.sin(p.ang * DEG), dy = Math.cos(p.ang * DEG), half = p.len * Hc / 2;
      for (var j = 0; j < p.n; j++) {
        var cs = p.s * Lc + (j - (p.n - 1) / 2) * (p.wd + p.gap) / 100, ch = p.y * Hc;
        var sl = resample([P(cs + dx * half, ch + dy * half), P(cs - dx * half, ch - dy * half)], 3);
        x.fillStyle = ink(j);
        ribbon(x, sl.pts, sl.f.map(function (f) { return p.wd * cm / 2 * (p.tip > 0 && f > 1 - p.tip ? Math.max(0.04, (1 - f) / p.tip) : 1); }));
      }
    } else if (w.tpl === 'rocker') {
      var x0 = p.s0 * Lc * k, x1 = p.s1 * Lc * k, yc = (Hc - p.y * Hc) * k, th = p.wd / 100 * k;
      var rk = resample([[x0, yc], [x1, yc]], 3);
      ribbon(x, rk.pts, rk.f.map(function (f) { return th / 2 * (p.pt > 0 ? Math.min(1, f / p.pt, (1 - f) / p.pt) * 0.96 + 0.04 : 1); })); // 两头尖
      if (p.fine) { x.fillStyle = col[1]; x.fillRect(x0, yc + th / 2 + p.fg / 100 * k, x1 - x0, p.fw / 1000 * k); }
    } else if (w.tpl === 'race2' || w.tpl === 'band') { // 车顶：x 横跨车宽（左边是车的左边），y 从车头往后
      var y0 = p.s0 * Lc * k, y1 = p.s1 * Lc * k, mid = Wc / 2 * k, wd = p.wd / 100 * k, ed = p.edge / 1000 * k;
      var cents = w.tpl === 'race2' ? [-(p.gap / 2 + p.wd / 2), p.gap / 2 + p.wd / 2] : [0];
      cents.forEach(function (cc, i2) {
        var cx = mid + (cc + p.off) / 100 * k;
        if (ed > 0) { x.fillStyle = col[1]; x.fillRect(cx - wd / 2 - ed, y0, wd + 2 * ed, y1 - y0); }
        x.fillStyle = ink(i2); x.fillRect(cx - wd / 2, y0, wd, y1 - y0);
      });
      if (w.tpl === 'race2' && p.mid) { var mw = p.mw / 1000 * k; x.fillStyle = col[1]; x.fillRect(mid + p.off / 100 * k - mw / 2, y0, mw, y1 - y0); }
    } else pattern(x, w, p, col, k, Lc * k, (top ? Wc : Hc) * k, top);
    return finishStripe(c, w, top ? 'y' : 'x', k);
  }
  /** 几道平行线沿一条中线走（腰线、手绘线）：外粗里细、起头 / 收尾渐细、每道线的颜色 */
  function lines(x, rs, p, mm, ink, tip, tip2) {
    for (var i = 0; i < p.n; i++) {
      var o = (i - (p.n - 1) / 2) * (p.lw + p.gap) * mm, scale = p.n > 1 ? 1 - (1 - p.lwr) * i / (p.n - 1) : 1, hw = p.lw * mm / 2 * scale;
      x.fillStyle = ink(i);
      ribbon(x, offset(rs.pts, o), rs.f.map(function (f) {
        var a = tip > 0 ? Math.min(1, 0.1 + 0.9 * f / tip) : 1, b = tip2 > 0 ? Math.min(1, 0.1 + 0.9 * (1 - f) / tip2) : 1;
        return hw * Math.min(a, b);
      }));
    }
  }
  /** 图案：在"沿着 a、横着 b"的坐标里画（侧面 a 是车长方向、b 往下；车顶 a 是车长方向、b 从左往右——换坐标轴画） */
  function pattern(x, w, p, col, k, A, B, top) {
    if (top) x.setTransform(0, 1, 1, 0, 0, 0); // (a, b) → 画布 (b, a)
    var R = rng(p.seed * 7919 + TPL_ORDER.indexOf(w.tpl)), a0 = Math.min(p.s0, p.s1 !== undefined ? p.s1 : 1) * A, a1 = (p.s1 !== undefined ? Math.max(p.s0, p.s1) : Math.min(1, p.s0 + p.len)) * A;
    var bc = (top ? p.y : 1 - p.y) * B, hb = p.hgt * B / 2, b0 = bc - hb, b1 = bc + hb, ink = function (i) { return w.alt && i % 2 ? col[3] : col[0]; };
    var cell, ia, ib, f;
    if (w.tpl === 'pixel' || w.tpl === 'checker') {
      cell = p.cell / 100 * k;
      var na = Math.max(1, Math.round((a1 - a0) / cell)), nb = Math.max(1, Math.round((b1 - b0) / cell)), ca = (a1 - a0) / na, cb = (b1 - b0) / nb;
      for (ia = 0; ia < na; ia++) for (ib = 0; ib < nb; ib++) {
        f = (ia + 0.5) / na;
        if (w.tpl === 'pixel') {
          if (p.dir) f = 1 - f;
          if (R() > p.dens * Math.pow(1 - f, 1.3)) continue; // 前面密、往后越来越疏
          x.fillStyle = R() < p.mix ? col[1] : col[0];
          var g = 0.12 * Math.min(ca, cb);
          x.fillRect(a0 + ia * ca + g / 2, b0 + ib * cb + g / 2, ca - g, cb - g);
        } else {
          if (p.frag && f < 0.6 && R() > f / 0.6) continue; // 前面碎开
          x.fillStyle = (ia + ib) % 2 ? col[1] : col[0];
          x.fillRect(a0 + ia * ca, b0 + ib * cb, ca + 0.5, cb + 0.5);
        }
      }
    } else if (w.tpl === 'speed') {
      for (var i = 0; i < p.n; i++) {
        var len = (a1 - a0) * (1 - p['var'] * R() * 0.85), st = a0 + R() * (a1 - a0 - len), bb = b0 + R() * (b1 - b0), lw = p.lw / 1000 * k * (0.5 + 0.5 * R());
        var rs = resample([[st, bb], [st + len, bb]], 3);
        x.fillStyle = ink(i);
        ribbon(x, rs.pts, rs.f.map(function (f2) { return lw / 2 * (p.tip > 0 && f2 > 1 - p.tip ? Math.max(0.03, (1 - f2) / p.tip) : 1) * Math.min(1, 0.3 + f2 * 8); }));
      }
    } else if (w.tpl === 'flame') { // 车头一整团，往后分成几条胖火舌，S 形摆动、尖上勾起来
      var tongues = [], span = a1 - a0, pitch = (b1 - b0) / p.n, fat = Math.min(b1 - b0, span * 0.5);
      for (var t = 0; t < p.n; t++) {
        var side = Math.abs((t + 0.5) / p.n - 0.5) * 2; // 0 中间、1 两边：两边的短
        tongues.push({ b: b0 + (t + 0.5) * pitch, L: span * (1 - 0.45 * side) * (0.6 + 0.4 * R()), ph: R() * 6.28, amp: fat * (0.12 + 0.18 * R()) * p.curl, up: R() < 0.5 ? -1 : 1 });
      }
      [[col[0], 1, 1, 0], [col[1], 0.62, 0.8, 0.04], [col[2], 0.3, 0.56, 0.08]].forEach(function (layer) { // 外焰、中焰、火芯
        x.fillStyle = layer[0];
        tongues.forEach(function (tg) {
          var pts = [], st = a0 + span * layer[3], L = Math.max(span * 0.05, tg.L * layer[2] - span * layer[3]), W0 = Math.max(pitch * 1.6, fat * 0.42) * layer[1];
          for (var s = 0; s <= 60; s++) { var u = (st - a0 + s / 60 * L) / tg.L; pts.push([a0 + u * tg.L, tg.b + Math.sin(u * 7 + tg.ph) * tg.amp * Math.pow(u, 0.7) + tg.up * tg.amp * 2.2 * Math.pow(u, 4)]); } // 里面几层顺着外焰的中线走
          var rs2 = resample(pts, 3), hw2 = rs2.f.map(function (u) { return W0 / 2 * (u < 0.2 ? 1 : Math.pow((1 - u) / 0.8, 1.25)); });
          ribbon(x, rs2.pts, hw2);
          x.beginPath(); x.arc(rs2.pts[0][0], rs2.pts[0][1], hw2[0], 0, 7); x.fill(); // 车头那端是圆的
        });
      });
    } else if (w.tpl === 'camo') {
      var sc = p.scale / 100 * k, nz = noise2(p.seed * 101 + 7);
      if (p.style) { // 数码迷彩：方块
        var q = sc / 5, ncA = Math.ceil((a1 - a0) / q), ncB = Math.ceil((b1 - b0) / q);
        for (ia = 0; ia < ncA; ia++) for (ib = 0; ib < ncB; ib++) {
          var vv = nz(ia * q / sc, ib * q / sc) * 0.7 + nz(ia * q / sc * 3.1, ib * q / sc * 3.1) * 0.3;
          x.fillStyle = vv < 0.4 ? col[0] : vv < 0.62 ? col[1] : col[2];
          x.fillRect(a0 + ia * q, b0 + ib * q, q + 0.5, q + 0.5);
        }
      } else { // 色块迷彩：噪声分三档，边是平滑的；按三分之一的分辨率算再放大（贴到车上看不出，快 9 倍）
        var DS = 3, W2 = Math.max(1, Math.ceil((a1 - a0) / DS)), H2 = Math.max(1, Math.ceil((b1 - b0) / DS)), tmp = newCanvas(W2, H2), tx = tmp.getContext('2d'), img = tx.createImageData(W2, H2), d = img.data;
        sc /= DS;
        var c0 = hexRgb(col[0]), c1 = hexRgb(col[1]), c2 = hexRgb(col[2]);
        for (var yy = 0; yy < H2; yy++) for (var xx = 0; xx < W2; xx++) {
          var n2 = nz(xx / sc, yy / sc) * 0.65 + nz(xx / sc * 2.3 + 17, yy / sc * 2.3 + 5) * 0.35, cc2 = n2 < 0.42 ? c0 : n2 < 0.6 ? c1 : c2, o = (yy * W2 + xx) * 4;
          d[o] = cc2[0]; d[o + 1] = cc2[1]; d[o + 2] = cc2[2]; d[o + 3] = 255;
        }
        tx.putImageData(img, 0, 0);
        x.imageSmoothingEnabled = true;
        x.drawImage(tmp, a0, b0, W2 * DS, H2 * DS);
        tmp.width = tmp.height = 0;
      }
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ================= 文字 =================
  var SYS = '"Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", MiSans, sans-serif';
  var fontP = {}, builtinP = null;
  /** 卡片带的字体列表（加载 wrap-fonts.js） */
  function builtins() {
    if (window.D3WrapFonts) return Promise.resolve(window.D3WrapFonts);
    if (!builtinP) builtinP = new Promise(function (res) {
      var s = document.createElement('script');
      s.src = 'wrap-fonts.js';
      s.onload = function () { res(window.D3WrapFonts || []); };
      s.onerror = function () { builtinP = null; res([]); };
      document.head.appendChild(s);
    });
    return builtinP;
  }
  function b64buf(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
  /** 字体引用（b:内置 / u:导入的）的 CSS 字体名；加载好了才 resolve。加载不了 resolve null（照系统字体写） */
  function loadFont(ref) {
    if (!ref || ref === 'sys' || ref === 'sysb') return Promise.resolve(null);
    if (fontP[ref]) return fontP[ref];
    var fam = (ref.charAt(0) === 'b' ? 'D3W-' : 'D3U-') + ref.slice(2);
    var src = ref.charAt(0) === 'b' ? builtins().then(function (l) { var f = l.filter(function (x) { return x.id === ref.slice(2); })[0]; return f ? b64buf(f.woff2) : null; }) : window.D3Model ? D3Model.fontGet(ref.slice(2)) : Promise.resolve(null);
    fontP[ref] = src.then(function (buf) {
      if (!buf || !window.FontFace || !document.fonts) return null;
      var ff = new FontFace(fam, buf);
      return ff.load().then(function () { document.fonts.add(ff); return fam; });
    }).then(null, function () { delete fontP[ref]; return null; });
    return fontP[ref];
  }
  /** 检查一个字体文件能不能用（导入字体时） */
  function checkFont(buf) {
    if (!window.FontFace) return Promise.reject(new Error('这台车机不支持导入字体'));
    return new FontFace('D3Check' + Date.now(), buf).load();
  }
  function fontCss(w, fam) { return (w.font === 'sysb' ? '800 ' : w.font === 'sys' || !w.font ? '600 ' : '400 ') + '200px ' + (fam ? '"' + fam + '", ' : '') + SYS; }
  /** 文字的画布：多行（横排一行一行往下，竖排一列一列从右往左）、字距、斜体、阴影、描边（字外面）、渐变色，按墨迹裁好
     （手写体的笔画常常伸出字框，量不准，画出来数像素）；最后统一做两端渐隐、白边 */
  function textCanvas(w, fam) {
    var rows = String(w.text || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s, i, a) { return s || a.some(function (o) { return !!o; }); });
    if (!rows.some(function (s) { return !!s; })) return null;
    var col = colors(w), vert = !!w.vert, fs = 200, sw = [0, 0.06, 0.12][w.stroke || 0] * fs, ls = (w.ls || 0) * fs, sk = w.it ? -0.21 : 0, sh = w.sh;
    var probe = newCanvas(4, 4).getContext('2d');
    probe.font = fontCss(w, fam);
    var cw = function (ch) { return probe.measureText(ch).width; };
    var lineW = rows.map(function (s) { var t = 0; s.split('').forEach(function (ch, i) { t += cw(ch) + (i ? ls : 0); }); return t; });
    var colH = rows.map(function (s) { return s.length * fs * 1.08 + Math.max(0, s.length - 1) * ls; });
    var LH = fs * 1.3, CW = fs * 1.25, shx = sh ? Math.abs(sh.x || 0) * fs + (sh.b || 0) * fs : 0, shy = sh ? Math.abs(sh.y || 0) * fs + (sh.b || 0) * fs : 0;
    var pad = Math.ceil(fs * 0.8 + sw + Math.max(shx, shy) + Math.abs(sk) * fs);
    var bw = vert ? rows.length * CW : Math.max.apply(null, lineW), bh = vert ? Math.max.apply(null, colH) : rows.length * LH;
    var W = Math.ceil(bw + 2 * pad), H = Math.ceil(bh + 2 * pad), sc = Math.min(1, 4096 / Math.max(W, H));
    var tmp = newCanvas(W * sc, H * sc), x = tmp.getContext('2d');
    /** 一个一个字放（字距、竖排都要按字放），fn(字, x, y) */
    var each = function (fn) {
      rows.forEach(function (s, r) {
        var cx = vert ? W - pad - (r + 0.5) * CW : pad, cy = vert ? pad : pad + (r + 0.86) * LH;
        s.split('').forEach(function (ch, i) {
          if (vert) { fn(ch, cx, cy + (i + 0.86) * fs * 1.08 + i * ls, 'center'); }
          else { fn(ch, cx, cy, 'left'); cx += cw(ch) + ls; }
        });
      });
    };
    var draw = function (ctx, kind) {
      ctx.setTransform(sc, 0, sk * sc, sc, -sk * sc * H * 0.5, 0); // 斜体：按中线错切
      ctx.font = fontCss(w, fam); ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      each(function (ch, a, b, al) { ctx.textAlign = al; if (kind === 'stroke') ctx.strokeText(ch, a, b); else ctx.fillText(ch, a, b); });
    };
    if (sh) { // 阴影：单独画一层（字和描边都投影），模糊用画布自带的
      var shc = newCanvas(tmp.width, tmp.height), sx2 = shc.getContext('2d');
      sx2.fillStyle = sx2.strokeStyle = sh.c || '#000000';
      if (sw > 0) { sx2.lineWidth = 2 * sw; draw(sx2, 'stroke'); }
      draw(sx2, 'fill');
      x.save();
      x.filter = (sh.b || 0) > 0 ? 'blur(' + Math.round((sh.b || 0) * fs * sc) + 'px)' : 'none';
      x.drawImage(shc, (sh.x || 0) * fs * sc, (sh.y || 0) * fs * sc);
      x.restore();
      shc.width = shc.height = 0;
    }
    if (sw > 0) { x.strokeStyle = col[1]; x.lineWidth = 2 * sw; draw(x, 'stroke'); }
    if (w.grad) { // 渐变色只上在字上（描边照旧）
      var fc = newCanvas(tmp.width, tmp.height), fx = fc.getContext('2d');
      fx.fillStyle = '#fff'; draw(fx, 'fill');
      gradFill(fc, w.grad === 'a' ? (vert ? 'y' : 'x') : (vert ? 'x' : 'y'), col[0], col[4]);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(fc, 0, 0);
      fc.width = fc.height = 0;
    } else { x.fillStyle = col[0]; draw(x, 'fill'); }
    x.setTransform(1, 0, 0, 1, 0, 0);
    var box = inkBox(tmp);
    if (!box) return null;
    var m = 6, iw = box.r - box.l + 2 * m, ih = box.b - box.t + 2 * m, k = Math.min(1, MAXPX / Math.max(iw, ih)), c = newCanvas(iw * k, ih * k);
    c.getContext('2d').drawImage(tmp, box.l - m, box.t - m, iw, ih, 0, 0, c.width, c.height);
    tmp.width = tmp.height = 0;
    if (w.fd) endFade(c, vert ? 'y' : 'x', w.fd[0], w.fd[1]);
    if (w.out) c = outline(c, w.out / 100 * Math.max(c.width, c.height), col[5], true);
    return c;
  }
  /** 导出车模包时：用导入的字体写的文字画成 PNG（别人没有这个字体） */
  function raster(w) {
    return loadFont(w.font).then(function (fam) {
      if (!fam) return null;
      var c = textCanvas(w, fam);
      return c && window.D3Model ? D3Model.toBytes(c, 'image/png').then(function (b) { return { bytes: b, mime: 'image/png' }; }) : null;
    });
  }

  // ================= 图片 =================
  /** 选的图片文件 → 缩到 1024 以内（有透明的存 PNG，别的存 JPEG）存进本地库 → 'h:哈希' */
  function importImage(file) {
    var M = window.D3Model;
    return M.readFile(file).then(function (f) {
      var u8 = new Uint8Array(f.buf), mime = M.sniff(u8);
      if (!/^image\/(png|jpeg|webp)$/.test(mime)) { var e = new Error('只支持 PNG / JPG / WebP 图片'); e.user = true; throw e; }
      return M.decodeImg(new Blob([u8], { type: mime })).then(function (im) {
        var k = Math.min(1, M.MAX_TEX / Math.max(im.width, im.height)), c = newCanvas(im.width * k, im.height * k);
        var x = c.getContext('2d');
        x.drawImage(im, 0, 0, c.width, c.height);
        if (im.close) im.close();
        var d = x.getImageData(0, 0, c.width, c.height).data, alpha = false;
        for (var i = 3; i < d.length; i += 4) if (d[i] < 250) { alpha = true; break; }
        return M.toBytes(c, alpha ? 'image/png' : 'image/jpeg', 0.9).then(function (b) { c.width = c.height = 0; return M.wrapImgPut(b, alpha ? 'image/png' : 'image/jpeg'); });
      });
    });
  }
  // 解码过的原图：几张贴纸用同一张图、改加工参数时不重新解码（最多留 6 张）
  var RAW = {}, rawOrder = [];
  function rawImage(ref, ctx) {
    var key = (typeof ref === 'number' ? ctx.bufId + '#' : '') + ref;
    if (RAW[key]) return RAW[key];
    RAW[key] = D3Model.wrapImg(ref, ctx.buf).then(function (b) {
      return b ? D3Model.decodeImg(b).then(function (im) { var c = newCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); if (im.close) im.close(); return c; }) : null;
    }).then(null, function () { return null; });
    rawOrder.push(key);
    while (rawOrder.length > 6) { var k0 = rawOrder.shift(); delete RAW[k0]; }
    return RAW[key];
  }
  /** 去背景：key = { c: 'auto' / 颜色, tol 容差, soft 柔和度, edge 只去从边缘连着的 }；颜色离背景色越近越透明 */
  function keyOut(c, key) {
    var W = c.width, H = c.height, x = c.getContext('2d'), img = x.getImageData(0, 0, W, H), d = img.data, i, kc;
    if (key.c === 'auto' || !key.c) { // 四个角的平均色
      kc = [0, 0, 0];
      [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].forEach(function (p) { var o = (p[1] * W + p[0]) * 4; kc[0] += d[o] / 4; kc[1] += d[o + 1] / 4; kc[2] += d[o + 2] / 4; });
    } else kc = hexRgb(key.c);
    var tol = (key.tol === undefined ? 0.15 : key.tol) * 441.7, soft = Math.max(1, (key.soft === undefined ? 0.08 : key.soft) * 441.7), n = W * H, fac = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var dr = d[i * 4] - kc[0], dg = d[i * 4 + 1] - kc[1], db = d[i * 4 + 2] - kc[2], dist = Math.sqrt(dr * dr + dg * dg + db * db);
      fac[i] = dist <= tol ? 0 : dist >= tol + soft ? 1 : (dist - tol) / soft;
    }
    if (key.edge !== false) { // 只去从边缘漫延进来的：中间同色的地方（衣服、眼白）不挖
      var seen = new Uint8Array(n), q = new Int32Array(n), qh = 0, qt = 0;
      var push = function (p) { if (!seen[p] && fac[p] < 1) { seen[p] = 1; q[qt++] = p; } };
      for (i = 0; i < W; i++) { push(i); push((H - 1) * W + i); }
      for (i = 0; i < H; i++) { push(i * W); push(i * W + W - 1); }
      while (qh < qt) {
        var p = q[qh++], px = p % W, py = (p - px) / W;
        if (px > 0) push(p - 1); if (px < W - 1) push(p + 1); if (py > 0) push(p - W); if (py < H - 1) push(p + W);
      }
      for (i = 0; i < n; i++) if (!seen[i]) fac[i] = 1;
    }
    for (i = 0; i < n; i++) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * fac[i]);
    x.putImageData(img, 0, 0);
  }
  /** 图片加工：裁剪 → 去背景 → 调色 → 边缘渐隐 → 白边 */
  function processImage(raw, w) {
    var cr = w.crop || [0, 0, 0, 0], sx = Math.round(raw.width * cr[0]), sy = Math.round(raw.height * cr[2]);
    var cw = Math.max(1, Math.round(raw.width * (1 - cr[0] - cr[1]))), ch = Math.max(1, Math.round(raw.height * (1 - cr[2] - cr[3])));
    var c = newCanvas(cw, ch), x = c.getContext('2d');
    x.drawImage(raw, sx, sy, cw, ch, 0, 0, cw, ch);
    if (w.key) keyOut(c, w.key);
    var a = w.adj;
    if (a && (a[0] !== 1 || a[1] !== 1 || a[2] !== 1 || a[3])) { // 亮度、对比度、饱和度、色相（画布的滤镜）
      var c2 = newCanvas(cw, ch), x2 = c2.getContext('2d');
      x2.filter = 'brightness(' + a[0] + ') contrast(' + a[1] + ') saturate(' + a[2] + ') hue-rotate(' + Math.round(a[3]) + 'deg)';
      x2.drawImage(c, 0, 0);
      c.width = c.height = 0;
      c = c2;
    }
    if (w.ef) { endFade(c, 'x', w.ef, w.ef, { l: 0, r: c.width, t: 0, b: c.height }); endFade(c, 'y', w.ef, w.ef, { l: 0, r: c.width, t: 0, b: c.height }); }
    if (w.out) c = outline(c, w.out / 100 * Math.max(c.width, c.height), colors(w)[5], true);
    return c;
  }

  // ================= 贴图缓存 =================
  var TEX = {}; // 键 → { tex, mask, gx, gy, aspect, canvas, n（几张贴纸在用）, p（正在做） }
  // 只管摆放、材质的字段（不影响贴图）
  var PLACE = { id: 1, at: 1, dir: 1, up: 1, rot: 1, w: 1, sx: 1, flip: 1, fv: 1, both: 1, on: 1, alpha: 1, hide: 1, fin: 1, rough: 1, metal: 1, wm: 1, side: 1 };
  /** 贴图的键：内容一样的贴纸共用一张贴图 */
  function texKey(w, ctx) {
    var o = {}, d = ctx.dims;
    Object.keys(w).sort().forEach(function (k) { if (!PLACE[k]) o[k] = w[k]; });
    if (w.kind === 'stripe') { o.p = params(w); o.dims = [d.hw, d.h, d.hl].map(function (v) { return Math.round(v * 100); }); }
    if (typeof w.img === 'number' || typeof w.raster === 'number') o.buf = ctx.bufId;
    return JSON.stringify(o);
  }
  /** 哪些格子里有内容（透明度 > 0，外扩 3 像素：取样时边上的像素也会被带到） */
  function maskOf(c) {
    var W = c.width, H = c.height, gx = Math.max(1, Math.min(64, Math.ceil(W / 24))), gy = Math.max(1, Math.min(64, Math.ceil(H / 24))), bits = new Uint8Array(gx * gy);
    var d = c.getContext('2d').getImageData(0, 0, W, H).data;
    for (var y = 0; y < H; y++) {
      var r0 = Math.min(gy - 1, Math.floor((1 - (y + 4) / H) * gy)), r1 = Math.min(gy - 1, Math.floor((1 - (y - 3) / H) * gy)); // 第几行（从下往上数）
      r0 = Math.max(0, r0);
      for (var x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] < 3) continue;
        var c0 = Math.max(0, Math.floor((x - 3) / W * gx)), c1 = Math.min(gx - 1, Math.floor((x + 3) / W * gx));
        for (var ry = r0; ry <= Math.max(r0, r1); ry++) for (var cx = c0; cx <= c1; cx++) bits[ry * gx + cx] = 1;
      }
    }
    return { bits: bits, gx: gx, gy: gy };
  }
  function texFrom(c, renderer) {
    var t = new T.CanvasTexture(c);
    t.premultiplyAlpha = true; // 预乘透明度取样：缩小、斜着看时透明的边不会混进黑色
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  /** 拿贴图（缓存里有直接给，没有就做：画拉花、写字、加工图片）；做不出来 resolve null */
  function texGet(w, ctx) {
    var key = texKey(w, ctx), e = TEX[key];
    if (e && e.tex) return Promise.resolve(e);
    if (e && e.p) return e.p;
    e = TEX[key] = { key: key, n: 0 };
    var made;
    if (w.kind === 'stripe') made = Promise.resolve().then(function () { return stripeCanvas(w, ctx.dims); });
    else if (w.kind === 'img') made = rawImage(w.img, ctx).then(function (raw) { return raw ? processImage(raw, w) : null; });
    else made = loadFont(w.font).then(function (fam) {
      if (!fam && /^u:/.test(w.font || '') && typeof w.raster === 'number') return rawImage(w.raster, ctx).then(function (raw) { return raw ? processImage(raw, {}) : textCanvas(w, null); }); // 没有这个字体：用导出时画好的图
      return textCanvas(w, fam);
    });
    e.p = made.then(function (c) {
      e.p = null;
      if (!c || !c.width) { delete TEX[key]; return null; }
      var m = maskOf(c);
      e.tex = texFrom(c, ctx.renderer); e.mask = m.bits; e.gx = m.gx; e.gy = m.gy; e.aspect = c.height / c.width; e.canvas = c;
      return e;
    }, function (er) { delete TEX[key]; console.error('贴纸的贴图没做出来', er); return null; });
    return e.p;
  }
  function texUse(e) { if (e) e.n++; }
  function texDrop(e) {
    if (!e || --e.n > 0) return;
    setTimeout(function () { // 下一张同样的贴纸可能马上要用（重建车：新车先建好、旧车再拆）
      if (e.n > 0 || TEX[e.key] !== e) return;
      if (e.tex) e.tex.dispose();
      if (e.canvas) e.canvas.width = e.canvas.height = 0;
      delete TEX[e.key];
    }, 0);
  }

  // ================= 投影：收集 =================
  var RES = 1024, CELLS = 64, last = null; // last：最近一次收集各步的耗时（毫秒，排查用）
  /** 投影方向 n 的平面坐标轴：b2 尽量朝上（车顶往下投时朝车头），b1 = b2 × n */
  function basis(n) {
    var ref = Math.abs(n.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(0, 0, 1), b2 = ref.clone().addScaledVector(n, -ref.dot(n)).normalize();
    return { n: n.clone(), b1: new T.Vector3().crossVectors(b2, n), b2: b2 };
  }
  // 深度图（three 的 RGBA 打包）→ 0～1
  var UNPACK = [255 / 256 / 16777216 / 255, 255 / 256 / 65536 / 255, 255 / 256 / 256 / 255, 255 / 256 / 255];
  /** 沿投影方向的正交深度图：每个像素离投影平面最近的车身表面（米，没有是 Infinity） */
  function depthMap(ctx, B, O, R, e1, e2, W, H) {
    var r = ctx.renderer, root = ctx.root, rt = new T.WebGLRenderTarget(W, H), dm = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, side: T.DoubleSide });
    var cam = new T.OrthographicCamera(-e1, e1, e2, -e2, 0.01, 2 * R), px = new Uint8Array(W * H * 4), keep = [], vis = root.visible, occ = ctx.occluders(), occSet = {};
    occ.forEach(function (o) { occSet[o.uuid] = 1; });
    cam.position.copy(O).addScaledVector(B.n, R).applyMatrix4(root.matrixWorld);
    cam.up.copy(B.b2).transformDirection(root.matrixWorld);
    cam.lookAt(O.clone().applyMatrix4(root.matrixWorld));
    cam.updateMatrixWorld(true);
    var old = r.getRenderTarget(), cc = r.getClearColor(new T.Color()), ca = r.getClearAlpha(), as = r.autoClear;
    root.visible = true; // 新车建好、贴纸还没贴好时先藏着
    root.traverse(function (o) {
      if (!o.isMesh && !o.isSprite && !o.isPoints && !o.isLine) return;
      keep.push([o, o.material, o.visible]);
      if (o.isMesh && occSet[o.uuid]) o.material = dm; else o.visible = false;
    });
    try {
      r.setRenderTarget(rt);
      r.setClearColor(0xffffff, 1);
      r.autoClear = true;
      r.clear();
      r.render(root, cam);
      r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    } finally {
      keep.forEach(function (k) { k[0].material = k[1]; k[0].visible = k[2]; });
      root.visible = vis;
      r.setRenderTarget(old); r.setClearColor(cc, ca); r.autoClear = as;
      rt.dispose(); dm.dispose();
    }
    var out = new Float32Array(W * H), span = 2 * R - 0.01;
    for (var i = 0; i < W * H; i++) {
      var o4 = i * 4, d = px[o4] * UNPACK[0] + px[o4 + 1] * UNPACK[1] + px[o4 + 2] * UNPACK[2] + px[o4 + 3] * UNPACK[3];
      out[i] = d >= 0.9999 ? Infinity : 0.01 + d * span;
    }
    return out;
  }
  // 顶点属性直接读数组（不走 getX：大车模要几百万次函数调用）：{ a 数组, s 步长, o 偏移, k 归一化的系数 }
  var NK = { Int8Array: 1 / 127, Uint8Array: 1 / 255, Int16Array: 1 / 32767, Uint16Array: 1 / 65535 };
  function raw(at) {
    var il = !!at.isInterleavedBufferAttribute, a = il ? at.data.array : at.array;
    return { a: a, s: il ? at.data.stride : at.itemSize, o: il ? at.offset : 0, k: at.normalized ? NK[a.constructor.name] || 1 : 1 };
  }
  /** 收集：投影方向 n 上看得见的、朝着投影方向的三角形（贴在 on 那种零件上），投到平面上按格子分桶 */
  function gather(S, n, on) {
    var key = on + ':' + [n.x, n.y, n.z].map(function (v) { return v.toFixed(3); }).join(',');
    if (S.gc[key]) return S.gc[key];
    var g = null;
    S.ctx.atRest(function () { g = collect(S.ctx, n, on); });
    return (S.gc[key] = g);
  }
  function collect(ctx, n, on) {
    var dm = ctx.dims, B = basis(n), O = new T.Vector3(0, dm.h / 2, 0), R = Math.sqrt(dm.hw * dm.hw + dm.h * dm.h / 4 + dm.hl * dm.hl) + 0.3;
    var ext = function (b) { return Math.abs(b.x) * dm.hw + Math.abs(b.y) * dm.h / 2 + Math.abs(b.z) * dm.hl + 0.08; }, e1 = ext(B.b1), e2 = ext(B.b2);
    var W = e1 >= e2 ? RES : Math.max(16, Math.round(RES * e1 / e2)), H = e1 >= e2 ? Math.max(16, Math.round(RES * e2 / e1)) : RES, pxm = Math.max(2 * e1 / W, 2 * e2 / H);
    var t0 = Date.now(), depth = depthMap(ctx, B, O, R, e1, e2, W, H), t1 = Date.now(), tol0 = 0.006 * 2 * dm.hl;
    var rootInv = new T.Matrix4().copy(ctx.root.matrixWorld).invert(), list = ctx.targets(on), meshes = [], tris = [];
    var b1 = B.b1, b2 = B.b2, nn = B.n;
    function occluded(x, y, me, tol) {
      var cx = Math.floor((x + e1) / (2 * e1) * W), cy = Math.floor((y + e2) / (2 * e2) * H);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
      return me - depth[cy * W + cx] > tol;
    }
    list.forEach(function (t) {
      var m = t.m, g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal, ix = g.index;
      if (!pos || !nor) return;
      var M = new T.Matrix4().multiplyMatrices(rootInv, m.matrixWorld), e = M.elements, ne = new T.Matrix3().getNormalMatrix(M).elements;
      var nv = pos.count, PX = new Float32Array(nv), PY = new Float32Array(nv), PD = new Float32Array(nv), FA = new Float32Array(nv), i;
      var Pr = raw(pos), Nr = raw(nor), pa = Pr.a, ps = Pr.s, po = Pr.o, pk = Pr.k, na = Nr.a, ns = Nr.s, no = Nr.o, nk = Nr.k;
      for (i = 0; i < nv; i++) {
        var q0 = i * ps + po, x = pa[q0] * pk, y = pa[q0 + 1] * pk, z = pa[q0 + 2] * pk;
        var wx = e[0] * x + e[4] * y + e[8] * z + e[12] - O.x, wy = e[1] * x + e[5] * y + e[9] * z + e[13] - O.y, wz = e[2] * x + e[6] * y + e[10] * z + e[14] - O.z;
        PX[i] = wx * b1.x + wy * b1.y + wz * b1.z; PY[i] = wx * b2.x + wy * b2.y + wz * b2.z; PD[i] = wx * nn.x + wy * nn.y + wz * nn.z;
        var r0 = i * ns + no, a = na[r0] * nk, b = na[r0 + 1] * nk, c = na[r0 + 2] * nk, qx = ne[0] * a + ne[3] * b + ne[6] * c, qy = ne[1] * a + ne[4] * b + ne[7] * c, qz = ne[2] * a + ne[5] * b + ne[8] * c, ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
        FA[i] = (qx * nn.x + qy * nn.y + qz * nn.z) / ql;
      }
      var owner = ctx.owner(m), Mo = new T.Matrix4().copy(owner.matrixWorld).invert().multiply(m.matrixWorld);
      var slot = meshes.push({ m: m, owner: owner, Mo: Mo, No: new T.Matrix3().getNormalMatrix(Mo), os: owner.matrixWorld.getMaxScaleOnAxis(), PX: PX, PY: PY, PD: PD, F: FA, P: Pr, N: Nr, vmap: new Int32Array(nv), vst: new Uint32Array(nv) }) - 1;
      var total = ix ? ix.count : pos.count, ranges = t.ranges || [[0, total]], ia = ix ? ix.array : null;
      ranges.forEach(function (rg) {
        for (var k = rg[0]; k + 2 < Math.min(total, rg[0] + rg[1]); k += 3) {
          var A = ia ? ia[k] : k, Bv = ia ? ia[k + 1] : k + 1, C = ia ? ia[k + 2] : k + 2;
          var fa = (FA[A] + FA[Bv] + FA[C]) / 3;
          if (fa < 0.12 || Math.max(FA[A], FA[Bv], FA[C]) < 0.2) continue; // 背对投影方向（拉成长条的）不贴
          var cx = (PX[A] + PX[Bv] + PX[C]) / 3, cy = (PY[A] + PY[Bv] + PY[C]) / 3, me = R - (PD[A] + PD[Bv] + PD[C]) / 3;
          var tol = tol0 + 0.6 * pxm * Math.sqrt(Math.max(0, 1 - fa * fa)) / Math.max(0.12, fa);
          if (occluded(cx, cy, me, tol)) { // 中心被挡住：三个角往中心收一点再看（挨着轮廓的）
            var seen = false;
            [A, Bv, C].forEach(function (v) { if (!seen && !occluded(PX[v] * 0.8 + cx * 0.2, PY[v] * 0.8 + cy * 0.2, R - PD[v], tol)) seen = true; });
            if (!seen) continue;
          }
          tris.push(slot, A, Bv, C);
        }
      });
    });
    var t2 = Date.now();
    // 按格子分桶（三角形的外框跨几个格子就放进几个格子）
    var cs = 2 * Math.max(e1, e2) / CELLS, gw = Math.ceil(2 * e1 / cs), gh = Math.ceil(2 * e2 / cs), nt = tris.length / 4, cnt = new Int32Array(gw * gh + 1), j;
    var range = function (t, fn) {
      var ms = meshes[tris[t * 4]], a = tris[t * 4 + 1], b = tris[t * 4 + 2], c = tris[t * 4 + 3];
      var x0 = Math.max(0, Math.floor((Math.min(ms.PX[a], ms.PX[b], ms.PX[c]) + e1) / cs)), x1 = Math.min(gw - 1, Math.floor((Math.max(ms.PX[a], ms.PX[b], ms.PX[c]) + e1) / cs));
      var y0 = Math.max(0, Math.floor((Math.min(ms.PY[a], ms.PY[b], ms.PY[c]) + e2) / cs)), y1 = Math.min(gh - 1, Math.floor((Math.max(ms.PY[a], ms.PY[b], ms.PY[c]) + e2) / cs));
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) fn(y * gw + x);
    };
    for (j = 0; j < nt; j++) range(j, function (q) { cnt[q + 1]++; });
    for (j = 0; j < gw * gh; j++) cnt[j + 1] += cnt[j];
    var fill = cnt.slice(0, gw * gh), items = new Int32Array(cnt[gw * gh]);
    for (j = 0; j < nt; j++) range(j, function (q) { items[fill[q]++] = j; });
    last = { depth: t1 - t0, tris: t2 - t1, bucket: Date.now() - t2, n: nt };
    return { B: B, O: O, e1: e1, e2: e2, cs: cs, gw: gw, gh: gh, start: cnt, items: items, tris: new Int32Array(tris), meshes: meshes, stamp: new Uint32Array(nt), st: 0, R: R };
  }

  // ================= 投影：切 =================
  // 多边形裁剪（Sutherland–Hodgman）：顶点 [s, t, 重心坐标 a, b, c]，留下 k 方向（0 = s，1 = t）上 ≥ lo（sg = 1）或 ≤ lo（sg = -1）的部分
  function clip(poly, k, lo, sg) {
    var out = [], n = poly.length;
    for (var i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n], dp = (p[k] - lo) * sg, dq = (q[k] - lo) * sg;
      if (dp >= 0) out.push(p);
      if ((dp >= 0) !== (dq >= 0)) { var f = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f, p[3] + (q[3] - p[3]) * f, p[4] + (q[4] - p[4]) * f]); }
    }
    return out;
  }
  function clipBox(poly, s0, s1, t0, t1) {
    poly = clip(poly, 0, s0, 1); if (poly.length < 3) return poly;
    poly = clip(poly, 0, s1, -1); if (poly.length < 3) return poly;
    poly = clip(poly, 1, t0, 1); if (poly.length < 3) return poly;
    return clip(poly, 1, t1, -1);
  }
  function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  /** 切的公共部分：一个收集结果 G 里的若干三角形（each(fn) 逐个给出三角形编号），按顶点的贴图坐标（st(ms, 顶点) → [s, t]）
     和有内容的格子裁剪，按会动的部件分组写进 out（{ 部件的 uuid: { owner, p, n, uv, a, idx } }）。
     front(ms, A, B, C, S, T)：这个三角形在 s、t 里是不是正面朝外（决定绕向） */
  function cutInto(out, G, each, st, front, e, off) {
    var stp = ++G.st, gx = e.gx, gy = e.gy, bits = e.mask, v3 = new T.Vector3(), n3 = new T.Vector3();
    function grp(ms) {
      var k = ms.owner.uuid;
      if (!out[k]) out[k] = { owner: ms.owner, p: [], n: [], uv: [], a: [], idx: [], count: 0 };
      return out[k];
    }
    /** 一个顶点（重心坐标插值）写进这一组，返回编号；没被裁过的原顶点共用（vmap） */
    function vert(o, ms, A, Bv, C, q, orig) {
      if (orig >= 0 && ms.vst[orig] === stp && ms.vgrp === o) return ms.vmap[orig];
      var P = ms.P, N = ms.N, pa = P.a, na = N.a, a = q[2] * P.k, b = q[3] * P.k, c = q[4] * P.k, iA = A * P.s + P.o, iB = Bv * P.s + P.o, iC = C * P.s + P.o;
      v3.set(pa[iA] * a + pa[iB] * b + pa[iC] * c, pa[iA + 1] * a + pa[iB + 1] * b + pa[iC + 1] * c, pa[iA + 2] * a + pa[iB + 2] * b + pa[iC + 2] * c).applyMatrix4(ms.Mo);
      a = q[2]; b = q[3]; c = q[4]; iA = A * N.s + N.o; iB = Bv * N.s + N.o; iC = C * N.s + N.o;
      n3.set(na[iA] * a + na[iB] * b + na[iC] * c, na[iA + 1] * a + na[iB + 1] * b + na[iC + 1] * c, na[iA + 2] * a + na[iB + 2] * b + na[iC + 2] * c).applyMatrix3(ms.No).normalize();
      v3.addScaledVector(n3, off / ms.os);
      o.p.push(v3.x, v3.y, v3.z); o.n.push(n3.x, n3.y, n3.z); o.uv.push(q[0], q[1]);
      o.a.push(smooth(0.12, 0.4, ms.F[A] * q[2] + ms.F[Bv] * q[3] + ms.F[C] * q[4]));
      var id = o.count++;
      if (orig >= 0) { ms.vst[orig] = stp; ms.vmap[orig] = id; ms.vgrp = o; }
      return id;
    }
    function emit(o, ms, A, Bv, C, poly, rev, plain) {
      var ids = poly.map(function (q, i) { return vert(o, ms, A, Bv, C, q, plain ? [A, Bv, C][i] : -1); });
      for (var i = 1; i + 1 < ids.length; i++) { if (rev) o.idx.push(ids[0], ids[i + 1], ids[i]); else o.idx.push(ids[0], ids[i], ids[i + 1]); }
    }
    each(function (t) {
      if (G.stamp[t] === stp) return;
      G.stamp[t] = stp;
      var ms = G.meshes[G.tris[t * 4]], A = G.tris[t * 4 + 1], Bv = G.tris[t * 4 + 2], C = G.tris[t * 4 + 3];
      var sa = st(ms, A), sb = st(ms, Bv), sc = st(ms, C);
      if (!sa || !sb || !sc) return;
      var S = [sa[0], sb[0], sc[0]], Tt = [sa[1], sb[1], sc[1]];
      if ((S[0] < 0 && S[1] < 0 && S[2] < 0) || (S[0] > 1 && S[1] > 1 && S[2] > 1) || (Tt[0] < 0 && Tt[1] < 0 && Tt[2] < 0) || (Tt[0] > 1 && Tt[1] > 1 && Tt[2] > 1)) return;
      var area = (S[1] - S[0]) * (Tt[2] - Tt[0]) - (S[2] - S[0]) * (Tt[1] - Tt[0]), rev = !front(area);
      var poly = [[S[0], Tt[0], 1, 0, 0], [S[1], Tt[1], 0, 1, 0], [S[2], Tt[2], 0, 0, 1]];
      var sMin = Math.max(0, Math.min(S[0], S[1], S[2])), sMax = Math.min(1, Math.max(S[0], S[1], S[2])), tMin = Math.max(0, Math.min(Tt[0], Tt[1], Tt[2])), tMax = Math.min(1, Math.max(Tt[0], Tt[1], Tt[2]));
      var gx0 = Math.min(gx - 1, Math.floor(sMin * gx)), gx1 = Math.min(gx - 1, Math.floor(sMax * gx)), gy0 = Math.min(gy - 1, Math.floor(tMin * gy)), gy1 = Math.min(gy - 1, Math.floor(tMax * gy));
      var all = true, any = false, a1, b1;
      for (b1 = gy0; b1 <= gy1; b1++) for (a1 = gx0; a1 <= gx1; a1++) { if (bits[b1 * gx + a1]) any = true; else all = false; }
      if (!any) return;
      var o = grp(ms), inside = sMin === Math.min(S[0], S[1], S[2]) && sMax === Math.max(S[0], S[1], S[2]) && tMin === Math.min(Tt[0], Tt[1], Tt[2]) && tMax === Math.max(Tt[0], Tt[1], Tt[2]);
      if (all) {
        if (inside) emit(o, ms, A, Bv, C, poly, rev, true); // 整个在框里、格子都有内容：不用裁，顶点和邻居共用
        else { var pc = clipBox(poly, 0, 1, 0, 1); if (pc.length >= 3) emit(o, ms, A, Bv, C, pc, rev, false); }
        return;
      }
      for (b1 = gy0; b1 <= gy1; b1++) for (a1 = gx0; a1 <= gx1; a1++) { // 只留有内容的格子
        if (!bits[b1 * gx + a1]) continue;
        var p2 = clipBox(poly, a1 / gx, (a1 + 1) / gx, b1 / gy, (b1 + 1) / gy);
        if (p2.length >= 3) emit(o, ms, A, Bv, C, p2, rev, false);
      }
    });
    return out;
  }
  /** 平贴：一个框（平面坐标里的中心 c1 c2、横轴 ux uy、竖轴 vx vy、半宽 hw、半高 hh）只查框盖住的格子 */
  function cutPlanar(out, G, fr, e, off) {
    var hand = fr.ux * fr.vy - fr.uy * fr.vx; // 框的横竖轴和平面坐标轴同向（正）还是镜像（负）
    var ax = Math.abs(fr.ux * fr.hw) + Math.abs(fr.vx * fr.hh), ay = Math.abs(fr.uy * fr.hw) + Math.abs(fr.vy * fr.hh);
    var x0 = Math.max(0, Math.floor((fr.c1 - ax + G.e1) / G.cs)), x1 = Math.min(G.gw - 1, Math.floor((fr.c1 + ax + G.e1) / G.cs));
    var y0 = Math.max(0, Math.floor((fr.c2 - ay + G.e2) / G.cs)), y1 = Math.min(G.gh - 1, Math.floor((fr.c2 + ay + G.e2) / G.cs));
    return cutInto(out, G, function (fn) {
      for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) { var cell = cy * G.gw + cx; for (var k = G.start[cell]; k < G.start[cell + 1]; k++) fn(G.items[k]); }
    }, function (ms, i) {
      var dx = ms.PX[i] - fr.c1, dy = ms.PY[i] - fr.c2;
      return [((dx * fr.ux + dy * fr.uy) / fr.hw + 1) / 2, ((dx * fr.vx + dy * fr.vy) / fr.hh + 1) / 2];
    }, function (area) { return area * hand >= 0; }, e, off); // 正面朝着投影方向：平面坐标里逆时针（框镜像时 s、t 里看是顺时针）
  }

  // ================= 包住：横截面当成圆角矩形展开 =================
  var RINGS = {};
  /** 超椭圆 |x/a|^4 + |y/b|^4 = 1 按角度（-π～π）累加的周长表 */
  function ring(a, b) {
    var key = a.toFixed(3) + ',' + b.toFixed(3);
    if (RINGS[key]) return RINGS[key];
    var N = 1440, L = new Float32Array(N + 1), px = 0, py = 0;
    for (var i = 0; i <= N; i++) {
      var f = -Math.PI + 2 * Math.PI * i / N, c = Math.cos(f), s = Math.sin(f), r = 1 / Math.pow(Math.pow(Math.abs(c / a), 4) + Math.pow(Math.abs(s / b), 4), 0.25), x = r * c, y = r * s;
      if (i) L[i] = L[i - 1] + Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
      px = x; py = y;
    }
    return (RINGS[key] = { N: N, L: L, per: L[N], a: a, b: b });
  }
  function arcAt(R, f) { var u = (f + Math.PI) / (2 * Math.PI) * R.N, i = Math.max(0, Math.min(R.N - 1, Math.floor(u))); return R.L[i] + (R.L[i + 1] - R.L[i]) * (u - i); }
  function boundary(R, f) { var c = Math.cos(f), s = Math.sin(f), r = 1 / Math.pow(Math.pow(Math.abs(c / R.a), 4) + Math.pow(Math.abs(s / R.b), 4), 0.25); return [r * c, r * s]; }
  /** 包住的轴：v 上下包（绕车长方向，截面是 x、y）；h 前后包（绕竖直方向，截面是 z、x） */
  function wrapAxes(m, d) {
    if (m === 'v') return { e1: new T.Vector3(1, 0, 0), e2: new T.Vector3(0, 1, 0), ax: new T.Vector3(0, 0, 1), R: ring(d.hw, d.h / 2) };
    return { e1: new T.Vector3(0, 0, 1), e2: new T.Vector3(1, 0, 0), ax: new T.Vector3(0, 1, 0), R: ring(d.hl, d.hw) };
  }
  /** 包住的一个框：截面上贴纸覆盖的角度范围按 8 个方向（每 45° 一个）收集，每个三角形归到法线所在的那一格；顶点按展开后的坐标算 s、t */
  function cutWrap(out, S, f, e, off, on) {
    var d = S.ctx.dims, Ax = wrapAxes(f.wm, d), Rg = Ax.R, O = new T.Vector3(0, d.h / 2, 0), rel = f.c.clone().sub(O);
    var fc = Math.atan2(rel.dot(Ax.e2), rel.dot(Ax.e1)), ac = arcAt(Rg, fc), along0 = rel.dot(Ax.ax);
    var b0 = boundary(Rg, fc - 0.002), b1 = boundary(Rg, fc + 0.002), tg = Ax.e1.clone().multiplyScalar(b1[0] - b0[0]).addScaledVector(Ax.e2, b1[1] - b0[1]).normalize(); // 截面在中心处的切线（周长增加的方向）
    var uA = f.u.dot(Ax.ax), uT = f.u.dot(tg), vA = f.v.dot(Ax.ax), vT = f.v.dot(tg), hand = uA * vT - uT * vA;
    var ext = Math.abs(uT) * f.hw + Math.abs(vT) * f.hh, per = Rg.per, wrapD = function (x) { x = (x % per + per) % per; return x > per / 2 ? x - per : x; };
    var P = new T.Vector3();
    for (var k = 0; k < 8; k++) {
      var th = -Math.PI + k * Math.PI / 4;
      if (Math.abs(wrapD(arcAt(Rg, th) - ac)) > ext + per / 8) continue; // 这一格（中心）离贴纸的范围超过一格：用不到
      var dk = Ax.e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(Ax.e2, Math.sin(th)), G = gather(S, dk, on), B = G.B, OG = G.O;
      (function (G, k) {
        var wp = function (ms, i) { return P.copy(OG).addScaledVector(B.b1, ms.PX[i]).addScaledVector(B.b2, ms.PY[i]).addScaledVector(B.n, ms.PD[i]); };
        var A3 = new T.Vector3(), B3 = new T.Vector3(), C3 = new T.Vector3();
        cutInto(out, G, function (fn) {
          for (var t = 0; t < G.tris.length / 4; t++) {
            var ms = G.meshes[G.tris[t * 4]];
            A3.copy(wp(ms, G.tris[t * 4 + 1])); B3.copy(wp(ms, G.tris[t * 4 + 2])); C3.copy(wp(ms, G.tris[t * 4 + 3]));
            var nx = (B3.y - A3.y) * (C3.z - A3.z) - (B3.z - A3.z) * (C3.y - A3.y), ny = (B3.z - A3.z) * (C3.x - A3.x) - (B3.x - A3.x) * (C3.z - A3.z), nz = (B3.x - A3.x) * (C3.y - A3.y) - (B3.y - A3.y) * (C3.x - A3.x);
            var c1 = nx * Ax.e1.x + ny * Ax.e1.y + nz * Ax.e1.z, c2 = nx * Ax.e2.x + ny * Ax.e2.y + nz * Ax.e2.z;
            if (c1 * dk.dot(Ax.e1) + c2 * dk.dot(Ax.e2) < 0) { c1 = -c1; c2 = -c2; } // 绕向反了的面
            var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            if (Math.sqrt(c1 * c1 + c2 * c2) < 0.3 * nl) continue; // 法线差不多顺着轴（车头车尾的面在上下包里不算）
            var sec = Math.round((Math.atan2(c2, c1) + Math.PI) / (Math.PI / 4)) % 8;
            if (sec === k) fn(t);
          }
        }, function (ms, i) {
          var q = wp(ms, i).sub(O), al = q.dot(Ax.ax) - along0, ar = wrapD(arcAt(Rg, Math.atan2(q.dot(Ax.e2), q.dot(Ax.e1))) - ac);
          return [((al * uA + ar * uT) / f.hw + 1) / 2, ((al * vA + ar * vT) / f.hh + 1) / 2];
        }, function (area) { return area * hand <= 0; }, e, off); // 展开的坐标（沿轴、沿周长）里，朝外的面是顺时针（轴 × 切线指向里面）
      })(G, k);
    }
    return out;
  }
  function geomOf(o) {
    var g = new T.BufferGeometry(), nv = o.count, nn = new Int8Array(nv * 3), uv = new Uint16Array(nv * 2), col = new Uint8Array(nv * 4), i;
    for (i = 0; i < nv * 3; i++) nn[i] = Math.round(Math.max(-1, Math.min(1, o.n[i])) * 127);
    for (i = 0; i < nv * 2; i++) uv[i] = Math.round(Math.max(0, Math.min(1, o.uv[i])) * 65535);
    for (i = 0; i < nv; i++) { col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 255; col[i * 4 + 3] = Math.round(o.a[i] * 255); }
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(o.p), 3));
    g.setAttribute('normal', new T.BufferAttribute(nn, 3, true));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2, true));
    g.setAttribute('color', new T.BufferAttribute(col, 4, true));
    g.setIndex(new T.BufferAttribute(nv < 65536 ? new Uint16Array(o.idx) : new Uint32Array(o.idx), 1));
    g.computeBoundingSphere();
    return g;
  }

  // ================= 一张贴纸的投影框 =================
  var X = new T.Vector3(1, 0, 0), Y = new T.Vector3(0, 1, 0), Z = new T.Vector3(0, 0, 1);
  /** 自由摆放的贴纸：图片朝上的方向（没给就按朝向猜：侧面、车头车尾朝上；车顶上朝车尾——站在车前看是正的） */
  function upOf(n, up) {
    var v = up ? new T.Vector3(up[0], up[1], up[2]) : n.y > 0.85 ? Z.clone().negate() : n.y < -0.85 ? Z.clone() : Y.clone();
    v.addScaledVector(n, -v.dot(n));
    if (v.lengthSq() < 1e-6) v.copy(Math.abs(n.y) < 0.9 ? Y : Z).addScaledVector(n, -(Math.abs(n.y) < 0.9 ? n.y : n.z));
    return v.normalize();
  }
  /** 这张贴纸投到车上的几个框（世界方向）：{ n, u, v, c（中心）, hw, hh, wm（包住）} */
  function frames(w, dims, aspect) {
    var out = [], d = dims;
    if (w.kind === 'stripe') {
      if (topOf(w)) return [{ n: Y.clone(), u: X.clone().negate(), v: Z.clone(), c: new T.Vector3(0, d.h, 0), hw: d.hw, hh: d.hl }];
      var sd = w.side || 'both';
      if (sd !== 'R') out.push({ n: X.clone(), u: Z.clone().negate(), v: Y.clone(), c: new T.Vector3(d.hw, d.h / 2, 0), hw: d.hl, hh: d.h / 2 });
      if (sd !== 'L') out.push({ n: X.clone().negate(), u: Z.clone().negate(), v: Y.clone(), c: new T.Vector3(-d.hw, d.h / 2, 0), hw: d.hl, hh: d.h / 2 }); // 右侧：左侧照镜子（车头那头一样）
      return out;
    }
    var n = new T.Vector3(w.dir[0], w.dir[1], w.dir[2]).normalize(), v = upOf(n, w.up), r = (w.rot || 0) * DEG;
    v = v.clone().multiplyScalar(Math.cos(r)).add(new T.Vector3().crossVectors(n, v).multiplyScalar(Math.sin(r))); // 绕 n 转（从外面看逆时针为正）
    var u = new T.Vector3().crossVectors(v, n);
    if (w.flip) u.negate();
    if (w.fv) v.negate();
    // 大小按长边（横排换竖排大小不变），横向拉伸再乘
    var L2 = w.w / 2, hw = (aspect > 1 ? L2 / aspect : L2) * (w.sx || 1), hh = aspect > 1 ? L2 : L2 * aspect, c = new T.Vector3(w.at[0], w.at[1], w.at[2]);
    out.push({ n: n, u: u, v: v, c: c, hw: hw, hh: hh, wm: w.wm || '' });
    if (w.both) { // 另一侧也贴一张：位置、方向左右对称；图片照镜子（mirror），文字不照（same：从那一侧看是正的）
      var R = function (a) { return new T.Vector3(-a.x, a.y, a.z); }, n2 = R(n), v2 = R(v), u2 = w.both === 'mirror' ? R(u) : new T.Vector3().crossVectors(v2, n2).multiplyScalar(w.flip ? -1 : 1);
      out.push({ n: n2, u: u2, v: v2, c: R(c), hw: hw, hh: hh, wm: w.wm || '' });
    }
    return out;
  }
  /** 世界方向的框 → 收集结果的平面坐标 */
  function planar(G, f) {
    var B = G.B, rel = f.c.clone().sub(G.O);
    return { c1: rel.dot(B.b1), c2: rel.dot(B.b2), ux: f.u.dot(B.b1), uy: f.u.dot(B.b2), vx: f.v.dot(B.b1), vy: f.v.dot(B.b2), hw: f.hw, hh: f.hh };
  }

  // ================= 质感、材质 =================
  // 预设：[光泽度对应的粗糙度, 金属度]；镭射用物理材质的薄膜干涉（随角度变色）
  var FIN = { gloss: [0.3, 0], satin: [0.5, 0], matte: [0.85, 0], metal: [0.28, 0.85], holo: [0.22, 0.35] };
  /** 贴纸的材质：贴图按预乘透明度取样后除回去、转线性（贴图本身不做 sRGB 解码：预乘过的数解码不对），顶点透明度淡出边缘 */
  function wrapMat(e, w, ctx) {
    var fin = FIN[w.fin] || FIN.gloss, holo = w.fin === 'holo';
    var props = ctx.mat({ map: e.tex, transparent: true, depthWrite: false, vertexColors: true, roughness: w.rough !== undefined ? w.rough : fin[0], metalness: w.metal !== undefined ? w.metal : fin[1],
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: w.alpha || 1 });
    if (holo) { props.iridescence = 1; props.iridescenceIOR = 1.8; props.iridescenceThicknessRange = [250, 900]; }
    var m = holo ? new T.MeshPhysicalMaterial(props) : new T.MeshStandardMaterial(props);
    m.onBeforeCompile = function (s) {
      s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>',
        '#ifdef USE_MAP\n\tvec4 texelColor = texture2D( map, vUv );\n\tvec3 wc = texelColor.rgb / max( texelColor.a, 1e-3 );\n' +
        '\twc = mix( wc * 0.0773993808, pow( wc * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), step( vec3( 0.04045 ), wc ) );\n' +
        '\tdiffuseColor *= vec4( wc, texelColor.a );\n#endif');
    };
    m.customProgramCacheKey = function () { return 'd3wrap'; };
    return m;
  }

  // ================= 一台车的贴纸 =================
  function Session(ctx) { this.ctx = ctx; this.gc = {}; this.objs = {}; this.seq = 0; }
  /** 把这一组贴纸贴上（list 的顺序 = 叠放顺序，后面的在上面）；没变的不动，删掉的拿掉。图片、字体要加载的贴好了才 resolve */
  Session.prototype.apply = function (list) {
    var self = this, keep = {};
    list = list || [];
    var jobs = list.map(function (w, i) { keep[w.id] = 1; return self.one(w, i); });
    Object.keys(this.objs).forEach(function (id) { if (!keep[id]) self.drop(id); });
    return Promise.all(jobs).then(function () { if (self.ctx) self.ctx.invalidate(); });
  };
  /** 一张：几何、贴图没变只改材质（透明度、质感）和叠放顺序；贴图缓存里有就同步贴好（拖动时） */
  Session.prototype.one = function (w, i) {
    var self = this, o = this.objs[w.id], MAT = { alpha: 1, fin: 1, rough: 1, metal: 1 }, geo = JSON.stringify(w, function (k, v) { return MAT[k] ? undefined : v; }), mk = [w.alpha, w.fin, w.rough, w.metal].join();
    if (o && o.geo === geo) {
      if (o.mat && o.mk !== mk) {
        if (o.mk.split(',').slice(1).join() === mk.split(',').slice(1).join()) o.mat.opacity = w.alpha || 1; // 只改了透明度
        else { // 质感变了：换材质（镭射要物理材质）
          var nm = wrapMat(o.ent, w, this.ctx);
          o.meshes.forEach(function (m) { m.material = nm; });
          o.mat.dispose(); o.mat = nm;
        }
        o.mk = mk;
        this.ctx.invalidate();
      }
      o.meshes.forEach(function (m) { m.renderOrder = 3 + i; });
      return Promise.resolve();
    }
    var seq = ++this.seq;
    if (o) o.want = seq;
    else this.objs[w.id] = { want: seq, meshes: [], geo: '' };
    if (w.hide) { this.clear(w.id); this.objs[w.id].geo = geo; return Promise.resolve(); }
    var key = texKey(w, this.ctx), e = TEX[key];
    var go = function (ent) {
      var cur = self.objs[w.id];
      if (!self.ctx || !cur || cur.want !== seq) { if (ent) { texUse(ent); texDrop(ent); } return; } // 后面又改了 / 拆了：做出来的贴图没人用就还回去（不然一直留在缓存里）
      self.clear(w.id);
      cur.geo = geo;
      if (!ent) return;
      texUse(ent);
      cur.ent = ent; cur.kind = w.kind; cur.mk = mk;
      try { self.build(cur, w, i, ent); } catch (er) { console.error('贴纸没贴上', er); }
      self.ctx.invalidate();
    };
    if (e && e.tex) { go(e); return Promise.resolve(); }
    return texGet(w, this.ctx).then(go);
  };
  Session.prototype.build = function (cur, w, i, ent) {
    var ctx = this.ctx, self = this, on = w.on || 'body', off = Math.min(0.002, Math.max(0.0008, 2 * ctx.dims.hl * 0.0003));
    cur.mat = wrapMat(ent, w, ctx);
    cur.frames = frames(w, ctx.dims, ent.aspect);
    var parts = {};
    cur.frames.forEach(function (f) {
      if (f.wm) cutWrap(parts, self, f, ent, off, on);
      else { var G = gather(self, f.n, on); cutPlanar(parts, G, planar(G, f), ent, off); }
    });
    Object.keys(parts).forEach(function (k) {
      var p = parts[k];
      if (!p.idx.length) return;
      var mesh = new T.Mesh(geomOf(p), cur.mat);
      mesh.raycast = function () {}; mesh.renderOrder = 3 + i; mesh.userData.d3wrap = w.id;
      mesh.receiveShadow = !!ctx.shadow;
      p.owner.add(mesh);
      cur.meshes.push(mesh);
    });
  };
  /** 拿掉一张贴纸的网格（材质、几何释放，贴图还给缓存） */
  Session.prototype.clear = function (id) {
    var o = this.objs[id];
    if (!o) return;
    o.meshes.forEach(function (m) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); });
    if (o.mat) o.mat.dispose();
    texDrop(o.ent);
    o.meshes = []; o.mat = null; o.ent = null; o.frames = null;
  };
  Session.prototype.drop = function (id) { this.clear(id); delete this.objs[id]; };
  /** 收集的缓存不要了（贴好以后、离开贴纸页：大车模几十 MB） */
  Session.prototype.forget = function () { this.gc = {}; };
  Session.prototype.dispose = function () { var self = this; Object.keys(this.objs).forEach(function (id) { self.drop(id); }); this.gc = {}; this.ctx = null; };
  /** 一张贴纸的中心（自由摆放的图片、文字；车况页画小球用） */
  Session.prototype.center = function (id) { var o = this.objs[id]; return o && o.kind !== 'stripe' && o.frames && o.frames[0] ? o.frames[0].c.clone() : null; };
  Session.prototype.count = function () { var n = 0, self = this; Object.keys(this.objs).forEach(function (id) { n += self.objs[id].meshes.length; }); return n; };
  /** 贴图都在缓存里（建车时能同步贴好，不用等） */
  function ready(list, ctx) { return (list || []).every(function (w) { if (w.hide) return true; var e = TEX[texKey(w, ctx)]; return !!(e && e.tex); }); }
  /** 贴纸列表里的小图（贴图还没做好给 null） */
  function thumb(w, ctx, size) {
    var e = TEX[texKey(w, ctx)];
    if (!e || !e.canvas || !e.canvas.width) return null;
    var c = e.canvas, k = Math.min(1, size / Math.max(c.width, c.height)), t = newCanvas(c.width * k, c.height * k);
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL('image/png');
  }

  window.D3Wrap = {
    TPL: TPL, TPL_ORDER: TPL_ORDER, FIN: FIN, params: params, colors: colors, topOf: topOf,
    session: function (ctx) { return new Session(ctx); }, ready: ready, texGet: texGet, thumb: thumb, frames: frames,
    builtins: builtins, loadFont: loadFont, checkFont: checkFont, raster: raster, importImage: importImage,
    stats: function () { return { tex: Object.keys(TEX).length, gather: last }; }
  };
})();
