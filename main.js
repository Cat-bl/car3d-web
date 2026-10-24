/* demo3d：three.js 3D 示例卡片的外壳。现在只有 3D 车况一页（唱片机页删了；按页组织的那套还留着：只有一页时没有圆点、不能滑）。
   同一时间只有当前页在运行：只有当前页建了 3D 场景、开着定时器和车机订阅；滑到别的页停稳后，旧页的场景、几何体、材质、贴图、定时器、订阅全部释放，
   再建新页（方便单独测每一页的消耗）。滑动途中两页的背景、文字和画布整条一起平移（像素 transform，交给合成线程），不画 3D 帧。
   车机 GPU 弱：只有一个 WebGL 画布（挂在当前页里）；按需渲染，画面不变就一帧都不画，页面要动时 update() 返回要的帧率，动完就停；
   卡片看不见时全停。
   设置里的帧率（30 / 60）和画质分开：画质管像素比、真实阴影（只在车上的东西动了才重画阴影贴图）、车漆闪点，
   高 / 极致再加后期效果（地面反射在 car3d.js；灯光辉光、环境光遮蔽、景深在这里用 EffectComposer 串起来，three-post.js 用到才加载）。
   静止不出帧，所以画质开多高，静止时都不占显卡；画质一变当前页重建（材质要按有没有阴影重新编译）。
   页面模块 D3.add({ id, el, needs: ['car' | 'media'], load(app) → Promise, unload(), resize(w, h, portrait), update(dt) → 0 / 帧率,
     scene, camera, after() 画完一帧（摆文字标签）, grab(x, y) 按在模型上 → 拖动转模型而不是切页, drag(dx, dy), release(vx), tap(x, y), wake(on) 卡片显示 / 隐藏,
     focus(on) 设置面板开 / 关, info() 测试用的状态, still 这一帧除了图层 1（灯的点亮层这类）别的都没变（见下面"只有灯在变"）, fast 连着动的帧不用多重采样（见下面"连着动的帧"） })。
   调整车模时 D3.lock(true)：按哪里都交给页面（转车、点选），不切页。D3.toast(文字) 底部一条提示。
   全部 ES5。 */
