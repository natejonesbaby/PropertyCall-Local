/**
 * Migration: Multi-Provider Support
 *
 * This migration adds support for multiple telephony providers (Telnyx and SignalWire)
 * to existing installations. It:
 *
 * 1. Adds telephony_provider setting with default 'telnyx'
 * 2. Ensures SignalWire services are available in api_keys table
 * 3. Renames any unprefixed Telnyx settings (if they exist)
 * 4. Adds provider-specific phone number settings
 *
 * Created: 2026-01-26
 */

export async function up(db) {
  console.log('Running migration: Multi-Provider Support');

  // Step 1: Add telephony_provider setting for users who don't have it
  console.log('  Step 1: Adding telephony_provider setting...');

  try {
    // Get all users
    const users = db.prepare('SELECT id FROM users').all();

    for (const user of users) {
      // Check if user already has telephony_provider setting
      const existingSetting = db.prepare(`
        SELECT value FROM settings
        WHERE user_id = ? AND key = 'telephony_provider'
      `).get(user.id);

      if (!existingSetting) {
        // Default to 'telnyx' for existing installations
        db.prepare(`
          INSERT INTO settings (user_id, key, value)
          VALUES (?, 'telephony_provider', 'telnyx')
        `).run(user.id);
        console.log(`    Set telephony_provider=telnyx for user ${user.id}`);
      } else {
        console.log(`    User ${user.id} already has telephony_provider setting`);
      }
    }
  } catch (error) {
    console.log('    Error adding telephony_provider:', error.message);
  }

  // Step 2: Ensure SignalWire services are documented
  // Note: api_keys table uses TEXT for service (no ENUM), so no schema change needed
  console.log('  Step 2: SignalWire services already supported (TEXT type)');
  console.log('    Supported services: telnyx, signalwire_api_token, signalwire_project_id');

  // Step 3: Check for unprefixed Telnyx settings and rename them
  console.log('  Step 3: Checking for unprefixed Telnyx settings...');

  try {
    // Look for settings that might need prefixing
    // In practice, the app was designed with prefixes from the start
    // This is a safety check for any manual database entries

    const settingsToCheck = ['phone_number', 'api_key', 'app_id'];

    for (const keySuffix of settingsToCheck) {
      const unprefixed = db.prepare(`
        SELECT user_id, key FROM settings
        WHERE key = ?
      `).get(keySuffix);

      if (unprefixed) {
        const newKey = `telnyx_${keySuffix}`;
        db.prepare(`
          UPDATE settings
          SET key = ?
          WHERE user_id = ? AND key = ?
        `).run(newKey, unprefixed.user_id, keySuffix);

        console.log(`    Renamed setting '${keySuffix}' to '${newKey}' for user ${unprefixed.user_id}`);
      }
    }
  } catch (error) {
    console.log('    Error renaming settings:', error.message);
  }

  // Step 4: Add signalwire_space_url setting if it doesn't exist
  console.log('  Step 4: Ensuring SignalWire settings structure...');

  try {
    // No action needed - settings table is schemaless (key-value)
    // SignalWire settings are stored as:
    // - signalwire_space_url in settings table
    // - signalwire_api_token in api_keys table
    // - signalwire_project_id in api_keys table

    console.log('    SignalWire settings structure already supported');
  } catch (error) {
    console.log('    Error checking SignalWire settings:', error.message);
  }

  // Step 5: Update phone number settings to be provider-specific
  console.log('  Step 5: Checking phone number settings...');

  try {
    // Ensure all users have provider-specific phone number settings
    const users = db.prepare('SELECT id FROM users').all();

    for (const user of users) {
      // Check if user has generic phone_number setting (without prefix)
      const genericPhone = db.prepare(`
        SELECT value FROM settings
        WHERE user_id = ? AND key = 'phone_number'
      `).get(user.id);

      if (genericPhone) {
        // Check what provider they're using
        const provider = db.prepare(`
          SELECT value FROM settings
          WHERE user_id = ? AND key = 'telephony_provider'
        `).get(user.id);

        const providerKey = provider?.value === 'signalwire' ? 'signalwire_phone_number' : 'telnyx_phone_number';

        // Rename to provider-specific key
        db.prepare(`
          UPDATE settings
          SET key = ?
          WHERE user_id = ? AND key = 'phone_number'
        `).run(providerKey, user.id);

        console.log(`    Renamed phone_number to ${providerKey} for user ${user.id}`);
      }
    }
  } catch (error) {
    console.log('    Error updating phone number settings:', error.message);
  }

  console.log('✓ Multi-provider support migration completed');
}

export async function down(db) {
  // Rollback migration
  console.log('Rolling back migration: Multi-Provider Support');

  // Remove telephony_provider settings (optional - users would need to reconfigure)
  // This is a destructive rollback, so in production you might want to keep the settings

  try {
    db.prepare(`DELETE FROM settings WHERE key = 'telephony_provider'`).run();
    console.log('  Removed telephony_provider settings');
  } catch (error) {
    console.log('  Error removing telephony_provider:', error.message);
  }

  console.log('✓ Rollback completed');
}
