/* demo3d 第一页：3D 车况。默认车模 2016 Exotic Rides W70（Ddiaz Design，CC-BY-NC-SA-4.0，car-model.js，见 LICENSE-car.txt）；
   车模可以换（carmodel.js：导入的车模、车模包、自动识别），这里只按"车模配置"建车：哪个材质（或哪个零件）是车漆 / 轮毂 / 卡钳 / 玻璃 / 各种灯、
   哪些网格是门 / 盖 / 车窗 / 天窗 / 遮阳帘 / 充电口盖 / 车轮，铰链在哪（写死的或按门型自动算），尺寸、轮位、灯的位置都从配置或车的外框算，配置里没有的部件就不动（开门只在文字里说）。
   展厅打光：真实影棚拍的环境图（env-hdr.js，Poly Haven CC0）做反射 + 一盏主光，车漆换成带清漆层的材质，车底一块画布画的柔和接触阴影；背景是页面的 CSS 渐变（画布透明）。
   画质（设置）：标准起主光画真实阴影（车身自己挡的、地上的；车和光都不动，只有车上的东西在动时才重画阴影贴图）、车漆闪点（凑近才显示）和清漆橘皮纹；
   高起加地面反射（Reflector，一帧只画一次）；灯光辉光、环境光遮蔽、景深在 main.js 的后期效果里。
   跟着车况动：左前 / 右前门（蝴蝶门，连半边车顶往上掀）和车窗、引擎盖（前机舱盖）、尾门（车尾的发动机盖）按开关状态动画开合；
   天窗、遮阳帘按开了多少往后滑（或翘起），插着充电枪时充电口盖打开。
   灯（lightsTick）：只亮配置里标出的灯（导入的车模不自动认灯，用户在调整车模里自己选）。灯本身的材质不动，亮的样子是灯罩表面铺的一层"点亮层"
   （carlamp.js 按灯罩形状烘的贴图，做法同 carmodel-web：亮度、热白中心、保留灯罩纹理、边缘柔化、颜色在着色器里算）；
   近光 / 远光、前雾灯在车头地上照出光束，尾灯、倒车灯可以在车尾地上照出光晕（形状、光斑、长宽、衰减、雾感按配置）；
   日行灯（上电时按日行灯开关）、示宽灯、尾灯、倒车灯（R 挡）、前后雾灯、氛围灯（颜色、亮度、前排 / 后排跟车机，音乐律动放歌时一拍一拍闪，动态多彩轮换颜色）跟着车况；
   转向灯 / 双闪闪（可以"流水"）；上车（电源从熄火 / ACC 到上电）时迎宾灯亮一下。灯的颜色、效果（常亮 / 呼吸 / 闪烁 / 流水）按配置。
   调整车模进了灯的页：换成夜景（背景变黑、车身压暗，灯不受影响）。胎压异常：那个轮子底下一圈橙 / 红光，标签变色。
   W70 只有两扇门，后排车门开着只在文字里说。编辑车模时（cartune.js）按住哪里拖都是转车、点一下是点选部件，车让到面板旁边，镜头转到看得清那一项的角度；
   圈选（carsel.js）时一根手指是涂，两指缩放平移照旧。
   按住车身左右拖转视角（松手有惯性），上下拖改俯仰，双击回到默认角度。不动的时候不出帧，转向灯闪时每秒 8 帧。
   进场：模型加载好后镜头从侧前方远处绕过来、推近到默认角度，转到一半大灯尾灯像迎宾灯一样亮一下；进场途中按住拖动就接着从当前角度转（设置里可关）。
   设置（settings.js）：车漆 / 轮毂 / 卡钳颜色（换色时 0.6 秒渐变过去）、深浅色、胎压标签、进场动画；打开设置面板时镜头转到侧面，车让到面板旁边。
   默认视角（水平角度、俯视角、车的大小、视野）在设置里调，拖这几个滑块时镜头转到默认视角给人看（不转到侧面）。
   挂 D 挡：镜头转到车后上方往下看（车顶的角度），车头朝上，四个轮子的胎压标签分在两边都看得到（距离按装得下整车和标签算）；
   可以拖动转着看，6 秒没碰就转回去；挂回别的挡转回展厅的默认视角。
   设置里还能换：车况页背景（三套渐变跟着深浅色、或者自己的图片 + 压暗）、默认视角和车在画面里的大小、底部显示哪几项数据。
   贴纸（carwrap.js，第一次用到时加载）：配置里的贴纸投影到车身上，挂在会动的部件下面跟着开合；有贴纸时新车贴好了再换下旧车。
   开着、在动的时候每秒 60 帧（设置里选 30 帧时 30 帧），停着不动不出帧。全部 ES5。 */
