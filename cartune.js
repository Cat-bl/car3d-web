/* demo3d 调整车模（设置 → 车模 → 调整车模 / 导入车模）：面板样式同设置面板，车让到面板旁边。
   主页：顶上一句"认出了什么、没认出什么"，下面是摆放（车头方向、车身朝上、车长、亮度、反光、远近），再按"车身 / 会动的 / 灯光 / 藏起来的"列出每一项（状态 + ›）。
   点一项进它自己的一页：说这一项跟车机的什么联动，镜头转到看得清它的角度，选零件三种办法——
     点零件：点车上的零件加进来、再点一次去掉（车漆、玻璃默认按材质：同样材质的都算；轮毂、卡钳、灯默认只要点到的那个零件，可以换；
       车门、引擎盖、尾门、车轮这些会动的默认是"整个部件"——细致的车模一扇门是好几块拼的，点到哪块都把整扇门一起选上，车窗连同里外几层玻璃）；
     圈出来：整块没分开的模型，用画笔在车上涂（橡皮擦、点一下选一整块平滑的面、转车），涂好了"做成这一项"——在 GLB 里拆成一个新零件（carmodel.js 的 carve），能撤销；
     从列表选：车模自己的材质 / 节点层级，选中的在车上闪 3 下。
   再下面是这一项自己的选项：门型、角度、反向、铰链的中心点（车上一个橙色小球 + 转轴虚线，按住小球拖或者用前后 / 上下 / 里外三个滑块挪）、试开；
   天窗往后滑还是翘起、滑多远；灯的颜色、效果、发光质感（亮度、热白中心、保留灯罩纹理、边缘柔化）、路面光束（近光、远光、前雾灯照车前，尾灯、倒车灯照车后：
   形状、光斑分布、长宽、起点、偏移、离地高度、强度、扩散、衰减、雾感、颜色，同 carmodel-web）、借灯打转向（转向灯的页）、亮一下。
   灯的这些改了马上生效（D3Car.lights），不重建车。进了灯的页（选上了零件）换成夜景：背景变黑、车身压暗，这盏灯亮着给人看；圈零件时不暗，离开就恢复。
   导入的车模不自动认灯，灯光一项项自己选。
   左右成对的（左右门、左右车窗、左右转向灯）配好一侧，另一侧"照着…镜像过来"：对侧每块零件按车身中线翻过来找位置、大小对得上的零件，
   找不到的（整块没分开、是"圈出来"拆的）按三角形找对侧位置重合的面拆出来；门型、角度、反向、铰链位置、灯的颜色效果发光质感一起带过来。
   别的改动（零件、门型……）车按新配置重建一遍（防抖 0.35 秒，旧车留着、新车建好再换）；完成才存（IndexedDB，拆过零件的 GLB 一起存），取消回到改之前。
   撤销 / 重做（顶上两个按钮，电脑上 Ctrl+Z / Ctrl+Y）：每次改配置之前记一份改之前的样子（配置、拆过零件的 GLB、在哪一页），拖滑块一次只记一步，最多 60 步。
   画面能缩放、平移（两指捏合 / 拖动，电脑上滚轮 / 右键拖）。竖屏圈选时面板缩成一条工具栏，车多占点地方。
   车身里的"贴纸、拉花"一页交给 wraptune.js（画面、点击、滑块）。
   导入：选文件 → 转换（面数太多先问要不要简化）→ 存 → 车况页换上新车 → 没带配置的直接进来检查。恢复默认要连点两下。全部 ES5。 */
