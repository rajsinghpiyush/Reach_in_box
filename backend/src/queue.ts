import { Queue } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

let connection: any = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

if (process.env.REDIS_URL) {
  const url = new URL(process.env.REDIS_URL);
  connection = {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

export const emailQueue = new Queue('email-queue', { connection });

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
