/* demo3d 车况页的车况图标、顶栏系统图标、底部数据（car3d.js 画，settings.js 列底部数据的选项）。
   车况图标只在开着 / 有异常时亮，展厅平时干净：左列座舱（主驾安全带；前排座椅加热、通风；空调；除霜；静音），
   左列空调带自动 / 手动、送风方向，后排空调开着另列一项；
   右列驾驶和能源（驾驶 / 能源模式、能量回收高、声浪、保电、无线充电、PM2.5、坡度、发动机转速）、灯光指示（远光、雾灯、双闪）、告警（低压供电、钥匙电池）。
   顶栏系统图标：移动信号、Wi-Fi、蓝牙、飞行模式、热点（宿主报 null 是未知，不当成关着，不画）。
   单位没被证实的原始读数只显示数、带 *（文档写着"未确认"的）。全部 ES5。 */
(function () {
  'use strict';
  var A = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  function svg(d, extra) { return '<svg viewBox="0 0 24 24"' + (extra || '') + '><path d="' + d + '" ' + A + '/></svg>'; }
  var ICON = {
    defF: 'M3.5 17.5C6.5 9.5 17.5 9.5 20.5 17.5ZM8.6 15.2c-1-1.3 1-2.6 0-3.9M12 14.8c-1-1.4 1-2.8 0-4.2M15.4 15.2c-1-1.3 1-2.6 0-3.9',
    defR: 'M4 7h16v10H4zM8.5 15c-1-1.5 1-3 0-4.5M12 15c-1-1.5 1-3 0-4.5M15.5 15c-1-1.5 1-3 0-4.5',
    mute: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9.5l5 5M20.5 9.5l-5 5',
    regen: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v3.8h-3.8',
    sim: 'M3 12h2M7 8.5v7M11 5.5v13M15 8.5v7M19 10.5v3',
    save: 'M5 7.5h12v9H5zM17 10.5h2v3h-2M8 12l2 2 3.5-3.5',
    wc: 'M9 3.5h6a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM5 9c-1.2 2-1.2 4 0 6M19 9c1.2 2 1.2 4 0 6',
    pm: 'M7 18.5h10a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 6.8 12 3.3 3.3 0 0 0 7 18.5z',
    slope: 'M3 19h18V9.5zM7.5 17.2h3',
    rpm: 'M4.5 16.5a7.5 7.5 0 1 1 15 0M12 16.5l3.8-4.6M4.5 16.5h1.6M17.9 16.5h1.6',
    high: 'M11 6.5c4.2 0 7.5 2.5 7.5 5.5s-3.3 5.5-7.5 5.5zM3 8.5h5M3 12h5M3 15.5h5',
    fogF: 'M13 6.5c4 0 7.5 2.5 7.5 5.5s-3.5 5.5-7.5 5.5zM3 8.5l6 1M3 12h6M3 15.5l6-1M6.5 5.5c-1.4 2.2 1.4 4.3 0 6.5s1.4 4.3 0 6.5',
    fogR: 'M11 6.5C7 6.5 3.5 9 3.5 12S7 17.5 11 17.5zM15 8.5h6M15 12h6M15 15.5h6M17.5 5.5c-1.4 2.2 1.4 4.3 0 6.5s1.4 4.3 0 6.5',
    hazard: 'M12 3.8 21 19.5H3zM12 9.2l3.5 6.3h-7z',
    brake: 'M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM12 8.8v3.8M12 15.2v.1M4.6 6.5a8.6 8.6 0 0 0 0 11M19.4 6.5a8.6 8.6 0 0 1 0 11',
    gps: 'M12 21s-6.2-5.6-6.2-10.6a6.2 6.2 0 0 1 12.4 0C18.2 15.4 12 21 12 21zM12 8.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z',
    lowV: 'M4 7.5h16v11H4zM7.5 5.5v2M16.5 5.5v2M7 13h3M14 13h3M15.5 11.5v3',
    key: 'M8 15.5a3.8 3.8 0 1 1 3.4-5.5H21v3h-2v2h-2.5v-2h-5.1A3.8 3.8 0 0 1 8 15.5zM7 11.7h.01',
    bt: 'M7 7.5l10 9-5 4.2V3.3l5 4.2-10 9',
    plane: 'M20.5 15.2v-1.8l-7.3-4.6V4.5a1.2 1.2 0 0 0-2.4 0v4.3l-7.3 4.6v1.8l7.3-2.3v4.4l-1.9 1.4v1.4l3.1-.9 3.1.9v-1.4l-1.9-1.4v-4.4z',
    spot: 'M12 13.3a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zM8.6 15.4a4.8 4.8 0 0 1 0-6.8M15.4 15.4a4.8 4.8 0 0 0 0-6.8M5.8 18.2a8.8 8.8 0 0 1 0-12.4M18.2 18.2a8.8 8.8 0 0 0 0-12.4',
    nosim: 'M7 3.5h6.5L17 7v13.5H7zM10 11.5l4 4M14 11.5l-4 4',
    belt: 'M12 6.6a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2zM7.5 21v-7.2a4.5 4.5 0 0 1 9 0V21M9 10.4l6.6 8.3M15.6 18.7h2.2',
    heat: 'M8 19.5c-1.6-2.2 1.6-4.3 0-6.5s1.6-4.3 0-6.5M12 19.5c-1.6-2.2 1.6-4.3 0-6.5s1.6-4.3 0-6.5M16 19.5c-1.6-2.2 1.6-4.3 0-6.5s1.6-4.3 0-6.5',
    vent: 'M7 3.6c.9 0 1.6.6 1.8 1.5L10.2 13H16a2 2 0 0 1 0 4H9.6a2 2 0 0 1-2-1.6L5.6 5.6C5.4 4.5 6.1 3.6 7 3.6zM8 20.5h9M12.5 4.5h4a1.6 1.6 0 1 0-1.6-1.6M13.5 7.5h6a1.6 1.6 0 1 1-1.6 1.6M12.5 10.5h3' // 座椅通风：座椅侧影 + 三道风（空调是实心风扇，别弄得像）
  };
  // 空调：风扇（同车顶的空调按钮，实心四片叶子）
  var FAN_D = 'M11.2 9.9C9.6 6.6 10.4 2 14.3 1.4c3.2-.5 4.6 2.9 2.6 5.7-1.4 2-3.5 3.1-5.7 2.8z';
  var FAN = '<svg viewBox="0 0 24 24" fill="currentColor">' + [0, 90, 180, 270].map(function (r) { return '<path d="' + FAN_D + '"' + (r ? ' transform="rotate(' + r + ' 12 12)"' : '') + '/>'; }).join('') + '<circle cx="12" cy="12" r="1.9"/></svg>';
  function item(cls, icon, text) { return '<div class="tti' + (cls ? ' ' + cls : '') + '">' + (icon ? svg(ICON[icon]) : '') + (text ? '<span>' + text + '</span>' : '') + '</div>'; }

  var LV = { 1: '低档', 2: '高档' }; // 座椅加热、通风（解码后 0 关、1 低、2 高）
  /** 前排座椅加热 / 通风：开着的才列，"主驾高档 · 副驾低档" */
  function seatLv(c, what) {
    var l = [];
    [['driver', '主驾'], ['passenger', '副驾']].forEach(function (p) { var v = c['seat.' + p[0] + '.' + what]; if (typeof v === 'number' && v > 0) l.push(p[1] + (LV[v] || v + ' 档')); });
    return l.join(' · ');
  }

  function num(v, d) { return typeof v === 'number' ? (d ? Math.round(v * 10) / 10 : Math.round(v)) : null; }
  var PM = { 1: '优', 2: '良', 3: '轻度', 4: '中度', 5: '重度', 6: '严重' };
  var WIND = { face: '吹脸', faceFeet: '脸+脚', feet: '吹脚', feetScreen: '脚+风挡', screen: '吹风挡', faceFeetScreen: '脸脚风挡', faceScreen: '脸+风挡' };
  /** 空调的小标：自动、送风方向（后排没有内循环、A/C） */
  function acTags(c, pre) {
    return (c[pre + 'controlMode'] === 'auto' ? '<i>AUTO</i>' : '') + (WIND[c[pre + 'windMode']] ? '<i>' + WIND[c[pre + 'windMode']] + '</i>' : '');
  }
  /** 车况图标：{ L: 座舱, R: 驾驶和能源、灯光、告警 }，每项是一段 HTML */
  function telltales(c) {
    var L = [], R = [], gear = c['driving.gear'], sp = c['driving.speed'], moving = gear === 'D' || gear === 'R' || (typeof sp === 'number' && sp > 0);
    // 左列：座舱。安全带只有主驾有数据（副驾、后排宿主报的不准，实测扣没扣都是已系）：系着绿色图标，没系红色
    var belt = c['seat.driver.beltFastened'];
    if (belt === true) L.push(item('ok solo', 'belt', ''));
    else if (belt === false) L.push(item('bad', 'belt', moving ? '主驾没系安全带' : '主驾未系'));
    var heat = seatLv(c, 'heating'), vent = seatLv(c, 'ventilation');
    if (heat) L.push(item('warm', 'heat', '加热 ' + heat));
    if (vent) L.push(item('on', 'vent', '通风 ' + vent));
    if (c['ac.power'] === true) {
      var t = num(c['ac.driverTemperature'], 1), f = c['ac.fanLevel'], tx = [];
      if (t !== null) tx.push(t + '°C');
      if (typeof f === 'number') tx.push('风 ' + f);
      var sub = acTags(c, 'ac.') + (c['ac.circulation'] === 'inside' ? '<i>内循环</i>' : '') + (c['ac.compressor'] === true ? '<i>A/C</i>' : '');
      L.push('<div class="tti on">' + FAN + '<span>' + (tx.join(' · ') || '空调开着') + sub + '</span></div>');
    }
    if (c['ac.rear.power'] === true) { // 后排空调：开着才列
      var rt = num(c['ac.rear.temperature'], 1), rf = c['ac.rear.fanLevel'], rx = [];
      if (rt !== null) rx.push(rt + '°C');
      if (typeof rf === 'number') rx.push('风 ' + rf);
      L.push('<div class="tti on">' + FAN + '<span>后排' + (rx.length ? ' ' + rx.join(' · ') : '空调开着') + acTags(c, 'ac.rear.') + '</span></div>');
    }
    if (c['ac.frontDefrost'] === true) L.push(item('warm', 'defF', '前除霜'));
    if (c['ac.rearDefrost'] === true) L.push(item('warm', 'defR', '后除霜'));
    if (c['audio.muted'] === true) L.push(item('', 'mute', '静音'));
    // 右列：驾驶和能源
    var om = { eco: 'ECO', sport: 'SPORT', comfort: 'COMFORT' }[c['energy.operationMode']], em = { ev: 'EV', hev: 'HEV' }[c['energy.mode']];
    if (om || em) R.push('<div class="tti modes">' + (om ? '<b class="m-' + c['energy.operationMode'] + '">' + om + '</b>' : '') + (em ? '<b class="m-' + c['energy.mode'] + '">' + em + '</b>' : '') + '</div>');
    if (c['energy.regenerationLevel'] === 'high') R.push(item('', 'regen', '能量回收 高'));
    if (c['energy.simulator'] === true) R.push(item('', 'sim', '声浪'));
    if (typeof c['energy.socSave'] === 'boolean') {
      var soc = num(c['energy.socTarget']);
      R.push(item('', 'save', (c['energy.socSave'] ? '强制保电' : '智能保电') + (soc !== null ? ' ' + soc + '%' : '')));
    }
    if (c['energy.wirelessCharging'] === true) {
      var ws = c['energy.wirelessChargingState'];
      R.push(item(ws === 'charging' ? 'ok' : ws === 'fault' ? 'bad' : '', 'wc', { charging: '无线充电中', full: '手机已充满', fault: '无线充电故障', standby: '无线充电' }[ws] || '无线充电'));
    }
    var pl = c['environment.pm25.indoorLevel'];
    if (typeof pl === 'number' && pl >= 3) R.push(item(pl >= 5 ? 'bad' : 'warn', 'pm', '车内 PM2.5 ' + (PM[pl] || '') + (typeof c['environment.pm25.indoor'] === 'number' ? ' ' + Math.round(c['environment.pm25.indoor']) : '')));
    var sl = c['environment.slope'];
    if (typeof sl === 'number' && Math.abs(sl) >= 5) R.push(item('warn', 'slope', '坡度 ' + Math.round(sl) + '%'));
    var rpm = c['engine.rpm'];
    if (typeof rpm === 'number' && rpm > 0) R.push(item('', 'rpm', Math.round(rpm) + ' rpm'));
    // 灯光指示（仪表上常见的几个）
    if (c['light.highBeam'] === true) R.push(item('blue', 'high', '远光'));
    if (c['light.frontFog'] === true) R.push(item('ok', 'fogF', '前雾灯'));
    if (c['light.rearFog'] === true) R.push(item('warn', 'fogR', '后雾灯'));
    if (c['light.hazard'] === true) R.push(item('bad', 'hazard', '双闪'));
    if (c['light.brake'] === 'flash') R.push(item('bad', 'brake', '紧急制动')); // 刹车灯快闪（平常踩刹车不提示）
    // 告警
    if (c['warning.lowVoltageBatteryFault'] === true) R.push(item('bad', 'lowV', '低压供电异常'));
    if (c['warning.keyBatteryLow'] === true) R.push(item('warn', 'key', '钥匙电池低'));
    return { L: L, R: R };
  }

  /** 顶栏系统图标 */
  function bars(n, max, w) { // 信号格：n 格亮
    var h = '<svg viewBox="0 0 24 24" class="bars">';
    for (var i = 0; i < max; i++) { var bh = 5 + i * (14 / (max - 1)); h += '<rect x="' + (3 + i * w) + '" y="' + (20 - bh) + '" width="' + (w - 1.6) + '" height="' + bh + '" rx="1" class="' + (i < n ? 'on' : 'off') + '"/>'; }
    return h + '</svg>';
  }
  function wifi(level, on) {
    var arcs = ['M12 18.5h.01', 'M9.2 15.6a4 4 0 0 1 5.6 0', 'M6.4 12.8a8 8 0 0 1 11.2 0', 'M3.6 10a12 12 0 0 1 16.8 0'], h = '<svg viewBox="0 0 24 24" class="wifi' + (on ? '' : ' hollow') + '">';
    arcs.forEach(function (d, i) { h += '<path d="' + d + '" ' + A + ' class="' + (on && i <= level ? 'on' : 'off') + '"/>'; });
    return h + '</svg>';
  }
  function sys(s) {
    var h = '', bad = s['network.validated'] === false;
    if (s['airplane.enabled'] === true) h += '<i class="si">' + svg(ICON.plane) + '</i>';
    else if (s['cellular.simState'] === 1) h += '<i class="si dim">' + svg(ICON.nosim) + '</i>';
    else if (typeof s['cellular.signalLevel'] === 'number') {
      h += '<i class="si">' + bars(s['cellular.signalLevel'], 4, 4.6) + (s['cellular.displayType'] ? '<b>' + s['cellular.displayType'] + '</b>' : '') + (bad && s['network.transport'] === 'cellular' ? '<em>!</em>' : '') + '</i>';
    }
    if (s['wifi.enabled'] === true) {
      var con = s['wifi.connected'] === true;
      h += '<i class="si' + (con ? '' : ' dim') + '">' + wifi(con ? (typeof s['wifi.signalLevel'] === 'number' ? Math.min(3, s['wifi.signalLevel']) : 3) : 0, con) + (bad && s['network.transport'] === 'wifi' ? '<em>!</em>' : '') + '</i>';
    }
    if (s['bluetooth.enabled'] === true) h += '<i class="si' + (s['bluetooth.connectionState'] === 2 ? '' : ' dim') + '">' + svg(ICON.bt) + '</i>';
    if (s['gps.enabled'] === true) h += '<i class="si' + (s['gps.permissionGranted'] === false ? ' dim' : '') + '">' + svg(ICON.gps) + (s['gps.permissionGranted'] === false ? '<em>!</em>' : '') + '</i>'; // 定位开着；宿主没拿到精确位置权限时打个叹号
    if (s['hotspot.enabled'] === true) h += '<i class="si">' + svg(ICON.spot) + '</i>';
    return h;
  }

  // ================= 底部数据：[id, 名字, 分组, 字段, 格式]；格式：%、km、°C、档、天、rpm 带单位；'*' 原始读数（单位没证实）；'u' 单位跟着同节点编码；'dur' 时长；'rt' 充电还要多久 =================
  var STATS = [
    ['bat', '电量', '能源'], ['fuel', '油量', '能源'], ['range', '总续航', '能源'], ['eRange', '纯电续航', '能源'], ['fRange', '燃油续航', '能源'],
    ['soc', 'SOC 目标', '能源', 'energy.socTarget', '%'], ['chgT', '充电还要', '能源', 'energy.charging.remainingTime', 'rt'],
    ['chgP', '充电功率', '能源', 'energy.charging.power', '*'], ['chgC', '充电量', '能源', 'energy.charging.capacity', '*'],
    ['eAvg', '平均电耗', '能耗', 'energy.consumption.averageElectric', 'u*'], ['eRec', '近期电耗', '能耗', 'energy.consumption.recentElectric', '*'],
    ['eNow', '瞬时电耗', '能耗', 'energy.consumption.instantElectric', '*'], ['fAvg', '平均油耗', '能耗', 'energy.consumption.averageFuel', '*'],
    ['fRec', '近期油耗', '能耗', 'energy.consumption.recentFuel', '*'], ['fNow', '瞬时油耗', '能耗', 'energy.consumption.instantFuel', 'u'],
    ['odo', '总里程', '里程'], ['dur', '本次时长', '里程', 'driving.sessionDuration', 'dur'], ['trip', '本次里程', '里程', 'driving.sessionDistance', 'km'],
    ['jour', '旅程里程', '里程', 'driving.journeyDistance', 'u'], ['evT', '累计纯电', '里程', 'driving.evTotalDistance', 'km'], ['hevT', '累计混动', '里程', 'driving.hevTotalDistance', 'km'],
    ['evS', '本次纯电', '里程', 'driving.evSessionDistance', 'km'], ['hevS', '本次混动', '里程', 'driving.hevSessionDistance', 'km'], ['avgSp', '平均速度', '里程', 'driving.averageSpeed', '*'],
    ['temp', '车外温度', '空调'], ['inTemp', '车内温度', '空调'], ['setT', '空调设温', '空调', 'ac.driverTemperature', '°C'], ['fan', '风量', '空调', 'ac.fanLevel', '档'],
    ['rSetT', '后排设温', '空调', 'ac.rear.temperature', '°C'], ['rFan', '后排风量', '空调', 'ac.rear.fanLevel', '档'],
    ['pmIn', '车内 PM2.5', '环境', 'environment.pm25.indoor', '*'], ['pmOut', '车外 PM2.5', '环境', 'environment.pm25.outdoor', '*'], ['slope', '坡度', '环境', 'environment.slope', '%'],
    ['acc', '油门踏板', '驾驶', 'body.pedals.accelerator', '%'], ['brk', '制动踏板', '驾驶', 'body.pedals.brake', '%'],
    ['rpm', '发动机转速', '驾驶', 'engine.rpm', 'rpm'], ['mF', '前电机转速', '驾驶', 'motor.front.rpm', 'rpm'], ['mR', '后电机转速', '驾驶', 'motor.rear.rpm', 'rpm'],
    // 雷达：厂商原值 0～155，单位没标定，只显示数（带 *）
    ['rdLF', '左前雷达', '雷达', 'radar.distance.leftFront', '*'], ['rdFLM', '前左中雷达', '雷达', 'radar.distance.frontLeftMid', '*'], ['rdFRM', '前右中雷达', '雷达', 'radar.distance.frontRightMid', '*'],
    ['rdRF', '右前雷达', '雷达', 'radar.distance.rightFront', '*'], ['rdL', '左侧雷达', '雷达', 'radar.distance.left', '*'], ['rdR', '右侧雷达', '雷达', 'radar.distance.right', '*'],
    ['rdLR', '左后雷达', '雷达', 'radar.distance.leftRear', '*'], ['rdMR', '后中雷达', '雷达', 'radar.distance.middleRear', '*'], ['rdRR', '右后雷达', '雷达', 'radar.distance.rightRear', '*'],
    // 三种预警：厂商原码，文档不给含义（不当成有没有告警），只显示数
    ['bsdL', '左盲区预警码', '预警原码', 'warning.bsd.left', ''], ['bsdR', '右盲区预警码', '预警原码', 'warning.bsd.right', ''],
    ['dowL', '左开门预警码', '预警原码', 'warning.dow.left', ''], ['dowR', '右开门预警码', '预警原码', 'warning.dow.right', ''],
    ['rctaL', '左后横向预警码', '预警原码', 'warning.rcta.left', ''], ['rctaR', '右后横向预警码', '预警原码', 'warning.rcta.right', ''],
    ['cool', '冷却液', '其他', 'engine.coolantTemperature', '*'], ['vol', '音量', '其他', 'audio.volume', ''],
    ['navVol', '导航音量', '其他', 'audio.navigationVolume', ''], ['mtD', '保养里程', '其他', 'maintenance.distance', 'km'], ['mtDay', '保养天数', '其他', 'maintenance.days', '天']
  ];
  var BY = {};
  STATS.forEach(function (s) { BY[s[0]] = s; });
  /** 这一项的 [数, 单位]（没数据 null） */
  function stat(id, c, unitOf) {
    var s = BY[id], v = s && s[3] ? c[s[3]] : undefined, f = s && s[4];
    if (f === 'rt') return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' ? [v[0] ? v[0] + '<small>时</small>' + v[1] : v[1], '分'] : null;
    if (typeof v !== 'number') return null;
    if (f === 'dur') { var m = Math.floor(v / 60); return m >= 60 ? [Math.floor(m / 60) + '<small>时</small>' + (m % 60), '分'] : [m, '分']; }
    var d = f === '*' || f === 'u*' || f === 'u' || f === 'km' && v < 100 ? 1 : 0, n = d ? Math.round(v * 10) / 10 : Math.round(v);
    if (f === 'u' || f === 'u*') return [n, (unitOf(s[3]) || '') + (f === 'u*' ? '*' : '')];
    if (f === '*') return [n, '*'];
    return [n, f];
  }
  window.D3CarStat = { telltales: telltales, sys: sys, STATS: STATS, stat: stat, field: function (id) { return BY[id] && BY[id][3]; } };
})();
