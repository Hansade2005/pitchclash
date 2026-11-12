import { REAL_SQUADS } from './real_squads.js';
import { REAL_KITS } from './real_kits.js';
import { REAL_POS } from './real_positions.js';
// Pitch Clash — team data: national teams, real club names, formations,
// and deterministic squad generation.
//
// Club and league names are real; kits are stylised. Player names are real-style
// names drawn from common regional pools. National teams use real country names.

// ============================================================ seeded PRNG
/** mulberry32 — tiny, fast, good-enough seeded PRNG. Returns () => [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash → uint32. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Approximate normal via sum of uniforms. */
function gauss(rng, mean = 0, sd = 1) {
  return mean + sd * ((rng() + rng() + rng() + rng() + rng() + rng()) - 3) / 0.7071;
}
function weightedPick(rng, entries) { // entries: [[value, weight], ...]
  let total = 0;
  for (const e of entries) total += e[1];
  let r = rng() * total;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e; }
  return entries[entries.length - 1];
}

// ============================================================ formations
// Normalised coordinates for a team attacking toward +x.
// x: -1 own goal line .. +1 opponent goal line; y: -1 left touchline .. +1 right.
const GK = { pos: 'GK', x: -0.95, y: 0 };
export const formations = {
  '4-4-2': [
    GK,
    { pos: 'LB', x: -0.62, y: -0.72 }, { pos: 'CB', x: -0.68, y: -0.25 },
    { pos: 'CB', x: -0.68, y: 0.25 }, { pos: 'RB', x: -0.62, y: 0.72 },
    { pos: 'LM', x: -0.18, y: -0.72 }, { pos: 'CM', x: -0.24, y: -0.22 },
    { pos: 'CM', x: -0.24, y: 0.22 }, { pos: 'RM', x: -0.18, y: 0.72 },
    { pos: 'ST', x: 0.22, y: -0.2 }, { pos: 'ST', x: 0.22, y: 0.2 },
  ],
  '4-3-3': [
    GK,
    { pos: 'LB', x: -0.62, y: -0.72 }, { pos: 'CB', x: -0.68, y: -0.25 },
    { pos: 'CB', x: -0.68, y: 0.25 }, { pos: 'RB', x: -0.62, y: 0.72 },
    { pos: 'CM', x: -0.25, y: -0.35 }, { pos: 'CDM', x: -0.38, y: 0 },
    { pos: 'CM', x: -0.25, y: 0.35 },
    { pos: 'LW', x: 0.18, y: -0.68 }, { pos: 'ST', x: 0.28, y: 0 },
    { pos: 'RW', x: 0.18, y: 0.68 },
  ],
  '4-2-3-1': [
    GK,
    { pos: 'LB', x: -0.62, y: -0.72 }, { pos: 'CB', x: -0.68, y: -0.25 },
    { pos: 'CB', x: -0.68, y: 0.25 }, { pos: 'RB', x: -0.62, y: 0.72 },
    { pos: 'CDM', x: -0.38, y: -0.2 }, { pos: 'CDM', x: -0.38, y: 0.2 },
    { pos: 'LW', x: -0.02, y: -0.65 }, { pos: 'CAM', x: -0.04, y: 0 },
    { pos: 'RW', x: -0.02, y: 0.65 }, { pos: 'ST', x: 0.28, y: 0 },
  ],
  '3-5-2': [
    GK,
    { pos: 'CB', x: -0.68, y: -0.4 }, { pos: 'CB', x: -0.72, y: 0 },
    { pos: 'CB', x: -0.68, y: 0.4 },
    { pos: 'LM', x: -0.2, y: -0.78 }, { pos: 'CM', x: -0.3, y: -0.25 },
    { pos: 'CDM', x: -0.4, y: 0 }, { pos: 'CM', x: -0.3, y: 0.25 },
    { pos: 'RM', x: -0.2, y: 0.78 },
    { pos: 'ST', x: 0.22, y: -0.2 }, { pos: 'ST', x: 0.22, y: 0.2 },
  ],
  '5-3-2': [
    GK,
    { pos: 'LB', x: -0.55, y: -0.8 }, { pos: 'CB', x: -0.7, y: -0.4 },
    { pos: 'CB', x: -0.74, y: 0 }, { pos: 'CB', x: -0.7, y: 0.4 },
    { pos: 'RB', x: -0.55, y: 0.8 },
    { pos: 'CM', x: -0.28, y: -0.32 }, { pos: 'CDM', x: -0.38, y: 0 },
    { pos: 'CM', x: -0.28, y: 0.32 },
    { pos: 'ST', x: 0.2, y: -0.2 }, { pos: 'ST', x: 0.2, y: 0.2 },
  ],
  '4-1-4-1': [
    GK,
    { pos: 'LB', x: -0.62, y: -0.72 }, { pos: 'CB', x: -0.68, y: -0.25 },
    { pos: 'CB', x: -0.68, y: 0.25 }, { pos: 'RB', x: -0.62, y: 0.72 },
    { pos: 'CDM', x: -0.42, y: 0 },
    { pos: 'LM', x: -0.12, y: -0.7 }, { pos: 'CM', x: -0.18, y: -0.24 },
    { pos: 'CM', x: -0.18, y: 0.24 }, { pos: 'RM', x: -0.12, y: 0.7 },
    { pos: 'ST', x: 0.26, y: 0 },
  ],
};
export const FORMATION_NAMES = Object.keys(formations);

