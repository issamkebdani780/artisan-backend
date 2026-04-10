const db = require('../config/db');


async function seedBookings() {
  try {
    console.log('Seeding sample bookings for the chart...');
    
    // Get an artisan and a client
    const [artisans] = await db.query('SELECT id FROM users WHERE role = "artisan" LIMIT 1');
    const [clients] = await db.query('SELECT id FROM users WHERE role = "client" LIMIT 1');
    const [services] = await db.query('SELECT id FROM services LIMIT 1');

    if (artisans.length === 0 || clients.length === 0 || services.length === 0) {
      console.log('Missing data to seed bookings. Please register an artisan and a client first.');
      return;
    }

    const artisanId = artisans[0].id;
    const clientId = clients[0].id;
    const serviceId = services[0].id;

    const months = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        months.push(d.toISOString().slice(0, 19).replace('T', ' '));
    }

    const prices = [1200, 4500, 3200, 8900, 5600, 7100, 9500];

    for (let i = 0; i < 7; i++) {
        await db.query(`
            INSERT INTO bookings (client_id, service_id, booking_date, total_price, status, created_at)
            VALUES (?, ?, ?, ?, 'completed', ?)
        `, [clientId, serviceId, months[6-i], prices[i], months[6-i]]);
    }

    console.log('✅ Sample bookings seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding bookings:', err.message);
    process.exit(1);
  }
}

seedBookings();
