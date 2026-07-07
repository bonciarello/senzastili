/* ============================================
   Test Suite — Convertitore RTF in TXT
   Testa il parser RTF con vari scenari.
   Esegui con: node test.js
   ============================================ */

'use strict';

const { parseRTF, looksLikeRTF } = require('./script.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    const msg = '  ✗ ' + name + '\n    ' + err.message;
    console.log(msg);
    failures.push({ name, error: err.message });
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || '') + '\n      expected: ' + JSON.stringify(expected) + '\n      actual:   ' + JSON.stringify(actual));
  }
}

function assertContains(actual, substring, msg) {
  if (!actual.includes(substring)) {
    throw new Error((msg || '') + '\n      expected to contain: ' + JSON.stringify(substring) + '\n      actual: ' + JSON.stringify(actual.substring(0, 200)));
  }
}

function assertNotContains(actual, substring, msg) {
  if (actual.includes(substring)) {
    throw new Error((msg || '') + '\n      expected NOT to contain: ' + JSON.stringify(substring) + '\n      actual: ' + JSON.stringify(actual.substring(0, 200)));
  }
}

// ============================================================
//  TEST: looksLikeRTF
// ============================================================

console.log('\nlooksLikeRTF:');
test('riconosce un RTF valido', () => {
  assertEqual(looksLikeRTF('{\\rtf1\\ansi\\deff0 Ciao'), true);
});

test('rifiuta testo normale', () => {
  assertEqual(looksLikeRTF('Ciao mondo'), false);
});

test('riconosce RTF con BOM', () => {
  assertEqual(looksLikeRTF('\uFEFF{\\rtf1\\ansi Ciao'), true);
});

test('riconosce RTF con spazi iniziali', () => {
  assertEqual(looksLikeRTF('  \n {\\rtf1\\ansi Ciao'), true);
});

test('rifiuta stringa vuota', () => {
  assertEqual(looksLikeRTF(''), false);
});

// ============================================================
//  TEST: parseRTF — base
// ============================================================

console.log('\nparseRTF — parsing base:');
test('stringa vuota restituisce stringa vuota', () => {
  assertEqual(parseRTF(''), '');
});

test('null restituisce stringa vuota', () => {
  assertEqual(parseRTF(null), '');
});

test('testo semplice senza RTF passa attraverso', () => {
  assertEqual(parseRTF('Ciao mondo'), 'Ciao mondo');
});

// ============================================================
//  TEST: parseRTF — formattazione
// ============================================================

console.log('\nparseRTF — rimozione formattazione:');
test('rimuove \\b (grassetto)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 {\\b testo in grassetto}}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'testo in grassetto');
});

test('rimuove \\i (corsivo)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 {\\i testo in corsivo}}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'testo in corsivo');
});

test('rimuove \\b e \\i annidati', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 {\\b {\\i grassetto corsivo}}}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'grassetto corsivo');
});

test('rimuove \\ul (sottolineato)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 {\\ul testo sottolineato}}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'testo sottolineato');
});

test('rimuove \\strike (barrato)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 {\\strike testo barrato}}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'testo barrato');
});

test('rimuove \\super (apice)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 x{\\super 2}}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'x2');
});

test('rimuove \\sub (pedice)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 H{\\sub 2}O}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'H2O');
});

test('rimuove \\scaps (maiuscoletto)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 {\\scaps Maiuscoletto}}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'Maiuscoletto');
});

// ============================================================
//  TEST: parseRTF — paragrafi e newline
// ============================================================

console.log('\nparseRTF — paragrafi:');
test('\\par diventa newline', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 Prima riga\\par Seconda riga}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'Prima riga\nSeconda riga');
});

test('\\line diventa newline', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 Riga 1\\line Riga 2}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'Riga 1\nRiga 2');
});

test('\\par multipli collassano', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 A\\par\\par\\par\\par B}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'A\n\nB');
});

// ============================================================
//  TEST: parseRTF — tabulazioni e tabelle
// ============================================================

console.log('\nparseRTF — tabulazioni e tabelle:');
test('\\tab diventa tab', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 Col1\\tab Col2}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'Col1\tCol2');
});

test('\\cell diventa tab', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 A\\cell B\\cell\\row}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'A\tB');
});

test('\\trowd viene ignorato', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 \\trowd\\cellx1000 Testo}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'Testo');
});

// ============================================================
//  TEST: parseRTF — escape
// ============================================================

