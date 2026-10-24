/* demo3d 调试面板（只在调试宿主下有，debughost.js 第一次打开时加载）：卡片读到的车况、媒体、系统数据、宿主状态都在这里改，卡片的每次调用都记下来。
   选了哪项才改哪项：列表里点一项"调试"才出它的控件；不调了就回到默认值。勾了"自动"的项自己变（选项轮流切、数值来回扫）。
   样式同设置面板（.set / .tune：面板外面照样能拖车、切页）；打开时车让到面板旁边，不转到侧面（D3Car.debug）。全部 ES5。 */
(function () {
  'use strict';
  var D = window.D3Debug, C = window.D3DebugCatalog;
  var TABS = [['picked', '正在调试'], ['v', '车况'], ['m', '媒体'], ['s', '系统'], ['host', '宿主'], ['log', '记录']];
  var X = '<svg viewBox="0 0 24 24"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z"></path></svg>';
  var tab = 'picked', q = '', isOpen = false, open = {}, logT = 0;
  var F = { v: {}, s: {}, m: {} };
  C.vehicle.forEach(function (f) { F.v[f.k] = f; });
  C.system.forEach(function (f) { F.s[f.k] = f; });
  C.media.forEach(function (f) { F.m[f.k] = f; });
  F.m.track = { k: 'track', n: '调试歌', t: 'track', s: '调试宿主里的三首歌' };
  F.m.lyrics = { k: 'lyrics', n: '整首歌词', t: 'lyrics', s: 'media.getLyrics()' };

  var root = document.createElement('div');
  root.className = 'set tune dbg';
  root.id = 'dbg';
  root.innerHTML = '<div class="set-card"><div class="set-head"><b>调试面板</b><button type="button" class="set-x" data-a="close" aria-label="关闭">' + X + '</button></div>' +
    '<div class="seg many dbg-tabs">' + TABS.map(function (t) { return '<button type="button" data-a="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="set-body still" id="dbgBody"></div>' +
    '<div class="tune-foot"><span class="dbg-sum" id="dbgSum"></span><button type="button" class="act" data-a="resetAll">全部恢复默认</button></div></div>';
  document.getElementById('app').appendChild(root);
  var body = root.querySelector('#dbgBody');

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function enc(v) { return esc(JSON.stringify(v)); }
  /** 这一项能选的值：[[值, 名字], ...]（胎压状态按现在的 stateSource；系统里的布尔是 关 / 开） */
  function options(dom, f) {
    if (f.es) return f.es[D.get('v', f.k.replace(/state$/, 'stateSource'))] || f.es.tyre;
    if (f.e) return f.e;
    if (f.t === 'boolean') return [[false, '否'], [true, '是']];
    return null;
  }
  function show(dom, f, v) {
    if (v === null || v === undefined) return '无数据';
    var o = options(dom, f), x = (f.x || []).filter(function (p) { return p[0] === v; })[0];
    if (x) return x[1] + '（' + v + '）';
    if (o) { var hit = o.filter(function (p) { return p[0] === v; })[0]; if (hit) return hit[1] + (typeof v === 'number' ? '（' + v + '）' : ''); }
    if (Array.isArray(v)) return v.join(' 时 ') + ' 分';
    if (f.k === 'coverUrl' && typeof v === 'string') return v.slice(0, 5) === 'data:' ? '调试封面' : v;
    var u = f.u || '';
    if (f.c && dom === 'v') { var cu = D.get('v', f.k.slice(0, f.k.lastIndexOf('.') + 1) + f.c.k), ce = f.c.e.filter(function (p) { return p[0] === cu; })[0]; if (ce) u = ce[1]; }
    var s = typeof v === 'string' ? v : String(v);
    return s.length > 24 ? s.slice(0, 23) + '…' : s + (u ? ' ' + u : '');
  }

  // ================= 一项：没选是一行（名字、字段、现在的值），选上了出控件 =================
  function item(dom, k) {
    var f = F[dom][k];
    if (!f) return '';
    var on = D.isPicked(dom, k), v = D.get(dom, k), h = '<div class="dbg-it' + (on ? ' on' : '') + '" data-d="' + dom + '" data-k="' + esc(k) + '">';
    h += '<div class="dbg-top" data-a="pick"><i class="dbg-ck"></i><span class="dbg-name">' + esc(f.n) + '<small>' + esc(f.s || (dom === 'm' ? 'media.' + k : k)) + (dom === 'v' && f.m === 'none' ? ' · 只能查询' : '') + '</small></span><b class="dbg-val">' + esc(f.t === 'track' ? D.tracks()[D.track()].title : f.t === 'lyrics' ? (D.lyricsOff() ? '返回空' : '正常') : show(dom, f, v)) + '</b></div>';
    if (on) h += controls(dom, f, v);
    return h + '</div>';
  }
  function seg(a, list, cur, extra) {
    return '<div class="seg' + (list.length > 4 ? ' many' : '') + '">' + list.map(function (p) { return '<button type="button" data-a="' + a + '" data-v="' + enc(p[0]) + '"' + (JSON.stringify(p[0]) === JSON.stringify(cur) ? ' class="on"' : '') + (extra || '') + '>' + esc(p[1]) + '</button>'; }).join('') + '</div>';
  }
  function controls(dom, f, v) {
    var h = '<div class="dbg-ctl">';
    if (f.t === 'track') {
      h += '<div class="dbg-tracks">' + D.tracks().map(function (t, i) { return '<button type="button" class="dbg-trk' + (i === D.track() ? ' on' : '') + '" data-a="track" data-v="' + i + '"><img src="' + t.cover + '" alt=""><span>' + esc(t.title) + '</span></button>'; }).join('') + '</div>';
      return h + '</div>';
    }
    if (f.t === 'lyrics') return h + seg('lyr', [[false, '正常返回'], [true, '返回空（歌词还没准备好）']], D.lyricsOff()) + '</div>';
    var o = options(dom, f);
    if (o) h += seg('val', o, v);
    if (f.x) h += seg('val', f.x, v);
    if (f.t === 'array') { var a = Array.isArray(v) ? v : [0, 0]; h += '<div class="dbg-in"><input type="number" data-a="arr" data-i="0" value="' + a[0] + '"><span>时</span><input type="number" data-a="arr" data-i="1" value="' + a[1] + '"><span>分</span></div>'; }
    else if (f.t === 'number' && !o) {
      if (f.r) h += '<label class="rng"><input type="range" data-a="num" min="' + f.r[0] + '" max="' + f.r[1] + '" step="' + f.r[2] + '" value="' + (typeof v === 'number' ? v : f.r[0]) + '"></label>';
      h += '<div class="dbg-in"><input type="number" data-a="num" value="' + (typeof v === 'number' ? v : '') + '"' + (f.r ? ' step="' + f.r[2] + '"' : '') + '>' + (f.u ? '<span>' + esc(f.u) + '</span>' : '') + '</div>';
    } else if (f.t === 'number' && o && f.r) h += '<label class="rng"><input type="range" data-a="num" min="' + f.r[0] + '" max="' + f.r[1] + '" step="' + f.r[2] + '" value="' + (typeof v === 'number' ? v : f.r[0]) + '"></label>';
    else if (f.t === 'string' && !o) h += '<div class="dbg-in"><input type="text" data-a="str" value="' + esc(v === null || v === undefined ? '' : v) + '"></div>';
    if (f.k === 'coverUrl') h += seg('val', [[D.tracks()[D.track()].cover, '调试封面'], ['file:///no-such-cover.png', '打不开的地址']], v);
    if (f.c && dom === 'v') {
      var ck = f.k.slice(0, f.k.lastIndexOf('.') + 1) + f.c.k;
      h += '<span class="set-sl">' + (f.c.k === 'stateSource' ? '状态来源' : '单位') + '（同节点 ' + esc(f.c.k) + '）</span>' + seg('comp', f.c.e, D.get('v', ck), ' data-ck="' + esc(ck) + '"');
    }
    var canAuto = dom !== 'm' && (o || f.r);
    h += '<div class="dbg-acts"><button type="button" class="act" data-a="null"' + (v === null ? ' disabled' : '') + '>无数据（null）</button>' +
      (canAuto ? '<button type="button" class="act' + (D.autoOf(dom, f.k) ? ' on' : '') + '" data-a="auto">' + (D.autoOf(dom, f.k) ? '自动变化中' : '自动变化') + '</button>' : '') +
      '<button type="button" class="act" data-a="unpick">不调了</button></div>';
    if (canAuto && D.autoOf(dom, f.k)) h += seg('period', [[1, '快（1 秒）'], [3, '中（3 秒）'], [8, '慢（8 秒）']], D.autoOf(dom, f.k));
    return h + '</div>';
  }

  // ================= 各页 =================
  function groups(dom, list) {
    var by = {}, order = [], qq = q.toLowerCase();
    list.forEach(function (f) {
      if (qq && f.k.toLowerCase().indexOf(qq) < 0 && f.n.indexOf(q) < 0) return;
      if (!by[f.g]) { by[f.g] = []; order.push(f.g); }
      by[f.g].push(f);
    });
    var h = '<div class="dbg-search"><input type="text" id="dbgQ" placeholder="搜名字或字段，比如 车门、tyre" value="' + esc(q) + '"></div>';
    if (!order.length) return h + '<p class="dbg-empty">没有对得上的字段</p>';
    order.forEach(function (g) {
      var n = by[g].filter(function (f) { return D.isPicked(dom, f.k); }).length, op = qq || open[dom + g];
      h += '<button type="button" class="dbg-grp' + (op ? ' on' : '') + '" data-a="fold" data-v="' + esc(dom + g) + '">' + esc(g) + '<small>' + by[g].length + ' 项' + (n ? ' · 正在调 ' + n : '') + '</small></button>';
      if (op) h += by[g].map(function (f) { return item(dom, f.k); }).join('');
    });
    return h;
  }
  function picked() {
    var l = D.picked();
    if (!l.length) return '<p class="dbg-empty">还没有在调的项。<br>到"车况""媒体""系统"里点一项就开始调它，卡片马上读到新的值；选了哪项才改哪项，没选的保持默认（一台停着的车）。</p>';
    return l.map(function (dk) { return item(dk.charAt(0), dk.slice(2)); }).join('');
  }
  function media() {
    var m = D.get('m', 'playing');
    var h = '<div class="dbg-play"><button type="button" class="act pri" data-a="play">' + (m ? '暂停' : '播放') + '</button><span class="set-note">播放时像车机一样每换一句歌词推一次快照；歌、播放状态都可以在卡片的唱片机上按</span></div>';
    return h + ['track', 'lyrics'].concat(C.media.map(function (f) { return f.k; })).map(function (k) { return item('m', k); }).join('');
  }
  function host() {
    var o = D.host(), h = '';
    h += '<div class="set-row col"><span class="set-lb">卡片窗口（getInfo().hostType）<small>换了会像车机一样换成新页面（刷新），改过的值都还在</small></span>' +
      seg('htype', [['preview', '预览'], ['dualPip', '画中画'], ['floating', '悬浮窗'], ['fullscreen', '全屏']], o.type) + '</div>';
    h += '<div class="set-row"><span class="set-lb">车控权限<small>关着：80 项原生操作（含播放控制、播报）都返回 PERMISSION_DENIED</small></span><button type="button" class="sw' + (o.control ? ' on' : '') + '" data-a="hctl"><i></i></button></div>';
    h += '<div class="set-row col"><span class="set-lb">连接<small>断开：订阅收到 BACKEND_UNAVAILABLE、请求失败；恢复时补发完整快照</small></span>' + seg('honline', [[true, '正常'], [false, '断开']], o.online) + '</div>';
    h += '<div class="set-row col"><span class="set-lb">下几次订阅失败<small>' + (o.fail ? '还剩 ' + o.fail + ' 次' : '卡片切页、重订时用得上') + '</small></span>' + seg('hfail', [[0, '不失败'], [1, '下 1 次'], [3, '下 3 次']], o.fail > 1 ? 3 : o.fail) +
      seg('hcode', [['BUSY', 'BUSY'], ['RESOURCE_LIMIT', 'RESOURCE_LIMIT']], o.failCode) + '</div>';
    h += '<div class="set-row col"><span class="set-lb">卡片显示 / 藏起来<small>lifecycle.onVisibilityChange、uiplusvisibilitychange、&lt;html data-uiplus-visibility&gt;</small></span>' + seg('hvis', [[true, '显示'], [false, '藏起来']], o.visible) + '</div>';
    h += '<div class="set-row col"><span class="set-lb">全屏页系统栏<small>' + (o.type === 'fullscreen' ? '状态栏' + (o.bar ? '显示' : '收起') + '，导航栏' + (o.nav ? '显示' : '收起') + (!o.bar && !o.nav ? '（沉浸模式）' : '') : '不在全屏页：系统栏接口返回 UNSUPPORTED') + '</small></span></div>';
    h += '<div class="set-row col"><span class="set-lb">加载遮罩（page.loading）<small>' + (o.mask ? '开着' : '没开') + '</small></span></div>';
    h += '<div class="set-row col"><span class="set-lb">正在订阅<small>' + (o.subs.length ? o.subs.length + ' 个' : '没有') + '</small></span>' + o.subs.map(function (s) {
      return '<p class="dbg-sub"><b>' + { v: '车况', s: '系统数据', m: '媒体' }[s.dom] + '</b>' + (s.dom === 'm' ? '' : ' ' + s.n + ' 个字段：' + esc(s.fields.join('、'))) + '</p>';
    }).join('') + '</div>';
    return h;
  }
  function logs() {
    var l = D.log();
    var h = '<div class="dbg-play"><button type="button" class="act" data-a="clearLog"' + (l.length ? '' : ' disabled') + '>清空</button><span class="set-note">卡片对宿主的每次调用，最新的在上面</span></div>';
    if (!l.length) return h + '<p class="dbg-empty">还没有调用</p>';
    return h + l.slice(0, 120).map(function (e) {
      var d = new Date(e.t), t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
      return '<div class="dbg-log' + (e.ok ? '' : ' bad') + '"><span>' + t + '</span><b>' + esc(e.m) + '</b><code>' + esc(e.a) + '</code><em>' + esc(e.ok ? '→ ' + e.r : e.r + (e.msg ? '：' + e.msg : '')) + '</em></div>';
    }).join('');
  }
  function render() {
    var st = body.scrollTop, focus = document.activeElement && document.activeElement.id === 'dbgQ' ? document.activeElement.selectionStart : -1;
    body.innerHTML = tab === 'picked' ? picked() : tab === 'v' ? groups('v', C.vehicle) : tab === 's' ? groups('s', C.system) : tab === 'm' ? media() : tab === 'host' ? host() : logs();
    body.scrollTop = st;
    if (focus >= 0) { var qi = document.getElementById('dbgQ'); qi.focus(); qi.setSelectionRange(focus, focus); }
    var bs = root.querySelectorAll('.dbg-tabs button');
    for (var i = 0; i < bs.length; i++) bs[i].className = bs[i].getAttribute('data-v') === tab ? 'on' : '';
    sum();
  }
  function sum() {
    var n = D.picked().length, a = D.picked().filter(function (dk) { return D.autoOf(dk.charAt(0), dk.slice(2)); }).length;
    root.querySelector('#dbgSum').textContent = n ? '正在调 ' + n + ' 项' + (a ? '，' + a + ' 项自动变化' : '') : '没在调：都是默认值';
  }
  /** 只改值（拖滑块时不重画，不然滑块被换掉、拖不动） */
  function refresh() {
    var its = body.querySelectorAll('.dbg-it');
    for (var i = 0; i < its.length; i++) {
      var it = its[i], dom = it.getAttribute('data-d'), k = it.getAttribute('data-k'), f = F[dom][k], v = D.get(dom, k);
      if (!f || f.t === 'track' || f.t === 'lyrics') continue;
      it.querySelector('.dbg-val').textContent = show(dom, f, v);
      var bs = it.querySelectorAll('[data-a="val"]');
      for (var j = 0; j < bs.length; j++) bs[j].classList.toggle('on', bs[j].getAttribute('data-v') === JSON.stringify(v));
      var ins = it.querySelectorAll('input[data-a="num"]');
      for (var m = 0; m < ins.length; m++) if (document.activeElement !== ins[m] && typeof v === 'number') ins[m].value = v;
      var nb = it.querySelector('[data-a="null"]');
      if (nb) nb.disabled = v === null;
    }
    sum();
  }

  // ================= 交互 =================
  function target(e) { var it = e.target.closest('.dbg-it'); return it ? { dom: it.getAttribute('data-d'), k: it.getAttribute('data-k') } : null; }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return s; } }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]');
    if (!b || b.tagName === 'INPUT') return;
    var a = b.getAttribute('data-a'), v = parse(b.getAttribute('data-v')), t = target(e);
    if (a === 'close') return api.close();
    if (a === 'tab') { tab = v; q = ''; body.scrollTop = 0; render(); return; }
    if (a === 'resetAll') { D.resetAll(); render(); return; }
    if (a === 'fold') { open[v] = !open[v]; render(); return; }
    if (a === 'play') { D.set('m', 'playing', !D.get('m', 'playing')); render(); return; }
    if (a === 'clearLog') { D.clearLog(); render(); return; }
    if (a === 'htype') { D.setHost('type', v); return; }
    if (a === 'hctl') { D.setHost('control', !D.host().control); render(); return; }
    if (a === 'honline') { D.setHost('online', v); render(); return; }
    if (a === 'hfail') { D.setHost('fail', v); render(); return; }
    if (a === 'hcode') { D.setHost('failCode', v); render(); return; }
    if (a === 'hvis') { D.setHost('visible', v); render(); return; }
    if (!t) return;
    if (a === 'pick') { D.pick(t.dom, t.k, !D.isPicked(t.dom, t.k)); render(); return; }
    if (a === 'unpick') { D.pick(t.dom, t.k, false); render(); return; }
    if (a === 'val') { D.set(t.dom, t.k, v); render(); return; }
    if (a === 'comp') { D.set('v', b.getAttribute('data-ck'), v); render(); return; }
    if (a === 'null') { D.set(t.dom, t.k, null); render(); return; }
    if (a === 'auto') { D.auto(t.dom, t.k, D.autoOf(t.dom, t.k) ? 0 : 3); render(); return; }
    if (a === 'period') { D.auto(t.dom, t.k, v); render(); return; }
    if (a === 'track') { D.track(v); render(); return; }
    if (a === 'lyr') { D.lyricsOff(v); render(); return; }
  });
  root.addEventListener('input', function (e) {
    var a = e.target.getAttribute('data-a'), t = target(e);
    if (e.target.id === 'dbgQ') { q = e.target.value.replace(/^\s+|\s+$/g, ''); render(); return; }
    if (!t || a !== 'num' || e.target.type !== 'range') return;
    D.set(t.dom, t.k, parseFloat(e.target.value)); // 拖滑块：只改值，不重画
  });
  root.addEventListener('change', function (e) {
    var a = e.target.getAttribute('data-a'), t = target(e), val = e.target.value;
    if (!t) return;
    if (a === 'num' && e.target.type === 'number') { if (val !== '' && isFinite(+val)) D.set(t.dom, t.k, +val); refresh(); }
    if (a === 'str') { D.set(t.dom, t.k, val); refresh(); }
    if (a === 'arr') {
      var ins = e.target.parentNode.querySelectorAll('input'), h = +ins[0].value, m = +ins[1].value;
      if (isFinite(h) && isFinite(m)) D.set(t.dom, t.k, [h, m]);
      refresh();
    }
  });
  D.on(function (what) {
    if (!isOpen) return;
    if (what === 'log') { if (tab === 'log' && !logT) logT = setTimeout(function () { logT = 0; if (isOpen && tab === 'log') render(); }, 250); return; }
    if (what === 'host' || what === 'subs') { if (tab === 'host') render(); return; }
    if (what === 'media' && tab === 'm') { render(); return; }
    refresh(); // 自动变化、卡片调操作改了值
  });

  var api = window.D3DebugPanel = {
    open: function () {
      if (isOpen) return;
      isOpen = true;
      if (window.D3Set && D3Set.isOpen()) D3Set.close();
      if (window.D3CarInfo) D3CarInfo.close();
      render();
      root.classList.add('on');
      document.getElementById('app').classList.add('dbg-open');
      if (window.D3Car && D3Car.debug) D3Car.debug(true);
    },
    close: function () {
      if (!isOpen) return;
      isOpen = false;
      root.classList.remove('on');
      document.getElementById('app').classList.remove('dbg-open');
      if (window.D3Car && D3Car.debug) D3Car.debug(false);
    },
    isOpen: function () { return isOpen; },
    tab: function (t) { if (t) { tab = t; if (isOpen) render(); } return tab; }
  };
})();
