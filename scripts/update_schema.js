const db = require('../config/db');

const subcategories = [
    {
        category: 'Menuiserie et Bois',
        items: [
            'Menuisier ébéniste',
            'Menuisier de chantier (coffreur)',
            'Presseur de bois',
            'Décorateur bois intérieur',
            'Fabricant de portes et fenêtres en bois'
        ]
    },
    {
        category: 'Ferronnerie et Soudure',
        items: [
            'Ferronnier d’art',
            'Soudeur (arc et argon)',
            'Ferronnier métallier (portails et grilles)',
            'Chaudronnier industriel',
            'Soudeur carrosserie auto'
        ]
    },
    {
        category: 'Plomberie et Réseaux',
        items: [
            'Plombier sanitaire',
            'Plombier chauffage central',
            'Monteur de réseaux de gaz',
            'Installateur tuyauterie cuivre et PER',
            'Plombier maintenance eau'
        ]
    },
    {
        category: 'Électricité et Énergie',
        items: [
            'Électricien bâtiment',
            'Électricien industriel',
            'Technicien solaire photovoltaïque',
            'Tireur de câbles et filerie',
            'Réparateur tableaux électriques'
        ]
    },
    {
        category: 'Peinture et Plâtre',
        items: [
            'Peintre décorateur',
            'Peintre automobile',
            'Plâtrier staffeur',
            'Marbrier (ponçage et lustrage)',
            'Vernisseur sur bois'
        ]
    },
    {
        category: 'Maçonnerie et Finitions',
        items: [
            'Maçon (brique et ciment)',
            'Carreleur (faïence et marbre)',
            'Crépisseur (enduits traditionnels)',
            'Technicien isolation thermique et étanchéité',
            'Maçon rénovation'
        ]
    },
    {
        category: 'Mécanique et Machines',
        items: [
            'Mécanicien automobile',
            'Mécanicien moto',
            'Technicien moteurs électriques',
            'Réparateur groupes électrogènes et pompes',
            'Mécanicien agricole'
        ]
    },
    {
        category: 'Couture et Cuir',
        items: [
            'Tailleur homme',
            'Couturière sur mesure (femme)',
            'Rapiéceur retouche',
            'Cordonnier (chaussures cuir)',
            'Maroquinier (sellerie et petite maroquinerie)'
        ]
    },
    {
        category: 'Verre et Miroiterie',
        items: [
            'Menuisier aluminium et verre',
            'Verrier (coupe verre trempé)',
            'Miroitier (pose miroirs et décor verre)',
            'Vitrier automobile',
            'Souffleur de verre artisanal'
        ]
    },
    {
        category: 'Métiers Alimentaires Artisanaux',
        items: [
            'Boulanger traditionnel',
            'Pâtissier (oriental et viennoiserie)',
            'Fromager artisanal',
            'Apiculteur (miel et dérivés)',
            'Artisan conserveur (pickles et bocaux)'
        ]
    },
    {
        category: 'Jardinage et Espaces Verts',
        items: [
            'Jardinier paysagiste',
            'Ouvrier en aménagement des espaces verts',
            'Technicien en entretien des jardins',
            'Technicien en irrigation goutte-à-goutte et arrosage',
            'Élagueur et tailleur d’arbres et palmiers'
        ]
    }
];

async function run() {
    try {
        console.log('--- Starting Database Migration ---');

        // 1. Create Subcategories table
        await db.query(`
            CREATE TABLE IF NOT EXISTS subcategories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                image_url VARCHAR(255),
                icon VARCHAR(50),
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Table subcategories ready');

        // 2. Add subcategory_id to services if it doesn't exist
        const [columns] = await db.query('SHOW COLUMNS FROM services');
        if (!columns.some(c => c.Field === 'subcategory_id')) {
            await db.query('ALTER TABLE services ADD COLUMN subcategory_id INT AFTER category_id');
            await db.query('ALTER TABLE services ADD FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL');
            console.log('✅ Added subcategory_id to services');
        }

        // 3. Clear and Populate Categories & Subcategories
        // Note: For simplicity, we'll ensure categories exist first
        for (const cat of subcategories) {
            // Check if category exists
            let [catRows] = await db.query('SELECT id FROM categories WHERE name = ?', [cat.category]);
            let catId;
            if (catRows.length === 0) {
                const [ins] = await db.query('INSERT INTO categories (name) VALUES (?)', [cat.category]);
                catId = ins.insertId;
                console.log(`+ Created Category: ${cat.category}`);
            } else {
                catId = catRows[0].id;
            }

            // Insert subcategories
            for (const sub of cat.items) {
                let [subRows] = await db.query('SELECT id FROM subcategories WHERE name = ? AND category_id = ?', [sub, catId]);
                if (subRows.length === 0) {
                    await db.query('INSERT INTO subcategories (category_id, name) VALUES (?, ?)', [catId, sub]);
                    console.log(`  + Created Subcategory: ${sub}`);
                }
            }
        }

        console.log('--- Migration Completed Successfully ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration Error:', err);
        process.exit(1);
    }
}

run();
