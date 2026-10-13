import type { FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.['auth_token'];
  if (!token) {
    await reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Login diperlukan' } });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    await reply.code(500).send({ error: { code: 'SERVER_ERROR', message: 'JWT_SECRET tidak dikonfigurasi' } });
    return;
  }

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, key);
    request.user = {
      sub: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    await reply.code(401).send({ error: { code: 'INVALID_TOKEN', message: 'Token tidak valid' } });
  }
}
