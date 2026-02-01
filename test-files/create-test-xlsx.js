import XLSX from '../backend/node_modules/xlsx/xlsx.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create test data with unique identifiers
const testData = [
  {
    'First Name': 'QUEUE_TEST',
    'Last Name': 'USER_ONE',
    'Property Address': '123 TEST QUEUE STREET',
    'Property City': 'TESTVILLE',
    'Property State': 'FL',
    'Property Zip': '12345',
    'Mobile 1': '5551234567',
    'Bedrooms': 3,
    'Bathrooms': 2,
    'Year Built': 2020
  },
  {
    'First Name': 'QUEUE_TEST',
    'Last Name': 'USER_TWO',
    'Property Address': '456 TEST QUEUE AVENUE',
    'Property City': 'TESTVILLE',
    'Property State': 'FL',
    'Property Zip': '12346',
    'Mobile 1': '5559876543',
    'Bedrooms': 4,
    'Bathrooms': 3,
    'Year Built': 2018
  },
  {
    'First Name': 'QUEUE_TEST',
    'Last Name': 'USER_THREE',
    'Property Address': '789 TEST QUEUE BLVD',
    'Property City': 'TESTVILLE',
    'Property State': 'FL',
    'Property Zip': '12347',
    'Mobile 1': '5555551234',
    'Bedrooms': 2,
    'Bathrooms': 1,
    'Year Built': 2015
  }
];

// Create workbook
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(testData);
XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

// Write file
const outputPath = path.join(__dirname, 'queue-test.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`Created test XLSX file: ${outputPath}`);
console.log(`Contains ${testData.length} test leads with unique identifiers`);
