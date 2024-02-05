const pool = require("../middleware/database");
const axios = require("axios");
const moment = require("moment");
const cheerio = require("cheerio");
const hashCreate = require("../middleware/hash");
const imageUpload = require("../middleware/imageUpload");
const doAsync = require("../middleware/doAsync");
const config = require("../middleware/config");
const User = require("../services/user");
const UserBlockUser = require("../services/userBlockUser");
const Board = require("../services/board");
const Article = require("../services/article");
const Comment = require("../services/comment");
const Image = require("../services/image");
const Point = require("../services/point");
const Alarm = require("../services/alarm");
const Report = require("../services/report");
const UserGroupBoard = require("../services/userGroupBoard");
const Phone = require("../services/phone");
const checkBlockWordsFunc = require("../middleware/blockWords");
const cache = require("../services/cache");

/* AWS S3 */
const AWS = require("aws-sdk");
const flash = require("../middleware/flash");
const s3Info = config.getStorage();
const storage = config.getStorageHost();

const { accessKeyId, secretAccessKey, region, bucket, host, endpoint } = s3Info;

const spacesEndpoint = new AWS.Endpoint(endpoint);
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId,
  secretAccessKey,
  region,
  bucket,
});

exports.getStatus = doAsync(async (req, res, next) => {
  res.send(cache);
});

exports.blockChat = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { userId, type } = req.body;
    const user = res.locals.user;
    const userClass = new User(req, res, conn);
    const blockUser = await userClass.get({
      id: userId,
    });
    if (user?.isChatManager || user?.isAdmin) {
      if (type === "block") {
        cache.blockChats.push({
          hash: hashCreate(6),
          userId: userId,
          timeout: moment(new Date()).add(30, "m"),
        });
        res.send({
          status: true,
          message: `${blockUser.nickName}님이 30분 채팅금지 되었습니다`,
        });
      } else if (type === "unblock") {
        cache.blockChats.forEach((item, index, object) => {
          if (Number(item.userId) === Number(userId)) {
            object.splice(index, 1);
          }
        });
        await conn.query(`UPDATE user SET blockChat=? WHERE id=?`, [0, userId]);
        res.send({
          status: true,
          message: `${blockUser.nickName}님이 채팅금지 해제되었습니다`,
        });
      } else if (type === "blockForever") {
        await conn.query(`UPDATE user SET blockChat=? WHERE id=?`, [1, userId]);
        res.send({
          status: true,
          message: `${blockUser.nickName}님이 채팅 영구 차단 되었습니다`,
        });
      }
    } else {
      res.send({
        status: false,
        message: `${cache.lang.dontHavePermission}`,
      });
    }
  } finally {
    conn.release();
  }
});

exports.getChat = doAsync(async (req, res, next) => {
  const oldChat = cache.chats;
  res.send(oldChat);
});

exports.makeChatRoom = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { myId, targetId } = req.body;
    if (myId !== targetId) {
      const [chatList] = await conn.query(
        `SELECT * FROM chatRoom WHERE chatRoom_user_ID = ? AND chatRoom_targetUser_ID = ?`,
        [myId, targetId]
      );
      if (chatList.length) {
        res.send({
          status: true,
          hash: chatList[0].hash,
        });
      } else {
        const hash = hashCreate(8);
        await conn.query(
          `INSERT INTO chatRoom (chatRoom_user_ID, chatRoom_targetUser_ID, hash) VALUES (?, ?, ?)`,
          [myId, targetId, hash]
        );
        await conn.query(
          `INSERT INTO chatRoom (chatRoom_user_ID, chatRoom_targetUser_ID, hash) VALUES (?, ?, ?)`,
          [targetId, myId, hash]
        );
        res.send({
          status: true,
          hash,
        });
      }
    } else {
      res.status(404).send({
        status: false,
        message: "error",
      });
    }
  } finally {
    conn.release();
  }
});

exports.usePermissionImage = doAsync(async (req, res, next) => {
  let usePermissionImage = null;
  if (res.locals.setting.usePermissionImage) {
    usePermissionImage = true;
  } else {
    usePermissionImage = false;
  }
  res.status(200).send(usePermissionImage);
});

