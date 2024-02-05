const bcrypt = require("bcrypt");
const pool = require("../middleware/database");
const pagination = require("../middleware/pagination");
const datetime = require("../middleware/datetime");
const hashCreate = require("../middleware/hash");
const engine = require("../middleware/engine");
const fileUpload = require("../middleware/fileUpload");
const match = require("../middleware/match");
const Class = require("./class");
const User = require("./user");
const Alarm = require("./alarm");
const Point = require("./point");
const Tag = require("./tag");
const config = require("../middleware/config");
const cache = require("./cache");

const SALT_COUNT = 10;

const AWS = require("aws-sdk");
const { title } = require("process");
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

class Article extends Class {
  async getArticlesByPagination(data) {
    data = Object.assign(
      {
        type: null,
        board: null,
        notice: false,
        datetimeType: null,
        userId: null,
        searchType: null,
        keyword: null,
        category: null,
        anonymous: true,
      },
      data
    );
    const {
      type,
      board,
      notice,
      datetimeType,
      userId,
      searchType,
      keyword,
      category,
      anonymous,
    } = data;
    const queryArray = [];
    const listCount = board?.listCount || 100;
    let queryString = "";
    queryString += `WHERE a.status = 2\n `;
    if (notice) {
      queryString += `AND a.notice = 1\n`;
    } else {
      queryString += `AND (a.notice = 0 OR a.notice IS NULL)\n`;
    }
    let orderQueryString = `ORDER BY a.createdAt DESC`;
    if (board) {
      queryString += `AND b.slug = ?\n`;
      queryArray.push(board.slug);
    }
    if (category) {
      queryString += `AND c.id = ?\n`;
      queryArray.push(category);
    }
    if (searchType === "title") {
      queryString += `AND a.title LIKE CONCAT('%',?,'%')\n`;
      queryArray.push(keyword);
    } else if (searchType === "titleAndContent") {
      queryString += `AND (a.title LIKE CONCAT('%',?,'%') OR a.content LIKE CONCAT('%',?,'%'))\n`;
      queryArray.push(keyword);
      queryArray.push(keyword);
    } else if (searchType === "nickName") {
      queryString += `AND u.nickName LIKE CONCAT('%',?,'%')\n`;
      queryArray.push(keyword);
    }
    if (type === "best") {
      queryString += `AND (a.viewCount >= ? OR a.likeCount >= ?)\n`;
      queryArray.push(this.setting.bestViewCount);
      queryArray.push(this.setting.bestLikeCount);
    }
    if (type === "bestDay") {
      queryString += `AND a.createdAt >= date_format(date_add(NOW(), INTERVAL -1 DAY), '%Y-%m-%d')\n`;
      orderQueryString = `ORDER BY (a.viewCount * 0.2) + (a.likeCount * 0.8) DESC`;


    } else if (type === "bestWeek") {
      queryString += `AND a.createdAt >= date_format(date_add(NOW(), INTERVAL -7 DAY), '%Y-%m-%d')\n`;
      orderQueryString = `ORDER BY (a.viewCount * 0.3) + (a.likeCount * 0.7) DESC`;
    } else if (type === "bestMonth") {
      queryString += `AND a.createdAt >= date_format(date_add(NOW(), INTERVAL -30 DAY), '%Y-%m-%d')\n`;
      orderQueryString = `ORDER BY (a.viewCount * 0.3) + (a.likeCount * 0.7) DESC`;
    }
    if (userId) {
      queryString += `AND u.id = ?\n`;
      queryArray.push(userId);
    }
    if (!anonymous) {
      queryString += `AND b.useAnonymous != 1\n`;
    }
    const pnQuery = `SELECT count(*) AS count
    FROM article AS a
    LEFT JOIN board AS b
    ON a.article_board_ID = b.id
    LEFT JOIN category AS c
    ON a.article_category_ID = c.id
    LEFT JOIN user AS u
    ON a.article_user_ID = u.id
    LEFT JOIN permission AS p
    ON u.permission = p.permission
    ${queryString}`;
    const [pnResult] = await this.conn.query(pnQuery, queryArray);
    const pn = pagination(pnResult, this.req?.query, "page", listCount);
    const query = `SELECT a.*, a.nickName AS nonMember, b.title AS board, b.slug AS boardSlug, c.title AS category, u.email, u.nickName AS nickName, u.image AS userImage, u.permission AS permission, p.title AS permissionName, p.isAdmin AS authorIsAdmin, b.useAnonymous, b.useSecret
    FROM article AS a
    LEFT JOIN board AS b
    ON a.article_board_ID = b.id
    LEFT JOIN category AS c
    ON a.article_category_ID = c.id
    LEFT JOIN user AS u
    ON a.article_user_ID = u.id
    LEFT JOIN permission AS p
    ON u.permission = p.permission
    ${queryString}
    ${orderQueryString}
    ${pn.queryLimit}`;
    const [articles] = await this.conn.query(query, queryArray);

    articles.forEach((article) => {
      article.images = this.getImages(article.images);
      article = this.setInfo(article, {
        datetimeType,
      });
    });
    return {
      articles,
      pn,
    };
  }
  async getArticles(data) {
    data = Object.assign(
      {
        siteId: null,
        userId: null,
      },
      data
    );
    const { siteId, userId } = data;
    let queryString = "";
    const queryArray = [];
    if (siteId) {
      queryString += `WHERE a.article_site_ID = ?\n`;
      queryArray.push(siteId);
    } else if (userId) {
      queryString += `WHERE u.id = ?\n`;
      queryArray.push(userId);
    }
    const query = `SELECT a.*
    FROM article AS a
    LEFT JOIN user AS u
    ON a.article_user_ID = u.id
    ${queryString}`;
    const [articles] = await this.conn.query(query, queryArray);
    return articles;
  }
  async get(articleInfo, options) {
    articleInfo = Object.assign(
      {
        id: null,
        slug: null,
      },
      articleInfo
    );
    const { id, slug } = articleInfo;
    options = Object.assign(
      {
        status: null,
        tags: false,
        userLike: false,
        boardPrevNextArticle: false,
        setInfo: false,
      },
      options
    );
    const { status, tags, userLike, userUnlike, setInfo } = options;
    let queryString = "";
    const queryArray = [];
    if (id) {
      queryString += `WHERE a.id = ?\n`;
      queryArray.push(id);
    } else if (slug) {
      queryString += `WHERE a.slug = ?\n`;
      queryArray.push(slug);
    }
    if (status) {
      queryString += `AND a.status = ?\n`;
      queryArray.push(status);
    }
    const query = `SELECT a.*, a.nickName AS nonMember, b.title AS board, b.slug AS boardSlug, c.title AS category, u.nickName AS nickName, u.image AS userImage, u.permission AS permission, p.title AS permissionName, p.isManager AS authorIsManager, p.isAdmin AS authorIsAdmin, b.useAnonymous, b.useSecret
    FROM article AS a
    LEFT JOIN board AS b
    ON a.article_board_ID = b.id
    LEFT JOIN category AS c
    ON a.article_category_ID = c.id
    LEFT JOIN user AS u
    ON a.article_user_ID = u.id
    LEFT JOIN permission AS p
    ON u.permission = p.permission
    ${queryString}`;
    const [articles] = await this.conn.query(query, queryArray);
    if (articles.length) {
      let article = articles[0];

      article.images = this.getImages(article.images);

      if (tags) {
        const tagClass = new Tag(this.req, this.res, this.conn);
        article.tags = await tagClass.getTags(article.id);
        article.combineTags = tagClass.combineTags(article.tags);
      }

      if (userLike) {
        if (this.user) {
          const query = `SELECT * FROM userArticleLike WHERE userArticleLike_user_ID = ? AND userArticleLike_article_ID = ?`;
          const [userLikeResult] = await this.conn.query(query, [
            this.user.id,
            article.id,
          ]);
          const userLike = userLikeResult.length ? 1 : 0;
          article.userLike = userLike;
        } else {
          article.userLike = 0;
        }
      }


      if (userUnlike) {
        if (this.user) {
          const query = `SELECT * FROM userArticleUnlike WHERE userArticleUnlike_user_ID = ? AND userArticleUnlike_article_ID = ?`;
          const [userUnlikeResult] = await this.conn.query(query, [
            this.user.id,
            article.id,
          ]);
          const userUnlike = userUnlikeResult.length ? 1 : 0;
          article.userUnlike = userUnlike;
        } else {
          article.userUnlike = 0;
        }
      }



      if (setInfo) article = this.setInfo(article);

      return article;
    } else {
      return null;
    }
  }
  async getPrevAfterArticle(articleId, boardId) {
    const boardPrevNextArticles = [];
    let prevArticle = null;
    let afterArticle = null;
    const prevQuery = `SELECT a.*, a.nickName AS nonMember, b.title AS board, b.slug AS boardSlug, c.title AS category, u.nickName AS nickName, u.image AS userImage, u.permission AS permission, p.title AS permissionName, p.isAdmin AS authorIsAdmin, b.useAnonymous, b.useSecret
    FROM article AS a
    LEFT JOIN board AS b
    ON a.article_board_ID = b.id
    LEFT JOIN category AS c
    ON a.article_category_ID = c.id
    LEFT JOIN user AS u
    ON a.article_user_ID = u.id
    LEFT JOIN permission AS p
    ON u.permission = p.permission
    WHERE a.id > ? AND a.article_board_ID = ? AND a.status = 2
    ORDER BY a.id ASC
    LIMIT 1`;
    const [prevArticleResult] = await this.conn.query(prevQuery, [
      articleId,
      boardId,
    ]);
    const afterQuery = `SELECT a.*, a.nickName AS nonMember, b.title AS board, b.slug AS boardSlug, c.title AS category, u.nickName AS nickName, u.image AS userImage, u.permission AS permission, p.title AS permissionName, p.isAdmin AS authorIsAdmin, b.useAnonymous, b.useSecret
    FROM article AS a
    LEFT JOIN board AS b
    ON a.article_board_ID = b.id
    LEFT JOIN category AS c
    ON a.article_category_ID = c.id
    LEFT JOIN user AS u
    ON a.article_user_ID = u.id
    LEFT JOIN permission AS p
    ON u.permission = p.permission
    WHERE a.id < ? AND a.article_board_ID = ? AND a.status = 2
    ORDER BY a.id DESC
    LIMIT 1`;
    const [afterArticleResult] = await this.conn.query(afterQuery, [
      articleId,
      boardId,
    ]);
    if (prevArticleResult.length) {
      prevArticle = prevArticleResult[0];
      prevArticle = this.setInfo(prevArticle);
      prevArticle.images = this.getImages(prevArticle.images);
      boardPrevNextArticles.push(prevArticle);
    }
    if (afterArticleResult.length) {
      afterArticle = afterArticleResult[0];
      afterArticle = this.setInfo(afterArticle);
      afterArticle.images = this.getImages(afterArticle.images);
      boardPrevNextArticles.push(afterArticle);
    }
    return boardPrevNextArticles;
  }
  async createTemp(data) {
    data = Object.assign(
      {
        board: null,
        user: null,
        title: "",
        content: "",
        status: 1,
      },
      data
    );
    const { board, user, title, content, status } = data;
    const slug = hashCreate(11);
    const query = `INSERT INTO article
    (article_board_ID, article_user_ID, title, slug, content, status)
    VALUES (?, ?, ?, ?, ?, ?)`;
    const [articleResult] = await this.conn.query(query, [
      board?.id,
      user?.id,
      title,
      slug,
      content,
      status,
    ]);
    const articleId = articleResult.insertId;
    return articleId;
  }
  async create(articleId, data) {
    const createData = Object.assign(
      {
        board: null,
      },
      data
    );
    const { board } = createData;
    const article = await this.update(
      {
        id: articleId,
      },
      data
    );
    // 알람
    const userClass = new User(this.req, this.res, this.conn);
    const alarmClass = new Alarm(this.req, this.res, this.conn);
    if (board.useUserAlarm) {
      const targetUsers = await userClass.getUsers();
      for await (let targetUser of targetUsers) {
        const alarmData = {
          type: "newArticle",
          userId: targetUser.id,
          relatedUserId: this.user.id,
          boardId: board.id,
        };
        await alarmClass.create(alarmData);
      }
    }
    if (board.useAdminAlarm) {
      const adminUsers = await userClass.getAdminUser();
      for await (let adminUser of adminUsers) {
        const alarmData = {
          type: "newArticle",
          userId: adminUser.id,
          relatedUserId: this.user.id,
          boardId: board.id,
        };
        await alarmClass.create(alarmData);
      }
    }
    // 포인트
    const pointClass = new Point(this.req, this.res, this.conn);
    const pointData = {
      user: this.user,
      type: "createArticle",
      point: board.writePoint,
    };
    await pointClass.create(pointData);
    return article;
  }
  async update(articleInfo, data) {
    articleInfo = Object.assign(
      {
        id: null,
        slug: null,
        admin: false,
      },
      articleInfo
    );
    const { id, slug } = articleInfo;
    let article = null;
    if (id) {
      article = await this.get({
        id,
      });
    } else if (slug) {
      article = await this.get({
        slug,
      });
    }
    if (article) {
      data = Object.assign(
        {
          userId: article.article_user_ID,
          boardId: article.article_board_ID,
          categoryId: article.article_category_ID,
          title: article.title,
          slug: article.slug,
          content: article.content,
          images: article.images,
          links: article.links,
          html: article.html,
          tags: null,
          notice: article.notice,
          viewCount: article.viewCount,
          reportCount: article.reportCount,
          nickName: article.nickName || article.nonMember,
          password: article.password,
          status: article.status,
          customField01: article.customField01,
          customField02: article.customField02,
          customField03: article.customField03,
          customField04: article.customField04,
          customField05: article.customField05,
          customField06: article.customField06,
          customField07: article.customField07,
          customField08: article.customField08,
          customField09: article.customField09,
          customField10: article.customField10,
          updatedAt: article.updatedAt,
          createdAt: article.createdAt,
          links: article.links,
          files: null,
          force: false,
        },
        data
      );
      const {
        userId,
        boardId,
        categoryId,
        title,
        slug,
        links,
        html,
        tags,
        notice,
        viewCount,
        reportCount,
        nickName,
        password,
        status,
        customField01,
        customField02,
        customField03,
        customField04,
        customField05,
        customField06,
        customField07,
        customField08,
        customField09,
        customField10,
        updatedAt,
        createdAt,
        files,
        force,
      } = data;
      let { content, images } = data;
      if (
        article.article_user_ID === this.user?.id ||
        // (this.user?.isManager &&
        //   this.res.locals.thisSite.setting.useManagerArticle) ||
        this.user?.isAdmin ||
        !article.article_user_ID ||
        userId
      ) {
        content = content.replace(/((<p>&nbsp;<\/p>)*$)/, ""); // 하단 공백 제거

        // 이미지 업로드
        const oldKeys = article?.images;
        // console.log('oldKeys:', oldKeys);
        // console.log(content);

        content = content.replace(
          match.contentImageWithAltTag,
          "[[image:$1]]($2)"
        );
        content = content.replace(match.contentImage, "[[image:$1]]");
        content = content.replace(match.contentInnerImage, "[[image:$1]]");
        const imageRaws = Array.from(
          content.matchAll(match.contentReplaceImageWithAltTagOriginal)
        );

        const newImages = [];
        imageRaws.forEach((imageRaw) => {
          newImages.push({
            key: imageRaw[1],
            tag: imageRaw[0],
            alt: imageRaw[2],
          });
        });

        // console.log('imageRaws:', imageRaws);

        // Files
        const fileArray = await this.fileCheck(article, files);

        // 이미지 태그 변환
        newImages.forEach((image) => {
          if (image.alt) {
            const replaceAltTag = image.alt.replace("(", "").replace(")", "");
            content = content.replaceAll(
              image.tag,
              `[[image:${image.key}]](${replaceAltTag})`
            );
          } else {
            content = content.replaceAll(image.tag, `[[image:${image.key}]]`);
          }
        });

        // 이미지 삭제
        if (oldKeys) {
          for await (let oldkey of oldKeys) {
            const result = newImages.find((image) => image.key === oldkey);
            if (!result) {
              const params = {
                Bucket: bucket,
                Key: `article/${oldkey}`,
              };
              s3.deleteObject(params, (err, data) => {
                if (err) {
                  console.error(err);
                }
              });
              const thumbParams = {
                Bucket: bucket,
                Key: `thumb/${oldkey}`,
              };
              s3.deleteObject(thumbParams, (err, data) => {
                if (err) {
                  console.error(err);
                }
              });
            }
          }
          images = JSON.stringify(newImages.map((image) => image.key));
        }

        const tagClass = new Tag(this.req, this.res, this.conn);
        await tagClass.set(article.id, tags);

        // 비회원
        let hash = article.password;
        if (!force && !this.user?.isAdmin) {
          if (nickName && password && article.status === 1) {
            const salt = bcrypt.genSaltSync(SALT_COUNT);
            hash = bcrypt.hashSync(password, salt);
          } else if (password && article.status === 2) {
            const passwordCheck = bcrypt.compareSync(
              password,
              article.password
            );
            if (!passwordCheck) {
              throw new Error(`${cache.lang.differentPassword}`);
            }
          }
        }

        try {
          const query = `UPDATE article
          SET
          article_user_ID = ?,
          article_board_ID = ?,
          article_category_ID = ?,
          title = ?,
          slug = ?,
          content = ?,
          images = ?,
          links = ?,
          files = ?,
          html = ?,
          notice = ?,
          viewCount = ?,
          reportCount = ?,
          nickName = ?,
          password = ?,
          status = ?,
          customField01 = ?,
          customField02 = ?,
          customField03 = ?,
          customField04 = ?,
          customField05 = ?,
          customField06 = ?,
          customField07 = ?,
          customField08 = ?,
          customField09 = ?,
          customField10 = ?,
          updatedAt = ?,
          createdAt = ?
          WHERE id = ?`;
          const [result] = await this.conn.query(query, [
            userId,
            boardId,
            categoryId,
            title,
            slug,
            content,
            images,
            links,
            fileArray,
            html,
            notice || 0,
            viewCount,
            reportCount,
            nickName,
            hash,
            status,
            customField01,
            customField02,
            customField03,
            customField04,
            customField05,
            customField06,
            customField07,
            customField08,
            customField09,
            customField10,
            updatedAt,
            createdAt,
            article.id,
          ]);
          // Caching
          if (notice || (!notice && article.notice)) {
            for await (let board of this.res.locals.boards) {
              if (board?.id === boardId) {
                const { articles, pn } = await this.getArticlesByPagination({
                  board,
                  notice: true,
                });
                board.notices = articles;
              }
            }
          }
          return slug;
        } catch (e) {
          console.error(e);
        }
      } else {
        throw new Error(`${cache.lang.dontHavePermission}`);
      }
    } else {
      throw new Error(`${cache.lang.board_articleNotFound}`);
    }
  }
  async removeArticlesUnsync(articles) {
    if (articles) {
      articles.forEach((article) => {
        const images = this.getImages(article.images);
        // 이미지 삭제
        if (images) {
          images.forEach((image) => {
            const params = {
              Bucket: bucket,
              Key: `article/${image}`,
            };
            s3.deleteObject(params, (err, data) => {
              if (err) {
                console.error(err);
              }
            });
            const thumbParams = {
              Bucket: bucket,
              Key: `thumb/${image}`,
            };
            s3.deleteObject(thumbParams, (err, data) => {
              if (err) {
                console.error(err);
              }
            });
          });
        }
      });
    }
  }
  async remove(articleInfo, data) {
    articleInfo = Object.assign(
      {
        id: null,
        slug: null,
        admin: false,
      },
      articleInfo
    );
    const { id, slug } = articleInfo;
    let article = null;
    if (id) {
      article = await this.get({
        id,
      });
    } else if (slug) {
      article = await this.get({
        slug,
      });
    }
    if (article) {
      data = Object.assign(
        {
          password: null,
        },
        data
      );
      const { password } = data;

      // 비회원
      let passwordCheck = false;
      if (password) {
        passwordCheck = bcrypt.compareSync(password, article.password);
        if (!passwordCheck) {
          throw new Error(`${cache.lang.differentPassword}`);
        }
      }

      // Caching
      if (article.notice) {
        this.res.locals.boards.forEach((board) => {
          if (board.id === article.article_board_ID) {
            board.notices = board.notices.filter(
              (notice) => notice.id !== article.id
            );
          }
        });
      }

      if (
        article.article_user_ID === this.user?.id ||
        (this.user?.isManager && this.setting.useManagerArticle) ||
        this.user?.isAdmin ||
        (!article.article_user_ID && passwordCheck)
      ) {
        const board = this.res.locals.boards.find(
          (board) => board.id === Number(article.article_board_ID)
        );
        const userClass = new User(this.req, this.res, this.conn);
        const articleAuthor = await userClass.get({
          id: article.article_user_ID,
        });
        const pointClass = new Point(this.req, this.res, this.conn);

        const images = article?.images;

        // 이미지 삭제
        if (images) {
          images.forEach((image) => {
            const params = {
              Bucket: bucket,
              Key: `article/${image}`,
            };
            s3.deleteObject(params, (err, data) => {
              if (err) {
                console.error(err);
              }
            });
            const thumbParams = {
              Bucket: bucket,
              Key: `thumb/${image}`,
            };
            s3.deleteObject(thumbParams, (err, data) => {
              if (err) {
                console.error(err);
              }
            });
          });
        }

        // Files
        const files = JSON.parse(article.files);
        if (files) {
          files.forEach((file) => {
            removeFile({
              key: file,
              folder: "file",
            });
          });
        }

        const query = `DELETE FROM article
        WHERE id = ?`;
        await this.conn.query(query, [article.id]);

        const pointData = {
          user: articleAuthor,
          type: "removeArticle",
          point: board.writePoint,
        };

        await pointClass.remove(pointData);
      } else {
        throw new Error(`${cache.lang.dontHavePermission}`);
      }
    } else {
      throw new Error(`${cache.lang.board_articleNotFound}`);
    }
  }
  async fileCheck(article, files) {
    const originFiles = JSON.parse(article.files);
    const keys = [];
    if (originFiles) {
      if (files) {
        originFiles.forEach((file) => {
          removeFile({
            file,
            folder: "file",
          });
        });
        for await (let file of files) {
          const key = await fileUpload({
            file,
            folder: "file",
          });
          keys.push(key);
        }
      } else {
        originFiles.forEach((file) => {
          keys.push(file);
        });
      }
    } else {
      if (files) {
        for await (let file of files) {
          const key = await fileUpload({
            file,
            folder: "file",
          });
          keys.push(key);
        }
      }
    }
    return JSON.stringify(keys);
  }
  async incrementViewCountUnsync(articleId) {
    if (articleId) {
      const conn = await pool.getConnection();
      try {
        const query = `UPDATE article
        SET viewCount = viewCount + 1
        WHERE id = ?`;
        await conn.query(query, [articleId]);
      } catch (e) {
        console.error(e);
      } finally {
        conn.release();
      }
    }
  }
  imageEncode(image) {}
  imageDecode(content, thisSite) {
    content = content
      .replaceAll(
        match.contentReplaceImageWithAltTag,
        `<figure class="image"><img src="${thisSite.storage}/article/$1" alt="$2"></figure>`
      )
      .replaceAll(
        match.contentReplaceImage,
        `<figure class="image"><img src="${thisSite.storage}/article/$1"></figure>`
      );
    return content;
  }
  async getLikes(data) {
    data = Object.assign(
      {
        userId: null,
      },
      data
    );
    const { userId } = data;
    let queryString = "";
    const queryArray = [];
    if (userId) {
      queryString += `AND ul.userArticleLike_user_ID = ?\n`;
      queryArray.push(userId);
    }
    const pnQuery = `SELECT count(*) AS count
    FROM userArticleLike AS ul
    WHERE ul.status = 1
    ${queryString}`;
    const [pnResult] = await this.conn.query(pnQuery, queryArray);
    const pn = pagination(pnResult, this.req.query, "page", 10);
    const query = `SELECT ul.*, a.id AS articleId, a.slug AS articleSlug, a.title, b.slug AS boardSlug, u.nickName
    FROM userArticleLike AS ul
    LEFT JOIN article AS a
    ON ul.userArticleLike_article_ID = a.id
    LEFT JOIN board AS b
    ON a.article_board_ID = b.id
    LEFT JOIN user AS u
    ON a.article_user_ID = u.id
    WHERE ul.status = 1
    ${queryString}
    ORDER BY createdAt DESC
    ${pn.queryLimit}`;
    const [articles] = await this.conn.query(query, queryArray);
    articles.forEach((article) => {
      article.datetime = datetime(article.createdAt);
    });
    return {
      articles,
      pn,
    };
  }
  setInfo(article, options) {
    options = Object.assign(
      {
        datetimeType: null,
      },
      options
    );
    const { datetimeType } = options;
    const thisSite = this.res?.locals || cache;

    article.boardSlugRaw = encodeURI(article.boardSlug);

    if (datetimeType === "datetime") {
      article.datetime = datetime(article.createdAt, "datetime");
    } else {
      article.datetime = datetime(article.createdAt);
    }

    if (this.user && article.article_user_ID === this.user.id) {
      article.isAuthor = true;
    }

    // 등급명 변경
    if (Number(article.permissionName)) {
      article.permissionName = `LV ${Number(article.permissionName)}`;
    }

    const permissionImage = thisSite.permissions.find(
      (permission) => permission.permission === article.permission
    );
    if (article.article_user_ID) {
      if (permissionImage?.image) {
        article.permissionImage = `${storage}/permission/${permissionImage.image}`;
      } else {
        article.permissionImage = `/assets/permission/${article.permission}.svg`;
      }
    }

    // 익명
    if (
      article.useAnonymous &&
      article.article_user_ID !== this.user?.id &&
      !this.user?.isAdmin &&
      !article.authorIsAdmin
    ) {
      article.nickName = "익명";
      article.permissionName = null;
    }

    // 유튜브
    const youtubeRegex = new RegExp(
      /<div data-oembed-url="http(?:s?):\/\/(?:www\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([\w\-\_]*)[&(amp;)[\w=.]*]?">/
    );
    const matchContent = article.content.match(youtubeRegex);
    if (matchContent) {
      const youtubeId = matchContent[1];
      article.youtube = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
    }

    // 이미지
    if (article.images?.length) {
      article.image = `${thisSite.storage}/thumb/${article.images[0]}`;
      article.ogImage = `${thisSite.storage}/thumb/${article.images[0]}`;
    } else if (article.youtube) {
      article.image = article.youtube;
      article.ogImage = article.youtube;
    } else {
      let ogImage = null;
      if (thisSite.setting.ogImage) {
        ogImage = thisSite.setting.ogImage;
      } else if (thisSite.setting.faviconImage) {
        ogImage = thisSite.setting.faviconImage;
      }
      if (ogImage) {
        article.ogImage = `${thisSite.storage}/assets/${ogImage}`;
      }
    }

    // 비밀글
    if (
      article.useSecret &&
      article.article_user_ID !== this.user?.id &&
      !article.authorIsAdmin &&
      !this.user?.isAdmin
    ) {
      article.title = `${cache.lang.board_articleIsSecret}`;
      article.images = [];
    }

    // OG
    article.ogContent = article.content
      .replace(/\[\[[^\]]*\]\]/gi, "")
      .replace(/<[^>]*>/gi, "")
      .replace(/&nbsp;/gi, "")
      .slice(0, 150);
    article.url = `${thisSite.setting.siteDomain}/${article.boardSlug}/${article.slug}`;

