/* demo3d 新手引导：第一次打开（本地没记过 d3-guide）时，等车况页建好、进场动画走完，只讲调整车模（网页版现在只用来给原生版做车模：导出为 GLB）：
   导入车模，再用默认车模把"调整车模"演示一遍：打开调整车模、看认出了什么 → 点车看是什么零件 → 进一项（车门）→ 点零件 → 圈出来 → 从列表选 → 试开 → 拖铰链的中心点 →
   到另一扇门的页一键镜像 → 车灯换颜色和效果（亮度、地面光束）→ 车牌 → 完成、导出为 GLB。第一次看也能随时关掉（右上角关闭 = 跳过）。
   演示的那几步由引导自己操作：屏幕上一个"手指"移到要点的地方按一下（按钮直接点，车上的点、涂交给 D3Car、D3Sel），
   操作的时候遮罩变淡、说明气泡先收起来，做完亮框移到结果上、气泡再出来。演示改的东西不存：结束时取消调整车模；
   用的是自己导入的车模（或调整过的默认车模）时先临时换成默认车模（D3Car.demo），结束时换回来。
   遮罩上留一个圆角亮框框住要讲的东西（亮框外一圈呼吸光；换步骤时亮框平滑移过去），旁边一个说明气泡（第几步、标题、说明、进度、下一步，右上角关闭 = 跳过），
   样式同设置面板、跟着车况页深浅色变；引导开着时每帧看一眼目标的位置，车转了、拖了中缝、横竖屏切换时亮框和气泡跟着走（没变就不动），
   点屏幕任意处也是下一步（演示操作还没做完时不算）。看完或跳过就记住，第一次以后不再自己出现；
   设置里"重新查看引导"（act:guide）随时再看一遍：设置面板不关（第一步就讲设置里的导入车模），等车况页建好再开始。引导开着时页面不接手势（main.js 不处理 .guide 里的触摸）。全部 ES5。 */
