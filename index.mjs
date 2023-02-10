/*
Register a user:
    curl -i 'http://127.0.0.1:3000/register' -H 'content-type: application/json' --data '{"user": "myuser","password":"mypass"}'
The application then inserts user in the leveldb
Check it's all working
    curl 'http://127.0.0.1:3000/auth' -H 'content-type: application/json' --data '{"user": "myuser","password":"mypass"}'
 */

// https://www.npmjs.com/package/@databases/sqlite
// https://www.npmjs.com/package/@databases/sqlite-sync

'use strict';

import Fastify from 'fastify';
import LevelDB from '@fastify/leveldb';
import Auth from '@fastify/auth';

const fastify = Fastify({ logger: true });

fastify.register(LevelDB, { name: 'authdb' });
fastify.register(Auth);
fastify.after(routes);

function verifyUserAndPassword(request, _reply, done) {
  if (!request.body || !request.body.user) {
    done(new Error('Missing user in request body'));
    return;
  }

  this.level.authdb.get(
    request.body.user,
    (err, password) => {
      if (err) {
        if (err.notFound) {
          done(new Error('Password not valid'));
        } else {
          done(err);
        }
        return;
      }

      if (!password || password !== request.body.password) {
        done(new Error('Password not valid'));
        return;
      }

      done();
    }
  )
}

function routes() {
  fastify.route({
    method: 'POST',
    url: '/register',
    schema: {
      body: {
        type: 'object',
        properties: {
          user: { type: 'string' },
          password: { type: 'string' }
        },
        required: ['user', 'password']
      }
    },
    handler: (req, reply) => {
      req.log.info('Creating new user');
      fastify.level.authdb.put(req.body.user, req.body.password, err => reply.send(err));
    }
  })

  fastify.route({
    method: 'POST',
    url: '/auth',
    preHandler: fastify.auth([verifyUserAndPassword]),
    handler: (req, reply) => {
      req.log.info('Auth route');
      reply.send({ hello: 'world' });
    }
  })
}

fastify.listen({ port: 3000 }, err => {
  if (err) {
    throw err;
  }
})