(function () {
  'use strict';
  var T = window.THREE;
  var pages = [], shown = [], cur = 0, locked = false, W = 0, H = 0, renderer = null, canvas = null, raf = 0, timer = 0, lastT = 0, lastDraw = 0;
  var live = null, ready = false, seq = 0, visible = true, hostVisible = true, started = false, sliding = false, slideTimer = 0;
  var strip = document.getElementById('strip'), dotsEl = document.getElementById('dots'), toastT = 0;
  var KEY = 'd3-page';

  // ================= 光照按中精度算（材质带 D3_LOWP 时） =================
  // 车机实测（Adreno 610，海豹 06）：车身材质的片元着色器整体用中精度，一帧的显卡时间少约四分之一，省下来的几乎都在光照公式（bsdfs）里。
  // 中精度只有 16 位、最小正规数约 6e-5、最大 65504，容易出事的几处保持高精度：插值进来的位置、法线、贴图坐标（varying），
  // 法线贴图、凹凸贴图（用屏幕上的导数算切线，值很小，中精度下溢后法线贴图会悄悄失效），环境图取样坐标（cube_uv：坐标精度不够反射会一块块的），
  // 阴影（顶点、片元两边都声明的 uniform 精度要一致）、薄膜干涉（相位数值大）、透射、裁切平面、对数深度。
  // 高光公式在中精度下加两道保护：GGX 的 a2 不小于 6.2e-5（再小就下溢成 0，高光中心 0/0 出黑点白点）、V × D 不超过 8192（掠射角上溢成无穷大）；
  // EPSILON 从 1e-6 改成 1e-4（1e-6 在中精度里是非正规数，有的显卡当 0）。高精度的材质（没带 D3_LOWP）着色器和原来一字不差。
  // 开着薄膜干涉（车漆质感珠光、变色龙）的整份着色器照旧高精度：车机上比过，变色龙在中精度下颜色明显不一样
  // 画质高 / 极致不用（settings.js 的 fx().lowp）：有辉光，万一哪个像素算出无穷大会晕开一片。主光照出的很锐的高光（默认车模 W70 的亮面车漆）
  // 在中精度下会变暗变短，所以只给标准打光（只有环境光）的车模用，见 car3d.js 的 lowp
  (function () {
    var LO = '#ifdef D3_MP\nprecision mediump float;\n#endif\n', HI = '#ifdef D3_MP\nprecision highp float;\n#endif\n';
    var keep = ['uv_pars_fragment', 'uv2_pars_fragment', 'iridescence_fragment', 'cube_uv_reflection_fragment', 'normal_pars_fragment', 'transmission_pars_fragment',
      'shadowmap_pars_fragment', 'bumpmap_pars_fragment', 'normalmap_pars_fragment', 'logdepthbuf_pars_fragment', 'clipping_planes_pars_fragment'];
    var c = T.ShaderChunk, b = c.bsdfs;
    b = b.replace('float D_GGX( const in float alpha, const in float dotNH ) {\n\tfloat a2 = pow2( alpha );',
      'float D_GGX( const in float alpha, const in float dotNH ) {\n#ifdef D3_MP\n\tfloat a2 = max( pow2( alpha ), 6.2e-5 );\n#else\n\tfloat a2 = pow2( alpha );\n#endif');
    b = b.split('return F * ( V * D );').join('#ifdef D3_MP\n\treturn F * min( V * D, 8192.0 );\n#else\n\treturn F * ( V * D );\n#endif');
    c.bsdfs = b;
    ['standard', 'physical'].forEach(function (k) {
      var s = T.ShaderLib[k], f = s.fragmentShader.replace('varying vec3 vViewPosition;', 'varying highp vec3 vViewPosition;')
        .replace('#include <common>', '#include <common>\n#ifdef D3_MP\n#undef EPSILON\n#define EPSILON 1e-4\n#endif');
      keep.forEach(function (n) { f = f.split('#include <' + n + '>').join(HI + '#include <' + n + '>\n' + LO); });
      s.fragmentShader = '#if defined( D3_LOWP ) && ! defined( USE_IRIDESCENCE )\n#define D3_MP\n#endif\n' + LO + f;
    });
  })();

  function now() { return Date.now(); }
  function rem() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 50; }

  // ================= 按需渲染 =================
  /** 要求画一帧（已经排了就不重复排）；fps 不到 55 时按这个帧率晚一点再画（省 GPU）；帧率设成 30 时最多 30 帧 */
  function invalidate(fps) {
    if (!fps) dirty = true; // 页面、手势、尺寸这些外面叫的：画面可能变了，存下的静止画面作废
    if (!started || !visible || !ready || raf) return;
    fps = Math.min(fps || 60, D3Set.get('fps') === '30' ? 30 : 60);
    if (fps < 55) {
      if (timer) return;
      var wait = Math.max(0, 1000 / fps - (performance.now() - lastDraw));
      timer = setTimeout(function () { timer = 0; if (!raf && started && visible && ready) raf = requestAnimationFrame(frame); }, wait); // 到点直接画（再走 invalidate 会又被限帧、一直排不上）
      return;
    }
    clearTimeout(timer); timer = 0;
    raf = requestAnimationFrame(frame);
  }
  function frame(t) {
    raf = 0;
    if (!live || !ready) return;
    var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 1 / 60; // 停了一阵之后的第一帧按 1/60 秒算（按 0 算的话车速这类渐变一步都不走，页面又以为没在动、不再出帧）
    lastT = t;
    var f = live.update ? live.update(dt) : 0, need = f === true ? 60 : f || 0;
    var act = !!(g && g.mode === 'rot') || !!pinch || !!mpan; // 手指正在转车、缩放、平移：视角是手势直接改的，页面自己不觉得在动，也算连着动
    if (post) {
      if (post.bokeh) post.bokeh.uniforms.focus.value = live.focusDist ? live.focusDist() : 10;
      post.c.render(dt);
    } else if (!act && live.still === true && renderer.capabilities.isWebGL2 && !renderer.shadowMap.needsUpdate) {
      if (still.ok && !dirty && stillSame()) stillDraw();
      else if (need) stillSave(); // 后面还要接着画（灯在动）：这一帧照常画，顺便存下来
      else { still.ok = false; renderer.render(live.scene, live.camera); }
    } else {
      still.ok = false;
      if ((need || act) && live.fast === true && !soft && aaOn && renderer.capabilities.isWebGL2) fastDraw();
      else renderer.render(live.scene, live.camera); // 停下来的那一帧照常按多重采样画
    }
    dirty = false;
    if (!need && !act) { stillDrop(); fastDrop(); } // 不动了：存的画面、离屏缓冲用不上了，显存还回去（贴图用的材质留着）
    drawn++;
    stashFree(live.id); // 这一页拆下来的旧材质：新的已经接过着色器了
    if (live.after) live.after();
    if (canvas.style.opacity !== '1') canvas.style.opacity = '1'; // 新页第一帧画好了再淡入
    lastDraw = performance.now();
    if (need) invalidate(need); else lastT = 0;
  }
  function stopFrames() { cancelAnimationFrame(raf); raf = 0; clearTimeout(timer); timer = 0; lastT = 0; }

  // ================= 只有灯在变：静止的部分画一次存下来 =================
  // 车停着、只有灯在动（氛围灯呼吸、转向灯、双闪、音乐律动）时，以前每帧都把整台车重画一遍——车模几十万到上百万个三角形，车机上画一帧几十毫秒，
  // 一直占着显卡。现在页面说这一帧只有图层 1（灯的点亮层、路面光束）在变（live.still）时：第一帧照常画，顺便把图层 0 的画面存成一张贴图、
  // 深度另画一遍存进深度贴图（只画写深度的，正反面、透明度裁切同原来的材质）；之后每帧把颜色连同深度贴回去，再只画图层 1。
  // 别的一变（转车、开门、换色、车况推来画面上的变化……任何外面叫的 invalidate）就作废、照常整帧画。后期效果（画质高 / 极致）不用这个。
  // 只画图层 1 时灯光也要算进来（灯光加上图层 1）：光照设置一变，three 下一帧整帧画时每个材质都要重新取一遍着色器程序
  var OV = 1, dirty = true, v2a = new T.Vector2(), v2b = new T.Vector2(), m4 = new T.Matrix4();
  /** 盖满画布的四边形（贴回存下的画面、FXAA）。材质一直留着：释放了 three 会把着色器程序一起删掉，下次又要编译（车机上每次开始转车都要卡一下） */
  function quad(fs, uniforms) {
    var m = new T.ShaderMaterial({ uniforms: uniforms, vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: fs, blending: T.NoBlending, toneMapped: false });
    var q = new T.Mesh(new T.PlaneGeometry(2, 2), m), sc = new T.Scene();
    q.frustumCulled = false;
    sc.add(q);
    return { m: m, sc: sc, cam: new T.Camera() };
  }
  // buf：存下的颜色（从画布拷）、深度（另画一遍）和画深度用的离屏缓冲，不动了就释放；dm：画深度用的材质（按原材质记）
  var still = { buf: null, q: null, dm: {}, ok: false, scene: null, m: new T.Matrix4() };
  function stillBuf(w, h) {
    if (still.buf && still.buf.w === w && still.buf.h === h) return;
    stillDrop();
    var dt = new T.DepthTexture(w, h);
    dt.type = T.UnsignedIntType;
    var rt = new T.WebGLRenderTarget(w, h, { depthTexture: dt, stencilBuffer: false, minFilter: T.NearestFilter, magFilter: T.NearestFilter, generateMipmaps: false });
    var color = new T.FramebufferTexture(w, h, T.RGBAFormat);
    if (!still.q) {
      still.q = quad('uniform sampler2D tC;\nuniform sampler2D tD;\nuniform vec2 uS;\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / uS;\n  gl_FragColor = texture2D(tC, uv);\n  gl_FragDepthEXT = texture2D(tD, uv).r;\n}',
        { tC: { value: null }, tD: { value: null }, uS: { value: new T.Vector2() } });
      still.q.m.depthFunc = T.AlwaysDepth; // 深度原样写回去（深度测试开着才写得进去）
      still.q.m.extensions.fragDepth = true;
    }
    var u = still.q.m.uniforms;
    u.tC.value = color; u.tD.value = dt; u.uS.value.set(w, h);
    still.buf = { w: w, h: h, color: color, depth: dt, rt: rt };
  }
  function stillDrop() {
    still.ok = false;
    if (!still.buf) return;
    still.buf.rt.dispose(); still.buf.depth.dispose(); still.buf.color.dispose();
    still.buf = null;
  }
  /** 镜头、场景、画布大小都没变 */
  function stillSame() {
    var c = live.camera, a = still.m.elements, sz = renderer.getDrawingBufferSize(v2a);
    if (!still.buf || still.scene !== live.scene || sz.x !== still.buf.w || sz.y !== still.buf.h) return false;
    var b = m4.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).elements;
    for (var i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-7) return false;
    return true;
  }
  /** 写深度用的材质：只写深度，正反面、深度测试、偏移、透明度裁切照原来的材质 */
  function depthMat(m) {
    var d = still.dm[m.id], at = m.alphaTest || 0, key = [m.side, at > 0, at > 0 && !!m.map, at > 0 && !!m.alphaMap].join();
    if (!d) d = still.dm[m.id] = new T.MeshBasicMaterial({ colorWrite: false });
    if (d.userData.k !== key) { d.userData.k = key; d.needsUpdate = true; }
    d.side = m.side; d.visible = m.visible !== false && m.depthWrite !== false;
    d.depthTest = m.depthTest; d.depthFunc = m.depthFunc;
    d.polygonOffset = m.polygonOffset; d.polygonOffsetFactor = m.polygonOffsetFactor; d.polygonOffsetUnits = m.polygonOffsetUnits;
    d.alphaTest = at; d.map = at > 0 ? m.map || null : null; d.alphaMap = at > 0 ? m.alphaMap || null : null; d.opacity = at > 0 ? m.opacity : 1;
    return d;
  }
  function stillSave() {
    var sc = live.scene, cam = live.camera, mask = cam.layers.mask, ac = renderer.autoClear, sz = renderer.getDrawingBufferSize(v2a);
    stillBuf(sz.x, sz.y);
    var hide = [], swap = [], used = {};
    sc.traverse(function (o) { if (o.isLight) o.layers.enable(OV); });
    cam.layers.set(0);
    renderer.render(sc, cam); // 除了点亮层的画面，存下来
    renderer.copyFramebufferToTexture(v2b.set(0, 0), still.buf.color);
    sc.traverse(function (o) { // 深度：每个零件换成只写深度的材质再画一遍
      if (!o.visible || !o.layers.test(cam.layers)) return;
      if (o.isMesh && o.material) {
        var arr = Array.isArray(o.material), l = (arr ? o.material : [o.material]).map(function (m) { used[m.id] = 1; return depthMat(m); });
        swap.push(o, o.material); o.material = arr ? l : l[0];
      } else if (o.isLine || o.isPoints || o.isSprite) { hide.push(o); o.visible = false; }
    });
    var bg = sc.background;
    sc.background = null;
    renderer.setRenderTarget(still.buf.rt);
    renderer.clear();
    renderer.render(sc, cam);
    renderer.setRenderTarget(null);
    sc.background = bg;
    for (var i = 0; i < swap.length; i += 2) swap[i].material = swap[i + 1];
    hide.forEach(function (o) { o.visible = true; });
    for (var k in still.dm) if (!used[k]) { still.dm[k].dispose(); delete still.dm[k]; }
    cam.layers.set(OV); // 点亮层叠上去（画布上还是刚才画的颜色和深度）
    renderer.autoClear = false;
    renderer.render(sc, cam);
    renderer.autoClear = ac; cam.layers.mask = mask;
    still.ok = true; still.scene = sc;
    still.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }
  function stillDraw() {
    var cam = live.camera, mask = cam.layers.mask, ac = renderer.autoClear;
    renderer.render(still.q.sc, still.q.cam); // 存下的颜色、深度贴回去
    cam.layers.set(OV);
    renderer.autoClear = false;
    renderer.render(live.scene, cam);
    renderer.autoClear = ac; cam.layers.mask = mask;
  }
  /** 拆页时：画深度用的材质也释放（原材质都没了） */
  function stillFree() {
    stillDrop();
    for (var k in still.dm) still.dm[k].dispose();
    still.dm = {}; still.scene = null;
  }
  // ================= 连着动的帧：不用多重采样 =================
  // 车机（Adreno 610）是分块画的：画布开着 4 倍多重采样时块数是 4 倍，每块都要把场景里的每次绘制（每个零件、每个材质的状态）重放一遍——
  // 零件多、材质多的车模这部分比画像素本身还贵（海豹 06，215 万个三角形、150 个材质，车机实测：一帧 120ms，不开多重采样 66ms，再缩小分辨率几乎不省）。
  // 所以转车、镜头转过去这类连着动的帧（页面 fast，下一帧还要接着画）画进一张不开多重采样的离屏缓冲，再过一遍 FXAA 贴到画布上（边缘平滑，几乎不花时间）；
  // 停下来那一帧照常按多重采样直接画在画布上，和原来一样清楚。离屏缓冲标成 XR 的：three r149 画进它时着色器按 sRGB 输出（和画到屏幕上同一套程序，
  // 不用重新编译）、存成普通 8 位（RGBA8）不做转换，贴上去就是原样；深度用 24 位的深度贴图（不带模板时 r149 的渲染缓冲是 16 位的，贴得很近的零件会打架）
  // FXAA：Timothy Lottes 的简化版（四个斜角取亮度找边的方向，沿边取两三个点混合）。画布是透明的、颜色预乘过透明度，亮度里算上透明度，车的轮廓也平滑
  var FXAA = [
    'uniform sampler2D tC;', 'uniform vec2 uR;',
    'float L(vec4 c) { return dot(c.rgb, vec3(0.299, 0.587, 0.114)) * 0.7 + c.a * 0.3; }',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy * uR;',
    '  vec4 cM = texture2D(tC, uv);',
    '  float lM = L(cM), lNW = L(texture2D(tC, uv + vec2(-1.0, 1.0) * uR)), lNE = L(texture2D(tC, uv + uR)),',
    '    lSW = L(texture2D(tC, uv - uR)), lSE = L(texture2D(tC, uv + vec2(1.0, -1.0) * uR));',
    '  float mn = min(lM, min(min(lNW, lNE), min(lSW, lSE))), mx = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
    '  if (mx - mn < max(0.04, mx * 0.12)) { gl_FragColor = cM; return; }',
    '  vec2 d = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));',
    '  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);',
    '  d = clamp(d / (min(abs(d.x), abs(d.y)) + red), vec2(-8.0), vec2(8.0)) * uR;',
    '  vec4 a = 0.5 * (texture2D(tC, uv - d / 6.0) + texture2D(tC, uv + d / 6.0));',
    '  vec4 b = a * 0.5 + 0.25 * (texture2D(tC, uv - d * 0.5) + texture2D(tC, uv + d * 0.5));',
    '  float lb = L(b);',
    '  gl_FragColor = lb < mn || lb > mx ? a : b;',
    '}'].join('\n');
  // 软件渲染（测试用的无头浏览器、没有显卡的电脑）不用：它没有分块重放的开销，换一种画布格式（不开多重采样）却要把每个着色器重新编一遍，第一帧卡好几秒
  var fast = { rt: null, q: null }, soft = false; // rt 不动了就释放；q 一直留着
  function fastDraw() {
    var sz = renderer.getDrawingBufferSize(v2a);
    if (!fast.rt || fast.rt.width !== sz.x || fast.rt.height !== sz.y) {
      fastDrop();
      var rt = fast.rt = new T.WebGLRenderTarget(sz.x, sz.y, { depthTexture: new T.DepthTexture(sz.x, sz.y), stencilBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false });
      rt.isXRRenderTarget = true; rt.texture.encoding = T.sRGBEncoding;
      rt.texture.internalFormat = 'RGBA8'; // 不然 three 按 sRGB 编码建成 SRGB8_ALPHA8：车机驱动取的时候转成线性，贴上去整个变暗（电脑上的软件渲染不转，看不出来）
      if (!fast.q) { fast.q = quad(FXAA, { tC: { value: null }, uR: { value: new T.Vector2() } }); fast.q.m.depthTest = false; fast.q.m.depthWrite = false; }
      fast.q.m.uniforms.tC.value = rt.texture; fast.q.m.uniforms.uR.value.set(1 / sz.x, 1 / sz.y);
    }
    renderer.setRenderTarget(fast.rt);
    renderer.render(live.scene, live.camera);
    renderer.setRenderTarget(null);
    renderer.render(fast.q.sc, fast.q.cam);
  }
  function fastDrop() {
    if (!fast.rt) return;
    fast.rt.depthTexture.dispose(); fast.rt.dispose();
    fast.rt = null;
  }

  // ================= 页面和圆点 =================
  /** 圆点按页数画（只有一页就不显示） */
  function refresh() {
    var id = shown[cur] ? shown[cur].id : null;
    shown = pages.slice();
    var i = 0;
    shown.forEach(function (p, k) { if (p.id === id) i = k; });
    cur = i;
    dotsEl.innerHTML = '';
    if (shown.length > 1) shown.forEach(function (p, k) { var d = document.createElement('i'); d.addEventListener('click', function () { go(k); }); dotsEl.appendChild(d); });
    resize();
    dots();
    if (started && !sliding && shown[cur] !== live) activate(cur);
  }

  // ================= 建 / 拆当前页 =================
  function activate(i) {
    var p = shown[i];
    if (live === p) return;
    deactivate();
    live = p; ready = false;
    var s = ++seq;
    canvas.style.opacity = '0';
    p.el.insertBefore(canvas, p.el.querySelector('.ui'));
    D3Data.use(visible ? p.needs || [] : []);
    Promise.resolve(p.load(app)).then(function () {
      if (s !== seq) return;
      ready = true;
      makePost();
      if (p.resize) p.resize(W, H, W < H);
      if (!visible && p.wake) p.wake(false);
      if (D3Set.isOpen() && p.focus) p.focus(true);
      invalidate();
    }, function (e) { if (s === seq) console.error('3D 页面加载失败', e); });
  }
  function deactivate() {
    if (!live) return;
    seq++;
    stopFrames();
    var p = live;
    live = null; ready = false;
    dropPost();
    stillFree(); fastDrop();
    D3Data.use([]);
    unloading = p.id;
    p.unload();
    unloading = '';
    renderer.renderLists.dispose();
    renderer.clear();
  }

  // ================= 切页：整条用 CSS 过渡滑过去（合成线程），停稳后才换 3D 场景 =================
  function place(x, anim) {
    strip.style.transition = anim ? 'transform .42s cubic-bezier(.22, .8, .24, 1)' : 'none';
    strip.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
  }
  function go(i, ms) {
    i = Math.max(0, Math.min(shown.length - 1, i));
    var changed = i !== cur;
    cur = i;
    dots();
    if (changed) { try { localStorage.setItem(KEY, shown[cur].id); } catch (e) {} }
    var instant = ms === 0 || !W;
    place(-cur * W, !instant);
    sliding = !instant;
    clearTimeout(slideTimer);
    if (instant) settle();
    else slideTimer = setTimeout(function () { if (sliding) settle(); }, 520); // 已经在目标位置时不会有 transitionend
  }
  function settle() {
    sliding = false;
    if (started && shown[cur] !== live) activate(cur);
  }
  strip.addEventListener('transitionend', function (e) { if (e.target === strip && sliding) settle(); });
  function dots() {
    for (var i = 0; i < dotsEl.children.length; i++) dotsEl.children[i].className = i === cur ? 'on' : '';
    if (shown[cur]) document.getElementById('app').setAttribute('data-at', shown[cur].id); // 圆点按当前页换深浅
  }

  // ================= 手势：按在模型上拖 = 转模型；别的地方左右滑 = 切页；没怎么动 = 点 =================
  var g = null;
  function start(x, y, target) {
    if (target && target.closest && target.closest('button, .set, .guide, .busy')) return; // 按钮、设置面板、新手引导、导入进度框走原生点击和滚动
    var edge = !locked && (x < W * 0.1 || x > W * 0.9); // 屏幕两边一窄条永远是切页（调整车模时不切页）
    g = { x0: x, y0: y, x: x, y: y, t0: now(), lt: now(), vx: 0, mode: '', rot: !sliding && !edge && ready && live === shown[cur] && live.grab && live.grab(x, y) };
    if (sliding) { // 正在滑的时候按住：停在当前位置接着拖
      var m = new WebKitCSSMatrix(getComputedStyle(strip).transform);
      g.base = m.m41; place(m.m41, false); sliding = false;
    } else g.base = -cur * W;
  }
  function move(x, y) {
    if (!g) return;
    var dx = x - g.x, dy = y - g.y, t = now();
    g.vx = dx / Math.max(1, t - g.lt); g.lt = t;
    g.x = x; g.y = y;
    if (!g.mode) {
      var ax = Math.abs(x - g.x0), ay = Math.abs(y - g.y0);
      if (ax < 8 && ay < 8) return;
      g.mode = g.rot ? 'rot' : ax > ay && !locked && shown.length > 1 ? 'swipe' : 'none';
      if (g.mode === 'rot' && live.press) live.press(g.x0, g.y0); // 圈选时从按下的地方开始涂
    }
    if (g.mode === 'rot') { live.drag(dx, dy, x, y); invalidate(); }
    else if (g.mode === 'swipe') {
      var p = -(g.base + x - g.x0) / W;
      p = Math.max(0, Math.min(shown.length - 1, p)); // 到头了就停住，不往外拉（外面是黑底）
      place(-p * W, false);
    }
  }
  function end(x, y) {
    if (!g) return;
    var s = g;
    g = null;
    if (s.mode === 'rot') { live.release(s.vx, x, y); invalidate(); return; }
    if (s.mode === 'swipe') {
      var p = -(s.base + x - s.x0) / W, target = Math.round(p);
      if (s.vx < -0.45) target = Math.floor(p) + 1;
      else if (s.vx > 0.45) target = Math.ceil(p) - 1;
      go(Math.max(cur - 1, Math.min(cur + 1, target)));
      return;
    }
    if (s.base !== -cur * W) { go(cur); return; }
    if (!s.mode && ready && live && live.tap && now() - s.t0 < 500) live.tap(x, y);
  }
  var touchedAt = 0;
  function touch(e) { touchedAt = now(); return e.changedTouches && e.changedTouches[0]; }
  // 调整车模时（当前页有 pinch）：两指捏合是缩放、两指一起拖是平移；电脑上滚轮缩放、右键拖平移。按在面板、按钮上的不算
  var pinch = null;
  function canPinch(target) { return locked && ready && live && live.pinch && !(target && target.closest && target.closest('button, .set, .guide, .busy')); }
  function two(e) {
    var a = e.touches[0], b = e.touches[1];
    return { d: Math.sqrt(Math.pow(a.clientX - b.clientX, 2) + Math.pow(a.clientY - b.clientY, 2)), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }
  document.addEventListener('touchstart', function (e) {
    var t = touch(e);
    if (e.touches.length === 2 && canPinch(e.touches[0].target) && canPinch(e.touches[1].target)) {
      if (g) { var s = g; g = null; if (s.mode === 'rot') live.release(0, s.x, s.y, true); } // 第一根手指的转车 / 点选 / 涂的那一笔作废
      pinch = two(e);
      return;
    }
    if (t && !g && !pinch) start(t.clientX, t.clientY, e.target);
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (pinch) {
      if (e.touches.length >= 2) { var p = two(e); live.pinch(pinch.d > 0 ? p.d / pinch.d : 1, p.x, p.y, p.x - pinch.x, p.y - pinch.y); pinch = p; invalidate(); }
      e.preventDefault();
      return;
    }
    var t = touch(e);
    if (t && g) { move(t.clientX, t.clientY); if (g && g.mode && g.mode !== 'none') e.preventDefault(); }
  }, { passive: false });
  document.addEventListener('touchend', function (e) {
    if (pinch) { touchedAt = now(); if (e.touches.length < 2) pinch = null; return; } // 剩下那根手指不接着转车，抬起来再按才算
    var t = touch(e);
    if (t) end(t.clientX, t.clientY);
  });
  document.addEventListener('touchcancel', function () { pinch = null; if (g) { var s = g; g = null; if (s.mode === 'rot') live.release(0, s.x, s.y, true); else go(cur); } });
  // 面板（设置、调整车模）里的滑块：Chromium 74 的滑块一按下值就跳到手指的位置、整个手势被它吃掉——手指翻面板时划过滑块就把值改了，面板也翻不动。
  // 改成自己接：竖着划是翻面板，横着拖才改值（从按下时的值跟着手指挪，不跳），点一下不改
  var sl = null;
  document.addEventListener('touchstart', function (e) {
    var el = e.target;
    if (!el || el.type !== 'range' || e.touches.length !== 1 || !el.closest('.set-body')) return;
    e.preventDefault();
    var p = e.touches[0];
    sl = { el: el, box: el.closest('.set-body'), x: p.clientX, y: p.clientY, top: 0, v: +el.value, mode: '' };
    sl.top = sl.box.scrollTop;
  }, { passive: false, capture: true });
  document.addEventListener('touchmove', function (e) {
    if (!sl) return;
    var p = e.touches[0], dx = p.clientX - sl.x, dy = p.clientY - sl.y;
    if (!sl.mode && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) sl.mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (sl.mode === 'y') sl.box.scrollTop = sl.top - dy;
    if (sl.mode === 'x') {
      var el = sl.el, min = +el.min, max = +el.max, st = +el.step || 1, w = el.getBoundingClientRect().width || 1;
      var v = Math.max(min, Math.min(max, Math.round((sl.v + dx / w * (max - min) - min) / st) * st + min));
      v = +v.toFixed(6);
      if (+el.value !== v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    e.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener('touchend', function () { if (sl && sl.mode === 'x') sl.el.dispatchEvent(new Event('change', { bubbles: true })); sl = null; }, true);
  document.addEventListener('touchcancel', function () { if (sl && sl.mode === 'x') sl.el.dispatchEvent(new Event('change', { bubbles: true })); sl = null; }, true);
  // 电脑上用鼠标预览；触摸之后浏览器还会补发一套鼠标事件，1 秒内的不理（不然点一下算两下）
  var mouse = false, mpan = null;
  document.addEventListener('mousedown', function (e) {
    if (now() - touchedAt <= 1000) return;
    if (e.button === 2 && canPinch(e.target)) { mpan = { x: e.clientX, y: e.clientY }; return; }
    if (e.button === 0 && !g) { mouse = true; start(e.clientX, e.clientY, e.target); }
  });
  document.addEventListener('mousemove', function (e) {
    if (mpan) { if (live && live.pinch) live.pinch(1, e.clientX, e.clientY, e.clientX - mpan.x, e.clientY - mpan.y); mpan = { x: e.clientX, y: e.clientY }; invalidate(); return; }
    if (mouse) move(e.clientX, e.clientY);
  });
  document.addEventListener('mouseup', function (e) { if (mpan && e.button === 2) { mpan = null; return; } if (mouse) { mouse = false; end(e.clientX, e.clientY); } });
  document.addEventListener('contextmenu', function (e) { if (locked) e.preventDefault(); });
  document.addEventListener('wheel', function (e) {
    if (!canPinch(e.target)) return; // 面板里照常滚动
    e.preventDefault();
    live.pinch(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), e.clientX, e.clientY, 0, 0);
    invalidate();
  }, { passive: false });

  // ================= 尺寸、可见性 =================
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    // 在输入框里打字（贴纸的文字）弹出软键盘：只是变矮了，布局、画布都不跟着变（根字号 viewport.js 也按原来的高度算）
    if (window.VIEWPORT && VIEWPORT.typing() && w === W && h < H) return;
    W = w; H = h;
    if (!W || !H) return;
    var portrait = W < H;
    document.documentElement.className = portrait ? 'portrait' : 'landscape';
    shown.forEach(function (p, i) { p.el.style.left = (i * W) + 'px'; p.el.style.width = W + 'px'; });
    place(-cur * W, false); sliding = false;
    if (!renderer) return;
    renderer.setSize(W, H, false);
    if (post) post.c.setSize(W, H);
    if (live && ready && live.resize) live.resize(W, H, portrait);
    invalidate();
  }
  function setVisible() {
    var v = !document.hidden && hostVisible;
    if (v === visible) return;
    visible = v;
    if (live) {
      D3Data.use(v ? live.needs || [] : []);
      if (ready && live.wake) live.wake(v);
    }
    if (v) invalidate(); else stopFrames();
  }
  document.addEventListener('visibilitychange', setVisible);
  // 新版宿主（2.1.1.19 起）：卡片被收起但 WebView 还留着时 document.hidden 不一定变，宿主另外通知。
  // SDK（APK 里的 assets/webcard/uiplus.js）2.1.1.29 放在 uiplus.lifecycle 下，早先的放在 uiplus 下面
  var vis = window.uiplus && ((window.uiplus.lifecycle && window.uiplus.lifecycle.onVisibilityChange) || window.uiplus.onVisibilityChange);
  if (typeof vis === 'function') {
    try { vis(function (e) { hostVisible = !e || e.visible !== false; setVisible(); }); } catch (e) {}
  }

  // ================= 给页面用的小工具 =================
  /** 摄影棚环境光（车漆、玻璃、金属的反射），用完 dispose()。kind 'studio'：真实影棚拍的环境图（env-hdr.js，解开一次留着）；
      'neutral'：Google model-viewer 默认的中性环境（照它的 EnvironmentScene.ts 的 neutral，Apache-2.0）——四周都有光、灰白不偏色，
      配 Khronos PBR Neutral 色调映射、曝光 1 时，底色多少画出来就差不多是多少（model-viewer 文档"glTF Color Accuracy"）；
      不给或者解不开：three.js 自带的程序生成的简易影棚（几块灯板） */
  var hdr = null;
  var NEUTRAL = { // model-viewer 的 neutral：[位置, 绕 y 转, 大小] 的盒子、[亮度, 位置, 大小] 的灯板
    top: [400, [0.5, 14.0, 0.5]], room: [[0.0, 13.2, 0.0], [31.5, 28.5, 31.5]],
    boxes: [[[-10.906, -1.0, 1.846], -0.195, [2.328, 7.905, 4.651]], [[-5.607, -0.754, -0.758], 0.994, [1.970, 1.534, 3.955]], [[6.167, -0.16, 7.803], 0.561, [3.927, 6.285, 3.687]],
      [[-2.017, 0.018, 6.124], 0.333, [2.002, 4.566, 2.064]], [[2.291, -0.756, -2.621], -0.286, [1.546, 1.552, 1.496]], [[-2.193, -0.369, -5.547], 0.516, [3.875, 3.487, 2.986]]],
    lights: [[80, [-14.0, 10.0, 8.0], [0.1, 2.5, 2.5]], [80, [-14.0, 14.0, -4.0], [0.1, 2.5, 2.5]], [23, [14.0, 12.0, 0.0], [0.1, 5.0, 5.0]], [16, [0.0, 9.0, 14.0], [5.0, 5.0, 0.1]],
      [80, [7.0, 8.0, -14.0], [2.5, 2.5, 0.1]], [80, [-7.0, 16.0, -14.0], [2.5, 2.5, 0.1]], [1, [0.0, 20.0, 0.0], [0.1, 0.1, 0.1]]]
  };
  function neutralScene() {
    var sc = new T.Scene(), g = new T.BoxGeometry(), mats = [], add = function (m, p, s, ry) { var o = new T.Mesh(g, m); o.position.fromArray(p); o.scale.fromArray(s); o.rotation.y = ry || 0; sc.add(o); };
    g.deleteAttribute('uv');
    sc.position.y = -3.5;
    var top = new T.PointLight(0xffffff, NEUTRAL.top[0], 28, 2);
    top.position.fromArray(NEUTRAL.top[1]);
    sc.add(top);
    var roomM = new T.MeshStandardMaterial({ metalness: 0, side: T.BackSide }), boxM = new T.MeshStandardMaterial({ metalness: 0 });
    mats.push(roomM, boxM);
    add(roomM, NEUTRAL.room[0], NEUTRAL.room[1]);
    NEUTRAL.boxes.forEach(function (b) { add(boxM, b[0], b[2], b[1]); });
    NEUTRAL.lights.forEach(function (l) { var m = new T.MeshBasicMaterial(); m.color.setScalar(l[0]); mats.push(m); add(m, l[1], l[2]); });
    sc.userData.free = function () { g.dispose(); mats.forEach(function (m) { m.dispose(); }); };
    return sc;
  }
  function env(kind) {
    var pm = new T.PMREMGenerator(renderer), rt = null;
    if (kind === 'neutral') { // model-viewer 按物理单位的灯光算（three r155 以后的默认）：r149 要打开 physicallyCorrectLights
      var sc = neutralScene(), pc = renderer.physicallyCorrectLights;
      renderer.physicallyCorrectLights = true;
      try { rt = pm.fromScene(sc, 0.04); } catch (e) { console.warn('中性环境生成失败，用简易影棚', e); rt = null; }
      renderer.physicallyCorrectLights = pc;
      sc.userData.free();
    }
    if (kind === 'studio' && (hdr || window.D3_ENV_HDR) && T.RGBELoader) {
      try {
        if (!hdr) {
          var b = atob(window.D3_ENV_HDR), u = new Uint8Array(b.length), l = new T.RGBELoader();
          for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
          l.setDataType(T.HalfFloatType);
          hdr = l.parse(u.buffer);
          window.D3_ENV_HDR = null; // 解开了就不留 base64（2MB 字符串）
        }
        var tex = new T.DataTexture(hdr.data, hdr.width, hdr.height, T.RGBAFormat, T.HalfFloatType);
        tex.mapping = T.EquirectangularReflectionMapping; tex.minFilter = tex.magFilter = T.LinearFilter; tex.generateMipmaps = false; tex.flipY = true; tex.needsUpdate = true;
        rt = pm.fromEquirectangular(tex);
        tex.dispose();
      } catch (e) { console.warn('影棚环境图解不开，用简易影棚', e); rt = null; }
    }
    if (!rt) { var room = new T.RoomEnvironment(); rt = pm.fromScene(room, 0.04); room.dispose(); }
    pm.dispose();
    return rt;
  }
  /** 释放一棵场景树里的几何体、材质、贴图 */
  // 拆下来的材质先不释放（贴图、几何体照常释放）：它编译好的着色器还挂在材质上，回到这一页、重建车时同样的材质直接用，不用再编译——
  // 车机的显卡驱动编译一个车漆、玻璃这类大着色器要几十到上百毫秒，以前切回车况页、每改一次车模都要整套重新编一遍。
  // 按页面记：这一页再画出一帧（新的材质已经编译好、接过了着色器）以后才真正释放；在别的页时这些材质只占一点点显存，不跑任何东西
  var stash = {}, unloading = '', drawn = 0;
  function stashFree(id, all) {
    var l = stash[id];
    if (!l || !l.length) return;
    stash[id] = l.filter(function (x) { if (all || x.f < drawn) { x.m.dispose(); return false; } return true; });
  }
  function dispose(root) {
    var seen = [], id = live ? live.id : unloading;
    function tex(m) {
      for (var k in m) { var v = m[k]; if (v && v.isTexture) { if (seen.indexOf(v) < 0) { seen.push(v); v.dispose(); } m[k] = null; } } // 贴图释放、引用断开（材质还留一会儿）
      (stash[id] = stash[id] || []).push({ m: m, f: drawn });
    }
    root.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (seen.indexOf(m) < 0) { seen.push(m); tex(m); } });
    });
    if (root.environment) root.environment.dispose();
    if (root.background && root.background.isTexture) root.background.dispose();
  }
  /** 画一张画布贴图（sRGB）：draw(ctx, w, h) */
  function canvasTex(w, h, draw, color) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    if (color !== false) t.encoding = T.sRGBEncoding;
    return t;
  }
  var app = {
    invalidate: invalidate, rem: rem, env: env, dispose: dispose, canvasTex: canvasTex, loadPost: loadPost, rtSpec: function () { return rtSpec(); },
    size: function () { return { w: W, h: H }; },
    renderer: function () { return renderer; }
  };

  function pixelRatio() { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, D3Set.fx().ratio)); }

  // ================= 后期效果（画质高 / 极致）：灯光辉光、环境光遮蔽、景深 =================
  // 材质画进离屏缓冲时已经做了色调映射（three r149），最后一道只把线性颜色转成 sRGB。画布是透明的（背景是页面的 CSS）、按"预乘透明度"合成：
  // 颜色不能比透明度大，不然合成出黑块、黄红色的条纹——所以先除以透明度转 sRGB 再乘回去；辉光加在透明背景上的地方，透明度抬到和最亮的颜色一样
  var post = null, postLoad = null;
  /** 加载后期效果脚本 three-post.js（画质高 / 极致才用；只加载一次），加载好 resolve，失败 reject */
  function loadPost() {
    if (T.EffectComposer) return Promise.resolve();
    if (!postLoad) postLoad = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'three-post.js';
      s.onload = ok;
      s.onerror = function () { postLoad = null; no(new Error('three-post.js 加载失败')); };
      document.head.appendChild(s);
    });
    return postLoad;
  }
  var FINAL = {
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse;\nvarying vec2 vUv;\nvoid main() {\n  vec4 c = texture2D(tDiffuse, vUv);\n' +
      '  vec3 p = max(c.rgb, 0.0);\n  float a = clamp(max(c.a, max(p.r, max(p.g, p.b))), 0.0, 1.0);\n  if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }\n' +
      '  vec3 l = min(p / a, 1.0);\n  vec3 s = mix(pow(l, vec3(0.41666)) * 1.055 - vec3(0.055), l * 12.92, vec3(lessThanEqual(l, vec3(0.0031308))));\n  gl_FragColor = vec4(s * a, a);\n}'
  };
  /** 离屏缓冲的格式：显卡能渲染到半精度浮点就用（暗部不出色带），不然用 8 位；多重采样（抗锯齿）最多 4 倍——
      每块显卡、每种格式（颜色、深度）支持的倍数不一样，超了帧缓冲不完整、整个画面画不出来：颜色和深度格式都查一遍，取都支持的 */
  var rtSpecC = null;
  function rtSpec() {
    if (rtSpecC) return rtSpecC;
    var c = renderer.capabilities, gl = renderer.getContext(), half = c.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float'), n = 0;
    if (c.isWebGL2) {
      try {
        var all = [half ? gl.RGBA16F : gl.RGBA8, gl.DEPTH_COMPONENT16, gl.DEPTH_COMPONENT24].map(function (f) { return Array.prototype.slice.call(gl.getInternalformatParameter(gl.RENDERBUFFER, f, gl.SAMPLES) || []); });
        [4, 2].some(function (k) { if (all.every(function (l) { return l.indexOf(k) >= 0; })) { n = k; return true; } return false; });
      } catch (er) { n = 0; }
    }
    return (rtSpecC = { type: half ? T.HalfFloatType : T.UnsignedByteType, samples: aaOn ? n : 0 }); // 抗锯齿关了：离屏缓冲也不开多重采样
  }

  function makePost() {
    dropPost();
    var f = D3Set.fx();
    if (!live || !live.scene || !(f.bloom || f.ao || f.dof)) return;
    if (!T.EffectComposer) { // 第一次用：加载 three-post.js，加载好再建
      var p0 = live;
      loadPost().then(function () { if (live === p0 && ready) { makePost(); invalidate(); } }, function (e) { console.warn('后期效果加载失败，按标准画质画', e); });
      return;
    }
    var sp = rtSpec(), rt = new T.WebGLRenderTarget(1, 1, { type: sp.type, samples: sp.samples });
    var c = new T.EffectComposer(renderer, rt), sc = live.scene, cam = live.camera, bokeh = null;
    c.setPixelRatio(renderer.getPixelRatio());
    c.setSize(W, H);
    if (f.ao) { // 环境光遮蔽：自己画一遍场景再乘上遮蔽（轮拱、缝隙、车底更暗）
      var ao = new T.SSAOPass(sc, cam, W, H);
      ao.kernelRadius = 0.9; ao.minDistance = 0.0002; ao.maxDistance = 0.015; // 半径按米（车的尺度），深度差按远近平面之间的比例
      c.addPass(ao);
    } else c.addPass(new T.RenderPass(sc, cam));
    if (f.dof && live.focusDist) { // 景深：对焦在车上，只让离焦点远的地方轻轻虚一点（虚太多像微缩模型）
      bokeh = new T.BokehPass(sc, cam, { focus: 10, aperture: 0.0012, maxblur: 0.004 });
      c.addPass(bokeh);
    }
    if (f.bloom) c.addPass(new T.UnrealBloomPass(new T.Vector2(W, H), 0.32, 0.5, 0.86)); // 灯光辉光：只有灯和最亮的高光
    c.addPass(new T.ShaderPass(FINAL));
    post = { c: c, bokeh: bokeh };
  }
  function dropPost() {
    if (!post) return;
    post.c.passes.forEach(function (p) { if (p.dispose) p.dispose(); if (p.noiseTexture) p.noiseTexture.dispose(); }); // 环境光遮蔽的噪声图 dispose() 里没释放
    post.c.dispose();
    post = null;
  }
  /** 画质变了：像素比、阴影开关跟着变，当前页重建（材质按有没有阴影重新编译） */
  function quality() {
    pixelRatio();
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = D3Set.fx().shadow > 0;
    if (live) { var c0 = cur; deactivate(); activate(c0); }
  }
  D3Set.on(function (k) {
    if (k === 'quality' && renderer) quality();
    if (k === 'open' && live && ready && live.focus) live.focus(D3Set.isOpen());
    if (k === 'aa' && renderer && D3Set.get('aa') !== aaOn) setTimeout(function () { location.reload(); }, 350); // 等开关的动画走完
  });

  var aaOn = D3Set.get('aa') === true;
  function boot() {
    T.ColorManagement.legacyMode = false; // 颜色按 sRGB 写，three 换算成线性再算光照
    try {
      renderer = new T.WebGLRenderer({ antialias: aaOn, alpha: true, powerPreference: 'low-power' }); // 抗锯齿（设置里能关）只能在建画布时定
    } catch (e) { renderer = null; }
    resize();
    if (!renderer) { document.getElementById('nogl').className = 'nogl on'; return; }
    pixelRatio();
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = D3Set.fx().shadow > 0;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // 车不动时阴影贴图不用重画（只转镜头时光和车都没动），页面在车上的东西动了才 needsUpdate
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    canvas = renderer.domElement;
    try { var dbg = renderer.getContext().getExtension('WEBGL_debug_renderer_info'); soft = !!dbg && /SwiftShader|llvmpipe|Software/i.test(renderer.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL)); } catch (e) {}
    canvas.className = 'gl';
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); started = false; stopFrames(); document.getElementById('nogl').className = 'nogl on lost'; });
    canvas.addEventListener('webglcontextrestored', function () { location.reload(); });
    refresh();
    try { // 记住的页：以前存的是序号，现在存页面 id
      var s = localStorage.getItem(KEY), n = parseInt(s, 10), id = n >= 0 && pages[n] ? pages[n].id : s;
      shown.forEach(function (p, k) { if (p.id === id) cur = k; });
    } catch (e) {}
    started = true;
    resize();
    dots();
    window.addEventListener('resize', resize);
    setVisible();
    activate(cur);
  }

  window.D3 = {
    add: function (p) { pages.push(p); shown = pages.slice(); },
    /** 调整车模时锁住：不切页，按哪里都交给当前页 */
    lock: function (on) { locked = on; },
    /** 底部一条提示，几秒后消失（msg 为空：马上收起） */
    toast: function (msg, ms) {
      var e = document.getElementById('toast');
      clearTimeout(toastT);
      if (!msg) { e.className = 'toast'; return; }
      e.innerHTML = '';
      var p = document.createElement('p');
      p.textContent = msg;
      e.appendChild(p);
      e.className = 'toast on';
      toastT = setTimeout(function () { e.className = 'toast'; }, ms || 3200);
    },
    page: function () { return cur; },
    go: go,
    /** 页面改了要的数据（needs）：是当前页、卡片看得见就按新的订阅 */
    needs: function (p) { if (p === live && visible) D3Data.use(p.needs || []); },
    /** 新手引导用：当前页主体（车）在屏幕上的范围 */
    focusRect: function () { return live && ready && live.focusRect ? live.focusRect() : null; },
    /** 测试用（估算车机显卡负担）：先空转 warm 帧，再连画 n 帧，每帧把视角转一点（像手指在转车），返回 Promise<{ cpu 每帧主线程毫秒, gpu 每帧显卡毫秒（显卡计时器，
        没有这个扩展时为 null）, calls 每帧画几次, tris 三角形数, px 画布像素数, name 显卡名 }> */
    bench: function (n, warm) {
      if (!live || !ready) return Promise.resolve(null);
      var gl = renderer.getContext(), px = new Uint8Array(4), info = gl.getExtension('WEBGL_debug_renderer_info'), calls = 0, tris = 0, cpu = 0, qs = [];
      var tq = renderer.capabilities.isWebGL2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
      var spin = function () { if (live.drag) { if (live.grab) live.grab(W / 2, H / 2); live.drag(4, 0, W / 2, H / 2); } };
      var one = function (q) {
        renderer.info.reset();
        spin(); raf = 0;
        if (q) gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
        var t = performance.now();
        frame(performance.now());
        var d = performance.now() - t;
        if (q) gl.endQuery(tq.TIME_ELAPSED_EXT);
        return d;
      };
      renderer.info.autoReset = false; // 一帧里后期效果会画好几遍：攒一帧的总数
      for (var k = 0; k < (warm || 3); k++) { one(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } // 先热身（编译着色器、上传贴图；笔记本显卡负载轻时降频，多转几帧让它升上来）
      for (var i = 0; i < n; i++) {
        var q = tq ? gl.createQuery() : null;
        cpu += one(q);
        if (q) qs.push(q);
        calls += renderer.info.render.calls; tris += renderer.info.render.triangles;
      }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      renderer.info.autoReset = true;
      stopFrames();
      var out = { cpu: Math.round(cpu / n * 100) / 100, gpu: null, calls: Math.round(calls / n), tris: Math.round(tris / n), px: renderer.domElement.width * renderer.domElement.height,
        name: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '' };
      if (!tq) return Promise.resolve(out);
      return new Promise(function (res) { // 计时结果要回到事件循环以后才拿得到
        var tries = 0;
        (function poll() {
          var ok = qs.every(function (x) { return gl.getQueryParameter(x, gl.QUERY_RESULT_AVAILABLE); });
          if (!ok && ++tries < 200) { setTimeout(poll, 20); return; }
          var sum = 0, m = 0;
          if (ok && !gl.getParameter(tq.GPU_DISJOINT_EXT)) qs.forEach(function (x) { sum += gl.getQueryParameter(x, gl.QUERY_RESULT) / 1e6; m++; });
          qs.forEach(function (x) { gl.deleteQuery(x); });
          out.gpu = m ? Math.round(sum / m * 100) / 100 : null;
          res(out);
        })();
      });
    },
    /** 测试用：当前建好的页、渲染器里还留着的几何体 / 贴图数、视角 */
    info: function () {
      var m = renderer ? renderer.info.memory : {};
      return { live: live ? live.id : '', ready: ready, geometries: m.geometries, textures: m.textures, programs: renderer ? renderer.info.programs.length : 0, az: live && live.view ? Math.round(live.view.az * 1000) / 1000 : null, el: live && live.view ? Math.round(live.view.el * 1000) / 1000 : null,
        spot: live && ready && live.spot ? live.spot() : null, // spot：模型上能点的地方在屏幕上的位置
        post: post ? post.c.passes.map(function (p) { return p.constructor.name.replace('Pass', ''); }).join(',') : '', tone: renderer ? renderer.toneMapping : null, aa: renderer ? !!renderer.getContextAttributes().antialias : null, ratio: renderer ? renderer.getPixelRatio() : 0, shadowMap: renderer ? renderer.shadowMap.enabled : false,
        state: live && ready && live.info ? live.info() : null };
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})();
