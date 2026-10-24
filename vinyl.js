/* demo3d 第二页：3D 唱片机。暖白色底座 + 铝转盘（边上一圈频闪点）+ 黑胶唱片（中间贴正在放的歌的封面）+ 镀铬唱臂，暗室里一盏暖色主光。
   放歌时唱臂移过去、唱针落到唱片上，唱片才开始转（每分钟 20 圈，转着的时候每秒 60 帧），唱臂随播放进度慢慢往里走；暂停时唱片慢慢停下、唱臂抬回支架。
   唱片上那道反光不跟着转（灯不动，转的是唱片）。底座左前角的指示灯放歌时亮。背景是封面图适度模糊后压暗（换歌时算一次，存成图片），没有封面时按标题颜色晕染。
   点唱片 = 暂停 / 继续，右边（竖屏在下面）三个键 = 上一首 / 暂停继续 / 下一首（宿主没有的方法不出键）。
   按住唱片机左右拖转着看、上下拖改俯仰（松手有惯性），双击唱片外面回到默认角度；唱片上的反光跟着视角转（灯和人的相对位置不变）。
   进场：镜头从高处斜上方转下来、推近到默认角度，同时唱片从上面落到转盘上，落稳了唱臂再过去（在放歌的话）。
   换歌：唱针抬起、唱臂回支架，旧唱片（带着旧封面）从转盘上拿起来、一边倾斜一边往左上方移出画面，新唱片（新封面）从画面上方外面落到转盘上，
   唱臂再移过去、唱针落下，唱片才开始转。两张唱片轮流用（各有一张封面贴图，各自记着是哪首歌，封面只画到自己那首歌的唱片上）；
   换唱片途中又切了歌（快速连点上一首 / 下一首）：歌名、背景照常马上换，唱片等这一轮换完再换成最新那首（中间跳过的不再一张张换）。
   歌词：整首（getLyrics）排成一列，当前句高亮、放大一点，换句时整列平滑滚到当前句（横屏放在中间偏上、竖屏在正中），上下边缘渐隐；
   竖屏小窗口也有上一句、当前句、下一句三行。重复的句子（副歌）从当前句往后找；播放器不给整首歌词时，用听到过的几句往上滚。
   外观在设置里换：底座（奶白 / 胡桃木 / 哑光黑 / 银）、唱片（黑胶 / 红胶 / 蓝胶 / 透明）、转速（16 / 20 / 33 转，默认 20）。
   封面：宿主给的地址按"地址 + 曲目"认，fetch 转 blob 画进圆形贴图（宿主的封面地址可能几首歌同一个，同 pet/car.js）；取不到就画一张纯色标签。全部 ES5。 */