(function () {
  'use strict';
  var T = window.THREE, D = window.D3Data;
  var el = document.getElementById('pgCar'), appEl = document.getElementById('app');
  var page = { id: 'car', el: el, needs: ['car'] };
  var $ = function (id) { return document.getElementById(id); };
  var app, gen = 0, offCar = null;
  var scene, camera, envRT, keyLight, root, M, parts, wheels, hitBox, ray;
  // 导入的车模照通用的看模型软件（Google model-viewer 的默认设置）打光：model-viewer 的中性环境（main.js 的 env('neutral')）
  // + Khronos PBR Neutral 色调映射、曝光 1，不加主光——车模的底色是多少，画出来就差不多是多少。
  // 默认车模 W70 照旧用影棚环境图 + ACES + 主光（按它调过）：影棚图顶上、正前方各有一大块灯箱（朝上的面收到的光是侧面的 5 倍多），
  // ACES 又提亮（model-viewer 说 ACES 要配曝光 0.77 才和 Neutral 1 差不多），浅色的导入车模会被照成白的
  var std = false, envRoom = null;
  // 环境反光整体压到七成（车漆、玻璃、金属的反光原来太亮）；调整车模里的"反光"滑块在这个基础上再乘
  var REFL = 0.7;
  if (T.ShaderChunk.tonemapping_pars_fragment.indexOf('vec3 CustomToneMapping( vec3 color ) { return color; }') >= 0) {
    // Khronos PBR Neutral（https://github.com/KhronosGroup/ToneMapping），three r162 以后叫 NeutralToneMapping；r149 没有，挂在 CustomToneMapping 上
    T.ShaderChunk.tonemapping_pars_fragment = T.ShaderChunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }',
      'vec3 CustomToneMapping( vec3 color ) {\n' +
      '  const float StartCompression = 0.8 - 0.04; const float Desaturation = 0.15;\n' +
      '  color *= toneMappingExposure;\n' +
      '  float x = min( color.r, min( color.g, color.b ) );\n' +
      '  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;\n' +
      '  color -= offset;\n' +
      '  float peak = max( color.r, max( color.g, color.b ) );\n' +
      '  if ( peak < StartCompression ) return color;\n' +
      '  float d = 1. - StartCompression;\n' +
      '  float newPeak = 1. - d * d / ( peak + d - StartCompression );\n' +
      '  color *= newPeak / peak;\n' +
      '  float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );\n' +
      '  return mix( color, vec3( newPeak ), g );\n' +
      '}');
  }
  var cur = {}, want = {}, blinking = false, labelsOn = true;
  var HOME0 = { az: -0.72, el: 0.2 }, HOME = { az: HOME0.az, el: HOME0.el }, view = page.view = { az: HOME.az, el: HOME.el, vaz: 0, dist: 11, homing: false };
  var W = 1, H = 1, portrait = false, lastTap = 0;
  // 深浅色：index.html 里的小脚本在第一次绘制前就按上次的值（或钟点）加好了 dark 类；之后车况里的日夜模式一变就 0.6 秒渐变过去
  var KEY_DARK = 'd3-car-dark', dark = el.classList.contains('dark'), themeK = dark ? 1 : 0, tyreBad = {};
  // 胎压异常：镜头依次转到异常的轮子（各停 3 秒），看完回到 D 挡 / 展厅视角。只看新变异常的——看过的不再看（恢复正常后再异常才再看），
  // 用户自己一转车就不看了；调整车模、设置面板开着、进场动画还没完、卡片藏着时先不看，等能看了再看
  var tyreSeen = {}, tyreNew = [], tyreOff = false, tyreAt = 0, tour = null, pin = null, focusK = 0, focusAt = null, focusZ = 0, focusL = 0.85, offSys = null, TOUR_HOLD = 3200, TYRE_ZOOM = 0.55, tourTimer = 0;
  var doorSeen = {}, doorOpen = [], doorV = null, doorDue = 0, doorEnd = 0, doorAt = 0, doorBoot = true, doorTimer = 0, fitA = null;
  // 进场：t 0→1；rot 是镜头绕过来那部分的权重（进场途中用户拖了就并进当前视角，置 0）；wait 头两帧不走时间（第一帧要编译着色器，间隔不准）
  var INTRO = { az: 1.15, el: 0.16, dist: 0.3, sec: 1.8 }, intro = { t: 1, rot: 1, wait: 0 };
  // 灯：lightOn 车况要哪些灯亮（0～1）、forceLight 调整车模里"亮一下"的；LS 这台车的灯（点亮层、光束，见 makeLamps）；nightW / nightK 调整灯光时的夜景（0→1）
  var lightOn = {}, forceLight = {}, ambientHex = null, LS = null, nightW = false, nightK = 0;
  // 氛围灯：区域（all / front / rear）、音乐律动（开着时要媒体订阅，看在不在放歌）、动态多彩；上车迎宾：电源从熄火 / ACC 到上电时 welT 0→1
  var ambArea = 'all', musicOn = false, playing = false, colorful = false, hueCol = new T.Color(), offMedia = null, welT = 1, lastPw;
  // 画质：主光的方向（偏车顶上方，影子大部分落在车底）；shadowDirty 车上的东西动了、阴影贴图要重画；refl 地面反射（画质高），fid 第几帧（反射一帧只画一次）
  var KEY = new T.Vector3(-2.2, 8, 3), shadowDirty = false, refl = null, fid = 0;
  // 借灯打转向（配置里的 borrow：默认车模开着，导入的车模默认关）：哪个角（左前、右前、左后、右后）没标转向灯，就借这个角的大灯 / 日行灯 / 示宽灯 / 尾灯闪橙色。
  // turnU：四个角这一下亮不亮（点亮层的着色器里按位置分角）
  var turnU = { value: new T.Vector4(0, 0, 0, 0) }, TURN_FB = ['head', 'led', 'side', 'tail'], QUADS = ['LF', 'RF', 'LB', 'RB'];
  var S = window.D3Set, nightData = null;
  // 换色：从 finishFrom 渐变到当前设置（finishK 0→1）
  var finishK = 1, finishFrom = null;
  // 设置面板开着：车让到面板旁边（showK 0→1），镜头转到侧面（angK 0→1）；
  // preview：在设置里拖默认视角的滑块，车况页转到默认视角给人看（还让在面板旁边，只是不转到侧面），关面板结束
  // dbgOn：调试面板开着（电脑上的调试宿主）：车也让到面板旁边，但不转到侧面、照样挂 D 挡转到车顶看，胎压标签照样显示——改了哪项马上在车上看得到
  var SHOW = { az: -1.38, el: 0.1 }, showOn = false, showK = 0, angK = 0, offY0 = 0, preview = false, remPx = 50, dbgOn = false;
  // 挂 D 挡：镜头转到车后上方往下看（车头朝上，四个轮子的胎压标签分在两边都看得到）。k 过渡 0→1；dist 这个角度下装得下整车和标签的距离；last 最后一次拖动的时间
  var TOP = { az: Math.PI, el: 1.08 }, top = { on: false, k: 0, dist: 11, last: 0, back: 0 }, wheelN = 0;
  var SIDES = ['L', 'R'], DEG = Math.PI / 180;
  // 能动的部件 → 车况字段；车窗挂在同一边的门上
  var DOORS = { doorFL: 'body.doors.frontLeft.state', doorFR: 'body.doors.frontRight.state', doorRL: 'body.doors.rearLeft.state', doorRR: 'body.doors.rearRight.state' };
  var WINS = { winFL: 'body.windows.frontLeft.position', winFR: 'body.windows.frontRight.position', winRL: 'body.windows.rearLeft.position', winRR: 'body.windows.rearRight.position' };
  var LIDS = { hood: 'body.hood.state', trunk: 'body.tailgate.state' };
  var SLIDES = { sunroof: 'body.sunroof.position', sunshade: 'body.sunshade.position' }; // 往后滑（或翘起）：0～100
  var FLAPS = { chargePort: 'energy.connectorState' }; // 充电口盖：插着枪就开
  // 灯：大灯、日行灯（led）、示宽灯、尾灯、倒车灯、左 / 右转向灯、前 / 后雾灯、氛围灯。默认颜色；氛围灯默认跟着车机的氛围灯颜色
  // cus1～cus8：自定义灯（车标灯、格栅灯带、底盘灯、警灯……），跟车况不联动：默认上电就亮，也能跟着某种灯亮（when），效果自己定
  var CUSTOM = D3Model.CUSTOM_LIGHTS;
  var LIGHTS = ['head', 'led', 'side', 'tail', 'brake', 'reverse', 'turnL', 'turnR', 'fogF', 'fogR', 'ambient'].concat(CUSTOM);
  // 一个零件归了几种灯、同时要亮时谁优先：自定义灯排在大灯后面（转向、刹车、倒车、雾灯、大灯照样盖过它，它盖过日行灯、示宽、尾灯、氛围灯）
  var LAMP_PRI = ['turnL', 'turnR', 'brake', 'reverse', 'fogR', 'fogF', 'head'].concat(CUSTOM, ['led', 'side', 'tail', 'ambient']);
  var LIGHT_COLOR = { head: '#fff4e2', led: '#ffffff', side: '#ffe6b8', tail: '#ff2018', brake: '#ff0800', reverse: '#ffffff', turnL: '#ffa31a', turnR: '#ffa31a', fogF: '#fff3d0', fogR: '#ff2018', ambient: '#7fd6ff' };
  CUSTOM.forEach(function (r) { LIGHT_COLOR[r] = '#ff2018'; });
  var AMBIENT = { iceBlue: '#7fd6ff', coldWhite: '#e8f2ff', warmWhite: '#ffd9a0', redOrange: '#ff6a3d', red: '#ff2a2a', redPurple: '#d63cff', darkBlue: '#2a5cff' };
  // 车模：rec 是现在用的车模（D3Model.current()），cfg 是建车用的配置；dims 车的半宽、高、半长（米），wheelR 轮半径
  var rec = null, cfg = null, modelObj = null, dims = { hw: 1.02, h: 1.26, hl: 2.3 }, wheelR = 0.345, envK = 1, expK = 1;
  // 编辑车模：editing 时车让到面板旁边（tuneK 0→1）、zoom 远近、pan 看的那一点挪开多少（两指拖、对着某处缩放）；force 是"试开"的部件；
  // marks 是点选高亮的网格；flashes 是从列表里选中时闪几下的网格
  // later：退出编辑后要建的车（取消调整、演示完换回自己的车）——建车要解析车模、上传贴图，卡几百毫秒，放在车回原位的过渡途中会卡一下，等车停稳再建
  var later = null;
  var compact = false, lookTo = null, editing = false, tuneK = 0, zoom = 1, pan = new T.Vector3(), aim = new T.Vector3(), force = {}, marks = [], hiMat = null, flashes = [], flashMat = null, flashT = 0;
  var DOOR_NAME = { 'body.doors.frontLeft.state': '左前门', 'body.doors.frontRight.state': '右前门', 'body.doors.rearLeft.state': '左后门', 'body.doors.rearRight.state': '右后门' };
  var TYRES = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'], TYRE_NAME = { frontLeft: '左前', frontRight: '右前', rearLeft: '左后', rearRight: '右后' };
  var POWER = { off: '熄火', acc: 'ACC', on: '已上电', ready: 'READY', fakeReady: 'READY' };
  var V = function (x, y, z) { return new T.Vector3(x, y, z); };

  // ================= 场景 =================
  page.load = function (a) {
    app = a;
    var g = ++gen;
    $('cLoad').textContent = '正在载入 3D 车模型';
    $('cLoad').className = 'loading on';
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(27, 1, 0.1, 80);
    camera.layers.enable(1); // 灯的点亮层、路面光束放在图层 1：只有灯在变时 main.js 只重画这一层
    envRT = app.env('studio');
    scene.environment = envRT.texture;
    keyLight = new T.DirectionalLight(0xffffff, 1.3);
    keyLight.position.copy(KEY).normalize().multiplyScalar(12);
    var fx = S.fx();
    if (fx.shadow) { // 真实阴影：车身自己挡出来的（轮拱、门槛下面）和地上的影子
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(fx.shadow, fx.shadow);
      keyLight.shadow.bias = -0.0004; keyLight.shadow.normalBias = 0.025;
    }
    scene.add(keyLight);
    page.scene = scene; page.camera = camera;
    ray = new T.Raycaster();
    hitBox = new T.Box3(V(-1.1, 0, -2.4), V(1.1, 1.3, 2.4));
    cur = {}; want = {}; view.az = HOME.az; view.el = HOME.el; view.vaz = 0; view.homing = false;
    doorSeen = {}; doorOpen = []; doorV = null; doorDue = doorEnd = 0; doorBoot = true; pin = null; tyreOff = false; // 回到车况页时门还开着、胎压还异常：进场完了照样转过去
    asides = {}; // 从唱片机页滑回来时调试面板、全部车况还开着
    if (window.D3DebugPanel && D3DebugPanel.isOpen()) asides.dbg = 1;
    if (window.D3CarInfo && D3CarInfo.isOpen()) asides.info = 1;
    dbgOn = Object.keys(asides).length > 0;
    stOpen = false;
    offCar = D.onCar(apply); // 车况先接着（深浅色、文字不用等模型）
    offMedia = D.onMedia(onMedia);
    offSys = D.onSys(sysIcons); sysIcons(D.sys());
    lastPw = undefined; welT = 1;
    apply(D.car());
    // 画质高 / 极致的地面反射在 three-post.js 里：建车前先加载（加载不了就不画反射）
    return (fx.reflect ? app.loadPost().then(null, function () {}) : Promise.resolve()).then(function () { return D3Model.current(); }).then(function (r) {
      if (g !== gen) return;
      rec = r;
      return parse(g, null).then(null, function (e) {
        if (rec.builtin || g !== gen) throw e;
        console.error('导入的车模加载失败，换回默认车模', e); // 存的车模坏了：先用默认的，设置里能重新导入或恢复
        rec = D3Model.def(); rec.broken = true;
        return parse(g, null);
      });
    });
  };
  /** 解析车模、按配置建车（c 不给就用车模自带的配置；没有就是 W70 套内置配置，别的自动识别）；old：还显示着的旧车，新车建好再换下来。
      导出时压缩过的车模（换进卡片的 car-model.js）先解开 */
  function parse(g, c, old) {
    return D3Model.inflate(rec.buf).then(function (b) { if (g === gen) rec.buf = b; return parseNow(g, c, old); });
  }
  function parseNow(g, c, old) {
    return new Promise(function (res, rej) {
      setTimeout(function () { // 先让"正在载入"画出来，解析要几百毫秒
        if (g !== gen) return res();
        new T.GLTFLoader().parse(rec.buf, '', function (gltf) {
          if (g !== gen) { app.dispose(gltf.scene); return res(); }
          var model = gltf.scene;
          D3Model.ids(model, gltf.parser);
          cfg = c || rec.cfg || (D3Model.isW70(model) ? D3Model.W70 : D3Model.auto(model, app.renderer()));
          if (cfg.carve) { // 自动识别要把跨着几扇门的车窗、窗框按门切开：在 GLB 里拆成新零件，换上新的 GLB 再解析一遍
            var jobs = cfg.carve, cut = null;
            delete cfg.carve;
            try { cut = D3Model.carve(rec.buf, model.userData.d3, jobs); } catch (er) { console.error('切车窗失败，照原样建', er); }
            if (cut) {
              cut.mids.forEach(function (mid, i) {
                if (mid < 0) return;
                var to = jobs[i].to;
                if (LIGHTS.indexOf(to) >= 0 || D3Model.BODY_ROLES.indexOf(to) >= 0) { cfg.pick = cfg.pick || {}; (cfg.pick[to] = cfg.pick[to] || []).push(mid); return; }
                var p = cfg.parts[to] = cfg.parts[to] || { meshes: [] };
                if (p.meshes.indexOf(mid) < 0) p.meshes.push(mid);
              });
              rec.buf = cut.buf;
              if (!rec.builtin) D3Model.save({ buf: rec.buf, cfg: rec.cfg || null, name: rec.name, credit: rec.credit });
              app.dispose(model);
              return parse(g, cfg).then(res, rej);
            }
          }
          var drop = function () { if (old) { freeRoot(old); old = null; marks = []; flashes = []; } };
          try { build(model, cfg); } catch (e) { drop(); if (modelObj === model) dropModel(); else app.dispose(model); return rej(e); }
          // 有贴纸：新车先藏着（旧车还显示着），贴纸的图片、字体加载好、贴上了再换，不会进场到一半才冒出来
          var R1 = root, wr = cfg.wraps && cfg.wraps.length;
          if (!wr) return after();
          R1.visible = false;
          page.wraps().then(after, function (e) { console.error('贴纸没贴上', e); after(); });
          function after() {
            if (!scene) return res(); // 切走了：整页都拆了
            if (g !== gen) { drop(); if (R1.parent) R1.visible = true; return res(); } // 又改了配置：这台已经是下一次的"旧车"，下一次建好会拆它
            R1.visible = true;
            finishParse(g, c, drop);
            res();
          }
        }, function (e) { $('cLoad').textContent = '3D 车模型加载失败'; rej(e); });
      }, 30);
    });
  }
  /** 新车建好了（贴纸也贴好了）：拆旧车，取景、进场、车况 */
  function finishParse(g, c, drop) {
    drop();
    if (S.fx().lowp && std) lowp(root);
    $('cLoad').className = 'loading';
    themeK = dark ? 1 : 0;
    look();
    if (!c) { intro.t = S.get('intro') && !editing ? 0 : 1; intro.rot = 1; intro.wait = 2; }
    warmLamps(g);
    apply(D.car());
    modelUI();
    if (W > 1) page.resize(W, H, portrait); // 换了车模：按新车的大小重新取景
  }
  /** 换了车模（导入、恢复默认）：重新取车模、重建 */
  page.reload = function () {
    if (!scene) return Promise.resolve();
    drop();
    var g = ++gen;
    dropModel();
    cur = {}; // 换了一台车：门窗从车况现在的样子开始，不接着上一台车的开合
    $('cLoad').textContent = '正在载入 3D 车模型';
    $('cLoad').className = 'loading on';
    return D3Model.current().then(function (r) {
      if (g !== gen) return;
      rec = r;
      return parse(g, null);
    });
  };
  /** 编辑车模：按新配置重建车（镜头、车况都不动）。wait：退出编辑时用，等车回到原位、停稳了再建 */
  page.rebuild = function (c, wait) {
    if (!scene || !rec) return Promise.resolve();
    if (wait) return settle(function () { return parse(++gen, c, root); });
    drop();
    var g = ++gen;
    return parse(g, c, root); // 旧车先留着，新车建好再换（改一下不会闪一下没车）
  };
  /** 排一个等车停稳再建的（后排的顶掉先排的）；正在建的（改到一半的配置）不要了 */
  function settle(run) {
    drop();
    gen++;
    return new Promise(function (res) { later = { run: run, res: res }; if (root) app.invalidate(); });
  }
  function drop() { if (later) { later.res(); later = null; } }
  /** 排着的马上建（要接着编辑：配置得是建好的那份） */
  page.settled = function () {
    if (!later) return Promise.resolve();
    var L = later;
    later = null;
    return L.run().then(L.res, L.res);
  };
  /** 拆掉一台车（换车模，或者改了配置重建、换下旧的那台）：场景树里的几何体、材质、贴图，再加上不在树里的——
      灯的点亮层、地面反射的缓冲、车模自己的车漆贴图（没选原车颜色时不在材质上）。以前重建只拆了树，画质高起每改一次配置漏一块反射缓冲 */
  function freeRoot(r) {
    var u = r.userData;
    if (u.wraps) { u.wraps.dispose(); u.wraps = null; } // 贴纸先拿下来：贴图在缓存里，下一台车可能接着用（下面整棵树释放会把贴图也释放掉）
    scene.remove(r);
    if (u.lamps) u.lamps.dispose();
    if (u.refl) u.refl.dispose();
    if (u.origMap) u.origMap.dispose();
    app.dispose(r);
  }
  function dropModel() {
    if (root) freeRoot(root);
    wmark = null;
    if (plates) { plates.front && plateFree(plates.front); plates.rear && plateFree(plates.rear); }
    root = M = parts = wheels = modelObj = LS = plates = refl = null;
    wheelN = 0; marks = []; flashes = [];
  }
  page.unload = function () {
    gen++;
    if (offCar) offCar(); offCar = null;
    if (offMedia) offMedia(); offMedia = null;
    if (offSys) offSys(); offSys = null;
    tour = null; pin = null; clearTimeout(tourTimer); clearTimeout(warmT);
    doorV = null; doorDue = doorEnd = 0; clearTimeout(doorTimer);
    musicOn = playing = false; page.needs = ['car'];
    if (scene) scene.children.forEach(function (o) { if (o.userData.wraps) { o.userData.wraps.dispose(); o.userData.wraps = null; } });
    wmark = null; wkey = null; wdrag = null; wline = null; wdraw = false;
    if (scene) app.dispose(scene);
    if (LS) LS.dispose();
    if (refl) { refl.dispose(); refl = null; }
    if (M && M.orig && M.orig.map) M.orig.map.dispose();
    if (envRT) envRT.dispose();
    if (envRoom) envRoom.dispose();
    if (keyLight) keyLight.shadow.dispose(); // 阴影贴图不在场景树的材质里，上面释放不到（以前每切一次页漏一张）
    envRoom = null; std = false;
    app.renderer().toneMapping = T.ACESFilmicToneMapping; // 唱片机页照旧
    scene = camera = envRT = root = M = parts = wheels = modelObj = LS = page.scene = page.camera = null;
    nightW = false; nightK = 0; el.classList.remove('night');
    wheelN = 0; marks = []; flashes = []; force = {}; rec = null;
    drop();
    clearTimeout(top.back); top.on = false; top.k = 0; showK = angK = 0; finishK = 1; preview = false;
    $('cLoad').className = 'loading';
    TYRES.forEach(function (w) { $('tp-' + w).className = 'tp off'; });
  };

  /** 车的外框（只算看得见的网格） */
  function visBox(model) {
    var b = new T.Box3();
    model.traverse(function (o) { if (o.isMesh && o.visible) b.union(D3Model.box(o)); });
    return b;
  }
  function build(model, c) {
    root = new T.Group();
    scene.add(root);
    modelObj = model;
    var d = model.userData.d3, pc = c.parts || {};
    var mrefs = function (r) { return D3Model.meshRefs(d, r); }, mats = function (k) { return D3Model.matRefs(d, c.mats && c.mats[k]); };
    var hidden = mrefs(c.hide);
    hidden.forEach(function (m) { m.visible = false; });
    // ---- 摆正：先竖过来（按 z / x 朝上导出的模型），再转车头；缩放（车长或者直接给倍数），水平居中、贴地；车头朝 +z，左边是 +x ----
    model.rotation.set((c.rotX || 0) * DEG, (c.rotY || 0) * DEG, (c.rotZ || 0) * DEG, 'YXZ');
    root.add(model);
    model.updateMatrixWorld(true);
    var bb = visBox(model);
    if (bb.isEmpty()) { hidden.forEach(function (m) { m.visible = true; }); bb = visBox(model); } // 全藏了：当没藏
    if (bb.isEmpty()) throw new Error('车模里没有能显示的网格');
    model.scale.setScalar(c.scale || (c.length ? c.length / Math.max(1e-6, bb.max.z - bb.min.z) : 1));
    model.updateMatrixWorld(true);
    bb = visBox(model);
    model.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    var off = model.position.clone();
    root.updateMatrixWorld(true);
    bb = visBox(model);
    dims = c.box ? { hw: c.box[0], h: c.box[1], hl: c.box[2] } : { hw: Math.max(-bb.min.x, bb.max.x), h: bb.max.y, hl: Math.max(-bb.min.z, bb.max.z) };
    hitBox.set(V(-dims.hw - 0.08, 0, -dims.hl - 0.1), V(dims.hw + 0.08, dims.h + 0.04, dims.hl + 0.1));
    // 配置里的坐标：W70 按模型原来的位置写（coords: 'model'），别的按摆正后的位置
    var P = c.coords === 'model' ? function (a) { return V(a[0], a[1], a[2]).add(off); } : function (a) { return V(a[0], a[1], a[2]); };
    envK = (c.env || 1) * REFL; expK = c.exposure || 1; // 车模的"反光"滑块（100% = 默认）乘在 REFL 上
    std = !D3Model.isW70(model);
    if (std && !envRoom) envRoom = app.env('neutral');
    scene.environment = std ? envRoom.texture : envRT.texture;
    app.renderer().toneMapping = std ? T.CustomToneMapping : T.ACESFilmicToneMapping;

    // ---- 材质：车漆换成带清漆层的；玻璃换成自己的深色玻璃；大灯尾灯能亮；轮毂、卡钳原材质换色 ----
    M = {
      paint: new T.MeshPhysicalMaterial({ color: 0x9a0c13, metalness: 0.3, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.03, aoMapIntensity: c.paintAo !== undefined ? c.paintAo : 0.6,
        iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900] }), // 珠光、变色龙：薄膜干涉，随角度从一种颜色过渡到另一种
      glass: new T.MeshStandardMaterial({ color: 0x0a0e13, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.78, envMapIntensity: 2 * REFL }),
      // 默认车模那种整块灯罩（lens）：大灯、尾灯换成透明的罩子，亮的样子交给点亮层
      head: new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.22 }),
      tail: new T.MeshStandardMaterial({ color: 0x4a0606, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.7 }),
      rims: mats('rim'), cals: mats('caliper'), lens: !!c.lens, fx: {}
    };
    paintFx(M.paint);
    var paintSet = mats('paint'), glassSet = c.keepGlass ? [] : mats('glass'), lampSets = {}, picked = {}, copies = {}, ents = {};
    M.glassSrc = mats('glass'); // 车窗玻璃原来的材质（保留原来的玻璃时没换）：贴纸"贴在车窗上"认这些
    LIGHTS.forEach(function (r) { lampSets[r] = mats(r); ents[r] = []; });
    lightFx();
    // 零件级的角色（pick）：材质和别的零件共用、或者从整块里圈出来的——只换这些零件的材质，不动共用这个材质的别的零件
    // 灯可以好几种共用一个零件（一条灯带既是日行灯又是转向灯）：另记在 pickedL；车身的角色（车漆、玻璃……）一个零件只有一种，有了就不当灯
    var pickedL = {};
    D3Model.BODY_ROLES.forEach(function (r) { mrefs(c.pick && c.pick[r]).forEach(function (m) { if (!picked[m.uuid]) picked[m.uuid] = r; }); });
    LIGHTS.forEach(function (r) { mrefs(c.pick && c.pick[r]).forEach(function (m) { if (!picked[m.uuid]) (pickedL[m.uuid] = pickedL[m.uuid] || []).push(r); }); });
    var pickedAs = function (r) { var l = []; model.traverse(function (o) { if (o.isMesh && picked[o.uuid] === r) l = l.concat(D3Model.mats(o)); }); return l; };
    M.glassSrc = M.glassSrc.concat(pickedAs('glass'));
    M.has = { paint: paintSet.length > 0 || pickedAs('paint').length > 0 };
    var srcs = paintSet.concat(pickedAs('paint')), src = srcs[0];
    // 整台车连玻璃、轮胎、内饰都是满金属的（金属度靠不住）：不像金属的当不是金属，不然整台车像镀了铬。
    // 轮毂不动（本来就是金属）
    D3Model.metalFix(d, M.rims.concat(pickedAs('rim')));
    // 车漆是一个共用的材质：几种车漆（或者有的零件没有贴图坐标）时，一张贴图只有大家都是同一张、零件都有贴图坐标才带过去——
    // 不然 A 的法线 / AO 贴图按 B 的贴图坐标去取，花成一片（没有贴图坐标的零件法线算出来是无效值，发黑闪烁）
    var paintMeshes = [];
    model.traverse(function (o) { if (o.isMesh && (picked[o.uuid] === 'paint' || (!picked[o.uuid] && D3Model.mats(o).some(function (m) { return paintSet.indexOf(m) >= 0; })))) paintMeshes.push(o); });
    var uvAll = paintMeshes.every(function (o) { return !!o.geometry.attributes.uv; });
    var shared = function (k) { return !!src[k] && uvAll && srcs.every(function (m) { return m[k] === src[k]; }); };
    if (paintSet.length) { // 车漆保留原来的 AO（模型烘的 AO 有斑，W70 压淡到 0.45）、法线，原贴图可选保留
      (c.paintKeep || ['aoMap', 'normalMap'].concat(c.keepPaintMap ? ['map'] : [])).forEach(function (k) { if (shared(k)) M.paint[k] = src[k]; });
      if (M.paint.normalMap && src.normalScale) M.paint.normalScale.copy(src.normalScale);
      if (M.paint.aoMap) paintMeshes.forEach(function (o) { var g = o.geometry; if (!g.attributes.uv2) g.setAttribute('uv2', g.attributes.uv); }); // AO 贴图取第二套坐标
    }
    // 车模自己的车漆（设置里"原车颜色"）：颜色、贴图、金属度、粗糙度、清漆；带贴图的小球显示贴图的平均色。贴图带不过去时用贴图的平均色乘上颜色
    var oc = src && src.color ? src.color.clone() : null, omap = src && shared('map') ? src.map : null, oavg = src && src.map && !omap && texAvg(src.map);
    if (oavg) oc.multiply(oavg);
    M.orig = oc ? { color: oc, map: omap, metal: src.metalness !== undefined ? src.metalness : 0.3, rough: src.roughness !== undefined ? src.roughness : 0.4, coat: src.clearcoat || 0 } : null;
    M.keepMap = !!(c.keepPaintMap || (c.paintKeep && c.paintKeep.indexOf('map') >= 0));
    if (M.orig) {
      var shown = M.orig.color.clone(), avg = M.orig.map && texAvg(M.orig.map);
      if (avg) shown.multiply(avg);
      S.modelPaint({ color: '#' + M.orig.color.getHexString(), css: '#' + shown.getHexString(), metal: M.orig.metal, rough: M.orig.rough, coat: M.orig.coat });
    } else S.modelPaint(null);
    // 没带法线的网格（按平面着色）常有翻过去的面片：双面画（平面着色的法线按屏幕算，正反面都对）；换上去的车漆、玻璃跟着双面
    var two = function (set) { return set.some(function (m) { return m.side === T.DoubleSide || m.flatShading; }); };
    if (two(paintSet.concat(pickedAs('paint')))) M.paint.side = T.DoubleSide;
    if (two(glassSet.concat(pickedAs('glass')))) M.glass.side = T.DoubleSide;
    // 氛围灯分前排 / 后排（车机的氛围灯区域）：前后门都标出来了才分，分界在前门后沿和后门前沿中间；跨过分界的零件两边都算
    var zf = new T.Box3(), zr = new T.Box3(), zSplit = null;
    ['doorFL', 'doorFR'].forEach(function (k) { mrefs(pc[k] && pc[k].meshes).forEach(function (m) { zf.union(D3Model.box(m)); }); });
    ['doorRL', 'doorRR'].forEach(function (k) { mrefs(pc[k] && pc[k].meshes).forEach(function (m) { zr.union(D3Model.box(m)); }); });
    if (!zf.isEmpty() && !zr.isEmpty()) zSplit = (zf.min.z + zr.max.z) / 2;
    function zoneOf(o) {
      if (zSplit === null || !o) return '';
      var b = D3Model.box(o);
      return b.min.z > zSplit - 0.05 ? 'F' : b.max.z < zSplit + 0.05 ? 'R' : '';
    }
    // 灯：材质不动（亮的样子是点亮层，见 makeLamps），记下哪些零件是哪种灯（多材质的网格记到第几个材质；氛围灯记前排 / 后排）
    function lampOf(o, r, gi) { if (o.visible && !o.isSkinnedMesh) ents[r].push({ o: o, i: gi, z: r === 'ambient' ? zoneOf(o) : '' }); }
    /** 换成零件级角色的材质：车漆、玻璃用共用的；轮毂、卡钳用这个零件材质的副本（换色不影响别的零件）；灯不换 */
    function asRole(r, m, o, gi) {
      if (r === 'paint') return M.paint;
      if (r === 'glass') return c.keepGlass || cover(o) ? m : M.glass;
      if (r === 'rim' || r === 'caliper') {
        var key = r + m.uuid;
        if (!copies[key]) { copies[key] = m.clone(); (r === 'rim' ? M.rims : M.cals).push(copies[key]); }
        return copies[key];
      }
      lampOf(o, r, gi);
      return m;
    }
    /** 车头、车尾两端、不高过车身四分之三的玻璃是灯罩（和车窗常常是同一个玻璃材质）：留着原来的（透明的、红色的尾灯罩），换成深色车窗玻璃会把灯整个盖黑；
        后挡风玻璃也在车尾，但一直伸到车顶附近，不算 */
    function cover(o) { if (!o) return false; var b = D3Model.box(o); return Math.abs(b.min.z + b.max.z) / 2 > 0.6 * dims.hl && b.max.y < 0.75 * dims.h; }
    /** have：这个零件已经按零件级记过的灯（不重复记） */
    function byMat(m, o, gi, have) {
      if (paintSet.indexOf(m) >= 0) return M.paint;
      if (glassSet.indexOf(m) >= 0) return cover(o) ? m : M.glass;
      var out = m;
      LIGHTS.forEach(function (r) { // 一个材质可以同时是几种灯
        if (lampSets[r].indexOf(m) < 0) return;
        if (!have || have.indexOf(r) < 0) lampOf(o, r, gi);
        if (out === m && M.lens && r === 'head') out = M.head;
        else if (out === m && M.lens && r === 'tail') out = M.tail;
      });
      return out;
    }
    var swap = [], normalsDone = [];
    /** 用车模自己的材质：车模的"反光"、加载器补的默认材质、透射、只标了混合模式其实不透明的 */
    function fix(m) {
      if (m.userData.fixed) return;
      m.userData.fixed = 1;
      if (envK !== 1 && m.envMapIntensity !== undefined) m.envMapIntensity *= envK; // 车模的"反光"
      if (m.userData.gltfDefault && m.metalness !== undefined) { m.metalness = 0.05; m.roughness = 0.6; }
      // 只标了混合模式、其实不透明的（不透明度 1、没有透明度贴图、颜色贴图是 JPEG 或者没有、没有顶点色）：当不透明的画——混合模式不写深度，零件前后乱序、车里的东西透出来
      if (m.transparent && m.opacity >= 0.99 && !(m.transmission > 0) && !m.alphaMap && !m.vertexColors && (!m.map || /jpe?g/.test(m.map.userData && m.map.userData.mimeType || ''))) { m.transparent = false; m.depthWrite = true; }
      if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.45); m.depthWrite = false; }
    }
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.userData.car = 1; // 车模自己的零件（贴纸只贴这些，挡没挡住也只看这些）
      var g = o.geometry;
      if (g && g.attributes.position && !g.attributes.normal && normalsDone.indexOf(g) < 0) { g.computeVertexNormals(); normalsDone.push(g); }
      if (g && (Array.isArray(o.material) ? o.material : [o.material]).some(function (m) { return m.side === T.DoubleSide; })) D3Model.wind(g); // 双面的：绕向理顺到和法线一致
      var arr = Array.isArray(o.material), pr = picked[o.uuid], list = (arr ? o.material : [o.material]).map(function (m, mi) {
        if (m.flatShading) m.side = T.DoubleSide;
        var pl = pr ? null : pickedL[o.uuid];
        if (pl) pl.forEach(function (lr) { lampOf(o, lr, arr ? mi : -1); });
        var r = pr ? asRole(pr, m, o, arr ? mi : -1) : byMat(m, o, arr ? mi : -1, pl);
        if (r === m) fix(m);
        if (r !== m && swap.indexOf(m) < 0) swap.push(m);
        return r;
      });
      o.material = arr ? list : list[0];
    });
    var inUse = {}; // 换下来的材质：别的零件不用了才释放（零件级的角色只换了一部分零件）
    model.traverse(function (o) { if (o.isMesh) D3Model.mats(o).forEach(function (m) { inUse[m.uuid] = 1; }); });
    swap.forEach(function (m) { if (!inUse[m.uuid]) m.dispose(); });
    // 轮毂、卡钳是在车模原来的材质（或它的副本）上换色：换色前记下原来的颜色、金属度、粗糙度（设置里"原车颜色"用），告诉设置小球显示什么颜色
    M.rim0 = M.rims.map(function (m) { return { c: m.color.clone(), m: m.metalness, r: m.roughness }; });
    M.cal0 = M.cals.map(function (m) { return m.color.clone(); });
    var shownOf = function (m) { var c = m.color.clone(), avg = m.map && texAvg(m.map); if (avg) c.multiply(avg); return '#' + c.getHexString(); };
    S.modelPart('rim', M.rims.length ? shownOf(M.rims[0]) : null);
    S.modelPart('caliper', M.cals.length ? shownOf(M.cals[0]) : null);
    finish(false);

    // ---- 能动的部件：门、引擎盖、尾门挂到铰链上；车窗挂到同一边的门上 ----
    parts = {};
    var wins = {};
    if (c.winSplit) { var wg = mrefs([c.winSplit])[0]; if (wg) { var sp = splitX(wg); wins.winFL = [sp.L]; wins.winFR = [sp.R]; } }
    Object.keys(WINS).forEach(function (k) { var l = mrefs(pc[k] && pc[k].meshes).filter(seen); if (l.length) wins[k] = (wins[k] || []).concat(l); });
    var inWin = [].concat.apply([], Object.keys(wins).map(function (k) { return wins[k]; }));
    Object.keys(DOORS).concat(Object.keys(LIDS), Object.keys(FLAPS)).forEach(function (k) {
      var p = pc[k], ms = p ? mrefs(p.meshes).filter(function (m) { return seen(m) && inWin.indexOf(m) < 0; }) : [];
      if (ms.length) parts[k] = door(k, ms, p, P);
    });
    Object.keys(SLIDES).forEach(function (k) {
      var p = pc[k], ms = p ? mrefs(p.meshes).filter(seen) : [];
      if (ms.length) parts[k] = slider(k, ms, p);
    });
    Object.keys(wins).forEach(function (k) {
      var dp = parts['door' + k.slice(3)], list = wins[k], b = new T.Box3();
      list.forEach(function (m) { b.expandByObject(m); });
      var host = dp ? dp.pivot : new T.Group();
      if (!dp) root.add(host);
      list.forEach(function (m) { host.attach(m); m.userData.d3move = 1; }); // 车窗自己会动（升降）：贴在车窗上的贴纸挂在车窗下面
      parts[k] = { meshes: list, y0: list.map(function (m) { return m.position.y; }), drop: c.winDrop || Math.min(0.3, (b.max.y - b.min.y) * 0.85) }; // 降到门里
    });

    // ---- 车轮按四个角分组（胎压标签、胎压异常的红圈放在这里；卡钳不算） ----
    var groups = {}, wp = {}, out = {}, rs = [], Q = { LF: 'frontLeft', RF: 'frontRight', LB: 'rearLeft', RB: 'rearRight' };
    M.notWrap = {}; // 贴纸不贴的零件：车轮、灯
    mrefs(pc.wheels).forEach(function (m) { M.notWrap[m.uuid] = 1; });
    LIGHTS.forEach(function (r) { ents[r].forEach(function (e) { M.notWrap[e.o.uuid] = 1; }); });
    mrefs(pc.wheels).filter(seen).forEach(function (m) {
      if (D3Model.mats(m).some(function (x) { return M.cals.indexOf(x) >= 0; })) return;
      var wb = new T.Box3().expandByObject(m), cc = wb.getCenter(V(0, 0, 0)), q = (cc.x > 0 ? 'L' : 'R') + (cc.z > 0 ? 'F' : 'B');
      if ((wb.min.x < -0.1 * dims.hw && wb.max.x > 0.1 * dims.hw) || (wb.min.z < -0.1 * dims.hl && wb.max.z > 0.1 * dims.hl)) return;
      (groups[q] = groups[q] || []).push(m);
    });
    Object.keys(groups).forEach(function (q) {
      var b = new T.Box3();
      groups[q].forEach(function (m) { b.expandByObject(m); });
      var cc = b.getCenter(V(0, 0, 0));
      wheelN++;
      wp[Q[q]] = V(cc.x, 0, cc.z); out[Q[q]] = (b.max.x - b.min.x) / 2; rs.push((b.max.y - b.min.y) / 2);
    });
    wheelR = c.wheelR || (rs.length ? rs.reduce(function (a, x) { return a + x; }, 0) / rs.length : dims.h * 0.27);
    var WP = {};
    TYRES.forEach(function (w) {
      var f = w.indexOf('front') === 0 ? 1 : -1, l = /Left/.test(w) ? 1 : -1;
      WP[w] = c.wheelPos && c.wheelPos[w] ? P(c.wheelPos[w]) : wp[w] || V(l * dims.hw * 0.8, 0, f * dims.hl * 0.55);
    });

    // ---- 轮子：胎压异常时地上一圈光 ----
    wheels = {};
    var ringTex = app.canvasTex(128, 128, function (cx, w) {
      var gr = cx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(0.72, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = gr; cx.fillRect(0, 0, w, w);
    });
    var ringS = 1.3 * wheelR / 0.345;
    TYRES.forEach(function (w) {
      var ring = new T.Mesh(new T.PlaneGeometry(ringS, ringS), new T.MeshBasicMaterial({ map: ringTex, color: 0xff8a1f, transparent: true, depthWrite: false, opacity: 0 }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(WP[w]).setY(0.004); ring.renderOrder = 1; ring.visible = false;
      root.add(ring);
      var side = WP[w].x > 0 ? 1 : -1, lo = c.labelOut || (out[w] ? out[w] + 0.3 : 0.42);
      wheels[w] = { ring: ring, side: side, c: V(WP[w].x, wheelR, WP[w].z), at: WP[w].clone().add(V(side * lo, 0, 0)), label: $('tp-' + w) }; // c 轮子中心（轮位是接地点，抬到轮半径），at 胎压标签挂的地方（轮子外侧）
    });

    // ---- 接触阴影、大灯照到地上的光、转向灯 ----
    root.add(shadow(WP));
    var fx = S.fx();
    model.traverse(function (o) { // 透明的（玻璃、灯罩）不投影，不然车里一片黑
      if (!o.isMesh) return;
      o.castShadow = !!fx.shadow && !D3Model.mats(o).every(function (m) { return m.transparent && m.opacity < 0.9; });
      o.receiveShadow = !!fx.shadow;
    });
    if (fx.shadow) {
      var L = Math.max(dims.hl, dims.hw) + 0.8, sc = keyLight.shadow.camera, SR = L * 1.6; // 阴影贴图盖住的范围比接影子的平面大一圈（不然斜着投下来，平面边上露出贴图的边界线）
      sc.left = sc.bottom = -SR; sc.right = sc.top = SR; sc.near = 2; sc.far = 24; sc.updateProjectionMatrix();
      var catcher = new T.Mesh(new T.PlaneGeometry(L * 2, L * 2), new T.ShadowMaterial({ opacity: 0.32, depthWrite: false }));
      catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.001; catcher.receiveShadow = true; catcher.renderOrder = -2;
      root.add(catcher);
      shadowDirty = true;
    }
    if (fx.reflect && T.Reflector) root.add(root.userData.refl = mirror());
    root.userData.origMap = M.orig && M.orig.map;
    LS = root.userData.lamps = makeLamps(ents);
    hmark = null; showHinge();
    hiMat = new T.MeshBasicMaterial({ color: 0x3fb4ff, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    flashMat = new T.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: T.DoubleSide, toneMapped: false }); // 不被挡住：在车另一边、在里面的零件也看得见
    plates = null; // 上一台车 / 上一次配置的车牌跟着旧的车一起释放了，这里从头按新配置建
    if (cfg.plates) page.plates(cfg.plates); // 车牌按配置建（没开的话也建着，进车牌页随时能开）
  }
  function seen(m) { return m.visible && !m.isSkinnedMesh; }
  // ================= 调整车模：铰链的中心点（橙色小球）和转轴（虚线），按住小球拖动挪铰链 =================
  var hkey = null, hmark = null, hdrag = null, hTapAt = 0;
  // 车牌（装饰）：前 / 后各一块薄板 + canvas 画的牌面；pkey 是调整车模里正在调的那块（能按住拖）
  var plates = null, pkey = null, pdrag = null, pTapAt = 0;
  /** 显示这一项（门、盖、充电口盖、翘起的天窗）的铰链；k 为空就收起 */
  page.hinge = function (k) { hkey = k || null; showHinge(); if (app) app.invalidate(); };
  function showHinge() {
    if (hmark) { hmark.parent && hmark.parent.remove(hmark); hmark.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); hmark = null; }
    var h = hkey && parts && parts[hkey];
    if (!h || !h.pivot || !h.axis || !root) return;
    var kw = dims.hw / 1.02, L = Math.max(dims.hl, dims.h) * 0.8, m = new T.MeshBasicMaterial({ color: 0xff7a00, depthTest: false, transparent: true, toneMapped: false });
    hmark = new T.Group();
    var ball = new T.Mesh(new T.SphereGeometry(0.055 * kw, 18, 12), m);
    var line = new T.Line(new T.BufferGeometry().setFromPoints([h.axis.clone().multiplyScalar(-L), h.axis.clone().multiplyScalar(L)]),
      new T.LineDashedMaterial({ color: 0xff7a00, dashSize: 0.1 * kw, gapSize: 0.07 * kw, depthTest: false, transparent: true, toneMapped: false }));
    line.computeLineDistances();
    ball.renderOrder = line.renderOrder = 1000;
    hmark.add(ball); hmark.add(line);
    hmark.position.copy(h.pivot.position);
    root.add(hmark);
  }
  /** 按门窗都关着的样子算（一键镜像找对称零件：开着的门位置不对）：先摆回关着、算完再摆回去，不出帧 */
  page.atRest = function (fn) {
    if (!parts || !root) return fn();
    var keep = [];
    Object.keys(parts).forEach(function (k) {
      var p = parts[k];
      if (p.pivot) { keep.push([p.pivot, p.pivot.position.clone(), p.pivot.quaternion.clone()]); if (p.slide) p.pivot.position.set(0, 0, 0); else p.pivot.quaternion.identity(); }
      else if (p.meshes && p.y0) p.meshes.forEach(function (m, i) { keep.push([m, m.position.clone(), m.quaternion.clone()]); m.position.y = p.y0[i]; });
    });
    root.updateMatrixWorld(true);
    try { return fn(); } finally {
      keep.forEach(function (x) { x[0].position.copy(x[1]); x[0].quaternion.copy(x[2]); });
      root.updateMatrixWorld(true);
    }
  };
  /** 小球在屏幕上的位置（测试、走查用）；没显示返回 null */
  page.hingeAt = function () {
    if (!hmark || !camera) return null;
    var q = hmark.position.clone().applyMatrix4(root.matrixWorld).project(camera);
    return { x: Math.round((q.x + 1) / 2 * W), y: Math.round((1 - q.y) / 2 * H) };
  };
  /** 按在小球上（屏幕上 30 像素以内）：开始拖 */
  function hingeHit(x, y) {
    if (!hmark) return false;
    var q = hmark.position.clone().applyMatrix4(root.matrixWorld).project(camera);
    return Math.hypot((q.x + 1) / 2 * W - x, (1 - q.y) / 2 * H - y) < 30;
  }
  /** 拖：小球在过它、朝着镜头的那个平面上跟着手指走 */
  function hingeMove(x, y) {
    ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera);
    var n = camera.getWorldDirection(V(0, 0, 0)), pl = new T.Plane().setFromNormalAndCoplanarPoint(n, hdrag.p), out = V(0, 0, 0);
    if (!ray.ray.intersectPlane(pl, out)) return;
    hmark.position.copy(out); app.invalidate();
  }
  /** 松手：按自动算的位置和外框换算成 piv，交给调整车模存起来、重建 */
  function hingeDone() {
    var h = parts && parts[hkey], pos = hmark && hmark.position;
    if (!h || !pos || !h.base) return;
    var c = function (v) { return Math.round(Math.max(-1.5, Math.min(1.5, v)) * 1000) / 1000; };
    var piv = [c((pos.x - h.base.x) / Math.max(1e-3, h.size.x) * h.side), c((pos.y - h.base.y) / Math.max(1e-3, h.size.y)), c((pos.z - h.base.z) / Math.max(1e-3, h.size.z))];
    if (window.D3Tune) D3Tune.hinged(hkey, piv);
  }
  /** 网格连同它的上级都是显示的（射线不管显示不显示，藏起来的地板、展台要自己排除） */
  function inScene(o) { for (var p = o; p; p = p.parent) if (!p.visible) return false; return true; }
  // ================= 车牌：照国标 GA 36-2018 画（图 1～8、图 19 的尺寸，效果图 B.1～B.10、B.17），应急救援专用号牌照国办 2018 年的通知 =================
  // 颜色从效果图上取（国标颜色只引 GA 666，没给数值）。军队、武警号牌不做
  var YEL = '#ffc20d', INK = '#231f20', RED = '#e2232a', NIGHT = '#17181a';
  // 字格：[左边, 宽, 上边, 高]（毫米，从牌子左上角量）；单行牌省掉后两个：字高 90、上下各留 25
  var C440 = [[15, 45], [72, 45], [151, 45], [208, 45], [265, 45], [322, 45], [379, 45]]; // 图 1：15 边 + 7 个 45 宽，字间 12，第 2、3 字之间 34 放圆点
  var C480 = [[15.5, 45], [69.5, 43], [161.5, 43], [213.5, 43], [265.5, 43], [317.5, 43], [369.5, 43], [421.5, 43]]; // 图 7、8：省份 45、发牌机关 43，空 49 放新能源标志，再 6 个 43 宽
  var CPOL = [[15, 45], [94, 45], [151, 45], [208, 45], [265, 45], [322, 45], [379, 45]]; // 图 4、5：间隔符在省份后面
  // 铆钉孔：15×8、两头半圆，[左边, 中心高]
  var S440 = [[100, 12.5], [325, 12.5], [100, 127.5], [325, 127.5]], S480 = [[120, 12.5], [345, 12.5], [120, 127.5], [345, 127.5]];
  // 版式：外廓 W×H、字格、间隔符（after：前面有几个字；r 是圆点半径，w / h 是短横）、铆钉孔、新能源标志、每格用哪套字形（plate-font.js：n 单行牌，t 双行牌上排，b 双行牌下排；没写是 n）
  var LAYOUT = {
    l440: { W: 440, H: 140, cells: C440, sep: { after: 2, x: 134, y: 70, r: 5 }, slots: S440 },
    l480: { W: 480, H: 140, cells: C480, slots: S480, logo: true },
    l480b: { W: 480, H: 140, cells: C480, slots: [[105, 12.5], [360, 12.5], [105, 127.5], [360, 127.5]], logo: true }, // 图 8 大型新能源后牌：孔在 105、360
    row2: { W: 440, H: 220, slots: [[85, 12.5], [340, 12.5], [100, 207.5], [325, 207.5]], sep: { after: 1, x: 220, y: 57, r: 5 }, fonts: 'ttbbbbb', // 图 6 双行：上排省份、发牌机关 80×60，下排 5 个 65×110
      cells: [[110, 80, 15, 60], [250, 80, 15, 60], [27.5, 65, 90, 110], [107.5, 65, 90, 110], [187.5, 65, 90, 110], [267.5, 65, 90, 110], [347.5, 65, 90, 110]] },
    low: { W: 300, H: 165, slots: [[15, 12.5], [270, 12.5]], sep: { after: 1, x: 150, y: 32.5, r: 5 }, fonts: 'ttnnnnn', // 图 19 低速车：上排 55×45，下排 5 个 45×90
      cells: [[70, 55, 10, 45], [175, 55, 10, 45], [13.5, 45, 65, 90], [70.5, 45, 65, 90], [127.5, 45, 65, 90], [184.5, 45, 65, 90], [241.5, 45, 65, 90]] },
    police: { W: 440, H: 140, cells: CPOL, sep: { after: 1, x: 77, y: 70, r: 7 }, slots: S440 }, // 图 4 前牌：直径 14 的圆点
    policeR: { W: 440, H: 140, cells: CPOL, sep: { after: 1, x: 77, y: 70, w: 16, h: 10 }, slots: S440 }, // 图 5 后牌：16×10 的短横
    embassy: { W: 440, H: 140, cells: [[15.5, 45], [72.5, 45], [129.5, 45], [208.5, 45], [265.5, 45], [322.5, 45], [379.5, 45]], sep: { after: 3, x: 191.5, y: 70, r: 5 }, slots: S440 }, // 图 2
    consulate: { W: 440, H: 140, cells: [[15.5, 45], [72.5, 45], [129.5, 45], [186.5, 45], [265.5, 45], [322.5, 45], [379.5, 45]], sep: { after: 4, x: 248.5, y: 70, r: 5 }, slots: S440 }, // 图 3
    emergency: { W: 480, H: 140, cells: [[15.5, 45], [91, 43], [146.2, 43], [201.4, 43], [256.6, 43], [311.8, 43], [366.5, 43.5], [421, 43.5]], sep: { after: 1, x: 76, y: 70, r: 5.5 }, slots: S480 } // 照实物照片量的
  };
  // 牌种：版式（layR 是后牌不一样的）、底色、字色、边框线（离边几毫米到几毫米）、铆钉孔颜色；red 是红字的位置（redF 只有前牌红），fix 是固定的字（没敲到那一位也画上）
  var PLATE = {
    blue: { lay: 'l440', bg: '#213f99', fg: '#ffffff', frame: [1.5, 3], slot: '#e6ebf5' }, // 小型汽车
    green: { lay: 'l480', bg: ['#ffffff', '#7dc685'], fg: INK, frame: [2, 4], slot: '#f7faf7', slotLine: '#8a948c' }, // 小型新能源：上白下绿竖向渐变
    yellow: { lay: 'l440', layR: 'row2', bg: YEL, fg: INK, frame: [1.5, 3], slot: '#fff3c4' }, // 大型汽车：前牌单行，后牌双行
    bignev: { lay: 'l480', layR: 'l480b', bg: '#eba749', panel: '#7dc685', fg: INK, frame: [2, 4], slot: '#ffffff' }, // 大型新能源：左黄右绿
    police: { lay: 'police', layR: 'policeR', bg: '#ffffff', fg: INK, frame: [1.5, 3], slot: '#ffffff', slotLine: '#6b6b6b', red: [6], fix: { 6: '警' } },
    emergency: { lay: 'emergency', bg: '#ffffff', fg: INK, frame: [2, 4], slot: '#ffffff', slotLine: '#6b6b6b', red: [6, 7], redF: [1], fix: { 6: '应', 7: '急' } }, // 队伍代号前牌红、后牌黑
    coach: { lay: 'l440', bg: YEL, fg: INK, frame: [1.5, 3], slot: '#fff3c4', fix: { 6: '学' } },
    trailer: { lay: 'row2', bg: YEL, fg: INK, frame: [1.5, 3], slot: '#fff3c4', fix: { 6: '挂' } },
    lowspeed: { lay: 'low', bg: YEL, fg: INK, frame: [1.5, 3], slot: '#fff3c4' },
    embassy: { lay: 'embassy', bg: NIGHT, fg: '#ffffff', frame: [1.5, 3], slot: '#dcdcdc', fix: { 6: '使' } },
    consulate: { lay: 'consulate', bg: NIGHT, fg: '#ffffff', frame: [1.5, 3], slot: '#dcdcdc', fix: { 6: '领' } },
    hkmo: { lay: 'l440', bg: NIGHT, fg: '#ffffff', frame: [1.5, 3], slot: '#dcdcdc', fix: { 0: '粤', 1: 'Z' } } // 港澳入出境车：粤 Z 开头，最后港 / 澳
  };
  /** 这块牌子（前 / 后）的版式 + 颜色；自定义：版式同蓝牌，颜色自己定 */
  function plateStyle(st, which) {
    var s = PLATE[st.style] || { lay: 'l440', bg: st.bg || '#e9e9e9', fg: st.fg || '#15171a', frame: [1.5, 3], slot: '#f2f2f2' };
    var L = LAYOUT[(which === 'rear' && s.layR) || s.lay], o = {}, k;
    for (k in L) o[k] = L[k];
    for (k in s) o[k] = s[k];
    o.bg = [].concat(o.bg);
    return o;
  }
  var PK = 2.6; // 牌面画布每毫米几个像素
  // 字形用国标的字样（GA 36-2007 附录 B，_tools/gen/plate-font.py 描成矢量的 plate-font.js，约 180KB）：第一次挂车牌时才加载。
  // 应急牌的"应""急"国标里没有字样，加载失败时也一样，用系统字体画
  var pfont = 0, pPaths = {}; // pfont：0 没加载、1 加载中、2 加载完了（失败也算）；pPaths：解析过的轮廓
  function plateFont() {
    if (window.D3PlateFont || pfont === 2) return true;
    if (!pfont) {
      pfont = 1;
      var sc = document.createElement('script');
      sc.src = 'plate-font.js';
      sc.onload = sc.onerror = function () { pfont = 2; if (cfg && cfg.plates) page.plates(); };
      document.head.appendChild(sc);
    }
    return false;
  }
  var gly = null; // 量字形用的离屏画布：Chromium 74 的 measureText 没有墨迹范围（actualBoundingBox 77 才有），画出来数像素
  /** 在离屏画布上画一个字（颜色 c），返回墨迹范围 { l, r, t, b }（像素，基线在 y = 280） */
  function glyph(ch, font, c) {
    if (!gly) { gly = document.createElement('canvas'); gly.width = gly.height = 360; }
    var x = gly.getContext('2d'), N = 360;
    x.clearRect(0, 0, N, N);
    x.font = font; x.fillStyle = c; x.textBaseline = 'alphabetic';
    x.fillText(ch, 30, 280);
    var d = x.getImageData(0, 0, N, N).data, l = N, r = -1, t = N, b = -1;
    for (var y = 0; y < N; y++) for (var i = 0; i < N; i++) if (d[(y * N + i) * 4 + 3] > 60) { if (i < l) l = i; if (i > r) r = i; if (y < t) t = y; if (y > b) b = y; }
    return r < 0 ? null : { l: l, r: r + 1, t: t, b: b + 1 };
  }
  /** 圆角矩形路径（毫米 → 像素由调用的人换） */
  function rrect(x, X, Y, W2, H2, R) {
    x.beginPath();
    x.moveTo(X + R, Y); x.lineTo(X + W2 - R, Y); x.arc(X + W2 - R, Y + R, R, -Math.PI / 2, 0);
    x.lineTo(X + W2, Y + H2 - R); x.arc(X + W2 - R, Y + H2 - R, R, 0, Math.PI / 2);
    x.lineTo(X + R, Y + H2); x.arc(X + R, Y + H2 - R, R, Math.PI / 2, Math.PI);
    x.lineTo(X, Y + R); x.arc(X + R, Y + R, R, Math.PI, Math.PI * 1.5);
    x.closePath();
  }
  /** 新能源标志（国标效果图 B.4、B.5，第 2、3 字之间）：浅绿外圈，里面左边一道道彩色横条，右边一个白色的插头 */
  function nevLogo(x, cx, cy, R) {
    x.save();
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fillStyle = '#84d2b4'; x.fill();
    var r = R * 0.86;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.clip();
    [['#40acd4', -1, -0.42], ['#da3477', -0.42, -0.16], ['#ec7a2a', -0.16, 0.2], ['#c1ce39', 0.2, 0.46], ['#4faa47', 0.46, 1]].forEach(function (b) {
      x.fillStyle = b[0]; x.fillRect(cx - r, cy + b[1] * r, 2 * r, (b[2] - b[1]) * r);
    });
    x.fillStyle = '#ffffff'; // 橙色那道里的白线
    [-0.09, 0.03, 0.14].forEach(function (y0) { x.fillRect(cx - r, cy + y0 * r, 1.4 * r, 0.045 * r); });
    var px = cx + 0.18 * r; // 插头：右边半圆 + 左边一截脖子，深色描边
    x.beginPath();
    x.moveTo(px, cy - 0.66 * r); x.arc(px, cy, 0.66 * r, -Math.PI / 2, Math.PI / 2); x.lineTo(px, cy + 0.36 * r);
    x.lineTo(cx - 0.52 * r, cy + 0.36 * r); x.lineTo(cx - 0.52 * r, cy - 0.36 * r); x.lineTo(px, cy - 0.36 * r); x.closePath();
    x.fillStyle = '#ffffff'; x.fill();
    x.lineWidth = 0.09 * r; x.strokeStyle = '#3f6b5c'; x.stroke();
    x.fillStyle = '#ec7a2a'; // 橙白相间的几道从左边一直通到插头里
    [-0.16, -0.03, 0.09].forEach(function (y0) { x.fillRect(cx - r, cy + y0 * r, 0.7 * r + 0.18 * r, 0.075 * r); });
    x.restore();
  }
  /** 画牌面：底色（小型新能源竖向渐变、大型新能源右边一块绿）、铆钉孔、边框线、按字格排的号（固定的字没敲到也画上）、间隔符或新能源标志。
      字形用国标字样：汉字撑满字格，字母数字按字样里的宽窄（"1""I"窄）居中、放不下（新能源的 43 宽字格）压窄一点，字高都是字格高。
      国标字样里没有的字（应急）用系统字体近似：字母数字按"0"撑满字格的比例压窄、按"H"的高度对齐基线，汉字整个撑满字格 */
  function plateCanvas(st, which) {
    var s = plateStyle(st, which), k = PK, c = document.createElement('canvas');
    c.width = Math.round(s.W * k); c.height = Math.round(s.H * k);
    var x = c.getContext('2d');
    if (s.bg.length > 1) {
      var g = x.createLinearGradient(0, 0, 0, c.height);
      g.addColorStop(0, s.bg[0]); g.addColorStop(0.85, s.bg[1]); g.addColorStop(1, s.bg[1]);
      x.fillStyle = g;
    } else x.fillStyle = s.bg[0];
    x.fillRect(0, 0, c.width, c.height);
    if (s.panel) { rrect(x, 136.5 * k, 10 * k, 336 * k, 120 * k, 4 * k); x.fillStyle = s.panel; x.fill(); } // 效果图 B.4：绿底从标志中间到右边框
    s.slots.forEach(function (p) {
      rrect(x, p[0] * k, (p[1] - 4) * k, 15 * k, 8 * k, 4 * k);
      x.fillStyle = s.slot; x.fill();
      if (s.slotLine) { x.lineWidth = 0.6 * k; x.strokeStyle = s.slotLine; x.stroke(); }
    });
    // 边框线：离边 1.5～3 毫米（新能源、应急 2～4，粗一些）；牌子四角是 R10 的圆角
    var f0 = s.frame[0], f1 = s.frame[1], fm = (f0 + f1) / 2;
    rrect(x, fm * k, fm * k, (s.W - 2 * fm) * k, (s.H - 2 * fm) * k, (10 - fm) * k);
    x.lineWidth = (f1 - f0) * k; x.strokeStyle = s.fg; x.stroke();
    // 号
    var cells = s.cells, fix = s.fix || {}, red = (s.red || []).concat(which === 'front' && s.redF || []);
    var chars = String(st.text || '').toUpperCase().replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '').slice(0, cells.length);
    var CN = '700 240px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", MiSans, sans-serif';
    var AN = '700 240px "sans-serif-condensed", "Arial Narrow", Arial, Helvetica, Roboto, sans-serif';
    var ref = null, zero = null, F = window.D3PlateFont;
    for (var i = 0; i < cells.length; i++) {
      var ch = chars[i] || fix[i];
      if (!ch) continue;
      var cell = cells[i], cw = cell[1] * k, cx = (cell[0] + cell[1] / 2) * k, top = (cell[2] === undefined ? 25 : cell[2]) * k, chh = (cell[3] || 90) * k;
      var cn = /[\u4e00-\u9fa5]/.test(ch), col = red.indexOf(i) >= 0 ? RED : s.fg, fs = (s.fonts && s.fonts[i]) || 'n';
      var e = F && (F[fs][ch] || (fs === 'b' && F.t[ch])); // 双行牌下排的"挂"在上排那套里（是高的那个）
      if (e) {
        var gw = cn ? cw : Math.min(e[0] * chh, cw), key = (F[fs][ch] ? fs : 't') + ch;
        if (!pPaths[key]) pPaths[key] = new Path2D(e[1]);
        x.save(); x.translate(cx - gw / 2, top); x.scale(gw / 400, chh / 400); x.fillStyle = col; x.fill(pPaths[key]); x.restore();
        continue;
      }
      if (!cn && !ref) { ref = glyph('H', AN, col); zero = glyph('0', AN, col); }
      var b = glyph(ch, cn ? CN : AN, col);
      if (!b) continue;
      var bw = b.r - b.l, bh = b.b - b.t;
      if (cn) { x.drawImage(gly, b.l, b.t, bw, bh, cell[0] * k, top, cw, chh); continue; } // 汉字：整个撑满字格
      var sy = chh / (ref.b - ref.t), sxr = cw / (zero.r - zero.l), dw = Math.min(bw * sxr, cw);
      x.drawImage(gly, b.l, b.t, bw, bh, cx - dw / 2, top + (b.t - ref.t) * sy, dw, bh * sy);
    }
    // 间隔符（和字同色，两边都有字了才画）；新能源牌第 2、3 字之间是标志
    var sp = s.sep;
    if (sp && chars.length > sp.after) {
      x.fillStyle = s.fg;
      if (sp.r) { x.beginPath(); x.arc(sp.x * k, sp.y * k, sp.r * k, 0, Math.PI * 2); x.fill(); }
      else x.fillRect((sp.x - sp.w / 2) * k, (sp.y - sp.h / 2) * k, sp.w * k, sp.h * k);
    }
    if (s.logo) nevLogo(x, 137 * k, 70 * k, 13.5 * k);
    return c;
  }
  /** 圆角矩形（米），中心在原点 */
  function plateShape(w, h, r) {
    var sh = new T.Shape(), x0 = -w / 2, y0 = -h / 2;
    sh.moveTo(x0 + r, y0); sh.lineTo(x0 + w - r, y0); sh.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false);
    sh.lineTo(x0 + w, y0 + h - r); sh.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false);
    sh.lineTo(x0 + r, y0 + h); sh.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false);
    sh.lineTo(x0, y0 + r); sh.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
    return sh;
  }
  /** 一块车牌：3 毫米厚的圆角板子（R10，按宽度缩放）+ 正面贴牌面。宽度没调过按国标外廓（440 / 480 / 300 毫米），高按这种牌的比例 */
  function mkPlate(which) {
    var st = cfg.plates, s = plateStyle(st, which), p = st[which] || {}, w = p.w || s.W / 1000, h = w * s.H / s.W, r = w * 10 / s.W, D = 0.003;
    var shape = plateShape(w, h, r), grp = new T.Group();
    var bodyG = new T.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 5 });
    bodyG.translate(0, 0, -D);
    var edge = new T.Color(s.bg[s.bg.length - 1]).multiplyScalar(0.75);
    grp.add(new T.Mesh(bodyG, new T.MeshStandardMaterial({ color: edge, roughness: 0.55, metalness: 0.3 })));
    var tex = new T.CanvasTexture(plateCanvas(st, which));
    tex.encoding = T.sRGBEncoding;
    tex.repeat.set(1 / w, 1 / h); tex.offset.set(0.5, 0.5); // 形状的贴图坐标是米（-w/2～w/2）：换到 0～1
    tex.anisotropy = Math.min(4, app.renderer().capabilities.getMaxAnisotropy()); // 车牌常常斜着看
    grp.add(new T.Mesh(new T.ShapeGeometry(shape, 5), new T.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
    grp.rotation.order = 'YXZ';
    grp.visible = !!p.on;
    grp.userData.w = w;
    return grp;
  }
  /** 自动摆一个起点（用户再按住车牌拖、或用滑块微调）：从车外朝车里横着打射线，从低往高扫，找到第一个"挂得住"的高度——
      打到的那个面得是朝着车头 / 车尾的（车底、车顶、保险杠的帽檐、扰流板的斜面都不行，挂上去会被车身挡住或者沉进去），
      而且离车头 / 车尾得够远（从格栅的缝里穿进车里的不算）。横向居中、贴着那个面放。
      一台车一个样，这里只求"摆上去不难看"；位置、大小、角度都由用户自己调 */
  function plateAuto(which) {
    var front = which === 'front', want = front ? 1 : -1, nm = new T.Matrix3(), best = null;
    var list = modelObj.userData.d3.meshes.filter(function (m) { return m.parent && inScene(m); }); // 门、盖、尾门挂到了铰链组上，不在车模底下
    for (var k = 0; k < 8 && !best; k++) {
      var y = dims.h * (0.12 + k * 0.05), hit = null, hn = null;
      for (var i = 0; i < 5; i++) {
        ray.set(V((i - 2) * 0.08, y, want * (dims.hl * 1.5 + 1)), V(0, 0, -want));
        var hs = ray.intersectObjects(list, false).filter(function (h) { return !!h.face; });
        if (!hs.length || (hit && Math.abs(hs[0].point.z) <= Math.abs(hit.z))) continue;
        hit = hs[0].point;
        hn = hs[0].face.normal.clone().applyMatrix3(nm.getNormalMatrix(hs[0].object.matrixWorld)).normalize();
      }
      if (hit && hn && Math.abs(hn.z) > 0.6 && Math.abs(hit.z) >= 0.8 * dims.hl) best = [0, Math.round(y * 1000) / 1000, hit.z + want * 0.012];
    }
    return best || [0, dims.h * 0.3, want * dims.hl * 0.98]; // 一台都没找到（模型很怪）：按外框兜底
  }
  /** 摆位置、转角度（度）：pitch 上仰（牌面朝上翻），yaw 左右偏（站在这块牌子前面看，往右转为正）；没摆过的先自动摆 */
  function plateXform(m) {
    var st = cfg.plates, p = st[m.userData.which] || (st[m.userData.which] = {});
    if (!p.at) p.at = plateAuto(m.userData.which);
    m.position.fromArray(p.at);
    m.rotation.set(-(p.pitch || 0) * DEG, (m.userData.which === 'front' ? 0 : Math.PI) + (p.yaw || 0) * DEG, 0);
  }
  /** 挂到会动的部件上：位置落在哪个部件（门窗关着的外框）里就跟着它动（后车牌贴尾门，开尾门跟着翻） */
  function plateAttach(m) {
    if (!m || !root) return;
    root.attach(m);
    if (!parts) return;
    page.atRest(function () {
      Object.keys(parts).forEach(function (k) {
        var p = parts[k];
        if (!p.pivot || !p.meshes) return;
        var b = new T.Box3();
        p.meshes.forEach(function (mm) { b.expandByObject(mm); });
        if (b.containsPoint(m.position)) p.pivot.attach(m);
      });
    });
  }
  function plateFree(m) {
    if (!m) return;
    if (m.parent) m.parent.remove(m);
    m.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }
  page.plates = function (st) { // 配置变了（样式、号、开关、位置、大小）：只换这两块板子，不重建车
    if (st) cfg.plates = st;
    if (!cfg.plates || !root || !modelObj) return;
    var P = cfg.plates;
    if ((P.front && P.front.on || P.rear && P.rear.on) && !plateFont()) return; // 字形加载完再画（加载完会再调一次）
    if (!plates) { plates = {}; ['front', 'rear'].forEach(function (k) { var m = mkPlate(k); m.userData.which = k; plates[k] = m; plateXform(m); root.add(m); plateAttach(m); }); }
    else ['front', 'rear'].forEach(function (k) {
      plateFree(plates[k]);
      var m = mkPlate(k);
      m.userData.which = k;
      plates[k] = m;
      plateXform(m);
      root.add(m);
      plateAttach(m);
    });
    app.invalidate();
  };
  page.plateAuto = function (which) { return plateAuto(which); };
  page.plateMM = function (style, which) { var s = plateStyle({ style: style }, which); return [s.W, s.H]; }; // 这种牌（前 / 后）的国标外廓（毫米）
  page.platesAt = function () { return plates; }; // 测试、引导用：现在这两块车牌网格
  page.partsAt = function () { return parts; };
  /** 车牌页开着时正在调哪块（能按住拖）；空收起 */
  page.plateEdit = function (which) { pkey = which || null; };
  /** 正在调的车牌在屏幕上的位置（引导、测试用） */
  page.plateAt = function () {
    var m = pkey && plates && plates[pkey];
    if (!m || !m.visible || !camera) return null;
    var q = m.getWorldPosition(V(0, 0, 0)).project(camera);
    return { x: Math.round((q.x + 1) / 2 * W), y: Math.round((1 - q.y) / 2 * H) };
  };
  function plateHit(x, y) {
    var a = page.plateAt();
    return !!a && Math.hypot(a.x - x, a.y - y) < 46;
  }
  function plateMove(x, y) {
    ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera);
    var n = camera.getWorldDirection(V(0, 0, 0)), pl = new T.Plane().setFromNormalAndCoplanarPoint(n, pdrag.p), out = V(0, 0, 0);
    if (!ray.ray.intersectPlane(pl, out)) return;
    var m = plates[pkey];
    if (m.parent !== root) root.attach(m); // 拖出部件范围：先回到车底下
    m.position.copy(out);
    app.invalidate();
  }
  function plateDone() {
    var w = plates[pkey].getWorldPosition(V(0, 0, 0));
    if (window.D3Tune) D3Tune.plated(pkey, [Math.round(w.x * 1000) / 1000, Math.round(w.y * 1000) / 1000, Math.round(w.z * 1000) / 1000]);
  }
  // ================= 贴纸（carwrap.js，第一次用到时加载）：按配置贴到这台车上；调整车模的贴纸页里点车放贴纸、按住小球拖 =================
  var wrapP = null, wkey = null, wmark = null, wdrag = null, wTapAt = 0, wRaf = 0, bufIds = typeof WeakMap === 'function' ? new WeakMap() : null, bufN = 0;
  function wrapLib() {
    if (window.D3Wrap) return Promise.resolve();
    if (!wrapP) wrapP = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'carwrap.js';
      s.onload = function () { if (window.D3Wrap) ok(); else { wrapP = null; no(new Error('贴纸脚本加载失败')); } };
      s.onerror = function () { wrapP = null; no(new Error('贴纸脚本加载失败')); };
      document.head.appendChild(s);
    });
    return wrapP;
  }
  /** 这台车给贴纸用的：零件、哪些是车漆 / 玻璃、会动的部件、材质设置（建车时的值，换了车不串） */
  function wrapCtx() {
    var R0 = root, M0 = M, d0 = { hw: dims.hw, h: dims.h, hl: dims.hl }, b0 = rec.buf, envK0 = envK, lp = !!(S.fx().lowp && std), sh = !!S.fx().shadow;
    if (bufIds && !bufIds.has(b0)) bufIds.set(b0, ++bufN);
    var shown = function (o) { for (var p = o; p && p !== R0; p = p.parent) if (!p.visible) return false; return true; }; // 新车贴好贴纸之前整台藏着：只看车里面藏没藏
    var carMeshes = function () { var l = []; R0.traverse(function (o) { if (o.isMesh && o.userData.car && !o.isSkinnedMesh && shown(o)) l.push(o); }); return l; };
    var glassy = function (m) { return m === M0.glass || M0.glassSrc.indexOf(m) >= 0; };
    return {
      renderer: app.renderer(), root: R0, dims: d0, buf: b0, bufId: bufIds ? bufIds.get(b0) : 0, shadow: sh,
      invalidate: function () { if (app && root === R0) app.invalidate(); },
      atRest: function (fn) { return root === R0 ? page.atRest(fn) : fn(); },
      occluders: carMeshes,
      /** 贴在哪种零件上（on：body / glass / both）的网格和三角形范围（多材质的网格只取那几个材质的） */
      targets: function (on) {
        var body = on !== 'glass', glass = on !== 'body', paint = M0.has.paint, out = [];
        carMeshes().forEach(function (o) {
          if (M0.notWrap[o.uuid]) return;
          var ok = D3Model.mats(o).map(function (m) {
            if (glassy(m)) return glass;
            if (paint) return body && m === M0.paint;
            return body && !(m.transparent && m.opacity < 0.9) && M0.rims.indexOf(m) < 0 && M0.cals.indexOf(m) < 0; // 没标车漆：玻璃、灯、车轮以外的都算
          });
          var g = o.geometry;
          if (Array.isArray(o.material) && g.groups.length) {
            var rg = g.groups.filter(function (q) { return ok[q.materialIndex]; }).map(function (q) { return [q.start, q.count]; });
            if (rg.length) out.push({ m: o, ranges: rg });
          } else if (ok[0]) out.push({ m: o, ranges: null });
        });
        return out;
      },
      /** 网格属于哪个会动的部件（门、盖的铰链组，车窗）；都不是就是车身 */
      owner: function (m) { for (var o = m; o && o !== R0; o = o.parent) if (o.userData.d3move) return o; return R0; },
      mat: function (p) { p.envMapIntensity = envK0; if (lp) p.defines = { D3_LOWP: '' }; return p; }
    };
  }
  /** 按配置贴贴纸（list 给了就换成它：调整车模里改了，不重建车）；贴好 resolve */
  page.wraps = function (list) {
    if (list) cfg.wraps = list;
    var r = root;
    if (!r || !modelObj || !cfg) return Promise.resolve();
    if (!(cfg.wraps && cfg.wraps.length) && !r.userData.wraps) { showWrapMark(); return Promise.resolve(); }
    return wrapLib().then(function () {
      if (root !== r || !scene) return;
      var s = r.userData.wraps || (r.userData.wraps = D3Wrap.session(wrapCtx()));
      return s.apply(cfg.wraps || []).then(function () { if (root === r && wkey === null) s.forget(); showWrapMark(); });
    });
  };
  page.wrapLib = wrapLib;
  /** 贴纸列表里的小图（贴图还没做好给 null） */
  page.wrapThumb = function (w, size) { var s = root && root.userData.wraps; return s && s.ctx && window.D3Wrap ? D3Wrap.thumb(w, s.ctx, size || 120) : null; };
  page.wrapStats = function () { var s = root && root.userData.wraps; return { meshes: s ? s.count() : 0, n: cfg && cfg.wraps ? cfg.wraps.length : 0 }; };
  /** 贴纸页里正在调哪张（自由摆放的显示小球、能拖；点车是放贴纸）；'' 是在贴纸页、没在调自由摆放的（收集的缓存留着，拖条纹的滑块不用每次重新收集）；null 是不在贴纸页 */
  page.wrapEdit = function (id) {
    wkey = id === undefined || id === null ? null : id;
    if (wkey === null && root && root.userData.wraps) root.userData.wraps.forget();
    showWrapMark();
  };
  function showWrapMark() {
    if (wmark) { if (wmark.parent) wmark.parent.remove(wmark); wmark.geometry.dispose(); wmark.material.dispose(); wmark = null; }
    var s = root && root.userData.wraps, c = wkey && s && s.center(wkey);
    if (c) {
      var kw = dims.hw / 1.02;
      wmark = new T.Mesh(new T.SphereGeometry(0.05 * kw, 18, 12), new T.MeshBasicMaterial({ color: 0xff7a00, depthTest: false, transparent: true, toneMapped: false }));
      wmark.renderOrder = 1000; wmark.raycast = function () {};
      wmark.position.copy(c);
      root.add(wmark);
    }
    if (app && root) app.invalidate();
  }
  /** 小球在屏幕上的位置（测试、引导用） */
  page.wrapAt = function () {
    if (!wmark || !camera) return null;
    var q = wmark.position.clone().applyMatrix4(root.matrixWorld).project(camera);
    return { x: Math.round((q.x + 1) / 2 * W), y: Math.round((1 - q.y) / 2 * H) };
  };
  function wrapHit(x, y) { var a = page.wrapAt(); return !!a && Math.hypot(a.x - x, a.y - y) < 36; }
  /** 一个方向离侧面、车头、车尾不到 35°（车身侧面常常是斜的：车门下沿往里收、上面往里倒）、离车顶不到 25° 就对齐过去（贴出来是正的，字不歪） */
  function snapDir(n) {
    var best = null;
    [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, 0, 1), V(0, 0, -1)].forEach(function (a) { if (n.dot(a) > Math.cos((a.y ? 25 : 35) * DEG) && (!best || n.dot(a) > n.dot(best))) best = a; });
    return best || n;
  }
  function r3(v) { return [Math.round(v.x * 1000) / 1000, Math.round(v.y * 1000) / 1000, Math.round(v.z * 1000) / 1000]; }
  /** 射线打到车身：位置和那个面朝外的方向（车的坐标） */
  function surfaceRay(o, d) {
    ray.set(o, d);
    var list = [];
    root.traverse(function (m) { if (m.isMesh && m.userData.car && inScene(m)) list.push(m); });
    var h = ray.intersectObjects(list, false).filter(function (x) { return !!x.face; })[0];
    if (!h) return null;
    var inv = new T.Matrix4().copy(root.matrixWorld).invert(), n = h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(inv);
    if (n.dot(d) > 0) n.negate(); // 背面（双面的零件）
    return { at: r3(h.point.clone().applyMatrix4(inv)), dir: r3(snapDir(n.normalize())) };
  }
  /** 屏幕上一点打到的车身 */
  function wrapPick(x, y) {
    ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera);
    return surfaceRay(ray.ray.origin.clone(), ray.ray.direction.clone());
  }
  page.wrapPick = function (x, y) { return root && camera ? wrapPick(x, y) : null; };
  /** 新加的图片 / 文字贴在哪：镜头正对的那一侧（侧面贴在车门中间、车头车尾贴在中间偏下） */
  page.wrapPlace = function () {
    if (!root) return null;
    var az = view.az, sx = Math.sin(az), cz = Math.cos(az), d, o;
    if (Math.abs(sx) >= Math.abs(cz)) { d = V(sx > 0 ? -1 : 1, 0, 0); o = V(sx > 0 ? dims.hw + 2 : -dims.hw - 2, dims.h * 0.45, 0); }
    else { d = V(0, 0, cz > 0 ? -1 : 1); o = V(0, dims.h * 0.42, cz > 0 ? dims.hl + 2 : -dims.hl - 2); }
    var h = null;
    page.atRest(function () { h = surfaceRay(o.applyMatrix4(root.matrixWorld), d.clone().transformDirection(root.matrixWorld)); });
    return h || { at: r3(o.clone().addScaledVector(d, 2)), dir: r3(d.clone().negate()) };
  };
  /** 快捷位置：左侧、右侧、引擎盖、车顶、尾门、车头、车尾——从那个方向打射线找表面（车门正中、引擎盖正中……） */
  page.wrapPlaceAt = function (where) {
    if (!root) return null;
    var d = dims, o, dv;
    if (where === 'left') { o = V(d.hw + 2, d.h * 0.45, 0); dv = V(-1, 0, 0); }
    else if (where === 'right') { o = V(-d.hw - 2, d.h * 0.45, 0); dv = V(1, 0, 0); }
    else if (where === 'hood') { o = V(0, d.h + 2, d.hl * 0.62); dv = V(0, -1, 0); }
    else if (where === 'roof') { o = V(0, d.h + 2, -d.hl * 0.08); dv = V(0, -1, 0); }
    else if (where === 'trunk') { o = V(0, d.h + 2, -d.hl * 0.82); dv = V(0, -1, 0); }
    else if (where === 'front') { o = V(0, d.h * 0.4, d.hl + 2); dv = V(0, 0, -1); }
    else { o = V(0, d.h * 0.45, -d.hl - 2); dv = V(0, 0, 1); }
    var h = null;
    page.atRest(function () { h = surfaceRay(o.clone().applyMatrix4(root.matrixWorld), dv.clone().transformDirection(root.matrixWorld)); });
    return h;
  };
  // 手绘线：贴纸页里"在车上画一条线"——按下时打一次射线看画在侧面还是车顶，之后手指投到那个平面上（不打射线：大车模一次几十毫秒），车上实时画一条橙线
  var wdraw = false, wline = null;
  page.wrapDraw = function (on) { wdraw = !!on; if (!on) dropLine(); };
  function dropLine() {
    if (wline && wline.mesh) { if (wline.mesh.parent) wline.mesh.parent.remove(wline.mesh); wline.mesh.geometry.dispose(); wline.mesh.material.dispose(); }
    wline = null;
    if (app && root) app.invalidate();
  }
  function lineAt(x, y) {
    ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera);
    var out = V(0, 0, 0);
    if (!ray.ray.intersectPlane(wline.plane, out)) return null;
    return out.applyMatrix4(new T.Matrix4().copy(root.matrixWorld).invert());
  }
  function lineStart(x, y) {
    var h = wrapPick(x, y);
    if (!h) return false;
    var top = h.dir[1] > 0.6, n = top ? V(0, 1, 0) : V(h.at[0] >= 0 ? 1 : -1, 0, 0), p0 = V(h.at[0], h.at[1], h.at[2]);
    wline = { top: top, side: h.at[0] >= 0 ? 'L' : 'R', plane: new T.Plane().setFromNormalAndCoplanarPoint(n.clone().transformDirection(root.matrixWorld), p0.clone().applyMatrix4(root.matrixWorld)), pts: [], sx: x, sy: y, lx: -1e9, ly: -1e9 };
    wline.mesh = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xff7a00, depthTest: false, transparent: true, toneMapped: false }));
    wline.mesh.renderOrder = 1000; wline.mesh.raycast = function () {};
    root.add(wline.mesh);
    lineMove(x, y);
    return true;
  }
  function lineMove(x, y) {
    if (Math.hypot(x - wline.lx, y - wline.ly) < 4 || wline.pts.length >= 400) return;
    var p = lineAt(x, y);
    if (!p) return;
    wline.lx = x; wline.ly = y;
    wline.pts.push(p);
    wline.mesh.geometry.dispose();
    wline.mesh.geometry = new T.BufferGeometry().setFromPoints(wline.pts.map(function (q) { return q.clone().add(wline.top ? V(0, 0.01, 0) : V(wline.side === 'L' ? 0.01 : -0.01, 0, 0)); }));
    app.invalidate();
  }
  /** 画完：点换成拉花画布上的位置（侧面：从车头往后、从车顶往下；车顶：从车的左边往右、从车头往后，都按 0～1），抽稀后交给贴纸页 */
  function lineDone() {
    var l = wline, d = dims, r4 = function (v) { return Math.round(v * 1e4) / 1e4; }, pts = l.pts.map(function (q) { return l.top ? [r4((d.hw - q.x) / (2 * d.hw)), r4((d.hl - q.z) / (2 * d.hl))] : [r4((d.hl - q.z) / (2 * d.hl)), r4((d.h - q.y) / d.h)]; });
    dropLine();
    if (pts.length < 2) return;
    var keep = [pts[0]]; // 抽稀：离上一个留下的点不到 0.4% 的不要
    pts.forEach(function (q) { var a = keep[keep.length - 1]; if (Math.hypot(q[0] - a[0], q[1] - a[1]) > 0.004) keep.push(q); });
    if (keep.length < 2) keep.push(pts[pts.length - 1]);
    if (window.D3Tune) D3Tune.wrapDrawn({ path: keep.slice(0, 200), pf: l.top ? 'top' : 'side', side: l.side });
  }
  /** 拖小球：在过它、垂直于贴纸方向的平面上跟着手指走（侧着看平面时换成朝着镜头的平面）；每帧最多切一次 */
  function wrapMove(x, y) {
    ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera);
    var n = V(wdrag.w.dir[0], wdrag.w.dir[1], wdrag.w.dir[2]).transformDirection(root.matrixWorld), p = wdrag.p.clone().applyMatrix4(root.matrixWorld), out = V(0, 0, 0);
    if (Math.abs(n.dot(ray.ray.direction)) < 0.25) n = camera.getWorldDirection(V(0, 0, 0));
    if (!ray.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(n, p), out)) return;
    out.applyMatrix4(new T.Matrix4().copy(root.matrixWorld).invert());
    wdrag.w.at = r3(out);
    if (wRaf) return;
    wRaf = requestAnimationFrame(function () {
      wRaf = 0;
      var s = root && root.userData.wraps;
      if (!wdrag || !s) return;
      s.one(wdrag.w, wdrag.i);
      showWrapMark();
    });
  }
  /** 松手：中心贴回车身表面（沿贴纸方向打一条射线），交给调整车模存起来 */
  function wrapDone() {
    var w = wdrag.w, n = V(w.dir[0], w.dir[1], w.dir[2]), c = V(w.at[0], w.at[1], w.at[2]), h = null;
    page.atRest(function () { h = surfaceRay(c.clone().addScaledVector(n, 1.5).applyMatrix4(root.matrixWorld), n.clone().negate().transformDirection(root.matrixWorld)); });
    if (h && c.distanceTo(V(h.at[0], h.at[1], h.at[2])) < 0.5) w.at = h.at;
    if (window.D3Tune) D3Tune.wrapped(w.id, w.at);
  }
  /** 灯的颜色（sRGB，0～1）：给了 hex 用给的，不然配置里的，没有用默认的 */
  function lampRgb(r, hx) {
    var h = hx || (cfg && cfg.lights && cfg.lights[r] && cfg.lights[r].color) || LIGHT_COLOR[r];
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  }
  /** 灯的效果按配置（转向灯默认闪烁，别的常亮） */
  function lightFx() {
    LIGHTS.forEach(function (r) { var l = cfg && cfg.lights && cfg.lights[r]; M.fx[r] = (l && l.effect) || (r === 'turnL' || r === 'turnR' ? 'blink' : 'steady'); });
  }
  // 点亮层的着色（贴图的四个通道见 carlamp.js）。颜色同参考项目，在 sRGB 里算：灯色 × 灯罩纹理明暗 → 越往里越往白里推（热白中心）→ 亮度超过 100% 整体再提白；
  // 边缘按离边缘的深度柔化，最后转线性输出。不做色调映射：夜景压低曝光时灯照样亮。
  // uFlow / uAx：流水（按世界坐标 x 从里往外，进度以内的才亮）；uBorrow + uTurn：借灯打转向，这一角闪橙色（x 正是左、z 正是车头）
  var LAMP_VS = 'varying vec2 vUv;\nvarying float vX;\nvarying float vZ;\nvoid main() {\n  vUv = uv;\n  vec4 w = modelMatrix * vec4(position, 1.0);\n  vX = w.x; vZ = w.z;\n  gl_Position = projectionMatrix * viewMatrix * w;\n}';
  var LAMP_FS = [
    'uniform sampler2D tMap;', 'uniform vec3 uTint;', 'uniform vec3 uTurnCol;', 'uniform float uOn;', 'uniform vec4 uGlow;', 'uniform float uFlow;', 'uniform vec2 uAx;', 'uniform vec4 uTurn;', 'uniform float uBorrow;', 'uniform vec2 uMute;',
    'varying vec2 vUv;', 'varying float vX;', 'varying float vZ;',
    'void main() {',
    '  vec4 t = texture2D(tMap, vUv);',
    '  vec3 base = uTint * (1.0 - uGlow.z + uGlow.z * (0.3 + 0.7 * t.r));',
    '  vec3 lit = base + (1.0 - base) * uGlow.y * pow(clamp(t.g / 0.9, 0.0, 1.0), 1.4);',
    '  vec3 col = lit + (1.0 - lit) * max(0.0, uGlow.x - 1.0) * 0.6;',
    '  float shape = clamp(uGlow.x, 0.0, 1.0) * t.a;',
    '  if (uGlow.w > 0.0) shape *= smoothstep(0.0, uGlow.w * 0.4 + t.b, t.g);',
    '  float m = step(clamp((vX - uAx.x) / (uAx.y - uAx.x + 1e-5), 0.0, 1.0), uFlow);',
    '  float tq = uBorrow * (vZ > 0.0 ? (vX > 0.0 ? uTurn.x : uTurn.y) : (vX > 0.0 ? uTurn.z : uTurn.w));',
    '  float a = mix(shape * uOn * m, shape, tq) * (1.0 - (vX > 0.0 ? uMute.x : uMute.y));',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(pow(mix(col, uTurnCol, tq), vec3(2.2)), a);',
    '  #include <encodings_fragment>',
    '}'].join('\n');
  function lampMat(u) {
    return new T.ShaderMaterial({ uniforms: u, vertexShader: LAMP_VS, fragmentShader: LAMP_FS, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  }
  function dataTex(d, w, h) {
    var t = new T.DataTexture(d, w, h, T.RGBAFormat);
    t.magFilter = t.minFilter = T.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }
  /** 这台车的灯。ents：每种灯有哪些零件（{ o 网格, i 第几个材质（-1 整个网格）, z 氛围灯前排 F / 后排 R }）。
     点亮层按需建：第一次要亮的时候才烘贴图、建网格（挂在原零件下面，车门、尾门开合时跟着走；点不到、不挡射线）；
     路面光束也是要照的时候才建，参数变了重画贴图。fbQ：借灯打转向时哪几个角能借 */
  function makeLamps(ents) {
    var ov = {}, B = {}, bc = {}, own = [], imgs = {}, xsC = {}, R0 = root, carL = 2 * dims.hl;
    var off = Math.min(0.004, Math.max(0.001, carL * 0.0004)); // 点亮层沿法线往外挪 1～4 毫米：不穿进灯罩，也不悬空
    // 一个零件占了哪几个角：车头 / 车尾按中心在车长前后各 25% 以内算（后视镜上的转向灯在车身中段，不算），跨过中线的左右都算
    var quadsOf = function (o) {
      var b = D3Model.box(o), cz = (b.min.z + b.max.z) / 2, e = cz > 0.5 * dims.hl ? 'F' : cz < -0.5 * dims.hl ? 'B' : '', q = [];
      if (!e) return q;
      if (b.max.x > 0.02 * dims.hw) q.push('L' + e);
      if (b.min.x < -0.02 * dims.hw) q.push('R' + e);
      return q;
    };
    var hasTurn = {}, hasFb = {}, fbQ = {}, ax = {};
    ents.turnL.concat(ents.turnR).forEach(function (e) { quadsOf(e.o).forEach(function (q) { hasTurn[q] = 1; }); });
    TURN_FB.forEach(function (r) { ents[r].forEach(function (e) { quadsOf(e.o).forEach(function (q) { hasFb[q] = 1; }); }); });
    QUADS.forEach(function (q) { if (!hasTurn[q] && hasFb[q]) fbQ[q] = 1; });
    // 流水转向灯：从里往外亮的范围（左边 x 从小到大、右边从大到小）
    SIDES.forEach(function (sd) {
      var b = new T.Box3();
      ents['turn' + sd].forEach(function (e) { b.union(D3Model.box(e.o)); });
      if (!b.isEmpty()) ax['turn' + sd] = sd === 'L' ? [b.min.x, b.max.x] : [b.max.x, b.min.x];
    });
    /** 原灯罩贴图的像素（缩到 256 以内，算纹理明暗用）；读不出来返回 null */
    function imgOf(t) {
      if (!t || !t.image) return null;
      if (imgs[t.uuid] !== undefined) return imgs[t.uuid];
      var im = t.image, w = im.width, h = im.height, r = null;
      try {
        if (w && h && !im.data) {
          var k = Math.min(1, 256 / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k)), c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          var cx = c.getContext('2d');
          cx.drawImage(im, 0, 0, cw, ch);
          r = { w: cw, h: ch, d: cx.getImageData(0, 0, cw, ch).data };
        }
      } catch (er) { r = null; }
      return (imgs[t.uuid] = r);
    }
    /** 一块灯罩：用到的三角形（多材质的网格只取那个材质的），投影到它朝向的平面（按三角形面积加权的法线协方差取主方向，壳的正反两面算同一个方向），
       点亮层的几何（原零件自己的坐标，沿法线往外挪一点） */
    function pieceOf(e) {
      var o = e.o, g = o.geometry, pos = g && g.attributes.position;
      if (!pos) return null;
      o.updateWorldMatrix(true, false);
      var ix = g.index, total = ix ? ix.count : pos.count, tri = [];
      var add = function (s0, n) { for (var k = s0; k < Math.min(total, s0 + n); k++) tri.push(ix ? ix.getX(k) : k); };
      if (e.i >= 0 && g.groups.length) g.groups.forEach(function (q) { if (q.materialIndex === e.i) add(q.start, q.count); });
      else add(0, total);
      tri.length -= tri.length % 3;
      if (!tri.length) return null;
      var map = new Int32Array(pos.count), used = [], idx = new Uint32Array(tri.length), k, i;
      for (k = 0; k < map.length; k++) map[k] = -1;
      for (k = 0; k < tri.length; k++) { var v = tri[k]; if (map[v] < 0) { map[v] = used.length; used.push(v); } idx[k] = map[v]; }
      var n = used.length, mw = o.matrixWorld, wp = new Float32Array(n * 3), lp = new Float32Array(n * 3), v3 = new T.Vector3();
      for (i = 0; i < n; i++) {
        v3.fromBufferAttribute(pos, used[i]);
        lp[i * 3] = v3.x; lp[i * 3 + 1] = v3.y; lp[i * 3 + 2] = v3.z;
        v3.applyMatrix4(mw);
        wp[i * 3] = v3.x; wp[i * 3 + 1] = v3.y; wp[i * 3 + 2] = v3.z;
      }
      // 法线：有就用（原零件自己的坐标），没有按面算
      var nl = new Float32Array(n * 3), na = g.attributes.normal, C = [0, 0, 0, 0, 0, 0];
      if (na) for (i = 0; i < n; i++) { nl[i * 3] = na.getX(used[i]); nl[i * 3 + 1] = na.getY(used[i]); nl[i * 3 + 2] = na.getZ(used[i]); }
      for (k = 0; k < idx.length; k += 3) {
        var a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
        var ux = wp[b] - wp[a], uy = wp[b + 1] - wp[a + 1], uz = wp[b + 2] - wp[a + 2], vx = wp[c] - wp[a], vy = wp[c + 1] - wp[a + 1], vz = wp[c + 2] - wp[a + 2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-12) continue;
        var w = len / 2; nx /= len; ny /= len; nz /= len;
        C[0] += w * nx * nx; C[1] += w * nx * ny; C[2] += w * nx * nz; C[3] += w * ny * ny; C[4] += w * ny * nz; C[5] += w * nz * nz;
        if (!na) {
          var lx = lp[idx[k + 1] * 3] - lp[a], ly = lp[idx[k + 1] * 3 + 1] - lp[a + 1], lz = lp[idx[k + 1] * 3 + 2] - lp[a + 2];
          var mx = lp[c] - lp[a], my = lp[c + 1] - lp[a + 1], mz = lp[c + 2] - lp[a + 2], fx = ly * mz - lz * my, fy = lz * mx - lx * mz, fz = lx * my - ly * mx;
          [a, b, c].forEach(function (q) { nl[q] += fx; nl[q + 1] += fy; nl[q + 2] += fz; });
        }
      }
      // 主方向：幂迭代（从对角线最大的那一轴出发）
      var d = [C[0], C[3], C[5]], ex = new T.Vector3(d[0] >= d[1] && d[0] >= d[2] ? 1 : 0, d[1] > d[0] && d[1] >= d[2] ? 1 : 0, d[2] > d[0] && d[2] > d[1] ? 1 : 0);
      for (k = 0; k < 24; k++) {
        var x = C[0] * ex.x + C[1] * ex.y + C[2] * ex.z, y = C[1] * ex.x + C[3] * ex.y + C[4] * ex.z, z = C[2] * ex.x + C[4] * ex.y + C[5] * ex.z;
        if (x * x + y * y + z * z < 1e-24) break;
        ex.set(x, y, z).normalize();
      }
      if (ex.lengthSq() < 0.5) ex.set(0, 0, 1);
      var e1 = new T.Vector3().crossVectors(Math.abs(ex.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0), ex).normalize(), e2 = new T.Vector3().crossVectors(ex, e1);
      var p2 = new Float32Array(n * 2), offL = off / Math.max(1e-6, mw.getMaxScaleOnAxis()), op = new Float32Array(n * 3);
      for (i = 0; i < n; i++) {
        var X = wp[i * 3], Y = wp[i * 3 + 1], Z = wp[i * 3 + 2];
        p2[i * 2] = X * e1.x + Y * e1.y + Z * e1.z; p2[i * 2 + 1] = X * e2.x + Y * e2.y + Z * e2.z;
        var qx = nl[i * 3], qy = nl[i * 3 + 1], qz = nl[i * 3 + 2], ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
        op[i * 3] = lp[i * 3] + qx / ql * offL; op[i * 3 + 1] = lp[i * 3 + 1] + qy / ql * offL; op[i * 3 + 2] = lp[i * 3 + 2] + qz / ql * offL;
      }
      var ua = g.attributes.uv, suv = null;
      if (ua) { suv = new Float32Array(n * 2); for (i = 0; i < n; i++) { suv[i * 2] = ua.getX(used[i]); suv[i * 2 + 1] = ua.getY(used[i]); } }
      var mat = Array.isArray(o.material) ? o.material[e.i >= 0 ? e.i : 0] : o.material, img = imgOf(mat && (mat.emissiveMap || mat.map));
      var base = mat && mat.color ? mat.color.clone().convertLinearToSRGB().toArray() : [1, 1, 1];
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(op, 3));
      geo.setIndex(new T.BufferAttribute(n < 65536 ? new Uint16Array(idx) : idx, 1));
      return { o: o, z: e.z || '', geo: geo, bake: { p: p2, i: idx, uv: suv, img: img, base: base } };
    }
    /** 建一种灯的点亮层：一张贴图，按前排 / 后排分材质（氛围灯只开一排时另一排不亮），别的都共用 */
    function build(r) {
      var pcs = [];
      ents[r].forEach(function (e) { try { var pc = pieceOf(e); if (pc) pcs.push(pc); } catch (er) { console.error('灯罩的形状没算出来', er); } });
      if (!pcs.length) return null;
      var art;
      try { art = D3Lamp.bake(pcs.map(function (pc) { return pc.bake; })); } catch (er) { console.error('灯的点亮层没做成', er); pcs.forEach(function (pc) { pc.geo.dispose(); }); return null; }
      var tc = lampRgb(r === 'turnR' ? 'turnR' : 'turnL', LIGHT_COLOR.turnL), u = {
        tMap: { value: dataTex(art.data, art.w, art.h) }, uTint: { value: new T.Vector3(1, 1, 1) }, uTurnCol: { value: new T.Vector3(tc[0], tc[1], tc[2]) }, uOn: { value: 0 },
        uGlow: { value: new T.Vector4(1, 0.45, 0.6, 0.3) }, uFlow: { value: 1 }, uAx: { value: new T.Vector2(0, 1) }, uTurn: turnU, uBorrow: { value: 0 }, uMute: { value: new T.Vector2(0, 0) }
      };
      own.push(u.tMap.value);
      if (ax[r]) u.uAx.value.set(ax[r][0], ax[r][1]);
      var mats = {}, list = [];
      pcs.forEach(function (pc, i) {
        if (!mats[pc.z]) { var zu = {}; for (var k in u) zu[k] = u[k]; zu.uOn = { value: 0 }; mats[pc.z] = lampMat(zu); own.push(mats[pc.z]); }
        pc.geo.setAttribute('uv', new T.BufferAttribute(art.uvs[i], 2));
        var m = new T.Mesh(pc.geo, mats[pc.z]);
        m.raycast = function () {}; m.renderOrder = 2; m.visible = false; m.userData.d3ov = 1; m.userData.z = pc.z; m.userData.src = pc.o.uuid; m.layers.set(1);
        pc.o.add(m);
        own.push(pc.geo);
        list.push(m);
      });
      return { u: u, mats: mats, meshes: list };
    }
    /** 这种灯的零件在车上的横向坐标（取样，算光斑在哪） */
    function xsOf(r) {
      if (xsC[r]) return xsC[r];
      var xs = [], v = new T.Vector3();
      ents[r].forEach(function (e) {
        var pos = e.o.geometry && e.o.geometry.attributes.position;
        if (!pos) return;
        e.o.updateWorldMatrix(true, false);
        for (var i = 0, st = Math.max(1, Math.floor(pos.count / 400)); i < pos.count; i += st) { v.fromBufferAttribute(pos, i).applyMatrix4(e.o.matrixWorld); xs.push(v.x); }
      });
      return (xsC[r] = xs);
    }
    /** 路面光束：a 淡入淡出（0 收起来）。四边形贴地（离地高度按配置），近的那头离保险杠"起点前后"那么远；参数变了重画（强度、颜色不用重画） */
    function beam(slot, a) {
      var d = D3Lamp.BEAMS[slot], r = d.role, x = B[slot];
      if (a <= 0.01 || !ents[r].length) { if (x) x.mesh.visible = false; return; }
      var L = (cfg && cfg.lights && cfg.lights[r]) || {}, b = D3Lamp.beam(slot, L[d.key]);
      if (!b.enabled) { if (x) x.mesh.visible = false; return; }
      var wid = 2 * dims.hw, len = 2 * dims.hl, hwB = b.width * wid / 2, cx = b.side * wid, lb = D3Lamp.lobes(xsOf(r), cx, hwB, wid, b);
      var key = [b.shape, b.lobeMode, b.lobeSpacing, b.lobeWidth, b.length, b.width, b.offset, b.side, b.height, b.spread, b.falloff, b.haze, lb.join('/')].join();
      if (!x || x.key !== key) {
        if (x) { R0.remove(x.mesh); x.mesh.geometry.dispose(); if (x.mesh.material.map) x.mesh.material.map.dispose(); x.mesh.material.dispose(); }
        var near = b.dir * (dims.hl + b.offset * len), far = near + b.dir * b.length * len, y = Math.max(0.004, b.height), g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(new Float32Array([cx + hwB, y, near, cx - hwB, y, near, cx - hwB, y, far, cx + hwB, y, far]), 3));
        g.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2)); // u = 0 在左边（+x），v = 1 贴着车
        g.setIndex([0, 1, 2, 0, 2, 3]);
        var tx = D3Lamp.beamTex(b, lb), mesh = new T.Mesh(g, new T.MeshBasicMaterial({ map: dataTex(tx.data, tx.w, tx.h), transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
        mesh.renderOrder = 1; mesh.raycast = function () {}; mesh.layers.set(1);
        R0.add(mesh);
        x = B[slot] = { mesh: mesh, key: key };
      }
      // 光束颜色：自己定了用自己的，不然跟着灯色（往白里收一点，同参考项目）
      var rgb = b.color ? lampRgb(r, b.color) : lampRgb(r);
      x.mesh.material.color.setRGB(1 - 0.4 * (1 - rgb[0]), 1 - 0.4 * (1 - rgb[1]), 1 - 0.4 * (1 - rgb[2]), T.SRGBColorSpace || 'srgb');
      x.mesh.material.opacity = a * b.intensity;
      x.mesh.visible = true;
    }
    return {
      fbQ: fbQ, bc: bc,
      has: function (r) { return ents[r].length > 0; },
      /** 这种灯在哪些零件上（零件的 uuid） */
      srcs: function (r) { return ents[r].map(function (e) { return e.o.uuid; }); },
      built: function (r) { return ov[r] !== undefined; },
      get: function (r) { if (ov[r] === undefined) ov[r] = ents[r].length ? build(r) : null; return ov[r]; },
      beam: beam,
      /** 测试、走查用：亮着的灯、氛围灯每一排（排:亮度:颜色）、亮着的光束 */
      lit: function () { return LIGHTS.filter(function (r) { return ov[r] && ov[r].meshes.some(function (m) { return m.visible; }); }).join(','); },
      amb: function () {
        var o = ov.ambient;
        if (!o) return '';
        var t = o.u.uTint.value, hx = [t.x, t.y, t.z].map(function (v) { return ('0' + Math.round(v * 255).toString(16)).slice(-2); }).join('');
        return Object.keys(o.mats).sort().map(function (z) { return (z || '-') + ':' + Math.round(o.mats[z].uniforms.uOn.value * 100) / 100 + ':' + hx; }).join(' ');
      },
      beams: function () { return Object.keys(B).filter(function (k) { return B[k].mesh.visible; }).join(','); },
      /** 预先做好一道光束（贴图、四边形），先藏着；返回 true：做了（或者这道光束用不上） */
      warmBeam: function (slot) { var x = B[slot]; beam(slot, 1); if (B[slot]) B[slot].mesh.visible = !!(x && x.mesh.visible); return true; },
      mesh: function (slot) { return B[slot] && B[slot].mesh.visible ? B[slot].mesh : null; },
      dispose: function () {
        LIGHTS.forEach(function (r) { if (ov[r]) ov[r].meshes.forEach(function (m) { if (m.parent) m.parent.remove(m); }); });
        Object.keys(B).forEach(function (k) { var m = B[k].mesh; if (m.parent) m.parent.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); });
        own.forEach(function (x) { x.dispose(); });
        ov = {}; B = {}; own = [];
      }
    };
  }
  /** 门 / 盖：配置写死了铰链就用；不然按门型和部件外框算（常规门前缘竖轴往外开、对开门后缘、蝴蝶门前上沿斜轴、剪刀门前缘横轴、鸥翼门车顶纵轴；
     引擎盖后缘、尾门前上缘横轴往上掀；other = 铰链换到另一头） */
  function door(k, ms, p, P) {
    var sign = p.flip ? -1 : 1, b = new T.Box3();
    ms.forEach(function (m) { b.expandByObject(m); });
    var side = b.min.x + b.max.x > 0 ? 1 : -1, outer = side > 0 ? b.max.x : b.min.x, inner = side > 0 ? b.min.x : b.max.x;
    if (p.at && p.axis) return moved(hinge(ms, moveAt(P(p.at), p, b, k === 'hood' || k === 'trunk' ? 1 : side), V(p.axis[0], p.axis[1], p.axis[2]).normalize(), (p.angle || 60) * DEG * sign), P(p.at), b, side);
    var midY = (b.min.y + b.max.y) / 2, midZ = (b.min.z + b.max.z) / 2, st = p.style || 'normal', at, axis, ang, dir = 'up';
    if (k === 'hood' || k === 'trunk') {
      var z = (k === 'hood') !== !!p.other ? b.min.z : b.max.z;
      at = V(0, b.max.y, z); axis = V(1, 0, 0); ang = k === 'hood' ? 55 : 50;
    } else if (st === 'butterfly') { at = V(inner + (outer - inner) * 0.15, b.min.y + (b.max.y - b.min.y) * 0.85, b.max.z - (b.max.z - b.min.z) * 0.12); axis = V(-0.32 * side, 0.5, -0.8); ang = 66; }
    else if (st === 'scissor') { at = V(outer, b.min.y + (b.max.y - b.min.y) * 0.4, b.max.z); axis = V(1, 0, 0); ang = 75; }
    else if (st === 'gull') { at = V(inner, b.max.y, midZ); axis = V(0, 0, 1); ang = 75; }
    else { at = V(outer, midY, st === 'rear' ? b.min.z : b.max.z); axis = V(0, 1, 0); ang = k === 'chargePort' ? 95 : 60; dir = 'out'; }
    var sd = k === 'hood' || k === 'trunk' ? 1 : side;
    return moved(hinge(ms, moveAt(at.clone(), p, b, sd), axis.normalize(), (p.angle || ang) * DEG * sign, dir), at, b, sd);
  }
  /** 铰链位置按设置挪：piv = [里外, 上下, 前后]，按部件外框的长宽高算比例（改车长、换朝向后不错位）；side 1 左边（往外是 +x）/ -1 右边 */
  function moveAt(at, p, b, side) {
    if (!p.piv) return at;
    var sz = b.getSize(V(0, 0, 0));
    return at.add(V(p.piv[0] * sz.x * side, p.piv[1] * sz.y, p.piv[2] * sz.z));
  }
  /** 记下自动算的铰链位置、外框（拖中心点时按它算回 piv） */
  function moved(h, base, b, side) { h.base = base; h.size = b.getSize(V(0, 0, 0)); h.side = side; return h; }

  /** 天窗、遮阳帘：往后滑（抬高一点免得和车顶打架，滑出自己长度的 travel 倍，默认 0.85）；mode 'tilt'：后缘为轴、前缘翘起 */
  function slider(k, ms, p) {
    var b = new T.Box3();
    ms.forEach(function (m) { b.expandByObject(m); });
    if (p.mode === 'tilt') return moved(hinge(ms, moveAt(V(0, b.max.y, b.min.z), p, b, 1), V(1, 0, 0), (p.angle || 7) * DEG * (p.flip ? -1 : 1), 'up'), V(0, b.max.y, b.min.z), b, 1);
    var pivot = new T.Group();
    pivot.userData.d3move = 1;
    root.add(pivot);
    root.updateMatrixWorld(true);
    ms.forEach(function (m) { pivot.attach(m); });
    return { pivot: pivot, slide:V(0, (b.max.y - b.min.y) * 0.15 + 0.004, -(b.max.z - b.min.z) * (p.travel || 0.85)), meshes: ms };
  }
  /** 部件绕铰链转：pivot 放在铰链点，部件挂上去（世界位置不变），转 angle × 开度；dir：往哪边转算"打开"（up 往上掀，out 往外开） */
  function hinge(meshes, at, axis, angle, dir) {
    var pivot = new T.Group();
    pivot.userData.d3move = 1; // 会动的部件：贴纸贴在上面的那块挂在这下面
    pivot.position.copy(at);
    root.add(pivot);
    root.updateMatrixWorld(true);
    meshes.forEach(function (m) { pivot.attach(m); });
    // 往哪边转是"往上掀"：试一下两个方向，取部件中心更高的那个
    var bb = new T.Box3();
    meshes.forEach(function (m) { bb.expandByObject(m); });
    var c = bb.getCenter(V(0, 0, 0)).sub(at), a = c.clone().applyAxisAngle(axis, 0.5), b = c.clone().applyAxisAngle(axis, -0.5);
    var up = dir === 'out' ? (Math.abs(a.x + at.x) > Math.abs(b.x + at.x) ? 1 : -1) : a.y > b.y ? 1 : -1;
    return { pivot: pivot, axis: axis, angle: angle * up, meshes: meshes };
  }
  /** 左右两边车窗在同一个网格里：按三角形在车的哪一边拆成两个，好分别挂到车门上 */
  function splitX(mesh) {
    var g = mesh.geometry, pos = g.attributes.position, idx = g.index.array, mw = mesh.matrixWorld, out = {}, v = V(0, 0, 0);
    var sides = { L: [], R: [] };
    for (var i = 0; i < idx.length; i += 3) {
      v.set(0, 0, 0);
      for (var j = 0; j < 3; j++) v.x += pos.getX(idx[i + j]) / 3, v.y += pos.getY(idx[i + j]) / 3, v.z += pos.getZ(idx[i + j]) / 3;
      v.applyMatrix4(mw);
      sides[v.x > 0 ? 'L' : 'R'].push(idx[i], idx[i + 1], idx[i + 2]);
    }
    SIDES.forEach(function (s) {
      var gg = g.clone();
      gg.setIndex(sides[s]);
      var m = new T.Mesh(gg, mesh.material);
      m.userData.car = 1;
      mesh.parent.add(m);
      m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
      m.updateMatrixWorld(true);
      out[s] = m;
    });
    mesh.parent.remove(mesh);
    g.dispose();
    return out;
  }
  /** 车底柔和的接触阴影：车身投影一块 + 四个轮子压地的深色 + 外面一圈很淡的（尺寸按车的大小和轮位，W70 的数是原来调好的） */
  function shadow(WP) {
    var kx = dims.hw / 1.02, kz = dims.hl / 2.3, kr = wheelR / 0.345;
    var sw = 4.6 * kx, sl = 7.6 * kz; // 比画的影子大一圈，模糊边缘不会被平面边界切直
    var tex = app.canvasTex(184, Math.round(184 * sl / sw), function (c, w, h) {
      var sx = w / sw, sz = h / sl;
      c.filter = 'blur(' + Math.round(w * 0.09) + 'px)';
      c.fillStyle = 'rgba(0,0,0,.18)';
      ell(c, w / 2, h / 2, 1.5 * kx * sx, 2.75 * kz * sz);
      c.filter = 'blur(' + Math.round(w * 0.045) + 'px)';
      c.fillStyle = 'rgba(0,0,0,.42)';
      rr(c, w / 2 - 0.95 * kx * sx, h / 2 - 2.2 * kz * sz, 1.9 * kx * sx, 4.4 * kz * sz, 0.45 * kx * sx);
      c.filter = 'blur(' + Math.round(w * 0.02) + 'px)';
      c.fillStyle = 'rgba(0,0,0,.55)';
      TYRES.forEach(function (t) { ell(c, w / 2 + WP[t].x * sx, h / 2 - WP[t].z * sz, 0.16 * kr * sx, 0.36 * kr * sz); });
    }, false);
    var m = new T.Mesh(new T.PlaneGeometry(sw, sl), new T.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.002;
    return m;
  }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill();
  }
  /** 车漆着色：金属漆的闪点（清漆下面一颗颗约 6 毫米的小片，每片粗糙度不一样，高光里这里那里闪一下；只改粗糙度、不动法线——动法线的话白车的底色也跟着花，像撒了沙子）、
      清漆的橘皮纹（清漆表面很缓的起伏，反射边缘有点波纹）。闪点只在凑近看时显示（一片在屏幕上不到 1.5 个像素时就是噪点，按镜头远近每帧算 M.fx.flake）。
      按世界坐标算，不靠贴图坐标（导入的车模不一定有、密度也不一样）；强弱是 uniform（换质感时渐变，不重新编译） */
  var NOISE = 'vec3 d3h3(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx) - 0.5; }\n' +
    'float d3h(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }\n' +
    'float d3n(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);\n' +
    '  return mix(mix(mix(d3h(i), d3h(i + vec3(1.0, 0.0, 0.0)), f.x), mix(d3h(i + vec3(0.0, 1.0, 0.0)), d3h(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),\n' +
    '    mix(mix(d3h(i + vec3(0.0, 0.0, 1.0)), d3h(i + vec3(1.0, 0.0, 1.0)), f.x), mix(d3h(i + vec3(0.0, 1.0, 1.0)), d3h(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }\n';
  function paintFx(m) {
    M.fx.flake = { value: 0 }; M.fx.peel = { value: 0 }; M.fx.fb = 0; // fb：这个质感的闪点强度，乘上凑近的程度才是 flake
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uD3Flake = M.fx.flake; sh.uniforms.uD3Peel = M.fx.peel;
      sh.vertexShader = 'varying vec3 vD3P;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vD3P = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uD3Flake;\nuniform float uD3Peel;\nvarying vec3 vD3P;\n' + NOISE + sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  if (uD3Flake > 0.0) roughnessFactor = clamp(roughnessFactor * (1.0 + uD3Flake * 9.0 * d3h3(floor(vD3P * 160.0)).x), 0.04, 1.0);')
        .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\n  if (uD3Peel > 0.0) clearcoatNormal = normalize(clearcoatNormal + uD3Peel * vec3(d3n(vD3P * 70.0) - 0.5, d3n(vD3P * 70.0 + 13.1) - 0.5, 0.0));\n#endif');
    };
    m.customProgramCacheKey = function () { return 'd3paint'; };
  }
  /** 车上的标准材质光照按中精度算（main.js 的 D3_LOWP，车机上显卡时间少约四分之一；画质高 / 极致不用）。只用在标准打光的车模上（没有主光，只有环境光）：
      车机上逐像素比过，海豹 06 各个角度、拉近、深浅色都看不出差别；默认车模 W70 有主光照着亮面车漆，中精度下那道又细又亮的高光线会变暗变短，所以 W70 不用 */
  function lowp(r) {
    r.traverse(function (o) {
      if (o.isMesh) [].concat(o.material).forEach(function (m) {
        if (!m || !m.isMeshStandardMaterial || (m.defines && 'D3_LOWP' in m.defines)) return;
        m.defines = m.defines || {};
        m.defines.D3_LOWP = '';
        m.needsUpdate = true;
      });
    });
  }
  /** 地面反射（画质高）：车下面一块镜面，按离车中心的距离渐隐，像展厅抛光的地面；一帧只画一次。
     反射按画面的实际分辨率画（半分辨率放大后发糊、一块块的），能多重采样就抗锯齿；取样是 4 个斜角各差半个像素（双线性下就是 3×3 的平滑核）——
     以前是中心加上下左右各隔 1.5 个像素，车窗框、座椅上的一个亮点被复制成一个"十"字。Reflector 画反射时关掉了色调映射，在这里补上，和车身一样 */
  function mirror() {
    var R = Math.max(dims.hl, dims.hw) + 1.2, sz = reflSize(), sp = app.rtSpec();
    refl = new T.Reflector(new T.PlaneGeometry(R * 2, R * 2), {
      textureWidth: sz.x, textureHeight: sz.y, clipBias: 0.003, multisample: sp.samples,
      type: sp.type,
      shader: {
        uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uK: { value: 0.2 }, uR: { value: R }, uPx: { value: new T.Vector2(0.5 / sz.x, 0.5 / sz.y) } },
        vertexShader: 'uniform mat4 textureMatrix;\nvarying vec4 vUv;\nvarying vec2 vP;\nvoid main() { vUv = textureMatrix * vec4(position, 1.0); vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse;\nuniform float uK;\nuniform float uR;\nuniform vec2 uPx;\nvarying vec4 vUv;\nvarying vec2 vP;\nvoid main() {\n' +
          '  vec2 uv = vUv.xy / vUv.w, o = uPx;\n' +
          '  vec4 c = (texture2D(tDiffuse, uv + o) + texture2D(tDiffuse, uv - o) + texture2D(tDiffuse, uv + vec2(o.x, -o.y)) + texture2D(tDiffuse, uv + vec2(-o.x, o.y))) * 0.25;\n' +
          '  gl_FragColor = vec4(c.rgb / max(c.a, 1e-4), c.a * uK * (1.0 - smoothstep(0.25, 0.8, length(vP) / uR)));\n  #include <tonemapping_fragment>\n  #include <encodings_fragment>\n}'
      }
    });
    refl.material.transparent = true; refl.material.depthWrite = false; // 输出不预乘的颜色（预乘后再转 sRGB，暗处颜色比透明度大，透明画布合成出黑块）
    refl.rotation.x = -Math.PI / 2; refl.renderOrder = -3;
    refl.camera.layers.enable(1); // 倒影里也有亮着的灯
    var ob = refl.onBeforeRender, last = -1;
    refl.onBeforeRender = function (a, b, c2) { if (last === fid) return; last = fid; ob.call(this, a, b, c2); }; // 环境光遮蔽、景深会把场景再画几遍：反射一帧只画一次
    return refl;
  }
  /** 反射的离屏缓冲按画面实际的像素算，最长边不超过 2048 */
  function reflSize() {
    var pr = app.renderer().getPixelRatio(), w = W * pr, h = H * pr, k = Math.min(1, 2048 / Math.max(w, h, 1));
    return { x: Math.max(64, Math.round(w * k)), y: Math.max(64, Math.round(h * k)) };
  }
  /** 拖中缝、横竖屏切换：反射跟着改大小（不然一直按建车时的大小拉伸） */
  function reflResize() {
    if (!refl) return;
    var sz = reflSize(), rt = refl.getRenderTarget();
    if (rt.width !== sz.x || rt.height !== sz.y) rt.setSize(sz.x, sz.y);
    refl.material.uniforms.uPx.value.set(0.5 / sz.x, 0.5 / sz.y);
  }
  /** 贴图的平均颜色（线性的，画到 4×4 的画布上取平均）；读不出来返回 null */
  function texAvg(tex) {
    try {
      var img = tex.image, cv = document.createElement('canvas'), x = cv.getContext('2d'), d, r = 0, g = 0, b = 0;
      if (!img || !img.width) return null;
      cv.width = cv.height = 4;
      x.drawImage(img, 0, 0, 4, 4);
      d = x.getImageData(0, 0, 4, 4).data;
      for (var i = 0; i < 64; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      return new T.Color(r / 16 / 255, g / 16 / 255, b / 16 / 255).convertSRGBToLinear();
    } catch (e) { return null; }
  }
  /** 车漆 / 轮毂 / 卡钳按设置换色；animate 时从现在的颜色 0.6 秒渐变过去 */
  function finish(animate) {
    if (!M) return;
    finishFrom = { paint: M.paint.color.clone(), pm: M.paint.metalness, pr: M.paint.roughness, pc: M.paint.clearcoat, pcr: M.paint.clearcoatRoughness, pi: M.paint.iridescence, pf: M.fx.fb, pp: M.fx.peel.value,
      rim: M.rims.map(function (m) { return { c: m.color.clone(), m: m.metalness, r: m.roughness }; }), cal: M.cals.map(function (m) { return m.color.clone(); }) };
    finishK = animate ? 0 : 1;
    tint(finishK);
    if (app) app.invalidate();
  }
  function tint(k) {
    var p = S.pick('paint'), r = S.pick('rim'), c = S.pick('caliper'), e = k * k * (3 - 2 * k), f = finishFrom;
    M.paint.color.copy(f.paint).lerp(new T.Color(p.color), e);
    M.paint.metalness = f.pm + (p.metal - f.pm) * e;
    M.paint.roughness = f.pr + (p.rough - f.pr) * e;
    M.paint.clearcoat = f.pc + ((p.coat === undefined ? 1 : p.coat) - f.pc) * e;
    M.paint.clearcoatRoughness = f.pcr + (p.ccr - f.pcr) * e;
    M.paint.iridescence = f.pi + (p.iri - f.pi) * e; // 从 0 变成大于 0（或反过来）时 three.js 会重新编译一次车漆的着色器
    M.paint.iridescenceThicknessRange = p.thick;
    var on = S.fx().flake;
    M.fx.fb = f.pf + ((on ? p.flake : 0) - f.pf) * e;
    M.fx.peel.value = f.pp + ((on && p.coat > 0.3 ? 0.035 : 0) - f.pp) * e;
    var map = p.model && M.orig ? M.orig.map : M.keepMap && M.orig ? M.orig.map : null; // 原车颜色：连车模自己的贴图一起用
    if ((M.paint.map || null) !== map) { M.paint.map = map; M.paint.needsUpdate = true; }
    M.rims.forEach(function (m, i) { // 原车颜色：回到建车时记下的样子
      var o = f.rim[i], t = r.model && M.rim0[i] ? M.rim0[i] : { c: new T.Color(r.color), m: r.metal, r: r.rough };
      m.color.copy(o.c).lerp(t.c, e); m.metalness = o.m + (t.m - o.m) * e; m.roughness = o.r + (t.r - o.r) * e;
    });
    M.cals.forEach(function (m, i) { m.color.copy(f.cal[i]).lerp(c.model && M.cal0[i] ? M.cal0[i] : new T.Color(c.color), e); });
  }

  // ================= 车况 → 画面、文字 =================
  function apply(c) {
    var n = c['display.dayNightMode'];
    if (n) { try { localStorage.setItem(KEY_DARK, n === 'night' ? '1' : '0'); } catch (e) {} }
    nightData = n ? n === 'night' : null;
    theme(wantDark());
    var gear = c['driving.gear'];
    // 调整车模时车保持静止：门窗关着、灯灭着、不进开车场景，只有"试开 / 亮一下"的那一项动——
    // 不然调试面板里自动变化的项（电脑上）、真实车况（车机上）一会儿开门一会儿亮灯，点不准零件、也看不清自己调的颜色。退出编辑接着跟车况
    var still = editing;
    topView(!still && gear === 'D');
    TYRES.forEach(function (w) {
      var st = c['tyre.' + w + '.state'], p = c['tyre.' + w + '.pressure'];
      tyreBad[w] = p === 'burst' || p === 'fault' || st === 'critical' ? 2 : st && st !== 'normal' ? 1 : 0;
      setText($('tp-' + w).querySelector('b'), pressure(p, c['tyre.displayUnit']));
      var tt = c['tyre.' + w + '.temperature'], ti = $('tp-' + w).querySelector('i'), tx = typeof tt === 'number' ? '胎温 ' + Math.round(tt) : ''; // 原始读数，单位没证实，不加单位
      if (ti.textContent !== tx) ti.textContent = tx;
    });
    tyreTour();
    text(c);
    if (!root) return;
    doorWatch(c);
    Object.keys(DOORS).forEach(function (k) { want[k] = (!still && c[DOORS[k]] === 'open') || force[k] ? 1 : 0; });
    Object.keys(LIDS).forEach(function (k) { want[k] = (!still && c[LIDS[k]] === 'open') || force[k] ? 1 : 0; });
    Object.keys(WINS).forEach(function (k) { var w = still ? 0 : c[WINS[k]]; want[k] = force[k] ? 1 : typeof w === 'number' ? Math.max(0, Math.min(1, w / 100)) : 0; });
    Object.keys(SLIDES).forEach(function (k) { var w = still ? 0 : c[SLIDES[k]]; want[k] = force[k] ? 1 : typeof w === 'number' ? Math.max(0, Math.min(1, w / 100)) : 0; });
    want.chargePort = force.chargePort || (!still && c[FLAPS.chargePort] && c[FLAPS.chargePort] !== 'none') ? 1 : 0;
    var low = !still && c['light.lowBeam'] === true, high = !still && c['light.highBeam'] === true, lit = low || high, side = !still && c['light.side'] === true;
    var pw = c['power.level'], on = pw === 'on' || pw === 'ready' || pw === 'fakeReady', powered = !pw || on, ab = c['light.ambient.brightness'], drl = c['light.daytimeRunning'];
    if (!still && on && lastPw !== undefined && lastPw !== pw && !(lastPw === 'on' || lastPw === 'ready' || lastPw === 'fakeReady')) welT = 0; // 上车：熄火 / ACC → 上电，迎宾灯闪一下
    lastPw = pw;
    // 每种灯亮多少（0～1，点亮层的透明度再按发光质感算；high 是远光的光束）。日行灯：车机报的是日行灯开关，上电时才亮；老宿主没这个字段时跟着大灯。
    // 氛围灯亮度车机报 1～5
    lightOn = {
      head: lit ? 1 : 0, high: high ? 1 : 0, tail: lit || side ? 1 : 0, side: side ? 1 : 0, led: !still && (drl === undefined ? lit : drl === true && powered) ? 1 : 0,
      brake: !still && (c['light.brake'] === 'on' || c['light.brake'] === 'flash') ? 1 : 0,
      reverse: !still && c['driving.gear'] === 'R' ? 1 : 0, fogF: !still && c['light.frontFog'] === true ? 1 : 0, fogR: !still && c['light.rearFog'] === true ? 1 : 0,
      ambient: !still && powered ? (typeof ab === 'number' ? Math.max(0.25, Math.min(1, ab <= 5 ? ab / 5 : ab <= 10 ? ab / 10 : ab / 100)) : 0.8) : 0,
      power: !still && powered ? 1 : 0 // 自定义灯默认上电就亮
    };
    brakeFlash = !still && c['light.brake'] === 'flash'; // 紧急制动：刹车灯快闪
    ambientHex = AMBIENT[c['light.ambient.color']] || null;
    ambArea = c['light.ambient.area'] || 'all';
    colorful = c['light.dynamicColorful'] === true;
    var mm = c['light.ambient.musicMode'] === true;
    if (mm !== musicOn) { // 音乐律动开着才订阅媒体（看在不在放歌）
      musicOn = mm;
      page.needs = mm ? ['car', 'media'] : ['car'];
      if (window.D3) D3.needs(page);
    }
    // 转向灯字段：现在的宿主报的是开关状态（打着灯一直是 1），老 ROM 报的是灯泡一亮一灭（也不保证每次闪烁都推过来）——
    // 看到熄灭不到 1.2 秒又亮了就认定是后一种，之后熄灭不到 1.6 秒也算在打灯。车模上按自己的节奏闪；双闪开着两边一起闪
    turnHz = !still && c['light.hazard'] === true;
    lightOn.hazard = turnHz ? 1 : 0; // 自定义灯可以跟着双闪
    var now = Date.now();
    SIDES.forEach(function (s) {
      var lit = !still && c[s === 'L' ? 'light.turnSignal.left' : 'light.turnSignal.right'] === true;
      if (lit && !bulb[s] && now - offAt[s] < 1200) pulsed = true;
      if (!lit && bulb[s]) offAt[s] = now;
      if (still) blinkAt[s] = 0;
      else if (lit || bulb[s]) blinkAt[s] = now;
      bulb[s] = lit;
    });
    turnState();
    TYRES.forEach(function (w) {
      var bad = tyreBad[w], ring = wheels[w].ring;
      ring.visible = bad > 0;
      ring.material.color.set(bad === 2 ? 0xff3b30 : 0xff9a1f);
      ring.material.opacity = bad ? 0.9 : 0;
    });
    // 车况推得很勤（车速、功率、温度这类一直在变），大多数跟 3D 画面无关：画面上的东西变了才画一帧（车机上画一帧整台车很贵）
    var k3 = JSON.stringify([want, lightOn, brakeFlash, ambientHex, ambArea, colorful, musicOn, turnHz, bulb, pulsed, tyreBad]);
    if (k3 !== applyKey || root !== applyRoot || welT === 0) { applyKey = k3; applyRoot = root; app.invalidate(); }
  }
  var applyKey = '', applyRoot = null;
  /** 设置里选了浅色 / 深色就按设置；跟随车机时按车机的日夜模式 */
  function wantDark() { var t = S.get('theme'); return t === 'dark' ? true : t === 'light' ? false : nightData !== null ? nightData : guessDark(); }
  /** 挂 D 挡：镜头转到车后上方往下看；挂回别的挡转回展厅的默认视角 */
  function topView(on) {
    if (on === top.on) return;
    top.on = on;
    top.last = 0;
    view.homing = true; view.vaz = 0;
    if (app) app.invalidate();
  }

  /** 宿主没报日夜模式时：上次报过的值，没有就按钟点（19～6 点深色，同 index.html） */
  function guessDark() {
    try { var v = localStorage.getItem(KEY_DARK); if (v === '1' || v === '0') return v === '1'; } catch (e) {}
    var h = new Date().getHours();
    return h >= 19 || h < 6;
  }
  var turnOn = { L: false, R: false }, bulb = { L: false, R: false }, blinkAt = { L: 0, R: 0 }, offAt = { L: 0, R: 0 }, turnHz = false, pulsed = false, brakeFlash = false;
  var WELCOME = { head: 1, tail: 1, led: 1, side: 1 }; // 上车、进场时亮一下的灯
  /** 车况要这种灯亮多少：自定义灯按"什么时候亮"（默认上电）取那一项 */
  function onOf(r) {
    var l = CUSTOM.indexOf(r) >= 0 && cfg && cfg.lights && cfg.lights[r];
    return lightOn[CUSTOM.indexOf(r) >= 0 ? (l && l.when) || 'power' : r] || 0;
  }
  /** 爆闪：一秒一轮，前半秒快闪三下（亮 50 毫秒、灭 50 毫秒），后半秒暗着；后闪的错开半秒——红蓝两盏一边一下轮着闪 */
  function strobe(now, late) { var t = (now + (late ? 500 : 0)) % 1000; return t < 300 && t % 100 < 50; }
  /** 每帧算灯：车况要的（lightOn）、迎宾灯（wf）、试亮（forceLight）、效果（呼吸、闪、流水）、借灯打转向。
     只有要亮的灯才建点亮层、才画（没亮过的灯不烘贴图）。返回要不要接着出帧 */
  function lightsTick(wf) {
    if (!LS) return false;
    var now = Date.now(), moving = false, ph = now % 760, blink = ph < 420, tOn = blinking && blink, L = (cfg && cfg.lights) || {};
    // 借灯打转向：这一下哪几个角在亮（只有配置里开了借灯、这个角没标转向灯才借）
    var tl = { L: blink && ((blinking && turnOn.L) || !!forceLight.turnL), R: blink && ((blinking && turnOn.R) || !!forceLight.turnR) }, q = LS.fbQ, bw = !!(cfg && cfg.borrow);
    turnU.value.set(bw && q.LF && tl.L ? 1 : 0, bw && q.RF && tl.R ? 1 : 0, bw && q.LB && tl.L ? 1 : 0, bw && q.RB && tl.R ? 1 : 0);
    var borrowing = turnU.value.x + turnU.value.y + turnU.value.z + turnU.value.w > 0, tc = lampRgb('turnL');
    if (bw && (forceLight.turnL || forceLight.turnR)) moving = true;
    // 一个零件归了好几种灯：同一时间只亮优先的那种。打着转向时，和转向灯共用零件的灯（日行灯、示宽灯……）在那一侧让出来（闪的间隙也是暗的，同真车；
    // 左右两条灯常常是同一个零件，所以按左右让，不整个零件灭掉）；别的按零件让：倒车灯、雾灯盖过尾灯，大灯盖过日行灯
    var claim = {}, mute = {};
    LAMP_PRI.forEach(function (r) {
      if (!LS.has(r)) return;
      var turn = r === 'turnL' || r === 'turnR';
      if (!(turn ? !!forceLight[r] || (blinking && turnOn[r.slice(4)]) : Math.max(onOf(r), WELCOME[r] ? wf : 0, forceLight[r] ? 1 : 0) > 0.003)) return;
      if (!turn) { LS.srcs(r).forEach(function (u) { if (!claim[u]) claim[u] = r; }); return; }
      var src = {};
      LS.srcs(r).forEach(function (u) { src[u] = 1; });
      LIGHTS.forEach(function (q) {
        if (q === 'turnL' || q === 'turnR' || !LS.has(q) || !LS.srcs(q).some(function (u) { return src[u]; })) return;
        (mute[q] = mute[q] || [0, 0])[r === 'turnL' ? 0 : 1] = 1; // x 正是左边
      });
    });
    LIGHTS.forEach(function (r) {
      if (!LS.has(r)) return;
      var fx = M.fx[r], k, flow = 1;
      if (r === 'turnL' || r === 'turnR') {
        var s = r.slice(4), on = forceLight[r] ? blink : tOn && turnOn[s];
        k = on ? 1 : 0;
        if (forceLight[r] || (fx === 'flow' && on)) moving = true;
        if (fx === 'flow') flow = Math.min(1, ph / 300);
      } else {
        k = Math.max(onOf(r), WELCOME[r] ? wf : 0, forceLight[r] ? 1 : 0);
        var lc = L[r] || {}, late = !!lc.late; // 自定义灯：先闪 / 后闪（两盏错开）
        if (k > 0 && fx === 'breath') { k *= 0.5 + 0.5 * Math.sin(now / 1000 * 2.4 + (late ? Math.PI : 0)); moving = true; }
        if (k > 0 && fx === 'blink') { k = (now + (late ? 400 : 0)) % 800 < 400 ? k : 0; moving = true; }
        if (k > 0 && fx === 'strobe') { k = strobe(now, late) ? k : 0; moving = true; }
        if (k > 0 && lc.when === 'hazard' && (fx || 'steady') === 'steady' && !forceLight[r]) k = blink ? k : 0; // 跟着双闪、常亮：按双闪的节奏一亮一灭
        if (r === 'brake' && brakeFlash && lightOn.brake && !forceLight.brake) { k = now % 250 < 125 ? k : 0; moving = true; } // 一秒 4 下
      }
      var byCar = r === 'ambient' && lightOn.ambient > 0 && !forceLight.ambient; // 氛围灯跟着车机亮着（不是"亮一下"给人看）
      if (byCar && musicOn && playing) { k *= beat(now); moving = true; }
      var lend = borrowing && TURN_FB.indexOf(r) >= 0;
      if (k <= 0.003 && !lend && !LS.built(r)) return; // 还没亮过：不建点亮层
      var o = LS.get(r);
      if (!o) return;
      // 颜色：自己定了颜色就一直用自己的；氛围灯没定颜色时车机开了动态多彩就轮换颜色，没开跟着车机的氛围灯颜色
      var col = null;
      if (r === 'ambient' && !(L.ambient && L.ambient.color)) {
        if (byCar && colorful) { col = '#' + hueCol.setHSL(now / 9000 % 1, 0.9, 0.6).getHexString(); moving = true; } else col = ambientHex;
      }
      var rgb = lampRgb(r, col), g = D3Lamp.glow(L[r] && L[r].glow, r);
      o.u.uTint.value.set(rgb[0], rgb[1], rgb[2]);
      o.u.uTurnCol.value.set(tc[0], tc[1], tc[2]);
      o.u.uGlow.value.set(g.intensity, g.core, g.detail, g.softness);
      o.u.uFlow.value = flow;
      o.u.uBorrow.value = lend ? 1 : 0;
      o.u.uMute.value.set(mute[r] ? mute[r][0] : 0, mute[r] ? mute[r][1] : 0);
      var zone = byCar && ambArea !== 'all' ? (ambArea === 'front' ? 'R' : 'F') : ''; // 车机只开了前排 / 后排：另一排的不亮（分不出前后排的零件照亮）
      for (var z in o.mats) o.mats[z].uniforms.uOn.value = zone && z === zone ? 0 : k;
      var isTurn = r === 'turnL' || r === 'turnR';
      o.meshes.forEach(function (m) { var c = claim[m.userData.src]; m.visible = (isTurn || !c || c === r) && (lend || (k > 0.003 && !(zone && m.userData.z === zone))); });
    });
    return moving;
  }
  /** 路面光束淡入淡出：近光（开大灯；远光时也亮）、远光、前雾灯、尾灯（开示宽、大灯）、倒车灯（R 挡）；调整车模里"亮一下"也照。返回要不要接着出帧 */
  function beamsTick(dt) {
    if (!LS) return false;
    var moving = false, bc = LS.bc;
    Object.keys(D3Lamp.BEAMS).forEach(function (slot) {
      var on = slot === 'low' ? Math.max(lightOn.head || 0, forceLight.head ? 1 : 0) : Math.max(lightOn[slot] || 0, forceLight[slot] ? 1 : 0);
      var a = bc[slot] || 0;
      if (Math.abs(a - on) > 0.002) { a += (on - a) * (1 - Math.exp(-dt * 6)); moving = true; } else a = on;
      bc[slot] = a;
      LS.beam(slot, a);
    });
    return moving;
  }

  /** 音乐律动：拿不到歌的节拍，按每分钟 120 拍一下一下闪，每 4 拍的第一拍亮一些 */
  function beat(now) {
    var t = now % 2000 / 500, i = Math.floor(t), f = t - i;
    return 0.3 + (i === 0 ? 0.7 : 0.5) * (1 - f) * (1 - f);
  }
  function onMedia(m) {
    var p = !!(m && m.playing);
    if (p === playing) return;
    playing = p;
    if (app && musicOn) app.invalidate();
  }
  function turnState() {
    var now = Date.now();
    SIDES.forEach(function (s) { turnOn[s] = turnHz || bulb[s] || (pulsed && now - blinkAt[s] < 1600); });
    blinking = turnOn.L || turnOn.R;
  }
  function pressure(v, u) {
    if (v === 'burst') return '爆胎';
    if (v === 'fault') return '异常';
    if (typeof v !== 'number') return '—';
    return u === 'psi' ? Math.round(v / 6.894757) + ' psi' : u === 'kPa' ? Math.round(v) + ' kPa' : (v / 100).toFixed(1) + ' bar';
  }
  function text(c) {
    var gear = c['driving.gear'], gi = $('cGears').children;
    for (var i = 0; i < gi.length; i++) setCls(gi[i], gi[i].textContent === gear ? 'on' : '');
    var sp = c['driving.speed'], moving = typeof sp === 'number' && (sp > 0 || gear === 'D' || gear === 'R');
    if ($('cSpeed').style.visibility !== (moving ? 'visible' : 'hidden')) $('cSpeed').style.visibility = moving ? 'visible' : 'hidden';
    setText($('cSpeed').firstChild, String(moving ? Math.round(sp) : 0));
    var pw = c['power.level'];
    setText($('cPower'), POWER[pw] || '—');
    setCls($('cPower'), 'chip' + (pw === 'on' || pw === 'ready' || pw === 'fakeReady' ? ' live' : ''));
    if ($('cDemo').style.display !== (D.demo ? '' : 'none')) $('cDemo').style.display = D.demo ? '' : 'none';
    var er = c['energy.electricRange'], fr = c['energy.fuelRange'], has = typeof er === 'number' || typeof fr === 'number';
    var num = function (v) { return typeof v === 'number' ? Math.round(v) : null; };
    stats();
    S.get('stats').forEach(function (id) {
      var e = $(STAT[id] ? STAT[id][0] : 'cS-' + id);
      if (!STAT[id]) { var sv = CS.stat(id, c, D.unit); stat(e, sv ? sv[0] : null, sv ? sv[1] : ''); return; }
      if (id === 'bat') energy(e, '电量', c['energy.batteryPercent'], c['energy.chargingState'] === 'charging' ? '电量 · 充电中' : '');
      else if (id === 'fuel') energy(e, '油量', c['energy.fuelPercent'], '');
      else if (id === 'range') stat(e, has ? Math.round((typeof er === 'number' ? er : 0) + (typeof fr === 'number' ? fr : 0)) : null, 'km');
      else if (id === 'eRange') stat(e, num(er), 'km');
      else if (id === 'fRange') stat(e, num(fr), 'km');
      else if (id === 'temp') stat(e, num(c['ac.outdoorTemperature']), '°C');
      else if (id === 'inTemp') stat(e, num(c['ac.indoorTemperature']), '°C');
      else if (id === 'odo') stat(e, num(c['driving.totalDistance']), 'km');
    });
    showStatus(statuses(c));
    telltales(c);
    roofState(c);
  }
  // ================= 车况图标（carstat.js）：内容变了才改 DOM；竖屏合成车上面一排 =================
  var ttKey = '';
  // 车况推得很勤：字、类名一样就不写（写一次就要重新算样式、排版）
  function setText(e, t) { if (e.textContent !== t) e.textContent = t; }
  function setCls(e, c) { if (e.className !== c) e.className = c; }
  function telltales(c) {
    var t = CS.telltales(c), l = portrait ? rank(t.L.concat(t.R)) : t.L, r = portrait ? [] : t.R, key = l.join('') + '|' + r.join('');
    if (key === ttKey) return;
    ttKey = key;
    $('ttL').innerHTML = l.join(''); $('ttR').innerHTML = r.join('');
    fit($('ttL')); fit($('ttR'));
  }
  /** 放不下的图标整个藏掉（不露半个）：竖屏一排看宽度，横屏一列看高度 */
  function fit(box) {
    var kids = box.children, lim = portrait ? box.clientWidth : box.clientHeight;
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i], end = portrait ? e.offsetLeft + e.offsetWidth : e.offsetTop + e.offsetHeight;
      if (end > lim + 1) e.style.display = 'none';
    }
  }
  /** 竖屏只有一排、放不下的藏掉：告警（红）在前、提醒（橙）其次，别的按原来的顺序 */
  function rank(l) {
    var k = function (h) { var m = /^<div class="tti([^"]*)"/.exec(h), c = m ? m[1] : ''; return /\bbad\b/.test(c) ? 0 : /\bwarn\b/.test(c) ? 1 : 2; };
    return l.map(function (h, i) { return [k(h), i, h]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (x) { return x[2]; });
  }
  var sysKey = null;
  function sysIcons(s) { var h = CS.sys(s || {}); if (h !== sysKey) { sysKey = h; $('cSys').innerHTML = h; } }
  // ================= 下面那行字：车况里要让人知道的事，按严重程度分级 =================
  // 3 告警（红）：爆胎、胎压异常、低压供电异常、开车时主驾没系安全带；
  // 2 提醒（橙）：胎压偏高 / 偏低、门 / 机舱盖 / 尾门开着、车窗开了多少、天窗开了多少、钥匙电池电量低、充电中断、续航 / 电量 / 油量低；
  // 1 状态（蓝）：充电中（电量、还要多久）、已充满、插着充电枪、对外放电；0 都正常（绿）：车门车窗都关好了 · 胎压正常（有提醒、告警时不说）
  var LOW_RANGE = 50, LOW_BAT = 20, LOW_FUEL = 10, stList = [], stOpen = false;
  var ABBR = { frontLeft: 'FL', frontRight: 'FR', rearLeft: 'RL', rearRight: 'RR' };
  /** 下面那行字的每一条：{ lv 等级, t 文字, go 点了看哪儿（{ tyres } 轮子 / { parts } 车模上有的部件；没有对应位置的不带） } */
  function statuses(c) {
    var L = [], add = function (lv, t, go) { L.push({ lv: lv, t: t, go: go || null }); };
    var gp = function (keys) { var k = keys.filter(function (x) { return parts && parts[x]; }); return k.length ? { parts: k } : null; };
    var gt = function (ws) { return wheels && ws.length ? { tyres: ws.slice() } : null; };
    var gear = c['driving.gear'], sp = c['driving.speed'], moving = gear === 'D' || gear === 'R' || (typeof sp === 'number' && sp > 0);
    var tyre = { burst: [], fault: [], low: [], high: [], warn: [] }, tw = { burst: [], fault: [], low: [], high: [], warn: [] }, anyP = false;
    TYRES.forEach(function (w) {
      var p = c['tyre.' + w + '.pressure'], st = c['tyre.' + w + '.state'];
      var g = p === 'burst' ? 'burst' : p === 'fault' || st === 'critical' ? 'fault' : st === 'low' ? 'low' : st === 'high' ? 'high' : st && st !== 'normal' ? 'warn' : '';
      if (typeof p === 'number') anyP = true;
      if (g) { tyre[g].push(TYRE_NAME[w]); tw[g].push(w); }
    });
    if (tyre.burst.length) add(3, tyre.burst.join('、') + '爆胎', gt(tw.burst));
    if (tyre.fault.length) add(3, tyre.fault.join('、') + '胎压异常', gt(tw.fault));
    if (c['warning.lowVoltageBatteryFault'] === true) add(3, '低压供电异常');
    if (moving && c['seat.driver.beltFastened'] === false) add(3, '主驾没系安全带');
    if (tyre.low.length) add(2, tyre.low.join('、') + '胎压偏低', gt(tw.low));
    if (tyre.high.length) add(2, tyre.high.join('、') + '胎压偏高', gt(tw.high));
    if (tyre.warn.length) add(2, tyre.warn.join('、') + '胎压异常', gt(tw.warn));
    // 哪里开着：门 / 盖；车窗按各自的开度说哪扇开了多少（宿主没有单个车窗的开度时，按"有车窗开着"的聚合状态只说车窗）；天窗开了多少
    var open = [], ok = [], wins = [], wk = [];
    Object.keys(DOORS).forEach(function (k) { if (c[DOORS[k]] === 'open') { open.push(DOOR_NAME[DOORS[k]]); ok.push(k); } });
    if (c['body.hood.state'] === 'open') { open.push('前机舱盖'); ok.push('hood'); }
    if (c['body.tailgate.state'] === 'open') { open.push('尾门'); ok.push('trunk'); }
    if (open.length) add(2, open.join('、') + '开着', gp(ok));
    TYRES.forEach(function (w) { var v = c['body.windows.' + w + '.position']; if (typeof v === 'number' && v > 0) { wins.push(TYRE_NAME[w] + ' ' + Math.round(v) + '%'); wk.push(parts && parts['win' + ABBR[w]] ? 'win' + ABBR[w] : 'door' + ABBR[w]); } }); // 车模没标车窗：看同位置的门
    if (wins.length) add(2, '车窗开着：' + wins.join('、'), gp(wk));
    else if (c['body.windows.anyOpen'] === true) add(2, '车窗开着');
    var sr = c['body.sunroof.position'];
    if (typeof sr === 'number' && sr > 0) add(2, '天窗开了 ' + Math.round(sr) + '%', gp(['sunroof', 'sunshade']));
    if (c['warning.keyBatteryLow'] === true) add(2, '钥匙电池电量低');
    // 能源：充电、电量 / 油量 / 续航
    var cs = c['energy.chargingState'], con = c['energy.connectorState'], bat = c['energy.batteryPercent'], fuel = c['energy.fuelPercent'];
    var er = c['energy.electricRange'], fr = c['energy.fuelRange'], range = typeof er === 'number' || typeof fr === 'number' ? (typeof er === 'number' ? er : 0) + (typeof fr === 'number' ? fr : 0) : null;
    var port = gp(['chargePort']);
    if (cs === 'terminated') add(2, '充电中断', port);
    if (cs !== 'charging' && range !== null && range < LOW_RANGE) add(2, '续航只剩 ' + Math.round(range) + ' km');
    else if (cs !== 'charging' && typeof bat === 'number' && bat < LOW_BAT) add(2, '电量低 ' + Math.round(bat) + '%');
    if (typeof fuel === 'number' && fuel < LOW_FUEL && !(range !== null && range < LOW_RANGE)) add(2, '油量低 ' + Math.round(fuel) + '%');
    if (cs === 'charging') {
      var rt = c['energy.charging.remainingTime'], left = '';
      if (Array.isArray(rt) && rt.length === 2 && typeof rt[0] === 'number' && typeof rt[1] === 'number' && rt[0] * 60 + rt[1] > 0) left = ' · 还要 ' + (rt[0] ? rt[0] + ' 小时 ' : '') + rt[1] + ' 分';
      add(1, '充电中' + (typeof bat === 'number' ? ' ' + Math.round(bat) + '%' : '') + left, port);
    } else if (cs === 'finished') add(1, '已充满', port);
    else if (con === 'vtol') add(1, '对外放电中', port);
    else if (con === 'ac' || con === 'dc' || con === 'acDc') add(1, '插着充电枪', port);
    if (Object.keys(c).length && !L.some(function (x) { return x.lv >= 2; })) add(0, '车门车窗都关好了' + (anyP ? ' · 胎压正常' : '')); // 车况还没来时不说
    L.sort(function (x, y) { return y.lv - x.lv; }); // 同级按加进来的顺序（74 内核的 sort 是稳定的）
    return L;
  }
  var ST_CLS = ['', ' info', ' warn', ' bad'];
  /** 一行只放最严重的那一级（最多两条，用 · 连），别的记成 +N；不止一条时点这行字展开，列出全部 */
  function showStatus(L) {
    stList = L;
    var st = $('cStatus'), top = L.length ? L[0].lv : 0, shown = L.filter(function (x) { return x.lv === top; }).slice(0, 2), more = L.length - shown.length;
    var msg = shown.map(function (x) { return x.t; }).join(' · ');
    var sp = st.querySelector('.c-pill span'), mb = st.querySelector('.c-pill b');
    if (sp.textContent !== msg) sp.textContent = msg;
    setText(mb, more > 0 ? '+' + more : '');
    if (L.length < 2) stOpen = false;
    setCls(st, 'c-msg' + ST_CLS[top] + (msg ? '' : ' none') + (L.length > 1 ? ' more' : L.length && L[0].go ? ' go' : '') + (stOpen ? ' open' : ''));
    var list = st.querySelector('.c-list'), html = stOpen ? L.map(function (x, i) { return '<p class="lv' + x.lv + (x.go ? ' go" data-i="' + i : '') + '"><i></i><span>' + x.t + '</span></p>'; }).join('') : '';
    if (list.innerHTML !== html) list.innerHTML = html;
  }
  function stToggle(on) { stOpen = on && stList.length > 1; showStatus(stList); }
  $('cStatus').querySelector('.c-pill').addEventListener('click', function (e) { // 不止一条：展开列表；只有一条、有对应位置：镜头转过去
    e.stopPropagation();
    if (stList.length > 1) stToggle(!stOpen); else if (stList.length && stList[0].go) lookAt(stList[0].go);
  });
  $('cStatus').querySelector('.c-list').addEventListener('click', function (e) { // 列表里点一条：镜头转过去，列表收起
    var r = e.target.closest && e.target.closest('p[data-i]'), x = r && stList[+r.getAttribute('data-i')];
    e.stopPropagation();
    if (x && x.go && lookAt(x.go)) stToggle(false);
  });
  $('cAll').addEventListener('click', function (e) { // 全部车况（carinfo.js，第一次点时才加载）
    e.stopPropagation(); stToggle(false);
    (window.D3CarInfo ? Promise.resolve() : loadJs('carinfo.js')).then(function () { D3CarInfo.open(); }, function () { D3.toast('全部车况没加载出来'); });
  });
  var jsLoad = {};
  function loadJs(src) {
    if (!jsLoad[src]) jsLoad[src] = new Promise(function (ok, no) {
      var sc = document.createElement('script');
      sc.src = src; sc.onload = ok;
      sc.onerror = function () { delete jsLoad[src]; no(new Error(src + ' 加载失败')); };
      document.head.appendChild(sc);
    });
    return jsLoad[src];
  }
  document.addEventListener('pointerdown', function (e) { if (stOpen && !(e.target.closest && e.target.closest('#cStatus'))) stToggle(false); }, true); // 点别处收起

  function stat(e, v, unit) {
    var b = e.querySelector('b'), h = v === null ? '—' : v + '<small>' + unit + '</small>';
    if (b.getAttribute('data-h') !== h) { b.setAttribute('data-h', h); b.innerHTML = h; }
  }
  function energy(e, name, v, label) {
    var ok = typeof v === 'number';
    setText(e.querySelector('span'), label || name);
    stat(e, ok ? Math.round(v) : null, '%');
    var f = e.querySelector('.bar i'), tf = 'scaleX(' + (ok ? Math.max(0, Math.min(100, v)) / 100 : 0) + ')';
    if (f.getAttribute('data-t') !== tf) { f.setAttribute('data-t', tf); f.style.transform = tf; }
    setCls(f, !ok ? '' : v < 20 ? 'low' : v < 50 ? 'mid' : '');
  }
  // 底部数据：id → [元素 id, 名字]；按设置的顺序建（变了才重建）
  var CS = window.D3CarStat;
  var STAT = { bat: ['cBat', '电量'], fuel: ['cFuel', '油量'], range: ['cRange', '总续航'], eRange: ['cERange', '纯电续航'], fRange: ['cFRange', '燃油续航'],
    temp: ['cTemp', '车外'], inTemp: ['cInTemp', '车内'], odo: ['cOdo', '总里程'] };
  function stats() {
    var box = el.querySelector('.stats'), l = S.get('stats'), key = l.join();
    if (box.getAttribute('data-k') === key) return;
    box.setAttribute('data-k', key);
    box.className = 'stats n' + l.length;
    box.innerHTML = '';
    l.forEach(function (id) {
      var d = document.createElement('div');
      var o = CS.STATS.filter(function (x) { return x[0] === id; })[0];
      d.className = 'st'; d.id = STAT[id] ? STAT[id][0] : 'cS-' + id;
      d.innerHTML = '<span>' + (STAT[id] ? STAT[id][1] : o[1]) + '</span><b>—</b>' + (id === 'bat' || id === 'fuel' ? '<i class="bar"><i></i></i>' : '');
      box.appendChild(d);
    });
    D.extra(l.map(CS.field).filter(Boolean)); // 选了的数值才订（转速、瞬时油耗这类一直在变的，不选不订）
  }
  // 车况页背景：影棚 / 暖调 / 冷调（CSS 里各有浅色、深色两版），或者自己的图片（存在本地库里，上面压暗一层）
  var bgUrl = '', hasBg = false; // hasBg：本地库里存过背景图（打开时先查好，点"图片"时才能马上弹选文件——要在点的那一下里弹，等异步查完再弹浏览器会拦）
  D3Model.bgGet().then(function (b) { hasBg = !!b; });
  function background() {
    var b = S.get('bg'), bgEl = el.querySelector('.bg');
    ['warm', 'cool', 'image'].forEach(function (x) { el.classList.toggle('bg-' + x, b === x); });
    el.style.setProperty('--dim', S.get('bgDim'));
    if (b === 'image' && !bgUrl) D3Model.bgGet().then(function (blob) {
      if (!blob || S.get('bg') !== 'image' || bgUrl) return;
      bgUrl = URL.createObjectURL(blob);
      bgEl.style.backgroundImage = 'url(' + bgUrl + ')';
    });
    if (b !== 'image' && bgUrl) { bgEl.style.backgroundImage = ''; URL.revokeObjectURL(bgUrl); bgUrl = ''; }
  }
  /** 挑一张背景图片：缩小存进本地库，换上 */
  function pickBg() {
    var f = $('fileBg');
    f.value = '';
    f.onchange = function () {
      if (!f.files || !f.files[0]) return;
      D3Model.bgSet(f.files[0]).then(function () {
        hasBg = true;
        if (bgUrl) { URL.revokeObjectURL(bgUrl); bgUrl = ''; el.querySelector('.bg').style.backgroundImage = ''; }
        if (S.get('bg') === 'image') background(); else S.set('bg', 'image');
        D3.toast('背景换好了');
      }, function (e) { D3.toast(e && e.user ? e.message : '这张图片用不了'); });
    };
    f.click();
  }
  /** 设置里显示现在用的车模 */
  function modelUI() {
    if (!rec) return;
    $('setModelName').textContent = rec.name + (rec.custom && rec.builtin ? '（调整过）' : '');
    $('setModelCredit').textContent = rec.broken ? '导入的车模读不出来，先用默认车模' : rec.credit;
    $('setModelReset').disabled = rec.builtin && !rec.custom && !rec.broken;
    [['Paint', M && M.has.paint, '车漆', '车身'], ['Rim', M && M.rims.length, '轮毂', '轮毂'], ['Caliper', M && M.cals.length, '卡钳', '卡钳']].forEach(function (r) { // 车模里没标出来的：换色没用，说一声
      var e = $('set' + r[0] + 'Tip');
      e.textContent = !M || r[1] ? '' : '这个车模还没标出' + r[2] + '，换色不生效（在"调整车模"里点一下' + r[3] + '标上）';
      e.style.display = e.textContent ? '' : 'none';
    });
  }
  function homeView() { HOME.az = S.get('viewAz'); HOME.el = S.get('viewEl'); }
  /** 换深浅色：页面上的字、线、背景靠 CSS 过渡，3D 的曝光、主光、车漆反射在 update 里跟着渐变 */
  function theme(d) {
    if (d === dark) return;
    dark = d;
    el.classList.toggle('dark', d);
    appEl.classList.toggle('car-dark', d);
    if (root) app.invalidate();
  }
  function look() {
    app.renderer().toneMappingExposure = (1 - 0.15 * themeK) * expK * (1 - 0.82 * nightK);
    keyLight.intensity = std ? 0 : 1.3 - 0.6 * themeK; // 导入的车模只靠环境光（主光留着投影子）
    M.paint.envMapIntensity = (0.85 - 0.15 * themeK) * envK;
    if (refl) refl.material.uniforms.uK.value = 0.2 + 0.14 * themeK; // 地面反射：深色时更明显
  }

  // ================= 每帧 =================
  page.update = function (dt) {
    if (!root) return 0;
    var moving = false;
    fid++;
    for (var k in want) {
      var a = cur[k] === undefined ? want[k] : cur[k], b = want[k];
      if (Math.abs(a - b) > 0.002) { a += (b - a) * (1 - Math.exp(-dt * 5)); moving = true; shadowDirty = true; } else a = b;
      if (a !== cur[k]) shadowDirty = true;
      cur[k] = a;
    }
    if (shadowDirty && keyLight.castShadow) { app.renderer().shadowMap.needsUpdate = true; shadowDirty = false; }
    Object.keys(parts).forEach(function (k) {
      var p = parts[k], v = cur[k] || 0;
      if (p.slide) p.pivot.position.copy(p.slide).multiplyScalar(ease(v));
      else if (p.pivot) p.pivot.quaternion.setFromAxisAngle(p.axis, p.angle * ease(v));
      else p.meshes.forEach(function (m, i) { m.position.y = p.y0[i] - p.drop * v; }); // 车窗降到门里
    });
    var tk = dark ? 1 : 0, nk = nightW ? 1 : 0;
    if (Math.abs(themeK - tk) > 0.002) { themeK += (tk - themeK) * (1 - Math.exp(-dt * 7)); moving = true; } else themeK = tk;
    if (Math.abs(nightK - nk) > 0.002) { nightK += (nk - nightK) * (1 - Math.exp(-dt * 6)); moving = true; } else nightK = nk;
    look();
    // 进场：镜头绕过来；转到一半迎宾灯亮一下
    if (intro.t < 1) {
      if (intro.wait > 0) intro.wait--;
      else intro.t = Math.min(1, intro.t + dt / INTRO.sec);
      moving = true;
    }
    var wf = intro.t > 0.35 && intro.t < 0.95 ? Math.sin((intro.t - 0.35) / 0.6 * Math.PI) : 0;
    if (welT < 1) { welT = Math.min(1, welT + dt / 1.1); wf = Math.max(wf, Math.sin(welT * Math.PI)); moving = true; } // 上车（上电）时迎宾灯也亮一下
    turnState(); // 一亮一灭报的转向灯熄了 1.6 秒没再亮：不打灯了
    var lightAnim = lightsTick(wf); // 呼吸、流水、试亮、音乐律动、动态多彩：30 帧够了，不用 60
    if (beamsTick(dt)) moving = true; // 光束淡入淡出
    // 换色渐变
    if (finishK < 1) { finishK = Math.min(1, finishK + dt / 0.6); tint(finishK); moving = true; }
    // 设置面板开着：车让到面板旁边、镜头转到侧面（在拖默认视角的滑块时不转）；编辑车模：车让到面板旁边（不转视角）
    var sw = (showOn || dbgOn) && !editing ? 1 : 0, aw = showOn && !editing && !preview ? 1 : 0, tw = editing ? 1 : 0;
    if (Math.abs(showK - sw) > 0.002) { showK += (sw - showK) * (1 - Math.exp(-dt * 4.5)); moving = true; } else showK = sw;
    if (Math.abs(angK - aw) > 0.002) { angK += (aw - angK) * (1 - Math.exp(-dt * 4.5)); moving = true; } else angK = aw;
    if (Math.abs(tuneK - tw) > 0.002) { tuneK += (tw - tuneK) * (1 - Math.exp(-dt * 4.5)); moving = true; } else tuneK = tw;
    if (!editing && tuneK === 0) { zoom = 1; pan.set(0, 0, 0); } // 退出编辑：车先回到原位，再把远近、平移清掉（不跳）
    if (flashes.length) { // 从列表里选中的零件闪 3 下（亮 0.3 秒、灭 0.2 秒）：按画出来的帧累计，一帧最多算 1/20 秒——卡了一下（第一次用这个材质要编译）也不会把剩下的几下挤在一起
      flashT += Math.min(dt, 0.05);
      if (flashT > 1.5) page.flash([]);
      else { flashMat.opacity = flashT % 0.5 < 0.3 ? 0.85 : 0; moving = true; }
    }
    lookTick();
    var qt = topNow() ? 1 : 0;
    // 镜头看的那一点、拉近多少：轮子之间、门之间换着看时也平滑挪过去
    var pv = pin && pin.v, ft = pv ? pv.at : tour ? tour.at : doorNow() ? doorV.at : null, fz = pv ? pv.zoom : tour ? tour.zoom : doorNow() ? doorV.zoom : focusZ, fw = ft ? 1 : 0;
    if (ft) {
      if (!focusAt || focusK < 0.002) { focusAt = ft.clone(); focusZ = fz; }
      else if (focusAt.distanceToSquared(ft) > 1e-6) { focusAt.lerp(ft, 1 - Math.exp(-dt * 2.4)); moving = true; } else focusAt.copy(ft);
    }
    if (Math.abs(focusZ - fz) > 0.001) { focusZ += (fz - focusZ) * (1 - Math.exp(-dt * 2.4)); moving = true; } else focusZ = fz;
    var fl = tour && !pv ? 1 : 0.85; // 看轮子：正对着轮子；看门：往车中心留一点
    if (Math.abs(focusL - fl) > 0.001) { focusL += (fl - focusL) * (1 - Math.exp(-dt * 2.4)); moving = true; } else focusL = fl;
    if (Math.abs(focusK - fw) > 0.002) { focusK += (fw - focusK) * (1 - Math.exp(-dt * 2.4)); moving = true; } else focusK = fw;
    if (Math.abs(top.k - qt) > 0.002) { top.k += (qt - top.k) * (1 - Math.exp(-dt * 2.4)); moving = true; } else top.k = qt;
    labelsOn = S.get('labels') && intro.t > 0.8 && (showK < 0.05 || dbgOn) && tuneK < 0.05;
    // 视角：回默认角度（挂 D 挡时是车后上方）；拖完的惯性；挂 D 挡时拖开 6 秒没碰就转回去
    var hm = home();
    if (topNow() && !view.homing && top.last && Date.now() - top.last > 6000 && (Math.abs(wrap(hm.az - view.az)) > 0.01 || Math.abs(hm.el - view.el) > 0.01)) view.homing = true;
    if (view.homing) {
      var da = wrap(hm.az - view.az), de = hm.el - view.el, k2 = 1 - Math.exp(-dt * (qt || top.k > 0.01 || focusK > 0.01 || ft ? 2.4 : 6)); // 转去看轮子、门（和看完回来）慢一点
      view.az += da * k2; view.el += de * k2;
      if (Math.abs(da) < 0.002 && Math.abs(de) < 0.002) { view.az = hm.az; view.el = hm.el; view.homing = false; } else moving = true;
    } else if (Math.abs(view.vaz) > 0.0004) {
      view.az += view.vaz * dt * 60;
      view.vaz *= Math.exp(-dt * 3.2);
      moving = true;
    } else view.vaz = 0;
    place();
    if (later) { // 退出编辑：车回到原位、镜头转完了再建排着的车
      if (!editing && tuneK === 0 && !view.homing) { var L = later; later = null; L.run().then(L.res, L.res); } else moving = true;
    }
    if (moving || lightAnim) movedAt = Date.now();
    page.still = !moving && !editing && !refl; // 除了灯（图层 1）都没变：main.js 贴回存下的画面、只画灯（地面反射里的灯也要跟着变，开着反射时不用）
    return moving ? 60 : lightAnim ? 30 : blinking ? 8 : 0;
  };
  // ================= 灯的点亮层先做好 =================
  // 点亮层（烘灯罩形状的贴图）第一次亮灯时现做，车机上要卡 1～3 秒（处理器慢 6～12 倍时实测），正好卡在进场转到一半的迎宾灯上。
  // 所以：车建好时（还在"正在载入"）要放进场动画的话先做迎宾要亮的大灯、日行灯、示宽灯、尾灯，顺便把灯的着色器编译好；
  // 别的灯（转向、倒车、雾灯、氛围灯）和地上的光束等进场完了、没人碰、画面停着的时候一样一样做（每做一样歇一会儿）。
  // 调整车模时不做（每改一下就重建一次车，灯多半用不上，进灯的页才现做）
  var WELCOME = ['head', 'led', 'side', 'tail'], warmT = 0, touchAt = 0, movedAt = 0;
  function warmLamps(g) {
    clearTimeout(warmT);
    if (!LS || editing) return;
    var did = false;
    if (intro.t < 1) WELCOME.forEach(function (r) { if (LS.has(r) && !LS.built(r)) { LS.get(r); did = true; } }); // 要放进场动画（转到一半迎宾灯亮）才先做，不然都留到空闲时
    if (did) { try { app.renderer().compile(scene, camera); } catch (e) {} } // 编译里包括藏着的点亮层：第一次亮灯不用再等着色器
    var beams = Object.keys(D3Lamp.BEAMS);
    warmT = setTimeout(function step() {
      if (g !== gen || !LS || editing || !scene) return;
      var now = Date.now();
      if (intro.t < 1 || now - touchAt < 1500 || now - movedAt < 800 || document.hidden) { warmT = setTimeout(step, 500); return; }
      var r = LIGHTS.filter(function (x) { return LS.has(x) && !LS.built(x); })[0];
      if (r) LS.get(r);
      else if (beams.length) LS.warmBeam(beams.shift());
      else { try { app.renderer().compile(scene, camera); } catch (e) {} return; }
      warmT = setTimeout(step, 300);
    }, 1200);
  }
  // 胎压异常：镜头拉近对着那个轮子，异常一直在就一直对着；几个轮子异常就轮流看（每个停 3.2 秒），新变异常的先看。
  // 用户自己转了车（或双击回正）就不再看，直到又有轮子新变异常；挂 D 挡时车顶视角四个轮子都在画面里，不看。
  // 和开门谁后发生看谁（同时发生先看轮子）；点了下面那行字里的某一条就看那一条（pin），转车或那一条没了才放开
  function tyreTour() {
    var ch = false;
    TYRES.forEach(function (w) {
      if (tyreBad[w]) { if (!tyreSeen[w]) { tyreSeen[w] = 1; tyreNew.push(w); tyreOff = false; tyreAt = Date.now(); ch = true; } }
      else if (tyreSeen[w]) { delete tyreSeen[w]; ch = true; }
    });
    if (root && ch) app.invalidate();
  }
  function canLook() { return !!(root && intro.t >= 1 && !editing && !showOn && !document.hidden && !guideOn()); }
  function guideOn() { var g = $('guide'); return !!(g && g.classList.contains('on')); }
  function canTour() { return !!(wheels && canLook()); }
  /** 每帧：现在该看哪儿——点的那一条 > 后发生的那个（轮子 / 门）> 挂 D 挡的车顶 > 展厅视角 */
  function lookTick() {
    var now = Date.now(), bad = TYRES.filter(function (w) { return tyreBad[w]; });
    if (guideOn() && (tour || doorV || pin)) { // 新手引导开始了：先不看，引导完了再看
      tour = null; pin = null; clearTimeout(tourTimer);
      if (doorV) { doorV = null; doorDue = now; }
      view.homing = true; view.vaz = 0;
    }
    if (pin) { // 点的那一条没了（轮胎恢复、门窗关上）：放开
      if (pin.tyres) pin.tyres = pin.tyres.filter(function (w) { return tyreBad[w]; });
      if (pin.tyres ? !pin.tyres.length : !pin.parts.some(function (k) { return (want[k] || 0) > 0.02; })) { pin = null; view.homing = true; view.vaz = 0; }
    }
    if (((bad.length && !tour) || doorDue) && !canLook()) doorWake(1000); // 还不能看（进场动画、引导、设置开着）：过一会儿再看一眼
    if (doorDue && now >= doorDue && canLook()) { doorDue = 0; doorFrame(); } // 门开了一会儿：转过去看
    if (doorEnd && now >= doorEnd) { doorEnd = 0; if (doorV) { doorV = null; view.homing = true; view.vaz = 0; } } // 全关上了：回去
    var list = !canTour() ? [] : pin ? pin.tyres || [] : bad.length && !tyreOff && !top.on && !preview && !(doorAuto() && doorAt > tyreAt + 1500) ? bad : []; // 门比胎压晚 1.5 秒以上才算后发生（同一次数据里一起到的先看轮子）
    tyreNew = tyreNew.filter(function (w) { return tyreBad[w] && !(tour && tour.w === w); }); // 新变异常的排队：当前这个看够了先看它们
    if (!list.length) { if (tour) { tour = null; clearTimeout(tourTimer); view.homing = true; view.vaz = 0; } return; }
    var i = tour ? list.indexOf(tour.w) : -1, next = function () { var j = 0; while (j < tyreNew.length && list.indexOf(tyreNew[j]) < 0) j++; return j < tyreNew.length ? tyreNew.splice(j, 1)[0] : ''; };
    if (i < 0) setTour(next() || list[0], list.length);
    else if (list.length > 1 && now > tour.until) setTour(next() || list[(i + 1) % list.length], list.length);
  }
  /** 看这个轮子：从轮子朝外的方向斜着看过去、拉近；几个轮流看时到点叫一帧（镜头停着不出帧） */
  function setTour(w, n) {
    var at = wheels[w].c.clone().applyMatrix4(root.matrixWorld);
    clearTimeout(tourTimer);
    tour = { w: w, at: at, zoom: TYRE_ZOOM, until: Date.now() + TOUR_HOLD + 1200, view: { az: Math.atan2(at.x, at.z), el: 0.3 } };
    view.homing = true; view.vaz = 0;
    if (n > 1) tourTimer = setTimeout(function () { if (root) app.invalidate(); }, TOUR_HOLD + 1250);
  }
  /** 不再自动看（用户自己转车、双击回正）：又有轮子新变异常、又开了一扇门才再看 */
  function stopLook() {
    if (tour || pin) { tour = null; pin = null; clearTimeout(tourTimer); }
    tyreOff = true;
    if (doorV || doorDue) { doorV = null; doorDue = doorEnd = 0; }
  }
  /** 点了下面那行字里的一条（go：{ tyres } 轮子 / { parts } 部件）：镜头转过去看着，转车或那一条没了才放开 */
  function lookAt(go) {
    if (!go || !root || !canLook()) return false;
    if (go.tyres) {
      var l = go.tyres.filter(function (w) { return wheels && wheels[w]; });
      if (!l.length) return false;
      pin = { tyres: l }; tour = null;
    } else {
      var f = frameOf(go.parts);
      if (!f) return false;
      pin = { parts: go.parts, v: f }; tour = null;
    }
    view.homing = true; view.vaz = 0; app.invalidate();
    return true;
  }
  // 门、引擎盖、尾门打开：镜头转到看得见的角度。一起开的几扇（先后差不到 0.9 秒）只转一次，一个画面框住全部开着的；
  // 开着就一直对着，又开了一扇才换角度（关上一扇不动）；全关上 1.5 秒后（看完关门）回去。车模上没有的部件不看
  var OPENS = { doorFL: DOORS.doorFL, doorFR: DOORS.doorFR, doorRL: DOORS.doorRL, doorRR: DOORS.doorRR, hood: LIDS.hood, trunk: LIDS.trunk };
  function doorWatch(c) {
    var open = Object.keys(OPENS).filter(function (k) { return parts[k] && c[OPENS[k]] === 'open'; });
    Object.keys(doorSeen).forEach(function (k) { if (open.indexOf(k) < 0) delete doorSeen[k]; }); // 关上了：下次开再看
    var fresh = open.filter(function (k) { return !doorSeen[k]; });
    fresh.forEach(function (k) { doorSeen[k] = 1; });
    doorOpen = open;
    if (fresh.length) { doorAt = doorBoot ? 0 : Date.now(); doorDue = Date.now() + 900; doorEnd = 0; doorWake(950); } // 车建好时就开着的门算早就开着（胎压数据常常在车建好之前就到了）：和胎压异常同时有时先看轮子
    else if (!open.length && doorV && !doorEnd) { doorEnd = Date.now() + 1500; doorWake(1550); }
    doorBoot = false;
  }
  function doorWake(ms) { clearTimeout(doorTimer); doorTimer = setTimeout(function () { if (root) app.invalidate(); }, ms); } // 镜头停着不出帧：到点叫一帧
  /** 每个开着的给一个想从哪边看（车门、车窗：这一边、门后面斜着看，门往前开，看得见门里和门洞；引擎盖：车头斜上方；尾门：车尾斜上方；
      天窗、遮阳帘：车后上方；充电口这类：从车中心朝它那边看），合起来取平均方向；方向越分散（两边都开着）看得越高、拉得越远，都放进画面 */
  function frameOf(keys) {
    if (!parts || !keys || !keys.length) return null;
    var sx = Math.sin(HOME.az) < 0 ? -1 : 1, sum = V(0, 0, 0), at = V(0, 0, 0), el = 0, n = 0; // 引擎盖、尾门、天窗从展厅视角那一边斜着看
    page.atRest(function () { // 按关着的样子取位置
      keys.forEach(function (k) {
        var p = parts[k], b = new T.Box3();
        if (!p) return;
        (p.meshes || []).forEach(function (m) { b.expandByObject(m); });
        if (b.isEmpty()) return;
        var c = b.getCenter(V(0, 0, 0)), d, e;
        if (k === 'hood') { d = V(sx * 0.5, 0, 1); e = 0.5; }
        else if (k === 'trunk') { d = V(sx * 0.5, 0, -1); e = 0.45; }
        else if (k === 'sunroof' || k === 'sunshade') { d = V(sx * 0.6, 0, -1); e = 0.85; }
        else if (/^(door|win)/.test(k)) { d = V(p.side || (c.x > 0 ? 1 : -1), 0, -0.8); e = 0.34; }
        else { d = V(c.x, 0, c.z); if (d.lengthSq() < 1e-6) d.set(sx, 0, 0); e = 0.3; }
        sum.add(d.normalize()); at.add(c);
        el = Math.max(el, e);
        n++;
      });
    });
    if (!n) return null;
    var len = sum.length(), spread = 1 - len / n;
    var f = { keys: keys.slice(), at: at.multiplyScalar(1 / n), want: 0.22 * (1 - spread), view: { az: len > 0.15 ? Math.atan2(sum.x, sum.z) : Math.PI, el: Math.min(0.9, el + spread * 0.45) } };
    f.zoom = fitZoom(f.view, f.at, f.want, true);
    return f;
  }
  function doorFrame() {
    var f = frameOf(doorOpen);
    if (!f) return;
    doorV = f;
    view.homing = true; view.vaz = 0;
    app.invalidate();
  }
  function doorAuto() { return !!doorV && !top.on && !preview && !editing; }
  function doorNow() { return !pin && !tour && doorAuto(); }
  /** 看轮子、看门时最多拉近多少（want，负的是拉远）：整车（wide：开着的门往外多算 0.4 米）还在顶栏和底下数据之间，不压着下面那行字 */
  function fitZoom(v, at, want, wide) {
    if (!fitA || !camera || !root) return want;
    var keep = [view.az, view.el, focusK, focusAt, focusZ, intro.t, showK, angK, tuneK, top.k, focusL], pts = [], hw = dims.hw + (wide ? 0.4 : 0.05), lo = -0.4, hi = want;
    for (var i = 0; i < 8; i++) pts.push(V(i & 1 ? hw : -hw, i & 2 ? dims.h : 0, i & 4 ? dims.hl : -dims.hl).applyMatrix4(root.matrixWorld));
    view.az = v.az; view.el = v.el; focusK = 1; focusAt = at; intro.t = 1; showK = angK = tuneK = 0; top.k = 0; focusL = 0.85;
    var ok = function (z) {
      focusZ = z; place();
      var mx = 0, mn = 1, my = -1;
      pts.forEach(function (c) { var q = c.clone().project(camera); mx = Math.max(mx, Math.abs(q.x)); my = Math.max(my, q.y); mn = Math.min(mn, q.y); });
      return mx <= fitA.aw && my <= fitA.yc + fitA.ah && mn >= fitA.yc - fitA.ah;
    };
    if (!ok(want)) { for (var it = 0; it < 14; it++) { var m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; } want = lo; }
    view.az = keep[0]; view.el = keep[1]; focusK = keep[2]; focusAt = keep[3]; focusZ = keep[4]; intro.t = keep[5]; showK = keep[6]; angK = keep[7]; tuneK = keep[8]; top.k = keep[9]; focusL = keep[10];
    place();
    return want;
  }
  function topNow() { return top.on && !preview && !tour && !(pin && pin.v); }
  function home() {
    if (editing && lookTo) return lookTo;
    if (pin && pin.v) return pin.v.view;
    if (tour) return tour.view;
    if (topNow()) return TOP;
    return doorNow() ? doorV.view : HOME;
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function place() {
    var r = 1 - easeOut(intro.t), qk = ease(top.k), sk = showK * showK * (3 - 2 * showK), ak = angK * angK * (3 - 2 * angK), tk = tuneK * tuneK * (3 - 2 * tuneK), ok = Math.max(sk, tk);
    var fov = S.get('viewFov');
    var az = view.az + r * intro.rot * INTRO.az, el = view.el + r * intro.rot * INTRO.el;
    var d = view.dist * (1 + r * INTRO.dist) * (1 - qk) + top.dist * qk;
    if (sk > 0) { az += wrap(SHOW.az - az) * ak; el += (SHOW.el - el) * ak; d *= 1 + (portrait ? 0.3 : 0.42) * sk; }
    if (tk > 0) d *= (1 + (portrait ? (compact ? 0.3 : 0.6) : 0.75) * tk) * (1 + (1 / zoom - 1) * tk); // 编辑车模：整辆车放进面板旁边那块（转到哪个角度都不压着面板），可以拉近拉远
    var ty = dims.h * (0.357 - 0.157 * qk), ce = Math.cos(el); // 车后上方往下看时看车身中间偏下（车顶不往上顶）
    aim.set(pan.x * tk, ty + pan.y * tk, pan.z * tk); // 编辑车模时看的那一点能挪开
    if (focusK > 0 && focusAt) { var fk = ease(focusK); aim.lerp(focusAt, fk * focusL); d *= 1 - focusZ * fk; } // 看胎压异常的轮子、开着的门：朝那边看、拉近一点（整车还在画面里）
    if (camera.fov !== fov) camera.fov = fov;
    if (M && M.fx.fb) { var px = 0.00625 * H / (2 * d * Math.tan(fov * Math.PI / 360)); M.fx.flake.value = M.fx.fb * Math.max(0, Math.min(1, (px - 1.5) / 1.5)); } // 一片闪点在屏幕上几个像素
    else if (M) M.fx.flake.value = 0;
    camera.position.set(aim.x + Math.sin(az) * ce * d, aim.y + Math.sin(el) * d, aim.z + Math.cos(az) * ce * d);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
    // 设置面板开着：横屏车往左让；竖屏面板占下面 64%，车放到顶栏下沿和面板上沿中间
    var showY = portrait ? (H / 2 - offY0) - (remPx * 1.15 + H * (tk > 0 && compact ? 0.54 : 0.36) - remPx * 0.16) / 2 : 0; // 竖屏圈选时面板缩成一条，车占上面一半多
    camera.setViewOffset(W, H, (sk * 0.2 + tk * 0.23) / Math.max(1, sk + tk) * (portrait ? 0 : W), offY0 + ok * showY, W, H);
  }
  /** 画完一帧：胎压标签跟着轮子走；在车另一边（被车身挡住）的藏起来；镜头拉近看轮子、看门时轮子落到下面那行状态字那儿：标签停在状态字上面 */
  var pv = V(0, 0, 0), tagMax = null;
  page.after = function () {
    roofPlace();
    if (!wheels) return;
    var cx = camera.position.x, rm = app.rem();
    if (tagMax === null) { var row = document.querySelector('#cStatus .c-row'), lp = $('tp-frontLeft').offsetParent; tagMax = row && lp ? row.getBoundingClientRect().top - lp.getBoundingClientRect().top - rm * 0.22 : 0; if (tagMax <= 0) tagMax = H; } // 标签下沿最多到状态字上沿
    TYRES.forEach(function (w) {
      var wh = wheels[w], lb = wh.label, far = cx * wh.side < -0.25 * view.dist;
      var bad = tyreBad[w], cls = 'tp' + (bad === 2 ? ' bad' : bad ? ' warn' : '') + (far || !labelsOn ? ' off' : '');
      if (lb.className !== cls) lb.className = cls;
      if (far) return;
      pv.copy(wh.at).applyMatrix4(root.matrixWorld).project(camera);
      lb.style.transform = 'translate3d(' + ((pv.x + 1) / 2 * W).toFixed(1) + 'px,' + Math.min((1 - pv.y) / 2 * H + rm * 0.38, tagMax).toFixed(1) + 'px,0)';
    });
  };

  // ================= 车顶上方的圆形按钮：空调开关（宿主的原生操作 vehicle.ac.setPower，不用车主确认） =================
  // 只在俯视时显示（挂 D 挡的车顶视角，或者自己拖到从上往下看），跟着车顶走（车顶正中往上一点投到屏幕上）；
  // 进场动画没完、调整车模、设置面板开着、跑出画面时不显示；宿主没有这个操作时整个不显示。
  // 按下去先按按下去的样子显示（半透明），车况推过来再对齐；4 秒没推过来或者失败就变回去，失败说一句原因
  var roofBtn = $('roofAc'), roofWant = null, roofTimer = 0;
  function acApi() { var v = window.uiplus && window.uiplus.vehicle; return v && v.ac && typeof v.ac.setPower === 'function' ? v.ac : null; }
  function roofState(c) {
    var on = c['ac.power'] === true;
    if (roofWant !== null && roofWant === on) { roofWant = null; clearTimeout(roofTimer); } // 车况跟上了
    var show = roofWant !== null ? roofWant : on, cls = 'roof-btn' + (show ? ' on' : '') + (roofWant !== null ? ' wait' : '') + (roofBtn.className.indexOf(' off') >= 0 ? ' off' : '');
    if (roofBtn.className !== cls) roofBtn.className = cls;
    if (roofBtn.getAttribute('aria-label') !== (show ? '关空调' : '开空调')) roofBtn.setAttribute('aria-label', show ? '关空调' : '开空调');
  }
  roofBtn.addEventListener('click', function (e) {
    var ac = acApi();
    e.stopPropagation();
    if (!ac || roofWant !== null) return;
    var to = D.car()['ac.power'] !== true;
    roofWant = to; roofState(D.car());
    clearTimeout(roofTimer);
    roofTimer = setTimeout(function () { roofWant = null; roofState(D.car()); }, 4000);
    Promise.resolve().then(function () { return ac.setPower(to); }).then(null, function (er) {
      var code = er && (er.code || er.error && er.error.code);
      roofWant = null; clearTimeout(roofTimer); roofState(D.car());
      D3.toast(code === 'PERMISSION_DENIED' ? '没开车控权限：在 Web 卡片管理页给这张卡片打开「车控」' : '空调没' + (to ? '开' : '关') + '成' + (er && er.message ? '：' + er.message : ''), 3500);
    });
  });
  function roofPlace() {
    var ok = !!(root && acApi() && intro.t > 0.8 && (showK < 0.05 || dbgOn) && tuneK < 0.05), x = 0, y = 0;
    if (ok) ok = (camera.position.y - aim.y) / (camera.position.distanceTo(aim) || 1) > 0.82; // 从上往下看（俯角 55° 以上）
    if (ok) {
      if (wheels) { // 四个轮子在画面上的正中间（前后轴中间、车厢上）：离前后两排胎压标签一样远。按车顶的点投的话，俯视时越高越往车头偏，和前轮的标签挤在一起
        TYRES.forEach(function (w) { pv.copy(wheels[w].c).applyMatrix4(root.matrixWorld).project(camera); x += (pv.x + 1) / 8 * W; y += (1 - pv.y) / 8 * H; });
      } else { pv.set(0, dims.h * 0.5, 0).applyMatrix4(root.matrixWorld).project(camera); x = (pv.x + 1) / 2 * W; y = (1 - pv.y) / 2 * H; }
      ok = pv.z < 1 && x > remPx * 0.4 && x < W - remPx * 0.4 && y > remPx * 1.1 && y < (tagMax || H) - remPx * 0.2; // 跑出画面、压着顶栏或下面那行字：藏起来
    }
    if (roofBtn.hidden !== !acApi()) roofBtn.hidden = !acApi();
    var cls = roofBtn.className.replace(/ off/g, '') + (ok ? '' : ' off');
    if (roofBtn.className !== cls) roofBtn.className = cls;
    if (ok) roofBtn.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
  }

  // ================= 尺寸：车放在顶栏和底下数据之间，按宽高自动定远近 =================
  page.resize = function (w, h, p) {
    if (portrait !== p || W !== w || H !== h) { portrait = p; ttKey = ''; setTimeout(function () { telltales(D.car()); }, 0); } // 尺寸变了：重新排、重新算哪些放得下
    W = w; H = h; portrait = p; tagMax = null;
    if (!camera) return;
    reflResize();
    var r = remPx = app.rem(), padT = (p ? 2.3 : 1.05) * r, padB = (p ? 2.75 : 2.0) * r, cy = (padT + h - padB) / 2; // 竖屏顶栏下面还有一排车况图标、车速
    camera.aspect = w / h;
    offY0 = h / 2 - cy;
    camera.setViewOffset(w, h, 0, offY0, w, h);
    // 二分找距离：默认角度下车的外框刚好占满可用宽度的 88%、可用高度的 92%；车后上方往下看时连两边的胎压标签一起装下
    var ah = (h - padT - padB) / h * 0.92, corners = [], tags = [], it0 = intro.t, sk0 = showK, ak0 = angK, qk0 = top.k, tk0 = tuneK, az = view.az, el0 = view.el;
    intro.t = 1; showK = angK = 0; tuneK = 0;
    for (var i = 0; i < 8; i++) corners.push(V(i & 1 ? dims.hw : -dims.hw, i & 2 ? dims.h : 0, i & 4 ? dims.hl : -dims.hl));
    if (wheels) TYRES.forEach(function (w) { var a = wheels[w].at; tags.push(a, V(a.x + wheels[w].side * 0.55, a.y, a.z)); }); // 标签从轮子外侧往外大约半米宽
    function fit(v, k, pts, aw) {
      var lo = 2, hi = 60;
      top.k = k; view.az = v.az; view.el = v.el;
      for (var it = 0; it < 22; it++) {
        view.dist = top.dist = (lo + hi) / 2;
        place();
        camera.updateProjectionMatrix();
        var mx = 0, mn = 1, my = -1;
        pts.forEach(function (c) { var q = c.clone().project(camera); mx = Math.max(mx, Math.abs(q.x)); my = Math.max(my, q.y); mn = Math.min(mn, q.y); });
        if (mx > aw || (my - mn) / 2 > ah) lo = view.dist; else hi = view.dist;
      }
      return hi;
    }
    var dTop = fit(TOP, 1, corners.concat(tags), p ? 0.9 : 0.8);
    view.dist = fit(HOME, 0, corners, p ? 0.94 : 0.86) / S.get('viewZoom'); // 设置里"车的大小"
    top.dist = dTop;
    intro.t = it0; showK = sk0; angK = ak0; top.k = qk0; tuneK = tk0; view.az = az; view.el = el0;
    fitA = { ah: ah, aw: p ? 0.94 : 0.86, yc: 1 - 2 * cy / h }; // yc：顶栏和底下数据中间那条线（投影后的坐标）
    if (doorV) doorV.zoom = fitZoom(doorV.view, doorV.at, doorV.want, true); // 正在看门时换了尺寸：重新算拉近多少
    if (pin && pin.v) pin.v.zoom = fitZoom(pin.v.view, pin.v.at, pin.v.want, true);
    place();
    camera.updateProjectionMatrix();
  };

  // ================= 手势 =================
  page.grab = function (x, y) {
    touchAt = Date.now();
    if (!root) return false;
    if (editing) return true;
    ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera);
    return ray.ray.intersectsBox(hitBox);
  };
  /** 调整车模圈选时：按在车上拖是涂，按在车外面拖是转车（不用切到"转车"）；按下 / 拖 / 抬起都带屏幕坐标 */
  var stroke = false;
  page.press = function (x, y) {
    if (editing && hingeHit(x, y)) { hdrag = { p: hmark.position.clone() }; return; }
    if (editing && plateHit(x, y)) { pdrag = { p: plates[pkey].getWorldPosition(V(0, 0, 0)) }; return; }
    if (editing && wrapHit(x, y) && window.D3Tune) { var gw = D3Tune.wrapGrab(wkey); if (gw) wdrag = { w: gw.w, i: gw.i, p: wmark.position.clone(), at0: gw.w.at.slice() }; return; }
    if (editing && wdraw && lineStart(x, y)) return; // 手绘线：按在车上是画，按在车外面是转车
    if (editing && window.D3Sel && D3Sel.active() && D3Sel.painting() && page.pickAt(x, y)) { stroke = true; D3Sel.press(x, y); }
  };
  page.drag = function (dx, dy, x, y) {
    if (hdrag) { hingeMove(x, y); return; }
    if (pdrag) { plateMove(x, y); return; }
    if (wdrag) { wrapMove(x, y); return; }
    if (wline) { lineMove(x, y); return; }
    if (stroke) { D3Sel.drag(x, y); return; }
    view.homing = false; view.vaz = 0; top.last = Date.now();
    stopLook(); // 用户自己转车：不再对着轮子、门，又有新的异常、又开了门才转过去
    if (intro.t < 1 && intro.rot) { var r = 1 - easeOut(intro.t); view.az += r * INTRO.az; view.el += r * INTRO.el; intro.rot = 0; } // 进场途中拖：从当前角度接着转
    view.az -= dx * 0.009;
    view.el = Math.max(0.04, Math.min(Math.max(top.k > 0.5 ? 1.3 : 0.62, view.el), view.el + dy * 0.004)); // 车后上方往下看时能再往上拖；看门时在高处：往下拖不跳
    hint();
  };
  /** cancel：这一下不算（又落了一根手指去缩放、平移，或者触摸被打断）：涂上的退回去 */
  page.release = function (vx, x, y, cancel) {
    if (hdrag) { hdrag = null; hTapAt = Date.now(); if (cancel) showHinge(); else hingeDone(); return; }
    if (pdrag) { pdrag = null; pTapAt = Date.now(); if (cancel) page.plates(cfg.plates); else plateDone(); return; }
    if (wdrag) {
      wTapAt = Date.now();
      cancelAnimationFrame(wRaf); wRaf = 0;
      if (cancel) { wdrag.w.at = wdrag.at0; wdrag = null; page.wraps(); } else { wrapDone(); wdrag = null; }
      return;
    }
    if (wline) { wTapAt = Date.now(); if (cancel) dropLine(); else lineDone(); return; }
    if (stroke) { stroke = false; if (cancel) D3Sel.cancel(); else D3Sel.release(); return; }
    view.vaz = -vx * 0.13; top.last = Date.now(); app.invalidate();
    clearTimeout(top.back);
    if (top.on) top.back = setTimeout(function () { if (app && root) app.invalidate(); }, 6100); // 停着不出帧：到点叫一帧，转回车后上方
  };
  page.tap = function (x, y) {
    if (Date.now() - hTapAt < 350 || Date.now() - pTapAt < 350) return; // 刚松开小球、车牌：这一下不算点零件
    if (editing && pkey && plateHit(x, y)) return; // 车牌页里点到车牌上：不算点零件（拖它就行）
    if (editing && wkey) { // 贴纸页：点车上是把贴纸贴到那里（刚松开小球的这一下不算）
      if (Date.now() - wTapAt < 350 || wrapHit(x, y)) return;
      var hp = wrapPick(x, y);
      if (hp) { if (window.D3Tune) D3Tune.wrapTap(hp); return; }
    }
    if (editing && !page.pickAt(x, y)) { // 编辑时点在车外面：双击回到看全车（远近、平移清零，角度回到这一项的）
      var t0 = Date.now();
      if (t0 - lastTap < 450) { lastTap = 0; page.viewAll(); view.homing = true; view.vaz = 0; if (window.D3Tune) D3Tune.zoomed(1); return; }
      lastTap = t0;
    }
    if (editing && window.D3Sel && D3Sel.active()) { // 圈选：点一下是涂一下 / 选一整块；转车模式点了不算
      var md = D3Sel.mode();
      if (md === 'smart') D3Sel.tap(x, y);
      else if (md !== 'rotate') { D3Sel.press(x, y); D3Sel.release(); }
      return;
    }
    if (editing) { if (window.D3Tune) D3Tune.picked(page.pickAt(x, y)); return; }
    var t = Date.now();
    if (t - lastTap < 450) { stopLook(); view.homing = true; view.vaz = 0; app.invalidate(); lastTap = 0; } else lastTap = t;
  };
  page.wake = function (on) { if (on) app.invalidate(); };
  /** 旁边开着面板（调试面板 'dbg'、全部车况 'info'）：车让到旁边，不转视角 */
  var asides = {};
  page.aside = function (k, on) { if (on) asides[k] = 1; else delete asides[k]; dbgOn = Object.keys(asides).length > 0; if (root) app.invalidate(); };
  page.debug = function (on) { page.aside('dbg', on); };
  page.focus = function (on) {
    showOn = on;
    if (!on && preview) { preview = false; view.homing = true; } // 关面板：结束预览
    if (root) app.invalidate();
  };
  /** 新手引导用：车在屏幕上的范围（车外框 8 个角投影出来） */
  /** 景深（画质极致）对焦的距离：镜头到看的那一点 */
  page.focusDist = function () { return camera ? camera.position.distanceTo(aim) : 10; };
  page.focusRect = function () {
    if (!root) return null;
    var q = V(0, 0, 0), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < 8; i++) {
      q.set(i & 1 ? dims.hw : -dims.hw, i & 2 ? dims.h : 0, i & 4 ? dims.hl : -dims.hl).project(camera);
      var x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * H;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  };
  /** 新手引导用：这些零件在屏幕上的范围（世界外框 8 个角投影出来） */
  page.rectOf = function (mids) {
    if (!modelObj || !camera || !mids || !mids.length) return null;
    var all = modelObj.userData.d3.meshes, b = new T.Box3();
    mids.forEach(function (id) { var m = all[id]; if (m && m.parent && m.visible) b.expandByObject(m); });
    return rectOfBox(b);
  };
  /** 一道路面光束（low / high / fogF / tail / reverse）在屏幕上的范围；没照着给 null */
  page.beamRect = function (slot) { var m = LS && LS.mesh(slot); return m ? rectOfBox(new T.Box3().setFromObject(m)) : null; };
  /** 编辑车模：把屏幕上 r 这块（灯、光束）放大、挪到 to 这块地方的正中、占它 fill 那么多，0.4 秒平滑过去（和两指缩放、平移一样） */
  page.frame = function (r, to, fill) {
    if (!editing || !r || !r.width || !r.height) return;
    var z1 = Math.max(0.6, Math.min(6, zoom * Math.min(to.width * fill / r.width, to.height * fill / r.height))), n = 12, i = 0;
    var ks = Math.pow(z1 / zoom, 1 / n), p = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, dx = (to.left + to.width / 2 - p.x) / n, dy = (to.top + to.height / 2 - p.y) / n;
    (function step() {
      if (!editing || i++ >= n) return;
      page.pinch(ks, p.x, p.y, dx, dy);
      p.x += dx; p.y += dy;
      requestAnimationFrame(step);
    })();
  };
  /** 车上的一块地方在屏幕上的范围：a、b 是两个角，按车的半宽、高、半长算的比例（x 左正、z 车头正） */
  page.rectOfCar = function (a, b) { return rectOfBox(new T.Box3(V(a[0] * dims.hw, a[1] * dims.h, a[2] * dims.hl), V(b[0] * dims.hw, b[1] * dims.h, b[2] * dims.hl))); };
  /** 世界坐标的外框在屏幕上的范围 */
  function rectOfBox(b) {
    if (!camera || b.isEmpty()) return null;
    var q = V(0, 0, 0), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < 8; i++) {
      q.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
      var x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * H;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  }
  /** 新手引导用：屏幕上点得到这些零件的一点（从外框中心往外找，avoid 是被面板挡住的范围），找不到给 null */
  page.pointOn = function (mids, avoid) {
    var r = page.rectOf(mids), pts = [];
    if (!r) return null;
    for (var i = 1; i < 6; i++) for (var j = 1; j < 6; j++) pts.push({ x: r.left + r.width * i / 6, y: r.top + r.height * j / 6 });
    pts.sort(function (a, b) { return Math.abs(a.x - r.left - r.width / 2) + Math.abs(a.y - r.top - r.height / 2) - Math.abs(b.x - r.left - r.width / 2) - Math.abs(b.y - r.top - r.height / 2); });
    for (var k = 0; k < pts.length; k++) {
      var p = pts[k];
      if (p.x < 8 || p.y < 8 || p.x > W - 8 || p.y > H - 8) continue;
      if (avoid && p.x > avoid.left && p.x < avoid.right && p.y > avoid.top && p.y < avoid.bottom) continue;
      var h = page.pickAt(p.x, p.y);
      if (h && mids.indexOf(h.mid) >= 0) return p;
    }
    return null;
  };
  /** 新手引导演示调整车模：on 先换成默认车模（不存，不放进场动画），off 换回现在用的车模（等退出编辑的过渡走完再换，旧车留到新车建好） */
  page.demo = function (on) {
    if (!scene) return Promise.resolve();
    var swap = function () { return D3Model.current().then(function (r) { rec = r; cur = {}; return parse(++gen, null, root); }).then(function () { intro.t = 1; }); };
    if (!on) return settle(swap);
    drop();
    var g = ++gen;
    rec = D3Model.def(); cur = {};
    return parse(g, null, root).then(function () { intro.t = 1; });
  };
  /** 编辑车模：开 / 关编辑模式 */
  page.edit = function (on) {
    editing = on;
    if (!on) { force = {}; forceLight = {}; lookTo = null; page.mark([]); page.flash([]); if (window.D3Sel) D3Sel.stop(); apply(D.car()); view.homing = true; }
    if (on) { intro.t = 1; view.vaz = 0; zoom = 1; pan.set(0, 0, 0); apply(D.car()); } // 进编辑：车马上静下来（门关上、灯灭掉）
    if (root) app.invalidate();
  };
  page.modelUI = modelUI;
  page.zoom = function (z) { zoom = z; if (root) app.invalidate(); };
  /** 编辑车模时缩放、平移：k 远近倍数（对着屏幕上 x, y 那一点缩放，那一点不动），dx, dy 两指一起拖了多少（车跟着手指走）。返回现在的远近 */
  page.pinch = function (k, x, y, dx, dy) {
    if (!editing || !root || !camera) return zoom;
    var z1 = Math.max(0.6, Math.min(6, zoom * k)), q = V(0, 0, 0), n = camera.getWorldDirection(V(0, 0, 0));
    ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera);
    if (z1 !== zoom && ray.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(n, aim), q)) {
      pan.add(q.clone().add(aim.clone().sub(q).multiplyScalar(zoom / z1)).sub(aim)); // 看的那一点往手指那边挪：离得近了，那一点在屏幕上的位置不变
    }
    zoom = z1;
    if (dx || dy) {
      var wpp = 2 * camera.position.distanceTo(aim) * Math.tan(camera.fov * Math.PI / 360) / H, e = camera.matrixWorld.elements;
      pan.x += (-e[0] * dx + e[4] * dy) * wpp; pan.y += (-e[1] * dx + e[5] * dy) * wpp; pan.z += (-e[2] * dx + e[6] * dy) * wpp;
    }
    var lim = Math.max(dims.hl, dims.hw, dims.h) * 1.5; // 别挪出车外太远
    if (pan.length() > lim) pan.setLength(lim);
    place();
    app.invalidate();
    if (window.D3Tune) D3Tune.zoomed(zoom);
    return zoom;
  };
  /** 编辑车模：镜头转到看得清这一项的角度（az 0 = 正对车头、π/2 = 左边、π = 车尾；el 俯视角），不给就回默认角度 */
  page.look = function (az, el) {
    lookTo = typeof az === 'number' ? { az: az, el: el } : null;
    view.homing = true; view.vaz = 0;
    if (root) app.invalidate();
  };
  /** 竖屏圈选时面板缩成一条工具栏：车占的地方大一些 */
  page.compact = function (on) { compact = !!on; if (root) app.invalidate(); };
  /** 圈选要用的：画布、相机、车的所有零件 */
  page.selCtx = function () {
    if (!modelObj) return null;
    return { renderer: app.renderer(), camera: camera, root: root, meshes: modelObj.userData.d3.meshes, W: function () { return W; }, H: function () { return H; },
      len: function () { return dims.hl * 2; }, invalidate: function () { app.invalidate(); }, changed: function (n) { if (window.D3Tune && D3Tune.selChanged) D3Tune.selChanged(n); } };
  };
  /** 编辑车模：回到看全车（远近、平移归零） */
  page.viewAll = function () { zoom = 1; pan.set(0, 0, 0); if (root) app.invalidate(); };
  /** 从列表选中时：这些网格闪 3 下（叠一层和车漆反差大的颜色，不被别的挡住）。at：从什么时候开始算（重建后接着闪，不从头来） */
  page.flash = function (mids, at) {
    flashes.forEach(function (o) { if (o.parent) o.parent.remove(o); });
    flashes = [];
    if (!modelObj || !mids || !mids.length) return;
    var hsl = M.paint.color.getHSL({});
    flashMat.color.setHSL(hsl.s < 0.2 ? 0.52 : (hsl.h + 0.5) % 1, 1, 0.55); // 车漆色相的对面；白、灰、黑车用青色
    var all = modelObj.userData.d3.meshes;
    mids.forEach(function (id) {
      var m = all[id];
      if (!m || m.isSkinnedMesh) return;
      var o = m.isInstancedMesh ? new T.InstancedMesh(m.geometry, flashMat, m.count) : new T.Mesh(m.geometry, flashMat);
      if (m.isInstancedMesh) o.instanceMatrix = m.instanceMatrix;
      o.raycast = function () {};
      o.renderOrder = 10;
      m.add(o); flashes.push(o);
    });
    flashT = at ? Math.max(0, (Date.now() - at) / 1000) : 0; // 已经闪了多久（重建后接着闪）
    app.invalidate();
  };
  /** 现在的车模和配置、网格 / 材质表 */
  page.model = function () { return rec ? { rec: rec, cfg: cfg, d3: modelObj && modelObj.userData.d3 } : null; };
  /** 屏幕上这一点点到的网格 → { mid, mat }（mat 是点到的那个面的原材质编号） */
  page.pickAt = function (x, y) {
    if (!modelObj) return null;
    ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera);
    var list = modelObj.userData.d3.meshes.filter(function (m) { return m.visible && m.parent; }), hit = ray.intersectObjects(list, false)[0];
    if (!hit) return null;
    var o = hit.object, mi = hit.face && Array.isArray(o.material) ? hit.face.materialIndex : 0;
    return { mid: o.userData.mid, mat: (o.userData.mats || [])[mi], name: o.name };
  };
  /** 点选高亮：给这些网格叠一层半透明的强调色（加子网格，不重建） */
  page.mark = function (mids, color) {
    marks.forEach(function (o) { if (o.parent) o.parent.remove(o); });
    marks = [];
    if (!modelObj || !mids.length) { if (root) app.invalidate(); return; }
    if (color) hiMat.color.set(color);
    var all = modelObj.userData.d3.meshes;
    mids.forEach(function (id) {
      var m = all[id];
      if (!m || !m.visible || m.isSkinnedMesh) return;
      var o = new T.Mesh(m.geometry, hiMat);
      o.raycast = function () {};
      m.add(o); marks.push(o);
    });
    app.invalidate();
  };
  /** 试开：k 是部件（doorFL / hood / winFL…），on 打开 / 关上 */
  page.force = function (k, on) {
    var bag = LIGHTS.indexOf(k) >= 0 || k === 'high' ? forceLight : force;
    if (on) bag[k] = 1; else delete bag[k];
    apply(D.car());
  };
  /** 调整车模里改了灯的颜色、效果、发光质感、光束、借灯打转向：马上生效，不重建车（只有换了灯的零件才重建） */
  page.lights = function (l, borrow) {
    if (!cfg) return;
    cfg.lights = JSON.parse(JSON.stringify(l || {}));
    if (borrow) cfg.borrow = true; else delete cfg.borrow;
    if (M) lightFx();
    if (app && root) app.invalidate();
  };
  /** 夜景（调整灯光时）：背景变黑、车身压暗，灯照常亮 */
  page.night = function (on) {
    nightW = !!on;
    el.classList.toggle('night', nightW);
    if (app && root) app.invalidate();
  };
  page.info = function () { return { tour: tour ? tour.w : '', door: doorV ? doorV.keys.join(',') : '', look: pin ? 'pin' : tour ? 'tyre' : doorNow() ? 'door' : '', top: Math.round(top.k * 100) / 100, shadow: !!(keyLight && keyLight.castShadow), refl: !!refl, flake: M ? Math.round(M.fx.fb * 100) / 100 : 0, env: !!(scene && scene.environment && scene.environment.image), paint: M ? '#' + M.paint.color.getHexString() : '', show: Math.round(showK * 100) / 100, turn: (turnOn.L ? 'L' : '') + (turnOn.R ? 'R' : ''),
    parts: parts ? Object.keys(parts).sort().join(',') : '', wheels: wheelN, model: rec ? rec.name : '', builtin: rec ? rec.builtin : null,
    dims: [dims.hw, dims.h, dims.hl].map(function (v) { return Math.round(v * 100) / 100; }).join(','), editing: editing,
    open: Object.keys(cur).filter(function (k) { return cur[k] > 0.5 && (DOORS[k] || LIDS[k] || WINS[k] || SLIDES[k] || FLAPS[k]); }).sort().join(','),
    plates: plates ? ['front', 'rear'].filter(function (k) { return plates[k].visible; }).join(',') : '',
    plateText: cfg && cfg.plates ? (cfg.plates.text || '') : '', plateStyle: cfg && cfg.plates ? (cfg.plates.style || '') : '',
    wraps: root && root.userData.wraps ? root.userData.wraps.count() : 0, wrapN: cfg && cfg.wraps ? cfg.wraps.length : 0,
    lamps: LS ? LIGHTS.filter(LS.has).join(',') : '', lights: LS ? LS.lit() : '', amb: LS ? LS.amb() : '', beams: LS ? LS.beams() : '', night: Math.round(nightK * 100) / 100, needs: page.needs.join(), welcome: welT < 1, coat: M ? Math.round(M.paint.clearcoat * 100) / 100 : null,
    zoom: Math.round(zoom * 100) / 100, pan: Math.round(pan.length() * 100) / 100, flash: flashes.length, az: Math.round(wrap(view.az) * 100) / 100 }; };
  // 设置变了：深浅色随时生效（页面没建也要换样式）；颜色渐变过去；默认视角的滑块：面板开着就转到默认视角预览
  S.on(function (k) {
    if (k === 'theme') theme(wantDark());
    if (k === 'bg' || k === 'bgDim') background();
    if (k === 'act:bgImage') pickBg();
    if (k === 'act:bgUse') { if (hasBg) S.set('bg', 'image'); else pickBg(); } // 选"图片"：存过就直接用，没有先挑一张
    if (k === 'stats') apply(D.car());
    if (k === 'act:viewSave') { S.set('viewAz', Math.round(wrap(view.az) * 1000) / 1000); S.set('viewEl', Math.round(Math.min(0.62, view.el) * 1000) / 1000); D3.toast('以后打开就是这个角度'); }
    if (k === 'viewAz' || k === 'viewEl') homeView();
    if (/^view(Az|El|Zoom|Fov)$/.test(k) && root) {
      if (S.isOpen()) preview = true;
      if (k === 'viewZoom' || k === 'viewFov') page.resize(W, H, portrait);
      view.homing = true; view.vaz = 0;
    }
    if (!root) return;
    if (/^(paint|rim|caliper|finish|paintHex|rimHex|calHex)$/.test(k)) finish(true);
    app.invalidate();
  });
  function hint() {
    var e = $('cHint');
    if (e.className === 'c-hint gone') return;
    e.className = 'c-hint gone';
    try { localStorage.setItem('d3-car-hint', '1'); } catch (er) {}
  }
  try { if (localStorage.getItem('d3-car-hint')) $('cHint').className = 'c-hint gone'; } catch (e) {}
  homeView(); view.az = HOME.az; view.el = HOME.el;
  stats(); background();

  page.fast = true; // 转车这类连着动的帧不用多重采样（main.js），停下来那一帧照常
  window.D3Car = page; // 调整车模（cartune.js）用
  D3.add(page);
})();
