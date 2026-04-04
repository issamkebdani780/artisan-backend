-- Create Database
DROP DATABASE IF EXISTS bericoli;
CREATE DATABASE bericoli;
USE bericoli;

-- Users Table (Clients, Artisans, Admins)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('client', 'artisan', 'admin') DEFAULT 'client',
    profile_pic VARCHAR(255),
    phone VARCHAR(20),
    address VARCHAR(255),
    birthday DATE,
    experience_years INT DEFAULT 0,
    specialty VARCHAR(100),
    rating DECIMAL(2,1) DEFAULT 0,
    review_count INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(50),
    description TEXT
);

-- Services Table
CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT,
    artisan_id INT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    base_price DECIMAL(10,2),
    rating DECIMAL(2,1) DEFAULT 0,
    review_count INT DEFAULT 0,
    image_url VARCHAR(255),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (artisan_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT,
    service_id INT,
    booking_date DATETIME NOT NULL,
    status ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'pending',
    total_price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- Sample Data
INSERT INTO categories (name, icon, description) VALUES 
('Plomberie', 'plumbing', 'Réparation, installation et entretien de tuyauterie.'),
('Électricité', 'electrical_services', 'Installations électriques et dépannage.'),
('Peinture', 'format_paint', 'Peinture intérieure et extérieure.'),
('Jardinage', 'yard', 'Entretien de jardins et espaces verts.'),
('Menuiserie', 'carpenter', 'Travaux de bois et ameublement.');

INSERT INTO users (name, email, password, role, is_verified, specialty, experience_years, phone, address, rating, review_count) VALUES 
('Ahmed Mansouri', 'ahmed@example.com', 'hashed_password', 'artisan', 1, 'Plombier Expert', 8, '0550123456', 'Alger', 4.8, 12),
('Sarah Bensaid', 'sarah@example.com', 'hashed_password', 'artisan', 1, 'Électricienne Certifiée', 5, '0550987654', 'Lyon', 4.9, 8),
('Thomas Martin', 'thomas@example.com', 'hashed_password', 'artisan', 1, 'Plombier Expert', 12, '0550111222', 'Paris', 4.7, 45),
('Jean Bernard', 'jean@example.com', 'hashed_password', 'artisan', 0, 'Jardinier', 3, '0550333444', 'Bordeaux', 3.5, 2);

INSERT INTO services (category_id, artisan_id, title, description, base_price, rating, review_count, image_url) VALUES 
(1, 1, 'Réparation de Fuite d''eau', 'Intervention rapide pour tout type de fuite.', 45.00, 4.8, 12, 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&q=80&w=800'),
(2, 2, 'Installation Tableau Électrique', 'Mise aux normes complète de votre installation.', 120.00, 4.9, 8, 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=800'),
(1, 3, 'Installation Sanitaire Premium', 'Installation haut de gamme pour cuisines et bains.', 250.00, 5.0, 45, 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&q=80&w=800');
