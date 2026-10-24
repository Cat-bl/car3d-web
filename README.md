# 3D 车况 · 调整车模：给 3D 车况（原生）做车模包

在线打开：https://cat-bl.github.io/car3d-web/

基于民间 4.5UI 开发，只用来调整车模。[3D 车况（原生）](https://github.com/Cat-bl/car3d-native) 没有"调整车模"，要换成自己的车，就在这里把车模调好、导出车模包，再导进原生版。

## 做车模包

1. 用电脑浏览器（Chrome、Edge）打开上面的网址。第一次打开有一段引导，演示怎么调整车模，右上角随时能关。
2. 点右上角的齿轮，在"车模"里点"导入车模"，选你的车模文件（.glb / .gltf，.gltf 要和它的 .bin、贴图一起选上）。
3. 点"调整车模"，把车门、车窗、引擎盖、尾门、车轮、车漆、各种车灯标出来；需要的话挂上车牌、贴上贴纸。
4. 点下面的"导出车模包"，得到一个 .glb 文件。
5. 拷到车机上，在 3D 车况（原生）的设置里点"导入车模包"。

## 打不开时

GitHub 在国内有时连不上。可以换个网络，或者过一会儿再试；也可以把这些文件下载下来（这个页面上的 Code → Download ZIP，或者找能打开的人要一份），解压后用电脑浏览器直接打开里面的 `index.html`，用法一样。

## 许可

- 默认车模 2016 Exotic Rides W70 是 CC BY-NC-SA 4.0：**不能商用**，署名见 `LICENSE-car.txt`。
- three.js：`LICENSE-three.txt`；Draco、meshoptimizer 解码器：`LICENSE-decoders.txt`；字体：`LICENSE-fonts.txt`；影棚环境图：`LICENSE-hdri.txt`。
