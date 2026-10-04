import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await migrate(drizzle(pool), { migrationsFolder: './drizzle' }); }
  finally { await pool.end(); }
}
main().catch(error => { console.error(error); process.exit(1); });
