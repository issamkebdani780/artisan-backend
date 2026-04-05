const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'bricolopro_secret_key';

// Middleware to authenticate JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// Helper to initialize categories
const seedCategories = async () => {
    try {
        const [rows] = await db.query('SELECT COUNT(*) as count FROM categories');
        if (rows[0].count === 0) {
            const categories = [
                'Plomberie', 'Électricité', 'Peinture', 'Menuiserie', 
                'Chauffage', 'Climatisation', 'Maçonnerie', 'Nettoyage'
            ];
            for (const cat of categories) {
                await db.query('INSERT INTO categories (name) VALUES (?)', [cat]);
            }
            console.log('Categories seeded successfully');
        }
    } catch (err) {
        console.error('Error seeding categories:', err);
    }
};
seedCategories();

// --- AUTH ROUTES ---

// Registration (General for Clients & Artisans)
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role, specialty, experience_years, phone, address, birthday } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (name, email, password, role, specialty, experience_years, phone, address, birthday) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, role || 'client', specialty, experience_years, phone, address, birthday]
        );
        res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ? AND role = ?', [email, role]);
        if (users.length === 0) return res.status(401).json({ error: 'User not found' });
        
        const user = users[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

        res.json({ 
            message: 'Login successful', 
            token, 
            user: { 
                id: user.id, 
                name: user.name, 
                role: user.role,
                email: user.email,
                specialty: user.specialty,
                phone: user.phone,
                address: user.address,
                profile_pic: user.profile_pic,
                experience_years: user.experience_years
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ARTISAN ROUTES ---

// List Artisans (with optional filters)
app.get('/api/artisans', async (req, res) => {
    const { specialty, location, category, minRating, maxPrice, availableOnly } = req.query;
    
    // Base query using GROUP BY to get the lowest price per artisan
    let query = `
        SELECT u.id, u.name, u.specialty as role, u.rating, u.review_count as reviews, 
        u.address as location, u.is_verified as isVerified, u.profile_pic as image,
        MIN(s.base_price) as price, 'Disponible' as availability
        FROM users u
        LEFT JOIN services s ON u.id = s.artisan_id
        WHERE u.role = "artisan"
    `;
    const params = [];

    if (specialty) { 
        query += ' AND (u.specialty LIKE ? OR u.name LIKE ?)'; 
        params.push(`%${specialty}%`, `%${specialty}%`); 
    }
    if (location) { 
        query += ' AND u.address LIKE ?'; 
        params.push(`%${location}%`); 
    }
    if (category) { 
        // More flexible matching for categories
        const root = category.substring(0, 5); 
        query += ' AND (u.specialty LIKE ? OR u.specialty LIKE ?)'; 
        params.push(`%${category}%`, `%${root}%`); 
    }
    if (minRating) { 
        query += ' AND u.rating >= ?'; 
        params.push(parseFloat(minRating)); 
    }
    if (maxPrice) {
        const limit = parseFloat(maxPrice);
        if (limit < 1000) { 
            query += ' AND s.base_price <= ?';
            params.push(limit);
        }
    }

    query += ' GROUP BY u.id';

    if (availableOnly && (availableOnly === '1' || availableOnly === 'true')) {
        // Just as a placeholder, availability is simulated as 'Disponible'
    }

    try {
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Featured Artisans
app.get('/api/artisans/featured', async (req, res) => {
    try {
        const query = 'SELECT id, name, specialty as role, rating, review_count as reviews, address as location, is_verified as isVerified, profile_pic as image FROM users WHERE role = "artisan" AND is_verified = 1 LIMIT 4';
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Single Artisan Details
app.get('/api/artisans/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, name, email, specialty, experience_years, phone, address, is_verified, rating, review_count, profile_pic, created_at FROM users WHERE id = ? AND role = "artisan"', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Artisan not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SERVICE ROUTES ---
// Get Services by Artisan
app.get('/api/services/artisan/:id', async (req, res) => {
    const artisanId = req.params.id;
    console.log(`Fetching services for artisan ID: ${artisanId}`);
    try {
        const [rows] = await db.query('SELECT s.*, c.name as category_name FROM services s LEFT JOIN categories c ON s.category_id = c.id WHERE s.artisan_id = ?', [artisanId]);
        console.log(`Found ${rows.length} services`);
        res.json(rows);
    } catch (err) {
        console.error('Error in getArtisanServices:', err);
        res.status(500).json({ error: err.message });
    }
});


// List all services with category info
app.get('/api/services', async (req, res) => {
    try {
        const query = `
            SELECT s.*, c.name as category_name 
            FROM services s 
            JOIN categories c ON s.category_id = c.id
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single service by ID
app.get('/api/services/:id', async (req, res) => {
    try {
        const query = `
            SELECT s.*, c.name as category_name, u.name as artisan_name, u.phone as artisan_phone, u.rating as artisan_rating
            FROM services s 
            JOIN categories c ON s.category_id = c.id
            JOIN users u ON s.artisan_id = u.id
            WHERE s.id = ?
        `;
        const [rows] = await db.query(query, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Service not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List categories
app.get('/api/categories', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM categories');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- BOOKING ROUTES ---

// Create Booking
app.post('/api/bookings', authenticateToken, async (req, res) => {
    const { service_id, booking_date, total_price } = req.body;
    const client_id = req.user.id;
    try {
        const [result] = await db.query(
            'INSERT INTO bookings (client_id, service_id, booking_date, total_price, status) VALUES (?, ?, ?, ?, "pending")',
            [client_id, service_id, booking_date, total_price]
        );
        res.status(201).json({ message: 'Booking created', bookingId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get User Bookings
app.get('/api/bookings/user/:id', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT b.*, s.title as service_title, u.name as artisan_name 
            FROM bookings b
            JOIN services s ON b.service_id = s.id
            JOIN users u ON s.artisan_id = u.id
            WHERE b.client_id = ?
            ORDER BY b.booking_date DESC
        `;
        const [rows] = await db.query(query, [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Artisan Bookings
app.get('/api/bookings/artisan/:id', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT b.*, s.title as service_title, u.name as client_name, u.phone as client_phone
            FROM bookings b
            JOIN services s ON b.service_id = s.id
            JOIN users u ON b.client_id = u.id
            WHERE s.artisan_id = ?
            ORDER BY b.booking_date DESC
        `;
        const [rows] = await db.query(query, [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Booking Status
app.put('/api/bookings/:id/status', authenticateToken, async (req, res) => {
    const { status } = req.body;
    try {
        await db.query('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ message: 'Booking status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Artisan Dashboard Stats
app.get('/api/artisans/:id/dashboard-stats', authenticateToken, async (req, res) => {
    const id = req.params.id;
    try {
        const [bookingRevenue] = await db.query('SELECT SUM(total_price) as total FROM bookings b JOIN services s ON b.service_id = s.id WHERE s.artisan_id = ? AND b.status = "completed"', [id]);
        const [devisRevenue] = await db.query('SELECT SUM(budget) as total FROM devis WHERE artisan_id = ? AND status = "accepté"', [id]);
        
        const [totalBookings] = await db.query('SELECT COUNT(*) as count FROM bookings b JOIN services s ON b.service_id = s.id WHERE s.artisan_id = ?', [id]);
        const [totalDevis] = await db.query('SELECT COUNT(*) as count FROM devis WHERE artisan_id = ?', [id]);
        
        const [activeBookings] = await db.query('SELECT COUNT(*) as count FROM bookings b JOIN services s ON b.service_id = s.id WHERE s.artisan_id = ? AND b.status IN ("pending", "confirmed")', [id]);
        const [activeDevis] = await db.query('SELECT COUNT(*) as count FROM devis WHERE artisan_id = ? AND status IN ("en attente", "accepté")', [id]);
        
        const [userData] = await db.query('SELECT rating, review_count FROM users WHERE id = ?', [id]);
        
        res.json({
            revenue: (parseFloat(bookingRevenue[0].total) || 0) + (parseFloat(devisRevenue[0].total) || 0),
            totalProjects: totalBookings[0].count + totalDevis[0].count,
            activeProjects: activeBookings[0].count + activeDevis[0].count,
            rating: userData[0]?.rating || 0,
            reviews: userData[0]?.review_count || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SERVICE MANAGEMENT ---

// Create Service
app.post('/api/services', authenticateToken, async (req, res) => {
    const { category_id, title, description, base_price, image_url } = req.body;
    const artisan_id = req.user.id;
    try {
        const [result] = await db.query(
            'INSERT INTO services (category_id, artisan_id, title, description, base_price, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [category_id, artisan_id, title, description, base_price, image_url]
        );
        res.status(201).json({ message: 'Service created', serviceId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Service
app.put('/api/services/:id', authenticateToken, async (req, res) => {
    const { category_id, title, description, base_price, image_url } = req.body;
    try {
        await db.query(
            'UPDATE services SET category_id = ?, title = ?, description = ?, base_price = ?, image_url = ? WHERE id = ? AND artisan_id = ?',
            [category_id, title, description, base_price, image_url, req.params.id, req.user.id]
        );
        res.json({ message: 'Service updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Service
app.delete('/api/services/:id', authenticateToken, async (req, res) => {
    try {
        await db.query('DELETE FROM services WHERE id = ? AND artisan_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Service deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DEVIS ROUTES ---

// Create Devis
app.post('/api/devis', authenticateToken, async (req, res) => {
    const { category_id, description, budget, date, artisan_id } = req.body;
    const client_id = req.user.id;
    try {
        const [result] = await db.query(
            'INSERT INTO devis (client_id, category_id, description, budget, date, artisan_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [client_id, category_id, description, budget, date, artisan_id || null, 'en attente']
        );
        res.status(201).json({ message: 'Devis created', devisId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get User Devis (Client or Artisan)
app.get('/api/devis/user/:id', authenticateToken, async (req, res) => {
    const userId = req.params.id;
    try {
        // Query for client or assigned artisan
        const query = `
            SELECT d.*, c.name as category_name, u_art.name as artisan_name, u_cli.name as client_name
            FROM devis d
            JOIN categories c ON d.category_id = c.id
            JOIN users u_cli ON d.client_id = u_cli.id
            LEFT JOIN users u_art ON d.artisan_id = u_art.id
            WHERE d.client_id = ? OR d.artisan_id = ?
            ORDER BY d.created_at DESC
        `;
        const [rows] = await db.query(query, [userId, userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Pending Devis for Artisans in their category
app.get('/api/devis/pending/:specialty', authenticateToken, async (req, res) => {
    const specialty = req.params.specialty;
    try {
        const query = `
            SELECT d.*, c.name as category_name, u_cli.name as client_name 
            FROM devis d
            JOIN categories c ON d.category_id = c.id
            JOIN users u_cli ON d.client_id = u_cli.id
            WHERE d.status = 'en attente' AND d.artisan_id IS NULL
            AND (
                LOWER(c.name) LIKE LOWER(?) 
                OR LOWER(?) LIKE CONCAT('%', LOWER(c.name), '%')
                OR LOWER(c.name) LIKE CONCAT('%', LOWER(?), '%')
                OR LEFT(LOWER(c.name), 4) = LEFT(LOWER(?), 4)
            )
        `;
        const [rows] = await db.query(query, [`%${specialty}%`, specialty, specialty, specialty]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Accept Devis (Artisan Action)
app.put('/api/devis/:id/accept', authenticateToken, async (req, res) => {
    const devisId = req.params.id;
    const artisanId = req.user.id;
    try {
        await db.query(
            'UPDATE devis SET artisan_id = ?, status = "accepté" WHERE id = ? AND artisan_id IS NULL',
            [artisanId, devisId]
        );
        res.json({ message: 'Devis accepted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Devis Status
app.put('/api/devis/:id/status', authenticateToken, async (req, res) => {
    const { status } = req.body;
    try {
        await db.query('UPDATE devis SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ message: 'Devis status updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Artisan Assigned Devis
app.get('/api/devis/artisan/:artisanId', authenticateToken, async (req, res) => {
    const artisanId = req.params.artisanId;
    try {
        const query = `
            SELECT d.*, u.name as client_name, c.name as category_name
            FROM devis d
            JOIN users u ON d.client_id = u.id
            JOIN categories c ON d.category_id = c.id
            WHERE d.artisan_id = ?
            ORDER BY d.created_at DESC
        `;
        const [rows] = await db.query(query, [artisanId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- REVIEW ROUTES ---

// Submit Review
app.post('/api/reviews', authenticateToken, async (req, res) => {
    const { booking_id, rating, comment } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO reviews (booking_id, rating, comment) VALUES (?, ?, ?)',
            [booking_id, rating, comment]
        );
        res.status(201).json({ message: 'Review submitted', reviewId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Reviews for a Service
app.get('/api/reviews/service/:id', async (req, res) => {
    try {
        const query = `
            SELECT r.*, u.name as client_name, u.profile_pic as client_pic
            FROM reviews r
            JOIN bookings b ON r.booking_id = b.id
            JOIN users u ON b.client_id = u.id
            WHERE b.service_id = ?
            ORDER BY r.created_at DESC
        `;
        const [rows] = await db.query(query, [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PROFILE ROUTES ---

// Update Profile
app.put('/api/users/:id', authenticateToken, async (req, res) => {
    const { name, phone, address, specialty, experience_years, profile_pic } = req.body;
    try {
        await db.query(
            'UPDATE users SET name = ?, phone = ?, address = ?, specialty = ?, experience_years = ?, profile_pic = ? WHERE id = ?',
            [name, phone, address, specialty, experience_years, profile_pic, req.params.id]
        );
        res.json({ message: 'Profile updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Change Password
app.put('/api/users/:id/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.params.id;

    console.log(`Password change attempt for user ${userId} by ${req.user.id}`);

    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const [users] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = users[0];
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        console.log(`Password match result: ${isMatch}`);
        
        if (!isMatch) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId]);

        res.json({ message: 'Mot de passe mis à jour avec succès' });
    } catch (err) {
        console.error('Password change error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN ROUTES ---

// Platform Statistics
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    try {
        const [artisanCount] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = "artisan"');
        const [clientCount] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = "client"');
        const [bookingCount] = await db.query('SELECT COUNT(*) as count FROM bookings');
        const [revenue] = await db.query('SELECT SUM(total_price) as total FROM bookings WHERE status = "completed"');
        
        res.json({
            artisans: artisanCount[0].count,
            clients: clientCount[0].count,
            bookings: bookingCount[0].count,
            totalRevenue: revenue[0].total || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Unverified Artisans
app.get('/api/admin/artisans/unverified', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    try {
        const [rows] = await db.query('SELECT id, name, email, specialty, created_at FROM users WHERE role = "artisan" AND is_verified = 0');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify Artisan
app.put('/api/admin/artisans/:id/verify', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    try {
        await db.query('UPDATE users SET is_verified = 1 WHERE id = ? AND role = "artisan"', [req.params.id]);
        res.json({ message: 'Artisan verified successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health & Testing
app.get('/', (req, res) => {
    res.send('BricoloPro API Operational');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
