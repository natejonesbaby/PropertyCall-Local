// Create a test XLSX file for Feature #167 - FUB Lead Creation Test
const XLSX = require('../backend/node_modules/xlsx');

// Create test data with 3 leads
const testLeads = [
  {
    'First Name': 'FUB_Test_John',
    'Last Name': 'Feature167_A',
    'Property Address': '123 Test Street',
    'Property City': 'Orlando',
    'Property State': 'FL',
    'Property Zip': '32801',
    'Mobile 1': '(407) 555-0101',
    'Email': 'john.test@example.com',
    'Bedrooms': 3,
    'Bathrooms': 2,
    'Square Feet': 1500,
    'Year Built': 2005,
    'Estimated Value': 350000
  },
  {
    'First Name': 'FUB_Test_Jane',
    'Last Name': 'Feature167_B',
    'Property Address': '456 Mock Avenue',
    'Property City': 'Tampa',
    'Property State': 'FL',
    'Property Zip': '33601',
    'Mobile 1': '(813) 555-0202',
    'Landline 1': '(813) 555-0203',
    'Bedrooms': 4,
    'Bathrooms': 3,
    'Square Feet': 2200,
    'Year Built': 2010,
    'Estimated Value': 475000
  },
  {
    'First Name': 'FUB_Test_Bob',
    'Last Name': 'Feature167_C',
    'Property Address': '789 Sample Road',
    'Property City': 'Miami',
    'Property State': 'FL',
    'Property Zip': '33101',
    'Mobile 1': '(305) 555-0303',
    'Email': 'bob.test@example.com',
    'Bedrooms': 2,
    'Bathrooms': 1,
    'Square Feet': 1000,
    'Year Built': 1998,
    'Estimated Value': 280000
  }
];

// Create workbook and worksheet
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(testLeads);

XLSX.utils.book_append_sheet(wb, ws, 'Leads');

// Write to file
const outputPath = './test-files/feature167-fub-test.xlsx';
XLSX.writeFile(wb, outputPath);
console.log('Created test file:', outputPath);
console.log('Contains', testLeads.length, 'test leads for Feature #167');
