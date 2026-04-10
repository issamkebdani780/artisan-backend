const db = require('../config/db');

const subcategoryData = [
    // Menuiserie et Bois
    { name: 'Menuisier ébéniste', img: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Menuisier de chantier (coffreur)', img: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Presseur de bois', img: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Décorateur bois intérieur', img: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Fabricant de portes et fenêtres en bois', img: 'https://images.unsplash.com/photo-1506332033947-4b77509049b9?auto=format&fit=crop&q=80&w=1000' },

    // Ferronnerie et Soudure
    { name: 'Ferronnier d’art', img: 'https://images.unsplash.com/photo-1534353436294-0dbd4bdac845?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Soudeur (arc et argon)', img: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Ferronnier métallier (portails et grilles)', img: 'https://images.unsplash.com/photo-1544724569-5f546fa66275?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Chaudronnier industriel', img: 'https://images.unsplash.com/photo-1513258496099-48168024adb0?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Soudeur carrosserie auto', img: 'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&q=80&w=1000' },

    // Plomberie et Réseaux
    { name: 'Plombier sanitaire', img: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Plombier chauffage central', img: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Monteur de réseaux de gaz', img: 'https://images.unsplash.com/photo-1542013936693-884638332954?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Installateur tuyauterie cuivre et PER', img: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Plombier maintenance e', img: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=1000' },

    // Électricité et Énergie
    { name: 'Électricien bâtiment', img: 'https://images.unsplash.com/photo-1621905235213-91b79f291350?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Électricien industriel', img: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Installateur panneaux solaires', img: 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Monteur de réseaux de câbles', img: 'https://images.unsplash.com/photo-1544724569-5f546fa66275?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Installateur tableaux électriques', img: 'https://images.unsplash.com/photo-1590959651373-a3db0f38a961?auto=format&fit=crop&q=80&w=1000' },

    // Peinture et Plâtre
    { name: 'Peintre décorateur', img: 'https://images.unsplash.com/photo-1562259946-08c54386fc9c?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Peintre automobile', img: 'https://images.unsplash.com/photo-1590615365410-d4194c03a031?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Plâtrier staffeur', img: 'https://images.unsplash.com/photo-1513519245088-0e12902e35ca?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Marbrier (ponçage et lustrage)', img: 'https://images.unsplash.com/photo-1516455590571-18256e5bb9ff?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Vernisseur sur bois', img: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=1000' },

    // Maçonnerie et Finitions
    { name: 'Maçon polyvalent', img: 'https://images.unsplash.com/photo-1590086782792-42dd2350140d?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Carreleur', img: 'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Crépisseur', img: 'https://images.unsplash.com/photo-1541888941259-7927ad147abc?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Installateur isolation thermique', img: 'https://images.unsplash.com/photo-1521207418485-99c705420385?auto=format&fit=crop&q=80&w=1000' },
    { name: 'Ouvrier étanchéité (bitume et résine)', img: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80&w=1000' },
];

async function run() {
    console.log('--- Starting Subcategory Image Update ---');
    for (const item of subcategoryData) {
        try {
            await db.query(
                'UPDATE subcategories SET image_url = ?, description = ? WHERE name = ?',
                [item.img, `Expert professionnel en ${item.name}. Nous garantissons un travail de haute qualité, durable et conforme aux normes en vigueur.`, item.name]
            );
            console.log(`✅ Updated: ${item.name}`);
        } catch (err) {
            console.error(`❌ Error updating ${item.name}:`, err.message);
        }
    }
    console.log('--- Finished ---');
    process.exit(0);
}

run();
