import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import crypto from 'crypto';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getTimezoneForLead } from '../utils/timezone.js';

// Encryption settings (must match settings.js)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'property-call-default-key-32b!';
const ALGORITHM = 'aes-256-cbc';

// Get FUB API base URL (configurable for testing with mock server)
function getFubApiBase() {
  return process.env.FUB_API_BASE || 'https://api.followupboss.com';
}

// Decrypt API key
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

// Get FUB API key for user
function getFubApiKey(userId) {
  const row = db.prepare(`
    SELECT api_key_encrypted FROM api_keys WHERE user_id = ? AND service = 'followupboss'
  `).get(userId);
  return row ? decrypt(row.api_key_encrypted) : null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Apply auth middleware to all import routes
router.use(requireAuth);

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Validate phone number format
// Returns { valid: boolean, normalized: string|null, error: string|null }
const validatePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string' && typeof phone !== 'number') {
    return { valid: false, normalized: null, error: 'Empty or invalid phone value' };
  }

  // Convert to string and clean up
  let phoneStr = phone.toString().trim();

  // Remove common formatting characters
  const cleanPhone = phoneStr.replace(/[\s\-\.\(\)]+/g, '');

  // Check for obviously invalid formats
  if (/[a-zA-Z]/.test(cleanPhone)) {
    return { valid: false, normalized: null, error: `Invalid phone format: "${phoneStr}" contains letters` };
  }

  // Remove leading + or 1 for US numbers
  let normalized = cleanPhone.replace(/^\+?1?/, '');

  // Check if we have only digits left
  if (!/^\d+$/.test(normalized)) {
    return { valid: false, normalized: null, error: `Invalid phone format: "${phoneStr}" contains invalid characters` };
  }

  // Check length (US phone numbers should be 10 digits after normalization)
  if (normalized.length < 10) {
    return { valid: false, normalized: null, error: `Invalid phone format: "${phoneStr}" is too short (${normalized.length} digits)` };
  }

  if (normalized.length > 11) {
    return { valid: false, normalized: null, error: `Invalid phone format: "${phoneStr}" is too long (${normalized.length} digits)` };
  }

  // If 11 digits, assume it starts with country code 1
  if (normalized.length === 11) {
    if (normalized.startsWith('1')) {
      normalized = normalized.substring(1);
    } else {
      return { valid: false, normalized: null, error: `Invalid phone format: "${phoneStr}" - 11 digits but doesn't start with 1` };
    }
  }

  // Format as (XXX) XXX-XXXX for display
  const formatted = `(${normalized.substring(0, 3)}) ${normalized.substring(3, 6)}-${normalized.substring(6)}`;

  return { valid: true, normalized: formatted, error: null };
};

// Parse phone numbers from Kind Skiptracing format
const parsePhones = (row) => {
  const phones = [];
  const validationErrors = [];

  // Mobile phones (Mobile 1-7)
  for (let i = 1; i <= 7; i++) {
    const mobile = row[`Mobile ${i}`] || row[`Mobile${i}`] || row[`mobile_${i}`] || row[`Mobile Phone ${i}`];
    if (mobile && mobile.toString().trim()) {
      const validation = validatePhoneNumber(mobile);
      if (validation.valid) {
        phones.push({ type: 'mobile', number: validation.normalized, index: i, valid: true });
      } else {
        phones.push({ type: 'mobile', number: mobile.toString().trim(), index: i, valid: false, error: validation.error });
        validationErrors.push({ field: `Mobile ${i}`, value: mobile.toString().trim(), error: validation.error });
      }
    }
  }

  // Landline phones (Landline 1-7)
  for (let i = 1; i <= 7; i++) {
    const landline = row[`Landline ${i}`] || row[`Landline${i}`] || row[`landline_${i}`] || row[`Landline Phone ${i}`];
    if (landline && landline.toString().trim()) {
      const validation = validatePhoneNumber(landline);
      if (validation.valid) {
        phones.push({ type: 'landline', number: validation.normalized, index: i, valid: true });
      } else {
        phones.push({ type: 'landline', number: landline.toString().trim(), index: i, valid: false, error: validation.error });
        validationErrors.push({ field: `Landline ${i}`, value: landline.toString().trim(), error: validation.error });
      }
    }
  }

  // VOIP phones
  const voip = row['VOIP'] || row['VoIP'] || row['voip'];
  if (voip && voip.toString().trim()) {
    const validation = validatePhoneNumber(voip);
    if (validation.valid) {
      phones.push({ type: 'voip', number: validation.normalized, index: 1, valid: true });
    } else {
      phones.push({ type: 'voip', number: voip.toString().trim(), index: 1, valid: false, error: validation.error });
      validationErrors.push({ field: 'VOIP', value: voip.toString().trim(), error: validation.error });
    }
  }

  return { phones, validationErrors };
};

