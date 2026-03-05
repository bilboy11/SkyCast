// Node.js script to generate PWA icons from SVG
// Run with: node generate-icons.js
// Requires: npm install sharp

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = path.join(__dirname, 'icon.svg');

async function generateIcons() {
  try {
    // Read SVG
    const svgBuffer = fs.readFileSync(svgPath);
    
    // Generate each size
    for (const size of sizes) {
      const outputPath = path.join(__dirname, `icon-${size}x${size}.png`);
      
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      
      console.log(`Generated: icon-${size}x${size}.png`);
    }
    
    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    console.log('\nNote: This script requires the "sharp" package.');
    console.log('Install it with: npm install sharp');
  }
}

generateIcons();
