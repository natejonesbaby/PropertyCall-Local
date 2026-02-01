import express from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all dashboard routes
router.use(requireAuth);

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', (req, res) => {
  try {
    const userId = req.user.id;

    // Get total leads count for this user
    const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads WHERE user_id = ?').get(userId).count;

    // Get new leads count (status = 'new' or null) for this user
    const newLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND (status = 'new' OR status IS NULL)").get(userId).count;

    // Get called leads count for this user
    const calledLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND status = 'called'").get(userId).count;

    // Get qualified leads count for this user (leads that have at least one call with qualification_status = 'Qualified')
    const qualifiedLeads = db.prepare(`
      SELECT COUNT(DISTINCT l.id) as count
      FROM leads l
      INNER JOIN calls c ON l.id = c.lead_id
      WHERE l.user_id = ? AND c.qualification_status = 'Qualified'
    `).get(userId).count;

    // Get callbacks scheduled count for this user
    const callbacksScheduled = db.prepare(`
      SELECT COUNT(DISTINCT l.id) as count
      FROM leads l
      INNER JOIN calls c ON l.id = c.lead_id
      WHERE l.user_id = ? AND c.callback_time IS NOT NULL
    `).get(userId).count;

    // Get calls made today count for this user
    const callsToday = db.prepare(`
      SELECT COUNT(*) as count
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ? AND date(c.started_at) = date('now', 'localtime')
    `).get(userId).count;

    // Get total calls count for this user
    const totalCalls = db.prepare(`
      SELECT COUNT(*) as count
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ?
    `).get(userId).count;

    res.json({
      totalLeads,
      newLeads,
      calledLeads,
      qualifiedLeads,
      callbacksScheduled,
      callsToday,
      totalCalls
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// GET /api/dashboard/outcome-distribution - Get call outcome distribution for charts
router.get('/outcome-distribution', (req, res) => {
  try {
    const userId = req.user.id;

    // Get total completed calls count for this user
    const totalCalls = db.prepare(`
      SELECT COUNT(*) as count
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ? AND c.status = 'completed'
    `).get(userId).count;

    // Get outcome distribution by disposition for this user
    const outcomesByDisposition = db.prepare(`
      SELECT
        c.disposition,
        COUNT(*) as count
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ? AND c.disposition IS NOT NULL
      GROUP BY c.disposition
      ORDER BY count DESC
    `).all(userId);

    // Get outcome distribution by qualification status for this user
    const outcomesByQualification = db.prepare(`
      SELECT
        c.qualification_status,
        COUNT(*) as count
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ? AND c.qualification_status IS NOT NULL
      GROUP BY c.qualification_status
      ORDER BY count DESC
    `).all(userId);

    // Get outcome distribution by sentiment for this user
    const outcomesBySentiment = db.prepare(`
      SELECT
        c.sentiment,
        COUNT(*) as count
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ? AND c.sentiment IS NOT NULL
      GROUP BY c.sentiment
      ORDER BY count DESC
    `).all(userId);

    res.json({
      totalCalls,
      byDisposition: outcomesByDisposition,
      byQualification: outcomesByQualification,
      bySentiment: outcomesBySentiment
    });
  } catch (error) {
    console.error('Get outcome distribution error:', error);
    res.status(500).json({ error: 'Failed to fetch outcome distribution' });
  }
});

// GET /api/dashboard/qualified-leads - Get list of qualified leads with their qualification details
router.get('/qualified-leads', (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;

    // Get total count of qualified leads for this user
    const totalResult = db.prepare(`
      SELECT COUNT(DISTINCT l.id) as count
      FROM leads l
      INNER JOIN calls c ON l.id = c.lead_id
      WHERE l.user_id = ? AND c.qualification_status = 'Qualified'
    `).get(userId);
    const total = totalResult.count;

    // Get qualified leads with their most recent qualified call info for this user
    const qualifiedLeads = db.prepare(`
      SELECT
        l.id,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.property_zip,
        l.phones,
        l.status as lead_status,
        c.id as call_id,
        c.qualification_status,
        c.disposition,
        c.sentiment,
        c.callback_time,
        c.ai_summary,
        c.created_at as call_date
      FROM leads l
      INNER JOIN calls c ON l.id = c.lead_id
      WHERE l.user_id = ? AND c.qualification_status = 'Qualified'
      AND c.id = (
        SELECT MAX(c2.id)
        FROM calls c2
        WHERE c2.lead_id = l.id AND c2.qualification_status = 'Qualified'
      )
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, parseInt(limit), offset);

    // Parse phones JSON for each lead
    const parsedLeads = qualifiedLeads.map(lead => ({
      ...lead,
      phones: lead.phones ? JSON.parse(lead.phones) : []
    }));

    res.json({
      leads: parsedLeads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get qualified leads error:', error);
    res.status(500).json({ error: 'Failed to fetch qualified leads' });
  }
});

// GET /api/dashboard/pending-callbacks - Get list of pending callbacks
router.get('/pending-callbacks', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user.id;

    // Get calls with callback_time set that are upcoming (callback_time >= now)
    // Also include callbacks in the near past (within the last 24 hours) as they may still need attention
    const pendingCallbacks = db.prepare(`
      SELECT
        c.id as call_id,
        c.lead_id,
        c.callback_time,
        c.disposition,
        c.qualification_status,
        c.sentiment,
        c.created_at as call_date,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city,
        l.property_state,
        l.phones
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ?
        AND c.callback_time IS NOT NULL
        AND c.callback_time >= datetime('now', '-1 day')
        AND (c.disposition = 'Callback Scheduled' OR c.callback_time > datetime('now'))
      ORDER BY c.callback_time ASC
      LIMIT ?
    `).all(userId, parseInt(limit));

    // Parse phones JSON for each callback
    const parsedCallbacks = pendingCallbacks.map(callback => ({
      ...callback,
      phones: callback.phones ? JSON.parse(callback.phones) : []
    }));

    // Get total count of pending callbacks for this user
    const totalPending = db.prepare(`
      SELECT COUNT(*) as count
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ?
        AND c.callback_time IS NOT NULL
        AND c.callback_time >= datetime('now', '-1 day')
        AND (c.disposition = 'Callback Scheduled' OR c.callback_time > datetime('now'))
    `).get(userId).count;

    res.json({
      callbacks: parsedCallbacks,
      total: totalPending
    });
  } catch (error) {
    console.error('Get pending callbacks error:', error);
    res.status(500).json({ error: 'Failed to fetch pending callbacks' });
  }
});

// GET /api/dashboard/recent-activity - Get recent activity feed
router.get('/recent-activity', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user.id;
    const activities = [];

    // Get recent imports for this user
    const recentImports = db.prepare(`
      SELECT
        id,
        original_filename,
        total_rows,
        imported_count,
        duplicate_count,
        error_count,
        status,
        created_at
      FROM import_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, parseInt(limit));

    recentImports.forEach(imp => {
      activities.push({
        id: `import-${imp.id}`,
        type: 'import',
        action: imp.status === 'completed' ? 'Import completed' : `Import ${imp.status}`,
        description: `${imp.original_filename} - ${imp.imported_count || 0} leads imported${imp.duplicate_count > 0 ? `, ${imp.duplicate_count} duplicates skipped` : ''}`,
        details: {
          filename: imp.original_filename,
          totalRows: imp.total_rows,
          imported: imp.imported_count,
          duplicates: imp.duplicate_count,
          errors: imp.error_count
        },
        timestamp: imp.created_at,
        icon: 'upload'
      });
    });

    // Get recent calls for this user
    const recentCalls = db.prepare(`
      SELECT
        c.id,
        c.lead_id,
        c.status,
        c.disposition,
        c.qualification_status,
        c.sentiment,
        c.duration_seconds,
        c.started_at,
        c.ended_at,
        c.created_at,
        l.first_name,
        l.last_name,
        l.property_address,
        l.property_city
      FROM calls c
      INNER JOIN leads l ON c.lead_id = l.id
      WHERE l.user_id = ?
      ORDER BY c.created_at DESC
      LIMIT ?
    `).all(userId, parseInt(limit));

    recentCalls.forEach(call => {
      const leadName = [call.first_name, call.last_name].filter(Boolean).join(' ') || 'Unknown Lead';
      let action = 'Call started';
      let description = `Call to ${leadName}`;

      if (call.status === 'completed') {
        action = 'Call completed';
        description = `${call.disposition || 'No disposition'} - ${leadName}`;
        if (call.qualification_status) {
          description += ` (${call.qualification_status})`;
        }
      } else if (call.status === 'in_progress') {
        action = 'Call in progress';
        description = `Currently calling ${leadName}`;
      } else if (call.status === 'failed') {
        action = 'Call failed';
        description = `Failed to reach ${leadName}`;
      }

      if (call.property_address && call.property_city) {
        description += ` - ${call.property_address}, ${call.property_city}`;
      }

      activities.push({
        id: `call-${call.id}`,
        type: 'call',
        action,
        description,
        details: {
          leadId: call.lead_id,
          leadName,
          status: call.status,
          disposition: call.disposition,
          qualification: call.qualification_status,
          sentiment: call.sentiment,
          duration: call.duration_seconds
        },
        timestamp: call.created_at,
        icon: 'phone'
      });
    });

    // Get recent lead status changes for this user (leads updated today or recently created)
    const recentLeadChanges = db.prepare(`
      SELECT
        id,
        first_name,
        last_name,
        property_address,
        property_city,
        status,
        created_at,
        updated_at
      FROM leads
      WHERE user_id = ?
        AND (updated_at > datetime('now', '-24 hours')
         OR created_at > datetime('now', '-24 hours'))
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `).all(userId, parseInt(limit));

    recentLeadChanges.forEach(lead => {
      const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown Lead';
      const isNew = lead.created_at === lead.updated_at;

      if (!isNew && lead.status === 'called') {
        // Skip - this will be covered by call activity
        return;
      }

      activities.push({
        id: `lead-${lead.id}-${isNew ? 'new' : 'update'}`,
        type: 'lead',
        action: isNew ? 'Lead added' : `Lead status: ${lead.status || 'new'}`,
        description: `${leadName}${lead.property_address ? ` - ${lead.property_address}, ${lead.property_city}` : ''}`,
        details: {
          leadId: lead.id,
          leadName,
          status: lead.status,
          address: lead.property_address,
          city: lead.property_city
        },
        timestamp: isNew ? lead.created_at : lead.updated_at,
        icon: 'user'
      });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit to requested amount
    const limitedActivities = activities.slice(0, parseInt(limit));

    res.json({
      activities: limitedActivities,
      total: activities.length
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

export default router;
