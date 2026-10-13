import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as argon2 from 'argon2';
import * as jose from 'jose';
import { pool } from '../../db/pool.js';
import type { RowDataPacket } from 'mysql2';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function adminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/admin/login
  fastify.post('/api/admin/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_BODY', message: parsed.error.message },
      });
    }

    const { email, password } = parsed.data;

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    const user = rows[0];
    if (!user) {
      // Prevent timing attacks by still verifying
      await argon2.verify('$argon2id$v=19$m=16,t=2,p=1$invalid', 'dummy').catch(() => {});
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email atau password salah' },
      });
    }

    const valid = await argon2.verify(user.password_hash as string, password);
    if (!valid) {
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email atau password salah' },
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return reply.code(500).send({
        error: { code: 'SERVER_ERROR', message: 'JWT_SECRET tidak dikonfigurasi' },
      });
    }

    const key = new TextEncoder().encode(secret);
    const token = await new jose.SignJWT({
      sub: String(user.id),
      email: user.email as string,
      role: user.role as string,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(key);

    return reply
      .setCookie('auth_token', token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 86400,
        secure: process.env.NODE_ENV === 'production',
      })
      .send({ message: 'Login berhasil', role: user.role });
  });

  // POST /api/admin/logout
  fastify.post('/api/admin/logout', async (_request, reply) => {
    return reply
      .clearCookie('auth_token', { path: '/' })
      .send({ message: 'Logout berhasil' });
  });
}
