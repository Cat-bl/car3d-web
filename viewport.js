/* 视口锁定（放在 <head> 里最先执行）：根字号和横竖布局按"参考高度"计算，在 <html> 上加 portrait / landscape 类。
   正在输入（输入框聚焦）时弹出软键盘只会让高度变小，这时保持原来的参考高度，页面不缩小、横竖布局不翻转。
   用了它的卡片，竖向布局写成 .portrait 选择器，不要用 @media (orientation: portrait)。
   输入框在 Shadow DOM 里（pet 的倒数日页面）时也认得出来。
   这是 _shared/viewport.js 的副本，serve / test / pack 时自动同步。ES5。 */
(function () {
  'use strict';
  var root = document.documentElement, refH = 0, lastW = 0;
  function typing() {
    var a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; // 焦点在 Shadow DOM 里时往里找
    return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName);
  }
  function apply() {
    var w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return;
    if (!refH || w !== lastW || h > refH || !typing()) refH = h; // 宽度变了（拖中缝）、变高了、或没在输入：直接用当前高度
    lastW = w;
    root.style.fontSize = (refH / 10.52) + 'px';
    var cls = root.className.replace(/(^|\s)(portrait|landscape)(?=\s|$)/g, '');
    root.className = (cls ? cls + ' ' : '') + (w < refH ? 'portrait' : 'landscape');
  }
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('focusout', function () { setTimeout(apply, 300); }); // 收起键盘后按当前高度校正
  window.VIEWPORT = { refHeight: function () { return refH; }, typing: typing };
})();
