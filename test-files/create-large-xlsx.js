const XLSX = require('/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/backend/node_modules/xlsx');

// Create a large XLSX file (10MB+) for testing upload progress
const rows = 50000; // ~50k rows should be 10MB+
const data = [];

// Header row with Kind Skiptracing column names
data.push([
  'Owner 1 First Name', 'Owner 1 Last Name', 'Owner 2 First Name', 'Owner 2 Last Name',
  'Property Address', 'Property City', 'Property State', 'Property Zip',
  'Mail Address', 'Mail City', 'Mail State', 'Mail Zip',
  'Mobile 1', 'Mobile 2', 'Mobile 3', 'Landline 1', 'Landline 2',
  'Bedrooms', 'Bathrooms', 'SqFt', 'Year Built',
  'Estimated Value', 'Equity Percent', 'Mortgage Balance',
  'Owner Email', 'Vacant', 'Absentee Owner', 'Corporate Owned'
]);

// Generate test data rows
for (let i = 1; i <= rows; i++) {
  const randomPhone = () => `555${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`;
  const randomYear = () => 1950 + Math.floor(Math.random() * 74);
  const randomBeds = () => 1 + Math.floor(Math.random() * 5);
  const randomBaths = () => 1 + Math.floor(Math.random() * 4);
  const randomSqFt = () => 800 + Math.floor(Math.random() * 4200);
  const randomValue = () => 100000 + Math.floor(Math.random() * 900000);

  data.push([
    `FirstName${i}`,
    `LastName${i}`,
    i % 3 === 0 ? `SpouseFirst${i}` : '',
    i % 3 === 0 ? `SpouseLast${i}` : '',
    `${1000 + i} Test Street`,
    ['Orlando', 'Tampa', 'Miami', 'Jacksonville', 'Tallahassee'][i % 5],
    'FL',
    `3${String(2000 + (i % 1000)).padStart(4, '0')}`,
    `${2000 + i} Mail Ave`,
    ['Atlanta', 'Charlotte', 'Chicago', 'New York', 'Denver'][i % 5],
    ['GA', 'NC', 'IL', 'NY', 'CO'][i % 5],
    `${10000 + (i % 90000)}`,
    randomPhone(),
    i % 2 === 0 ? randomPhone() : '',
    i % 4 === 0 ? randomPhone() : '',
    i % 3 === 0 ? randomPhone() : '',
    i % 5 === 0 ? randomPhone() : '',
    randomBeds(),
    randomBaths(),
    randomSqFt(),
    randomYear(),
    randomValue(),
    Math.floor(Math.random() * 100),
    Math.floor(randomValue() * (Math.random() * 0.8)),
    i % 10 === 0 ? `test${i}@example.com` : '',
    i % 7 === 0 ? 'Yes' : 'No',
    i % 4 === 0 ? 'Yes' : 'No',
    i % 20 === 0 ? 'Yes' : 'No'
  ]);
}

const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Leads');

// Write to file
const filepath = '/Users/nate/Library/CloudStorage/OneDrive-Personal/Computer Software/AutoDialer - Real Estate/test-files/large-test-file.xlsx';
XLSX.writeFile(wb, filepath);

// Get file size
const fs = require('fs');
const stats = fs.statSync(filepath);
console.log(`Created ${filepath}`);
console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`Rows: ${rows}`);
