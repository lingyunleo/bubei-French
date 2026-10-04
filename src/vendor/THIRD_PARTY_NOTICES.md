# 第三方软件与素材说明

本项目自有代码、程序生成的场景与笔迹、项目自编学习示例采用项目根目录的 MIT 许可证，版权所有 © 2026 凌云_Léo。下列第三方软件、字体和音频继续采用各自的许可证；项目 MIT 许可不替代这些许可。引用上游项目不表示获得其背书。

本清单于 2026-10-04 核对。路径以 `src/` 为起点；SHA-256 是当前随附文件的指纹，用于复核发布内容，不代表上游签名。升级或修改对应文件后，应同步核对版本、来源、许可与指纹。

## 软件

| 组件 | 本项目中的文件 | 许可文件 | 上游来源 |
| --- | --- | --- | --- |
| ts-fsrs 5.4.2 | `vendor/fsrs.umd.js` | `vendor/fsrs-LICENSE.txt`，MIT | https://github.com/open-spaced-repetition/ts-fsrs/tree/v5.4.2 |
| Alea，随 ts-fsrs 5.4.2 内嵌 | 包含于 `vendor/fsrs.umd.js`，未单独加载 | `vendor/alea-LICENSE.txt`，MIT；Copyright (C) 2010 Johannes Baagøe | https://github.com/open-spaced-repetition/ts-fsrs/blob/v5.4.2/packages/fsrs/src/alea.ts |
| Three.js 0.160.1（运行时 revision 160） | `vendor/three.min.js` | `vendor/three-LICENSE.txt`，MIT | https://github.com/mrdoob/three.js/tree/r160 |
| Earcut 2.2.4，随 Three.js 内嵌 | 包含于 `vendor/three.min.js`，未单独加载 | `vendor/earcut-LICENSE.txt`，ISC；Copyright (c) 2016 Mapbox | https://github.com/mrdoob/three.js/blob/r160/src/extras/Earcut.js 与 https://github.com/mapbox/earcut/tree/v2.2.4 |
| Lenis 1.3.26 | `vendor/lenis.min.js` | `vendor/lenis-LICENSE.txt`，MIT | https://github.com/darkroomengineering/lenis |
| SheetJS Community Edition 0.20.3 | `vendor/xlsx.full.min.js` | `vendor/xlsx-LICENSE.txt`，Apache-2.0 | https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js |

软件文件 SHA-256：

```text
59b7444121d0aae5bb969097ed95df38eff4a4f878e459703c63720f6b6a176b  vendor/fsrs.umd.js
170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa  vendor/three.min.js
53195c9797e7ce7bf9d7fa9242b08209e57f46de4c9dac126a6494fa780e3346  vendor/lenis.min.js
0542a718400c5520745b0219afc04f06e963835fce3ddfbaee5b11440f5e3e33  vendor/xlsx.full.min.js
```

SheetJS 官方副本的原始 SHA-256 为 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`；本项目副本只省略文件末尾一个换行，代码未改变。许可来源为 https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE 。其余软件的上游链接用于定位源码；上述指纹标识的是本项目实际随附的文件。

## 字体

`atelier-fonts.css` 内嵌两份 Cormorant Garamond 字体：Italic 和 Medium，字体内部版本均为 4.001。CSS 中的 `Atelier Serif` 是使用别名，字体内部仍保留原名称、作者信息及许可链接。

- 作者：Copyright 2015 the Cormorant Project Authors。
- 许可：SIL Open Font License 1.1，完整文本见 `vendor/Cormorant-OFL.txt`。
- 上游项目：https://github.com/CatharsisFonts/Cormorant 。
- 字体许可参考：https://github.com/google/fonts/blob/main/ofl/cormorantgaramond/OFL.txt 。
- 字体继续按 OFL 分发，不改为项目 MIT 许可。

SHA-256：

```text
9542dc90f0422ff9999be7b7df2a2d1e30843b8ee6cc573ee950ef2b2fc18afc  atelier-fonts.css
0b9a8a33cfaa624d30f70f9b6686da769b319b8c37a55af16e29fef690108bbf  解码后的 Cormorant Garamond Italic TTF
1724047c8988ca5155bff667bc48fa52e97d57aabc6b42eebbf986f21a4be20b  解码后的 Cormorant Garamond Medium TTF
```

## 场景、笔迹与入门示例

`carnet-scene.js` 的几何体、纹理与镜头由项目程序生成；`carnet-scene-assets.js` 中的 24 张 WebP 是该场景的静态关键帧。`carnet-ink.js` 包含项目绘制的中心线笔迹，未从字体轮廓提取。这些项目资源随项目 MIT 许可分发，不包含本地参考视频、教材或外部图片库素材。

`seed.js` 提供 50 个常用入门词和 100 条示例：99 条项目自编例句使用设备或浏览器语音朗读，另有下述真人音频。项目自编示例随项目 MIT 许可分发，不声称它们是语料频率排名或出版物摘录。

资源文件 SHA-256：

```text
53e173a228df4daa19887f7dfa340518f1758288458f77ba9e3043ce723911e2  carnet-scene.js
a47bab0cbf6701e13ad4136a0d11c2e5579ed2679da2e4031f8d669438a0b7d6  carnet-scene-assets.js
ef96bb478c9d88e7667f4d55fda6bb8eb88e4f3688d9475b7ce0815dccd3e0d6  carnet-ink.js
274e0be27c72d9d1351da170cc3a9080e6e25aef37ba922c342a01390093d690  seed.js
```

## 内置真人音频

- 作品：`Fr-comment-allez‐vous.ogg`，法语短句 “Comment allez-vous ?”。
- 朗读者与版权人：Vion Nicolas，2006。
- 来源：The Shtooka Project / Wikimedia Commons。
- 原文件页：https://commons.wikimedia.org/wiki/File:Fr-comment-allez%E2%80%90vous.ogg 。
- 许可：Creative Commons Attribution 2.0 France（CC BY 2.0 FR）。
- 许可链接：https://creativecommons.org/licenses/by/2.0/fr/ 。
- 法律文本：https://creativecommons.org/licenses/by/2.0/fr/legalcode 。
- 使用方式：内嵌 Wikimedia 官方 MP3 转码，未剪辑；可离线播放。项目另外提供中文译文。它不是影视片段，朗读者未为本项目背书。
- MP3 来源：https://upload.wikimedia.org/wikipedia/commons/transcoded/c/ca/Fr-comment-allez%E2%80%90vous.ogg/Fr-comment-allez%E2%80%90vous.ogg.mp3 。
- `seed.js` 内 `builtin-comment-allez-vous` 解码后 MP3 的 SHA-256：`a86b816455286310bf276a35e357dea967c3cd8cc90dc654f5f7244986d63780`。

## 单 HTML 构建与许可保留

`build.py` 将项目 MIT 许可写入 `project-license` 文本块，将本清单和七份完整第三方软件/字体许可写入 `third-party-licenses` 文本块。页面中的音频例句也显示来源、作者和许可链接。

项目 LICENSE 默认只从两个受控位置选择：公开目录结构 `LICENSE + src/` 中的 `src/../LICENSE`，或本地开发结构 `LICENSE + 开发资料/src/` 中的 `src/../../LICENSE`。恰好找到一份时使用；没有找到或两处同时存在时，构建会报错，可以传入 `--project-license /明确路径/LICENSE`。任何必需的许可或本清单缺失、为空时，构建都会失败，不会从历史档案或本机绝对路径补取。
