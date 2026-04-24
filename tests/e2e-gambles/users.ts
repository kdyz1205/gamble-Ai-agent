/**
 * Plain-object user constants shared between seed-users.ts (Node script)
 * and helpers.ts (Playwright test). Keeping this file free of Prisma / DB
 * imports so Playwright's ESM test runner doesn't choke on the generated
 * Prisma CJS client.
 */
export const PLAYER_A = {
  email: "playera@luckyplay.test",
  username: "player_a",
  password: "testpass123",
};
export const PLAYER_B = {
  email: "playerb@luckyplay.test",
  username: "player_b",
  password: "testpass123",
};
