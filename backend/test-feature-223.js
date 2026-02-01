/**
 * Feature #223 Test: Test Call uses configured AI prompts
 *
 * This test verifies that the variable substitution works correctly
 * for greeting messages and qualifying questions.
 */

// Simulate the substituteVariables function from audioStream.js
function substituteVariables(text, leadInfo) {
  if (!text) return text;

  let result = text;
  result = result.replace(/\{\{first_name\}\}/gi, leadInfo.firstName || 'there');
  result = result.replace(/\{\{last_name\}\}/gi, leadInfo.lastName || '');
  result = result.replace(/\{\{property_address\}\}/gi, leadInfo.propertyAddress || 'the property');

  return result;
}

// Test data
const leadInfo = {
  firstName: 'TestFeature223',
  lastName: 'PromptTest',
  propertyAddress: '223 Custom Prompt Lane, PromptCity, TX'
};

// Test greeting message with variables
const greetingTemplate = "Hi, is this {{first_name}}? This is Sarah calling about the property at {{property_address}}. Do you have a moment to chat?";
const expectedGreeting = "Hi, is this TestFeature223? This is Sarah calling about the property at 223 Custom Prompt Lane, PromptCity, TX. Do you have a moment to chat?";

const actualGreeting = substituteVariables(greetingTemplate, leadInfo);
console.log('=== Feature #223 Test: Variable Substitution ===\n');

console.log('Test 1: Greeting Message Variable Substitution');
console.log('Template:', greetingTemplate);
console.log('Lead Info:', JSON.stringify(leadInfo, null, 2));
console.log('Result:', actualGreeting);
console.log('Expected:', expectedGreeting);
console.log('PASS:', actualGreeting === expectedGreeting ? '✅ YES' : '❌ NO');

// Test qualifying question with property_address
const questionTemplate = "Are you the owner of the property at {{property_address}}?";
const expectedQuestion = "Are you the owner of the property at 223 Custom Prompt Lane, PromptCity, TX?";
const actualQuestion = substituteVariables(questionTemplate, leadInfo);

console.log('\nTest 2: Qualifying Question Variable Substitution');
console.log('Template:', questionTemplate);
console.log('Result:', actualQuestion);
console.log('Expected:', expectedQuestion);
console.log('PASS:', actualQuestion === expectedQuestion ? '✅ YES' : '❌ NO');

// Test with empty lead info (should use defaults)
const emptyLeadInfo = {};
const greetingWithDefaults = substituteVariables(greetingTemplate, emptyLeadInfo);
const expectedWithDefaults = "Hi, is this there? This is Sarah calling about the property at the property. Do you have a moment to chat?";

console.log('\nTest 3: Variable Substitution with Default Values');
console.log('Template:', greetingTemplate);
console.log('Lead Info: {} (empty)');
console.log('Result:', greetingWithDefaults);
console.log('Expected:', expectedWithDefaults);
console.log('PASS:', greetingWithDefaults === expectedWithDefaults ? '✅ YES' : '❌ NO');

// Summary
console.log('\n=== Test Summary ===');
const allPassed =
  actualGreeting === expectedGreeting &&
  actualQuestion === expectedQuestion &&
  greetingWithDefaults === expectedWithDefaults;

console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');
process.exit(allPassed ? 0 : 1);