// ============================================================ name pools
// Real-world names: common first and surnames per region, so generated squads read
// like real football. Famous players are excluded via BANNED_SURNAMES.
// tone: skin-tone range (0 light .. 1 dark) typical for players with these names.
// familyFirst: display surname before given name.
const NAME_POOLS = {
  english: {
    tone: [ 0.04, 0.3 ],
    first: [
      'Jack',    'Harry',   'Oliver', 'George',
      'Charlie', 'Tom',     'Ben',    'Sam',
      'Joe',     'Callum',  'Lewis',  'Ryan',
      'Jamie',   'Connor',  'Kieran', 'Mason',
      'Reece',   'Luke',    'Danny',  'Alfie',
      'Archie',  'Freddie', 'Elliot', 'Nathan',
      'Toby',    'Ethan',   'Jordan', 'Liam',
      'Rhys',    'Ross',    'Dean',   'Aaron',
      'Max',     'Josh',    'Kyle'
    ],
    lastWhole: [
      'Smith',   'Jones',    'Taylor',
      'Brown',   'Williams', 'Wilson',
      'Johnson', 'Davies',   'Robinson',
      'Wright',  'Thompson', 'Evans',
      'Walker',  'White',    'Roberts',
      'Green',   'Hall',     'Wood',
      'Jackson', 'Clarke',   'Patel',
      'Khan',    'Lewis',    'Morgan',
      'Cook',    'Bailey',   'Turner',
      'Carter',  'Mitchell', 'Hughes',
      'Shaw',    'Fox',      'Ward',
      'Hayes',   'Pearce'
    ]
  },
  caribbean: {
    tone: [ 0.62, 0.95 ],
    first: [
      'Jermaine', 'Tyrone', 'Marlon',
      'Delroy',   'Andre',  'Kemar',
      'Dwayne',   'Leon',   'Rohan',
      'Shamar',   'Tevin',  'Kadeem',
      'Jaden',    'Omari',  'Ricardo',
      'Damani',   'Javon',  'Nathaniel',
      'Kareem',   'Devon',  'Junior',
      'Trevane',  'Akeem',  'Malik',
      'Jahmal'
    ],
    lastWhole: [
      'Campbell',   'Grant',
      'Williams',   'Robinson',
      'Bailey',     'Brown',
      'Henry',      'Palmer',
      'Richards',   'Clarke',
      'Lindo',      'Bryan',
      'Richardson', 'Thomas',
      'Edwards',    'Gordon',
      'Ferguson',   'Reid',
      'Morris',     'Hinds',
      'Barrett'
    ]
  },
  french: {
    tone: [ 0.04, 0.3 ],
    first: [
      'Lucas',    'Hugo',     'Théo',
      'Mathis',   'Antoine',  'Julien',
      'Maxime',   'Baptiste', 'Clément',
      'Romain',   'Quentin',  'Bastien',
      'Florian',  'Kévin',    'Thibault',
      'Adrien',   'Loïc',     'Mathéo',
      'Enzo',     'Nolan',    'Raphaël',
      'Valentin', 'Corentin', 'Damien',
      'Gaëtan',   'Aurélien', 'Rémi'
    ],
    lastWhole: [
      'Martin',    'Bernard',  'Dubois',
      'Thomas',    'Robert',   'Richard',
      'Petit',     'Durand',   'Leroy',
      'Moreau',    'Laurent',  'Simon',
      'Michel',    'Lefebvre', 'Garcia',
      'David',     'Bertrand', 'Roux',
      'Vincent',   'Fournier', 'Morel',
      'Girard',    'Mercier',  'Dupont',
      'Lambert',   'Fontaine', 'Rousseau',
      'Blanc',     'Guérin',   'Faure',
      'Chevalier', 'Robin',    'Boyer'
    ]
  },
  spanish: {
    tone: [ 0.08, 0.35 ],
    first: [
      'Alejandro', 'Pablo',   'Sergio',
      'Álvaro',    'Javier',  'Diego',
      'Iker',      'Mario',   'Adrián',
      'Rubén',     'Hugo',    'Raúl',
      'Marcos',    'Daniel',  'Íñigo',
      'Unai',      'Jorge',   'Gonzalo',
      'Borja',     'Rodrigo', 'Víctor',
      'Nacho',     'Mikel',   'Aitor',
      'Óscar',     'Carlos',  'Asier',
      'Fermín'
    ],
    lastWhole: [
      'García',    'Gómez',    'Ruiz',
      'Díaz',      'Moreno',   'Muñoz',
      'Álvarez',   'Romero',   'Alonso',
      'Gutiérrez', 'Navarro',  'Torres',
      'Domínguez', 'Vázquez',  'Gil',
      'Serrano',   'Blanco',   'Molina',
      'Morales',   'Ortega',   'Delgado',
      'Castro',    'Ortiz',    'Rubio',
      'Marín',     'Iglesias', 'Sanz',
      'Núñez',     'Medina',   'Cortés',
      'Garrido',   'Lozano'
    ]
  },
  latin: {
    tone: [ 0.15, 0.65 ],
    first: [
      'Santiago', 'Matías',    'Juan',
      'Nicolás',  'Sebastián', 'Facundo',
      'Agustín',  'Joaquín',   'Cristian',
      'Emiliano', 'Franco',    'Luciano',
      'Ezequiel', 'Gonzalo',   'Brayan',
      'Jhon',     'Yerson',    'Wilmar',
      'Kevin',    'Andrés',    'Mauricio',
      'Fernando', 'Esteban',   'Thiago',
      'Rodrigo',  'Alexis',    'Jhonatan',
      'Dairon'
    ],
    lastWhole: [
      'González',  'Benítez',  'Acosta',
      'Giménez',   'Villalba', 'Ocampo',
      'Correa',    'Sosa',     'Rojas',
      'Aguirre',   'Bustos',   'Ledesma',
      'Paredes',   'Quiroga',  'Vega',
      'Soto',      'Herrera',  'Cabrera',
      'Peña',      'Miranda',  'Ferreyra',
      'Gallardo',  'Ibarra',   'Luna',
      'Maldonado', 'Moyano',   'Pizarro',
      'Rivas',     'Zúñiga',   'Escobar',
      'Valencia'
    ]
  },
  portuguese: {
    tone: [ 0.08, 0.4 ],
    first: [
      'João',   'Tiago',   'Rui',
      'Bruno',  'Diogo',   'Gonçalo',
      'Nuno',   'Rafael',  'Pedro',
      'André',  'Vítor',   'Hélder',
      'Fábio',  'Duarte',  'Rúben',
      'Tomás',  'Leandro', 'Hugo',
      'Miguel', 'Ricardo', 'Francisco'
    ],
    lastWhole: [
      'Ferreira', 'Oliveira',  'Rodrigues',
      'Sousa',    'Gonçalves', 'Carvalho',
      'Almeida',  'Ribeiro',   'Lopes',
      'Marques',  'Teixeira',  'Correia',
      'Mendes',   'Nunes',     'Moreira',
      'Cardoso',  'Pinto',     'Vieira',
      'Fonseca',  'Barbosa',   'Monteiro',
      'Coelho',   'Lourenço',  'Tavares',
      'Machado',  'Fernandes', 'Azevedo',
      'Melo',     'Pires',     'Brito'
    ]
  },
  brazilian: {
    tone: [ 0.1, 0.95 ],
    first: [
      'Gabriel',  'Matheus',    'Lucas',
      'Thiago',   'Rafael',     'Felipe',
      'Vinícius', 'Caio',       'Igor',
      'Rodrigo',  'Wellington', 'Everton',
      'Danilo',   'Renan',      'Douglas',
      'Anderson', 'Paulo',      'Gustavo',
      'Leandro',  'Wesley',     'Kaique',
      'Luan',     'Breno',      'Ruan',
      'Murilo',   'Jefferson',  'Talles'
    ],
    lastWhole: [
      'Souza',    'Oliveira',   'Lima',
      'Carvalho', 'Ferreira',   'Rocha',
      'Alves',    'Nascimento', 'Araújo',
      'Barbosa',  'Cardoso',    'Gomes',
      'Moura',    'Ribeiro',    'Pinto',
      'Cunha',    'Melo',       'Freitas',
      'Vieira',   'Correia',    'Nogueira',
      'Batista',  'Dias',       'Campos',
      'Monteiro', 'Teixeira',   'Macedo',
      'Esteves',  'Mendes',     'Azevedo',
      'Barros'
    ]
  },
  italian: {
    tone: [ 0.08, 0.35 ],
    first: [
      'Marco',     'Luca',     'Alessandro',
      'Matteo',    'Lorenzo',  'Andrea',
      'Davide',    'Federico', 'Simone',
      'Riccardo',  'Stefano',  'Gianluca',
      'Nicolò',    'Tommaso',  'Daniele',
      'Filippo',   'Emanuele', 'Giacomo',
      'Pietro',    'Raffaele', 'Edoardo',
      'Salvatore', 'Mattia',   'Cristiano',
      'Leonardo'
    ],
    lastWhole: [
      'Rossi',    'Russo',    'Ferrari',
      'Esposito', 'Bianchi',  'Romano',
      'Colombo',  'Ricci',    'Marino',
      'Greco',    'Bruno',    'Gallo',
      'Conti',    'De Luca',  'Mancini',
      'Giordano', 'Rizzo',    'Lombardi',
      'Moretti',  'Barbieri', 'Fontana',
      'Santoro',  'Mariani',  'Rinaldi',
      'Caruso',   'Ferrara',  'Galli',
      'Martini',  'Leone',    'Longo',
      'Gentile'
    ]
  },
  german: {
    tone: [ 0.02, 0.25 ],
    first: [
      'Lukas',     'Jonas',      'Leon',
      'Felix',     'Maximilian', 'Niklas',
      'Tim',       'Jan',        'Florian',
      'Tobias',    'Julian',     'Moritz',
      'Sebastian', 'Kevin',      'Marco',
      'Dominik',   'Jannik',     'Philipp',
      'Benedikt',  'Nico',       'Fabian',
      'Matthias',  'Lennart',    'Malte',
      'Henrik'
    ],
    lastWhole: [
      'Schmidt',    'Schneider', 'Fischer',
      'Weber',      'Meyer',     'Wagner',
      'Becker',     'Schulz',    'Hoffmann',
      'Schäfer',    'Koch',      'Bauer',
      'Richter',    'Klein',     'Wolf',
      'Schröder',   'Neumann',   'Schwarz',
      'Zimmermann', 'Braun',     'Krüger',
      'Hofmann',    'Hartmann',  'Lange',
      'Schmitt',    'Werner',    'Krause',
      'Meier',      'Lehmann',   'Köhler'
    ]
  },
  dutch: {
    tone: [ 0.02, 0.25 ],
    first: [
      'Daan',   'Sem',   'Bram',
      'Thijs',  'Jesse', 'Ruben',
      'Stijn',  'Lars',  'Joris',
      'Niels',  'Bas',   'Wout',
      'Jasper', 'Teun',  'Milan',
      'Sven',   'Kees',  'Luuk',
      'Floris', 'Pim',   'Maarten',
      'Gijs'
    ],
    lastWhole: [
      'de Jong',  'Jansen',
      'de Vries', 'van den Berg',
      'Bakker',   'Visser',
      'Smit',     'Meijer',
      'de Boer',  'Mulder',
      'de Groot', 'Bos',
      'Vos',      'Peters',
      'Hendriks', 'van Leeuwen',
      'Dekker',   'Brouwer',
      'de Wit',   'Dijkstra',
      'Smits',    'Kuipers',
      'Hoekstra', 'van der Meer',
      'Prins',    'Koster'
    ]
  },
  nordic: {
    tone: [ 0, 0.2 ],
    first: [
      'Erik',    'Lars',   'Magnus',
      'Anders',  'Oskar',  'Henrik',
      'Mikkel',  'Rasmus', 'Jonas',
      'Emil',    'Kasper', 'Sander',
      'Sindre',  'Viktor', 'Gustav',
      'Axel',    'Elias',  'Tobias',
      'Mathias', 'Jesper', 'Ole',
      'Isak'
    ],
    lastWhole: [
      'Andersen',    'Johansson', 'Hansen',
      'Larsen',      'Nilsson',   'Eriksson',
      'Lindqvist',   'Berg',      'Holm',
      'Dahl',        'Lund',      'Strand',
      'Haugen',      'Moen',      'Virtanen',
      'Laine',       'Korhonen',  'Nieminen',
      'Sørensen',    'Jensen',    'Pedersen',
      'Kristiansen', 'Lundberg',  'Svensson',
      'Gustafsson',  'Vik'
    ]
  },
  slavic: {
    tone: [ 0.03, 0.25 ],
    first: [
      'Luka',      'Ivan',    'Marko',
      'Nikola',    'Dmytro',  'Jakub',
      'Mateusz',   'Tomáš',   'Filip',
      'Petar',     'Stefan',  'Andriy',
      'Bogdan',    'Dominik', 'Kamil',
      'Milan',     'Ondřej',  'Viktor',
      'Oleksandr', 'Damir',   'Josip',
      'Ante',      'Mislav',  'Pavel',
      'Lazar',     'Vuk',     'Szymon',
      'Taras'
    ],
    lastWhole: [
      'Novak',     'Horvat',     'Kovač',
      'Nowak',     'Kowalski',   'Wiśniewski',
      'Dvořák',    'Svoboda',    'Novotný',
      'Kovalenko', 'Shevchenko', 'Bondarenko',
      'Petrović',  'Marković',   'Jovanović',
      'Ilić',      'Popović',    'Lukić',
      'Kozak',     'Kalinić',    'Stanković',
      'Dimitrov',  'Ivanov',     'Kolev',
      'Petrenko',  'Hrubý',      'Krajník',
      'Zupan'
    ]
  },
  greek: {
    tone: [ 0.08, 0.32 ],
    first: [
      'Giorgos',    'Kostas',
      'Dimitris',   'Nikos',
      'Vasilis',    'Christos',
      'Panagiotis', 'Thanasis',
      'Yannis',     'Stelios',
      'Michalis',   'Alexandros',
      'Petros',     'Lefteris',
      'Spyros',     'Manolis'
    ],
    lastWhole: [
      'Papadopoulos', 'Papadakis',
      'Georgiou',     'Nikolaou',
      'Konstantinou', 'Dimitriou',
      'Makris',       'Stavrou',
      'Vlachos',      'Economou',
      'Pappas',       'Oikonomou',
      'Karagiannis',  'Anagnostopoulos',
      'Ioannou',      'Vasilakis',
      'Lazaridis',    'Samaras',
      'Tsoukalas'
    ]
  },
  turkish: {
    tone: [ 0.15, 0.45 ],
    first: [
      'Emre',  'Burak',   'Mert',
      'Arda',  'Kerem',   'Can',
      'Oğuz',  'Ozan',    'Barış',
      'Hakan', 'Serkan',  'Yusuf',
      'Okay',  'Ferdi',   'Kaan',
      'Efe',   'Umut',    'Berkay',
      'Tolga', 'Doğukan', 'Eldor',
      'Jasur', 'Timur',   'Rustam'
    ],
    lastWhole: [
      'Yılmaz',   'Kaya',   'Demir',
      'Şahin',    'Çelik',  'Yıldız',
      'Yıldırım', 'Öztürk', 'Aydın',
      'Özdemir',  'Arslan', 'Doğan',
      'Kılıç',    'Aslan',  'Çetin',
      'Kara',     'Koç',    'Kurt',
      'Özkan',    'Şimşek', 'Güneş',
      'Polat',    'Tekin',  'Aktaş',
      'Bulut'
    ]
  },
  westAfrican: {
    tone: [ 0.75, 1 ],
    first: [
      'Kwame',     'Kofi',       'Yaw',
      'Emeka',     'Chinedu',    'Oluwaseun',
      'Babatunde', 'Ibrahima',   'Moussa',
      'Mamadou',   'Ousmane',    'Cheikh',
      'Abdoulaye', 'Seydou',     'Kelechi',
      'Obinna',    'Tunde',      'Kwabena',
      'Fodé',      'Lamine',     'Ismaila',
      'Adama',     'Souleymane', 'Bakary',
      'Amadou',    'Sékou',      'Issa',
      'Nnamdi',    'Ebuka',      'Kossi'
    ],
    lastWhole: [
      'Diallo',    'Traoré',   'Keita',
      'Coulibaly', 'Ouattara', 'Koné',
      'Sow',       'Ndiaye',   'Diop',
      'Mensah',    'Owusu',    'Asante',
      'Boateng',   'Addo',     'Adjei',
      'Okafor',    'Eze',      'Nwosu',
      'Okonkwo',   'Adeyemi',  'Bello',
      'Ibrahim',   'Sanogo',   'Camara',
      'Konaté',    'Badji',    'Gueye',
      'Bamba',     'Kouassi'
    ]
  },
  northAfrican: {
    tone: [ 0.28, 0.6 ],
    first: [
      'Youssef', 'Mohamed', 'Hakim',
      'Sofiane', 'Bilal',   'Amine',
      'Karim',   'Walid',   'Nabil',
      'Ismaël',  'Yassine', 'Anis',
      'Mehdi',   'Ayoub',   'Zakaria',
      'Rachid',  'Hamza',   'Farid',
      'Ilyes',   'Saïd',    'Adel',
      'Taha',    'Oussama', 'Marwane',
      'Ziyad'
    ],
    lastWhole: [
      'Benali',   'Hadj',       'Bouzid',
      'Amrani',   'Mansouri',   'Saidi',
      'Haddad',   'Mokhtar',    'Chaoui',
      'Bensalem', 'Trabelsi',   'Jaziri',
      'Hamdi',    'Gharbi',     'Zouari',
      'Belkacem', 'Naili',      'Karim',
      'Sellami',  'Amara',      'Meziane',
      'Idrissi',  'Benjelloun', 'Alaoui',
      'Bennani',  'Tazi',       'Lahlou'
    ]
  },
  eastAfrican: {
    tone: [ 0.72, 1 ],
    first: [
      'Thabo',     'Sipho',   'Themba',
      'Bongani',   'Tendai',  'Tafadzwa',
      'Musa',      'Brian',   'Peter',
      'Kelvin',    'Collins', 'Emmanuel',
      'Joseph',    'Kagiso',  'Lebo',
      'Siyabonga', 'Teboho',  'Godfrey',
      'Felix',     'Eric',    'Dennis',
      'Abel',      'Mandla',  'Baraka',
      'Juma',      'Isaac'
    ],
    lastWhole: [
      'Otieno',  'Ochieng', 'Kamau',
      'Mwangi',  'Kimani',  'Omondi',
      'Wanjiru', 'Mutua',   'Waweru',
      'Njoroge', 'Hassan',  'Abdi',
      'Mohamed', 'Juma',    'Shaban',
      'Mwinyi',  'Kassim',  'Athumani',
      'Ngowi',   'Mbwana',  'Mutale',
      'Banda',   'Phiri',   'Mwansa',
      'Zulu',    'Tembo',   'Lungu',
      'Mulenga'
    ]
  },
  arabic: {
    tone: [ 0.28, 0.6 ],
    first: [
      'Abdullah', 'Fahad',    'Salem',
      'Omar',     'Khalid',   'Ali',
      'Hassan',   'Faisal',   'Nasser',
      'Saleh',    'Mohammed', 'Ahmed',
      'Sultan',   'Majed',    'Yousef',
      'Ibrahim',  'Hamad',    'Mubarak',
      'Rashed',   'Tariq',    'Mustafa',
      'Hussein',  'Jassim',   'Mahmoud',
      'Bader'
    ],
    lastWhole: [
      'Al-Otaibi', 'Al-Harbi',   'Al-Qahtani',
      'Al-Shehri', 'Al-Ghamdi',  'Al-Zahrani',
      'Al-Dosari', 'Al-Mutairi', 'Al-Subaie',
      'Al-Enezi',  'Al-Hassan',  'Al-Rashid',
      'Haddad',    'Khalil',     'Nasser',
      'Saleh',     'Mansour',    'Zaid',
      'Fares',     'Jaber',      'Hamdan',
      'Qasim',     'Awad',       'Rashed',
      'Hussein',   'Ayoub',      'Darwish'
    ]
  },
  persian: {
    tone: [ 0.22, 0.5 ],
    first: [
      'Ali',      'Reza',    'Mehdi',
      'Saeed',    'Amir',    'Hossein',
      'Milad',    'Morteza', 'Alireza',
      'Mohammad', 'Ehsan',   'Karim',
      'Omid',     'Arash',   'Payam',
      'Ramin',    'Vahid',   'Sina',
      'Kaveh',    'Shahin'
    ],
    lastWhole: [
      'Mohammadi', 'Hosseini', 'Ahmadi',
      'Karimi',    'Rahimi',   'Moradi',
      'Hashemi',   'Jafari',   'Rezaei',
      'Ghasemi',   'Sadeghi',  'Nazari',
      'Taheri',    'Shirazi',  'Kazemi',
      'Ebrahimi',  'Ansari',   'Soltani',
      'Amiri',     'Tabrizi',  'Heydari',
      'Asadi',     'Bagheri',  'Mousavi',
      'Zare',      'Safari',   'Mirzaei'
    ]
  },
  japanese: {
    tone: [ 0.12, 0.35 ],
    first: [
      'Haruto', 'Ren',    'Sota',
      'Yuto',   'Kaito',  'Daiki',
      'Takumi', 'Ryota',  'Kenta',
      'Shota',  'Yuki',   'Hiroki',
      'Kosei',  'Ritsu',  'Tsubasa',
      'Kazuki', 'Shun',   'Riku',
      'Taiga',  'Wataru', 'Kohei',
      'Yamato'
    ],
    lastWhole: [
      'Sato',     'Suzuki',    'Takahashi',
      'Tanaka',   'Watanabe',  'Ito',
      'Yamamoto', 'Nakamura',  'Kobayashi',
      'Kato',     'Yoshida',   'Yamada',
      'Sasaki',   'Yamaguchi', 'Matsumoto',
      'Inoue',    'Kimura',    'Hayashi',
      'Shimizu',  'Mori',      'Abe',
      'Ishikawa', 'Ogawa',     'Fujita',
      'Okada',    'Goto',      'Hasegawa',
      'Ueda',     'Endo'
    ]
  },
  korean: {
    tone: [ 0.12, 0.35 ],
    familyFirst: true,
    lastWhole: [
      'Kim',   'Lee',  'Park',
      'Choi',  'Jung', 'Kang',
      'Cho',   'Yoon', 'Jang',
      'Lim',   'Han',  'Oh',
      'Seo',   'Shin', 'Kwon',
      'Hwang', 'Ahn',  'Song',
      'Yoo',   'Hong'
    ],
    first: [
      'Min-jun',   'Ji-hoon',
      'Seung-woo', 'Hyun-woo',
      'Dong-hyun', 'Sung-min',
      'Tae-hyun',  'Young-jae',
      'Joon-ho',   'Hee-chan',
      'Kang-in',   'Woo-young',
      'Jae-sung',  'Min-seok',
      'Hwang-jun', 'Jin-su'
    ]
  },
  chinese: {
    tone: [ 0.12, 0.35 ],
    familyFirst: true,
    lastWhole: [
      'Wang', 'Li',    'Zhang',
      'Liu',  'Chen',  'Yang',
      'Zhao', 'Huang', 'Zhou',
      'Wu',   'Xu',    'Sun',
      'Ma',   'Zhu',   'Hu',
      'Guo',  'He',    'Lin',
      'Gao',  'Luo'
    ],
    first: [
      'Wei',  'Jun',  'Lei',
      'Peng', 'Zhi',  'Ming',
      'Hao',  'Chen', 'Kai',
      'Rui',  'Tao',  'Bo',
      'Yu',   'Long', 'Feng',
      'Yang', 'Hui',  'Jie',
      'Lin',  'Wen'
    ]
  },
  vietnamese: {
    tone: [ 0.25, 0.5 ],
    familyFirst: true,
    lastWhole: [
      'Nguyen', 'Tran',
      'Le',     'Pham',
      'Hoang',  'Phan',
      'Vu',     'Dang',
      'Bui',    'Do',
      'Ho',     'Ngo'
    ],
    first: [
      'Duc',   'Quang', 'Minh',
      'Cong',  'Tuan',  'Hoang',
      'Thanh', 'Hau',   'Phuong',
      'Hai',   'Toan',  'Long',
      'Dung',  'Vinh',  'Tien',
      'Khoa',  'Hung',  'Van'
    ]
  },
  seAsian: {
    tone: [ 0.32, 0.62 ],
    first: [
      'Ahmad',     'Rizky',
      'Hafiz',     'Arif',
      'Faiz',      'Danial',
      'Irfan',     'Bayu',
      'Dimas',     'Yoga',
      'Rafli',     'Supakit',
      'Kittipong', 'Teerasak',
      'Nattapong', 'Anucha',
      'Wichai',    'Somchai',
      'Marco',     'Jefferson'
    ],
    lastWhole: [
      'Wongsuwan',  'Srisai',   'Boonmee',
      'Phosri',     'Kaewkla',  'Saetang',
      'Sawangwong', 'Sukkaew',  'Hadi',
      'Suparman',   'Pratama',  'Wijaya',
      'Susanto',    'Saputra',  'Nasution',
      'Rahman',     'Lim',      'Tan',
      'Ong',        'Chong',    'Ismail',
      'Hasan',      'Abdullah', 'Yusof'
    ]
  },
  southAsian: {
    tone: [ 0.45, 0.75 ],
    first: [
      'Rahul',   'Arjun',   'Vikram',
      'Anirudh', 'Sandesh', 'Lallian',
      'Manvir',  'Ashique', 'Udanta',
      'Akash',   'Rohit',   'Nikhil',
      'Pranav',  'Ravi',    'Amit',
      'Deepak',  'Jeakson', 'Mohun'
    ],
    lastWhole: [
      'Singh',    'Sharma', 'Patel',
      'Kumar',    'Gupta',  'Mehta',
      'Reddy',    'Rao',    'Iyer',
      'Nair',     'Chopra', 'Malik',
      'Dhillon',  'Gill',   'Bhatt',
      'Joshi',    'Desai',  'Chowdhury',
      'Hossain',  'Ahmed',  'Akhtar',
      'Mirza',    'Perera', 'Ranasinghe',
      'Fernando'
    ]
  },
  pacific: {
    tone: [ 0.45, 0.78 ],
    first: [
      'Sione',    'Tevita',
      'Roy',      'Kalani',
      'Manu',     'Tama',
      'Ratu',     'Josefa',
      'Waisale',  'Rewa',
      'Teva',     'Hemi',
      'Nikolasi', 'Aisake',
      'Iosefo',   'Keoni',
      'Ariki',    'Lui'
    ],
    lastWhole: [
      'Tui',     'Faleolo',  'Taufa',
      'Tupou',   'Fonua',    'Vaka',
      'Sione',   'Latu',     'Havea',
      'Tavita',  'Malo',     'Mataele',
      'Ratu',    'Vuniwaqa', 'Naivalu',
      'Lolohea', 'Fifita',   'Maka',
      'Pulu',    'Lasi',     'Tuivaiti',
      'Teariki'
    ]
  }
};export const NAME_REGIONS = Object.keys(NAME_POOLS);

// Surnames of world-famous players — regenerated if a syllable combo hits one.
const BANNED_SURNAMES = new Set(['Messi', 'Ronaldo', 'Maradona', 'Zidane', 'Mbappé', 'Neymar', 'Salah', 'Kane',
  'Rooney', 'Beckham', 'Henry', 'Drogba', 'Weah', 'Rossi', 'Baggio', 'Maldini', 'Totti', 'Buffon', 'Müller',
  'Beckenbauer', 'Klose', 'Kroos', 'Neuer', 'Iniesta', 'Puyol', 'Casillas', 'Ramos', 'Cruyff', 'Bergkamp',
  'Modrić', 'Lewandowski', 'Haaland', 'Pirlo', 'Lineker', 'Gerrard', 'Lampard', 'Shearer', 'Scholes', 'Giggs',
  'Suárez', 'Cavani', 'Forlán', 'Valderrama', 'Falcao', 'Mané', 'Okocha', 'Kanu', 'Touré', 'Eusébio', 'Figo',
  'Kaká', 'Pelé', 'Romário', 'Batistuta', 'Platini', 'Cantona', 'Benzema', 'Griezmann', 'Pogba', 'Kanté',
  'Nakata', 'Kagawa', 'Honda', 'Mahrez', 'Hakimi', 'Osimhen', 'Rashford', 'Saka', 'Foden', 'Bellingham',
  'Martínez', 'Hernández', 'Fernández', 'Rodríguez', 'Sánchez', 'Silva', 'Santos', 'Pereira', 'Costa']);

