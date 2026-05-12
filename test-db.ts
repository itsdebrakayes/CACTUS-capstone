import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL!;
console.log('Connecting...');

try {
  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  const result = await sql`SELECT 1 as test`;
  console.log('SUCCESS - connection works:', JSON.stringify(result));
  
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  console.log('Tables:', tables.map((t: any) => t.tablename));
  
  await sql.end();
} catch (e: any) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
