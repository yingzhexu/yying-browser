<p align="center">
  <img src="build/icon.png" width="96" alt="YYING浏览器图标">
</p>

<h1 align="center">YYING浏览器</h1>

<p align="center">
  一套 Chromium 内核，最多 10 个独立账号环境。<br>
  用侧栏、快捷键和批量操作，把多个浏览器管理起来。
</p>

<p align="center">
  <strong>简体中文</strong> · <a href="README_EN.md">English</a><br>
  <a href="https://github.com/yingzhexu/yying-browser/releases/latest">下载安装包</a> ·
  <a href="docs/releases/v4.0.0.md">4.0.0 中英文版本介绍</a> ·
  <a href="https://github.com/yingzhexu/yying-browser/issues">反馈问题</a> ·
  <a href="LICENSE">MIT 开源协议</a>
</p>

<p align="center">
  <a href="https://github.com/yingzhexu/yying-browser/releases"><img src="https://img.shields.io/github/v/release/yingzhexu/yying-browser?label=release" alt="最新版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
</p>

<p align="center">
  <img src="docs/screenshots/home.png" width="1000" alt="YYING浏览器主页：管理多个独立浏览器配置">
</p>

## 下载与安装

**普通用户下载下表中的安装包，无需安装 Node.js，也无需下载源码。**

