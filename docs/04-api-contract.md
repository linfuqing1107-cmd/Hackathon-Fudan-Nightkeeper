# API 契约 v0.1

前缀 /api/v1。REST JSON，同源浏览器会话；所有路由由服务端解析workspaceId及身份，拒绝客户端自授范围。下表是首版接口清单，开发任务T01须补机器可验证OpenAPI并执行契约测试。

## 1. 公共约定

- 日期时间与枚举遵循数据契约；DTO用严格运行时schema拒绝未知字段。
- 成功返回 {data, meta:{requestId}}；列表额外含nextCursor，可为null，limit默认20最大100。
- 错误返回 {error:{code,message,fieldErrors,requestId}}，无堆栈、患者正文或令牌。
- 401无会话；403角色禁止；404无患者范围或资源不存在；409版本/幂等冲突；422字段或状态不合法；429限流；503依赖不可用。
- 所有POST写操作需要Idempotency-Key；相同身份、路由和key缓存24小时结果，异载荷409。PUT反馈使用自然键和expectedVersion。
- 状态迁移必须传expectedVersion，事务内匹配；失败409，前端重取不能自动覆盖。
- 会话cookie HttpOnly/SameSite，公开部署必须Secure；写接口校验Origin和CSRF，禁止通配CORS。

## 2. 路由

| 方法和路径 | 请求 / 响应data | 权限及副作用 |
| --- | --- | --- |
| GET /session | 当前role、displayName、demoMode | 已登录；不返回可复用令牌 |
| POST /demo/session | identityCode -> 当前会话 | 仅本地demo开关；公开部署禁用任意身份选择 |
| GET /patients | cursor、limit、taskType? -> PatientListItem[] | 医护仅分配范围；PATIENT禁止 |
| GET /patients/:id | 患者代号、baselineStatus、lastSyncAt | 本人或分配医护 |
| GET /patients/:id/timeline | from、to -> observations、reports、quality、baselines | 本人或分配医护；最多90日 |
| PUT /patients/:id/daily-reports/:date | 四个EMA字段、expectedVersion -> 新revision | 仅本人，需SELF_REPORT授权；首版允许修订最近7日 |
| PUT /patients/:id/medication-reports/:date | status、reasonCode、expectedVersion -> 新revision | 仅本人；不包含处方修改 |
| GET /patients/:id/consents | 授权版本列表 | 本人或分配医护 |
| POST /patients/:id/consents | scope、action:GRANT/REVOKE -> 新版 | 仅本人；REVOKE后新采集被拒 |
| POST /patients/:id/help-requests | reasonCode -> taskId、demoNotice | 仅本人；不需基线，不向外发消息 |
| POST /devices/:id/observations:batch | records[] -> accepted、duplicate、jobId | 适配器服务身份；先检查授权；最多500条，全批校验成功再落库 |
| GET /tasks | status、type、cursor -> TaskListItem[] | 分配医护；ADMIN无正文权限 |
| GET /tasks/:id | task、evidenceSnapshots、followups | 分配医护 |
| POST /tasks/:id/transitions | action、expectedVersion、reason?、nextFollowupAt?、outcome?、mergeTargetId? -> task | 分配医护；所有动作满足Spec状态机 |
| POST /tasks/:id/followups | contactResult、reasonCode、actionText、nextFollowupAt? -> followup | 任务负责人；不自动关闭 |
| POST /tasks/:id/summaries | -> summaryId、status | 分配医护；202异步，持久job |
| GET /summaries/:id | mode、status、content、sourceIds | 回溯患者分配范围 |
| POST /summaries/:id/review | decision:ACCEPT/REJECT、expectedVersion -> summary | 分配医护；审阅不自动向患者发送 |
| POST /demo/reset | scenarioSet、seed -> workspaceRevision | 当前演示空间管理员；事务化，仅synthetic数据 |
| GET /health | liveness、readiness | 不公开版本密钥或连接字符串 |

## 3. 核心响应形状

PatientListItem：id、code、baselineStatus、lastSyncAt、openTaskCount、dataQualityStatus。

TaskListItem：id、patientCode、type、status、ownerId、firstSeenAt、lastSeenAt、version。

Task evidenceSnapshots：{evaluationId,ruleVersion,targetDate,items:[{sourceId,metric,date,value,unit,baselineValue,delta}]}。自报证据保留reportRevision；数值缺失返回null与reason，不返回0。

认领示例：

```json
{"action":"CLAIM","expectedVersion":1}
```

合法action：CLAIM、WAIT、RESUME、CLOSE、MERGE。CLOSE需要已有followup并提交outcome和reason；服务器按同一事务验证负责人、版本、迁移与审计。与临床含义有关的长文本最多2000字符，EMA无自由输入。

## 4. 异步与错误策略

接入事务同时写入job，避免“数据保存但未安排计算”。worker至少一次执行，依靠唯一键和事务做到业务幂等。暂时错误最多重试3次，延迟1/5/15秒；验证错误不重试。耗尽后FAILED，工作台显示计算未完成，不显示正常。

摘要调用单次预算3秒，失败转模板。模型返回内容必须经结构schema、sourceId归属和事实数值匹配检查；检查不通过也转模板。任务完成条件不依赖摘要。
