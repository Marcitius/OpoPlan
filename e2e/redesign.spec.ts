import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { adapter, A, publicKey } from "./fixture";
import {
  apply,
  ch,
  node,
  opp,
  session,
  allocation,
  event,
} from "../tests/helpers";
import { base, DEFAULT_PREFS } from "../src/core/types";
const DAY = "2026-10-08",
  NOW = new Date("2026-10-08T08:00:00Z");
export async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("URL del proyecto").fill("https://fixture.supabase.co");
  await page.getByLabel("Publishable key pública").fill(publicKey);
  await page
    .getByRole("button", { name: "Conectar OpoPlan", exact: true })
    .click();
  await page.getByLabel("Correo electrónico").fill("a@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
export async function navigate(page: Page, name: string) {
  const desktop = (page.viewportSize()?.width ?? 1280) >= 1024;
  if (name === "Configuración") {
    if (desktop)
      await page
        .locator(".sidebar-bottom")
        .getByRole("button", { name, exact: true })
        .click();
    else {
      await page
        .locator(".bottom-nav")
        .getByRole("button", { name: "Más", exact: true })
        .click();
      await page
        .locator(".more-list")
        .getByRole("button", { name, exact: true })
        .click();
    }
  } else if (!desktop && ["Estudiar", "Pruebas"].includes(name)) {
    await page
      .locator(".bottom-nav")
      .getByRole("button", { name: "Más", exact: true })
      .click();
    await page
      .locator(".more-list")
      .getByRole("button", {
        name: name === "Pruebas" ? "Pruebas y simulacros" : name,
        exact: true,
      })
      .click();
  } else
    await page
      .locator(desktop ? ".sidebar nav" : ".bottom-nav")
      .getByRole("button", { name, exact: true })
      .click();
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute(
    "data-view",
    (
      {
        Hoy: "today",
        Temario: "syllabus",
        Repasos: "reviews",
        Estudiar: "study",
        Progreso: "progress",
        Pruebas: "tests",
        Configuración: "settings",
      } as Record<string, string>
    )[name],
  );
}
async function settingsSection(page: Page, id: string, title: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768)
    await page
      .getByLabel("Apartados de configuración", { exact: true })
      .selectOption(id);
  else
    await page
      .locator(".settings-nav")
      .getByRole("button", { name: new RegExp(title) })
      .click();
}
async function seedUI(server: Awaited<ReturnType<typeof adapter>>, count = 0) {
  const o = { ...opp(), name: "Guardia Civil", exam_date: "2027-07-08" };
  const c = node(A, o.id, null, "container", "Constitución Española"),
    t = node(A, o.id, c.id, "container", "Título IV"),
    b = node(A, o.id, t.id, "block", "Artículos 97–107");
  const d = node(A, o.id, null, "container", "Defensor del Pueblo"),
    b2 = node(A, o.id, d.id, "block", "Presentación de quejas");
  const l = node(A, o.id, null, "container", "Ley Orgánica 1/1982"),
    b3 = node(A, o.id, l.id, "block", "Intromisiones ilegítimas");
  const en = node(A, o.id, null, "container", "Inglés"),
    b4 = node(A, o.id, en.id, "block", "Gramática"),
    b5 = node(A, o.id, en.id, "block", "Vocabulario");
  const category = { ...base(A), name: "Ortografía", color: "#416886" };
  const result = await apply(server.db, A, [
    ch("profiles", {
      ...base(A, A),
      display_name: "Marc",
      preferences: { ...DEFAULT_PREFS, dailyMinutes: 120, weeklyMinutes: 600 },
    }),
    ch("oppositions", o),
    ...[c, t, b, d, b2, l, b3, en, b4, b5].map((n) => ch("nodes", n)),
    ch("categories", category),
    ch("plan_tasks", {
      ...base(A),
      opposition_id: o.id,
      node_id: b4.id,
      category_id: null,
      name: "Avanzar en gramática",
      kind: "study",
      scheduled_day: DAY,
      original_day: DAY,
      estimated_minutes: 30,
      status: "pending",
      notes: "",
      completed_session_id: null,
    }),
    ch("plan_tasks", {
      ...base(A),
      opposition_id: o.id,
      node_id: null,
      category_id: category.id,
      name: "Test de ortografía",
      kind: "practice",
      scheduled_day: DAY,
      original_day: DAY,
      estimated_minutes: 15,
      status: "pending",
      notes: "",
      completed_session_id: null,
    }),
  ]);
  expect(result.ok).toBe(true);
  for (const [n, day, duration] of [
    [b, "2026-10-06", 1500],
    [b2, "2026-10-07", 1200],
    [b3, "2026-10-08", 900],
  ] as const) {
    const s = session(A, o.id, "study", day + "T06:00:00Z", duration);
    expect(
      (
        await apply(server.db, A, [
          ch("sessions", s),
          ch("session_blocks", allocation(A, s.id, n.id, duration)),
          ch("memory_events", event(A, n.id, "study", s.ended_at, s.id)),
        ])
      ).ok,
    ).toBe(true);
  }
  const review = session(A, o.id, "review", "2026-10-08T06:30:00Z", 600);
  const ev = event(A, b3.id, "review", review.ended_at, review.id, "regular");
  expect(
    (
      await apply(server.db, A, [
        ch("sessions", review),
        ch("session_blocks", allocation(A, review.id, b3.id, 600, false)),
        ch("memory_events", ev),
      ])
    ).ok,
  ).toBe(true);
  const practice = session(A, o.id, "practice", "2026-10-08T07:00:00Z", 900);
  expect(
    (
      await apply(server.db, A, [
        ch("sessions", practice),
        ch("test_results", {
          ...base(A),
          session_id: practice.id,
          name: "Test de ortografía",
          test_type: "Test",
          category_id: category.id,
          question_count: 30,
          correct: 24,
          wrong: 4,
          blank: 2,
          penalty: 0.25,
          score: 7.67,
          max_score: 10,
          score_manual: false,
          notes: "Revisar acentuación.",
        }),
      ])
    ).ok,
  ).toBe(true);
  if (count) {
    const rows = Array.from({ length: count }, (_, i) =>
      node(
        A,
        o.id,
        t.id,
        "block",
        `Bloque de rendimiento ${String(i + 1).padStart(4, "0")}`,
      ),
    );
    expect(
      (
        await apply(
          server.db,
          A,
          rows.map((n) => ch("nodes", n)),
        )
      ).ok,
    ).toBe(true);
  }
  return { o, c, t, b, b2, b3 };
}
const audits: Record<string, unknown>[] = [];
const accessibilityAudits: Record<string, unknown>[] = [];
async function accessibility(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  accessibilityAudits.push({
    label,
    passes: result.passes.length,
    violations: result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  });
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    label,
  ).toEqual([]);
}
async function layout(page: Page, label: string, screenshot = false) {
  await page.mouse.move(0, 0);
  if (screenshot)
    await page
      .locator(".modal-scroll")
      .evaluateAll((elements) => elements.forEach((e) => (e.scrollTop = 0)));
  const geometry = await page.evaluate(() => {
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const inputs = [
      ...document.querySelectorAll<HTMLInputElement>(
        "input:not([type=checkbox]),select,textarea",
      ),
    ]
      .filter(visible)
      .map((e) => ({
        name:
          e.getAttribute("aria-label") ??
          e.closest("label")?.textContent?.trim(),
        width: e.getBoundingClientRect().width,
        font: parseFloat(getComputedStyle(e).fontSize),
      }));
    const buttons = [...document.querySelectorAll("button")]
      .filter(visible)
      .map((e) => ({
        name: e.getAttribute("aria-label") ?? e.textContent?.trim(),
        width: e.getBoundingClientRect().width,
        height: e.getBoundingClientRect().height,
        calendarCell: Boolean(e.closest(".calendar-grid.month")),
      }));
    return {
      viewport: innerWidth,
      viewportHeight: innerHeight,
      scroll: document.documentElement.scrollWidth,
      inputs,
      buttons,
      footer: [...document.querySelectorAll(".modal-footer")]
        .filter(visible)
        .map((e) => ({
          top: e.getBoundingClientRect().top,
          bottom: e.getBoundingClientRect().bottom,
        })),
    };
  });
  expect(geometry.scroll, `${label}: horizontal overflow`).toBeLessThanOrEqual(
    geometry.viewport + 1,
  );
  expect(
    geometry.inputs.filter((e) => e.font < 16),
    `${label}: fields should not zoom iOS`,
  ).toEqual([]);
  expect(
    geometry.footer.filter(
      (e) => e.top < 0 || e.bottom > geometry.viewportHeight + 1,
    ),
    `${label}: dialog actions fit viewport`,
  ).toEqual([]);
  expect(
    geometry.buttons.filter(
      (e) => e.width < (e.calendarCell ? 24 : 43) || e.height < 43,
    ),
    `${label}: touch controls`,
  ).toEqual([]);
  if (screenshot)
    await page.screenshot({
      path: `test-results/redesign/${label}.png`,
      fullPage: true,
    });
  audits.push({ label, ...geometry });
}