| 系统 | 安装包 | 下载 |
| --- | --- | --- |
| Windows 10 / 11，64 位 Intel / AMD | `YYING浏览器-4.0.0-安装版.exe` | [下载 Windows 安装版](https://github.com/yingzhexu/yying-browser/releases/download/v4.0.0/YYING%E6%B5%8F%E8%A7%88%E5%99%A8-4.0.0-%E5%AE%89%E8%A3%85%E7%89%88.exe) |
| macOS 13 Ventura 及以上，Apple 芯片 / Intel 通用 | `YYING浏览器-4.0.0-Mac.dmg` | [下载 macOS 通用版](https://github.com/yingzhexu/yying-browser/releases/download/v4.0.0/YYING%E6%B5%8F%E8%A7%88%E5%99%A8-4.0.0-Mac.dmg) |
| 校验文件 | `SHA256SUMS.txt` | [下载 SHA-256 校验值](https://github.com/yingzhexu/yying-browser/releases/download/v4.0.0/SHA256SUMS.txt) |

[查看全部发行版本与版本介绍](https://github.com/yingzhexu/yying-browser/releases)。GitHub 在 Releases 中自动生成的 `Source code (zip)` / `Source code (tar.gz)` 是源码压缩包，不能当作安装包运行。

**Windows 安装**：运行 `.exe`，选择安装路径并完成向导。安装向导使用简体中文，可创建桌面和开始菜单快捷方式。

**macOS 安装**：打开 `.dmg`，把「YYING浏览器」拖到「应用程序」，再从「应用程序」启动。一个安装包同时包含 Apple 芯片和 Intel 版本。

当前 Windows 构建没有发布者数字签名；macOS 构建采用 ad-hoc 临时签名，没有 Apple Developer ID 签名或公证。系统首次运行时可能提示未知发布者或要求在「系统设置 → 隐私与安全性」中确认。具体提示取决于系统版本和设置。

## 这是什么

YYING浏览器是一个基于 **Electron 45.2.1** 的桌面多账号浏览器，适合在一台电脑上分别管理工作号、个人号、不同店铺或测试账号。无需为每个账号安装另一套浏览器，就能在独立配置间切换。

每个配置使用持久化 Chromium Session 分区，分别保存 Cookie、网站存储、缓存、历史记录和书签。配置名称、颜色和备注帮助区分不同账号；关闭应用后，已保存的数据会在下次启动时重新使用。

所有配置使用同一套 Electron / Chromium 运行时，Electron 仍然会创建多个渲染进程、GPU 进程等。实际内存和 CPU 占用取决于网页与标签页数量，本项目未发布对比性能测试。

**当前应用界面以简体中文为主；本仓库提供完整中文、英文项目文档和发行说明。英文文档不代表应用已经实现完整英文界面切换。**

## 快速上手

1. 安装并打开 YYING浏览器，在主页创建一个浏览器，填写名称，选择颜色；可添加备注和启动网址。
2. 点击「打开浏览器」，在该窗口登录第一个账号。
3. 回到主页创建另一个浏览器，再登录其他账号；不同配置分别保存各自的登录状态。
4. 用窗口右侧的快捷切换栏，或浏览器名称菜单，在已创建的配置之间切换。
5. 需要同时操作多个账号时，在主页选择「批量打开网页」；每行一个网址或搜索词，一次最多 20 条。
6. 在主页的设置中选择默认主题、搜索引擎、标签页恢复、低性能模式等；硬件加速和低性能模式的部分更改需要重启。

## 功能详解

### 多账号配置与窗口管理

| 功能 | 说明 |
| --- | --- |
| 最多 10 个配置 | 每个配置使用独立持久化 Session；可单独打开或关闭 |
| 名称、备注和颜色 | 名称最多 20 字符，备注最多 40 字符；支持自定义启动页 |
| 拖动排序 | 主页排列顺序也用于浏览器切换菜单和编号快捷键 |
| 右侧快速切换栏 | 查看其他配置是否运行，点击切换，并对齐窗口位置和大小 |
| 批量改名 | 按选定配置和起始编号改为「微店1、微店2……」等名称 |
| 全部后台打开 | 依次启动尚未打开的配置，为后续切换做准备 |
| 平铺与全屏 | 自动排列已打开的浏览器窗口，或统一切换全屏 |

### 批量打开网页

在多个选中的浏览器中打开同样的一组网址，每个浏览器继续使用自己的登录状态。

- 每行输入一个网址或搜索词，一次最多 20 条。
- 可以在新标签页打开，或用第一条网址替换各浏览器的当前页面。
- 可选择打开后平铺窗口。
- 网址较多时，部分后台标签页先保持休眠，切换到该标签页时才加载。

### 日常浏览

- 标签页：新建、关闭、拖动排序、恢复已关闭标签页、静音，以及关闭其他或右侧标签页。
- 地址栏：支持网址和搜索词，结合当前配置的历史记录与书签提供联想。
- 搜索引擎：默认必应国际版，可在设置中切换 Google 或百度。
- 书签与历史：添加和删除书签，显示书签栏，搜索或清除当前配置的历史记录。
- 下载：查看速度和进度，暂停、继续、取消、打开文件或显示所在文件夹。
- 页面工具：页内查找、缩放、打印、视频全屏和开发者工具。
- 自定义：10 套主题；每个配置可单独设置主题及新标签页壁纸。

### 保存、休眠与低性能模式

| 行为 | 当前实现 |
| --- | --- |
| 标签页保存 | 每 15 秒保存一次；正常关闭窗口时也保存 |
| Cookie 写入 | 每 30 秒调用存储刷新；退出、系统关机或睡眠时尝试刷新 |
| 设置备份 | 配置与设置写入前保留 `.bak`，读取时可回退到备份 |
| 自动休眠 | 默认将约 20 分钟未使用的后台网页休眠；低性能模式约 3 分钟 |
| 休眠时机 | 跳过当前标签页、全屏标签页、正在播放声音或加载的网页；每分钟检查一次 |
| 唤醒 | 点击休眠标签页后重新加载页面，未提交的页面输入不保证保留 |
| 低性能模式 | 减少动画与特效，更积极休眠，并调整 Chromium 低端设备选项 |
| 网页无响应 | 提供等待或结束该网页的选择 |
| GPU 回退 | 累计多次 GPU 异常后，将硬件加速设置为关闭，于下次启动生效 |

网站可以主动使登录失效；应用也不能保证突然断电时最近的所有修改都已写入。会话 Cookie 会尝试转换为最长约 30 天的持久 Cookie，但网站仍决定登录是否有效。

## 界面截图

截图用于展示功能，部分细节可能来自开发过程中的界面。

| 浏览器窗口与右侧切换栏 | 新标签页 |
| --- | --- |
| ![浏览器窗口](docs/screenshots/browser.png) | ![新标签页](docs/screenshots/newtab.png) |
| **批量打开网页** | **批量改名** |
| ![批量打开网页](docs/screenshots/batch-open.png) | ![批量改名](docs/screenshots/batch-rename.png) |
| **深色主题与地址栏联想** | **设置** |
| ![深色主题](docs/screenshots/theme-dark.png) | ![设置](docs/screenshots/settings.png) |

## 快捷键

以下为默认快捷键；系统或其他软件占用同一组合时可能影响响应。

| 操作 | Windows | macOS |
| --- | --- | --- |
| 新建标签页 | `Ctrl+T` | `⌘T` |
| 关闭标签页 | `Ctrl+W` | `⌘W` |
| 恢复已关闭标签页 | `Ctrl+Shift+T` | `⌘⇧T` |
| 地址栏 | `Ctrl+L` | `⌘L` |
| 浏览器切换菜单 | `` Ctrl+` `` | `` ⌘` `` |
| 上一个 / 下一个浏览器 | `Ctrl+Alt+[` / `Ctrl+Alt+]` | `⌘⌥[` / `⌘⌥]` |
| 切到第 1—10 个浏览器 | `Ctrl+Alt+1` … `Ctrl+Alt+0` | `⌘⌥1` … `⌘⌥0` |
| 批量打开网页 | `Ctrl+Alt+B` | `⌘⌥B` |
| 平铺窗口 | `Ctrl+Alt+T` | `⌘⌥T` |
| 历史记录 | `Ctrl+H` | `⌘Y` |
| 下载列表 | `Ctrl+J` | `⌘⇧J` |
| 添加 / 取消书签 | `Ctrl+D` | `⌘D` |
| 显示 / 隐藏书签栏 | `Ctrl+Shift+B` | `⌘⇧B` |
| 书签管理 | `Ctrl+Shift+O` | `⌘⇧O` |
| 页内查找 | `Ctrl+F` | `⌘F` |
| 打印 | `Ctrl+P` | `⌘P` |
| 全屏 | `F11` | `⌃⌘F` |
| 设置 | `Ctrl+,` | `⌘,` |

## 数据位置、升级与备份

| 系统 | 数据目录 |
| --- | --- |
| Windows | `%APPDATA%\yingying浏览器` |
| macOS | `~/Library/Application Support/yingying浏览器` |

4.0.0 将应用名称改为 YYING浏览器，但继续使用原 `yingying浏览器` 目录，以便已有用户延续原配置。

目录内包括配置与设置 JSON、每个配置的会话、历史与书签、壁纸，以及 Chromium 的持久化分区数据。下载任务列表在当前运行期间按配置维护；实际下载文件默认保存在系统「下载」文件夹，同名文件自动编号。

**升级**：先正常退出应用，再安装新版。普通覆盖安装不主动删除已有数据；Windows 卸载器也配置为保留应用数据。不要在升级过程中清除配置或手动删除数据目录。

**备份**：完全退出应用后复制整个数据目录。恢复前也先退出应用，再恢复到同一位置。Cookie 等数据可能与系统账号及设备关联，跨电脑复制不保证保留登录。

## 常见问题与当前范围

**不同浏览器会不会共用账号？** 这里的“浏览器”指独立配置。Cookie 和网站存储按配置分区，同一配置中的标签页共用该配置的登录；不同配置分别保存状态。历史和书签也按配置管理。

**每个配置都有独立 IP 吗？** 当前版本没有内置每配置代理设置，默认使用电脑的网络连接。Session 隔离的范围是本地浏览状态。

**能安装 Chrome 扩展吗？** 当前没有面向用户的扩展商店或扩展管理界面。

**有同步、自动更新或手机版吗？** 当前没有内置云同步、自动更新和移动客户端。请在 Releases 下载新版本后手动升级。Linux 目前没有本项目提供的安装包。

**为什么安装包比较大？** 安装包包含 Electron / Chromium 运行时；macOS 通用版还同时包含两种 CPU 架构，无需用户另装运行环境。

**网页白屏、卡顿或视频显示异常怎么办？** 先关闭部分标签页，必要时打开低性能模式；显卡相关问题可尝试在设置中关闭硬件加速并重启。反馈时请提供系统版本、CPU 架构、应用版本、复现步骤和相关日志。

## 从源码运行

开发环境需要 **Node.js 22.12.0 或以上**，推荐 Node.js 24 LTS，以及 npm、Git。安装包用户不需要这些工具。Node 版本要求来自当前 Electron npm 包。

```bash
git clone https://github.com/yingzhexu/yying-browser.git
cd yying-browser
npm ci
npm start
```

`npm ci` 按 `package-lock.json` 安装已锁定依赖。当前 Electron 为 `45.2.1`，锁文件中的 electron-builder 为 `26.18.0`。本地运行也会使用上述应用数据目录；已有安装版用户应先备份数据，并避免同时运行两个版本。

## 从源码打包（开发者可选）

本次发行直接上传作者提供的现成安装包，保留原始文件名和内容。普通用户直接下载安装即可。以下命令供希望自行修改、打包的开发者使用：

```bash
npm run dist:win   # Windows x64，输出 dist/YYING浏览器-版本号-安装版.exe
npm run dist:mac   # macOS 通用版，输出 dist/YYING浏览器-版本号-Mac.dmg
```

macOS 安装包需要在 macOS 上构建。Windows 安装包建议在 Windows 上构建；从 macOS 交叉构建 Windows 时可能需要额外工具。

维护者发布新版本时，更新 `package.json`、锁文件与 `docs/releases/v版本号.md`，在 GitHub Releases 中选择对应标签，填写中英文版本介绍，并上传准备好的安装包及 SHA-256 校验文件。

## 项目结构

```text
src/
  main.js                     主进程：窗口、配置、Session、标签页、存储与菜单
  home.html                   配置管理主页、批量操作与设置
  browser.html                标签栏、地址栏、侧栏与浏览器切换栏
  newtab.html                 新标签页、搜索、主题和壁纸
  overlay.html                地址栏联想下拉框
  error.html                  加载失败与崩溃提示页
  preload-*.js                页面与主进程之间的 IPC 接口
  icon.png                    窗口图标
build/icon.png                打包图标
docs/screenshots/             功能截图
docs/releases/                中英文发行说明
README.md                     中文说明
README_EN.md                  English documentation
LICENSE                       MIT 协议
```

## 反馈与参与

欢迎通过 [Issues](https://github.com/yingzhexu/yying-browser/issues) 提交问题或功能建议，也欢迎提交 Pull Request。报告问题时请附系统、架构、应用版本、复现步骤、预期与实际结果；截图和日志请先去掉账号 Cookie、令牌等登录信息。

由 **小应同学ying** 制作。源码按 [MIT License](LICENSE) 开源，© 2026 小应同学ying。
