const configJson = require('../config.json');

class Config {
  constructor () {
    this.storageType = configJson.storageType;
    this.storage = configJson.storage;
    this.lang = configJson.language;
    this.firebase = configJson.firebase;
    this.sessionStoreType = configJson.sessionStore;
    this.plugins = configJson.plugins;
    if (process.env.NODE_ENV === 'development') {
      this.sql = configJson.sql?.development;
      this.storage = configJson.storage?.development;
      this.redis = configJson.redis?.development;
    } else {
      this.sql = configJson.sql.production;
      this.storage = configJson.storage?.production;
      this.redis = configJson.redis?.production;
    }
  }
  getSessionStoreType () {
    return this.sessionStoreType;
  }
  getStorageHost () {
    if (this.storageType === 'local') {
      return `/storage`;
    } else {
      return this.storage.host;
    }
  }
  getStorage () {
    return this.storage;
  }
  getDatabase () {
    return this.sql;
  }
  getRedis () {
    return this.redis;
  }
  getLang () {
    return this.lang;
  }
  getFirebase () {
    return this.firebase;
  }
  getPlugins () {
    return this.plugins;
  }
}

const config = new Config();

module.exports = config;