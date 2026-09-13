# Nightkeeper 手表接入验证台

## 产品目标 / PRD

比赛展示一条可运行的标准 BLE 心率接入路径：参与者同意 → 扫描 → 人工选设备 → 订阅通知 → 协议解析 → 本地实时展示 → 可选导出。

当前交付是独立验证模块，不写入随访应用的合成患者、夜间基线或风险规则。真实硬件兼容性尚待现场验收；能够运行回放不代表手表已连通。

## Spec

- 输入：BLE Heart Rate Service 0x180D / Measurement 0x2A37。
- 支持 uint8/uint16 心率、可选接触状态、能量字段及多个 RR 间期；缺失字段为 null/空列表，不能填零冒充测量。
- 不支持：私有协议破解、历史睡眠同步、血氧、皮温、临床 HRV 分析或精神症状推断。
- 不按品牌名称自动连接。扫描列表中的设备不一定支持该协议；连接后验证服务和 notify 属性。不支持标准服务时明确失败。
- 每个进程一个参与者会话，超过 10 秒未接收或断开即不显示实时值。断线不自动切换设备，重启后重新选择。
- REPLAY 永远不生成 BLE 证据；BLE 证据仅表示进程收到格式合法的通知，不证明设备身份、医学准确性或长期稳定性。
- 接收时间是主机 UTC 时间，不是手表采样时间；无接触/零心率保留原包但不显示为实时有效读数。

## SDD

`Bleak → parse_measurement → Capture(线程锁/600条环形缓冲) → loopback HTTP → dashboard`

BLE 运行于主线程 asyncio，以适配系统蓝牙事件循环；HTTP 在线程中只读访问快照。页面轮询每秒一次。会话与设备选择不暴露给业务患者层。设备名称和地址仅出现在本机选择终端，不进入报告。

服务仅绑定 127.0.0.1，校验 Host、每次启动随机访问令牌，无 CORS、无持久化、无上传。令牌 URL 属于本地访问凭据，请勿分享或放进截图。退出清空内存；下载报告包含健康数据，需自行保管/删除，不应公开提交。此安全设计限于本机演示，不能部署到公网或当作正式身份认证。

## 运行

在本目录下使用 Python 3.10+：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
# 无手表验证，不扫描、不连接蓝牙：
.venv/bin/python bridge.py replay
# 获取参与者同意，并开启手表心率广播后：
.venv/bin/python bridge.py ble --consent
```

Windows 使用 `.venv\Scripts\python.exe`。打开终端输出的带令牌地址，默认端口 3102；冲突时加 `--port 3103`。Ctrl+C 停止。

macOS 需允许所用终端访问蓝牙；系统可能按需提示配对。没有标准心率广播能力的型号不能靠此模块接入，不应仅按“小米”品牌推断兼容。原项目声明 S3/S4 支持，但本项目尚未逐型号验证。原 GUI 依赖 Tk 的 Windows 专用透明窗口参数，本模块不依赖该 GUI。

## 验收 / 测试

```sh
python3 -m unittest discover -s . -p 'test_*.py' -v
```

自动测试覆盖字段解析、截断包、接触状态、零值、过期/断线、回放隔离、保留上限及 HTTP 令牌。

现场验收须记录：设备型号/固件、操作系统、广播设置、授权、至少 60 秒 BLE 通知、与手表显示值的同步核对、关闭广播后的过期/断线、重连、报告 source=BLE。报告本身不是防伪认证，需结合现场操作或录像。不要上传参与者原始报告。

## 来源与后续

参考项目：[lsx-2319/miwatch-heartrate](https://github.com/lsx-2319/miwatch-heartrate)，检查版本 `910c898bc9d3f7f2cf44a54a767a5ea2ec82ac34`。原仓库未见许可证；本目录是独立编写的标准协议验证实现，不包含其 Tk 界面/图片。当地克隆目录增加本模块作为新的启动入口，原入口保留。

规范：[Bluetooth HRS 1.0](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html)；接口：[Bleak](https://bleak.readthedocs.io/en/latest/api/client.html)。

后续阶段：真实型号兼容矩阵 → 经授权的数据摄取 API/独立设备身份 → 采样质量与聚合策略 → 厂商健康平台睡眠/活动接入。以上均未在本版完成，禁止用瞬时心率冒充静息心率或夜间平均心率。