test("responsive matrix: nine widths, all main views, progressive syllabus, forms and dialogs", async ({
  browser,
}) => {
  test.setTimeout(240000);
  mkdirSync("test-results/redesign", { recursive: true });
  const server = await adapter();
  await seedUI(server);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    isMobile: true,
    hasTouch: true,
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });
  await server.attach(context);
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Buenos días, Marc." }),
  ).toBeVisible();
  const widths = [320, 375, 390, 393, 430, 768, 1024, 1280, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    for (const route of [
      "Hoy",
      "Temario",
      "Repasos",
      "Estudiar",
      "Progreso",
      "Pruebas",
      "Configuración",
    ]) {
      await navigate(page, route);
      await layout(
        page,
        `${width}-${route.toLowerCase()}`,
        width === 390 || width === 1440,
      );
    }
    await navigate(page, "Hoy");
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    for (const view of ["Semana", "Mes", "Día"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await layout(
        page,
        `${width}-agenda-${view.toLowerCase()}`,
        width === 390,
      );
    }
    await page
      .getByRole("button", { name: "Actividad", exact: true })
      .first()
      .click();
    await layout(page, `${width}-planificar`, width === 390);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await navigate(page, "Temario");
    await page
      .getByRole("button", {
        name: "Expandir Constitución Española",
        exact: true,
      })
      .click();
    await layout(page, `${width}-materia`, width === 390);
    await page
      .getByRole("button", { name: "Expandir Título IV", exact: true })
      .click();
    await layout(page, `${width}-tema`, width === 390);
    await page
      .getByRole("button", { name: "Artículos 97–107", exact: true })
      .click();
    await layout(page, `${width}-detalle-bloque`, width === 390);
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await navigate(page, "Repasos");
    await page
      .locator(".review-row")
      .first()
      .getByRole("button", { name: "Repasar", exact: true })
      .click();
    await layout(page, `${width}-registro-repaso`, width === 390);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
      "INPUT",
    );
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await navigate(page, "Pruebas");
    await page
      .getByRole("button", { name: "Registrar prueba", exact: true })
      .click();
    await page
      .getByText("Fórmula de puntuación y nota manual", { exact: true })
      .click();
    await page
      .getByText("Errores y bloques relacionados", { exact: true })
      .click();
    await layout(page, `${width}-simulacro`, width === 390);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await navigate(page, "Configuración");
    for (const [id, title] of [
      ["goals", "Objetivos"],
      ["memory", "Repetición espaciada"],
      ["appearance", "Apariencia"],
      ["data", "Datos y copias"],
      ["sync", "Sincronización"],
      ["notifications", "Notificaciones"],
    ]) {
      await settingsSection(page, id, title);
      await layout(page, `${width}-config-${id}`, width === 390);
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await navigate(page, "Repasos");
  await page
    .locator(".review-row")
    .first()
    .getByRole("button", { name: "Repasar", exact: true })
    .click();
  await layout(page, "horizontal-repaso", true);
  await expect(
    page.getByRole("button", { name: "Guardar sesión", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "Estudiar");
  await page.getByRole("checkbox", { name: /Artículos 97–107/ }).check();
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await layout(page, "390-cronometro", true);
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Finalizar sesión" }),
  ).toBeVisible();
  await layout(page, "390-fin-sesion", true);
  await page
    .getByRole("button", { name: "Guardar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sesión registrada", exact: true }),
  ).toBeVisible();
  await layout(page, "390-confirmacion", true);
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await navigate(page, "Configuración");
  await settingsSection(page, "appearance", "Apariencia");
  await page.getByLabel("Tema visual").selectOption("dark");
  await page
    .getByRole("button", { name: "Guardar apariencia", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".sync-indicator")).toHaveClass(/synced/);
  await page.clock.runFor(6000);
  await navigate(page, "Hoy");
  await layout(page, "390-hoy-oscuro", true);
  expect(errors).toEqual([]);
  writeFileSync(
    "test-results/redesign/responsive.json",
    JSON.stringify(audits, null, 2),
  );
  await context.close();
  await server.db.close();
});

