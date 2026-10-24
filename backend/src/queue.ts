import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import { connectionOptions } from './redis';
dotenv.config();

export const emailQueue = new Queue('email-queue', { connection: connectionOptions });

export const scheduleEmailJob = async (jobData: any, delayMs: number) => {
  await emailQueue.add('send-email', jobData, { 
    delay: delayMs,
    jobId: jobData.emailId // Explicitly set jobId so we can find/delete it easily
  });
};

// Helper function to remove a job from the queue
export const removeEmailJob = async (emailId: string) => {
  const job = await emailQueue.getJob(emailId);
  if (job) {
    await job.remove();
  }
};
