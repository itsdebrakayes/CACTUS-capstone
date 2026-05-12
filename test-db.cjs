require('dotenv').config();
const postgres = require('postgres');

const url = process.env.DATABASE_URL;
console.log('Testing connection with prepare:false...');

async function main() {
  try {
    // Match the exact options from server/db.ts
    const sql = postgres(url, { 
      prepare: false, 
      max: 1,
      connect_timeout: 10,
    });
    const result = await sql`SELECT 1 as test`;
    console.log('SUCCESS! Connection works:', JSON.stringify(result));
    
    const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    console.log('Tables in public schema:', tables.map(t => t.tablename));
    
    await sql.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error('Full error:', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
    process.exit(1);
  }
}
main();
