const session = require('express-session');
const {
  sessionSecret,
  timezone,
} = require('../config');
const MemoryStore = require('memorystore')(session);
const FileStore = require('session-file-store')(session);
const RedisStore = require('connect-redis')(session);
const { createClient } = require('redis');
const MySQLStore = require('express-mysql-session')(session);
const Class = require('./class');
const config = require('../middleware/config');
const sessionStoreType = config.getSessionStoreType();
const cache = require('./cache');

class SessionControl extends Class {
  constructor (req, res, conn) {
    super (req, res, conn);
    if (sessionStoreType === 'memory') {
      this.sessionStore = new MemoryStore({
        checkPeriod: 1000 * 60 * 60 * 24 * 1,
      });
    } else if (sessionStoreType === 'file') {
      this.sessionStore = new FileStore();
    } else if (sessionStoreType === 'redis') {
      const redis = config.getRedis();
      const client = createClient({
        socket: {
          host: redis.host,
          port: redis.port,
        },
        password: redis.password,
        legacyMode: true,
      });
      
      client.connect().catch(e => {
        console.error(e);
      });
      
      client.on('error', err => {
        console.log('Error ' + err);
      });
      
      this.sessionStore = new RedisStore({
        client,
      });
    } else {
      const sql = config.getDatabase();
      const mysqlOptions = {
        host: sql.host,
        port: sql.port,
        user: sql.user,
        password: sql.password,
        database: sql.database,
      };
      this.sessionStore = new MySQLStore(mysqlOptions);
    }
  }
  getSessionStore () {
    return this.sessionStore;
  }
  getSessionIdByUserId (userId) {
    return new Promise(resolve => {
      let sessionIds = [];
      this.sessionStore.all((error, sessions) => {
        if (sessions) {
          Object.keys(sessions).forEach(sessionId => {
            if (sessions[sessionId].user?.id === Number(userId)) {
              sessionIds.push(sessionId);
            }
          });
          resolve(sessionIds);
        }
      });
    });
  }
  async updateUser (user) {
    return new Promise(async (resolve, reject) => {
      if (user) {
        const sessionIds = await this.getSessionIdByUserId(user.id);
        for await (let sessionId of sessionIds) {
          const session = await this.getSession(sessionId);
          if (session) {
            session.user = user;
            await this.setSession(sessionId, session);
          }
        }
        resolve(true);
      } else {
        reject('회원을 찾을 수 없습니다');
      }
    });
  }
  async getSession (sessionId) {
    return new Promise(resolve => {
      this.sessionStore.get(sessionId, async (err, session) => {
        if (session) {
          resolve(session);
        }
      });
    });
  }
  async setSession (key, session) {
    return new Promise(resolve => {
      this.sessionStore.set(key, session, () => {
        resolve(true);
      });
    });
  }
  async removeUser (userId) {
    const sessionId = await this.getSessionIdByUserId(userId);
    this.sessionStore.get(sessionId, (err, session) => {
      if (session) {
        this.sessionStore.destroy(sessionId);
      }
    });
  }
}

module.exports = SessionControl;