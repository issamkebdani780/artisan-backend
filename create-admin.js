const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('Admin@123', 10);
  try {
    const [result] = await db.query(
      `INSERT INTO users (name, email, password, role, is_verified) 
       VALUES (?, ?, ?, 'admin', 1)
       ON DUPLICATE KEY UPDATE role='admin', is_verified=1`,
      ['Admin BricoloPro', 'admin@bricolopro.dz', hashedPassword]
    );
    console.log('✅ Admin user created successfully!');
    console.log('   Email:    admin@bricolopro.dz');
    console.log('   Password: Admin@123');
  } catch (err) {
    console.error('❌ Error creating admin:', err.message);
  }
  process.exit(0);
}

createAdmin();