exports.imageNew = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { articleId } = req.body;
    const { files } = req;
    const imageClass = new Image(req, res, conn);
    const images = imageClass.align(files.images);
    for await (let image of images) {
      const data = {
        articleId,
        image,
      };
      await imageClass.create(data);
    }
    const newImages = await imageClass.getImages(articleId);
    res.send(newImages);
  } finally {
    conn.release();
  }
});

exports.imageDelete = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { articleId, imageId } = req.body;
    const imageClass = new Image(req, res, conn);
    await imageClass.remove(imageId);
    const newImages = await imageClass.getImages(articleId);
    res.send(newImages);
  } finally {
    conn.release();
  }
});

// CKEditor5
exports.imageUpload = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { articleId } = req.body;
    const image = req.files.image[0];
    const key = await imageUpload({
      image,
      folder: `article`,
      // quality: 60,
    });
    imageUpload({
      image,
      folder: `thumb`,
      fileName: key,
      size: 640,
      // quality: 60,
    });
    const url = `${storage}/article/${key}`;
    const articleClass = new Article(req, res, conn);
    try {
      await articleClass.addImage(
        {
          id: articleId,
        },
        key
      );
    } catch (e) {
      console.error(e);
    }
    res.send({
      url,
    });
  } finally {
    conn.release();
  }
});

exports.userImage = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const { files } = req;
    const image = files.image[0];
    if (image) {
      const key = await imageUpload({
        image,
        folder: "userImage",
      });
      const userClass = new User(req, res, conn);
      await userClass.update(user.id, {
        image: key,
      });
      const oldKey = user.image;
      if (oldKey) {
        // Delete Old Key
        const thumbParams = {
          Bucket: bucket,
          Key: `user/${oldKey}`,
        };
        s3.deleteObject(thumbParams, (err, data) => {
          if (err) {
            console.error(err);
          }
        });
      }
      console.log(key);
      res.send({
        status: true,
        key,
      });
    } else {
      res.send({
        status: false,
      });
    }
  } finally {
    conn.release();
  }
});

exports.blockUser = doAsync(async (req, res, next) => {
  const { targetUserId } = req.body;
  const user = res.locals.user;
  if (user && targetUserId) {
    if (user.id !== Number(targetUserId)) {
      const conn = await pool.getConnection();
      try {
        const userBlockUserClass = new UserBlockUser(req, res, conn);
        try {
          const data = {
            userId: user.id,
            targetUserId,
          };
          await userBlockUserClass.create(data);
          res.send({
            status: true,
            message: `해당유저를 차단하였습니다`,
          });
        } catch (e) {
          res.send({
            status: false,
            message: e.message,
          });
        }
      } finally {
        conn.release();
      }
    } else {
      res.send({
        status: false,
        message: `자기자신을 차단할 수 없습니다`,
      });
    }
  }
});

exports.unblockUser = doAsync(async (req, res, next) => {
  const { targetUserId } = req.body;
  const user = res.locals.user;
  if (user && targetUserId) {
    const conn = await pool.getConnection();
    try {
      const userBlockUserClass = new UserBlockUser(req, res, conn);
      try {
        const data = {
          userId: user.id,
          targetUserId,
        };
        await userBlockUserClass.remove(data);
        res.send({
          status: true,
          message: `해당유저를 차단해제하였습니다`,
        });
      } catch (e) {
        res.send({
          status: false,
          message: e.message,
        });
      }
    } finally {
      conn.release();
    }
  }
});

exports.adminBlock = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { targetUserId } = req.body;
    const user = res.locals.user;
    if (user.id !== Number(targetUserId)) {
      if (user?.isManager || user?.isAdmin) {
        const userClass = new User(req, res, conn);
        const data = {
          permission: 0,
        };
        try {
          await userClass.update(targetUserId, data);
          res.send({
            status: true,
            message: `해당유저를 영구 차단하였습니다`,
          });
        } catch (e) {
          res.send({
            status: false,
            message: e.message,
          });
        }
      } else {
        res.send({
          status: false,
          message: `${cache.lang.dontHavePermission}`,
        });
      }
    } else {
      res.send({
        status: false,
        message: `자기자신을 차단할 수 없습니다`,
      });
    }
  } finally {
    conn.release();
  }
});

