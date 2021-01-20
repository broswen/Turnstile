'use strict';

const middy = require('@middy/core')

const jsonBodyParser = require('@middy/http-json-body-parser');
const httpErrorHandler = require('@middy/http-error-handler');
const validator = require('@middy/validator');
var createError = require('http-errors');

const AWS = require('aws-sdk');
const DDB = new AWS.DynamoDB.DocumentClient();

var bunyan = require('bunyan');
var log = bunyan.createLogger({name: "CreateUser"});

const inputSchema = {
  type: 'object',
  properties: {
    body: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 3, maxLength: 16 },
      },
      required: ['id']
    }
  }
}

const getUser = async event => {

  const params = {
    TableName: process.env.ACCESS_TABLE,
    Key: {
      PK: `USER#${event.body.id}`,
      SK: `USER#${event.body.id}`
    }
  }

  const result = await DDB.get(params).promise();

  if (result.Item === undefined) {
    log.error({body: event.body}, "user not found");
    throw createError(404, 'user not found');
  }

  log.error({body: event.body}, "found user");

  return {
    statusCode: 200,
    body: JSON.stringify(result.Item),
  };
};

const handler = middy(getUser)
  .use(jsonBodyParser())
  .use(validator({inputSchema}))
  .use(httpErrorHandler());

module.exports = { handler };