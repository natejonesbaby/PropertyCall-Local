import express from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getTimezoneForLead } from '../utils/timezone.js';

const router = express.Router();

// Apply auth middleware to all queue routes
router.use(requireAuth);

// GET /api/queue - Get call queue with filters and pagination
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { status, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE l.user_id = ?';
    const params = [userId];

    if (status) {
      whereClause += ' AND q.status = ?';
      params.push(status);
    }

    // Get paginated queue items with lead details
    const queueItems = db.prepare(`
      SELECT
        q.id,
        q.lead_id,
        q.status,
        q.attempt_number,
        q.scheduled_time,
        q.timezone,
        q.phone_index,
        q.created_at,
        q.updated_at,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.phones
      FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      ${whereClause}
      ORDER BY q.scheduled_time ASC, q.created_at ASC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    // Get total count
    const totalResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      ${whereClause}
    `).get(...params);

    // Get status counts
    const statusCounts = db.prepare(`
      SELECT q.status, COUNT(*) as count
      FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      WHERE l.user_id = ?
      GROUP BY q.status
    `).all(userId);

    const statusSummary = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    };
    statusCounts.forEach(sc => {
      statusSummary[sc.status] = sc.count;
    });

    res.json({
      queue: queueItems.map(item => ({
        ...item,
        phones: item.phones ? JSON.parse(item.phones) : []
      })),
      total: totalResult.count,
      statusSummary,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + queueItems.length < totalResult.count
      }
    });
  } catch (error) {
    console.error('Queue fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch call queue: ' + error.message });
  }
});

// GET /api/queue/stats - Get queue statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    // Get status counts
    const statusCounts = db.prepare(`
      SELECT q.status, COUNT(*) as count
      FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      WHERE l.user_id = ?
      GROUP BY q.status
    `).all(userId);

    const stats = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      total: 0
    };
    statusCounts.forEach(sc => {
      stats[sc.status] = sc.count;
      stats.total += sc.count;
    });

    // Get next scheduled call
    const nextCall = db.prepare(`
      SELECT q.scheduled_time, l.first_name, l.last_name
      FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      WHERE l.user_id = ? AND q.status = 'pending'
      ORDER BY q.scheduled_time ASC
      LIMIT 1
    `).get(userId);

    res.json({
      ...stats,
      nextCall: nextCall || null
    });
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: 'Failed to fetch queue stats: ' + error.message });
  }
});

// GET /api/queue/status - Get queue pause status (must be before /:id route)
router.get('/status', async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    // Get queue_paused setting
    const setting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = 'queue_paused'
    `).get(userId);

    const paused = setting ? setting.value === 'true' : false;

    res.json({
      paused
    });
  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status: ' + error.message });
  }
});

// GET /api/queue/:id - Get single queue item details
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { id } = req.params;

    const queueItem = db.prepare(`
      SELECT
        q.*,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.property_zip,
        l.phones,
        l.email
      FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      WHERE q.id = ? AND l.user_id = ?
    `).get(id, userId);

    if (!queueItem) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    res.json({
      ...queueItem,
      phones: queueItem.phones ? JSON.parse(queueItem.phones) : []
    });
  } catch (error) {
    console.error('Queue item fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch queue item: ' + error.message });
  }
});

// PUT /api/queue/:id - Update queue item (e.g., reschedule, change status)
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { id } = req.params;
    const { status, scheduled_time, phone_index } = req.body;

    // Verify ownership
    const queueItem = db.prepare(`
      SELECT q.id FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      WHERE q.id = ? AND l.user_id = ?
    `).get(id, userId);

    if (!queueItem) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (scheduled_time !== undefined) {
      updates.push('scheduled_time = ?');
      params.push(scheduled_time);
    }
    if (phone_index !== undefined) {
      updates.push('phone_index = ?');
      params.push(phone_index);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE call_queue SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Fetch updated item
    const updatedItem = db.prepare(`
      SELECT q.*, l.first_name, l.last_name
      FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      WHERE q.id = ?
    `).get(id);

    res.json({
      success: true,
      queueItem: updatedItem
    });
  } catch (error) {
    console.error('Queue update error:', error);
    res.status(500).json({ error: 'Failed to update queue item: ' + error.message });
  }
});

// DELETE /api/queue/:id - Remove item from queue
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { id } = req.params;

    // Verify ownership
    const queueItem = db.prepare(`
      SELECT q.id FROM call_queue q
      JOIN leads l ON q.lead_id = l.id
      WHERE q.id = ? AND l.user_id = ?
    `).get(id, userId);

    if (!queueItem) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    db.prepare('DELETE FROM call_queue WHERE id = ?').run(id);

    res.json({ success: true, message: 'Queue item removed' });
  } catch (error) {
    console.error('Queue delete error:', error);
    res.status(500).json({ error: 'Failed to remove queue item: ' + error.message });
  }
});

// POST /api/queue/add - Manually add a lead to the queue
router.post('/add', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { lead_id, scheduled_time, phone_index = 0 } = req.body;

    if (!lead_id) {
      return res.status(400).json({ error: 'lead_id is required' });
    }

    // Verify lead exists and belongs to user
    const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(lead_id, userId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if lead is already in queue
    const existingQueueItem = db.prepare('SELECT id FROM call_queue WHERE lead_id = ? AND status = ?').get(lead_id, 'pending');
    if (existingQueueItem) {
      return res.status(400).json({ error: 'Lead is already in the call queue' });
    }

    // Detect timezone from lead's property state
    const timezone = getTimezoneForLead(lead);

    // Add to queue with timezone
    const result = db.prepare(`
      INSERT INTO call_queue (lead_id, status, attempt_number, scheduled_time, timezone, phone_index)
      VALUES (?, 'pending', 0, ?, ?, ?)
    `).run(lead_id, scheduled_time || new Date().toISOString(), timezone, phone_index);

    res.json({
      success: true,
      queueItemId: result.lastInsertRowid,
      message: 'Lead added to call queue'
    });
  } catch (error) {
    console.error('Queue add error:', error);
    res.status(500).json({ error: 'Failed to add to queue: ' + error.message });
  }
});

// POST /api/queue/pause - Pause the call queue
router.post('/pause', async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    // Set queue_paused setting to true
    db.prepare(`
      INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
      VALUES (?, 'queue_paused', 'true', datetime('now'), datetime('now'))
    `).run(userId);

    res.json({
      success: true,
      paused: true,
      message: 'Call queue paused'
    });
  } catch (error) {
    console.error('Queue pause error:', error);
    res.status(500).json({ error: 'Failed to pause queue: ' + error.message });
  }
});

// POST /api/queue/resume - Resume the call queue
router.post('/resume', async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    // Set queue_paused setting to false
    db.prepare(`
      INSERT OR REPLACE INTO settings (user_id, key, value, created_at, updated_at)
      VALUES (?, 'queue_paused', 'false', datetime('now'), datetime('now'))
    `).run(userId);

    res.json({
      success: true,
      paused: false,
      message: 'Call queue resumed'
    });
  } catch (error) {
    console.error('Queue resume error:', error);
    res.status(500).json({ error: 'Failed to resume queue: ' + error.message });
  }
});

export default router;