exports.emailCheck = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { email } = req.body;
    const emailRegex =
      /(?:[a-z0-9!#$%&'*+/ = ?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/ = ?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/gi;
    if (email.match(emailRegex)) {
      const [result] = await conn.query(`SELECT * FROM user WHERE email = ?`, [
        email,
      ]);
      if (result.length) {
        res.send({
          status: false,
          message: "중복된 이메일 입니다",
        });
      } else {
        res.send({
          status: true,
          message: "생성가능한 이메일 입니다",
        });
      }
    } else {
      res.send({
        status: false,
        message: "올바른 이메일 형식을 입력해주세요",
      });
    }
  } finally {
    conn.release();
  }
});

exports.nickNameCheck = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { nickName } = req.body;
    const [result] = await conn.query(`SELECT * FROM user WHERE nickName = ?`, [
      nickName,
    ]);
    if (result.length) {
      res.send(false);
    } else {
      res.send(true);
    }
  } finally {
    conn.release();
  }
});

exports.phoneVerify = doAsync(async (req, res, next) => {
  const phoneNumberRaw = req.body.phoneNumber;
  const phoneNumber = phoneNumberRaw.replace(/-/gi, "");
  const verifyNumber = Math.random().toString().slice(3, 7);
  const phoneClass = new Phone(req, res, conn);
  await phoneClass.create(
    phoneNumber,
    `[${res.locals.setting.siteName}] 인증번호는 ${verifyNumber} 입니다`
  );
  req.session.verifyNumber = verifyNumber;
  req.session.save();
});

exports.phoneVerifyComplete = doAsync(async (req, res, next) => {
  const { verifyNumber } = req.body;
  if (verifyNumber === req.session.verifyNumber) {
    res.send(true);
  } else {
    res.send(false);
  }
});

exports.report = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { reportType, reportId, content } = req.body;
    const data = {
      reportType,
      reportId,
      content,
    };
    const reportClass = new Report(req, res, conn);
    const result = await reportClass.create(data);
    res.send(result);
  } finally {
    conn.release();
  }
});

exports.articleLike = doAsync(async (req, res, next) => {
  const { articleId } = req.body;
  const user = res.locals.user;
  if (user) {
    const conn = await pool.getConnection();
    try {
      const articleClass = new Article(req, res, conn);
      const article = await articleClass.get({
        id: articleId,
      });
      const pointClass = new Point(req, res, conn);
      const userClass = new User(req, res, conn);
      const author = await userClass.get({
        id: article.article_user_ID,
      });
      if (user.id !== article.article_user_ID) {
        const [result] = await conn.query(
          `SELECT * FROM userArticleLike WHERE userArticleLike_user_ID = ? AND userArticleLike_article_ID = ?`,
          [res.locals.user.id, articleId]
        );
        if (!result.length) {
          // 추천 내역이 없을 경우 (count + 1)
          const insertQuery = `INSERT INTO userArticleLike
          (userArticleLike_user_ID, userArticleLike_article_ID)
          VALUES (?, ?)`;
          await conn.query(insertQuery, [user.id, articleId]);
          await conn.query(`UPDATE article SET likeCount = ? WHERE id = ?`, [
            article.likeCount + 1,
            articleId,
          ]);
          await pointClass.create({
            user: author,
            type: "authorLike",
            point: res.locals.setting.authorLikePoint,
          });
          await pointClass.create({
            user,
            type: "userLike",
            point: res.locals.setting.userLikePoint,
          });
        } else {
          // 추천 내역이 있을 경우 (count - 1)
          const deleteQuery = `DELETE FROM userArticleLike
          WHERE userArticleLike_user_ID = ? AND userArticleLike_article_ID = ?`;
          await conn.query(deleteQuery, [res.locals.user.id, articleId]);
          await conn.query(`UPDATE article SET likeCount = ? WHERE id = ?`, [
            article.likeCount - 1,
            articleId,
          ]);
          pointClass.remove({
            user: author,
            type: "authorLike",
            point: res.locals.setting.authorLikePoint,
          });
          pointClass.remove({
            user,
            type: "userLike",
            point: res.locals.setting.userLikePoint,
          });
        }
        res.send({
          status: true,
        });
      } else {
        res.send({
          status: false,
          message: `${cache.lang.board_cantLikeOwnArticle}`,
        });
      }
    } finally {
      conn.release();
    }
  } else {
    res.send({
      status: false,
      message: `${cache.lang.needLogin}`,
    });
  }
});

