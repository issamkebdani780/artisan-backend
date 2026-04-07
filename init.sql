-- Commented out for Railway compatibility:
-- DROP DATABASE IF EXISTS bericoli;
-- CREATE DATABASE bericoli;
-- USE bericoli;

SET FOREIGN_KEY_CHECKS = 0;

-- Users Table (Clients, Artisans, Admins)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('client', 'artisan', 'admin') DEFAULT 'client',
    profile_pic VARCHAR(255),
    artisan_documents VARCHAR(2000),
    phone VARCHAR(20),
    address VARCHAR(255),
    wilaya_id INT,
    commune_id INT,
    birthday DATE,
    experience_years INT DEFAULT 0,
    specialty TEXT,
    rating DECIMAL(2,1) DEFAULT 0,
    review_count INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wilaya_id) REFERENCES wilaya(id) ON DELETE SET NULL,
    FOREIGN KEY (commune_id) REFERENCES commune(id) ON DELETE SET NULL
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

-- Devis Table (Quotes)
CREATE TABLE IF NOT EXISTS devis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT,
    category_id INT,
    artisan_id INT DEFAULT NULL,
    description TEXT NOT NULL,
    budget DECIMAL(10,2),
    wilaya_id INT,
    commune_id INT,
    date DATE,
    status ENUM('en attente', 'accepté', 'terminé', 'annulé') DEFAULT 'en attente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (artisan_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (wilaya_id) REFERENCES wilaya(id) ON DELETE SET NULL,
    FOREIGN KEY (commune_id) REFERENCES commune(id) ON DELETE SET NULL
);

-- Wilaya Table
CREATE TABLE IF NOT EXISTS wilaya (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);



-- Insert sample wilayas (Algerian provinces)
INSERT INTO wilaya (id, name) VALUES
(1, 'Adrar'),
(2, 'Chlef'),
(3, 'Laghouat'),
(4, 'Oum El Bouaghi'),
(5, 'Batna'),
(6, 'Béjaïa'),
(7, 'Biskra'),
(8, 'Béchar'),
(9, 'Blida'),
(10, 'Bouira'),
(11, 'Tamanrasset'),
(12, 'Tébessa'),
(13, 'Tlemcen'),
(14, 'Tiaret'),
(15, 'Tizi Ouzou'),
(16, 'Alger'),
(17, 'Djelfa'),
(18, 'Jijel'),
(19, 'Sétif'),
(20, 'Saïda'),
(21, 'Skikda'),
(22, 'Sidi Bel Abbès'),
(23, 'Annaba'),
(24, 'Guelma'),
(25, 'Constantine'),
(26, 'Médéa'),
(27, 'Mostaganem'),
(28, 'M\'Sila'),
(29, 'Mascara'),
(30, 'Ouargla'),
(31, 'Oran'),
(32, 'El Bayadh'),
(33, 'Illizi'),
(34, 'Bordj Bou Arréridj'),
(35, 'Boumerdès'),
(36, 'El Tarf'),
(37, 'Tindouf'),
(38, 'Tissemsilt'),
(39, 'El Oued'),
(40, 'Khenchela'),
(41, 'Souk Ahras'),
(42, 'Tipaza'),
(43, 'Mila'),
(44, 'Aïn Defla'),
(45, 'Naâma'),
(46, 'Aïn Témouchent'),
(47, 'Ghardaïa'),
(48, 'Relizane');

-- Commune Table
CREATE TABLE IF NOT EXISTS commune (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    wilaya_id INT NOT NULL,
    FOREIGN KEY (wilaya_id) REFERENCES wilaya(id)
);

-- Insert sample communes for some wilayas
INSERT INTO commune (name, wilaya_id) VALUES
-- Alger (16)
('Alger Centre', 16),
('Bab El Oued', 16),
('Bologhine', 16),
('Casbah', 16),
('El Madania', 16),
-- Oran (31)
('Oran', 31),
('Bir El Djir', 31),
('Es Senia', 31),
('Arzew', 31),
-- Constantine (25)
('Constantine', 25),
('Hamma Bouziane', 25),
('Didouche Mourad', 25),
-- Annaba (23)
('Annaba', 23),
('El Hadjar', 23),
('Berrahal', 23);

-- Commune Table
CREATE TABLE IF NOT EXISTS commune (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    wilaya_id INT NOT NULL,
    FOREIGN KEY (wilaya_id) REFERENCES wilaya(id)
);

SET FOREIGN_KEY_CHECKS = 1;