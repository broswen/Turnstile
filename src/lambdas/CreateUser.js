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
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', minLength: 4 },
        gates: { type: 'array', uniqueItems: true, items: { type: "string" } }
      },
      required: ['id', 'name', 'email', 'gates']
    }
  }
}

const createUser = async event => {

  const params = {
    TableName: process.env.ACCESS_TABLE,
    Item: {
      PK: `USER#${event.body.id}`,
      SK: `USER#${event.body.id}`,
      name: event.body.name,
      email: event.body.email,
      gates: event.body.gates,
      gate: ""
    },
    ConditionExpression: "attribute_not_exists(PK)"
  }

  try {
    const result = await DDB.put(params).promise();
  } catch (error) {
    log.error({body: event.body}, "failed to create user");
    throw createError(400, 'could not create user');
  }

  log.info({body: event.body},"created user")

  return {
    statusCode: 200,
    body: JSON.stringify(params.Item),
  };
};

const handler = middy(createUser)
  .use(jsonBodyParser())
  .use(validator({inputSchema}))
  .use(httpErrorHandler());

module.exports = { handler };