console.log('\nparseRTF — escape:');
test("\\'e9 diventa é (escape esadecimale)", () => {
  const rtf = "{\\rtf1\\ansi\\deff0 caff\\'e9}";
  const txt = parseRTF(rtf);
  assertEqual(txt, 'caffé');
});

test("\\'C0 diventa À", () => {
  const rtf = "{\\rtf1\\ansi\\deff0 \\'C0 la carte}";
  const txt = parseRTF(rtf);
  assertEqual(txt, 'À la carte');
});

test('\\~ diventa non-breaking space', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 parola1\\~parola2}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'parola1\u00A0parola2');
});

test('\\u1234 unicode escape (decimale 1234 = U+04D2)', () => {
  // \u1234 in RTF = carattere Unicode con codepoint decimale 1234 = U+04D2
  const rtf = '{\\rtf1\\ansi\\deff0 Simbolo: \\u1234?}';
  const txt = parseRTF(rtf);
  assertContains(txt, '\u04D2'); // Ӓ (1234 decimale = 0x04D2)
  assertNotContains(txt, '?');
});

test('\\u233 unicode escape (é minuscola)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 caff\\u233?}';
  const txt = parseRTF(rtf);
  assertContains(txt, '\u00E9'); // é = U+00E9 = 233
});

// ============================================================
//  TEST: parseRTF — caratteri speciali RTF
// ============================================================

console.log('\nparseRTF — caratteri speciali:');
test('\\emdash diventa —', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 Prima\\emdash Seconda}';
  const txt = parseRTF(rtf);
  assertContains(txt, '\u2014');
});

test('\\endash diventa –', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 2020\\endash 2026}';
  const txt = parseRTF(rtf);
  assertContains(txt, '\u2013');
});

test('\\lquote e \\rquote', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 \\lquote citazione\\rquote}';
  const txt = parseRTF(rtf);
  assertContains(txt, '\u2018');
  assertContains(txt, '\u2019');
});

test('\\ldblquote e \\rdblquote', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 \\ldblquote doppia\\rdblquote}';
  const txt = parseRTF(rtf);
  assertContains(txt, '\u201C');
  assertContains(txt, '\u201D');
});

test('\\bullet diventa •', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 \\bullet elemento}';
  const txt = parseRTF(rtf);
  assertContains(txt, '\u2022');
});

// ============================================================
//  TEST: parseRTF — destinazioni ignorabili
// ============================================================

console.log('\nparseRTF — destinazioni ignorabili:');
test('\\*\\fonttbl viene ignorato completamente', () => {
  const rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fswiss Helvetica;}}Testo visibile}';
  const txt = parseRTF(rtf);
  assertEqual(txt.includes('Helvetica'), false, 'fonttbl non deve apparire');
  assertEqual(txt, 'Testo visibile');
});

test('\\*\\colortbl viene ignorato', () => {
  const rtf = '{\\rtf1\\ansi\\deff0{\\colortbl;\\red0\\green0\\blue0;}Testo}';
  const txt = parseRTF(rtf);
  assertEqual(txt.includes('red'), false, 'colortbl non deve apparire');
  assertEqual(txt, 'Testo');
});

test('\\*\\stylesheet viene ignorato', () => {
  const rtf = '{\\rtf1\\ansi\\deff0{\\stylesheet{\\s0 Normal;}}Contenuto}';
  const txt = parseRTF(rtf);
  assertEqual(txt.includes('Normal'), false, 'stylesheet non deve apparire');
  assertEqual(txt, 'Contenuto');
});

test('\\*\\generator viene ignorato', () => {
  const rtf = '{\\rtf1\\ansi\\deff0{\\*\\generator Word;}Testo}';
  const txt = parseRTF(rtf);
  assertEqual(txt.includes('Word'), false, 'generator non deve apparire');
  assertEqual(txt, 'Testo');
});

// ============================================================
//  TEST: parseRTF — header e footer
// ============================================================

console.log('\nparseRTF — header/footer:');
test('\\header viene ignorato', () => {
  const rtf = '{\\rtf1\\ansi\\deff0{\\header Intestazione}Corpo del testo}';
  const txt = parseRTF(rtf);
  assertEqual(txt.includes('Intestazione'), false, 'header non deve apparire');
  assertContains(txt, 'Corpo del testo');
});

test('\\footer viene ignorato', () => {
  const rtf = '{\\rtf1\\ansi\\deff0{\\footer Piè di pagina}Testo principale}';
  const txt = parseRTF(rtf);
  assertEqual(txt.includes('Piè'), false, 'footer non deve apparire');
  assertContains(txt, 'Testo principale');
});

