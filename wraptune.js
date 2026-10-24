/* demo3d 调整车模里的"贴纸、拉花"一页（window.D3WrapTune，cartune.js 把这一页的画面、点击、滑块交给它）。
   列表：加拉花（选模板：五种条纹、手绘线、五种图案）/ 加图片 / 加文字，下面是已经贴上的（小图 + 名字 + 贴在哪）；点一张进它的页。
   拉花的页：手绘线在车上画、画在侧面还是车顶（图案）、贴在哪一侧、颜色和配色（单色 / 交替 / 渐变）、形状参数；
   加工（折叠）：描边、虚线、两端渐隐；贴在车身 / 车窗；质感；其他。
   图片、文字的页：在车上点一下贴到那里，按住橙色小球拖着走；快捷位置（左侧、右侧、引擎盖、车顶、尾门、车头、车尾）、大小、横向拉伸、旋转、
   左右 / 上下翻转、包住（不弯 / 上下包 / 前后包）、另一侧也贴一张、贴在哪；微调（折叠）：前后上下左右、方向的水平角俯仰角；
   图片加工（折叠）：裁剪、去背景、调色、边缘渐隐、白边；文字：内容（多行）、字体（卡片带的 8 种 + 导入的 + 系统字体）、横排竖排、颜色、描边，
   文字效果（折叠）：字距、斜体、阴影、渐变色、两端渐隐、白边。都有质感（亮面 / 缎面 / 哑光 / 金属 / 镭射 + 光泽 + 金属感 + 透明度）、
   隐藏、复制一张、放到最上面 / 最下面、删除（连点两下）。
   改了马上交给车（D3Car.wraps，不重建车）；每一步改之前记一笔撤销（拖滑块、打字一次只记一步）。全部 ES5。 */
