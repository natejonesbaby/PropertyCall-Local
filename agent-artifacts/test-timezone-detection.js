import XLSX from 'xlsx';
import fs from 'fs';

// Create test data with leads from different states
const testData = [
  {
    'First Name': 'John',
    'Last Name': 'California',
    'Property Address': '123 Sunset Blvd',
    'Property City': 'Los Angeles',
    'Property State': 'CA',
    'Property Zip': '90001',
    'Phone 1': '310-555-0001'
  },
  {
    'First Name': 'Jane',
    'Last Name': 'NewYork',
    'Property Address': '456 Broadway',
    'Property City': 'New York',
    'Property State': 'NY',
    'Property Zip': '10001',
    'Phone 1': '212-555-0002'
  },
  {
    'First Name': 'Bob',
    'Last Name': 'Texas',
    'Property Address': '789 Main St',
    'Property City': 'Houston',
    'Property State': 'TX',
    'Property Zip': '77001',
    'Phone 1': '713-555-0003'
  },
  {
    'First Name': 'Alice',
    'Last Name': 'Florida',
    'Property Address': '321 Ocean Dr',
    'Property City': 'Miami',
    'Property State': 'FL',
    'Property Zip': '33101',
    'Phone 1': '305-555-0004'
  }
];

// Create workbook
const ws = XLSX.utils.json_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Leads');

// Write file
const filePath = './test-timezone-leads.xlsx';
XLSX.writeFile(wb, filePath);
console.log(`Created test file: ${filePath}`);