(function () {
  'use strict';
  var S = window.D3Set;
  var $ = function (id) { return document.getElementById(id); };
  var panel = $('tune'), body = $('tuneBody'), tip = $('tuneTip'), appEl = $('app');
  var PI = Math.PI;
  // 每一项：名字、类别（mat 材质类 / light 灯 / part 会动的 / wheels / hide）、点零件默认按材质还是按零件、镜头角度 [方位, 俯视]（0 正对车头、π/2 左边、π 车尾）、和车机怎么联动
  var ROLES = {
    paint: { name: '车漆', kind: 'mat', by: 'mat', look: [0.7, 0.25], desc: '设置里换车漆颜色、质感，换的就是这些。' },
    rim: { name: '轮毂', kind: 'mat', by: 'piece', look: [1.2, 0.08], desc: '设置里换轮毂颜色，换的就是这些。' },
    caliper: { name: '刹车卡钳', kind: 'mat', by: 'piece', look: [1.2, 0.08], desc: '设置里换卡钳颜色，换的就是这些。' },
    glass: { name: '车窗玻璃', kind: 'mat', by: 'mat', look: [0.8, 0.3], desc: '换成深色半透明的玻璃（也可以保留模型原来的）。' },
    plate: { name: '车牌', kind: 'plate', look: [PI - 0.4, 0.32], desc: '装饰用的车牌，跟车况不联动：照国标画蓝牌、绿牌、黄牌、警车、应急、使馆、港澳等牌种，也能自定义颜色；点按键把车牌号敲进去，位置按住车牌拖，宽度、角度用滑块调。' },
    wrap: { name: '贴纸、拉花', kind: 'wrap', look: [1.45, 0.12], desc: '装饰用，跟车况不联动：现成的拉花、图案，在车上画的线，自己的图片、文字，哪里都能贴、能顺着车身包过去；贴在门、盖上的开门时跟着走。' },
    wheels: { name: '车轮', kind: 'wheels', look: [1.1, 0.1], desc: '胎压标签、胎压异常的红圈按车轮的位置放。轮胎、轮毂都选上（卡钳不用），四个轮子按位置自动分开。' },
    doorFL: { name: '左前门', kind: 'part', look: [1.3, 0.15], desc: '车机报左前门开着时，这些零件绕铰链打开。门板、把手、后视镜（装在门上的话）、门上的玻璃和窗框都选上。' },
    doorFR: { name: '右前门', kind: 'part', look: [-1.3, 0.15], desc: '车机报右前门开着时，这些零件绕铰链打开。门板、把手、门上的玻璃和窗框都选上。' },
    doorRL: { name: '左后门', kind: 'part', look: [1.95, 0.15], desc: '车机报左后门开着时，这些零件绕铰链打开。' },
    doorRR: { name: '右后门', kind: 'part', look: [-1.95, 0.15], desc: '车机报右后门开着时，这些零件绕铰链打开。' },
    hood: { name: '引擎盖', kind: 'part', look: [0.45, 0.5], desc: '车机报前机舱盖开着时掀起来。' },
    trunk: { name: '尾门', kind: 'part', look: [PI - 0.45, 0.35], desc: '车机报尾门（后备箱）开着时掀起来。' },
    winFL: { name: '左前车窗', kind: 'part', look: [1.3, 0.2], desc: '车机报左前窗开了多少，玻璃就降多少；门打开时跟着门走。' },
    winFR: { name: '右前车窗', kind: 'part', look: [-1.3, 0.2], desc: '车机报右前窗开了多少，玻璃就降多少。' },
    winRL: { name: '左后车窗', kind: 'part', look: [1.95, 0.2], desc: '车机报左后窗开了多少，玻璃就降多少。' },
    winRR: { name: '右后车窗', kind: 'part', look: [-1.95, 0.2], desc: '车机报右后窗开了多少，玻璃就降多少。' },
    sunroof: { name: '天窗', kind: 'part', look: [0.6, 0.85], desc: '车机报天窗开了多少，就往后滑多少（或者翘起来）。' },
    sunshade: { name: '遮阳帘', kind: 'part', look: [0.6, 0.85], desc: '车机报遮阳帘开了多少，就往后收多少。' },
    chargePort: { name: '充电口盖', kind: 'part', look: [2.2, 0.2], desc: '插上充电枪时打开。' },
    head: { name: '大灯', kind: 'light', by: 'piece', look: [0.35, 0.12], desc: '开近光、远光时亮（地上照出光来），上车迎宾时亮一下。' },
    led: { name: '日行灯', kind: 'light', by: 'piece', look: [0.35, 0.12], desc: '车机里日行灯开着、车上电时亮（老车机没有这一项，跟着大灯），上车迎宾时亮一下。' },
    side: { name: '示宽灯', kind: 'light', by: 'piece', look: [0.35, 0.12], desc: '开示宽灯（位置灯）时亮，上车迎宾时亮一下。' },
    tail: { name: '尾灯', kind: 'light', by: 'piece', look: [PI - 0.35, 0.12], desc: '开示宽灯、大灯时亮，上车迎宾时亮一下。' },
    brake: { name: '刹车灯', kind: 'light', by: 'piece', look: [PI - 0.35, 0.12], desc: '踩刹车时亮，紧急制动时快闪。常和尾灯是同一个灯（把尾灯的零件也选上，踩刹车时更亮），车尾高处的高位刹车灯也选上。' },
    reverse: { name: '倒车灯', kind: 'light', by: 'piece', look: [PI - 0.35, 0.12], desc: '挂 R 挡时亮。' },
    turnL: { name: '左转向灯', kind: 'light', by: 'piece', look: [0.75, 0.15], desc: '打左转向灯、开双闪时闪。车头、车尾、后视镜上的都选上。' },
    turnR: { name: '右转向灯', kind: 'light', by: 'piece', look: [-0.75, 0.15], desc: '打右转向灯、开双闪时闪。车头、车尾、后视镜上的都选上。' },
    fogF: { name: '前雾灯', kind: 'light', by: 'piece', look: [0.3, 0.05], desc: '开前雾灯时亮。' },
    fogR: { name: '后雾灯', kind: 'light', by: 'piece', look: [PI - 0.3, 0.1], desc: '开后雾灯时亮。' },
    ambient: { name: '氛围灯', kind: 'light', by: 'piece', look: [0.9, 0.6], desc: '车里的氛围灯：上电时亮，颜色、亮度、前排 / 后排跟着车机的氛围灯（也可以自己定颜色）；车机开了音乐律动，放歌时一拍一拍闪；开了动态多彩，颜色轮着换。' },
    hide: { name: '藏起来的零件', kind: 'hide', look: null, desc: '地板、展台、多余的东西：选上就不显示。' }
  };
  // 自定义灯：跟车况对不上的灯（车标灯、格栅灯带、底盘灯、车顶灯牌、警灯……），在灯光那组里一盏盏加，最多 8 盏
  var CUSTOM = D3Model.CUSTOM_LIGHTS;
  CUSTOM.forEach(function (r, i) {
    ROLES[r] = { name: '自定义灯 ' + (i + 1), kind: 'light', by: 'piece', look: [0.6, 0.45], desc: '跟车况不联动的灯（车标灯、格栅灯带、底盘灯、车顶灯牌、警灯……）：颜色、效果自己定，默认上电就亮，也能跟着某种灯亮。几盏错开着闪：一盏"先闪"、一盏"后闪"（红蓝警灯）。' };
  });
  var isCus = function (r) { return CUSTOM.indexOf(r) >= 0; };
  /** 加了的自定义灯（有配置、或者选了零件） */
  function cusOn() { return CUSTOM.filter(function (r) { return !!cfg.lights[r] || !!count(r); }); }
  var CUS_FX = [['steady', '常亮'], ['breath', '呼吸'], ['blink', '闪烁'], ['strobe', '爆闪']];
  var CUS_WHEN = [['power', '上电'], ['led', '日行灯'], ['side', '示宽灯'], ['head', '大灯'], ['brake', '刹车灯'], ['reverse', '倒车灯'], ['hazard', '双闪']];
  var GROUPS = [['车身', ['paint', 'rim', 'caliper', 'glass', 'plate', 'wrap']],
    ['会动的部件', ['wheels', 'doorFL', 'doorFR', 'doorRL', 'doorRR', 'hood', 'trunk', 'winFL', 'winFR', 'winRL', 'winRR', 'sunroof', 'sunshade', 'chargePort']],
    ['灯光', ['head', 'led', 'side', 'tail', 'brake', 'reverse', 'turnL', 'turnR', 'fogF', 'fogR', 'ambient']],
    ['不要的东西', ['hide']]];
  // 左右成对的项：配好一侧，另一侧可以一键镜像
  var PAIRS = { doorFL: 'doorFR', doorFR: 'doorFL', doorRL: 'doorRR', doorRR: 'doorRL', winFL: 'winFR', winFR: 'winFL', winRL: 'winRR', winRR: 'winRL', turnL: 'turnR', turnR: 'turnL' };
  // 有铰链的项（门、盖、充电口盖；天窗翘起来时也有）
  var hinged = function (r) { return /^door/.test(r) || r === 'hood' || r === 'trunk' || r === 'chargePort' || ((r === 'sunroof' || r === 'sunshade') && cfg.parts[r] && cfg.parts[r].mode === 'tilt'); };
  var STYLES = [['normal', '常规'], ['rear', '对开'], ['butterfly', '蝴蝶'], ['scissor', '剪刀'], ['gull', '鸥翼']];
  // 灯的颜色小球（最后一个是自定义；氛围灯第一个是"跟着车机"）、效果
  var LIGHT_BALLS = {
    head: ['#fff4e2', '#e8f2ff', '#ffe08a', '#9fe0ff'], led: ['#ffffff', '#cfeaff', '#ffd27a', '#7fd6ff'], side: ['#ffe6b8', '#ffffff', '#ffb347', '#7fd6ff'],
    tail: ['#ff2018', '#c4001a', '#ff5a1f', '#ff3b8a'], brake: ['#ff0800', '#c4001a', '#ff5a1f'], reverse: ['#ffffff', '#fff4e2'], turnL: ['#ffa31a', '#ffcc33', '#ff5a1f', '#ffffff'], turnR: ['#ffa31a', '#ffcc33', '#ff5a1f', '#ffffff'],
    fogF: ['#fff3d0', '#ffffff', '#ffd23f'], fogR: ['#ff2018', '#ff5a1f'], ambient: ['', '#7fd6ff', '#e8f2ff', '#ffd9a0', '#ff6a3d', '#d63cff', '#2a5cff']
  };
  var CUS_BALLS = ['#ff2018', '#1f5bff', '#ffffff', '#ffa31a', '#22d36b', '#d63cff']; // 自定义灯：加第一盏是红、第二盏是蓝（警灯），再往后轮着
  CUSTOM.forEach(function (r) { LIGHT_BALLS[r] = CUS_BALLS; });
  var LIGHT_FX = { led: [['steady', '常亮'], ['breath', '呼吸']], side: [['steady', '常亮'], ['breath', '呼吸']], ambient: [['steady', '常亮'], ['breath', '呼吸']],
    turnL: [['blink', '闪烁'], ['flow', '流水']], turnR: [['blink', '闪烁'], ['flow', '流水']] };
  CUSTOM.forEach(function (r) { LIGHT_FX[r] = CUS_FX; });
  // 路面光束：哪种灯有哪几道（大灯是近光、远光），标题
  var BEAM_OF = { head: ['low', 'high'], fogF: ['fogF'], tail: ['tail'], reverse: ['reverse'] };
  var BEAM_TITLE = { low: '近光路面光束', high: '远光路面光束', fogF: '路面光束', tail: '车尾路面光晕', reverse: '车尾路面光晕' };
  var BEAM_BALLS = ['#ffffff', '#fff1d6', '#cfe6ff', '#ffcf7a', '#ff3b2f'];
  // 还没选零件时镜头放大到哪（这种灯一般在哪）：车上一块地方的两个角，按半宽、高、半长的比例
  var LAMP_AT = { head: [[-1, 0.15, 0.5], [1, 0.75, 1]], led: [[-1, 0.15, 0.5], [1, 0.75, 1]], side: [[-1, 0.15, 0.5], [1, 0.75, 1]], fogF: [[-1, 0, 0.5], [1, 0.6, 1]],
    tail: [[-1, 0.2, -1], [1, 0.85, -0.5]], brake: [[-1, 0.2, -1], [1, 1, -0.4]], reverse: [[-1, 0.1, -1], [1, 0.8, -0.5]], fogR: [[-1, 0.05, -1], [1, 0.8, -0.5]], ambient: [[-0.8, 0.35, -0.5], [0.8, 0.95, 0.5]] };
  var LAMPS = D3Model.LIGHT_ROLES;
  var NAME = {};
  Object.keys(ROLES).forEach(function (k) { NAME[k] = ROLES[k].name; });
  var isMat = function (r) { return !!ROLES[r] && (ROLES[r].kind === 'mat' || ROLES[r].kind === 'light'); };
  var isLamp = function (r) { return LAMPS.indexOf(r) >= 0; };
  /** 两项不能共用同一个零件 / 材质：会动的部件之间、车身的材质（车漆、轮毂、卡钳、玻璃）之间、车身材质和灯之间。
      灯和灯可以（一条灯带既是日行灯又是转向灯：灯本身的材质不动，每种灯各铺一层点亮层，同参考项目）；会动的部件和材质 / 灯互不影响 */
  function clash(a, b) { return a !== b && isMat(a) === isMat(b) && !(isLamp(a) && isLamp(b)); }

  var on = false, cfg = null, saved = null, page = null, timer = 0, dirty = false, building = null, again = false, tests = {}, zoom = 1, resetArm = 0;
  var userOff = {}; // 灯的页里自己点了"关掉"的：夜景里不再自动亮
  var bOpen = {}, bShown = {}, frameT = 0; // 展开了参数的光束、这次进页面已经把镜头转过去看过的光束、对准灯的定时器
  var folds = {}, items = [], flashing = null; // 从列表选：树里展开了哪些、现在列着的项、刚闪的零件（重建后接着闪）
  var tool = 'pick', by = {}, origBuf = null, selN = 0; // 选零件的办法、按材质 / 整个部件还是只要点到的、进来时的 GLB、圈了几个面
  var undos = [], redos = [], sliding = false; // 撤销 / 重做的记录；正在拖滑块（一次拖动只记一步）
  var selMode = 'smart', selSize = 22, selAngle = 30; // 圈出来默认智能点选：没分开零件的车模，车门、引擎盖这类有缝有棱的板件点一下就是一整块

  function car() { return window.D3Car; }
  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }
  function d3() { var m = car() && car().model(); return m && m.d3; }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** 配置里按名字写的（内置 W70）换成编号，编辑器只认编号 */
  function normalize(c) {
    var d = d3();
    c.mats = c.mats || {}; c.parts = c.parts || {}; c.pick = c.pick || {}; c.lights = c.lights || {};
    Object.keys(c.mats).forEach(function (k) { c.mats[k] = D3Model.matRefs(d, c.mats[k]).map(function (m) { return m.userData.matId; }); });
    Object.keys(c.pick).forEach(function (k) { c.pick[k] = D3Model.meshRefs(d, c.pick[k]).map(function (m) { return m.userData.mid; }); });
    c.hide = D3Model.meshRefs(d, c.hide).map(function (m) { return m.userData.mid; });
    Object.keys(c.parts).forEach(function (k) {
      var p = c.parts[k];
      if (k === 'wheels') c.parts.wheels = D3Model.meshRefs(d, p).map(function (m) { return m.userData.mid; });
      else if (p && p.meshes) p.meshes = D3Model.meshRefs(d, p.meshes).map(function (m) { return m.userData.mid; });
    });
    return c;
  }
  /** 改了朝向 / 车长：配置里按原来位置写死的坐标（W70）作废，改成按外框自动算 */
  function freeGeometry() {
    if (!cfg.coords && !cfg.box) return;
    ['coords', 'box', 'wheelPos', 'turnPos', 'labelOut', 'wheelR'].forEach(function (k) { delete cfg[k]; });
    Object.keys(cfg.parts).forEach(function (k) {
      var p = cfg.parts[k];
      if (p && p.at) { delete p.at; delete p.axis; if (/^door/.test(k)) p.style = p.style || 'butterfly'; delete p.angle; }
    });
  }

  // ================= 开 / 关 =================
  function open() {
    var c = car(), m = c && c.model();
    if (!m || !m.d3) { D3.toast('车模还没载入好，等一下再点'); return; }
    S.close();
    if (window.D3DebugPanel) D3DebugPanel.close();
    if (window.D3CarInfo) D3CarInfo.close();
    saved = clone(m.cfg); cfg = normalize(clone(m.cfg)); // 车牌、贴纸改了直接交给车（不重建），车上的配置会跟着变：取消要用进来时的副本 page = null; tests = {}; userOff = {}; zoom = 1; dirty = false; folds = {}; flashing = null;
    tool = 'pick'; by = {}; origBuf = m.rec.buf; selN = 0; undos = []; redos = []; sliding = false;
    on = true;
    panel.style.setProperty('--acc', S.pick('paint').acc);
    panel.className = 'set tune on';
    appEl.classList.add('tuning');
    D3.lock(true);
    c.edit(true);
    render(true);
    syncUndo();
  }
  function close() {
    on = false; page = null; tests = {};
    undos = []; redos = []; origBuf = null; // 撤销记录里拆零件前的 GLB（大车模几十 MB 一份）退出就放掉，不留到下次打开
    clearTimeout(timer);
    if (window.D3Sel) D3Sel.stop();
    panel.className = 'set tune';
    appEl.classList.remove('tuning');
    D3.lock(false);
    if (car()) { car().compact(false); car().hinge(null); car().wrapEdit(null); car().night(false); car().edit(false); }
    D3WrapTune.reset();
  }
  function done() {
    var m = car().model(), rec = m.rec;
    flush().then(function () {
      if (rec.buf !== origBuf) rec.builtin = false; // 拆过零件的默认车模：存改过的 GLB
      return D3Model.save({ buf: rec.buf, builtin: rec.builtin, cfg: cfg, name: rec.name, credit: rec.credit });
    }).then(function (ok) {
      rec.cfg = cfg; rec.custom = true;
      D3Model.gcWraps(cfg); // 删掉的贴纸图片从本地库删掉
      close();
      D3.toast(ok ? '车模调好了' : '这台车机存不了，这次打开有效');
      car().modelUI();
    });
  }
  function cancel() {
    var m = car().model(), changed = JSON.stringify(cfg) !== JSON.stringify(normalize(clone(saved))) || m.rec.buf !== origBuf;
    clearTimeout(timer);
    m.rec.buf = origBuf; // 拆过零件的：换回进来时的 GLB
    D3Model.gcWraps(saved); // 这次加了又没存的贴纸图片
    close();
    dirty = false;
    if (changed) car().rebuild(saved, true); // 等车回到原位再建（建车会卡一下）
  }

  // ================= 改了就重建 =================
  function rebuild() {
    clearTimeout(timer);
    dirty = true;
    tip.innerHTML = '正在更新车模…';
    timer = setTimeout(afterFlash, 350);
  }
  /** 车上正闪着（从列表选）：闪完再建——建车会卡一下，闪到一半卡住就不像在闪了 */
  function afterFlash() {
    if (car() && car().info().flash) { timer = setTimeout(afterFlash, 120); return; }
    flush();
  }
  /** 马上按现在的配置重建（正在建就等它建完再建一次） */
  function flush() {
    clearTimeout(timer);
    if (building) { again = true; return building; }
    if (!dirty) return Promise.resolve();
    dirty = false;
    if (window.D3Sel) D3Sel.stop(); // 圈选的高亮挂在旧车上
    building = car().rebuild(clone(cfg)).then(function () {
      building = null;
      if (!on) { again = false; return; } // 取消了：不再按改过的配置建（取消时已经按原来的重建）
      if (again) { again = false; dirty = true; return flush(); }
      Object.keys(tests).forEach(function (k) { car().force(k, true); });
      if (flashing && Date.now() - flashing.at < 1500) car().flash(flashing.mids, flashing.at); // 重建把闪着的拿掉了：接着闪
      if (tool === 'paint' && page) selStart();
      render(); mark();
    }, function (e) {
      building = null;
      D3.toast('按这个设置建车出错了：' + (e && e.message || ''));
      console.error(e);
    });
    return building;
  }

  // ================= 零件归哪一项 =================
  function inRole(r, mid) {
    if (r === 'hide') return (cfg.hide || []).indexOf(mid) >= 0;
    if (r === 'wheels') return (cfg.parts.wheels || []).indexOf(mid) >= 0;
    if (isMat(r)) return (cfg.pick[r] || []).indexOf(mid) >= 0;
    var p = cfg.parts[r];
    return !!(p && p.meshes && p.meshes.indexOf(mid) >= 0);
  }
  /** 零件从和 r 冲突的项里拿掉（见 clash）：会动的部件（门、车窗、车轮……）之间一个零件只归一项，车身材质之间、车身材质和灯之间也只归一项；
      灯和灯能共用；两类互不影响——尾门上的倒车灯既是倒车灯、又跟着尾门开，门板标成车漆照样跟着门开，车轮上的轮毂照样转。r 不给（藏起来）：全拿掉 */
  function dropMesh(mid, r) {
    var hit = function (k) { return !r || k === r || clash(k, r); }; // 这一项自己也先拿掉（再按要不要加进来放回去）
    if (hit('wheels')) { var w = cfg.parts.wheels || [], i = w.indexOf(mid); if (i >= 0) w.splice(i, 1); }
    Object.keys(cfg.parts).forEach(function (k) { var p = cfg.parts[k]; if (k !== 'wheels' && hit(k) && p && p.meshes) { var j = p.meshes.indexOf(mid); if (j >= 0) p.meshes.splice(j, 1); } });
    Object.keys(cfg.pick).forEach(function (k) { if (!hit(k)) return; var j = cfg.pick[k].indexOf(mid); if (j >= 0) cfg.pick[k].splice(j, 1); });
  }
  /** 拆出来的新零件接着归原零件在另一类里的项：从尾门上圈出倒车灯，新零件还跟着尾门开；从整块车身里圈出车门，还是车漆 */
  function inherit(from, mid, r) {
    if (r === 'hide') return;
    Object.keys(ROLES).forEach(function (k) { if (k !== 'hide' && isMat(k) !== isMat(r) && inRole(k, from) && !inRole(k, mid)) setMesh(k, mid, true); });
  }
  function part(r) {
    if (!r || !ROLES[r] || ROLES[r].kind !== 'part') return null; // 车牌、贴纸这些页不是部件
    return (cfg.parts[r] = cfg.parts[r] || { meshes: [], style: 'normal' });
  }
  /** 零件放进 / 拿出这一项 */
  function setMesh(r, mid, add) {
    if (r === 'hide') {
      var hd = cfg.hide = cfg.hide || [], i = hd.indexOf(mid);
      if (add) { dropMesh(mid); if (i < 0) hd.push(mid); } else if (i >= 0) hd.splice(i, 1);
      return;
    }
    dropMesh(mid, r);
    if (!add) return;
    if (r === 'wheels') (cfg.parts.wheels = cfg.parts.wheels || []).push(mid);
    else if (isMat(r)) (cfg.pick[r] = cfg.pick[r] || []).push(mid);
    else part(r).meshes.push(mid);
  }
  function toggle(list, v) { var i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); return i < 0; }
  /** 材质放进 / 拿出这一项（放进来就从冲突的项里拿掉；几种灯能共用一个材质） */
  function toggleMat(r, id) {
    Object.keys(cfg.mats).forEach(function (k) { if (clash(k, r)) { var j = cfg.mats[k].indexOf(id); if (j >= 0) cfg.mats[k].splice(j, 1); } });
    return toggle(cfg.mats[r] = cfg.mats[r] || [], id);
  }
  var HIST = { rot90: '车头方向', rot180: '车头方向', rotX: '车身朝上', rotZ: '车身朝上', clear: '清空这一项', showAll: '全部显示', keepGlass: '保留原来的玻璃', keepPaintMap: '保留车漆贴图',
    style: '门型', mode: '怎么开', flip: '反向', other: '铰链在另一头', lcolor: '灯的颜色', lcustom: '灯的颜色', fx: '灯的效果', when: '什么时候亮', late: '先闪后闪',
    cusAdd: '加自定义灯', cusDel: '删掉自定义灯',
    length: '车长', exposure: '亮度', env: '反光', angle: '角度', travel: '滑多远', lhsl: '灯的颜色',
    pon: '车牌', pstyle: '车牌', pkey: '车牌', pback: '车牌', pclr: '车牌', pauto: '车牌', pw: '车牌', pAt: '车牌位置', pang: '车牌角度', phsl: '车牌颜色',
    pivO: '铰链位置', pivU: '铰链位置', pivF: '铰链位置', pivReset: '铰链位置', glow: '发光质感', bm: '路面光束', bon: '路面光束', bshape: '路面光束', blobe: '路面光束',
    bfollow: '光束颜色', bcolor: '光束颜色', borrow: '借灯打转向' }; // 选上对称的另一边、跳到哪一组不在这：自己记 / 不改配置
  function byMat(r) { return isMat(r) && (by[r] || ROLES[r].by) === 'mat'; }
  /** 点车上：材质类按材质（或者按零件）、别的按零件，加进这一项 / 再点去掉 */
  function picked(h) {
    if (!on) return;
    if (!h) { D3.toast('没点到车'); return; }
    if (page && ROLES[page].kind === 'plate') { D3.toast('按住车上的车牌拖着走', 1800); return; }
    if (page && ROLES[page].kind === 'wrap') { D3WrapTune.hint(); return; }
    if (!page) { // 在主页：说一下点到的是什么
      var o = owner(h.mid, h.mat);
      D3.toast((h.name ? short(h.name) + '：' : '') + (o || '还没归到哪一项') + '。点下面一项进去再选');
      car().mark([h.mid], '#ffffff');
      setTimeout(mark, 900);
      return;
    }
    var added, label = h.name ? short(h.name) : '';
    if (byMat(page)) { if (h.mat === undefined) return; remember('点零件'); added = toggleMat(page, h.mat); }
    else {
      var g = wholeBy(page) ? partOf(page, h.mid) : { mids: [h.mid] };
      remember('点零件');
      added = !g.mids.every(function (id) { return inRole(page, id); });
      g.mids.forEach(function (id) { setMesh(page, id, added); });
      if (g.mids.length > 1) { // 一下选了好几块：闪一下告诉你选了哪些
        label = g.name ? short(g.name) + '（' + g.mids.length + ' 块）' : /^win/.test(page) ? '里外 ' + g.mids.length + ' 层' : label + ' 等 ' + g.mids.length + ' 块';
        flashing = { mids: g.mids, at: Date.now() };
        car().flash(g.mids);
      }
    }
    var also = added && isLamp(page) ? alsoLamps(h.mid, page, byMat(page) ? h.mat : undefined) : '';
    D3.toast((added ? '加到「' : '从「') + NAME[page] + (added ? '」' : '」里去掉') + (label ? '：' + label : '') + (also ? '（也还是「' + also + '」）' : ''), also ? 2600 : 1800);
    render(); mark(); // 高亮马上跟上（零件编号不变，不用等重建）
    rebuild();
  }

  // ================= 整个部件 =================
  // 细致的车模里一扇门是好几块拼的（门板、内饰、门架子、把手、里外几层玻璃），只选到一块的话开门只开了内饰。
  // 会动的部件、车轮、要藏的东西点到一块就选整个部件：按车模自己的层级往上找"像一个部件"的那一组（大小、在车的哪一边对得上）；
  // 层级里没分组的按名字：前面一样的算一组（"…door_L_50_carpaint"、"…door_L_50_details"），从短到长找第一个像一个部件的；
  // 名字也看不出来的，带上外框包在它里面的；车窗只带和它重合的里外几层。已经在别的项里的不动——
  // 除非和点到的这块原来在同一项（认错了，整个挪过来）；车轮不带卡钳（卡钳不跟着转）
  var SIDE = { doorFL: 1, doorRL: 1, winFL: 1, winRL: 1, doorFR: -1, doorRR: -1, winFR: -1, winRR: -1 }; // 左边是 +x
  var SPAN = { doorFL: 0.4, doorFR: 0.4, doorRL: 0.4, doorRR: 0.4, hood: 0.45, trunk: 0.45, sunroof: 0.5, sunshade: 0.5, chargePort: 0.15, wheels: 0.35 }; // 前后最长占车长多少
  function wholeBy(r) { return !isMat(r) && (by[r] || 'part') === 'part'; }
  function pathOf(n, mid) { // 层级里从根到这块的路
    if (n.mid === mid) return [n];
    if (n.mids.indexOf(mid) < 0) return [];
    for (var i = 0; i < n.kids.length; i++) { var p = pathOf(n.kids[i], mid); if (p.length) return [n].concat(p); }
    return [n];
  }
  function partOf(r, mid) {
    var d = d3(), B = {}, all = d.meshes.length, out = [mid], name = '';
    var dm = String(car().info().dims || '1,1.3,2.3').split(',').map(parseFloat), L = dm[2] * 2, win = /^win/.test(r);
    var bx = function (id) { // 零件自己的外框（世界坐标，不算挂在它下面的东西）
      if (!(id in B)) {
        var m = d.meshes[id];
        if (m && m.visible && m.parent && m.geometry && m.geometry.attributes.position) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); B[id] = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); } else B[id] = null;
      }
      return B[id];
    };
    var fits = function (ids) {
      var b = new THREE.Box3();
      ids.forEach(function (id) { var x = bx(id); if (x) b.union(x); });
      if (b.isEmpty() || ids.length > (r === 'hide' ? all * 0.5 : Math.max(60, all * 0.3))) return false;
      if (r !== 'hide' && (b.max.z - b.min.z > L * (SPAN[r] || 0.5) || b.max.y - b.min.y > dm[1] * 0.95)) return false;
      if (SIDE[r]) return b.max.x - b.min.x < dm[0] * 1.1 && (SIDE[r] > 0 ? b.min.x > -dm[0] * 0.15 : b.max.x < dm[0] * 0.15);
      return true;
    };
    if (!win) { // 从上往下，第一个像一个部件的那一组（最大的那个）
      var path = pathOf(d.tree, mid);
      for (var i = 0; i < path.length; i++) if (path[i].mids.length > 1 && fits(path[i].mids)) { out = path[i].mids.slice(); name = path[i].name; break; }
    }
    if (out.length === 1 && !win) { // 层级里没分组：按名字前面一样的（去掉全部零件共有的开头），从短到长
      var tok = function (m) { return String(m.name || '').split(/[^A-Za-z0-9]+/).filter(Boolean); }, T = d.meshes.map(tok), mine = T[mid], base = 0;
      while (base < mine.length && T.every(function (x) { return x[base] === mine[base]; })) base++;
      for (var k = base + 1; k <= mine.length; k++) {
        var ids = [];
        T.forEach(function (x, id) { for (var j = 0; j < k; j++) if (x[j] !== mine[j]) return; ids.push(id); });
        if (ids.length < 2) break;
        if (fits(ids)) { out = ids; name = mine.slice(base, k).join('_'); break; }
      }
    }
    if (out.length === 1) { // 名字也看不出来：外框包在它里面的（内饰、把手、门里的几层）；车窗：和它重合的里外几层
      var a = bx(mid);
      if (a) {
        var big = a.clone().expandByScalar(L * 0.01), a2 = a.clone().expandByScalar(0.01);
        d.meshes.forEach(function (m, id) {
          var b = id !== mid && bx(id);
          if (b && (win ? iou(a2, b.clone().expandByScalar(0.01)) > 0.5 : big.containsBox(b))) out.push(id);
        });
      }
      name = '';
    }
    var from = owners(mid, r), cal = cfg.mats.caliper || [];
    out = out.filter(function (id) {
      if (id === mid) return true;
      if ((cfg.hide || []).indexOf(id) >= 0 && r !== 'hide') return false;
      if (r === 'wheels' && ((d.meshes[id].userData.mats || []).some(function (x) { return cal.indexOf(x) >= 0; }) || (cfg.pick.caliper || []).indexOf(id) >= 0)) return false; // 卡钳不跟着轮子转
      var o = owners(id, r);
      return !o || o === NAME[r] || o === from;
    });
    return { mids: out, name: name };
  }
  function iou(a, b) {
    var i = a.clone().intersect(b);
    if (i.isEmpty()) return 0;
    var v = function (x) { var s = x.getSize(new THREE.Vector3()); return s.x * s.y * s.z; }, vi = v(i);
    return vi / (v(a) + v(b) - vi);
  }
  function short(s) { return s.length > 36 ? s.slice(0, 16) + '…' + s.slice(-16) : s; }
  function owner(mid, mat) {
    var r = [];
    Object.keys(ROLES).forEach(function (k) {
      if (isMat(k) ? (cfg.mats[k] || []).indexOf(mat) >= 0 || (cfg.pick[k] || []).indexOf(mid) >= 0 : inRole(k, mid)) r.push(NAME[k]);
    });
    return r.join('、');
  }
  /** 这一项的零件（网格编号）：材质类 = 用这些材质的 + 零件级的 */
  function midsOf(r) {
    var d = d3();
    if (!d || !r) return [];
    if (isMat(r)) {
      var ids = cfg.mats[r] || [], out = (cfg.pick[r] || []).slice();
      d.meshes.forEach(function (m) { if ((m.userData.mats || []).some(function (x) { return ids.indexOf(x) >= 0; }) && out.indexOf(m.userData.mid) < 0) out.push(m.userData.mid); });
      return out;
    }
    if (r === 'hide') return [];
    if (r === 'wheels') return cfg.parts.wheels || [];
    return (cfg.parts[r] && cfg.parts[r].meshes) || [];
  }
  /** 这一项在车上叠一层强调色（灯亮着看效果时不叠：叠上去颜色就不对了） */
  function mark() {
    if (!on || !car()) return;
    var hide = page && ROLES[page].kind === 'light' && tests[page];
    car().mark(page && !hide ? midsOf(page) : [], getComputedStyle(panel).getPropertyValue('--acc').trim() || '#3fb4ff');
  }

  // ================= 圈出来 =================
  function selStart() {
    var ctx = car().selCtx();
    if (!ctx) return;
    D3Sel.start(ctx);
    D3Sel.mode(selMode); D3Sel.size(selSize); D3Sel.angle(selAngle);
    selN = 0;
  }
  function selChanged(n) {
    selN = n;
    var e = $('selN'), b = $('selMake'), u = $('selUndo');
    if (e) e.textContent = n ? '圈了 ' + n + ' 个面' : '还没圈';
    if (b) b.disabled = !n;
    if (u) u.disabled = !D3Sel.canUndo();
  }
  /** 圈出来的拆成新零件，放进这一项 */
  function carveSel() {
    var jobs = D3Sel.jobs(), m = car().model(), r;
    if (!jobs.length || !page) return;
    tip.innerHTML = '正在把圈出来的拆成新零件…';
    try { r = D3Model.carve(m.rec.buf, m.d3, jobs.map(function (j) { return { mid: j.mid, tris: j.tris, name: NAME[page] }; })); } catch (e) { D3.toast('拆不了：' + (e && e.message || '')); console.error(e); render(); return; }
    remember('拆零件', 'carve');
    m.rec.buf = r.buf;
    var got = r.mids.filter(function (x) { return x >= 0; });
    r.mids.forEach(function (mid, i) { if (mid >= 0) { setMesh(page, mid, true); inherit(jobs[i].mid, mid, page); } });
    flashing = { mids: got, at: Date.now() + 500 }; // 建好再闪
    D3.toast('拆好了，做成了「' + NAME[page] + '」', 2000);
    dirty = true;
    flush();
  }
  /** 拖完车上的铰链小球（car3d.js）：存成 piv、重建，门开着给人看 */
  function hinged2(r, piv) {
    if (!on || !r || !part(r)) return;
    remember('铰链位置');
    part(r).piv = piv;
    tests[r] = 1;
    render(); rebuild();
  }
  // ================= 一键镜像：对侧配好的，按车身中线翻过来 =================
  /** 网格的每个三角形：fn(编号, 中心 x, y, z, 大小)；三角形编号同拆零件用的（按 GLB 里的顺序） */
  function eachTri(m, fn) {
    var g = m.geometry, pos = g && g.attributes.position, ix = g && g.index;
    if (!pos) return;
    var n = ix ? ix.count / 3 : pos.count / 3, mw = m.matrixWorld, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (var t = 0; t < n; t++) {
      a.fromBufferAttribute(pos, ix ? ix.getX(t * 3) : t * 3).applyMatrix4(mw);
      b.fromBufferAttribute(pos, ix ? ix.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(mw);
      c.fromBufferAttribute(pos, ix ? ix.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(mw);
      fn(t, (a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)));
    }
  }
  /** 这一项照着对侧镜像过来：① 零件级：对侧每块零件的外框沿车身中线翻过来，在别的部件没占着的零件里找中心最近、大小差不多的（左右门、左右车窗这种分好零件的一找一个准）；
      ② 找不到的（整块没分开、对侧是"圈出来"拆的）：对侧零件每个三角形的中心翻过来，找位置重合的三角形，拆成新零件；
      ③ 门型、角度、反向、铰链位置（piv 按里外算，左右通用）、灯的颜色效果亮度一起带过来 */
  function mirror(r) {
    var src = PAIRS[r], d = d3(), ids = midsOf(src), meshes = d && d.meshes;
    if (!meshes || !ids.length) return;
    car().atRest(function () { mirrorAt(r, src, ids, meshes); });
  }
  /** 灯：选好了一边，把车身另一边对称的也加进这一项（选上的不动） */
  function mirrorSelf(r) {
    var d = d3(), ids = midsOf(r), meshes = d && d.meshes;
    if (!meshes || !ids.length) return;
    car().atRest(function () { mirrorAt(r, r, ids, meshes, true); });
  }
  /** add：同一项里加上对称的另一边（不清掉已经选上的，参数不用带） */
  function mirrorAt(r, src, ids, meshes, add) {
    var busy = {}, own = {}, used = {};
    if (!isMat(r)) Object.keys(cfg.parts).forEach(function (k) { var pp = cfg.parts[k]; if (k !== r && k !== 'wheels' && pp && pp.meshes) pp.meshes.forEach(function (id) { busy[id] = 1; }); }); // 灯不避开门上、尾门上的零件（两类互不影响）
    (cfg.hide || []).forEach(function (id) { busy[id] = 1; });
    // 冲突的项里的零件不拿；灯和灯能共用，但左转向灯不找右转向灯的零件（对称的那一盏本来就是另一边的转向灯）
    Object.keys(cfg.pick).forEach(function (k) { if (clash(k, r) || (/^turn/.test(r) && /^turn/.test(k) && k !== r)) (cfg.pick[k] || []).forEach(function (id) { busy[id] = 1; }); });
    ids.forEach(function (id) { own[id] = 1; });
    var cands = [];
    meshes.forEach(function (m) { var id = m.userData.mid; if (m.visible && !busy[id] && !own[id]) cands.push({ id: id, b: D3Model.box(m) }); });
    var got = [], rest = [], self = 0, cen = function (b) { return b.getCenter(new THREE.Vector3()); }, siz = function (b) { return b.getSize(new THREE.Vector3()); };
    ids.forEach(function (id) {
      var m = meshes[id];
      if (!m) return;
      var b = D3Model.box(m), c = cen(b), sz = siz(b), diag = sz.length() || 1, best = null, score = Infinity;
      if (b.min.x < -0.05 * sz.x && b.max.x > 0.05 * sz.x && Math.abs(c.x) < 0.1 * sz.x) { self++; return; } // 跨着车身中线的（自己就是对称的）：不用找
      if (m.userData.d3carved) { rest.push(id); return; } // 圈出来拆的：对侧多半还连在大块里，按三角形找（按外框找可能碰上大小差不多的别的零件）
      c.x = -c.x;
      cands.forEach(function (q) {
        if (used[q.id]) return;
        var qc = cen(q.b), qs = siz(q.b), dist = qc.distanceTo(c), sd = qs.distanceTo(sz);
        if (dist > diag * 0.5 || sd > diag * 0.35) return;
        if (dist + sd < score) { score = dist + sd; best = q; }
      });
      if (best) { used[best.id] = 1; got.push(best.id); } else rest.push(id);
    });
    // ② 按三角形找对侧位置重合的面
    var jobs = [];
    if (rest.length) {
      var pts = [], sizes = [];
      rest.forEach(function (id) { eachTri(meshes[id], function (t, x, y, z, e) { pts.push([-x, y, z]); sizes.push(e); }); });
      sizes.sort(function (a, b) { return a - b; });
      var tol = Math.max(0.003, (sizes[sizes.length >> 1] || 0.01) * 0.5), cell = tol * 2, grid = {};
      var key = function (x, y, z) { return Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell); };
      meshes.forEach(function (m) {
        var id = m.userData.mid;
        if (!m.visible || busy[id] || own[id] || used[id]) return;
        eachTri(m, function (t, x, y, z) { var k = key(x, y, z); (grid[k] = grid[k] || []).push(id, t, x, y, z); });
      });
      var pick = {}, hit = 0;
      pts.forEach(function (q) {
        var bx = Math.floor(q[0] / cell), by2 = Math.floor(q[1] / cell), bz = Math.floor(q[2] / cell), best = null, bd = tol * tol;
        for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) for (var k = -1; k <= 1; k++) {
          var l = grid[(bx + i) + ',' + (by2 + j) + ',' + (bz + k)];
          if (!l) continue;
          for (var u = 0; u < l.length; u += 5) {
            var dx = l[u + 2] - q[0], dy = l[u + 3] - q[1], dz = l[u + 4] - q[2], dd = dx * dx + dy * dy + dz * dz;
            if (dd < bd) { bd = dd; best = [l[u], l[u + 1]]; }
          }
        }
        if (best) { (pick[best[0]] = pick[best[0]] || {})[best[1]] = 1; hit++; }
      });
      if (hit >= pts.length * 0.3) jobs = Object.keys(pick).map(function (id) { return { mid: +id, tris: Object.keys(pick[id]).map(Number), name: NAME[r] }; });
    }
    if (!got.length && !jobs.length) {
      D3.toast(add && self === ids.length ? '选上的零件左右两边本来就连在一起，不用再选' : '没找到和「' + NAME[src] + '」对称的零件，用"点零件"或"圈出来"选');
      return;
    }
    remember(add ? '选上对称的另一边' : '镜像', jobs.length ? 'carve' : '');
    var had = midsOf(r).slice();
    if (!add) {
      midsOf(r).forEach(function (id) { setMesh(r, id, false); });
      if (isMat(r)) cfg.mats[r] = [];
    }
    got.forEach(function (id) { setMesh(r, id, true); });
    var made = 0;
    if (jobs.length) {
      var m0 = car().model(), res;
      try { res = D3Model.carve(m0.rec.buf, m0.d3, jobs); } catch (e) { D3.toast('拆不了：' + (e && e.message || '')); console.error(e); }
      if (res) { m0.rec.buf = res.buf; res.mids.forEach(function (mid, i) { if (mid >= 0) { setMesh(r, mid, true); inherit(jobs[i].mid, mid, r); made++; } }); }
    }
    // 参数一起带过来
    if (add) { /* 同一项：参数本来就是这一项的 */ }
    else if (isMat(r)) { if (cfg.lights[src]) cfg.lights[r] = clone(cfg.lights[src]); }
    else {
      var ps = cfg.parts[src] || {}, pt = part(r);
      ['style', 'angle', 'flip', 'other', 'mode', 'travel'].forEach(function (k) { if (ps[k] !== undefined) pt[k] = ps[k]; else delete pt[k]; });
      if (ps.piv) pt.piv = ps.piv.slice(); else delete pt.piv;
      if (ps.at && ps.axis) { pt.at = [-ps.at[0], ps.at[1], ps.at[2]]; pt.axis = [-ps.axis[0], ps.axis[1], ps.axis[2]]; } // 写死的铰链（默认车模）：位置翻过来，转轴也翻过来（往哪边转按"往上 / 往外"自己定）
    }
    D3.toast((add ? '加上了对称的另一边：' : '镜像好了：') + [got.length ? '找到 ' + got.length + ' 块对称的零件' : '', made ? '按对称的位置拆出 ' + made + ' 块' : ''].filter(Boolean).join('，'), 2600);
    flashing = { mids: add ? midsOf(r).filter(function (id) { return had.indexOf(id) < 0; }) : midsOf(r), at: Date.now() + 500 };
    if (!isMat(r)) tests[r] = 1;
    render(); mark(); rebuild();
  }
  function lastCarve() { var u = undos[undos.length - 1]; return !!u && u.kind === 'carve'; }

  // ================= 撤销 / 重做 =================
  function snap(what, kind) { return { cfg: clone(cfg), buf: car().model().rec.buf, page: page, what: what || '', kind: kind || '' }; }
  /** 改配置之前调：记下改之前的样子 */
  function remember(what, kind) {
    undos.push(snap(what, kind));
    if (undos.length > 60) undos.shift();
    redos = [];
    trimBufs();
    syncUndo();
  }
  /** 拆零件的每一步都换成一份新的 GLB：撤销记录里留着的旧 GLB 最多 4 份（再早的那几步撤销不了），不然大车模拆二十次能占掉上 GB 内存 */
  function trimBufs() {
    var seen = [], cur = car().model().rec.buf;
    for (var i = undos.length - 1; i >= 0; i--) {
      var b = undos[i].buf;
      if (b === cur || b === origBuf || seen.indexOf(b) >= 0) continue;
      seen.push(b);
      if (seen.length > 4) { undos.splice(0, i + 1); return; }
    }
  }
  function undo() { back(undos, redos, '撤销了'); }
  function redo() { back(redos, undos, '重做了'); }
  /** 回到记下的样子：配置、拆过零件的 GLB 一起回去，翻到当时改的那一页 */
  function back(from, to, word) {
    var s = from.pop();
    if (!s || !on) return;
    to.push(snap(s.what, s.kind));
    var m = car().model(), cut = m.rec.buf !== s.buf;
    m.rec.buf = s.buf;
    cfg = clone(s.cfg);
    sliding = false;
    if (s.page !== page) go(s.page); else { render(); mark(); }
    D3.toast(word + (s.what ? '：' + s.what : ''), 1600);
    syncUndo();
    dirty = true;
    if (cut) flush(); else rebuild(); // GLB 换了（拆零件）马上建：编号变了，高亮、圈选都要按新的
  }
  function syncUndo() {
    $('tuneUndo').disabled = !undos.length;
    $('tuneRedo').disabled = !redos.length;
    var u = body.querySelector('[data-a="uncarve"]');
    if (u) u.hidden = !lastCarve();
  }

  // ================= 从列表选 =================
  function owners(mid, r) { // 这个零件在哪一项里（只看和 r 冲突的，见 clash：选到这一项就会从那一项拿掉）
    if ((cfg.hide || []).indexOf(mid) >= 0) return NAME.hide;
    var o = '';
    Object.keys(ROLES).forEach(function (k) { if (!o && k !== 'hide' && (!r || r === 'hide' || clash(k, r)) && inRole(k, mid)) o = NAME[k]; });
    return o;
  }
  /** 这个零件（或材质）还是哪几种灯（灯的页里提示"也是日行灯"，不冲突） */
  function alsoLamps(mid, r, mat) {
    var d = d3(), ms = mat !== undefined ? [mat] : (d && d.meshes[mid] && d.meshes[mid].userData.mats) || [];
    return LAMPS.filter(function (k) { return k !== r && ((mat === undefined && inRole(k, mid)) || ms.some(function (x) { return (cfg.mats[k] || []).indexOf(x) >= 0; })); }).map(function (k) { return NAME[k]; }).join('、');
  }
  /** 材质类按材质：车模的全部材质（颜色、用它的零件数、已经归到哪一项） */
  function matItems(r) {
    var d = d3();
    return d.mats.map(function (m, id) {
      var n = d.meshes.filter(function (o) { return (o.userData.mats || []).indexOf(id) >= 0; }).length, mine = (cfg.mats[r] || []).indexOf(id) >= 0, other = '';
      Object.keys(cfg.mats).forEach(function (k) { if (!other && clash(k, r) && cfg.mats[k].indexOf(id) >= 0) other = NAME[k]; });
      var also = isLamp(r) ? alsoLamps(-1, r, id) : '';
      return { mat: id, label: m.name || (m.userData.gltfDefault ? '默认材质' : '未命名材质'), color: m.color ? '#' + m.color.getHexString() : '', depth: 0, state: mine ? 'on' : '',
        sub: n + ' 个零件' + (m.map ? ' · 带贴图' : '') + (other ? ' · 在「' + other + '」' : '') + (also ? ' · 也是「' + also + '」' : '') };
    });
  }
  /** 按零件：车模自己的节点层级排成树（只套了一层壳的往里走一层）；展开的才列下一层 */
  function nodeItems(r) {
    var d = d3(), out = [];
    if (!d || !d.tree) return out;
    var inner = function (n) { var name = n.name; while (n.mid < 0 && n.kids.length === 1) { n = n.kids[0]; name = n.name || name; } return { n: n, name: name }; };
    function add(n0, depth) {
      var x = inner(n0), n = x.n, k = n.mids.filter(function (mid) { return inRole(r, mid); }).length, other = k ? '' : owners(n.mids[0], r);
      var also = isLamp(r) && n.mid >= 0 ? alsoLamps(n.mid, r) : '';
      var mats = n.mid >= 0 ? (d.meshes[n.mid].userData.mats || []).map(function (id) { return d.mats[id].name; }).filter(Boolean) : [];
      out.push({ mids: n.mids, key: n.key, label: x.name || (n.mid >= 0 ? '零件 ' + (n.mid + 1) : '没有名字的一组'), named: !!x.name, depth: depth,
        fold: n.kids.length ? !!folds[n.key] : undefined, state: k === n.mids.length ? 'on' : k ? 'some' : '',
        sub: (n.kids.length ? n.mids.length + ' 个零件' : mats.slice(0, 2).join('、') + (mats.length > 2 ? '…' : '')) + (other ? ' · 在「' + other + '」' : '') + (also ? ' · 也是「' + also + '」' : '') });
      if (n.kids.length && folds[n.key]) n.kids.forEach(function (c) { add(c, depth + 1); });
    }
    // 圈出来拆的零件挂在场景最顶层（原有零件的编号才不变）：列表里放在车模自己的零件后面，不让它们把车模那一层挤成要展开的一组
    var cut = d.tree.kids.filter(function (k) { return k.carved; }), own = d.tree.kids.filter(function (k) { return !k.carved; });
    if (own.length) {
      var top = inner({ name: d.tree.name, key: d.tree.key, mid: -1, kids: own, mids: [].concat.apply([], own.map(function (k) { return k.mids; })) }).n;
      (top.mid < 0 && top.kids.length ? top.kids : [top]).forEach(function (c) { add(c, 0); });
    }
    cut.forEach(function (c) { add(c, 0); });
    // 名字前面一长串一样的（导出工具加的车模名，像 BYDobj）：三成以上的名字都带着就去掉（切在单词边界上），看得到后面有用的那段；
    // 名字里重复了一遍的一段（SM_Light_F_101_SM_Light_F_101_dummy：节点名、网格名拼在一起）只留一遍
    var named = out.filter(function (x) { return x.named; }).map(function (x) { return x.label; }), cut = '';
    for (var L = 16; L >= 4 && !cut; L--) {
      var cnt = {};
      named.forEach(function (x) { if (x.length > L + 2) { var k = x.slice(0, L); cnt[k] = (cnt[k] || 0) + 1; } });
      Object.keys(cnt).forEach(function (k) { if (!cut && cnt[k] >= 4 && cnt[k] >= named.length * 0.3) cut = edge(k, named); });
    }
    out.forEach(function (x) {
      if (!x.named) return;
      if (cut && x.label.indexOf(cut) === 0 && x.label.length > cut.length + 2) x.label = x.label.slice(cut.length);
      x.label = dedupe(x.label);
    });
    return out;
  }
  /** 前缀退到单词边界上（下划线、横杠、点、空格后面，或者小写字母接大写字母的地方），不切断一个词；退不到 4 个字以上就不切 */
  function edge(k, names) {
    var with_ = names.filter(function (x) { return x.indexOf(k) === 0; });
    for (var i = k.length; i >= 4; i--) {
      var a = k.charAt(i - 1), b = i < k.length ? k.charAt(i) : null;
      if (/[ ._-]/.test(a)) return k.slice(0, i);
      var up = function (c) { return c && /[A-Z]/.test(c); };
      if (/[a-z0-9]/.test(a) && (b !== null ? up(b) : with_.every(function (x) { return up(x.charAt(i)); }))) return k.slice(0, i);
    }
    return '';
  }
  /** 按下划线分段，连着重复的一串只留一遍 */
  function dedupe(s) {
    var t = s.split('_');
    for (var k = t.length >> 1; k >= 1; k--) {
      for (var i = 0; i + 2 * k <= t.length; i++) {
        var same = true;
        for (var j = 0; j < k && same; j++) same = t[i + j] === t[i + k + j];
        if (same && t.slice(i, i + k).join('').length >= 4) { t.splice(i + k, k); return dedupe(t.join('_')); }
      }
    }
    return s;
  }
  /** 列表里点了一项：材质整类、一组零件整组放进 / 拿出这一项，车上闪 3 下 */
  function choose(x) {
    var d = d3(), added, mids;
    remember('从列表选');
    if (x.mat !== undefined) {
      added = toggleMat(page, x.mat);
      mids = d.meshes.filter(function (o) { return (o.userData.mats || []).indexOf(x.mat) >= 0; }).map(function (o) { return o.userData.mid; });
    } else {
      added = !x.mids.every(function (mid) { return inRole(page, mid); });
      x.mids.forEach(function (mid) { setMesh(page, mid, added); });
      mids = x.mids;
    }
    flashing = { mids: mids, at: Date.now() };
    car().flash(mids);
    D3.toast((added ? '加到「' : '从「') + NAME[page] + (added ? '」：' : '」里去掉：') + short(x.label), 1600);
    render(); mark();
    rebuild();
  }
  function list(r) {
    items = byMat(r) ? matItems(r) : nodeItems(r);
    if (!items.length) return '<div class="trow-tip">这个车模没有能选的</div>';
    return '<div class="tlist">' + items.map(function (x, i) {
      return '<div class="titem' + (x.state ? ' ' + x.state : '') + '" style="padding-left:' + (x.depth * 0.3).toFixed(2) + 'rem">' +
        (x.fold === undefined ? '<i class="tfold"></i>' : '<button type="button" class="tfold' + (x.fold ? ' open' : '') + '" data-a="fold" data-i="' + i + '" aria-label="展开"></button>') +
        '<button type="button" class="tpick" data-a="item" data-i="' + i + '">' + (x.color ? '<i class="tsw" style="background:' + x.color + '"></i>' : '') +
        '<em class="tnm"><span>' + esc(x.label) + '</span>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</em><b class="tck"></b></button></div>';
    }).join('') + '</div>';
  }
  /** 两指 / 滚轮缩放了：远近滑块跟着动 */
  function zoomed(z) {
    zoom = z;
    var t = body.querySelector('[data-n="zoom"]');
    if (!t) return;
    t.value = z;
    t.style.setProperty('--p', ((z - 0.6) / (6 - 0.6) * 100).toFixed(1) + '%');
    t.nextSibling.textContent = Math.round(z * 100) + '%';
  }

  // ================= 面板 =================
  function count(r) {
    if (isMat(r)) {
      var a = (cfg.mats[r] || []).length, b = (cfg.pick[r] || []).length;
      return [a ? a + ' 个材质' : '', b ? b + ' 个零件' : ''].filter(Boolean).join(' · ');
    }
    if (r === 'hide') return (cfg.hide || []).length ? cfg.hide.length + ' 个零件' : '';
    if (r === 'wheels') return (cfg.parts.wheels || []).length ? cfg.parts.wheels.length + ' 个零件' : '';
    if (r === 'plate') {
      var st = cfg.plates || {}, f = st.front && st.front.on, rr = st.rear && st.rear.on;
      return f && rr ? '前 + 后' : f ? '前' : rr ? '后' : '';
    }
    if (r === 'wrap') return cfg.wraps && cfg.wraps.length ? cfg.wraps.length + ' 张' : '';
    if (/^win/.test(r) && cfg.winSplit && (r === 'winFL' || r === 'winFR')) return '内置';
    var p = cfg.parts[r];
    return p && p.meshes && p.meshes.length ? p.meshes.length + ' 个零件' : '';
  }
  /** 识别结果一句话：认出了哪些、没认出哪些（没认出的照样显示，只是车况变了不动、只在文字里说）。不是每台车都有的（卡钳、日行灯、示宽、倒车、雾灯、氛围灯、天窗……）没认出不提 */
  var MUST = ['rim', 'glass', 'wheels', 'hood', 'trunk']; // 车漆不自动认，没标出来不算"没认出"
  function summary() {
    var got = [], miss = [];
    GROUPS.forEach(function (g) {
      g[1].forEach(function (r) {
        if (r === 'hide' || r === 'plate' || r === 'wrap' || /^(door|win)/.test(r)) return;
        if (count(r)) got.push(NAME[r]); else if (MUST.indexOf(r) >= 0) miss.push(NAME[r]);
      });
    });
    [['doorFL', 'doorFR', 'doorRL', 'doorRR', '车门'], ['winFL', 'winFR', 'winRL', 'winRR', '车窗']].forEach(function (g) {
      var have = g.slice(0, 4).filter(function (r) { return count(r); });
      have.forEach(function (r) { got.push(NAME[r]); });
      if (!have.length) miss.push(g[4]);
    });
    var hid = (cfg.hide || []).length, lamps = LAMPS.some(function (r) { return count(r); });
    return '认出了：<b>' + (got.join('、') || '没有') + '</b>。' + (miss.length ? '没认出：' + miss.join('、') + '——点下面那一项进去选（模型没分开的可以"圈出来"）。' : '') +
      (hid ? '藏掉了 ' + hid + ' 个零件（地板、展台这类）。' : '') + (lamps ? '' : '灯不自动认：在下面「灯光」里一项项选上零件，再调颜色、亮度、地上的光束。');
  }
  /** 滑块；x：附加的属性（灯的参数名 data-k、哪道光束 data-s、单位 data-u） */
  function rng(a, label, min, max, step, v, fmt, x) {
    return '<label class="rng"><span>' + label + '</span><input type="range" data-n="' + a + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '"' + (x || '') + ' style="--p:' +
      ((v - min) / (max - min) * 100).toFixed(1) + '%"><b>' + fmt(v) + '</b></label>';
  }
  function sw(a, label, onv, small, v) { return '<div class="set-row"><span class="set-lb">' + label + (small ? '<small>' + small + '</small>' : '') + '</span><button type="button" class="sw' + (onv ? ' on' : '') + '" data-a="' + a + '"' + (v ? ' data-v="' + v + '"' : '') + '><i></i></button></div>'; }
  /** 光束的长宽按车的大小存倍数，显示成米（u = "m:车长或车宽"）；离地高度显示厘米；别的百分比 */
  function unit(u, v) {
    if (!u) return Math.round(v * 100) + '%';
    if (u === 'cm') return Math.round(v * 100) + ' 厘米';
    var m = v * parseFloat(u.split(':')[1]);
    return (Math.abs(m) < 10 ? m.toFixed(2) : m.toFixed(1)) + ' 米';
  }
  function carSize() { var d = String(car().info().dims || '1,1,2.3').split(',').map(Number); return { w: 2 * d[0], l: 2 * d[2] }; }
  /** 一道路面光束的设置（参考项目的那一套） */
  function beamUI(r, slot) {
    var d = D3Lamp.BEAMS[slot], L = cfg.lights[r] || {}, b = D3Lamp.beam(slot, L[d.key]), cs = carSize(), x = function (k, u) { return ' data-s="' + slot + '" data-k="' + k + '"' + (u ? ' data-u="' + u + '"' : ''); };
    var f = function (u) { return function (v) { return unit(u, v); }; }, uL = 'm:' + cs.l, uW = 'm:' + cs.w;
    var h = '<div class="set-sub"><span class="set-sl">' + BEAM_TITLE[slot] + '</span></div>' +
      sw('bon', d.dir > 0 ? '照在车前地上' : '照在车尾地上', b.enabled, d.dir > 0 ? '' : '默认不照，打开后车尾地上一片' + (slot === 'tail' ? '红' : '白') + '光', slot);
    if (!b.enabled) return h;
    h += '<div class="acts"><button type="button" class="act" data-a="bfold" data-v="' + slot + '">' + (bOpen[slot] ? '收起光束参数' : '调形状、长短、宽窄、颜色…') + '</button></div>';
    if (!bOpen[slot]) return h;
    h += '<span class="set-sl">形状</span>' + seg('bshape', [[slot + ':cone', '锥形光束'], [slot + ':pool', '圆形光斑'], [slot + ':bar', '平行光带']], slot + ':' + b.shape);
    h += '<span class="set-sl">光斑分布</span>' + seg('blobe', [[slot + ':auto', '按灯罩自动'], [slot + ':single', '单光斑'], [slot + ':double', '双光斑']], slot + ':' + b.lobeMode);
    if (b.lobeMode === 'double') h += rng('bm', '光斑间距', 0.1, 1.2, 0.02, b.lobeSpacing, f(uW), x('lobeSpacing', uW));
    h += rng('bm', '光斑宽度', 0, 1, 0.05, b.lobeWidth, f(), x('lobeWidth')) +
      rng('bm', '光束长度', 0.3, 5, 0.1, b.length, f(uL), x('length', uL)) + rng('bm', '光束宽度', 0.4, 3.5, 0.05, b.width, f(uW), x('width', uW)) +
      rng('bm', '起点前后', -0.3, 0.8, 0.01, b.offset, f(uL), x('offset', uL)) + rng('bm', '左右偏移', -0.5, 0.5, 0.01, b.side, f(uW), x('side', uW)) +
      rng('bm', '离地高度', 0, 0.1, 0.005, b.height, f('cm'), x('height', 'cm')) + rng('bm', '强度', 0.05, 1, 0.05, b.intensity, f(), x('intensity')) +
      rng('bm', '横向扩散', 0, 1, 0.05, b.spread, f(), x('spread')) + rng('bm', '沿路衰减', 0, 1, 0.05, b.falloff, f(), x('falloff')) + rng('bm', '雾感', 0, 1, 0.05, b.haze, f(), x('haze'));
    h += sw('bfollow', '光束颜色跟着灯色', !b.color, '', slot);
    if (b.color) h += '<div class="balls lballs">' + BEAM_BALLS.map(function (c) { return '<button type="button" class="ball' + (c === b.color ? ' on' : '') + '" data-a="bcolor" data-v="' + slot + ':' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>'; }).join('') + '</div>';
    return h + '<div class="trow-tip">"按灯罩自动"按这盏灯的零件分左右：左右各一盏就是两道，只有中间一盏就是一道。长度、宽度、偏移按车的大小算，换了车长不用重调；沿路衰减越低照得越远，横向扩散越高越散。</div>';
  }
  function seg(a, l, cur, cls) { return '<div class="seg' + (cls ? ' ' + cls : '') + '">' + l.map(function (s) { return '<button type="button" data-a="' + a + '" data-v="' + s[0] + '"' + (cur === s[0] ? ' class="on"' : '') + '>' + s[1] + '</button>'; }).join('') + '</div>'; }
  function row(r) {
    var n = count(r), sw0 = '', sub = '';
    if (isCus(r)) {
      var L = cfg.lights[r] || {}, nm = function (l, v) { for (var i = 0; i < l.length; i++) if (l[i][0] === v) return l[i][1]; return l[0][1]; }, fx = L.effect || 'steady';
      sw0 = '<i class="tsw" style="background:' + (L.color || CUS_BALLS[0]) + '"></i>';
      sub = '<small>' + [nm(CUS_FX, fx), fx === 'steady' ? '' : L.late ? '后闪' : '先闪', L.when && L.when !== 'power' ? '跟着' + nm(CUS_WHEN, L.when) : '上电就亮'].filter(Boolean).join(' · ') + '</small>';
    }
    return '<button type="button" class="trow" data-r="' + r + '" data-a="page">' + sw0 + '<span class="set-lb">' + NAME[r] + sub + '</span><span class="trow-n' + (n ? ' ok' : '') + '">' + (n || '没有') + '</span><i class="trow-go"></i></button>';
  }
  /** 灯光那组最后：加了的自定义灯 + 加一盏 */
  function cusRows() {
    var cs = cusOn(), full = cs.length >= CUSTOM.length;
    return cs.map(row).join('') + '<div class="acts"><button type="button" class="act" data-a="cusAdd"' + (full ? ' disabled' : '') + '>' + (full ? '自定义灯最多 8 盏' : '＋ 加一盏自定义灯') + '</button></div>' +
      '<div class="trow-tip">跟车况对不上的灯（车标灯、格栅灯带、底盘灯、警灯……）加成自定义灯，颜色、效果（常亮、呼吸、闪烁、爆闪）自己定。</div>';
  }
  function home() {
    var info = (car().info() || {}), dims = String(info.dims || '').split(',').map(parseFloat), L = cfg.length || (dims[2] ? Math.round(dims[2] * 200) / 100 : 4.6);
    tip.innerHTML = '拖动转车，两指缩放、平移，双击车外面看全车（电脑上滚轮、右键拖）。';
    var h = '<div class="tsum">' + summary() + '</div>';
    h += '<div class="tjump">' + GROUPS.map(function (g, i) { return '<button type="button" class="act" data-a="jump" data-v="' + i + '">' + g[0] + '</button>'; }).join('') + '</div>';
    h += '<div class="set-group">摆放</div>';
    h += '<div class="set-row col"><span class="set-lb">车头方向<small>车头不朝前就转一下</small></span><div class="acts"><button type="button" class="act" data-a="rot90">转 90°</button><button type="button" class="act" data-a="rot180">掉头</button></div></div>';
    h += '<div class="set-row col"><span class="set-lb">车身朝上<small>车躺着、倒扣着就点到它立起来</small></span><div class="acts"><button type="button" class="act" data-a="rotX">前后翻 90°</button><button type="button" class="act" data-a="rotZ">左右翻 90°</button></div></div>';
    h += '<div class="set-row col">' + rng('length', '车长', 2.5, 7.5, 0.05, Math.min(7.5, Math.max(2.5, L)), function (v) { return v.toFixed(2) + ' 米'; });
    h += rng('exposure', '亮度', 0.6, 1.6, 0.05, cfg.exposure || 1, function (v) { return Math.round(v * 100) + '%'; });
    h += rng('env', '反光', 0.3, 2, 0.05, cfg.env || 1, function (v) { return Math.round(v * 100) + '%'; });
    h += rng('zoom', '远近', 0.6, 6, 0.05, zoom, function (v) { return Math.round(v * 100) + '%'; }) + '<div class="acts"><button type="button" class="act" data-a="viewAll">看全车</button></div></div>';
    GROUPS.forEach(function (g, i) { h += '<div class="set-group" data-g="' + i + '">' + g[0] + '</div>' + g[1].map(row).join('') + (g[0] === '灯光' ? cusRows() : ''); });
    // 底下两个导出按钮是干嘛的
    h += '<div class="set-group">导出、分享</div>' +
      '<div class="trow-tip"><b>导出车模包</b>：一个 .glb 文件。发给别人，在设置 → 车模 → 导入车模里选它，就是你调好的这台车。</div>' +
      '<div class="trow-tip"><b>导出 car-model.js</b>：把这台车做成卡片的默认车模。替换卡片 zip 里的同名文件、重新导入车机，打开就是这台车，什么都不用再调。车机上选不了文件，或者想把整张卡片发给别人时用。</div>' +
      '<div class="trow-tip">车机上不一定存得下导出的文件，存不下就在电脑浏览器里打开这张卡片，导入同一个车模、调好再导出。</div>';
    return h;
  }
  // ================= 车牌页：牌种、号码（点按键敲）、大小位置角度 =================
  var PROVS = '京津冀晋蒙辽吉黑沪苏浙皖闽赣鲁豫鄂湘粤桂琼渝川贵云藏陕甘青宁新';
  // 号的规则照国标 GA 36-2018（表 3～6）和应急救援号牌的通知：省份简称、发牌机关代号（字母）、序号，字母不用 I 和 O。
  // 4、5 位序号里字母最多 2 个；新能源 6 位序号：小型第 1 位 D A B C E（纯电）或 F G H J K（非纯电）、第 2 位字母或数字、其余数字，大型前 5 位数字、第 6 位 D～K；
  // 使馆 3 位外交机构编号 + 3 位序号，全是数字；领馆省份 + 3 位编号 + 2 位序号（第 2 位可以是字母）；应急：省份 + 队伍代号（X 消防救援、S 森林消防）+ 4 位序号
  var PLET = 'ABCDEFGHJKLMNPQRSTUVWXYZ', PDIG = '0123456789', NEV = 'DABCEFGHJK';
  // 每一位：p 省份、l 发牌机关代号、s 序号（字母最多 2 个）、d 数字、a 字母或数字、n 新能源类别；别的是只能用这几个字（只有一个字的是固定的，自动补上）
  var PRULE = {
    blue: 'p l s s s s s', yellow: 'p l s s s s s', lowspeed: 'p l s s s s s', custom: 'p l s s s s s',
    green: 'p l n a d d d d', bignev: 'p l d d d d d n',
    police: 'p l s s s s 警', coach: 'p l s s s s 学', trailer: 'p l s s s s 挂',
    hkmo: '粤 Z s s s s 港澳', emergency: 'p XS s s s s 应 急',
    embassy: 'd d d d d d 使', consulate: 'p d d d d a 领'
  };
  // 牌种按钮（一行 5 个）和说明
  var PTYPES = [['blue', '蓝牌', '小型汽车：蓝底白字，440×140 毫米'], ['green', '绿牌', '小型新能源汽车：渐变绿底黑字，480×140，8 位'],
    ['yellow', '黄牌', '大型汽车：黄底黑字，前牌单行 440×140，后牌双行 440×220'], ['bignev', '黄绿牌', '大型新能源汽车：黄绿底黑字，480×140，8 位'],
    ['police', '警车', '警用汽车：白底黑字、红"警"字，后牌的间隔符是一道短横'], ['emergency', '应急', '应急救援（消防）：白底黑字、红"应急"，480×140，前牌的队伍代号是红的'],
    ['coach', '教练', '教练汽车：黄底黑字，最后一位是"学"'], ['trailer', '挂车', '挂车：黄底黑字，双行 440×220，最后一位是"挂"'],
    ['lowspeed', '低速车', '低速货车、三轮汽车：黄底黑字，双行 300×165'], ['embassy', '使馆', '使馆汽车：黑底白字，3 位外交机构编号 + 3 位序号 + "使"'],
    ['consulate', '领馆', '领馆汽车：黑底白字，省份 + 3 位外交机构编号 + 2 位序号 + "领"'], ['hkmo', '港澳', '港澳入出境车：黑底白字，粤 Z 开头，最后一位是"港"或"澳"'],
    ['custom', '自定义', '版式同蓝牌，底色、字色自己定']];
  var PGAP = { police: 1, emergency: 1, trailer: 1, lowspeed: 1, embassy: 3, consulate: 4 }; // 间隔符前面有几个字（别的是 2）
  var pside = 'rear'; // 正在调哪块（默认后牌：平时看得多）
  function plateCfg() { return cfg.plates = cfg.plates || { v: 2, style: 'blue', text: '' }; }
  function plateApply() { car().plates(plateCfg()); }
  function prule(style) {
    return (PRULE[style] || PRULE.blue).split(' ').map(function (k) {
      var m = { p: PROVS, l: PLET, d: PDIG, a: PLET + PDIG, n: NEV, s: '' }[k];
      return m !== undefined ? { k: k, set: m } : { k: 'x', set: k, fix: k.length === 1 };
    });
  }
  function plateLen(style) { return prule(style).length; }
  /** 号已经是 t 时，下一位能敲哪些字；满了返回空 */
  function plateNext(style, t) {
    var R = prule(style), q = R[t.length], lt = 0;
    if (!q) return '';
    if (q.k !== 's') return q.set;
    for (var i = 0; i < t.length; i++) if (R[i].k === 's' && PLET.indexOf(t[i]) >= 0) lt++;
    return lt >= 2 ? PDIG : PLET + PDIG;
  }
  /** 紧跟着的固定字自动补上 */
  function plateFill(style, t) {
    var R = prule(style);
    while (R[t.length] && R[t.length].fix) t += R[t.length].set;
    return t;
  }
  /** 删一个：连带后面自动补的固定字一起退（开头固定的粤 Z 删不掉） */
  function plateBack(style, t) {
    var R = prule(style);
    while (t.length && R[t.length - 1].fix) t = t.slice(0, -1);
    return plateFill(style, t.slice(0, -1));
  }
  /** 自己敲的有几位（不算自动补的固定字） */
  function plateTyped(style, t) {
    var R = prule(style), n = 0;
    for (var i = 0; i < t.length; i++) if (R[i] && !R[i].fix) n++;
    return n;
  }
  /** 把号转成这种牌的：省份、发牌机关代号、序号各归各位，放不进去的字跳过（固定的字、新能源类别字母不带过去；换成小型新能源第 3 位补个 D）。
      换牌种、读进来的号（以前存的不合国标的）都走这里 */
  function plateConv(from, to, t) {
    var R = prule(from), S = prule(to), p = '', l = '', ser = '', i;
    t = String(t || '');
    for (i = 0; i < t.length && R[i]; i++) {
      var q = R[i];
      if (q.fix) { if (PROVS.indexOf(q.set) >= 0) p = q.set; else if (PLET.indexOf(q.set) >= 0) l = q.set; continue; } // 港澳牌固定的粤 Z 也带过去
      if (q.k === 'n') continue;
      if (q.k === 'p') p = t[i];
      else if (q.k === 'l' || q.k === 'x') { if (PLET.indexOf(t[i]) >= 0) l = t[i]; }
      else ser += t[i];
    }
    var out = plateFill(to, ''), j = 0;
    while (out.length < S.length) {
      var q2 = S[out.length], nx = plateNext(to, out), c = '';
      if (q2.k === 'p') c = p;
      else if (q2.k === 'l' || q2.k === 'x') c = l;
      else if (q2.k === 'n') { if (to === 'green' && j < ser.length) c = NEV.indexOf(ser[j]) >= 0 ? ser[j++] : 'D'; }
      else { while (j < ser.length && nx.indexOf(ser[j]) < 0) j++; c = j < ser.length ? ser[j++] : ''; }
      if (!c || nx.indexOf(c) < 0) break;
      out = plateFill(to, out + c);
    }
    return out;
  }
  /** 合不合这种牌的规矩（没敲完的也算合） */
  function plateOk(style, t) {
    if (t.length > plateLen(style)) return false;
    for (var i = 0; i < t.length; i++) if (plateNext(style, t.slice(0, i)).indexOf(t[i]) < 0) return false;
    return true;
  }
  /** 号码条：已经敲的 + 没敲的空位（固定的字也显示出来），间隔符照这种牌放；红字（警、应急，应急前牌的队伍代号）标红 */
  function plateNum(style, t, which) {
    var R = prule(style), g = PGAP[style] || 2, out = '';
    var red = { police: [6], emergency: which === 'front' ? [1, 6, 7] : [6, 7] }[style] || [];
    for (var i = 0; i < R.length; i++) {
      if (i === g) out += style === 'green' || style === 'bignev' ? ' ' : '·';
      if (i === 2 && (style === 'trailer' || style === 'lowspeed')) out += ' '; // 双行牌：上排、下排之间空一格
      var c = t[i] || (R[i].fix ? R[i].set : '＿');
      out += red.indexOf(i) >= 0 ? '<b class="pred">' + c + '</b>' : c;
    }
    return out;
  }
  /** 下一位该敲什么（显示在按键上面） */
  function plateHint(style, t) {
    var R = prule(style), n = t.length, q = R[n], left = 0, i;
    if (!q) return '号码齐了';
    for (i = n; i < R.length; i++) if (!R[i].fix) left++;
    var at = '第 ' + (n + 1) + ' 位：', more = '（还差 ' + left + ' 位）';
    if (q.k === 'p') return at + '省份简称';
    if (q.k === 'l') return at + '发牌机关代号（字母）';
    if (q.set === 'XS') return at + '队伍代号，X 是消防救援、S 是森林消防';
    if (q.set === '港澳') return '最后一位：港是香港、澳是澳门';
    if (q.k === 'n') return (n === 2 ? at : '最后一位：') + 'D A B C E 是纯电动，F G H J K 是插电混动、增程';
    if (style === 'embassy' || style === 'consulate') {
      var e = n - (style === 'consulate' ? 1 : 0);
      return at + (e < 3 ? '驻华外交机构编号，数字' : q.k === 'a' ? '序号，数字或字母' : '序号，数字') + more;
    }
    if (q.k === 's') return at + (plateNext(style, t) === PDIG ? '数字，序号里已经有 2 个字母了' : '字母或数字，序号里字母最多 2 个') + more;
    return at + (q.k === 'a' ? '字母或数字' : '数字') + more;
  }
  /** 号码显示条的底色、字色（跟着牌种，颜色同车上的牌面） */
  function plateLook(st) {
    var Y = ['#ffc20d', '#231f20'], N = ['#17181a', '#ffffff'], Wt = ['#ffffff', '#231f20'];
    return { blue: ['#213f99', '#ffffff'], green: ['linear-gradient(180deg,#ffffff,#7dc685 85%)', '#231f20'], yellow: Y, coach: Y, trailer: Y, lowspeed: Y,
      bignev: ['linear-gradient(90deg,#eba749 28.4%,#7dc685 28.4%)', '#231f20'], police: Wt, emergency: Wt, embassy: N, consulate: N, hkmo: N }[st.style] ||
      [st.bg || '#e9e9e9', st.fg || '#15171a'];
  }
  function platePage() {
    var st = plateCfg();
    st.front = st.front || {}; st.rear = st.rear || {};
    var p = st[pside], dims = String((car().info() || {}).dims || '1,1,2.3').split(',').map(Number);
    var on = (st.front.on ? '前' : '') + (st.front.on && st.rear.on ? ' + ' : '') + (st.rear.on ? '后' : '');
    var h = '<div class="tpage-h"><button type="button" class="tback" data-a="back">‹ 全部</button><b>车牌</b><span class="trow-n' + (on ? ' ok' : '') + '">' + (on || '没开') + '</span></div>';
    h += seg('pside', [['front', '前车牌'], ['rear', '后车牌']], pside);
    h += sw('pon', '挂上这块', !!p.on, '先自动摆在' + (pside === 'front' ? '车头' : '车尾') + '下部，不对就按住车上的车牌拖');
    if (!p.on) return h + '<div class="trow-tip">车牌跟车况不联动，纯装饰。蓝牌、绿牌、黄牌、警车、应急、教练、使馆、港澳等国内的牌种都有，也能自定义颜色；点下面的按键把车牌号敲进去，位置按住车牌拖，宽度、角度用滑块调。</div>';
    var ty = PTYPES.filter(function (x) { return x[0] === st.style; })[0] || PTYPES[0];
    h += '<span class="set-sl">牌种<small>' + ty[2] + '</small></span>' + seg('pstyle', PTYPES.map(function (x) { return [x[0], x[1]]; }), st.style).replace('class="seg"', 'class="seg many"');
    if (st.style === 'custom') {
      var a = hex2hsl(st.bg || '#e9e9e9');
      h += '<div class="hsl on" style="--hue:' + a[0] + '">' + [['h', '底色·色相', 360], ['s', '底色·饱和度', 100], ['l', '底色·亮度', 100]].map(function (c, i) {
        return '<label class="rng"><span>' + c[1] + '</span><input type="range" min="0" max="' + c[2] + '" step="1" value="' + a[i] + '" data-n="phsl" data-c="' + c[0] + '" style="--p:' + (a[i] / c[2] * 100).toFixed(1) + '%"><b>' + a[i] + (i ? '%' : '°') + '</b></label>';
      }).join('') + '</div>';
      h += '<span class="set-sl">字的颜色</span>' + seg('pfg', [['#15171a', '黑字'], ['#f4f6fa', '白字']], (st.fg || '').toLowerCase() === '#f4f6fa' ? '#f4f6fa' : '#15171a');
    }
    if (!plateOk(st.style, String(st.text || ''))) st.text = plateConv(st.style, st.style, st.text); // 以前存的号不合国标：不合的字去掉，别的留着
    var lk = plateLook(st), tx = st.text = plateFill(st.style, String(st.text || '')), nx = plateNext(st.style, tx), R = prule(st.style);
    h += '<div class="pnum" style="background:' + lk[0] + ';color:' + lk[1] + '">' + plateNum(st.style, tx, pside) + '</div>';
    var key = function (c) { return '<button type="button" class="tag pk" data-a="pkey" data-v="' + c + '"' + (nx.indexOf(c) < 0 ? ' disabled' : '') + '>' + c + '</button>'; };
    var hasP = R.some(function (q) { return q.k === 'p'; }), extra = '';
    R.forEach(function (q) { if (q.k === 'x' && !q.fix) q.set.split('').forEach(function (c) { if ((PLET + PDIG).indexOf(c) < 0 && extra.indexOf(c) < 0) extra += c; }); });
    h += '<span class="set-sl">车牌号<small>' + R.length + ' 位，照国标；' + plateHint(st.style, tx) + '</small></span>' +
      (hasP ? '<div class="pkeys">' + PROVS.split('').map(key).join('') + '</div>' : '') + '<div class="pkeys">' + (PLET + PDIG).split('').map(key).join('') + '</div>' +
      (extra ? '<div class="pkeys">' + extra.split('').map(key).join('') + '</div>' : '') +
      '<div class="acts"><button type="button" class="act" data-a="pback"' + (plateTyped(st.style, tx) ? '' : ' disabled') + '>删一个</button><button type="button" class="act" data-a="pclr"' + (plateTyped(st.style, tx) ? '' : ' disabled') + '>清空</button></div>';
    if (!p.at) p.at = car().plateAuto(pside);
    var m = function (v) { return (Math.round(v * 1000) / 1000) + ' 米'; };
    h += '<span class="set-sl">大小、位置<small>正在调' + (pside === 'front' ? '前' : '后') + '这块</small></span>';
    h += '<div class="set-row col">' + rng('pw', '宽度', 0.3, 0.6, 0.005, p.w || car().plateMM(st.style, pside)[0] / 1000, m); // 没调过是国标宽度
    h += rng('pAt', '上下', 0.05, Math.round(dims[1] * 0.95 * 100) / 100, 0.005, Math.round(p.at[1] * 1000) / 1000, m, ' data-k="y"');
    h += rng('pAt', '左右', -Math.round(dims[0] * 100) / 100, Math.round(dims[0] * 100) / 100, 0.005, Math.round(p.at[0] * 1000) / 1000, m, ' data-k="x"');
    h += rng('pAt', '前后', -Math.round(dims[2] * 100) / 100, Math.round(dims[2] * 100) / 100, 0.005, Math.round(p.at[2] * 1000) / 1000, m, ' data-k="z"');
    h += rng('pang', '左右转', -30, 30, 1, Math.round(p.yaw || 0), function (v) { return (v > 0 ? '往右 ' : v < 0 ? '往左 ' : '') + Math.abs(v) + '°'; }, ' data-k="yaw"');
    h += rng('pang', '俯仰', -30, 30, 1, Math.round(p.pitch || 0), function (v) { return (v > 0 ? '朝上 ' : v < 0 ? '朝下 ' : '') + Math.abs(v) + '°'; }, ' data-k="pitch"') + '</div>';
    h += '<div class="acts"><button type="button" class="act" data-a="pauto">重新自动摆放</button></div>';
    h += '<div class="trow-tip">按住车上的车牌拖到想要的位置（后车牌贴在尾门上时，开尾门会跟着翻起来）；挂的地方是斜的、弯的，就把"左右转、俯仰"转一点贴上去（站在这块牌子前面看）。</div>';
    return h;
  }
  /** 号码显示条只改样式不重画页面（拖滑块时别把键盘滚跳） */
  function platePaint() {
    var st = plateCfg(), lk = plateLook(st), pn = body.querySelector('.pnum');
    if (pn) { pn.style.background = lk[0]; pn.style.color = lk[1]; pn.innerHTML = plateNum(st.style, st.text || '', pside); }
  }
  /** 一项的页：说明、选零件的三种办法、这一项的选项 */
  function rolePage(r) {
    var R = ROLES[r], n = count(r), p = cfg.parts[r] || {}, h = '', o = '';
    tip.innerHTML = '<b>' + NAME[r] + '</b>：' + R.desc;
    if (R.kind === 'plate') return platePage();
    if (R.kind === 'wrap') return D3WrapTune.page();
    h += '<div class="tpage-h"><button type="button" class="tback" data-a="back">‹ 全部</button><b>' + NAME[r] + '</b><span class="trow-n' + (n ? ' ok' : '') + '">' + (n || '还没选') + '</span></div>';
    var pair = PAIRS[r];
    if (pair && midsOf(pair).length) h += '<div class="acts"><button type="button" class="act" data-a="mirror">照着「' + NAME[pair] + '」镜像过来</button></div>' +
      '<div class="trow-tip">按车身中线把「' + NAME[pair] + '」翻过来，找对称的零件（' + (/^turn/.test(r) ? '颜色、效果、亮度' : '门型、角度、铰链位置') + '一起带过来）' + (n ? '，这一项现在选的会换掉' : '') + '。</div>';
    if (R.kind === 'light' && !pair && n) h += '<div class="acts"><button type="button" class="act" data-a="mirrorSelf">选上对称的另一边</button></div>' +
      '<div class="trow-tip">选好了一边的灯，点这个把车身另一边对称的那盏也加进来（整块没分开的按对称的位置拆出来）。</div>';
    h += seg('tool', [['pick', '点零件'], ['paint', '圈出来'], ['list', '从列表选']], tool);
    if (tool === 'pick') {
      if (isMat(r)) {
        h += '<div class="trow-tip">点车上的零件加进来，再点一次去掉。模型没分开的（点一下选上一大块）用"圈出来"。</div>';
        h += seg('by', [['mat', '同样材质的都算'], ['piece', '只要点到的零件']], by[r] || R.by);
      } else {
        h += '<div class="trow-tip">' + (/^win/.test(r) ? '点一下车窗玻璃，里外重合的几层一起加进来' : '点车上的一块，它所在的整个部件（门板、内饰、把手、里外几层玻璃）一起加进来') +
          '，再点一次一起去掉；已经在别的项里的不动。只要一块就选"只要点到的零件"；模型没分开的用"圈出来"。</div>';
        h += seg('by', [['part', /^win/.test(r) ? '连同里外几层' : '整个部件'], ['piece', '只要点到的零件']], by[r] || 'part');
      }
    } else if (tool === 'paint') {
      h += '<div class="trow-tip">' + (selMode === 'smart' ? '点一下选中一整块（沿着相连的面往外扩，到板件的缝、棱为止），再点一次那块去掉。选多了（门缝只画在贴图上的模型会连成一大片）就把"范围"调小，或者用画笔一点点涂。' : selMode === 'rotate' ? '一根手指拖动转车，选好角度再接着圈。' : '按在车上拖是涂（只涂看得见的面），按在车外面拖是转车；两根手指缩放、拖动，双击车外面回到看全车。') + '</div>';
      h += seg('pmode', [['smart', '智能点选'], ['brush', '画笔'], ['erase', '橡皮'], ['rotate', '转车']], selMode);
      if (selMode === 'smart') h += rng('selAngle', '范围', 10, 60, 1, selAngle, function (v) { return v + '°'; });
      else if (selMode !== 'rotate') h += rng('selSize', '笔的大小', 6, 60, 1, selSize, function (v) { return v + ''; });
      h += '<div class="sel-bar"><span id="selN">' + (selN ? '圈了 ' + selN + ' 个面' : '还没圈') + '</span><button type="button" class="act" id="selUndo" data-a="selUndo"' + (D3Sel.canUndo() ? '' : ' disabled') + '>撤销</button><button type="button" class="act" data-a="selClear">清空</button></div>';
      h += '<div class="acts"><button type="button" class="act pri" id="selMake" data-a="make"' + (selN ? '' : ' disabled') + '>把圈出来的做成「' + NAME[r] + '」</button>' +
        '<button type="button" class="act" data-a="uncarve"' + (lastCarve() ? '' : ' hidden') + '>撤销上一次拆分</button></div>';
    } else h += list(r);
    // 这一项的选项
    if (r === 'paint') o += sw('keepPaintMap', '保留原来的车漆贴图', !!cfg.keepPaintMap, '车漆上有图案、拉花时打开');
    if (r === 'paint' && !n) o += '<div class="trow-tip">车漆不自动认（认错一块就把车弄花），车身用的是车模自己的材质。要在设置里换车漆颜色，在车身上点一下选上；车身是贴图或顶点色画的，选上后会盖掉原来的颜色和图案。</div>';
    if (r === 'glass') o += sw('keepGlass', '保留原来的玻璃', !!cfg.keepGlass, '关着时换成深色玻璃');
    if (r === 'hide') o += '<div class="acts"><button type="button" class="act" data-a="showAll">全部显示</button></div>';
    if (/^door/.test(r)) {
      o += '<span class="set-sl">门型</span><div class="seg">' + STYLES.map(function (s) { return '<button type="button" data-a="style" data-v="' + s[0] + '"' + ((p.style || 'normal') === s[0] && !p.at ? ' class="on"' : '') + '>' + s[1] + '</button>'; }).join('') + '</div>';
      if (p.at) o += '<div class="trow-tip">现在用的是写好的铰链位置，选一个门型就改成自动算。</div>';
    }
    var tilt = (r === 'sunroof' || r === 'sunshade') && p.mode === 'tilt';
    if (/^door/.test(r) || r === 'hood' || r === 'trunk' || r === 'chargePort' || tilt) {
      var a = p.angle || (r === 'hood' ? 55 : r === 'trunk' ? 50 : r === 'chargePort' ? 95 : tilt ? 7 : /butterfly|gull|scissor/.test(p.style) ? 70 : 60);
      o += rng('angle', '角度', tilt ? 3 : 15, tilt ? 25 : 120, 1, Math.round(a), function (v) { return v + '°'; });
      o += sw('flip', '反向', !!p.flip, '开的方向反了就打开');
      if (r === 'hood' || r === 'trunk') o += sw('other', '铰链在另一头', !!p.other);
    }
    if (hinged(r) && n) { // 铰链的中心点：车上的橙色小球（门绕着它转），虚线是转轴；按住小球拖，或者用滑块微调
      var pv = p.piv || [0, 0, 0], pct = function (v) { return (v > 0 ? '+' : '') + Math.round(v * 100) + '%'; };
      o += '<div class="set-sub"><span class="set-sl">铰链的中心点</span>' + (p.piv ? '<button type="button" class="set-reset" data-a="pivReset">恢复自动</button>' : '') + '</div>' +
        '<div class="trow-tip">车上的橙色小球是铰链（' + (r === 'chargePort' ? '盖子' : /^door/.test(r) ? '门' : '它') + '绕着它转），虚线是转轴。开起来位置不对就按住小球拖过去，或者用下面的滑块挪（按这个部件的长宽高算）。</div>' +
        rng('pivF', '前后', -1, 1, 0.01, pv[2], pct) + rng('pivU', '上下', -1, 1, 0.01, pv[1], pct) +
        (r === 'hood' || r === 'trunk' ? '' : rng('pivO', '里外', -1, 1, 0.01, pv[0], pct));
    }
    if (r === 'sunroof' || r === 'sunshade') {
      o += '<span class="set-sl">怎么开</span>' + seg('mode', [['slide', '往后滑'], ['tilt', '翘起来']], p.mode || 'slide');
      if (!tilt) o += rng('travel', '滑多远', 0.3, 1.2, 0.05, p.travel || 0.85, function (v) { return Math.round(v * 100) + '%'; });
    }
    if (R.kind === 'part') o += '<div class="acts"><button type="button" class="act' + (tests[r] ? ' on' : '') + '" data-a="test">' + (tests[r] ? (/^win/.test(r) ? '升上去' : '关上') : (/^win/.test(r) ? '试降' : '试开')) + '</button></div>';
    if (R.kind === 'light' && !n && !/^turn/.test(r)) o += '<div class="trow-tip">' + (isCus(r) ? '先在车上点这盏灯的零件（模型没分开的用"圈出来"），选上了才能调颜色、效果。' : '先在车上点这盏灯的零件（左右两盏都点上，或者点一盏再"选上对称的另一边"），选上了才能调颜色、亮度、地上的光束。') + '</div>';
    else if (R.kind === 'light') {
      var L = cfg.lights[r] || {}, balls = LIGHT_BALLS[r] || [], cur = L.color || '', custom = !!cur && balls.indexOf(cur) < 0;
      o += '<span class="set-sl">颜色</span><div class="balls lballs">' + balls.map(function (c) {
        var sel = !custom && (cur ? c === cur : c === balls[0]);
        return '<button type="button" class="ball' + (sel ? ' on' : '') + (c ? '' : ' auto') + '" data-a="lcolor" data-v="' + c + '" style="--c:' + (c || '#7fd6ff') + '" aria-label="' + (c || '跟着车机') + '"></button>';
      }).join('') + '<button type="button" class="ball custom' + (custom ? ' on' : '') + '" data-a="lcustom" style="--c:' + (cur || '#ffffff') + '" aria-label="自定义"></button></div>';
      if (r === 'ambient') o += '<div class="trow-tip">第一个是跟着车机：车里的氛围灯换颜色，这里跟着换。</div>';
      if (custom) o += hslRow(cur);
      if (LIGHT_FX[r]) o += '<span class="set-sl">效果</span>' + seg('fx', LIGHT_FX[r], L.effect || LIGHT_FX[r][0][0]);
      if (isCus(r)) {
        var fx = L.effect || 'steady', w1 = fx === 'breath' ? '亮' : '闪';
        if (fx !== 'steady') o += '<span class="set-sl">和别的灯错开</span>' + seg('late', [['0', '先' + w1], ['1', '后' + w1]], L.late ? '1' : '0') +
          '<div class="trow-tip">两盏灯一盏选先' + w1 + '、一盏选后' + w1 + '，就轮着' + w1 + '（红蓝警灯：红的先闪、蓝的后闪）。</div>';
        o += '<span class="set-sl">什么时候亮</span>' + seg('when', CUS_WHEN, L.when || 'power', 'many') +
          '<div class="trow-tip">上电：车一上电就亮。选了别的灯就跟着那种灯亮；跟着双闪又是常亮时，按双闪的节奏一亮一灭。</div>';
      }
      var G = D3Lamp.glow(L.glow, r), pc = function (v) { return Math.round(v * 100) + '%'; }, gk = function (k) { return ' data-k="' + k + '"'; };
      o += '<div class="set-sub"><span class="set-sl">发光质感</span></div><div class="trow-tip">亮的时候灯罩表面铺的一层光。热白中心越高，灯的中间越接近白色的亮芯；保留灯罩纹理越高，越看得出灯罩里原来的花纹；边缘柔化让光的边缘慢慢淡出去。</div>' +
        rng('glow', '亮度', 0.3, 1.5, 0.05, G.intensity, pc, gk('intensity')) + rng('glow', '热白中心', 0, 1, 0.05, G.core, pc, gk('core')) +
        rng('glow', '保留灯罩纹理', 0, 1, 0.05, G.detail, pc, gk('detail')) + rng('glow', '边缘柔化', 0, 1, 0.05, G.softness, pc, gk('softness'));
      (BEAM_OF[r] || []).forEach(function (slot) { o += beamUI(r, slot); });
      if (r === 'turnL' || r === 'turnR') o += '<div class="set-sub"><span class="set-sl">没有单独的转向灯</span></div>' +
        sw('borrow', '借灯打转向', !!cfg.borrow, '打转向时，没标转向灯的那一角借大灯、日行灯、示宽灯、尾灯闪橙色（很多车的日行灯就是这样）');
      o += '<div class="acts"><button type="button" class="act' + (tests[r] ? ' on' : '') + '" data-a="test">' + (tests[r] ? '关掉' : /^turn/.test(r) ? '闪一下' : '亮一下') + '</button></div>';
    }
    if (o) h += '<div class="set-group">选项</div>' + o;
    if (isCus(r)) h += '<div class="acts tclear"><button type="button" class="act" data-a="cusDel">删掉这盏灯</button></div>';
    else if (r !== 'hide') h += '<div class="acts tclear"><button type="button" class="act" data-a="clear">清空这一项</button></div>';
    return h;
  }
  /** 灯的自定义颜色：色相、饱和度、亮度三个滑块（不靠系统取色器） */
  function hslRow(hex) {
    var a = hex2hsl(hex);
    if (a[1] < 3 && lhue !== null) a[0] = lhue; // 白、灰、黑本身没有色相：用最后拖到的，别跳回 0°
    return '<div class="hsl on" style="--hue:' + a[0] + '">' + [['h', '色相', 360], ['s', '饱和度', 100], ['l', '亮度', 100]].map(function (c, i) {
      return '<label class="rng"><span>' + c[1] + '</span><input type="range" min="0" max="' + c[2] + '" step="1" value="' + a[i] + '" data-n="lhsl" data-c="' + c[0] + '" style="--p:' + (a[i] / c[2] * 100).toFixed(1) + '%"><b>' + a[i] + (i ? '%' : '°') + '</b></label>';
    }).join('') + '</div>';
  }
  function hex2hsl(h) { var c = new THREE.Color(h), o = {}; c.getHSL(o); return [Math.round(o.h * 360), Math.round(o.s * 100), Math.round(o.l * 100)]; }
  var lhue = null; // 灯的自定义颜色最后拖到的色相
  function hsl2hex(h, s, l) { return '#' + new THREE.Color().setHSL(h / 360, s / 100, l / 100).getHexString(); }
  /** 重画面板。anim：一行行浮上来（只在打开、进一项的页时；改个选项重画不播，不然每点一下都从右边滑进来一遍） */
  function render(anim) {
    var top = body.scrollTop, ls = body.querySelector('.tlist'), lt = ls ? ls.scrollTop : 0;
    body.classList.toggle('still', !anim);
    body.innerHTML = page ? rolePage(page) : home();
    body.scrollTop = top;
    ls = body.querySelector('.tlist');
    if (ls) ls.scrollTop = lt;
    panel.classList.toggle('painting', !!(page && tool === 'paint'));
    night();
  }
  /** 进一项的页 / 回到主页：镜头转到看得清的角度；圈选开着就按新的一项重来 */
  function go(r) {
    if (window.D3Sel) D3Sel.stop();
    page = r; items = [];
    if (!r) tool = 'pick';
    var lk = r && ROLES[r].look;
    car().look(lk ? lk[0] : undefined, lk ? lk[1] : undefined);
    car().compact(!!(r && tool === 'paint'));
    car().hinge(r && hinged(r) ? r : null);
    car().plateEdit(r === 'plate' ? pside : null);
    car().wrapEdit(r === 'wrap' ? '' : null);
    if (r === 'wrap') { D3WrapTune.reset(); car().wrapLib().then(function () { if (page === 'wrap') render(); }, function () {}); }
    // 离开灯的页：亮着给人看的灯关掉；进了灯的页、选上了零件：对准这盏灯
    Object.keys(tests).forEach(function (k) { if ((LAMPS.indexOf(k) >= 0 || k === 'high') && k !== r) { delete tests[k]; car().force(k, false); } });
    bShown = {}; clearTimeout(frameT);
    if (r && ROLES[r].kind === 'light' && tool !== 'paint') frameLamp(r);
    if (r && tool === 'paint') selStart();
    body.scrollTop = 0;
    render(true); mark();
  }
  /** 夜景：在灯的页、选上了零件、不在圈零件时，背景变黑、车身压暗，这盏灯亮着（自己点了"关掉"的不再自动亮） */
  function night() {
    var nt = !!(on && page && ROLES[page].kind === 'light' && (count(page) || (/^turn/.test(page) && cfg.borrow)) && tool !== 'paint');
    car().night(nt);
    if (nt && !tests[page] && !userOff[page]) { tests[page] = 1; car().force(page, true); }
  }
  /** 灯的配置马上交给车（不重建） */
  function relight() { car().lights(cfg.lights, !!cfg.borrow); }
  /** 一道光束的配置（没有就建一个空的） */
  function beamCfg(slot) { var d = D3Lamp.BEAMS[slot], L = cfg.lights[d.role] = cfg.lights[d.role] || {}; return (L[d.key] = L[d.key] || {}); }
  /** 改光束时亮着给人看：远光单独亮，别的亮那盏灯 */
  function beamTest(slot) {
    var k = slot === 'high' ? 'high' : slot === 'low' ? 'head' : slot;
    tests[k] = 1; delete userOff[k]; car().force(k, true); mark();
    if (bShown[slot]) return;
    bShown[slot] = 1; // 头一次动这道光束：镜头转到斜上方，连车带光束整个放进画面（光束照在车前 / 车后地上，对着灯的角度看不见）
    var front = D3Lamp.BEAMS[slot].dir > 0, pg = page;
    car().look(front ? 0.8 : PI - 0.8, 0.55);
    clearTimeout(frameT);
    frameT = setTimeout(function () {
      if (!on || page !== pg) return;
      var a = car().beamRect(slot), c = D3.focusRect();
      if (!a || !c) return;
      var x0 = Math.min(a.left, c.left), y0 = Math.min(a.top, c.top), x1 = Math.max(a.left + a.width, c.left + c.width), y1 = Math.max(a.top + a.height, c.top + c.height);
      car().frame({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }, free(), 0.92);
    }, 1000);
  }
  /** 车上没被面板挡住的那块地方 */
  function free() {
    var c = document.querySelector('#tune .set-card').getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    return c.left > W * 0.3 ? { left: 8, top: 56, width: c.left - 16, height: H - 112 } : { left: 8, top: 48, width: W - 16, height: c.top - 56 };
  }
  /** 进了灯的页：等镜头转过来，选上了零件就把这盏灯放大到画面中间（灯只有几个像素大，看不出发光质感调得怎么样）；
     还没选就放大到这种灯一般在的地方（车头、车尾、车厢），好点得准 */
  function frameLamp(r) {
    clearTimeout(frameT);
    frameT = setTimeout(function () {
      if (!on || page !== r || tool === 'paint') return;
      var n = count(r), a = n ? car().rectOf(midsOf(r)) : LAMP_AT[r] ? car().rectOfCar(LAMP_AT[r][0], LAMP_AT[r][1]) : D3.focusRect(); // 转向灯（车头车尾后视镜都可能有）：整台车
      if (a) car().frame(a, free(), n ? 0.6 : LAMP_AT[r] ? 0.9 : 0.85);
    }, 950);
  }

  body.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-a]') : null;
    if (!t || t.disabled) return;
    var a = t.getAttribute('data-a'), v = t.getAttribute('data-v'), r = page;
    if (page === 'wrap' && D3WrapTune.click(a, v)) return; // 贴纸页的操作交给 wraptune.js
    var p = part(r);
    if (a === 'page') { go(t.getAttribute('data-r')); return; }
    if (a === 'back') { go(null); return; }
    if (a === 'tool') {
      tool = v;
      if (window.D3Sel) D3Sel.stop();
      if (tool === 'paint') selStart();
      car().compact(tool === 'paint');
      render(); mark();
      return;
    }
    if (a === 'by') { by[r] = v; render(); return; }
    if (a === 'pmode') { selMode = v; D3Sel.mode(v); render(); return; }
    if (a === 'selUndo') { D3Sel.undo(); return; }
    if (a === 'selClear') { D3Sel.clear(); return; }
    if (a === 'make') { carveSel(); return; }
    if (a === 'uncarve') { if (lastCarve()) undo(); return; }
    if (a === 'fold') { var f = items[+t.getAttribute('data-i')]; if (f) { folds[f.key] = !folds[f.key]; render(); } return; }
    if (a === 'item') { var it = items[+t.getAttribute('data-i')]; if (it && r) choose(it); return; }
    if (a === 'viewAll') { car().viewAll(); zoomed(1); return; }
    if (HIST[a]) remember(HIST[a]);
    if (a === 'rot90' || a === 'rot180') { cfg.rotY = ((cfg.rotY || 0) + (a === 'rot90' ? 90 : 180)) % 360; freeGeometry(); return rebuild(); }
    if (a === 'rotX' || a === 'rotZ') { cfg[a] = ((cfg[a] || 0) + 90) % 360; freeGeometry(); return rebuild(); }
    if (a === 'clear') {
      if (isMat(r)) { cfg.mats[r] = []; cfg.pick[r] = []; } else if (r === 'wheels') cfg.parts.wheels = []; else { p.meshes = []; if (r === 'winFL' || r === 'winFR') delete cfg.winSplit; }
      render();
      return rebuild();
    }
    if (a === 'showAll') { cfg.hide = []; render(); return rebuild(); }
    if (a === 'keepGlass' || a === 'keepPaintMap') { cfg[a] = !cfg[a]; render(); return rebuild(); }
    if (a === 'style') { p.style = v; delete p.at; delete p.axis; delete p.angle; delete p.piv; render(); return rebuild(); }
    if (a === 'mirror') { mirror(r); return; }
    if (a === 'pivReset') { delete p.piv; tests[r] = 1; render(); return rebuild(); }
    if (a === 'mode') { p.mode = v; render(); return rebuild(); }
    if (a === 'flip' || a === 'other') { p[a] = !p[a]; render(); return rebuild(); }
    if (a === 'lcolor' || a === 'lcustom') {
      var L = cfg.lights[r] = cfg.lights[r] || {}, balls = LIGHT_BALLS[r] || [];
      if (a === 'lcustom') { // 自定义：从现在的颜色出发（亮度挪一点，和小球的颜色区分开），下面出三个滑块
        if (!L.color || balls.indexOf(L.color) >= 0) {
          var a3 = hex2hsl(L.color || balls[0] || '#7fd6ff');
          L.color = hsl2hex(a3[0], a3[1], a3[2] > 50 ? a3[2] - 1 : a3[2] + 1);
          if (balls.indexOf(L.color) >= 0) L.color = '#fefefe';
        }
      } else if (v) L.color = v; else delete L.color;
      lightTest(r);
      render();
      return relight();
    }
    if (a === 'fx') { (cfg.lights[r] = cfg.lights[r] || {}).effect = v; lightTest(r); render(); return relight(); }
    if (a === 'late') { var lt = cfg.lights[r] = cfg.lights[r] || {}; if (v === '1') lt.late = true; else delete lt.late; lightTest(r); render(); return relight(); }
    if (a === 'when') { var lw = cfg.lights[r] = cfg.lights[r] || {}; if (v === 'power') delete lw.when; else lw.when = v; lightTest(r); render(); return relight(); }
    if (a === 'cusAdd') { // 用最小的空号；颜色按已经加了几盏轮着给（第一盏红、第二盏蓝）
      var used = cusOn(), nr = CUSTOM.filter(function (k) { return used.indexOf(k) < 0; })[0];
      if (!nr) return;
      cfg.lights[nr] = { color: CUS_BALLS[used.length % CUS_BALLS.length] };
      go(nr);
      return relight();
    }
    if (a === 'cusDel') {
      delete cfg.lights[r]; delete cfg.mats[r]; delete cfg.pick[r];
      delete tests[r]; delete userOff[r]; car().force(r, false);
      go(null);
      relight();
      return rebuild();
    }
    if (a === 'test') {
      tests[r] = !tests[r];
      if (!tests[r]) { delete tests[r]; if (ROLES[r].kind === 'light') userOff[r] = 1; if (r === 'head' && tests.high) { delete tests.high; car().force('high', false); } } else delete userOff[r];
      car().force(r, !!tests[r]); render(); mark();
    }
    if (a === 'bon') { var bc = beamCfg(v); bc.enabled = !D3Lamp.beam(v, bc).enabled; if (bc.enabled) bOpen[v] = true; beamTest(v); render(); return relight(); }
    if (a === 'bfold') { bOpen[v] = !bOpen[v]; if (bOpen[v]) beamTest(v); render(); return; }
    if (a === 'mirrorSelf') { mirrorSelf(r); return; }
    if (a === 'jump') { var gh = body.querySelector('.set-group[data-g="' + v + '"]'); if (gh) body.scrollTop += gh.getBoundingClientRect().top - body.getBoundingClientRect().top - 6; return; }
    if (a === 'pside') { pside = v; car().plateEdit(pside); render(); return; }
    if (a === 'pon') { var pp = cfg.plates[pside]; if (!pp.at) pp.at = car().plateAuto(pside); pp.on = !pp.on; render(); return plateApply(); }
    if (a === 'pstyle') {
      var from = cfg.plates.style;
      cfg.plates.text = plateConv(from, v, cfg.plates.text);
      cfg.plates.style = v;
      ['front', 'rear'].forEach(function (k) { if (cfg.plates[k]) delete cfg.plates[k].w; }); // 两块一起换成新牌型的国标宽度
      render(); return plateApply();
    }
    if (a === 'pfg') { cfg.plates.fg = v; render(); return plateApply(); }
    if (a === 'pkey') {
      var tx0 = cfg.plates.text || '';
      if (plateNext(cfg.plates.style, tx0).indexOf(v) < 0) return; // 这一位不能用这个字（按键本来是灰的）
      cfg.plates.text = plateFill(cfg.plates.style, tx0 + v);
      render(); return plateApply();
    }
    if (a === 'pback') { cfg.plates.text = plateBack(cfg.plates.style, String(cfg.plates.text || '')); render(); return plateApply(); }
    if (a === 'pclr') { cfg.plates.text = plateFill(cfg.plates.style, ''); render(); return plateApply(); }
    if (a === 'pauto') { cfg.plates[pside].at = car().plateAuto(pside); render(); return plateApply(); }
    if (a === 'bshape' || a === 'blobe') { var sp = v.split(':'); beamCfg(sp[0])[a === 'bshape' ? 'shape' : 'lobeMode'] = sp[1]; beamTest(sp[0]); render(); return relight(); }
    if (a === 'bfollow') { var bf = beamCfg(v); if (bf.color) delete bf.color; else bf.color = BEAM_BALLS[0]; beamTest(v); render(); return relight(); }
    if (a === 'bcolor') { var sc = v.split(':'); beamCfg(sc[0]).color = sc[1]; beamTest(sc[0]); render(); return relight(); }
    if (a === 'borrow') { if (cfg.borrow) delete cfg.borrow; else cfg.borrow = true; lightTest(r); render(); return relight(); }
  });
  /** 换了灯的颜色、效果：亮着给人看（再点"关掉"） */
  function lightTest(r) { tests[r] = 1; delete userOff[r]; car().force(r, true); mark(); }
  body.addEventListener('input', function (e) {
    var t = e.target, n = t.getAttribute('data-n');
    if (!n) return;
    if (page === 'wrap' && D3WrapTune.input(e)) return;
    var v = parseFloat(t.value), min = parseFloat(t.min), max = parseFloat(t.max), r = page;
    t.style.setProperty('--p', ((v - min) / (max - min) * 100).toFixed(1) + '%');
    t.nextSibling.textContent = n === 'length' ? v.toFixed(2) + ' 米' : n === 'angle' || n === 'selAngle' ? v + '°' : n === 'selSize' ? v + '' : n === 'lhsl' ? v + (t.getAttribute('data-c') === 'h' ? '°' : '%') : unit(t.getAttribute('data-u'), v);
    if (n === 'zoom') { zoom = v; car().zoom(v); return; }
    if (HIST[n] && !sliding) { remember(HIST[n]); sliding = true; } // 一次拖动只记一步（松手 change 了再记下一步）
    if (n === 'selSize') { selSize = v; D3Sel.size(v); return; }
    if (n === 'selAngle') { selAngle = v; D3Sel.angle(v); return; }
    if (n === 'lhsl') {
      var ins = t.parentNode.parentNode.querySelectorAll('input'), c = [];
      for (var j = 0; j < 3; j++) c.push(parseFloat(ins[j].value));
      // 拖色相时颜色是白、灰、黑（饱和度太低、亮度在两头）就看不出变化：把饱和度、亮度拉到看得出颜色的地方
      if (t.getAttribute('data-c') === 'h') {
        if (c[1] < 25) c[1] = ins[1].value = 70;
        if (c[2] > 85 || c[2] < 15) c[2] = ins[2].value = 50;
        [1, 2].forEach(function (q) { ins[q].style.setProperty('--p', c[q] + '%'); ins[q].nextSibling.textContent = c[q] + '%'; });
      }
      lhue = c[0];
      t.parentNode.parentNode.style.setProperty('--hue', c[0]);
      (cfg.lights[r] = cfg.lights[r] || {}).color = hsl2hex(c[0], c[1], c[2]);
      var cb = body.querySelector('.ball.custom');
      if (cb) cb.style.setProperty('--c', cfg.lights[r].color);
      lightTest(r);
      return relight();
    }
    if (n === 'glow') { var LG = cfg.lights[r] = cfg.lights[r] || {}; (LG.glow = LG.glow || {})[t.getAttribute('data-k')] = v; lightTest(r); return relight(); }
    if (n === 'phsl') {
      var ins2 = t.parentNode.parentNode.querySelectorAll('input'), c2 = [];
      for (var j3 = 0; j3 < 3; j3++) c2.push(parseFloat(ins2[j3].value));
      if (t.getAttribute('data-c') === 'h') {
        if (c2[1] < 25) c2[1] = ins2[1].value = 70;
        if (c2[2] > 85 || c2[2] < 15) c2[2] = ins2[2].value = 50;
        [1, 2].forEach(function (q) { ins2[q].style.setProperty('--p', c2[q] + '%'); ins2[q].nextSibling.textContent = c2[q] + '%'; });
      }
      t.parentNode.parentNode.style.setProperty('--hue', c2[0]);
      plateCfg().bg = hsl2hex(c2[0], c2[1], c2[2]);
      platePaint();
      return plateApply();
    }
    if (n === 'pw') { (cfg.plates[pside] = cfg.plates[pside] || {}).w = v; return plateApply(); }
    if (n === 'pAt') { var q2 = t.getAttribute('data-k'), ix = q2 === 'x' ? 0 : q2 === 'y' ? 1 : 2, pa = (cfg.plates[pside] = cfg.plates[pside] || {}); pa.at = pa.at || [0, 0, 0]; pa.at[ix] = v; return plateApply(); }
    if (n === 'pang') { var q3 = t.getAttribute('data-k'), pb = (cfg.plates[pside] = cfg.plates[pside] || {}); pb[q3] = v; return plateApply(); }
    if (n === 'bm') { var sl = t.getAttribute('data-s'); beamCfg(sl)[t.getAttribute('data-k')] = v; beamTest(sl); return relight(); }
    if (n === 'length') { cfg.length = v; delete cfg.scale; freeGeometry(); }
    else if (n === 'exposure' || n === 'env') cfg[n] = v;
    else if (n === 'angle') part(r).angle = v;
    else if (n === 'pivO' || n === 'pivU' || n === 'pivF') { var pp = part(r), pv = pp.piv = pp.piv || [0, 0, 0]; pv[n === 'pivO' ? 0 : n === 'pivU' ? 1 : 2] = v; tests[r] = 1; t.nextSibling.textContent = (v > 0 ? '+' : '') + Math.round(v * 100) + '%'; }
    else if (n === 'travel') part(r).travel = v;
    rebuild();
  });
  body.addEventListener('change', function () { sliding = false; });
  $('tuneUndo').addEventListener('click', undo);
  $('tuneRedo').addEventListener('click', redo);
  document.addEventListener('keydown', function (e) { // 电脑上 Ctrl+Z 撤销、Ctrl+Y / Ctrl+Shift+Z 重做
    if (!on || !(e.ctrlKey || e.metaKey)) return;
    var k = (e.key || '').toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
  });
  $('tuneDone').addEventListener('click', done);
  $('tuneCancel').addEventListener('click', cancel);
  // 车机上的浏览器不一定能存文件（要宿主支持下载）：车机上不说"导出好了"，说没存下来怎么办
  var onCar = !!(window.uiplus && !window.uiplus.__debug), NOSAVE = '车机上如果没存下来，就在电脑浏览器里打开这张卡片，导入同一个车模、调好再导出';
  var exporting = false;
  function exported(go, ok) { // 导出要先压缩几何（大车模要一两秒）：带百分比，压完再说
    if (exporting) return;
    exporting = true;
    D3.toast('正在压缩车模 0%', 60000);
    go(function (f) { D3.toast('正在压缩车模 ' + Math.round(f * 100) + '%', 60000); }).then(function () { exporting = false; D3.toast(onCar ? NOSAVE : ok, 5000); },
      function (e) { exporting = false; D3.toast('导出失败：' + (e && e.message || ''), 4000); console.error(e); });
  }
  $('tuneExport').addEventListener('click', function () { var m = car().model(); exported(function (pr) { return D3Model.exportPack(m.rec, cfg, pr); }, '车模包导出好了：发给别人，在设置 → 导入车模里选它'); });
  $('tuneExportJs').addEventListener('click', function () { var m = car().model(); exported(function (pr) { return D3Model.exportDefault(m.rec, cfg, pr); }, 'car-model.js 导出好了：替换卡片 zip 里的同名文件，打包出去就是默认车模'); });

  // ================= 导入、恢复默认（设置里的按钮） =================
  /** 车况页建好了再做（在唱片机页就先滑过去）；返回 true：本来就在车况页（建着的可能是旧车模，要重新载入） */
  function toCar() {
    var i = D3.info(), was = i.live === 'car';
    if (was && i.ready) return Promise.resolve(true);
    D3.go(0);
    return new Promise(function (res, rej) {
      var n = 0, t = setInterval(function () {
        var x = D3.info();
        if (x.live === 'car' && x.ready) { clearInterval(t); res(was); } else if (++n > 75) { clearInterval(t); rej(new Error('车况页没建好')); }
      }, 200);
    });
  }
  /** 面数太多：在导入进度框里问要不要简化 */
  function askSimplify(x) {
    return new Promise(function (res) {
      $('busyQ').textContent = '这个车模有 ' + Math.round(x.tris / 10000) + ' 万个三角面（默认车模才 7.7 万），车机上可能会卡。要简化吗？只减看不出来的地方，最多减到 ' + Math.round(x.to / 10000) + ' 万面左右；做得越细、叠的层越多，能减的越少。';
      $('busy').className = 'busy on ask';
      function pick(yes) { $('busyYes').onclick = $('busyNo').onclick = null; $('busy').className = 'busy on'; res(yes); }
      $('busyYes').onclick = function () { pick(true); };
      $('busyNo').onclick = function () { pick(false); };
    });
  }
  function busy(on, title) {
    $('busy').className = 'busy' + (on ? ' on' : '');
    $('busy').style.setProperty('--acc', S.pick('paint').acc); // 按钮的强调色同设置面板
    if (title) $('busyTitle').textContent = title;
    $('busyStep').textContent = '';
    busyF = 0; $('busyBar').className = 'busy-bar'; $('busyBar').firstChild.style.transform = 'scaleX(0)';
  }
  /** 导入框里的进度：步骤文字 + 百分比 + 进度条（只往前走） */
  var busyF = 0;
  function progress(text, f) {
    if (typeof f === 'number') busyF = Math.max(busyF, Math.min(1, f));
    $('busyStep').textContent = text + (busyF > 0 ? ' · ' + Math.round(busyF * 100) + '%' : '');
    if (busyF > 0) { $('busyBar').className = 'busy-bar on'; $('busyBar').firstChild.style.transform = 'scaleX(' + busyF.toFixed(3) + ')'; }
  }
  function importModel() {
    var f = $('fileModel');
    f.value = '';
    f.onchange = function () {
      if (!f.files || !f.files.length) return;
      var files = Array.prototype.slice.call(f.files), res = null;
      S.close();
      busy(true, '正在导入车模');
      D3Model.importFiles(files, progress, askSimplify).then(function (r) {
        res = r;
        progress('保存', 0.94);
        return D3Model.save({ buf: r.buf, cfg: r.cfg, name: r.name, credit: r.credit }).then(function (ok) { D3Model.gcWraps(r.cfg); return ok; }); // 换了车：上一台车的贴纸图片不要了
      }).then(function (ok) {
        res.ok = ok;
        progress('识别部件、建车', 0.97);
        // 换了一台车：车漆、轮毂、卡钳、质感都回到车模自己的样子（不然还是上一台车选的颜色，看不出导入的车原来长什么样）
        ['paint', 'rim', 'caliper'].forEach(function (k) { S.set(k, 'model'); });
        S.set('finish', 'preset');
        return toCar().then(function (live) { return live ? car().reload() : null; });
      }).then(function () {
        busy(false);
        var cut = res.tris < res.tris0 ? '，简化到 ' + Math.round(res.tris / 1000) / 10 + ' 万面（原来 ' + Math.round(res.tris0 / 1000) / 10 + ' 万）' : '';
        if (!res.ok) D3.toast('这台车机存不了车模，这次打开有效', 4000);
        else if (res.cfg) D3.toast('车模包导入好了' + cut + (res.warn ? '。' + res.warn : ''), 4000);
        else { open(); D3.toast('导入好了' + cut + '，自动识别的部件在这里检查一下' + (res.warn ? '。' + res.warn : ''), 5000); }
      }, function (e) {
        if (!e || !e.user) console.error('导入车模失败', e); // 文件不对这类是给人看的提示，不算程序出错
        if (res) { // 转换好了但是建不出来：换回默认车模
          D3Model.reset().then(function () { return toCar(); }).then(function () { return car().reload(); }).then(function () { busy(false); D3.toast('这个车模显示不了，换回默认车模了', 5000); }, function () { busy(false); });
          return;
        }
        busy(false);
        D3.toast(e && e.user ? e.message : '导入失败：' + (e && e.message || '文件读不了'), 5000);
      });
    };
    f.click();
  }
  function resetModel() {
    var b = $('setModelReset');
    if (Date.now() - resetArm > 3000) { // 连点两下才恢复
      resetArm = Date.now();
      b.textContent = '再点一次确认';
      setTimeout(function () { if (Date.now() - resetArm >= 3000) b.textContent = '恢复默认'; }, 3100);
      return;
    }
    resetArm = 0; b.textContent = '恢复默认';
    S.close();
    D3Model.reset().then(function () { return toCar(); }).then(function (live) { return live ? car().reload() : null; }).then(function () { D3.toast('换回默认车模了'); });
  }

  S.on(function (k) {
    if (k === 'act:tune') toCar().then(function () { return car().settled(); }).then(open, function () { D3.toast('车况页还没建好，等一下再点'); }); // 刚取消、还排着没建的车先建好
    else if (k === 'act:wrap') toCar().then(function () { return car().settled(); }).then(function () { open(); go('wrap'); }, function () { D3.toast('车况页还没建好，等一下再点'); });
    else if (k === 'act:import') importModel();
    else if (k === 'act:modelReset') resetModel();
  });
  window.D3Tune = {
    picked: picked, zoomed: zoomed, selChanged: selChanged, open: function () { return toCar().then(function () { return car().settled(); }).then(open); }, isOpen: function () { return on; },
    page: function (r) { if (on && r !== undefined) go(r || null); return page; }, cfg: function () { return cfg; },
    // 新手引导演示用：这一项现在有哪些零件、叫什么；演示完不存，回到改之前
    mids: function (r) { return on ? midsOf(r) : []; }, name: function (r) { return NAME[r] || ''; }, cancel: function () { if (on) cancel(); },
    busy: function () { return dirty || !!building; }, // 改了配置、车还没按新配置建好
    plates: function () { return car().platesAt(); }, parts: function () { return car().partsAt(); }, // 测试、走查用
    hinged: hinged2, // 拖完车上的铰链小球
    plated: function (which, at) { (plateCfg()[which] = plateCfg()[which] || {}).at = at; if (on && page === 'plate') render(); plateApply(); }, // 拖完车上的车牌
    // 贴纸页：按住车上的小球（记撤销、拿到这张贴纸）、拖完、在车上点一下贴到那里
    wrapGrab: function (id) { return on && page === 'wrap' ? D3WrapTune.grab(id) : null; },
    wrapped: function () { if (on && page === 'wrap') D3WrapTune.dropped(); },
    wrapTap: function (h) { if (on && page === 'wrap') D3WrapTune.tap(h); },
    wrapDrawn: function (d) { if (on && page === 'wrap') D3WrapTune.drawn(d); } // 手绘线画完了
  };
  D3WrapTune.init({
    cfg: function () { return cfg; }, remember: remember, render: render, car: car, page: function () { return on ? page : null; },
    rng: rng, sw: sw, seg: seg, esc: esc, hex2hsl: hex2hsl, hsl2hex: hsl2hex, body: body
  });
})();