(function () {
  'use strict';
  var A = null; // cartune.js 给的：cfg()、remember(what)、render()、car()、page()、rng、sw、seg、esc、hex2hsl、hsl2hex、body
  var cur = null, sliding = false, typing = false, delArm = '', fontArm = '', fontsOn = false, raf = 0, drawing = false, folds = {};
  var BALLS = ['#16181b', '#ffffff', '#c8102e', '#1f5fbf', '#f2c200', '#a7adb4', '#d4a64a'];
  var ON = [['body', '车身'], ['glass', '车窗'], ['both', '都贴']];
  var FINS = [['gloss', '亮面'], ['satin', '缎面'], ['matte', '哑光'], ['metal', '金属'], ['holo', '镭射']];
  var PLACES = [['left', '左侧'], ['right', '右侧'], ['hood', '引擎盖'], ['roof', '车顶'], ['trunk', '尾门'], ['front', '车头'], ['rear', '车尾']];
  var CI = { c1: 0, c2: 1, c3: 2, ac: 3, gc: 4, oc: 5 }; // 颜色字段 → D3Wrap.colors 的第几个
  var DEG = Math.PI / 180;
  // 加拉花时选模板的小图：侧面的画车身轮廓、车顶的画俯视轮廓，拉花用强调色
  var CAR_S = '<path d="M6 30h7a6 6 0 0 1 12 0h28a6 6 0 0 1 12 0h9v-7l-6-3-9-8H31l-11 8-12 2-2 4z" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6" stroke-linejoin="round"/>';
  var CAR_T = '<rect x="27" y="3" width="26" height="34" rx="9" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6"/>';
  var AC = 'var(--acc)';
  var ICON = {
    belt: CAR_S + '<path d="M12 19.5L50 18.5c3 0 5 1 7 4l5 7" fill="none" stroke="' + AC + '" stroke-width="1.6"/><path d="M12 21.5L49 20.6c3 0 4.5 1 6.2 4l4.5 6.4" fill="none" stroke="' + AC + '" stroke-width="1.2"/>',
    slash: CAR_S + '<path d="M50 15l-7 14M55 15l-7 14" fill="none" stroke="' + AC + '" stroke-width="3"/>',
    rocker: CAR_S + '<path d="M24 27.5h30" stroke="' + AC + '" stroke-width="2.4"/><path d="M24 30.5h30" stroke="' + AC + '" stroke-width=".9"/>',
    race2: CAR_T + '<path d="M36 3v34M44 3v34" stroke="' + AC + '" stroke-width="4"/>',
    band: CAR_T + '<path d="M40 3v34" stroke="' + AC + '" stroke-width="8"/>',
    path: CAR_S + '<path d="M14 24c8-9 14 4 22-3s12-6 18 0 8 4 12 1" fill="none" stroke="' + AC + '" stroke-width="2" stroke-linecap="round"/>',
    pixel: CAR_S + '<g fill="' + AC + '"><rect x="16" y="18" width="3" height="3"/><rect x="20" y="18" width="3" height="3"/><rect x="16" y="22" width="3" height="3"/><rect x="20" y="22" width="3" height="3"/><rect x="24" y="20" width="3" height="3"/><rect x="28" y="18" width="3" height="3"/><rect x="31" y="23" width="2.4" height="2.4"/><rect x="37" y="20" width="2" height="2"/><rect x="44" y="23" width="1.6" height="1.6"/></g>',
    speed: CAR_S + '<path d="M16 17h30M22 21h34M14 25h24" stroke="' + AC + '" stroke-width="1.4" stroke-linecap="round"/>',
    checker: CAR_S + '<g fill="' + AC + '"><rect x="44" y="16" width="4" height="4"/><rect x="52" y="16" width="4" height="4"/><rect x="48" y="20" width="4" height="4"/><rect x="56" y="20" width="4" height="4"/><rect x="44" y="24" width="4" height="4"/><rect x="52" y="24" width="4" height="4"/><rect x="40" y="20" width="3" height="3"/></g>',
    flame: CAR_S + '<path d="M10 22c10-3 18 1 26-3-6 4-12 4-20 6 8 0 16 1 24-2-8 5-18 5-30 3z" fill="' + AC + '"/>',
    camo: CAR_S + '<g fill="' + AC + '" opacity=".85"><path d="M14 22c3-4 8-3 9 0s-4 5-7 4-4 0-2-4z"/><path d="M30 18c4-2 7 0 7 3s-5 3-7 2-2-3 0-5z"/><path d="M44 23c3-2 8-1 8 2s-6 3-8 2-2-2 0-4z"/></g>'
  };

  function L() { var c = A.cfg(); return c.wraps || (c.wraps = []); }
  function byId(id) { var l = L(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return { w: l[i], i: i }; return null; }
  function W() { return window.D3Wrap; }
  function newId() { var s; do { s = Math.random().toString(36).slice(2, 9); } while (byId(s)); return s; }
  function carLen() { var d = String((A.car().info() || {}).dims || '1,1,2.3').split(',').map(Number); return { hw: d[0], h: d[1], hl: d[2] }; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function pct(v) { return Math.round(v * 100) + '%'; }
  /** 改了：交给车（一帧最多一次）。now：马上（点按钮） */
  function apply(now) {
    if (slowT) { clearTimeout(slowT); slowT = 0; }
    if (now) { cancelAnimationFrame(raf); raf = 0; return A.car().wraps(L()); }
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; A.car().wraps(L()); });
  }
  /** 改的是贴图（要重画、去背景、描边）：拖着滑块、打字时停一下再交给车（车机上重画一张要几百毫秒，每动一下都画就卡住了）；松手马上画 */
  var slowT = 0, FAST = { wW: 1, wSx: 1, wRot: 1, wAlpha: 1, wRough: 1, wMetal: 1, wAt: 1, wDirA: 1 };
  function applySlow() { clearTimeout(slowT); slowT = setTimeout(function () { slowT = 0; apply(true); }, 160); }
  function name(w) {
    if (w.kind === 'stripe') return (W() ? W().TPL[w.tpl].name : '拉花');
    if (w.kind === 'img') return '图片';
    var t = String(w.text || '').replace(/\n/g, ' ');
    return '文字「' + A.esc(t.slice(0, 14)) + (t.length > 14 ? '…' : '') + '」';
  }
  function where(w) {
    var s = [];
    if (w.kind === 'stripe') s.push(W() && W().topOf(w) ? '车顶' : { L: '左侧', R: '右侧', both: '两侧' }[w.side || 'both']);
    else {
      var d = w.dir, a = Math.abs(d[0]) >= Math.abs(d[2]) && Math.abs(d[0]) >= Math.abs(d[1]) ? (d[0] > 0 ? '左侧' : '右侧') : Math.abs(d[1]) >= Math.abs(d[2]) ? (d[1] > 0 ? '车顶' : '车底') : d[2] > 0 ? '车头' : '车尾';
      s.push(a + (w.both ? '（两侧）' : '') + (w.wm ? '，包住' : ''));
    }
    if (w.on === 'glass') s.push('车窗'); else if (w.on === 'both') s.push('车身和车窗');
    if (w.hide) s.push('已隐藏');
    return s.join(' · ');
  }
  /** 镜头转过去看这张贴纸 */
  function lookAt(w) {
    if (w.kind === 'stripe') {
      if (W() && W().topOf(w)) A.car().look(0.55, 0.85); else A.car().look(w.side === 'R' ? -Math.PI / 2 : Math.PI / 2, 0.12);
      return;
    }
    var d = w.dir;
    A.car().look(Math.atan2(d[0], d[2]), Math.max(0.08, Math.min(0.9, Math.asin(Math.max(-1, Math.min(1, d[1]))) * 0.9 + 0.1)));
  }

  // ================= 画面 =================
  function head(title, n, back) {
    return '<div class="tpage-h"><button type="button" class="tback" data-a="' + (back || 'back') + '">‹ ' + (back ? '贴纸' : '全部') + '</button><b>' + title + '</b>' +
      (n !== undefined ? '<span class="trow-n' + (n ? ' ok' : '') + '">' + n + '</span>' : '') + '</div>';
  }
  function page() {
    if (!W()) { A.car().wrapLib().then(function () { if (A.page() === 'wrap') A.render(); }); return head('贴纸、拉花') + '<div class="trow-tip">正在准备…</div>'; }
    if (cur === 'add') return addPage();
    var it = cur && byId(cur);
    if (!it) { cur = null; return listPage(); }
    return it.w.kind === 'stripe' ? stripePage(it.w) : freePage(it.w);
  }
  function listPage() {
    var l = L(), h = head('贴纸、拉花', l.length ? l.length + ' 张' : '没有');
    h += '<div class="acts"><button type="button" class="act pri" data-a="wAddS">+ 拉花</button><button type="button" class="act pri" data-a="wAddI">+ 图片</button><button type="button" class="act pri" data-a="wAddT">+ 文字</button></div>';
    if (!l.length) return h + '<div class="trow-tip">还没有贴纸。拉花有现成的条纹、图案，也能在车上自己画；图片（痛车图）、文字加上以后，在车上点哪里就贴到哪里，还能顺着车身包过去。导出车模包时一起带走。</div>';
    h += '<div class="wlist">' + l.slice().reverse().map(function (w) {
      var th = w.kind === 'stripe' ? '' : A.car().wrapThumb(w, 120); // 拉花缩成小图细线就没了：用模板的示意图
      return '<button type="button" class="trow wrow" data-a="wOpen" data-v="' + w.id + '"><span class="wthumb' + (w.kind === 'stripe' ? ' icon' : '') + '">' +
        (w.kind === 'stripe' ? '<svg viewBox="0 0 80 40">' + ICON[w.tpl] + '</svg>' : th ? '<img src="' + th + '" alt="">' : '') + '</span>' +
        '<span class="set-lb">' + name(w) + '<small>' + where(w) + '</small></span><i class="trow-go"></i></button>';
    }).join('') + '</div>';
    return h + '<div class="trow-tip">排在上面的盖住下面的。贴在车门、引擎盖、尾门上的，开门开盖时跟着走；导出车模包时一起带走。</div>';
  }
  function addPage() {
    var h = head('加拉花', undefined, 'wBack'), T = W().TPL;
    h += '<div class="set-group">条纹</div>' + tpls(['belt', 'slash', 'rocker', 'race2', 'band']);
    h += '<div class="set-group">自己画</div>' + tpls(['path']);
    h += '<div class="set-group">图案</div>' + tpls(['pixel', 'speed', 'checker', 'flame', 'camo']);
    return h;
    function tpls(ks) {
      return '<div class="wtpl">' + ks.map(function (k) {
        return '<button type="button" class="wtpl-b" data-a="wTpl" data-v="' + k + '"><svg viewBox="0 0 80 40">' + ICON[k] + '</svg><b>' + T[k].name + '</b><small>' + T[k].desc + '</small></button>';
      }).join('') + '</div>';
    }
  }
  /** 折叠的一组：标题按钮（点了展开 / 收起）+ 展开时的内容 */
  function fold(key, label, body) {
    return '<div class="acts"><button type="button" class="act wfold' + (folds[key] ? ' on' : '') + '" data-a="wFold" data-v="' + key + '">' + (folds[key] ? '收起' + label : label + ' ›') + '</button></div>' + (folds[key] ? body() : '');
  }
  /** 一行颜色：几个小球 + 自定义（色相饱和度亮度） */
  function colorRow(w, k, label) {
    var c = W().colors(w)[CI[k]].toLowerCase(), custom = BALLS.indexOf(c) < 0;
    var h = '<span class="set-sl">' + label + '</span><div class="balls lballs">' + BALLS.map(function (b) {
      return '<button type="button" class="ball' + (b === c ? ' on' : '') + '" data-a="wC" data-v="' + k + ':' + b + '" style="--c:' + b + '" aria-label="' + b + '"></button>';
    }).join('') + '<button type="button" class="ball custom' + (custom ? ' on' : '') + '" data-a="wCx" data-v="' + k + '" style="--c:' + c + '" aria-label="自定义"></button></div>';
    if (custom) {
      var a = A.hex2hsl(c);
      h += '<div class="hsl on" style="--hue:' + a[0] + '">' + [['h', '色相', 360], ['s', '饱和度', 100], ['l', '亮度', 100]].map(function (q, i) {
        return '<label class="rng"><span>' + q[1] + '</span><input type="range" min="0" max="' + q[2] + '" step="1" value="' + a[i] + '" data-n="wHsl" data-c="' + q[0] + '" data-k="' + k + '" style="--p:' + (a[i] / q[2] * 100).toFixed(1) + '%"><b>' + a[i] + (i ? '%' : '°') + '</b></label>';
      }).join('') + '</div>';
    }
    return h;
  }
  /** 参数的显示：车长 / 车高的比例显示成米，毫米、厘米、度、百分比 */
  function fmt(u) {
    var d = carLen();
    return function (v) {
      if (u === 'n' || u === 'seed') return v + '';
      if (u === 'mm') return v + ' 毫米';
      if (u === 'cm') return v + ' 厘米';
      if (u === 'deg') return (v === 0 ? '不拐' : v + '°');
      if (u === 'pct' || u === 'frac') return pct(v);
      if (u === 'pos') return (v * 2 * d.hl).toFixed(2) + ' 米';
      if (u === 'hgt') return (v * d.h).toFixed(2) + ' 米';
      if (u === 'dh') return (v > 0 ? '高 ' : v < 0 ? '低 ' : '') + Math.abs(v * d.h * 100).toFixed(0) + ' 厘米';
      return v + '';
    };
  }
  function sl(n, label, min, max, step, v, f, k) { return A.rng(n, label, min, max, step, v, f, k !== undefined ? ' data-k="' + k + '"' : ''); }
  /** 质感、透明度 */
  function finRows(w) {
    var F = W().FIN[w.fin || 'gloss'];
    return '<div class="set-group">质感</div>' + A.seg('wFin', FINS, w.fin || 'gloss').replace('class="seg"', 'class="seg many"') +
      '<div class="set-row col">' + sl('wRough', '光泽', 0, 1, 0.01, 1 - (w.rough !== undefined ? w.rough : F[0]), function (v) { return pct(v); }) +
      sl('wMetal', '金属感', 0, 1, 0.01, w.metal !== undefined ? w.metal : F[1], pct) +
      sl('wAlpha', '透明度', 0.1, 1, 0.05, w.alpha || 1, pct) + '</div>' +
      (w.fin === 'holo' ? '<div class="trow-tip">镭射：随角度变色的薄膜效果，转着看最明显。</div>' : '');
  }
  function common(w) {
    return '<div class="set-group">其他</div><div class="acts"><button type="button" class="act" data-a="wHide">' + (w.hide ? '显示' : '隐藏') + '</button><button type="button" class="act" data-a="wDup">复制一张</button>' +
      '<button type="button" class="act" data-a="wTop">放到最上面</button><button type="button" class="act" data-a="wBottom">放到最下面</button>' +
      '<button type="button" class="act" data-a="wDel">' + (delArm === w.id ? '再点一次删除' : '删除') + '</button></div>';
  }
  /** 描边、虚线、两端渐隐（拉花、文字共用；unit：拉花的描边按毫米，文字按长边的百分比） */
  function fxRows(w, stripe) {
    var h = '<div class="set-row col">' + sl('wOut', stripe ? '描边' : '白边', 0, stripe ? 40 : 10, stripe ? 1 : 0.1, w.out || 0, function (v) { return v ? (stripe ? v + ' 毫米' : v + '%') : '不加'; }) + '</div>';
    if (w.out) h += colorRow(w, 'oc', stripe ? '描边颜色' : '白边颜色');
    if (stripe) {
      h += A.sw('wDash', '虚线', !!w.dash, '沿着走向一段一段切开');
      if (w.dash) h += '<div class="set-row col">' + sl('wDashP', '每段长', 0.5, 120, 0.5, w.dash[0], function (v) { return v + ' 厘米'; }, 0) + sl('wDashP', '间隔', 0.5, 120, 0.5, w.dash[1], function (v) { return v + ' 厘米'; }, 1) + '</div>';
    }
    var fd = w.fd || [0, 0];
    h += '<div class="set-row col">' + sl('wFd', '开头渐隐', 0, 0.5, 0.01, fd[0], pct, 0) + sl('wFd', '结尾渐隐', 0, 0.5, 0.01, fd[1], pct, 1) + '</div>';
    return h;
  }
  /** 配色：单色 / 交替两色（几道线的）/ 渐变 */
  function mixRows(w, lines) {
    var mode = w.grad ? 'grad' : w.alt ? 'alt' : 'one', h = '<span class="set-sl">配色</span>' + A.seg('wMix', lines ? [['one', '单色'], ['alt', '交替两色'], ['grad', '渐变']] : [['one', '单色'], ['grad', '渐变']], mode);
    if (mode === 'alt') h += colorRow(w, 'ac', '另一种颜色');
    if (mode === 'grad') h += A.seg('wGradDir', [['a', '顺着走向'], ['c', '横着']], w.grad) + colorRow(w, 'gc', '渐变到');
    return h;
  }
  function stripePage(w) {
    var t = W().TPL[w.tpl], p = W().params(w), top = W().topOf(w), h = head(t.name, w.hide ? '已隐藏' : undefined, 'wBack');
    h += '<div class="trow-tip">' + t.desc + (top ? '从上往下投，玻璃上默认不贴。' : '按车长、车高画，换了车也大致在同样的位置；右侧是左侧照镜子（车头那头一样）。') + '</div>';
    if (w.tpl === 'path') {
      h += '<div class="acts"><button type="button" class="act' + (drawing ? ' on pri' : ' pri') + '" data-a="wDraw">' + (drawing ? '取消画线' : w.path ? '重画一条' : '在车上画一条线') + '</button></div>';
      h += '<div class="trow-tip">' + (drawing ? '按住车身侧面（或车顶）拖着画一笔，松手就贴上；按在车外面拖还是转车。' : w.path ? '画在' + (top ? '车顶' : '侧面') + '。不满意就"重画一条"。' : '还没画：点上面的按钮，再按住车身拖着画。') + '</div>';
    }
    if (t.frame === 'any' && w.tpl !== 'path') h += '<span class="set-sl">画在</span>' + A.seg('wPf', [['side', '侧面'], ['top', '车顶']], top ? 'top' : 'side');
    if (!top) h += '<span class="set-sl">贴在</span>' + A.seg('wSide', [['L', '左侧'], ['R', '右侧'], ['both', '两侧']], w.side || 'both');
    h += colorRow(w, 'c1', t.c3 ? '外面的颜色' : '颜色');
    var c2on = t.c2 && (w.tpl !== 'rocker' || p.fine) && (w.tpl !== 'race2' || p.edge > 0 || p.mid) && (w.tpl !== 'band' || p.edge > 0) && (w.tpl !== 'pixel' || p.mix > 0);
    if (c2on) h += colorRow(w, 'c2', t.c2);
    if (t.c3) h += colorRow(w, 'c3', t.c3);
    h += mixRows(w, !!t.lines);
    h += '<div class="set-group">形状</div><div class="set-row col">';
    t.params.forEach(function (q) {
      if (q[6] === 'sw') { h += '</div>' + A.sw('wSw', q[1], !!p[q[0]], '', q[0]) + '<div class="set-row col">'; return; }
      if (w.tpl === 'rocker' && !p.fine && (q[0] === 'fw' || q[0] === 'fg')) return;
      if (w.tpl === 'race2' && !p.mid && q[0] === 'mw') return;
      if (w.tpl === 'belt' && p.drop < 3 && (q[0] === 'dlen' || q[0] === 'round')) return;
      if ((w.tpl === 'belt' || w.tpl === 'path') && p.n < 2 && (q[0] === 'gap' || q[0] === 'lwr')) return;
      h += A.rng('wP', q[1], q[2], q[3], q[4], p[q[0]], fmt(q[6]), ' data-k="' + q[0] + '" data-u="' + q[6] + '"');
    });
    h += '</div><div class="acts"><button type="button" class="act" data-a="wReset">形状恢复默认</button>' + (p.seed !== undefined ? '<button type="button" class="act" data-a="wSeed">换个花样</button>' : '') + '</div>';
    h += fold('fx', '描边、虚线、渐隐', function () { return fxRows(w, true); });
    h += '<span class="set-sl">贴在</span>' + A.seg('wOn', ON, w.on || 'body');
    return h + finRows(w) + common(w);
  }
  function freePage(w) {
    var h = head(w.kind === 'img' ? '图片' : '文字', w.hide ? '已隐藏' : undefined, 'wBack'), d = carLen();
    h += '<div class="trow-tip">在车上点一下，贴到那里（侧面、车顶、车头、车尾差不多正对的会摆正）；按住中间的橙色小球拖着走。</div>';
    if (w.kind === 'img') h += '<div class="acts"><button type="button" class="act" data-a="wImg">换一张图片</button></div>';
    else {
      h += '<span class="set-sl">内容<small>回车换行</small></span><textarea class="wtext" data-n="wText" rows="2" maxlength="120" placeholder="打字，中文、英文都行">' + A.esc(w.text || '') + '</textarea>';
      h += '<span class="set-sl">字体<small>卡片带的字体只有英文、数字，中文字用系统字体</small></span><div class="wfonts" id="wFonts">' + fontsHtml(w) + '</div>';
      h += A.seg('wVert', [['0', '横排'], ['1', '竖排']], w.vert ? '1' : '0');
      h += colorRow(w, 'c1', '字的颜色');
      h += '<span class="set-sl">描边</span>' + A.seg('wStroke', [['0', '不描边'], ['1', '细'], ['2', '粗']], String(w.stroke || 0));
      if (w.stroke) h += colorRow(w, 'c2', '描边颜色');
    }
    // 摆放
    h += '<div class="set-group">摆放</div><span class="set-sl">贴到</span><div class="acts wplaces">' + PLACES.map(function (q) { return '<button type="button" class="act" data-a="wPlace" data-v="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="set-row col">' + sl('wW', '大小', 0.05, r2(Math.min(8, 2.2 * d.hl)), 0.01, w.w, function (v) { return v.toFixed(2) + ' 米'; }) +
      sl('wSx', '横向拉伸', 0.2, 5, 0.01, w.sx || 1, function (v) { return v === 1 ? '原比例' : v.toFixed(2) + ' 倍'; }) +
      sl('wRot', '旋转', -180, 180, 1, Math.round(w.rot || 0), function (v) { return v + '°'; }) + '</div>';
    h += A.sw('wFlip', '左右翻转', !!w.flip, '') + A.sw('wFv', '上下翻转', !!w.fv, '');
    h += '<span class="set-sl">包住<small>一张图顺着车身弯过去</small></span>' + A.seg('wWm', [['', '不弯'], ['v', '上下包'], ['h', '前后包']], w.wm || '');
    if (w.wm) h += '<div class="trow-tip">' + (w.wm === 'v' ? '上下包：侧面的图翻过肩线盖到车顶、引擎盖上（再大一点能包到另一侧）。' : '前后包：绕过车头、车尾的转角，一张图从车头一直到侧面。') + '把"大小"调大看效果。</div>';
    h += A.sw('wBoth', '另一侧也贴一张', !!w.both, w.kind === 'text' ? '对称的位置，字照样是正的' : '对称的位置');
    if (w.both && w.kind === 'img') h += A.seg('wBothM', [['mirror', '照镜子'], ['same', '不照镜子']], w.both);
    h += '<span class="set-sl">贴在</span>' + A.seg('wOn', ON, w.on || 'body');
    h += fold('fine', '微调位置、方向', function () {
      var az = Math.round(Math.atan2(w.dir[0], w.dir[2]) / DEG), el = Math.round(Math.asin(Math.max(-1, Math.min(1, w.dir[1]))) / DEG), m = function (v) { return v.toFixed(2) + ' 米'; };
      return '<div class="set-row col">' + sl('wAt', '前后', -r2(d.hl * 1.1), r2(d.hl * 1.1), 0.005, w.at[2], m, 2) + sl('wAt', '上下', 0, r2(d.h * 1.1), 0.005, w.at[1], m, 1) +
        sl('wAt', '左右', -r2(d.hw * 1.1), r2(d.hw * 1.1), 0.005, w.at[0], m, 0) +
        sl('wDirA', '水平角', -180, 180, 1, az, function (v) { return v + '°'; }, 'az') + sl('wDirA', '俯仰角', -89, 89, 1, el, function (v) { return v + '°'; }, 'el') + '</div>' +
        '<div class="trow-tip">方向是贴纸朝外的方向（水平 0° 朝车头、90° 朝左侧；俯仰 90° 朝上）。贴在斜面上时转一点，图就正了。</div>';
    });
    if (w.kind === 'img') h += fold('img', '图片加工', function () { return imgRows(w); });
    else h += fold('txt', '文字效果', function () { return txtRows(w); });
    return h + finRows(w) + common(w);
  }
  function imgRows(w) {
    var cr = w.crop || [0, 0, 0, 0], a = w.adj || [1, 1, 1, 0], k = w.key, h = '<span class="set-sl">裁剪</span><div class="set-row col">';
    [['左边', 0], ['右边', 1], ['上边', 2], ['下边', 3]].forEach(function (q) { h += sl('wCrop', '裁掉' + q[0], 0, 0.45, 0.01, cr[q[1]], pct, q[1]); });
    h += '</div>' + A.sw('wKey', '去背景', !!k, '白底、纯色底的图：把背景色变透明');
    if (k) {
      var kc = k.c || 'auto';
      h += '<span class="set-sl">背景颜色</span><div class="balls lballs"><button type="button" class="ball auto' + (kc === 'auto' ? ' on' : '') + '" data-a="wKeyC" data-v="auto" style="--c:#cfd3da" aria-label="自动"></button>' +
        BALLS.map(function (b) { return '<button type="button" class="ball' + (b === kc ? ' on' : '') + '" data-a="wKeyC" data-v="' + b + '" style="--c:' + b + '" aria-label="' + b + '"></button>'; }).join('') + '</div>' +
        '<div class="trow-tip">第一个是自动（取图片四个角的颜色）。</div><div class="set-row col">' +
        sl('wKeyT', '容差', 0, 0.6, 0.01, k.tol === undefined ? 0.15 : k.tol, pct, 'tol') + sl('wKeyT', '边缘柔和', 0, 0.4, 0.01, k.soft === undefined ? 0.08 : k.soft, pct, 'soft') + '</div>' +
        A.sw('wKeyE', '只去外面连着的', k.edge !== false, '角色身上和背景同色的地方不挖掉');
    }
    h += '<span class="set-sl">调色</span><div class="set-row col">' + sl('wAdj', '亮度', 0.3, 2, 0.01, a[0], pct, 0) + sl('wAdj', '对比度', 0.3, 2, 0.01, a[1], pct, 1) +
      sl('wAdj', '饱和度', 0, 3, 0.01, a[2], pct, 2) + sl('wAdj', '色相', -180, 180, 1, a[3], function (v) { return v + '°'; }, 3) + '</div>';
    h += '<div class="set-row col">' + sl('wEf', '边缘渐隐', 0, 0.5, 0.01, w.ef || 0, function (v) { return v ? pct(v) : '不渐隐'; }) + '</div>';
    h += '<div class="set-row col">' + sl('wOut', '白边', 0, 8, 0.1, w.out || 0, function (v) { return v ? v + '%' : '不加'; }) + '</div>';
    if (w.out) h += colorRow(w, 'oc', '白边颜色');
    return h + '<div class="acts"><button type="button" class="act" data-a="wImgReset">加工全部恢复</button></div>';
  }
  function txtRows(w) {
    var h = '<div class="set-row col">' + sl('wLs', '字距', -0.3, 1, 0.01, w.ls || 0, function (v) { return v ? Math.round(v * 100) + '%' : '正常'; }) + '</div>';
    h += A.sw('wIt', '斜体', !!w.it, '');
    h += A.sw('wSh', '阴影', !!w.sh, '');
    if (w.sh) h += colorRow({ c1: w.sh.c || '#000000' }, 'c1', '阴影颜色').replace(/data-a="wC" data-v="c1:/g, 'data-a="wShC" data-v="').replace('data-a="wCx" data-v="c1"', 'data-a="wShCx" data-v="sh"').replace(/data-n="wHsl"/g, 'data-n="wShHsl"') +
      '<div class="set-row col">' + sl('wShP', '往右', -0.4, 0.4, 0.01, w.sh.x || 0, pct, 'x') + sl('wShP', '往下', -0.4, 0.4, 0.01, w.sh.y || 0, pct, 'y') + sl('wShP', '模糊', 0, 0.4, 0.01, w.sh.b || 0, pct, 'b') + '</div>';
    h += mixRows(w, false);
    return h + fxRows(w, false);
  }
  var userFonts = [];
  function fontsHtml(w) {
    var f = w.font || 'sys', b = (window.D3WrapFonts || []).map(function (x) { return ['b:' + x.id, x.name, 'D3W-' + x.id]; });
    var list = [['sys', '系统字体', ''], ['sysb', '系统粗体', '']].concat(b, userFonts.map(function (x) { return ['u:' + x.id, x.name, 'D3U-' + x.id]; }));
    return list.map(function (x) {
      var del = x[0].charAt(0) === 'u' && x[0] === f ? '<i class="wfont-x" data-a="wFontDel" data-v="' + x[0].slice(2) + '">' + (fontArm === x[0].slice(2) ? '再点删除' : '删除') + '</i>' : '';
      return '<button type="button" class="tag wfont' + (x[0] === f ? ' on' : '') + '" data-a="wFont" data-v="' + x[0] + '"' + (x[2] ? ' style="font-family:\'' + x[2] + '\',sans-serif"' : x[0] === 'sysb' ? ' style="font-weight:800"' : '') + '>' + A.esc(x[1]) + del + '</button>';
    }).join('') + '<button type="button" class="tag" data-a="wFontAdd">+ 导入字体</button>';
  }
  /** 字体列表要用各自的字体显示：第一次进文字页加载卡片带的字体和导入的字体，好了再画一遍 */
  function loadFonts() {
    if (fontsOn) return;
    fontsOn = true;
    Promise.all([W().builtins(), D3Model.fontList()]).then(function (r) {
      userFonts = r[1];
      return Promise.all(r[0].map(function (x) { return W().loadFont('b:' + x.id); }).concat(userFonts.map(function (x) { return W().loadFont('u:' + x.id); })));
    }).then(function () { if (A.page() === 'wrap') A.render(); }, function () {});
  }

  // ================= 操作 =================
  function add(w) {
    A.remember('加贴纸');
    w.id = newId();
    L().push(w);
    cur = w.id; delArm = '';
    lookAt(w);
    A.car().wrapEdit(w.kind === 'stripe' ? '' : w.id);
    A.render(true);
    return apply(true);
  }
  function open(id) {
    cur = id; delArm = '';
    setDraw(false);
    var it = byId(id);
    if (it) { lookAt(it.w); A.car().wrapEdit(it.w.kind === 'stripe' ? '' : id); if (it.w.kind === 'text') loadFonts(); }
    A.render(true);
  }
  function setDraw(on) { drawing = !!on; A.car().wrapDraw(drawing); }
  function pickFile(id, fn) {
    var f = document.getElementById(id);
    f.value = '';
    f.onchange = function () { if (f.files && f.files[0]) fn(f.files[0]); };
    f.click(); // 要在点的这一下里弹（异步弹浏览器会拦）
  }
  function addImage(replace) {
    pickFile('fileWrap', function (file) {
      D3.toast('正在处理图片…', 20000);
      A.car().wrapLib().then(function () { return W().importImage(file); }).then(function (ref) {
        D3.toast(null);
        if (replace) { var it = byId(cur); if (!it) return; A.remember('换图片'); it.w.img = ref; A.render(); return apply(true); }
        var pl = A.car().wrapPlace();
        return add({ kind: 'img', img: ref, at: pl.at, dir: pl.dir, w: Math.round(carLen().hl * 2 * 0.3 * 100) / 100 });
      }).then(null, function (e) { D3.toast(e && e.user ? e.message : '图片读不了：' + (e && e.message || ''), 4000); });
    });
  }
  function addFont() {
    pickFile('fileFont', function (file) {
      if (file.size > 30 * 1024 * 1024) { D3.toast('字体文件太大（超过 30MB）', 4000); return; }
      D3.toast('正在导入字体…', 20000);
      D3Model.readFile(file).then(function (f) {
        return W().checkFont(f.buf).then(function () { return D3Model.fontPut(file.name.replace(/\.(ttf|otf|woff2?|ttc)$/i, ''), new Uint8Array(f.buf)); });
      }).then(function (ft) {
        return D3Model.fontList().then(function (l) { userFonts = l; return W().loadFont('u:' + ft.id); }).then(function () {
          var it = byId(cur);
          if (it && it.w.kind === 'text') { A.remember('字体'); it.w.font = 'u:' + ft.id; }
          D3.toast('字体导入好了：' + ft.name, 2500);
          A.render(); apply(true);
        });
      }).then(null, function () { D3.toast('这个文件不是能用的字体（支持 TTF、OTF、WOFF、WOFF2）', 4000); });
    });
  }
  /** 方向（单位向量）↔ 水平角、俯仰角（度） */
  function dirOf(az, el) { var a = az * DEG, e = el * DEG; return [Math.round(Math.cos(e) * Math.sin(a) * 1000) / 1000, Math.round(Math.sin(e) * 1000) / 1000, Math.round(Math.cos(e) * Math.cos(a) * 1000) / 1000]; }
  /** 点击：处理了返回 true */
  function click(a, v) {
    if (!/^w[A-Z]/.test(a) && a !== 'back') return false;
    if (a === 'back') { if (!cur) return false; cur = null; setDraw(false); A.car().wrapEdit(''); A.render(true); return true; }
    if (a === 'wBack') { cur = null; delArm = ''; setDraw(false); A.car().wrapEdit(''); A.car().look(1.45, 0.12); A.render(true); return true; }
    if (a === 'wAddS') { cur = 'add'; A.render(true); return true; }
    if (a === 'wTpl') {
      var t = W().TPL[v], w0 = { kind: 'stripe', tpl: v, p: {} };
      if (t.frame !== 'top') w0.side = v === 'path' ? 'L' : 'both';
      if (v === 'race2' || v === 'band') w0.on = undefined;
      add(w0);
      if (v === 'path') { setDraw(true); A.render(); }
      return true;
    }
    if (a === 'wAddI') { addImage(false); return true; }
    if (a === 'wAddT') {
      var pl = A.car().wrapPlace();
      add({ kind: 'text', text: 'Build Your Dreams', font: 'b:kaushan', at: pl.at, dir: pl.dir, w: Math.round(carLen().hl * 2 * 0.32 * 100) / 100 });
      loadFonts();
      return true;
    }
    if (a === 'wOpen') { open(v); return true; }
    if (a === 'wFontAdd') { addFont(); return true; }
    if (a === 'wFold') { folds[v] = !folds[v]; A.render(); return true; }
    var it = byId(cur);
    if (!it) return true;
    var w = it.w;
    if (a === 'wImg') { addImage(true); return true; }
    if (a === 'wDraw') { setDraw(!drawing); A.render(); return true; }
    if (a === 'wDel') {
      if (delArm !== w.id) { delArm = w.id; A.render(); setTimeout(function () { if (delArm === w.id) { delArm = ''; if (A.page() === 'wrap') A.render(); } }, 3000); return true; }
      A.remember('删贴纸');
      L().splice(it.i, 1);
      cur = null; delArm = '';
      setDraw(false);
      A.car().wrapEdit('');
      A.render(true);
      apply(true);
      return true;
    }
    if (a === 'wFontDel') {
      if (fontArm !== v) { fontArm = v; A.render(); setTimeout(function () { if (fontArm === v) { fontArm = ''; if (A.page() === 'wrap') A.render(); } }, 3000); return true; }
      fontArm = '';
      D3Model.fontDel(v).then(D3Model.fontList).then(function (l) { userFonts = l; A.remember('字体'); w.font = 'sys'; A.render(); apply(true); D3.toast('删掉了这个字体', 2000); });
      return true;
    }
    if (a === 'wDup') { // 复制一张：稍微错开一点，接着调
      var cp = JSON.parse(JSON.stringify(w));
      if (cp.at) cp.at = [cp.at[0], Math.round((cp.at[1] + 0.12) * 1000) / 1000, cp.at[2]];
      A.remember('复制贴纸');
      cp.id = newId();
      L().splice(it.i + 1, 0, cp);
      open(cp.id);
      apply(true);
      D3.toast('复制了一张（往上错开一点）', 1600);
      return true;
    }
    A.remember('贴纸');
    if (a === 'wSide') w.side = v;
    else if (a === 'wPf') w.pf = v;
    else if (a === 'wC') { var c = v.split(':'); w[c[0]] = c[1]; }
    else if (a === 'wCx') { var o = W().colors(w)[CI[v]], h3 = A.hex2hsl(o); if (BALLS.indexOf(o.toLowerCase()) >= 0) w[v] = A.hsl2hex(h3[0], h3[1], h3[2] > 50 ? h3[2] - 1 : h3[2] + 1); if (BALLS.indexOf(w[v]) >= 0) w[v] = '#fefefe'; }
    else if (a === 'wSw') { w.p = w.p || {}; w.p[v] = W().params(w)[v] ? 0 : 1; }
    else if (a === 'wReset') { w.p = {}; }
    else if (a === 'wSeed') { w.p = w.p || {}; w.p.seed = (W().params(w).seed % 99) + 1; }
    else if (a === 'wMix') { delete w.alt; delete w.grad; if (v === 'alt') w.alt = true; if (v === 'grad') w.grad = 'a'; }
    else if (a === 'wGradDir') w.grad = v;
    else if (a === 'wDash') { if (w.dash) delete w.dash; else w.dash = [30, 15]; }
    else if (a === 'wFin') { w.fin = v; delete w.rough; delete w.metal; if (v === 'gloss') delete w.fin; }
    else if (a === 'wHide') { if (w.hide) delete w.hide; else w.hide = true; }
    else if (a === 'wTop') { L().splice(it.i, 1); L().push(w); D3.toast('放到最上面了', 1500); }
    else if (a === 'wBottom') { L().splice(it.i, 1); L().unshift(w); D3.toast('放到最下面了', 1500); }
    else if (a === 'wFlip') { if (w.flip) delete w.flip; else w.flip = true; }
    else if (a === 'wFv') { if (w.fv) delete w.fv; else w.fv = true; }
    else if (a === 'wWm') { if (v) w.wm = v; else delete w.wm; }
    else if (a === 'wPlace') {
      var hp = A.car().wrapPlaceAt(v);
      if (!hp) { D3.toast('那边没找到车身', 1800); return true; }
      w.at = hp.at; w.dir = hp.dir; delete w.up;
      var d0 = carLen(), fit = { left: 1, right: 1, hood: 1.6, roof: 1.3, trunk: 1.1, front: 1, rear: 1 }[v] * (v === 'left' || v === 'right' ? d0.hl * 0.9 : d0.hw);
      if (w.w > fit) w.w = Math.round(fit * 100) / 100; // 换到小一点的地方：太大的缩到放得下（不放大）
      lookAt(w);
    }
    else if (a === 'wBoth') { if (w.both) delete w.both; else w.both = w.kind === 'img' ? 'mirror' : 'same'; }
    else if (a === 'wBothM') w.both = v;
    else if (a === 'wOn') { if (v === 'body') delete w.on; else w.on = v; }
    else if (a === 'wVert') { if (v === '1') w.vert = true; else delete w.vert; }
    else if (a === 'wStroke') { w.stroke = +v; if (!w.stroke) delete w.stroke; }
    else if (a === 'wFont') w.font = v;
    else if (a === 'wKey') { if (w.key) delete w.key; else w.key = { c: 'auto' }; }
    else if (a === 'wKeyC') w.key.c = v;
    else if (a === 'wKeyE') { if (w.key.edge === false) delete w.key.edge; else w.key.edge = false; }
    else if (a === 'wImgReset') { ['crop', 'key', 'adj', 'ef', 'out', 'oc'].forEach(function (k) { delete w[k]; }); }
    else if (a === 'wIt') { if (w.it) delete w.it; else w.it = true; }
    else if (a === 'wSh') { if (w.sh) delete w.sh; else w.sh = { c: '#16181b', x: 0.04, y: 0.05, b: 0.04 }; }
    else if (a === 'wShC') w.sh.c = v;
    else if (a === 'wShCx') { var s3 = A.hex2hsl(w.sh.c || '#000000'); w.sh.c = A.hsl2hex(s3[0], Math.max(40, s3[1]), Math.max(30, Math.min(70, s3[2] + 1))); }
    A.render();
    apply(true);
    return true;
  }
  /** 滑块、输入框：处理了返回 true（拖一次 / 打一段字只记一步撤销） */
  function input(e) {
    var t = e.target, n = t.getAttribute('data-n');
    if (!n || !/^w[A-Z]/.test(n)) return false;
    var it = byId(cur);
    if (!it) return true;
    var w = it.w;
    if (n === 'wText') {
      if (!typing) { A.remember('文字'); typing = true; }
      w.text = t.value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, 120);
      applySlow();
      return true;
    }
    var v = parseFloat(t.value), min = parseFloat(t.min), max = parseFloat(t.max), k = t.getAttribute('data-k'), lab = t.nextSibling;
    t.style.setProperty('--p', ((v - min) / (max - min) * 100).toFixed(1) + '%');
    if (!sliding) { A.remember('贴纸'); sliding = true; }
    var show = function (s) { if (lab) lab.textContent = s; };
    if (n === 'wP') { (w.p = w.p || {})[k] = v; show(fmt(t.getAttribute('data-u'))(v)); }
    else if (n === 'wW') { w.w = v; show(v.toFixed(2) + ' 米'); }
    else if (n === 'wSx') { if (Math.abs(v - 1) < 0.02) delete w.sx; else w.sx = v; show(w.sx ? v.toFixed(2) + ' 倍' : '原比例'); }
    else if (n === 'wRot') { w.rot = v; show(v + '°'); }
    else if (n === 'wAlpha') { w.alpha = v; show(pct(v)); }
    else if (n === 'wRough') { w.rough = Math.round((1 - v) * 100) / 100; show(pct(v)); }
    else if (n === 'wMetal') { w.metal = v; show(pct(v)); }
    else if (n === 'wAt') { w.at[+k] = v; show(v.toFixed(2) + ' 米'); }
    else if (n === 'wDirA') {
      var ins = t.parentNode.parentNode.querySelectorAll('input[data-n="wDirA"]'), az = parseFloat(ins[0].value), el = parseFloat(ins[1].value);
      w.dir = dirOf(az, el); delete w.up; show(v + '°');
    }
    else if (n === 'wCrop') { w.crop = w.crop || [0, 0, 0, 0]; w.crop[+k] = v; if (!w.crop.some(Boolean)) delete w.crop; show(pct(v)); }
    else if (n === 'wKeyT') { w.key[k] = v; show(pct(v)); }
    else if (n === 'wAdj') { w.adj = w.adj || [1, 1, 1, 0]; w.adj[+k] = v; if (w.adj[0] === 1 && w.adj[1] === 1 && w.adj[2] === 1 && !w.adj[3]) delete w.adj; show(+k === 3 ? v + '°' : pct(v)); }
    else if (n === 'wEf') { if (v) w.ef = v; else delete w.ef; show(v ? pct(v) : '不渐隐'); }
    else if (n === 'wOut') { if (v) w.out = v; else delete w.out; show(v ? v + (w.kind === 'stripe' ? ' 毫米' : '%') : '不加'); }
    else if (n === 'wDashP') { w.dash[+k] = v; show(v + ' 厘米'); }
    else if (n === 'wFd') { w.fd = w.fd || [0, 0]; w.fd[+k] = v; if (!w.fd[0] && !w.fd[1]) delete w.fd; show(pct(v)); }
    else if (n === 'wLs') { if (v) w.ls = v; else delete w.ls; show(v ? Math.round(v * 100) + '%' : '正常'); }
    else if (n === 'wShP') { w.sh[k] = v; show(pct(v)); }
    else if (n === 'wHsl' || n === 'wShHsl') {
      var hs = t.parentNode.parentNode.querySelectorAll('input'), c = [];
      for (var j = 0; j < 3; j++) c.push(parseFloat(hs[j].value));
      if (t.getAttribute('data-c') === 'h') { // 白、灰、黑拖色相看不出变化：拉到看得出颜色的地方
        if (c[1] < 25) c[1] = hs[1].value = 70;
        if (c[2] > 85 || c[2] < 15) c[2] = hs[2].value = 50;
        [1, 2].forEach(function (q) { hs[q].style.setProperty('--p', c[q] + '%'); hs[q].nextSibling.textContent = c[q] + '%'; });
      }
      show(v + (t.getAttribute('data-c') === 'h' ? '°' : '%'));
      t.parentNode.parentNode.style.setProperty('--hue', c[0]);
      var hx = A.hsl2hex(c[0], c[1], c[2]);
      if (n === 'wShHsl') w.sh.c = hx; else w[k] = hx;
      var cb = t.parentNode.parentNode.previousSibling;
      if (cb && cb.querySelector) { var bb = cb.querySelector('.ball.custom'); if (bb) bb.style.setProperty('--c', hx); }
    }
    if (FAST[n]) apply(); else applySlow();
    return true;
  }
  /** 调整车模打开 / 关上、离开这一页：回到列表 */
  function reset() { cur = null; delArm = ''; fontArm = ''; sliding = false; typing = false; folds = {}; if (drawing && A) setDraw(false); }

  window.D3WrapTune = {
    init: function (api) {
      A = api;
      A.body.addEventListener('change', function () { sliding = false; if (slowT) apply(true); });
      A.body.addEventListener('focusout', function (e) { if (e.target && e.target.getAttribute && e.target.getAttribute('data-n') === 'wText') typing = false; });
    },
    page: page, click: click, input: input, reset: reset,
    cur: function () { return cur; }, open: open,
    /** 车上按住小球：记一笔撤销，给车况页这张贴纸（拖的时候直接改它的位置） */
    grab: function (id) { var it = byId(id); if (!it) return null; A.remember('贴纸位置'); return it; },
    /** 拖完：位置已经改在配置里了 */
    dropped: function () { apply(true); A.render(); },
    /** 在车上点了一下（不是在调图片、文字时）：说一下该怎么做 */
    hint: function () {
      var it = byId(cur), w = it && it.w;
      D3.toast(!w ? '先在下面选一张贴纸，或者加一张' : w.tpl === 'path' ? (drawing ? '按住车身拖着画' : '先点「在车上画一条线」，再按住车身拖着画') : '拉花按整侧（或车顶）贴，用下面的滑块调位置', 2200);
    },
    /** 在车上点了一下：贴到那里 */
    tap: function (h) {
      var it = byId(cur);
      if (!it || it.w.kind === 'stripe') { this.hint(); return; }
      A.remember('贴纸位置');
      it.w.at = h.at; it.w.dir = h.dir; delete it.w.up;
      apply(true);
      if (folds.fine) A.render();
    },
    /** 手绘线画完了：照着这条线贴，画在哪一侧就先只贴那一侧（想两侧再选） */
    drawn: function (d) {
      var it = byId(cur);
      if (!it || it.w.tpl !== 'path') return;
      A.remember('手绘线');
      it.w.path = d.path; it.w.pf = d.pf;
      if (d.pf === 'side' && it.w.side !== 'both') it.w.side = d.side;
      setDraw(false);
      A.render();
      apply(true);
    }
  };
})();
