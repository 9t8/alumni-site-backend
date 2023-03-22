'use strict';

import connect, { sql } from '@databases/sqlite-sync';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const db = connect(process.env.DB_PATH);

const hash = req_body =>
  crypto.scryptSync(
    req_body.password, 'gunn-alumni/backend/' + req_body.email,
    128,
    { p: 5 }
  );

// todo: use mailjet to actually send emails
const transporter = nodemailer.createTransport({
  streamTransport: true
});

export async function publicRoutes(server) {
  server.get(
    '/alums',
    async (req, _reply) => {
      req.query.beginYear ||= Number.MIN_SAFE_INTEGER;
      req.query.endYear ||= Number.MAX_SAFE_INTEGER;

      const results = {};
      for (const alum of db.query(sql`
        SELECT name, grad_year, user_id FROM people
        WHERE grad_year BETWEEN ${req.query.beginYear} AND ${req.query.endYear}
        ORDER BY name
      `)) {
        results[alum.grad_year] ||= [];
        results[alum.grad_year].push((({ grad_year, ...rest }) => {
          if (rest.user_id === null) {
            delete rest.user_id;
          }
          return rest;
        })(alum));
      }
      return results;
    }
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
        console.error('failed to create existing user');
        return;
      }

      if (db.query(sql`
        SELECT user_id FROM people WHERE oid = ${req.body.person_id}
      `)[0].user_id !== null) {
        return Error('person is taken');
      }

      const new_uid
        = db.query(sql`SELECT MAX(id) FROM users`)[0]['MAX(id)'] + 1;
      db.query(sql`
        INSERT INTO users (id, email, password) VALUES
          (${new_uid}, ${req.body.email}, ${hash(req.body)});
        UPDATE people SET user_id = ${new_uid} WHERE oid = ${req.body.person_id}
      `);
      return;
    }
  );

  server.post(
    '/reset-pw',
    async (req, _reply) => {
      // todo: make this work
      transporter.sendMail({
        from: 'fakeauth@gunnalum.site',
        to: req.body.email,
        subject: 'WEBSITE NAME Password Reset',
        text: 'test email text.'
      }, (_err, info) => info.message.pipe(process.stdout));

      return Error('fixme');
    }
  );

  server.post(
    '/auth',
    async (req, _reply) => {
      if (!req.body || !req.body.email) {
        return Error('missing email in request body');
      }

      const passwords = db.query(sql`
        SELECT password FROM users WHERE email=${req.body.email}
      `);

      if (passwords.length !== 1
        || !crypto.timingSafeEqual(passwords[0].password, hash(req.body))) {
        return Error('incorrect password');
      }
      // fixme: make more secure
      return server.generateAuthToken({
        email: req.body.email,
        valid: 'yeah!'
      });
    }
  );
}