// Map Kind Skiptracing fields to lead fields
const mapKindFieldsToLead = (row) => {
  const { phones, validationErrors } = parsePhones(row);

  return {
    first_name: row['First Name'] || row['FirstName'] || row['first_name'] || row['Owner 1 First Name'] || '',
    last_name: row['Last Name'] || row['LastName'] || row['last_name'] || row['Owner 1 Last Name'] || '',
    property_address: row['Property Address'] || row['PropertyAddress'] || row['property_address'] || row['Site Address'] || '',
    property_city: row['Property City'] || row['PropertyCity'] || row['property_city'] || row['Site City'] || '',
    property_state: row['Property State'] || row['PropertyState'] || row['property_state'] || row['Site State'] || '',
    property_zip: row['Property Zip'] || row['PropertyZip'] || row['property_zip'] || row['Site Zip'] || '',
    mailing_address: row['Mailing Address'] || row['MailingAddress'] || row['mailing_address'] || row['Mail Address'] || '',
    mailing_city: row['Mailing City'] || row['MailingCity'] || row['mailing_city'] || row['Mail City'] || '',
    mailing_state: row['Mailing State'] || row['MailingState'] || row['mailing_state'] || row['Mail State'] || '',
    mailing_zip: row['Mailing Zip'] || row['MailingZip'] || row['mailing_zip'] || row['Mail Zip'] || '',
    email: row['Email'] || row['email'] || row['Email Address'] || '',
    property_type: row['Property Type'] || row['PropertyType'] || row['property_type'] || '',
    bedrooms: parseInt(row['Bedrooms'] || row['Beds'] || row['bedrooms'] || 0) || null,
    bathrooms: parseFloat(row['Bathrooms'] || row['Baths'] || row['bathrooms'] || 0) || null,
    sqft: parseInt(row['Square Feet'] || row['Sqft'] || row['sqft'] || row['Living Area'] || 0) || null,
    year_built: parseInt(row['Year Built'] || row['YearBuilt'] || row['year_built'] || 0) || null,
    equity_percent: parseFloat(row['Equity Percent'] || row['Equity%'] || row['equity_percent'] || 0) || null,
    estimated_value: parseFloat(row['Estimated Value'] || row['EstimatedValue'] || row['estimated_value'] || row['AVM'] || 0) || null,
    mortgage_balance: parseFloat(row['Mortgage Balance'] || row['MortgageBalance'] || row['mortgage_balance'] || 0) || null,
    vacant_indicator: row['Vacant'] || row['Vacant Indicator'] || row['vacant_indicator'] || '',
    phones: phones,
    phoneValidationErrors: validationErrors,
    hasInvalidPhones: validationErrors.length > 0,
    raw_data: row
  };
};

