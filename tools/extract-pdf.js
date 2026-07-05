/* Minimal PDF text extractor — pure Node (zlib only).
   Inflates FlateDecode streams and pulls text from PDF text operators.
   Good enough to read a resume. Usage: node tools/extract-pdf.js <file.pdf> */

const fs = require('fs');
const zlib = require('zlib');

const file = process.argv[2];
if (!file) { console.error('usage: node extract-pdf.js <file.pdf>'); process.exit(1); }

const buf = fs.readFileSync(file);

// Find all stream…endstream byte ranges.
function streams(buffer) {
  const out = [];
  const s = buffer.latin1Slice(0, buffer.length);
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    if (end === -1) continue;
    out.push(buffer.subarray(start, end));
  }
  return out;
}

function inflate(bytes) {
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) {
    try { return fn(bytes).toString('latin1'); } catch { /* try next */ }
  }
  return null;
}

function decodeLiteral(str) {
  // str is the content between ( and ), with PDF escapes
  return str
    .replace(/\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

function textFromContent(content) {
  let out = '';
  // Tokens: literal strings OR positioning operators (which imply line/space breaks)
  const re = /(\((?:[^()\\]|\\.)*\))|(\bT[dDm*]\b)|(\bTJ\b)|(\bTj\b)|(\bET\b)/g;
  let m;
  let lastWasText = false;
  while ((m = re.exec(content))) {
    if (m[1]) { out += decodeLiteral(m[1].slice(1, -1)); lastWasText = true; }
    else if (m[2] || m[5]) { out += '\n'; lastWasText = false; } // Td/TD/Tm/T*/ET -> newline
    else if (lastWasText) { out += ' '; }
  }
  return out;
}

let text = '';
for (const st of streams(buf)) {
  const inflated = inflate(st) || st.toString('latin1');
  if (/BT|Tj|TJ/.test(inflated)) text += textFromContent(inflated) + '\n';
}

// tidy up
text = text
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/ *\n */g, '\n')
  .trim();

process.stdout.write(text + '\n');