test("visual baselines and automated accessibility of day, course, review sheet and dark theme", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const server = await adapter();
  await seedUI(server);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });
  await server.attach(context);
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Buenos días, Marc." }),
  ).toBeVisible();
  for (const route of [
    "Hoy",
    "Temario",
    "Repasos",
    "Estudiar",
    "Progreso",
    "Pruebas",
    "Configuración",
  ]) {
    await navigate(page, route);
    await accessibility(page, `claro-${route}`);
  }
  await navigate(page, "Hoy");
  await expect(page).toHaveScreenshot("today-mobile.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.025,
  });
  await navigate(page, "Temario");
  await page
    .getByRole("button", {
      name: "Expandir Constitución Española",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Expandir Título IV", exact: true })
    .click();
  await expect(page).toHaveScreenshot("course-mobile.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.025,
  });
  await navigate(page, "Repasos");
  await page
    .locator(".review-row")
    .first()
    .getByRole("button", { name: "Repasar", exact: true })
    .click();
  await accessibility(page, "claro-hoja-repaso");
  await expect(page).toHaveScreenshot("review-sheet.png", {
    maxDiffPixelRatio: 0.025,
  });
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, "Hoy");
  await expect(page).toHaveScreenshot("today-desktop.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.025,
  });
  await navigate(page, "Configuración");
  await settingsSection(page, "appearance", "Apariencia");
  await page.getByLabel("Tema visual").selectOption("dark");
  await page
    .getByRole("button", { name: "Guardar apariencia", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".sync-indicator")).toHaveClass(/synced/);
  await page.clock.runFor(6000);
  await navigate(page, "Hoy");
  await accessibility(page, "oscuro-Hoy");
  await expect(page).toHaveScreenshot("today-dark-desktop.png", {
    fullPage: true,
    maxDiffPixelRatio: 0.025,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "Temario",
    "Repasos",
    "Estudiar",
    "Progreso",
    "Pruebas",
    "Configuración",
  ]) {
    await navigate(page, route);
    await accessibility(page, `oscuro-${route}`);
    await layout(page, `390-oscuro-${route.toLowerCase()}`, true);
  }
  writeFileSync(
    "test-results/redesign/accessibility.json",
    JSON.stringify(accessibilityAudits, null, 2),
  );
  await context.close();
  await server.db.close();
});

