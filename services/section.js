const { timezone } = require('../config');
const moment = require('moment');
require('moment-timezone');
moment.tz.setDefault(timezone);
const datetime = require('../middleware/datetime');
const isNew = require('../middleware/isNew');
const match = require('../middleware/match');
const Article = require('./article');
const cache = require('./cache');

const Class = require('./class');

class Section extends Class {
  async getSections (data) {
    data = Object.assign({
      sectionGroupId: null,
    }, data);
    const {
      sectionGroupId,
    } = data;
    let queryString = '';
    const queryArray = [];
    if (sectionGroupId) {
      queryString += 'WHERE s.section_sectionGroup_ID = ?\n';
      queryArray.push(sectionGroupId);
    }
    const query = `SELECT s.*, b.title, b.slug
    FROM section AS s
    LEFT JOIN sectionGroup AS sg
    ON s.section_sectionGroup_ID = sg.id
    LEFT JOIN board AS b
    ON s.section_board_ID = b.id
    ${queryString}
    ORDER BY s.viewOrder ASC, s.id ASC`;
    const [sections, ] = await this.conn.query(query, queryArray);
    for await (let section of sections) {
      if (!section.section_board_ID) {
        if (section.articleOrder === 'best') {
          section.title = cache.lang.board_best;
          section.slug = 'best';
        } else {
          section.title = cache.lang.board_new;
          section.slug = 'new';
        }
      }
      const articles = await this.getSectionArticles(section.id, {
        boardId: section.section_board_ID,
        exceptBoards: section.exceptBoards,
        articleOrder: section.articleOrder,
        viewCount: section.viewCount,
      });
      section.articles = articles;
    }
    return sections;
  }
  async getSectionArticles (sectionId, options) {
    options = Object.assign({
      boardId: null,
      exceptBoards: null,
      articleOrder: 'lately',
      viewCount: 5,
    }, options);
    const {
      boardId,
      exceptBoards,
      articleOrder,
      viewCount,
    } = options;

    let queryString = '';
    let articleBoardQuery = '';
    let articleOrderQuery = '';
    const queryArray = [];

    if (boardId) {
      articleBoardQuery += 'AND a.article_board_ID = ?\n';
      queryArray.push(boardId);
    }

    if (exceptBoards) {
      const exceptBoardArray = exceptBoards
        .replaceAll(/\s/ig, '')
        .split(',')
      exceptBoardArray.forEach(board => {
        articleBoardQuery += `AND b.slug != ?\n`;
        queryArray.push(board);
      });
    }

    if (articleOrder === 'best') {
      queryString += `AND (a.viewCount >= ? OR a.likeCount >= ?)\n`;
      queryArray.push(cache.setting.bestViewCount);
      queryArray.push(cache.setting.bestLikeCount);
      articleOrderQuery = `ORDER BY a.createdAt DESC\n`;
    } else if (articleOrder === 'lately') {
      articleOrderQuery = `ORDER BY a.createdAt DESC\n`;
    } else if (articleOrder === 'older') {
      articleOrderQuery = `ORDER BY a.createdAt ASC\n`;
    } else if (articleOrder === 'random') {
      articleOrderQuery = `ORDER BY RAND()\n`;
    }
    const query = `SELECT a.*, b.slug AS boardSlug, c.title AS category
    FROM article AS a
    LEFT JOIN board AS b
    ON a.article_board_ID = b.id
    LEFT JOIN category AS c
    ON a.article_category_ID = c.id
    WHERE a.status = 2
    ${articleBoardQuery}
    ${queryString}
    ${articleOrderQuery}
    LIMIT ?`;
    queryArray.push(viewCount);
    const [articles, ] = await this.conn.query(query, queryArray);
    const articleClass = new Article(this.req, this.res, this.conn);
    for await (let article of articles) {
      article.datetime = datetime(article.createdAt);
      article.images = articleClass.getImages(article.images);
      article = articleClass.setInfo(article);
    }
    return articles;
  }
  async get (sectionId) {
    const query = `SELECT s.*
    FROM section AS s
    LEFT JOIN sectionGroup AS sg
    ON s.section_sectionGroup_ID = sg.id
    WHERE s.id = ?`;
    const [sections, ] = await this.conn.query(query, [
      sectionId,
    ]);
    if (sections.length) {
      const section = sections[0];
      return section;
    } else {
      return null;
    }
  }
  async set (sectionGroupId) {
    const sections = await this.getSections({
      sectionGroupId,
    });
    cache.sectionGroups.forEach(sectionGroup => {
      if (sectionGroup.id === Number(sectionGroupId)) {
        sectionGroup.sections = sections;
      }
    });
  }
  async create (data) {
    data = Object.assign({
      sectionGroupId: null,
      board: null,
      type: null,
      articleOrder: 'lately',
    }, data);
    const {
      sectionGroupId,
      board,
      type,
      articleOrder,
    } = data;
    const query = `INSERT INTO section
    (section_sectionGroup_ID, section_board_ID, type, articleOrder)
    VALUES (?, ?, ?, ?)`;
    const [result, ] = await this.conn.query(query, [
      sectionGroupId,
      board || null,
      type,
      articleOrder,
    ]);
    if (result.insertId) {
      await this.set(sectionGroupId);
      return result.insertId;
    } else {
      return null;
    }
  }
  async update (sectionId, data) {
    const section = await this.get(sectionId);
    data = Object.assign({
      sectionGroupId: section.section_sectionGroup_ID,
      board: section.section_board_ID,
      type: section.type,
      articleOrder: section.articleOrder,
      exceptBoards: section.exceptBoards,
      viewCount: section.viewCount,
      viewOrder: section.viewOrder,
    }, data);
    const {
      sectionGroupId,
      board,
      type,
      articleOrder,
      exceptBoards,
      viewCount,
      viewOrder,
    } = data;
    const query = `UPDATE section
    SET
    section_sectionGroup_ID = ?,
    section_board_ID = ?,
    type = ?,
    articleOrder = ?,
    exceptBoards = ?,
    viewCount = ?,
    viewOrder = ?
    WHERE id = ?`;
    await this.conn.query(query, [
      sectionGroupId,
      board || null,
      type,
      articleOrder,
      exceptBoards,
      viewCount,
      viewOrder,
      sectionId,
    ]);
    await this.set(section.section_sectionGroup_ID);
  }
  async remove (sectionId) {
    const section = await this.get(sectionId);
    const query = `DELETE FROM section
    WHERE id = ?`;
    await this.conn.query(query, [
      sectionId,
    ]);
    await this.set(section.section_sectionGroup_ID);
  }
}

module.exports = Section;