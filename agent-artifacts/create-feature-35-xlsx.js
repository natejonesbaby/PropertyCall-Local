const XLSX = require('./backend/node_modules/xlsx');
const path = require('path');

// Create first XLSX file with 'SearchableTestName'
const data1 = [
  {
    'First Name': 'SearchableTestName',
    'Last Name': 'Feature35Lead1',
    'Full Name': 'SearchableTestName Feature35Lead1',
    'Mailing Street Address': '35 Search Test Lane',
    'Mailing City': 'TestCity',
    'Mailing State': 'FL',
    'Mailing Zip': '32801',
    'Property Street Address': '35 Search Test Lane',
    'Property City': 'TestCity',
    'Property State': 'FL',
    'Property Zip': '32801',
    'Mobile 1': '(555) 035-0001'
  }
];

// Create second XLSX file with 'AnotherDifferentName'
const data2 = [
  {
    'First Name': 'AnotherDifferentName',
    'Last Name': 'Feature35Lead2',
    'Full Name': 'AnotherDifferentName Feature35Lead2',
    'Mailing Street Address': '36 Other Test Lane',
    'Mailing City': 'OtherCity',
    'Mailing State': 'FL',
    'Mailing Zip': '32802',
    'Property Street Address': '36 Other Test Lane',
    'Property City': 'OtherCity',
    'Property State': 'FL',
    'Property Zip': '32802',
    'Mobile 1': '(555) 035-0002'
  }
];

// Create workbook and worksheet for first file
const ws1 = XLSX.utils.json_to_sheet(data1);
const wb1 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb1, ws1, 'Leads');
XLSX.writeFile(wb1, path.join(__dirname, 'test-files', 'feature-35-searchable.xlsx'));
console.log('Created feature-35-searchable.xlsx');

// Create workbook and worksheet for second file
const ws2 = XLSX.utils.json_to_sheet(data2);
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, ws2, 'Leads');
XLSX.writeFile(wb2, path.join(__dirname, 'test-files', 'feature-35-different.xlsx'));
console.log('Created feature-35-different.xlsx');
