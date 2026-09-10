#!/usr/bin/env node

/**
 * Clear Cache Script
 * Updates version numbers in HTML files to force browser cache refresh
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'public', 'index.html');

// Generate new version with timestamp
const version = new Date().getTime();

// Read index.html
let content = fs.readFileSync(indexPath, 'utf8');

// Update all version query parameters
content = content.replace(/\?v=[\d.]+/g, `?v=${version}`);

// Write back
fs.writeFileSync(indexPath, content, 'utf8');

console.log(`✓ Cache-busting version updated to: ${version}`);
console.log('✓ Browser cache will be invalidated on next page load');
console.log('\nTo completely clear browser cache:');
console.log('  Chrome/Edge: Ctrl+Shift+Delete → Clear browsing data');
console.log('  Firefox: Ctrl+Shift+Delete → Clear recent history');
console.log('  Or use: Ctrl+F5 (hard refresh)');
