import { test, expect } from "@playwright/test";
import { adapter, A, B, publicKey } from "./fixture";
import { dayAt, addDays } from "../src/core/dates";
import { parseBackup } from "../src/core/import";
import { readFileSync } from "node:fs";
const today = dayAt(new Date(), "Europe/Madrid");
async function connect(page: any) {
  await page.goto("/");
  await page.getByLabel("URL del proyecto").fill("https://fixture.supabase.co");
  await page.getByLabel("Publishable key pública").fill(publicKey);
  await page
    .getByRole("button", { name: "Conectar OpoPlan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
}
async function login(page: any, email = "a@example.test") {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
async function onboard(page: any, name = "Mi oposición de prueba") {
  await page.getByLabel("Nombre de la oposición").fill(name);
  await page
    .getByRole("button", { name: "Crear mi plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu plan para hoy." }),
  ).toBeVisible();
}
async function nav(page: any, name: string, mobile = false) {
  await page
    .locator(mobile ? ".bottom-nav" : ".sidebar nav")
    .getByRole("button", { name, exact: true })
    .click();
}
async function importTree(page: any) {
  await nav(page, "Temario");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page
    .getByLabel("Pega tu estructura")
    .fill(
      "Materia real de prueba\n  Tema de prueba\n    Bloque A\n    Bloque B\n    Bloque C",
    );
  await page.getByRole("button", { name: "Validar y previsualizar" }).click();
  await expect(
    page.getByRole("heading", { name: /5 elementos nuevos/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(
    page.getByText("3 bloques activos", { exact: true }),
  ).toBeVisible();
}
async function manual(
  page: any,
  minutes: number,
  complete: boolean,
  ids = ["Bloque A"],
) {
  await nav(page, "Estudiar");
  await page.getByRole("button", { name: "Registrar tiempo manual" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Tiempo de estudio (minutos)").fill(String(minutes));
  for (const name of ids)
    await modal.getByRole("checkbox", { name: new RegExp(name) }).check();
  if (complete)
    await modal
      .getByRole("checkbox", {
        name: "Estudio inicial completado",
        exact: true,
      })
      .first()
      .check();
  await modal
    .getByRole("button", { name: "Guardar sesión", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
}
async function waitCloud(page: any) {
  await expect(page.locator(".sync-indicator")).toContainText("Sincronizado");
}

test("real UI: import, partial study, multiblock time, reviews, tests, timer, offline, second device, backup", async ({
  browser,
}) => {
  const server = await adapter();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await server.attach(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await connect(page);
  await login(page);
  await onboard(page);
  await importTree(page);
  await manual(page, 50, false, ["Bloque A", "Bloque B", "Bloque C"]);
  await waitCloud(page);
  let count = await server.db.query<{ total: number }>(
    "select sum(duration_seconds)::int total from public.sessions where owner_id=$1",
    [A],
  );
  expect(count.rows[0].total).toBe(3000);
  expect(
    (
      await server.db.query(
        "select * from public.memory_events where owner_id=$1",
        [A],
      )
    ).rows,
  ).toHaveLength(0);
  await manual(page, 20, true);
  await waitCloud(page);
  const state = await server.db.query<{ state: any }>(
    "select state from public.review_state where owner_id=$1",
    [A],
  );
  expect(state.rows[0].state.due).toBe(addDays(today, 1));
  await nav(page, "Progreso");
  await expect(page.getByText("1/3 bloques", { exact: true })).toBeVisible();
  await nav(page, "Repasos");
  await page.getByLabel("Filtrar repasos").selectOption("all");
  await page
    .locator(".review-row")
    .filter({
      has: page.getByRole("heading", { name: "Bloque A", exact: true }),
    })
    .getByRole("button", { name: "Repasar", exact: true })
    .click();
  await page.getByLabel("Recuerdo de Bloque A").selectOption("mal");
  await page
    .getByLabel("Partes olvidadas / comentario")
    .fill("Detalle que debo recordar");
  await page
    .getByRole("button", { name: "Guardar sesión", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await waitCloud(page);
  expect(
    (
      await server.db.query<{ state: any }>(
        "select state from public.review_state where owner_id=$1",
        [A],
      )
    ).rows[0].state.rating,
  ).toBe("mal");
  await nav(page, "Pruebas");
  await page
    .getByRole("button", { name: "Registrar prueba", exact: true })
    .click();
  await page
    .getByLabel("Nombre de la prueba")
    .fill("Simulacro auténtico de prueba");
  await page.getByLabel("Aciertos", { exact: true }).fill("20");
  await page.getByLabel("Errores", { exact: true }).fill("5");
  await page.getByLabel("Blancos", { exact: true }).fill("5");
  await page.getByLabel("Penalización por error").fill("0.25");
  await page
    .getByRole("button", { name: "Guardar sesión", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await waitCloud(page);
  expect(
    Number(
      (
        await server.db.query<{ score: number }>(
          "select score from public.test_results where owner_id=$1",
          [A],
        )
      ).rows[0].score,
    ),
  ).toBe(6.25);
  await page
    .locator(".test-row")
    .getByRole("button", { name: "Opciones" })
    .click();
  await page.getByRole("menuitem", { name: "Corregir resultado" }).click();
  await page.getByLabel("Aciertos", { exact: true }).fill("21");
  await page.getByLabel("Errores", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await waitCloud(page);
  expect(
    Number(
      (
        await server.db.query<{ score: any }>(
          "select score from public.test_results where owner_id=$1",
          [A],
        )
      ).rows[0].score,
    ),
  ).toBeCloseTo(6.67);
  await nav(page, "Estudiar");
  await page.getByRole("checkbox", { name: /Bloque A/ }).check();
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.reload();
  await nav(page, "Estudiar");
  await expect(
    page.getByRole("button", { name: "Reanudar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await page
    .getByRole("button", { name: "Guardar sesión", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await waitCloud(page);
  // Reload the installed shell while offline, then record another real session.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((r) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => r(),
          { once: true },
        ),
      );
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tu plan para hoy." }),
  ).toBeVisible();
  await manual(page, 12, false, ["Bloque B"]);
  await expect(page.locator(".sync-indicator")).toContainText("Sin conexión");
  const before = Number(
    (
      await server.db.query<{ count: any }>(
        "select count(*) count from public.sessions where owner_id=$1",
        [A],
      )
    ).rows[0].count,
  );
  await context.setOffline(false);
  await waitCloud(page);
  expect(
    Number(
      (
        await server.db.query<{ count: any }>(
          "select count(*) count from public.sessions where owner_id=$1",
          [A],
        )
      ).rows[0].count,
    ),
  ).toBe(before + 1);
  const second = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await server.attach(second);
  const p2 = await second.newPage();
  await connect(p2);
  await login(p2);
  await expect(
    p2.getByRole("heading", { name: "Tu plan para hoy." }),
  ).toBeVisible();
  await nav(p2, "Progreso", true);
  await expect(
    p2
      .locator(".coverage-row")
      .first()
      .getByText("1/3 bloques", { exact: true }),
  ).toBeVisible();
  expect(
    await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await p2.screenshot({
    path: "test-results/mobile-progress.png",
    fullPage: true,
  });
  await second.close();
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia completa" }).click();
  const downloaded = await downloadPromise;
  const path = await downloaded.path();
  const content = readFileSync(path!, "utf8");
  const backup = parseBackup(content);
  expect(backup.data.sessions.length).toBe(before + 1);
  await page.getByLabel("O pega el JSON").fill(content);
  await page
    .getByRole("button", { name: "Validar y previsualizar copia" })
    .click();
  await expect(
    page.getByRole("heading", { name: "0 registros nuevos" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-settings.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Tu plan para hoy." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-today.png",
    fullPage: true,
  });
  await context.close();
  await server.db.close();
});

test("account isolation, signup, planned tasks survive day changes, responsive and PWA manifest", async ({
  browser,
}) => {
  const server = await adapter();
  const ctx = await browser.newContext({
    viewport: { width: 834, height: 1112 },
  });
  await server.attach(ctx);
  const page = await ctx.newPage();
  await connect(page);
  await page
    .getByRole("button", { name: "Crear una cuenta", exact: true })
    .click();
  await page.getByLabel("Correo electrónico").fill("b@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await onboard(page, "Oposición B");
  await page.getByRole("button", { name: "Actividad", exact: true }).click();
  await page.getByLabel("Actividad", { exact: true }).fill("Pendiente de ayer");
  await page.getByLabel("Fecha prevista").fill(addDays(today, -1));
  await page.getByRole("button", { name: "Añadir actividad" }).click();
  await waitCloud(page);
  await expect(
    page.getByText("Pendiente de ayer", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Pendiente desde/)).toBeVisible();
  expect(
    (
      await server.db.query("select * from public.sessions where owner_id=$1", [
        B,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await server.db.query(
        "select * from public.oppositions where owner_id=$1",
        [A],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const manifest = await page.request.get("/manifest.webmanifest");
  expect((await manifest.json()).display).toBe("standalone");
  const sw = await page.request.get("/sw.js");
  expect(await sw.text()).toContain("/assets/");
  await page.screenshot({
    path: "test-results/tablet-today.png",
    fullPage: true,
  });
  await ctx.close();
  await server.db.close();
});

test("edit and split real blocks, restore a complete backup to another account, feature-detected tools", async ({
  browser,
}) => {
  const server = await adapter(),
    ctx = await browser.newContext();
  await server.attach(ctx);
  await ctx.addInitScript(() => {
    const tools: Record<string, any> = {};
    (window as any).__tools = tools;
    Object.defineProperty(document, "modelContext", {
      value: {
        registerTool(tool: any, { signal }: any) {
          tools[tool.name] = tool;
          signal.addEventListener("abort", () => {
            if (tools[tool.name] === tool) delete tools[tool.name];
          });
        },
      },
    });
  });
  const page = await ctx.newPage();
  await connect(page);
  expect(
    await page.evaluate(() => Object.keys((window as any).__tools)),
  ).toEqual([]);
  await login(page);
  await onboard(page);
  await importTree(page);
  await manual(page, 20, true);
  await waitCloud(page);
  const summary = await page.evaluate(() =>
    (window as any).__tools.get_today_summary.execute({}),
  );
  expect(summary.seconds).toBe(1200);
  expect(
    await page.evaluate(async () => {
      try {
        await (window as any).__tools.start_review_registration.execute({
          nodeIds: ["not-an-id"],
        });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  const old = (
    await server.db.query<{ id: string }>(
      "select id from public.nodes where owner_id=$1 and name='Bloque A'",
      [A],
    )
  ).rows[0].id;
  await page.evaluate(
    (id) =>
      (window as any).__tools.start_review_registration.execute({
        nodeIds: [id],
      }),
    old,
  );
  await expect(
    page.getByRole("dialog", { name: "Registrar repaso" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  expect(
    (
      await server.db.query(
        "select * from public.memory_events where owner_id=$1",
        [A],
      )
    ).rows,
  ).toHaveLength(1);
  await nav(page, "Temario");
  await page.getByLabel("Buscar temario").fill("Bloque A");
  await page
    .locator(".tree-row")
    .filter({ has: page.getByText("Bloque A", { exact: true }) })
    .getByRole("button", { name: "Opciones" })
    .click();
  await page
    .getByRole("menuitem", { name: "Dividir en bloques nuevos" })
    .click();
  await page.getByLabel("Un nombre por línea").fill("Parte A1\nParte A2");
  await page
    .getByRole("button", { name: "Crear bloques independientes" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await waitCloud(page);
  expect(
    (
      await server.db.query(
        "select * from public.memory_events where owner_id=$1 and node_id=$2",
        [A, old],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await server.db.query(
        "select * from public.review_state where node_id in(select id from public.nodes where source_node_id=$1)",
        [old],
      )
    ).rows,
  ).toHaveLength(0);
  await page.getByLabel("Buscar temario").fill("Bloque B");
  await page
    .locator(".tree-row")
    .filter({ has: page.getByText("Bloque B", { exact: true }) })
    .getByRole("button", { name: "Opciones" })
    .click();
  await page.getByRole("menuitem", { name: "Editar / mover" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Bloque B corregido");
  await page.getByRole("button", { name: "Guardar elemento" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await waitCloud(page);
  await page
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia completa" }).click();
  const content = readFileSync((await (await promise).path())!, "utf8");
  const second = await browser.newContext();
  await server.attach(second);
  const pb = await second.newPage();
  await connect(pb);
  await login(pb, "b@example.test");
  await onboard(pb, "Mi oposición B");
  await nav(pb, "Temario");
  await expect(
    pb.getByText("0 bloques activos", { exact: true }),
  ).toBeVisible();
  await pb
    .locator(".sidebar-bottom")
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await pb.getByLabel("O pega el JSON").fill(content);
  await pb
    .getByRole("button", { name: "Validar y previsualizar copia" })
    .click();
  await pb.getByRole("button", { name: "Confirmar restauración" }).click();
  await expect(pb.getByRole("button", { name: "Confirmar restauración" })).not.toBeVisible();
  await waitCloud(pb);
  expect(
    (
      await server.db.query("select * from public.sessions where owner_id=$1", [
        B,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await server.db.query("select * from public.sessions where owner_id=$1", [
        A,
      ])
    ).rows,
  ).toHaveLength(1);
  await pb.getByLabel("O pega el JSON").fill(content);
  await pb
    .getByRole("button", { name: "Validar y previsualizar copia" })
    .click();
  await expect(
    pb.getByRole("heading", { name: "0 registros nuevos" }),
  ).toBeVisible();
  await second.close();
  await ctx.close();
  await server.db.close();
});
