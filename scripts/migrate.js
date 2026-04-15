require('dotenv').config();

const mysql = require('mysql2');

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'user_db',
  connectionLimit: 4,
  waitForConnections: true,
  queueLimit: 0
});

const dbp = db.promise();

async function columnExists(table, column) {
  const sql = `
    SELECT COUNT(*) as cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
  `;
  const [rows] = await dbp.query(sql, [table, column]);
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function addColumnIfMissing(table, columnDef) {
  const [name] = columnDef.trim().split(/\s+/, 1);
  const exists = await columnExists(table, name);
  if (exists) return;
  await dbp.query(`ALTER TABLE \`${table}\` ADD COLUMN ${columnDef}`);
}

async function createTables() {
  await dbp.query(`
    CREATE TABLE IF NOT EXISTS agency_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      agency_name VARCHAR(255),
      owner_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50)
    )
  `);

  await dbp.query(`
    CREATE TABLE IF NOT EXISTS scheduled_checks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      agency_email VARCHAR(255) NOT NULL,
      industry_name VARCHAR(255) NOT NULL,
      industry_email VARCHAR(255) NOT NULL,
      scheduled_date DATE,
      status VARCHAR(50) DEFAULT 'Pending'
    )
  `);
}

async function ensureColumns() {
  try {
    await addColumnIfMissing('industry_details', 'review_submitted_at DATETIME NULL');
  } catch {
    // Table may not exist in minimal environments; skip.
  }

  // These columns are used by app logic; add them if missing.
  // Ignore if tables don't exist in this DB (those are created elsewhere).
  const tables = ['pm10_data', 'so2_data', 'no2_data', 'pm25_data'];
  for (const t of tables) {
    try {
      await addColumnIfMissing(t, 'user_email VARCHAR(255)');
    } catch {
      // Table may not exist in this environment; skip.
    }
  }

  try {
    await addColumnIfMissing('pm10_data', "status VARCHAR(50) DEFAULT 'Published'");
  } catch {
    // skip
  }
}

async function main() {
  try {
    await createTables();
    await ensureColumns();
    console.log('✅ Migration complete');
  } finally {
    db.end();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err?.message || err);
  process.exitCode = 1;
});

