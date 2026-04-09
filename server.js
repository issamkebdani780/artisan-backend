const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');
const { uploadProfilePic, uploadDocuments, uploadCombined, uploadServiceImage } = require('./config/upload');

const app = express();
const PORT = process.env.PORT || 5000;

// Database Schema Check & Migration
(async () => {
    try {
        console.log('Running database schema checks...');
        
        // 1. Check Reviews Table
        const [columns] = await db.query('SHOW COLUMNS FROM reviews');
        const colNames = columns.map(c => c.Field);
        
        if (!colNames.includes('artisan_id')) {
            await db.query('ALTER TABLE reviews ADD COLUMN artisan_id INT AFTER booking_id');
            console.log('Migrated: Added artisan_id to reviews table');
        }
        if (!colNames.includes('client_id')) {
            await db.query('ALTER TABLE reviews ADD COLUMN client_id INT AFTER artisan_id');
            console.log('Migrated: Added client_id to reviews table');
        }

        // 2. Check Disputes Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS disputes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT,
                client_id INT,
                artisan_id INT,
                reason TEXT NOT NULL,
                status ENUM('pending', 'resolved', 'cancelled') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
                FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (artisan_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('Checked/Created disputes table');

        // 3. Add foreign keys if possible (ignore if already exist)
        try {
            await db.query('ALTER TABLE reviews ADD FOREIGN KEY (artisan_id) REFERENCES users(id) ON DELETE CASCADE');
            await db.query('ALTER TABLE reviews ADD FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE');
        } catch (fkErr) { /* Ignore if FK already exists */ }

    } catch (err) {
        console.error('Database migration check error:', err.message);
    }
})();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL
        ? [process.env.FRONTEND_URL]
        : [
            'https://mihnati-pink.vercel.app',
            'https://bericolipro.linguaflo.me',
            'http://bericolipro.linguaflo.me',
            'http://bericolipro.linguaflo.me:5173',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000',
            'http://localhost:5173',
            'http://localhost:3000'
          ],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Security Headers Middleware
app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    next();
});

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('ERROR: JWT_SECRET environment variable is not set!');
    process.exit(1);
}

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

// Input Validation Helper
const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email) && email.length <= 255;
};

const validatePassword = (password) => {
    // Min 8 chars, at least 1 uppercase, 1 lowercase, 1 number
    return password && password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
};

const validateName = (name) => {
    return name && name.trim().length >= 2 && name.trim().length <= 100 && !/[<>\"'`;]/.test(name);
};

// Simple Rate Limiting (in-memory)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes

const checkRateLimit = (email) => {
    const now = Date.now();
    const attempts = loginAttempts.get(email) || [];
    const recentAttempts = attempts.filter(time => now - time < ATTEMPT_WINDOW);
    
    if (recentAttempts.length >= MAX_ATTEMPTS) {
        return false; // Too many attempts
    }
    
    recentAttempts.push(now);
    loginAttempts.set(email, recentAttempts);
    return true;
};

const clearLoginAttempts = (email) => {
    loginAttempts.delete(email);
};

// Helper to initialize admin user
const seedAdmin = async () => {
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE email = "admin@gmail.com"');
        if (rows.length === 0) {
            const password = 'admin123';
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.query(
                'INSERT INTO users (name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
                ['Super Admin', 'admin@gmail.com', hashedPassword, 'admin', 1]
            );
            console.log('✅ Admin user seeded: admin@gmail.com / admin123');
        }
    } catch (err) {
        console.error('Error seeding admin:', err.message);
    }
};

// Helper to initialize categories
const seedCategories = async () => {
    try {
        await seedAdmin();
        try {
            await db.query('ALTER TABLE users MODIFY specialty VARCHAR(1000)');
            console.log('Upgraded users.specialty to VARCHAR(1000)');
        } catch (e) {
            console.debug('Schema already upgraded or not needed');
        }
    } catch (err) {
        console.error('Error seeding categories:', err.message);
    }
};
seedCategories();

