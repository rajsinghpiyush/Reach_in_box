import express from 'express';
import prisma from '../prisma';
import { scheduleEmailJob, removeEmailJob } from '../queue';
import { parseEmailsFromCsv } from '../utils/csv';
import { getRateLimitStats } from '../redis';
import { emitEmailScheduled, emitEmailDeleted, emitStatsUpdated } from '../socket';

const router = express.Router();

// Middleware to authenticate user from Google or Mock token
const authMiddleware = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    let email: string | null = null;
    let name: string | null = null;

    if (token === 'mock-jwt-token') {
      email = 'test@example.com';
      name = 'Test User';
    } else if (token.includes('.')) {
      const parts = token.split('.');
      if (parts[1]) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);
        email = payload.email;
        name = payload.name;
      }
    } else {
      // Direct raw string email or identifier
      email = token.includes('@') ? token : 'test@example.com';
    }

    if (!email) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || (email.split('@')[0] as string),
        }
      });
    }
    
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authMiddleware);

// Endpoint to preview and parse CSV data
router.post('/parse-csv', (req: any, res: any) => {
  const { csvData } = req.body;
  if (!csvData) {
    return res.status(400).json({ error: 'csvData is required' });
  }

  const emails = parseEmailsFromCsv(csvData);
  res.json({
    count: emails.length,
    emails,
  });
});

// Get rate limit and email metrics
router.get('/stats', async (req: any, res: any) => {
  try {
    const user = req.user;
    const defaultHourlyLimit = parseInt(process.env.MAX_EMAILS_PER_HOUR || '200', 10);
    const rateStats = await getRateLimitStats(defaultHourlyLimit);

    const scheduledCount = await prisma.email.count({
      where: { userId: user.id, status: { in: ['SCHEDULED', 'RESCHEDULED'] } },
    });
    const sentCount = await prisma.email.count({
      where: { userId: user.id, status: 'SENT' },
    });
    const failedCount = await prisma.email.count({
      where: { userId: user.id, status: 'FAILED' },
    });

    res.json({
      used: rateStats.used,
      limit: rateStats.limit,
      remaining: rateStats.remaining,
      hourBucket: rateStats.hourBucket,
      scheduledCount,
      sentCount,
      failedCount,
    });
  } catch (error) {
    console.error('Error fetching email stats:', error);
    res.status(500).json({ error: 'Failed to fetch email statistics' });
  }
});

// Schedule emails (supports single, array, and bulk CSV upload)
router.post('/schedule', async (req: any, res: any) => {
  const { subject, body, to, csvData, scheduledAt, delay, hourlyLimit } = req.body;
  const user = req.user;

  if (!subject || !body || (!to && !csvData) || !scheduledAt) {
    return res.status(400).json({ error: 'Missing required fields (subject, body, scheduledAt, and to/csvData)' });
  }

  // Extract recipients from either csvData or to
  let toList: string[] = [];

  if (csvData) {
    toList = parseEmailsFromCsv(csvData);
  } else if (Array.isArray(to)) {
    toList = to.filter(e => typeof e === 'string' && e.includes('@')).map(e => e.trim().toLowerCase());
  } else if (typeof to === 'string') {
    toList = parseEmailsFromCsv(to);
  }

  // Deduplicate emails
  toList = Array.from(new Set(toList.filter(Boolean)));

  if (toList.length === 0) {
    return res.status(400).json({ error: 'No valid recipient email addresses found' });
  }

  try {
    const scheduledEmails: any[] = [];

    // Base start time
    const startTime = new Date(scheduledAt).getTime();
    
    // Convert delay input to milliseconds. If empty or 0, fallback to env or 2000ms
    const delayMs = (delay !== undefined && delay !== null && delay !== '') 
      ? parseInt(delay, 10) 
      : parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000', 10);
      
    const hourlyLimitNum = hourlyLimit ? parseInt(hourlyLimit, 10) : parseInt(process.env.MAX_EMAILS_PER_HOUR || '200', 10);

    for (let i = 0; i < toList.length; i++) {
      const recipient = toList[i];
      if (!recipient) continue;
      
      // Calculate stagger: add delayMs for each subsequent email in the batch
      let jobDelay = (startTime - Date.now()) + (i * delayMs);
      if (jobDelay < 0) jobDelay = 0;
      
      const emailRecord = await prisma.email.create({
        data: {
          subject,
          body,
          to: recipient,
          scheduledAt: new Date(Date.now() + jobDelay),
          delay: delayMs,
          hourlyLimit: hourlyLimitNum,
          userId: user.id,
          status: 'SCHEDULED',
        },
      });
      
      await scheduleEmailJob({
        emailId: emailRecord.id,
        to: recipient,
        subject,
        text: body,
        delay: 0, // Delay is handled via BullMQ job delay
        hourlyLimit: hourlyLimitNum,
        userId: user.id,
      }, jobDelay);

      scheduledEmails.push(emailRecord);
    }

    console.log(`[SCHEDULE] Successfully scheduled ${scheduledEmails.length} email(s) for user ${user.email}`);

    // Emit real-time WebSocket events
    emitEmailScheduled(scheduledEmails, user.id);
    getRateLimitStats().then(stats => emitStatsUpdated(stats)).catch(() => {});

    res.json({ 
      message: 'Emails scheduled successfully', 
      count: scheduledEmails.length,
      recipients: toList.slice(0, 5), // Preview first 5
    });
  } catch (error) {
    console.error('Error scheduling emails:', error);
    res.status(500).json({ error: 'Failed to schedule emails' });
  }
});

