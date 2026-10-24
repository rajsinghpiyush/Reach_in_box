import { Worker, Job, DelayedError } from 'bullmq';
import dotenv from 'dotenv';
import prisma from './prisma';
import { sendEmail } from './services/email';
import { redisClient, getHourBucket, getRateLimitKey, getRateLimitStats, connectionOptions } from './redis';
import {
  emitEmailSent,
  emitEmailFailed,
  emitEmailRescheduled,
  emitRateLimitReached,
  emitStatsUpdated,
} from './socket';

dotenv.config();

const connection = connectionOptions;

const concurrency = parseInt(process.env.CONCURRENCY || '5');
const maxEmailsPerHour = parseInt(process.env.MAX_EMAILS_PER_HOUR || '200');
const minDelayBetweenEmailsMs = parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000');

export const startWorker = () => {
  const worker = new Worker(
    'email-queue',
    async (job: Job) => {
      const { emailId, to, subject, text, delay, hourlyLimit, userId } = job.data;
      const limit = hourlyLimit ? parseInt(hourlyLimit) : maxEmailsPerHour;
      
      console.log(`\n-------------------------------------------------------`);
      console.log(`[WORKER] Processing job ${job.id} for email ${emailId} to <${to}>`);

      // Rate limit check using Redis sliding hourly counter
      const hourBucket = getHourBucket();
      const rateKey = getRateLimitKey(hourBucket);

      const currentCount = await redisClient.incr(rateKey);
      if (currentCount === 1) {
        await redisClient.expire(rateKey, 7200); // 2 hour TTL
      }

      // Check if hourly limit exceeded
      if (currentCount > limit) {
        // Roll back counter
        await redisClient.decr(rateKey);

        const now = new Date();
        const msUntilNextHour = ((60 - now.getUTCMinutes()) * 60 - now.getUTCSeconds()) * 1000;
        const rescheduledTime = new Date(Date.now() + msUntilNextHour);

        console.warn(`=======================================================`);
        console.warn(`⚠️ [RATE LIMIT NOTIFICATION] Hourly limit reached! (${limit} emails/hr)`);
        console.warn(`[NOTIFY] Current hour limit (${limit}) exceeded for bucket [${hourBucket}].`);
        console.warn(`[NOTIFY] Email ${emailId} to <${to}> cannot be dispatched now.`);
        console.warn(`[NOTIFY] Rescheduling to next hour window at ${rescheduledTime.toISOString()} (~${Math.ceil(msUntilNextHour / 60000)} mins delay).`);
        console.warn(`=======================================================`);

        // Update DB status to RESCHEDULED and broadcast real-time WebSocket update
        try {
          const rescheduledEmail = await prisma.email.update({
            where: { id: emailId },
            data: { 
              status: 'RESCHEDULED', 
              scheduledAt: rescheduledTime 
            },
          });

          // Broadcast real-time WebSocket event for limit hit & rescheduling
          emitRateLimitReached({
            limit,
            count: currentCount,
            emailId,
            to,
            nextHourTime: rescheduledTime.toISOString(),
            userId,
          });
          emitEmailRescheduled(rescheduledEmail, userId);

          // Broadcast updated stats
          const stats = await getRateLimitStats(maxEmailsPerHour);
          emitStatsUpdated(stats);
        } catch (dbErr) {
          console.error(`Failed to update email status to RESCHEDULED:`, dbErr);
        }

        // Delay job in BullMQ to the beginning of next hour
        await job.moveToDelayed(Date.now() + msUntilNextHour, job.token!);
        throw new DelayedError();
      }

      console.log(`[RATE LIMIT] Email allowed: ${currentCount}/${limit} sent for hour [${hourBucket}].`);
      if (currentCount === limit) {
        console.warn(`🔔 [RATE LIMIT NOTIFICATION] ⚠️ Threshold reached (${limit}/${limit})! All subsequent emails this hour will be rescheduled.`);
        emitRateLimitReached({
          limit,
          count: currentCount,
          emailId,
          to,
          nextHourTime: new Date(Date.now() + ((60 - new Date().getUTCMinutes()) * 60000)).toISOString(),
          userId,
        });
      }

      try {
        // Enforce delay between emails if set
        const waitTime = delay ? delay * 1000 : minDelayBetweenEmailsMs;
        if (waitTime > 0) {
          console.log(`[WORKER] Staggering email delivery: waiting ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Send the email
        const info = await sendEmail(to, subject, text);
        let previewUrl = (info as any).mockPreviewUrl || '';
        if (!previewUrl) {
          try {
            const nodemailer = require('nodemailer');
            previewUrl = nodemailer.getTestMessageUrl(info) || '';
          } catch (e) {}
        }
        
        const finalBody = previewUrl ? `${text}\n\n[Ethereal Preview URL]: ${previewUrl}` : text;

        // Update DB
        const sentEmail = await prisma.email.update({
          where: { id: emailId },
          data: { status: 'SENT', sentAt: new Date(), body: finalBody },
        });

        console.log(`[WORKER] Successfully sent email ${emailId} to <${to}>`);

        // Broadcast real-time WebSocket event for sent email and updated stats
        emitEmailSent(sentEmail, userId);
        const stats = await getRateLimitStats(maxEmailsPerHour);
        emitStatsUpdated(stats);
      } catch (error) {
        if (error instanceof DelayedError || (error as any)?.name === 'DelayedError') {
          throw error;
        }

        console.error(`[WORKER] Failed to send email ${emailId}:`, error);
        
        // Update DB on failure
        try {
          const failedEmail = await prisma.email.update({
            where: { id: emailId },
            data: { status: 'FAILED' },
          });
          emitEmailFailed(failedEmail, userId);
          const stats = await getRateLimitStats(maxEmailsPerHour);
          emitStatsUpdated(stats);
        } catch (dbErr) {
          console.error(`Failed to mark email ${emailId} as FAILED:`, dbErr);
        }
        
        throw error;
      }
    },
    {
      connection,
      concurrency,
    }
  );

  worker.on('completed', job => {
    console.log(`[WORKER] Job ${job.id} completed successfully.`);
  });

  worker.on('failed', (job, err) => {
    if (err.name === 'DelayedError') {
      console.log(`[WORKER] Job ${job?.id} rescheduled due to hourly rate limit.`);
      return;
    }
    console.error(`[WORKER] Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
};
