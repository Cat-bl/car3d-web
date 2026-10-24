/* demo3d 设置：存在本地（按白名单校验，坏了回到默认），右上角齿轮打开面板。
   面板从右边带一点透视角度转进来，一行行依次浮上来；车漆 / 轮毂 / 卡钳是带高光的小球，选中的放大、外圈一道选中色的光，最后一个是"自定义"
   （展开色相 / 饱和度 / 亮度三个滑块，不靠系统取色器）；面板的强调色（开关、选中的分段）跟着车漆颜色走。车况页打开时镜头转到侧面展示车身（car3d.js 的 focus）。
   车模（导入 / 调整 / 恢复默认，carmodel.js、cartune.js）、背景（三套渐变跟着深浅色走，或者自己的图片 + 压暗）、
   默认视角（水平角度、俯视角、车的大小、视野四个滑块，拖动时车况页转到默认视角预览；也能把打开设置前的角度设为默认）、
   底部数据（选 1～4 项）、唱片机页（开关、底座、唱片、转速）。
   按钮类的操作（data-act）不存设置，发给订阅的人：on(fn) 收到 'act:名字'。
   对外：window.D3Set = { get(key), set(key, value), pick(key), on(fn(key)) → 取消, isOpen(), close(), opts, STATS }。全部 ES5。 */
