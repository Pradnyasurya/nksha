import { NkshaDB } from "./schema";

let instance: NkshaDB | null = null;

/** App-wide singleton. Tests may swap it via openTestDb(). */
export function getDb(): NkshaDB {
  if (!instance) {
    instance = new NkshaDB();
  }
  return instance;
}

/** Test seam: replace the singleton (e.g. with an isolated test database). */
export function setDb(db: NkshaDB | null): void {
  instance = db;
}
