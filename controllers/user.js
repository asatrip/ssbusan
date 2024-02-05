const pool = require('../middleware/database');
const flash = require('../middleware/flash');
const doAsync = require('../middleware/doAsync');
const User = require('../services/user');
const Article = require('../services/article');
const Comment = require('../services/comment');
const Point = require('../services/point');
const Alarm = require('../services/alarm');
const Message = require('../services/message');
const UserBlockUser = require('../services/userBlockUser');
const cache = require('../services/cache');

// User Info
exports.userInfo = doAsync(async (req, res, next) => {
  const {
    nickName,
  } = req.params;
  res.redirect(`/user/${nickName}/articles`);
});

exports.userArticles = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      nickName,
    } = req.params;
    
    const userClass = new User(req, res, conn);
    const targetUser = await userClass.get({
      nickName,
    });
    if (targetUser) {
      const articleClass = new Article(req, res, conn);
      const { articles, pn } = await articleClass.getArticlesByPagination({
        userId: targetUser.id,
        anonymous: false,
      });
      res.render('user/articles', {
        pageTitle: `${targetUser.nickName}${cache.lang.user_targetsComments} - ${res.locals.setting.siteName}`,
        targetUser,
        articles,
        pn,
      });
    } else {
      next();
    }
  } finally {
    conn.release();
  }
});

exports.userArticles4 = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      nickName,
    } = req.params;
    const userClass = new User(req, res, conn);
    const targetUser = await userClass.get({
      nickName,
    });
    if (targetUser) {
      const articleClass = new Article(req, res, conn);
      const { articles, pn } = await articleClass.getArticlesByPagination({
        userId: targetUser.id,
        anonymous: false,
      });
      res.render('user/articles4', {
        pageTitle: `${targetUser.nickName}${cache.lang.user_targetsArticles } - ${res.locals.setting.siteName}`,
        targetUser,
        articles,
        pn,
      });
    } else {
      next();
    }
  } finally {
    conn.release();
  }
});


exports.userComments = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      nickName,
    } = req.params;
    const userClass = new User(req, res, conn);
    const targetUser = await userClass.get({
      nickName,
    });
    if (targetUser) {
      const commentClass = new Comment(req, res, conn);
      const { comments, pn } = await commentClass.getCommentsByPagination({
        userId: targetUser.id,
        anonymous: false,
      });
      res.render('user/comments', {
        pageTitle: `${targetUser.nickName}${cache.lang.user_targetsArticles} - ${res.locals.setting.siteName}`,
        targetUser,
        comments,
        pn,
      });
    } else {
      next();
    }
  } finally {
    conn.release();
  }
});

exports.mypage = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      method,
    } = req;
    const user = res.locals.user;
    if (method === 'GET') {
      res.render('user/mypage', {
        pageTitle: `${res.__('user_mypage')} - ${res.locals.setting.siteName}`,
        user,
        position: 'mypage',
      });
    } else if (method === 'POST') {
      const {
        nickName,
      } = req.body;
      const userClass = new User(req, res, conn);
      const data = {
        nickName,
      };
      try {
        await userClass.update(user.id, data);
        flash.create({
          status: true,
          message: `${cache.lang.user_userInfoChanged}`,
        });
      } catch (e) {
        flash.create({
          status: false,
          message: e.message,
        });
      }
      res.redirect(req.headers.referer);
    }
  } finally {
    conn.release();
  }
});

exports.changePassword = doAsync(async (req, res, next) => {
  const {
    method
  } = req;
  if (method === 'GET') {
    res.render('user/changePassword', {
      pageTitle: `${cache.lang.user_myArticles} - ${res.locals.setting.siteName}`,
      position: 'changePassword',
    });
  } else if (method === 'POST') {
    const conn = await pool.getConnection();
    try {
      const {
        oldPassword,
        password,
        passwordCheck,
      } = req.body;
      const user = res.locals.user;
      const userClass = new User(req, res, conn);
      if (password === passwordCheck) {
        const result = await userClass.passwordCheck(user, oldPassword);
        if (result) {
          const data = {
            password,
          };
          await userClass.update(user.id, data);
          flash.create({
            status: true,
            message: `${cache.lang.user_userInfoChanged}`,
          });
        } else {
          flash.create({
            status: false,
            message: `${cache.lang.user_existingPasswordIsDifferent}`,
          });
        }
      } else {
        flash.create({
          status: false,
          message: `${cache.lang.user_inputPasswordIsDifferent}`,
        });
      }
      res.redirect(req.headers.referer);
    } finally {
      conn.release();
    }
  }
});