// --- AUTH ROUTES ---

// Registration with File Upload (General for Clients & Artisans)
// For artisans: /api/auth/register?role=artisan with profilePic and documents files
// For clients: /api/auth/register with profilePic file (optional)
app.post('/api/auth/register', uploadCombined, (req, res, next) => {
    // Now that the body is parsed by multer, we can access role
    const role = req.body.role || req.query.role || 'client';
    
    if (role === 'artisan') {
        handleArtisanRegistration(req, res);
    } else {
        handleClientRegistration(req, res);
    }
});

// Handler for artisan registration
async function handleArtisanRegistration(req, res) {
    const { name, email, password, specialty, experience_years, phone, address, wilaya_id, commune_id, birthday } = req.body;
    try {
        // Input validation
        if (!validateName(name)) {
            return res.status(400).json({ error: 'Name must be 2-100 characters, no special characters' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Please provide a valid email address' });
        }
        if (!validatePassword(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and number' });
        }
        if (!specialty || specialty.trim().length === 0) {
            return res.status(400).json({ error: 'Specialty is required for artisans' });
        }
        if (phone && !/^\d{7,15}$/.test(phone.replace(/[\s\-\(\)]/g, ''))) {
            return res.status(400).json({ error: 'Phone number is invalid' });
        }

        // Validate file uploads
        const profilePicFiles = req.files && req.files['profilePic'];
        const documentFiles = req.files && req.files['documents'];

        if (!profilePicFiles || profilePicFiles.length === 0) {
            return res.status(400).json({ error: 'Profile picture is required for artisans' });
        }
        if (!documentFiles || documentFiles.length === 0) {
            return res.status(400).json({ error: 'At least one document is required for artisans' });
        }

        // Check if email already exists
        const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Get Cloudinary URLs
        const profilePicUrl = profilePicFiles[0].path; // Cloudinary URL
        const documentsUrls = documentFiles.map(f => f.path).join(','); // Comma-separated URLs

        const [result] = await db.query(
            'INSERT INTO users (name, email, password, role, specialty, experience_years, phone, address, wilaya_id, commune_id, birthday, profile_pic, artisan_documents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, 'artisan', specialty, experience_years || 0, phone, address, wilaya_id, commune_id, birthday, profilePicUrl, documentsUrls]
        );

        res.status(201).json({ 
            message: 'Artisan registered successfully', 
            userId: result.insertId,
            profilePic: profilePicUrl,
            documents: documentsUrls
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// Handler for client registration
async function handleClientRegistration(req, res) {
    const { name, email, password, phone, address, wilaya_id, commune_id, birthday } = req.body;
    try {
        // Input validation
        if (!validateName(name)) {
            return res.status(400).json({ error: 'Name must be 2-100 characters, no special characters' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Please provide a valid email address' });
        }
        if (!validatePassword(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and number' });
        }
        if (phone && !/^\d{7,15}$/.test(phone.replace(/[\s\-\(\)]/g, ''))) {
            return res.status(400).json({ error: 'Phone number is invalid' });
        }

        // Check if email already exists
        const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const profilePicFiles = req.files && req.files['profilePic'];
        const profilePicUrl = profilePicFiles && profilePicFiles.length > 0 ? profilePicFiles[0].path : null;

        const [result] = await db.query(
            'INSERT INTO users (name, email, password, role, phone, address, wilaya_id, commune_id, birthday, profile_pic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, 'client', phone, address, wilaya_id, commune_id, birthday, profilePicUrl]
        );

        res.status(201).json({ 
            message: 'User registered successfully', 
            userId: result.insertId,
            profilePic: profilePicUrl
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    try {
        // Rate limiting check
        if (!checkRateLimit(email)) {
            return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
        }

        const [users] = await db.query('SELECT * FROM users WHERE email = ? AND role = ?', [email, role]);
        if (users.length === 0) return res.status(401).json({ error: 'User not found' });

        const user = users[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ error: 'Invalid credentials' });

        // Clear rate limit on successful login
        clearLoginAttempts(email);

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
                wilaya_id: user.wilaya_id,
                commune_id: user.commune_id,
                profile_pic: user.profile_pic,
                experience_years: user.experience_years
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ARTISAN ROUTES ---

// List Artisans (with optional filters and pagination)
app.get('/api/artisans', async (req, res) => {
    const { specialty, location, category, minRating, maxPrice, availableOnly, limit = 20, offset = 0 } = req.query;
    
    // Validate pagination params
    const pageLimit = Math.min(parseInt(limit) || 20, 100); // Max 100 per page
    const pageOffset = Math.max(parseInt(offset) || 0, 0);

    // Base query using GROUP BY to get the lowest price per artisan (NO EMAIL EXPOSED)
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
        const categoryMap = {
            'Menuiserie et Bois': ['Menuisier', 'Presseur', 'Décorateur bois', 'fenêtres en bois'],
            'Ferronnerie et Soudure': ['Ferronnier', 'Soudeur', 'Chaudronnier'],
            'Plomberie et Réseaux': ['Plombier', 'Monteur de réseaux', 'tuyauterie'],
            'Électricité et Énergie': ['Électricien', 'solaire', 'câbles', 'tableaux électriques'],
            'Peinture et Plâtre': ['Peintre', 'Plâtrier', 'Marbrier', 'Vernisseur'],
            'Maçonnerie et Finitions': ['Maçon', 'Carreleur', 'Crépisseur', 'isolation'],
            'Mécanique et Machines': ['Mécanicien', 'moteurs', 'électrogènes'],
            'Couture et Cuir': ['Tailleur', 'Couturière', 'Rapiéceur', 'Cordonnier', 'Maroquinier'],
            'Verre et Miroiterie': ['verre', 'Verrier', 'Miroitier', 'Vitrier'],
            'Métiers alimentaires artisanaux': ['Boulanger', 'Pâtissier', 'Fromager', 'Apiculteur', 'conserveur'],
            'Jardinage et Espaces Verts': ['Jardinier', 'espaces verts', 'jardins', 'irrigation', 'Élagueur', 'palmiers']
        };

        const keys = categoryMap[category] || [category.substring(0, 5)];
        const likeClauses = keys.map(() => 'u.specialty LIKE ?').join(' OR ');
        query += ` AND (${likeClauses} OR u.specialty LIKE ?)`;
        keys.forEach(k => params.push(`%${k}%`));
        params.push(`%${category}%`);
    }
    if (minRating) {
        query += ' AND u.rating >= ?';
        params.push(parseFloat(minRating));
    }
    if (maxPrice) {
        const limitPrice = parseFloat(maxPrice);
        if (!isNaN(limitPrice)) {
            query += ' AND s.base_price <= ?';
            params.push(limitPrice);
        }
    }

    query += ' GROUP BY u.id ORDER BY u.rating DESC, u.review_count DESC';
    
    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(pageLimit, pageOffset);

    if (availableOnly && (availableOnly === '1' || availableOnly === 'true')) {
        // Availability is simulated as 'Disponible'
    }

    try {
        const [rows] = await db.query(query, params);
        res.json({ data: rows, limit: pageLimit, offset: pageOffset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Public Stats for landing page
app.get('/api/public/stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'client') as clients,
                (SELECT COUNT(*) FROM users WHERE role = 'artisan') as artisans,
                (SELECT COUNT(*) FROM devis) as projects
        `;
        const [rows] = await db.query(query);
        const data = rows[0] || { clients: 0, artisans: 0, projects: 0 };
        
        console.log('✅ Public stats fetched:', data);
        res.json({
            clients: parseInt(data.clients) || 0,
            artisans: parseInt(data.artisans) || 0,
            projects: parseInt(data.projects) || 0
        });
    } catch (err) {
        console.error('❌ Stats API Error:', err.message);
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
        const [rows] = await db.query('SELECT id, name, email, specialty, experience_years, phone, address, is_verified, rating, review_count, profile_pic, artisan_documents, created_at FROM users WHERE id = ? AND role = "artisan"', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Artisan not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Artisan Documents
app.get('/api/artisans/:id/documents', authenticateToken, async (req, res) => {
    try {
        // Check if user is the artisan or admin
        if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
            return res.status(403).json({ error: 'You do not have permission to view these documents' });
        }

        const [rows] = await db.query('SELECT id, name, artisan_documents, profile_pic FROM users WHERE id = ? AND role = "artisan"', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Artisan not found' });

        const artisan = rows[0];
        const documents = artisan.artisan_documents ? artisan.artisan_documents.split(',').filter(d => d.trim()) : [];
        
        res.json({
            id: artisan.id,
            name: artisan.name,
            profilePic: artisan.profile_pic,
            documents: documents
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload Additional Documents for Artisan
app.post('/api/artisans/:id/documents', authenticateToken, (req, res) => {
    // Check if user is the artisan or admin
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'You do not have permission to upload documents' });
    }

    uploadDocuments(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: `Document upload error: ${err.message}` });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'At least one document is required' });
        }

        try {
            const newDocumentUrls = req.files.map(f => f.path).join(',');

            // Get existing documents
            const [rows] = await db.query('SELECT artisan_documents FROM users WHERE id = ? AND role = "artisan"', [req.params.id]);
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Artisan not found' });
            }

            const existingDocs = rows[0].artisan_documents ? rows[0].artisan_documents + ',' : '';
            const allDocuments = existingDocs + newDocumentUrls;

            await db.query('UPDATE users SET artisan_documents = ? WHERE id = ?', [allDocuments, req.params.id]);

            res.json({
                message: 'Documents uploaded successfully',
                documents: allDocuments.split(',').filter(d => d.trim()),
                uploadedCount: req.files.length
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
});

// Update Artisan Profile Picture
app.post('/api/artisans/:id/profile-picture', authenticateToken, (req, res) => {
    // Check if user is the artisan or admin
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
        return res.status(403).json({ error: 'You do not have permission to update this profile' });
    }

    uploadProfilePic(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: `Profile picture upload error: ${err.message}` });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Profile picture is required' });
        }

        try {
            const profilePicUrl = req.file.path;

            await db.query('UPDATE users SET profile_pic = ? WHERE id = ?', [profilePicUrl, req.params.id]);

            res.json({
                message: 'Profile picture updated successfully',
                profilePic: profilePicUrl
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
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

// List wilayas
app.get('/api/wilayas', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM wilaya');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List communes by wilaya
app.get('/api/communes', async (req, res) => {
    const { wilaya_id } = req.query;
    if (!wilaya_id) {
        return res.status(400).json({ error: 'wilaya_id is required' });
    }
    try {
        const [rows] = await db.query('SELECT * FROM commune WHERE wilaya_id = ?', [wilaya_id]);
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
        // Validate booking parameters
        if (!service_id || isNaN(parseInt(service_id))) {
            return res.status(400).json({ error: 'Valid service_id is required' });
        }
        if (!booking_date) {
            return res.status(400).json({ error: 'booking_date is required' });
        }
        const bookingDate = new Date(booking_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (isNaN(bookingDate.getTime())) {
            return res.status(400).json({ error: 'booking_date must be a valid date' });
        }
        if (bookingDate < today) {
            return res.status(400).json({ error: 'La date de rendez-vous ne peut pas être dans le passé' });
        }

        if (!total_price || isNaN(parseFloat(total_price)) || parseFloat(total_price) <= 0) {
            return res.status(400).json({ error: 'total_price must be a positive number' });
        }

        // Verify service exists
        const [serviceCheck] = await db.query('SELECT id FROM services WHERE id = ?', [service_id]);
        if (serviceCheck.length === 0) {
            return res.status(404).json({ error: 'Service not found' });
        }

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

// (Dashboard stats route is defined below near line 1100)

// --- SERVICE MANAGEMENT ---

// Create Service with Image Upload
app.post('/api/services', authenticateToken, uploadServiceImage, async (req, res) => {
    const { category_id, title, description, base_price } = req.body;
    const artisan_id = req.user.id;
    try {
        const imageUrl = req.file ? req.file.path : (req.body.image_url || null);
        
        // Validate service data
        if (!category_id || isNaN(parseInt(category_id))) {
            return res.status(400).json({ error: 'Valid category_id is required' });
        }
        if (!title || title.trim().length < 2 || title.length > 255) {
            return res.status(400).json({ error: 'Title must be between 2-255 characters' });
        }
        if (!description || description.trim().length < 5) {
            return res.status(400).json({ error: 'Description must be at least 5 characters' });
        }
        if (!base_price || isNaN(parseFloat(base_price)) || parseFloat(base_price) <= 0) {
            return res.status(400).json({ error: 'base_price must be a positive number' });
        }

        // Verify category exists
        const [categoryCheck] = await db.query('SELECT id FROM categories WHERE id = ?', [category_id]);
        if (categoryCheck.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const [result] = await db.query(
            'INSERT INTO services (category_id, artisan_id, title, description, base_price, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [category_id, artisan_id, title, description, base_price, imageUrl]
        );
        res.status(201).json({ message: 'Service created', serviceId: result.insertId, image_url: imageUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Service with Optional Image Upload
app.put('/api/services/:id', authenticateToken, uploadServiceImage, async (req, res) => {
    const { category_id, title, description, base_price } = req.body;
    try {
        let imageUrl = req.body.image_url;
        if (req.file) {
            imageUrl = req.file.path;
        }

        await db.query(
            'UPDATE services SET category_id = ?, title = ?, description = ?, base_price = ?, image_url = ? WHERE id = ? AND artisan_id = ?',
            [category_id, title, description, base_price, imageUrl, req.params.id, req.user.id]
        );
        res.json({ message: 'Service updated', image_url: imageUrl });
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
    const { category_id, description, budget, wilaya_id, commune_id, date, artisan_id } = req.body;
    const client_id = req.user.id;
    try {
        // Validate date is not in the past
        if (date) {
            const selectedDate = new Date(date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (selectedDate < today) {
                return res.status(400).json({ error: 'La date d\'intervention ne peut pas être dans le passé' });
            }
        }

        const [result] = await db.query(
            'INSERT INTO devis (client_id, category_id, description, budget, wilaya_id, commune_id, date, artisan_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [client_id, category_id, description, budget, wilaya_id, commune_id, date, artisan_id || null, 'en attente']
        );
        res.status(201).json({ message: 'Devis created', devisId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Devis (Client only)
app.delete('/api/devis/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM devis WHERE id = ? AND client_id = ?', [req.params.id, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Devis not found or unauthorized' });
        await db.query('DELETE FROM devis WHERE id = ?', [req.params.id]);
        res.json({ message: 'Devis deleted' });
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
    const specialty = req.params.specialty.toLowerCase();
    try {
        const query = `
            SELECT d.*, c.name as category_name, u_cli.name as client_name 
            FROM devis d
            JOIN categories c ON d.category_id = c.id
            JOIN users u_cli ON d.client_id = u_cli.id
            WHERE d.status = 'en attente' AND d.artisan_id IS NULL
        `;
        const [rows] = await db.query(query);

        // Filter in JS using categoryMap since specialty can be multiple subcategories
        const categoryMap = {
            'Menuiserie et Bois': ['Menuisier', 'Presseur', 'Décorateur bois', 'fenêtres en bois'],
            'Ferronnerie et Soudure': ['Ferronnier', 'Soudeur', 'Chaudronnier'],
            'Plomberie et Réseaux': ['Plombier', 'Monteur de réseaux', 'tuyauterie'],
            'Électricité et Énergie': ['Électricien', 'solaire', 'câbles', 'tableaux électriques'],
            'Peinture et Plâtre': ['Peintre', 'Plâtrier', 'Marbrier', 'Vernisseur'],
            'Maçonnerie et Finitions': ['Maçon', 'Carreleur', 'Crépisseur', 'isolation'],
            'Mécanique et Machines': ['Mécanicien', 'moteurs', 'électrogènes'],
            'Couture et Cuir': ['Tailleur', 'Couturière', 'Rapiéceur', 'Cordonnier', 'Maroquinier'],
            'Verre et Miroiterie': ['verre', 'Verrier', 'Miroitier', 'Vitrier'],
            'Métiers alimentaires artisanaux': ['Boulanger', 'Pâtissier', 'Fromager', 'Apiculteur', 'conserveur'],
            'Jardinage et Espaces Verts': ['Jardinier', 'espaces verts', 'jardins', 'irrigation', 'Élagueur', 'palmiers']
        };

        const filtered = rows.filter(row => {
            const catName = row.category_name;
            const keys = categoryMap[catName] || [catName.substring(0, 5).toLowerCase()];
            return keys.some(k => specialty.includes(k.toLowerCase())) || specialty.includes(catName.toLowerCase());
        });

        res.json(filtered);
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

// Auto-migrate reviews table to support artisan_id and client_id
(async () => {
    try {
        const [cols] = await db.query("SHOW COLUMNS FROM reviews LIKE 'artisan_id'");
        if (cols.length === 0) {
            await db.query("ALTER TABLE reviews ADD COLUMN artisan_id INT NULL, ADD COLUMN client_id INT NULL, MODIFY COLUMN booking_id INT NULL");
            await db.query("ALTER TABLE reviews ADD FOREIGN KEY (artisan_id) REFERENCES users(id) ON DELETE CASCADE");
            await db.query("ALTER TABLE reviews ADD FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE");
            console.log('Reviews table migrated: added artisan_id and client_id');
        }
    } catch (e) { console.error('Reviews migration error:', e.message); }
})();

// Submit Review
app.post('/api/reviews', authenticateToken, async (req, res) => {
    const { booking_id, artisan_id, rating, comment } = req.body;
    const client_id = req.user.id;
    try {
        // Check if already reviewed
        if (artisan_id) {
            const [existing] = await db.query(
                'SELECT id FROM reviews WHERE client_id = ? AND artisan_id = ?',
                [client_id, artisan_id]
            );
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Vous avez déjà laissé un avis pour cet artisan.' });
            }
        }

        const [result] = await db.query(
            'INSERT INTO reviews (booking_id, artisan_id, client_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
            [booking_id || null, artisan_id || null, client_id, rating, comment]
        );

        // Update artisan's rating and review_count
        if (artisan_id) {
            await db.query(`
                UPDATE users SET
                    review_count = (SELECT COUNT(*) FROM reviews WHERE artisan_id = ?),
                    rating = (SELECT IFNULL(ROUND(AVG(rating), 1), 0) FROM reviews WHERE artisan_id = ?)
                WHERE id = ?
            `, [artisan_id, artisan_id, artisan_id]);
        }

        res.status(201).json({ message: 'Avis soumis avec succès', reviewId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Reviews for an Artisan (public profile)
app.get('/api/reviews/artisan/:artisanId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT r.id, r.rating, r.comment, r.created_at,
                   u.name as client_name, u.profile_pic as client_pic
            FROM reviews r
            JOIN users u ON r.client_id = u.id
            WHERE r.artisan_id = ?
            ORDER BY r.created_at DESC
        `, [req.params.artisanId]);
        res.json(rows);
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

// Get Single User Profile
app.get('/api/users/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, name, email, role, specialty, experience_years, phone, address, wilaya_id, commune_id, birthday, profile_pic FROM users WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update User Profile
app.put('/api/users/:id', authenticateToken, async (req, res) => {
    const { name, email, phone, address, specialty, experience_years, profile_pic, wilaya_id, commune_id } = req.body;
    try {
        // Check permissions
        if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized to update this profile' });
        }

        // Email update handling
        if (email) {
            const [existing] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Email already in use by another account' });
            }
        }

        await db.query(
            'UPDATE users SET name = ?, email = ?, phone = ?, address = ?, specialty = ?, experience_years = ?, profile_pic = ?, wilaya_id = ?, commune_id = ? WHERE id = ?',
            [name, email, phone, address, specialty, experience_years, profile_pic, wilaya_id || null, commune_id || null, req.params.id]
        );
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Update Profile Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete User Account
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    const userId = req.params.id;
    if (parseInt(userId) !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized to delete this account' });
    }
    
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Manual cleanup to ensure no FK constraints block deletion
        // 1. Delete reviews involving this user
        await connection.query('DELETE FROM reviews WHERE client_id = ? OR artisan_id = ?', [userId, userId]);
        
        // 2. Delete bookings
        await connection.query('DELETE FROM bookings WHERE client_id = ?', [userId]);
        // Also delete bookings for this artisan's services
        await connection.query('DELETE FROM bookings WHERE service_id IN (SELECT id FROM services WHERE artisan_id = ?)', [userId]);

        // 3. Delete services
        await connection.query('DELETE FROM services WHERE artisan_id = ?', [userId]);

        // 4. Handle Devis (quotes)
        // If they are the artisan, just unassign them
        await connection.query('UPDATE devis SET artisan_id = NULL WHERE artisan_id = ?', [userId]);
        // If they are the client, delete their requests
        await connection.query('DELETE FROM devis WHERE client_id = ?', [userId]);

        // 5. Finally delete the user
        const [result] = await connection.query('DELETE FROM users WHERE id = ?', [userId]);
        
        if (result.affectedRows === 0) {
            throw new Error('User not found');
        }

        await connection.commit();
        res.json({ message: 'Compte supprimé avec succès' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Delete User Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
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
        const [rows] = await db.query('SELECT id, name, email, specialty, created_at, artisan_documents FROM users WHERE role = "artisan" AND is_verified = 0');
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

// Get Detailed Admin Stats
app.get('/api/admin/detailed-stats', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    try {
        const [artisans] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = "artisan"');
        const [clients] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = "client"');
        const [bookings] = await db.query('SELECT COUNT(*) as count FROM bookings');
        const [revenue] = await db.query('SELECT SUM(total_price) as total FROM bookings WHERE status = "completed"');
        const [pendingDisputes] = await db.query('SELECT COUNT(*) as count FROM disputes WHERE status = "pending"');
        
        // Recent activities (simplified)
        const [recentArtisans] = await db.query('SELECT name, created_at as time, "Nouvel Artisan" as type FROM users WHERE role = "artisan" ORDER BY created_at DESC LIMIT 5');
        const [recentBookings] = await db.query('SELECT "Nouveau Booking" as type, b.created_at as time FROM bookings b LIMIT 5');

        res.json({
            totalArtisans: artisans[0].count,
            totalClients: clients[0].count,
            totalBookings: bookings[0].count,
            totalRevenue: revenue[0].total || 0,
            pendingDisputes: pendingDisputes[0].count,
            recentActivities: [...recentArtisans, ...recentBookings].sort((a,b) => new Date(b.time) - new Date(a.time)).slice(0, 10)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Artisans for Admin
app.get('/api/admin/artisans', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    try {
        const [rows] = await db.query('SELECT id, name, email, specialty, phone, address, is_verified, created_at, rating, artisan_documents FROM users WHERE role = "artisan" ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Clients for Admin
app.get('/api/admin/clients', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    try {
        const [rows] = await db.query('SELECT id, name, email, phone, address, created_at FROM users WHERE role = "client" ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Payments/Bookings
app.get('/api/admin/payments', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    try {
        const [rows] = await db.query(`
            SELECT b.*, u_cli.name as client_name, u_art.name as artisan_name, s.title as service_title
            FROM bookings b
            JOIN users u_cli ON b.client_id = u_cli.id
            JOIN services s ON b.service_id = s.id
            JOIN users u_art ON s.artisan_id = u_art.id
            ORDER BY b.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Disputes
app.get('/api/admin/disputes', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    try {
        const [rows] = await db.query(`
            SELECT d.*, u_cli.name as client_name, u_art.name as artisan_name
            FROM disputes d
            JOIN users u_cli ON d.client_id = u_cli.id
            JOIN users u_art ON d.artisan_id = u_art.id
            ORDER BY d.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Dispute Status
app.put('/api/admin/disputes/:id/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Admin access required');
    const { status } = req.body;
    try {
        await db.query('UPDATE disputes SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ message: 'Statut du litige mis à jour' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ARTISAN DASHBOARD STATS ---
// Get Artisan Dashboard Statistics
app.get('/api/artisans/:id/dashboard-stats', authenticateToken, async (req, res) => {
    const artisanId = req.params.id;
    try {
        // Get artisan's own stats
        const [artisanStats] = await db.query(
            'SELECT rating, review_count, is_verified FROM users WHERE id = ? AND role = "artisan"',
            [artisanId]
        );
        if (artisanStats.length === 0) {
            return res.status(404).json({ error: 'Artisan not found' });
        }

        // Revenue from bookings (via services join — bookings has no direct artisan_id)
        const [bookingRevenue] = await db.query(
            'SELECT SUM(b.total_price) as total FROM bookings b JOIN services s ON b.service_id = s.id WHERE s.artisan_id = ? AND b.status = "completed"',
            [artisanId]
        );
        // Revenue from accepted devis
        const [devisRevenue] = await db.query(
            'SELECT SUM(budget) as total FROM devis WHERE artisan_id = ? AND status = "accepté"',
            [artisanId]
        );

        // Booking counts (via services join)
        const [completedBookings] = await db.query(
            'SELECT COUNT(*) as count FROM bookings b JOIN services s ON b.service_id = s.id WHERE s.artisan_id = ? AND b.status = "completed"',
            [artisanId]
        );
        const [activeBookings] = await db.query(
            'SELECT COUNT(*) as count FROM bookings b JOIN services s ON b.service_id = s.id WHERE s.artisan_id = ? AND b.status IN ("pending", "confirmed")',
            [artisanId]
        );

        // Devis counts
        const [pendingDevis] = await db.query(
            'SELECT COUNT(*) as count FROM devis WHERE artisan_id = ? AND status = "en attente"',
            [artisanId]
        );
        const [totalDevis] = await db.query(
            'SELECT COUNT(*) as count FROM devis WHERE artisan_id = ?',
            [artisanId]
        );

        const totalRevenue = (parseFloat(bookingRevenue[0].total) || 0) + (parseFloat(devisRevenue[0].total) || 0);

        res.json({
            rating: artisanStats[0].rating,
            reviewCount: artisanStats[0].review_count,
            isVerified: artisanStats[0].is_verified,
            completedBookings: completedBookings[0].count,
            activeBookings: activeBookings[0].count,
            pendingDevis: pendingDevis[0].count,
            totalDevis: totalDevis[0].count,
            totalRevenue
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health & Testing
app.get('/', (req, res) => {
    res.send('BricoloPro API Operational');
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal Server Error' 
            : err.message
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
