/* 卡片全屏（宿主 2026-10-15 起有 uiplus.windows.openFullscreen / restoreSmall，见接口文档"05-窗口切换"）。几张卡片共用（_shared 是唯一来源）。
   CardFullscreen.bind(按钮, { fail: function (code, mode, 默认说法) {}, ready: function (mode) {} })：
   宿主有这两个接口才显示按钮（去掉 hidden）；getInfo().hostType 是 fullscreen（自己就在全屏页里）时按钮是"恢复小屏"，别的（双 / 三画中画、悬浮窗、预览）是"全屏"。
   点下去：宿主有 toggleFullscreen（2026-10-16 起）就用它，往哪边切由宿主按当前页判断；没有才按按钮标的方向调 openFullscreen / restoreSmall。
   都不用车控权限，无参数，先回执再切换；回执只表示请求收下了，不代表切过去了——2.5 秒内不重复发（文档说不要因为没反应就重发）。
   按钮显示出来时 ready('full' / 'small')（卡片给它让位置）；失败时 fail(错误码, 'full' / 'small', 一句默认的说法)，卡片按自己的风格说。
   CardFullscreen.bar(visible)：全屏页里收起 / 显示顶端状态栏（setStatusBarVisible；只有全屏页支持，底部导航栏动不了。
   每次进全屏页宿主都先显示状态栏，要收起得再调一次）。只认布尔值，别的不发（返回 null）。全部 ES5。 */
(function () {
  'use strict';
  var PATH = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    full: '<svg viewBox="0 0 24 24"><path d="M4 9.5V4h5.5M14.5 4H20v5.5M20 14.5V20h-5.5M9.5 20H4v-5.5" ' + PATH + '/></svg>', // 四个角往外：全屏
    small: '<svg viewBox="0 0 24 24"><path d="M9.5 4v5.5H4M20 9.5h-5.5V4M14.5 20v-5.5H20M4 14.5h5.5V20" ' + PATH + '/></svg>' // 四个角往里：恢复小屏
  };
  /** 失败时的默认说法（按错误码；文档：多传参数 INVALID_ARGUMENT、宿主没这个能力或不在全屏页 UNSUPPORTED、页面失效 SESSION_CLOSED / TIMEOUT） */
  function text(code, mode) {
    if (code === 'UNSUPPORTED') return mode === 'small' ? '现在不是全屏，不用恢复' : '这台车机还不能全屏打开卡片';
    if (code === 'TIMEOUT' || code === 'SESSION_CLOSED') return '车机没回应，过一会儿再点';
    if (code === 'PERMISSION_DENIED') return '车机不让切换窗口';
    return (mode === 'small' ? '没能恢复小屏' : '没能全屏打开') + (code ? '（' + code + '）' : '');
  }
  function bind(btn, opt) {
    opt = opt || {};
    var u = window.uiplus, w = u && u.windows, mode = '', at = 0;
    if (!btn || !w || typeof w.openFullscreen !== 'function') return null; // 老宿主：没有这个功能，按钮一直藏着
    function show(i) {
      var m = i && i.hostType === 'fullscreen' ? 'small' : 'full';
      if (m === 'small' && typeof w.restoreSmall !== 'function' && typeof w.toggleFullscreen !== 'function') { mode = ''; btn.hidden = true; return; }
      if (m === mode) return;
      mode = m;
      btn.innerHTML = ICON[mode];
      btn.setAttribute('aria-label', mode === 'small' ? '恢复小屏' : '全屏');
      btn.classList.toggle('fs-small', mode === 'small');
      btn.hidden = false;
      if (opt.ready) opt.ready(mode);
    }
    // 问不到宿主信息先按"全屏"显示；宿主后端还没好（开机时常常比卡片晚）、超时这类过一会儿再问（2、4、8 秒，之后每 10 秒），
    // 问到了在全屏页里换成"恢复小屏"；没权限、参数不对、宿主不支持这类最多 6 次
    var tries = 0;
    (function ask() {
      if (!u.getInfo) { show(null); return; }
      Promise.resolve().then(function () { return u.getInfo(); }).then(show, function (e) {
        if (!mode) show(null);
        var c = e && e.code;
        if (['PERMISSION_DENIED', 'INVALID_ARGUMENT', 'UNSUPPORTED'].indexOf(c) >= 0 && tries >= 6) return;
        tries++;
        setTimeout(ask, Math.min(10000, 1000 * Math.pow(2, Math.min(tries, 4))));
      });
    })();
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!mode || Date.now() - at < 2500) return;
      at = Date.now();
      var m = mode;
      Promise.resolve().then(function () {
        return typeof w.toggleFullscreen === 'function' ? w.toggleFullscreen() : m === 'small' ? w.restoreSmall() : w.openFullscreen();
      }).then(null, function (er) {
        at = 0;
        var c = er && er.code;
        if (opt.fail) opt.fail(c, m, text(c, m));
      });
    });
    return { mode: function () { return mode; } };
  }
  /** 全屏页里收起 / 显示顶端状态栏；不在全屏页宿主会拒（UNSUPPORTED），卡片自己决定要不要说 */
  function bar(visible) {
    var u = window.uiplus, w = u && u.windows;
    if (typeof visible !== 'boolean' || !w || typeof w.setStatusBarVisible !== 'function') return null;
    return Promise.resolve().then(function () { return w.setStatusBarVisible(visible); });
  }
  window.CardFullscreen = { bind: bind, text: text, bar: bar };
})();