(function () {
  'use strict';
  var T = window.THREE, D = window.D3Data;
  var el = document.getElementById('pgVinyl');
  var page = { id: 'vinyl', el: el, needs: ['media'] };
  var $ = function (id) { return document.getElementById(id); };
  var app, gen = 0, offMedia = null, scene, camera, discs = [], cur = 0, swap = null, arm, armTilt, led, sheenG;
  var omega = 0, yaw = null, tilt = 0.1, needleOn = false, playing = false, media = null, gotAt = 0;
  var lines = [], lyrTrack = null, coverKey = '', coverSeq = 0, blobUrl = '', glowSide = 0, tint = null, bgUrl = '';
  var W = 1, H = 1, portrait = false, lastTap = 0;
  // 进场：t 0→1；rot 是镜头转下来那部分的权重（途中用户拖了就并进当前视角）；wait 头两帧不走时间（第一帧要编译着色器）
  var INTRO = { az: 0.8, el: 0.5, dist: 0.18, sec: 1.7 }, intro = { t: 1, rot: 1, wait: 0 }, sheenMat = null;
  var LOOK = new T.Vector3(0, 0.3, 0.05), HOME = { az: Math.atan2(-0.32, 1), el: 0.77 }, view = page.view = { az: HOME.az, el: HOME.el, vaz: 0, dist: 12, homing: false };
  var TOP = 0.4, PLATTER_H = 0.13, REC_H = 0.03, REC_R = 1.25, LABEL_R = 0.6; // 标签（封面）比真唱片的大一些，看得清
  var CENTER = new T.Vector3(-0.5, 0, 0.08), PIVOT = new T.Vector3(1.48, 0, -1.08), ARM_L = 1.92;
  var REST = 0.04; // 转速按设置（默认 20 转/分：真唱片 33⅓ 转在车机屏上看着太快）
  var baseMat = null, topMat = null, edgeMat = null;
  // 底座：颜色 / 金属度 / 粗糙度（胡桃木用画的木纹）；唱片：声槽贴图的底色、声槽颜色、边的颜色、透明度
  var BASES = { cream: [0xe9e4da, 0, 0.62], walnut: [0xffffff, 0, 0.5], black: [0x1b1c1f, 0.1, 0.55], silver: [0xc9ccd1, 0.85, 0.32] };
  var DISCS = { black: ['#0d0d0f', 26, 0x0c0c0d, 1], red: ['#5a0a10', 70, 0x6a0a12, 1], blue: ['#0b2366', 64, 0x0d2a7a, 1], clear: ['#56616d', 90, 0x8a99a8, 0.38] };
  function rpm() { return parseInt(D3Set.get('vRpm'), 10) / 60 * Math.PI * 2; }
  var BTN = { vPrev: 'previous', vToggle: 'toggle', vNext: 'next' };

  // ================= 场景 =================
  page.load = function (a) {
    app = a; gen++;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(30, 1, 0.1, 60);
    page.scene = scene; page.camera = camera;
    var envRT = app.env();
    scene.environment = envRT.texture;
    scene.userData.env = envRT;
    var key = new T.DirectionalLight(0xffe2c2, 2.1);
    key.position.set(-3, 6.5, 3.2);
    scene.add(key);
    var rim = new T.DirectionalLight(0x9db4ff, 0.35);
    rim.position.set(4, 2, -4);
    scene.add(rim);
    build();
    yaw = null; omega = 0; tilt = 0.1; needleOn = false; playing = false; media = null; coverKey = ''; lyrTrack = null; lines = []; lyReset();
    view.az = HOME.az; view.el = HOME.el; view.vaz = 0; view.homing = false;
    intro.t = D3Set.get('intro') ? 0 : 1; intro.rot = 1; intro.wait = 2;
    app.renderer().toneMappingExposure = 1;
    offMedia = D.onMedia(onMedia);
    onMedia(D.media());
  };
  page.unload = function () {
    gen++; coverSeq++;
    if (offMedia) offMedia(); offMedia = null;
    var env = scene && scene.userData.env;
    if (scene) app.dispose(scene);
    if (env) env.dispose();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = '';
    scene = camera = arm = armTilt = led = sheenG = sheenMat = baseMat = topMat = edgeMat = page.scene = page.camera = null;
    discs = []; swap = null;
    intro.t = 1;
  };

  function build() {
    // 底座：圆角方块，哑光暖白
    var base = new T.ExtrudeGeometry(roundRect(4.6, 3.5, 0.2), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, curveSegments: 8 });
    base.rotateX(-Math.PI / 2); base.translate(0, 0.05, 0);
    baseMat = new T.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 });
    add(new T.Mesh(base, baseMat));
    add(shadow());
    // 转盘：铝，边上一圈频闪点
    var prof = [[0, 0], [1.36, 0], [1.4, 0.025], [1.4, 0.105], [1.37, PLATTER_H], [0, PLATTER_H]].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var platter = new T.Mesh(new T.LatheGeometry(prof, 96), new T.MeshStandardMaterial({ map: strobeTex(), metalness: 1, roughness: 0.3, envMapIntensity: 1.1 }));
    platter.position.set(CENTER.x, TOP, CENTER.z);
    add(platter);
    // 唱片 + 标签（封面）：两张轮流用，换歌时旧的带着旧封面移走、新的落下来；唱片和标签一起转
    var vinylTop = topMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, envMapIntensity: 0.6 });
    var vinylEdge = edgeMat = new T.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.35, metalness: 0, envMapIntensity: 0.6 });
    skin();
    var recGeo = new T.CylinderGeometry(REC_R, REC_R, REC_H, 96, 1), labelGeo = new T.CircleGeometry(LABEL_R, 64);
    for (var i = 0; i < 2; i++) {
      var g = new T.Group();
      g.position.set(CENTER.x, TOP + PLATTER_H, CENTER.z);
      g.visible = i === 0;
      add(g);
      var rec = new T.Mesh(recGeo, [vinylEdge, vinylTop, vinylEdge]);
      rec.position.y = REC_H / 2;
      g.add(rec);
      var c = document.createElement('canvas');
      c.width = c.height = 512;
      var tex = new T.CanvasTexture(c);
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = 4;
      var lb = new T.Mesh(labelGeo, new T.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0, envMapIntensity: 0.4 }));
      lb.rotation.x = -Math.PI / 2; lb.position.y = REC_H + 0.001;
      g.add(lb);
      discs.push({ g: g, ctx: c.getContext('2d'), tex: tex, rot: 0, tid: null });
    }
    cur = 0;
    drawLabel(null, null);
    // 唱片上那道反光：不跟着转
    sheenMat = new T.MeshBasicMaterial({ map: sheenTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.5 });
    var sheen = new T.Mesh(new T.RingGeometry(LABEL_R + 0.03, REC_R - 0.01, 96, 1), sheenMat);
    sheen.rotation.x = -Math.PI / 2; sheen.renderOrder = 2;
    sheenG = add(new T.Group());
    sheenG.position.set(CENTER.x, TOP + PLATTER_H + REC_H + 0.002, CENTER.z);
    sheenG.add(sheen);
    var chrome = new T.MeshStandardMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.16, envMapIntensity: 1.3 });
    var dark = new T.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.5, roughness: 0.35 });
    var spindle = new T.Mesh(new T.CylinderGeometry(0.028, 0.032, 0.12, 20), chrome);
    spindle.position.set(CENTER.x, TOP + PLATTER_H + 0.06, CENTER.z);
    add(spindle);
    // 唱臂：底座 + 轴承 → 臂杆（往前伸）→ 唱头；后面配重
    var pb = new T.Mesh(new T.CylinderGeometry(0.24, 0.26, 0.05, 48), dark);
    pb.position.set(PIVOT.x, TOP + 0.025, PIVOT.z); add(pb);
    var ring = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.07, 40), chrome);
    ring.position.set(PIVOT.x, TOP + 0.08, PIVOT.z); add(ring);
    var post = new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 0.26, 24), chrome);
    post.position.set(PIVOT.x, TOP + 0.2, PIVOT.z); add(post);
    arm = new T.Group();
    arm.position.set(PIVOT.x, TOP + 0.3, PIVOT.z);
    add(arm);
    armTilt = new T.Group();
    arm.add(armTilt);
    var gimbal = new T.Mesh(new T.SphereGeometry(0.075, 24, 16), chrome);
    armTilt.add(gimbal);
    var tube = new T.Mesh(new T.CylinderGeometry(0.022, 0.026, ARM_L - 0.22, 16), chrome);
    tube.rotation.x = Math.PI / 2; tube.position.z = (ARM_L - 0.22) / 2;
    armTilt.add(tube);
    var shell = new T.Group();
    shell.position.set(0, -0.02, ARM_L - 0.2); shell.rotation.y = -0.38;
    armTilt.add(shell);
    var head = new T.Mesh(new T.BoxGeometry(0.13, 0.03, 0.28), dark);
    head.position.z = 0.1; shell.add(head);
    var cart = new T.Mesh(new T.BoxGeometry(0.08, 0.06, 0.12), new T.MeshStandardMaterial({ color: 0xd8a24a, metalness: 0.6, roughness: 0.35 }));
    cart.position.set(0, -0.04, 0.14); shell.add(cart);
    var lift = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.16, 8), chrome);
    lift.rotation.z = Math.PI / 2; lift.position.set(0.12, 0.005, 0.06); shell.add(lift);
    var stub = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.3, 16), chrome);
    stub.rotation.x = Math.PI / 2; stub.position.z = -0.18; armTilt.add(stub);
    var weight = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.2, 32), dark);
    weight.rotation.x = Math.PI / 2; weight.position.z = -0.38; armTilt.add(weight);
    // 唱臂支架（停放的位置）
    var rest = restTip();
    var rp = new T.Mesh(new T.CylinderGeometry(0.03, 0.035, 0.26, 16), chrome);
    rp.position.set(rest.x, TOP + 0.13, rest.z); add(rp);
    var cradle = new T.Mesh(new T.BoxGeometry(0.1, 0.03, 0.06), dark);
    cradle.position.set(rest.x, TOP + 0.27, rest.z); add(cradle);
    // 左前角：启停键 + 指示灯
    var btn = new T.Mesh(new T.CylinderGeometry(0.15, 0.16, 0.04, 40), new T.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 1, roughness: 0.28 }));
    btn.position.set(-1.95, TOP + 0.02, 1.38); add(btn);
    led = new T.Mesh(new T.CircleGeometry(0.035, 20), new T.MeshStandardMaterial({ color: 0x2a1a0c, emissive: 0xffa040, emissiveIntensity: 0 }));
    led.rotation.x = -Math.PI / 2; led.position.set(-1.62, TOP + 0.002, 1.38); add(led);
  }
  function add(o) { scene.add(o); return o; }
  function roundRect(w, h, r) {
    var s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  /** 底座下面的柔和阴影 */
  function shadow() {
    var tex = app.canvasTex(256, 200, function (c, w, h) {
      c.filter = 'blur(' + Math.round(w * 0.05) + 'px)';
      c.fillStyle = 'rgba(0,0,0,.7)';
      c.fillRect(w * 0.16, h * 0.17, w * 0.68, h * 0.7);
    }, false);
    var m = new T.Mesh(new T.PlaneGeometry(6.8, 5.3), new T.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(0.05, 0.001, 0.1);
    return m;
  }
  /** 转盘侧面：拉丝铝 + 中间一圈频闪点（车床转盘边上那种） */
  function strobeTex() {
    var t = app.canvasTex(1024, 64, function (c, w, h) {
      c.fillStyle = '#c9cdd3'; c.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 2) { c.fillStyle = 'rgba(255,255,255,' + (0.04 + ((y * 7919) % 13) / 130) + ')'; c.fillRect(0, y, w, 1); }
      c.fillStyle = '#4b4f57';
      for (var i = 0; i < 180; i++) c.fillRect(i * w / 180 + 1, h * 0.43, w / 180 * 0.5, h * 0.14);
    });
    return t;
  }
  /** 唱片盘面：细密的声槽，歌和歌之间一圈更亮的空白 */
  /** 换底座、唱片的样子（设置变了也走这里，不重建场景） */
  function skin() {
    if (!baseMat) return;
    var b = BASES[D3Set.get('vBase')] || BASES.cream, d = DISCS[D3Set.get('vDisc')] || DISCS.black;
    if (baseMat.map) { baseMat.map.dispose(); baseMat.map = null; }
    if (D3Set.get('vBase') === 'walnut') baseMat.map = woodTex();
    baseMat.color.setHex(b[0]); baseMat.metalness = b[1]; baseMat.roughness = b[2]; baseMat.needsUpdate = true;
    if (topMat.map) topMat.map.dispose();
    topMat.map = grooveTex(d[0], d[1]);
    edgeMat.color.setHex(d[2]);
    topMat.transparent = edgeMat.transparent = d[3] < 1;
    topMat.opacity = edgeMat.opacity = d[3];
    topMat.needsUpdate = edgeMat.needsUpdate = true;
  }
  /** 胡桃木纹：深浅两种棕色的长条纹理（底座顶面的 UV 是世界坐标，按米铺开） */
  function woodTex() {
    var t = app.canvasTex(512, 512, function (c, w, h) {
      c.fillStyle = '#5b3a24'; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 260; i++) {
        var y = (i * 7919 % 997) / 997 * h, a = 0.05 + (i * 2654435761 % 100) / 100 * 0.12, lw = 1 + (i * 40503 % 5);
        c.strokeStyle = (i % 3 ? 'rgba(35,20,10,' : 'rgba(140,96,60,') + a + ')';
        c.lineWidth = lw;
        c.beginPath(); c.moveTo(0, y);
        for (var x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x / 90 + i) * 6 + Math.sin(x / 23 + i * 3) * 1.5);
        c.stroke();
      }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(0.28, 0.28); t.anisotropy = 4;
    return t;
  }
  function grooveTex(baseColor, lift) {
    return app.canvasTex(1024, 1024, function (c, w) {
      var cx = w / 2, R = w / 2, k = lift / 26;
      c.fillStyle = baseColor; c.fillRect(0, 0, w, w);
      for (var r = R * (LABEL_R + 0.03) / REC_R; r < R * 0.985; r += 1.15) {
        var f = r / R, gap = [0.6, 0.71, 0.82, 0.92].some(function (g) { return Math.abs(f - g) < 0.006; });
        var v = Math.min(255, Math.round((gap ? 52 : 26 + ((r * 2654435761) % 9)) * k));
        c.strokeStyle = 'rgba(' + v + ',' + v + ',' + (v + 2) + ',' + (k > 1 ? 0.35 : 1) + ')';
        c.lineWidth = 0.7;
        c.beginPath(); c.arc(cx, cx, r, 0, Math.PI * 2); c.stroke();
      }
      c.strokeStyle = '#222226'; c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cx, R * 0.99, 0, Math.PI * 2); c.stroke();
    });
  }
  /** 唱片上两道对称的扇形反光（灯照在声槽上那种） */
  function sheenTex() {
    var n = 256, c = document.createElement('canvas');
    c.width = c.height = n;
    var x = c.getContext('2d'), img = x.createImageData(n, n), d = img.data;
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
      var dx = (i + 0.5) / n * 2 - 1, dy = (j + 0.5) / n * 2 - 1, r = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx) - 0.7;
      var s = Math.pow(Math.abs(Math.cos(a)), 24) * Math.min(1, Math.max(0, (r - 0.35) * 4)) * Math.max(0, 1 - Math.pow(r, 6));
      var k = (j * n + i) * 4;
      d[k] = 255; d[k + 1] = 240; d[k + 2] = 222; d[k + 3] = Math.round(s * 255);
    }
    x.putImageData(img, 0, 0);
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }
  /** 唱臂停放时针尖的位置 */
  function restTip() { return new T.Vector3(PIVOT.x + Math.sin(REST) * ARM_L * 0.86, 0, PIVOT.z + Math.cos(REST) * ARM_L * 0.86); }
  /** 唱臂角度：放歌时针尖在唱片上离圆心 r 的地方（余弦定理），停着时回支架 */
  function armYaw(r) {
    var dx = CENTER.x - PIVOT.x, dz = CENTER.z - PIVOT.z, d = Math.sqrt(dx * dx + dz * dz);
    var toC = Math.atan2(dx, dz), cos = (d * d + ARM_L * ARM_L - r * r) / (2 * d * ARM_L);
    return toC + Math.acos(Math.max(-1, Math.min(1, cos)));
  }

  // ================= 标签：封面画成圆的；没有封面画一张纯色的 =================
  function drawLabel(img, m) {
    var d = discs[cur];
    if (!d) return;
    var c = d.ctx, n = 512, h = n / 2;
    c.clearRect(0, 0, n, n);
    c.save();
    c.beginPath(); c.arc(h, h, h, 0, Math.PI * 2); c.clip();
    if (img) {
      var s = Math.max(n / img.width, n / img.height);
      c.drawImage(img, h - img.width * s / 2, h - img.height * s / 2, img.width * s, img.height * s);
    } else {
      var hue = hash((m && m.title) || '') % 360;
      var g = c.createLinearGradient(0, 0, n, n);
      g.addColorStop(0, 'hsl(' + hue + ',42%,58%)'); g.addColorStop(1, 'hsl(' + (hue + 40) % 360 + ',48%,34%)');
      c.fillStyle = m ? g : '#d9d2c5'; c.fillRect(0, 0, n, n);
      c.fillStyle = m ? 'rgba(255,255,255,.92)' : '#3a332b';
      c.textAlign = 'center';
      c.font = '600 46px "MiSans","PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif';
      c.fillText(m ? clip(m.title, 8) : '黑胶', h, h - 70);
      c.font = '400 30px "MiSans","PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif';
      c.globalAlpha = 0.75;
      c.fillText(m ? clip(m.artist || '', 12) : D3Set.get('vRpm') + ' RPM · STEREO', h, h + 96);
      c.globalAlpha = 1;
    }
    c.restore();
    // 中间的孔和一圈细环
    c.fillStyle = '#0d0d0f';
    c.beginPath(); c.arc(h, h, 14, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
    c.beginPath(); c.arc(h, h, h - 6, 0, Math.PI * 2); c.stroke();
    d.tex.needsUpdate = true;
    app.invalidate();
  }
  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function loadCover(m) {
    var url = m && m.coverUrl, key = url ? url + '#' + (m.trackId || m.title) : 'none#' + (m ? m.title : '');
    if (key === coverKey) return;
    coverKey = key;
    var seq = ++coverSeq, tid = tidOf(m);
    function label(img) { if (discs[cur] && discs[cur].tid === tid) drawLabel(img, m); } // 只画到这首歌的唱片上
    if (!url || !window.fetch || !window.URL) { label(null); glow(null, m); return; }
    fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(function (b) {
      if (seq !== coverSeq) return;
      var u = URL.createObjectURL(b), img = new Image();
      img.onload = function () {
        if (seq !== coverSeq) { URL.revokeObjectURL(u); return; }
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = u;
        label(img);
        glow(avg(img), m, img);
      };
      img.onerror = function () { URL.revokeObjectURL(u); if (seq === coverSeq) { label(null); glow(null, m); } };
      img.src = u;
    }, function () { if (seq === coverSeq) { label(null); glow(null, m); } });
  }
  function tidOf(m) { return m ? m.trackId || m.title : null; }
  /** 封面的平均色（缩成 8×8 再平均） */
  function avg(img) {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 8;
      var x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
      var d = x.getImageData(0, 0, 8, 8).data, r = 0, g = 0, b = 0;
      for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      return [r / 64, g / 64, b / 64];
    } catch (e) { return null; }
  }
  /** 背景：有封面就用封面图——在画布上缩到 256 再模糊一次（半径约 3%，看得出封面的颜色和大致形状），存成图片；
     没有封面按标题颜色晕染。两层交替淡入淡出 */
  function glow(rgb, m, img) {
    if (!rgb) { var hue = hash((m && m.title) || '') % 360; rgb = m ? hsl(hue / 360, 0.45, 0.45) : [120, 96, 72]; }
    var mx = Math.max(rgb[0], rgb[1], rgb[2]) || 1, k = Math.min(1.6, 170 / mx);
    tint = rgb.map(function (v) { return Math.round(v * k); });
    bgUrl = img ? blurred(img) : '';
    glowSide = 1 - glowSide;
    var on = $(glowSide ? 'vGlowB' : 'vGlowA'), off = $(glowSide ? 'vGlowA' : 'vGlowB');
    paintGlow(on);
    on.className = 'glow on'; off.className = 'glow';
  }
  function paintGlow(e) {
    if (!tint) return;
    if (bgUrl) { // 封面图上压一层暗色：横屏右边（文字）更暗，竖屏下面（文字）更暗
      var shade = portrait ? 'linear-gradient(180deg, rgba(15,14,13,.3) 0%, rgba(15,14,13,.5) 45%, rgba(15,14,13,.86) 75%, rgba(15,14,13,.92) 100%)'
        : 'linear-gradient(90deg, rgba(15,14,13,.32) 0%, rgba(15,14,13,.5) 45%, rgba(15,14,13,.84) 70%, rgba(15,14,13,.9) 100%)';
      e.style.background = shade + ', url(' + bgUrl + ') center / cover no-repeat';
      return;
    }
    var c = tint.join(','), at = portrait ? '50% 30%' : '27% 48%';
    e.style.background = 'radial-gradient(ellipse ' + (portrait ? '90% 50%' : '60% 75%') + ' at ' + at + ', rgba(' + c + ',.75) 0%, rgba(' + c + ',.22) 55%, rgba(' + c + ',0) 100%)';
  }
  /** 封面缩到 256×256、模糊、存成 JPEG（画大一圈再模糊，边上不会糊出透明） */
  function blurred(img) {
    try {
      var n = 256, c = document.createElement('canvas');
      c.width = c.height = n;
      var x = c.getContext('2d'), s = Math.max(n / img.width, n / img.height) * 1.12;
      x.filter = 'blur(8px)';
      x.drawImage(img, n / 2 - img.width * s / 2, n / 2 - img.height * s / 2, img.width * s, img.height * s);
      return c.toDataURL('image/jpeg', 0.85);
    } catch (e) { return ''; }
  }
  function hsl(h, s, l) {
    function f(n) { var k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }
    return [f(0), f(8), f(4)];
  }

  // ================= 媒体 =================
  function onMedia(m) {
    if (!scene) return;
    media = m; gotAt = Date.now();
    el.classList.toggle('empty', !m);
    var was = playing;
    playing = !!(m && m.playing);
    text('vTitle', m ? m.title || '未知歌曲' : '');
    text('vArtist', m ? m.artist || '' : '');
    text('vState', playing ? '正在播放' : '已暂停');
    $('vState').className = 'v-state' + (playing ? '' : ' paused');
    var tid = m ? m.trackId || m.title : null;
    if (tid !== lyrTrack) {
      if (lyrTrack && tid && intro.t >= 1) changeDisc(tid); // 换歌：换一张唱片
      else if (discs[cur]) discs[cur].tid = tid;
      lyrTrack = tid; lines = []; if (m) D.lyrics().then(function (l) { if (lyrTrack === tid && scene) { lines = l || []; lyric(media); } });
    }
    lyric(m);
    toggleBtn();
    Object.keys(BTN).forEach(function (id) { var c = BTN[id]; $(id).classList.toggle('off', c !== 'toggle' && !D.can(c)); });
    loadCover(m);
    if (was !== playing || !m) app.invalidate();
  }
  /** 换唱片：旧的那张移走，另一张先画上空白标签（封面取到了再画上去）落下来 */
  function changeDisc(tid) {
    if (!discs.length) return;
    if (swap) return; // 正在换：换完再看现在是哪首，换成那首
    swap = { t: 0, from: cur };
    cur = 1 - cur;
    needleOn = false;
    var d = discs[cur];
    d.rot = 0;
    d.tid = tid;
    d.g.visible = false;
    d.g.position.set(CENTER.x, TOP + PLATTER_H + 7, CENTER.z);
    drawLabel(null, null);
    coverKey = ''; // 封面重新取、画到新唱片上
    app.invalidate();
  }
  function toggleBtn() {
    $('vToggle').className = 'v-btn big' + (playing ? ' playing' : '');
    $('vToggle').setAttribute('aria-label', playing ? '暂停' : '播放');
  }
  function text(id, s) { var e = $(id); if (e.textContent !== s) e.textContent = s; }
  // ================= 歌词：一列，当前句高亮，整列滚到当前句 =================
  // key 这一列是哪首的哪份歌词；rows 每行文字；idx 当前句；hist 没有整首歌词、用听到过的句子；y 整列现在的位移
  var ly = { key: null, rows: [], idx: -1, hist: false, y: null };
  function clean(s) { return s ? String(s).replace(/\s+/g, ' ').trim() : ''; }
  function lyReset() { ly = { key: null, rows: [], idx: -1, hist: false, y: null }; var b = $('vLy'); b.innerHTML = ''; b.style.transform = ''; }
  /** 重排一列 */
  function lyRows(texts) {
    var box = $('vLy');
    box.innerHTML = '';
    texts.forEach(function (t) { var p = document.createElement('p'); p.textContent = t; box.appendChild(p); });
    ly.rows = texts.slice(); ly.idx = -1; ly.y = null;
  }
  function lyric(m) {
    var now = clean(m && m.lyric), full = lines.map(function (l) { return clean(l && l.text); }).filter(Boolean);
    var key = (lyrTrack || '') + '|' + full.length, i = -1, k;
    if (key !== ly.key) { ly.key = key; ly.hist = !full.length; lyRows(full); }
    if (!now) return;
    if (!ly.hist) { // 整首里找这句：先从当前句往后找（副歌会重复），找不到再从头找；整首里没有就先不动
      for (k = Math.max(0, ly.idx); k < ly.rows.length && i < 0; k++) if (ly.rows[k] === now) i = k;
      for (k = 0; k < ly.rows.length && i < 0; k++) if (ly.rows[k] === now) i = k;
      if (i < 0) return;
    } else { // 没有整首：听到的新句子接在后面，最多留 30 句
      if (ly.rows[ly.rows.length - 1] !== now) {
        var box = $('vLy'), p = document.createElement('p');
        p.textContent = now; box.appendChild(p); ly.rows.push(now);
        if (ly.rows.length > 30) { box.removeChild(box.firstChild); ly.rows.shift(); ly.idx--; ly.y = null; }
      }
      i = ly.rows.length - 1;
    }
    lyShow(i, true);
  }
  function lyShow(i, anim) {
    var ps = $('vLy').children;
    if (i === ly.idx && ly.y !== null) return;
    if (ly.idx >= 0 && ps[ly.idx]) ps[ly.idx].className = '';
    ly.idx = i;
    if (ps[i]) ps[i].className = 'on';
    lyPlace(anim);
  }
  /** 整列平移到当前句：横屏放在框里 30% 高处（下面多露几句后面的），竖屏放在正中（上一句、下一句各一行）；用像素（transform 写百分比 Chromium 74 不交给合成线程） */
  function lyPlace(anim) {
    var box = $('vLy'), p = box.children[ly.idx];
    if (!p) return;
    var y = Math.round($('vLyrics').clientHeight * (portrait ? 0.5 : 0.3) - (p.offsetTop + p.offsetHeight / 2));
    if (y === ly.y) return;
    if (!anim || ly.y === null) box.style.transition = 'none';
    box.style.transform = 'translate3d(0,' + y + 'px,0)';
    if (!anim || ly.y === null) { void box.offsetWidth; box.style.transition = ''; }
    ly.y = y;
  }
  function press(cmd) {
    if (!scene || !media) return;
    if (cmd === 'toggle') cmd = playing ? 'pause' : 'play';
    if (!D.can(cmd)) return;
    if (cmd === 'play' || cmd === 'pause') { playing = cmd === 'play'; toggleBtn(); app.invalidate(); } // 先按按下去的显示
    D.send(cmd).then(null, function () { onMedia(D.media()); });
  }
  Object.keys(BTN).forEach(function (id) { $(id).addEventListener('click', function () { press(BTN[id]); }); });

  // ================= 每帧 =================
  page.update = function (dt) {
    if (!discs.length) return 0;
    var moving = false, d = discs[cur], base = TOP + PLATTER_H;
    // 进场：唱片落到转盘上（一边落一边转一点），落稳前不显示盘面反光
    if (intro.t < 1) {
      if (intro.wait > 0) intro.wait--;
      else intro.t = Math.min(1, intro.t + dt / INTRO.sec);
      moving = true;
    }
    var drop = 1 - easeOut(clamp((intro.t - 0.15) / 0.6)), turn = drop * 1.4;
    d.g.position.y = base + drop * 1.1;
    // 换歌：0～0.35 秒唱针抬起；旧唱片 0.3～1.1 秒先轻轻拿起、再一边倾斜一边往左上方移出画面；
    // 新唱片 0.75～1.8 秒从画面上方外面落下来（越近越慢，轻轻落到转盘上）——全程都在动，不会凭空出现、消失
    if (swap) {
      swap.t += dt;
      moving = true;
      var o = discs[swap.from], po = clamp((swap.t - 0.3) / 0.8), ei = po * po * po;
      o.g.position.set(CENTER.x - 1.6 * ei, base + 0.25 * easeOut(clamp(po * 3)) + 7 * ei, CENTER.z - 0.8 * ei);
      o.g.rotation.z = 0.45 * ei;
      o.g.visible = po < 1;
      var pi = clamp((swap.t - 0.75) / 1.05), fall = 1 - easeOut(pi);
      d.g.visible = swap.t >= 0.75;
      d.g.position.y = base + fall * 7;
      d.g.rotation.z = -0.25 * fall * fall;
      turn = fall * 1.2;
      drop = Math.max(drop, fall);
      if (swap.t >= 1.85) {
        d.g.rotation.z = 0;
        o.g.visible = false;
        o.g.position.set(CENTER.x, base, CENTER.z); o.g.rotation.set(0, 0, 0);
        swap = null;
        omega = 0; // 旧唱片没停下的转速跟着它拿走了，新唱片等唱针落下再转
        var now = tidOf(media);
        if (now && now !== d.tid) { changeDisc(now); loadCover(media); } // 换的途中又切了歌：接着换成现在这首
      }
    }
    sheenMat.opacity = 0.5 * (1 - Math.min(1, drop * 8));
    // 唱臂：放歌时按进度从外圈走到内圈（进场时等唱片落稳）
    var target = REST;
    if (playing && media && intro.t > 0.8 && !swap) {
      var dur = media.durationMs > 0 ? media.durationMs : 240000, pos = (media.positionMs || 0) + (Date.now() - gotAt);
      var f = Math.max(0, Math.min(1, pos / dur));
      target = armYaw(REC_R - 0.08 - f * (REC_R - LABEL_R - 0.16));
    }
    if (yaw === null) yaw = target;
    var onRecord = target !== REST, lifted = !playing || !onRecord || Math.abs(target - yaw) > 0.02, wantTilt = lifted ? 0.07 : 0; // 停在支架上也是抬着的
    var dy = target - yaw, dtl = wantTilt - tilt;
    if (Math.abs(dy) > 0.0015) { yaw += dy * (1 - Math.exp(-dt * (tilt > 0.05 ? 3.2 : 0.8))); moving = true; } else yaw = target;
    if (Math.abs(dtl) > 0.001) { tilt += dtl * (1 - Math.exp(-dt * 5)); moving = true; } else tilt = wantTilt;
    arm.rotation.y = yaw;
    armTilt.rotation.x = -tilt - 0.035;
    // 唱片：唱针落到唱片上才开始转；转起来以后换歌抬臂也不停，暂停才慢慢停下
    if (!playing || swap) needleOn = false;
    else if (onRecord && tilt < 0.006 && Math.abs(target - yaw) < 0.02) needleOn = true;
    var wantW = needleOn ? rpm() : 0;
    omega += (wantW - omega) * (1 - Math.exp(-dt * (needleOn ? 2.2 : 1.6)));
    if (Math.abs(omega - wantW) < 0.01) omega = wantW; else moving = true; // 还在加速 / 减速也要接着画
    if (omega > 0.001) { (swap ? discs[swap.from] : d).rot -= omega * dt; moving = true; } // 换歌时转速落在被拿走的那张上（慢慢停）
    d.g.rotation.y = d.rot - turn;
    if (swap) discs[swap.from].g.rotation.y = discs[swap.from].rot;
    led.material.emissiveIntensity = playing ? 2.5 : 0;
    // 视角：拖完的惯性、双击回默认角度
    var turning = false;
    if (view.homing) {
      var da = HOME.az - view.az, de = HOME.el - view.el, k = 1 - Math.exp(-dt * 6);
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      view.az += da * k; view.el += de * k;
      if (Math.abs(da) < 0.002 && Math.abs(de) < 0.002) { view.az = HOME.az; view.el = HOME.el; view.homing = false; } else turning = true;
    } else if (Math.abs(view.vaz) > 0.0004) { view.az += view.vaz * dt * 60; view.vaz *= Math.exp(-dt * 3.2); turning = true; } else view.vaz = 0;
    place();
    return turning || moving ? 60 : 0;
  };
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function clamp(t) { return Math.max(0, Math.min(1, t)); }
  function place() {
    var r = 1 - easeOut(intro.t), az = view.az + r * intro.rot * INTRO.az, el = Math.min(1.45, view.el + r * intro.rot * INTRO.el), d = view.dist * (1 + r * INTRO.dist);
    var ce = Math.cos(el);
    camera.position.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce).multiplyScalar(d).add(LOOK);
    camera.lookAt(LOOK);
    camera.updateMatrixWorld();
    sheenG.rotation.y = az - HOME.az;
  }

  // ================= 尺寸：横屏唱片机在左边、竖屏在上面 =================
  page.resize = function (w, h, p) {
    W = w; H = h; portrait = p;
    paintGlow($(glowSide ? 'vGlowB' : 'vGlowA'));
    ly.y = null; lyPlace(false); // 宽高变了：歌词换行变了，重新对到当前句
    if (!camera) return;
    var r = app.rem(), box = p ? { x0: 0.24 * r, x1: w - 0.24 * r, y0: 0.62 * r, y1: h - 4.3 * r } : { x0: 0.3 * r, x1: w * 0.55 - 0.1 * r, y0: 0.6 * r, y1: h - 0.45 * r };
    camera.aspect = w / h;
    camera.clearViewOffset(); camera.updateProjectionMatrix();
    // 唱片机转到哪个角度都要放得下：按外接的一圈点算（默认角度下取景）
    var pts = [], q = new T.Vector3(), az = view.az, el0 = view.el, it0 = intro.t;
    intro.t = 1; // 按进场结束时的角度取景
    for (var i = 0; i < 32; i++) { var a = i / 16 * Math.PI; pts.push(new T.Vector3(Math.cos(a) * 2.9, i & 1 ? 0.75 : 0, Math.sin(a) * 2.9)); } // 2.9 ≈ 底座对角线的一半
    view.az = HOME.az; view.el = HOME.el;
    var lo = 3, hi = 40;
    function bounds() {
      var b = { x0: 1, x1: -1, y0: 1, y1: -1 };
      pts.forEach(function (c) { q.copy(c).project(camera); b.x0 = Math.min(b.x0, q.x); b.x1 = Math.max(b.x1, q.x); b.y0 = Math.min(b.y0, q.y); b.y1 = Math.max(b.y1, q.y); });
      return b;
    }
    for (var it = 0; it < 22; it++) {
      view.dist = (lo + hi) / 2; place();
      var b = bounds();
      if ((b.x1 - b.x0) / 2 * w > box.x1 - box.x0 || (b.y1 - b.y0) / 2 * h > box.y1 - box.y0) lo = view.dist; else hi = view.dist;
    }
    view.dist = hi; place();
    // 投影出来的中心挪到框的中心（视角转动时这个平移不变，唱片机原地转）
    q.copy(LOOK).project(camera);
    camera.setViewOffset(w, h, (q.x + 1) / 2 * w - (box.x0 + box.x1) / 2, (1 - q.y) / 2 * h - (box.y0 + box.y1) / 2, w, h);
    view.az = az; view.el = el0; intro.t = it0; place();
  };

  // ================= 手势：拖动转视角，点唱片暂停 / 继续，双击别处回默认角度 =================
  var hitBox = new T.Box3(new T.Vector3(-2.4, 0, -1.85), new T.Vector3(2.4, 0.8, 1.85)), ray = new T.Raycaster();
  function aim(x, y) { ray.setFromCamera({ x: x / W * 2 - 1, y: 1 - y / H * 2 }, camera); return ray.ray; }
  page.grab = function (x, y) { return !!camera && aim(x, y).intersectsBox(hitBox); };
  page.drag = function (dx, dy) {
    view.homing = false; view.vaz = 0;
    if (intro.t < 1 && intro.rot) { var r = 1 - easeOut(intro.t); view.az += r * INTRO.az; view.el = Math.min(1.3, view.el + r * INTRO.el); intro.rot = 0; } // 进场途中拖：从当前角度接着转
    view.az -= dx * 0.009;
    view.el = Math.max(0.35, Math.min(1.3, view.el + dy * 0.004));
  };
  page.release = function (vx) { view.vaz = -vx * 0.13; app.invalidate(); };
  page.tap = function (x, y) {
    if (!discs.length) return;
    var hit = aim(x, y).intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -(TOP + PLATTER_H + REC_H)), new T.Vector3());
    if (hit && hit.distanceTo(new T.Vector3(CENTER.x, hit.y, CENTER.z)) < REC_R + 0.1) { lastTap = 0; press('toggle'); return; }
    var t = Date.now();
    if (t - lastTap < 450) { view.homing = true; view.vaz = 0; app.invalidate(); lastTap = 0; } else lastTap = t;
  };
  /** 测试用：唱针落下没有、唱片转速（弧度 / 秒） */
  page.info = function () { return { needle: needleOn, omega: Math.round(omega * 100) / 100, tilt: Math.round(tilt * 1000) / 1000, swap: !!swap, disc: cur }; };
  /** 测试用：唱片在屏幕上的位置 */
  page.spot = function () {
    var q = new T.Vector3(CENTER.x + 0.9, TOP + PLATTER_H + REC_H, CENTER.z).project(camera);
    return { x: Math.round((q.x + 1) / 2 * W), y: Math.round((1 - q.y) / 2 * H) };
  };
  page.wake = function (on) { if (on) app.invalidate(); };

  D3Set.on(function (k) { if ((k === 'vBase' || k === 'vDisc') && scene) { skin(); app.invalidate(); } else if (k === 'vRpm' && scene) app.invalidate(); });
  D3.add(page);
})();
