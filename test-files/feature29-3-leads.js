// Script to create test XLSX file with 3 leads for Feature #29
const XLSX = require('xlsx');
const path = require('path');

// Create 3 test leads with unique identifiers
const timestamp = Date.now();
const leads = [
  {
    'First Name': `FEAT29_TEST1_${timestamp}`,
    'Last Name': 'LEADONE',
    'Property Address': '100 Feature29 Test St',
    'Property City': 'Orlando',
    'Property State': 'FL',
    'Property Zip': '32801',
    'Mobile 1': '4075551001',
    'Mail Address': '100 Feature29 Test St',
    'Mail City': 'Orlando',
    'Mail State': 'FL',
    'Mail Zip': '32801'
  },
  {
    'First Name': `FEAT29_TEST2_${timestamp}`,
    'Last Name': 'LEADTWO',
    'Property Address': '200 Feature29 Test Ave',
    'Property City': 'Orlando',
    'Property State': 'FL',
    'Property Zip': '32802',
    'Mobile 1': '4075551002',
    'Mail Address': '200 Feature29 Test Ave',
    'Mail City': 'Orlando',
    'Mail State': 'FL',
    'Mail Zip': '32802'
  },
  {
    'First Name': `FEAT29_TEST3_${timestamp}`,
    'Last Name': 'LEADTHREE',
    'Property Address': '300 Feature29 Test Blvd',
    'Property City': 'Orlando',
    'Property State': 'FL',
    'Property Zip': '32803',
    'Mobile 1': '4075551003',
    'Mail Address': '300 Feature29 Test Blvd',
    'Mail City': 'Orlando',
    'Mail State': 'FL',
    'Mail Zip': '32803'
  }
];

// Create workbook and worksheet
const ws = XLSX.utils.json_to_sheet(leads);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

// Write to file
const outputPath = path.join(__dirname, 'feature29-3-leads.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`Created test file: ${outputPath}`);
console.log(`Contains ${leads.length} leads with timestamp ${timestamp}`);
console.log(`Lead names: ${leads.map(l => l['First Name']).join(', ')}`);
