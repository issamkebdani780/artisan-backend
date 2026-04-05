const pool = require('./config/db');
async function test() {
  try {
    const [rows] = await pool.query('DESCRIBE users');
    console.log('Users columns:', rows.map(r => r.Field));
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}
test();
