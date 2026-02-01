const XLSX = require('../backend/node_modules/xlsx');

// Create test data - these should match existing leads in the database
const testData = [
  {
    'First Name': 'DUPLICATE_TEST',
    'Last Name': 'LEAD_ONE',
    'Property Address': '123 DUPLICATE TEST LANE',
    'Property City': 'TESTVILLE',
    'Property State': 'FL',
    'Property Zip': '32801',
    'Mobile 1': '(555) 111-2222',
    'Bedrooms': 3,
    'Bathrooms': 2,
    'Square Feet': 1500,
    'Year Built': 2000
  },
  {
    'First Name': 'DUPLICATE_TEST',
    'Last Name': 'LEAD_TWO',
    'Property Address': '456 DUPLICATE TEST AVE',
    'Property City': 'TESTVILLE',
    'Property State': 'FL',
    'Property Zip': '32802',
    'Mobile 1': '(555) 333-4444',
    'Bedrooms': 4,
    'Bathrooms': 3,
    'Square Feet': 2000,
    'Year Built': 2010
  },
  {
    'First Name': 'DUPLICATE_TEST',
    'Last Name': 'LEAD_THREE',
    'Property Address': '789 DUPLICATE TEST BLVD',
    'Property City': 'TESTVILLE',
    'Property State': 'FL',
    'Property Zip': '32803',
    'Mobile 1': '(555) 555-6666',
    'Bedrooms': 2,
    'Bathrooms': 1,
    'Square Feet': 1000,
    'Year Built': 1990
  }
];

// Create worksheet
const ws = XLSX.utils.json_to_sheet(testData);

// Create workbook
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

// Write file
XLSX.writeFile(wb, 'duplicate-test.xlsx');
console.log('Created duplicate-test.xlsx with', testData.length, 'rows');
