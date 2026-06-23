import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function migrate() {
  // Connect without database first to create it
  const initPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'bastion',
    password: process.env.DB_PASSWORD || 'bastion123',
    charset: 'utf8mb4',
  });

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found: ${schemaPath}`);
    process.exit(1);
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Split on semicolons, filter out empty statements and comments
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && s !== '');

  console.log(`Found ${statements.length} SQL statements to execute`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await initPool.query(stmt);
      const preview = stmt.substring(0, 60).replace(/\n/g, ' ').trim();
      console.log(`[${i + 1}/${statements.length}] OK: ${preview}...`);
    } catch (err: any) {
      // Ignore "database exists" errors
      if (err.code === 'ER_DB_CREATE_EXISTS') {
        console.log(`[${i + 1}/${statements.length}] SKIP: Database already exists`);
      } else {
        console.error(`[${i + 1}/${statements.length}] ERROR: ${err.message}`);
      }
    }
  }

  await initPool.end();
  console.log('Migration completed.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
