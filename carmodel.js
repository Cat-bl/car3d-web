/* demo3d 车模：用哪个车模、车模的适配配置（哪个材质是车漆、哪些网格是门、铰链在哪……）、导入别的车模、导出车模包。
   "车模包" = GLB + 配置（写在 GLB 的 asset.extras.d3car 里），一个文件就能分享；导入的车模存在 IndexedDB（d3 / files / model）。
   导入时统一转换成车机直接能读的 GLB：贴图最长边缩到 1024、Draco / meshopt 压缩当场解开（解码器按需加载，平时不加载），
   外置的 .bin 和贴图并进来；之后每次进页面直接解析，不用解码器。
   面数太多（超过 15 万，默认车模 W70 才 7.7 万）的问一句要不要简化：用 meshoptimizer 的简化器（按需加载）重排三角形索引，
   大零件按同一个比例减、小零件不动，参考法线、顶点色、贴图坐标（颜色交界不糊），守住开口边（接缝不裂），误差有上限（宁可减得少也不走样）；
   零件和零件挨着的顶点不动（接缝不裂），零件自己的开口边能沿边减；减完把用不到的顶点也去掉（顶点数据被别的图元共用的不动）。形变目标的不减。
   没人用的数据（换下来的索引、拆掉的顶点）不写进文件。
   导入时还顺手处理常见的"怪"模型：老的高光 / 光泽度材质换成金属度 / 粗糙度、带 KTX2 又带普通贴图的只用普通贴图、坏掉的贴图原样留着不影响别的；
   重复的三角形去掉（导出时为了双面复制的背面 → 材质改双面画；面数减半，简化器也才减得动）；没带法线的网格理顺翻过去的面片、用原始精度算好法线、材质改双面；
   颜色写在顶点上只有几种的按颜色拆成几个材质；整辆车都在一个网格里的按"连在一起的算一块"拆成零件（见 tidy、pieces）。
   调整车模时用户圈出来的部分用 carve 在 GLB 里拆成新零件（新零件排在最后，原有零件的编号不变）。
   车模没有配置时自动识别：按 z / x 朝上导出的先竖过来、倒扣的翻过来（车顶那层比底下那层短），去掉地板和展台（桌子、底座、转台），摆正（最长的水平方向当车长、按名字猜车头），
   按米 / 厘米 / 毫米 / 英寸认单位，按名字认车漆、玻璃、灯、轮毂、卡钳、门、盖、车轮（网格名字要大多数对得上才算，一个叫 headlight 的零件带不走整块车漆），
   认不出的车漆按从外面看得见的面积猜（离屏按材质涂色画 9 个方向数像素；顶点色、带贴图、整车只有一个材质、近乎纯黑的不猜，免得把整辆车涂成一个颜色），车轮按形状找，轮毂名字认不出就取主要用在车轮上的材质，合在一起的四个轮子、跨两边的门不当成能动的部件；
   门、引擎盖、尾门名字认不出按位置和形状找，跨着几扇门的车窗、窗框按门切开（geoParts）；各种灯按名字记在零件上。识别结果用网格 / 材质的编号记（同一个 GLB 解析出来顺序一样）；内置的 W70 配置用名字记。
   设置里的背景图片也存在这里（d3 / files / bg）；贴纸的图片按内容哈希存 wimg:哈希，导入的字体存 font:哈希（列表在 fonts）；
   导出车模包时贴纸图片并进 GLB（不被材质引用的图片，配置里记编号），本地库里不用了的贴纸图片在完成、取消、换车模时清掉。全部 ES5。 */
