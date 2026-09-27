'use strict';
// v3 Phase 4 moved Discover's moods, adventurousness, "hide owned", the
// filter panel and "Pick for me" into a Tune popover, and a card's add
// choices and dismiss reasons into menus. Shared steps for the specs.

// Opens the Tune popover if it is not open already.
async function tune(page) {
  const open = await page.locator('#discover-tune').evaluate((el) => el.matches(':popover-open'));
  if (!open) await page.click('.tune-btn');
  await page.locator('#discover-tune').waitFor({ state: 'visible' });
}

// "Not for me" on a card, then a reason by its label (or "Skip").
async function notForMe(page, card, reasonLabel) {
  await card.locator('[data-action="discover-not-for-me"]').click();
  await page.getByRole('menuitem', { name: reasonLabel, exact: true }).click();
}

// The split Add button's menu: "Add as Watching" / "Add as Watched".
async function addAs(page, card, listLabel) {
  await card.locator('[data-action="discover-add-menu"]').click();
  await page.getByRole('menuitem', { name: `Add as ${listLabel}` }).click();
}

module.exports = { tune, notForMe, addAs };