exports.myArticles = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const articleClass = new Article(req, res, conn);
    const data = {
      userId: user.id,
    };
    const { articles, pn } = await articleClass.getArticlesByPagination(data);
    res.render('user/myArticles', {
      pageTitle: `${cache.lang.user_myArticles} - ${res.locals.setting.siteName}`,
      position: 'article',
      articles,
      pn,
    });
  } finally {
    conn.release();
  }
});

exports.myComments = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const commentClass = new Comment(req, res, conn);
    const data = {
      userId: user.id,
    };
    const { comments, pn } = await commentClass.getCommentsByPagination(data);
    res.render('user/myComments', {
      pageTitle: `${cache.lang.user_myComments} - ${res.locals.setting.siteName}`,
      position: 'comment',
      comments,
      pn,
    });
  } finally {
    conn.release();
  }
});


exports.myPoints = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const pointClass = new Point(req, res, conn);
    const data = {
      userId: user.id,
    };
    const { points, pn } = await pointClass.getPointsByPagination(data);
    res.render('user/myPoints', {
      pageTitle: `${cache.lang.user_pointHistory} - ${res.locals.setting.siteName}`,
      position: 'point',
      points,
      pn,
    });
  } finally {
    conn.release();
  }
});

exports.articleLike = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const articleClass = new Article(req, res, conn);
    const data = {
      userId: user.id,
    };
    const { articles, pn } = await articleClass.getLikes(data);
    res.render('user/articleLike', {
      pageTitle: `${cache.lang.user_likeArticles} - ${res.locals.setting.siteName}`,
      position: 'articleLike',
      articles,
      pn,
    });
  } finally {
    conn.release();
  }
});

exports.articleUnlike = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const articleClass = new Article(req, res, conn);
    const data = {
      userId: user.id,
    };
    const { articles, pn } = await articleClass.getUnlikes(data);
    res.render('user/articleunlike', {
      pageTitle: `${cache.lang.user_likeArticles} - ${res.locals.setting.siteName}`,
      position: 'articleUnlike',
      articles,
      pn,
    });
  } finally {
    conn.release();
  }
});

exports.commentLike = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const commentClass = new Comment(req, res, conn);
    const data = {
      userId: user.id,
    };
    const { comments, pn } = await commentClass.getLikes(data);
    res.render('user/commentLike', {
      pageTitle: `${cache.lang.user_likeComments} - ${res.locals.setting.siteName}`,
      position: 'commentLike',
      comments,
      pn,
    });
  } finally {
    conn.release();
  }
});

exports.block = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      method,
    } = req;
    const user = res.locals.user;
    const userBlockUserClass = new UserBlockUser(req, res, conn);
    if (method === 'GET') {
      const { users, pn } = await userBlockUserClass.getUsersByPagination(user.id);
      res.render('user/block', {
        pageTitle: `${cache.lang.user_blockUsers} - ${res.locals.setting.siteName}`,
        position: 'block',
        users,
        pn,
      });
    } else if (method === 'POST') {
      const {
        targetUserId,
      } = req.body;
      const userBlockUserClass = new UserBlockUser(req, res, conn);
      const data = {
        userId: user.id,
        targetUserId,
      };
      userBlockUserClass.remove(data);
      res.redirect(req.headers.referer);
    }
  } finally {
    conn.release();
  }
});

exports.withdraw = doAsync(async (req, res, next) => {
  const setting = res.locals.setting;
  if (setting.useWithdraw) {
    const conn = await pool.getConnection();
    try {
      if (setting.withdrawType === 1) {
        const user = res.locals.user;
        const userclass = new User(req, res, conn);
        const data = {
          status: 0,
        };
        await userclass.update(user.id, data);
        req.session.destroy(() => {
          res.redirect('/');
        });
      } else if (setting.withdrawType === 2) {
        const user = res.locals.user;
        const userclass = new User(req, res, conn);
        await userclass.remove(user.id);
        req.session.destroy(() => {
          res.redirect('/');
        });
      }
    } finally {
      conn.release();
    }
  } else {
    next();
  }
});

exports.alarm = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const alarmClass = new Alarm(req, res, conn);
    const data = {
      userId: user.id,
    };
    const { alarms, pn } = await alarmClass.getAlarmsByPagination(data);
    const query = `UPDATE alarm
    SET status = 2
    WHERE alarm_user_ID = ?`;
    await conn.query(query, [
      user.id,
    ]);
    res.render('user/alarm', {
      pageTitle: `${res.__('user_alarm')} - ${res.locals.setting.siteName}`,
      alarms,
      pn,
    });
  } finally {
    conn.release();
  }
});