exports.articleUnlike = doAsync(async (req, res, next) => {
  const { articleId } = req.body;
  const user = res.locals.user;
  if (user) {
    const conn = await pool.getConnection();
    try {
      const articleClass = new Article(req, res, conn);
      const article = await articleClass.get({
        id: articleId,
      });
      const pointClass = new Point(req, res, conn);
      const userClass = new User(req, res, conn);
      const author = await userClass.get({
        id: article.article_user_ID,
      });
      if (user.id !== article.article_user_ID) {
        const [result] = await conn.query(
          `SELECT * FROM userArticleUnlike WHERE userArticleUnlike_user_ID = ? AND userArticleUnlike_article_ID = ?`,
          [res.locals.user.id, articleId]
        );
        if (!result.length) {
          // 비추천 내역이 없을 경우 (count + 1)
          const insertQuery = `INSERT INTO userArticleUnlike
          (userArticleUnlike_user_ID, userArticleUnlike_article_ID)
          VALUES (?, ?)`;
          await conn.query(insertQuery, [user.id, articleId]);
          await conn.query(`UPDATE article SET unlikeCount = ? WHERE id = ?`, [
            article.unlikeCount + 1,
            articleId,
          ]);
          await pointClass.create({
            user: author,
            type: "authorUnlike",
            point: res.locals.setting.authorUnlikePoint,
          });
          await pointClass.create({
            user,
            type: "userUnlike",
            point: res.locals.setting.userUnlikePoint,
          });
        } else {
          // 추천 내역이 있을 경우 (count - 1)
          const deleteQuery = `DELETE FROM userArticleUnlike
          WHERE userArticleUnlike_user_ID = ? AND userArticleUnlike_article_ID = ?`;
          await conn.query(deleteQuery, [res.locals.user.id, articleId]);
          await conn.query(`UPDATE article SET unlikeCount= ? WHERE id = ?`, [
            article.unlikeCount - 1,
            articleId,
          ]);
          pointClass.remove({
            user: author,
            type: "authorUnlike",
            point: res.locals.setting.authorUnlikePoint,
          });
          pointClass.remove({
            user,
            type: "userUnlike",
            point: res.locals.setting.userUnlikePoint,
          });
        }
        res.send({
          status: true,
        });
      } else {
        res.send({
          status: false,
          message: `${cache.lang.board_cantUnlikeOwnArticle}`,
        });
      }
    } finally {
      conn.release();
    }
  } else {
    res.send({
      status: false,
      message: `${cache.lang.needLogin}`,
    });
  }
});

exports.getComments = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { articleId, boardId } = req.body;
    const user = res.locals.user;
    const boards = res.locals.boards;
    const board = boards.find((board) => board.id === Number(boardId));
    const commentsClass = new Comment(req, res, conn);
    const comments = await commentsClass.getComments(articleId, board);
    // Block Users
    const userBlockUserClass = new UserBlockUser(req, res, conn);
    const blockUsers = await userBlockUserClass.getUsers(user?.id);
    comments.forEach((comment) => {
      const match = blockUsers.find(
        (blockUser) =>
          blockUser.userBlockUser_targetUser_ID === comment.comment_user_ID
      );
      if (match) {
        comment.block = true;
        comment.content = `${cache.lang.board_blockUsersComment}`;
      }
      comment.replies.forEach((reply) => {
        const replyMatch = blockUsers.find(
          (blockUser) =>
            blockUser.userBlockUser_targetUser_ID === reply.comment_user_ID
        );
        if (replyMatch) {
          reply.block = true;
          reply.content = `${cache.lang.board_blockUsersComment}`;
        }
      });
    });

    if (comments) {
      res.send({
        message: `${cache.lang.board_importCommentsSuccessfully}`,
        comments,
      });
    } else {
      res.status(401).send({
        message: `${cache.lang.board_importCommentsFailed}`,
      });
    }
  } finally {
    conn.release();
  }
});

