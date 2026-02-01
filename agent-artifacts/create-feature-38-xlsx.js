const XLSX = require('xlsx');

// Feature 38: Test timestamp accuracy
// Create a unique lead name with timestamp to verify real timestamps
const timestamp = Date.now();
const uniqueName = `TIMESTAMP_TEST_${timestamp}`;

// Lead data matching Kind Skiptracing format
const leadData = [
  {
    'Mailing First Name': uniqueName,
    'Mailing Last Name': 'Feature38Lead',
    'Property Address': '38 Timestamp Test Lane',
    'Property City': 'TestCity',
    'Property State': 'FL',
    'Property Zip': '32801',
    'Mobile 1': '(555) 038-0038',
    'Beds': '3',
    'Bath': '2',
    'Sq Ft': '1800',
    'Year Built': '2005'
  }
];

// Create workbook with data
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(leadData);
XLSX.utils.book_append_sheet(wb, ws, 'Leads');

// Write to file
const filename = `test-files/feature-38-timestamp-${timestamp}.xlsx`;
XLSX.writeFile(wb, filename);
console.log(`Created: ${filename}`);
console.log(`Lead name: ${uniqueName} Feature38Lead`);
console.log(`Timestamp: ${new Date(timestamp).toISOString()}`);