(function () {
  'use strict';
  var KEY = 'd3-guide';
  var $ = function (id) { return document.getElementById(id); };
  var box = $('guide'), hole = $('guideHole'), tip = $('guideTip'), finger = $('guideFinger');
  var step = -1, timer = 0, raf = 0, last = null, opened = false, acting = false, token = 0, focus = null, pad = 0.08;
  var demo = {}; // 演示用的：tune 引导打开了调整车模、swapped 临时换了默认车模、door / light 演示哪一项、pair 镜像到哪扇门、pt 车上点的那一点、item 列表里点的那一项
  var PAIR = { doorFL: 'doorFR', doorFR: 'doorFL', doorRL: 'doorRR', doorRR: 'doorRL' };
  var DOORS = ['doorFL', 'doorFR', 'doorRL', 'doorRR', 'hood', 'trunk'], LAMPS = ['head', 'tail', 'turnL', 'turnR', 'led', 'side', 'fogF', 'ambient'];

  var inSet = function (act) { return function () { return document.querySelector('#set [data-act="' + act + '"]'); }; };
  var inTune = function (sel) { return function () { return document.querySelector('#tune ' + sel); }; };
  var car = function () { return window.D3Car; };
  var tuneOn = function () { return !!(window.D3Tune && D3Tune.isOpen()); };
  var name = function (r, def) { return r ? D3Tune.name(r) : def; };
  var partRect = function (k) { return function () { return demo[k] ? car().rectOf(D3Tune.mids(demo[k])) : D3.focusRect(); }; };
  var row = function (k) { return function () { return demo[k] ? document.querySelector('#tune .trow[data-r="' + demo[k] + '"]') : null; }; };
  var tool = function (v) { return inTune('[data-a="tool"][data-v="' + v + '"]'); };

  var STEPS, ALL = [
    { el: inSet('import'), pad: 0.08, set: true, title: '换成你自己的车',
      text: '点右上角的齿轮打开设置，在「车模」里点「导入车模」选一个 .glb 或 .gltf 文件，车门、车轮、玻璃会自动认出来；车漆、车灯不自动认，要换车漆颜色、让车灯亮，在「调整车模」里点一下选上，认错的也在那里改。下面用默认车模演示一遍。' },
    // ---- 用默认车模演示调整车模 ----
    { el: inTune('.tsum'), pad: 0.06, title: '调整车模',
      text: '这里告诉你自动认出了哪些、没认出哪些。没认出的那一项，车况变了车上不会动，点下面那一项进去选上就好。',
      acts: function () { return [hold(inSet('tune')), useDefault, tap(inSet('tune'), 0), until(tuneOn, 8000), pause(900), setup]; } },
    { el: partRect('door'), pad: 0.1, title: '点一下车',
      text: '在车上点一下，会告诉你点到的是哪个零件、归在哪一项。按住拖动转车，两指缩放、平移看清小零件，双击车外面回到看全车。',
      acts: function () { return [tapCar(1800)]; } },
    { el: partRect('door'), pad: 0.1, title: function () { return name(demo.door, '车门') + '：一项一页'; },
      text: function () { return '每一项有自己的一页，镜头会转过来。选上的零件标成彩色；车机报' + name(demo.door, '车门') + '开着，它们就打开。'; },
      acts: function () { return [tap(row('door'), 1600)]; } },
    { el: partRect('door'), pad: 0.1, title: '点零件',
      text: '在车上点一块，它所在的整个部件（门板、内饰、把手、里外几层玻璃）一起加进这一项，再点一次一起去掉。刚才演示的就是先去掉、再加回来。',
      acts: function () { return [tapCar(1500), tapCar(1500)]; } },
    { el: partRect('door'), pad: 0.1, title: '圈出来',
      text: '车模是一整块、没分开零件时用它：「智能点选」点一下选中一整块（到板件的缝、棱为止）；「画笔」按在车上拖是涂（只涂看得见的面），按在车外面拖是转车。圈好点「把圈出来的做成…」就拆成单独的零件，撤销一次退一步。',
      acts: function () { return [tap(tool('paint'), 1200), tap(inTune('[data-a="pmode"][data-v="brush"]'), 800), stroke, pause(900)]; } },
    { el: inTune('.tlist'), pad: 0.06, title: '从列表选',
      text: '车模自己分好的零件都列在这里，点一项放进来、再点一次拿出去，车上那块会闪几下告诉你是哪个。',
      acts: function () { return [tap(tool('list'), 700), tap(listItem, 1700), tap(listItem, 1700)]; } },
    { el: partRect('door'), pad: 0.1, title: '试开',
      text: function () { return '下面是这一项的选项：' + (/^door/.test(demo.door || 'door') ? '门型（常规、对开、蝴蝶、剪刀、鸥翼）、' : '') + '角度、反向。点「试开」看开得对不对。'; },
      acts: function () { return [tap(inTune('[data-a="test"]'), 1800)]; } },
    { el: partRect('door'), pad: 0.1, title: '铰链的中心点',
      text: '门绕着橙色小球转，虚线是转轴。开起来位置不对，就按住小球拖到该在的地方，或者用下面「前后 / 上下 / 里外」的滑块慢慢挪；「恢复自动」回到自动算的位置。',
      acts: function () { return [dragHinge, built, pause(1500)]; } },
    { el: partRect('pair'), pad: 0.1, title: '一键镜像',
      text: function () { return '左右对称的门、车窗、转向灯只要调好一边：到另一边的页上点「照着' + name(demo.door, '左前门') + '镜像过来」，对称的零件和门型、角度、铰链位置一起带过来。车模是一整块、那一边是圈出来的，也会按对称的位置拆出这一边。'; },
      acts: function () { return demo.pair ? [tap(inTune('[data-a="back"]'), 800), tap(row('pair'), 1400), tap(inTune('[data-a="mirror"]'), 800), built, pause(1500)] : []; } },
    { el: partRect('light'), pad: 0.12, title: '车灯',
      text: '灯也是一项一页，进来就换成夜景、这盏灯亮着给你看。导入的车模不会自动认灯，要自己把灯的零件选上；再挑颜色、效果，调发光质感（亮度、热白中心、灯罩纹理、边缘柔化），大灯、雾灯还能调地上照出的光束。',
      acts: function () { return [tap(inTune('[data-a="back"]'), 800), tap(row('light'), 1400), closer('light', 2.2), tap(lastBall, 1000), tap(inTune('[data-a="fx"]:last-child'), 1200)]; } },
    { el: function () { return document.querySelector('#tune .pnum') || inTune('.tpage-h'); }, pad: 0.12, title: '车牌',
      text: '想要车牌就在「车身」里：挑蓝牌、绿牌、黄牌或自定义颜色，点按键把车牌号敲进去；位置不对按住车上的车牌拖，宽度、角度用滑块调。后车牌贴在尾门上时，开尾门会跟着翻起来。',
      acts: function () { return [tap(inTune('[data-a="back"]'), 800), tap(inTune('[data-r="plate"]'), 1500), tap(inTune('[data-a="pon"]'), 1600), tap(inTune('.pk[data-v="粤"]'), 600), tap(inTune('.pk[data-v="B"]'), 900), dragPlate, pause(600)]; } },
    { el: inTune('.tune-foot'), pad: 0.06, title: '完成或取消',
      text: '顶上两个箭头是撤销、重做，改错了一步步退回去。改好了点「导出为 GLB」得到一个 .glb 文件，拷到车机上，在 3D 车况（原生）的设置里点「导入车模包」；「完成」是保存在这个网页里，× 是取消、改的都不算。刚才的演示不会保存，这份说明在设置最下面能重新看。' }
  ];

  /** 元素露出来的那部分（在面板、列表里滚出去的部分不算） */
  function shownRect(el) {
    var a = el.getBoundingClientRect(), r = { left: a.left, top: a.top, right: a.right, bottom: a.bottom };
    for (var p = el.parentNode; p && p.nodeType === 1 && p !== document.body; p = p.parentNode) {
      if (p.scrollHeight <= p.clientHeight + 2) continue;
      var o = getComputedStyle(p).overflowY;
      if (o !== 'auto' && o !== 'scroll') continue;
      var b = p.getBoundingClientRect();
      r.top = Math.max(r.top, b.top); r.bottom = Math.min(r.bottom, b.bottom);
    }
    return r.bottom > r.top ? { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top } : a;
  }
  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } } // 存不了就不打扰
  function rem() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 50; }
  function text(v) { return typeof v === 'function' ? v() : v; }

  /** 等车况页建好、进场动画走完再开始。again：设置里点了重新查看（不管看没看过；设置面板开着也开始；进场动画已经走完了，等一下就行） */
  function wait(again) {
    clearTimeout(timer);
    if (!again && seen()) return;
    var i = window.D3 && D3.info();
    if (i && i.live === 'car' && i.ready) timer = setTimeout(function () { if (D3.info().live === 'car' && (again || !D3Set.isOpen()) && !tuneOn()) start(again); else wait(again); }, again ? 900 : 2400);
    else timer = setTimeout(function () { wait(again); }, 400);
  }
  /** again：设置里点了重新查看；两种都能随时用右上角关闭退出 */
  function start(again) {
    STEPS = ALL;
    var dots = $('guideDots');
    dots.innerHTML = '';
    for (var i = 0; i < STEPS.length; i++) dots.appendChild(document.createElement('i'));
    dots.className = 'guide-dots' + (STEPS.length > 10 ? ' many' : '');
    opened = false; demo = {};
    box.style.setProperty('--acc', D3Set.pick('paint').acc);
    box.className = 'guide on first'; // first：第一步亮框直接出现在位置上，不从角落移过来
    show(0);
    setTimeout(function () { box.classList.remove('first'); }, 50);
    track();
  }
  /** 引导开着时每帧跟着目标走 */
  function track() {
    cancelAnimationFrame(raf);
    if (step < 0) return;
    place(false);
    raf = requestAnimationFrame(track);
  }
  function show(i) {
    step = i;
    var s = STEPS[i];
    $('guideStep').textContent = (i + 1) + ' / ' + STEPS.length;
    $('guideNext').textContent = i === STEPS.length - 1 ? '开始体验' : '下一步';
    var d = $('guideDots').children;
    for (var k = 0; k < d.length; k++) d[k].className = k === i ? 'on' : '';
    if (s.set && !D3Set.isOpen()) { $('setBtn').click(); opened = true; } // 设置里的那一步：打开设置面板，滚到最上面（车模那一组）
    if (s.set) document.querySelector('#set .set-body').scrollTop = 0;
    focus = s.el; pad = s.pad;
    demo.pt = null;
    if (s.acts) { run(s.acts()); place(true); return; } // 先演示，做完再出说明（说明里的门名字要等挑好了才知道）
    words();
    place(true);
    tipIn();
  }
  function words() { var s = STEPS[step]; $('guideTitle').textContent = text(s.title); $('guideText').textContent = text(s.text); }
  function tipIn() { tip.classList.remove('in'); void tip.offsetWidth; tip.classList.add('in'); } // 每一步气泡重新浮上来
  /** 亮框框住要讲的东西，气泡放在它下面（放不下就放上面），左右不出屏。
     step 换了（animate）：亮框平滑移过去；跟着目标走时位置没变就不动，变了直接跟上（不走过渡，不然一帧帧追着跑会拖后） */
  function place(animate) {
    if (step < 0) return;
    var v = focus && focus(), r = rem(), p = pad * r, W = window.innerWidth, H = window.innerHeight;
    var b = v && v.getBoundingClientRect ? shownRect(v) : v;
    if (!b || !b.width) b = { left: W * 0.15, top: H * 0.25, width: W * 0.7, height: H * 0.4 }; // 拿不到位置：框住画面中间
    var x = Math.max(4, b.left - p), y = Math.max(4, b.top - p), w = Math.min(W - 4 - x, b.left + b.width + p - x), h = Math.min(H - 4 - y, b.top + b.height + p - y);
    var key = [x, y, w, h, W, H].map(Math.round).join(',') + acting;
    if (!animate && key === last) return;
    last = key;
    if (!animate) hole.style.transition = 'none';
    hole.style.left = x + 'px'; hole.style.top = y + 'px'; hole.style.width = w + 'px'; hole.style.height = h + 'px';
    hole.style.borderRadius = Math.min(h / 2, 0.3 * r) + 'px';
    if (!acting) { // 演示操作时气泡收着，不用摆
      var tw = tip.offsetWidth, th = tip.offsetHeight, gap = 0.22 * r, m = 0.2 * r;
      var below = y + h + gap + th <= H - m, ty = below ? y + h + gap : Math.max(m, y - gap - th);
      var tx = Math.max(m, Math.min(W - tw - m, x + w / 2 - tw / 2));
      tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
      tip.className = tip.className.replace(/ ?(up|down)/g, '') + (below ? ' down' : ' up'); // 箭头朝亮框
      var ax = Math.max(0.3 * r, Math.min(tw - 0.3 * r, x + w / 2 - tx));
      tip.style.setProperty('--ax', ax + 'px');
    }
    if (!animate) { void hole.offsetWidth; hole.style.transition = ''; }
  }
  function next() { if (step < STEPS.length - 1) show(step + 1); else finish(); }
  function finish() {
    token++; // 还没做完的演示操作停下
    step = -1; acting = false;
    cancelAnimationFrame(raf);
    box.className = 'guide';
    finger.className = 'guide-finger';
    if (demo.tune && tuneOn()) D3Tune.cancel(); // 演示改的都不存
    if (demo.swapped) car().demo(false); // 换回自己的车模
    if (opened && D3Set.isOpen()) D3Set.close(); // 引导自己打开的设置面板关上
    opened = false; demo = {};
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }

  // ================= 演示操作 =================
  // 每个操作是一个函数（可以返回 Promise），按顺序做；第一个当场做（亮框马上移到要点的地方），引导结束了（token 变了）后面的就不做了
  function run(ops) {
    var my = ++token, i = 0;
    acting = true;
    box.classList.add('acting');
    (function go() {
      if (my !== token) return;
      if (i >= ops.length) { // 做完了：亮框移到结果上，气泡出来
        acting = false;
        box.classList.remove('acting');
        finger.className = 'guide-finger';
        D3.toast(null); // 演示时冒出来的提示收起来，别挡着说明
        focus = STEPS[step].el; pad = STEPS[step].pad;
        words();
        place(true);
        tipIn();
        return;
      }
      var r;
      try { r = ops[i++](my); } catch (e) { console.error('引导演示出错', e); }
      Promise.resolve(r).then(go, function (e) { console.error('引导演示出错', e); go(); });
    })();
  }
  function pause(ms) { return function () { return new Promise(function (res) { setTimeout(res, ms); }); }; }
  function until(ok, max) {
    return function () {
      var t0 = Date.now();
      return new Promise(function (res) { (function poll() { if (ok() || Date.now() - t0 > max) res(); else setTimeout(poll, 150); })(); });
    };
  }
  function hold(get) { return function () { focus = get; pad = 0.08; }; }
  /** 手指移到 (x, y)：第一次直接出现在那里，之后滑过去；now：不走过渡（涂的时候一帧帧跟着） */
  function fingerTo(x, y, now) {
    var fresh = finger.className.indexOf(' on') < 0;
    if (fresh || now) finger.style.transition = 'none';
    finger.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
    if (fresh || now) { void finger.offsetWidth; finger.style.transition = ''; }
    if (fresh) finger.className = 'guide-finger on';
  }
  function press() { finger.className = 'guide-finger on'; void finger.offsetWidth; finger.className = 'guide-finger on press'; }
  /** 元素在面板里滚到看得见的地方（面板、列表各自能滚） */
  function reveal(el) {
    for (var p = el.parentNode; p && p.nodeType === 1 && p !== document.body; p = p.parentNode) {
      if (p.scrollHeight <= p.clientHeight + 2) continue;
      var o = getComputedStyle(p).overflowY;
      if (o !== 'auto' && o !== 'scroll') continue;
      var a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
      if (a.top < b.top + 6 || a.bottom > b.bottom - 6) p.scrollTop += a.top - b.top - (b.height - a.height) / 2;
    }
  }
  /** 手指去点一个按钮：亮框框住它，按一下，点它；after 毫秒后做下一个 */
  function tap(get, after) {
    return function (my) {
      var el = get();
      if (!el) return;
      reveal(el);
      focus = get; pad = 0.06;
      var b = el.getBoundingClientRect();
      fingerTo(b.left + b.width / 2, b.top + b.height / 2);
      return pause(560)().then(function () {
        if (my !== token) return;
        press();
        return pause(180)();
      }).then(function () {
        var e = get();
        if (my !== token || !e || e.disabled) return;
        e.click();
        return pause(after || 700)();
      });
    };
  }
  /** 车上要点的那一点（这一步里点几次都点同一处） */
  function carPoint() {
    if (demo.pt) return demo.pt;
    var mids = demo.door ? D3Tune.mids(demo.door) : [], card = document.querySelector('#tune .set-card').getBoundingClientRect();
    return (demo.pt = mids.length ? car().pointOn(mids, card) : null);
  }
  /** 手指在车上点一下（和真的手指点一样交给车况页：主页是"点到了什么"，一项的页里是加进 / 去掉） */
  function tapCar(after) {
    return function (my) {
      var p = carPoint();
      if (!p) return pause(300)();
      focus = partRect('door'); pad = 0.1;
      fingerTo(p.x, p.y);
      return pause(560)().then(function () {
        if (my !== token) return;
        press();
        return pause(180)();
      }).then(function () {
        if (my !== token) return;
        car().tap(p.x, p.y);
        return pause(after)();
      });
    };
  }
  /** 手指在车门上来回涂一笔（圈出来） */
  function stroke(my) {
    var p = carPoint(), r = car().rectOf(demo.door ? D3Tune.mids(demo.door) : []);
    if (!p || !r || !window.D3Sel || !D3Sel.active()) return pause(300)();
    var card = document.querySelector('#tune .set-card').getBoundingClientRect(), W = window.innerWidth;
    var right = r.left + r.width * 0.85;
    if (card.left > W * 0.3) right = Math.min(card.left - 10, right); // 横屏面板在右边：别涂到面板底下
    var x0 = Math.max(10, r.left + r.width * 0.15), x1 = Math.max(x0 + 20, right), A = Math.min(r.height * 0.18, 0.5 * rem()), y0 = p.y;
    var at = function (k) { return { x: x0 + (x1 - x0) * k, y: y0 + A * Math.sin(k * Math.PI * 4) }; };
    focus = partRect('door'); pad = 0.1;
    fingerTo(at(0).x, at(0).y);
    return pause(600)().then(function () {
      if (my !== token) return;
      press();
      D3Sel.press(at(0).x, at(0).y);
      return new Promise(function (res) {
        var t0 = Date.now(), DUR = 1600;
        (function frame() {
          if (my !== token) { D3Sel.release(); return res(); }
          var k = Math.min(1, (Date.now() - t0) / DUR), q = at(k);
          fingerTo(q.x, q.y, true);
          D3Sel.drag(q.x, q.y);
          if (k < 1) requestAnimationFrame(frame); else { D3Sel.release(); res(); }
        })();
      });
    });
  }
  /** 手指按住铰链的小球往门里拖一段（和真的手指一样交给车况页：按在小球上拖是挪铰链，松手存、门按新位置打开） */
  function dragHinge(my) {
    var a = car().hingeAt(), r = demo.door && car().rectOf(D3Tune.mids(demo.door));
    if (!a || !r) return pause(300)();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.hypot(cx - a.x, cy - a.y) || 1, L = Math.min(d * 0.45, 0.9 * rem());
    var b = { x: a.x + (cx - a.x) / d * L, y: a.y + (cy - a.y) / d * L };
    focus = partRect('door'); pad = 0.1;
    fingerTo(a.x, a.y);
    return pause(600)().then(function () {
      if (my !== token) return;
      press();
      car().press(a.x, a.y);
      return new Promise(function (res) {
        var t0 = Date.now(), px = a.x, py = a.y;
        (function frame() {
          if (my !== token) { car().release(0, px, py, true); return res(); }
          var k = Math.min(1, (Date.now() - t0) / 1000), e = k * k * (3 - 2 * k), x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
          fingerTo(x, y, true);
          car().drag(x - px, y - py, x, y);
          px = x; py = y;
          if (k < 1) requestAnimationFrame(frame); else { car().release(0, x, y, false); res(); }
        })();
      });
    });
  }
  /** 手指按住车上的车牌拖一段（和真的手指一样：按住车牌拖是挪位置，松手存） */
  function dragPlate(my) {
    var a = car().plateAt();
    if (!a) return pause(300)();
    var b = { x: a.x + 0.5 * rem(), y: a.y - 0.25 * rem() };
    focus = function () { return D3.focusRect(); }; pad = 0.12;
    fingerTo(a.x, a.y);
    return pause(600)().then(function () {
      if (my !== token) return;
      press();
      car().press(a.x, a.y);
      return new Promise(function (res) {
        var t0 = Date.now(), px = a.x, py = a.y;
        (function frame() {
          if (my !== token) { car().release(0, px, py, true); return res(); }
          var k = Math.min(1, (Date.now() - t0) / 900), e = k * k * (3 - 2 * k), x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
          fingerTo(x, y, true);
          car().drag(x - px, y - py, x, y);
          px = x; py = y;
          if (k < 1) requestAnimationFrame(frame); else { car().release(0, x, y, false); res(); }
        })();
      });
    });
  }
  /** 等车按改过的配置建好（建车会卡一下：卡在演示里，别等说明出来了再卡） */
  function built() { return until(function () { return !D3Tune.busy(); }, 20000)(); }
  /** 列表里演示点哪一项：这一项里已经有的（先拿出去再放回来），车漆面板优先（大，闪起来看得清） */
  function listItem() {
    if (demo.item === undefined) {
      var on = document.querySelectorAll('#tune .titem.on .tpick'), pick = on[0] || null;
      for (var i = 0; i < on.length; i++) if (/paint/i.test(on[i].textContent)) { pick = on[i]; break; }
      demo.item = pick ? pick.getAttribute('data-i') : null;
    }
    return demo.item === null ? null : document.querySelector('#tune .tpick[data-i="' + demo.item + '"]');
  }
  /** 对着这一项拉近一点（灯小，远了看不出颜色）：和两指捏合一样，对着它在屏幕上的位置缩放 */
  function closer(k, z) {
    return function () {
      var r = demo[k] && car().rectOf(D3Tune.mids(demo[k]));
      if (!r) return;
      car().pinch(z, r.left + r.width / 2, r.top + r.height / 2);
      return pause(600)();
    };
  }
  /** 灯的颜色小球里最后一个预设的（自定义前面那个） */
  function lastBall() { var l = document.querySelectorAll('#tune .lballs .ball[data-a="lcolor"]'); return l[l.length - 1] || null; }
  /** 用的不是原样的默认车模：先临时换成默认车模演示 */
  function useDefault() {
    var m = car() && car().model(), r = m && m.rec;
    if (!r || (r.builtin && !r.custom)) return;
    demo.swapped = true;
    return car().demo(true);
  }
  /** 调整车模打开了：挑演示哪扇门（从现在的角度点得到的优先）、哪个灯；没打开就不演示了 */
  function setup() {
    demo.tune = true;
    if (!tuneOn()) { D3.toast('调整车模没打开，演示先到这里'); finish(); return; }
    var card = document.querySelector('#tune .set-card').getBoundingClientRect(), i;
    for (i = 0; i < DOORS.length && !demo.door; i++) { var m = D3Tune.mids(DOORS[i]); if (m.length && car().pointOn(m, card)) demo.door = DOORS[i]; }
    for (i = 0; i < DOORS.length && !demo.door; i++) if (D3Tune.mids(DOORS[i]).length) demo.door = DOORS[i];
    for (i = 0; i < LAMPS.length && !demo.light; i++) if (D3Tune.mids(LAMPS[i]).length) demo.light = LAMPS[i];
    demo.pair = PAIR[demo.door] || null; // 引擎盖、尾门没有对边：镜像那步只讲不演示
  }

  // 点哪里都是下一步，"跳过"直接结束（演示操作还没做完时点了不算）。手指抬起时就判断（没怎么挪动就算点了一下，按得久也算；
  // 只等 click 的话按久一点浏览器当成长按、不发 click，引导就不翻页），并拦掉后面补发的 click；鼠标走 click
  function act(target) {
    if (step < 0) return;
    if (target.closest && target.closest('#guideSkip')) finish();
    else if (!acting) next();
  }
  var down = null;
  box.addEventListener('touchstart', function (e) { var p = e.changedTouches[0]; down = { x: p.clientX, y: p.clientY }; }, { passive: true });
  box.addEventListener('touchend', function (e) {
    var p = e.changedTouches[0], d = down;
    down = null;
    if (!d || Math.abs(p.clientX - d.x) > 12 || Math.abs(p.clientY - d.y) > 12) return;
    e.preventDefault();
    act(e.target);
  });
  box.addEventListener('click', function (e) { act(e.target); });
  // 设置里"重新查看引导"：等车建好再从第一步开始（第一步就在设置面板里，面板不用关）
  D3Set.on(function (k) {
    if (k !== 'act:guide' || step >= 0) return;
    wait(true);
  });
  wait();
})();
