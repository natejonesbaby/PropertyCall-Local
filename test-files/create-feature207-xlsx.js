const XLSX = require('../backend/node_modules/xlsx');
const ws = XLSX.utils.aoa_to_sheet([
  ['First Name', 'Last Name', 'Property Street Address', 'Property City', 'Property State', 'Property Zip Code', 'Mobile Phone 1'],
  ['FEATURE207', 'ACTIVITY_ONE', '207 ACTIVITY LANE', 'TESTVILLE', 'FL', '33001', '555-207-0001'],
  ['FEATURE207', 'ACTIVITY_TWO', '208 ACTIVITY LANE', 'TESTVILLE', 'FL', '33001', '555-207-0002']
]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Leads');
XLSX.writeFile(wb, './feature207-activity-test.xlsx');
console.log('Created feature207-activity-test.xlsx');