// ============================================================
//  TEST: parseRTF — casi reali
// ============================================================

console.log('\nparseRTF — casi realistici:');
test('documento RTF con formattazione mista', () => {
  const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fswiss Helvetica;}{\\f1\\fmodern Courier;}}
{\\colortbl;\\red0\\green0\\blue0;\\red255\\green0\\blue0;}
\\f0\\fs24
{\\b Titolo del documento}\\par\\par
{\\i Questo \\'e8 un paragrafo in corsivo con \\b grassetto\\b0 annidato.}\\par
Elenco puntato:\\par
\\bullet Prima voce\\par
\\bullet Seconda voce\\par
\\par
{\\ul Conclusione:} il test \\'e8 riuscito.\\par
}`;
  const txt = parseRTF(rtf);
  // Deve contenere il testo visibile (nota: RTF mangia lo spazio delimitatore dopo \b0)
  assertContains(txt, 'Titolo del documento');
  assertContains(txt, 'è un paragrafo in corsivo con grassettoannidato');
  assertContains(txt, 'Prima voce');
  assertContains(txt, 'Seconda voce');
  assertContains(txt, 'Conclusione:');
  assertContains(txt, 'riuscito');
  // Non deve contenere markup
  assertNotContains(txt, '\\b');
  assertNotContains(txt, '\\i');
  assertNotContains(txt, '\\ul');
  assertNotContains(txt, '\\f0');
  assertNotContains(txt, '\\fs24');
  assertNotContains(txt, 'Helvetica');
  assertNotContains(txt, 'Courier');
});

test('documento RTF con caratteri italiani accentati', () => {
  const rtf = "{\\rtf1\\ansi\\deff0 Perch\\'e9 non \\'e8 possibile? Citt\\'e0 e comunit\\'e0}";
  const txt = parseRTF(rtf);
  assertContains(txt, 'Perché');
  assertContains(txt, 'è');
  assertContains(txt, 'Città');
  assertContains(txt, 'comunità');
});

test('testo con \\par e \\pard (reset paragrafo)', () => {
  const rtf = '{\\rtf1\\ansi\\deff0\\pard\\qc Centrato\\par\\pard Sinistra}';
  const txt = parseRTF(rtf);
  assertContains(txt, 'Centrato');
  assertContains(txt, 'Sinistra');
  // \\pard e \\qc devono essere rimossi
  assertNotContains(txt, '\\pard');
  assertNotContains(txt, '\\qc');
});

// ============================================================
//  TEST: parseRTF — edge cases
// ============================================================

console.log('\nparseRTF — edge cases:');
test('gruppi vuoti', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 Prima{} Seconda}';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'Prima Seconda');
});

test('backslash alla fine della stringa', () => {
  const rtf = '{\\rtf1\\ansi\\deff0 Testo\\';
  const txt = parseRTF(rtf);
  assertEqual(txt, 'Testo');
});

test('escape esadecimale incompleto alla fine', () => {
  const rtf = "{\\rtf1\\ansi\\deff0 Testo\\'";
  const txt = parseRTF(rtf);
  assertEqual(txt, 'Testo');
});

test('solo formattazione, nessun testo', () => {
  const rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;}}';
  const txt = parseRTF(rtf);
  // Potrebbe essere vuoto se c'è solo fonttbl e colortbl
  assertEqual(typeof txt, 'string');
});

test('testo dopo parentesi graffa di chiusura extra', () => {
  // A volte i file RTF hanno graffe sbilanciate
  const rtf = '{\\rtf1\\ansi\\deff0 Testo}}extra';
  const txt = parseRTF(rtf);
  assertContains(txt, 'Testo');
});

test('caratteri newline nel sorgente RTF vengono convertiti in spazio', () => {
  const rtf = '{\\rtf1\\ansi\nCiao\nmondo}';
  const txt = parseRTF(rtf);
  // I \n nel sorgente diventano spazi
  assertEqual(txt, 'Ciao mondo');
});

// ============================================================
//  RIEPILOGO
// ============================================================

console.log('\n' + '='.repeat(50));
console.log('RISULTATI: ' + passed + ' passati, ' + failed + ' falliti');
console.log('='.repeat(50));

if (failures.length > 0) {
  console.log('\nDETTAGLIO FALLIMENTI:');
  failures.forEach((f) => {
    console.log('  ✗ ' + f.name);
    console.log('    ' + f.error);
  });
}

process.exit(failed > 0 ? 1 : 0);
