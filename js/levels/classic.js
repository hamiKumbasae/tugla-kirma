// Classic mode: 30 recognisable shapes, ordered easy → hard. Early levels are
// compact, solid blocks; later ones are thin, hollow or scattered layouts where
// the last few bricks are harder to reach. Ball speed and paddle width are
// scaled by position in the list (see difficultyFor() in game.js).
const CLASSIC_CHAPTERS = [
  {
    title: "Başlangıç",
    levels: [
      { name: "Piramit",       rows: 7, pattern: "pyramid" },
      { name: "Elmas",         rows: 7, pattern: "diamond" },
      { name: "Klasik Duvar",  rows: 5, pattern: "full" },
      { name: "Kalp",          pattern: "heart" },
      { name: "Yıldız",        pattern: "star" },
      { name: "Ağaç",          pattern: "tree" },
      { name: "Tekne",         pattern: "boat" },
      { name: "Taç",           pattern: "crown" },
      { name: "Ev",            pattern: "house" },
      { name: "Balon",         pattern: "balloon" },
    ],
  },
  {
    title: "Orta",
    levels: [
      { name: "Kalkan",        pattern: "shield" },
      { name: "Çan",           pattern: "bell" },
      { name: "Şemsiye",       pattern: "umbrella" },
      { name: "Ok",            rows: 7, pattern: "arrow" },
      { name: "Kupa",          pattern: "trophy" },
      { name: "Roket",         pattern: "rocket" },
      { name: "Hilal",         rows: 8, pattern: "crescent" },
      { name: "Kum Saati",     rows: 8, pattern: "hourglass" },
      { name: "Artı",          rows: 7, pattern: "plus" },
      { name: "Güneş",         pattern: "sun" },
    ],
  },
  {
    title: "Zor",
    levels: [
      { name: "Kılıç",         pattern: "sword" },
      { name: "Anahtar",       pattern: "key" },
      { name: "Çapa",          pattern: "anchor" },
      { name: "Kar Tanesi",    pattern: "snowflake" },
      { name: "Sonsuzluk",     rows: 7, pattern: "infinity" },
      { name: "Adalar",        rows: 8, pattern: "islands" },
      { name: "Dama Tahtası",  rows: 6, pattern: "checkerboard" },
      { name: "Hedef Tahtası", rows: 8, pattern: "target" },
      { name: "Labirent",      rows: 8, pattern: "maze" },
      { name: "Büyük Final",   rows: 9, pattern: "full" },
    ],
  },
];