exports.newComment = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { articleId, content, nickName, password } = req.body;
    const data = {
      content,
      nickName,
      password,
    };
    const commentClass = new Comment(req, res, conn);
    const articleClass = new Article(req, res, conn);
    const article = await articleClass.get({
      id: articleId,
    });
    const userGroupBoardClass = new UserGroupBoard(req, res, conn);
    const userGroupCommentPermission = await userGroupBoardClass.check(
      article.article_board_ID,
      "commentPermission"
    );
    if (userGroupCommentPermission) {
      const result = await commentClass.create(articleId, data);
      if (result) {
        res.send({
          message: `${cache.lang.board_commentRegistrationSuccessful}`,
        });
      } else {
        res.status(401).send({
          message: `${cache.lang.board_commentRegistrationFailed}`,
        });
      }
    } else {
      res.status(401).send({
        message: `${cache.lang.dontHavePermission}`,
      });
    }
  } finally {
    conn.release();
  }
});

exports.replyComment = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { commentParentId, content, nickName, password } = req.body;
    const data = {
      content,
      nickName,
      password,
    };
    const commentClass = new Comment(req, res, conn);
    const comment = await commentClass.get(commentParentId);
    const articleClass = new Article(req, res, conn);
    const article = await articleClass.get({
      id: comment.comment_article_ID,
    });
    const userGroupBoardClass = new UserGroupBoard(req, res, conn);
    const userGroupCommentPermission = await userGroupBoardClass.check(
      article.article_board_ID,
      "commentPermission"
    );
    if (userGroupCommentPermission) {
      const result = await commentClass.reply(commentParentId, data);
      res.send(result);
    } else {
      res.send(false);
    }
  } finally {
    conn.release();
  }
});

exports.editComment = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { commentId, content, nickName, password } = req.body;
    const data = {
      content,
      nickName,
      password,
    };
    const commentClass = new Comment(req, res, conn);
    try {
      await commentClass.update(commentId, data);
      res.send({
        status: true,
      });
    } catch (e) {
      res.send({
        status: false,
        message: e.message,
      });
    }
  } finally {
    conn.release();
  }
});

exports.deleteComment = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const user = res.locals.user;
    const { commentId, password } = req.body;
    const commentClass = new Comment(req, res, conn);
    const comment = await commentClass.get(commentId);
    const articleClass = new Article(req, res, conn);
    const article = await articleClass.get({
      id: comment.comment_article_ID,
    });
    const board = cache.boards.find(
      (board) => board.id === article.article_board_ID
    );
    if (
      board.commentPermission ||
      (board.writePermission === 0 && password) ||
      user?.isAdmin ||
      comment.comment_user_ID === user?.id
    ) {
      const data = {
        password,
      };
      try {
        await commentClass.remove(commentId, data);
        res.send({
          status: true,
        });
      } catch (e) {
        res.send({
          status: false,
          message: e.message,
        });
      }
    } else {
      res.send({
        status: false,
        message: `${cache.lang.board_needPassword}`,
      });
    }
  } finally {
    conn.release();
  }
});

exports.likeComment = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { commentId } = req.body;
    const commentClass = new Comment(req, res, conn);
    try {
      await commentClass.like(commentId);
      res.send({
        status: true,
      });
    } catch (e) {
      res.send({
        status: false,
        message: e.message,
      });
    }
  } finally {
    conn.release();
  }
});

exports.unlikeComment = doAsync(async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { commentId } = req.body;
    const commentClass = new Comment(req, res, conn);
    try {
      await commentClass.unlike(commentId);
      res.send({
        status: true,
      });
    } catch (e) {
      res.send({
        status: false,
        message: e.message,
      });
    }
    res.send(result);
  } finally {
    conn.release();
  }
});

exports.articleCreate = doAsync(async (req, res, next) => {
  const { title, content, images } = req.body;
  if (title && content) {
    const conn = await pool.getConnection();
    try {
    } finally {
      conn.release();
    }
  } else {
    next();
  }
});