test("empty states and onboarding stay useful; large syllabuses remain navigable", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const server = await adapter();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });
  await server.attach(context);
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  await page.goto("/");
  await layout(page, "390-conexion", true);
  await page.getByLabel("URL del proyecto").fill("https://fixture.supabase.co");
  await page.getByLabel("Publishable key pública").fill(publicKey);
  await page
    .getByRole("button", { name: "Conectar OpoPlan", exact: true })
    .click();
  await layout(page, "390-inicio-sesion", true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await layout(page, "1440-inicio-sesion", true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Correo electrónico").fill("a@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "El correo o la contraseña no son correctos.",
  );
  await layout(page, "390-error-inicio-sesion", true);
  await page.getByLabel("Contraseña", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Crear mi plan" }),
  ).toBeVisible();
  await layout(page, "390-onboarding", true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await layout(page, "1440-onboarding", true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Crear mi plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Buenos días." }),
  ).toBeVisible();
  for (const route of [
    "Hoy",
    "Temario",
    "Repasos",
    "Estudiar",
    "Progreso",
    "Pruebas",
  ]) {
    await navigate(page, route);
    await layout(page, `390-vacio-${route.toLowerCase()}`, true);
    if (["Hoy", "Progreso", "Pruebas"].includes(route))
      await expect(page.locator(".stat-grid")).toHaveCount(0);
  }
  await context.close();
  await server.db.close();
  const large = await adapter();
  await seedUI(large, 2000);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });
  await large.attach(ctx);
  const p = await ctx.newPage();
  await p.clock.install({ time: NOW });
  await signIn(p);
  await expect(
    p.getByRole("heading", { name: "Buenos días, Marc." }),
  ).toBeVisible();
  await navigate(p, "Temario");
  const begin = Date.now();
  await p.getByLabel("Buscar temario").fill("rendimiento 1999");
  await expect(
    p.getByRole("button", { name: "Bloque de rendimiento 1999", exact: true }),
  ).toBeVisible();
  const ms = Date.now() - begin;
  expect(ms).toBeLessThan(5000);
  await layout(p, "390-temario-2000", true);
  await p.getByLabel("Buscar temario").fill("");
  await p
    .getByRole("button", {
      name: "Expandir Constitución Española",
      exact: true,
    })
    .click();
  await p
    .getByRole("button", { name: "Expandir Título IV", exact: true })
    .click();
  expect(await p.locator(".outline-row").count()).toBe(60);
  await expect(p.getByRole("button", { name: /Mostrar más/ })).toBeVisible();
  writeFileSync(
    "test-results/redesign/performance.json",
    JSON.stringify(
      { blocks: 2005, searchMilliseconds: ms, visibleRows: 60 },
      null,
      2,
    ),
  );
  await ctx.close();
  await large.db.close();
});