// POST /api/import/upload - Upload and parse XLSX file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // For now, use a default user_id of 1 (will be replaced with auth)
    const userId = req.user?.id || 1;

    // Read and parse the XLSX file with enhanced error handling
    let workbook;
    try {
      workbook = XLSX.readFile(req.file.path);
    } catch (parseError) {
      console.error('XLSX parsing error:', parseError);
      // Provide helpful error message for corrupted/malformed files
      return res.status(400).json({
        error: 'Unable to parse Excel file. The file appears to be corrupted or not a valid Excel format.',
        details: 'Please ensure the file is a valid .xlsx or .xls Excel file and try again.',
        technicalError: parseError.message
      });
    }

    // Check if workbook has any sheets
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({
        error: 'Invalid Excel file: No worksheets found.',
        details: 'The file does not contain any worksheets. Please check that your Excel file has data in at least one sheet.'
      });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Check if worksheet is valid
    if (!worksheet) {
      return res.status(400).json({
        error: 'Invalid Excel file: Unable to read worksheet.',
        details: `The worksheet "${sheetName}" appears to be empty or corrupted.`
      });
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      return res.status(400).json({
        error: 'No data found in the uploaded file.',
        details: 'The Excel file was parsed successfully, but the first worksheet contains no data rows. Please check that your file has data starting from the first row after headers.'
      });
    }

    // Get column headers
    const headers = Object.keys(jsonData[0]);

    // Map rows to lead format
    const mappedRows = jsonData.map((row, index) => ({
      rowIndex: index + 1,
      ...mapKindFieldsToLead(row)
    }));

    // Calculate validation summary
    const rowsWithInvalidPhones = mappedRows.filter(row => row.hasInvalidPhones);
    const allValidationErrors = [];
    mappedRows.forEach(row => {
      if (row.phoneValidationErrors && row.phoneValidationErrors.length > 0) {
        row.phoneValidationErrors.forEach(err => {
          allValidationErrors.push({
            rowIndex: row.rowIndex,
            name: `${row.first_name} ${row.last_name}`.trim() || 'Unknown',
            ...err
          });
        });
      }
    });

    const validationSummary = {
      totalRowsWithInvalidPhones: rowsWithInvalidPhones.length,
      totalValidationErrors: allValidationErrors.length,
      sampleErrors: allValidationErrors.slice(0, 10) // Show first 10 errors as examples
    };

    // Create import record
    const insertImport = db.prepare(`
      INSERT INTO import_history (user_id, filename, original_filename, total_rows, status, preview_data)
      VALUES (?, ?, ?, ?, 'preview', ?)
    `);

    // Store preview data (first 100 rows for preview)
    const previewData = {
      headers,
      totalRows: jsonData.length,
      previewRows: mappedRows.slice(0, 100),
      validationSummary
    };

    const result = insertImport.run(
      userId,
      req.file.filename,
      req.file.originalname,
      jsonData.length,
      JSON.stringify(previewData)
    );

    res.json({
      success: true,
      importId: result.lastInsertRowid,
      filename: req.file.originalname,
      totalRows: jsonData.length,
      headers,
      preview: mappedRows.slice(0, 100),
      validationSummary
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file: ' + error.message });
  }
});

// GET /api/import/preview/:id - Get preview of uploaded data
router.get('/preview/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 1;

    const importRecord = db.prepare(`
      SELECT * FROM import_history WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!importRecord) {
      return res.status(404).json({ error: 'Import not found' });
    }

    const previewData = JSON.parse(importRecord.preview_data || '{}');

    res.json({
      id: importRecord.id,
      filename: importRecord.original_filename,
      totalRows: importRecord.total_rows,
      status: importRecord.status,
      createdAt: importRecord.created_at,
      ...previewData
    });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Failed to get preview: ' + error.message });
  }
});

// GET /api/import/history - Get import history
router.get('/history', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { limit = 20, offset = 0 } = req.query;

    const imports = db.prepare(`
      SELECT id, filename, original_filename, total_rows, imported_count,
             duplicate_count, error_count, status, created_at
      FROM import_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, parseInt(limit), parseInt(offset));

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM import_history WHERE user_id = ?
    `).get(userId);

    res.json({
      imports,
      total: total.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history: ' + error.message });
  }
});

// Helper: Search FUB for a person by phone number
async function searchFubByPhone(phone, fubApiKey) {
  try {
    // Normalize phone for FUB search - remove formatting, keep digits
    const normalizedPhone = phone.replace(/[\s\-\.\(\)]/g, '');

    const response = await fetch(`${getFubApiBase()}/v1/people?phone=${encodeURIComponent(normalizedPhone)}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(fubApiKey + ':').toString('base64'),
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      // FUB returns { people: [...] }
      if (data.people && data.people.length > 0) {
        return data.people[0]; // Return first matching person
      }
    }
    return null;
  } catch (error) {
    console.error('FUB search error:', error);
    return null;
  }
}

