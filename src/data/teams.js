// Pitch Clash — team data: national teams, real-world clubs, formations,
// and deterministic squad generation.
//
// Club, league and competition names are real. Player names are fictional.
// National teams use real country names and flag-inspired kit colours only.

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
// Fictional names: first names from plausible regional lists, surnames built
// from syllable pairs so generated full names are unlikely to match real players.
// tone: skin-tone range (0 light .. 1 dark) typical for players with these names.
// familyFirst: display surname before given name.
const NAME_POOLS = {
  english: {
    tone: [0.04, 0.3],
    first: ['Jack', 'Harry', 'Oliver', 'George', 'Charlie', 'Tom', 'Ben', 'Sam', 'Joe', 'Callum', 'Lewis', 'Ryan',
      'Jamie', 'Connor', 'Kieran', 'Mason', 'Reece', 'Luke', 'Danny', 'Alfie', 'Archie', 'Freddie', 'Elliot',
      'Nathan', 'Toby', 'Ethan', 'Jordan', 'Liam', 'Rhys', 'Ross', 'Dean', 'Aaron', 'Max', 'Josh', 'Kyle'],
    lastA: ['Ash', 'Black', 'Brad', 'Brom', 'Cal', 'Cart', 'Chad', 'Craw', 'Dun', 'Elling', 'Fair', 'Gold', 'Hal',
      'Hart', 'Hav', 'Holl', 'Kel', 'Lang', 'Mar', 'Mid', 'Nor', 'Pem', 'Rad', 'Rush', 'Sal', 'Sher', 'Stan',
      'Thorn', 'Wal', 'Whit', 'Win', 'Wood', 'Brack', 'Pres', 'Gil', 'Thack', 'Ought', 'Bram'],
    lastB: ['ley', 'ton', 'well', 'by', 'field', 'wood', 'ford', 'er', 'ham', 'ridge', 'worth', 'croft', 'more',
      'wick', 'stead', 'hurst', 'combe', 'shaw', 'bury', 'den', 'low', 'bridge', 'ings', 'kins', 'man'],
  },
  caribbean: {
    tone: [0.62, 0.95],
    first: ['Jermaine', 'Tyrone', 'Marlon', 'Delroy', 'Andre', 'Kemar', 'Dwayne', 'Leon', 'Rohan', 'Shamar',
      'Tevin', 'Kadeem', 'Jaden', 'Omari', 'Ricardo', 'Damani', 'Javon', 'Nathaniel', 'Kareem', 'Devon',
      'Junior', 'Trevane', 'Akeem', 'Malik', 'Jahmal'],
    lastA: ['Camp', 'Grant', 'Will', 'Rob', 'Mc', 'Bai', 'Hen', 'Pal', 'Rich', 'Clar', 'Bram', 'Fos', 'Lind',
      'Walc', 'Ster', 'Mor', 'Dacr', 'Thom'],
    lastB: ['bell', 'son', 'iams', 'ley', 'ton', 'er', 'ders', 'ke', 'mer', 'ard', 'ott', 'more', 'well', 'ling'],
  },
  french: {
    tone: [0.04, 0.3],
    first: ['Lucas', 'Hugo', 'Théo', 'Mathis', 'Antoine', 'Julien', 'Maxime', 'Baptiste', 'Clément', 'Romain',
      'Quentin', 'Bastien', 'Florian', 'Kévin', 'Thibault', 'Adrien', 'Loïc', 'Mathéo', 'Enzo', 'Nolan',
      'Raphaël', 'Valentin', 'Corentin', 'Damien', 'Gaëtan', 'Aurélien', 'Rémi'],
    lastA: ['Bel', 'Ber', 'Char', 'Dela', 'Du', 'Fon', 'Gar', 'Gi', 'La', 'Le', 'Mar', 'Mo', 'Pel', 'Ro', 'Sau',
      'Ver', 'Bou', 'Cha', 'Ga', 'Lan', 'Mon', 'Ri', 'Thi', 'Vau', 'Bri'],
    lastB: ['lier', 'chard', 'vin', 'ret', 'mont', 'naud', 'ville', 'cour', 'rand', 'bert', 'lot', 'rieux', 'tin',
      'teau', 'gnac', 'vert', 'quet', 'zon', 'noir', 'champ'],
  },
  spanish: {
    tone: [0.08, 0.35],
    first: ['Alejandro', 'Pablo', 'Sergio', 'Álvaro', 'Javier', 'Diego', 'Iker', 'Mario', 'Adrián', 'Rubén',
      'Hugo', 'Raúl', 'Marcos', 'Daniel', 'Íñigo', 'Unai', 'Jorge', 'Gonzalo', 'Borja', 'Rodrigo', 'Víctor',
      'Nacho', 'Mikel', 'Aitor', 'Óscar', 'Carlos', 'Asier', 'Fermín'],
    lastA: ['Al', 'Bar', 'Cas', 'Ech', 'Fer', 'Gal', 'Ib', 'Lar', 'Mart', 'Mor', 'Ol', 'Pal', 'Qui', 'Rod', 'San',
      'Tor', 'Val', 'Zab', 'Agu', 'Bel', 'Cer', 'Esc', 'Ma', 'Ur'],
    lastB: ['ado', 'arro', 'ández', 'ero', 'illo', 'ega', 'ina', 'ares', 'ueta', 'iel', 'ano', 'eda', 'ón', 'ate',
      'ía', 'abal', 'oz', 'encia', 'ola', 'uelo'],
  },
  latin: {
    tone: [0.15, 0.65],
    first: ['Santiago', 'Matías', 'Juan', 'Nicolás', 'Sebastián', 'Facundo', 'Agustín', 'Joaquín', 'Cristian',
      'Emiliano', 'Franco', 'Luciano', 'Ezequiel', 'Gonzalo', 'Brayan', 'Jhon', 'Yerson', 'Wilmar', 'Kevin',
      'Andrés', 'Mauricio', 'Fernando', 'Esteban', 'Thiago', 'Rodrigo', 'Alexis', 'Jhonatan', 'Dairon'],
    lastA: ['Al', 'Bar', 'Cas', 'Fer', 'Gal', 'Ib', 'Lar', 'Mor', 'Ol', 'Pal', 'Qui', 'Rod', 'San', 'Tor', 'Val',
      'Agu', 'Cer', 'Esc', 'Quint', 'Bus', 'Ca', 'Cue', 'Ro', 'Vi', 'Mon', 'Sal'],
    lastB: ['ado', 'arro', 'ero', 'illo', 'ega', 'ina', 'ares', 'ano', 'eda', 'ón', 'ate', 'ana', 'illa', 'asco',
      'uela', 'iño', 'ez', 'oya', 'uera'],
  },
  portuguese: {
    tone: [0.08, 0.4],
    first: ['João', 'Tiago', 'Rui', 'Bruno', 'Diogo', 'Gonçalo', 'Nuno', 'Rafael', 'Pedro', 'André', 'Vítor',
      'Hélder', 'Fábio', 'Duarte', 'Rúben', 'Tomás', 'Leandro', 'Hugo', 'Miguel', 'Ricardo', 'Francisco'],
    lastA: ['Al', 'Bar', 'Car', 'Cou', 'Fa', 'Fon', 'Gou', 'Lou', 'Mag', 'Mon', 'Per', 'Quei', 'Ri', 'San', 'Tei',
      'Va', 'Cor', 'Fi', 'Lo', 'Pin'],
    lastB: ['eira', 'eiro', 'ão', 'alho', 'inho', 'oso', 'ves', 'ares', 'ado', 'ela', 'ura', 'edo', 'ente',
      'lho', 'ança', 'ito'],
  },
  brazilian: {
    tone: [0.1, 0.95],
    first: ['Gabriel', 'Matheus', 'Lucas', 'Thiago', 'Rafael', 'Felipe', 'Vinícius', 'Caio', 'Igor', 'Rodrigo',
      'Wellington', 'Everton', 'Danilo', 'Renan', 'Douglas', 'Anderson', 'Paulo', 'Gustavo', 'Leandro',
      'Wesley', 'Kaique', 'Luan', 'Breno', 'Ruan', 'Murilo', 'Jefferson', 'Talles'],
    lastA: ['Al', 'Bar', 'Car', 'Cou', 'Fa', 'Fon', 'Gou', 'Lou', 'Mag', 'Mon', 'Per', 'Quei', 'Ri', 'San', 'Tei',
      'Va', 'Cor', 'Fi', 'Lo', 'Pin', 'Bran', 'Ta'],
    lastB: ['eira', 'eiro', 'ão', 'alho', 'inho', 'oso', 'ves', 'ares', 'ado', 'ela', 'ura', 'edo', 'ente',
      'lho', 'ança', 'ito', 'ino'],
  },
  italian: {
    tone: [0.08, 0.35],
    first: ['Marco', 'Luca', 'Alessandro', 'Matteo', 'Lorenzo', 'Andrea', 'Davide', 'Federico', 'Simone',
      'Riccardo', 'Stefano', 'Gianluca', 'Nicolò', 'Tommaso', 'Daniele', 'Filippo', 'Emanuele', 'Giacomo',
      'Pietro', 'Raffaele', 'Edoardo', 'Salvatore', 'Mattia', 'Cristiano', 'Leonardo'],
    lastA: ['Bel', 'Ber', 'Cal', 'Can', 'Cas', 'Del', 'Fa', 'Gal', 'Lom', 'Man', 'Mar', 'Mo', 'Pa', 'Pel', 'Ri',
      'San', 'Tor', 'Val', 'Ven', 'Zan', 'Bor', 'Cre', 'Fio', 'Ga'],
    lastB: ['lini', 'tti', 'ardi', 'ella', 'one', 'ucci', 'etti', 'ani', 'ara', 'oni', 'uzzi', 'ino', 'ese', 'ato',
      'aldi', 'iero', 'ozzi', 'enti', 'iglia', 'ico'],
  },
  german: {
    tone: [0.02, 0.25],
    first: ['Lukas', 'Jonas', 'Leon', 'Felix', 'Maximilian', 'Niklas', 'Tim', 'Jan', 'Florian', 'Tobias', 'Julian',
      'Moritz', 'Sebastian', 'Kevin', 'Marco', 'Dominik', 'Jannik', 'Philipp', 'Benedikt', 'Nico', 'Fabian',
      'Matthias', 'Lennart', 'Malte', 'Henrik'],
    lastA: ['Bau', 'Beck', 'Bren', 'Eich', 'Feld', 'Fried', 'Ger', 'Hag', 'Hein', 'Hof', 'Kal', 'Kirch', 'Lind',
      'Mei', 'Rein', 'Schön', 'Stein', 'Wag', 'Wei', 'Wolf', 'Zim', 'Brand', 'Eber', 'Kr'],
    lastB: ['mann', 'berg', 'er', 'hardt', 'ner', 'mayer', 'ling', 'stein', 'rich', 'hofer', 'bach', 'dorf', 'ke',
      'horst', 'wald', 'inger', 'gruber', 'feld', 'haus', 'mer'],
  },
  dutch: {
    tone: [0.02, 0.25],
    first: ['Daan', 'Sem', 'Bram', 'Thijs', 'Jesse', 'Ruben', 'Stijn', 'Lars', 'Joris', 'Niels', 'Bas', 'Wout',
      'Jasper', 'Teun', 'Milan', 'Sven', 'Kees', 'Luuk', 'Floris', 'Pim', 'Maarten', 'Gijs'],
    particles: ['van ', 'de ', 'van der ', 'van den ', 'ter '],
    lastA: ['Berg', 'Bak', 'Bos', 'Dijk', 'Graaf', 'Hoek', 'Jong', 'Kuip', 'Meer', 'Molen', 'Ploeg', 'Smit', 'Veld',
      'Vries', 'Wouw', 'Brink', 'Hout', 'Laar'],
    lastB: ['', 'er', 'hof', 'stra', 'man', 'huis', 'sen', 'ink', 'ma', 'kamp'],
  },
  nordic: {
    tone: [0.0, 0.2],
    first: ['Erik', 'Lars', 'Magnus', 'Anders', 'Oskar', 'Henrik', 'Mikkel', 'Rasmus', 'Jonas', 'Emil', 'Kasper',
      'Sander', 'Sindre', 'Viktor', 'Gustav', 'Axel', 'Elias', 'Tobias', 'Mathias', 'Jesper', 'Ole', 'Isak'],
    lastA: ['Ander', 'Berg', 'Dahl', 'Ek', 'Hol', 'Johan', 'Lind', 'Lund', 'Niel', 'Ny', 'Ped', 'Sand', 'Sol',
      'Strand', 'Sven', 'Vik', 'Fjeld', 'Hauk', 'Bjør', 'Kris'],
    lastB: ['sen', 'son', 'gren', 'berg', 'holm', 'ström', 'by', 'vik', 'stad', 'lie', 'ager', 'dal', 'ness',
      'quist'],
  },
  slavic: {
    tone: [0.03, 0.25],
    first: ['Luka', 'Ivan', 'Marko', 'Nikola', 'Dmytro', 'Jakub', 'Mateusz', 'Tomáš', 'Filip', 'Petar', 'Stefan',
      'Andriy', 'Bogdan', 'Dominik', 'Kamil', 'Milan', 'Ondřej', 'Viktor', 'Oleksandr', 'Damir', 'Josip', 'Ante',
      'Mislav', 'Pavel', 'Lazar', 'Vuk', 'Szymon', 'Taras'],
    lastA: ['Ba', 'Bro', 'Dra', 'Ko', 'Kra', 'Lu', 'Mar', 'Mil', 'No', 'Pe', 'Ra', 'Sto', 'Ta', 'Vu', 'Za', 'Gra',
      'Ste', 'Jan', 'Kos', 'Pav', 'Bog', 'Wis'],
    lastB: ['vić', 'ović', 'ski', 'czyk', 'enko', 'ák', 'ov', 'ek', 'ič', 'iak', 'ević', 'owski', 'chuk', 'ko',
      'ný', 'inski'],
  },
  greek: {
    tone: [0.08, 0.32],
    first: ['Giorgos', 'Kostas', 'Dimitris', 'Nikos', 'Vasilis', 'Christos', 'Panagiotis', 'Thanasis', 'Yannis',
      'Stelios', 'Michalis', 'Alexandros', 'Petros', 'Lefteris', 'Spyros', 'Manolis'],
    lastA: ['Pa', 'Kar', 'Ge', 'Dim', 'Ni', 'Ka', 'Ste', 'Ath', 'Ma', 'Chri', 'Va', 'Lam', 'Xan', 'Tsi'],
    lastB: ['akis', 'idis', 'opoulos', 'iadis', 'atos', 'elis', 'ou', 'as', 'ellos', 'oglou'],
  },
  turkish: {
    tone: [0.15, 0.45],
    first: ['Emre', 'Burak', 'Mert', 'Arda', 'Kerem', 'Can', 'Oğuz', 'Ozan', 'Barış', 'Hakan', 'Serkan', 'Yusuf',
      'Okay', 'Ferdi', 'Kaan', 'Efe', 'Umut', 'Berkay', 'Tolga', 'Doğukan', 'Eldor', 'Jasur', 'Timur', 'Rustam'],
    lastA: ['Ak', 'Ay', 'Bal', 'Çe', 'Da', 'Er', 'Gü', 'Kara', 'Kay', 'Öz', 'Şa', 'Tur', 'Yıl', 'Yü', 'Kılı', 'Soy',
      'Can', 'Tek'],
    lastB: ['soy', 'dağ', 'kaya', 'han', 'türk', 'oğlu', 'can', 'men', 'taş', 'demir', 'er', 'dız', 'el', 'ay'],
  },
  westAfrican: {
    tone: [0.75, 1.0],
    first: ['Kwame', 'Kofi', 'Yaw', 'Emeka', 'Chinedu', 'Oluwaseun', 'Babatunde', 'Ibrahima', 'Moussa', 'Mamadou',
      'Ousmane', 'Cheikh', 'Abdoulaye', 'Seydou', 'Kelechi', 'Obinna', 'Tunde', 'Kwabena', 'Fodé', 'Lamine',
      'Ismaila', 'Adama', 'Souleymane', 'Bakary', 'Amadou', 'Sékou', 'Issa', 'Nnamdi', 'Ebuka', 'Kossi'],
    lastA: ['Ade', 'Ok', 'Ba', 'Di', 'Ko', 'Ndi', 'Sa', 'Tra', 'Mba', 'Asa', 'Ofo', 'Nwa', 'Ka', 'Dem', 'Ama',
      'Kou', 'Sy', 'Ndo', 'Bo', 'Fa', 'Gye', 'Man'],
    lastB: ['yemi', 'onkwo', 'kité', 'allo', 'uma', 'aye', 'oré', 'eke', 'ndou', 'moah', 'kor', 'bayo', 'ssa',
      'ne', 'ffo', 'ama', 'rah', 'gbe', 'ouma', 'deba'],
  },
  northAfrican: {
    tone: [0.28, 0.6],
    first: ['Youssef', 'Mohamed', 'Hakim', 'Sofiane', 'Bilal', 'Amine', 'Karim', 'Walid', 'Nabil', 'Ismaël',
      'Yassine', 'Anis', 'Mehdi', 'Ayoub', 'Zakaria', 'Rachid', 'Hamza', 'Farid', 'Ilyes', 'Saïd', 'Adel', 'Taha',
      'Oussama', 'Marwane', 'Ziyad'],
    lastA: ['Ben', 'El', 'Bou', 'Ham', 'Za', 'Ker', 'Mah', 'Bel', 'Sli', 'Ait', 'Ou', 'Tal', 'Gha', 'Lah', 'Mes',
      'Ra'],
    lastB: ['ali', 'rouz', 'dani', 'mani', 'idi', 'kaoui', 'hadj', 'souda', 'ouri', 'louni', 'abdi', 'amri', 'rahi',
      'chiri', 'tati', 'zidi'],
  },
  eastAfrican: {
    tone: [0.72, 1.0],
    first: ['Thabo', 'Sipho', 'Themba', 'Bongani', 'Tendai', 'Tafadzwa', 'Musa', 'Brian', 'Peter', 'Kelvin',
      'Collins', 'Emmanuel', 'Joseph', 'Kagiso', 'Lebo', 'Siyabonga', 'Teboho', 'Godfrey', 'Felix', 'Eric',
      'Dennis', 'Abel', 'Mandla', 'Baraka', 'Juma', 'Isaac'],
    lastA: ['Mo', 'Nko', 'Ma', 'Ka', 'Mu', 'Shi', 'Nda', 'Zu', 'Mwa', 'Chi', 'Ngu', 'Ole', 'Ba', 'Tshe', 'Lu', 'Wa'],
    lastB: ['kena', 'si', 'lela', 'tembo', 'ngo', 'buyi', 'lanje', 'punga', 'nyi', 'hlophe', 'kwe', 'mba', 'onga',
      'ngwa', 'phiri', 'njiru'],
  },
  arabic: {
    tone: [0.28, 0.6],
    first: ['Abdullah', 'Fahad', 'Salem', 'Omar', 'Khalid', 'Ali', 'Hassan', 'Faisal', 'Nasser', 'Saleh',
      'Mohammed', 'Ahmed', 'Sultan', 'Majed', 'Yousef', 'Ibrahim', 'Hamad', 'Mubarak', 'Rashed', 'Tariq',
      'Mustafa', 'Hussein', 'Jassim', 'Mahmoud', 'Bader'],
    lastA: ['Al-Har', 'Al-Mut', 'Al-Ghan', 'Al-Shah', 'Al-Ob', 'Al-Kath', 'Al-Saf', 'Al-Nab', 'Al-Az', 'Al-Rub',
      'Al-Ham', 'Al-Jas', 'Ab', 'Has', 'Sal', 'Khal', 'Dar', 'Nas'],
    lastB: ['bi', 'iri', 'ami', 'eedi', 'aidi', 'abi', 'ani', 'ouri', 'ari', 'imi', 'awi', 'ali', 'ash', 'eh'],
  },
  persian: {
    tone: [0.22, 0.5],
    first: ['Ali', 'Reza', 'Mehdi', 'Saeed', 'Amir', 'Hossein', 'Milad', 'Morteza', 'Alireza', 'Mohammad', 'Ehsan',
      'Karim', 'Omid', 'Arash', 'Payam', 'Ramin', 'Vahid', 'Sina', 'Kaveh', 'Shahin'],
    lastA: ['Ja', 'Rah', 'Gho', 'Kar', 'Mo', 'Rez', 'Shoj', 'Tor', 'Hos', 'Naz', 'Bei', 'Far', 'Ami', 'Dar'],
    lastB: ['hani', 'imi', 'laei', 'ari', 'sheni', 'aei', 'ani', 'abi', 'avi', 'zadeh', 'pour', 'nejad', 'vand'],
  },
  japanese: {
    tone: [0.12, 0.35],
    first: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kaito', 'Daiki', 'Takumi', 'Ryota', 'Kenta', 'Shota', 'Yuki',
      'Hiroki', 'Kosei', 'Ritsu', 'Tsubasa', 'Kazuki', 'Shun', 'Riku', 'Taiga', 'Wataru', 'Kohei', 'Yamato'],
    lastA: ['Ta', 'Na', 'Ka', 'Ya', 'Mo', 'Su', 'Ha', 'Fu', 'Ni', 'Ma', 'Oka', 'Mi', 'Ishi', 'Sa', 'Ue', 'Ko'],
    lastB: ['naka', 'mura', 'moto', 'da', 'kawa', 'shita', 'yama', 'zaki', 'bayashi', 'hara', 'no', 'saki', 'mori',
      'uchi', 'gawa', 'zawa'],
  },
  korean: {
    tone: [0.12, 0.35],
    familyFirst: true,
    firstA: ['Min', 'Ji', 'Seung', 'Hyun', 'Jae', 'Woo', 'Dong', 'Sung', 'Tae', 'Young', 'Joon', 'Hee', 'Kang',
      'Chan', 'Do'],
    firstB: ['ho', 'hun', 'woo', 'min', 'jin', 'su', 'yeop', 'won', 'hyuk', 'gyu', 'bin', 'jun', 'seok', 'in'],
    firstJoin: '-',
    lastWhole: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo',
      'Shin', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Hong', 'Baek'],
  },
  chinese: {
    tone: [0.12, 0.35],
    familyFirst: true,
    firstA: ['Wei', 'Hao', 'Jun', 'Lei', 'Peng', 'Yu', 'Zhi', 'Xiao', 'Tian', 'Bo', 'Chen', 'Kai', 'Ming', 'Rui',
      'Yi'],
    firstB: ['', 'long', 'feng', 'yang', 'hui', 'jie', 'xin', 'ran', 'tao', 'wen', 'lin', 'hao'],
    firstJoin: '',
    lastWhole: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Ma',
      'Zhu', 'Hu', 'Guo', 'He', 'Gao', 'Lin', 'Luo'],
  },
  vietnamese: {
    tone: [0.25, 0.5],
    familyFirst: true,
    firstA: ['Van', 'Duc', 'Quang', 'Minh', 'Cong', 'Tuan', 'Hoang', 'Thanh'],
    firstB: ['Hau', 'Phuong', 'Hai', 'Toan', 'Long', 'Dung', 'Vinh', 'Tien', 'Khoa', 'Hung'],
    firstJoin: ' ',
    lastWhole: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Phan', 'Vu', 'Dang', 'Bui', 'Do', 'Ho', 'Ngo'],
  },
  seAsian: {
    tone: [0.32, 0.62],
    first: ['Ahmad', 'Rizky', 'Hafiz', 'Arif', 'Faiz', 'Danial', 'Irfan', 'Bayu', 'Dimas', 'Yoga', 'Rafli',
      'Supakit', 'Kittipong', 'Teerasak', 'Nattapong', 'Anucha', 'Wichai', 'Somchai', 'Marco', 'Jefferson'],
    lastA: ['Pra', 'Su', 'Sa', 'Ha', 'Nug', 'Wi', 'Kit', 'Chai', 'Ra', 'Ab', 'Is', 'Ram'],
    lastB: ['tama', 'santo', 'putra', 'yanto', 'roho', 'jaya', 'sak', 'wong', 'pong', 'dullah', 'mail', 'li'],
  },
  southAsian: {
    tone: [0.45, 0.75],
    first: ['Rahul', 'Arjun', 'Vikram', 'Anirudh', 'Sandesh', 'Lallian', 'Manvir', 'Ashique', 'Udanta', 'Akash',
      'Rohit', 'Nikhil', 'Pranav', 'Ravi', 'Amit', 'Deepak', 'Jeakson', 'Mohun'],
    lastA: ['Sing', 'Shar', 'Pa', 'Ku', 'Ra', 'Bhut', 'Me', 'Cha', 'Gur', 'Thap', 'Na', 'De'],
    lastB: ['h', 'ma', 'tel', 'mar', 'o', 'ia', 'hta', 'ndra', 'preet', 'a', 'ir', 'sai'],
  },
  pacific: {
    tone: [0.45, 0.78],
    first: ['Sione', 'Tevita', 'Roy', 'Kalani', 'Manu', 'Tama', 'Ratu', 'Josefa', 'Waisale', 'Rewa', 'Teva', 'Hemi',
      'Nikolasi', 'Aisake', 'Iosefo', 'Keoni', 'Ariki', 'Lui'],
    lastA: ['Tu', 'Va', 'Nai', 'Ra', 'Ka', 'Le', 'Ta', 'Ma', 'Wai', 'Fo', 'Ro', 'Ti'],
    lastB: ['ilagi', 'sa', 'mua', 'tua', 'kama', 'vou', 'ivalu', 'nuku', 'ono', 'tini', 'rewa', 'fea'],
  },
};
export const NAME_REGIONS = Object.keys(NAME_POOLS);

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
  ['bot', 'Botswana', 'BOT', 'AFR', 58, '4-4-2', '#75aadb', '#ffffff', '#75aadb', '#000000', '#000000', '#000000', EA],
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
// League ids: 'alb' (England), 'ibe' (Spain), 'pen' (Italy), 'teu' (Germany),
// 'hex' (France), 'afr' (Africa), plus pool 'row' (rest-of-world, no league).
export const LEAGUES = [
  { id: 'alb', name: 'English Premier League', country: 'eng', confed: 'EUR', size: 20 },
  { id: 'ibe', name: 'Spanish La Liga', country: 'esp', confed: 'EUR', size: 20 },
  { id: 'pen', name: 'Italian Serie A', country: 'ita', confed: 'EUR', size: 20 },
  { id: 'teu', name: 'German Bundesliga', country: 'ger', confed: 'EUR', size: 18 },
  { id: 'hex', name: 'French Ligue 1', country: 'fra', confed: 'EUR', size: 18 },
  { id: 'afr', name: 'African Super League', country: null, confed: 'AFR', size: 16 },
  { id: 'low', name: 'Dutch Eredivisie', country: 'ned', confed: 'EUR', size: 16 },
  { id: 'lus', name: 'Portuguese Primeira Liga', country: 'por', confed: 'EUR', size: 16 },
  { id: 'ana', name: 'Turkish Süper Lig', country: 'tur', confed: 'EUR', size: 16 },
  { id: 'cal', name: 'Scottish Premiership', country: 'sco', confed: 'EUR', size: 12 },
  { id: 'bsr', name: 'Brazilian Brasileirão Série A', country: 'bra', confed: 'SAM', size: 16 },
  { id: 'pla', name: 'Argentine Liga Profesional', country: 'arg', confed: 'SAM', size: 16 },
  { id: 'cam', name: 'American Major League Soccer', country: 'usa', confed: 'NCA', size: 16 },
  { id: 'gul', name: 'Saudi Pro League', country: 'ksa', confed: 'ASI', size: 14 },
  // Second tiers (promotion/relegation with the league named in `above`).
  { id: 'alb2', name: 'English Championship', country: 'eng', confed: 'EUR', size: 22, tier: 2, above: 'alb' },
  { id: 'ibe2', name: 'Spanish Segunda División', country: 'esp', confed: 'EUR', size: 22, tier: 2, above: 'ibe' },
];

