const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const config = require('./config');

const s3Info = config.getStorage();

const {
  accessKeyId,
  secretAccessKey,
  region,
  bucket,
  host,
  endpoint,
} = s3Info;

const spacesEndpoint = new AWS.Endpoint(endpoint);
const s3 = new AWS.S3({
    endpoint: spacesEndpoint,
    accessKeyId,
    secretAccessKey,
    region,
    bucket,
});

const fileUpload = async (data) => {
  data = Object.assign({
    file: null,
    folder: null,
    fileName: null,
  }, data);
  const {
    file,
    folder,
    fileName,
  } = data;
  let extension = path.extname(file.originalname);
  if (extension === '.jpeg') extension = '.jpg';
  const str = Math.random().toString(36).substr(2,11);
  let key = null;
  if (fileName) {
    key = fileName;
  } else {
    key = `${Date.now().toString()}-${str}${extension.toLowerCase()}`;
  }
  if (extension !== '.js') {
    if (config.storageType === 's3') {
      await s3.putObject({
        Bucket: bucket,
        Key: `${folder}/${key}`,
        ACL: 'public-read',
        Body: file.buffer,
        ContentType: file.mimetype,
      }, (err, data) => {
        if (err) console.error(err);
      }).promise();
    } else if (config.storageType === 'local') {
      const folderExist = fs.existsSync(path.join(__dirname, `../public/storage/${folder}`));
      if (!folderExist) fs.mkdirSync(path.join(__dirname, `../public/storage/${folder}`), {
        recursive: true,
      });
      fs.writeFileSync(path.join(__dirname, `../public/storage/${folder}/${key}`), file);
    } else {
      await s3.putObject({
        Bucket: bucket,
        Key: `${folder}/${key}`,
        Body: file.buffer,
        ContentType: file.mimetype,
      }, (err, data) => {
        if (err) console.error(err);
      }).promise();
    }
  
    return key;
  } else {
    throw new Error(`${extension}는 허용된 파일 타입이 아닙니다`);
  }
};

module.exports = fileUpload;