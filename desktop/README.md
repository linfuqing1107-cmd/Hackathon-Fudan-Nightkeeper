# Windows 桌面演示包

目标系统：Windows 10/11 x64。包含 Electron、Next.js standalone、PGlite 和 PyInstaller 打包的 BLE 验证模块。使用者无需安装 Node/Python，运行时不下载依赖。

交付两个文件：`Nightkeeper-0.2.0-Windows-x64-Setup.exe` 安装版、`Nightkeeper-0.2.0-Windows-x64-Portable.exe` 免安装版。当前未签名，可能触发 SmartScreen；不应要求关闭系统安全防护。正式分发需代码签名证书。

随访数据保存在 Electron userData 下 `demo-data`，不是安装目录；升级/关闭不清空。真实手表数据仅在验证进程内存，主动导出需参与者同意；不写入合成患者。退出主程序结束服务。端口动态分配，避免占用现有 3101/3102 服务。

## 构建

运行 `.github/workflows/windows-demo.yml` 的 workflow_dispatch，下载成功运行的 `Nightkeeper-Windows-x64` artifact。流水线在 Windows 完成依赖安装、单元测试、Next standalone、Python 冻结、NSIS/portable EXE、真实 EXE 启动与回放冒烟测试及 SHA256。

也可以在安装了 Node 22、Python 3.12 的 Windows 开发机依次执行该 workflow 的 run 命令。不要在 Mac 生成 Python Windows 二进制，也不要把 Mac 的 node_modules 放进 Windows 发布包。

## 验收

1. 无 Node/Python 的 Windows 电脑双击启动，展示合成患者、任务和表单。
2. 重启后工作区数据保持，重复启动不创建第二个数据库进程。
3. 菜单“手表接入 / 合成回放”出现明确回放标签，数值更新；停止后会话结束。
4. 真实 BLE 需本人授权、选择设备及心率广播，不支持协议应显示失败；此环节不能通过回放验收。
5. 退出后子进程结束。检查安装与免安装版本、离线启动及卸载行为。

自动冒烟目前只覆盖 unpacked EXE 启动与回放，不替代物理手表、安装器和干净 Windows 机器验收。未完成 Windows workflow 时不能声称 EXE 已交付。

本次 Mac 本地验证：独立 standalone 构建成功；18 项应用单元测试、10 项手表测试、对独立发布目录运行的 4 项端到端测试通过。Windows 打包及 EXE 冒烟尚待 Windows runner 执行。