function genName(region, rng) {
  const p = NAME_POOLS[region] || NAME_POOLS.english;
  let first, last;
  for (let tries = 0; tries < 8; tries++) {
    if (p.lastWhole) last = pick(rng, p.lastWhole);
    else {
      last = pick(rng, p.lastA) + pick(rng, p.lastB);
      if (p.particles && rng() < 0.3) last = pick(rng, p.particles) + last;
    }
    if (!BANNED_SURNAMES.has(last)) break;
  }
  if (p.firstA) {
    const b = pick(rng, p.firstB);
    first = pick(rng, p.firstA) + (b ? p.firstJoin + b : '');
  } else first = pick(rng, p.first);
  const name = p.familyFirst ? `${last} ${first}` : `${first} ${last}`;
  return { name, shortName: last };
}

// Global talent mix used for foreign players at clubs.
const GLOBAL_MIX = [['westAfrican', 20], ['brazilian', 14], ['latin', 12], ['french', 10], ['spanish', 7],
  ['slavic', 8], ['northAfrican', 7], ['portuguese', 5], ['dutch', 5], ['nordic', 5], ['english', 4],
  ['eastAfrican', 3]];

// ============================================================ nations
// [id, name, short, confed, rating, formation, shirt, shorts, socks, altShirt, altShorts, altSocks, pop]
// pop: name-region mix [[region, weight, toneOverride?], ...] (string = single region)
const WA = 'westAfrican', NA = 'northAfrican', EA = 'eastAfrican';
const N = [
  // ---------------- Africa (28)
  ['mar', 'Morocco', 'MAR', 'AFR', 82, '4-3-3', '#c1272d', '#0b6b3a', '#c1272d', '#ffffff', '#ffffff', '#ffffff', NA],
  ['sen', 'Senegal', 'SEN', 'AFR', 80, '4-3-3', '#ffffff', '#ffffff', '#ffffff', '#00853f', '#00853f', '#fdef42', WA],
  ['nga', 'Nigeria', 'NGA', 'AFR', 79, '4-3-3', '#008751', '#ffffff', '#008751', '#ffffff', '#008751', '#ffffff', WA],
  ['civ', 'Ivory Coast', 'CIV', 'AFR', 79, '4-3-3', '#f77f00', '#ffffff', '#009e60', '#ffffff', '#f77f00', '#ffffff', WA],
  ['egy', 'Egypt', 'EGY', 'AFR', 77, '4-2-3-1', '#ce1126', '#ffffff', '#000000', '#ffffff', '#000000', '#ffffff', NA],
  ['alg', 'Algeria', 'ALG', 'AFR', 77, '4-3-3', '#ffffff', '#ffffff', '#ffffff', '#006233', '#006233', '#006233', NA],
  ['cmr', 'Cameroon', 'CMR', 'AFR', 76, '4-3-3', '#007a5e', '#ce1126', '#fcd116', '#fcd116', '#007a5e', '#007a5e', [[WA, 0.75], ['french', 0.25, [0.75, 1]]]],
  ['mli', 'Mali', 'MLI', 'AFR', 76, '4-2-3-1', '#14b53a', '#fcd116', '#ce1126', '#fcd116', '#14b53a', '#fcd116', WA],
  ['gha', 'Ghana', 'GHA', 'AFR', 75, '4-2-3-1', '#ffffff', '#ffffff', '#ffffff', '#ce1126', '#fcd116', '#006b3f', WA],
  ['tun', 'Tunisia', 'TUN', 'AFR', 74, '4-3-3', '#e70013', '#ffffff', '#e70013', '#ffffff', '#e70013', '#ffffff', NA],
  ['bfa', 'Burkina Faso', 'BFA', 'AFR', 73, '4-4-2', '#009e49', '#ef2b2d', '#009e49', '#ffffff', '#ffffff', '#ef2b2d', WA],
  ['cod', 'DR Congo', 'COD', 'AFR', 74, '4-3-3', '#007fff', '#007fff', '#007fff', '#ce1021', '#f7d618', '#ce1021', [[WA, 0.6], ['french', 0.4, [0.78, 1]]]],
  ['rsa', 'South Africa', 'RSA', 'AFR', 72, '4-2-3-1', '#ffb612', '#007749', '#ffb612', '#007749', '#ffffff', '#007749', EA],
  ['cpv', 'Cape Verde', 'CPV', 'AFR', 71, '4-4-2', '#003893', '#003893', '#003893', '#ffffff', '#cf2027', '#ffffff', [['portuguese', 1, [0.5, 0.95]]]],
  ['gui', 'Guinea', 'GUI', 'AFR', 71, '4-3-3', '#ce1126', '#fcd116', '#009460', '#ffffff', '#ffffff', '#ffffff', WA],
  ['gab', 'Gabon', 'GAB', 'AFR', 69, '4-3-3', '#fcd116', '#009e60', '#3a75c4', '#3a75c4', '#ffffff', '#3a75c4', [[WA, 0.6], ['french', 0.4, [0.78, 1]]]],
  ['zam', 'Zambia', 'ZAM', 'AFR', 68, '4-4-2', '#198a00', '#000000', '#198a00', '#ffffff', '#ffffff', '#ef7d00', EA],
  ['ang', 'Angola', 'ANG', 'AFR', 68, '4-2-3-1', '#cc092f', '#000000', '#cc092f', '#ffffff', '#ffcb00', '#ffffff', [['portuguese', 1, [0.72, 1]]]],
  ['eqg', 'Equatorial Guinea', 'EQG', 'AFR', 66, '5-3-2', '#e32118', '#3e9a00', '#e32118', '#ffffff', '#0073ce', '#ffffff', [['spanish', 0.5, [0.75, 1]], [WA, 0.5]]],
  ['uga', 'Uganda', 'UGA', 'AFR', 66, '4-4-2', '#fcdc04', '#000000', '#d90000', '#d90000', '#d90000', '#d90000', EA],
  ['ken', 'Kenya', 'KEN', 'AFR', 64, '4-4-2', '#bb0000', '#bb0000', '#bb0000', '#006600', '#ffffff', '#006600', EA],
  ['tan', 'Tanzania', 'TAN', 'AFR', 63, '4-4-2', '#1eb53a', '#00a3dd', '#1eb53a', '#00a3dd', '#000000', '#00a3dd', EA],
  ['moz', 'Mozambique', 'MOZ', 'AFR', 63, '4-4-2', '#d21034', '#000000', '#d21034', '#ffffff', '#009739', '#ffffff', [['portuguese', 1, [0.72, 1]]]],
  ['ben', 'Benin', 'BEN', 'AFR', 65, '4-2-3-1', '#fcd116', '#008751', '#e8112d', '#008751', '#fcd116', '#008751', WA],
  ['mtn', 'Mauritania', 'MTN', 'AFR', 63, '5-3-2', '#00a95c', '#ffd700', '#00a95c', '#ffffff', '#00a95c', '#ffffff', [[NA, 0.6], [WA, 0.4]]],
  ['nam', 'Namibia', 'NAM', 'AFR', 61, '4-4-2', '#ff0000', '#003580', '#ff0000', '#ffffff', '#ffffff', '#009543', EA],
  ['zim', 'Zimbabwe', 'ZIM', 'AFR', 62, '4-4-2', '#ffd200', '#006400', '#ffd200', '#006400', '#ffffff', '#006400', EA],
  ['sud', 'Sudan', 'SUD', 'AFR', 60, '5-3-2', '#d21034', '#ffffff', '#d21034', '#ffffff', '#007229', '#ffffff', [[NA, 0.5, [0.55, 0.9]], [EA, 0.5]]],
  // ---------------- Europe (29)
  ['fra', 'France', 'FRA', 'EUR', 88, '4-2-3-1', '#1d3a8f', '#ffffff', '#c8102e', '#ffffff', '#1d3a8f', '#ffffff', [['french', 0.55], [WA, 0.25], [NA, 0.12], ['caribbean', 0.08]]],
  ['esp', 'Spain', 'ESP', 'EUR', 88, '4-3-3', '#c60b1e', '#0a2a66', '#0a2a66', '#f4e6c0', '#f4e6c0', '#c60b1e', [['spanish', 0.9], [WA, 0.1]]],
  ['eng', 'England', 'ENG', 'EUR', 87, '4-2-3-1', '#ffffff', '#0b1f4b', '#ffffff', '#c8102e', '#c8102e', '#c8102e', [['english', 0.7], ['caribbean', 0.15], [WA, 0.15]]],
  ['por', 'Portugal', 'POR', 'EUR', 86, '4-3-3', '#a50021', '#0b6b3a', '#a50021', '#ffffff', '#ffffff', '#ffffff', [['portuguese', 0.8], [WA, 0.2]]],
  ['ned', 'Netherlands', 'NED', 'EUR', 85, '4-3-3', '#f36c21', '#f36c21', '#f36c21', '#0b2b5b', '#0b2b5b', '#0b2b5b', [['dutch', 0.7], ['caribbean', 0.2], [NA, 0.1]]],
  ['ger', 'Germany', 'GER', 'EUR', 85, '4-2-3-1', '#ffffff', '#111111', '#ffffff', '#1b1b1b', '#ffffff', '#1b1b1b', [['german', 0.75], ['turkish', 0.1], [WA, 0.1], ['slavic', 0.05]]],
  ['ita', 'Italy', 'ITA', 'EUR', 84, '3-5-2', '#1f5aa6', '#ffffff', '#1f5aa6', '#ffffff', '#1f5aa6', '#ffffff', [['italian', 0.92], [WA, 0.08]]],
  ['bel', 'Belgium', 'BEL', 'EUR', 83, '3-5-2', '#d0021b', '#d0021b', '#d0021b', '#f5d130', '#000000', '#f5d130', [['dutch', 0.4], ['french', 0.3], [WA, 0.2], [NA, 0.1]]],
  ['cro', 'Croatia', 'CRO', 'EUR', 82, '4-3-3', '#ffffff', '#ffffff', '#0d47a1', '#0d1b4f', '#0d1b4f', '#0d1b4f', 'slavic'],
  ['den', 'Denmark', 'DEN', 'EUR', 80, '3-5-2', '#c8102e', '#ffffff', '#c8102e', '#ffffff', '#ffffff', '#ffffff', [['nordic', 0.85], [WA, 0.1], ['slavic', 0.05]]],
  ['sui', 'Switzerland', 'SUI', 'EUR', 79, '4-2-3-1', '#d52b1e', '#ffffff', '#d52b1e', '#ffffff', '#d52b1e', '#ffffff', [['german', 0.5], ['french', 0.2], ['slavic', 0.2], [WA, 0.1]]],
  ['aut', 'Austria', 'AUT', 'EUR', 79, '4-2-3-1', '#ed2939', '#ffffff', '#ed2939', '#ffffff', '#000000', '#ffffff', [['german', 0.8], ['slavic', 0.1], ['turkish', 0.1]]],
  ['tur', 'Turkey', 'TUR', 'EUR', 78, '4-2-3-1', '#e30a17', '#e30a17', '#ffffff', '#ffffff', '#ffffff', '#e30a17', 'turkish'],
  ['nor', 'Norway', 'NOR', 'EUR', 78, '4-3-3', '#ba0c2f', '#ffffff', '#00205b', '#ffffff', '#00205b', '#ffffff', [['nordic', 0.9], [WA, 0.1]]],
  ['srb', 'Serbia', 'SRB', 'EUR', 77, '3-5-2', '#c6363c', '#0c4076', '#ffffff', '#ffffff', '#ffffff', '#c6363c', 'slavic'],
  ['ukr', 'Ukraine', 'UKR', 'EUR', 77, '4-3-3', '#ffd500', '#ffd500', '#ffd500', '#005bbb', '#005bbb', '#005bbb', 'slavic'],
  ['pol', 'Poland', 'POL', 'EUR', 77, '3-5-2', '#ffffff', '#dc143c', '#ffffff', '#dc143c', '#ffffff', '#dc143c', 'slavic'],
  ['swe', 'Sweden', 'SWE', 'EUR', 77, '4-4-2', '#fecc00', '#005293', '#fecc00', '#005293', '#fecc00', '#005293', [['nordic', 0.8], ['slavic', 0.1], [WA, 0.1]]],
  ['cze', 'Czechia', 'CZE', 'EUR', 76, '3-5-2', '#d7141a', '#ffffff', '#11457e', '#ffffff', '#11457e', '#ffffff', 'slavic'],
  ['hun', 'Hungary', 'HUN', 'EUR', 76, '3-5-2', '#cd2a3e', '#ffffff', '#436f4d', '#ffffff', '#ffffff', '#cd2a3e', 'slavic'],
  ['sco', 'Scotland', 'SCO', 'EUR', 75, '3-5-2', '#0b2e6b', '#ffffff', '#0b2e6b', '#f6c5d3', '#2a2a2a', '#f6c5d3', [['english', 0.92], ['caribbean', 0.08]]],
  ['gre', 'Greece', 'GRE', 'EUR', 75, '4-3-3', '#ffffff', '#ffffff', '#ffffff', '#0d5eaf', '#0d5eaf', '#0d5eaf', 'greek'],
  ['wal', 'Wales', 'WAL', 'EUR', 74, '3-5-2', '#c8102e', '#c8102e', '#c8102e', '#f5e663', '#0b6b3a', '#f5e663', [['english', 0.9], ['caribbean', 0.1]]],
  ['rou', 'Romania', 'ROU', 'EUR', 74, '4-2-3-1', '#fcd116', '#fcd116', '#fcd116', '#002b7f', '#002b7f', '#002b7f', 'slavic'],
  ['svk', 'Slovakia', 'SVK', 'EUR', 74, '4-3-3', '#ffffff', '#0b4ea2', '#ffffff', '#0b4ea2', '#0b4ea2', '#0b4ea2', 'slavic'],
  ['svn', 'Slovenia', 'SVN', 'EUR', 73, '4-4-2', '#ffffff', '#ffffff', '#ffffff', '#005da4', '#005da4', '#005da4', 'slavic'],
  ['irl', 'Ireland', 'IRL', 'EUR', 72, '4-4-2', '#169b62', '#ffffff', '#169b62', '#ffffff', '#169b62', '#ffffff', [['english', 0.88], ['caribbean', 0.06], [WA, 0.06]]],
  ['geo', 'Georgia', 'GEO', 'EUR', 73, '5-3-2', '#ffffff', '#ffffff', '#ffffff', '#c8102e', '#c8102e', '#c8102e', 'slavic'],
  ['alb', 'Albania', 'ALB', 'EUR', 71, '5-3-2', '#e41e20', '#e41e20', '#e41e20', '#000000', '#000000', '#000000', [['slavic', 0.6], ['italian', 0.4]]],
  // ---------------- South America (10)
  ['arg', 'Argentina', 'ARG', 'SAM', 89, '4-4-2', '#75aadb', '#111b3c', '#ffffff', '#1b2a5c', '#1b2a5c', '#1b2a5c', [['latin', 0.6, [0.08, 0.4]], ['italian', 0.4]]],
  ['bra', 'Brazil', 'BRA', 'SAM', 88, '4-2-3-1', '#ffdf00', '#002776', '#ffffff', '#002776', '#ffffff', '#002776', 'brazilian'],
  ['uru', 'Uruguay', 'URU', 'SAM', 82, '4-4-2', '#5cbfeb', '#111111', '#111111', '#ffffff', '#5cbfeb', '#ffffff', [['latin', 1, [0.08, 0.5]]]],
  ['col', 'Colombia', 'COL', 'SAM', 81, '4-2-3-1', '#fcd116', '#003893', '#ce1126', '#003893', '#ffffff', '#003893', [['latin', 1, [0.2, 0.95]]]],
  ['ecu', 'Ecuador', 'ECU', 'SAM', 78, '4-4-2', '#ffdd00', '#034ea2', '#ffdd00', '#034ea2', '#034ea2', '#034ea2', [['latin', 1, [0.35, 0.98]]]],
  ['par', 'Paraguay', 'PAR', 'SAM', 75, '4-4-2', '#ffffff', '#0038a8', '#ffffff', '#0038a8', '#0038a8', '#0038a8', 'latin'],
  ['chi', 'Chile', 'CHI', 'SAM', 74, '4-3-3', '#d52b1e', '#0039a6', '#ffffff', '#ffffff', '#ffffff', '#ffffff', 'latin'],
  ['per', 'Peru', 'PER', 'SAM', 73, '4-2-3-1', '#ffffff', '#ffffff', '#ffffff', '#d91023', '#d91023', '#d91023', [['latin', 1, [0.3, 0.75]]]],
  ['ven', 'Venezuela', 'VEN', 'SAM', 73, '4-4-2', '#7b1e3a', '#ffffff', '#7b1e3a', '#ffffff', '#7b1e3a', '#ffffff', 'latin'],
  ['bol', 'Bolivia', 'BOL', 'SAM', 66, '4-4-2', '#007934', '#ffffff', '#007934', '#ffffff', '#007934', '#ffffff', [['latin', 1, [0.35, 0.7]]]],
  // ---------------- Asia (25)
  ['jpn', 'Japan', 'JPN', 'ASI', 80, '4-2-3-1', '#0b2f8a', '#ffffff', '#0b2f8a', '#ffffff', '#0b2f8a', '#ffffff', 'japanese'],
  ['kor', 'South Korea', 'KOR', 'ASI', 77, '4-2-3-1', '#d6001c', '#111111', '#d6001c', '#ffffff', '#111111', '#ffffff', 'korean'],
  ['irn', 'Iran', 'IRN', 'ASI', 76, '4-4-2', '#ffffff', '#ffffff', '#ffffff', '#da0000', '#da0000', '#da0000', 'persian'],
  ['aus', 'Australia', 'AUS', 'ASI', 75, '4-3-3', '#ffcd00', '#00843d', '#ffcd00', '#00205b', '#00205b', '#00205b', [['english', 0.75], ['slavic', 0.1], ['greek', 0.05], [EA, 0.1]]],
  ['ksa', 'Saudi Arabia', 'KSA', 'ASI', 71, '4-2-3-1', '#ffffff', '#ffffff', '#ffffff', '#006c35', '#006c35', '#006c35', 'arabic'],
  ['qat', 'Qatar', 'QAT', 'ASI', 70, '5-3-2', '#8a1538', '#ffffff', '#8a1538', '#ffffff', '#8a1538', '#ffffff', [['arabic', 0.8], [NA, 0.2]]],
  ['irq', 'Iraq', 'IRQ', 'ASI', 70, '4-2-3-1', '#007a3d', '#ffffff', '#007a3d', '#ffffff', '#007a3d', '#ffffff', 'arabic'],
  ['uzb', 'Uzbekistan', 'UZB', 'ASI', 70, '4-2-3-1', '#ffffff', '#ffffff', '#ffffff', '#0099b5', '#0099b5', '#0099b5', [['turkish', 0.6], ['slavic', 0.4]]],
  ['uae', 'United Arab Emirates', 'UAE', 'ASI', 68, '4-2-3-1', '#ffffff', '#ffffff', '#ffffff', '#ce1126', '#ce1126', '#ce1126', 'arabic'],
  ['jor', 'Jordan', 'JOR', 'ASI', 68, '5-3-2', '#ffffff', '#ffffff', '#ffffff', '#ce1126', '#ce1126', '#ce1126', 'arabic'],
  ['omn', 'Oman', 'OMN', 'ASI', 66, '4-4-2', '#db161b', '#db161b', '#db161b', '#ffffff', '#ffffff', '#ffffff', 'arabic'],
  ['chn', 'China', 'CHN', 'ASI', 66, '4-4-2', '#de2910', '#de2910', '#de2910', '#ffffff', '#ffffff', '#ffffff', 'chinese'],
  ['bhr', 'Bahrain', 'BHR', 'ASI', 64, '5-3-2', '#ce1126', '#ce1126', '#ce1126', '#ffffff', '#ffffff', '#ffffff', 'arabic'],
  ['syr', 'Syria', 'SYR', 'ASI', 63, '4-4-2', '#ce1126', '#ffffff', '#ce1126', '#ffffff', '#000000', '#ffffff', 'arabic'],
  ['ple', 'Palestine', 'PLE', 'ASI', 63, '5-3-2', '#ffffff', '#ffffff', '#ffffff', '#007a3d', '#000000', '#007a3d', 'arabic'],
  ['kgz', 'Kyrgyzstan', 'KGZ', 'ASI', 60, '4-4-2', '#e8112d', '#e8112d', '#e8112d', '#ffffff', '#ffffff', '#ffffff', [['turkish', 0.6], ['slavic', 0.4]]],
  ['vie', 'Vietnam', 'VIE', 'ASI', 63, '3-5-2', '#da251d', '#da251d', '#da251d', '#ffffff', '#ffffff', '#ffffff', 'vietnamese'],
  ['tha', 'Thailand', 'THA', 'ASI', 62, '4-2-3-1', '#1d3c8f', '#1d3c8f', '#1d3c8f', '#ffffff', '#ffffff', '#ffffff', 'seAsian'],
  ['lbn', 'Lebanon', 'LBN', 'ASI', 61, '4-4-2', '#ed1c24', '#ffffff', '#ed1c24', '#ffffff', '#00a651', '#ffffff', 'arabic'],
  ['tjk', 'Tajikistan', 'TJK', 'ASI', 60, '4-4-2', '#ffffff', '#cc0000', '#ffffff', '#cc0000', '#006600', '#cc0000', [['turkish', 0.6], ['persian', 0.4]]],
  ['ind', 'India', 'IND', 'ASI', 58, '4-4-2', '#1e5aa8', '#ffffff', '#1e5aa8', '#ff9933', '#ff9933', '#ff9933', 'southAsian'],
  ['idn', 'Indonesia', 'IDN', 'ASI', 61, '3-5-2', '#ce1126', '#ffffff', '#ce1126', '#ffffff', '#ce1126', '#ffffff', 'seAsian'],
  ['mas', 'Malaysia', 'MAS', 'ASI', 59, '4-4-2', '#ffcc00', '#000000', '#ffcc00', '#000066', '#000066', '#000066', 'seAsian'],
  ['kuw', 'Kuwait', 'KUW', 'ASI', 59, '4-4-2', '#0060a8', '#ffffff', '#0060a8', '#ffffff', '#ffffff', '#ffffff', 'arabic'],
  ['hkg', 'Hong Kong', 'HKG', 'ASI', 57, '4-4-2', '#de2910', '#ffffff', '#de2910', '#ffffff', '#de2910', '#ffffff', [['chinese', 0.85], ['english', 0.15]]],
  // ---------------- North & Central America (16)
  ['usa', 'United States', 'USA', 'NCA', 78, '4-3-3', '#ffffff', '#0a3161', '#ffffff', '#0a3161', '#0a3161', '#b31942', [['english', 0.55], ['latin', 0.2], ['caribbean', 0.2], ['german', 0.05]]],
  ['mex', 'Mexico', 'MEX', 'NCA', 78, '4-3-3', '#006847', '#ffffff', '#ce1126', '#ffffff', '#006847', '#ffffff', [['latin', 1, [0.25, 0.6]]]],
  ['can', 'Canada', 'CAN', 'NCA', 76, '4-4-2', '#d80621', '#d80621', '#d80621', '#ffffff', '#ffffff', '#ffffff', [['english', 0.5], ['caribbean', 0.2], [WA, 0.1], ['french', 0.2]]],
  ['crc', 'Costa Rica', 'CRC', 'NCA', 71, '5-3-2', '#ce1126', '#002b7f', '#ffffff', '#ffffff', '#002b7f', '#ffffff', 'latin'],
  ['pan', 'Panama', 'PAN', 'NCA', 71, '4-4-2', '#da121a', '#da121a', '#da121a', '#ffffff', '#072357', '#ffffff', [['latin', 1, [0.5, 0.95]]]],
  ['jam', 'Jamaica', 'JAM', 'NCA', 70, '4-4-2', '#fed100', '#000000', '#fed100', '#009b3a', '#009b3a', '#009b3a', 'caribbean'],
  ['hon', 'Honduras', 'HON', 'NCA', 67, '4-4-2', '#ffffff', '#ffffff', '#ffffff', '#0073cf', '#0073cf', '#0073cf', [['latin', 1, [0.3, 0.95]]]],
  ['slv', 'El Salvador', 'SLV', 'NCA', 63, '4-4-2', '#0047ab', '#0047ab', '#0047ab', '#ffffff', '#ffffff', '#ffffff', 'latin'],
  ['hai', 'Haiti', 'HAI', 'NCA', 63, '4-4-2', '#00209f', '#d21034', '#00209f', '#d21034', '#00209f', '#d21034', [['french', 1, [0.75, 1]]]],
  ['tri', 'Trinidad and Tobago', 'TRI', 'NCA', 62, '4-4-2', '#ce1126', '#000000', '#ce1126', '#ffffff', '#ffffff', '#ffffff', [['caribbean', 0.8], ['southAsian', 0.2]]],
  ['gua', 'Guatemala', 'GUA', 'NCA', 63, '4-4-2', '#4997d0', '#ffffff', '#4997d0', '#ffffff', '#4997d0', '#ffffff', [['latin', 1, [0.35, 0.7]]]],
  ['cuw', 'Curaçao', 'CUW', 'NCA', 64, '4-3-3', '#002b7f', '#002b7f', '#002b7f', '#f9e814', '#002b7f', '#f9e814', [['dutch', 0.5, [0.6, 0.95]], ['caribbean', 0.5]]],
  ['nca', 'Nicaragua', 'NCA', 'NCA', 59, '4-4-2', '#0067c6', '#ffffff', '#0067c6', '#ffffff', '#0067c6', '#ffffff', 'latin'],
  ['sur', 'Suriname', 'SUR', 'NCA', 62, '4-4-2', '#377e3f', '#ffffff', '#377e3f', '#ffffff', '#b40a2d', '#ffffff', [['dutch', 0.6, [0.6, 0.95]], ['caribbean', 0.4]]],
  ['cub', 'Cuba', 'CUB', 'NCA', 57, '4-4-2', '#cf142b', '#ffffff', '#cf142b', '#ffffff', '#002a8f', '#ffffff', [['latin', 1, [0.3, 0.95]]]],
  ['dom', 'Dominican Republic', 'DOM', 'NCA', 58, '4-4-2', '#002d62', '#ffffff', '#ce1126', '#ffffff', '#002d62', '#ffffff', [['latin', 1, [0.4, 0.95]]]],
  // ---------------- Oceania (3)
  ['nzl', 'New Zealand', 'NZL', 'OCE', 68, '4-4-2', '#ffffff', '#000000', '#ffffff', '#000000', '#000000', '#000000', [['english', 0.8], ['pacific', 0.2]]],
  ['fij', 'Fiji', 'FIJ', 'OCE', 58, '4-4-2', '#ffffff', '#000000', '#ffffff', '#62b5e5', '#62b5e5', '#62b5e5', 'pacific'],
  ['png', 'Papua New Guinea', 'PNG', 'OCE', 55, '4-4-2', '#ce1126', '#000000', '#fcd116', '#000000', '#000000', '#000000', [['pacific', 1, [0.6, 0.9]]]],
];