(function () {
  'use strict';
  var T = window.THREE;
  var MAX_TEX = 1024, MAX_BYTES = 60 * 1024 * 1024, WARN_TRIS = 300000, WARN_MESHES = 600, MAX_BG = 1920;
  var SIMPLIFY_OVER = 150000, SIMPLIFY_TO = 150000; // 超过这么多面问要不要简化，简化到大约这么多
  var R2D = 180 / Math.PI, DEG = Math.PI / 180;
  // 车模包的格式版本，导出时写在 asset.extras.d3fmt（以前导出的没写，当 1）。原生版（_apk/car3d 的 CarModel.FMT）导入比自己新的包时提示更新应用：
  // 车模包里加了原生版还显示不了的配置（新的灯效、贴纸选项……），或者建车的效果变了，这里加 1，原生版搬完再跟上
  var PACK_FMT = 1;

  // ================= 内置车模 W70 的配置：原来 car3d.js 里写死的数都在这（坐标按模型原来的位置，coords: 'model'） =================
  var W70 = {
    v: 1, name: '2016 Exotic Rides W70', credit: 'Ddiaz Design · CC-BY-NC-SA-4.0（不可商用）',
    scale: 100, rotY: 0, coords: 'model', box: [1.02, 1.26, 2.3],
    mats: { paint: ['CarPaint'], rim: ['Rims'], caliper: ['calipers_AO'], glass: ['glass_1'], head: ['glass_light'], tail: ['red_glass'], brake: ['red_glass'], led: ['emiss'] },
    lens: true, borrow: true, paintAo: 0.45, paintKeep: ['aoMap'], // 没有单独的转向灯：打转向时借那一角的大灯、尾灯闪橙色
    parts: {
      // 蝴蝶门：铰链在 A 柱上沿，绕着顺 A 柱的斜轴往上、往前掀
      doorFL: { meshes: ['detach_door_L_'], at: [0.6, 0.98, 0.72], axis: [-0.32, 0.5, -0.8], angle: 1.15 * R2D },
      doorFR: { meshes: ['detach_door_R_'], at: [-0.6, 0.98, 0.72], axis: [0.32, 0.5, -0.8], angle: 1.15 * R2D },
      hood: { meshes: ['detach_hood_'], at: [0, 0.74, 1.11], axis: [1, 0, 0], angle: 0.95 * R2D },
      trunk: { meshes: ['detach_trunk_'], at: [0, 1.04, -0.3], axis: [1, 0, 0], angle: 0.6 * R2D },
      wheels: ['wheel(FL|FR|BL|BR)_(tire|rims)_']
    },
    winSplit: 'glass_detachable_glass', winDrop: 0.24, // 左右前窗在同一个网格里：按左右拆开挂到门上
    wheelPos: { frontLeft: [0.8, 0, 1.27], frontRight: [-0.79, 0, 1.27], rearLeft: [0.83, 0, -1.27], rearRight: [-0.835, 0, -1.27] },
    wheelR: 0.345, labelOut: 0.42,
    turnPos: [[0.74, 0.6, 1.92], [0.76, 0.7, -1.84]]
  };
  function isW70(model) {
    var paint = false, door = false;
    model.traverse(function (o) {
      if (!o.isMesh) return;
      if (/detach_door_L_/.test(o.name)) door = true;
      mats(o).forEach(function (m) { if (m.name === 'CarPaint') paint = true; });
    });
    return paint && door;
  }

  // ================= 配置校验：车模包、本地库里的配置都是外来数据，只留认识且合法的字段 =================
  // 材质类角色：车身的四种 + 灯。每个角色 = 整个材质（mats，材质编号或名字）+ 单个零件（pick，网格编号：材质和别的零件共用、或者从整块里圈出来的）；
  // 灯另有颜色、效果（lights）。led 是日行灯（沿用旧名）；cus1～cus8 是自定义灯（跟车况不联动，什么时候亮 when、错开闪 late 自己定）
  var BODY_ROLES = ['paint', 'rim', 'caliper', 'glass'];
  var CUSTOM_LIGHTS = ['cus1', 'cus2', 'cus3', 'cus4', 'cus5', 'cus6', 'cus7', 'cus8'];
  var LIGHT_ROLES = ['head', 'led', 'side', 'tail', 'brake', 'reverse', 'turnL', 'turnR', 'fogF', 'fogR', 'ambient'].concat(CUSTOM_LIGHTS);
  var MAT_ROLES = BODY_ROLES.concat(LIGHT_ROLES), STYLES = ['normal', 'rear', 'butterfly', 'scissor', 'gull'], EFFECTS = ['steady', 'breath', 'blink', 'flow', 'strobe'];
  var WHEN = ['power', 'led', 'side', 'head', 'brake', 'reverse', 'hazard'];
  var MOVERS = ['doorFL', 'doorFR', 'doorRL', 'doorRR', 'hood', 'trunk', 'sunroof', 'sunshade', 'chargePort'], WINDOWS = ['winFL', 'winFR', 'winRL', 'winRR'];
  var MAPS = ['aoMap', 'normalMap', 'map', 'roughnessMap', 'metalnessMap'];
  function hex(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c); }
  function okRe(x) { try { new RegExp(x); return true; } catch (e) { return false; } }
  function refs(a) { return Array.isArray(a) ? a.filter(function (x) { return (typeof x === 'number' && x >= 0 && x % 1 === 0) || (typeof x === 'string' && x.length < 200 && okRe(x)); }) : []; }
  function num(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : undefined; }
  function vec(a) { return Array.isArray(a) && a.length === 3 && a.every(function (x) { return typeof x === 'number' && isFinite(x) && Math.abs(x) < 1000; }) ? a.slice() : undefined; }
  function quarter(v) { return typeof v === 'number' && v % 90 === 0 ? ((v % 360) + 360) % 360 : 0; }
  function sanitize(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    var o = { v: 1, rotX: quarter(c.rotX), rotY: quarter(c.rotY), rotZ: quarter(c.rotZ), hide: refs(c.hide), mats: {}, parts: {} };
    [['length', 0.5, 30], ['scale', 1e-6, 1e6], ['exposure', 0.3, 3], ['env', 0, 5], ['paintAo', 0, 1], ['winDrop', 0, 2], ['wheelR', 0.05, 2], ['labelOut', 0, 3]].forEach(function (k) {
      var v = num(c[k[0]], k[1], k[2]); if (v !== undefined) o[k[0]] = v;
    });
    ['lens', 'keepGlass', 'keepPaintMap', 'borrow'].forEach(function (k) { if (c[k] === true) o[k] = true; });
    if (c.coords === 'model') o.coords = 'model';
    if (vec(c.box)) o.box = vec(c.box);
    if (typeof c.winSplit === 'string' && okRe(c.winSplit)) o.winSplit = c.winSplit;
    if (Array.isArray(c.paintKeep)) o.paintKeep = c.paintKeep.filter(function (k) { return MAPS.indexOf(k) >= 0; });
    if (typeof c.name === 'string') o.name = c.name.slice(0, 60);
    if (typeof c.credit === 'string') o.credit = c.credit.slice(0, 120);
    var m = c.mats && typeof c.mats === 'object' ? c.mats : {}, p = c.parts && typeof c.parts === 'object' ? c.parts : {};
    MAT_ROLES.forEach(function (k) { if (m[k]) o.mats[k] = refs(m[k]); });
    var pk = c.pick && typeof c.pick === 'object' ? c.pick : {}, li = c.lights && typeof c.lights === 'object' ? c.lights : {};
    MAT_ROLES.forEach(function (k) { var l = refs(pk[k]); if (l.length) (o.pick = o.pick || {})[k] = l; });
    LIGHT_ROLES.forEach(function (k) {
      var x = li[k], y = {};
      if (!x || typeof x !== 'object') return;
      if (hex(x.color)) y.color = x.color.toLowerCase();
      if (EFFECTS.indexOf(x.effect) >= 0) y.effect = x.effect;
      if (CUSTOM_LIGHTS.indexOf(k) >= 0) { if (WHEN.indexOf(x.when) >= 0) y.when = x.when; if (x.late === true) y.late = true; }
      // 发光质感（亮度、热白中心、保留灯罩纹理、边缘柔化）、路面光束（大灯的 beam 是近光、beamHigh 是远光），见 carlamp.js；以前存的亮度 k 换成发光亮度
      var gl = D3Lamp.cleanGlow(x.glow);
      if (!gl && num(x.k, 0.2, 3) !== undefined) gl = { intensity: Math.max(0.3, Math.min(1.5, x.k)) };
      if (gl) y.glow = gl;
      ['beam', 'beamHigh'].forEach(function (q) { var b = D3Lamp.cleanBeam(x[q]); if (b) y[q] = b; });
      if (Object.keys(y).length || CUSTOM_LIGHTS.indexOf(k) >= 0) (o.lights = o.lights || {})[k] = y; // 自定义灯：有这一条就是加了这盏（还没选零件也留着）
    });
    MOVERS.concat(WINDOWS).forEach(function (k) {
      var x = p[k];
      if (!x || typeof x !== 'object') return;
      var y = { meshes: refs(x.meshes) };
      if (STYLES.indexOf(x.style) >= 0) y.style = x.style;
      if (num(x.angle, 5, 150) !== undefined) y.angle = x.angle;
      if (x.flip === true) y.flip = true;
      if (x.other === true) y.other = true;
      if (x.mode === 'slide' || x.mode === 'tilt') y.mode = x.mode;
      if (num(x.travel, 0.1, 1.5) !== undefined) y.travel = x.travel;
      if (vec(x.at) && vec(x.axis)) { y.at = vec(x.at); y.axis = vec(x.axis); }
      if (vec(x.piv) && x.piv.every(function (v) { return Math.abs(v) <= 1.5; })) y.piv = vec(x.piv); // 铰链在自动算的位置上挪多少（按部件外框的比例：里外、上下、前后）
      o.parts[k] = y;
    });
    if (p.wheels) o.parts.wheels = refs(p.wheels);
    if (c.wheelPos && typeof c.wheelPos === 'object') {
      var wp = {};
      ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'].forEach(function (k) { if (vec(c.wheelPos[k])) wp[k] = vec(c.wheelPos[k]); });
      if (Object.keys(wp).length === 4) o.wheelPos = wp;
    }
    if (Array.isArray(c.turnPos) && c.turnPos.length === 2 && vec(c.turnPos[0]) && vec(c.turnPos[1])) o.turnPos = [vec(c.turnPos[0]), vec(c.turnPos[1])];
    var pl = c.plates && typeof c.plates === 'object' && !Array.isArray(c.plates) ? c.plates : null; // 车牌（装饰）：样式、号、前 / 后各一块的位置
    if (pl) {
      var ps = {};
      if (['blue', 'green', 'yellow', 'bignev', 'police', 'emergency', 'coach', 'trailer', 'lowspeed', 'embassy', 'consulate', 'hkmo', 'custom'].indexOf(pl.style) >= 0) ps.style = pl.style;
      if (typeof pl.text === 'string') ps.text = pl.text.toUpperCase().replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '').slice(0, 8); // 每一位合不合规矩，车牌页打开时再按国标截
      if (hex(pl.bg)) ps.bg = pl.bg.toLowerCase();
      if (hex(pl.fg)) ps.fg = pl.fg.toLowerCase();
      ['front', 'rear'].forEach(function (k) {
        var x = pl[k];
        if (!x || typeof x !== 'object') return;
        var y = {};
        if (x.on === true) y.on = true;
        if (vec(x.at)) y.at = vec(x.at);
        if (num(x.w, 0.2, 0.8) !== undefined) y.w = x.w;
        if (num(x.yaw, -60, 60) !== undefined) y.yaw = x.yaw;
        if (num(x.pitch, -60, 60) !== undefined) y.pitch = x.pitch;
        // 第一版存的角度：前牌左右偏、后牌上仰的方向和现在相反，换过来，挂在车上的样子不变
        if (pl.v !== 2 && k === 'front' && y.yaw) y.yaw = -y.yaw;
        if (pl.v !== 2 && k === 'rear' && y.pitch) y.pitch = -y.pitch;
        ps[k] = y;
      });
      ps.v = 2;
      if (ps.front || ps.rear || ps.style || ps.text) o.plates = ps;
    }
    if (Array.isArray(c.wraps)) { // 贴纸（装饰）：内置条纹、图片、文字
      var ws = [];
      c.wraps.slice(0, MAX_WRAPS).forEach(function (x) { var y = wrapClean(x); if (y && !ws.some(function (q) { return q.id === y.id; })) ws.push(y); });
      if (ws.length) o.wraps = ws;
    }
    return o.length || o.scale ? o : null; // 连大小都没有的配置不完整：当没有，自动识别
  }
  // 贴纸：条纹的模板（参数的范围在 carwrap.js 用的时候再夹）、贴在哪种零件上、图片引用（h:哈希 = 本地库里的，数字 = GLB 里的第几张图片）
  var MAX_WRAPS = 40, WRAP_TPL = ['belt', 'slash', 'rocker', 'race2', 'band', 'path', 'pixel', 'speed', 'checker', 'flame', 'camo'], WRAP_ON = ['body', 'glass', 'both'];
  var WRAP_FIN = ['gloss', 'satin', 'matte', 'metal', 'holo'];
  function imgRef(v) { return typeof v === 'number' && v >= 0 && v % 1 === 0 && v < 1e5 ? v : typeof v === 'string' && /^h:[0-9a-f]{8,40}$/.test(v) ? v : null; }
  function unit3(a) { var v = vec(a), l = v ? Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) : 0; return l > 1e-3 ? [v[0] / l, v[1] / l, v[2] / l] : undefined; }
  /** 一组数：长度对、每个都在范围里（lim：[[最小, 最大], …]） */
  function nums(a, lim) { return Array.isArray(a) && a.length === lim.length && a.every(function (v, i) { return num(v, lim[i][0], lim[i][1]) !== undefined; }) ? a.slice() : undefined; }
  function wrapClean(x) {
    if (!x || typeof x !== 'object' || ['stripe', 'img', 'text'].indexOf(x.kind) < 0) return null;
    var y = { id: typeof x.id === 'string' && /^[a-z0-9]{1,16}$/.test(x.id) ? x.id : Math.random().toString(36).slice(2, 10), kind: x.kind };
    if (x.hide === true) y.hide = true;
    if (num(x.alpha, 0.05, 1) !== undefined) y.alpha = x.alpha;
    if (WRAP_ON.indexOf(x.on) >= 0) y.on = x.on;
    ['c1', 'c2', 'c3', 'ac', 'gc', 'oc'].forEach(function (k) { if (hex(x[k])) y[k] = x[k].toLowerCase(); }); // 主色、第二三色、交替色、渐变的另一头、描边色
    // 质感：预设 + 光泽（粗糙度）、金属感
    if (WRAP_FIN.indexOf(x.fin) >= 0) y.fin = x.fin;
    if (num(x.rough, 0, 1) !== undefined) y.rough = x.rough;
    if (num(x.metal, 0, 1) !== undefined) y.metal = x.metal;
    // 加工：描边宽（拉花毫米、图片文字长边的百分比）、渐变方向（a 顺着走向 / c 横着）、虚线 [段长, 间隔]（厘米）、两端渐隐 [头, 尾]
    if (num(x.out, 0, 40) !== undefined && x.out > 0) y.out = x.out;
    if (x.grad === 'a' || x.grad === 'c') y.grad = x.grad;
    if (nums(x.dash, [[0.5, 300], [0.5, 300]])) y.dash = nums(x.dash, [[0.5, 300], [0.5, 300]]);
    if (nums(x.fd, [[0, 0.5], [0, 0.5]])) y.fd = nums(x.fd, [[0, 0.5], [0, 0.5]]);
    if (x.kind === 'stripe') {
      if (WRAP_TPL.indexOf(x.tpl) < 0) return null;
      y.tpl = x.tpl;
      if (x.side === 'L' || x.side === 'R' || x.side === 'both') y.side = x.side;
      if (x.pf === 'top' || x.pf === 'side') y.pf = x.pf; // 手绘线、图案：画在侧面还是车顶
      if (x.alt === true) y.alt = true; // 几道线交替两种颜色
      y.p = {};
      if (x.p && typeof x.p === 'object' && !Array.isArray(x.p)) Object.keys(x.p).slice(0, 32).forEach(function (k) { if (/^[a-zA-Z][a-zA-Z0-9]{0,15}$/.test(k) && num(x.p[k], -1e4, 1e4) !== undefined) y.p[k] = x.p[k]; });
      if (Array.isArray(x.path)) { // 手绘线：画布上的位置（0～1，侧面从车头、车顶往下；车顶从车的左边、车头往后），最多 200 个点
        var pts = x.path.slice(0, 200).filter(function (q) { return nums(q, [[-0.5, 1.5], [-0.5, 1.5]]); }).map(function (q) { return [Math.round(q[0] * 1e4) / 1e4, Math.round(q[1] * 1e4) / 1e4]; });
        if (pts.length >= 2) y.path = pts;
      }
      return y;
    }
    // 图片、文字：自由摆放（位置、朝外的方向、图片朝上的方向，车的坐标：x 左、y 上、z 车头）
    var at = vec(x.at), dir = unit3(x.dir);
    if (!at || !dir) return null;
    y.at = at; y.dir = dir;
    if (unit3(x.up)) y.up = unit3(x.up);
    if (num(x.rot, -180, 180) !== undefined) y.rot = x.rot;
    y.w = num(x.w, 0.02, 12) !== undefined ? x.w : 0.6;
    if (num(x.sx, 0.2, 5) !== undefined && x.sx !== 1) y.sx = x.sx; // 横向拉伸
    if (x.flip === true) y.flip = true;
    if (x.fv === true) y.fv = true; // 上下翻转
    if (x.both === 'mirror' || x.both === 'same') y.both = x.both;
    if (x.wm === 'v' || x.wm === 'h') y.wm = x.wm; // 包住：v 上下包、h 前后包
    if (x.kind === 'img') {
      var r = imgRef(x.img);
      if (r === null) return null;
      y.img = r;
      // 图片加工：裁剪 [左, 右, 上, 下]、去背景、调色 [亮度, 对比度, 饱和度, 色相]、边缘渐隐
      if (nums(x.crop, [[0, 0.45], [0, 0.45], [0, 0.45], [0, 0.45]])) y.crop = nums(x.crop, [[0, 0.45], [0, 0.45], [0, 0.45], [0, 0.45]]);
      if (x.key && typeof x.key === 'object') {
        var k = { c: x.key.c === 'auto' || !hex(x.key.c) ? 'auto' : x.key.c.toLowerCase() };
        if (num(x.key.tol, 0, 1) !== undefined) k.tol = x.key.tol;
        if (num(x.key.soft, 0, 1) !== undefined) k.soft = x.key.soft;
        if (x.key.edge === false) k.edge = false;
        y.key = k;
      }
      if (nums(x.adj, [[0, 3], [0, 3], [0, 4], [-180, 180]])) y.adj = nums(x.adj, [[0, 3], [0, 3], [0, 4], [-180, 180]]);
      if (num(x.ef, 0, 0.5) !== undefined && x.ef > 0) y.ef = x.ef;
      return y;
    }
    // 文字：多行（换行符）、字体、描边、竖排、字距、斜体、阴影
    y.text = typeof x.text === 'string' ? x.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').split('\n').slice(0, 6).join('\n').slice(0, 120) : '';
    if (typeof x.font === 'string' && /^(sys|sysb|b:[a-z0-9]{1,16}|u:[0-9a-f]{8,40})$/.test(x.font)) y.font = x.font;
    if ([0, 1, 2].indexOf(x.stroke) >= 0) y.stroke = x.stroke;
    if (x.vert === true) y.vert = true;
    if (num(x.ls, -0.3, 1) !== undefined && x.ls) y.ls = x.ls;
    if (x.it === true) y.it = true;
    if (x.sh && typeof x.sh === 'object') {
      var sh = { c: hex(x.sh.c) ? x.sh.c.toLowerCase() : '#000000' };
      ['x', 'y', 'b'].forEach(function (q) { if (num(x.sh[q], -1, 1) !== undefined) sh[q] = x.sh[q]; });
      y.sh = sh;
    }
    if (typeof imgRef(x.raster) === 'number') y.raster = x.raster; // 导出时用导入的字体写的字先画成图片：别人没有这个字体时用它
    return y;
  }

  // ================= IndexedDB（打不开就只在这次打开时有效） =================
  var dbP = null, mem = {};
  function db() {
    if (!dbP) dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open('d3', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('files'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('blocked')); };
    });
    return dbP;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('files', mode), q = fn(t.objectStore('files'));
        t.oncomplete = function () { res(q && q.result); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function get(k) { return tx('readonly', function (s) { return s.get(k); }).then(function (v) { return v === undefined ? mem[k] : v; }, function () { return mem[k]; }); }
  function put(k, v) { mem[k] = v; return tx('readwrite', function (s) { return s.put(v, k); }).then(function () { delete mem[k]; return true; }, function () { return false; }); }
  function del(k) { delete mem[k]; return tx('readwrite', function (s) { return s.delete(k); }).then(null, function () {}); }
  /** 以 prefix 开头的键 */
  function keys(prefix) {
    var pick = function (ks) { return ks.filter(function (k) { return typeof k === 'string' && k.indexOf(prefix) === 0; }); };
    return tx('readonly', function (s) { return s.getAllKeys(); }).then(function (ks) { return pick((ks || []).concat(Object.keys(mem))); }, function () { return pick(Object.keys(mem)); });
  }
  /** 内容哈希（两路 32 位 + 长度，十六进制）：同一张图片、同一个字体文件只存一份 */
  function hash(u8) {
    var a = 0x811c9dc5, b = 0x9747b28c;
    for (var i = 0; i < u8.length; i++) { a = Math.imul(a ^ u8[i], 16777619); b = Math.imul(b ^ u8[i], 0x5bd1e995); b ^= b >>> 15; }
    return ('0000000' + (a >>> 0).toString(16)).slice(-8) + ('0000000' + (b >>> 0).toString(16)).slice(-8) + (u8.length >>> 0).toString(16);
  }

  // ================= 贴纸的图片（wimg:哈希）、导入的字体（font:哈希，列表在 fonts） =================
  /** 存一张贴纸图片 → 引用 'h:哈希' */
  function wrapImgPut(bytes, mime) {
    var h = hash(bytes);
    return get('wimg:' + h).then(function (old) { return old ? true : put('wimg:' + h, new Blob([bytes], { type: mime })); }).then(function () { return 'h:' + h; });
  }
  /** 贴纸图片 → Blob（h:哈希 从本地库取；数字是车模 GLB 里的第几张图片）；取不到 null */
  function wrapImg(ref, buf) {
    if (typeof ref === 'number') { try { return Promise.resolve(glbImage(buf, ref)); } catch (e) { return Promise.resolve(null); } }
    if (typeof ref !== 'string' || ref.indexOf('h:') !== 0) return Promise.resolve(null);
    return get('wimg:' + ref.slice(2)).then(function (b) { return b || null; }, function () { return null; });
  }
  /** GLB 里第 i 张图片的数据（Blob）；没有 null */
  function glbImage(buf, i) {
    var g = readGLB(buf), im = (g.json.images || [])[i], bv = im && im.bufferView !== undefined && g.json.bufferViews[im.bufferView];
    if (!bv || !g.bin) return null;
    var o = bv.byteOffset || 0;
    return new Blob([g.bin.subarray(o, o + bv.byteLength)], { type: im.mimeType || 'image/png' });
  }
  /** 配置里已经不用的贴纸图片从本地库删掉（cfg 为空：全删）。调整车模完成、取消，换车模、恢复默认时调 */
  function gcWraps(cfg) {
    var used = {};
    ((cfg && cfg.wraps) || []).forEach(function (w) { if (typeof w.img === 'string') used['wimg:' + w.img.slice(2)] = 1; });
    return keys('wimg:').then(function (ks) { return Promise.all(ks.filter(function (k) { return !used[k]; }).map(del)); }).then(null, function () {});
  }
  function fontList() { return get('fonts').then(function (l) { return Array.isArray(l) ? l : []; }, function () { return []; }); }
  /** 存一个导入的字体 → { id, name } */
  function fontPut(name, bytes) {
    var id = hash(bytes);
    return put('font:' + id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).then(function () { return fontList(); }).then(function (l) {
      l = l.filter(function (f) { return f.id !== id; });
      l.push({ id: id, name: String(name || '字体').slice(0, 40) });
      return put('fonts', l).then(function () { return { id: id, name: name }; });
    });
  }
  function fontGet(id) { return get('font:' + id).then(function (b) { return b || null; }, function () { return null; }); }
  function fontDel(id) { return del('font:' + id).then(fontList).then(function (l) { return put('fonts', l.filter(function (f) { return f.id !== id; })); }); }

  // ================= GLB 读写 =================
  function isGLB(buf) { return buf.byteLength >= 20 && new DataView(buf).getUint32(0, true) === 0x46546C67; }
  function readGLB(buf) {
    var dv = new DataView(buf), len = Math.min(dv.getUint32(8, true), buf.byteLength), o = 12, json = null, bin = null;
    while (o + 8 <= len) {
      var cl = dv.getUint32(o, true), ct = dv.getUint32(o + 4, true);
      if (ct === 0x4E4F534A) json = parseJSON(new Uint8Array(buf, o + 8, cl));
      else if (ct === 0x004E4942) bin = new Uint8Array(buf, o + 8, cl);
      o += 8 + cl;
    }
    if (!json) throw err('文件坏了（GLB 里没有 JSON）');
    return { json: json, bin: bin };
  }
  function parseJSON(u8) { try { return JSON.parse(new TextDecoder().decode(u8)); } catch (e) { throw err('文件坏了，读不出里面的内容'); } }
  function a4(n) { return (n + 3) & ~3; }
  function writeGLB(json, bin) {
    var js = new TextEncoder().encode(JSON.stringify(json)), jl = a4(js.length), bl = bin ? a4(bin.length) : 0;
    var total = 12 + 8 + jl + (bin ? 8 + bl : 0), out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true);
    u8.set(js, 20);
    for (var i = js.length; i < jl; i++) u8[20 + i] = 0x20;
    if (bin) { var o = 20 + jl; dv.setUint32(o, bl, true); dv.setUint32(o + 4, 0x004E4942, true); u8.set(bin, o + 8); }
    return out;
  }
  /** GLB 里带的车模配置和署名 */
  function info(buf) {
    try {
      var j = readGLB(buf).json, a = j.asset || {}, x = a.extras || {}, c = sanitize(x.d3car);
      var name = (c && c.name) || x.title || '', credit = (c && c.credit) || [x.author, x.license].filter(Boolean).join(' · ') || a.copyright || '';
      return { cfg: c, name: String(name).slice(0, 60), credit: String(credit).replace(/\s*\(https?:[^)]*\)/g, '').slice(0, 120) };
    } catch (e) { return { cfg: null, name: '', credit: '' }; }
  }
  /** 把配置写进 GLB（车模包） */
  function withConfig(buf, cfg) {
    var g = readGLB(buf), a = g.json.asset = g.json.asset || { version: '2.0' };
    a.extras = a.extras || {};
    a.extras.d3car = cfg;
    a.extras.d3fmt = PACK_FMT;
    return writeGLB(g.json, g.bin);
  }

  // ================= 现在用的车模 =================
  var builtinBuf = null;
  function builtin() {
    if (!builtinBuf) { var s = atob(window.D3_CAR_GLB || ''), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); builtinBuf = u.buffer; }
    return builtinBuf;
  }
  /** → { buf, cfg（null = 进页面时自动识别 / W70 按指纹套内置配置）, name, credit, builtin } */
  function current() {
    return get('model').then(function (r) {
      if (r && r.glb && r.glb.byteLength) return { buf: r.glb, cfg: sanitize(r.cfg), name: String(r.name || '导入的车模'), credit: String(r.credit || ''), builtin: false, custom: true };
      var d = fallback(), c = sanitize(r && r.cfg);
      // 默认车模调整过：只存了配置（零件按编号记）。换了卡片包、默认车模变成别的车时不能套上去（零件、灯、朝向全对不上）：
      // 配置里记着是哪台车的名字，和现在的默认车模对上才用；以前的配置没写名字的都是 W70 时存的
      if (c && (c.name || W70.name) === d.name) { d.cfg = c; d.custom = true; }
      return d;
    }, fallback);
  }
  function fallback() {
    var b = builtin(), i = info(b);
    return { buf: b, cfg: i.cfg, name: i.name || W70.name, credit: i.credit || W70.credit, builtin: true };
  }
  /** 存车模：默认车模只存配置（不重复存一份模型） */
  function save(rec) { return put('model', { glb: rec.builtin ? null : rec.buf, cfg: rec.cfg || null, name: rec.builtin ? '' : rec.name || '', credit: rec.builtin ? '' : rec.credit || '', at: Date.now() }); }
  function reset() { return del('model').then(function () { return gcWraps(null); }); }

  // ================= 导入 =================
  function err(msg) { var e = new Error(msg); e.user = true; return e; }
  function readFile(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res({ name: f.name || '', buf: r.result }); };
      r.onerror = function () { rej(err('读不了这个文件')); };
      r.readAsArrayBuffer(f);
    });
  }
  function base(n) { return decodeURIComponent(String(n)).split(/[\\/]/).pop().toLowerCase(); }
  function dataURI(u) {
    var m = /^data:([^;,]*)(;base64)?,(.*)$/.exec(u);
    if (!m) return null;
    var s = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return { bytes: b, mime: m[1] };
  }
  function external(uri, files) {
    var d = dataURI(uri);
    if (d) return d;
    var n = base(uri);
    for (var i = 0; i < files.length; i++) if (base(files[i].name) === n) return { bytes: new Uint8Array(files[i].buf), mime: '' };
    throw err('缺少文件 ' + n + '（.gltf 要和它的 .bin、贴图一起选上）');
  }
  /** 选中的文件 → { buf: 转换好的 GLB, name, credit, cfg（车模包带的）, warn, tris0 / tris 简化前后的面数 }；
     ask({ tris, to })：面数太多时问要不要简化，返回 Promise<true / false>（不给就不简化） */
  /** step(文字, 进度 0～1)：整个导入连续走——读文件 → 解压（按零件）→ 整理 → 压缩贴图（按张）→ 0.55；简化 0.55 → 0.9；写入文件 0.92；
      剩下的（保存、建车）cartune.js 接着报 */
  function importFiles(fileList, step, ask) {
    step = step || function () {};
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.reject(err('没有选文件'));
    var size = files.reduce(function (s, f) { return s + (f.size || 0); }, 0);
    if (size > MAX_BYTES) return Promise.reject(err('文件太大（超过 60MB），车机吃不消'));
    step('读取文件', 0.01);
    return Promise.all(files.map(readFile)).then(function (list) {
      var main = list.filter(function (f) { return isGLB(f.buf); })[0] || list.filter(function (f) { return /\.gltf$/i.test(f.name); })[0];
      if (!main) {
        var txt = list.filter(function (f) { var b = new Uint8Array(f.buf, 0, Math.min(16, f.buf.byteLength)); return String.fromCharCode.apply(null, b).replace(/\s/g, '').charAt(0) === '{'; })[0];
        if (!txt) throw err('只支持 glTF 格式（.glb / .gltf）。别的格式可以先用 Blender 打开再导出成 GLB');
        main = txt;
      }
      var src = isGLB(main.buf) ? readGLB(main.buf) : { json: parseJSON(new Uint8Array(main.buf)), bin: null };
      if (!src.json.asset || String(src.json.asset.version).charAt(0) !== '2') throw err('只支持 glTF 2.0');
      var tris0 = 0, simp0 = !!(src.json.asset && src.json.asset.extras && src.json.asset.extras.d3simp); // 简化过的（我们导出的车模包）：不再问、不再减一遍
      return convert(src, list, step).then(function (out) {
        tris0 = count(out.json).tris;
        if (!count(out.json).prims) throw err('这个文件里没有模型');
        if (tris0 <= SIMPLIFY_OVER || !ask || simp0) return out;
        return Promise.resolve(ask({ tris: tris0, to: SIMPLIFY_TO })).then(function (yes) {
          if (!yes) return out;
          step('简化模型', 0.55);
          return script('meshopt-simplifier.js', 'MeshoptSimplifier').then(function (M) {
            return M.ready.then(tick).then(function () { return simplify(M, out.json, out.views, SIMPLIFY_TO, function (t, f) { step(t, 0.55 + 0.35 * f); }); }).then(function () { var a = out.json.asset; (a.extras = a.extras || {}).d3simp = 1; return out; });
          });
        });
      }).then(function (out) {
        step('写入文件', 0.92);
        return tick().then(function () { return out; });
      }).then(function (out) {
        quantize(out.json, out.views);
        var pk = pack(out.json, out.views), buf = writeGLB(pk.json, pk.bin), i = info(buf), c = count(pk.json), tris = c.tris, prims = c.prims;
        var warn = [];
        if (tris > WARN_TRIS) warn.push('有 ' + Math.round(tris / 10000) + ' 万个三角面');
        if (prims > WARN_MESHES) warn.push('有 ' + prims + ' 个零件');
        return { buf: buf, cfg: i.cfg, name: i.name || main.name.replace(/\.(glb|gltf)$/i, '').slice(0, 60) || '导入的车模', credit: i.credit, tris0: tris0, tris: tris,
          warn: warn.length ? '这个车模' + warn.join('、') + '，车机上可能会卡（可以在设置里把画质换成低）' : '' };
      });
    });
  }
  /** 三角形面数、图元数 */
  function count(json) {
    var tris = 0, prims = 0;
    (json.meshes || []).forEach(function (m) {
      (m.primitives || []).forEach(function (p) {
        var a = json.accessors[p.indices !== undefined ? p.indices : p.attributes.POSITION];
        prims++;
        if (a && (p.mode === undefined || p.mode === 4)) tris += a.count / 3;
      });
    });
    return { tris: Math.round(tris), prims: prims };
  }
  // ================= 简化（减面） =================
  var SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }, GET = { 5126: 'getFloat32', 5125: 'getUint32', 5123: 'getUint16', 5122: 'getInt16', 5121: 'getUint8', 5120: 'getInt8' };
  var NORM = { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 };
  /** 访问器读成 Float32Array（每个元素 k 个数）；稀疏的、读不了的返回 null。只取前 take 个分量（颜色只要 rgb） */
  function readAcc(json, views, ai, take) {
    var a = json.accessors[ai];
    if (!a || a.sparse || a.bufferView === undefined || !views[a.bufferView] || !GET[a.componentType]) return null;
    var v = views[a.bufferView], bv = json.bufferViews[a.bufferView], k = SIZE[a.type], bs = CT[a.componentType].BYTES_PER_ELEMENT, t = Math.min(take || k, k);
    var stride = bv.byteStride || k * bs, off = a.byteOffset || 0, dv = new DataView(v.buffer, v.byteOffset, v.byteLength), get = GET[a.componentType], norm = a.normalized ? NORM[a.componentType] : 0;
    if (off + (a.count - 1) * stride + k * bs > v.byteLength) return null;
    var out = new Float32Array(a.count * t);
    for (var i = 0; i < a.count; i++) for (var j = 0; j < t; j++) { var x = dv[get](off + i * stride + j * bs, true); out[i * t + j] = norm ? Math.max(x / norm, -1) : x; }
    return out;
  }
  /** 把模型简化到大约 target 个三角面，所有零件（大小都算）按同一个比例减，但只减到看不出来为止（保守）：误差按整车大小算
     （绝对误差，每个零件按自己的缩放换算），从车的对角线的 0.05% 开始，减不到的零件下一轮放宽误差再减，最多到 0.2%（约 1 厘米）；
     还超就把已经减到的零件按剩下的预算再减一轮。减不到目标就算了——做得很细、叠了好几层面的车模能减的很少。
     试过的坑（海豹 06：238 万面、Draco 压缩、722 个零件）：误差放到 1% 车身破洞、一块块发黑；去碎片（Prune）会把车标的字母当碎片删掉；
     跨贴图接缝合并（Permissive）法线乱了。零件和零件挨着的顶点锁住（不裂缝），和别的零件叠在一起的零件整个不碰（见 layeredSet）；
     每轮都从原始数据开始减，误差不累积；只换三角形索引（顶点没人共用的顺手去掉用不到的） */
  var SIMP_ERR = [0.0005, 0.001, 0.002];
  /** 一段段做（每段最多 40 毫秒），中间让页面喘口气、报进度：两三百万面的车模一口气简化要十几秒，浏览器会弹"页面无响应" */
  function slices(n, fn, prog) {
    var i = 0;
    return new Promise(function (res, rej) {
      (function run() {
        try {
          var t0 = Date.now();
          while (i < n && Date.now() - t0 < 40) fn(i++);
          if (prog) prog(n ? i / n : 1);
        } catch (e) { rej(e); return; }
        if (i < n) setTimeout(run, 0); else res();
      })();
    });
  }
  function simplify(M, json, views, target, step) {
    var W = worlds(json), refs = {}, items = [], fixed = 0, total = 0, owner;
    var pct = function (a, b) { return function (f) { if (step) step('简化模型', a + (b - a) * f); }; };
    (json.meshes || []).forEach(function (m, mi) {
      (m.primitives || []).forEach(function (p) {
        Object.keys(p.attributes || {}).forEach(function (k) { refs[p.attributes[k]] = (refs[p.attributes[k]] || 0) + 1; });
        var tri = (p.mode === undefined || p.mode === 4) && p.attributes.POSITION !== undefined, a = tri && json.accessors[p.indices !== undefined ? p.indices : p.attributes.POSITION], n = a ? a.count / 3 : 0;
        total += n;
        if (!tri || p.indices === undefined || p.targets || !W[mi]) { fixed += n; return; } // 只处理带索引的三角形（形变目标的也跳过，稳妥）
        var x = W[mi], sc = Math.max(Math.hypot(x[0], x[1], x[2]), Math.hypot(x[4], x[5], x[6]), Math.hypot(x[8], x[9], x[10])) || 1;
        items.push({ p: p, n: n, sc: sc, M: x });
      });
    });
    if (!items.length || total <= target * 1.05) return Promise.resolve();
    return seams(json, views, pct(0, 0.15)).then(function (o) {
      owner = o;
      return layeredSet(json, views, items, owner, pct(0.15, 0.35));
    }).then(function (lay) {
      items = items.filter(function (it) { if (lay.has(it)) { fixed += it.n; return false; } return true; });
      if (!items.length) return;
      var r = Math.max(0.01, (target - fixed) / (total - fixed)), last = SIMP_ERR.length - 1, live = items, sum = total, k = 0;
      var used = function () { return fixed + items.reduce(function (s0, it) { return s0 + (it.c === undefined ? it.n : it.c); }, 0); };
      var pass = function () { // 一轮：没减到的放宽误差再来
        if (k > last || !live.length) return Promise.resolve();
        var list = live, err = SIMP_ERR[k] * owner.diag, a = 0.35 + 0.17 * k;
        return slices(list.length, function (i) { simpRun(M, json, views, owner, list[i], Math.floor(list[i].n * r), err); }, pct(a, a + 0.17)).then(function () {
          sum = used(); k++;
          if (sum <= target * 1.08) return;
          live = items.filter(function (it) { return it.c !== undefined && it.c > it.want * 1.1 + 2; });
          return pass();
        });
      };
      return pass().then(function () {
        if (sum <= target * 1.15) return;
        // 误差放到最大还减不到的零件就这样了；减到了的按剩下的预算再减一点
        var hit = items.filter(function (it) { return it.c !== undefined && it.c <= it.want * 1.1 + 2; }), stuck = sum - hit.reduce(function (s0, it) { return s0 + it.c; }, 0);
        var r2 = (target - stuck) / (hit.reduce(function (s0, it) { return s0 + it.n; }, 0) || 1);
        if (r2 > 0.004 && r2 < r) return slices(hit.length, function (i) { simpRun(M, json, views, owner, hit[i], Math.floor(hit[i].n * r2), SIMP_ERR[last] * owner.diag); }, pct(0.86, 0.92));
      }).then(function () {
        return slices(items.length, function (i) {
          var it = items[i], out = it.out;
          if (!out || out.length < 3 || out.length > it.n * 3 * 0.95) return; // 没减多少（或者整个减没了）：不换
          var p = it.p, nv = it.nv;
          // 减掉的面用的顶点也去掉（显存、文件都小）；顶点数据被别的图元共用的不动
          var src = Object.keys(p.attributes).every(function (k2) { return refs[p.attributes[k2]] === 1; }) ? readAttrs(json, views, p.attributes, nv) : null;
          if (src) subset(json, views, p, src, out, nv); else setIndex(json, views, p, out, nv);
          it.pos = it.ind = it.va = it.out = null; // 用完放掉（大车模这些加起来几百兆）
        }, pct(0.92, 1));
      });
    });
  }
  /** 和别的零件几乎重合的零件（同一块面上叠了两层：车顶的两层、贴花、贴在保险杠上的车标……）：原样时靠完全重合遮住（有的本来就有零星的花点），
     简化时三角形一换，两层就互相穿插，冒出一大块一大块别的颜色——误差压到一两毫米、接缝锁到一厘米都一样。这种零件整个不简化：
     每个零件均匀取最多 256 个三角形，中心离别的零件的三角形面不到整车对角线的万分之一（约 0.5 毫米）、朝向相同的超过三成，这个零件和它叠着的那个都算
     （朝向相反的是一块板的里外两面，单面画时背面看不见，不会穿插；材质是双面的照样算）。
     三角形按外框放进均匀网格（格子边长是对角线的 1%，哈希到固定数量的桶里，碰撞只是多比几个三角形） */
  function layeredSet(json, views, items, seam, prog) {
    var diag = seam.diag, P = [], I = [], off = [0], T = 0, cell = diag * 0.01, tol = diag * 1e-4, NB = 1 << 20, i, k, cnt, owner, list, fill;
    var hash = function (x, y, z) { return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & (NB - 1); };
    var each = function (n, fn) { // 这个零件每个三角形的外框（放宽 tol）盖住的格子；太大的三角形（超过 8 格）只放进中心那格，碰上了照样算
      var w = P[n], idx = I[n];
      for (var t = 0; t < idx.length; t += 3) {
        var a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3, g = off[n] + t / 3, lo = [], hi = [];
        for (var d = 0; d < 3; d++) { lo[d] = Math.floor((Math.min(w[a + d], w[b + d], w[c + d]) - tol) / cell); hi[d] = Math.floor((Math.max(w[a + d], w[b + d], w[c + d]) + tol) / cell); }
        if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 8) { lo = hi = [0, 1, 2].map(function (d) { return Math.floor((w[a + d] + w[b + d] + w[c + d]) / 3 / cell); }); }
        for (var x = lo[0]; x <= hi[0]; x++) for (var y = lo[1]; y <= hi[1]; y++) for (var z = lo[2]; z <= hi[2]; z++) fn(hash(x, y, z), g);
      }
    };
    var q4 = function (a, b) { return function (f) { if (prog) prog(a + (b - a) * f); }; };
    return slices(items.length, function (n) { // 世界坐标用接缝那一步算好的
      var w = seam.world(items[n].p), idx = readAcc(json, views, items[n].p.indices, 1);
      if (!w || !idx) { w = new Float64Array(0); idx = new Float32Array(0); }
      P.push(w); I.push(idx); T += idx.length / 3; off.push(T);
    }, q4(0, 0.1)).then(function () {
      cnt = new Int32Array(NB + 1); owner = new Int32Array(T);
      return slices(items.length, function (n) { each(n, function (h) { cnt[h + 1]++; }); }, q4(0.1, 0.35));
    }).then(function () {
      for (i = 0; i < NB; i++) cnt[i + 1] += cnt[i];
      fill = cnt.slice(0, NB); list = new Int32Array(cnt[NB]);
      return slices(items.length, function (n) { each(n, function (h, g) { list[fill[h]++] = g; owner[g] = n; }); }, q4(0.35, 0.6));
    }).then(function () {
    var set = new Set(), e1 = [0, 0, 0], e2 = [0, 0, 0], q = [0, 0, 0];
    var two = items.map(function (it) { var m = it.p.material !== undefined && json.materials && json.materials[it.p.material]; return !!(m && m.doubleSided); });
    return slices(items.length, function (n) {
      var it = items[n], w = P[n], ix0 = I[n], nt = ix0.length / 3, step = Math.max(1, Math.floor(nt / 256)), tried = 0, near = 0, mate = {};
      for (var s0 = 0; s0 < nt; s0 += step) {
        var a0 = ix0[s0 * 3] * 3, b0 = ix0[s0 * 3 + 1] * 3, c0 = ix0[s0 * 3 + 2] * 3;
        var ux = w[b0] - w[a0], uy = w[b0 + 1] - w[a0 + 1], uz = w[b0 + 2] - w[a0 + 2], vx = w[c0] - w[a0], vy = w[c0 + 1] - w[a0 + 1], vz = w[c0 + 2] - w[a0 + 2];
        var sx = uy * vz - uz * vy, sy = uz * vx - ux * vz, sz = ux * vy - uy * vx, sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (sl < 1e-12) continue;
        tried++;
        var px = (w[a0] + w[b0] + w[c0]) / 3, py = (w[a0 + 1] + w[b0 + 1] + w[c0 + 1]) / 3, pz = (w[a0 + 2] + w[b0 + 2] + w[c0 + 2]) / 3, h = hash(Math.floor(px / cell), Math.floor(py / cell), Math.floor(pz / cell)), hit = -1;
        for (var j = cnt[h]; j < cnt[h + 1] && hit < 0; j++) {
          var g = list[j], m = owner[g];
          if (m === n) continue;
          var t3 = (g - off[m]) * 3, W2 = P[m], ix = I[m], a = ix[t3] * 3, b = ix[t3 + 1] * 3, c = ix[t3 + 2] * 3;
          for (k = 0; k < 3; k++) { e1[k] = W2[b + k] - W2[a + k]; e2[k] = W2[c + k] - W2[a + k]; }
          q[0] = px - W2[a]; q[1] = py - W2[a + 1]; q[2] = pz - W2[a + 2];
          var nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (nl < 1e-12) continue;
          var dist = (q[0] * nx + q[1] * ny + q[2] * nz) / nl;
          if (Math.abs(dist) > tol) continue;
          if (!two[n] && !two[m] && (sx * nx + sy * ny + sz * nz) / (sl * nl) < 0.5) continue; // 朝向相反（一块板的里外两面）
          // 投到三角形所在平面上，在三角形里面（重心坐标）才算
          var d00 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], d01 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], d11 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
          var d20 = q[0] * e1[0] + q[1] * e1[1] + q[2] * e1[2], d21 = q[0] * e2[0] + q[1] * e2[1] + q[2] * e2[2], den = d00 * d11 - d01 * d01;
          var bv = (d11 * d20 - d01 * d21) / den, bw = (d00 * d21 - d01 * d20) / den;
          if (bv >= -0.02 && bw >= -0.02 && bv + bw <= 1.02) hit = m;
        }
        if (hit >= 0) { near++; mate[hit] = (mate[hit] || 0) + 1; }
      }
      if (tried && near > tried * 0.3) { set.add(it); Object.keys(mate).forEach(function (m) { if (mate[m] > tried * 0.1) set.add(items[m]); }); }
    }, q4(0.6, 1)).then(function () { return set; });
    });
  }
  /** 一个零件减到 want 个面左右，误差不超过 err（世界坐标）；数据第一次用时读出来留着（每轮都从原始数据减） */
  function simpRun(M, json, views, owner, it, want, err) {
    var p = it.p;
    if (it.bad) return;
    if (!it.ind) {
      var pos = readAcc(json, views, p.attributes.POSITION, 3), idx = readAcc(json, views, p.indices, 1);
      if (!pos || !idx) { it.bad = true; return; }
      var ind = new Uint32Array(idx), nv = pos.length / 3;
      for (var i = 0; i < ind.length; i++) if (ind[i] >= nv) { it.bad = true; return; } // 索引越界的坏数据：不动
      // 参考的属性：法线、顶点色（rgb）、贴图坐标，各自给个权重——颜色交界、贴图接缝那一圈不被抹掉
      var attrs = [], weights = [];
      [['NORMAL', 3, 0.5], ['COLOR_0', 3, 1], ['TEXCOORD_0', 2, 0.5]].forEach(function (x) {
        if (p.attributes[x[0]] === undefined) return;
        var a = readAcc(json, views, p.attributes[x[0]], x[1]);
        if (a && a.length === nv * x[1]) { attrs.push({ a: a, k: x[1] }); for (var j = 0; j < x[1]; j++) weights.push(x[2]); }
      });
      var st = weights.length, va = null;
      if (st) {
        va = new Float32Array(nv * st);
        for (var v = 0; v < nv; v++) { var o = 0; attrs.forEach(function (x) { for (var j = 0; j < x.k; j++) va[v * st + o + j] = x.a[v * x.k + j]; o += x.k; }); }
      }
      it.pos = pos; it.ind = ind; it.nv = nv; it.va = va; it.st = st; it.w = weights; it.lock = owner.lock(p);
    }
    it.want = Math.min(it.n, Math.max(0, want));
    var e = err / it.sc, flags = ['ErrorAbsolute'].concat(it.lock ? [] : ['LockBorder']), res; // 绝对误差按零件自己的单位
    try {
      res = it.va ? M.simplifyWithAttributes(it.ind, it.pos, 3, it.va, it.st, it.w, it.lock, it.want * 3, e, flags) : M.simplify(it.ind, it.pos, 3, it.want * 3, e, flags);
    } catch (er) { it.bad = true; return; }
    it.out = res[0]; it.c = it.out.length / 3;
  }
  /** 零件和零件挨着的地方（世界坐标重合的顶点，属于两个以上的图元）：简化时这些顶点不动，各自减面后接缝不会裂开；
     零件自己的开口边（板件边缘、缝隙）可以沿着边减（误差有上限）——全锁住的话，导出来到处是开口边的车模几乎减不动。
     返回 { lock(p) → Uint8Array（每个顶点 1 = 不动）}，读不了的图元返回 null（那就整个开口边都锁住） */
  function seams(json, views, prog) {
    var W = worlds(json), seen = new Map(), all = [], byP = new Map();
    (json.meshes || []).forEach(function (m, mi) {
      if (!W[mi]) return;
      (m.primitives || []).forEach(function (p) { if (p.attributes && p.attributes.POSITION !== undefined) { var x = { p: p, M: W[mi], w: new Float64Array(0) }; all.push(x); byP.set(p, x); } });
    });
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    return slices(all.length, function (id) { // 顶点换到世界坐标
      var x = all[id], pos = readAcc(json, views, x.p.attributes.POSITION, 3);
      if (!pos) return;
      x.w = new Float64Array(pos.length);
      for (var i = 0; i < pos.length; i += 3) for (var k = 0; k < 3; k++) { var v = x.M[k] * pos[i] + x.M[4 + k] * pos[i + 1] + x.M[8 + k] * pos[i + 2] + x.M[12 + k]; x.w[i + k] = v; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    }, function (f) { if (prog) prog(f * 0.4); }).then(function () {
    // 挨着 = 离别的零件的顶点 2 毫米左右以内（按整车大小算）：Draco 等压缩过的车模，每个零件按自己的范围量化，交界处的顶点差零点几毫米，
    // 按"完全重合"认不出来，两边各减各的就裂开了（车身上一道道缝、透出车里的黑）。两套错开半格的网格，正好跨在格子边上的也认得出
    var diag0 = Math.sqrt(sq(hi[0] - lo[0]) + sq(hi[1] - lo[1]) + sq(hi[2] - lo[2])) || 1, q = 1 / (diag0 * 4e-4), seen2 = new Map();
    var key = function (w, i, o) { return Math.round(w[i] * q + o) + ',' + Math.round(w[i + 1] * q + o) + ',' + Math.round(w[i + 2] * q + o); };
    var mark = function (m, k, id) { var o = m.get(k); if (o === undefined) m.set(k, id); else if (o !== id) m.set(k, -1); };
    return slices(all.length, function (id) { var x = all[id]; for (var i = 0; i < x.w.length; i += 3) { mark(seen, key(x.w, i, 0), id); mark(seen2, key(x.w, i, 0.5), id); } }, function (f) { if (prog) prog(0.4 + f * 0.6); }).then(function () {
      return {
        diag: diag0, // 整车外框对角线（世界坐标）
        world: function (p) { var x = byP.get(p); return x ? x.w : null; }, // 顶点的世界坐标（叠层检测也用）
        lock: function (p) {
          var x = byP.get(p);
          if (!x) return null;
          var l = new Uint8Array(x.w.length / 3);
          for (var i = 0; i < l.length; i++) l[i] = seen.get(key(x.w, i * 3, 0)) === -1 || seen2.get(key(x.w, i * 3, 0.5)) === -1 ? 1 : 0;
          return l;
        }
      };
    });
    });
  }
  /** 换成新的三角形索引（原来的可能被别的图元共用，不改它） */
  function setIndex(json, views, p, ind, nv) {
    var arr = nv <= 65535 ? new Uint16Array(ind) : ind instanceof Uint32Array ? ind : new Uint32Array(ind);
    p.indices = addAcc(json, views, arr, 'SCALAR', nv <= 65535 ? 5123 : 5125, 34963);
  }
  /** 一段数据当新的访问器加进去（bounds：带 min / max，POSITION 必须带） */
  function addAcc(json, views, arr, type, ct, target, bounds) {
    views.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    var bv = { buffer: 0, byteLength: arr.byteLength }, k = SIZE[type], i;
    if (target) bv.target = target;
    json.bufferViews.push(bv);
    var a = { bufferView: json.bufferViews.length - 1, componentType: ct, count: arr.length / k, type: type };
    if (bounds) {
      a.min = []; a.max = [];
      for (i = 0; i < k; i++) { a.min.push(arr.length ? Infinity : 0); a.max.push(arr.length ? -Infinity : 0); }
      for (i = 0; i < arr.length; i++) { var c = i % k; if (arr[i] < a.min[c]) a.min[c] = arr[i]; if (arr[i] > a.max[c]) a.max[c] = arr[i]; }
    }
    return json.accessors.push(a) - 1;
  }

  // ================= 整理网格 =================
  /** 导入时整理网格（原来的数据不改，换新的索引、拆新的图元）：
     1) 没带法线的网格（glTF 规定按平面着色，多半是别的格式转过来的）常有一块块翻过去的面片，单面渲染就成了一个个洞：
        焊上重合的顶点，沿共用边把相邻三角形的绕向理顺，每个连通块再按对车中心的有向体积朝外（材质另外按双面画，见 car3d.js）；
     2) 颜色写在顶点上、只有几种颜色的（整辆车一个网格那种）：按颜色拆成几个图元、各用一个材质（颜色写进材质），
        车漆、轮毂这些才能按材质认出来、在设置里换色。颜色多的（烘焙的光影、渐变）不拆 */
  function tidy(json, views) {
    var W = worlds(json), O = sceneCenter(json, W), made = {}, refs = {};
    (json.meshes || []).forEach(function (m) { (m.primitives || []).forEach(function (p) { Object.keys(p.attributes || {}).forEach(function (k) { refs[p.attributes[k]] = (refs[p.attributes[k]] || 0) + 1; }); }); });
    (json.meshes || []).forEach(function (mesh, mi) {
      var out = [];
      (mesh.primitives || []).forEach(function (p) {
        var a = p.attributes || {};
        if ((p.mode !== undefined && p.mode !== 4) || a.POSITION === undefined) { out.push(p); return; }
        var pos = readAcc(json, views, a.POSITION, 3), nv = pos ? pos.length / 3 : 0, ind = null, i;
        if (pos) ind = p.indices === undefined ? seq(nv) : readAcc(json, views, p.indices, 1);
        if (!ind || !ind.length || ind.length % 3) { out.push(p); return; }
        for (i = 0; i < ind.length; i++) if (ind[i] >= nv) { out.push(p); return; } // 索引越界的坏数据：不动
        ind = ind instanceof Uint32Array ? ind : new Uint32Array(ind);
        var w = weld(pos), dd = dedupe(ind, w.id), two = !!(dd && dd.back), changed = !!dd;
        if (dd) ind = dd.ind;
        // 没带法线的、带了但法线是坏的（见 badNormals）：理顺绕向、按形状重新算法线
        var flat = a.NORMAL === undefined || badNormals(readAcc(json, views, a.NORMAL, 3), ind, pos);
        if (flat && W[mi] && orient(ind, pos, W[mi], O, w)) changed = true;
        if (flat) a.NORMAL = addAcc(json, views, normals(ind, pos), 'VEC3', 5126, 34962); // 用原始精度的网格算好法线：之后简化了也照样光滑
        var parts = a.COLOR_0 !== undefined ? byColor(json, views, p, ind, nv, flat || two, made) : null;
        if (parts) { out.push.apply(out, parts); return; }
        if (changed) {
          // 去掉了重复的面：用不到的顶点也去掉（顶点数据被别的图元共用的不动）
          var src = dd && Object.keys(a).every(function (k) { return refs[a[k]] === 1 || (flat && k === 'NORMAL'); }) ? readAttrs(json, views, a, nv) : null;
          if (src) subset(json, views, p, src, ind, nv); else setIndex(json, views, p, ind, nv);
        }
        if (flat || two) p.material = twoSided(json, p.material, made);
        out.push(p);
      });
      mesh.primitives = out;
    });
    pieces(json, views);
  }
  /** 让出主线程一下：进度框里的字先画出来，再做下面一大段算的 */
  function tick() { return new Promise(function (res) { setTimeout(res, 40); }); }
  // ================= 整车一个网格：拆成零件 =================
  /** 整辆车（或者大半辆）在一个网格里的（3D Builder、扫描、别的格式转过来的）：车门、引擎盖、车轮、车窗都粘在一起，开不了门、转不了轮子。
     按"连在一起的算一块"拆开：大块（外框对角线到网格的一成）各成一个零件；小块（把手、螺丝、灯里的小零件）跟着包住它的最小的那个大块走（把手跟着门）；
     哪个大块都不包的零碎合成一块。最多 MAX_PIECES 块（多了按大小留，车机上每多一块就多画一次）。拆出来的零件挂在原来的节点下面，名字是原名 + 编号（大的在前）。
     只拆"占了大半辆车"的网格（面数占三成以上、长度占一半以上）：本来就分好零件的车模不动。带骨骼、形变、扩展的不拆 */
  var MAX_PIECES = 60;
  function pieces(json, views) {
    var W = worlds(json), uses = {}, total = count(json).tris, sceneLen = 0, cand = [];
    (json.nodes || []).forEach(function (n) { if (n.mesh !== undefined) uses[n.mesh] = (uses[n.mesh] || 0) + 1; });
    var ext = function (a) { return a && Array.isArray(a.min) && Array.isArray(a.max) && a.min.length === 3 ? [a.max[0] - a.min[0], a.max[1] - a.min[1], a.max[2] - a.min[2]] : null; };
    (json.meshes || []).forEach(function (m, mi) {
      if (!W[mi]) return;
      (m.primitives || []).forEach(function (p) { var e = ext(json.accessors[p.attributes.POSITION]); if (e) sceneLen = Math.max(sceneLen, Math.max(e[0], e[1], e[2]) * Math.sqrt(W[mi][0] * W[mi][0] + W[mi][1] * W[mi][1] + W[mi][2] * W[mi][2])); });
    });
    (json.meshes || []).forEach(function (m, mi) {
      if (uses[mi] !== 1 || !W[mi]) return;
      var node = (json.nodes || []).filter(function (n) { return n.mesh === mi; })[0], tris = 0, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], ok = !node.skin;
      (m.primitives || []).forEach(function (p) {
        if ((p.mode !== undefined && p.mode !== 4) || p.targets || (p.extensions && Object.keys(p.extensions).length) || p.attributes.POSITION === undefined) { ok = false; return; }
        var a = json.accessors[p.attributes.POSITION];
        tris += (p.indices !== undefined ? json.accessors[p.indices].count : a.count) / 3;
        if (!ext(a)) { ok = false; return; }
        for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
      });
      var sc = Math.sqrt(W[mi][0] * W[mi][0] + W[mi][1] * W[mi][1] + W[mi][2] * W[mi][2]);
      if (ok && tris >= 5000 && tris >= 0.3 * total && Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * sc >= 0.5 * sceneLen) cand.push({ mi: mi, node: node });
    });
    cand.forEach(function (c) { splitMesh(json, views, c.mi, c.node); });
  }
  function splitMesh(json, views, mi, node) {
    var mesh = json.meshes[mi], prims = [], nv = 0, i, k;
    // 所有图元的顶点接在一起焊接（同一个网格坐标系相同）：不同颜色 / 材质的零件挨着也算连在一起（门板和窗框）
    for (i = 0; i < mesh.primitives.length; i++) {
      var p = mesh.primitives[i], pos = readAcc(json, views, p.attributes.POSITION, 3);
      if (!pos) return;
      var n0 = pos.length / 3, ind = p.indices === undefined ? seq(n0) : readAcc(json, views, p.indices, 1);
      if (!ind || ind.length % 3) return;
      ind = ind instanceof Uint32Array ? ind : new Uint32Array(ind);
      for (k = 0; k < ind.length; k++) if (ind[k] >= n0) return;
      var src = readAttrs(json, views, p.attributes, n0);
      if (!src) return;
      prims.push({ p: p, pos: pos, ind: ind, src: src, base: nv, nv: n0 });
      nv += n0;
    }
    var all = new Float32Array(nv * 3);
    prims.forEach(function (x) { all.set(x.pos, x.base * 3); });
    var w = weld(all), par = new Int32Array(w.n);
    for (i = 0; i < w.n; i++) par[i] = i;
    var find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    prims.forEach(function (x) {
      for (var t = 0; t < x.ind.length; t += 3) {
        var a = find(w.id[x.base + x.ind[t]]), b = find(w.id[x.base + x.ind[t + 1]]), c = find(w.id[x.base + x.ind[t + 2]]);
        if (b !== a) par[b] = a;
        if (c !== a && c !== b) par[find(c)] = a;
      }
    });
    // 每块：面数、外框
    var comp = {}, list = [];
    prims.forEach(function (x) {
      for (var t = 0; t < x.ind.length; t += 3) {
        var r = find(w.id[x.base + x.ind[t]]), o = comp[r];
        if (!o) { o = comp[r] = { n: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], to: null }; list.push(o); }
        o.n++;
        for (var j = 0; j < 3; j++) { var v = x.ind[t + j] * 3; for (var q = 0; q < 3; q++) { var c = x.pos[v + q]; if (c < o.lo[q]) o.lo[q] = c; if (c > o.hi[q]) o.hi[q] = c; } }
      }
    });
    var diag = function (o) { return Math.sqrt(sq(o.hi[0] - o.lo[0]) + sq(o.hi[1] - o.lo[1]) + sq(o.hi[2] - o.lo[2])); };
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    list.forEach(function (o) { for (var q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], o.lo[q]); hi[q] = Math.max(hi[q], o.hi[q]); } });
    var D = diag({ lo: lo, hi: hi }), m = 0.02 * D, rest = { n: 0, rest: true };
    var vol = function (o) { return (o.hi[0] - o.lo[0] + m) * (o.hi[1] - o.lo[1] + m) * (o.hi[2] - o.lo[2] + m); };
    var inside = function (o, b) { return b.lo[0] - m <= o.lo[0] && b.lo[1] - m <= o.lo[1] && b.lo[2] - m <= o.lo[2] && b.hi[0] + m >= o.hi[0] && b.hi[1] + m >= o.hi[1] && b.hi[2] + m >= o.hi[2]; };
    var big = list.filter(function (o) { return diag(o) >= 0.1 * D; });
    // 大块被另一个（不是整车那么大的）大块包住：并进去（轮毂并进轮胎成一个车轮、门内饰并进车门）；整车外壳不吞别的大块（不然门也被吞了）
    big.sort(function (a, b) { return vol(a) - vol(b); });
    big.forEach(function (o) {
      var best = null;
      big.forEach(function (b) { if (b !== o && diag(b) < 0.5 * D && vol(b) > vol(o) && inside(o, b) && (!best || vol(b) < vol(best))) best = b; });
      if (best) o.into = best;
    });
    var root = function (o) { while (o.into) o = o.into; return o; };
    var heads = big.filter(function (o) { return !o.into; });
    heads.forEach(function (o) { o.tris = 0; });
    big.forEach(function (o) { root(o).tris += o.n; });
    heads.sort(function (a, b) { return b.tris - a.tris; }); // 多了按面数（细节）留：车轮小但面多，留得住
    if (heads.length > MAX_PIECES) heads.slice(MAX_PIECES).forEach(function (o) { o.into = rest; });
    heads = heads.slice(0, MAX_PIECES);
    if (heads.length < 3) return; // 拆出来不到 3 块：没意思
    big.forEach(function (o) { var r = root(o); o.to = r === rest ? rest : r; });
    list.forEach(function (o) { // 小块跟着包住它的最小的那块；哪个都不包的进"零碎"
      if (o.to) return;
      var best = null;
      heads.forEach(function (b) { if (inside(o, b) && (!best || vol(b) < vol(best))) best = b; });
      o.to = best || rest;
    });
    var big0 = big;
    big = heads;
    var groups = big.concat(list.some(function (o) { return o.to === rest; }) || big0.some(function (o) { return o.to === rest; }) ? [rest] : []);
    groups.forEach(function (g) { g.tri = prims.map(function () { return []; }); });
    prims.forEach(function (x, pi) {
      for (var t = 0; t < x.ind.length; t += 3) { var g = comp[find(w.id[x.base + x.ind[t]])].to; g.tri[pi].push(x.ind[t], x.ind[t + 1], x.ind[t + 2]); }
    });
    var name = node.name || mesh.name || '零件', kids = [];
    groups.forEach(function (g, gi) {
      var nm = { name: name + '-' + (g.rest ? '零碎' : gi + 1), primitives: [] };
      prims.forEach(function (x, pi) {
        if (!g.tri[pi].length) return;
        var np = { mode: 4 };
        if (x.p.material !== undefined) np.material = x.p.material;
        if (x.p.extras) np.extras = x.p.extras;
        subset(json, views, np, x.src, new Uint32Array(g.tri[pi]), x.nv);
        nm.primitives.push(np);
      });
      json.meshes.push(nm);
      kids.push(json.nodes.push({ name: nm.name, mesh: json.meshes.length - 1 }) - 1);
    });
    delete node.mesh;
    node.children = (node.children || []).concat(kids);
    mesh.primitives = []; // 原来的网格没人用了（数据在打包时去掉）
  }
  // ================= 圈出来的部分拆成新零件（改 GLB） =================
  /** jobs: [{ mid, tris: 三角形编号（这个网格里的第几个三角形） }] → { buf: 新的 GLB, mids: 每个 job 拆出来的新零件编号 }。
     原来的零件留下没选的三角形；选的那些成一个新零件（同样的材质、只带用到的顶点），挂成场景最后一个顶层节点（世界矩阵同原来的零件）：
     解析时按遍历顺序编号，新零件排在最后，原有零件的编号都不变（配置里引用的照样对）。全选了不用拆，返回原来的编号；没选上、对不上 GLB 的返回 -1 */
  function carve(buf, d, jobs) {
    var g = readGLB(buf), json = g.json, bin = g.bin || new Uint8Array(0), W = worlds(json), next = d.meshes.length, out = jobs.map(function () { return -1; }), byMid = {};
    var views = (json.bufferViews || []).map(function (v) { var o = v.byteOffset || 0; return bin.subarray(o, o + v.byteLength); });
    var sc = json.scenes && json.scenes[json.scene || 0];
    if (!sc) throw err('车模里没有场景');
    // 同一个零件上的几刀一起切（一条车窗分给前后两扇门、一个网格里的左右转向灯）：三角形编号都按切之前的算
    jobs.forEach(function (j, i) { (byMid[j.mid] = byMid[j.mid] || []).push(i); });
    jobs.forEach(function (j0, i0) {
      var list = byMid[j0.mid];
      if (!list || list[0] !== i0) return; // 这个零件处理过了
      var mm = d.meshes[j0.mid], gl = mm && mm.userData.gl, gm = gl && json.meshes[gl.mesh], p = gm && gm.primitives[gl.prim];
      if (!p || !W[gl.mesh] || (p.mode !== undefined && p.mode !== 4)) return;
      var pos = readAcc(json, views, p.attributes.POSITION, 3), nv = pos ? pos.length / 3 : 0;
      var ind = !pos ? null : p.indices === undefined ? seq(nv) : readAcc(json, views, p.indices, 1), src = pos && readAttrs(json, views, p.attributes, nv);
      if (!ind || !src) return;
      var nt = ind.length / 3, own = new Int32Array(nt).fill(-1), cnt = {}, t, k, free = nt;
      list.forEach(function (ji) { (jobs[ji].tris || []).forEach(function (x) { if (x >= 0 && x < nt && own[x] < 0) { own[x] = ji; cnt[ji] = (cnt[ji] || 0) + 1; free--; } }); });
      var got = list.filter(function (ji) { return cnt[ji]; });
      if (!got.length) return;
      if (!free && got.length === 1) { out[got[0]] = j0.mid; return; } // 整个零件都选了：不用拆
      var keep = new Uint32Array(free * 3), a = 0;
      for (t = 0; t < nt; t++) if (own[t] < 0) for (k = 0; k < 3; k++) keep[a++] = ind[t * 3 + k];
      setIndex(json, views, p, keep, nv);
      got.forEach(function (ji) {
        var take = new Uint32Array(cnt[ji] * 3), b = 0;
        for (t = 0; t < nt; t++) if (own[t] === ji) for (k = 0; k < 3; k++) take[b++] = ind[t * 3 + k];
        var np = { mode: 4 };
        if (p.material !== undefined) np.material = p.material;
        subset(json, views, np, src, take, nv);
        var name = (mm.name || gm.name || '零件') + '-' + (jobs[ji].name || '拆出来的');
        json.meshes.push({ name: name, primitives: [np] });
        sc.nodes.push(json.nodes.push({ name: name, mesh: json.meshes.length - 1, matrix: W[gl.mesh].slice(), extras: { d3carved: true } }) - 1);
        out[ji] = next++; // 新零件按挂上去的顺序编号（解析时排在最后）
      });
    });
    quantize(json, views); // 拆出来的新零件写的是浮点数据：照样量化
    var pk = pack(json, views);
    return { buf: writeGLB(pk.json, pk.bin), mids: out };
  }
  function seq(n) { var a = new Uint32Array(n); for (var i = 0; i < n; i++) a[i] = i; return a; }
  /** 顶点法线：相邻三角形的法线按面积加权平均（同 three.js 的 computeVertexNormals，只在共用同一个顶点的三角形之间平滑） */
  /** 法线坏了吗：顶点法线和三角形实际朝向差 70° 以上的三角形超过四分之一。正常的车模只有百分之二三（曲面上本来就有点偏）；
      宋 Pro 那种（不知道哪一步导出坏的）六成以上，画出来车身一块一块发灰发亮、接缝成白线，换了车漆颜色也花 */
  function badNormals(nrm, ind, pos) {
    if (!nrm || nrm.length !== pos.length) return false;
    var bad = 0, n = 0;
    for (var i = 0; i < ind.length; i += 3) {
      var a = ind[i] * 3, b = ind[i + 1] * 3, c = ind[i + 2] * 3;
      var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      var x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.sqrt(x * x + y * y + z * z);
      if (!(l > 0)) continue;
      n++;
      for (var j = 0; j < 3; j++) {
        var k = ind[i + j] * 3, m = Math.sqrt(nrm[k] * nrm[k] + nrm[k + 1] * nrm[k + 1] + nrm[k + 2] * nrm[k + 2]);
        if (!(m > 0) || Math.abs(nrm[k] * x + nrm[k + 1] * y + nrm[k + 2] * z) < 0.35 * l * m) { bad++; break; }
      }
    }
    return n > 0 && bad > 0.25 * n;
  }
  function normals(ind, pos) {
    var n = new Float32Array(pos.length), i, j;
    for (i = 0; i < ind.length; i += 3) {
      var a = ind[i] * 3, b = ind[i + 1] * 3, c = ind[i + 2] * 3;
      var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      var x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
      for (j = 0; j < 3; j++) { var k = ind[i + j] * 3; n[k] += x; n[k + 1] += y; n[k + 2] += z; }
    }
    for (i = 0; i < n.length; i += 3) {
      var l = Math.sqrt(n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2]);
      if (l > 0) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; } else n[i + 1] = 1;
    }
    return n;
  }
  /** 原来没带法线的图元用的材质：换成双面的（原来就双面的不动）；没有材质的按默认材质建一个，记上 d3default（认车漆时照样当默认材质） */
  function twoSided(json, base, made) {
    var tag = (base === undefined ? '-' : base) + ':2';
    if (made[tag] !== undefined) return made[tag];
    var src = base !== undefined && json.materials && json.materials[base];
    if (src && src.doubleSided) return (made[tag] = base);
    var m = src ? JSON.parse(JSON.stringify(src)) : { pbrMetallicRoughness: { metallicFactor: 0.05, roughnessFactor: 0.6 }, extras: { d3default: true } };
    m.doubleSided = true;
    json.materials = json.materials || [];
    return (made[tag] = json.materials.push(m) - 1);
  }
  function sq(x) { return x * x; }
  /** 每个网格在场景里的世界矩阵（列主序；几个节点共用一个网格时取第一个）；场景里没用到的网格没有 */
  function worlds(json) {
    var out = {}, nodes = json.nodes || [], I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    function local(n) {
      if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix;
      var t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1], x = r[0], y = r[1], z = r[2], w = r[3];
      return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
        2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
        2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1];
    }
    function mul(a, b) {
      var o = [];
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    }
    function walk(i, parent, depth) {
      var n = nodes[i];
      if (!n || depth > 64) return;
      var m = mul(parent, local(n));
      if (n.mesh !== undefined && !out[n.mesh]) out[n.mesh] = m;
      (n.children || []).forEach(function (c) { walk(c, m, depth + 1); });
    }
    var sc = (json.scenes || [])[json.scene || 0];
    (sc ? sc.nodes || [] : nodes.map(function (n, i) { return i; })).forEach(function (i) { walk(i, I, 0); });
    return out;
  }
  /** 带动画的车模：导出工具常把动画里某一帧（门窗、引擎盖、尾门都开着）存成零件的默认姿势，卡片不播动画就一直开着，
     在开着的样子上认门、算铰链都不对。每个带动画的节点单独在"现在的姿势、动画第一帧、最后一帧"里挑关着的那个，只看它自己下面的零件
     （不看整车：车模里常有一大块地板，整车外框被它撑满，门开不开都一样大）：
     · 和现在差不到 10° 的不算（车窗、天窗上下滑，整体微调几度——看不出哪头是关着，照旧）；
     · 先比最高点，最低的是关着（引擎盖、尾门、鸥翼 / 剪刀 / 蝴蝶门往上掀）；最高点差不多的（侧门、充电口盖绕竖直轴转，高度不变）
       比外框，最紧凑的是关着（关着贴着车身，开着往外支；掀背尾门关着斜躺，外框反而大，所以不能只看外框）。
     动画数据去掉（卡片用不到，gc 时不写进文件） */
  function restPose(json, views) {
    var anims = json.animations || [], nodes = json.nodes || [], keys = {}; // keys[节点] = [第一帧, 最后一帧]，每帧 { translation / rotation / scale }
    if (!anims.length) return;
    anims.forEach(function (a) {
      (a.channels || []).forEach(function (ch) {
        var t = ch.target || {}, sm = (a.samplers || [])[ch.sampler], path = t.path, n = nodes[t.node];
        if (!sm || !n || n.matrix || !/^(translation|rotation|scale)$/.test(path)) return;
        var inp = json.accessors[sm.input], out = readAcc(json, views, sm.output), k = path === 'rotation' ? 4 : 3, per = sm.interpolation === 'CUBICSPLINE' ? 3 : 1;
        if (!inp || !out || out.length < inp.count * per * k) return;
        var kk = keys[t.node] = keys[t.node] || [{}, {}];
        [0, inp.count - 1].forEach(function (key, pi) {
          var o = (key * per + (per === 3 ? 1 : 0)) * k; // 三次样条：每帧是入切线、值、出切线
          kk[pi][path] = Array.prototype.slice.call(out, o, o + k);
        });
      });
    });
    var under = function (i) { // 这个节点下面的网格
      var l = [], st = [i], seen = {};
      while (st.length) { var x = st.pop(), n = nodes[x]; if (!n || seen[x]) continue; seen[x] = 1; if (n.mesh !== undefined) l.push(n.mesh); (n.children || []).forEach(function (c) { st.push(c); }); }
      return l;
    };
    var size = function (meshes) { // 这些网格的世界外框：{ v 体积（扁的按最大一面的面积，门板、玻璃不会是 0）, top 最高点, d 最长边 }
      var W = worlds(json), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      meshes.forEach(function (mi) {
        var M = W[mi];
        if (!M) return;
        ((json.meshes[mi] || {}).primitives || []).forEach(function (p) {
          var a = p.attributes && json.accessors[p.attributes.POSITION];
          if (!a || !Array.isArray(a.min) || !Array.isArray(a.max) || a.min.length !== 3) return;
          for (var c = 0; c < 8; c++) {
            var x = c & 1 ? a.max[0] : a.min[0], y = c & 2 ? a.max[1] : a.min[1], z = c & 4 ? a.max[2] : a.min[2];
            for (var k = 0; k < 3; k++) { var v = M[k] * x + M[4 + k] * y + M[8 + k] * z + M[12 + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
          }
        });
      });
      var d = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].sort(function (x, y) { return y - x; });
      return isFinite(d[0]) ? { v: d[0] * d[1] * Math.max(d[2], d[0] * 0.01), top: hi[1], d: d[0] } : null;
    };
    var turn = function (a, b) { if (!a || !b) return 0; var dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI; };
    var pick = {};
    Object.keys(keys).forEach(function (i) {
      var n = nodes[i], ms = under(+i);
      if (!ms.length) return;
      var keep = { translation: n.translation, rotation: n.rotation, scale: n.scale }, set = function (pose) { ['translation', 'rotation', 'scale'].forEach(function (q) { var v = pose[q] !== undefined ? pose[q] : keep[q]; if (v === undefined) delete n[q]; else n[q] = v; }); };
      var b0 = size(ms), best = null, bb = b0;
      if (!b0) return;
      keys[i].forEach(function (pose) {
        if (turn(pose.rotation, keep.rotation || [0, 0, 0, 1]) < 10) return;
        set(pose);
        var b = size(ms), tol = b0.d * 0.01;
        if (b && (b.top < bb.top - tol || (Math.abs(b.top - bb.top) <= tol && b.v < bb.v * 0.99))) { bb = b; best = pose; }
      });
      set({});
      if (best) pick[i] = best;
    });
    Object.keys(pick).forEach(function (i) { Object.keys(pick[i]).forEach(function (q) { nodes[i][q] = pick[i][q]; }); });
    delete json.animations;
  }
  /** 整个场景外框的中心（世界坐标，按 POSITION 的 min / max 算） */
  function sceneCenter(json, W) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    Object.keys(W).forEach(function (mi) {
      var M = W[mi];
      ((json.meshes[mi] || {}).primitives || []).forEach(function (p) {
        var a = p.attributes && json.accessors[p.attributes.POSITION];
        if (!a || !Array.isArray(a.min) || !Array.isArray(a.max) || a.min.length !== 3) return;
        for (var c = 0; c < 8; c++) {
          var x = c & 1 ? a.max[0] : a.min[0], y = c & 2 ? a.max[1] : a.min[1], z = c & 4 ? a.max[2] : a.min[2];
          for (var k = 0; k < 3; k++) {
            var v = M[k] * x + M[4 + k] * y + M[8 + k] * z + M[12 + k];
            if (v < lo[k]) lo[k] = v;
            if (v > hi[k]) hi[k] = v;
          }
        }
      });
    });
    return lo[0] <= hi[0] ? [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] : [0, 0, 0];
  }
  /** 焊接：坐标量化到外框对角线的百万分之一，重合的顶点算一个（开放寻址哈希）→ { id: 每个顶点焊完的编号, n: 焊完几个 } */
  function weld(pos) {
    var nv = pos.length / 3, i, k;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (i = 0; i < pos.length; i++) { k = i % 3; if (pos[i] < lo[k]) lo[k] = pos[i]; if (pos[i] > hi[k]) hi[k] = pos[i]; }
    var q = 1e6 / (Math.sqrt(sq(hi[0] - lo[0]) + sq(hi[1] - lo[1]) + sq(hi[2] - lo[2])) || 1), Q = new Int32Array(pos.length);
    for (i = 0; i < pos.length; i++) Q[i] = Math.round((pos[i] - lo[i % 3]) * q);
    var size = 2;
    while (size < nv * 2) size *= 2;
    var table = new Int32Array(size).fill(-1), wid = new Int32Array(nv), nw = 0, mask = size - 1;
    for (i = 0; i < nv; i++) {
      var h = (Math.imul(Q[i * 3], 73856093) ^ Math.imul(Q[i * 3 + 1], 19349663) ^ Math.imul(Q[i * 3 + 2], 83492791)) & mask;
      for (;;) {
        var r = table[h];
        if (r < 0) { table[h] = i; wid[i] = nw++; break; }
        if (Q[r * 3] === Q[i * 3] && Q[r * 3 + 1] === Q[i * 3 + 1] && Q[r * 3 + 2] === Q[i * 3 + 2]) { wid[i] = wid[r]; break; }
        h = (h + 1) & mask;
      }
    }
    return { id: wid, n: nw };
  }
  /** 重复的三角形（三个顶点都重合）只留第一个：同向的是叠在一起的（会闪），反向的是导出时为了双面复制的背面（back = true，材质改双面画）。
     这种复制的面让每条边都被三四个三角形共用，简化器一个也减不动。没有重复返回 null */
  function dedupe(ind, w) {
    var seen = new Map(), keep = new Uint32Array(ind.length), n = 0, back = false;
    for (var t = 0; t < ind.length; t += 3) {
      var a = w[ind[t]], b = w[ind[t + 1]], c = w[ind[t + 2]], k, dir;
      if (a !== b && b !== c && a !== c) {
        // 转到最小的编号在前：同一个三角形不管从哪个角开始写都是同一个键，剩下两个的先后就是绕向
        if (a < b && a < c) { k = a + ',' + (b < c ? b + ',' + c : c + ',' + b); dir = b < c ? 1 : 2; }
        else if (b < c) { k = b + ',' + (c < a ? c + ',' + a : a + ',' + c); dir = c < a ? 1 : 2; }
        else { k = c + ',' + (a < b ? a + ',' + b : b + ',' + a); dir = a < b ? 1 : 2; }
        var o = seen.get(k);
        if (o !== undefined) { if (!(o & dir)) { back = true; seen.set(k, o | dir); } continue; }
        seen.set(k, dir);
      }
      keep[n++] = ind[t]; keep[n++] = ind[t + 1]; keep[n++] = ind[t + 2];
    }
    return n < ind.length ? { ind: keep.slice(0, n), back: back } : null;
  }
  /** 理顺三角形的绕向（直接改 ind），返回翻了几个。M：网格的世界矩阵，O：车的中心（世界坐标），w：焊接结果 */
  function orient(ind, pos, M, O, w) {
    var nv = pos.length / 3, nt = ind.length / 3, i, k, t, a, b, x, y, wid = w.id, nw = w.n;
    // 1) 焊接（见 weld）
    // 2) 边按较小的端点分桶；正好两个三角形共用的边才算相邻（边界边、三个以上共用的不跨），"两边走这条边的方向一样"就是绕向反了
    var start = new Int32Array(nw + 1), n = 0, e;
    var next = function (j) { return j % 3 === 2 ? j - 2 : j + 1; };
    for (i = 0; i < ind.length; i++) { a = wid[ind[i]]; b = wid[ind[next(i)]]; if (a !== b) { start[(a < b ? a : b) + 1]++; n++; } }
    for (i = 0; i < nw; i++) start[i + 1] += start[i];
    var at = start.slice(0, nw), eHi = new Int32Array(n), eRef = new Int32Array(n);
    for (i = 0; i < ind.length; i++) {
      a = wid[ind[i]]; b = wid[ind[next(i)]];
      if (a === b) continue;
      e = at[a < b ? a : b]++;
      eHi[e] = a < b ? b : a; eRef[e] = i * 2 + (a < b ? 1 : 0); // 第 i 个角起头的那条边 + 方向
    }
    var nb = new Int32Array(ind.length).fill(-1), rel = new Uint8Array(ind.length);
    var link = function (u, v) {
      var p1 = eRef[u] >> 1, p2 = eRef[v] >> 1;
      nb[p1] = (p2 / 3) | 0; nb[p2] = (p1 / 3) | 0;
      rel[p1] = rel[p2] = (eRef[u] & 1) === (eRef[v] & 1) ? 1 : 0;
    };
    for (i = 0; i < nw; i++) {
      var s0 = start[i], s1 = start[i + 1];
      if (s1 - s0 < 2) continue;
      if (s1 - s0 <= 16) {
        for (x = s0; x < s1; x++) {
          var m = -1, c = 0;
          for (y = s0; y < s1; y++) if (y !== x && eHi[y] === eHi[x]) { m = y; c++; }
          if (c === 1 && x < m) link(x, m);
        }
      } else { // 扇形中心那种连着很多边的顶点：排序后找
        var ord = [];
        for (x = s0; x < s1; x++) ord.push(x);
        ord.sort(function (u, v) { return eHi[u] - eHi[v]; });
        for (x = 0; x < ord.length;) {
          for (y = x; y < ord.length && eHi[ord[y]] === eHi[ord[x]];) y++;
          if (y - x === 2) link(ord[x], ord[x + 1]);
          x = y;
        }
      }
    }
    // 3) 广度优先：从每个还没走过的三角形出发，沿相邻边把绕向统一，同时分出连通块
    var comp = new Int32Array(nt).fill(-1), flip = new Uint8Array(nt), queue = new Int32Array(nt), vol = [];
    for (t = 0; t < nt; t++) {
      if (comp[t] >= 0) continue;
      var head = 0, tail = 0, id = vol.length;
      vol.push(0); comp[t] = id; queue[tail++] = t;
      while (head < tail) {
        var u = queue[head++];
        for (k = 0; k < 3; k++) {
          var w = nb[u * 3 + k];
          if (w < 0 || comp[w] >= 0) continue;
          comp[w] = id; flip[w] = flip[u] ^ rel[u * 3 + k]; queue[tail++] = w;
        }
      }
    }
    // 4) 每块的有向体积（相对车中心，世界坐标）：闭合的就是体积，开口的面片"背对车中心"为正；负的整块翻过来朝外。镜像的节点符号反过来
    var P = new Float32Array(pos.length);
    for (i = 0; i < nv; i++) for (k = 0; k < 3; k++) P[i * 3 + k] = M[k] * pos[i * 3] + M[4 + k] * pos[i * 3 + 1] + M[8 + k] * pos[i * 3 + 2] + M[12 + k] - O[k];
    for (t = 0; t < nt; t++) {
      var A = ind[t * 3] * 3, B = ind[t * 3 + 1] * 3, C = ind[t * 3 + 2] * 3;
      var d = P[A] * (P[B + 1] * P[C + 2] - P[B + 2] * P[C + 1]) - P[A + 1] * (P[B] * P[C + 2] - P[B + 2] * P[C]) + P[A + 2] * (P[B] * P[C + 1] - P[B + 1] * P[C]);
      vol[comp[t]] += flip[t] ? -d : d;
    }
    var det = M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5]), flips = 0;
    for (t = 0; t < nt; t++) {
      if (!(flip[t] ^ (vol[comp[t]] * det < 0 ? 1 : 0))) continue;
      a = ind[t * 3 + 1]; ind[t * 3 + 1] = ind[t * 3 + 2]; ind[t * 3 + 2] = a;
      flips++;
    }
    return flips;
  }
  var MAX_COLORS = 16;
  /** 按顶点色拆图元：每个三角形取顶点的颜色（三个不一样时取多数），不超过 16 种才拆；返回新的图元（各自只带用到的顶点），拆不了返回 null */
  function byColor(json, views, p, ind, nv, flat, made) {
    if (p.targets || (p.extensions && Object.keys(p.extensions).length)) return null; // 形变目标、材质变体：不拆，稳妥
    var ca = json.accessors[p.attributes.COLOR_0], ck = ca ? SIZE[ca.type] : 0, col = ck >= 3 ? readAcc(json, views, p.attributes.COLOR_0) : null, i, t;
    if (!col || col.length !== nv * ck) return null;
    var key = new Uint32Array(nv), b8 = function (v) { return Math.max(0, Math.min(255, Math.round(v * 255))) || 0; };
    for (i = 0; i < nv; i++) key[i] = ((b8(col[i * ck]) << 24) | (b8(col[i * ck + 1]) << 16) | (b8(col[i * ck + 2]) << 8) | (ck === 4 ? b8(col[i * ck + 3]) : 255)) >>> 0;
    var nt = ind.length / 3, tk = new Uint8Array(nt), keys = [], slot = {};
    for (t = 0; t < nt; t++) {
      var k1 = key[ind[t * 3 + 1]], k = k1 === key[ind[t * 3 + 2]] ? k1 : key[ind[t * 3]];
      if (slot[k] === undefined) { if (keys.length >= MAX_COLORS) return null; slot[k] = keys.length; keys.push(k); }
      tk[t] = slot[k];
    }
    var src = readAttrs(json, views, p.attributes, nv, 'COLOR_0');
    if (!src) return null;
    return keys.map(function (kk, s) {
      var tris = 0, o = 0, j;
      for (t = 0; t < nt; t++) if (tk[t] === s) tris++;
      var ci = new Uint32Array(tris * 3);
      for (t = 0; t < nt; t++) if (tk[t] === s) for (j = 0; j < 3; j++) ci[o++] = ind[t * 3 + j];
      var np = { mode: 4 }, mat = colorMat(json, p.material, kk, flat, made);
      if (mat !== undefined) np.material = mat;
      if (p.extras) np.extras = p.extras;
      subset(json, views, np, src, ci, nv);
      return np;
    });
  }
  /** 图元的各个属性读出来 { 名字: { d, k, type } }（skip 那个不要）；有读不了的（稀疏）返回 null */
  function readAttrs(json, views, attrs, nv, skip) {
    var src = {}, names = Object.keys(attrs).filter(function (n) { return n !== skip; });
    for (var i = 0; i < names.length; i++) {
      var acc = json.accessors[attrs[names[i]]], d = acc && readAcc(json, views, attrs[names[i]]);
      if (!d || d.length !== nv * SIZE[acc.type]) return null;
      src[names[i]] = { d: d, k: SIZE[acc.type], type: acc.type };
    }
    return src;
  }
  /** 图元 p 换成只带 ind（原来的顶点编号）用到的顶点：按第一次用到的顺序重排（取顶点时更连续），属性、索引都写成新的访问器 */
  function subset(json, views, p, src, ind, nv) {
    var map = new Int32Array(nv).fill(-1), used = [], ni = new Uint32Array(ind.length), i, j;
    for (i = 0; i < ind.length; i++) { var v = ind[i]; if (map[v] < 0) { map[v] = used.length; used.push(v); } ni[i] = map[v]; }
    p.attributes = {};
    Object.keys(src).forEach(function (n) {
      var x = src[n], joints = /^JOINTS_/.test(n), arr = joints ? new Uint16Array(used.length * x.k) : new Float32Array(used.length * x.k);
      for (i = 0; i < used.length; i++) for (j = 0; j < x.k; j++) arr[i * x.k + j] = x.d[used[i] * x.k + j];
      p.attributes[n] = addAcc(json, views, arr, x.type, joints ? 5123 : 5126, 34962, n === 'POSITION');
    });
    setIndex(json, views, p, ni, used.length);
  }
  /** 拆出来的那种颜色的材质：原材质的底色乘上这个颜色（原来没有材质的按默认材质，金属度、粗糙度同 car3d.js 对默认材质的处理）；有材质的白色不用另建 */
  function colorMat(json, base, key, flat, made) {
    if (key === 0xffffffff && base !== undefined) return base;
    var tag = (base === undefined ? '-' : base) + ':' + key + (flat ? ':2' : '');
    if (made[tag] !== undefined) return made[tag];
    var src = base !== undefined && json.materials && json.materials[base];
    var m = src ? JSON.parse(JSON.stringify(src)) : { pbrMetallicRoughness: { metallicFactor: 0.05, roughnessFactor: 0.6 } };
    var c = [key >>> 24, (key >>> 16) & 255, (key >>> 8) & 255, key & 255].map(function (v) { return v / 255; });
    var pb = m.pbrMetallicRoughness = m.pbrMetallicRoughness || {}, f = pb.baseColorFactor || [1, 1, 1, 1];
    pb.baseColorFactor = [f[0] * c[0], f[1] * c[1], f[2] * c[2], f[3] * (m.alphaMode && m.alphaMode !== 'OPAQUE' ? c[3] : 1)];
    m.name = '#' + c.slice(0, 3).map(function (v) { // 名字是颜色（sRGB）：认材质角色时不会被原来的名字带偏
      var g = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return ('0' + Math.round(g * 255).toString(16)).slice(-2);
    }).join('');
    if (flat) m.doubleSided = true;
    json.materials = json.materials || [];
    return (made[tag] = json.materials.push(m) - 1);
  }
  function hasExt(json, n) { return (json.extensionsUsed || []).indexOf(n) >= 0; }
  function dropExt(json, n) {
    ['extensionsUsed', 'extensionsRequired'].forEach(function (k) { if (json[k]) { json[k] = json[k].filter(function (x) { return x !== n; }); if (!json[k].length) delete json[k]; } });
  }
  function convert(src, files, step) {
    var json = src.json;
    if (hasExt(json, 'KHR_texture_basisu')) { // KTX2 贴图：带着普通贴图兜底的就只用普通的，只有 KTX2 的不支持
      var only = (json.extensionsRequired || []).indexOf('KHR_texture_basisu') >= 0 || (json.textures || []).some(function (t) { return t.source === undefined && !(t.extensions && t.extensions.EXT_texture_webp); });
      if (only) throw err('这个车模的贴图是 KTX2 / Basis 压缩格式，暂时不支持（导出时贴图选 PNG / JPEG）');
      (json.textures || []).forEach(function (t) { if (t.extensions) delete t.extensions.KHR_texture_basisu; });
      dropExt(json, 'KHR_texture_basisu');
    }
    specGloss(json);
    json.bufferViews = json.bufferViews || [];
    var bufs = (json.buffers || []).map(function (b, i) {
      var mo = b.extensions && b.extensions.EXT_meshopt_compression;
      if (mo && mo.fallback) return null; // meshopt 的占位缓冲：没有数据
      if (b.uri === undefined) return i === 0 && src.bin ? src.bin : null;
      return external(b.uri, files).bytes;
    });
    var views = json.bufferViews.map(function (v) {
      var b = bufs[v.buffer];
      return b ? b.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength) : null;
    });
    var p = Promise.resolve();
    if (hasExt(json, 'EXT_meshopt_compression')) p = p.then(function () { step('解开 meshopt 压缩', 0.05); return unmeshopt(json, bufs, views); });
    if (hasExt(json, 'KHR_draco_mesh_compression')) {
      p = p.then(function () { step('解开 Draco 压缩', 0.05); return script('draco-decoder.js', 'DracoDecoderModule'); }).then(function (F) { // Emscripten 的模块对象自己带 then：直接拿它 resolve 会死循环，包一层
        return new Promise(function (res) { F({ onModuleLoaded: function (x) { delete x.then; res({ m: x }); } }); });
      }).then(function (o) { return undraco(o.m, json, views, function (f) { step('解开 Draco 压缩', 0.05 + 0.27 * f); }); }).then(function () { dropExt(json, 'KHR_draco_mesh_compression'); });
    }
    return p.then(function () { step('整理模型', 0.33); return tick(); }).then(function () { restPose(json, views); tidy(json, views); step('压缩贴图', 0.4); return images(json, views, files, function (f) { step('压缩贴图', 0.4 + 0.15 * f); }); }).then(function () { return { json: json, views: views }; });
  }
  /** 解开 meshopt 压缩的缓冲视图：views 里换成解开的数据，扩展去掉（之后 pack 重新排进一个缓冲，占位的缓冲不要了） */
  function unmeshopt(json, bufs, views) {
    return script('meshopt-decoder.js', 'MeshoptDecoder').then(function (M) {
      return M.ready.then(function () {
        json.bufferViews.forEach(function (v, i) {
          var e = v.extensions && v.extensions.EXT_meshopt_compression;
          if (!e) return;
          var s = bufs[e.buffer].subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength), out = new Uint8Array(e.count * e.byteStride);
          M.decodeGltfBuffer(out, e.count, e.byteStride, s, e.mode, e.filter);
          views[i] = out;
          delete v.extensions.EXT_meshopt_compression;
        });
        (json.buffers || []).forEach(function (b) { if (b.extensions) delete b.extensions.EXT_meshopt_compression; });
        dropExt(json, 'EXT_meshopt_compression');
      });
    });
  }
  /** 老的高光 / 光泽度材质（three.js 已经不认）：漫反射当底色，光泽度换成粗糙度，金属度 0 */
  function specGloss(json) {
    (json.materials || []).forEach(function (m) {
      var g = m.extensions && m.extensions.KHR_materials_pbrSpecularGlossiness;
      if (!g) return;
      var pb = m.pbrMetallicRoughness;
      if (!pb || (!pb.baseColorTexture && !pb.baseColorFactor)) {
        m.pbrMetallicRoughness = { baseColorFactor: g.diffuseFactor || [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: Math.max(0.2, 1 - (g.glossinessFactor === undefined ? 1 : g.glossinessFactor)) };
        if (g.diffuseTexture) m.pbrMetallicRoughness.baseColorTexture = g.diffuseTexture;
      }
      delete m.extensions.KHR_materials_pbrSpecularGlossiness;
    });
    dropExt(json, 'KHR_materials_pbrSpecularGlossiness');
  }
  // 主线程解 Draco（照 three.js DRACOLoader 的 worker 部分改写，MIT）：解出来的数据当普通访问器写回去
  var CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  function undraco(draco, json, views, prog) {
    var DT = function (C) {
      return C === Float32Array ? draco.DT_FLOAT32 : C === Int8Array ? draco.DT_INT8 : C === Int16Array ? draco.DT_INT16 : C === Int32Array ? draco.DT_INT32
        : C === Uint8Array ? draco.DT_UINT8 : C === Uint16Array ? draco.DT_UINT16 : draco.DT_UINT32;
    };
    var packed = [];
    function setAcc(ai, arr, ct, nc) {
      var a = json.accessors[ai];
      views.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
      json.bufferViews.push({ buffer: 0, byteLength: arr.byteLength });
      a.bufferView = json.bufferViews.length - 1; a.byteOffset = 0; a.componentType = ct; a.count = arr.length / nc;
    }
    var prims = [];
    (json.meshes || []).forEach(function (mesh) { (mesh.primitives || []).forEach(function (pr) { if (pr.extensions && pr.extensions.KHR_draco_mesh_compression) prims.push(pr); }); });
    return slices(prims.length, function (k) { // 一个个零件解，中间让页面喘口气、报进度
        var pr = prims[k], e = pr.extensions.KHR_draco_mesh_compression;
        var data = views[e.bufferView], dec = new draco.Decoder(), db = new draco.DecoderBuffer(), geo = new draco.Mesh();
        db.Init(new Int8Array(data.buffer, data.byteOffset, data.byteLength), data.byteLength);
        var st = dec.DecodeBufferToMesh(db, geo);
        if (!st.ok() || geo.ptr === 0) { draco.destroy(geo); draco.destroy(dec); draco.destroy(db); throw err('Draco 解码失败：' + st.error_msg()); }
        var np = geo.num_points(), n = geo.num_faces() * 3, ptr = draco._malloc(n * 4);
        dec.GetTrianglesUInt32Array(geo, n * 4, ptr);
        var idx = new Uint32Array(draco.HEAPF32.buffer, ptr, n).slice();
        draco._free(ptr);
        if (pr.indices === undefined) pr.indices = json.accessors.push({ componentType: 5125, count: n, type: 'SCALAR' }) - 1; // 扩展里是带索引的三角形
        if (np <= 65535) setAcc(pr.indices, new Uint16Array(idx), 5123, 1); else setAcc(pr.indices, idx, 5125, 1);
        packed.push(e.bufferView);
        Object.keys(e.attributes).forEach(function (name) {
          var ai = pr.attributes[name], acc = json.accessors[ai], C = CT[acc.componentType] || Float32Array;
          var at = dec.GetAttributeByUniqueId(geo, e.attributes[name]), nc = at.num_components(), nv = np * nc, bytes = nv * C.BYTES_PER_ELEMENT, p2 = draco._malloc(bytes);
          dec.GetAttributeDataArrayForAllPoints(geo, at, DT(C), bytes, p2);
          var arr = new C(draco.HEAPF32.buffer, p2, nv).slice();
          draco._free(p2);
          setAcc(ai, arr, acc.componentType, nc);
        });
        draco.destroy(geo); draco.destroy(dec); draco.destroy(db);
        delete pr.extensions.KHR_draco_mesh_compression;
    }, prog).then(function () {
      packed.forEach(function (i) { views[i] = null; }); // 压缩数据解完了：不再存
    });
  }
  /** 贴图：外置的并进来；最长边超过 1024 的缩小重编码（有透明的、法线贴图存 PNG，别的存 JPEG） */
  function images(json, views, files, prog) {
    var normal = {}, all = (json.images || []).length;
    (json.materials || []).forEach(function (m) { if (m.normalTexture && json.textures && json.textures[m.normalTexture.index]) normal[json.textures[m.normalTexture.index].source] = 1; });
    return (json.images || []).reduce(function (p, img, i) {
      return p.then(function () {
        if (prog) prog(i / all);
        var bytes = null, mime = img.mimeType || '';
        if (img.bufferView !== undefined) bytes = views[img.bufferView];
        else if (img.uri !== undefined) { var x = external(img.uri, files); bytes = x.bytes; mime = mime || x.mime || ''; }
        if (!bytes) return;
        mime = sniff(bytes) || mime;
        if (mime === 'image/ktx2') return; // 只给 KTX2 扩展用的（扩展已经去掉）：不动
        return shrink(bytes, mime, !!normal[i]).then(null, function () { return { bytes: bytes, mime: mime }; }).then(function (r) {
          if (img.bufferView !== undefined && r.bytes === bytes) { img.mimeType = r.mime; return; }
          if (img.bufferView !== undefined) views[img.bufferView] = r.bytes;
          else { views.push(r.bytes); json.bufferViews.push({ buffer: 0, byteLength: r.bytes.length }); img.bufferView = views.length - 1; }
          img.mimeType = r.mime;
          delete img.uri;
        });
      });
    }, Promise.resolve());
  }
  function sniff(b) {
    if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
    if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
    if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
    if (b[0] === 0xAB && b[1] === 0x4B && b[2] === 0x54 && b[3] === 0x58) return 'image/ktx2';
    return '';
  }
  /** PNG / JPEG 文件头里的宽高（不用解码） */
  function imgSize(b) {
    if (b[0] === 0x89 && b[1] === 0x50 && b.length > 24) return { w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
    if (b[0] === 0xFF && b[1] === 0xD8) {
      for (var i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xFF) { i++; continue; }
        var mk = b[i + 1];
        if (mk === 0xFF || mk === 0x01 || (mk >= 0xD0 && mk <= 0xD9)) { i += mk === 0xFF ? 1 : 2; continue; }
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
        i += 2 + ((b[i + 2] << 8) | b[i + 3]);
      }
    }
    return null;
  }
  function decodeImg(blob, opt) {
    if (window.createImageBitmap) return (opt ? createImageBitmap(blob, opt).then(null, function () { return createImageBitmap(blob); }) : createImageBitmap(blob));
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(err('有一张贴图读不了')); };
      im.src = u;
    });
  }
  function toBytes(c, type, q) {
    return new Promise(function (res) { c.toBlob(function (b) { res(b); }, type, q); }).then(function (b) {
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(new Uint8Array(r.result)); }; r.onerror = rej; r.readAsArrayBuffer(b); });
    });
  }
  function shrink(bytes, mime, isNormal) {
    var sz = imgSize(bytes), k0 = sz ? Math.min(1, MAX_TEX / Math.max(sz.w, sz.h)) : 1;
    if (sz && k0 >= 1 && (mime === 'image/png' || mime === 'image/jpeg')) return Promise.resolve({ bytes: bytes, mime: mime }); // 不大：原样留着，不用解码
    var opt = sz && k0 < 1 ? { resizeWidth: Math.max(1, Math.round(sz.w * k0)), resizeHeight: Math.max(1, Math.round(sz.h * k0)), resizeQuality: 'high' } : null; // 解码时直接缩（8K 贴图不整张解出来）
    return decodeImg(new Blob([bytes], { type: mime || 'image/png' }), opt).then(function (im) {
      var w = im.width, h = im.height, k = Math.min(1, MAX_TEX / Math.max(w, h));
      if (!opt && k >= 1 && (mime === 'image/png' || mime === 'image/jpeg')) { if (im.close) im.close(); return { bytes: bytes, mime: mime }; } // 解码时缩过的一定要重新编码
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      var x = c.getContext('2d');
      x.drawImage(im, 0, 0, c.width, c.height);
      if (im.close) im.close();
      var png = isNormal || (mime !== 'image/jpeg' && alpha(x, c.width, c.height));
      return toBytes(c, png ? 'image/png' : 'image/jpeg', 0.86).then(function (b) { c.width = c.height = 0; return { bytes: b, mime: png ? 'image/png' : 'image/jpeg' }; });
    });
  }
  function alpha(x, w, h) {
    var d = x.getImageData(0, 0, w, h).data;
    for (var i = 3; i < d.length; i += 16) if (d[i] < 250) return true;
    return false;
  }
  /** 所有缓冲视图按顺序排进一个 BIN（4 字节对齐） */
  /** 没人用的数据（换下来的索引、拆掉的顶点数据……）不写进文件：没人用的访问器去掉数据（编号留着，规范允许不带数据），缓冲视图去掉后重新编号 */
  function gc(json, views) {
    var accUsed = {}, use = function (o, k) { if (o && o[k] !== undefined) accUsed[o[k]] = 1; };
    (json.meshes || []).forEach(function (m) {
      (m.primitives || []).forEach(function (p) {
        use(p, 'indices');
        Object.keys(p.attributes || {}).forEach(function (k) { use(p.attributes, k); });
        (p.targets || []).forEach(function (tg) { Object.keys(tg).forEach(function (k) { use(tg, k); }); });
      });
    });
    (json.skins || []).forEach(function (s) { use(s, 'inverseBindMatrices'); });
    (json.animations || []).forEach(function (a) { (a.samplers || []).forEach(function (s) { use(s, 'input'); use(s, 'output'); }); });
    (json.nodes || []).forEach(function (n) { var e = n.extensions && n.extensions.EXT_mesh_gpu_instancing; if (e && e.attributes) Object.keys(e.attributes).forEach(function (k) { use(e.attributes, k); }); });
    var bvUsed = {};
    (json.accessors || []).forEach(function (a, i) {
      if (!accUsed[i]) { delete a.bufferView; delete a.byteOffset; delete a.sparse; return; }
      if (a.bufferView !== undefined) bvUsed[a.bufferView] = 1;
      if (a.sparse) { bvUsed[a.sparse.indices.bufferView] = 1; bvUsed[a.sparse.values.bufferView] = 1; }
    });
    (json.images || []).forEach(function (im) { if (im.bufferView !== undefined) bvUsed[im.bufferView] = 1; });
    var re = [], keep = [], kv = [];
    json.bufferViews.forEach(function (bv, i) { if (bvUsed[i]) { re[i] = keep.length; keep.push(bv); kv.push(views[i]); } });
    var fix = function (o) { if (o && o.bufferView !== undefined) o.bufferView = re[o.bufferView]; };
    (json.accessors || []).forEach(function (a) { fix(a); if (a.sparse) { fix(a.sparse.indices); fix(a.sparse.values); } });
    (json.images || []).forEach(fix);
    json.bufferViews = keep;
    return kv;
  }
  /** 存之前量化（KHR_mesh_quantization，同默认车模 car-model.py 的存法）：法线存成 8 位，0～1 范围内的贴图坐标存成 16 位，
     顶点不超过 65535 个的索引存成 16 位——几何小三分之一左右，看不出差别，车机加载、上传显存也快。已经量化过的不动；
     原来的访问器原地改（编号不变），换下来的数据 gc 时不写进文件 */
  function quantize(json, views) {
    var done = {}, any = false;
    function put(a, arr, ct) {
      views.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
      json.bufferViews.push({ buffer: 0, byteLength: arr.byteLength, byteStride: 4, target: 34962 }); // 每个顶点 4 字节（法线 3 字节补 1 字节对齐）
      a.bufferView = json.bufferViews.length - 1; a.byteOffset = 0; a.componentType = ct; a.normalized = true;
      delete a.min; delete a.max;
      any = true;
    }
    (json.meshes || []).forEach(function (m) {
      (m.primitives || []).forEach(function (p) {
        Object.keys(p.attributes || {}).forEach(function (k) {
          var ai = p.attributes[k], a = json.accessors[ai], i, j;
          if (done[ai] || !a || a.componentType !== 5126 || a.sparse || !(k === 'NORMAL' || /^TEXCOORD_\d$/.test(k))) return;
          done[ai] = 1;
          var d = readAcc(json, views, ai);
          if (!d) return;
          if (k === 'NORMAL' && a.type === 'VEC3') {
            var q = new Int8Array(a.count * 4);
            for (i = 0; i < a.count; i++) for (j = 0; j < 3; j++) q[i * 4 + j] = Math.round(Math.max(-1, Math.min(1, d[i * 3 + j])) * 127);
            put(a, q, 5120);
          } else if (a.type === 'VEC2') {
            for (i = 0; i < d.length; i++) if (!(d[i] >= 0 && d[i] <= 1)) return; // 超出 0～1（贴图平铺）的照原样
            var u = new Uint16Array(d.length);
            for (i = 0; i < d.length; i++) u[i] = Math.round(d[i] * 65535);
            put(a, u, 5123);
          }
        });
        var ia = p.indices !== undefined && json.accessors[p.indices], pa = json.accessors[p.attributes && p.attributes.POSITION];
        if (ia && !done['i' + p.indices] && ia.componentType === 5125 && !ia.sparse && pa && pa.count <= 65535) {
          done['i' + p.indices] = 1;
          var idx = readAcc(json, views, p.indices, 1);
          if (idx) {
            var arr = new Uint16Array(idx);
            views.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
            json.bufferViews.push({ buffer: 0, byteLength: arr.byteLength, target: 34963 });
            ia.bufferView = json.bufferViews.length - 1; ia.byteOffset = 0; ia.componentType = 5123;
          }
        }
      });
    });
    if (!any) return;
    json.extensionsUsed = json.extensionsUsed || [];
    json.extensionsRequired = json.extensionsRequired || [];
    if (json.extensionsUsed.indexOf('KHR_mesh_quantization') < 0) json.extensionsUsed.push('KHR_mesh_quantization');
    if (json.extensionsRequired.indexOf('KHR_mesh_quantization') < 0) json.extensionsRequired.push('KHR_mesh_quantization');
  }
  function pack(json, views) {
    views = gc(json, views);
    var offs = [], total = 0;
    views.forEach(function (v, i) { offs[i] = total; total += a4(v ? v.byteLength : 4); });
    var bin = new Uint8Array(total);
    views.forEach(function (v, i) {
      var bv = json.bufferViews[i];
      if (v) bin.set(v, offs[i]);
      bv.buffer = 0; bv.byteOffset = offs[i]; bv.byteLength = v ? v.byteLength : 4;
      if (bv.extensions && !Object.keys(bv.extensions).length) delete bv.extensions;
    });
    json.buffers = [{ byteLength: total }];
    return { json: json, bin: bin };
  }
  var loading = {};
  function script(src, global) {
    if (window[global]) return Promise.resolve(window[global]);
    if (!loading[src]) loading[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { window[global] ? res(window[global]) : rej(err('解码器加载失败')); };
      s.onerror = function () { delete loading[src]; rej(err('解码器加载失败')); };
      document.head.appendChild(s);
    });
    return loading[src];
  }

  // ================= 导出 =================
  function download(data, name, type) {
    var u = URL.createObjectURL(new Blob([data], { type: type || 'application/octet-stream' })), a = document.createElement('a');
    a.href = u; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(u); }, 5000);
  }
  function fileName(n) { return String(n || '车模').replace(/[\\/:*?"<>|]+/g, ' ').trim() || '车模'; }
  function b64(u8) { var s = '', i; for (i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  /** 车模包：GLB 里带上配置，别人导入就是调好的（几何压缩过，见 compress） */
  function exportPack(rec, cfg, prog) { return packed(rec, cfg, prog).then(function (b) { download(b, fileName(rec.name) + '.glb', 'model/gltf-binary'); }); }
  /** car-model.js：替换卡片 zip 里的同名文件，打包出去就是默认车模（几何压缩过，建车前 inflate 解开） */
  function exportDefault(rec, cfg, prog) {
    return packed(rec, cfg, prog).then(function (b) {
      download('/* 3D 示例卡片的默认车模：' + fileName(rec.name) + '（车模包，带适配配置）。替换卡片里的 car-model.js 后重新打包。 */\nwindow.D3_CAR_GLB = \'' + b64(new Uint8Array(b)) + '\';\n', 'car-model.js', 'text/javascript');
    });
  }
  /** 导出时压缩几何（EXT_meshopt_compression，同 gltfpack 的存法）：顶点数据按属性模式、三角形索引按三角形模式编码，几何小一半左右，数据一点不变；
     贴图和别的数据原样。别人导入时（convert）、换进卡片当默认车模时（inflate）解开，解码器 25KB；编码器只在导出时加载。
     本机存的工作副本不压缩：拆零件、简化这些直接读原始数据。几种用法共用一个缓冲视图的（交错存放）、动画蒙皮的数据不压缩 */
  var SZB = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 };
  function compress(buf, prog) { // prog(0～1)：一块块压，报进度
    return script('meshopt-encoder.js', 'MeshoptEncoder').then(function (E) {
      return E.ready.then(function () {
        var g = readGLB(buf), json = g.json, bin = g.bin || new Uint8Array(0), role = [];
        if (hasExt(json, 'EXT_meshopt_compression') || !json.bufferViews || !json.bufferViews.length) return buf;
        var mark = function (ai, kind) {
          var a = json.accessors && json.accessors[ai];
          if (!a || a.bufferView === undefined || a.sparse || !SZB[a.componentType]) return;
          var es = SZB[a.componentType] * SIZE[a.type], r = role[a.bufferView];
          if (r === undefined) role[a.bufferView] = { kind: kind, es: es };
          else if (r && (r.kind !== kind || r.es !== es)) role[a.bufferView] = false;
        };
        (json.meshes || []).forEach(function (m) {
          (m.primitives || []).forEach(function (p) {
            if (p.indices !== undefined) mark(p.indices, p.mode === undefined || p.mode === 4 ? 'tri' : 'idx');
            Object.keys(p.attributes || {}).forEach(function (k) { mark(p.attributes[k], 'attr'); });
            (p.targets || []).forEach(function (t) { Object.keys(t).forEach(function (k) { mark(t[k], 'attr'); }); });
          });
        });
        (json.accessors || []).forEach(function (a) { if (a.bufferView !== undefined && role[a.bufferView] === undefined) role[a.bufferView] = false; }); // 动画、蒙皮这些：原样
        var out = [];
        return slices(json.bufferViews.length, function (i) { out.push(enc1(json.bufferViews[i], i)); }, prog).then(function () { return finish(out); });
        function enc1(bv, i) {
          var o = bv.byteOffset || 0, src = bin.subarray(o, o + bv.byteLength), r = role[i], x = { bv: bv, data: src };
          if (!r || bv.byteLength < 1024) return x; // 太小的不压：省下的没有多写的说明多
          var attr = r.kind === 'attr', st = attr ? bv.byteStride || r.es : r.es, n = bv.byteLength / st;
          if (n !== Math.floor(n) || (attr ? st % 4 || st > 256 : st !== 2 && st !== 4)) return x;
          var mode = attr ? 'ATTRIBUTES' : r.kind === 'tri' && n % 3 === 0 ? 'TRIANGLES' : 'INDICES', enc = null;
          try { enc = E.encodeGltfBuffer(src, n, st, mode); } catch (e) { enc = null; }
          if (enc && enc.length < src.length * 0.9) { x.data = enc; x.enc = { count: n, byteStride: st, mode: mode }; }
          return x;
        }
        function finish(out) {
        if (!out.some(function (x) { return x.enc; })) return buf;
        var total = 0, fb = 0;
        out.forEach(function (x) { x.o = total; total += a4(x.data.length); if (x.enc) { x.fo = fb; fb += a4(x.bv.byteLength); } });
        var nb = new Uint8Array(total);
        out.forEach(function (x) {
          var bv = x.bv;
          nb.set(x.data, x.o);
          if (!x.enc) { bv.buffer = 0; bv.byteOffset = x.o; return; }
          bv.extensions = bv.extensions || {};
          bv.extensions.EXT_meshopt_compression = { buffer: 0, byteOffset: x.o, byteLength: x.data.length, byteStride: x.enc.byteStride, count: x.enc.count, mode: x.enc.mode };
          bv.buffer = 1; bv.byteOffset = x.fo; // 占位缓冲里的位置（解开后的大小还是 byteLength）
          if (x.enc.mode === 'ATTRIBUTES') bv.byteStride = x.enc.byteStride;
        });
        json.buffers = [{ byteLength: total }, { byteLength: fb, extensions: { EXT_meshopt_compression: { fallback: true } } }];
        json.extensionsUsed = json.extensionsUsed || []; json.extensionsRequired = json.extensionsRequired || [];
        if (json.extensionsUsed.indexOf('EXT_meshopt_compression') < 0) json.extensionsUsed.push('EXT_meshopt_compression');
        if (json.extensionsRequired.indexOf('EXT_meshopt_compression') < 0) json.extensionsRequired.push('EXT_meshopt_compression');
        var z = writeGLB(json, nb);
        return z.byteLength < buf.byteLength * 0.95 ? z : buf; // 省不到 5%（几何很少的小车模）：原样
        }
      });
    });
  }
  /** 压缩过的车模（导出的 car-model.js 换进卡片当默认车模）：建车前解开成普通 GLB，拆零件这些按原始数据读的才对；解开过的记住，不重复解 */
  var inflated = typeof WeakMap === 'function' ? new WeakMap() : null;
  function inflate(buf) {
    var g;
    try { g = readGLB(buf); } catch (e) { return Promise.resolve(buf); }
    if (!hasExt(g.json, 'EXT_meshopt_compression')) return Promise.resolve(buf);
    if (inflated && inflated.has(buf)) return Promise.resolve(inflated.get(buf));
    var json = g.json, bin = g.bin || new Uint8Array(0);
    var bufs = (json.buffers || []).map(function (b, i) { var mo = b.extensions && b.extensions.EXT_meshopt_compression; return mo && mo.fallback ? null : i === 0 ? bin : null; });
    var views = (json.bufferViews || []).map(function (v) { var b = bufs[v.buffer]; return b ? b.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength) : null; });
    return unmeshopt(json, bufs, views).then(function () { var pk = pack(json, views), o = writeGLB(pk.json, pk.bin); if (inflated) inflated.set(buf, o); return o; });
  }
  function packCfg(rec, cfg) { var c = JSON.parse(JSON.stringify(cfg)); c.name = rec.name; c.credit = rec.credit; return c; }
  /** 导出用的 GLB：贴纸图片并进去、配置写进去、几何压缩 */
  function packed(rec, cfg, prog) { return withWraps(rec.buf, packCfg(rec, cfg)).then(function (x) { return compress(withConfig(x.buf, x.cfg), prog); }); }
  /** 贴纸图片并进 GLB：本地库里的（h:哈希）、车模里原有的（数字）都作为不被材质引用的图片（extras.d3wrap）放进去，配置里改成图片编号；
     用导入的字体写的文字先画成 PNG 一起放进去（别人没有这个字体）。以前放进去、已经不用的贴纸图片去掉。没有贴纸原样返回 */
  function withWraps(buf, cfg) {
    var ws = cfg.wraps || [], g = readGLB(buf), json = g.json, bin = g.bin || new Uint8Array(0);
    var hasOld = (json.images || []).some(function (im) { return im.extras && im.extras.d3wrap; });
    if (!ws.length && !hasOld) return Promise.resolve({ buf: buf, cfg: cfg });
    json.bufferViews = json.bufferViews || [];
    var views = json.bufferViews.map(function (v) { return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); });
    var old = function (i) { var im = (json.images || [])[i]; return im && im.bufferView !== undefined ? { bytes: views[im.bufferView], mime: im.mimeType || 'image/png' } : null; };
    var bytes = function (blob) { return blob ? new Promise(function (res) { var r = new FileReader(); r.onload = function () { res({ bytes: new Uint8Array(r.result), mime: blob.type || 'image/png' }); }; r.onerror = function () { res(null); }; r.readAsArrayBuffer(blob); }) : null; };
    return Promise.all(ws.map(function (w) {
      var img = w.kind !== 'img' ? null : typeof w.img === 'number' ? old(w.img) : wrapImg(w.img, buf).then(bytes);
      var ras = null;
      if (w.kind === 'text' && /^u:/.test(w.font || '')) ras = window.D3Wrap ? D3Wrap.raster(w).then(function (b) { return b || (typeof w.raster === 'number' ? old(w.raster) : null); }) : typeof w.raster === 'number' ? old(w.raster) : null;
      return Promise.all([img, ras]);
    })).then(function (got) {
      var keep = [], re = {};
      (json.images || []).forEach(function (im, i) {
        var used = (json.textures || []).some(function (t) { return t.source === i || Object.keys(t.extensions || {}).some(function (k) { return t.extensions[k] && t.extensions[k].source === i; }); });
        if (im.extras && im.extras.d3wrap && !used) return;
        re[i] = keep.length; keep.push(im);
      });
      (json.textures || []).forEach(function (t) {
        if (t.source !== undefined) t.source = re[t.source];
        Object.keys(t.extensions || {}).forEach(function (k) { var e = t.extensions[k]; if (e && e.source !== undefined) e.source = re[e.source]; });
      });
      json.images = keep;
      var seen = {}, add = function (x) {
        var k = hash(x.bytes);
        if (seen[k] === undefined) { views.push(x.bytes); json.bufferViews.push({ buffer: 0, byteLength: x.bytes.length }); seen[k] = json.images.push({ bufferView: views.length - 1, mimeType: x.mime, extras: { d3wrap: 1 } }) - 1; }
        return seen[k];
      };
      var c = JSON.parse(JSON.stringify(cfg));
      c.wraps = ws.map(function (w, i) {
        var y = JSON.parse(JSON.stringify(w)), r = got[i];
        if (w.kind === 'img') { if (!r[0]) return null; y.img = add(r[0]); }
        if (r[1]) y.raster = add(r[1]); else delete y.raster;
        return y;
      }).filter(Boolean);
      if (!c.wraps.length) delete c.wraps;
      if (!json.images.length) delete json.images;
      var pk = pack(json, views);
      return { buf: writeGLB(pk.json, pk.bin), cfg: c };
    });
  }

  // ================= 背景图片 =================
  function bgGet() { return get('bg').then(function (b) { return b || null; }, function () { return null; }); }
  function bgSet(file) {
    return readFile(file).then(function (f) {
      var mime = sniff(new Uint8Array(f.buf));
      if (!/^image\//.test(mime)) throw err('只支持 JPG / PNG / WebP 图片');
      return decodeImg(new Blob([f.buf], { type: mime }));
    }).then(function (im) {
      var k = Math.min(1, MAX_BG / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      if (im.close) im.close();
      return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.86); });
    }).then(function (blob) { return put('bg', blob).then(function () { return blob; }); });
  }
  function bgClear() { return del('bg'); }

  // ================= 编号、按配置找网格 / 材质 =================
  function mats(o) { return Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; }
  /** 解析完马上编号：网格、材质按遍历顺序（同一个 GLB 每次都一样）；模型自带的灯和相机拿掉 */
  function ids(model, parser) {
    var meshes = [], list = [], drop = [], assoc = parser && parser.associations;
    model.traverse(function (o) {
      if (o.isLight || o.isCamera) { drop.push(o); return; }
      if (!o.isMesh) return;
      o.userData.mid = meshes.length;
      var a = assoc && assoc.get(o);
      if (a && a.meshes !== undefined) o.userData.gl = { mesh: a.meshes, prim: a.primitives || 0 }; // 来自 GLB 的哪个网格、哪个图元（圈出来拆零件时改 GLB 用）
      meshes.push(o);
      o.userData.mats = mats(o).map(function (m) {
        if (m.userData.matId === undefined) { m.userData.matId = list.length; list.push(m); if ((assoc && !assoc.get(m)) || m.userData.d3default) m.userData.gltfDefault = true; }
        return m.userData.matId;
      });
    });
    drop.forEach(function (o) { if (o.parent) o.parent.remove(o); });
    // 车模自己的节点层级（建车时门、车轮会被挂到铰链上，层级就变了）：编辑器里"从列表选"用。每个节点带它下面全部网格的编号，没有网格的不要
    function walk(o, key) {
      var n = { name: o.name || '', key: key, mid: o.isMesh ? o.userData.mid : -1, mids: o.isMesh ? [o.userData.mid] : [], kids: [], carved: !!o.userData.d3carved };
      o.children.forEach(function (c, i) { var k = walk(c, key + '/' + i); if (k.mids.length) { n.kids.push(k); n.mids = n.mids.concat(k.mids); } });
      return n;
    }
    model.userData.d3 = { meshes: meshes, mats: list, tree: walk(model, '') };
    return model.userData.d3;
  }
  /** 配置里的引用 → 网格：数字是编号，字符串是名字的正则（内置配置用） */
  function meshRefs(d, refs) {
    var out = [];
    (refs || []).forEach(function (r) {
      if (typeof r === 'number') { if (d.meshes[r] && out.indexOf(d.meshes[r]) < 0) out.push(d.meshes[r]); }
      else if (typeof r === 'string') { var re = new RegExp(r); d.meshes.forEach(function (m) { if (re.test(m.name) && out.indexOf(m) < 0) out.push(m); }); }
    });
    return out;
  }
  function matRefs(d, refs) {
    var out = [];
    (refs || []).forEach(function (r) {
      if (typeof r === 'number') { if (d.mats[r] && out.indexOf(d.mats[r]) < 0) out.push(d.mats[r]); }
      else if (typeof r === 'string') d.mats.forEach(function (m) { if (m.name === r && out.indexOf(m) < 0) out.push(m); });
    });
    return out;
  }

  // ================= 自动识别 =================
  /** 名字整理成一个个"词"：驼峰、数字、符号处断开，全小写，中文单独成段（black_matt → "black matt"，CarPaint → "car paint"，DoorFL2 → "door fl 2"）。
      认名字一律按词，不按字母串：black 里的 lack、Trim 里的 rim、window_frame 里的 window、indoor 里的 door 都不会误认 */
  function norm(s) {
    return String(s || '').replace(/([a-z\u00df-\u00ff])([A-Z\u00c0-\u00de])/g, '$1 $2').replace(/([A-Z\u00c0-\u00de])([A-Z\u00c0-\u00de][a-z\u00df-\u00ff])/g, '$1 $2')
      .replace(/(\d+)/g, ' $1 ').replace(/([\u3400-\u9fff]+)/g, ' $1 ').toLowerCase().replace(/[^a-z0-9\u00df-\u00ff\u3400-\u9fff]+/g, ' ').trim();
  }
  // 颜色词前面的 light 是"浅"（LightBlue、Light_Grey），不是灯
  var HUES = ['red', 'blue', 'green', 'grey', 'gray', 'yellow', 'orange', 'white', 'black', 'silver', 'gold', 'brown', 'purple', 'pink', 'beige', 'cyan', 'violet', 'bronze', 'color', 'colour'];
  function words(s) {
    var t = norm(s).split(' ').filter(Boolean);
    for (var i = 0; i < t.length; i++) {
      if (t[i] === 'light' && HUES.indexOf(t[i + 1]) >= 0) t[i] = 'pale';
      else if (t[i].slice(0, 5) === 'light' && HUES.indexOf(t[i].slice(5)) >= 0) t[i] = t[i].slice(5);
    }
    return t;
  }
  /** 有没有 d 里的词：整词相同；相邻两个词拼起来相同（Head_Light → headlight）；5 个字母以上的词也认作词头 / 词尾（carpaint、windschutzscheibe）；中文按包含 */
  function hasW(t, d) {
    var i, j, x, w;
    if (d.zh) { var z = t.join(''); for (j = 0; j < d.zh.length; j++) if (z.indexOf(d.zh[j]) >= 0) return true; }
    for (i = 0; i < t.length; i++) {
      x = t[i];
      if (d.w.indexOf(x) >= 0 || (i + 1 < t.length && d.w.indexOf(x + t[i + 1]) >= 0)) return true;
      for (j = 0; j < d.w.length; j++) { w = d.w[j]; if (w.length >= 5 && x.length > w.length && (x.slice(0, w.length) === w || x.slice(-w.length) === w)) return true; }
    }
    return false;
  }
  function wl(a, zh) { return { w: a, zh: zh || [] }; }
  function join() { var o = { w: [], zh: [] }; for (var i = 0; i < arguments.length; i++) { o.w = o.w.concat(arguments[i].w); o.zh = o.zh.concat(arguments[i].zh); } return o; }
  /** 按名字认材质（中英德法意西常见写法） */
  var NAME = {
    // 车漆：认出来就算（颜色词不影响：Paint_Black 是黑车的漆）
    paint: wl(['paint', 'paints', 'painted', 'paintwork', 'carpaint', 'bodypaint', 'lack', 'autolack', 'lackierung', 'karosserie', 'carrosserie', 'carroceria', 'carrozzeria',
      'peinture', 'pintura', 'vernice', 'bodycolor', 'bodycolour', 'bodycol', 'carcolor', 'carcolour', 'bodymain', 'mainbody', 'bodyshell', 'bodywork'], ['车漆', '漆面', '车身漆', '车身颜色', '车身色']),
    // 只说是车身外面（不一定是漆）：再看颜色，带黑、哑光的多半是饰条
    body: wl(['body', 'carbody', 'exterior', 'ext', 'shell', 'outer'], ['车身', '车壳', '外壳', '外观', '钣金']),
    glass: wl(['glass', 'glas', 'glasses', 'window', 'windows', 'windshield', 'windscreen', 'scheibe', 'vidro', 'vetro', 'verre', 'vitre', 'vitres', 'vidrio'], ['玻璃', '车窗', '挡风', '风挡']),
    rim: wl(['rim', 'rims', 'alloy', 'alloys', 'felge', 'felgen', 'jante', 'jantes', 'cerchio', 'cerchi', 'hubcap', 'hubcaps'], ['轮毂', '轮圈', '钢圈', '轮辋', '铝圈']),
    caliper: wl(['caliper', 'calipers', 'calliper', 'callipers', 'bremssattel', 'etrier', 'pinza'], ['卡钳', '制动钳', '刹车钳']),
    tire: wl(['tire', 'tires', 'tyre', 'tyres', 'reifen', 'pneu', 'pneus', 'gomme', 'neumatico', 'rubber'], ['轮胎', '车胎', '胎']),
    // 灯（不自动认，名字像灯的材质原样留着，不当车漆、玻璃）
    lamp: wl(['light', 'lights', 'lamp', 'lamps', 'headlight', 'headlights', 'headlamp', 'headlamps', 'taillight', 'taillights', 'taillamp', 'taillamps', 'rearlight', 'brakelight', 'stoplight',
      'foglight', 'foglamp', 'indicator', 'indicators', 'blinker', 'blinkers', 'signal', 'drl', 'led', 'leds', 'lens', 'lenses', 'reflector', 'scheinwerfer', 'rueckleuchte', 'rückleuchte',
      'heckleuchte', 'phare', 'phares', 'feu', 'feux', 'faro', 'fari', 'luce', 'luci'], ['灯', '透镜'])
  };
  /** 否决词：名字里有这些的不当这一项 */
  var NOT = {
    paint: join(wl(['interior', 'inner', 'inside', 'int', 'seat', 'seats', 'dash', 'dashboard', 'console', 'trim', 'trims', 'chrome', 'chromed', 'chromium', 'plastic', 'plastics', 'plast',
      'carbon', 'grill', 'grille', 'logo', 'logos', 'badge', 'badges', 'emblem', 'decal', 'decals', 'sticker', 'stickers', 'label', 'text', 'plate', 'license', 'licence', 'under', 'underbody',
      'bottom', 'chassis', 'exhaust', 'wheel', 'wheels', 'brake', 'disc', 'disk', 'rotor', 'seal', 'gasket', 'wiper', 'wipers', 'leather', 'fabric', 'cloth', 'carpet', 'wood', 'steering',
      'pedal', 'belt', 'fiberglass', 'fibreglass'],
      ['内', '座', '饰', '镀铬', '电镀', '橡胶', '塑料', '碳', '格栅', '中网', '标', '牌', '底盘', '车底', '排气', '把手', '雨刮', '密封', '皮', '方向盘', '仪表', '钢琴']),
      NAME.glass, NAME.lamp, NAME.tire, NAME.rim, NAME.caliper),
    body: wl(['black', 'blk', 'matt', 'matte', 'dark'], ['黑', '哑光', '亚光']), // 只对"车身外面"那种：再加这些
    glass: join(wl(['frame', 'frames', 'trim', 'trims', 'seal', 'seals', 'gasket', 'chrome', 'surround', 'moulding', 'molding', 'mould', 'mold', 'wiper', 'wipers', 'handle', 'rail', 'pillar',
      'sill', 'windowsill', 'regulator', 'motor', 'switch', 'button', 'plastic', 'paint', 'fiberglass', 'fibreglass'], ['框', '饰', '胶', '密封', '雨刮', '把手', '镀铬', '电镀', '漆', '塑料', '导轨']),
      NAME.lamp, NAME.tire),
    rim: join(NAME.lamp, NAME.glass),
    caliper: join(wl(['disc', 'disk', 'rotor']), NAME.lamp),
    tire: wl([]), lamp: wl([])
  };
  // 名字像金属的（金属度靠不住的车模里留着金属）；不可能是金属的（满金属就说明这台车的金属度靠不住）
  var METAL = wl(['chrome', 'chromed', 'chromium', 'metal', 'alu', 'aluminium', 'aluminum', 'steel', 'iron', 'silver', 'gold', 'bronze', 'copper', 'brass', 'titanium', 'nickel',
    'rim', 'rims', 'alloy', 'alloys', 'felge', 'felgen', 'jante', 'exhaust'], ['镀铬', '电镀', '铬', '金属', '铝', '钢', '银', '铜', '钛', '轮毂', '排气']);
  var NONMETAL = join(wl(['interior', 'inner', 'inside', 'seat', 'seats', 'leather', 'fabric', 'cloth', 'carpet', 'plastic', 'plastics', 'rubber', 'matt', 'matte', 'dash', 'dashboard', 'wood'],
    ['内饰', '座', '塑料', '橡胶', '皮', '布', '地毯', '哑光', '亚光']), NAME.glass, NAME.tire);
  /** 金属度靠不住的车模：导出工具没写金属度（glTF 规定默认是 1）、FBX 转过来"反射"变成了金属度——整台车连玻璃、轮胎、内饰都是满金属，
      在影棚环境光下整台车像镀了铬，亮面的接缝反射成一条条白线。看得出来（不可能是金属的有两个以上是满金属，或者七成以上的材质都是满金属）时，
      满金属又没有金属度贴图的：不可能是金属的（玻璃、透明的、轮胎、内饰、塑料、哑光……）当不是金属；名字像金属的（镀铬、铝、钢、银、轮毂……）和 keep 里的不动；
      别的（车身多半在这里）也当不是金属：底色就是它的颜色（导入的车模按 model-viewer 的打光画，底色多少画出来就差不多是多少，见 car3d.js 的 std）。
      返回改了几个 */
  function metalFix(d, keep) {
    var list = d.mats.filter(function (m) { return m && m.metalness !== undefined && !m.userData.gltfDefault; });
    var full = list.filter(function (m) { return m.metalness >= 0.99 && !m.metalnessMap; });
    var non = function (m) { return m.opacity < 0.95 || m.transmission > 0 || hasW(words(m.name), NONMETAL); }, bad = full.filter(non);
    if (!(bad.length >= 2 || (list.length >= 4 && full.length >= 0.7 * list.length))) return 0;
    var n = 0;
    full.forEach(function (m) {
      if ((keep || []).indexOf(m) >= 0 || (!non(m) && hasW(words(m.name), METAL) && !paintName(m.name))) return;
      m.metalness = 0;
      n++;
    });
    // 同一类转换来的车模高光也常是翻倍的（Blender 的 specularColorFactor 2）：黑塑料、轮胎发灰，压回 1
    list.forEach(function (m) { if (m.specularColor && m.metalness < 0.99) { var c = m.specularColor, k = Math.max(c.r, c.g, c.b); if (k > 1) c.multiplyScalar(1 / k); } });
    return n;
  }
  /** 双面材质的网格：三角形的绕向理顺到和它自己的法线一致。有的车模镜像出来的那一半绕向是反的、法线却是对的（宋 Pro 车身每块面板四到八成），
      双面画的时候 three 按绕向判断正反面、把"背面"的法线翻过来用，那一半就像从里往外打光：发灰发亮、换了车漆颜色也是另一种颜色。
      绕向本来就和法线一致的什么都不变（单面材质不动：绕向反了的面从外面看本来就被剔掉）。返回翻了几个三角形 */
  function wind(g) {
    var p = g.attributes.position, n = g.attributes.normal;
    if (!p || !n || g.userData.wound) return 0;
    g.userData.wound = 1;
    var ix = g.index, cnt = ix ? ix.count : p.count, flips = [], v = [0, 0, 0];
    for (var i = 0; i + 2 < cnt; i += 3) {
      for (var k = 0; k < 3; k++) v[k] = ix ? ix.getX(i + k) : i + k;
      var ax = p.getX(v[0]), ay = p.getY(v[0]), az = p.getZ(v[0]);
      var ux = p.getX(v[1]) - ax, uy = p.getY(v[1]) - ay, uz = p.getZ(v[1]) - az, wx = p.getX(v[2]) - ax, wy = p.getY(v[2]) - ay, wz = p.getZ(v[2]) - az;
      var nx = n.getX(v[0]) + n.getX(v[1]) + n.getX(v[2]), ny = n.getY(v[0]) + n.getY(v[1]) + n.getY(v[2]), nz = n.getZ(v[0]) + n.getZ(v[1]) + n.getZ(v[2]);
      if ((uy * wz - uz * wy) * nx + (uz * wx - ux * wz) * ny + (ux * wy - uy * wx) * nz < 0) flips.push(i);
    }
    if (!flips.length) return 0;
    if (!ix) { // 没有索引的：补一个（顶点顺序不变），翻的时候只换索引
      var A = cnt > 65535 ? new Uint32Array(cnt) : new Uint16Array(cnt);
      for (var j = 0; j < cnt; j++) A[j] = j;
      g.setIndex(new T.BufferAttribute(A, 1));
      ix = g.index;
    }
    flips.forEach(function (i) { var s = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, s); });
    ix.needsUpdate = true;
    return flips.length;
  }
  /** 名字是不是这一项（带否决词） */
  function nameIs(k, s) { var t = words(s); return hasW(t, NAME[k]) && !hasW(t, NOT[k]); }
  /** 名字像车漆吗：2 明说是漆，1 只说是车身外面，0 不是（有否决词的也是 0） */
  function paintName(s) {
    var t = words(s);
    if (hasW(t, NOT.paint)) return 0;
    if (hasW(t, NAME.paint)) return 2;
    return hasW(t, NAME.body) && !hasW(t, NOT.body) ? 1 : 0;
  }
  /** 按名字认部件（名字先整理成词再比，见 norm） */
  var RX = {
    floor: /ground|floor|shadow|backdrop|stage|platform|turntable|plane|地面|地板|阴影|展台|底座/,
    head: /head ?(light|lamp)|front ?(light|lamp)|scheinwerfer|大灯|前灯|头灯/,
    tail: /tail ?(light|lamp)|rear ?(light|lamp)|brake ?(light|lamp)|stop ?(light|lamp)|r(ue|ü)ckleuchte|尾灯|后灯|刹车灯/,
    wheel: /wheel|tire|tyre|(?<![a-z])rims?(?![a-z])|felge|reifen|roue|rueda|车轮|轮胎|轮毂|轮子|轮圈/,
    notWheel: /steer|lenk|volant|arch|well|house|haus|liner|spare|cover|fender|方向盘|轮眉|轮拱|备胎|挡泥/,
    door: /(?<!in|out)door|t(ü|ue)r(?![a-z])|porte|puerta|portiera|车门|[前后左右主副]门|门板/,
    notDoor: /handle|mirror|seal|frame|pillar|把手|门把|拉手|门槛|门框|密封|后视镜/,
    hood: /hood|bonnet|motorhaube|capot|cofano|engine ?(cover|lid)|引擎盖|机盖|发动机盖|前舱盖|机舱盖/,
    trunk: /trunk|boot ?lid|tailgate|(?<![a-z])hatch(?![a-z])|kofferraum|liftgate|deck ?lid|bagagliaio|coffre|后备箱|后备厢|行李箱|尾门|后盖|后舱盖/, // Hatchback_Body 不算
    front: /(?<![a-z])(front|head|vorne|avant|fl|fr)(?![a-z])|前/, rear: /(?<![a-z])(rear|back|tail|hinten|rl|rr|bl|br)(?![a-z])|后(?!视)|尾/,
    sunroof: /sun ?roof|moon ?roof|schiebedach|toit ?ouvrant|天窗(?!帘)/,
    sunshade: /sun ?(shade|blind)|(?<![a-z])rollo|遮阳帘|天窗帘/,
    charge: /charg(e|ing) ?(port|flap|lid|door|cover|socket)|ladeklappe|充电口|充电盖|充电门/
  };
  /** 网格连同上面各层节点的名字（整理过的）；skip：整个车模外面套的那几层（下面有一半以上的网格），名字是整台车的，不算 */
  function chain(o, top, skip) { var s = []; for (var p = o; p && p !== top; p = p.parent) if (p.name && !(p !== o && skip && skip[p.uuid])) s.push(norm(p.name)); return s.join(' '); }
  function box(o) {
    var g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!o.isInstancedMesh) return g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    var b = new T.Box3(), m = new T.Matrix4();
    for (var i = 0; i < o.count; i++) { o.getMatrixAt(i, m); b.union(g.boundingBox.clone().applyMatrix4(m.premultiply(o.matrixWorld))); }
    return b;
  }
  function unite(list) { var b = new T.Box3(); list.forEach(function (x) { b.union(x.box); }); return b; }
  function size(b) { return b.getSize(new T.Vector3()); }
  function center(b) { return b.getCenter(new T.Vector3()); }
  /** 抽样顶点（世界坐标），最多大约 n 个 */
  function sample(list, n) {
    var total = 0, pts = [], v = new T.Vector3();
    list.forEach(function (o) { total += o.m.geometry.attributes.position.count; });
    var step = Math.max(1, Math.floor(total / n));
    list.forEach(function (o) {
      var p = o.m.geometry.attributes.position;
      for (var i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(o.m.matrixWorld); pts.push(v.x, v.y, v.z); }
    });
    return pts;
  }
  /** 倒扣着吗：最上面 15% 那一层（车顶）的水平长度应该比最下面那一层（轮子、底盘）短得多 */
  function upsideDown(list) {
    var p = sample(list, 30000), lo = Infinity, hi = -Infinity, i;
    for (i = 1; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
    var band = (hi - lo) * 0.15, t = [Infinity, -Infinity, Infinity, -Infinity], b = [Infinity, -Infinity, Infinity, -Infinity];
    for (i = 0; i < p.length; i += 3) {
      var r = p[i + 1] > hi - band ? t : p[i + 1] < lo + band ? b : null;
      if (!r) continue;
      r[0] = Math.min(r[0], p[i]); r[1] = Math.max(r[1], p[i]); r[2] = Math.min(r[2], p[i + 2]); r[3] = Math.max(r[3], p[i + 2]);
    }
    var ext = function (r) { return r[0] > r[1] ? 0 : Math.max(r[1] - r[0], r[3] - r[2]); };
    return ext(t) > ext(b) * 1.15;
  }
  /** 车头在哪头：两头各取车长 15% 那一段，最高点矮的那头是车头；+z 那头矮返回 1，-z 那头矮返回 -1，差不多（不到车高 5%）返回 0 */
  function frontLow(list) {
    var p = sample(list, 30000), z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity, i;
    for (i = 0; i < p.length; i += 3) { z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    var band = (z1 - z0) * 0.15, hp = -Infinity, hm = -Infinity;
    for (i = 0; i < p.length; i += 3) {
      if (p[i + 2] > z1 - band) hp = Math.max(hp, p[i + 1]);
      else if (p[i + 2] < z0 + band) hm = Math.max(hm, p[i + 1]);
    }
    var d = hm - hp;
    return Math.abs(d) < (y1 - y0) * 0.05 ? 0 : d > 0 ? 1 : -1;
  }
  /** 没有配置的车模：猜一份配置（只认得出来的写，认不出的留空，编辑器里再补；车漆、灯不认） */
  function auto(model, renderer) {
    // 玻璃默认保留车模原来的（同参考项目：导入的车模材质原样用；调整车模的玻璃页能换成深色玻璃）
    var d = model.userData.d3 || ids(model), cfg = { v: 1, rotX: 0, rotY: 0, rotZ: 0, hide: [], mats: {}, parts: {}, keepGlass: true };
    function pose(s) { model.position.set(0, 0, 0); model.rotation.set(cfg.rotX * DEG, cfg.rotY * DEG, cfg.rotZ * DEG, 'YXZ'); model.scale.setScalar(s || 1); model.updateMatrixWorld(true); }
    var under = {}, wrap = {}; // 每个节点下面有几个网格；下面有一半以上网格的节点（套在整个车模外面的）名字不算——叫 Glass_Car_Demo 的根节点不能把每个材质都认成玻璃
    d.meshes.forEach(function (m) { for (var p = m.parent; p && p !== model; p = p.parent) under[p.uuid] = (under[p.uuid] || 0) + 1; });
    Object.keys(under).forEach(function (k) { if (d.meshes.length > 2 && under[k] > d.meshes.length / 2) wrap[k] = 1; });
    function measure() { return d.meshes.map(function (m) { return { m: m, box: box(m), names: chain(m, model, wrap) }; }); }
    function shown(list) { return list.filter(function (o) { return cfg.hide.indexOf(o.m.userData.mid) < 0; }); }
    pose();
    var info = measure(), as = size(unite(info));
    // 1) 竖直方向：glTF 规定 y 朝上，可有的模型按 z（或 x）朝上导出，车躺着——车高应该是三个方向里最小的，明显不是就竖过来
    if (as.y >= Math.max(as.x, as.z) || as.y > 1.2 * Math.min(as.x, as.z)) { if (as.z <= as.x) cfg.rotX = 270; else cfg.rotZ = 90; }
    pose(); info = measure();
    // 2) 地板、阴影片：很薄、贴在最底下（倒扣的模型在最上面）、比车身大（或者名字像地板）
    var thick = info.filter(function (o) { var s = size(o.box); return s.y > 0.01 * Math.max(s.x, s.z); }), body = unite(thick.length ? thick : info), bs = size(body);
    info.forEach(function (o) {
      var s = size(o.box), flat = s.y <= 0.01 * Math.max(s.x, s.z), edge = o.box.min.y <= body.min.y + 0.03 * bs.y || o.box.max.y >= body.max.y - 0.03 * bs.y;
      if (flat && edge && (s.x * s.z > 0.9 * bs.x * bs.z || RX.floor.test(o.names))) cfg.hide.push(o.m.userData.mid);
    });
    if (shown(info).length && upsideDown(shown(info))) { cfg.rotX = (cfg.rotX + 180) % 360; pose(); info = measure(); } // 倒扣着：翻过来
    // 2b) 展台、桌子、底座、转台（有厚度，不是平面）：按某个高度能把零件干净地分成上下两拨（没有跨过这个高度的），
    //     下面那拨的占地盖得住上面那拨、还明显更大，而且面数没有上面多（车比垫着的东西细）——下面那拨是车底下垫着的东西，藏掉（盖着布的桌子、几层的底座都算）。
    //     要求面数是为了不误伤：车顶和玻璃单独一个网格时，按腰线也能分成上下两拨，但下面（车身、轮子、内饰）比上面细得多
    (function () {
      var vis0 = shown(info);
      if (vis0.length < 2) return;
      var all0 = unite(vis0), H0 = size(all0).y, tol = 0.02 * H0, best = null;
      var tris = function (l) { return l.reduce(function (n, o) { var g = o.m.geometry; return n + (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.m.isInstancedMesh ? o.m.count : 1); }, 0); };
      vis0.forEach(function (c) {
        var h = c.box.max.y, below = [], above = [];
        for (var i = 0; i < vis0.length; i++) {
          var o = vis0[i];
          if (o.box.max.y <= h + tol) below.push(o); else if (o.box.min.y >= h - tol) above.push(o); else return; // 有跨过去的：不是这个高度
        }
        if (!below.length || !above.length) return;
        var bb = unite(below), ab = unite(above), bs = size(bb), as0 = size(ab), m = 0.02 * Math.max(as0.x, as0.z);
        var covers = bb.min.x <= ab.min.x + m && bb.max.x >= ab.max.x - m && bb.min.z <= ab.min.z + m && bb.max.z >= ab.max.z - m;
        if (covers && bs.x * bs.z >= 1.2 * as0.x * as0.z && as0.y >= 0.25 * H0 && tris(above) >= tris(below) && (!best || h > best.h)) best = { h: h, below: below }; // 几层都满足时取最高那层
      });
      if (best) best.below.forEach(function (o) { cfg.hide.push(o.m.userData.mid); });
    })();
    // 3) 车头方向：最长的水平方向当车长；车头按名字猜（前灯、前轮那头在 +z）
    as = size(unite(shown(info)));
    if (as.x > as.z * 1.15) { cfg.rotY = 90; pose(); info = measure(); }
    var fz = [], rz = [];
    shown(info).forEach(function (o) {
      var n = o.names + ' ' + mats(o.m).map(function (m) { return norm(m.name); }).join(' '), z = center(o.box).z;
      if (RX.head.test(n) || RX.front.test(n)) fz.push(z);
      if (RX.tail.test(n) || RX.rear.test(n)) rz.push(z);
    });
    var mean = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
    if (fz.length && rz.length) { if (mean(fz) < mean(rz)) { cfg.rotY = (cfg.rotY + 180) % 360; pose(); info = measure(); } }
    else if (frontLow(shown(info)) < 0) { cfg.rotY = (cfg.rotY + 180) % 360; pose(); info = measure(); } // 名字认不出：车头那头比车尾矮（引擎盖低、尾门 / 行李箱高）
    // 4) 尺寸：车长按米 / 厘米 / 毫米 / 英寸里落在 2.5～7 米的那个算，都不像就缩放到 4.6 米
    var L = size(unite(shown(info))).z, unit = [1, 0.01, 0.001, 0.0254].filter(function (u) { return L * u >= 2.5 && L * u <= 7; })[0];
    cfg.length = unit ? Math.round(L * unit * 100) / 100 : 4.6;
    pose(cfg.length / (L || 1));
    var vis = shown(measure()), all = unite(vis), off = center(all);
    off.y = all.min.y;
    vis.forEach(function (o) { o.box.translate(off.clone().negate()); o.c = center(o.box); o.s = size(o.box); });
    as = size(all);
    var at = {};
    vis.forEach(function (o) { at[o.m.userData.mid] = o; });
    // 5) 材质：材质名对得上，或者用它的网格大多数（六成）名字对得上才算（一个叫 headlight 的零件带不走整块玻璃）；名字按词认、有否决词（见 NAME / NOT）。
    //    车漆不自动认：认错一块（饰条、窗框）就把车弄坏，导入的车模车漆原样用，要换色在调整车模里点一下车身标上
    var ms = d.mats.map(function (m, i) { return { m: m, i: i, n: 0, hits: {} }; }), KEYS = ['tire', 'lamp', 'caliper', 'rim', 'glass'];
    vis.forEach(function (o) {
      o.m.userData.mats.forEach(function (id) {
        var x = ms[id];
        x.n++;
        KEYS.forEach(function (k) { if (nameIs(k, o.names)) x.hits[k] = (x.hits[k] || 0) + 1; });
      });
    });
    var by = function (x, k) { return nameIs(k, x.m.name) || (x.hits[k] || 0) >= x.n * 0.6; }, role = {};
    ms.forEach(function (x) {
      if (!x.n) return;
      // 真透明的才当玻璃：只标了混合模式、其实不透明的（贴花、整车都标成混合的模型）不算
      var m = x.m, see = m.transmission > 0 || m.opacity < 0.95;
      // 灯不自动认（导入的车模由用户自己在调整车模里选）：名字像灯的材质也不当玻璃，保持原样
      var r = by(x, 'tire') || by(x, 'lamp') ? '' : by(x, 'caliper') ? 'caliper' : by(x, 'rim') ? 'rim'
        : by(x, 'glass') || (see && !paintName(m.name) && !hasW(words(m.name), NOT.glass)) ? 'glass' : '';
      if (r) { (cfg.mats[r] = cfg.mats[r] || []).push(x.i); role[x.i] = r; }
    });
    // 6) 部件：门、引擎盖、尾门按节点名（取最上面那层，整个子树一起动）；跨左右两边、大得不像一扇门的不要（多半是合在一起的整个车身）
    function tops(re, not) {
      var out = [];
      model.traverse(function (o) {
        var nm = norm(o.name);
        if (o === model || wrap[o.uuid] || !re.test(nm) || (not && not.test(nm))) return;
        for (var p = o.parent; p && p !== model; p = p.parent) if (!wrap[p.uuid] && re.test(norm(p.name)) && !(not && not.test(norm(p.name)))) return;
        var list = [];
        o.traverse(function (x) { if (x.isMesh && !x.isSkinnedMesh && at[x.userData.mid]) list.push(x); });
        if (list.length) out.push(list);
      });
      return out;
    }
    function boxOf(list) { var b = new T.Box3(); list.forEach(function (m) { if (at[m.userData.mid]) b.union(at[m.userData.mid].box); }); return b; }
    var across = function (b, k) { return b.min[k] < -0.08 * as[k] && b.max[k] > 0.08 * as[k]; };
    var doors = tops(RX.door, RX.notDoor).map(function (l) { var b = boxOf(l); return { list: l, b: b, c: center(b) }; }).filter(function (x) {
      var s = size(x.b);
      return !across(x.b, 'x') && s.z < 0.6 * as.z && s.x < 0.45 * as.x;
    });
    ['L', 'R'].forEach(function (s) {
      var g = doors.filter(function (x) { return s === 'L' ? x.c.x > 0 : x.c.x <= 0; });
      if (!g.length) return;
      var zs = g.map(function (x) { return x.c.z; }), split = Math.max.apply(null, zs) - Math.min.apply(null, zs) > 0.4 ? (Math.max.apply(null, zs) + Math.min.apply(null, zs)) / 2 : -1e9;
      g.forEach(function (x) {
        var k = 'door' + (x.c.z > split ? 'F' : 'R') + s, p = cfg.parts[k] = cfg.parts[k] || { meshes: [], style: 'normal' };
        x.list.forEach(function (m) { if (p.meshes.indexOf(m.userData.mid) < 0) p.meshes.push(m.userData.mid); });
      });
    });
    [['hood', RX.hood], ['trunk', RX.trunk]].forEach(function (h) {
      var l = [].concat.apply([], tops(h[1])), s = size(boxOf(l));
      if (l.length && s.z < 0.5 * as.z && s.x < 1.05 * as.x) cfg.parts[h[0]] = { meshes: l.map(function (m) { return m.userData.mid; }) };
    });
    // 6b) 天窗、遮阳帘、充电口盖按节点名（灯不自动认）
    [['sunroof', RX.sunroof], ['sunshade', RX.sunshade], ['chargePort', RX.charge]].forEach(function (h) {
      var l = [].concat.apply([], tops(h[1]));
      if (l.length) cfg.parts[h[0]] = { meshes: l.map(function (m) { return m.userData.mid; }) };
    });
    // 7) 车轮：按名字找的、按形状找的（贴地、圆、薄，外框里的轮毂螺丝一起），哪个占的角多用哪个；跨两个角的（四个轮子合在一个网格里）不算
    var corner = function (o) { return across(o.box, 'x') || across(o.box, 'z') ? '' : (o.c.x > 0 ? 'L' : 'R') + (o.c.z > 0 ? 'F' : 'B'); };
    var named = [].concat.apply([], tops(RX.wheel, RX.notWheel)).map(function (m) { return at[m.userData.mid]; }).filter(function (o) { return o && o.c.y < 0.45 * as.y && corner(o); });
    var shaped = [];
    vis.filter(function (o) {
      var dd = o.s.y;
      return !o.m.isSkinnedMesh && dd > 0.1 * as.z && dd < 0.24 * as.z && o.s.z > 0.75 * dd && o.s.z < 1.3 * dd && o.s.x < 0.75 * dd && o.box.min.y < 0.12 * dd && corner(o);
    }).forEach(function (t) {
      var wb = t.box.clone().expandByScalar(0.05);
      vis.forEach(function (o) { if (wb.containsBox(o.box) && shaped.indexOf(o) < 0 && !o.m.isSkinnedMesh) shaped.push(o); });
    });
    var corners = function (l) { var q = {}; l.forEach(function (o) { var k = corner(o); if (k) q[k] = 1; }); return Object.keys(q).length; };
    var wheels = corners(shaped) > corners(named) ? shaped : named;
    if (wheels.length) cfg.parts.wheels = wheels.map(function (o) { return o.m.userData.mid; });
    // 8) 轮毂名字认不出：找到车轮以后，七成以上（按零件数或面积）用在车轮上、不是轮胎（名字、或者在候选里最暗而且近乎纯黑）的材质里，用得最多的那个
    if (wheels.length && !cfg.mats.rim) {
      var onW = {}, st = {}, lum = function (id) { var c = ms[id].m.color; return c ? Math.max(c.r, c.g, c.b) : 1; };
      wheels.forEach(function (o) { onW[o.m.userData.mid] = 1; });
      vis.forEach(function (o) {
        var a = 2 * (o.s.x * o.s.y + o.s.y * o.s.z + o.s.x * o.s.z);
        o.m.userData.mats.forEach(function (id) { var x = st[id] = st[id] || { on: 0, all: 0, n: 0, nOn: 0 }; x.all += a; x.n++; if (onW[o.m.userData.mid]) { x.on += a; x.nOn++; } });
      });
      var cand = Object.keys(st).map(Number).filter(function (id) { var m = ms[id].m; return (st[id].on >= 0.7 * st[id].all || st[id].nOn >= 0.7 * st[id].n) && !role[id] && !by(ms[id], 'tire') && !by(ms[id], 'caliper') && !m.transparent; });
      cand.sort(function (p, q) { return lum(p) - lum(q); });
      if (cand.length > 1 && lum(cand[0]) < 0.06) cand.shift();
      cand.sort(function (p, q) { return st[q].on - st[p].on; });
      if (cand.length) cfg.mats.rim = [cand[0]];
      else { // 轮毂的材质别处也在用（整车一个网格按颜色拆开的那种）：直接记车轮上的零件——不是轮胎（名字、近乎纯黑）的那些
        var rims = wheels.filter(function (o) { return mats(o.m).every(function (m) { return !nameIs('tire', m.name) && !(m.color && Math.max(m.color.r, m.color.g, m.color.b) < 0.06) && !m.transparent && !m.map; }); }); // 带贴图的（轮胎轮毂画在一张图上）换色会把整个轮子染了：不猜
        if (rims.length) (cfg.pick = cfg.pick || {}).rim = rims.map(function (o) { return o.m.userData.mid; });
      }
    }
    geoParts(model, cfg, vis, as, off, role, across);
    model.rotation.order = 'XYZ';
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.scale.setScalar(1); model.updateMatrixWorld(true);
    return cfg;
  }

  /** 9) 门、引擎盖、尾门名字认不出（整车一个网格拆开的、名字都是 Object_N 的）：按位置和形状找，按"零件"算——一个零件拆成了几种颜色（几个网格）的算一个整体。
     10) 车窗、窗框跨着两扇门（一整条）：按每扇门的前后范围切开（cfg.carve，建车前在 GLB 里拆出新零件，见 car3d.js 的 parse），玻璃当这扇门的车窗、别的跟着门走。
     坐标是摆正后的：车头 +z、左边 +x、地面 y = 0 */
  function geoParts(model, cfg, vis, as, off, role, across) {
    var hw = as.x / 2, hl = as.z / 2, H = as.y, used = {}, units = [], byKey = {};
    (cfg.parts.wheels || []).concat(cfg.hide).forEach(function (m) { used[m] = 1; });
    MOVERS.concat(WINDOWS).forEach(function (k) { (cfg.parts[k] && cfg.parts[k].meshes || []).forEach(function (m) { used[m] = 1; }); });
    // 零件：拆开的零件（几个网格挂在同一个只有网格的节点下）算一个
    vis.forEach(function (o) {
      var p = o.m.parent, grp = p && p !== model && p.children.length > 1 && p.children.every(function (c) { return c.isMesh; }), key = grp ? p.uuid : o.m.uuid;
      var u = byKey[key];
      if (!u) { u = byKey[key] = { list: [], box: new T.Box3() }; units.push(u); }
      u.list.push(o); u.box.union(o.box);
    });
    units.forEach(function (u) {
      u.c = center(u.box); u.s = size(u.box);
      u.mids = u.list.map(function (o) { return o.m.userData.mid; });
      u.used = u.mids.some(function (m) { return used[m]; });
      u.glass = u.list.every(function (o) { return o.m.userData.mats.every(function (id) { return role[id] === 'glass'; }) || mats(o.m).every(function (m) { return m.transparent && m.opacity < 0.9; }); });
    });
    var free = function () { return units.filter(function (u) { return !u.used; }); };
    var take = function (u, k) { var p = cfg.parts[k] = cfg.parts[k] || { meshes: [] }; u.mids.forEach(function (m) { if (p.meshes.indexOf(m) < 0) p.meshes.push(m); used[m] = 1; }); u.used = true; };
    // 前后轮的位置、半径（门在前后轮中间）
    var wz = null, ws = { F: [], B: [] }, wr = [];
    (cfg.parts.wheels || []).forEach(function (mid) { vis.forEach(function (o) { if (o.m.userData.mid === mid) { ws[o.c.z > 0 ? 'F' : 'B'].push(o.c.z); wr.push(o.s.y / 2); } }); });
    var mean = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    if (ws.F.length && ws.B.length) wz = { f: mean(ws.F), b: mean(ws.B), r: Math.max.apply(null, wr) };
    // 9a) 门：车身外侧、竖着的大板子，在前后轮中间；一边按前后叠在一起的并成一扇，最多两扇（前门、后门）
    var doorZ = {};
    var doorish = free().filter(function (u) {
      if (u.glass || across(u.box, 'x')) return false;
      var outer = u.c.x > 0 ? u.box.max.x : -u.box.min.x;
      if (outer < 0.75 * hw || u.s.x > 0.35 * hw) return false;
      if (u.s.y < 0.25 * H || u.box.min.y > 0.5 * H || u.box.max.y < 0.45 * H || u.box.max.y > 0.97 * H) return false;
      if (u.s.z < 0.12 * as.z || u.s.z > 0.42 * as.z) return false;
      if (wz) return u.c.z < wz.f - 0.2 * wz.r && u.c.z > wz.b + 0.2 * wz.r && u.box.max.z < wz.f + 0.5 * wz.r && u.box.min.z > wz.b - 0.5 * wz.r;
      return Math.abs(u.c.z) < 0.3 * hl;
    });
    ['L', 'R'].forEach(function (S) {
      if (cfg.parts['doorF' + S] || cfg.parts['doorR' + S]) return; // 这边按名字找到了
      var groups = [];
      doorish.filter(function (u) { return (u.c.x > 0) === (S === 'L'); }).forEach(function (u) {
        var g = groups.filter(function (x) { return Math.min(x.z1, u.box.max.z) - Math.max(x.z0, u.box.min.z) >= 0.5 * Math.min(x.z1 - x.z0, u.s.z); })[0];
        if (g) { g.list.push(u); g.z0 = Math.min(g.z0, u.box.min.z); g.z1 = Math.max(g.z1, u.box.max.z); g.area += u.s.y * u.s.z; }
        else groups.push({ list: [u], z0: u.box.min.z, z1: u.box.max.z, area: u.s.y * u.s.z });
      });
      groups.sort(function (a, b) { return b.area - a.area; });
      groups.slice(0, 2).sort(function (a, b) { return b.z0 + b.z1 - a.z0 - a.z1; }).forEach(function (g, i) {
        var k = 'door' + (i ? 'R' : 'F') + S, b = new T.Box3();
        g.list.forEach(function (u) { take(u, k); b.union(u.box); });
        cfg.parts[k].style = 'normal';
        doorZ[k] = { box: b, side: S === 'L' ? 1 : -1 };
      });
    });
    // 9b) 引擎盖：横跨左右、车头上面的一大块（挡风玻璃、保险杠不算）
    if (!cfg.parts.hood) {
      var hood = free().filter(function (u) {
        return !u.glass && across(u.box, 'x') && u.s.x >= 0.55 * as.x && u.c.z >= 0.45 * hl && u.box.max.z >= 0.7 * hl && u.box.min.y >= 0.4 * H && u.s.y <= 0.35 * H && u.s.z >= 0.12 * as.z && u.s.z <= 0.45 * as.z;
      }).sort(function (a, b) { return b.s.x * b.s.z - a.s.x * a.s.z; })[0];
      if (hood) { take(hood, 'hood'); doorZ.hood = { box: hood.box.clone() }; }
    }
    // 9c) 尾门：横跨左右、车尾、比车身窄（整个车尾那么宽的多半是连着后翼子板的车身，开了就是整个车尾掀起来）
    if (!cfg.parts.trunk) {
      var tr = free().filter(function (u) {
        return !u.glass && across(u.box, 'x') && u.s.x >= 0.5 * as.x && u.s.x <= 0.92 * as.x && u.c.z <= -0.55 * hl && u.box.min.z <= -0.75 * hl && u.box.min.y >= 0.3 * H &&
          u.s.z <= 0.3 * as.z && u.s.x * Math.max(u.s.y, u.s.z) >= 0.08 * as.x * as.y;
      }).sort(function (a, b) { return b.s.x * Math.max(b.s.y, b.s.z) - a.s.x * Math.max(a.s.y, a.s.z); })[0];
      if (tr) { take(tr, 'trunk'); doorZ.trunk = { box: tr.box.clone() }; }
    }
    // 包在门、盖外框里的零件（门内饰、把手、门上的玻璃）跟着走
    Object.keys(doorZ).forEach(function (k) {
      var b = doorZ[k].box.clone().expandByScalar(0.02 * as.z);
      free().forEach(function (u) { if (b.containsBox(u.box)) { if (u.glass && /^door/.test(k)) take(u, 'win' + k.slice(4)); else take(u, k); } });
    });
    // 10) 跨着门的整条车窗 / 窗框：门以上、和门前后重叠一半以上、比门长——按每扇门的前后范围切开（按网格，切的是三角形）
    var carve = [];
    Object.keys(doorZ).forEach(function (k) {
      if (!/^door/.test(k)) return;
      var b = doorZ[k].box, S = doorZ[k].side, dl = b.max.z - b.min.z, dh = b.max.y - b.min.y, w = 'win' + k.slice(4);
      vis.forEach(function (o) {
        var mid = o.m.userData.mid;
        if (used[mid] || o.box.min.y < b.min.y + 0.35 * dh || o.box.max.y > 0.98 * H) return;
        if (!across(o.box, 'x') && (o.c.x > 0 ? 1 : -1) !== S) return;
        var ov = Math.min(b.max.z, o.box.max.z) - Math.max(b.min.z, o.box.min.z);
        if (ov < 0.5 * dl || o.s.z < 1.15 * dl) return; // 没跨出这扇门的前面已经跟着门走了
        var tris = triIn(o.m, b.min.z - 0.01 * as.z, b.max.z + 0.01 * as.z, S, off);
        if (!tris.length) return;
        var glass = o.m.userData.mats.every(function (id) { return role[id] === 'glass'; }) || mats(o.m).every(function (m) { return m.transparent && m.opacity < 0.9; });
        carve.push({ mid: mid, tris: tris, to: glass ? w : k, name: (glass ? '车窗' : '窗框') + k.slice(4) });
      });
    });
    if (carve.length) cfg.carve = carve;
  }
  /** 网格里中心落在前后 [z0, z1]、在 side 那一边（1 左 / -1 右）的三角形编号（摆正后的坐标：世界坐标减去 off） */
  function triIn(m, z0, z1, side, off) {
    var g = m.geometry, p = g.attributes.position, ix = g.index, n = (ix ? ix.count : p.count) / 3, out = [], v = new T.Vector3(), c = new T.Vector3();
    for (var t = 0; t < n; t++) {
      c.set(0, 0, 0);
      for (var j = 0; j < 3; j++) c.add(v.fromBufferAttribute(p, ix ? ix.getX(t * 3 + j) : t * 3 + j).applyMatrix4(m.matrixWorld));
      c.multiplyScalar(1 / 3).sub(off);
      if (c.z >= z0 && c.z <= z1 && (c.x > 0 ? 1 : -1) === side) out.push(t);
    }
    return out;
  }

  window.D3Model = {
    W70: W70, isW70: isW70, current: current, def: fallback, save: save, reset: reset, importFiles: importFiles,
    exportPack: exportPack, exportDefault: exportDefault, compress: compress, inflate: inflate, withConfig: withConfig, info: info, read: readGLB,
    ids: ids, meshRefs: meshRefs, matRefs: matRefs, mats: mats, auto: auto, box: box, sanitize: sanitize, carve: carve,
    BODY_ROLES: BODY_ROLES, LIGHT_ROLES: LIGHT_ROLES, CUSTOM_LIGHTS: CUSTOM_LIGHTS, MOVERS: MOVERS, WINDOWS: WINDOWS, nameIs: nameIs, paintName: paintName, metalFix: metalFix, wind: wind,
    bgGet: bgGet, bgSet: bgSet, bgClear: bgClear,
    // 贴纸：图片、导入的字体存取，清理不用的图片；读图片文件（同导入车模：只认 PNG / JPEG / WebP）
    wrapImgPut: wrapImgPut, wrapImg: wrapImg, gcWraps: gcWraps, withWraps: withWraps, fontList: fontList, fontPut: fontPut, fontGet: fontGet, fontDel: fontDel,
    readFile: readFile, sniff: sniff, decodeImg: decodeImg, toBytes: toBytes, MAX_TEX: MAX_TEX, MAX_WRAPS: MAX_WRAPS
  };
})();
