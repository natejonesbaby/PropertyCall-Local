import express from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all leads routes
router.use(requireAuth);

// GET /api/leads - List all leads with pagination and search
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50, search = '', status = '', sortBy = 'created_at', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'l.user_id = ?';
    const params = [userId];

    // Search by name, address, or phone
    if (search) {
      whereClause += ` AND (
        l.first_name LIKE ? OR
        l.last_name LIKE ? OR
        l.property_address LIKE ? OR
        l.property_city LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Filter by status
    if (status) {
      whereClause += ' AND l.status = ?';
      params.push(status);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM leads l WHERE ${whereClause}`;
    const { total } = db.prepare(countQuery).get(...params);

    // Validate sort column to prevent SQL injection
    const allowedSortColumns = ['first_name', 'last_name', 'property_address', 'property_city', 'status', 'created_at'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // For name sorting, we use first_name and last_name combined
    let orderClause;
    if (sortColumn === 'first_name') {
      orderClause = `l.first_name ${sortDirection}, l.last_name ${sortDirection}`;
    } else {
      orderClause = `l.${sortColumn} ${sortDirection}`;
    }

    // Get leads with pagination
    const leadsQuery = `
      SELECT
        l.id,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.property_zip,
        l.mailing_address,
        l.mailing_city,
        l.mailing_state,
        l.mailing_zip,
        l.phones,
        l.email,
        l.bedrooms,
        l.bathrooms,
        l.sqft,
        l.year_built,
        l.estimated_value,
        l.equity_percent,
        l.mortgage_balance,
        l.status,
        l.fub_id,
        l.created_at,
        l.updated_at
      FROM leads l
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const leads = db.prepare(leadsQuery).all(...params, parseInt(limit), parseInt(offset));

    // Parse JSON fields
    const parsedLeads = leads.map(lead => ({
      ...lead,
      phones: lead.phones ? JSON.parse(lead.phones) : []
    }));

    res.json({
      leads: parsedLeads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// GET /api/leads/:id - Get single lead by ID
router.get('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const lead = db.prepare(`
      SELECT * FROM leads WHERE id = ? AND user_id = ?
    `).get(id, userId);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Parse JSON fields
    const parsedLead = {
      ...lead,
      phones: lead.phones ? JSON.parse(lead.phones) : []
    };

    res.json({ lead: parsedLead });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// PUT /api/leads/:id - Update lead
router.put('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    // Check if lead exists and belongs to user
    const existing = db.prepare('SELECT id FROM leads WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Build update query dynamically
    const allowedFields = [
      'first_name', 'last_name', 'property_address', 'property_city',
      'property_state', 'property_zip', 'mailing_address', 'mailing_city',
      'mailing_state', 'mailing_zip', 'status', 'qualification_status',
      'notes', 'phones'
    ];

    const updateParts = [];
    const values = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateParts.push(`${field} = ?`);
        // Serialize phones array to JSON string
        if (field === 'phones' && Array.isArray(updates[field])) {
          values.push(JSON.stringify(updates[field]));
        } else {
          values.push(updates[field]);
        }
      }
    }

    if (updateParts.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateParts.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`
      UPDATE leads SET ${updateParts.join(', ')} WHERE id = ?
    `).run(...values);

    // Return updated lead
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    const parsedLead = {
      ...lead,
      phones: lead.phones ? JSON.parse(lead.phones) : []
    };

    res.json({ lead: parsedLead });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:id - Delete lead
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = db.prepare('DELETE FROM leads WHERE id = ? AND user_id = ?').run(id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

export default router;
