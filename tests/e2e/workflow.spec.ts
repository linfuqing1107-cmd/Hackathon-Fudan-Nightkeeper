import { test, expect } from "@playwright/test";
test("clinician workflow, patient feedback and desktop visual", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "随访概览", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("NK-S02", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.getByRole("button", { name: /多维变化核实/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "认领并开始核实" }).click();
  await page
    .getByPlaceholder("填写已核实的事实与后续安排")
    .fill("合成案例：已联系核实，安排后续随访。");
  await page.getByRole("button", { name: "保存随访记录", exact: true }).click();
  await expect(
    page.getByText("合成案例：已联系核实，安排后续随访。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "生成摘要", exact: true }).click();
  await expect(page.getByText("模板 · 非 AI")).toBeVisible();
  await page.getByRole("button", { name: "确认摘要", exact: true }).click();
  await page.getByLabel("关闭理由").fill("已核实并记录");
  await page.getByRole("button", { name: "关闭任务", exact: true }).click();
  await expect(page.getByText("已关闭 · RESOLVED")).toBeVisible();
  await page.getByRole("button", { name: "关闭任务详情" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "随访概览", exact: true }),
  ).toBeVisible();
  await page.getByLabel("切换演示身份").selectOption("S02");
  await expect(page.getByRole("heading", { name: "今日随访" })).toBeVisible();
  await page.getByRole("button", { name: "提交今日反馈" }).click();
  await expect(page.getByText("已提交 · 版本 1")).toBeVisible();
  await page.getByRole("button", { name: "保存服药反馈" }).click();
  await page.getByRole("button", { name: "演示联系请求" }).click();
  await expect(page.getByRole("status")).toContainText("未联系真实医护");
  expect(errors).toEqual([]);
});
test("mobile layout and consent", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "随访概览", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.getByLabel("切换演示身份").selectOption("S01");
  await expect(page.getByRole("heading", { name: "今日随访" })).toBeVisible();
  await page.getByLabel("自报数据授权").click();
  await expect(page.getByLabel("自报数据授权")).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "提交今日反馈" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/patient-mobile.png",
    fullPage: true,
  });
});
test("API guards, replay, isolation and recovery", async ({ request }) => {
  const origin = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
  const response = await request.post("/api/v1/demo/session", {
    headers: { Origin: origin },
    data: { identityCode: "S01" },
  });
  expect(response.ok()).toBe(true);
  let csrf = (await response.json()).data.csrf;
  expect((await request.get("/api/v1/patients/S02")).status()).toBe(404);
  expect(
    (
      await request.post("/api/v1/patients/S01/help-requests", {
        headers: { Origin: origin },
        data: { reasonCode: "CONTACT_REQUEST" },
      })
    ).status(),
  ).toBe(403);
  const headers = {
    Origin: origin,
    "X-CSRF-Token": csrf,
    "Idempotency-Key": "help-1",
  };
  const a = await request.post("/api/v1/patients/S01/help-requests", {
      headers,
      data: { reasonCode: "CONTACT_REQUEST" },
    }),
    b = await request.post("/api/v1/patients/S01/help-requests", {
      headers,
      data: { reasonCode: "CONTACT_REQUEST" },
    });
  expect((await a.json()).data).toEqual((await b.json()).data);
  const admin = await request.post("/api/v1/demo/session", {
    headers: { Origin: origin, "X-CSRF-Token": csrf },
    data: { identityCode: "admin" },
  });
  csrf = (await admin.json()).data.csrf;
  expect((await request.get("/api/v1/patients/S01")).status()).toBe(404);
  const recover = await request.post("/api/v1/demo/recover", {
    headers: {
      Origin: origin,
      "X-CSRF-Token": csrf,
      "Idempotency-Key": "recover",
    },
    data: { patientId: "S03" },
  });
  expect(recover.ok()).toBe(true);
});

test("concurrent claim and reset remain workspace-safe", async ({
  playwright,
}) => {
  const origin = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
  const first = await playwright.request.newContext({ baseURL: origin });
  const second = await playwright.request.newContext({ baseURL: origin });
  try {
    const boot = await first.post("/api/v1/demo/session", {
      headers: { Origin: origin },
      data: { identityCode: "clinician" },
    });
    let csrf = (await boot.json()).data.csrf;
    await second.post("/api/v1/demo/session", {
      headers: { Origin: origin },
      data: { identityCode: "clinician" },
    });
    const tasks = (await (await first.get("/api/v1/tasks")).json()).data;
    const target = tasks[0];
    const statuses = await Promise.all(
      ["one", "two"].map(async (key) =>
        (
          await first.post(`/api/v1/tasks/${target.id}/transitions`, {
            headers: {
              Origin: origin,
              "X-CSRF-Token": csrf,
              "Idempotency-Key": key,
            },
            data: { action: "CLAIM", expectedVersion: 1 },
          })
        ).status(),
      ),
    );
    expect(statuses.sort()).toEqual([200, 409]);
    expect((await second.get(`/api/v1/tasks/${target.id}`)).status()).toBe(404);
    const secondTasks = (await (await second.get("/api/v1/tasks")).json()).data;
    const admin = await first.post("/api/v1/demo/session", {
      headers: { Origin: origin, "X-CSRF-Token": csrf },
      data: { identityCode: "admin" },
    });
    csrf = (await admin.json()).data.csrf;
    expect(
      (
        await first.post("/api/v1/demo/reset", {
          headers: {
            Origin: origin,
            "X-CSRF-Token": csrf,
            "Idempotency-Key": "reset",
          },
          data: { scenarioSet: "all", seed: 42 },
        })
      ).ok(),
    ).toBe(true);
    expect((await (await second.get("/api/v1/tasks")).json()).data).toEqual(
      secondTasks,
    );
  } finally {
    await first.dispose();
    await second.dispose();
  }
});
