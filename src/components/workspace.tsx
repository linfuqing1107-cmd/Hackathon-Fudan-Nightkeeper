"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Users,
  Watch,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Identity, Patient, Task, View } from "@/lib/types";
import { statusLabels, typeLabels } from "@/lib/types";

type Tab = "overview" | "patients" | "tasks" | "audit" | "settings";
const names: Record<string, string> = {
  clinician: "林医生",
  reviewer: "陈医生 · 仅 S01",
  admin: "演示管理员",
  S01: "患者 S01",
  S02: "患者 S02",
  S03: "患者 S03",
};
const fmt = (v: string) =>
  new Date(v).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const today = "2026-09-12";
function badge(t: Task) {
  return t.type === "DATA_QUALITY"
    ? "amber"
    : t.type === "HELP_REQUEST"
      ? "red"
      : "teal";
}
function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function Workspace() {
  const [view, setView] = useState<View | null>(null),
    [tab, setTab] = useState<Tab>("overview"),
    [selected, setSelected] = useState("S02"),
    [taskId, setTaskId] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const csrf = useRef("");
  const started = useRef(false);
  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`/api/v1/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf.current,
        "Idempotency-Key": crypto.randomUUID(),
      },
      ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || "请求失败");
    return json.data;
  }
  async function load() {
    const data = await request("view");
    csrf.current = data.csrf;
    setView(data);
    setTab((current) =>
      data.role === "ADMIN" && current !== "settings" && current !== "audit"
        ? "settings"
        : current,
    );
  }
  async function switchIdentity(identity: Identity) {
    setBusy(true);
    setError("");
    setTaskId(null);
    try {
      const data = await request("demo/session", "POST", {
        identityCode: identity,
      });
      csrf.current = data.csrf;
      await load();
      setTab(identity === "admin" ? "settings" : "overview");
      if (identity.startsWith("S")) setSelected(identity);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const data = await request("session");
        csrf.current = data.csrf;
        await load();
      } catch {
        await switchIdentity("clinician");
      }
    })();
  }, []);
  async function action(
    path: string,
    body: unknown,
    method = "POST",
    message = "已保存",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(path, method, body);
      await load();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const patient =
    view?.patients.find((p) => p.id === selected) || view?.patients[0];
  const active = view?.tasks.filter((t) => t.status !== "CLOSED") || [];
  const task = view?.tasks.find((t) => t.id === taskId);
  const isPatient = view?.role === "PATIENT";
  if (!view)
    return (
      <div className="boot">
        <Moon size={40} />
        <h1>Nightkeeper</h1>
        <p>正在载入随访空间</p>
        {error ? (
          <>
            <div role="alert">{error}</div>
            <button onClick={() => switchIdentity("clinician")}>
              重新连接
            </button>
          </>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </div>
    );
  const nav = [
    { id: "overview", name: "随访概览", icon: LayoutDashboard },
    { id: "patients", name: "患者队列", icon: Users },
    { id: "tasks", name: "核实任务", icon: ClipboardList },
    { id: "audit", name: "操作记录", icon: FileText },
    { id: "settings", name: "演示管理", icon: Settings2 },
  ] as const;
  const titles = {
    overview: "随访概览",
    patients: "患者队列",
    tasks: "核实任务",
    audit: "操作记录",
    settings: "演示管理",
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Moon size={23} />
          </span>
          <span>
            Nightkeeper<small>精神卫生 · 院外随访</small>
          </span>
        </a>
        <div className="workspace-label">
          工作空间<span>LOCAL</span>
        </div>
        <nav>
          {nav
            .filter((n) =>
              view.role === "ADMIN"
                ? n.id === "settings" || n.id === "audit"
                : isPatient
                  ? n.id === "overview"
                  : n.id !== "settings",
            )
            .map((n) => (
              <button
                className={tab === n.id ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setTab(n.id);
                  setTaskId(null);
                }}
                key={n.id}
              >
                <n.icon size={18} />
                <span>{isPatient ? "我的随访" : n.name}</span>
                {n.id === "tasks" && active.length > 0 && (
                  <b>{active.length}</b>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={17} />
            <span>
              纯合成数据空间<small>不连接真实患者或设备</small>
            </span>
          </div>
          <div className="user">
            <div className="avatar">
              {isPatient ? "患" : view.role === "ADMIN" ? "管" : "医"}
            </div>
            <span>
              {names[view.identity]}
              <small>
                {view.role === "CLINICIAN"
                  ? "随访医护"
                  : view.role === "ADMIN"
                    ? "空间管理员"
                    : "患者演示身份"}
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <ChevronRight size={14} />{" "}
            <strong>{isPatient ? "我的随访" : titles[tab]}</strong>
          </div>
          <div className="top-actions">
            <span className="live-dot" />{" "}
            <span className="date">2026.09.12 · 演示时钟</span>
            <IconButton
              label="刷新数据"
              onClick={() => {
                setError("");
                load().catch((e) => setError(e.message));
              }}
              disabled={busy}
            >
              <RefreshCw size={17} />
            </IconButton>
            <label className="identity">
              <span className="sr-only">切换演示身份</span>
              <select
                value={view.identity}
                disabled={busy}
                onChange={(e) => switchIdentity(e.target.value as Identity)}
              >
                {Object.entries(names).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <div className="safety">
          <ShieldCheck size={15} />
          <span>
            合成数据演示 ·
            提示仅供人工核实，不提供诊断、用药建议或实际接警服务。
          </span>
          <span className="version">DEMO v0.2</span>
        </div>
        <main className="content">
          {error && (
            <div className="message error" role="alert">
              {error}
              <IconButton label="关闭错误" onClick={() => setError("")}>
                <X size={16} />
              </IconButton>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <IconButton label="关闭提示" onClick={() => setNotice("")}>
                <X size={16} />
              </IconButton>
            </div>
          )}
          {isPatient && patient ? (
            <PatientPanel
              key={patient.id}
              patient={patient}
              busy={busy}
              action={action}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {tab === "settings" ? "DEMO CONTROL" : "CONTINUITY OF CARE"}
                  </div>
                  <h1>{titles[tab]}</h1>
                  <p>
                    {tab === "overview"
                      ? "关注持续变化，让每一次随访都有依据。"
                      : tab === "patients"
                        ? "观察个体趋势，核对数据完整性。"
                        : tab === "tasks"
                          ? "待核实变化与随访处理记录。"
                          : tab === "audit"
                            ? "记录操作，不记录诊疗结论。"
                            : "管理合成场景与设备同步状态。"}
                  </p>
                </div>
                <span className="scope">
                  <span className="live-dot" />{" "}
                  {view.role === "ADMIN" ? "独立演示空间" : "个人分配范围"}
                </span>
              </div>
              {tab === "overview" && (
                <>
                  <div className="stats">
                    <Stat
                      label="随访患者"
                      value={view.patients.length}
                      suffix="人"
                      icon={<Users />}
                      foot="当前分配队列"
                    />
                    <Stat
                      label="待处理任务"
                      value={active.length}
                      suffix="项"
                      icon={<ClipboardList />}
                      foot={`${active.filter((t) => t.status === "OPEN").length} 项待认领`}
                      accent
                    />
                    <Stat
                      label="数据待核实"
                      value={
                        active.filter((t) => t.type === "DATA_QUALITY").length
                      }
                      suffix="人"
                      icon={<Watch />}
                      foot="与临床变化独立处理"
                    />
                    <Stat
                      label="已关闭任务"
                      value={
                        view.tasks.filter((t) => t.status === "CLOSED").length
                      }
                      suffix="项"
                      icon={<CheckCircle2 />}
                      foot="保留完整随访记录"
                    />
                  </div>
                  <div className="section-heading">
                    <h2>患者动态</h2>
                    <button
                      className="text-button"
                      onClick={() => setTab("patients")}
                    >
                      全部患者 <ArrowRight size={15} />
                    </button>
                  </div>
                  <PatientTable
                    patients={view.patients}
                    tasks={view.tasks}
                    selected={patient?.id}
                    onSelect={(p) => {
                      setSelected(p.id);
                      setTaskId(null);
                    }}
                  />
                  {patient && (
                    <div className="detail-grid">
                      <PatientTrends patient={patient} />
                      <section className="queue">
                        <div className="section-heading">
                          <h2>待核实事项</h2>
                          <span className="count">
                            {
                              active.filter((t) => t.patientId === patient.id)
                                .length
                            }
                          </span>
                        </div>
                        {active
                          .filter((t) => t.patientId === patient.id)
                          .map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              onClick={() => setTaskId(t.id)}
                            />
                          ))}
                        {!active.some((t) => t.patientId === patient.id) && (
                          <div className="empty">
                            <CheckCircle2 size={30} />
                            <strong>暂无待核实事项</strong>
                            <span>当前规则未发现持续变化</span>
                          </div>
                        )}
                        <div className="queue-foot">
                          <ShieldCheck size={15} /> 单一指标不定义复发或危险性
                        </div>
                      </section>
                    </div>
                  )}
                </>
              )}
              {tab === "patients" && (
                <>
                  <div className="toolbar">
                    <div className="search">
                      <Search size={17} />
                      <input
                        aria-label="搜索患者"
                        placeholder="搜索患者编号"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <span>{view.patients.length} 位合成患者</span>
                  </div>
                  <PatientTable
                    patients={view.patients.filter((p) =>
                      p.code.toLowerCase().includes(search.toLowerCase()),
                    )}
                    tasks={view.tasks}
                    selected={patient?.id}
                    onSelect={(p) => setSelected(p.id)}
                  />
                  {patient && <PatientTrends patient={patient} />}
                </>
              )}
              {tab === "tasks" && (
                <>
                  <div className="tabs" role="tablist" aria-label="任务状态">
                    {[
                      ["ALL", "全部"],
                      ["OPEN", "待认领"],
                      ["IN_REVIEW", "核实中"],
                      ["WAITING_FOLLOWUP", "待回访"],
                      ["CLOSED", "已关闭"],
                    ].map(([id, label]) => (
                      <button
                        role="tab"
                        aria-selected={filter === id}
                        className={filter === id ? "selected" : ""}
                        onClick={() => setFilter(id)}
                        key={id}
                      >
                        {label}
                        <span>
                          {
                            view.tasks.filter(
                              (t) => id === "ALL" || t.status === id,
                            ).length
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="task-list">
                    {view.tasks
                      .filter((t) => filter === "ALL" || t.status === filter)
                      .map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onClick={() => setTaskId(t.id)}
                          showPatient
                        />
                      ))}
                    {!view.tasks.some(
                      (t) => filter === "ALL" || t.status === filter,
                    ) && (
                      <div className="empty">
                        <ClipboardList />
                        <strong>此状态下暂无任务</strong>
                      </div>
                    )}
                  </div>
                </>
              )}
              {tab === "audit" && (
                <section className="audit-list">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>操作者</th>
                          <th>事件</th>
                          <th>资源编号</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...view.audit].reverse().map((a) => (
                          <tr key={a.id}>
                            <td>{fmt(a.at)}</td>
                            <td>{names[a.actor] || "规则引擎"}</td>
                            <td>{a.action}</td>
                            <td className="mono">{a.entityId.slice(0, 12)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!view.audit.length && (
                    <div className="empty">暂无操作记录</div>
                  )}
                </section>
              )}
              {tab === "settings" && (
                <section className="settings">
                  <div className="setting-row">
                    <div>
                      <h2>重置三个演示场景</h2>
                      <p>
                        仅重置当前浏览器空间的合成数据与任务，保留重置审计。
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            "重置当前空间的反馈和任务？此操作不影响其他浏览器空间。",
                          )
                        )
                          action(
                            "demo/reset",
                            { scenarioSet: "all", seed: 42 },
                            "POST",
                            "演示场景已重置",
                          );
                      }}
                    >
                      <RefreshCw size={16} />
                      重置场景
                    </button>
                  </div>
                  <div className="setting-row">
                    <div>
                      <h2>S03 模拟恢复同步</h2>
                      <p>补入一日有效数据，原数据质量任务仍需人工关闭。</p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        action(
                          "demo/recover",
                          { patientId: "S03" },
                          "POST",
                          "模拟同步已恢复",
                        )
                      }
                    >
                      <Watch size={16} />
                      恢复同步
                    </button>
                  </div>
                  <div className="setting-row">
                    <div>
                      <h2>数据来源</h2>
                      <p>
                        SIMULATOR · 固定种子 42 · Asia/Shanghai · 规则 demo-v0.1
                      </p>
                    </div>
                    <span className="badge neutral">无真实设备连接</span>
                  </div>
                  <div className="setting-row">
                    <div>
                      <h2>摘要服务</h2>
                      <p>确定性模板，引用原始证据。未接入任何外部大模型。</p>
                    </div>
                    <span className="badge neutral">TEMPLATE</span>
                  </div>
                </section>
              )}
            </>
          )}
          <footer className="footer">
            <span>Nightkeeper · 院外连续随访</span>
            <span>合成数据 · 本地持久化 · 非临床产品</span>
          </footer>
        </main>
      </div>
      {task && (
        <TaskDrawer
          key={task.id}
          task={task}
          identity={view.identity}
          busy={busy}
          close={() => setTaskId(null)}
          action={action}
          error={error}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  suffix,
  icon,
  foot,
  accent = false,
}: {
  label: string;
  value: number;
  suffix: string;
  icon: React.ReactNode;
  foot: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "stat accent" : "stat"}>
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <div className="stat-value">
        {value}
        <span>{suffix}</span>
      </div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}
function PatientTable({
  patients,
  tasks,
  selected,
  onSelect,
}: {
  patients: Patient[];
  tasks: Task[];
  selected?: string;
  onSelect: (p: Patient) => void;
}) {
  return (
    <div className="table-wrap patient-table">
      <table>
        <thead>
          <tr>
            <th>患者 / 场景</th>
            <th>最近睡眠</th>
            <th>最近步数</th>
            <th>数据状态</th>
            <th>待办</th>
            <th>
              <span className="sr-only">查看</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => {
            const o = p.observations.filter((o) => o.date < today).at(-1),
              n = tasks.filter(
                (t) => t.patientId === p.id && t.status !== "CLOSED",
              ).length;
            return (
              <tr
                key={p.id}
                className={selected === p.id ? "selected-row" : ""}
              >
                <td>
                  <button className="patient-link" onClick={() => onSelect(p)}>
                    <span className={`patient-avatar ${p.id.toLowerCase()}`}>
                      {p.id.slice(1)}
                    </span>
                    <span>
                      <strong>{p.code}</strong>
                      <small>{p.scenario}</small>
                    </span>
                  </button>
                </td>
                <td>
                  <strong>
                    {o?.sleep == null ? "—" : `${o.sleep / 60} 小时`}
                  </strong>
                  {o?.sleep != null &&
                    p.baseline.median !== null &&
                    o.sleep < p.baseline.median && (
                      <small className="delta">
                        <ArrowDown size={12} />
                        {(p.baseline.median - o.sleep) / 60} 小时 / 基线
                      </small>
                    )}
                </td>
                <td className="numeric">{o?.steps?.toLocaleString() ?? "—"}</td>
                <td>
                  <span
                    className={`badge ${o?.quality === "VALID" ? "green" : "amber"}`}
                  >
                    <span className="dot" />
                    {o?.quality === "VALID" ? "数据有效" : "数据缺失"}
                  </span>
                </td>
                <td>
                  {n ? (
                    <span className="task-count">{n} 项</span>
                  ) : (
                    <span className="muted">无待办</span>
                  )}
                </td>
                <td>
                  <IconButton
                    label={`查看 ${p.code}`}
                    onClick={() => onSelect(p)}
                  >
                    <ChevronRight size={17} />
                  </IconButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!patients.length && <div className="empty">未找到匹配患者</div>}
    </div>
  );
}
function PatientTrends({ patient }: { patient: Patient }) {
  const data = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 7, 29 + i)).toISOString().slice(0, 10);
    const row = patient.observations
      .filter((o) => o.date === date)
      .sort((a, b) => b.revision - a.revision)[0];
    return {
      date: date.slice(5).replace("-", "/"),
      sleep:
        row?.quality === "VALID" && row.sleep !== null ? row.sleep / 60 : null,
      steps: row?.quality === "VALID" ? row.steps : null,
    };
  });
  const valid = data.filter((d) => d.sleep !== null).length;
  return (
    <section className="trends">
      <div className="section-heading">
        <div>
          <h2>
            {patient.code} <span className="muted regular">个人趋势</span>
          </h2>
          <small>08.29 — 09.11 · 近 14 日</small>
        </div>
        <span className="badge neutral">
          {patient.baseline.status === "READY" ? "基线已建立" : "基线不足"}
        </span>
      </div>
      <div className="chart-label">
        <span>
          <Moon size={15} /> 睡眠时长 <small>小时</small>
        </span>
        <span className="legend">
          <i />
          个人基线{" "}
          {patient.baseline.median !== null
            ? `${patient.baseline.median / 60}h`
            : "不足"}
        </span>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 12, right: 12, bottom: 0, left: -28 }}
          >
            <CartesianGrid vertical={false} stroke="#edf0ee" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#7b8580" }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              domain={[0, 12]}
              ticks={[0, 4, 8, 12]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#7b8580" }}
            />
            <Tooltip
              formatter={(v) => [`${v} 小时`, "睡眠"]}
              contentStyle={{
                borderRadius: 6,
                border: "1px solid #dfe5e1",
                fontSize: 12,
              }}
            />
            {patient.baseline.median !== null && (
              <ReferenceLine
                y={patient.baseline.median / 60}
                stroke="#a6b1aa"
                strokeDasharray="4 4"
              />
            )}
            <Line
              type="linear"
              dataKey="sleep"
              stroke="#16816b"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-bottom">
        <span>
          <span className="dot green-dot" />
          有效睡眠 {valid}/14 夜
        </span>
        <span>缺失区间不补零</span>
      </div>
      <div className="mini-metrics">
        <div>
          <span>冻结基线</span>
          <strong>08.15 — 08.28</strong>
        </div>
        <div>
          <span>有效基线日</span>
          <strong>{patient.baseline.validDays} 天</strong>
        </div>
        <div>
          <span>最后同步</span>
          <strong>{fmt(patient.lastSyncAt)}</strong>
        </div>
      </div>
    </section>
  );
}
function TaskRow({
  task,
  onClick,
  showPatient = false,
}: {
  task: Task;
  onClick: () => void;
  showPatient?: boolean;
}) {
  return (
    <button className="task-row" onClick={onClick}>
      <div className={`task-symbol ${badge(task)}`}>
        {task.type === "DATA_QUALITY" ? (
          <Watch size={18} />
        ) : task.type === "MEDICATION_REVIEW" ? (
          <ClipboardList size={18} />
        ) : (
          <Activity size={18} />
        )}
      </div>
      <div className="task-info">
        <strong>
          {showPatient && (
            <span className="task-patient">NK-{task.patientId} · </span>
          )}
          {typeLabels[task.type]}
        </strong>
        <small>
          {task.type === "CHANGE_REVIEW"
            ? "连续 3 日睡眠减少，精力自报上升"
            : task.type === "DATA_QUALITY"
              ? task.recovered
                ? "同步已恢复，待人工确认"
                : "同步中断超过 48 小时"
              : task.type === "MEDICATION_REVIEW"
                ? "连续 2 日明确未服药自报"
                : "患者希望获得联系"}
        </small>
        <span className="task-meta">
          <span
            className={`badge ${task.status === "CLOSED" ? "green" : "neutral"}`}
          >
            {statusLabels[task.status]}
          </span>
          <span>{fmt(task.firstSeenAt)}</span>
        </span>
      </div>
      <ChevronRight size={16} />
    </button>
  );
}
type Action = (
  path: string,
  body: unknown,
  method?: string,
  message?: string,
) => Promise<boolean>;
function TaskDrawer({
  task,
  identity,
  busy,
  close,
  action,
  error,
}: {
  task: Task;
  identity: Identity;
  busy: boolean;
  close: () => void;
  action: Action;
  error: string;
}) {
  const [contact, setContact] = useState("REACHED"),
    [reason, setReason] = useState("状态核实"),
    [text, setText] = useState(""),
    [outcome, setOutcome] = useState("RESOLVED"),
    [closeReason, setCloseReason] = useState(""),
    [next, setNext] = useState("2026-09-13T09:00");
  const drawer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    drawer.current?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      before?.focus();
    };
  }, []);
  const transitionAction = (op: string, extra = {}) =>
    action(
      `tasks/${task.id}/transitions`,
      { action: op, expectedVersion: task.version, ...extra },
      "POST",
      "任务状态已更新",
    );
  const summary = task.summaries.at(-1);
  function trapFocus(e: React.KeyboardEvent) {
    if (e.key === "Escape") close();
    if (e.key !== "Tab") return;
    const nodes = drawer.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
    );
    if (!nodes?.length) return;
    const first = nodes[0],
      last = nodes[nodes.length - 1];
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === drawer.current)
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-title"
        tabIndex={-1}
        ref={drawer}
        onKeyDown={trapFocus}
      >
        <header className="drawer-head">
          <div>
            <small>NK-{task.patientId} · 核实任务</small>
            <h2 id="task-title">{typeLabels[task.type]}</h2>
          </div>
          <IconButton label="关闭任务详情" onClick={close}>
            <X size={20} />
          </IconButton>
        </header>
        <div className="drawer-content">
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          <div className="drawer-status">
            <span className="badge teal">{statusLabels[task.status]}</span>
            <span>负责人：{task.owner ? names[task.owner] : "待认领"}</span>
          </div>
          {task.needsReview && (
            <div className="inline-warning">
              证据已修订，需重新核实；以下保留原触发快照。
            </div>
          )}
          {task.recovered && (
            <div className="inline-warning">
              数据同步已恢复，仍需人工核实关闭。
            </div>
          )}
          <section>
            <h3>
              触发依据 <span className="version">{task.ruleVersion}</span>
            </h3>
            <div className="evidence">
              {task.evidence.map((e, i) => (
                <div key={i}>
                  <small>
                    {e.date} · {e.label}
                  </small>
                  <strong>{e.value}</strong>
                  {e.baseline && <span>个人基线 {e.baseline}</span>}
                  <code title={e.sourceId}>{e.sourceId.slice(0, 32)}</code>
                </div>
              ))}
            </div>
            <p className="fine">演示规则，不构成诊断或临床阈值。</p>
          </section>
          <section>
            <div className="section-heading">
              <h3>随访摘要</h3>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  action(
                    `tasks/${task.id}/summaries`,
                    {},
                    "POST",
                    "模板摘要已生成，待人工审阅",
                  )
                }
              >
                <FileText size={14} />
                {summary ? "重新生成" : "生成摘要"}
              </button>
            </div>
            {summary ? (
              <div className="summary">
                <div className="summary-top">
                  <span className="badge neutral">模板 · 非 AI</span>
                  <span>
                    {summary.status === "DRAFT"
                      ? "待审阅"
                      : summary.status === "REVIEWED"
                        ? "已确认"
                        : "已拒绝"}
                  </span>
                </div>
                <p>{summary.text}</p>
                <small>
                  引用 {summary.sourceIds.length} 条证据 · 不自动发送
                </small>
                {summary.status === "DRAFT" && (
                  <div className="button-row">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        action(
                          `tasks/${task.id}/summary-review`,
                          { decision: "ACCEPT", expectedVersion: task.version },
                          "POST",
                          "摘要已确认",
                        )
                      }
                    >
                      确认摘要
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        action(
                          `tasks/${task.id}/summary-review`,
                          { decision: "REJECT", expectedVersion: task.version },
                          "POST",
                          "摘要已拒绝",
                        )
                      }
                    >
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="muted">尚未生成随访摘要</p>
            )}
          </section>
          <section>
            <h3>
              随访记录 <span className="count">{task.followups.length}</span>
            </h3>
            {task.followups.map((f) => (
              <div className="followup" key={f.id}>
                <small>
                  {fmt(f.at)} · {names[f.author]} ·{" "}
                  {f.contactResult === "REACHED" ? "已联系" : "未联系成功"}
                </small>
                <strong>{f.reason}</strong>
                <p>{f.text}</p>
              </div>
            ))}
            {task.status === "OPEN" && (
              <button
                className="button primary full"
                disabled={busy}
                onClick={() => transitionAction("CLAIM")}
              >
                <Check size={16} />
                认领并开始核实
              </button>
            )}
            {task.owner === identity && task.status === "IN_REVIEW" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await action(
                      `tasks/${task.id}/followups`,
                      { contactResult: contact, reason, text },
                      "POST",
                      "随访记录已保存",
                    )
                  )
                    setText("");
                }}
              >
                <div className="form-grid">
                  <label>
                    联系结果
                    <select
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                    >
                      <option value="REACHED">已联系</option>
                      <option value="NOT_REACHED">未联系成功</option>
                    </select>
                  </label>
                  <label>
                    核实原因
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      maxLength={100}
                    />
                  </label>
                </div>
                <label>
                  核实与处置记录
                  <textarea
                    placeholder="填写已核实的事实与后续安排"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required
                    maxLength={2000}
                    rows={3}
                  />
                </label>
                <button
                  className="button primary"
                  disabled={busy || !text.trim()}
                  type="submit"
                >
                  保存随访记录
                </button>
              </form>
            )}
          </section>
          {task.owner === identity && task.status === "IN_REVIEW" && (
            <section>
              <h3>下一步</h3>
              <label>
                回访时间
                <input
                  aria-label="回访时间"
                  type="datetime-local"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </label>
              <button
                className="button secondary"
                disabled={busy || !next}
                onClick={() =>
                  transitionAction("WAIT", {
                    nextFollowupAt: `${next}:00+08:00`,
                  })
                }
              >
                <Clock3 size={15} />
                安排回访
              </button>
              <hr />
              <label>
                关闭结果
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  <option value="RESOLVED">已核实并处理</option>
                  <option value="REFERRED">已转介</option>
                  <option value="FALSE_SIGNAL">确认非临床变化</option>
                  <option value="UNREACHABLE_AFTER_ATTEMPTS">
                    多次尝试未联系成功
                  </option>
                </select>
              </label>
              <label>
                关闭理由
                <textarea
                  rows={2}
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <button
                className="button primary"
                disabled={busy || !closeReason.trim() || !task.followups.length}
                onClick={() =>
                  transitionAction("CLOSE", { outcome, reason: closeReason })
                }
              >
                <CheckCircle2 size={16} />
                关闭任务
              </button>
              {!task.followups.length && (
                <p className="fine">保存随访记录后可关闭。</p>
              )}
            </section>
          )}
          {task.owner === identity && task.status === "WAITING_FOLLOWUP" && (
            <section>
              <p>下次回访：{task.nextFollowupAt && fmt(task.nextFollowupAt)}</p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => transitionAction("RESUME")}
              >
                恢复核实
              </button>
            </section>
          )}
          {task.status === "CLOSED" && (
            <section>
              <span className="badge green">已关闭 · {task.outcome}</span>
              <p>{task.closeReason}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
function PatientPanel({
  patient,
  busy,
  action,
}: {
  patient: Patient;
  busy: boolean;
  action: Action;
}) {
  const report = patient.reports.filter((r) => r.date === today).at(-1),
    med = patient.medications.filter((r) => r.date === today).at(-1);
  const [scores, setScores] = useState<(number | null)[]>([
      report?.mood ?? 2,
      report?.energy ?? 2,
      report?.reducedSleepNeed ?? 0,
      report?.distress ?? 0,
    ]),
    [medStatus, setMedStatus] = useState(med?.status || "UNKNOWN"),
    [medReason, setMedReason] = useState(med?.reasonCode || "NONE");
  const granted =
    patient.consents.filter((c) => c.scope === "SELF_REPORT").at(-1)?.status ===
    "GRANTED";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DAILY CHECK-IN</div>
          <h1>今日随访</h1>
          <p>NK-{patient.id} · 2026 年 9 月 12 日</p>
        </div>
        <Smartphone className="heading-icon" />
      </div>
      <div className="patient-grid">
        <section className="patient-form">
          <div className="section-heading">
            <h2>每日感受</h2>
            <span className={`badge ${report ? "green" : "neutral"}`}>
              {report ? `已提交 · 版本 ${report.revision}` : "今日待填"}
            </span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(
                `patients/${patient.id}/daily-reports/${today}`,
                {
                  mood: scores[0],
                  energy: scores[1],
                  reducedSleepNeed: scores[2],
                  distress: scores[3],
                  expectedVersion: report?.revision || 0,
                },
                "PUT",
                "今日感受已保存",
              );
            }}
          >
            {[
              "今天的情绪感受",
              "今天的精力水平",
              "睡得少但仍不困的程度",
              "今天感到困扰的程度",
            ].map((q, i) => (
              <fieldset key={q} disabled={!granted || busy}>
                <legend>{q}</legend>
                <div className="score-options">
                  {[0, 1, 2, 3, 4, null].map((v, j) => (
                    <label className={scores[i] === v ? "chosen" : ""} key={j}>
                      <input
                        type="radio"
                        name={`score-${i}`}
                        checked={scores[i] === v}
                        onChange={() =>
                          setScores(scores.map((old, n) => (n === i ? v : old)))
                        }
                      />
                      {v === null ? "跳过" : v}
                    </label>
                  ))}
                </div>
                <small>
                  {i === 0
                    ? "0 很低落 · 2 平常 · 4 很愉悦"
                    : i === 1
                      ? "0 很低 · 2 平常 · 4 很高"
                      : "0 没有 · 4 很明显"}
                </small>
              </fieldset>
            ))}
            <button className="button primary full" disabled={busy || !granted}>
              {report ? "更新今日反馈" : "提交今日反馈"}
              <ArrowRight size={16} />
            </button>
          </form>
        </section>
        <div>
          <section className="medication-form">
            <div className="section-heading">
              <h2>服药反馈</h2>
              <span className={`badge ${med ? "green" : "neutral"}`}>
                {med ? "已提交" : "今日待填"}
              </span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(
                  `patients/${patient.id}/medication-reports/${today}`,
                  {
                    status: medStatus,
                    reasonCode: medReason,
                    expectedVersion: med?.revision || 0,
                  },
                  "PUT",
                  "服药反馈已保存",
                );
              }}
            >
              <label>
                今日服药情况
                <select
                  disabled={!granted || busy}
                  value={medStatus}
                  onChange={(e) =>
                    setMedStatus(e.target.value as typeof medStatus)
                  }
                >
                  <option value="UNKNOWN">不确定</option>
                  <option value="TAKEN">自报已服</option>
                  <option value="NOT_TAKEN">明确未服</option>
                </select>
              </label>
              <label>
                原因
                <select
                  disabled={!granted || busy}
                  value={medReason}
                  onChange={(e) => setMedReason(e.target.value)}
                >
                  <option value="NONE">无 / 未说明</option>
                  <option value="FORGOT">忘记</option>
                  <option value="SIDE_EFFECT">不适或副作用</option>
                  <option value="RAN_OUT">药物用尽</option>
                  <option value="OTHER">其他</option>
                </select>
              </label>
              <button
                className="button secondary full"
                disabled={busy || !granted}
              >
                保存服药反馈
              </button>
            </form>
            <p className="fine">
              此处记录自报，不确认实际服药，不提供调药建议。
            </p>
          </section>
          <section className="help-section">
            <h2>希望获得联系？</h2>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                action(
                  `patients/${patient.id}/help-requests`,
                  { reasonCode: "CONTACT_REQUEST" },
                  "POST",
                  "演示请求已记录，未联系真实医护",
                )
              }
            >
              <Bell size={16} />
              演示联系请求
            </button>
            <p className="fine">
              本系统不实际接警。如有紧急情况，请使用当地急救或现有就医渠道。
            </p>
          </section>
        </div>
      </div>
      <section className="consent-section">
        <h2>数据授权</h2>
        {(["WEARABLE", "SELF_REPORT"] as const).map((scope) => {
          const on =
            patient.consents.filter((c) => c.scope === scope).at(-1)?.status ===
            "GRANTED";
          return (
            <div className="setting-row" key={scope}>
              <div>
                <strong>
                  {scope === "WEARABLE" ? "穿戴数据采集" : "每日自报采集"}
                </strong>
                <p>撤回后停止新采集，不自动删除历史记录。</p>
              </div>
              <label className="toggle">
                <input
                  aria-label={
                    scope === "WEARABLE" ? "穿戴数据授权" : "自报数据授权"
                  }
                  type="checkbox"
                  checked={on}
                  disabled={busy}
                  onChange={() =>
                    action(
                      `patients/${patient.id}/consents`,
                      { scope, action: on ? "REVOKE" : "GRANT" },
                      "POST",
                      on ? "授权已撤回" : "授权已恢复",
                    )
                  }
                />
                <span>{on ? "已授权" : "已撤回"}</span>
              </label>
            </div>
          );
        })}
      </section>
    </>
  );
}