// POST /api/import/check-duplicates/:id - Check for duplicates before import
router.post('/check-duplicates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 1;
    const { checkFub = true } = req.body; // Option to enable/disable FUB check

    // Get import record
    const importRecord = db.prepare(`
      SELECT * FROM import_history WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!importRecord) {
      return res.status(404).json({ error: 'Import not found' });
    }

    // Read the file to get all data
    const filePath = path.join(uploadDir, importRecord.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Upload file not found' });
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    const duplicates = [];
    const newLeads = [];

    // Get FUB API key for FUB duplicate checking
    const fubApiKey = checkFub ? getFubApiKey(userId) : null;
    let fubCheckEnabled = !!fubApiKey;
    let fubDuplicateCount = 0;
    let localDuplicateCount = 0;

    // Check each row for duplicates
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const lead = mapKindFieldsToLead(row);
      const phones = lead.phones.filter(p => p.valid).map(p => p.number);
      let existingLead = null;
      let matchType = null;
      let matchSource = null; // 'local' or 'fub'
      let fubRecord = null;

      // Check by phone number first - LOCAL database
      if (phones.length > 0) {
        for (const phone of phones) {
          const existing = db.prepare(`
            SELECT id, first_name, last_name, property_address, property_city, property_state, phones, fub_id
            FROM leads WHERE user_id = ? AND phones LIKE ?
          `).get(userId, `%${phone}%`);
          if (existing) {
            existingLead = existing;
            matchType = 'phone';
            matchSource = 'local';
            break;
          }
        }
      }

      // Check by property address if no phone match - LOCAL database
      if (!existingLead && lead.property_address) {
        const existing = db.prepare(`
          SELECT id, first_name, last_name, property_address, property_city, property_state, phones, fub_id
          FROM leads
          WHERE user_id = ? AND property_address = ? AND property_city = ? AND property_state = ?
        `).get(userId, lead.property_address, lead.property_city, lead.property_state);
        if (existing) {
          existingLead = existing;
          matchType = 'address';
          matchSource = 'local';
        }
      }

      // If not found locally and FUB API key is available, check FUB by phone
      if (!existingLead && fubCheckEnabled && phones.length > 0) {
        for (const phone of phones) {
          fubRecord = await searchFubByPhone(phone, fubApiKey);
          if (fubRecord) {
            matchType = 'phone';
            matchSource = 'fub';
            fubDuplicateCount++;
            break;
          }
        }
      }

      if (existingLead) {
        // Parse existing phones
        let existingPhones = [];
        try {
          existingPhones = JSON.parse(existingLead.phones || '[]');
        } catch (e) {
          existingPhones = [];
        }

        localDuplicateCount++;
        duplicates.push({
          rowIndex: i + 1,
          uploadedLead: {
            name: `${lead.first_name} ${lead.last_name}`.trim(),
            address: lead.property_address,
            city: lead.property_city,
            state: lead.property_state,
            phones: phones.slice(0, 3)
          },
          existingLead: {
            id: existingLead.id,
            name: `${existingLead.first_name} ${existingLead.last_name}`.trim(),
            address: existingLead.property_address,
            city: existingLead.property_city,
            state: existingLead.property_state,
            phones: existingPhones.slice(0, 3).map(p => p.number),
            fubId: existingLead.fub_id,
            fubLink: existingLead.fub_id ? `https://app.followupboss.com/2/people/view/${existingLead.fub_id}` : null
          },
          matchType,
          matchSource
        });
      } else if (fubRecord) {
        // Found in FUB but not locally
        const fubPhones = (fubRecord.phones || []).map(p => p.value).slice(0, 3);
        const fubAddress = fubRecord.addresses && fubRecord.addresses[0];

        duplicates.push({
          rowIndex: i + 1,
          uploadedLead: {
            name: `${lead.first_name} ${lead.last_name}`.trim(),
            address: lead.property_address,
            city: lead.property_city,
            state: lead.property_state,
            phones: phones.slice(0, 3)
          },
          existingLead: {
            id: null, // No local ID
            name: `${fubRecord.firstName || ''} ${fubRecord.lastName || ''}`.trim(),
            address: fubAddress?.street || '',
            city: fubAddress?.city || '',
            state: fubAddress?.state || '',
            phones: fubPhones,
            fubId: fubRecord.id,
            fubLink: `https://app.followupboss.com/2/people/view/${fubRecord.id}`
          },
          matchType,
          matchSource
        });
      } else {
        newLeads.push({
          rowIndex: i + 1,
          name: `${lead.first_name} ${lead.last_name}`.trim(),
          address: lead.property_address,
          city: lead.property_city,
          state: lead.property_state
        });
      }
    }

    res.json({
      success: true,
      totalRows: jsonData.length,
      duplicateCount: duplicates.length,
      newLeadCount: newLeads.length,
      duplicates: duplicates.slice(0, 50), // Limit to first 50 duplicates for display
      hasMoreDuplicates: duplicates.length > 50,
      fubCheckEnabled,
      fubDuplicateCount,
      localDuplicateCount
    });
  } catch (error) {
    console.error('Check duplicates error:', error);
    res.status(500).json({ error: 'Failed to check duplicates: ' + error.message });
  }
});

