const XLSX = require('./backend/node_modules/xlsx');
const path = require('path');

// Create feature-157-amd-test.xlsx with a voicemail phone number (ends in 9999)
function createAMDTestFile() {
  const data = [
    {
      'First Name': 'AMD_TEST_157',
      'Last Name': 'VoicemailLead',
      'Property Address': '157 AMD Test Street',
      'Property City': 'TestCity',
      'Property State': 'FL',
      'Property Zip': '32801',
      'Mobile 1': '5559999999'  // Ends in 9999 to trigger machine detection in mock
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
  XLSX.writeFile(workbook, path.join(__dirname, 'test-files', 'feature-157-amd-test.xlsx'));
  console.log('Created feature-157-amd-test.xlsx with voicemail phone number');
}

createAMDTestFile();
console.log('Done!');
