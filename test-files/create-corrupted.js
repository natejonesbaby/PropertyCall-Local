const fs = require('fs');
const path = require('path');

// Create a file that starts with PK (ZIP header) but is corrupted
const buf = Buffer.alloc(500);
buf.write('PK\x03\x04'); // ZIP local file header signature
// Fill rest with random bytes to make it unreadable as a valid ZIP/XLSX
for(let i = 4; i < 500; i++) {
  buf[i] = Math.floor(Math.random() * 256);
}

const outputPath = path.join(__dirname, 'truly-corrupted.xlsx');
fs.writeFileSync(outputPath, buf);
console.log('Created corrupted file at:', outputPath);