// POST /api/import/execute/:id - Execute import (save leads to database)
router.post('/execute/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 1;
    const { skipDuplicates = true } = req.body;

    // Get import record
    const importRecord = db.prepare(`
      SELECT * FROM import_history WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!importRecord) {
      return res.status(404).json({ error: 'Import not found' });
    }

    if (importRecord.status === 'completed') {
      return res.status(400).json({ error: 'Import already completed' });
    }

    // Read the file again to get all data
    const filePath = path.join(uploadDir, importRecord.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Upload file not found' });
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Prepare insert statements
    const insertLead = db.prepare(`
      INSERT INTO leads (
        user_id, first_name, last_name, property_address, property_city,
        property_state, property_zip, mailing_address, mailing_city,
        mailing_state, mailing_zip, email, property_type, bedrooms,
        bathrooms, sqft, year_built, equity_percent, estimated_value,
        mortgage_balance, vacant_indicator, phones, import_id, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Prepare call queue insert statement with timezone detection
    const insertCallQueue = db.prepare(`
      INSERT INTO call_queue (lead_id, status, attempt_number, scheduled_time, timezone, phone_index)
      VALUES (?, 'pending', 0, datetime('now'), ?, 0)
    `);

    let importedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    // Process each row
    const transaction = db.transaction(() => {
      for (const row of jsonData) {
        try {
          const lead = mapKindFieldsToLead(row);

          // Check for duplicates by phone number or address
          if (skipDuplicates) {
            const phones = lead.phones.map(p => p.number);
            let isDuplicate = false;

            if (phones.length > 0) {
              // Check if any phone number exists
              for (const phone of phones) {
                const existing = db.prepare(`
                  SELECT id FROM leads WHERE user_id = ? AND phones LIKE ?
                `).get(userId, `%${phone}%`);
                if (existing) {
                  isDuplicate = true;
                  break;
                }
              }
            }

            // Also check by property address
            if (!isDuplicate && lead.property_address) {
              const existing = db.prepare(`
                SELECT id FROM leads
                WHERE user_id = ? AND property_address = ? AND property_city = ? AND property_state = ?
              `).get(userId, lead.property_address, lead.property_city, lead.property_state);
              if (existing) {
                isDuplicate = true;
              }
            }

            if (isDuplicate) {
              duplicateCount++;
              continue;
            }
          }

          const leadResult = insertLead.run(
            userId,
            lead.first_name,
            lead.last_name,
            lead.property_address,
            lead.property_city,
            lead.property_state,
            lead.property_zip,
            lead.mailing_address,
            lead.mailing_city,
            lead.mailing_state,
            lead.mailing_zip,
            lead.email,
            lead.property_type,
            lead.bedrooms,
            lead.bathrooms,
            lead.sqft,
            lead.year_built,
            lead.equity_percent,
            lead.estimated_value,
            lead.mortgage_balance,
            lead.vacant_indicator,
            JSON.stringify(lead.phones),
            id,
            JSON.stringify(lead.raw_data)
          );

          // Add lead to call queue automatically with timezone detection
          const leadId = leadResult.lastInsertRowid;
          const timezone = getTimezoneForLead(lead);
          insertCallQueue.run(leadId, timezone);

          importedCount++;
        } catch (rowError) {
          console.error('Row error:', rowError);
          errorCount++;
        }
      }
    });

    transaction();

    // Update import record
    db.prepare(`
      UPDATE import_history
      SET status = 'completed', imported_count = ?, duplicate_count = ?, error_count = ?
      WHERE id = ?
    `).run(importedCount, duplicateCount, errorCount, id);

    res.json({
      success: true,
      importId: id,
      imported: importedCount,
      duplicates: duplicateCount,
      errors: errorCount,
      total: jsonData.length
    });
  } catch (error) {
    console.error('Execute error:', error);
    res.status(500).json({ error: 'Failed to execute import: ' + error.message });
  }
});

