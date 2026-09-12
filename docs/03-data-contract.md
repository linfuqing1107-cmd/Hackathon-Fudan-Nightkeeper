# 数据契约 v0.1

本文件是首版逻辑存储定义，SQL迁移在开发阶段实现。所有实体必须有 id、workspaceId、createdAt；修改型实体增加 updatedAt 和 version。UUID作ID，UTC ISO8601保存时间，业务日使用 localDate 与 IANA timezone。

## 1. 实体

| 实体 | 关键字段 | 约束 |
| --- | --- | --- |
| User | role、displayName、sessionSubject | role: PATIENT/CLINICIAN/ADMIN；不以客户端传入角色授权 |
| Patient | code、timezone、enrolledAt、synthetic | code空间内唯一；首版synthetic必须true，无真实姓名身份证 |
| Assignment | clinicianId、patientId、active | 两端同空间；撤销后下次请求立即失效 |
| Consent | patientId、scope、status、effectiveAt、revokedAt、revision | scope: WEARABLE/SELF_REPORT；只追加版本 |
| Device | patientId、adapter、model、firmware、algorithmVersion、lastSyncAt | 首版adapter=SIMULATOR |
| Observation | patientId、deviceId、metric、value、unit、startAt、endAt、localDate、timezone、quality、coverageMinutes、sourceRecordId、revision | 来源和版本可追溯，不静默覆盖 |
| DailyReport | patientId、localDate、timezone、mood、energy、reducedSleepNeed、distress、submittedAt、revision | 每个分值0-4或null；null标记SKIPPED，不转0 |
| MedicationReport | patientId、localDate、status、reasonCode、revision | TAKEN/NOT_TAKEN/UNKNOWN；不是客观摄入记录 |
| Baseline | patientId、metric、windowStart、windowEnd、validDays、median、status、observationIds、revision | READY/INSUFFICIENT；窗口右端含当日 |
| Evaluation | patientId、ruleVersion、targetDate、inputHash、result、evidence、supersedesId | TRIGGERED/NOT_TRIGGERED/INSUFFICIENT；旧版另有supersededAt |
| Task | patientId、type、status、ownerId、firstSeenAt、lastSeenAt、nextFollowupAt、predecessorTaskId、version | 类型和状态见Spec；包含evaluationIds |
| Followup | taskId、authorId、contactResult、reasonCode、actionText、outcome、nextFollowupAt | 追加记录，不直接修改患者报告 |
| Summary | patientId、taskId、mode、status、sourceIds、content、modelVersion、reviewerId | TEMPLATE/MODEL；DRAFT/REVIEWED/REJECTED |
| AuditEvent | actorId、action、entityType、entityId、requestId、at、changeKeys | 只追加；不记录健康正文 |
| Job | kind、payloadReference、attempts、availableAt、lockedUntil、status | RETRY/QUEUED/RUNNING/DONE/FAILED；不含原始敏感正文 |

首版拒绝跨空间引用；仅PATIENT身份通过服务端映射关联到本人patientId。任务、观测、随访及摘要的授权均回溯至患者范围。

## 2. 指标与单位

| metric | value与unit | 时间粒度 | 质量规则 |
| --- | --- | --- | --- |
| sleep_duration | 数值，min | 主睡眠归属醒来日期 | 0-1440；来源声明有效时才可入基线 |
| sleep_start / sleep_end | ISO8601，timestamp | 同一睡眠会话 | start必须早于end；跨日合法 |
| steps | 非负整数，count | 当地日 | 演示有效日要求coverageMinutes>=960 |
| activity_bin | 非负整数，count | 当地小时 | 仅明确覆盖的区间可为0，缺失为空 |
| night_heart_rate | 正数，bpm | 每夜厂商汇总 | 首版不设医疗异常阈值，保留来源口径 |

睡眠0分钟仅在来源明确有效时表示估计未睡，不与未佩戴混同。质量取 VALID、PARTIAL、MISSING、INVALID；只有VALID参与演示基线和R01。960分钟是演示活动覆盖参数，非通用设备标准。

sleep_duration 允许与 sleep_end-start 不同，因为主睡眠会话可能含清醒。首版不自行推断睡眠分期；午睡若接入需单独sessionType，不加入主睡眠重复统计。睡眠中点由主睡眠起止时刻计算并标明口径。

## 3. 去重、修订与时区

- 幂等键：(workspaceId, adapter, sourceRecordId, revision)。完全相同载荷重放为no-op，同键不同载荷为409。
- 修订必须使用更高revision并引用旧记录；分析默认取当时最新有效版本，任务保留触发时快照。
- UTC表示瞬时，timezone用于日历分桶。夏令时日可为23或25小时，不假定所有当地日1440分钟。
- coverageMinutes按实际区间并集计算，不能将重叠数据重复相加；比例分母取实际日长度。
- 首版设备来源不混合；换设备时旧基线失效，显示待重建，不直接拼接不同算法数值。
- 未来时间、单位不符、倒置区间、非法枚举均拒绝；一天无任何记录不生成数值0。

## 4. 传输示例

```json
{
  "sourceRecordId": "stable-20260909-sleep",
  "revision": 1,
  "metric": "sleep_duration",
  "value": 450,
  "unit": "min",
  "startAt": "2026-09-08T15:00:00Z",
  "endAt": "2026-09-08T23:00:00Z",
  "localDate": "2026-09-09",
  "timezone": "Asia/Shanghai",
  "quality": "VALID",
  "coverageMinutes": 480
}
```

ID示例是来源键而非实体UUID。接口上下文绑定patientId及deviceId，不允许记录伪造另一个患者归属。

## 5. 试点指标分母

- 睡眠覆盖率：有有效主睡眠记录的夜晚 / 纳入观察且授权的预期夜晚。
- 活动覆盖率：有效活动日 / 纳入观察且授权的预期日。
- EMA完成率：实际提交日 / 应填日；跳题另报，不把全跳题算完整完成。
- 每人周任务数：新建任务数 / 有效随访人周，按任务类型分层。
- 处理时长：创建至首次人工处理；关闭时长另报，未关闭任务不丢弃。
- 联系成功率：成功联系次数 / 实际联系尝试次数；不是患者人数比。

## 6. 保留与删除

首版仅合成数据，演示空间可整体删除并写不含正文的重置审计。真实数据保留期限、退出后研究数据处理、导出审批、备份删除和跨境流向必须另行获批；撤回授权只阻断后续采集，不作自动删除承诺。
