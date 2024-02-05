const pagination = require('../middleware/pagination');
const datetime = require('../middleware/datetime');
const Class = require('./class');

class UserBlockUser extends Class {
  async getUsersByPagination (userId) {
    const queryArray = [];
    queryArray.push(userId);
    const pnQuery = `SELECT count(*) AS count
    FROM userBlockUser
    WHERE userBlockUser_user_ID = ?`;
    const [pnResult, ] = await this.conn.query(pnQuery, queryArray);
    const pn = pagination(pnResult, this.req.query, 'page', 10);
    const query = `SELECT ubu.*, u.id AS targetUserId, u.uId, u.nickName
    FROM userBlockUser AS ubu
    LEFT JOIN user AS u
    ON ubu.userBlockUser_targetUser_ID = u.id
    WHERE ubu.userBlockUser_user_ID = ?`;
    const [users, ] = await this.conn.query(query, queryArray);
    return {
      users,
      pn,
    };
  }
  async getUsers (userId) {
    const query = `SELECT *
    FROM userBlockUser
    WHERE userBlockUser_user_ID = ?`;
    const [users, ] = await this.conn.query(query, [
      userId,
    ]);
    return users;
  }
  async get (data) {
    data = Object.assign({
      userId: null,
      targetUserId: null,
    }, data);
    const {
      userId,
      targetUserId,
    } = data;
    const query = `SELECT *
    FROM userBlockUser
    WHERE userBlockUser_user_ID = ? AND userBlockUser_targetUser_ID = ?`;
    const [histories, ] = await this.conn.query(query, [
      userId,
      targetUserId,
    ]);
    if (histories.length) {
      const history = histories[0];
      return history;
    } else {
      return null;
    }
  }
  async create (data) {
    data = Object.assign({
      userId: null,
      targetUserId: null,
    }, data);
    const {
      userId,
      targetUserId,
    } = data;
    const history = await this.get({
      userId,
      targetUserId,
    });
    if (!history) {
      const query = `INSERT INTO userBlockUser
      (userBlockUser_user_ID, userBlockUser_targetUser_ID)
      VALUES (?, ?)`;
      await this.conn.query(query, [
        userId,
        targetUserId,
      ]);
      return true;
    } else {
      throw new Error('이미 차단된 아이디 입니다');
    }
  }
  async update () {

  }
  async remove (data) {
    data = Object.assign({
      userId: null,
      targetUserId: null,
    }, data);
    const {
      userId,
      targetUserId,
    } = data;
    const query = `DELETE FROM userBlockUser
    WHERE userBlockUser_user_ID = ? AND userBlockUser_targetUser_ID = ?`;
    await this.conn.query(query, [
      userId,
      targetUserId,
    ]);
    return true;
  }
}

module.exports = UserBlockUser;