test("quick review correction, keyboard focus, mobile creation and persisted goals", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const server = await adapter();
  const seed = await seedUI(server);
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });
  await server.attach(context);
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Buenos días, Marc." }),
  ).toBeVisible();
  await navigate(page, "Repasos");
  const row = page.locator(".review-row").filter({
    has: page.getByRole("heading", { name: "Artículos 97–107", exact: true }),
  });
  await row.getByRole("button", { name: "Repasar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Cerrar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    row.getByRole("button", { name: "Repasar", exact: true }),
  ).toBeFocused();
  await row.getByRole("button", { name: "Repasar", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Mal · Recuerdo de Artículos 97–107",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Guardar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Repaso registrado" }),
  ).toBeVisible();
  await expect(
    page.getByText("Próximo repaso: 9 de octubre", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Corregir la valoración reciente", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Regular · Artículos 97–107", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar corrección", exact: true })
    .click();
  await expect
    .poll(async () => {
      const r = await server.db.query<{ rating: string }>(
        "select rating from public.memory_events where node_id=$1 and kind='correction'",
        [seed.b.id],
      );
      return r.rows[0]?.rating;
    })
    .toBe("regular");
  await expect(page.locator(".sync-indicator")).toHaveClass(/synced/);
  const events = await server.db.query<{
    kind: string;
    rating: string;
    target_event_id: string;
  }>(
    "select kind,rating,target_event_id from public.memory_events where node_id=$1 order by occurred_at,id",
    [seed.b.id],
  );
  expect(events.rows.filter((e) => e.kind === "review")).toHaveLength(1);
  expect(events.rows.find((e) => e.kind === "review")?.rating).toBe("mal");
  expect(events.rows.find((e) => e.kind === "correction")?.rating).toBe(
    "regular",
  );
  const projection = await server.db.query<{
    state: { rating: string; reviews: number };
  }>("select state from public.review_state where node_id=$1", [seed.b.id]);
  expect(projection.rows[0].state.rating).toBe("regular");
  expect(projection.rows[0].state.reviews).toBe(1);
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await navigate(page, "Temario");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  let deep: { name: string; children?: unknown[] } = {
    name: "Bloque final de una estructura profunda",
  };
  for (let i = 29; i >= 1; i--)
    deep = {
      name: `Nivel de organización ${i} con un título legible`,
      children: [deep],
    };
  await page
    .getByRole("combobox", { name: "Formato", exact: true })
    .selectOption("json");
  await page.getByLabel("Pega tu estructura").fill(JSON.stringify([deep]));
  await page
    .getByRole("button", { name: "Validar y previsualizar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /30 elementos nuevos/ }),
  ).toBeVisible();
  await layout(page, "375-importacion-profunda", true);
  expect(
    await page
      .locator(".preview-tree")
      .last()
      .evaluate((e) => e.getBoundingClientRect().width),
  ).toBeGreaterThan(170);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Nombre", { exact: true })
    .fill("Materia creada desde el móvil");
  await page
    .getByRole("button", { name: "Guardar elemento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", {
      name: "Expandir Materia creada desde el móvil",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Nombre", { exact: true })
    .fill(
      "Un bloque con un título largo que se debe poder leer completo en el móvil",
    );
  await page.getByText("Opciones y notas", { exact: true }).click();
  await page
    .getByLabel("Notas", { exact: true })
    .fill("Una nota conservada después de cambiar el nombre.");
  await page.getByLabel("Minutos estimados de repaso").fill("15");
  await layout(page, "375-crear-bloque", true);
  await page
    .getByRole("button", { name: "Guardar elemento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /Opciones de Un bloque/ }).click();
  await page
    .getByRole("menuitem", { name: "Editar / mover", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nombre", { exact: true })
    .fill("Bloque editado desde el móvil");
  await page
    .getByRole("button", { name: "Guardar elemento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Bloque editado desde el móvil", exact: true })
    .click();
  await expect(
    page.getByText("Una nota conservada después de cambiar el nombre.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator(".sync-indicator").click();
  await expect(page.getByLabel("Apartados de configuración")).toHaveValue(
    "sync",
  );
  await settingsSection(page, "goals", "Objetivos");
  await page.getByLabel("Minutos objetivo al día").fill("150");
  await page
    .getByRole("button", { name: "Guardar objetivos", exact: true })
    .click();
  await expect(page.locator(".sync-indicator")).toHaveClass(/synced/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Buenos días, Marc." }),
  ).toBeVisible();
  await expect(
    page.getByText("de 150 min de objetivo", { exact: true }),
  ).toBeVisible();
  await context.close();
  await server.db.close();
});
