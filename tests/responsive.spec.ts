import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hali so‘z qo‘shilmagan" }),
  ).toBeVisible();
}
async function noPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(
    dimensions.document,
    "The document should fit the mobile viewport",
  ).toBeLessThanOrEqual(dimensions.viewport);
  expect(
    dimensions.body,
    "The body should not create horizontal scrolling",
  ).toBeLessThanOrEqual(dimensions.viewport);
}

for (const width of [390, 320]) {
  test(`mobile ${width}px keeps home, helper menu, and import usable without page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await ready(page);
    await noPageOverflow(page);
    await expect(
      page.getByRole("button", { name: "Birinchi to‘plamni qo‘shish" }),
    ).toBeVisible();
    const visibleCards = await page.locator(".orbit-card:visible").count();
    expect(visibleCards).toBeLessThanOrEqual(4);
    await page.getByRole("button", { name: "Yordamchi menyu" }).click();
    const menu = page.locator("#helper-menu");
    await expect(menu).toBeVisible();
    const menuRect = await menu.boundingBox();
    expect(menuRect).not.toBeNull();
    expect(menuRect!.x).toBeGreaterThanOrEqual(0);
    expect(menuRect!.x + menuRect!.width).toBeLessThanOrEqual(width);
    await noPageOverflow(page);
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await page
      .getByRole("button", { name: "Birinchi to‘plamni qo‘shish" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "So‘zlarni import qilish",
    });
    await expect(dialog).toBeVisible();
    await noPageOverflow(page);
    const dialogRect = await dialog.boundingBox();
    expect(dialogRect!.x).toBeGreaterThanOrEqual(0);
    expect(dialogRect!.x + dialogRect!.width).toBeLessThanOrEqual(width);
    await page
      .getByRole("textbox", { name: "To‘plam nomi" })
      .fill("Mening mobil to‘plamim");
    const titleInput = page.getByRole("textbox", { name: "To‘plam nomi" });
    await titleInput.focus();
    await expect(titleInput).toBeFocused();
    // Fields use at least 16px text at mobile widths, avoiding automatic zoom on iOS.
    expect(
      await titleInput.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Birinchi to‘plamni qo‘shish" }),
    ).toBeFocused();
  });
}

test("keyboard import navigation traps focus, restores it, and exposes a usable review table", async ({
  page,
}) => {
  await ready(page);
  const trigger = page.getByRole("button", {
    name: "Birinchi to‘plamni qo‘shish",
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "So‘zlarni import qilish" });
  await expect(dialog).toBeVisible();
  const close = page.getByRole("button", { name: "Oynani yopish" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Bekor qilish", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      `Tab ${i + 1} must stay in the modal`,
    ).toBe(true);
  }
  const json = page.getByRole("textbox", { name: "JSON matni" });
  await json.focus();
  await page.keyboard.insertText(
    JSON.stringify({
      schemaVersion: 1,
      language: "de",
      level: "A1.2",
      title: "Klaviatura",
      words: [{ word: "heute", translation: "bugun" }],
    }),
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Tekshirish", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".review-table tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "1-qator so‘z", exact: true }),
  ).toHaveValue("heute");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("system reduced motion presents a static functional orbit without pinning", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await expect(page.locator(".app")).toHaveClass(/reduced-motion/);
  await expect(page.locator(".orbit-section")).toHaveClass(/orbit-static/);
  expect(
    await page
      .locator(".orbit-sticky")
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe("relative");
  const originalTransform = await page
    .locator(".orbit-card-0")
    .evaluate((element) => getComputedStyle(element).transform);
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  expect(
    await page
      .locator(".orbit-card-0")
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe(originalTransform);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page
    .getByRole("button", { name: "Birinchi to‘plamni qo‘shish" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "So‘zlarni import qilish" }),
  ).toBeVisible();
});

test("animation preference persists in IndexedDB and keeps actions accessible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready(page);
  await page.getByRole("button", { name: "Yordamchi menyu" }).click();
  const reduced = page.getByRole("checkbox", {
    name: "Animatsiyani kamaytirish",
  });
  await expect(reduced).not.toBeChecked();
  await reduced.click();
  await expect(reduced).toBeChecked();
  await expect(page.locator(".app")).toHaveClass(/reduced-motion/);
  await expect(page.locator(".orbit-section")).toHaveClass(/orbit-static/);
  await page.reload();
  await expect(page.locator(".app")).toHaveClass(/reduced-motion/);
  await page.getByRole("button", { name: "Yordamchi menyu" }).click();
  await expect(reduced).toBeChecked();
  await reduced.click();
  await expect(reduced).not.toBeChecked();
  await expect(page.locator(".app")).not.toHaveClass(/reduced-motion/);
  await expect(page.locator(".orbit-section")).not.toHaveClass(/orbit-static/);
});

test("scroll changes actual 3D cards, collects them, and reverses to the original orbit", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready(page);
  await expect(page.locator(".orbit-card")).toHaveCount(6);
  await expect(page.locator(".orbit-card.has-word")).toHaveCount(0);
  const card = page.locator(".orbit-card-0");
  const group = page.locator(".orbit-cards");
  const initial = await card.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  expect(initial).toMatch(/^matrix3d\(/);
  expect(
    await page
      .locator(".orbit-perspective")
      .evaluate((element) => getComputedStyle(element).perspective),
  ).not.toBe("none");
  expect(
    await group.evaluate((element) => getComputedStyle(element).transformStyle),
  ).toBe("preserve-3d");
  const initialGroup = await group.getAttribute("style");
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
  await expect.poll(() => group.getAttribute("style")).not.toBe(initialGroup);
  // Capture the settled pose, rather than one transient smoothing frame.
  await page.waitForFunction(() => {
    const scene = document
      .querySelector(".orbit-section")!
      .getBoundingClientRect();
    const sticky = document
      .querySelector(".orbit-sticky")!
      .getBoundingClientRect();
    const target =
      Math.max(
        0,
        Math.min(1, -scene.top / Math.max(1, scene.height - sticky.height)),
      ) * 40;
    const angle = parseFloat(
      (
        document.querySelector(".orbit-cards") as HTMLElement
      ).style.transform.slice(8),
    );
    return Math.abs(angle - target) < 0.00002;
  });
  const forward = await card.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  expect(forward).not.toBe(initial);
  expect(
    await page
      .locator(".orbit-sticky")
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe("sticky");
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
  await expect
    .poll(() => group.getAttribute("style"))
    .toContain("rotateY(40deg)");
  await expect
    .poll(() => card.getAttribute("style"))
    .toContain("translate3d(-151px, -55px, 0px)");
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
  await expect
    .poll(() => card.evaluate((element) => getComputedStyle(element).transform))
    .toBe(forward);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect
    .poll(() => card.evaluate((element) => getComputedStyle(element).transform))
    .toBe(initial);
  await expect(group).toHaveAttribute("style", initialGroup!);
});

test("user can enable and persist real scroll animation despite OS reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await expect(page.locator(".orbit-section")).toHaveClass(/orbit-static/);
  await page.getByRole("button", { name: "Yordamchi menyu" }).click();
  const reduced = page.getByRole("checkbox", {
    name: "Animatsiyani kamaytirish",
  });
  await expect(reduced).toBeChecked();
  await reduced.click();
  await expect(reduced).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(page.locator(".orbit-section")).not.toHaveClass(/orbit-static/);
  expect(
    await page
      .locator(".orbit-sticky")
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe("sticky");
  await page.keyboard.press("Escape");
  const initial = await page.locator(".orbit-card-0").getAttribute("style");
  await page.evaluate(() => window.scrollTo({ top: 250, behavior: "instant" }));
  await expect
    .poll(() => page.locator(".orbit-card-0").getAttribute("style"))
    .not.toBe(initial);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(page.locator(".orbit-section")).not.toHaveClass(/orbit-static/);
  await page.getByRole("button", { name: "Yordamchi menyu" }).click();
  await expect(reduced).not.toBeChecked();
  await page
    .getByRole("button", { name: "Qurilma sozlamasiga qaytish" })
    .click();
  await expect(reduced).toBeChecked();
  await expect(page.locator(".orbit-section")).toHaveClass(/orbit-static/);
});

test("visible static-orbit notice can directly enable full animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page
    .getByRole("button", { name: "To‘liq animatsiyani yoqish" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(page.locator(".motion-note")).toHaveCount(0);
  expect(
    await page
      .locator(".orbit-sticky")
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe("sticky");
});

test("one wheel step produces intermediate animation frames instead of one pose jump", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready(page);
  await page.mouse.move(1000, 400);
  await page.evaluate(() => {
    const data = { transforms: [] as string[], done: false };
    Object.assign(window, { orbitFrameSample: data });
    const start = performance.now();
    function sample() {
      data.transforms.push(
        (document.querySelector(".orbit-card-0") as HTMLElement).style
          .transform,
      );
      if (performance.now() - start < 400) requestAnimationFrame(sample);
      else data.done = true;
    }
    requestAnimationFrame(sample);
  });
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(
    () =>
      (window as unknown as { orbitFrameSample: { done: boolean } })
        .orbitFrameSample.done,
  );
  const samples = await page.evaluate(
    () =>
      (window as unknown as { orbitFrameSample: { transforms: string[] } })
        .orbitFrameSample.transforms,
  );
  expect(
    new Set(samples).size,
    "A single wheel impulse must render multiple intermediate poses",
  ).toBeGreaterThan(8);
});