    // 비회원
    if (!article.article_user_ID) {
      article.nickName = article.nonMember;
      article.permissionName = `${cache.lang.nonUser}`;
    }

    // Engine
    if (thisSite.setting.editor === "engine") {
      article.content = engine(article.content);
    } else if (thisSite.setting.editor === "ckeditor5") {
      article.content = this.imageDecode(article.content, thisSite);
    }

    // Editor
    if (thisSite.setting.editor === "ckeditor5") {
      // Youtube
      article.content = article.content.replaceAll(
        match.youtube,
        `<div class="youtube"><iframe src="https://www.youtube.com/embed/$1" allow="fullscreen"></iframe></div>`
      );
      if (
        article.content.match(
          /https:\/\/www.youtube.com\/embed\/([\w\-\_]*)[&(amp;)[\w=.]*]?/,
          `$1`
        )
      ) {
        article.youtubeId = article.content.match(
          /https:\/\/www.youtube.com\/embed\/([\w\-\_]*)[&(amp;)[\w=.]*]?/,
          `$1`
        )[1];
      }
      // Vimeo
      article.content = article.content.replaceAll(
        match.vimeo,
        `<div class="vimeo"><iframe src="https://player.vimeo.com/video/$1" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0"></iframe></div>`
      );
      article.content = article.content.replaceAll(
        match.vimeo,
        `<div class="vimeo"><iframe src="https://player.vimeo.com/video/$1" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0"></iframe></div>`
      );
      article.content = article.content.replaceAll(
        match.oembed,
        '<a href="$1" target="_blank">$1</a>'
      );
    }

