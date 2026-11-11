type FixtureProduct = { id: string; title: string; category: string; price: number; condition: string; wilaya: string; commune: string; image: string; images: string[]; description: string; delivery: boolean; escrow: boolean; previousPrice?: number; sellerName: string; sellerInitials: string; sellerVerified: boolean; trustTier: number; rating: number; badge?: string; posted: string };
const photo = (id: string, width = 1000) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=84`;

export const sampleProducts: FixtureProduct[] = [
  {
    id: "iphone-15-pro-max-256", title: "iPhone 15 Pro Max · 256 Go", category: "Électronique", price: 218000, previousPrice: 235000,
    condition: "Comme neuf", wilaya: "Alger", commune: "Hydra", image: photo("photo-1592899677977-9c10ca588bbd"),
    images: [photo("photo-1592899677977-9c10ca588bbd"), photo("photo-1511707171634-5f897ff02aa9"), photo("photo-1592750475338-74b7b21085ab")],
    sellerName: "Yacine B.", sellerInitials: "YB", sellerVerified: true, trustTier: 3, rating: 4.9, delivery: true, escrow: true, badge: "Prix en baisse", posted: "Il y a 2 h",
    description: "iPhone 15 Pro Max 256 Go en titane naturel, débloqué tous opérateurs. Batterie à 96%, appareil toujours protégé. Boîte et câble USB-C d'origine inclus. Remise en main propre à Hydra ou livraison suivie dans les 58 wilayas.",
  },
  {
    id: "macbook-air-m2-13", title: "MacBook Air M2 · 13 pouces", category: "Électronique", price: 198000,
    condition: "Très bon état", wilaya: "Oran", commune: "Bir El Djir", image: photo("photo-1517336714731-489689fd1ca8"), images: [photo("photo-1517336714731-489689fd1ca8"), photo("photo-1496181133206-80ce9b88a853")],
    sellerName: "Nesrine A.", sellerInitials: "NA", sellerVerified: true, trustTier: 2, rating: 4.8, delivery: true, escrow: true, posted: "Il y a 5 h",
    description: "MacBook Air M2, puce 8 cœurs, 8 Go de mémoire et SSD 256 Go. Écran impeccable, 42 cycles de batterie. Chargeur MagSafe et housse offerts. Photos réelles, essai possible à Oran.",
  },
  {
    id: "canon-eos-r10-kit", title: "Canon EOS R10 + objectif 18–45", category: "Photo & vidéo", price: 172000,
    condition: "Comme neuf", wilaya: "Constantine", commune: "Centre-ville", image: photo("photo-1516035069371-29a1b244cc32"), images: [photo("photo-1516035069371-29a1b244cc32"), photo("photo-1502920917128-1aa500764cbd")],
    sellerName: "Amine K.", sellerInitials: "AK", sellerVerified: true, trustTier: 2, rating: 5, delivery: true, escrow: true, badge: "Vendeur pro", posted: "Hier",
    description: "Hybride Canon EOS R10 acheté il y a 4 mois. Moins de 1 200 déclenchements. Livré avec objectif RF-S 18–45 mm, batterie, sangle et boîte. Garantie encore valide.",
  },
  {
    id: "samsung-s24-ultra", title: "Samsung Galaxy S24 Ultra · 512 Go", category: "Électronique", price: 246000,
    condition: "Neuf", wilaya: "Blida", commune: "Blida centre", image: photo("photo-1610945265064-0e34e5519bbf"), images: [photo("photo-1610945265064-0e34e5519bbf"), photo("photo-1598327105666-5b89351aff97")],
    sellerName: "Mobile House DZ", sellerInitials: "MH", sellerVerified: true, trustTier: 3, rating: 4.9, delivery: true, escrow: true, badge: "Boutique vérifiée", posted: "Il y a 1 h",
    description: "Galaxy S24 Ultra version internationale, 512 Go, neuf sous scellé. Facture disponible. Paiement sécurisé et expédition assurée depuis Blida. Vérifiez le numéro IMEI avant remise.",
  },
  {
    id: "velo-gravel-triban", title: "Vélo gravel Triban GRVL 520", category: "Sports & loisirs", price: 95000,
    condition: "Très bon état", wilaya: "Tizi Ouzou", commune: "Tizi Ouzou", image: photo("photo-1485965120184-e220f721d03e"), images: [photo("photo-1485965120184-e220f721d03e"), photo("photo-1511994298241-608e28f14fde")],
    sellerName: "Lyes M.", sellerInitials: "LM", sellerVerified: true, trustTier: 1, rating: 4.7, delivery: false, escrow: true, posted: "Il y a 3 h",
    description: "Triban GRVL 520 taille M, cadre aluminium et fourche carbone. Révision complète faite la semaine dernière. Pneus neufs et pédales automatiques incluses. Essai possible à Tizi Ouzou.",
  },
  {
    id: "fauteuil-design", title: "Fauteuil design scandinave", category: "Maison", price: 34000,
    condition: "Bon état", wilaya: "Alger", commune: "Kouba", image: photo("photo-1567538096630-e0c55bd6374c"), images: [photo("photo-1567538096630-e0c55bd6374c"), photo("photo-1503602642458-232111445657")],
    sellerName: "Sarah D.", sellerInitials: "SD", sellerVerified: false, trustTier: 1, rating: 4.6, delivery: true, escrow: false, posted: "Il y a 6 h",
    description: "Fauteuil confortable en tissu bouclé couleur crème, pieds en bois massif. Très bon état, quelques mois d'utilisation. À récupérer à Kouba, livraison possible dans Alger.",
  },
  {
    id: "toyota-yaris-2021", title: "Toyota Yaris 2021 · 1.0 VVT-i", category: "Véhicules", price: 2850000,
    condition: "Très bon état", wilaya: "Sétif", commune: "Sétif", image: photo("photo-1621007947382-bb3c3994e3fb"), images: [photo("photo-1621007947382-bb3c3994e3fb"), photo("photo-1618843479313-40f8afb4b4d8")],
    sellerName: "Karim Auto", sellerInitials: "KA", sellerVerified: true, trustTier: 3, rating: 4.9, delivery: false, escrow: true, badge: "Historique contrôlé", posted: "Hier",
    description: "Toyota Yaris 2021 essence, 48 000 km certifiés avec carnet d'entretien. Première main, peinture d'origine. Contrôle technique valide. Dossier véhicule disponible après prise de contact.",
  },
  {
    id: "sony-wh1000xm5", title: "Casque Sony WH-1000XM5", category: "Électronique", price: 52000,
    condition: "Comme neuf", wilaya: "Béjaïa", commune: "Béjaïa", image: photo("photo-1546435770-a3e426bf472b"), images: [photo("photo-1546435770-a3e426bf472b"), photo("photo-1505740420928-5e560c06d30e")],
    sellerName: "Meriem O.", sellerInitials: "MO", sellerVerified: true, trustTier: 2, rating: 4.8, delivery: true, escrow: true, posted: "Il y a 4 h",
    description: "Casque Sony WH-1000XM5 en excellent état, réduction de bruit active, autonomie jusqu'à 30 h. Étui de transport, câble USB-C et facture inclus. Envoi sécurisé disponible.",
  },
];

