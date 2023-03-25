import { sql } from '@databases/sqlite-sync';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

import db from './db.mjs';

const hash = (reqBody) => crypto.scryptSync(
  reqBody.password,
  `gunn-alumni/backend/${reqBody.email}`,
  128,
  { p: 5 },
);

// todo: use mailjet to actually send emails
const transporter = nodemailer.createTransport({
  streamTransport: true,
});

export default async function publicRoutes(server) {
  server.get(
    '/alums',
    async (req, _reply) => {
      const beginYear = req.query.beginYear || Number.MIN_SAFE_INTEGER;
      const endYear = req.query.endYear || Number.MAX_SAFE_INTEGER;

      const results = {};
      db.query(sql`
        SELECT name, grad_year, user_id FROM people
        WHERE grad_year BETWEEN ${beginYear} AND ${endYear}
        ORDER BY name
      `).forEach((alum) => {
        results[alum.grad_year] ||= [];
        results[alum.grad_year].push((({ name, user_id }) => {
          if (user_id !== null) {
            return { name, user_id };
          }
          return { name };
        })(alum));
      });
      return results;
    },
  );

  server.post(
    '/register',
    async (req, _reply) => {
      if (!Number.isInteger(req.body.person_id)) {
        return Error('person_id must be integral');
      }

      if (db.query(sql`
        SELECT email FROM users WHERE email=${req.body.email}
      `).length !== 0) {
        console.warn('attempted to create existing user');
        return;
      }

      if (db.query(sql`
        SELECT user_id FROM people WHERE oid = ${req.body.person_id}
      `)[0].user_id !== null) {
        return Error('person is taken');
      }

      const newUid = db.query(sql`SELECT MAX(id) FROM users`)[0]['MAX(id)'] + 1;
      db.query(sql`
        INSERT INTO users (id, email, password, bio) VALUES
          (${newUid}, ${req.body.email}, ${hash(req.body)}, '');
        UPDATE people SET user_id = ${newUid} WHERE oid = ${req.body.person_id}
      `);
    },
  );

  server.post(
    '/reset-pw',
    async (req, _reply) => {
      // todo: make this work
      transporter.sendMail({
        from: 'fakeauth@gunnalum.site',
        to: req.body.email,
        subject: 'WEBSITE NAME Password Reset',
        text: 'test email text.',
      }, (_err, info) => info.message.pipe(process.stdout));

      return Error('fixme');
    },
  );

  server.post(
    '/auth',
    async (req, _reply) => {
      if (!req.body || !req.body.email) {
        return Error('missing email in request body');
      }

      const idens = db.query(sql`
        SELECT id, password FROM users WHERE email=${req.body.email}
      `);

      if (idens.length !== 1
        || !crypto.timingSafeEqual(idens[0].password, hash(req.body))) {
        return Error('incorrect password');
      }

      // fixme: make more secure
      return server.generateAuthToken(
        { ...idens[0], valid: 'yeah!' },
      );
    },
  );
}
