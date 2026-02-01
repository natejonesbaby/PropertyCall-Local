/**
 * Feature #32: Qualifying questions saved to database
 * Test that configuration changes persist after page refresh and logout/login
 */

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const TEST_QUESTION = 'TEST_QUESTION_UNIQUE_789';
  const BASE_URL = 'http://localhost:5173';
  const API_BASE = 'http://localhost:3000/api';

  try {
    console.log('=== Feature #32: Qualifying questions saved to database ===\n');

    // Step 1: Login
    console.log('Step 1: Login to application...');
    await page.goto(`${BASE_URL}/login`);

    // Wait for page to load
    await page.waitForSelector('input[type="email"]');

    // Enter credentials
    await page.type('input[type="email"]', 'test@example.com');
    await page.type('input[type="password"]', 'password123');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForNavigation();
    console.log('✓ Logged in successfully\n');

    // Step 2: Navigate to Configuration
    console.log('Step 2: Navigate to Configuration page...');
    await page.goto(`${BASE_URL}/configuration`);
    await page.waitForSelector('[data-testid="questions-tab"]');
    console.log('✓ Configuration page loaded\n');

    // Step 3: Check if test question already exists from previous run
    console.log('Step 3: Checking for existing test question...');
    const pageContent = await page.content();

    // Check if the test question exists in the DOM
    const existingQuestionRegex = new RegExp(TEST_QUESTION, 'i');
    if (existingQuestionRegex.test(pageContent)) {
      console.log('⚠ Test question already exists from previous run, deleting it...');

      // Get all delete buttons
      const deleteButtons = await page.$$('button[title="Delete question"]');

      // Find the one next to our test question and click it
      for (let button of deleteButtons) {
        const parent = await button.evaluateHandle(el => el.closest('div.flex.items-center.gap-4'));
        const text = await parent.evaluate(el => el.textContent);

        if (text.includes(TEST_QUESTION)) {
          await button.click();
          // Handle the confirm dialog
          page.on('dialog', async dialog => {
            await dialog.accept();
          });
          await page.waitForTimeout(1000);
          break;
        }
      }

      console.log('✓ Existing test question deleted\n');
    } else {
      console.log('✓ No existing test question found\n');
    }

    // Step 4: Add new qualifying question
    console.log(`Step 4: Add new qualifying question '${TEST_QUESTION}'...`);
    await page.waitForSelector('input[placeholder*="Enter a new qualifying question"]');

    // Type the test question
    await page.type('input[placeholder*="Enter a new qualifying question"]', TEST_QUESTION);

    // Click the Add Question button
    await page.click('button[type="submit"]:has-text("Add Question")');

    // Wait for success message
    await page.waitForSelector('div.bg-green-50', { timeout: 5000 });
    console.log('✓ Question added successfully\n');

    // Step 5: Verify question appears in the list
    console.log('Step 5: Verify question appears in the list...');
    const updatedContent = await page.content();
    if (updatedContent.includes(TEST_QUESTION)) {
      console.log('✓ Question appears in the list\n');
    } else {
      throw new Error('Question not found in list after adding');
    }

    // Step 6: Refresh the page
    console.log('Step 6: Refresh page...');
    await page.reload();
    await page.waitForSelector('input[placeholder*="Enter a new qualifying question"]');
    console.log('✓ Page refreshed\n');

    // Step 7: Verify question still appears after refresh
    console.log('Step 7: Verify question persists after refresh...');
    const afterRefreshContent = await page.content();
    if (afterRefreshContent.includes(TEST_QUESTION)) {
      console.log('✓ Question persists after page refresh\n');
    } else {
      throw new Error('Question not found after page refresh');
    }

    // Step 8: Log out
    console.log('Step 8: Log out...');
    await page.goto(`${BASE_URL}/logout`);
    await page.waitForNavigation();
    console.log('✓ Logged out\n');

    // Step 9: Log back in
    console.log('Step 9: Log back in...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'test@example.com');
    await page.type('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
    console.log('✓ Logged back in\n');

    // Step 10: Navigate to Configuration again
    console.log('Step 10: Navigate to Configuration page again...');
    await page.goto(`${BASE_URL}/configuration`);
    await page.waitForSelector('input[placeholder*="Enter a new qualifying question"]');
    console.log('✓ Configuration page loaded\n');

    // Step 11: Verify question still appears after logout/login
    console.log('Step 11: Verify question persists after logout/login...');
    const afterLoginContent = await page.content();
    if (afterLoginContent.includes(TEST_QUESTION)) {
      console.log('✓ Question persists after logout/login\n');
    } else {
      throw new Error('Question not found after logout/login');
    }

    // Step 12: Verify question is in database via API
    console.log('Step 12: Verify question is stored in database via API...');

    // Get token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));

    const response = await page.evaluate(async (token, API_BASE) => {
      const res = await fetch(`${API_BASE}/config/questions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return { status: res.status, data: await res.json() };
    }, token, API_BASE);

    if (response.status === 200) {
      const testQuestion = response.data.questions.find(q => q.question === TEST_QUESTION);
      if (testQuestion) {
        console.log('✓ Question found in database via API');
        console.log(`  ID: ${testQuestion.id}`);
        console.log(`  Question: ${testQuestion.question}`);
        console.log(`  Order: ${testQuestion.order_index}`);
        console.log(`  Created: ${testQuestion.created_at}\n`);
      } else {
        throw new Error('Question not found in database');
      }
    } else {
      throw new Error(`API call failed with status ${response.status}`);
    }

    // Step 13: Cleanup - Delete the test question
    console.log('Step 13: Cleanup - Delete test question...');

    // Find and delete the test question
    const deleteButtons = await page.$$('button[title="Delete question"]');

    for (let button of deleteButtons) {
      const parent = await button.evaluateHandle(el => el.closest('div.flex.items-center.gap-4'));
      const text = await parent.evaluate(el => el.textContent);

      if (text.includes(TEST_QUESTION)) {
        await button.click();
        // Handle the confirm dialog
        await new Promise(resolve => {
          page.once('dialog', async dialog => {
            await dialog.accept();
            resolve();
          });
        });
        await page.waitForTimeout(1000);
        console.log('✓ Test question deleted\n');
        break;
      }
    }

    // Step 14: Verify deletion
    console.log('Step 14: Verify question was deleted from database...');

    const finalResponse = await page.evaluate(async (token, API_BASE) => {
      const res = await fetch(`${API_BASE}/config/questions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return { status: res.status, data: await res.json() };
    }, token, API_BASE);

    if (finalResponse.status === 200) {
      const deletedQuestion = finalResponse.data.questions.find(q => q.question === TEST_QUESTION);
      if (!deletedQuestion) {
        console.log('✓ Question successfully deleted from database\n');
      } else {
        throw new Error('Question still in database after deletion');
      }
    }

    console.log('=== Feature #32: PASSED ✅ ===');
    console.log('\nAll verification steps completed successfully:');
    console.log('1. ✓ Question added successfully');
    console.log('2. ✓ Question persists after page refresh');
    console.log('3. ✓ Question persists after logout/login');
    console.log('4. ✓ Question stored in database');
    console.log('5. ✓ Question can be deleted');

  } catch (error) {
    console.error('=== Feature #32: FAILED ❌ ===');
    console.error(`Error: ${error.message}`);

    // Take screenshot on failure
    await page.screenshot({ path: 'feature-32-failure.png' });
    console.log('\nScreenshot saved to feature-32-failure.png');

    process.exit(1);
  } finally {
    await browser.close();
  }
})();
