import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

let connectionOptions: any = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

if (process.env.REDIS_URL) {
  const url = new URL(process.env.REDIS_URL);
  connectionOptions = {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export const redisClient = new Redis(connectionOptions);

export function getHourBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}`;
}

export function getRateLimitKey(hourBucket: string = getHourBucket()): string {
  return `email_rate_limit:hourly:${hourBucket}`;
}

export async function getRateLimitStats(limit: number = 200) {
  const key = getRateLimitKey();
  const countStr = await redisClient.get(key);
  const used = countStr ? parseInt(countStr, 10) : 0;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    hourBucket: getHourBucket(),
  };
}