    article.contentWithoutTags = article.content.replaceAll(match.tag, "");

    // 리포트
    if (
      article.reportCount !== 0 &&
      thisSite.setting.reportCount >= article.reportCount &&
      !this.user?.isAdmin
    ) {
      article.title = `${cache.lang.board_needAdminsApproval}`;
      article.content = `${cache.lang.board_needAdminsApproval}`;
    }

    // Links
    if (article.links) {
      article.links = article.links
        .split(",")
        .map((file) => file.trim())
        .filter((file) => file.length);
    }

    // Files
    if (article.files) {
      article.files = JSON.parse(article.files);
      // article.files = article.files.split(',')
      //   .map(file => file.trim())
      //   .filter(file => file.length);
    }

    return article;
  }

  getImages(imageRaws) {
    if (imageRaws?.length) {
      try {
        const images = JSON.parse(imageRaws);
        return images;
      } catch (e) {
        return [];
      }
    } else {
      return [];
    }
  }
  setImages() {}
  async addImage(articleInfo, image) {
    articleInfo = Object.assign(
      {
        id: null,
        slug: null,
      },
      articleInfo
    );
    const { id, slug } = articleInfo;
    let article = null;
    let queryString = "";
    const queryArray = [];
    if (id) {
      article = await this.get({
        id,
      });
    } else if (slug) {
      article = await this.get({
        slug,
      });
    }
    let images = null;
    if (article.images) {
      images = article.images;
      images.push(image);
    } else {
      images = [image];
    }
    queryArray.push(JSON.stringify(images));
    if (id) {
      queryString += `WHERE id = ?\n`;
      queryArray.push(id);
    } else if (slug) {
      queryString += `WHERE slug = ?\n`;
      queryArray.push(slug);
    }
    const query = `UPDATE article
    SET images = ?
    ${queryString}`;
    await this.conn.query(query, queryArray);
  }
}

const removeFile = (data) => {
  Object.assign(
    {
      key: null,
      folder: null,
    },
    data
  );
  const { key, folder } = data;
  const params = {
    Bucket: bucket,
    Key: `${folder}/${key}`,
  };
  s3.deleteObject(params, (err, data) => {
    if (err) {
      console.error(err);
    }
  });
};

module.exports = Article;
