#!/usr/bin/env node
'use strict';
/**
 * entropy-audit MCP server — stdio, JSON-RPC 2.0, newline delimited.
 * Zero dependencies on purpose: this has to be droppable into any agent setup.
 */
const A = require('./index.js');

const TOOLS = [
  {
    name: 'assess_entropy',
    description:
      'Measure whether a byte sequence is actually random. Runs the two NIST SP 800-90B ' +
      'continuous health tests (Repetition Count, Adaptive Proportion) plus the MCV ' +
      'min-entropy estimator and a serial-structure check. Use it to test an RNG, a token ' +
      'or password generator, a shuffle, or any data you suspect is less random than it ' +
      'looks. Returns min-entropy in bits per byte (8 is the ceiling), pass/fail per test, ' +
      'and a verdict. NOTE: the reported min-entropy is an UPPER bound — the full 800-90B ' +
      'suite takes the minimum over ten estimators and this implements one.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Bytes as a hex string (whitespace ignored), or base64 if encoding is set.' },
        encoding: { type: 'string', enum: ['hex', 'base64', 'utf8'], default: 'hex' },
        aptWindow: { type: 'integer', default: 512, description: 'Adaptive Proportion Test window size.' }
      },
      required: ['data']
    }
  },
  {
    name: 'hac_z',
    description:
      'Test whether a series mean differs from a value, WITHOUT assuming the samples are ' +
      'independent. The usual standard error sd/sqrt(n) assumes independence; benchmark ' +
      'timings, latency samples, per-deploy error rates and anything with drift violate ' +
      'that, and the naive interval is then too narrow, so you report an effect that is ' +
      'not there. This estimates the long-run variance from the series itself ' +
      '(Newey-West, Bartlett window) and returns BOTH the naive and corrected results so ' +
      'the difference is visible. Reach for it whenever you are about to quote a p-value ' +
      'on time-ordered measurements.',
    inputSchema: {
      type: 'object',
      properties: {
        series: { type: 'array', items: { type: 'number' }, description: 'The measurements, in time order. At least 8.' },
        mu0: { type: 'number', default: 0, description: 'Null-hypothesis mean to test against.' },
        maxLag: { type: 'integer', description: 'Override the Newey-West bandwidth. Default is the standard 4(n/100)^(2/9) rule.' },
        conservative: { type: 'boolean', default: true, description: 'If true the correction may only widen the interval, never narrow it.' }
      },
      required: ['series']
    }
  },
  {
    name: 'paired_null',
    description:
      'Compare a measurement series against a matched control run, when no analytic null ' +
      'exists. Use when you cannot write down the distribution your statistic should have ' +
      'under "nothing is happening" — run the same pipeline on known-null input and compare. ' +
      'Applies the same autocorrelation handling to the difference.',
    inputSchema: {
      type: 'object',
      properties: {
        signal: { type: 'array', items: { type: 'number' } },
        control: { type: 'array', items: { type: 'number' }, description: 'Same length as signal, from a matched null run.' },
        maxLag: { type: 'integer' }
      },
      required: ['signal', 'control']
    }
  }
];

function decode(data, encoding) {
  if (encoding === 'base64') return new Uint8Array(Buffer.from(data, 'base64'));
  if (encoding === 'utf8') return new Uint8Array(Buffer.from(data, 'utf8'));
  return data; // hex — index.js parses it
}

function call(name, args) {
  switch (name) {
    case 'assess_entropy':
      return A.assessEntropy(decode(args.data, args.encoding || 'hex'),
                             { aptWindow: args.aptWindow });
    case 'hac_z':
      return A.hacZ(args.series, { mu0: args.mu0, maxLag: args.maxLag, conservative: args.conservative });
    case 'paired_null':
      return A.pairedNull(args.signal, args.control, { maxLag: args.maxLag });
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) handle(line);
  }
});

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

function handle(line) {
  let msg;
  try { msg = JSON.parse(line); }
  catch (_) { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  try {
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: {
        // echo the client's version when it offers one, so we age gracefully
        protocolVersion: (params && params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'entropy-audit', version: '1.0.0' }
      }});
    }
    if (method === 'notifications/initialized' || method === 'initialized') return;
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const out = call(params.name, params.arguments || {});
      return send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
        isError: false
      }});
    }
    if (isNotification) return;
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (err) {
    if (isNotification) return;
    // tool failures come back as tool results, not protocol errors, so the
    // model can read the message and correct its own call
    if (method === 'tools/call') {
      return send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `error: ${err.message}` }], isError: true
      }});
    }
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(err && err.message || err) } });
  }
}