exports.message = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const messageClass = new Message(req, res, conn);
    const data = {
      userId: user.id,
    };
    const { messages, pn } = await messageClass.getMessagesByPagination(data);
    const query = `UPDATE message
    SET status = 2
    WHERE message_recipient_ID = ? AND status = 1`;
    await conn.query(query, [
      user.id,
    ]);
    res.render('user/message', {
      pageTitle: `${res.__('user_message')} - ${res.locals.setting.siteName}`,
      messages,
      pn,
    });
  } finally {
    conn.release();
  }
});

exports.messageNew = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const setting = res.locals.setting;
    if (setting.useMessage) {
      const {
        method,
      } = req;
      if (method === 'GET') {
        const {
          nickName,
        } = req.params;
        res.render('user/messageNew', {
          pageTitle: `${res.__('user_messageSend')} - ${res.locals.setting.siteName}`,
          nickName,
        });
      } else if (method === 'POST') {
        const user = res.locals.user;
        const {
          nickName,
          content,
        } = req.body;
        const [targetUsers, ] = await conn.query(`SELECT * FROM user WHERE nickName = ?`, [
          nickName,
        ]);
        if (targetUsers.length) {
          const targetUser = targetUsers[0];
          const [result, ] = await conn.query(`INSERT INTO message (message_sender_ID, message_recipient_ID, content) VALUES (?, ?, ?)`, [user.id, targetUser.id, content]);
          if (result.insertId) {
            await conn.query(`INSERT INTO alarm (type, alarm_user_ID, alarm_relatedUser_ID, alarm_message_ID) VALUES (?, ?, ?, ?)`, ['message', targetUser.id, user.id, result.insertId]);
            flash.create({
              status: true,
              message: `${cache.lang.user_messageSendSuccessed}`,
            });
          } else {
            flash.create({
              status: false,
              message: `${cache.lang.user_messageSendFailed}`,
            });
          }
        } else {
          flash.create({
            status: false,
            message: `${cache.lang.user_nickNameNotExist}`,
          });
        }
        res.redirect(req.headers.referer);
      } else {
        next();
      }
    } else {
      next();
    }
  } finally {
    conn.release();
  }
});

exports.messageEdit = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      messageId,
    } = req.params;
    const user = res.locals.user;
    const messageClass = new Message(req, res, conn);
    await messageClass.update(messageId, {
      userId: user.id,
      status: 0,
    });
    res.redirect(req.headers.referer);
  } finally {
    conn.release();
  }
});

exports.pointWithdraw = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      method,
    } = req;
    if (method === 'GET') {
      if (res.locals.user) {
        res.render('user/pointWithdraw', {
          pageTitle: `${cache.lang.user_pointWithdraw} - ${res.locals.setting.siteName}`,
          position: 'pointWithdraw',
        });
      } else {
        flash.create({
          status: false,
          message: `${cache.lang.dontHavePermission}`,
        });
        res.redirect('/login');
      }
    } else if (method === 'POST') {
      const {
        userId,
      } = req.params;
      const {
        type,
        comment,
      } = req.body;
      const point = Number(req.body.point) || 0;
      // 포인트 조회
      const [users, ] = await conn.query(`SELECT * FROM user WHERE id = ?`, [
        userId,
      ]);
      if (users.length) {
        const user = users[0];
        // 포인트 지급
        if (user.point >= point && point !== 0) {
          const pointWithdrawLimit = res.locals.setting.pointWithdrawLimit;
          if (point >= pointWithdrawLimit || pointWithdrawLimit === 0) {
            const [result, ] = await conn.query(`UPDATE user SET point = point - ? WHERE id = ?`, [
              point,
              userId,
            ]);
            // 포인트 지급 내역 등록
            const query = `INSERT INTO pointWithdraw
            (pointWithdraw_user_ID, type, point, comment)
            VALUES (?, ?, ?, ?)`;
            await conn.query(query, [
              user.id,
              type,
              point,
              comment,
            ]);
            const insertQuery = `INSERT INTO point
            (point_user_ID, type, point)
            VALUES (?, ?, ?)`;
            await conn.query(insertQuery, [
              user.id,
              'withdraw',
              point * -1,
            ]);
            flash.create({
              status: true,
              message: `${cache.lang.user_pointWithdrawComplete}`,
            });
          } else {
            flash.create({
              status: false,
              message: `${cache.lang.user_minimumWithdrawalInsufficient}`,
            });
          }
        } else {
          flash.create({
            status: false,
            message: `${cache.lang.user_notEnoughPoint}`,
          });
        }
      }
      res.redirect('/mypage/pointWithdraw');
    } else {
      next();
    }
  } finally {
    conn.release();
  }
});