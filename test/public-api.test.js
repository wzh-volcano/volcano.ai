const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { API_KEY, APP_ID, request } = require('./config');

const needsServer = () => {
  const msg = '请设置 API_KEY 和 APP_ID 环境变量，并确保后端已启动';
  if (!API_KEY || !APP_ID) return { skip: msg };
  return {};
};

function raw(method, path, body, extraHeaders = {}) {
  return fetch(`http://localhost:8000${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let createdConvId = null;

describe('认证错误', needsServer(), () => {
  test('不传 X-API-Key 返回 401', async () => {
    const res = await raw('POST', `/api/public/apps/${APP_ID}/conversations`, { title: 't' });
    assert.equal(res.status, 401);
  });

  test('传入无效 API Key 返回 401', async () => {
    const res = await raw('POST', `/api/public/apps/${APP_ID}/conversations`, { title: 't' }, { 'X-API-Key': 'vol_invalid_key_xxx' });
    assert.equal(res.status, 401);
  });

  test('不存在的 app_id 返回 404', async () => {
    const { status } = await request('POST', '/api/public/apps/9999999/conversations', { title: 't' });
    assert.equal(status, 404);
  });

  test('不存在的会话返回 404', async () => {
    const { status } = await request('GET', `/api/public/apps/${APP_ID}/conversations/9999999/messages`);
    assert.equal(status, 404);
  });
});

describe('会话 CRUD', needsServer(), () => {
  test('创建会话', async () => {
    const { status, data } = await request('POST', `/api/public/apps/${APP_ID}/conversations`, { title: '测试会话' });
    assert.equal(status, 201, `创建会话失败: ${JSON.stringify(data)}`);
    assert.ok(data.id > 0);
    assert.equal(data.title, '测试会话');
    assert.equal(data.app_id, APP_ID);
    createdConvId = data.id;
  });

  test('获取消息列表（空会话）', { skip: () => !createdConvId && '前置用例创建会话失败' }, async () => {
    const { status, data } = await request('GET', `/api/public/apps/${APP_ID}/conversations/${createdConvId}/messages`);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
    assert.equal(data.length, 0);
  });

  test('删除会话', { skip: () => !createdConvId && '前置用例创建会话失败' }, async () => {
    const { status } = await request('DELETE', `/api/public/apps/${APP_ID}/conversations/${createdConvId}`);
    assert.equal(status, 204);
  });

  test('已删除的会话返回 404', { skip: () => !createdConvId && '前置用例创建会话失败' }, async () => {
    const { status } = await request('GET', `/api/public/apps/${APP_ID}/conversations/${createdConvId}/messages`);
    assert.equal(status, 404);
  });
});

describe('Simple Chat（自动检索上下文）', needsServer(), () => {
  let convId;

  before(async () => {
    const { status, data } = await request('POST', `/api/public/apps/${APP_ID}/conversations`, { title: 'simple-chat' });
    if (status === 201) convId = data.id;
  });

  after(async () => {
    if (convId) await request('DELETE', `/api/public/apps/${APP_ID}/conversations/${convId}`);
  });

  test('返回 SSE 流并包含 done 标记', { skip: () => !convId && '创建会话失败' }, async () => {
    const res = await raw('POST', `/api/public/apps/${APP_ID}/conversations/${convId}/simple-chat`,
      { question: '你好' }, { 'X-API-Key': API_KEY },
    );
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));

    let text = '';
    for await (const chunk of res.body) text += new TextDecoder().decode(chunk);
    assert.ok(text.includes('data:'));
    assert.ok(text.includes('"done"'));
  });

  test('缺少 question 返回 422', { skip: () => !convId && '创建会话失败' }, async () => {
    const res = await raw('POST', `/api/public/apps/${APP_ID}/conversations/${convId}/simple-chat`,
      {}, { 'X-API-Key': API_KEY },
    );
    assert.equal(res.status, 422);
  });

  test('消息已持久化', { skip: () => !convId && '创建会话失败' }, async () => {
    const { status, data } = await request('GET', `/api/public/apps/${APP_ID}/conversations/${convId}/messages`);
    assert.equal(status, 200);
    assert.ok(data.length >= 2);
    assert.equal(data[0].role, 'user');
    assert.equal(data[1].role, 'assistant');
  });
});

describe('Chat（需传入上下文）', needsServer(), () => {
  let convId;

  before(async () => {
    const { status, data } = await request('POST', `/api/public/apps/${APP_ID}/conversations`, { title: 'chat' });
    if (status === 201) convId = data.id;
  });

  after(async () => {
    if (convId) await request('DELETE', `/api/public/apps/${APP_ID}/conversations/${convId}`);
  });

  test('返回 SSE 流并包含 done 标记', { skip: () => !convId && '创建会话失败' }, async () => {
    const res = await raw('POST', `/api/public/apps/${APP_ID}/conversations/${convId}/chat`,
      {
        question: '你好',
        messages: [
          { role: 'user', content: '之前的消息' },
          { role: 'assistant', content: '之前的回答' },
        ],
      },
      { 'X-API-Key': API_KEY },
    );
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));

    let text = '';
    for await (const chunk of res.body) text += new TextDecoder().decode(chunk);
    assert.ok(text.includes('data:'));
    assert.ok(text.includes('"done"'));
  });
});

describe('压缩上下文', needsServer(), () => {
  let convId;

  before(async () => {
    const { status, data } = await request('POST', `/api/public/apps/${APP_ID}/conversations`, { title: 'compress' });
    if (status === 201) convId = data.id;
    if (convId) {
      await raw('POST', `/api/public/apps/${APP_ID}/conversations/${convId}/chat`,
        { question: '今天天气怎么样' }, { 'X-API-Key': API_KEY },
      );
    }
  });

  after(async () => {
    if (convId) await request('DELETE', `/api/public/apps/${APP_ID}/conversations/${convId}`);
  });

  test('返回非空摘要', { skip: () => !convId && '创建会话失败' }, async () => {
    const { status, data } = await request('POST', `/api/public/apps/${APP_ID}/conversations/${convId}/compress`);
    assert.equal(status, 200);
    assert.ok(data.summary);
    assert.equal(typeof data.summary, 'string');
    assert.ok(data.summary.length > 0);
  });
});
