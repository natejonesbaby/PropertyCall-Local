const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ICNS file format:
// 4 bytes: 'icns' magic
// 4 bytes: file length (big endian)
// Then icon entries, each with:
//   4 bytes: icon type (e.g., 'ic07' for 128x128)
//   4 bytes: entry length including header (big endian)
//   N bytes: PNG data

// Create a proper PNG icon with the specified size
function createPNG(size) {
    // PNG signature
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // CRC32 lookup table
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crcTable[n] = c;
    }

    function crc32(data) {
        let crc = 0xffffffff;
        for (let i = 0; i < data.length; i++) {
            crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function createChunk(type, data) {
        const typeBytes = Buffer.from(type);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length, 0);
        const crcData = Buffer.concat([typeBytes, data]);
        const crcValue = crc32(crcData);
        const crcBytes = Buffer.alloc(4);
        crcBytes.writeUInt32BE(crcValue, 0);
        return Buffer.concat([length, typeBytes, data, crcBytes]);
    }

    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);   // width
    ihdrData.writeUInt32BE(size, 4);   // height
    ihdrData[8] = 8;                    // bit depth
    ihdrData[9] = 6;                    // color type (RGBA)
    ihdrData[10] = 0;                   // compression
    ihdrData[11] = 0;                   // filter
    ihdrData[12] = 0;                   // interlace
    const ihdr = createChunk('IHDR', ihdrData);

    // Create raw image data (RGBA)
    // Design: Blue circle with white "P" letter for Property Call
    const rawData = [];
    const center = size / 2;
    const radius = size * 0.45;

    for (let y = 0; y < size; y++) {
        rawData.push(0); // filter byte
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= radius) {
                // Inside the circle - blue background
                // Check if we're in the "P" letter area
                const relX = (x - center) / radius;
                const relY = (y - center) / radius;

                // Draw a simple "P" shape
                const inPStem = relX >= -0.4 && relX <= -0.15 && relY >= -0.5 && relY <= 0.5;
                const inPTop = relX >= -0.4 && relX <= 0.3 && relY >= -0.5 && relY <= -0.25;
                const inPBowlTop = relX >= 0.1 && relX <= 0.35 && relY >= -0.5 && relY <= 0.1;
                const inPBowlBottom = relX >= -0.4 && relX <= 0.3 && relY >= -0.05 && relY <= 0.15;

                if (inPStem || inPTop || inPBowlTop || inPBowlBottom) {
                    // White letter
                    rawData.push(255, 255, 255, 255);
                } else {
                    // Blue background (#3B82F6)
                    rawData.push(0x3B, 0x82, 0xF6, 255);
                }
            } else if (dist <= radius + 2) {
                // Anti-aliasing edge
                const alpha = Math.max(0, Math.min(255, Math.round((radius + 2 - dist) * 127)));
                rawData.push(0x3B, 0x82, 0xF6, alpha);
            } else {
                // Transparent outside
                rawData.push(0, 0, 0, 0);
            }
        }
    }
    const rawBuffer = Buffer.from(rawData);

    // Compress with zlib
    const compressed = zlib.deflateSync(rawBuffer, { level: 9 });
    const idat = createChunk('IDAT', compressed);

    // IEND chunk
    const iend = createChunk('IEND', Buffer.alloc(0));

    // Combine all chunks
    return Buffer.concat([signature, ihdr, idat, iend]);
}

// ICNS icon types and their sizes
const iconTypes = [
    { type: 'ic07', size: 128 },   // 128x128
    { type: 'ic08', size: 256 },   // 256x256
    { type: 'ic09', size: 512 },   // 512x512
    { type: 'ic10', size: 1024 },  // 1024x1024 (512@2x)
    { type: 'ic11', size: 32 },    // 16x16@2x
    { type: 'ic12', size: 64 },    // 32x32@2x
    { type: 'ic13', size: 256 },   // 128x128@2x
    { type: 'ic14', size: 512 },   // 256x256@2x
];

// Create ICNS file
const entries = [];

for (const icon of iconTypes) {
    console.log(`Creating ${icon.size}x${icon.size} icon (${icon.type})...`);
    const pngData = createPNG(icon.size);

    // Create entry header
    const entryHeader = Buffer.alloc(8);
    entryHeader.write(icon.type, 0, 4, 'ascii');
    entryHeader.writeUInt32BE(8 + pngData.length, 4);

    entries.push(Buffer.concat([entryHeader, pngData]));
}

// Combine all entries
const allEntries = Buffer.concat(entries);

// Create ICNS header
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 4, 'ascii');
icnsHeader.writeUInt32BE(8 + allEntries.length, 4);

// Final ICNS file
const icnsFile = Buffer.concat([icnsHeader, allEntries]);

// Save the file
const outputPath = path.join(__dirname, 'Property Call.app/Contents/Resources/AppIcon.icns');
fs.writeFileSync(outputPath, icnsFile);
console.log('Created AppIcon.icns at:', outputPath);
console.log('File size:', icnsFile.length, 'bytes');

// Also update the iconset PNGs with proper icons
const iconsetPath = path.join(__dirname, 'Property Call.app/Contents/Resources/AppIcon.iconset');
const iconsetFiles = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
];

for (const icon of iconsetFiles) {
    const pngData = createPNG(icon.size);
    fs.writeFileSync(path.join(iconsetPath, icon.name), pngData);
    console.log('Updated iconset:', icon.name);
}

console.log('\nDone! AppIcon.icns and iconset PNGs have been created.');
