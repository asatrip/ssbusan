const pagination = require('../middleware/pagination');
const datetime = require('../middleware/datetime');
const Class = require('./class');
const cache = require('./cache');

class Alarm extends Class {
  async getAlarmsByPagination (data) {
    data = Object.assign({
      userId: null,
    }, data);
    const {
      userId,
    } = data;
    let queryString = '';
    const queryArray = [];
    if (userId) {
      queryString += `AND alarm.alarm_user_ID = ?\n`;
      queryArray.push(userId);
    }
    const pnQuery = `SELECT count(*) AS count
    FROM alarm
    LEFT JOIN user AS u
    ON alarm.alarm_relatedUser_ID = u.id
    WHERE alarm.status >= 1
    ${queryString}
    `;
    const [pnResult, ] = await this.conn.query(pnQuery, queryArray);
    const pn = pagination(pnResult, this.req.query, 'page', 10);
    const query = `SELECT alarm.*, u.nickName AS nickName, b.title AS boardTitle, b.slug AS boardSlug, a.id AS articleId, a.slug AS articleSlug, a.title AS articleTitle, c.content AS commentContent
    FROM alarm
    LEFT JOIN user AS u
    ON alarm.alarm_relatedUser_ID = u.id
    LEFT JOIN board AS b
    ON alarm.alarm_board_ID = b.id
    LEFT JOIN article AS a
    ON alarm.alarm_article_ID = a.id
    LEFT JOIN comment AS c
    ON alarm.alarm_comment_ID = c.id
    LEFT JOIN message AS m
    ON alarm.alarm_message_ID = m.id
    WHERE alarm.status >= 1
    ${queryString}
    ORDER BY alarm.createdAt DESC
    ${pn.queryLimit}`;
    const [alarms, ] = await this.conn.query(query, queryArray);
    alarms.forEach(alarm => alarm = this.setInfo(alarm));
    return {
      alarms,
      pn,
    };
  }
  async getAlarms (user) {
    if (user) {
      const query = `SELECT alarm.*, u.nickName AS nickName, b.title AS boardTitle, b.slug AS boardSlug, a.id AS articleId, a.slug AS articleSlug, a.title AS articleTitle, c.content AS commentContent
      FROM alarm
      LEFT JOIN user AS u
      ON alarm.alarm_relatedUser_ID = u.id
      LEFT JOIN board AS b
      ON alarm.alarm_board_ID = b.id
      LEFT JOIN article AS a
      ON alarm.alarm_article_ID = a.id
      LEFT JOIN comment AS c
      ON alarm.alarm_comment_ID = c.id
      LEFT JOIN message AS m
      ON alarm.alarm_message_ID = m.id
      WHERE alarm.alarm_user_ID = ?
      ORDER BY alarm.createdAt DESC`;
      const [alarms, ] = await this.conn.query(query, [
        user.id,
      ]);
      alarms.forEach(alarm => alarm = this.setInfo(alarm));
      return alarms;
    } else {
      throw new Error('입력값이 없습니다');
    }
  }
  async get (alarmId) {
    const query = `SELECT *
    FROM alarm
    WHERE id = ?`;
    const [alarms, ] = await this.conn.query(query, [
      alarmId,
    ]);
    if (alarms.length) {
      const alarm = alarms[0];
      return alarm;
    } else {
      return null;
    }
  }
  async create (data) {
    data = Object.assign({
      type: null,
      userId: null,
      relatedUserId: null,
      boardId: null,
      articleId: null,
      commentId: null,
      messageId: null,
    }, data);
    const {
      type,
      userId,
      relatedUserId,
      boardId,
      articleId,
      commentId,
      messageId,
    } = data;
    if (userId !== relatedUserId) {
      const query = `INSERT INTO alarm
      (type, alarm_user_ID, alarm_relatedUser_ID, alarm_board_ID, alarm_article_ID, alarm_comment_ID, alarm_message_ID)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
      await this.conn.query(query, [
        type,
        userId,
        relatedUserId,
        boardId,
        articleId,
        commentId,
        messageId,
      ]);
    }
  }
  setInfo (alarm) {
    alarm.datetime = datetime(alarm.createdAt);
    switch (alarm.type) {
      case 'newArticle':
        alarm.content = `${cache.lang.user_alarmNewArticleFirst}"${alarm.boardTitle}"${cache.lang.user_alarmNewArticleSecond}`;
        alarm.link = `/${alarm.boardSlug}`;
        break;
      case 'newComment':
        alarm.content = `${cache.lang.user_alarmNewCommentFirst}"${alarm.articleTitle}"${cache.lang.user_alarmNewCommentSecond}`;
        alarm.link = `/${alarm.boardSlug}/${alarm.articleSlug}`;
        break;
      case 'replyComment':
        alarm.content = `${cache.lang.user_alarmReplyCommentFirst}"${alarm.commentContent}"${cache.lang.user_alarmReplyCommentSecond}`;
        alarm.link = `/${alarm.boardSlug}/${alarm.articleSlug}`;
        break;
      case 'message':
        alarm.content = `${cache.lang.user_alarmMessageFirst}"${alarm.nickName}"${cache.lang.user_alarmMessageSecond}`;
        alarm.link = `/message`;
    }
    return alarm;
  }
}

module.exports = Alarm;