(function () {
  'use strict';
  var KEY = 'd3-settings';
  var OPTS = {
    paint: [
      { id: 'model', name: '原车颜色', model: true }, // 车模自己的车漆（car3d.js 建车时用 modelPaint 告诉这里是什么颜色）
      { id: 'red', name: '赤焰红', color: '#9a0c13', metal: 0.3, rough: 0.34, acc: '#ff4b55' },
      { id: 'white', name: '珍珠白', color: '#e6e4df', metal: 0.12, rough: 0.3, acc: '#9fd0ff' },
      { id: 'black', name: '午夜黑', color: '#0f1013', metal: 0.5, rough: 0.28, acc: '#b9c2d0' },
      { id: 'blue', name: '电光蓝', color: '#1a44c4', metal: 0.45, rough: 0.3, acc: '#5b8cff' },
      { id: 'green', name: '极光绿', color: '#13705a', metal: 0.45, rough: 0.3, acc: '#3fd9a6' },
      { id: 'orange', name: '落日橙', color: '#e0571a', metal: 0.25, rough: 0.32, acc: '#ff8a3d' },
      { id: 'custom', name: '自定义', hex: 'paintHex', metal: 0.3, rough: 0.32 }
    ],
    rim: [
      { id: 'model', name: '原车颜色', model: true }, // 车模自己轮毂的颜色、金属感（car3d.js 建车时记下原来的，modelPart 告诉这里小球显示什么颜色）
      { id: 'silver', name: '亮银', color: '#d9dce1', metal: 1, rough: 0.22 },
      { id: 'black', name: '亮黑', color: '#1a1b1e', metal: 0.7, rough: 0.25 },
      { id: 'gold', name: '香槟金', color: '#c9a96a', metal: 1, rough: 0.28 },
      { id: 'gun', name: '枪灰', color: '#5a5f67', metal: 0.9, rough: 0.3 },
      { id: 'custom', name: '自定义', hex: 'rimHex', metal: 0.9, rough: 0.25 }
    ],
    caliper: [
      { id: 'model', name: '原车颜色', model: true },
      { id: 'red', name: '红', color: '#c8141b' },
      { id: 'yellow', name: '黄', color: '#e8b20e' },
      { id: 'blue', name: '蓝', color: '#1f5fd6' },
      { id: 'black', name: '黑', color: '#1a1a1c' },
      { id: 'custom', name: '自定义', hex: 'calHex' }
    ],
    finish: ['preset', 'gloss', 'metal', 'pearl', 'satin', 'matte', 'frost', 'candy', 'chrome', 'flip'],
    theme: ['auto', 'light', 'dark'],
    bg: ['studio', 'warm', 'cool', 'image'],
    vBase: ['cream', 'walnut', 'black', 'silver'],
    vDisc: ['black', 'red', 'blue', 'clear'],
    vRpm: ['16', '20', '33'],
    quality: ['eco', 'std', 'high', 'ultra'],
    fps: ['30', '60']
  };
  // 车漆质感：原厂（按颜色自带的）/ 亮面 / 金属 / 珠光 / 缎面 / 哑光 / 磨砂金属 / 糖果 / 电镀 / 变色龙。
  // metal 金属度、rough 粗糙度、coat 清漆层（0 = 没有）、ccr 清漆的粗糙度、iri 薄膜干涉（随角度变色：珠光淡淡一层，变色龙整片）、
  // flake 金属漆的闪点（清漆下面一颗颗亮点，转动时闪；素色漆、电镀没有）
  var FINISH = {
    gloss: { metal: 0.15, rough: 0.28, coat: 1, flake: 0 },
    metal: { metal: 0.62, rough: 0.3, coat: 1, flake: 0.08 },
    pearl: { metal: 0.22, rough: 0.24, coat: 1, iri: 0.8, thick: [120, 380], flake: 0.05 },
    satin: { metal: 0.35, rough: 0.46, coat: 0.4, ccr: 0.35, flake: 0.04 },
    matte: { metal: 0.08, rough: 0.72, coat: 0, flake: 0 },
    frost: { metal: 0.78, rough: 0.52, coat: 0, flake: 0.06 },
    candy: { metal: 0.5, rough: 0.14, coat: 1, flake: 0.06 },
    chrome: { metal: 1, rough: 0.06, coat: 1, flake: 0 },
    flip: { metal: 0.55, rough: 0.24, coat: 1, iri: 1, thick: [250, 900], flake: 0.06 }
  };
  // 画质：ratio 像素比上限、shadow 真实阴影的贴图大小（0 = 不画）、flake 车漆闪点和清漆橘皮纹、reflect 地面反射、bloom 灯光辉光、ao 屏幕空间环境光遮蔽、dof 景深
  var QUAL = {
    eco: { ratio: 1, shadow: 0, flake: false, lowp: true, note: '像素比 1，不画真实阴影、车漆闪点，最省显卡' },
    std: { ratio: 1.5, shadow: 1024, flake: true, lowp: true, note: '真实影棚反射、车身阴影、金属漆闪点和清漆纹理' },
    high: { ratio: 1.5, shadow: 2048, flake: true, reflect: true, bloom: true, note: '在标准上加地面反射、灯光辉光，转车时更费显卡' },
    ultra: { ratio: 2, shadow: 2048, flake: true, reflect: true, bloom: true, ao: true, dof: true, note: '再加环境光遮蔽、景深、像素比 2，最费显卡，车机上转车可能会卡' }
  };
  // 底部数据能选的项
  var STATS = window.D3CarStat.STATS; // [id, 名字, 分组, …]：能源、能耗、里程、空调、环境、其他（carstat.js）
  var HEX = { paintHex: '#3a7bd5', rimHex: '#b8bcc4', calHex: '#2bb673' };
  // 滑块：背景图片压暗；车况页的默认视角——水平角度（弧度，0 正对车头、正的往车左边转）、俯视角（弧度）、车的大小、视野（度）
  var deg = function (v) { return Math.round(v * 180 / Math.PI) + '°'; };
  var NUM = {
    bgDim: { min: 0, max: 0.7, step: 0.05, def: 0.25, fmt: function (v) { return Math.round(v * 100) + '%'; } },
    viewAz: { min: -3.15, max: 3.15, step: 0.01, def: -0.72, fmt: deg },
    viewEl: { min: 0.04, max: 0.62, step: 0.01, def: 0.2, fmt: deg },
    viewZoom: { min: 0.7, max: 1.4, step: 0.05, def: 1, fmt: function (v) { return Math.round(v * 100) + '%'; } },
    viewFov: { min: 18, max: 50, step: 1, def: 27, fmt: function (v) { return v + '°'; } }
  };
  var VIEW = ['viewAz', 'viewEl', 'viewZoom', 'viewFov'];
  var DEF = { paint: 'red', rim: 'silver', caliper: 'red', finish: 'preset', paintHex: HEX.paintHex, rimHex: HEX.rimHex, calHex: HEX.calHex, theme: 'auto',
    bg: 'studio', bgDim: 0.25, viewAz: -0.72, viewEl: 0.2, viewZoom: 1, viewFov: 27, stats: ['bat', 'fuel', 'range', 'temp'],
    vinyl: true, vBase: 'cream', vDisc: 'black', vRpm: '20',
    labels: true, intro: true, quality: 'eco', fps: '60', aa: false, fsBar: false };
  var BOOL = { labels: 1, intro: 1, vinyl: 1, aa: 1, fsBar: 1 };
  var s = load(), fns = [];
  // 现在这台车模自己的车漆：{ color 材质里的颜色、css 小球上显示的颜色、metal、rough、coat }，没标出车身时 null（原厂质感只参考 metal）
  var modelPaint = null;
  // 现在这台车模自己的轮毂、卡钳颜色（小球上显示的 css 颜色），没标出来时 null
  var modelPart = { rim: null, caliper: null };
  // 自定义颜色最后拖到的色相（白、灰、黑本身没有色相，存成颜色值后读回来是 0°：滑块别跳回去）
  var hueKeep = {};

  function ok(k, v) {
    if (BOOL[k]) return typeof v === 'boolean';
    if (NUM[k]) return typeof v === 'number' && v >= NUM[k].min && v <= NUM[k].max;
    if (HEX[k]) return typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v);
    if (k === 'stats') return Array.isArray(v) && v.length >= 1 && v.length <= 4 && v.every(function (x, i) { return v.indexOf(x) === i && STATS.some(function (o) { return o[0] === x; }); });
    var o = OPTS[k];
    if (!o) return false;
    return o.some(function (x) { return (x.id || x) === v; });
  }
  function load() {
    var r = {}, raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (raw && raw.quality === 'smooth') raw.quality = 'std'; // 以前的画质：流畅 = 60 帧、省电 = 30 帧（帧率现在单独一项）
    if (raw && raw.quality === 'eco' && raw.fps === undefined) raw.fps = '30';
    for (var k in DEF) r[k] = raw && ok(k, raw[k]) ? raw[k] : DEF[k];
    return r;
  }
  function find(k, id) { var o = OPTS[k]; for (var i = 0; i < o.length; i++) if (o[i].id === id) return o[i]; return o[0]; }

  // ================= 颜色换算 =================
  function hex2hsl(h) {
    var r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, hh = 0, ss = 0;
    if (d) {
      ss = d / (1 - Math.abs(2 * l - 1));
      hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh = (hh * 60 + 360) % 360;
    }
    return [Math.round(hh), Math.round(ss * 100), Math.round(l * 100)];
  }
  function hsl2hex(h, sat, l) {
    sat /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + rgb.map(function (v) { var n = Math.round((v + m) * 255); return (n < 16 ? '0' : '') + n.toString(16); }).join('');
  }
  /** 自定义车漆的强调色：同色相，亮度、饱和度提起来（灰色就用浅蓝灰） */
  function accOf(h) { var a = hex2hsl(h); return a[1] < 12 ? '#b9c2d0' : hsl2hex(a[0], Math.max(60, a[1]), Math.max(58, Math.min(70, a[2] + 20))); }

  var api = window.D3Set = {
    opts: OPTS, STATS: STATS,
    get: function (k) { return s[k]; },
    /** 车漆 / 轮毂 / 卡钳的那一项（颜色、金属度、粗糙度、清漆…）：自定义的取存的颜色；车漆按质感改金属度 / 粗糙度 */
    pick: function (k) {
      var o = find(k, s[k]), r = { id: o.id, name: o.name, color: o.hex ? s[o.hex] : o.color, metal: o.metal, rough: o.rough, acc: o.acc, coat: 1 };
      if (o.model && k !== 'paint') { r.model = true; r.color = modelPart[k] || o.color || '#9a9da3'; } // 轮毂、卡钳：建车时记下的原来的样子（car3d.js 直接用）
      if (o.model && k === 'paint') { var mp = modelPaint || { color: '#9a0c13', css: '#9a0c13', metal: 0.3, rough: 0.34, coat: 1 }; r.model = true; r.color = mp.color; r.acc = accOf(mp.css);
        // 原厂质感：只取车模的颜色，按真车漆来（偏哑的底漆 + 清漆层；车模原来是金属漆的保留金属感）——直接用车模材质的数（W70 粗糙度 0.07、没清漆，还靠一张粗糙度贴图），整层像打了油
        r.metal = mp.metal >= 0.5 ? 0.6 : 0.3; r.rough = 0.34; r.coat = 1; }
      if (o.hex && k === 'paint') r.acc = accOf(r.color);
      if (k === 'paint') {
        var f = FINISH[s.finish] || {};
        if (f.metal !== undefined) { r.metal = f.metal; r.rough = f.rough; r.coat = f.coat; }
        r.ccr = f.ccr || 0.03; r.iri = f.iri || 0; r.thick = f.thick || [250, 900];
        r.flake = f.flake !== undefined ? f.flake : r.metal >= 0.4 ? 0.06 : 0; // 原厂：金属色的有闪点
      }
      return r;
    },
    set: function (k, v) {
      if (NUM[k]) v = Math.round(Math.round(v / NUM[k].step) * NUM[k].step * 100) / 100;
      if (!ok(k, v) || JSON.stringify(s[k]) === JSON.stringify(v)) return;
      s[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
      ui();
      emit(k);
    },
    /** 现在画质的开关：{ ratio, shadow, flake, reflect, bloom, ao, dof } */
    fx: function () { return QUAL[s.quality]; },
    /** car3d.js 建好车后告诉这里车模自己的车漆（null：没标出车身） */
    modelPaint: function (mp) { modelPaint = mp; ui(); },
    /** car3d.js 建车时告诉这里车模自己的轮毂 / 卡钳是什么颜色（小球上显示；没标出来给 null） */
    modelPart: function (k, css) { modelPart[k] = css || null; ui(); },
    on: function (fn) { fns.push(fn); return function () { var i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; },
    isOpen: function () { return open; },
    close: function () { toggle(false); }
  };
  function emit(k) { fns.slice().forEach(function (f) { f(k); }); }

  // ================= 面板 =================
  var $ = function (id) { return document.getElementById(id); };
  var panel = $('set'), btn = $('setBtn'), open = false;
  // 全屏键（fullscreen.js；宿主有这个功能才显示）：在齿轮旁边，显示出来时状态胶囊往左让（app 上的 has-fs）；切不过去时底部提示一句。
  // 全屏页里能收起顶端状态栏（setStatusBarVisible）：这里开着，一进全屏页就收起；每次进全屏宿主都先显示
  var fsMode = '';
  $('rowFsBar').hidden = !CardFullscreen.bind($('fsBtn'), {
    ready: function (m) { fsMode = m; document.getElementById('app').classList.add('has-fs'); if (m === 'small' && s.fsBar) CardFullscreen.bar(false); },
    fail: function (c, m, t) { if (window.D3) D3.toast(t); }
  });
  api.on(function (k) { if (k === 'fsBar' && fsMode === 'small') CardFullscreen.bar(s.fsBar ? false : true); });
  // 调试面板（电脑上的调试宿主才有）：设置里一行入口，车况页右上角的"调试数据"也能点开
  var dbg = window.uiplus && window.uiplus.__debug && window.D3Debug;
  $('rowDebug').hidden = !dbg;
  if (dbg) {
    api.on(function (k) { if (k === 'act:debug') { toggle(false); D3Debug.open(); } });
    $('cDemo').addEventListener('click', function (e) { e.stopPropagation(); if (window.D3DebugPanel && D3DebugPanel.isOpen()) D3DebugPanel.close(); else D3Debug.open(); });
  }
  function balls(k, box) {
    OPTS[k].forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ball' + (o.hex ? ' custom' : o.model ? ' model' : ''); b.setAttribute('data-k', k); b.setAttribute('data-v', o.id); b.setAttribute('aria-label', o.name);
      if (!o.hex && !o.model) b.style.backgroundColor = o.color;
      box.appendChild(b);
    });
    // 自定义颜色：色相 / 饱和度 / 亮度
    var hx = find(k, 'custom').hex, wrap = document.createElement('div');
    wrap.className = 'hsl'; wrap.id = 'hsl-' + k;
    [['h', '色相', 360], ['s', '饱和度', 100], ['l', '亮度', 100]].forEach(function (c) {
      var lb = document.createElement('label');
      lb.className = 'rng';
      lb.innerHTML = '<span>' + c[1] + '</span><input type="range" min="0" max="' + c[2] + '" step="1" data-hsl="' + hx + '" data-c="' + c[0] + '"><b></b>';
      wrap.appendChild(lb);
    });
    box.parentNode.appendChild(wrap);
  }
  balls('paint', $('setPaint')); balls('rim', $('setRim')); balls('caliper', $('setCaliper'));
  (function () { // 底部数据的标签
    var box = $('setStats'), g = '';
    STATS.forEach(function (o) {
      if (o[2] !== g) { g = o[2]; var h = document.createElement('span'); h.className = 'tags-g'; h.textContent = g; box.appendChild(h); }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tag'; b.setAttribute('data-k', 'stats'); b.setAttribute('data-v', o[0]); b.textContent = o[1];
      box.appendChild(b);
    });
  })();
  function ui() {
    var all = panel.querySelectorAll('[data-k]');
    for (var i = 0; i < all.length; i++) {
      var e = all[i], k = e.getAttribute('data-k'), v = e.getAttribute('data-v');
      if (BOOL[k]) e.classList.toggle('on', s[k]);
      else if (NUM[k]) {
        if (document.activeElement !== e) e.value = s[k];
        e.style.setProperty('--p', ((s[k] - NUM[k].min) / (NUM[k].max - NUM[k].min) * 100).toFixed(1) + '%');
        $('setV-' + k).textContent = NUM[k].fmt(s[k]);
      } else if (k === 'stats') {
        var n = s.stats.indexOf(v);
        e.classList.toggle('on', n >= 0);
        e.setAttribute('data-n', n >= 0 ? n + 1 : '');
      } else e.classList.toggle('on', s[k] === v);
    }
    ['paint', 'rim', 'caliper'].forEach(function (k) {
      var o = find(k, 'custom'), h = s[o.hex], a = hex2hsl(h), on = s[k] === 'custom', w = $('hsl-' + k);
      if (a[1] < 3 && hueKeep[o.hex] !== undefined) a[0] = hueKeep[o.hex];
      panel.querySelector('.ball.custom[data-k="' + k + '"]').style.setProperty('--c', h);
      w.className = 'hsl' + (on ? ' on' : '');
      var ins = w.querySelectorAll('input');
      for (var j = 0; j < 3; j++) {
        if (document.activeElement !== ins[j]) ins[j].value = a[j];
        ins[j].style.setProperty('--p', (a[j] / (j ? 100 : 360) * 100).toFixed(1) + '%');
        ins[j].nextSibling.textContent = j ? a[j] + '%' : a[j] + '°';
      }
      w.style.setProperty('--hue', a[0]);
    });
    var mb = panel.querySelector('.ball.model[data-k="paint"]');
    mb.style.setProperty('--c', modelPaint ? modelPaint.css : '#9a0c13');
    mb.disabled = !modelPaint; // 车模还没标出车身：没有原来的颜色可用
    ['rim', 'caliper'].forEach(function (k) { var b = panel.querySelector('.ball.model[data-k="' + k + '"]'); b.style.setProperty('--c', modelPart[k] || '#9a9da3'); b.disabled = !modelPart[k]; });
    $('setQualNote').textContent = QUAL[s.quality].note;
    $('setPaintName').textContent = api.pick('paint').name;
    $('setRimName').textContent = api.pick('rim').name;
    $('setCaliperName').textContent = api.pick('caliper').name + (s.caliper === 'custom' || s.caliper === 'model' ? '' : '色');
    $('setBgImg').className = 'set-more' + (s.bg === 'image' ? ' on' : '');
    $('setVinylMore').className = 'set-more' + (s.vinyl ? ' on' : '');
    panel.style.setProperty('--acc', api.pick('paint').acc);
  }
  function toggle(on) {
    if (on === open) return;
    open = on;
    panel.className = 'set' + (on ? ' on' : '');
    if (on && window.D3DebugPanel) D3DebugPanel.close();
    if (on && window.D3CarInfo) D3CarInfo.close();
    btn.classList.toggle('on', on);
    $('app').classList.toggle('set-open', on);
    if (on) { var rows = panel.querySelector('.set-body').children; for (var i = 0; i < rows.length; i++) rows[i].style.animationDelay = Math.min(i * 0.035, 0.6).toFixed(3) + 's'; } // 一行行依次浮上来
    emit('open');
  }
  btn.addEventListener('click', function () { toggle(!open); });
  $('setClose').addEventListener('click', function () { toggle(false); });
  panel.addEventListener('click', function (e) {
    if (e.target === panel) { toggle(false); return; } // 点面板外面关掉
    var act = e.target.closest ? e.target.closest('[data-act]') : null;
    if (act) { emit('act:' + act.getAttribute('data-act')); return; }
    if (e.target.getAttribute('data-reset') === 'view') { VIEW.forEach(function (k) { api.set(k, NUM[k].def); }); return; }
    var t = e.target.closest ? e.target.closest('[data-k]') : null;
    if (!t || NUM[t.getAttribute('data-k')] || t.tagName === 'INPUT') return;
    var k = t.getAttribute('data-k'), v = t.getAttribute('data-v');
    if (k === 'stats') { // 点一下加上 / 去掉（最少留 1 项）；满 4 项再点新的换掉最后一项
      var l = s.stats.slice(), i = l.indexOf(v);
      if (i >= 0) { if (l.length > 1) l.splice(i, 1); } else { if (l.length >= 4) l.pop(); l.push(v); }
      api.set('stats', l);
      return;
    }
    if (k === 'bg' && v === 'image') { emit('act:bgUse'); return; } // 选图片：存过图就直接用，没有先挑一张（car3d.js）
    api.set(k, BOOL[k] ? !s[k] : v);
  });
  panel.addEventListener('input', function (e) { // 滑块
    var k = e.target.getAttribute('data-k'), hx = e.target.getAttribute('data-hsl');
    if (NUM[k]) api.set(k, parseFloat(e.target.value));
    else if (hx) {
      var ins = e.target.parentNode.parentNode.querySelectorAll('input'), v = [];
      for (var j = 0; j < 3; j++) v.push(parseFloat(ins[j].value));
      // 拖色相时颜色是白、灰、黑（饱和度太低、亮度在两头）就看不出变化：把饱和度、亮度拉到看得出颜色的地方
      if (e.target.getAttribute('data-c') === 'h') { if (v[1] < 25) v[1] = ins[1].value = 70; if (v[2] > 85 || v[2] < 15) v[2] = ins[2].value = 50; }
      hueKeep[hx] = v[0];
      api.set(hx, hsl2hex(v[0], v[1], v[2]));
    }
  });
  Object.keys(NUM).forEach(function (k) { var e = panel.querySelector('[data-k="' + k + '"]'); e.min = NUM[k].min; e.max = NUM[k].max; e.step = NUM[k].step; });
  ui();
})();