// POST /api/import/push-to-fub/:id - Push imported leads to Follow-up Boss
router.post('/push-to-fub/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 1;

    // Get the import record
    const importRecord = db.prepare(`
      SELECT * FROM import_history WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!importRecord) {
      return res.status(404).json({ error: 'Import not found' });
    }

    if (importRecord.status !== 'completed') {
      return res.status(400).json({
        error: 'Import must be completed before pushing to Follow-up Boss. Please import the leads first.',
        suggestion: 'Click "Import Leads" to save the leads locally, then try pushing to FUB again.'
      });
    }

    // Check if FUB API key is configured
    const fubApiKey = getFubApiKey(userId);
    if (!fubApiKey) {
      return res.status(400).json({
        error: 'Follow-up Boss API key is not configured.',
        errorType: 'not_configured',
        suggestion: 'Please go to Settings and configure your Follow-up Boss API key before pushing leads.'
      });
    }

    // Get leads from this import
    const leads = db.prepare(`
      SELECT * FROM leads WHERE import_id = ? AND user_id = ?
    `).all(id, userId);

    if (leads.length === 0) {
      return res.status(400).json({
        error: 'No leads found for this import.',
        suggestion: 'The import may have been empty or leads were deleted.'
      });
    }

    // Track results
    let pushedCount = 0;
    let fubErrorCount = 0;
    let fubErrors = [];
    let firstFubError = null;

    // Push each lead to FUB
    for (const lead of leads) {
      // Skip if already pushed to FUB
      if (lead.fub_id) {
        pushedCount++;
        continue;
      }

      // Parse phones from JSON
      let phones = [];
      try {
        phones = JSON.parse(lead.phones || '[]');
      } catch (e) {
        phones = [];
      }

      // Build FUB person payload with custom fields for property data
      const fubPayload = {
        firstName: lead.first_name || '',
        lastName: lead.last_name || '',
        source: 'Property Call Import',
        emails: lead.email ? [{ value: lead.email }] : [],
        phones: phones.map(p => ({
          value: p.number,
          type: p.type === 'mobile' ? 'mobile' : (p.type === 'landline' ? 'home' : 'other')
        })),
        addresses: [{
          street: lead.property_address || '',
          city: lead.property_city || '',
          state: lead.property_state || '',
          code: lead.property_zip || ''
        }],
        // Custom fields for property data
        customFields: {
          'Property Type': lead.property_type || null,
          'Bedrooms': lead.bedrooms || null,
          'Bathrooms': lead.bathrooms || null,
          'Square Feet': lead.sqft || null,
          'Year Built': lead.year_built || null,
          'Estimated Value': lead.estimated_value || null,
          'Equity Percent': lead.equity_percent || null,
          'Mortgage Balance': lead.mortgage_balance || null,
          'Vacant Indicator': lead.vacant_indicator || null
        }
      };

      try {
        const response = await fetch(`${getFubApiBase()}/v1/people`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(fubApiKey + ':').toString('base64'),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fubPayload)
        });

        if (response.ok) {
          const fubData = await response.json();
          // Update lead with FUB ID
          db.prepare(`
            UPDATE leads SET fub_id = ?, updated_at = datetime('now') WHERE id = ?
          `).run(fubData.id, lead.id);
          pushedCount++;
        } else if (response.status === 401) {
          // Invalid API key - stop processing
          if (!firstFubError) {
            firstFubError = {
              type: 'invalid_credentials',
              message: 'Invalid Follow-up Boss API key. Please check your API key in Settings.',
              suggestion: 'Go to Settings > API Keys and verify your Follow-up Boss API key is correct.'
            };
          }
          fubErrorCount++;
          // Don't continue with other leads if auth failed
          break;
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          fubErrorCount++;
          fubErrors.push({
            leadId: lead.id,
            leadName: `${lead.first_name} ${lead.last_name}`.trim() || 'Unknown',
            status: response.status,
            error: errorData.error || errorData.message || 'Unknown error'
          });
          if (!firstFubError) {
            firstFubError = {
              type: 'api_error',
              message: `Follow-up Boss API error: ${errorData.error || errorData.message || 'Unknown error'}`,
              status: response.status
            };
          }
        }
      } catch (networkError) {
        fubErrorCount++;
        if (!firstFubError) {
          firstFubError = {
            type: 'network_error',
            message: 'Unable to connect to Follow-up Boss. Please check your internet connection.',
            suggestion: 'Verify your network connection and that Follow-up Boss is accessible.'
          };
        }
        fubErrors.push({
          leadId: lead.id,
          leadName: `${lead.first_name} ${lead.last_name}`.trim() || 'Unknown',
          error: networkError.message
        });
      }
    }

    // Update import record with FUB push results
    db.prepare(`
      UPDATE import_history SET
        fub_pushed_count = ?,
        fub_error_count = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(pushedCount, fubErrorCount, id);

    // Build response
    if (fubErrorCount > 0 && pushedCount === 0) {
      // Complete failure
      return res.status(400).json({
        success: false,
        error: firstFubError?.message || 'Failed to push leads to Follow-up Boss',
        errorType: firstFubError?.type || 'unknown',
        suggestion: firstFubError?.suggestion || 'Please check your Follow-up Boss API key in Settings.',
        pushed: pushedCount,
        errors: fubErrorCount,
        total: leads.length,
        localDataPreserved: true,
        details: fubErrors.slice(0, 5) // First 5 errors
      });
    } else if (fubErrorCount > 0) {
      // Partial success
      return res.json({
        success: true,
        partialSuccess: true,
        message: `Pushed ${pushedCount} of ${leads.length} leads to Follow-up Boss. ${fubErrorCount} errors occurred.`,
        pushed: pushedCount,
        errors: fubErrorCount,
        total: leads.length,
        localDataPreserved: true,
        suggestion: 'Some leads could not be pushed. Your local data is safe. Check the error details below.',
        details: fubErrors.slice(0, 5) // First 5 errors
      });
    } else {
      // Full success
      return res.json({
        success: true,
        message: `Successfully pushed ${pushedCount} leads to Follow-up Boss.`,
        pushed: pushedCount,
        total: leads.length
      });
    }
  } catch (error) {
    console.error('Push to FUB error:', error);
    res.status(500).json({
      error: 'Failed to push leads to Follow-up Boss: ' + error.message,
      localDataPreserved: true,
      suggestion: 'Your local lead data is safe. Please try again or check your API settings.'
    });
  }
});

// DELETE /api/import/:id - Delete import record (and optionally its leads)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 1;
    const { deleteLeads = false } = req.body;

    const importRecord = db.prepare(`
      SELECT * FROM import_history WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!importRecord) {
      return res.status(404).json({ error: 'Import not found' });
    }

    // Delete in transaction
    const transaction = db.transaction(() => {
      if (deleteLeads) {
        db.prepare(`DELETE FROM leads WHERE import_id = ?`).run(id);
      }
      db.prepare(`DELETE FROM import_history WHERE id = ?`).run(id);

      // Delete uploaded file
      const filePath = path.join(uploadDir, importRecord.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    transaction();

    res.json({ success: true, message: 'Import deleted' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete import: ' + error.message });
  }
});

export default router;