// Get scheduled emails (including RESCHEDULED emails due to rate limit)
router.get('/scheduled', async (req: any, res: any) => {
  try {
    const emails = await prisma.email.findMany({
      where: { 
        userId: req.user.id, 
        status: { in: ['SCHEDULED', 'RESCHEDULED'] } 
      },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(emails);
  } catch (error) {
    console.error('Error fetching scheduled emails:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled emails' });
  }
});

// Get sent/failed emails
router.get('/sent', async (req: any, res: any) => {
  try {
    const emails = await prisma.email.findMany({
      where: { userId: req.user.id, status: { in: ['SENT', 'FAILED'] } },
      orderBy: { sentAt: 'desc' },
    });
    res.json(emails);
  } catch (error) {
    console.error('Error fetching sent emails:', error);
    res.status(500).json({ error: 'Failed to fetch sent emails' });
  }
});

// Delete a scheduled email
router.delete('/:id', async (req: any, res: any) => {
  const { id } = req.params;
  const user = req.user;

  try {
    const emailRecord = await prisma.email.findFirst({
      where: { id, userId: user.id }
    });

    if (!emailRecord) {
      return res.status(404).json({ error: 'Email not found or unauthorized' });
    }

    if (!['SCHEDULED', 'RESCHEDULED'].includes(emailRecord.status)) {
      return res.status(400).json({ error: 'Can only delete scheduled or rescheduled emails' });
    }

    // Try to remove from BullMQ first
    try {
      await removeEmailJob(id);
    } catch (err: any) {
      if (err.message && err.message.includes('locked')) {
        return res.status(400).json({ error: 'Email is currently being sent and cannot be deleted.' });
      }
      console.warn(`Could not remove BullMQ job for ${id}:`, err.message);
    }

    // Delete from DB
    await prisma.email.delete({
      where: { id }
    });

    // Emit real-time WebSocket events
    emitEmailDeleted(id, user.id);
    getRateLimitStats().then(stats => emitStatsUpdated(stats)).catch(() => {});

    res.json({ message: 'Email deleted successfully' });
  } catch (error) {
    console.error('Error deleting email:', error);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// Edit a scheduled email
router.put('/:id', async (req: any, res: any) => {
  const { id } = req.params;
  const { subject, body, to, scheduledAt, delay, hourlyLimit } = req.body;
  const user = req.user;

  try {
    const emailRecord = await prisma.email.findFirst({
      where: { id, userId: user.id }
    });

    if (!emailRecord) return res.status(404).json({ error: 'Email not found or unauthorized' });
    if (!['SCHEDULED', 'RESCHEDULED'].includes(emailRecord.status)) {
      return res.status(400).json({ error: 'Can only edit scheduled or rescheduled emails' });
    }

    const hourlyLimitNum = hourlyLimit ? parseInt(hourlyLimit, 10) : emailRecord.hourlyLimit;

    // Update DB
    const updatedEmail = await prisma.email.update({
      where: { id },
      data: {
        subject,
        body,
        to,
        scheduledAt: new Date(scheduledAt),
        delay: delay !== undefined ? parseInt(delay, 10) : emailRecord.delay,
        hourlyLimit: hourlyLimitNum,
        status: 'SCHEDULED', // reset to SCHEDULED if it was RESCHEDULED
      }
    });

    // Remove old job
    await removeEmailJob(id);

    // Schedule new job
    const startTime = new Date(scheduledAt).getTime();
    let initialDelay = startTime - Date.now();
    if (initialDelay < 0) initialDelay = 0;

    await scheduleEmailJob({
      emailId: id,
      to,
      subject,
      text: body,
      delay: updatedEmail.delay,
      hourlyLimit: hourlyLimitNum,
      userId: user.id,
    }, initialDelay);

    // Emit real-time WebSocket events
    emitEmailScheduled(updatedEmail, user.id);
    getRateLimitStats().then(stats => emitStatsUpdated(stats)).catch(() => {});

    res.json({ message: 'Email updated successfully' });
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

export default router;
