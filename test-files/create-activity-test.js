const XLSX = require('../backend/node_modules/xlsx');
const workbook = XLSX.utils.book_new();
const data = [
  ['First Name', 'Last Name', 'Property Address', 'Property City', 'Property State', 'Property Zip', 'Mobile 1'],
  ['ACTIVITY_TEST', 'USER_ONE', '999 ACTIVITY TEST LANE', 'ACTIVITYVILLE', 'FL', '33999', '555-999-0001'],
  ['ACTIVITY_TEST', 'USER_TWO', '998 ACTIVITY TEST LANE', 'ACTIVITYVILLE', 'FL', '33999', '555-999-0002']
];
const sheet = XLSX.utils.aoa_to_sheet(data);
XLSX.utils.book_append_sheet(workbook, sheet, 'Leads');
XLSX.writeFile(workbook, './test-files/activity-test.xlsx');
console.log('Created activity-test.xlsx');