// Deterministic play style derived from rating with a per-team flavour.
function deriveStyle(id, rating) {
  const r = mulberry32(hashString('style:' + id));
  const base = (rating - 55) / 35 * 50 + 40; // 55→40 .. 90→90
  const s = () => Math.round(clamp(base + (r() - 0.5) * 24, 1, 100));
  return { attack: s(), defence: s(), pace: s(), passing: s() };
}

function normPop(pop) {
  if (typeof pop === 'string') return [[pop, 1]];
  return pop;
}

export const NATIONS = N.map(([id, name, short, confed, rating, formation, s, sh, so, as, ash, aso, pop]) => ({
  id, name, short, confed, kind: 'nation', country: id,
  colors: { shirt: s, shorts: sh, socks: so, alt: { shirt: as, shorts: ash, socks: aso } },
  rating, style: deriveStyle(id, rating), formation,
  pop: normPop(pop),
}));

// ============================================================ clubs
// League ids are internal keys: 'alb' England, 'ibe' Spain, 'pen' Italy, 'teu' Germany,
// 'hex' France, 'afr' Africa, plus pool 'row' (rest-of-world, no league).
export const LEAGUES = [
  { id: 'alb', name: 'Premier League', country: 'eng', confed: 'EUR', size: 20 },
  { id: 'ibe', name: 'La Liga', country: 'esp', confed: 'EUR', size: 20 },
  { id: 'pen', name: 'Serie A', country: 'ita', confed: 'EUR', size: 20 },
  { id: 'teu', name: 'Bundesliga', country: 'ger', confed: 'EUR', size: 18 },
  { id: 'hex', name: 'Ligue 1', country: 'fra', confed: 'EUR', size: 18 },
  { id: 'afr', name: 'CAF Champions League', country: null, confed: 'AFR', size: 16 },
  { id: 'low', name: 'Eredivisie', country: 'ned', confed: 'EUR', size: 16 },
  { id: 'lus', name: 'Primeira Liga', country: 'por', confed: 'EUR', size: 16 },
  { id: 'ana', name: 'Süper Lig', country: 'tur', confed: 'EUR', size: 16 },
  { id: 'cal', name: 'Scottish Premiership', country: 'sco', confed: 'EUR', size: 12 },
  { id: 'bsr', name: 'Campeonato Brasileiro Série A', country: 'bra', confed: 'SAM', size: 16 },
  { id: 'pla', name: 'Liga Profesional Argentina', country: 'arg', confed: 'SAM', size: 16 },
  { id: 'cam', name: 'Major League Soccer', country: 'usa', confed: 'NCA', size: 16 },
  { id: 'gul', name: 'Saudi Pro League', country: 'ksa', confed: 'ASI', size: 14 },
  // Second tiers (promotion/relegation with the league named in `above`).
  { id: 'alb2', name: 'EFL Championship', country: 'eng', confed: 'EUR', size: 22, tier: 2, above: 'alb' },
  { id: 'ibe2', name: 'Segunda División', country: 'esp', confed: 'EUR', size: 22, tier: 2, above: 'ibe' },
];

