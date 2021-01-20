'use strict';

const middy = require('@middy/core')

const jsonBodyParser = require('@middy/http-json-body-parser');
const httpErrorHandler = require('@middy/http-error-handler');
const validator = require('@middy/validator');
const createError = require('http-errors');
const KSUID = require('ksuid');

const AWS = require('aws-sdk');
const DDB = new AWS.DynamoDB.DocumentClient();

var bunyan = require('bunyan');
var log = bunyan.createLogger({name: "Gate"});

const inputSchema = {
  type: 'object',
  properties: {
    body: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 3, maxLength: 16 },
        gate: { type: 'string', minLength: 1}
      },
      required: ['id', 'gate']
    }
  }
}

const gate = async event => {

  log = log.child({body: event.body});

  const params = {
    TableName: process.env.ACCESS_TABLE,
    Key: {
      PK: `USER#${event.body.id}`,
      SK: `USER#${event.body.id}`,
    }
  }

  const user = await DDB.get(params).promise();

  if (user.Item === undefined) {
    //user doesn't exist
    log.error("invalid user id");
    throw createError(400, "invalid user id");
  }

  if (user.Item.gate !== "" && user.Item.gate !== event.body.gate) {
    //must either be leaving current zone or not in a zone
    log.error("user already in zone");
    throw createError(400, "must leave zone before entering another");
  }

  let action = user.Item.gate === event.body.gate ? "OUT" : "IN"

  log = log.child({action});

  if (!user.Item.gates.includes(event.body.gate)) {
    //user not authorized to use this gate
    log.error("user not authorized");
    throw createError(403, "not authorized to use this gate");
  }

  //generate event id
  const eventId = await KSUID.random();

  const params2 = {
    TableName: process.env.ACCESS_TABLE,
    Item: {
      PK: `USER#${event.body.id}`,
      SK: `GATE#${event.body.gate}#${eventId.string}`,
      action,
      date: new Date().toISOString()
    },
    ConditionExpression: "attribute_not_exists(SK)"
  }

  const result = await DDB.put(params2).promise();

  const params3 = {
    TableName: process.env.ACCESS_TABLE,
    Key: {
      PK: `USER#${event.body.id}`,
      SK: `USER#${event.body.id}`,
    },
    UpdateExpression: "set #g = :g",
    ExpressionAttributeNames: {
      "#g" : "gate"
    },
    ExpressionAttributeValues: {
      ":g" : action === "IN" ? event.body.gate : ""
    }
  }

  const result2 = await DDB.update(params3).promise();

  log.info("gate success");
  return {
    statusCode: 200,
    body: JSON.stringify( "OK" ),
  };
};

const handler = middy(gate)
  .use(jsonBodyParser())
  .use(validator({inputSchema}))
  .use(httpErrorHandler());

module.exports = { handler };