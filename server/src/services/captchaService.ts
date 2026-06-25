import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

interface CaptchaChallenge {
  id: string;
  question: string;
  answer: string;
  expiresAt: number;
}

// In-memory store (per-process; sufficient for single-instance deployment)
const challenges = new Map<string, CaptchaChallenge>();

// Cleanup expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, ch] of challenges) {
    if (ch.expiresAt < now) challenges.delete(id);
  }
}, 5 * 60 * 1000);

function generateMathQuestion(): { question: string; answer: string } {
  const ops = [
    { sign: '+', fn: (a: number, b: number) => a + b },
    { sign: '-', fn: (a: number, b: number) => a - b },
    { sign: '×', fn: (a: number, b: number) => a * b },
  ];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number;
  if (op.sign === '×') {
    a = Math.floor(Math.random() * 9) + 1;  // 1-9
    b = Math.floor(Math.random() * 9) + 1;
  } else if (op.sign === '-') {
    a = Math.floor(Math.random() * 20) + 5; // 5-24
    b = Math.floor(Math.random() * a);       // 0-(a-1), ensure non-negative
  } else {
    a = Math.floor(Math.random() * 20) + 1;  // 1-20
    b = Math.floor(Math.random() * 20) + 1;
  }
  return {
    question: `${a} ${op.sign} ${b} = ?`,
    answer: String(op.fn(a, b)),
  };
}

export const captchaService = {
  generate(): { id: string; question: string; expiresIn: number } {
    const { question, answer } = generateMathQuestion();
    const id = uuidv4();
    challenges.set(id, {
      id,
      question,
      answer,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min expiry
    });
    logger.info({ id }, 'CAPTCHA challenge generated');
    return { id, question, expiresIn: 300 };
  },

  verify(id: string, answer: string): boolean {
    const challenge = challenges.get(id);
    if (!challenge) return false;
    if (challenge.expiresAt < Date.now()) {
      challenges.delete(id);
      return false;
    }
    const valid = challenge.answer === String(answer).trim();
    challenges.delete(id); // single-use
    return valid;
  },
};
