const express = require('express');
const router = express.Router();
const controller = require('../controllers/user');
const { isLogin } = require('../middleware/permission');

// User Info
router.get('/user/:nickName', controller.userInfo);
router.get('/user/:nickName/articles', controller.userArticles);
router.get('/user/:nickName/comments', controller.userComments);
router.get('/user/:nickName/articles4', controller.userArticles4);


// isLogin
router.get('/mypage', isLogin, controller.mypage);
router.post('/mypage', isLogin, controller.mypage);

router.get('/mypage/password', isLogin, controller.changePassword);
router.post('/mypage/password', isLogin, controller.changePassword);

router.get('/mypage/article', isLogin, controller.myArticles);
router.get('/mypage/comment', isLogin, controller.myComments);
router.get('/mypage/article', isLogin, controller.myPoints);
router.get('/mypage/article/like', isLogin, controller.articleLike);
router.get('/mypage/comment/like', isLogin, controller.commentLike);
router.get('/mypage/block', isLogin, controller.block);
router.post('/mypage/block', isLogin, controller.block);

router.get('/mypage/withdraw', isLogin, controller.withdraw);

router.get('/alarm', isLogin, controller.alarm);

router.get('/message', isLogin, controller.message);
router.get('/message/send', isLogin, controller.messageNew);
router.get('/message/send/:nickName', isLogin, controller.messageNew);
router.post('/message/send', isLogin, controller.messageNew);
router.post('/message/edit/:messageId', isLogin, controller.messageEdit);

router.get('/mypage/point', isLogin, controller.myPoints);

router.get('/mypage/pointWithdraw', isLogin, controller.pointWithdraw);
router.post('/mypage/pointWithdraw/:userId', isLogin, controller.pointWithdraw);

module.exports = router;