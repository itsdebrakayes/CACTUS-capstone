import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
console.log('Connecting with URL (masked):', url?.replace(/:[^:]+@/, ':***@'));

try {
  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  const result = await sql`SELECT 1 as test`;
  console.log('SUCCESS - connection works:', result);
  
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  console.log('Tables in public schema:', tables.map(t => t.tablename));
  
  await sql.end();
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
