/* demo3d "全部车况"面板（车况页状态字右边"全部车况 ›"点开；第一次打开时才加载）：接口文档里除 ADAS 以外的数据都列出来——
   车辆字段（按文档分组）、媒体快照、安卓系统数据、宿主信息（版本、窗口类型、能力目录、车架号只露头尾）。
   名字、枚举、单位来自字段目录 uiplus-fields.js（_tools/gen/uiplus-catalog.mjs 从文档生成）。打开时自己订阅，关掉就取消；
   两种宿主格式都认（旧版 values 原样显示，新版 {data} 逐叶子合并、按目录解码）；只改变了的文字，最多 0.3 秒刷新一次。
   样式同设置面板（.set / .tune：面板外面照样能拖车）；打开时车让到旁边不转（D3Car.aside）。全部 ES5。 */
(function () {
  'use strict';
  var api = window.uiplus || null;
  var X = '<svg viewBox="0 0 24 24"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z"></path></svg>';
  var HOST = { preview: '预览', dualPip: '画中画', floating: '悬浮窗', fullscreen: '全屏' };
  var F = null, VF = {}, isOpen = false, gen = 0, handles = [], caps = null, info = null, android, vin = null, raw = {}, old = {}, sysT = {}, media = null, timer = 0, cells = {};
  var root = document.createElement('div');
  root.className = 'set tune ci';
  root.id = 'carInfo';
  root.innerHTML = '<div class="set-card"><div class="set-head"><b>全部车况</b><button type="button" class="set-x" data-a="close" aria-label="关闭">' + X + '</button></div>' +
    '<div class="set-body still" id="ciBody"><p class="ci-wait">正在读车况…</p></div></div>';
  document.getElementById('app').appendChild(root);
  var body = root.querySelector('#ciBody');
  root.addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (b && b.getAttribute('data-a') === 'close') api2.close(); });

  function load(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = function () { no(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function put(t, p) {
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) { if (!t[k] || typeof t[k] !== 'object') t[k] = {}; put(t[k], v); }
      else t[k] = v;
    });
  }
  function leaf(t, k) { var p = k.split('.'), n = t; for (var i = 0; i < p.length && n; i++) n = n[p[i]]; return n === undefined ? null : n; }
  function base(k) { return k.slice(0, k.lastIndexOf('.') + 1); }
  function pick(list, v) { var h = (list || []).filter(function (x) { return x[0] === v; })[0]; return h ? h[1] : null; }
  function mmss(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  /** 一个车辆字段显示成什么 */
  function vehText(f) {
    if (caps && !caps[f.k]) return ['宿主没有', 'na'];
    if (f.k === 'identity.vin') return vin ? [vin.length > 8 ? vin.slice(0, 3) + '…' + vin.slice(-4) : vin, ''] : ['—', 'na'];
    if (own(old, f.k)) { var o = old[f.k]; return [o === null || o === undefined ? '—' : String(o.value) + (o.unit ? ' ' + o.unit : ''), '']; } // 旧版宿主：原样
    var v = leaf(raw, f.k);
    if (v === null) return ['—', 'na'];
    var x = pick(f.x, v);
    if (x) return [x + '（' + v + '）', 'warn'];
    if (f.es) { var src = leaf(raw, base(f.k) + 'stateSource'), l = pick(f.es[src], v); return [l ? l + (src ? '（' + src + '）' : '') : String(v), l && l !== '正常' ? 'warn' : '']; }
    if (f.e) { var e = pick(f.e, v); return [e ? e + '（' + v + '）' : String(v), '']; }
    if (Array.isArray(v)) return [f.k === 'energy.charging.remainingTime' ? v[0] + ' 时 ' + v[1] + ' 分' : v.join('、'), ''];
    var u = f.u || '';
    if (f.c) { var cv = leaf(raw, base(f.k) + f.c.k), cl = pick(f.c.e, cv); if (cl) u = cl; else if (cv !== null) u = '单位编码 ' + cv; }
    var n = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
    return [n + (u && !f.q ? ' ' + u : '') + (f.q ? ' *' : ''), ''];
  }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function sysText(f) {
    var v = leaf(sysT, f.k);
    if (!api || !api.system) return ['宿主没有', 'na'];
    if (v === null) return ['—（未知）', 'na'];
    if (typeof v === 'boolean') return [v ? '是' : '否', ''];
    var e = pick(f.e, v);
    return [(e && e !== String(v) ? e + '（' + v + '）' : String(v)) + (f.u ? ' ' + f.u : ''), ''];
  }
  function mediaText(f) {
    if (!media) return ['—', 'na'];
    var v = media[f.k];
    if (v === null || v === undefined) return ['—', 'na'];
    if (f.k === 'playing') return [v ? '在放' : '暂停', ''];
    if (f.k === 'positionMs' || f.k === 'durationMs') return [mmss(v), ''];
    if (f.k === 'coverUrl') return [v ? '有封面' : '—', ''];
    if (f.k === 'updatedAt') return [new Date(v).toTimeString().slice(0, 8), ''];
    return [String(v), ''];
  }
  function hostRows() {
    var r = [];
    if (!api) return [['宿主', '没有宿主接口', 'na']];
    r.push(['接口版本', info && info.apiVersion || '—'], ['宿主版本', info && info.appVersion || '—'], ['浏览器内核', info && info.webViewVersion || '—'],
      ['卡片窗口', info ? HOST[info.hostType] || info.hostType || '—' : '—']);
    if (android !== undefined) r.push(['安卓版本', android || '—']); // 宿主有 system.getProperty 才有
    if (caps) r.push(['能力目录', capsN.fields + ' 个车辆字段 · ' + capsN.actions + ' 项操作 · ' + capsN.sys + ' 个系统字段']);
    r.push(['车架号', vin ? (vin.length > 8 ? vin.slice(0, 3) + '…' + vin.slice(-4) : vin) : '—']);
    if (api.__debug) r.push(['说明', '电脑上的调试宿主（调试面板里改的值）']);
    return r;
  }
  var capsN = { fields: 0, actions: 0, sys: 0 };

  // ================= 画：第一次建好所有行，之后只改文字 =================
  function row(id, name, t, cls, sub) {
    return '<div class="ci-row"><span>' + esc(name) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><b id="ci-' + id + '" class="' + (cls || '') + '">' + esc(t) + '</b></div>';
  }
  function build() {
    var h = '', g = '';
    h += '<div class="set-group">宿主</div><div id="ciHost"></div>';
    F.vehicle.forEach(function (f) {
      if (f.g !== g) { g = f.g; h += '<div class="set-group">' + esc(g) + '</div>'; }
      var t = vehText(f);
      h += row('v-' + f.k, f.n, t[0], t[1], f.q ? '原始读数，单位没证实' : '');
    });
    h += '<div class="set-group">媒体</div>';
    F.media.forEach(function (f) { var t = mediaText(f); h += row('m-' + f.k, f.n, t[0], t[1]); });
    g = '';
    F.system.forEach(function (f) {
      if (f.g !== g) { g = f.g; h += '<div class="set-group">系统 · ' + esc(g) + '</div>'; }
      var t = sysText(f);
      h += row('s-' + f.k, f.n, t[0], t[1]);
    });
    h += '<p class="set-note ci-note">"—"是暂时没有数据，"宿主没有"是这台车机的宿主没有这个字段；带 * 的是单位没被证实的原始读数。ADAS（障碍物、车道线、巡航）不在这里。</p>';
    body.innerHTML = h;
    cells = {};
    var bs = body.querySelectorAll('b[id^="ci-"]');
    for (var i = 0; i < bs.length; i++) cells[bs[i].id.slice(3)] = bs[i];
    hostPaint();
  }
  function hostPaint() {
    var el = body.querySelector('#ciHost');
    if (el) el.innerHTML = hostRows().map(function (r, i) { return row('h-' + i, r[0], r[1], r[2]); }).join('');
  }
  function set(id, t) { var c = cells[id]; if (c && (c.textContent !== t[0] || c.className !== (t[1] || ''))) { c.textContent = t[0]; c.className = t[1] || ''; } }
  function paint() {
    timer = 0;
    if (!isOpen || !F) return;
    F.vehicle.forEach(function (f) { set('v-' + f.k, vehText(f)); });
    F.media.forEach(function (f) { set('m-' + f.k, mediaText(f)); });
    F.system.forEach(function (f) { set('s-' + f.k, sysText(f)); });
    hostPaint();
  }
  function later() { if (!timer) timer = setTimeout(paint, 300); }

  // ================= 订阅：打开时订、关掉取消 =================
  function stop() { gen++; handles.forEach(function (h) { try { h.unsubscribe(); } catch (e) {} }); handles = []; clearTimeout(timer); timer = 0; }
  function keep(g) { return function (h) { if (g !== gen) { try { h.unsubscribe(); } catch (e) {} } else handles.push(h); }; }
  function start() {
    stop();
    var g = gen;
    if (!api) return;
    Promise.resolve().then(function () { return api.getInfo ? api.getInfo() : null; }).then(function (i) { if (g === gen) { info = i; later(); } }, function () {});
    if (api.system && typeof api.system.getProperty === 'function') Promise.resolve().then(function () { return api.system.getProperty('ro.build.version.release'); })
      .then(function (p) { if (g === gen) { android = p && typeof p.value === 'string' ? p.value : null; later(); } }, function () { if (g === gen) { android = null; later(); } });
    Promise.resolve().then(function () { return api.getCapabilities(); }).then(function (c) {
      if (g !== gen) return;
      caps = {};
      ((c && c.fields) || []).forEach(function (f) { if (f && f.name) caps[f.name] = f.subscriptionMode || 'native'; });
      capsN = { fields: ((c && c.fields) || []).filter(function (f) { return f && f.name && !/^adas\./.test(f.name); }).length, actions: ((c && c.actions) || []).length, sys: ((c && c.systemFields) || []).length };
      var keys = F.vehicle.map(function (f) { return f.k; }).filter(function (k) { return caps[k] && caps[k] !== 'none'; });
      if (keys.length) api.vehicle.subscribe(keys, function (ev) {
        if (g !== gen || !ev || ev.error) return;
        if (ev.values && ev.type) { for (var k in ev.values) old[k] = ev.values[k] && ev.values[k].status === 'ok' ? ev.values[k] : null; }
        else if (ev.data) put(raw, ev.data);
        later();
      }).then(keep(g), function () {});
      if (caps['identity.vin']) api.vehicle.get(['identity.vin']).then(function (r) {
        if (g !== gen) return;
        var v = r && r.data ? leaf(r.data, 'identity.vin') : r && r.values && r.values['identity.vin'] ? r.values['identity.vin'].value : null;
        vin = typeof v === 'string' && v ? v : null; later();
      }, function () {});
      later();
    }, function () {});
    if (api.system && typeof api.system.subscribe === 'function') api.system.subscribe(F.system.map(function (f) { return f.k; }), function (ev) {
      if (g !== gen || !ev || ev.error || !ev.data) return;
      put(sysT, ev.data); later();
    }).then(keep(g), function () {});
    if (api.media) {
      if (api.media.get) api.media.get().then(function (m) { if (g === gen) { media = m; later(); } }, function () {});
      if (api.media.subscribe) api.media.subscribe(function (ev) { var m = ev && ev.values && ev.values.media; if (g === gen && m) { media = m; later(); } }).then(keep(g), function () {});
    }
  }

  var api2 = window.D3CarInfo = {
    open: function () {
      if (isOpen) return;
      isOpen = true;
      if (window.D3Set && D3Set.isOpen()) D3Set.close();
      if (window.D3DebugPanel) D3DebugPanel.close();
      root.classList.add('on');
      document.getElementById('app').classList.add('ci-open');
      if (window.D3Car && D3Car.aside) D3Car.aside('info', true);
      (window.D3Fields ? Promise.resolve() : load('uiplus-fields.js')).then(function () {
        if (!isOpen) return;
        F = window.D3Fields;
        build();
        start();
      }, function () { body.innerHTML = '<p class="ci-wait">字段目录没加载出来</p>'; });
    },
    close: function () {
      if (!isOpen) return;
      isOpen = false;
      stop();
      root.classList.remove('on');
      document.getElementById('app').classList.remove('ci-open');
      if (window.D3Car && D3Car.aside) D3Car.aside('info', false);
    },
    isOpen: function () { return isOpen; },
    subs: function () { return handles.length; } // 测试用：开着几个订阅
  };
})();