// [name, short, rating, shirt, shorts, socks, altShirt, altShorts, altSocks, country?]
const C = {
  low: [
    ['PSV Eindhoven', 'PSV', 80, '#ff69b4', '#ffffff', '#ff69b4', '#f26522', '#111111', '#f26522'],
    ['Feyenoord', 'FEY', 79, '#6cabdd', '#ffffff', '#6cabdd', '#7a263a', '#111111', '#7a263a'],
    ['AFC Ajax', 'AJA', 78, '#7a263a', '#ffffff', '#7a263a', '#003a70', '#111111', '#003a70'],
    ['AZ Alkmaar', 'AZA', 77, '#d4ff00', '#ffffff', '#d4ff00', '#ff69b4', '#111111', '#ff69b4'],
    ['FC Twente', 'TWE', 76, '#fdb913', '#ffffff', '#fdb913', '#00a650', '#111111', '#00a650'],
    ['FC Utrecht', 'UTR', 75, '#ffffff', '#111111', '#ffffff', '#5b2c6f', '#111111', '#5b2c6f'],
    ['Go Ahead Eagles', 'GAE', 74, '#2d9cdb', '#ffffff', '#2d9cdb', '#ffffff', '#111111', '#ffffff'],
    ['Sparta Rotterdam', 'SPR', 73, '#00a650', '#ffffff', '#00a650', '#e2001a', '#111111', '#e2001a'],
    ['SC Heerenveen', 'HEE', 72, '#111111', '#ffffff', '#111111', '#d4ff00', '#111111', '#d4ff00'],
    ['FC Groningen', 'GRO', 71, '#003a70', '#ffffff', '#003a70', '#1b3f8b', '#111111', '#1b3f8b'],
    ['NEC Nijmegen', 'NEC', 70, '#1b3f8b', '#ffffff', '#1b3f8b', '#6cabdd', '#111111', '#6cabdd'],
    ['Fortuna Sittard', 'FOS', 69, '#f26522', '#ffffff', '#f26522', '#111111', '#111111', '#111111'],
    ['PEC Zwolle', 'ZWO', 68, '#e2001a', '#ffffff', '#e2001a', '#006241', '#111111', '#006241'],
    ['Heracles Almelo', 'HER', 67, '#c8102e', '#ffffff', '#c8102e', '#2d9cdb', '#111111', '#2d9cdb'],
    ['RKC Waalwijk', 'RKC', 66, '#5b2c6f', '#ffffff', '#5b2c6f', '#c8102e', '#111111', '#c8102e'],
    ['FC Volendam', 'VOL', 65, '#006241', '#ffffff', '#006241', '#fdb913', '#111111', '#fdb913'],
  ],
  lus: [
    ['FC Porto', 'FCP', 81, '#d4ff00', '#ffffff', '#d4ff00', '#5b2c6f', '#111111', '#5b2c6f'],
    ['SL Benfica', 'SLB', 80, '#fdb913', '#ffffff', '#fdb913', '#ffffff', '#111111', '#ffffff'],
    ['SC Braga', 'SCB', 79, '#ffffff', '#111111', '#ffffff', '#e2001a', '#111111', '#e2001a'],
    ['Sporting CP', 'SCP', 78, '#2d9cdb', '#ffffff', '#2d9cdb', '#d4ff00', '#111111', '#d4ff00'],
    ['Vitória SC', 'VSC', 77, '#00a650', '#ffffff', '#00a650', '#1b3f8b', '#111111', '#1b3f8b'],
    ['FC Famalicão', 'FAM', 76, '#111111', '#ffffff', '#111111', '#6cabdd', '#111111', '#6cabdd'],
    ['Boavista FC', 'BOA', 75, '#003a70', '#ffffff', '#003a70', '#111111', '#111111', '#111111'],
    ['Estoril Praia', 'ESP', 74, '#1b3f8b', '#ffffff', '#1b3f8b', '#006241', '#111111', '#006241'],
    ['Gil Vicente FC', 'GIL', 73, '#f26522', '#ffffff', '#f26522', '#2d9cdb', '#111111', '#2d9cdb'],
    ['Moreirense FC', 'MOR', 72, '#e2001a', '#ffffff', '#e2001a', '#c8102e', '#111111', '#c8102e'],
    ['Rio Ave FC', 'RAV', 71, '#c8102e', '#ffffff', '#c8102e', '#fdb913', '#111111', '#fdb913'],
    ['FC Arouca', 'ARO', 70, '#5b2c6f', '#ffffff', '#5b2c6f', '#f26522', '#111111', '#f26522'],
    ['Casa Pia AC', 'CPA', 69, '#006241', '#ffffff', '#006241', '#7a263a', '#111111', '#7a263a'],
    ['CD Santa Clara', 'SCL', 68, '#ff69b4', '#ffffff', '#ff69b4', '#003a70', '#111111', '#003a70'],
    ['CD Nacional', 'MAD', 67, '#6cabdd', '#ffffff', '#6cabdd', '#ff69b4', '#111111', '#ff69b4'],
    ['Estrela da Amadora', 'EDA', 66, '#7a263a', '#ffffff', '#7a263a', '#00a650', '#111111', '#00a650'],
  ],
  ana: [
    ['Galatasaray SK', 'GAL', 77, '#003a70', '#ffffff', '#003a70', '#fdb913', '#111111', '#fdb913'],
    ['Fenerbahçe SK', 'FEN', 76, '#1b3f8b', '#ffffff', '#1b3f8b', '#f26522', '#111111', '#f26522'],
    ['Beşiktaş JK', 'BJK', 75, '#f26522', '#ffffff', '#f26522', '#7a263a', '#111111', '#7a263a'],
    ['Trabzonspor', 'TRA', 74, '#e2001a', '#ffffff', '#e2001a', '#003a70', '#111111', '#003a70'],
    ['İstanbul Başakşehir FK', 'IBB', 73, '#c8102e', '#ffffff', '#c8102e', '#ff69b4', '#111111', '#ff69b4'],
    ['Samsunspor', 'SAM', 72, '#5b2c6f', '#ffffff', '#5b2c6f', '#00a650', '#111111', '#00a650'],
    ['Göztepe SK', 'GOZ', 71, '#006241', '#ffffff', '#006241', '#5b2c6f', '#111111', '#5b2c6f'],
    ['Konyaspor', 'KON', 70, '#ff69b4', '#ffffff', '#ff69b4', '#ffffff', '#111111', '#ffffff'],
    ['Antalyaspor', 'ANT', 69, '#6cabdd', '#ffffff', '#6cabdd', '#e2001a', '#111111', '#e2001a'],
    ['Kayserispor', 'KYS', 68, '#7a263a', '#ffffff', '#7a263a', '#d4ff00', '#111111', '#d4ff00'],
    ['Gaziantep FK', 'GZP', 67, '#d4ff00', '#ffffff', '#d4ff00', '#1b3f8b', '#111111', '#1b3f8b'],
    ['Alanyaspor', 'ALA', 66, '#fdb913', '#ffffff', '#fdb913', '#6cabdd', '#111111', '#6cabdd'],
    ['Kasımpaşa SK', 'KAS', 65, '#ffffff', '#111111', '#ffffff', '#111111', '#111111', '#111111'],
    ['Rizespor', 'RIZ', 64, '#2d9cdb', '#ffffff', '#2d9cdb', '#006241', '#111111', '#006241'],
    ['Eyüpspor', 'EYU', 63, '#00a650', '#ffffff', '#00a650', '#2d9cdb', '#111111', '#2d9cdb'],
    ['Sivasspor', 'SVS', 62, '#111111', '#ffffff', '#111111', '#c8102e', '#111111', '#c8102e'],
  ],
  cal: [
    ['Celtic FC', 'CEL', 74, '#ffffff', '#111111', '#ffffff', '#ff69b4', '#111111', '#ff69b4'],
    ['Rangers FC', 'RAN', 73, '#2d9cdb', '#ffffff', '#2d9cdb', '#00a650', '#111111', '#00a650'],
    ['Heart of Midlothian', 'HEA', 72, '#00a650', '#ffffff', '#00a650', '#5b2c6f', '#111111', '#5b2c6f'],
    ['Hibernian FC', 'HIB', 71, '#111111', '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff'],
    ['Aberdeen FC', 'ABE', 70, '#003a70', '#ffffff', '#003a70', '#e2001a', '#111111', '#e2001a'],
    ['Dundee United FC', 'DUU', 69, '#1b3f8b', '#ffffff', '#1b3f8b', '#d4ff00', '#111111', '#d4ff00'],
    ['Kilmarnock FC', 'KIL', 68, '#f26522', '#ffffff', '#f26522', '#1b3f8b', '#111111', '#1b3f8b'],
    ['Motherwell FC', 'MOT', 67, '#e2001a', '#ffffff', '#e2001a', '#6cabdd', '#111111', '#6cabdd'],
    ['St Mirren FC', 'STM', 66, '#c8102e', '#ffffff', '#c8102e', '#111111', '#111111', '#111111'],
    ['Dundee FC', 'DUN', 65, '#5b2c6f', '#ffffff', '#5b2c6f', '#006241', '#111111', '#006241'],
    ['Ross County FC', 'ROS', 64, '#006241', '#ffffff', '#006241', '#2d9cdb', '#111111', '#2d9cdb'],
    ['St Johnstone FC', 'SJO', 63, '#ff69b4', '#ffffff', '#ff69b4', '#c8102e', '#111111', '#c8102e'],
  ],
  bsr: [
    ['CR Flamengo', 'FLA', 85, '#c8102e', '#ffffff', '#c8102e', '#111111', '#111111', '#111111'],
    ['SE Palmeiras', 'PAL', 84, '#5b2c6f', '#ffffff', '#5b2c6f', '#006241', '#111111', '#006241'],
    ['São Paulo FC', 'SAO', 83, '#006241', '#ffffff', '#006241', '#2d9cdb', '#111111', '#2d9cdb'],
    ['Sport Club Corinthians Paulista', 'COR', 82, '#ff69b4', '#ffffff', '#ff69b4', '#c8102e', '#111111', '#c8102e'],
    ['Santos FC', 'SAN', 81, '#6cabdd', '#ffffff', '#6cabdd', '#fdb913', '#111111', '#fdb913'],
    ['Botafogo FR', 'BOT', 80, '#7a263a', '#ffffff', '#7a263a', '#f26522', '#111111', '#f26522'],
    ['Fluminense FC', 'FLU', 79, '#d4ff00', '#ffffff', '#d4ff00', '#7a263a', '#111111', '#7a263a'],
    ['CR Vasco da Gama', 'VAS', 78, '#fdb913', '#ffffff', '#fdb913', '#003a70', '#111111', '#003a70'],
    ['Grêmio FBPA', 'GRE', 77, '#ffffff', '#111111', '#ffffff', '#ff69b4', '#111111', '#ff69b4'],
    ['SC Internacional', 'INT', 76, '#2d9cdb', '#ffffff', '#2d9cdb', '#00a650', '#111111', '#00a650'],
    ['Clube Atlético Mineiro', 'CAM', 75, '#00a650', '#ffffff', '#00a650', '#5b2c6f', '#111111', '#5b2c6f'],
    ['Cruzeiro EC', 'CRU', 74, '#111111', '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff'],
    ['EC Bahia', 'BAH', 73, '#003a70', '#ffffff', '#003a70', '#e2001a', '#111111', '#e2001a'],
    ['Fortaleza EC', 'FEC', 72, '#1b3f8b', '#ffffff', '#1b3f8b', '#d4ff00', '#111111', '#d4ff00'],
    ['Athletico Paranaense', 'CAP', 71, '#f26522', '#ffffff', '#f26522', '#1b3f8b', '#111111', '#1b3f8b'],
    ['RB Bragantino', 'RBB', 70, '#e2001a', '#ffffff', '#e2001a', '#6cabdd', '#111111', '#6cabdd'],
  ],
  pla: [
    ['Boca Juniors', 'BOC', 84, '#ff69b4', '#ffffff', '#ff69b4', '#f26522', '#111111', '#f26522'],
    ['CA River Plate', 'RIV', 83, '#6cabdd', '#ffffff', '#6cabdd', '#7a263a', '#111111', '#7a263a'],
    ['Rosario Central', 'RCE', 82, '#7a263a', '#ffffff', '#7a263a', '#003a70', '#111111', '#003a70'],
    ['Talleres de Córdoba', 'TAL', 81, '#d4ff00', '#ffffff', '#d4ff00', '#ff69b4', '#111111', '#ff69b4'],
    ['Estudiantes de La Plata', 'EDL', 80, '#fdb913', '#ffffff', '#fdb913', '#00a650', '#111111', '#00a650'],
    ['CA Independiente', 'IND', 79, '#ffffff', '#111111', '#ffffff', '#5b2c6f', '#111111', '#5b2c6f'],
    ['Racing Club', 'RAC', 78, '#2d9cdb', '#ffffff', '#2d9cdb', '#ffffff', '#111111', '#ffffff'],
    ['CA San Lorenzo de Almagro', 'SLA', 77, '#00a650', '#ffffff', '#00a650', '#e2001a', '#111111', '#e2001a'],
    ['Unión de Santa Fe', 'UNI', 76, '#111111', '#ffffff', '#111111', '#d4ff00', '#111111', '#d4ff00'],
    ["Newell's Old Boys", 'NOB', 75, '#003a70', '#ffffff', '#003a70', '#1b3f8b', '#111111', '#1b3f8b'],
    ['CA Lanús', 'LAN', 74, '#1b3f8b', '#ffffff', '#1b3f8b', '#6cabdd', '#111111', '#6cabdd'],
    ['Defensa y Justicia', 'DYJ', 73, '#f26522', '#ffffff', '#f26522', '#111111', '#111111', '#111111'],
    ['Argentinos Juniors', 'ARG', 72, '#e2001a', '#ffffff', '#e2001a', '#006241', '#111111', '#006241'],
    ['Godoy Cruz', 'GOD', 71, '#c8102e', '#ffffff', '#c8102e', '#2d9cdb', '#111111', '#2d9cdb'],
    ['CA Huracán', 'HUR', 70, '#5b2c6f', '#ffffff', '#5b2c6f', '#c8102e', '#111111', '#c8102e'],
    ['CA Vélez Sarsfield', 'VEL', 69, '#006241', '#ffffff', '#006241', '#fdb913', '#111111', '#fdb913'],
  ],
  cam: [
    ['New York Red Bulls', 'NYR', 76, '#e2001a', '#ffffff', '#e2001a', '#00a650', '#111111', '#00a650'],
    ['LA Galaxy', 'LAG', 75, '#c8102e', '#ffffff', '#c8102e', '#5b2c6f', '#111111', '#5b2c6f'],
    ['Seattle Sounders FC', 'SEA', 74, '#5b2c6f', '#ffffff', '#5b2c6f', '#ffffff', '#111111', '#ffffff'],
    ['Atlanta United FC', 'ATL', 73, '#006241', '#ffffff', '#006241', '#e2001a', '#111111', '#e2001a'],
    ['Inter Miami CF', 'MIA', 72, '#ff69b4', '#ffffff', '#ff69b4', '#d4ff00', '#111111', '#d4ff00'],
    ['Chicago Fire FC', 'CHI', 71, '#6cabdd', '#ffffff', '#6cabdd', '#1b3f8b', '#111111', '#1b3f8b'],
    ['Houston Dynamo FC', 'HOU', 70, '#7a263a', '#ffffff', '#7a263a', '#6cabdd', '#111111', '#6cabdd'],
    ['Portland Timbers', 'POR', 69, '#d4ff00', '#ffffff', '#d4ff00', '#111111', '#111111', '#111111'],
    ['Toronto FC', 'TFC', 68, '#fdb913', '#ffffff', '#fdb913', '#006241', '#111111', '#006241'],
    ['FC Dallas', 'DAL', 67, '#ffffff', '#111111', '#ffffff', '#2d9cdb', '#111111', '#2d9cdb'],
    ['New England Revolution', 'NER', 66, '#2d9cdb', '#ffffff', '#2d9cdb', '#c8102e', '#111111', '#c8102e'],
    ['Colorado Rapids', 'COL', 65, '#00a650', '#ffffff', '#00a650', '#fdb913', '#111111', '#fdb913'],
    ['Austin FC', 'AUS', 64, '#111111', '#ffffff', '#111111', '#f26522', '#111111', '#f26522'],
    ['CF Montréal', 'MTL', 63, '#003a70', '#ffffff', '#003a70', '#7a263a', '#111111', '#7a263a'],
    ['Vancouver Whitecaps FC', 'VAN', 62, '#1b3f8b', '#ffffff', '#1b3f8b', '#003a70', '#111111', '#003a70'],
    ['San Diego FC', 'SDG', 61, '#f26522', '#ffffff', '#f26522', '#ff69b4', '#111111', '#ff69b4'],
  ],
  gul: [
    ['Al Hilal', 'HIL', 75, '#006241', '#ffffff', '#006241', '#1b3f8b', '#111111', '#1b3f8b'],
    ['Al Ittihad', 'ITT', 74, '#ff69b4', '#ffffff', '#ff69b4', '#6cabdd', '#111111', '#6cabdd'],
    ['Al Nassr', 'NAS', 73, '#6cabdd', '#ffffff', '#6cabdd', '#111111', '#111111', '#111111'],
    ['Al Ahli Saudi FC', 'AHS', 72, '#7a263a', '#ffffff', '#7a263a', '#006241', '#111111', '#006241'],
    ['Al Ettifaq', 'ETT', 71, '#d4ff00', '#ffffff', '#d4ff00', '#2d9cdb', '#111111', '#2d9cdb'],
    ['Al Shabab', 'SHB', 70, '#fdb913', '#ffffff', '#fdb913', '#c8102e', '#111111', '#c8102e'],
    ['Al Qadsiah', 'QAD', 69, '#ffffff', '#111111', '#ffffff', '#fdb913', '#111111', '#fdb913'],
    ['Al Fateh', 'FAT', 68, '#2d9cdb', '#ffffff', '#2d9cdb', '#f26522', '#111111', '#f26522'],
    ['Al Taawoun', 'TAA', 67, '#00a650', '#ffffff', '#00a650', '#7a263a', '#111111', '#7a263a'],
    ['Al Riyadh SC', 'RIY', 66, '#111111', '#ffffff', '#111111', '#003a70', '#111111', '#003a70'],
    ['Al Okhdood', 'OKH', 65, '#003a70', '#ffffff', '#003a70', '#ff69b4', '#111111', '#ff69b4'],
    ['Al Raed', 'RAE', 64, '#1b3f8b', '#ffffff', '#1b3f8b', '#00a650', '#111111', '#00a650'],
    ['Al Fayha', 'FAY', 63, '#f26522', '#ffffff', '#f26522', '#5b2c6f', '#111111', '#5b2c6f'],
    ['Damac FC', 'DAM', 62, '#e2001a', '#ffffff', '#e2001a', '#ffffff', '#111111', '#ffffff'],
  ],
  alb: [
    ['Arsenal FC', 'ARS', 87, '#1b3f8b', '#ffffff', '#1b3f8b', '#f2c230', '#1b3f8b', '#f2c230'],
    ['Manchester City', 'MCI', 86, '#c8102e', '#ffffff', '#c8102e', '#ffffff', '#111111', '#ffffff'],
    ['Liverpool FC', 'LIV', 84, '#6cabdd', '#0b1f4b', '#6cabdd', '#0b1f4b', '#0b1f4b', '#0b1f4b'],
    ['Chelsea FC', 'CHE', 82, '#ffffff', '#0b1f4b', '#ffffff', '#3d195b', '#3d195b', '#3d195b'],
    ['Manchester United', 'MUN', 80, '#0057b8', '#0057b8', '#ffffff', '#f5f5f5', '#0057b8', '#f5f5f5'],
    ['Tottenham Hotspur', 'TOT', 78, '#fdb913', '#111111', '#fdb913', '#111111', '#fdb913', '#111111'],
    ['Newcastle United', 'NEW', 77, '#111111', '#111111', '#111111', '#e4e4e4', '#111111', '#e4e4e4'],
    ['Aston Villa', 'AVL', 76, '#7a263a', '#7a263a', '#7a263a', '#9bd3f5', '#ffffff', '#9bd3f5'],
    ['West Ham United', 'WHU', 75, '#00a650', '#ffffff', '#00a650', '#ffffff', '#00a650', '#ffffff'],
    ['Brighton & Hove Albion', 'BHA', 74, '#f26522', '#111111', '#f26522', '#ffffff', '#f26522', '#ffffff'],
    ['Everton FC', 'EVE', 73, '#e2001a', '#111111', '#111111', '#ffe600', '#111111', '#ffe600'],
    ['AFC Bournemouth', 'BOU', 72, '#003a70', '#003a70', '#c8a200', '#c8a200', '#003a70', '#003a70'],
    ['Fulham FC', 'FUL', 71, '#d71920', '#d71920', '#ffffff', '#003399', '#ffffff', '#003399'],
    ['Brentford FC', 'BRE', 70, '#5b2c6f', '#ffffff', '#5b2c6f', '#d4ff00', '#5b2c6f', '#d4ff00'],
    ['Crystal Palace', 'CRY', 69, '#2d9cdb', '#ffffff', '#ffffff', '#2b2b2b', '#2b2b2b', '#2d9cdb'],
    ['Wolverhampton Wanderers', 'WOL', 68, '#ffffff', '#c8102e', '#c8102e', '#c8102e', '#c8102e', '#ffffff'],
    ['Nottingham Forest', 'NFO', 67, '#006241', '#111111', '#006241', '#ffd200', '#006241', '#ffd200'],
    ['Leeds United', 'LEE', 66, '#222222', '#c8a200', '#222222', '#c8a200', '#222222', '#c8a200'],
    ['Sunderland AFC', 'SUN', 64, '#8a8d91', '#1b1b1b', '#8a8d91', '#e35205', '#1b1b1b', '#e35205'],
    ['Burnley FC', 'BUR', 62, '#0b6b3a', '#f0e6c8', '#0b6b3a', '#f0e6c8', '#0b6b3a', '#f0e6c8'],
  ],
  ibe: [
    ['Real Madrid CF', 'RMA', 88, '#ffffff', '#ffffff', '#ffffff', '#3b2a6b', '#3b2a6b', '#3b2a6b'],
    ['FC Barcelona', 'FCB', 86, '#a50044', '#004d98', '#a50044', '#ffd700', '#a50044', '#ffd700'],
    ['Atlético de Madrid', 'ATM', 84, '#d1001f', '#ffffff', '#d1001f', '#14213d', '#14213d', '#d1001f'],
    ['Athletic Club', 'ATH', 82, '#e9e3cf', '#0a2a66', '#0a2a66', '#0a2a66', '#e9e3cf', '#e9e3cf'],
    ['Real Sociedad', 'RSO', 80, '#ffd400', '#0055a4', '#ffd400', '#0055a4', '#ffd400', '#0055a4'],
    ['Villarreal CF', 'VIL', 78, '#00843d', '#ffffff', '#00843d', '#ffffff', '#00843d', '#ffffff'],
    ['Real Betis', 'BET', 77, '#ff7f00', '#111111', '#111111', '#111111', '#ff7f00', '#ff7f00'],
    ['Girona FC', 'GIR', 76, '#0f5aa6', '#0f5aa6', '#0f5aa6', '#ffffff', '#ffffff', '#0f5aa6'],
    ['Valencia CF', 'VCF', 75, '#c4161c', '#111111', '#111111', '#f2f2f2', '#c4161c', '#f2f2f2'],
    ['Sevilla FC', 'SEV', 74, '#556b2f', '#ffffff', '#556b2f', '#f5deb3', '#556b2f', '#f5deb3'],
    ['CA Osasuna', 'OSA', 73, '#9b1b30', '#ffffff', '#ffffff', '#ffffff', '#9b1b30', '#9b1b30'],
    ['Getafe CF', 'GET', 72, '#00a3e0', '#ffffff', '#00a3e0', '#ffffff', '#00a3e0', '#ffffff'],
    ['RC Celta de Vigo', 'VIG', 71, '#7d4e24', '#ffffff', '#7d4e24', '#e0c080', '#7d4e24', '#e0c080'],
    ['RCD Mallorca', 'MLL', 70, '#ffffff', '#111111', '#111111', '#111111', '#111111', '#ffffff'],
    ['Rayo Vallecano', 'RAY', 69, '#e30613', '#e30613', '#e30613', '#ffe600', '#ffe600', '#ffe600'],
    ['Deportivo Alavés', 'ALV', 68, '#2a5caa', '#2a5caa', '#ffffff', '#ff6f61', '#ffffff', '#ff6f61'],
    ['Elche CF', 'ELC', 67, '#ffffff', '#1f3c88', '#1f3c88', '#1f3c88', '#1f3c88', '#1f3c88'],
    ['Levante UD', 'LEV', 66, '#f9a01b', '#f9a01b', '#111111', '#4b2e83', '#4b2e83', '#4b2e83'],
    ['RCD Espanyol', 'ESP', 64, '#e4c590', '#5c3b1e', '#e4c590', '#5c3b1e', '#e4c590', '#5c3b1e'],
    ['Real Oviedo', 'OVI', 62, '#14532d', '#14532d', '#ffffff', '#ffffff', '#14532d', '#ffffff'],
  ],
  pen: [
    ['FC Internazionale Milano', 'INT', 87, '#111111', '#ffffff', '#111111', '#ffffff', '#ffffff', '#ffffff'],
    ['SSC Napoli', 'NAP', 86, '#d4a017', '#0b1f4b', '#0b1f4b', '#0b1f4b', '#d4a017', '#d4a017'],
    ['AC Milan', 'MIL', 84, '#0a3d91', '#111111', '#0a3d91', '#ffffff', '#0a3d91', '#ffffff'],
    ['Juventus FC', 'JUV', 82, '#1a7a3c', '#ffffff', '#1a7a3c', '#ffffff', '#1a7a3c', '#ffffff'],
    ['AS Roma', 'ROM', 80, '#8b0000', '#ffd700', '#8b0000', '#ffd700', '#8b0000', '#ffd700'],
    ['Atalanta BC', 'ATA', 78, '#87ceeb', '#ffffff', '#87ceeb', '#1c1c3c', '#1c1c3c', '#87ceeb'],
    ['Bologna FC 1909', 'BFC', 77, '#5a2d82', '#ffffff', '#5a2d82', '#ffffff', '#5a2d82', '#5a2d82'],
    ['SS Lazio', 'LAZ', 76, '#e0001b', '#0047ab', '#e0001b', '#0047ab', '#ffffff', '#0047ab'],
    ['ACF Fiorentina', 'FIO', 75, '#ffcc00', '#c8102e', '#c8102e', '#c8102e', '#ffcc00', '#ffcc00'],
    ['Torino FC', 'TOR', 74, '#b22222', '#b22222', '#b22222', '#f5f5f5', '#f5f5f5', '#b22222'],
    ['Como 1907', 'COM', 73, '#ffffff', '#87ceeb', '#ffffff', '#87ceeb', '#87ceeb', '#87ceeb'],
    ['Genoa CFC', 'GEN', 72, '#008080', '#ffffff', '#008080', '#ffffff', '#008080', '#ffffff'],
    ['Udinese Calcio', 'UDI', 71, '#ffffff', '#ffffff', '#c8102e', '#c8102e', '#c8102e', '#ffffff'],
    ['Parma Calcio 1913', 'PAR', 70, '#ff8c00', '#0b1f4b', '#ff8c00', '#0b1f4b', '#ff8c00', '#0b1f4b'],
    ['Cagliari Calcio', 'CAG', 69, '#1c1c1c', '#00a86b', '#1c1c1c', '#00a86b', '#1c1c1c', '#00a86b'],
    ['US Lecce', 'LEC', 68, '#7b3f00', '#ffffff', '#7b3f00', '#ffffff', '#7b3f00', '#ffffff'],
    ['US Sassuolo Calcio', 'SAS', 67, '#4169e1', '#ffffff', '#ffffff', '#ffffff', '#4169e1', '#4169e1'],
    ['US Cremonese', 'CRE', 66, '#ffd700', '#ffd700', '#0047ab', '#0047ab', '#0047ab', '#ffd700'],
    ['AC Pisa 1909', 'PIS', 64, '#9acd32', '#1c1c1c', '#9acd32', '#1c1c1c', '#9acd32', '#1c1c1c'],
    ['Hellas Verona', 'VER', 62, '#e75480', '#1c1c1c', '#e75480', '#1c1c1c', '#e75480', '#1c1c1c'],
  ],
  teu: [
    ['FC Bayern München', 'BAY', 88, '#dc052d', '#ffffff', '#dc052d', '#ffffff', '#dc052d', '#ffffff'],
    ['Bayer 04 Leverkusen', 'B04', 85, '#fde100', '#111111', '#fde100', '#111111', '#fde100', '#111111'],
    ['Borussia Dortmund', 'BVB', 83, '#1c3f94', '#ffffff', '#1c3f94', '#ffffff', '#1c3f94', '#ffffff'],
    ['RB Leipzig', 'RBL', 81, '#1e8c3a', '#ffffff', '#1e8c3a', '#ffffff', '#1e8c3a', '#1e8c3a'],
    ['VfB Stuttgart', 'VFB', 79, '#ffffff', '#c8102e', '#c8102e', '#c8102e', '#ffffff', '#ffffff'],
    ['Eintracht Frankfurt', 'SGE', 77, '#ff8200', '#ffffff', '#ff8200', '#ffffff', '#ff8200', '#ffffff'],
    ['VfL Wolfsburg', 'WOB', 76, '#14532d', '#14532d', '#ffffff', '#ffffff', '#ffffff', '#14532d'],
    ['Borussia Mönchengladbach', 'BMG', 75, '#00205b', '#00205b', '#00205b', '#87ceeb', '#00205b', '#87ceeb'],
    ['SC Freiburg', 'SCF', 74, '#6a0dad', '#ffffff', '#6a0dad', '#ffffff', '#6a0dad', '#ffffff'],
    ['SV Werder Bremen', 'SVW', 73, '#8a8d91', '#111111', '#111111', '#111111', '#8a8d91', '#8a8d91'],
    ['1. FC Union Berlin', 'FCU', 72, '#00a3e0', '#00a3e0', '#ffffff', '#ffffff', '#00a3e0', '#00a3e0'],
    ['TSG 1899 Hoffenheim', 'TSG', 71, '#c8102e', '#111111', '#c8102e', '#111111', '#111111', '#c8102e'],
    ['1. FSV Mainz 05', 'M05', 70, '#ffffff', '#1c3f94', '#1c3f94', '#1c3f94', '#1c3f94', '#ffffff'],
    ['FC Augsburg', 'FCA', 69, '#5c4033', '#f5deb3', '#5c4033', '#f5deb3', '#5c4033', '#f5deb3'],
    ['Hamburger SV', 'HSV', 68, '#ffd700', '#1c3f94', '#1c3f94', '#1c3f94', '#ffd700', '#1c3f94'],
    ['1. FC Heidenheim 1846', 'FCH', 66, '#008080', '#111111', '#008080', '#f2f2f2', '#008080', '#f2f2f2'],
    ['FC St. Pauli', 'STP', 64, '#800020', '#800020', '#ffffff', '#ffffff', '#800020', '#ffffff'],
    ['1. FC Köln', 'KOE', 62, '#111111', '#c8102e', '#111111', '#c8102e', '#c8102e', '#111111'],
  ],
  hex: [
    ['Paris Saint-Germain', 'PSG', 87, '#002f6c', '#c8102e', '#002f6c', '#ffffff', '#002f6c', '#c8102e'],
    ['Olympique de Marseille', 'OMA', 84, '#ffffff', '#5cb8e6', '#ffffff', '#5cb8e6', '#5cb8e6', '#5cb8e6'],
    ['Olympique Lyonnais', 'OLY', 82, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#ffffff'],
    ['AS Monaco FC', 'ASM', 80, '#111111', '#111111', '#c8102e', '#c8102e', '#111111', '#c8102e'],
    ['Lille OSC', 'LOS', 78, '#ffdd00', '#0055a4', '#ffdd00', '#0055a4', '#0055a4', '#ffdd00'],
    ['RC Lens', 'RCL', 77, '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff'],
    ['OGC Nice', 'NIC', 75, '#ffffff', '#ffffff', '#002f6c', '#002f6c', '#002f6c', '#002f6c'],
    ['Stade Rennais FC', 'REN', 74, '#7a1f5c', '#ffffff', '#7a1f5c', '#ffffff', '#7a1f5c', '#ffffff'],
    ['Stade Brestois 29', 'BRS', 73, '#c0c0c0', '#111111', '#c0c0c0', '#111111', '#c0c0c0', '#111111'],
    ['RC Strasbourg Alsace', 'RCS', 72, '#2f6fde', '#2f6fde', '#2f6fde', '#ffd700', '#ffd700', '#ffd700'],
    ['FC Nantes', 'NAN', 71, '#b5121b', '#111111', '#111111', '#f0f0f0', '#b5121b', '#f0f0f0'],
    ['Toulouse FC', 'TLS', 70, '#ff7f00', '#ff7f00', '#ff7f00', '#111111', '#111111', '#111111'],
    ['Le Havre AC', 'HAC', 69, '#6b8e23', '#ffffff', '#6b8e23', '#ffffff', '#6b8e23', '#6b8e23'],
    ['FC Metz', 'MET', 68, '#87ceeb', '#ffffff', '#87ceeb', '#0b1f4b', '#0b1f4b', '#0b1f4b'],
    ['FC Lorient', 'LOR', 67, '#ffcc00', '#111111', '#111111', '#111111', '#ffcc00', '#ffcc00'],
    ['Paris FC', 'PFC', 66, '#00843d', '#00843d', '#ffffff', '#ffffff', '#00843d', '#00843d'],
    ['AJ Auxerre', 'AUX', 64, '#a9a9a9', '#0b1f4b', '#0b1f4b', '#0b1f4b', '#a9a9a9', '#a9a9a9'],
    ['Angers SCO', 'ANG', 62, '#008b8b', '#ffffff', '#008b8b', '#ffffff', '#008b8b', '#ffffff'],
  ],
  afr: [
    ['Al Ahly SC', 'AHL', 80, '#c8102e', '#ffffff', '#c8102e', '#ffffff', '#c8102e', '#ffffff', 'egy'],
    ['Wydad AC', 'WAC', 79, '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', 'mar'],
    ['Kaizer Chiefs', 'KCF', 78, '#ffd200', '#0b4ea2', '#ffd200', '#0b4ea2', '#ffd200', '#0b4ea2', 'rsa'],
    ['Espérance de Tunis', 'EST', 77, '#c8102e', '#ffd700', '#c8102e', '#ffd700', '#c8102e', '#ffd700', 'tun'],
    ['USM Alger', 'USM', 76, '#006233', '#c8102e', '#006233', '#ffffff', '#006233', '#ffffff', 'alg'],
    ['Enyimba International FC', 'ENY', 76, '#00a3e0', '#ffffff', '#00a3e0', '#ffffff', '#00a3e0', '#ffffff', 'nga'],
    ['AS Vita Club', 'AVC', 75, '#111111', '#c8102e', '#111111', '#ffffff', '#111111', '#ffffff', 'cod'],
    ['Hearts of Oak SC', 'HOO', 74, '#ffd700', '#111111', '#ffd700', '#111111', '#ffd700', '#111111', 'gha'],
    ['ASC Diaraf', 'DIA', 74, '#ffffff', '#0b6b3a', '#0b6b3a', '#0b6b3a', '#ffffff', '#ffffff', 'sen'],
    ['Orlando Pirates', 'ORL', 73, '#002f6c', '#002f6c', '#ffffff', '#87ceeb', '#002f6c', '#87ceeb', 'rsa'],
    ['ASEC Mimosas', 'ASE', 72, '#ff7f00', '#ffffff', '#ff7f00', '#ffffff', '#ff7f00', '#ffffff', 'civ'],
    ['Coton Sport FC', 'CTS', 71, '#5a2d0c', '#ff7f00', '#5a2d0c', '#ff7f00', '#5a2d0c', '#ff7f00', 'cmr'],
    ['Stade Malien', 'SMA', 68, '#14b53a', '#ffffff', '#14b53a', '#fcd116', '#14b53a', '#fcd116', 'mli'],
    ['Gor Mahia FC', 'GOR', 66, '#bb0000', '#111111', '#bb0000', '#006600', '#ffffff', '#006600', 'ken'],
    ['Zanaco FC', 'ZAN', 65, '#ef7d00', '#198a00', '#ef7d00', '#198a00', '#ffffff', '#198a00', 'zam'],
    ['Simba SC', 'SIM', 64, '#00a3dd', '#ffd700', '#00a3dd', '#ffd700', '#00a3dd', '#ffd700', 'tan'],
  ],
  // Rest-of-world pool: used to fill continental competitions; no league of its own.
  row: [
    // Europe (16)
    ['Vitesse', 'VIT', 80, '#ffffff', '#ffffff', '#c8102e', '#0b1f4b', '#0b1f4b', '#0b1f4b', 'ned'],
    ['Excelsior', 'EXC', 77, '#c8102e', '#111111', '#c8102e', '#111111', '#c8102e', '#111111', 'ned'],
    ['CS Marítimo', 'CSM', 80, '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', 'por'],
    ['CD Tondela', 'TON', 79, '#0057b8', '#ffffff', '#0057b8', '#ffd700', '#0057b8', '#ffd700', 'por'],
    ['Bursaspor', 'BUS', 77, '#ffd700', '#8b0000', '#ffd700', '#8b0000', '#ffd700', '#8b0000', 'tur'],
    ['MKE Ankaragücü', 'ANK', 75, '#111111', '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff', 'tur'],
    ['Partick Thistle', 'PTH', 75, '#0b6b3a', '#ffffff', '#0b6b3a', '#ffd700', '#0b6b3a', '#ffd700', 'sco'],
    ['Royal Antwerp FC', 'ROY', 76, '#5a2d82', '#ffffff', '#5a2d82', '#ffffff', '#5a2d82', '#ffffff', 'bel'],
    ['AEK Athens', 'AEK', 73, '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', 'gre'],
    ['Red Star Belgrade', 'RSB', 73, '#c6363c', '#ffffff', '#c6363c', '#ffffff', '#c6363c', '#ffffff', 'srb'],
    ['Shakhtar Donetsk', 'SHD', 74, '#ffd500', '#005bbb', '#ffd500', '#005bbb', '#ffd500', '#005bbb', 'ukr'],
    ['FC København', 'FCK', 72, '#ffffff', '#00205b', '#ffffff', '#00205b', '#00205b', '#00205b', 'den'],
    ['SK Rapid Wien', 'RAP', 73, '#ed2939', '#ffffff', '#ed2939', '#ffffff', '#ed2939', '#ffffff', 'aut'],
    ['FC Basel 1893', 'BAS', 72, '#00a3e0', '#ffffff', '#00a3e0', '#ffffff', '#00a3e0', '#ffffff', 'sui'],
    ['AC Sparta Praha', 'SPP', 72, '#d7141a', '#ffffff', '#d7141a', '#ffffff', '#11457e', '#ffffff', 'cze'],
    ['GNK Dinamo Zagreb', 'DZG', 71, '#ffffff', '#0d47a1', '#ffffff', '#0d47a1', '#0d47a1', '#0d47a1', 'cro'],
    // Africa (8)
    ['Zamalek SC', 'ZAM', 76, '#0b1f4b', '#ffffff', '#0b1f4b', '#ffffff', '#0b1f4b', '#ffffff', 'egy'],
    ['AS FAR', 'FAR', 75, '#ffffff', '#c8102e', '#ffffff', '#c8102e', '#c8102e', '#c8102e', 'mar'],
    ['CS Sfaxien', 'CSS', 72, '#111111', '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff', 'tun'],
    ['Mamelodi Sundowns FC', 'MSU', 74, '#7b68ee', '#ffffff', '#7b68ee', '#ffffff', '#7b68ee', '#ffffff', 'rsa'],
    ['Asante Kotoko SC', 'KOT', 71, '#c8102e', '#ffffff', '#c8102e', '#ffffff', '#c8102e', '#ffffff', 'gha'],
    ['TP Mazembe', 'MAZ', 72, '#b87333', '#111111', '#b87333', '#111111', '#b87333', '#111111', 'cod'],
    ['MC Oran', 'MCO', 70, '#ffd700', '#006233', '#ffd700', '#006233', '#ffd700', '#006233', 'alg'],
    ['Petro de Luanda', 'PET', 68, '#cc092f', '#111111', '#cc092f', '#111111', '#cc092f', '#111111', 'ang'],
    // Americas & Asia (8)
    ['Club Atlético Colón', 'CAC', 79, '#0b1f4b', '#ffd700', '#0b1f4b', '#ffd700', '#0b1f4b', '#ffd700', 'arg'],
    ['Coritiba FC', 'CFC', 79, '#c8102e', '#111111', '#c8102e', '#ffffff', '#ffffff', '#ffffff', 'bra'],
    ['Ponte Preta', 'PTA', 78, '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', 'bra'],
    ['Club Nacional de Football', 'NAC', 75, '#5cbfeb', '#111111', '#5cbfeb', '#111111', '#5cbfeb', '#111111', 'uru'],
    ['Club América', 'AME', 74, '#ffd700', '#0b1f4b', '#ffd700', '#0b1f4b', '#ffd700', '#0b1f4b', 'mex'],
    ['Los Angeles FC', 'LAF', 70, '#2a9d8f', '#ffffff', '#2a9d8f', '#ffffff', '#2a9d8f', '#ffffff', 'usa'],
    ['Kashima Antlers', 'KAA', 72, '#e75480', '#ffffff', '#e75480', '#ffffff', '#e75480', '#ffffff', 'jpn'],
    ['Al-Hazem', 'HAZ', 73, '#0b1f4b', '#ffffff', '#ffd700', '#ffd700', '#0b1f4b', '#ffd700', 'ksa'],
  ],
};

// Second-tier leagues (added after the original pools so existing club order is unchanged).
C.alb2 = [
  ['Leicester City', 'LEI', 70, '#b71c1c', '#ffffff', '#b71c1c', '#ffffff', '#b71c1c', '#ffffff'],
  ['Southampton FC', 'SOU', 69, '#2e7d32', '#2e7d32', '#ffffff', '#ffeb3b', '#2e7d32', '#ffeb3b'],
  ['Ipswich Town', 'IPS', 69, '#1565c0', '#ffffff', '#1565c0', '#ffffff', '#1565c0', '#1565c0'],
  ['Middlesbrough FC', 'MID', 68, '#004d40', '#ffffff', '#ffffff', '#ff8f00', '#111111', '#ff8f00'],
  ['Coventry City', 'COV', 68, '#81d4fa', '#0d47a1', '#81d4fa', '#0d47a1', '#ffffff', '#0d47a1'],
  ['Hull City', 'HUL', 67, '#ffb300', '#111111', '#ffb300', '#111111', '#111111', '#ffb300'],
  ['Norwich City', 'NOR', 67, '#6a1b9a', '#6a1b9a', '#6a1b9a', '#ffffff', '#ffffff', '#6a1b9a'],
  ['Stoke City', 'STK', 66, '#ffffff', '#1a237e', '#1a237e', '#e53935', '#e53935', '#e53935'],
  ['Blackburn Rovers', 'BLB', 66, '#bf6c2a', '#111111', '#bf6c2a', '#ffffff', '#bf6c2a', '#ffffff'],
  ['Millwall FC', 'MIW', 65, '#c62828', '#c62828', '#111111', '#ffffff', '#111111', '#ffffff'],
  ['Sheffield United', 'SHU', 65, '#d32f2f', '#1565c0', '#d32f2f', '#1565c0', '#1565c0', '#d32f2f'],
  ['Derby County', 'DER', 64, '#558b2f', '#ffffff', '#558b2f', '#111111', '#111111', '#558b2f'],
  ['Watford FC', 'WAT', 64, '#0277bd', '#ffffff', '#ffffff', '#fdd835', '#0277bd', '#fdd835'],
  ['Swansea City', 'SWA', 63, '#37474f', '#37474f', '#ff7043', '#ff7043', '#37474f', '#37474f'],
  ['Bristol City', 'BRC', 63, '#00897b', '#ffffff', '#00897b', '#ffffff', '#00897b', '#ffffff'],
  ['Preston North End', 'PNE', 62, '#9e9e9e', '#111111', '#9e9e9e', '#111111', '#9e9e9e', '#111111'],
  ['Queens Park Rangers', 'QPR', 62, '#f57f17', '#f57f17', '#f57f17', '#1a237e', '#1a237e', '#1a237e'],
  ['Portsmouth FC', 'POM', 61, '#33691e', '#f5f5dc', '#33691e', '#f5f5dc', '#33691e', '#f5f5dc'],
  ['Oxford United', 'OXF', 61, '#880e4f', '#ffffff', '#880e4f', '#ffffff', '#880e4f', '#ffffff'],
  ['Sheffield Wednesday', 'SHW', 60, '#4fc3f7', '#ffffff', '#4fc3f7', '#212121', '#212121', '#212121'],
  ['West Bromwich Albion', 'WBA', 60, '#0d47a1', '#0d47a1', '#ffffff', '#ffffff', '#0d47a1', '#ffffff'],
  ['Plymouth Argyle', 'PLY', 59, '#fdd835', '#2e7d32', '#fdd835', '#2e7d32', '#fdd835', '#2e7d32'],
];
C.ibe2 = [
  ['Real Valladolid CF', 'VLL', 70, '#1e88e5', '#ffffff', '#1e88e5', '#ffffff', '#1e88e5', '#ffffff'],
  ['Real Sporting de Gijón', 'SPG', 69, '#ffffff', '#5e35b1', '#ffffff', '#5e35b1', '#5e35b1', '#5e35b1'],
  ['Cádiz CF', 'CAD', 69, '#43a047', '#ffffff', '#43a047', '#ffffff', '#43a047', '#ffffff'],
  ['Burgos CF', 'BRG', 68, '#e53935', '#1e3a8a', '#e53935', '#1e3a8a', '#ffffff', '#1e3a8a'],
  ['Real Zaragoza', 'ZAR', 68, '#6d4c41', '#ffffff', '#6d4c41', '#ffffff', '#6d4c41', '#ffffff'],
  ['CD Castellón', 'CAS', 67, '#4dd0e1', '#ffffff', '#4dd0e1', '#003c8f', '#003c8f', '#003c8f'],
  ['Racing de Santander', 'RSA', 67, '#2e7d32', '#2e7d32', '#2e7d32', '#ffffff', '#2e7d32', '#ffffff'],
  ['SD Eibar', 'EIB', 66, '#827717', '#ffffff', '#827717', '#ffffff', '#827717', '#827717'],
  ['Málaga CF', 'MAL', 66, '#ffffff', '#0288d1', '#0288d1', '#0288d1', '#ffffff', '#ffffff'],
  ['UD Las Palmas', 'LPA', 65, '#ffcc80', '#5d4037', '#ffcc80', '#5d4037', '#ffcc80', '#5d4037'],
  ['CD Tenerife', 'TEN', 65, '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff', '#111111'],
  ['UD Almería', 'ALM', 64, '#c2185b', '#ffffff', '#c2185b', '#ffffff', '#c2185b', '#ffffff'],
  ['Granada CF', 'GRA', 64, '#f9a825', '#c62828', '#f9a825', '#c62828', '#f9a825', '#c62828'],
  ['CD Mirandés', 'MIR', 63, '#00c853', '#111111', '#00c853', '#111111', '#00c853', '#111111'],
  ['Albacete Balompié', 'ALB', 63, '#90caf9', '#0d47a1', '#0d47a1', '#0d47a1', '#90caf9', '#90caf9'],
  ['FC Cartagena', 'CAR', 62, '#eceff1', '#37474f', '#eceff1', '#37474f', '#eceff1', '#37474f'],
  ['SD Huesca', 'HUE', 62, '#d84315', '#ffffff', '#d84315', '#ffffff', '#d84315', '#ffffff'],
  ['Deportivo La Coruña', 'DEP', 61, '#006064', '#ffffff', '#006064', '#ffffff', '#006064', '#ffffff'],
  ['Córdoba CF', 'CRD', 61, '#7cb342', '#ffffff', '#ffffff', '#ffffff', '#7cb342', '#7cb342'],
  ['Cultural Leonesa', 'LEO', 60, '#424242', '#c62828', '#424242', '#c62828', '#424242', '#c62828'],
  ['CD Lugo', 'LUG', 60, '#ffffff', '#ffffff', '#1565c0', '#1565c0', '#1565c0', '#ffffff'],
  ['SD Ponferradina', 'PON', 59, '#ff8f00', '#1a237e', '#ff8f00', '#1a237e', '#ff8f00', '#1a237e'],
];

// More rest-of-world clubs (pool 'row') for the Asian / Americas club cups and the
// club world championship. Their foreign signings follow a regional mix (below)
// rather than the European GLOBAL_MIX.
const ROW_EXTRA = [
  // South America (11)
  ['Sport Club do Recife', 'SPO', 77, '#c8102e', '#111111', '#c8102e', '#111111', '#c8102e', '#111111', 'bra'],
  ['Millonarios FC', 'MIO', 76, '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', 'col'],
  ['CA Tigre', 'TIG', 76, '#c8102e', '#0b1f4b', '#c8102e', '#0b1f4b', '#ffffff', '#0b1f4b', 'arg'],
  ['CA Banfield', 'BAN', 75, '#75aadb', '#ffffff', '#75aadb', '#ffffff', '#75aadb', '#ffffff', 'arg'],
  ['Atlético Nacional', 'ATN', 74, '#7b2d8e', '#ffffff', '#7b2d8e', '#ffffff', '#7b2d8e', '#ffffff', 'col'],
  ['LDU Quito', 'LDU', 73, '#e65100', '#111111', '#e65100', '#111111', '#e65100', '#111111', 'ecu'],
  ['Cerro Porteño', 'CER', 72, '#ec407a', '#ffffff', '#ec407a', '#ffffff', '#ec407a', '#ffffff', 'par'],
  ['Colo-Colo', 'COC', 72, '#ffffff', '#0039a6', '#0039a6', '#0039a6', '#ffffff', '#ffffff', 'chi'],
  ['Club Universitario de Deportes', 'UDE', 71, '#ffffff', '#d91023', '#ffffff', '#d91023', '#d91023', '#d91023', 'per'],
  ['Caracas FC', 'CCS', 69, '#7b1e3a', '#ffd700', '#7b1e3a', '#ffd700', '#7b1e3a', '#ffd700', 'ven'],
  ['Club Bolívar', 'BLV', 67, '#007934', '#ffd700', '#007934', '#ffd700', '#007934', '#ffd700', 'bol'],
  // North & Central America (8)
  ['Pumas UNAM', 'PUM', 74, '#0b1f4b', '#ffd700', '#0b1f4b', '#ffd700', '#0b1f4b', '#ffd700', 'mex'],
  ['CD Guadalajara', 'CHV', 73, '#2e8b57', '#ffffff', '#2e8b57', '#ffffff', '#2e8b57', '#ffffff', 'mex'],
  ['Columbus Crew', 'CLB', 71, '#1e3a8a', '#ffffff', '#c8102e', '#ffffff', '#1e3a8a', '#ffffff', 'usa'],
  ['Forge FC', 'FGE', 70, '#d80621', '#111111', '#d80621', '#ffffff', '#d80621', '#ffffff', 'can'],
  ['LD Alajuelense', 'LDA', 68, '#8b0000', '#ffffff', '#8b0000', '#ffffff', '#8b0000', '#ffffff', 'crc'],
  ['Harbour View FC', 'HVF', 66, '#1565c0', '#fed100', '#1565c0', '#fed100', '#1565c0', '#fed100', 'jam'],
  ['CD Árabe Unido', 'ARU', 66, '#da121a', '#072357', '#da121a', '#ffffff', '#072357', '#ffffff', 'pan'],
  ['CD Olimpia', 'OLI', 64, '#0073cf', '#ffffff', '#0073cf', '#ffffff', '#0073cf', '#ffffff', 'hon'],
  // Asia (15)
  ['Gamba Osaka', 'GAM', 73, '#ff7f00', '#111111', '#ff7f00', '#111111', '#ff7f00', '#111111', 'jpn'],
  ['FC Seoul', 'SEO', 72, '#111111', '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff', 'kor'],
  ['Persepolis FC', 'PRS', 72, '#ffd700', '#0b6b3a', '#ffd700', '#0b6b3a', '#ffd700', '#0b6b3a', 'irn'],
  ['Al-Wehda', 'WEH', 72, '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', '#0b6b3a', '#ffffff', 'ksa'],
  ['Al Sadd', 'SAD', 71, '#8a1538', '#ffffff', '#8a1538', '#ffffff', '#8a1538', '#ffffff', 'qat'],
  ['Hokkaido Consadole Sapporo', 'CON', 70, '#ffffff', '#1e3a8a', '#ffffff', '#1e3a8a', '#1e3a8a', '#1e3a8a', 'jpn'],
  ['Esteghlal FC', 'ESH', 70, '#00a3e0', '#ffffff', '#00a3e0', '#ffffff', '#00a3e0', '#ffffff', 'irn'],
  ['Brisbane Roar FC', 'BRI', 70, '#ff6f61', '#0b1f4b', '#ff6f61', '#0b1f4b', '#ff6f61', '#0b1f4b', 'aus'],
  ['Ulsan HD FC', 'ULS', 69, '#0057b8', '#0057b8', '#ffffff', '#ffffff', '#0057b8', '#ffffff', 'kor'],
  ['Al Ain FC', 'AIN', 69, '#ffffff', '#ce1126', '#ffffff', '#ce1126', '#ce1126', '#ce1126', 'uae'],
  ['Al-Zawraa SC', 'ZAW', 68, '#007a3d', '#111111', '#007a3d', '#111111', '#007a3d', '#111111', 'irq'],
  ['Nasaf Qarshi', 'NQA', 68, '#0099b5', '#ffffff', '#0099b5', '#ffffff', '#0099b5', '#ffffff', 'uzb'],
  ['Shanghai Port FC', 'SHP', 67, '#de2910', '#ffd700', '#de2910', '#ffd700', '#de2910', '#ffd700', 'chn'],
  ['Al-Faisaly SC', 'FAI', 66, '#5a2d82', '#ffffff', '#5a2d82', '#ffffff', '#5a2d82', '#ffffff', 'jor'],
  ['Buriram United', 'BUU', 65, '#1d3c8f', '#ffffff', '#1d3c8f', '#ffffff', '#1d3c8f', '#ffffff', 'tha'],
  // Oceania (2)
  ['Auckland FC', 'AKL', 62, '#111111', '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff', 'nzl'],
  ['Lautoka FC', 'LAU', 57, '#62b5e5', '#ffffff', '#62b5e5', '#ffffff', '#62b5e5', '#ffffff', 'fij'],
];
// Foreign-signing mix and share for clubs outside Europe/Africa (ROW_EXTRA only).
const REGIONAL_MIX = {
  SAM: { share: 0.12, mix: [['latin', 55], ['brazilian', 25], ['westAfrican', 10], ['spanish', 10]] },
  NCA: { share: 0.35, mix: [['latin', 35], ['brazilian', 15], ['caribbean', 15], ['english', 10], ['westAfrican', 15], ['spanish', 10]] },
  ASI: { share: 0.25, mix: [['brazilian', 35], ['latin', 15], ['westAfrican', 20], ['slavic', 10], ['spanish', 10], ['portuguese', 10]] },
  OCE: { share: 0.25, mix: [['english', 50], ['pacific', 30], ['latin', 10], ['westAfrican', 10]] },
};

const NATION_BY_ID = Object.fromEntries(NATIONS.map((n) => [n.id, n]));
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function clubFormation(id, rating) {
  const r = mulberry32(hashString('form:' + id));
  const opts = rating >= 80 ? ['4-3-3', '4-2-3-1', '4-3-3', '3-5-2'] : FORMATION_NAMES;
  return pick(r, opts);
}

export const CLUBS = [];
for (const leagueId of Object.keys(C)) {
  const lg = LEAGUES.find((l) => l.id === leagueId);
  for (const [name, short, rating, s, sh, so, as, ash, aso, ctry] of C[leagueId]) {
    const id = slug(name);
    const country = ctry || lg.country;
    const nat = NATION_BY_ID[country];
    // Club squads: domestic core plus foreign signings (more foreign at elite clubs).
    const foreign = leagueId === 'afr' ? 0.1 : clamp(0.2 + (rating - 62) / 26 * 0.35, 0.2, 0.55);
    const pop = [...nat.pop.map(([r, w, t]) => (t ? [r, w * (1 - foreign), t] : [r, w * (1 - foreign)])),
      ...GLOBAL_MIX.map(([r, w]) => [r, (w / 100) * foreign])];
    CLUBS.push({
      id, name, short, kind: 'club', league: leagueId === 'row' ? null : leagueId,
      pool: leagueId === 'row' ? 'row' : leagueId,
      country, confed: nat.confed,
      colors: { shirt: s, shorts: sh, socks: so, alt: { shirt: as, shorts: ash, socks: aso } },
      rating, style: deriveStyle(id, rating), formation: clubFormation(id, rating), pop,
    });
  }
}
for (const [name, short, rating, s, sh, so, as, ash, aso, country] of ROW_EXTRA) {
  const id = slug(name);
  const nat = NATION_BY_ID[country];
  const { share, mix } = REGIONAL_MIX[nat.confed];
  const total = mix.reduce((a, m) => a + m[1], 0);
  const pop = [...nat.pop.map(([r, w, t]) => (t ? [r, w * (1 - share), t] : [r, w * (1 - share)])),
    ...mix.map(([r, w]) => [r, (w / total) * share])];
  CLUBS.push({
    id, name, short, kind: 'club', league: null, pool: 'row', country, confed: nat.confed,
    colors: { shirt: s, shorts: sh, socks: so, alt: { shirt: as, shorts: ash, socks: aso } },
    rating, style: deriveStyle(id, rating), formation: clubFormation(id, rating), pop,
  });
}

// Real kit colours for known clubs; alternative kit is white (or black on light home kits).
const kitLum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
for (const c of CLUBS) {
  const k = REAL_KITS[c.name]; if (!k) continue;
  const alt = kitLum(k[0]) > 0.6 ? '#111111' : '#ffffff';
  c.colors = { shirt: k[0], shorts: k[1], socks: k[2], alt: { shirt: alt, shorts: alt, socks: alt } };
}

// ============================================================ lookups
const TEAM_BY_ID = new Map();
for (const t of NATIONS) TEAM_BY_ID.set(t.id, t);
for (const t of CLUBS) TEAM_BY_ID.set(t.id, t);
export const ALL_TEAMS = [...NATIONS, ...CLUBS];

// ============================================================ youth national teams
// Youth sides are derived from the senior nation: id `${nationId}-${level}` (e.g. 'bra-u23'),
// same kit, rating lowered by `offset`, squads generated with ages inside the age band
// (U-23 squads carry `overage` older players, as in summer-games football).
export const YOUTH_LEVELS = {
  u23: { label: 'U-23', offset: -6, ages: [19, 23], overage: 3 },
  u20: { label: 'U-20', offset: -8, ages: [17, 20], overage: 0 },
};
const youthCache = new Map();
/** Youth national team for a senior nation id and a level key of YOUTH_LEVELS ('u23' | 'u20'). */
export function youthTeam(nationId, level) {
  const key = `${nationId}-${level}`;
  if (youthCache.has(key)) return youthCache.get(key);
  const nat = NATION_BY_ID[nationId], lv = YOUTH_LEVELS[level];
  if (!nat || !lv) return undefined;
  const rating = Math.max(45, nat.rating + lv.offset);
  const t = { ...nat, id: key, name: `${nat.name} ${lv.label}`, rating, style: deriveStyle(key, rating),
    youth: level, seniorId: nat.id };
  youthCache.set(key, t);
  return t;
}

/** Look up any team (nation, club or youth nation like 'bra-u23') by id. Returns undefined if unknown. */
export function getTeam(id) {
  const t = TEAM_BY_ID.get(id);
  if (t || typeof id !== 'string') return t;
  const m = /^(.+)-(u\d\d)$/.exec(id);
  return m ? youthTeam(m[1], m[2]) : undefined;
}
export function clubsInLeague(leagueId) { return CLUBS.filter((c) => c.league === leagueId); }
export function clubsInPool(pool) { return CLUBS.filter((c) => c.pool === pool); }
export function nationsInConfed(confed) { return NATIONS.filter((n) => n.confed === confed); }

// ============================================================ squads
const SQUAD_TEMPLATE = ['GK', 'GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'RB', 'RB', 'CDM', 'CDM', 'CM', 'CM',
  'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST'];
// Real players for a team, placed into squad slots by position when position data exists.
// Returns an array indexed by slot (null = keep a generated name). Crawled rosters (REAL_POS: [name, pos] in page order)
// win over the older name-only lists; without positions, names fill slots in list order.
const POS_LINE = { DF: 'D', MF: 'M', FW: 'A', GK: 'G', CB: 'D', LB: 'D', RB: 'D', CDM: 'M', CM: 'M', CAM: 'M', LM: 'M', RM: 'M', LW: 'A', RW: 'A', ST: 'A' };
const realSlotCache = new Map();
function assignReal(teamId) {
  if (realSlotCache.has(teamId)) return realSlotCache.get(teamId);
  let out = null;
  const roster = REAL_POS[teamId];
  if (roster && roster.length) {
    const pool = roster.map(([name, pos], idx) => ({ name, pos, idx, used: false }));
    out = SQUAD_TEMPLATE.map((slotPos) => {
      let best = null, bs = 0;
      for (const c of pool) {
        if (c.used) continue;
        const s = c.pos === slotPos ? 3 : !c.pos ? (slotPos === 'GK' ? 0 : 1) : POS_LINE[c.pos] === POS_LINE[slotPos] ? 2 : 0;
        if (s > bs) { bs = s; best = c; }
      }
      if (!best) return null; best.used = true; return best.name;
    });
  } else if (REAL_SQUADS[teamId]) out = REAL_SQUADS[teamId].slice(0, SQUAD_TEMPLATE.length);
  realSlotCache.set(teamId, out); return out;
}

// Attribute profile per position: [pace, shooting, passing, dribbling, defending, physical] offsets.
const PROFILE = {
  GK: [-25, -45, -15, -30, -35, -5],
  CB: [-6, -28, -10, -16, 8, 8],
  LB: [6, -20, -2, -2, 2, 0], RB: [6, -20, -2, -2, 2, 0],
  CDM: [-6, -14, 2, -6, 5, 6],
  CM: [-2, -6, 6, 2, -4, 0],
  CAM: [2, 2, 8, 7, -20, -8],
  LM: [7, -4, 2, 5, -16, -6], RM: [7, -4, 2, 5, -16, -6],
  LW: [10, 0, 0, 8, -26, -8], RW: [10, 0, 0, 8, -26, -8],
  ST: [5, 8, -6, 3, -30, 4],
};
// Shirt numbers by position preference.
const NUM_PREF = { GK: [1, 13, 23], CB: [4, 5, 3, 15], LB: [3, 12, 21], RB: [2, 22, 24], CDM: [6, 16], CM: [8, 14, 18],
  CAM: [10], LM: [11, 17], RM: [7, 19], LW: [11, 17, 27], RW: [7, 19, 20], ST: [9, 20, 25, 26] };

const squadCache = new Map();

/**
 * Deterministic 23-man squad for a team. Players carry an `age`; youth teams
 * (see youthTeam) get ages inside their age band.
 * @param {object|string} team  team object or id
 * @param {number} [seed]       optional extra seed (default: team id hash)
 */
export function makeSquad(team, seed) {
  if (typeof team === 'string') team = getTeam(team);
  if (!team) throw new Error('makeSquad: unknown team');
  const key = team.id + ':' + (seed ?? '');
  if (squadCache.has(key)) return squadCache.get(key);
  const rng = mulberry32(hashString('squad:' + team.id) ^ ((seed ?? 0) >>> 0));
  const pop = team.pop && team.pop.length ? team.pop : [['english', 1]];
  const usedNums = new Set();
  const usedNames = new Set();
  const players = [];
  // Ages come from their own stream so adding them left every other attribute unchanged.
  const ageRng = mulberry32(hashString('age:' + team.id) ^ ((seed ?? 0) >>> 0));
  const lv = team.youth ? YOUTH_LEVELS[team.youth] : null;
  const overage = new Set();
  while (lv && overage.size < lv.overage) overage.add(Math.floor(ageRng() * SQUAD_TEMPLATE.length));
  const ageFor = (i, pos) => {
    if (lv && !overage.has(i)) return lv.ages[0] + Math.floor(ageRng() * (lv.ages[1] - lv.ages[0] + 1));
    if (lv) return 24 + Math.floor(ageRng() * 9);
    return Math.round(clamp(gauss(ageRng, pos === 'GK' ? 28 : 26, 3.6), 17, 37));
  };
  // First 11-ish of each position group are "starters": rated around/above team rating.
  const seenPos = {};
  const realBySlot = assignReal(team.id);
  SQUAD_TEMPLATE.forEach((pos, i) => {
    seenPos[pos] = (seenPos[pos] || 0) + 1;
    const starterSlots = { GK: 1, CB: 2, LB: 1, RB: 1, CDM: 1, CM: 2, CAM: 1, LM: 1, RM: 1, LW: 1, RW: 1, ST: 1 };
    const starter = seenPos[pos] <= starterSlots[pos];
    const [region, , tone] = weightedPick(rng, pop);
    let nm;
    const real = realBySlot && realBySlot[i];
    if (real) nm = { name: real, shortName: real.split(' ').slice(-1)[0] };
    else for (let t = 0; t < 6; t++) { nm = genName(region, rng); if (!usedNames.has(nm.name)) break; }
    usedNames.add(nm.name);
    const toneRange = tone || (NAME_POOLS[region] || NAME_POOLS.english).tone;
    const skinTone = +clamp(toneRange[0] + rng() * (toneRange[1] - toneRange[0]), 0, 1).toFixed(3);
    const rating = Math.round(clamp(gauss(rng, team.rating + (starter ? 1.5 : -5), starter ? 3 : 4), 40, 95));
    const prof = PROFILE[pos];
    const attr = (k) => Math.round(clamp(rating + prof[k] + gauss(rng, 0, 5), 20, 99));
    let number = (NUM_PREF[pos] || []).find((n) => !usedNums.has(n));
    if (number === undefined) { number = 2; while (usedNums.has(number)) number++; }
    usedNums.add(number);
    const p = {
      id: `${team.id}-${i + 1}`, name: nm.name, shortName: nm.shortName, number, pos, rating,
      pace: attr(0), shooting: attr(1), passing: attr(2), dribbling: attr(3), defending: attr(4), physical: attr(5),
      skinTone, hairStyle: Math.floor(rng() * 4), age: ageFor(i, pos),
    };
    if (pos === 'GK') { p.handling = Math.round(clamp(rating + gauss(rng, 0, 3), 30, 99)); p.reflexes = Math.round(clamp(rating + gauss(rng, 0, 3), 30, 99)); }
    players.push(p);
  });
  squadCache.set(key, players);
  return players;
}

// Which squad positions can fill a formation slot (in preference order).
const SLOT_FALLBACK = {
  GK: ['GK'], CB: ['CB', 'CDM', 'LB', 'RB'], LB: ['LB', 'LM', 'CB', 'RB'], RB: ['RB', 'RM', 'CB', 'LB'],
  CDM: ['CDM', 'CM', 'CB'], CM: ['CM', 'CDM', 'CAM'], CAM: ['CAM', 'CM', 'LW', 'RW'],
  LM: ['LM', 'LW', 'LB', 'CM'], RM: ['RM', 'RW', 'RB', 'CM'], LW: ['LW', 'LM', 'ST', 'CAM'],
  RW: ['RW', 'RM', 'ST', 'CAM'], ST: ['ST', 'CAM', 'LW', 'RW'],
};

/**
 * Pick the best XI for a formation. Returns 11 entries `{ slot: {pos,x,y}, player }`
 * in formation slot order; `bench` holds the rest.
 */
export function pickXI(squad, formationName = '4-4-2') {
  const slots = formations[formationName] || formations['4-4-2'];
  const used = new Set();
  const xi = slots.map((slot) => {
    let best = null;
    for (const pos of SLOT_FALLBACK[slot.pos]) {
      const cands = squad.filter((p) => p.pos === pos && !used.has(p.id)).sort((a, b) => b.rating - a.rating);
      if (cands.length) { best = cands[0]; break; }
    }
    if (!best) best = squad.filter((p) => !used.has(p.id) && p.pos !== 'GK').sort((a, b) => b.rating - a.rating)[0];
    used.add(best.id);
    return { slot, player: best };
  });
  return { xi, bench: squad.filter((p) => !used.has(p.id)) };
}
