import { setDb } from "@/db/db";
import { NkshaDB } from "@/db/schema";

/**
 * Open an isolated test database and install it as the app-wide singleton,
 * simulating one browser profile. Call `reopenTestDb()` in a test to simulate
 * a page reload against the same storage.
 */
export function openTestDb(label: string): NkshaDB {
  const db = new NkshaDB(`test-${label}-${crypto.randomUUID()}`);
  setDb(db);
  return db;
}

/** Simulate a hard reload: close, then reopen the same underlying storage. */
export async function reopenTestDb(db: NkshaDB): Promise<NkshaDB> {
  const name = db.name;
  db.close();
  const reopened = new NkshaDB(name);
  await reopened.open();
  setDb(reopened);
  return reopened;
}

export async function disposeTestDb(db: NkshaDB): Promise<void> {
  setDb(null);
  db.close();
  await db.delete();
}