// [name, short, rating, shirt, shorts, socks, altShirt, altShorts, altSocks, country?]
const C = {
  alb: [
    ['Arsenal', 'ARS', 87, '#ef0107', '#ffffff', '#ef0107', '#ffffff', '#ffffff', '#ef0107'],
    ['Aston Villa', 'AVL', 83, '#670e36', '#ffffff', '#670e36', '#ffffff', '#ffffff', '#670e36'],
    ['Bournemouth', 'BOU', 79, '#da291c', '#000000', '#da291c', '#ffffff', '#ffffff', '#da291c'],
    ['Brentford', 'BRE', 79, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Brighton', 'BHA', 81, '#0057b8', '#0057b8', '#ffffff', '#ffffff', '#ffffff', '#0057b8'],
    ['Burnley', 'BUR', 72, '#6c1d45', '#87ceeb', '#6c1d45', '#ffffff', '#ffffff', '#6c1d45'],
    ['Chelsea', 'CHE', 85, '#034694', '#034694', '#ffffff', '#ffffff', '#ffffff', '#034694'],
    ['Crystal Palace', 'CRY', 78, '#1b458f', '#1b458f', '#1b458f', '#ffffff', '#ffffff', '#1b458f'],
    ['Everton', 'EVE', 78, '#003399', '#ffffff', '#003399', '#ffffff', '#ffffff', '#003399'],
    ['Fulham', 'FUL', 80, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Leeds United', 'LEE', 76, '#ffffff', '#ffffff', '#1d428a', '#111111', '#111111', '#ffffff'],
    ['Liverpool', 'LIV', 89, '#c8102e', '#c8102e', '#c8102e', '#ffffff', '#ffffff', '#c8102e'],
    ['Manchester City', 'MCI', 89, '#6cabdd', '#ffffff', '#6cabdd', '#111111', '#111111', '#6cabdd'],
    ['Manchester United', 'MUN', 82, '#da291c', '#ffffff', '#000000', '#ffffff', '#ffffff', '#da291c'],
    ['Newcastle United', 'NEW', 84, '#241f20', '#ffffff', '#241f20', '#ffffff', '#ffffff', '#241f20'],
    ['Nottingham Forest', 'NFO', 81, '#dd0000', '#ffffff', '#dd0000', '#ffffff', '#ffffff', '#dd0000'],
    ['Sunderland', 'SUN', 75, '#eb0037', '#ffffff', '#eb0037', '#ffffff', '#ffffff', '#eb0037'],
    ['Tottenham Hotspur', 'TOT', 83, '#ffffff', '#132257', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['West Ham United', 'WHU', 78, '#7a263a', '#ffffff', '#7a263a', '#ffffff', '#ffffff', '#7a263a'],
    ['Wolverhampton Wanderers', 'WOL', 74, '#fdb913', '#000000', '#000000', '#111111', '#111111', '#fdb913'],
  ],
  ibe: [
    ['Alavés', 'ALA', 72, '#004b8d', '#ffffff', '#004b8d', '#ffffff', '#ffffff', '#004b8d'],
    ['Athletic Club', 'ATH', 81, '#ee2523', '#000000', '#000000', '#ffffff', '#ffffff', '#ee2523'],
    ['Atlético Madrid', 'ATM', 86, '#cb3524', '#0a2a66', '#cb3524', '#ffffff', '#ffffff', '#cb3524'],
    ['Barcelona', 'BAR', 89, '#a50044', '#004d98', '#a50044', '#ffffff', '#ffffff', '#a50044'],
    ['Real Betis', 'BET', 80, '#00954c', '#ffffff', '#00954c', '#ffffff', '#ffffff', '#00954c'],
    ['Celta Vigo', 'CEL', 78, '#8ac3ee', '#ffffff', '#8ac3ee', '#111111', '#111111', '#8ac3ee'],
    ['Elche', 'ELC', 71, '#ffffff', '#046a38', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Espanyol', 'ESP', 75, '#ffffff', '#0083c5', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Getafe', 'GET', 73, '#0055a4', '#0055a4', '#0055a4', '#ffffff', '#ffffff', '#0055a4'],
    ['Girona', 'GIR', 77, '#cd2534', '#ffffff', '#cd2534', '#ffffff', '#ffffff', '#cd2534'],
    ['Levante', 'LEV', 72, '#8a1538', '#0a2a66', '#8a1538', '#ffffff', '#ffffff', '#8a1538'],
    ['Mallorca', 'MLL', 74, '#e20613', '#000000', '#e20613', '#ffffff', '#ffffff', '#e20613'],
    ['Osasuna', 'OSA', 75, '#0a3466', '#0a3466', '#0a3466', '#ffffff', '#ffffff', '#0a3466'],
    ['Real Oviedo', 'OVI', 70, '#0a3d91', '#ffffff', '#0a3d91', '#ffffff', '#ffffff', '#0a3d91'],
    ['Rayo Vallecano', 'RAY', 76, '#ffffff', '#ffffff', '#e30613', '#111111', '#111111', '#ffffff'],
    ['Real Madrid', 'RMA', 90, '#ffffff', '#ffffff', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Real Sociedad', 'RSO', 79, '#0067b1', '#ffffff', '#0067b1', '#ffffff', '#ffffff', '#0067b1'],
    ['Sevilla', 'SEV', 79, '#ffffff', '#ffffff', '#d00027', '#111111', '#111111', '#ffffff'],
    ['Valencia', 'VAL', 77, '#ffffff', '#000000', '#ff7a00', '#111111', '#111111', '#ffffff'],
    ['Villarreal', 'VIL', 82, '#ffe667', '#004b8d', '#ffe667', '#111111', '#111111', '#ffe667'],
  ],
  pen: [
    ['Atalanta', 'ATA', 84, '#1e71b8', '#000000', '#1e71b8', '#ffffff', '#ffffff', '#1e71b8'],
    ['Bologna', 'BOL', 81, '#a31c34', '#0a2a66', '#a31c34', '#ffffff', '#ffffff', '#a31c34'],
    ['Cagliari', 'CAG', 73, '#a91e22', '#0a2a66', '#a91e22', '#ffffff', '#ffffff', '#a91e22'],
    ['Como', 'COM', 76, '#005ca9', '#ffffff', '#005ca9', '#ffffff', '#ffffff', '#005ca9'],
    ['Cremonese', 'CRE', 71, '#7a1f3d', '#7a1f3d', '#7a1f3d', '#ffffff', '#ffffff', '#7a1f3d'],
    ['Fiorentina', 'FIO', 80, '#582c83', '#ffffff', '#582c83', '#ffffff', '#ffffff', '#582c83'],
    ['Genoa', 'GEN', 74, '#d00027', '#0a2a66', '#0a2a66', '#ffffff', '#ffffff', '#d00027'],
    ['Inter', 'INT', 88, '#0068a8', '#000000', '#0068a8', '#ffffff', '#ffffff', '#0068a8'],
    ['Juventus', 'JUV', 85, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Lazio', 'LAZ', 82, '#87d8f7', '#ffffff', '#87d8f7', '#111111', '#111111', '#87d8f7'],
    ['Lecce', 'LEC', 71, '#e8c547', '#a91e22', '#e8c547', '#111111', '#111111', '#e8c547'],
    ['AC Milan', 'MIL', 85, '#fb090b', '#000000', '#000000', '#ffffff', '#ffffff', '#fb090b'],
    ['Napoli', 'NAP', 87, '#12a0d7', '#ffffff', '#12a0d7', '#111111', '#111111', '#12a0d7'],
    ['Parma', 'PAR', 74, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Pisa', 'PIS', 69, '#000000', '#1e71b8', '#000000', '#ffffff', '#ffffff', '#000000'],
    ['AS Roma', 'ROM', 83, '#8e1f2f', '#8e1f2f', '#f0bc42', '#ffffff', '#ffffff', '#8e1f2f'],
    ['Sassuolo', 'SAS', 75, '#00a651', '#000000', '#00a651', '#111111', '#111111', '#00a651'],
    ['Torino', 'TOR', 76, '#5e0b15', '#ffffff', '#5e0b15', '#ffffff', '#ffffff', '#5e0b15'],
    ['Udinese', 'UDI', 75, '#ffffff', '#000000', '#000000', '#111111', '#111111', '#ffffff'],
    ['Hellas Verona', 'VER', 70, '#005ca9', '#f7d117', '#005ca9', '#ffffff', '#ffffff', '#005ca9'],
  ],
  teu: [
    ['FC Augsburg', 'AUG', 73, '#ba3733', '#ffffff', '#ba3733', '#ffffff', '#ffffff', '#ba3733'],
    ['Bayern Munich', 'BAY', 89, '#dc052d', '#dc052d', '#dc052d', '#ffffff', '#ffffff', '#dc052d'],
    ['Borussia Dortmund', 'BVB', 85, '#fde100', '#000000', '#fde100', '#111111', '#111111', '#fde100'],
    ['Eintracht Frankfurt', 'SGE', 82, '#e1000f', '#000000', '#e1000f', '#ffffff', '#ffffff', '#e1000f'],
    ['SC Freiburg', 'SCF', 79, '#ffffff', '#ffffff', '#e30613', '#111111', '#111111', '#ffffff'],
    ['Borussia Mönchengladbach', 'BMG', 76, '#ffffff', '#000000', '#000000', '#111111', '#111111', '#ffffff'],
    ['Hamburger SV', 'HSV', 74, '#ffffff', '#0a2a66', '#dd0741', '#111111', '#111111', '#ffffff'],
    ['FC Heidenheim', 'FCH', 70, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['TSG Hoffenheim', 'TSG', 75, '#1c63b7', '#ffffff', '#1c63b7', '#ffffff', '#ffffff', '#1c63b7'],
    ['1. FC Köln', 'KOE', 73, '#ed1c24', '#ffffff', '#ed1c24', '#ffffff', '#ffffff', '#ed1c24'],
    ['Bayer Leverkusen', 'B04', 86, '#e32221', '#000000', '#e32221', '#ffffff', '#ffffff', '#e32221'],
    ['RB Leipzig', 'RBL', 83, '#ffffff', '#dd0741', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Mainz 05', 'M05', 77, '#ed1c24', '#ed1c24', '#ffffff', '#ffffff', '#ffffff', '#ed1c24'],
    ['FC St. Pauli', 'STP', 72, '#5c3317', '#ffffff', '#5c3317', '#ffffff', '#ffffff', '#5c3317'],
    ['VfB Stuttgart', 'VFB', 82, '#ffffff', '#e32221', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Union Berlin', 'FCU', 77, '#f6c90e', '#e32221', '#f6c90e', '#111111', '#111111', '#f6c90e'],
    ['Werder Bremen', 'SVW', 76, '#1d9053', '#ffffff', '#1d9053', '#111111', '#111111', '#1d9053'],
    ['VfL Wolfsburg', 'WOB', 75, '#65b32e', '#ffffff', '#65b32e', '#111111', '#111111', '#65b32e'],
  ],
  hex: [
    ['Angers', 'ANG', 71, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Auxerre', 'AJA', 72, '#ffffff', '#0a2a66', '#0a2a66', '#111111', '#111111', '#ffffff'],
    ['Brest', 'BRS', 76, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Lens', 'RCL', 80, '#fff200', '#e30613', '#fff200', '#111111', '#111111', '#fff200'],
    ['Le Havre', 'HAC', 71, '#7ab5e6', '#0a2a66', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['Lille', 'LIL', 82, '#e01e13', '#0a2a66', '#e01e13', '#ffffff', '#ffffff', '#e01e13'],
    ['Lorient', 'FCL', 72, '#ff7a00', '#ffffff', '#ff7a00', '#111111', '#111111', '#ff7a00'],
    ['Lyon', 'OLY', 81, '#ffffff', '#da291c', '#0a2a66', '#111111', '#111111', '#ffffff'],
    ['Marseille', 'MAR', 83, '#2faee0', '#ffffff', '#2faee0', '#111111', '#111111', '#2faee0'],
    ['Metz', 'FCM', 70, '#5e0b15', '#5e0b15', '#5e0b15', '#ffffff', '#ffffff', '#5e0b15'],
    ['Monaco', 'ASM', 83, '#ffffff', '#e30613', '#e30613', '#111111', '#111111', '#ffffff'],
    ['Nantes', 'FCN', 73, '#f7d117', '#00843d', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Nice', 'NIC', 79, '#e30613', '#000000', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Paris FC', 'PFC', 71, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Paris Saint-Germain', 'PSG', 89, '#004170', '#004170', '#da291c', '#ffffff', '#ffffff', '#004170'],
    ['Rennes', 'REN', 77, '#e30613', '#000000', '#000000', '#ffffff', '#ffffff', '#e30613'],
    ['Strasbourg', 'STR', 78, '#009fe3', '#ffffff', '#009fe3', '#111111', '#111111', '#009fe3'],
    ['Toulouse', 'TFC', 75, '#5e2b97', '#ffffff', '#5e2b97', '#ffffff', '#ffffff', '#5e2b97'],
  ],
  afr: [
    ['Al Ahly', 'AHL', 82, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613', 'egy'],
    ['Espérance de Tunis', 'EST', 79, '#f7d117', '#e30613', '#f7d117', '#111111', '#111111', '#f7d117', 'tun'],
    ['Mamelodi Sundowns', 'SUN', 80, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117', 'rsa'],
    ['TP Mazembe', 'TPM', 77, '#000000', '#ffffff', '#000000', '#ffffff', '#ffffff', '#000000', 'cod'],
    ['Wydad AC', 'WAC', 78, '#e30613', '#e30613', '#ffffff', '#ffffff', '#ffffff', '#e30613', 'mar'],
    ['Raja Casablanca', 'RCA', 77, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d', 'mar'],
    ['Zamalek', 'ZAM', 78, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff', 'egy'],
    ['Orlando Pirates', 'PIR', 76, '#000000', '#000000', '#ffffff', '#ffffff', '#ffffff', '#000000', 'rsa'],
    ['Kaizer Chiefs', 'KAI', 74, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117', 'rsa'],
    ['Enyimba', 'ENY', 72, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'nga'],
    ['Rivers United', 'RIV', 71, '#0a2a66', '#0a2a66', '#ffffff', '#ffffff', '#ffffff', '#0a2a66', 'nga'],
    ['Asante Kotoko', 'KOT', 73, '#e30613', '#e30613', '#e30613', '#ffffff', '#ffffff', '#e30613', 'gha'],
    ['Hearts of Oak', 'HEA', 71, '#0a2a66', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#0a2a66', 'gha'],
    ['Simba SC', 'SIM', 72, '#e30613', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#e30613', 'tan'],
    ['Young Africans', 'YGA', 73, '#f7d117', '#00843d', '#f7d117', '#111111', '#111111', '#f7d117', 'tan'],
    ['ASEC Mimosas', 'ASE', 72, '#f7d117', '#000000', '#000000', '#111111', '#111111', '#f7d117', 'civ'],
  ],
  low: [
    ['Ajax', 'AJA', 84, '#ffffff', '#ffffff', '#d00027', '#111111', '#111111', '#ffffff'],
    ['AZ Alkmaar', 'AZA', 79, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Excelsior', 'EXC', 68, '#e30613', '#000000', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Feyenoord', 'FEY', 83, '#ffffff', '#000000', '#cc0000', '#111111', '#111111', '#ffffff'],
    ['Fortuna Sittard', 'FOR', 72, '#f7d117', '#00843d', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Go Ahead Eagles', 'GAE', 75, '#e30613', '#f7d117', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['FC Groningen', 'GRO', 73, '#ffffff', '#00843d', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Heerenveen', 'HEE', 73, '#7ab5e6', '#ffffff', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['Heracles Almelo', 'HER', 71, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['NAC Breda', 'NAC', 70, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['NEC Nijmegen', 'NEC', 74, '#e30613', '#00843d', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['PSV Eindhoven', 'PSV', 85, '#e30613', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#e30613'],
    ['Sparta Rotterdam', 'SPA', 72, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['FC Twente', 'TWE', 78, '#e30613', '#e30613', '#ffffff', '#ffffff', '#ffffff', '#e30613'],
    ['FC Utrecht', 'UTR', 77, '#ffffff', '#e30613', '#e30613', '#111111', '#111111', '#ffffff'],
    ['FC Volendam', 'VOL', 69, '#ff7a00', '#ffffff', '#ff7a00', '#111111', '#111111', '#ff7a00'],
  ],
  lus: [
    ['Alverca', 'ALV', 68, '#e30613', '#0a2a66', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Arouca', 'ARO', 71, '#f7d117', '#0a2a66', '#0a2a66', '#111111', '#111111', '#f7d117'],
    ['AVS', 'AVS', 67, '#e30613', '#e30613', '#ffffff', '#ffffff', '#ffffff', '#e30613'],
    ['Benfica', 'BEN', 85, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Braga', 'BRA', 80, '#ffffff', '#e30613', '#e30613', '#111111', '#111111', '#ffffff'],
    ['Casa Pia', 'CAS', 70, '#000000', '#000000', '#ffffff', '#ffffff', '#ffffff', '#000000'],
    ['Estoril', 'EST', 73, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Estrela Amadora', 'ESA', 69, '#ffffff', '#e30613', '#00843d', '#111111', '#111111', '#ffffff'],
    ['Famalicão', 'FAM', 74, '#ffffff', '#0a2a66', '#0a2a66', '#111111', '#111111', '#ffffff'],
    ['Gil Vicente', 'GIL', 72, '#e30613', '#0a2a66', '#0a2a66', '#ffffff', '#ffffff', '#e30613'],
    ['Moreirense', 'MOR', 71, '#00843d', '#00843d', '#ffffff', '#ffffff', '#ffffff', '#00843d'],
    ['Nacional', 'NAC', 69, '#000000', '#ffffff', '#000000', '#ffffff', '#ffffff', '#000000'],
    ['FC Porto', 'POR', 84, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Rio Ave', 'RIO', 70, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d'],
    ['Sporting CP', 'SPO', 86, '#00843d', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#00843d'],
    ['Vitória Guimarães', 'VIT', 75, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
  ],
  ana: [
    ['Alanyaspor', 'ALA', 70, '#ff7a00', '#00843d', '#ff7a00', '#111111', '#111111', '#ff7a00'],
    ['Antalyaspor', 'ANT', 69, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Başakşehir', 'IBA', 73, '#ff7a00', '#0a2a66', '#ff7a00', '#111111', '#111111', '#ff7a00'],
    ['Beşiktaş', 'BJK', 79, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Çaykur Rizespor', 'RIZ', 70, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d'],
    ['Eyüpspor', 'EYU', 69, '#5e2b97', '#f7d117', '#5e2b97', '#ffffff', '#ffffff', '#5e2b97'],
    ['Fenerbahçe', 'FEN', 82, '#ffed00', '#0a2a66', '#ffed00', '#111111', '#111111', '#ffed00'],
    ['Galatasaray', 'GAL', 83, '#f7d117', '#a32638', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Gaziantep', 'GAZ', 69, '#e30613', '#000000', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Gençlerbirliği', 'GEN', 67, '#e30613', '#000000', '#000000', '#ffffff', '#ffffff', '#e30613'],
    ['Göztepe', 'GOZ', 72, '#f7d117', '#e30613', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Konyaspor', 'KON', 70, '#ffffff', '#00843d', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Kocaelispor', 'KOC', 68, '#00843d', '#000000', '#00843d', '#ffffff', '#ffffff', '#00843d'],
    ['Samsunspor', 'SAM', 74, '#e30613', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#e30613'],
    ['Trabzonspor', 'TRA', 78, '#7ab5e6', '#5e0b15', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['Fatih Karagümrük', 'KAR', 67, '#000000', '#e30613', '#000000', '#ffffff', '#ffffff', '#000000'],
  ],
  cal: [
    ['Aberdeen', 'ABE', 72, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Celtic', 'CEL', 80, '#ffffff', '#00843d', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Dundee', 'DUN', 68, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Dundee United', 'DUN', 69, '#ff7a00', '#000000', '#ff7a00', '#111111', '#111111', '#ff7a00'],
    ['Falkirk', 'FAL', 66, '#0a2a66', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#0a2a66'],
    ['Hearts', 'HEA', 74, '#5e0b15', '#ffffff', '#5e0b15', '#ffffff', '#ffffff', '#5e0b15'],
    ['Hibernian', 'HIB', 73, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d'],
    ['Kilmarnock', 'KIL', 69, '#0a2a66', '#0a2a66', '#ffffff', '#ffffff', '#ffffff', '#0a2a66'],
    ['Livingston', 'LIV', 66, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Motherwell', 'MOT', 69, '#f7d117', '#5e0b15', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Rangers', 'RAN', 79, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['St Mirren', 'STM', 69, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
  ],
  bsr: [
    ['Atlético Mineiro', 'CAM', 80, '#000000', '#ffffff', '#000000', '#ffffff', '#ffffff', '#000000'],
    ['Bahia', 'BAH', 77, '#ffffff', '#0a2a66', '#e30613', '#111111', '#111111', '#ffffff'],
    ['Botafogo', 'BOT', 82, '#000000', '#ffffff', '#000000', '#ffffff', '#ffffff', '#000000'],
    ['Bragantino', 'RBB', 76, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Ceará', 'CEA', 73, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Corinthians', 'COR', 80, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Cruzeiro', 'CRU', 79, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Flamengo', 'FLA', 84, '#e30613', '#000000', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Fluminense', 'FLU', 80, '#5e0b15', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#5e0b15'],
    ['Fortaleza', 'FOR', 77, '#0a2a66', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#0a2a66'],
    ['Grêmio', 'GRE', 78, '#7ab5e6', '#000000', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['Internacional', 'INT', 79, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Mirassol', 'MIR', 74, '#f7d117', '#00843d', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Palmeiras', 'PAL', 83, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d'],
    ['Santos', 'SAN', 77, '#ffffff', '#ffffff', '#000000', '#111111', '#111111', '#ffffff'],
    ['São Paulo', 'SAO', 80, '#ffffff', '#000000', '#e30613', '#111111', '#111111', '#ffffff'],
  ],
  pla: [
    ['Argentinos Juniors', 'ARG', 75, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Atlético Tucumán', 'ATU', 71, '#7ab5e6', '#ffffff', '#0a2a66', '#111111', '#111111', '#7ab5e6'],
    ['Banfield', 'BAN', 71, '#ffffff', '#00843d', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Barracas Central', 'BAR', 70, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Belgrano', 'BEL', 72, '#7ab5e6', '#000000', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['Boca Juniors', 'BOC', 82, '#0a2a66', '#0a2a66', '#f7d117', '#ffffff', '#ffffff', '#0a2a66'],
    ['Defensa y Justicia', 'DYJ', 73, '#f7d117', '#00843d', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Estudiantes', 'EST', 77, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Huracán', 'HUR', 74, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Independiente', 'IND', 76, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Lanús', 'LAN', 73, '#5e0b15', '#ffffff', '#5e0b15', '#ffffff', '#ffffff', '#5e0b15'],
    ['Racing Club', 'RAC', 79, '#7ab5e6', '#ffffff', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['River Plate', 'RIV', 83, '#ffffff', '#000000', '#e30613', '#111111', '#111111', '#ffffff'],
    ['Rosario Central', 'ROS', 76, '#0a2a66', '#f7d117', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['San Lorenzo', 'SAN', 75, '#0a2a66', '#e30613', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Vélez Sarsfield', 'VEL', 75, '#ffffff', '#0a2a66', '#ffffff', '#111111', '#111111', '#ffffff'],
  ],
  cam: [
    ['Atlanta United', 'ATL', 73, '#5e0b15', '#000000', '#5e0b15', '#ffffff', '#ffffff', '#5e0b15'],
    ['Charlotte FC', 'CHA', 71, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Chicago Fire', 'CHI', 70, '#e30613', '#0a2a66', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['FC Cincinnati', 'CIN', 74, '#ff7a00', '#0a2a66', '#ff7a00', '#111111', '#111111', '#ff7a00'],
    ['Columbus Crew', 'CLB', 75, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['FC Dallas', 'DAL', 71, '#e30613', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#e30613'],
    ['Houston Dynamo', 'HOU', 72, '#ff7a00', '#ffffff', '#ff7a00', '#111111', '#111111', '#ff7a00'],
    ['Inter Miami', 'MIA', 78, '#f5a3c7', '#000000', '#f5a3c7', '#111111', '#111111', '#f5a3c7'],
    ['LA Galaxy', 'LAG', 74, '#ffffff', '#0a2a66', '#00245d', '#111111', '#111111', '#ffffff'],
    ['LAFC', 'LAF', 76, '#000000', '#000000', '#c39e6d', '#ffffff', '#ffffff', '#000000'],
    ['Nashville SC', 'NSH', 71, '#e8c547', '#0a2a66', '#e8c547', '#111111', '#111111', '#e8c547'],
    ['New York City FC', 'NYC', 73, '#7ab5e6', '#0a2a66', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['Philadelphia Union', 'PHI', 74, '#0a2a66', '#dfd1a7', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Portland Timbers', 'POR', 72, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d'],
    ['Seattle Sounders', 'SEA', 74, '#5dade2', '#ffffff', '#5dade2', '#111111', '#111111', '#5dade2'],
    ['Toronto FC', 'TOR', 70, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
  ],
  gul: [
    ['Al Ahli', 'AHL', 78, '#ffffff', '#00843d', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Al Ettifaq', 'ETT', 72, '#00843d', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#00843d'],
    ['Al Fateh', 'FAT', 70, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Al Hilal', 'HIL', 83, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Al Ittihad', 'ITT', 81, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Al Khaleej', 'KHA', 69, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d'],
    ['Al Nassr', 'NAS', 82, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Al Okhdood', 'OKH', 66, '#7ab5e6', '#ffffff', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['Al Qadsiah', 'QAD', 74, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Al Riyadh', 'RIY', 68, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Al Shabab', 'SHA', 73, '#ffffff', '#000000', '#000000', '#111111', '#111111', '#ffffff'],
    ['Al Taawoun', 'TAA', 72, '#f7d117', '#5e0b15', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Damac', 'DAM', 68, '#e30613', '#f7d117', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Neom SC', 'NEO', 71, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
  ],
  row: [
    ['Olympiacos', 'OLY', 79, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613', 'gre'],
    ['Panathinaikos', 'PAN', 76, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d', 'gre'],
    ['Club Brugge', 'CLU', 79, '#0a2a66', '#000000', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'bel'],
    ['Anderlecht', 'AND', 75, '#5e2b97', '#ffffff', '#5e2b97', '#ffffff', '#ffffff', '#5e2b97', 'bel'],
    ['Shakhtar Donetsk', 'SHA', 77, '#ff7a00', '#000000', '#ff7a00', '#111111', '#111111', '#ff7a00', 'ukr'],
    ['Dynamo Kyiv', 'DYN', 75, '#ffffff', '#0a2a66', '#ffffff', '#111111', '#111111', '#ffffff', 'ukr'],
    ['Red Star Belgrade', 'RSB', 76, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613', 'srb'],
    ['Partizan Belgrade', 'PAR', 73, '#000000', '#ffffff', '#000000', '#ffffff', '#ffffff', '#000000', 'srb'],
    ['Sparta Prague', 'SPA', 75, '#5e0b15', '#ffffff', '#5e0b15', '#ffffff', '#ffffff', '#5e0b15', 'cze'],
    ['Slavia Prague', 'SLA', 76, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff', 'cze'],
    ['RB Salzburg', 'SAL', 76, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff', 'aut'],
    ['Young Boys', 'YBO', 74, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117', 'sui'],
    ['FC Copenhagen', 'FCK', 76, '#ffffff', '#0a2a66', '#ffffff', '#111111', '#111111', '#ffffff', 'den'],
    ['Malmö FF', 'MAL', 73, '#7ab5e6', '#ffffff', '#7ab5e6', '#111111', '#111111', '#7ab5e6', 'swe'],
    ['Dinamo Zagreb', 'DIN', 75, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'cro'],
    ['Legia Warsaw', 'LEG', 73, '#ffffff', '#000000', '#000000', '#111111', '#111111', '#ffffff', 'pol'],
    ['Petro de Luanda', 'PET', 71, '#e30613', '#f7d117', '#e30613', '#ffffff', '#ffffff', '#e30613', 'ang'],
    ['Horoya AC', 'HOR', 69, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613', 'gui'],
    ['Coton Sport', 'COT', 69, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d', 'cmr'],
    ['Stade Malien', 'STA', 68, '#ffffff', '#0a2a66', '#ffffff', '#111111', '#111111', '#ffffff', 'mli'],
    ['Teungueth FC', 'TEU', 67, '#0a2a66', '#f7d117', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'sen'],
    ['Jwaneng Galaxy', 'JWA', 66, '#000000', '#f7d117', '#000000', '#ffffff', '#ffffff', '#000000', 'bot'],
    ['Guanabara FC', 'GUA', 79, '#e30613', '#000000', '#e30613', '#ffffff', '#ffffff', '#e30613', 'bra'],
    ['Serra Paulista FC', 'SPF', 78, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d', 'bra'],
    ['Montevideo Celeste Club', 'MCC', 75, '#7ab5e6', '#000000', '#7ab5e6', '#111111', '#111111', '#7ab5e6', 'uru'],
    ['Tenochtitlan Serpientes', 'TSE', 74, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117', 'mex'],
    ['Pacific Coast SC', 'PCS', 70, '#2a9d8f', '#ffffff', '#2a9d8f', '#111111', '#111111', '#2a9d8f', 'usa'],
    ['Kanto Sakura FC', 'KSF', 72, '#f5a3c7', '#ffffff', '#f5a3c7', '#111111', '#111111', '#f5a3c7', 'jpn'],
    ['Riyadh Desert Hawks', 'RDH', 73, '#0a2a66', '#ffffff', '#f7d117', '#ffffff', '#ffffff', '#0a2a66', 'ksa'],
    ['Waitematā Tide FC', 'WTD', 62, '#000000', '#ffffff', '#000000', '#ffffff', '#ffffff', '#000000', 'nzl'],
    ['Suva Reef FC', 'SRF', 57, '#7ab5e6', '#ffffff', '#7ab5e6', '#111111', '#111111', '#7ab5e6', 'fij'],
    ['Río de la Plata Atlético', 'RPA', 79, '#0a2a66', '#f7d117', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'arg'],
  ],
};

// Second-tier leagues (promotion/relegation with the league named in `above`).
C.alb2 = [
    ['Birmingham City', 'BIR', 72, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Blackburn Rovers', 'BLA', 71, '#ffffff', '#0a2a66', '#e30613', '#111111', '#111111', '#ffffff'],
    ['Bristol City', 'BRI', 71, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Coventry City', 'COV', 73, '#7ab5e6', '#ffffff', '#7ab5e6', '#111111', '#111111', '#7ab5e6'],
    ['Derby County', 'DER', 70, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Hull City', 'HUL', 69, '#ff7a00', '#000000', '#ff7a00', '#111111', '#111111', '#ff7a00'],
    ['Ipswich Town', 'IPS', 73, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Leicester City', 'LEI', 76, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Middlesbrough', 'MID', 71, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Millwall', 'MIL', 70, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Norwich City', 'NOR', 71, '#f7d117', '#00843d', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Oxford United', 'OXF', 68, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Portsmouth', 'POR', 69, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Preston North End', 'PNE', 69, '#ffffff', '#0a2a66', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Queens Park Rangers', 'QPR', 70, '#ffffff', '#0a2a66', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Sheffield United', 'SHU', 72, '#e30613', '#ffffff', '#000000', '#ffffff', '#ffffff', '#e30613'],
    ['Southampton', 'SOU', 73, '#e30613', '#ffffff', '#000000', '#ffffff', '#ffffff', '#e30613'],
    ['Stoke City', 'STO', 69, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Swansea City', 'SWA', 69, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Watford', 'WAT', 70, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['West Bromwich Albion', 'WBA', 71, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Wrexham', 'WRE', 70, '#e30613', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#e30613'],
];
C.ibe2 = [
    ['Albacete', 'ALB', 70, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Almería', 'ALM', 71, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['FC Andorra', 'AND', 68, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Burgos', 'BUR', 68, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Cádiz', 'CAD', 70, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Castellón', 'CAS', 69, '#000000', '#ffffff', '#000000', '#ffffff', '#ffffff', '#000000'],
    ['Ceuta', 'CEU', 66, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Córdoba', 'COR', 69, '#ffffff', '#00843d', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Cultural Leonesa', 'CUL', 67, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Deportivo La Coruña', 'DEP', 71, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Eibar', 'EIB', 70, '#5e0b15', '#0a2a66', '#5e0b15', '#ffffff', '#ffffff', '#5e0b15'],
    ['Granada', 'GRA', 71, '#e30613', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#e30613'],
    ['Huesca', 'HUE', 69, '#0a2a66', '#5e0b15', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
    ['Las Palmas', 'LPA', 71, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117'],
    ['Leganés', 'LEG', 70, '#ffffff', '#0a2a66', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Málaga', 'MAG', 69, '#ffffff', '#0a2a66', '#7ab5e6', '#111111', '#111111', '#ffffff'],
    ['Mirandés', 'MIR', 68, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Racing Santander', 'RAC', 71, '#ffffff', '#00843d', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Real Zaragoza', 'ZAR', 70, '#ffffff', '#0a2a66', '#ffffff', '#111111', '#111111', '#ffffff'],
    ['Sporting Gijón', 'SPO', 70, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613'],
    ['Real Valladolid', 'VLL', 71, '#5e2b97', '#ffffff', '#5e2b97', '#ffffff', '#ffffff', '#5e2b97'],
    ['Eldense', 'ELD', 66, '#0a2a66', '#5e0b15', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66'],
];

// Clubs from the Americas, Asia and Oceania for the continental club cups and the
// club world championship.
const ROW_EXTRA = [
    ['Peñarol', 'PEN', 77, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117', 'uru'],
    ['Club Nacional', 'NAC', 76, '#ffffff', '#0a2a66', '#e30613', '#111111', '#111111', '#ffffff', 'uru'],
    ['Colo-Colo', 'COL', 75, '#ffffff', '#000000', '#000000', '#111111', '#111111', '#ffffff', 'chi'],
    ['Olimpia', 'OLI', 74, '#ffffff', '#000000', '#ffffff', '#111111', '#111111', '#ffffff', 'par'],
    ['Cerro Porteño', 'CER', 73, '#0a2a66', '#e30613', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'par'],
    ['LDU Quito', 'LDU', 74, '#ffffff', '#e30613', '#0a2a66', '#111111', '#111111', '#ffffff', 'ecu'],
    ['Barcelona SC', 'BSC', 73, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117', 'ecu'],
    ['Sporting Cristal', 'CRI', 72, '#7ab5e6', '#ffffff', '#7ab5e6', '#111111', '#111111', '#7ab5e6', 'per'],
    ['Alianza Lima', 'ALI', 71, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'per'],
    ['Club Bolívar', 'BOL', 70, '#7ab5e6', '#ffffff', '#7ab5e6', '#111111', '#111111', '#7ab5e6', 'bol'],
    ['The Strongest', 'STR', 69, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117', 'bol'],
    ['Club América', 'AME', 78, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117', 'mex'],
    ['Chivas Guadalajara', 'CHI', 75, '#ffffff', '#e30613', '#0a2a66', '#111111', '#111111', '#ffffff', 'mex'],
    ['Cruz Azul', 'CAZ', 76, '#0a2a66', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#0a2a66', 'mex'],
    ['Tigres UANL', 'TIG', 77, '#f7d117', '#0a2a66', '#f7d117', '#111111', '#111111', '#f7d117', 'mex'],
    ['Monterrey', 'MON', 76, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'mex'],
    ['Deportivo Saprissa', 'SAP', 70, '#5e2b97', '#ffffff', '#5e2b97', '#ffffff', '#ffffff', '#5e2b97', 'crc'],
    ['LD Alajuelense', 'ALA', 69, '#e30613', '#000000', '#e30613', '#ffffff', '#ffffff', '#e30613', 'crc'],
    ['Olimpia Tegucigalpa', 'OLI', 68, '#ffffff', '#e30613', '#ffffff', '#111111', '#111111', '#ffffff', 'hon'],
    ['Urawa Red Diamonds', 'URA', 74, '#e30613', '#ffffff', '#000000', '#ffffff', '#ffffff', '#e30613', 'jpn'],
    ['Kashima Antlers', 'KAS', 73, '#e30613', '#0a2a66', '#e30613', '#ffffff', '#ffffff', '#e30613', 'jpn'],
    ['Yokohama F. Marinos', 'YOK', 73, '#0a2a66', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#0a2a66', 'jpn'],
    ['Kawasaki Frontale', 'KAW', 72, '#7ab5e6', '#000000', '#7ab5e6', '#111111', '#111111', '#7ab5e6', 'jpn'],
    ['Vissel Kobe', 'VIS', 72, '#5e0b15', '#ffffff', '#5e0b15', '#ffffff', '#ffffff', '#5e0b15', 'jpn'],
    ['Jeonbuk Motors', 'JEO', 72, '#00843d', '#ffffff', '#00843d', '#ffffff', '#ffffff', '#00843d', 'kor'],
    ['Ulsan HD', 'ULS', 72, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'kor'],
    ['FC Seoul', 'SEO', 70, '#e30613', '#000000', '#e30613', '#ffffff', '#ffffff', '#e30613', 'kor'],
    ['Al Ain', 'AIN', 73, '#5e2b97', '#ffffff', '#5e2b97', '#ffffff', '#ffffff', '#5e2b97', 'uae'],
    ['Sharjah FC', 'SHA', 70, '#ffffff', '#5e0b15', '#ffffff', '#111111', '#111111', '#ffffff', 'uae'],
    ['Persepolis', 'PER', 73, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613', 'irn'],
    ['Esteghlal', 'EST', 72, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'irn'],
    ['Sepahan', 'SEP', 70, '#f7d117', '#000000', '#f7d117', '#111111', '#111111', '#f7d117', 'irn'],
    ['Al Sadd', 'SAD', 72, '#ffffff', '#000000', '#000000', '#111111', '#111111', '#ffffff', 'qat'],
    ['Al Duhail', 'DUH', 70, '#e30613', '#ffffff', '#e30613', '#ffffff', '#ffffff', '#e30613', 'qat'],
    ['Johor Darul Tazim', 'JDT', 70, '#0a2a66', '#e30613', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'mas'],
    ['Buriram United', 'BUR', 69, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'tha'],
    ['Melbourne Victory', 'MEL', 70, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'aus'],
    ['Sydney FC', 'SYD', 69, '#7ab5e6', '#0a2a66', '#7ab5e6', '#111111', '#111111', '#7ab5e6', 'aus'],
    ['Auckland City', 'AUC', 64, '#0a2a66', '#ffffff', '#0a2a66', '#ffffff', '#ffffff', '#0a2a66', 'nzl'],
];
const NATION_BY_ID = Object.fromEntries(NATIONS.map((n) => [n.id, n]));
const REGIONAL_MIX = {
  SAM: { share: 0.12, mix: [['latin', 55], ['brazilian', 25], ['westAfrican', 10], ['spanish', 10]] },
  NCA: { share: 0.35, mix: [['latin', 35], ['brazilian', 15], ['caribbean', 15], ['english', 10], ['westAfrican', 15], ['spanish', 10]] },
  ASI: { share: 0.25, mix: [['brazilian', 35], ['latin', 15], ['westAfrican', 20], ['slavic', 10], ['spanish', 10], ['portuguese', 10]] },
  OCE: { share: 0.25, mix: [['english', 50], ['pacific', 30], ['latin', 10], ['westAfrican', 10]] },
};
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
  SQUAD_TEMPLATE.forEach((pos, i) => {
    seenPos[pos] = (seenPos[pos] || 0) + 1;
    const starterSlots = { GK: 1, CB: 2, LB: 1, RB: 1, CDM: 1, CM: 2, CAM: 1, LM: 1, RM: 1, LW: 1, RW: 1, ST: 1 };
    const starter = seenPos[pos] <= starterSlots[pos];
    const [region, , tone] = weightedPick(rng, pop);
    let nm;
    for (let t = 0; t < 6; t++) { nm = genName(region, rng); if (!usedNames.has(nm.name)) break; }
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
