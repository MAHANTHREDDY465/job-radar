/* Parse a resume PDF -> plain text. Usage: node parse-resume.js <file.pdf> [outfile] */
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const file = process.argv[2];
const out = process.argv[3] || path.join(__dirname, '..', 'data', 'resume.txt');
if (!file) { console.error('usage: node parse-resume.js <file.pdf> [outfile]'); process.exit(1); }

pdf(fs.readFileSync(file)).then((d) => {
  const text = (d.text || '').replace(/\n{3,}/g, '\n\n').trim();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.error(`pages: ${d.numpages}, chars: ${text.length} -> ${out}\n`);
  process.stdout.write(text);
}).catch((e) => { console.error('parse failed:', e.message); process.exit(1); });
