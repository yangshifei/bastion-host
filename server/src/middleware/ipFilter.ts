import { Request, Response, NextFunction } from 'express';
import pool from '../database/connection';
import logger from '../utils/logger';

/** Simple CIDR check: does ip fall within network/mask? */
function ipInCidr(ip: string, network: string, mask: number): boolean {
  const ipParts = ip.split('.').map(Number);
  const netParts = network.split('.').map(Number);
  if (ipParts.length !== 4 || netParts.length !== 4) return false;
  const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const netInt = (netParts[0] << 24) | (netParts[1] << 16) | (netParts[2] << 8) | netParts[3];
  const maskInt = ~((1 << (32 - mask)) - 1);
  return (ipInt & maskInt) === (netInt & maskInt);
}

interface IpWhitelistEntry {
  network: string;
  mask: number;
  enabled: boolean;
}

/**
 * Check if an IP is within any enabled CIDR range in the whitelist.
 * Returns true if allowed (whitelist is empty or IP matches).
 * Returns false if rejected (whitelist exists and IP doesn't match).
 */
async function isIpAllowed(ip: string): Promise<boolean> {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT network, mask, enabled FROM ip_whitelist WHERE enabled = 1`
    );
    if (rows.length === 0) return true; // no whitelist = allow all

    for (const row of rows) {
      if (ipInCidr(ip, row.network, row.mask)) return true;
    }
    return false;
  } catch (err) {
    logger.error({ err }, 'IP whitelist check failed, allowing by default');
    return true; // fail open
  }
}

/**
 * Check if a user has a per-user IP binding and if the current IP matches.
 * Returns true if no binding exists or IP matches.
 * Returns false if binding exists and IP doesn't match.
 */
async function checkUserIpBinding(userId: number, ip: string): Promise<boolean> {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT ip_address FROM user_ip_bindings WHERE user_id = ?`,
      [userId]
    );
    if (rows.length === 0) return true; // no binding

    const boundIp = rows[0].ip_address;
    // Check if bound IP is a CIDR range
    if (boundIp.includes('/')) {
      const [net, maskStr] = boundIp.split('/');
      const mask = parseInt(maskStr, 10);
      if (!isNaN(mask)) return ipInCidr(ip, net, mask);
      return boundIp === ip;
    }
    return boundIp === ip;
  } catch {
    return true; // fail open
  }
}

/**
 * Express middleware: reject requests from IPs not in the whitelist.
 * Apply to login endpoint only (not global).
 */
export function ipFilterMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || '127.0.0.1';

  isIpAllowed(ip).then((allowed) => {
    if (!allowed) {
      res.status(401).json({ code: 1, message: '此 IP 地址不在允许范围内' });
      return;
    }
    next();
  }).catch(() => next());
}

/**
 * Check IP for a specific user during login. Called after IP whitelist check.
 */
export async function validateUserIp(userId: number, ip: string): Promise<boolean> {
  return checkUserIpBinding(userId, ip);
}

export function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || '127.0.0.1';
}
