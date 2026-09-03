import { openDb } from "./client.js";
const h = await openDb({ migrate: true });
console.log(`[kiln/db] migrated (${h.driver})`);
await h.close();
